// Bounded local capacity laboratory. The worker cannot contact a hotel provider.
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const MiB = 1024 * 1024;
const appBudgetBytes = 512 * MiB;
const maxDataCallers = 19; // One additional caller samples /health.
const script = fileURLToPath(import.meta.url);
const round = value => Math.round(value * 100) / 100;
const quantile = (values, fraction) => values.length
  ? round([...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))]) : null;

function summarizeRequests(requests) {
  return {
    count: requests.length,
    statuses: requests.reduce((counts, item) => { counts[item.status] = (counts[item.status] ?? 0) + 1; return counts; }, {}),
    errors: requests.reduce((counts, item) => { if (item.error) counts[item.error] = (counts[item.error] ?? 0) + 1; return counts; }, {}),
    totalBytes: requests.reduce((sum, item) => sum + item.bytes, 0),
    maximumResponseBytes: Math.max(0, ...requests.map(item => item.bytes)),
    detailStatuses: requests.reduce((counts, item) => { if (item.detailStatus) counts[item.detailStatus] = (counts[item.detailStatus] ?? 0) + 1; return counts; }, {}),
    quoteStatuses: requests.reduce((counts, item) => { if (item.quoteStatus) counts[item.quoteStatus] = (counts[item.quoteStatus] ?? 0) + 1; return counts; }, {}),
    latencyMs: { p50: quantile(requests.map(item => item.ms), 0.5), p95: quantile(requests.map(item => item.ms), 0.95),
      max: quantile(requests.map(item => item.ms), 1) },
  };
}

function assertControlledBurst(requests) {
  assert.ok(requests.statuses[200] > 0);
  assert.equal(requests.statuses[200] + (requests.statuses[503] ?? 0), maxDataCallers);
  assert.deepEqual(requests.errors, requests.statuses[503] ? { PROVIDER_BUSY: requests.statuses[503] } : {});
}

async function runWorker() {
  const [{ createApp }, { createProviderService }, { createMemoryStateStore }, domain, { MAX_JSON_BYTES }, { createSelectionStore }] = await Promise.all([
    import('../backend/app.ts'), import('../backend/provider/service.ts'), import('../backend/provider/state.ts'),
    import('../backend/domain/index.ts'), import('../backend/provider/size.ts'), import('../backend/provider/selection-store.ts'),
  ]);
  // If an accidental live adapter is introduced, fail before making its request.
  globalThis.fetch = () => { throw new Error('Capacity worker prohibits all external fetches.'); };
  const offerCount = 20;
  const hotelCount = 200;
  function inventory(mode = 'standard') {
    const rawOffers = mode === 'duplicates' ? 100 : offerCount;
    const rawHotels = mode === 'duplicates' ? 1001 : mode === 'dense' ? 251 : hotelCount;
    const amenities = Array.from({ length: 16 }, (_, index) => `AMENITY_${String(index).padStart(2, '0')}`);
    const location = { cityId: 'lab-city', neighborhoodID: 'lab-area', neighborhoodName: 'Central Waterfront District' };
    return [
      ...Array.from({ length: rawOffers }, (_, index) => ({
        pclnId: `offer-${mode === 'duplicates' ? 0 : index}`, starRating: 4, location,
        overallGuestRating: 8, totalReviewCount: 1200,
        hotelFeatures: { highlightedAmenities: amenities }, amenitiesIcons: ['POOL', 'WIFI'],
        ratesSummary: { programName: 'Express_Deal', minPrice: 120, displayPricePerStay: 360, minCurrencyCode: 'USD',
          minStrikePrice: mode !== 'standard' ? 150 : index === 19 ? 999 : index === 18 ? 167 : 150 + index },
        clues: { guestRating: { kind: 'minimum', value: 8 }, reviewCount: { kind: 'minimum', value: 1200 },
          amenities: { codes: amenities, complete: false } },
        handoffUrl: 'https://www.priceline.com/relax-ui/at/express/capacity-lab',
      })),
      ...Array.from({ length: rawHotels }, (_, index) => ({
        hotelId: `hotel-${mode === 'duplicates' ? 0 : index}`,
        name: `Harbor ${String(mode === 'duplicates' ? 0 : index).padStart(3, '0')} Suites and Conference Hotel`,
        starRating: 4, overallGuestRating: 8.5, totalReviewCount: 1200, location,
        hotelFeatures: { highlightedAmenities: amenities }, amenitiesIcons: ['POOL', 'WIFI'],
        thumbnailUrl: `https://images.priceline.com/capacity-lab/hotel-${index}/exterior-entrance-with-waterfront-view.jpg`,
        ratesSummary: { programName: 'RETAIL',
          minPrice: mode === 'duplicates' ? 999 : mode === 'dense' ? 150 : index === 18 ? 167 : 150 + index,
          minCurrencyCode: 'USD' },
      })),
    ];
  }
  let rows = inventory();
  const matched = domain.matchListings(rows.slice(0, offerCount), rows.slice(offerCount), { coverageStatus: 'complete' });
  const candidateCount = matched.offers.reduce((count, offer) => count + offer.candidates.length, 0);
  const resolutionCounts = matched.offers.reduce((counts, offer) => {
    const key = offer.resolution.status === 'matched' ? 'matched' : offer.resolution.reason;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(resolutionCounts, { matched: 17, ambiguous: 2, no_match: 1 });
  assert.ok(matched.offers.every(offer => offer.candidates.length <= 1));
  const estimatedBytes = Buffer.byteLength(JSON.stringify(matched)) + 2048;
  assert.ok(estimatedBytes < MAX_JSON_BYTES * 0.95, 'Fixture must stay below response ceiling');
  assert.ok(offerCount * hotelCount <= 100000);
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let phase = 'startup';
  let phasePeaks = {};
  let allPeaks = {};
  let stubDelayMs = 25;
  let memoryGuard = null;
  const calls = { search: 0, detail: 0, namedDetail: 0, offerOnlyDetail: 0, active: 0, maxActive: 0 };
  let events = [];
  const sampleMemory = () => {
    const memory = process.memoryUsage();
    for (const [key, value] of Object.entries(memory)) {
      phasePeaks[key] = Math.max(phasePeaks[key] ?? 0, value);
      allPeaks[key] = Math.max(allPeaks[key] ?? 0, value);
    }
    return memory;
  };
  const adapterCall = async (kind, signal, makeResult) => {
    calls[kind] += 1;
    calls.active += 1;
    calls.maxActive = Math.max(calls.maxActive, calls.active);
    sampleMemory();
    try { await delay(stubDelayMs, undefined, { signal }); return makeResult(); }
    finally { calls.active -= 1; sampleMemory(); }
  };
  const service = createProviderService({
    stateStore: createMemoryStateStore(),
    selectionStore: createSelectionStore(),
    logger: { info(event) { events.push(event); if (events.length > 300) events.shift(); sampleMemory(); } },
    adapter: {
      listingsPage({ signal }) { return adapterCall('search', signal, () => ({ listings: structuredClone(rows), nextCursor: null })); },
      hotelDetails({ context, hotelId, signal }) {
        calls[hotelId ? 'namedDetail' : 'offerOnlyDetail'] += 1;
        return adapterCall('detail', signal, () => ({
          ...(hotelId ? {
            description: 'Capacity laboratory hotel description. '.repeat(211).slice(0, 8000),
            amenities: Array.from({ length: 100 }, (_, index) => `Amenity ${index}: indoor and outdoor facilities available during the stay`),
            images: Array.from({ length: 20 }, (_, index) => `https://images.priceline.com/capacity-lab/property-gallery-image-${index}.jpg`),
            address: '100 Waterfront Boulevard, Capacity Test City',
            retailQuote: { minPrice: 150, minCurrencyCode: 'USD' },
          } : {}),
          originalQuote: { nightlyCents: 12000, stayCents: 36000 * context.rooms, totalCents: 40000 * context.rooms,
            currency: 'USD', taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: context.rooms,
            nightlyBasis: 'per-room', stayBasis: 'all-rooms' },
        }));
      },
    },
  });
  const app = createApp({ service, logger: { info() {} }, clientIdentity: 'caddy' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const timer = setInterval(() => {
    const memory = sampleMemory();
    if (memory.rss > 480 * MiB && !memoryGuard) {
      memoryGuard = { phase, rss: memory.rss, threshold: 480 * MiB };
      service.close();
      process.send({ type: 'guard', memoryGuard });
    }
  }, 20);
  const snapshot = () => ({
    memory: sampleMemory(), peakSampledMemory: { ...phasePeaks }, allPeakSampledMemory: { ...allPeaks },
    processLifetimeMaxRssBytes: process.resourceUsage().maxRSS * 1024,
    eventLoopDelayMs: { mean: round(histogram.mean / 1e6), p95: round(histogram.percentile(95) / 1e6), max: round(histogram.max / 1e6) },
    adapterCalls: { ...calls }, providerEvents: events, memoryGuard,
  });
  process.on('message', async message => {
    if (message.type === 'phase') {
      phase = message.phase;
      phasePeaks = {};
      events = [];
      histogram.reset();
      if (message.stubDelayMs != null) stubDelayMs = message.stubDelayMs;
      rows = inventory(message.inventoryMode);
      sampleMemory();
      process.send({ replyTo: message.id, result: { phase } });
    } else if (message.type === 'snapshot') {
      process.send({ replyTo: message.id, result: snapshot() });
    } else if (message.type === 'stop') {
      service.close();
      clearInterval(timer);
      histogram.disable();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      process.send({ replyTo: message.id, result: snapshot() }, () => process.exit(0));
    }
  });
  process.send({ type: 'ready', port: server.address().port, pid: process.pid,
    fixture: { synthetic: true, offerCount, hotelCount, candidateCount, resolutionCounts,
      pairComparisons: offerCount * hotelCount, estimatedResponseBytes: estimatedBytes,
      guardInputs: { denseRetainedMatches: 20 * 251, repeatedRawComparisons: 100 * 1001 },
      responseLimitBytes: MAX_JSON_BYTES, rawPageBytes: Buffer.byteLength(JSON.stringify({ listings: rows, nextCursor: null })) },
    snapshot: snapshot(),
  });
}

async function runMeasurement() {
  const burstsOnly = process.argv.includes('--bursts-only');
  const measuredAt = new Date().toISOString();
  const output = path.resolve(`output/verification/capacity-${measuredAt.replaceAll(/[:.]/g, '-')}`);
  await mkdir(output, { recursive: true });
  const sourcePaths = ['backend/app.ts', 'backend/admission.ts', 'backend/controllers/hotelController.ts', 'backend/destinations/index.ts',
    'backend/provider/size.ts', 'backend/provider/service.ts', 'backend/provider/cache.ts', 'backend/provider/scheduler.ts',
    'backend/provider/selection-store.ts',
    'backend/domain/matching.ts', 'backend/domain/normalization.ts', 'scripts/measure-capacity.mjs'];
  const report = {
    measuredAt, measurementMode: burstsOnly ? 'shared-and-cached-bursts-only' : 'full-cache-and-queue-profile',
    environment: { platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version,
      cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, machineMemoryBytes: os.totalmem() },
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirtySourcePaths: execFileSync('git', ['status', '--short', '--', ...sourcePaths], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
    scope: 'Mac-local Node server process with the actual GeoNames dataset, real HTTP, production service/cache/scheduler, in-memory selection recovery records, and a synthetic stub provider. Recovery disk I/O is excluded. The HTTP load driver is a separate process. No provider requests.',
    configuredAppBudgetBytes: appBudgetBytes,
    controls: { maxDataCallers, maxHealthCallers: 1, workerOldSpaceMiB: 384, rssStopThresholdMiB: 480,
      maxAdmittedHotelRequests: 8, clients: 'Distinct synthetic client per HTTP request; per-client fairness is tested separately.',
      searchCacheEntries: 25, searchTtlMs: 300000, detailCacheEntries: 100, detailTtlMs: 60000,
      providerGapMs: 1000, maxProviderActive: 1, maxProviderWaiting: 4, searchDeadlineMs: 20000, detailDeadlineMs: 10000 },
    destinationDatasetBytes: (await stat(new URL('../data/destinations.json', import.meta.url))).size,
    phases: [], checks: {}, limitations: [
      'macOS RSS and allocator behavior do not verify the Linux VPS or its 512 MiB cgroup.',
      'The 384 MiB V8 old-space flag and 480 MiB sampling stop are laboratory guards, not an OS-enforced RSS limit.',
      'Stub latency and in-memory provider state omit internet latency and durable filesystem sync cost.',
      'Synthetic raw listings exercise bounded matching and zero-or-one public candidates; they are not a forecast of normal traffic.',
      'No authentication, reverse proxy, TLS, browser rendering, or actual provider response parsing is measured.',
      ...(burstsOnly ? ['This focused rerun does not populate 25 search entries; cache residency differs from the full profile.'] : []),
    ],
  };
  const child = fork(script, ['--worker'], {
    execArgv: ['--max-old-space-size=384'],
    env: { ...process.env, NODE_ENV: 'production', HOTEL_PROVIDER: 'disabled' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let lastSnapshot;
  let healthRunning = true;
  let currentPhase = 'startup';
  let stopReason;
  const health = [];
  let id = 0;
  const pending = new Map();
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  child.on('message', message => {
    if (message.type === 'ready') resolveReady(message);
    else if (message.type === 'guard') stopReason = `RSS sampling guard reached during ${message.memoryGuard.phase}`;
    else if (message.replyTo) {
      pending.get(message.replyTo)?.resolve(message.result);
      pending.delete(message.replyTo);
    }
  });
  child.on('exit', (code, signal) => {
    if (code !== 0) {
      stopReason ||= `Worker exited with code ${code}, signal ${signal}`;
      rejectReady(new Error(stopReason));
      for (const entry of pending.values()) entry.reject(new Error(stopReason));
      pending.clear();
    }
  });
  const watchdog = setTimeout(() => { stopReason = '150-second laboratory watchdog'; child.kill('SIGTERM'); }, 150000);
  const command = message => new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    child.send({ ...message, id: key });
  });
  let healthTask;
  try {
    const started = await ready;
    report.fixture = started.fixture;
    report.workerPid = started.pid;
    report.baseline = started.snapshot;
    lastSnapshot = started.snapshot;
    const base = `http://127.0.0.1:${started.port}`;
    let clientNumber = 0;
    const post = async (route, input) => {
      const began = performance.now();
      try {
        const response = await fetch(`${base}${route}`, { method: 'POST', headers: {
          'Content-Type': 'application/json', 'X-Hotel-Revealer-Client-IP': `203.0.113.${1 + clientNumber++ % 254}`,
        },
          body: JSON.stringify(input), signal: AbortSignal.timeout(route.endsWith('/deal') ? 12000 : 22000) });
        const text = await response.text();
        const body = JSON.parse(text);
        return { status: response.status, error: body.error?.code, bytes: Buffer.byteLength(text), ms: round(performance.now() - began),
          coverage: body.coverage?.status, detailStatus: body.detailStatus, quoteStatus: body.quoteStatus,
          candidateId: body.candidate?.hotelId ?? null, detailsNull: body.details === null,
          totalCents: body.offer?.quote?.totalCents ?? null };
      } catch (error) { return { status: 'transport-error', error: error.name, bytes: 0, ms: round(performance.now() - began) }; }
    };
    healthTask = (async () => {
      while (healthRunning) {
        const phase = currentPhase;
        const began = performance.now();
        try {
          const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
          await response.arrayBuffer();
          health.push({ phase, ms: round(performance.now() - began), status: response.status });
        } catch (error) { health.push({ phase, ms: round(performance.now() - began), status: error.name }); }
        await delay(100);
      }
    })();
    const phase = async (name, work, stubDelayMs = 25, inventoryMode = 'standard') => {
      if (stopReason) throw new Error(stopReason);
      currentPhase = name;
      await command({ type: 'phase', phase: name, stubDelayMs, inventoryMode });
      const start = performance.now();
      const before = lastSnapshot.adapterCalls;
      console.log(`Capacity phase: ${name}`);
      const requests = await work();
      lastSnapshot = await command({ type: 'snapshot' });
      report.phases.push({ name, elapsedMs: round(performance.now() - start), requests: summarizeRequests(requests),
        worker: lastSnapshot, callDelta: { search: lastSnapshot.adapterCalls.search - before.search,
          detail: lastSnapshot.adapterCalls.detail - before.detail,
          namedDetail: lastSnapshot.adapterCalls.namedDetail - before.namedDetail,
          offerOnlyDetail: lastSnapshot.adapterCalls.offerOnlyDetail - before.offerOnlyDetail } });
      if (stopReason) throw new Error(stopReason);
      return report.phases.at(-1);
    };
    const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const context = index => ({ destinationId: 'geonames:5506956', checkIn: day(10 + index), checkOut: day(13 + index),
      rooms: 1, adults: 2, childrenAges: [], currency: 'USD' });
    const search = index => post('/api/v1/hotelDeals', context(index));
    await phase('idle-health', async () => { await delay(1000); return []; });
    if (!burstsOnly) {
      const filled = await phase('fill-search-cache-with-25-searches', async () => {
        const results = [];
        for (let index = 0; index < 25; index += 1) {
          const result = await search(index);
          results.push(result);
          if (result.status !== 200 || stopReason) break;
        }
        return results;
      });
      assert.equal(filled.requests.statuses[200], 25, 'All 25 cache fills must succeed');
      // Byte limits can evict early entries before the count limit. The latest
      // entry is the fresh-hit oracle; the oldest is evicted under either limit.
      const hit = await phase('search-cache-hit', async () => [await search(24)]);
      const inserted = await phase('search-cache-entry-26', async () => [await search(25)]);
      const evicted = await phase('search-cache-evicted-entry', async () => [await search(0)]);
      report.checks.searchCache = { filledCalls: filled.callDelta.search, freshHitCalls: hit.callDelta.search,
        insertionCalls: inserted.callDelta.search, evictedEntryCalls: evicted.callDelta.search };
      assert.deepEqual(report.checks.searchCache, { filledCalls: 25, freshHitCalls: 0, insertionCalls: 1, evictedEntryCalls: 1 });
      const saturated = await phase('19-distinct-cold-searches', () => Promise.all(Array.from({ length: maxDataCallers }, (_, index) => search(40 + index))), 250);
      report.checks.distinctQueue = { adapterCalls: saturated.callDelta.search, responses: saturated.requests.statuses,
        errors: saturated.requests.errors, maxProviderActive: saturated.worker.adapterCalls.maxActive };
      assert.equal(saturated.worker.adapterCalls.maxActive, 1);
      assert.ok(saturated.callDelta.search >= 1 && saturated.callDelta.search <= 5);
      assert.equal(saturated.requests.statuses[200], saturated.callDelta.search);
      assert.equal(saturated.requests.errors.PROVIDER_BUSY, maxDataCallers - saturated.callDelta.search);
    }
    const shared = await phase('19-identical-cold-search-waiters', () => Promise.all(Array.from({ length: maxDataCallers }, () => search(80))), 250);
    report.checks.identicalWaiters = { adapterCalls: shared.callDelta.search, responses: shared.requests.statuses };
    assert.equal(shared.callDelta.search, 1);
    assertControlledBurst(shared.requests);
    const cachedBurst = await phase('19-identical-cached-searches', () => Promise.all(Array.from({ length: maxDataCallers }, () => search(80))));
    report.checks.cachedBurst = { adapterCalls: cachedBurst.callDelta.search, responses: cachedBurst.requests.statuses };
    assert.equal(cachedBurst.callDelta.search, 0);
    assertControlledBurst(cachedBurst.requests);
    const detail = async (index, named, allowBusy = false) => {
      const hotelId = named ? `hotel-${index}` : null;
      const result = await post('/api/v1/deal', { ...context(80), offerId: `offer-${index}`, ...(named ? { hotelId } : {}) });
      if (allowBusy && result.status === 503) {
        assert.equal(result.error, 'PROVIDER_BUSY');
        return result;
      }
      assert.equal(result.status, 200);
      assert.equal(result.quoteStatus, 'available');
      assert.equal(result.totalCents, 40000);
      assert.equal(result.candidateId, hotelId);
      assert.equal(result.detailStatus, named ? 'available' : 'not_requested');
      assert.equal(result.detailsNull, !named);
      return result;
    };
    const detailCount = burstsOnly ? 1 : 12;
    const details = await phase(`fill-${detailCount}-live-ttl-named-detail-entries`, async () => {
      const results = [];
      for (let index = 0; index < detailCount; index += 1) results.push(await detail(index, true));
      return results;
    });
    const detailHit = await phase('named-detail-cache-hit', async () => [await detail(0, true)]);
    report.checks.detailCache = { fills: details.callDelta.detail, searchCallsWhileFilling: details.callDelta.search,
      hitDetailCalls: detailHit.callDelta.detail, maxMeasuredEntryBytes: details.requests.maximumResponseBytes,
      throughputBound: 'One active provider call with 1-second start spacing allows approximately 60 fresh detail fills per 60-second TTL (at most one additional completion at a window boundary). Filling 100 fresh detail entries is not a realistic normal-service state.' };
    assert.equal(details.callDelta.namedDetail, detailCount);
    assert.equal(details.callDelta.search, 0);
    assert.equal(detailHit.callDelta.detail, 0);
    const offerOnly = await phase('19-identical-cold-offer-only-detail-waiters',
      () => Promise.all(Array.from({ length: maxDataCallers }, () => detail(19, false, true))), 250);
    const offerOnlyHit = await phase('19-cached-offer-only-details',
      () => Promise.all(Array.from({ length: maxDataCallers }, () => detail(19, false, true))));
    report.checks.offerOnlyDetailCache = { freshDetailCalls: offerOnly.callDelta.detail,
      freshNamedDetailCalls: offerOnly.callDelta.namedDetail, freshOfferOnlyDetailCalls: offerOnly.callDelta.offerOnlyDetail,
      searchCalls: offerOnly.callDelta.search + offerOnlyHit.callDelta.search, hitDetailCalls: offerOnlyHit.callDelta.detail,
      freshResponses: offerOnly.requests.statuses, cachedResponses: offerOnlyHit.requests.statuses,
      freshResponseBytes: offerOnly.requests.maximumResponseBytes, cachedResponseBytes: offerOnlyHit.requests.maximumResponseBytes };
    assert.equal(offerOnly.callDelta.detail, 1);
    assert.equal(offerOnly.callDelta.offerOnlyDetail, 1);
    assert.equal(offerOnly.callDelta.namedDetail, 0);
    assert.equal(offerOnly.callDelta.search + offerOnlyHit.callDelta.search, 0);
    assert.equal(offerOnlyHit.callDelta.detail, 0);
    assertControlledBurst(offerOnly.requests);
    assertControlledBurst(offerOnlyHit.requests);
    for (const [index, mode] of ['dense', 'duplicates'].entries()) {
      const guarded = await phase(`${mode}-raw-matching-limit`, async () => [await search(110 + index)], 25, mode);
      report.checks[`${mode}Guard`] = { adapterCalls: guarded.callDelta.search,
        responses: guarded.requests.statuses, errors: guarded.requests.errors };
      assert.deepEqual(report.checks[`${mode}Guard`], {
        adapterCalls: 1, responses: { 503: 1 }, errors: { RESULT_TOO_LARGE: 1 },
      });
    }
    await phase('idle-after-load', async () => { await delay(2000); return []; });
  } catch (error) {
    report.failure = { message: error.message, stopReason, workerStderr: stderr || undefined };
  } finally {
    healthRunning = false;
    if (healthTask) await healthTask;
    if (child.connected) {
      try { report.final = await command({ type: 'stop' }); } catch (error) { report.stopError = error.message; }
    }
    clearTimeout(watchdog);
    if (!child.killed && child.exitCode === null) child.kill('SIGTERM');
  }
  for (const phase of report.phases) {
    const samples = health.filter(item => item.phase === phase.name);
    phase.health = { samples: samples.length, statuses: samples.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1; return counts;
    }, {}), latencyMs: { p50: quantile(samples.map(item => item.ms), 0.5), p95: quantile(samples.map(item => item.ms), 0.95),
      max: quantile(samples.map(item => item.ms), 1) } };
  }
  const peaks = report.final?.allPeakSampledMemory ?? lastSnapshot?.allPeakSampledMemory ?? {};
  const peakRssBytes = report.final?.processLifetimeMaxRssBytes ?? peaks.rss;
  report.summary = { peakRssMiB: peakRssBytes == null ? null : round(peakRssBytes / MiB),
    peakSampledHeapUsedMiB: peaks.heapUsed == null ? null : round(peaks.heapUsed / MiB),
    peakSampledExternalMiB: peaks.external == null ? null : round(peaks.external / MiB),
    maximumHealthLatencyMs: quantile(health.map(item => item.ms), 1),
    maximumEventLoopDelayMs: Math.max(0, ...report.phases.map(phase => phase.worker.eventLoopDelayMs.max)),
    completed: !report.failure,
  };
  report.summary.rssHeadroomTo512MiB = report.summary.peakRssMiB == null ? null : round(512 - report.summary.peakRssMiB);
  await writeFile(path.join(output, 'capacity.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output, ...report.summary, failure: report.failure }, null, 2));
  if (report.failure) process.exitCode = 1;
}

if (process.argv.includes('--worker')) await runWorker();
else await runMeasurement();
