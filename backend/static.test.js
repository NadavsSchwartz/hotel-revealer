import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { createApp } from './app.js';
import { compressBuild } from '../scripts/compress-build.mjs';

test('production static compression preserves representation negotiation and static-file contracts', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-static-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'assets'));
  await mkdir(path.join(directory, 'media'));
  const script = 'console.log("static asset contract");\n'.repeat(100);
  const style = 'body { color: #123; }\n'.repeat(100);
  const html = '<!doctype html><title>Hotel Revealer</title><link data-home-preload rel="preload" as="image" href="/media/hero.avif" media="(width > 700px)"><link rel="stylesheet" href="/assets/app.css">';
  const htmlWithoutHero = '<!doctype html><title>Hotel Revealer</title><link rel="stylesheet" href="/assets/app.css">';
  await Promise.all([
    writeFile(path.join(directory, 'assets', 'app.js'), script),
    writeFile(path.join(directory, 'assets', 'app.css'), style),
    writeFile(path.join(directory, 'assets', 'app-abc12345.js'), script),
    writeFile(path.join(directory, 'assets', 'app.js.map'), 'source map'),
    writeFile(path.join(directory, 'index.html'), html),
    writeFile(path.join(directory, 'media', 'hero.avif'), 'already compressed media'),
  ]);
  const firstBuild = await compressBuild(directory);
  assert.equal(firstBuild.files, 3);
  assert.ok(firstBuild.bytes.br < firstBuild.bytes.identity);
  await writeFile(path.join(directory, '.encoded', 'stale.js'), 'obsolete variant');
  assert.deepEqual(await compressBuild(directory), firstBuild);
  await assert.rejects(readFile(path.join(directory, '.encoded', 'stale.js')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(directory, '.encoded', 'br', 'assets', 'app.js.map')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(directory, '.encoded', 'br', 'media', 'hero.avif')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(directory, 'assets', 'app.js'), 'utf8'), script);

  function productionApp(frontendDirectory) {
    const previousEnvironment = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      return createApp({ logger: null, service: {}, frontendDirectory });
    } finally {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  }
  const app = productionApp(directory);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  function request(url, headers = {}, method = 'GET', port = server.address().port) {
    return new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, path: url, headers, method }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      });
      request.on('error', reject);
      request.end();
    });
  }

  await t.test('identity, Brotli and gzip responses preserve content and MIME type', async () => {
    for (const encoding of [undefined, 'identity', 'br', 'gzip']) {
      const response = await request('/assets/app.js?v=1', encoding ? { 'Accept-Encoding': encoding } : {});
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /javascript/);
      assert.equal(response.headers.vary, 'Accept-Encoding');
      assert.equal(response.headers['content-encoding'], ['br', 'gzip'].includes(encoding) ? encoding : undefined);
      const decoded = encoding === 'br' ? brotliDecompressSync(response.body) : encoding === 'gzip' ? gunzipSync(response.body) : response.body;
      assert.equal(decoded.toString(), script);
      assert.equal(Number(response.headers['content-length']), response.body.length);
    }
    const css = await request('/assets/app.css', { 'Accept-Encoding': 'gzip' });
    assert.match(css.headers['content-type'], /^text\/css/);
    assert.equal(gunzipSync(css.body).toString(), style);
  });

  await t.test('only hashed assets use immutable caching for all encodings', async () => {
    for (const encoding of ['identity', 'br', 'gzip']) {
      const response = await request('/assets/app-abc12345.js', { 'Accept-Encoding': encoding });
      assert.equal(response.status, 200);
      assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
      const unversioned = await request('/assets/app.js', { 'Accept-Encoding': encoding });
      assert.equal(unversioned.headers['cache-control'], 'public, max-age=0');
    }
  });

  await t.test('quality weights, q=0, wildcard and missing variant fallback are respected', async () => {
    const cases = [
      ['br;q=1, gzip;q=0.5', 'br', 200],
      ['br;q=0.5, gzip;q=1', 'gzip', 200],
      ['br;q=0, gzip;q=0', undefined, 200],
      ['br;q=0, gzip;q=0, identity;q=0', undefined, 406],
      ['*;q=0', undefined, 406],
      ['br;q=0.5, identity;q=1', undefined, 200],
    ];
    for (const [accept, encoding, status] of cases) {
      const response = await request('/assets/app.js', { 'Accept-Encoding': accept });
      assert.equal(response.status, status, accept);
      assert.equal(response.headers['content-encoding'], encoding, accept);
    }
    await rm(path.join(directory, '.encoded', 'br', 'assets', 'app.css'));
    const gzipFallback = await request('/assets/app.css', { 'Accept-Encoding': 'br, gzip' });
    assert.equal(gzipFallback.headers['content-encoding'], 'gzip');
    const identityFallback = await request('/assets/app.css', { 'Accept-Encoding': 'br' });
    assert.equal(identityFallback.headers['content-encoding'], undefined);
    assert.equal(identityFallback.body.toString(), style);
    assert.equal((await request('/assets/app.css', { 'Accept-Encoding': 'br, identity;q=0' })).status, 406);
  });

  await t.test('HEAD and conditional requests use the selected representation', async () => {
    const response = await request('/assets/app.js', { 'Accept-Encoding': 'br' });
    const head = await request('/assets/app.js', { 'Accept-Encoding': 'br' }, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    for (const header of ['content-type', 'content-length', 'content-encoding', 'etag', 'vary']) assert.equal(head.headers[header], response.headers[header]);
    const conditional = await request('/assets/app.js', { 'Accept-Encoding': 'br', 'If-None-Match': response.headers.etag });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.body.length, 0);
  });

  await t.test('missing assets and traversal cannot expose internal variants; HTML stays uncached', async () => {
    for (const url of ['/assets/missing.js', '/.encoded/br/assets/app.js', '/assets/%2e%2e/.encoded/br/assets/app.js', '/assets/%2e%2e/%2e%2e/secret.js']) {
      const response = await request(url, { 'Accept-Encoding': 'br, gzip' });
      assert.equal(response.status, 404, url);
      assert.equal(response.headers['content-encoding'], undefined, url);
      assert.match(response.headers['content-type'], /application\/json/);
    }
    for (const url of ['/', '/results', '/deal', '/index.html']) {
      const response = await request(url, { Accept: 'text/html', 'Accept-Encoding': 'br, gzip' });
      assert.equal(response.status, 200);
      assert.equal(response.body.toString(), url === '/' ? html : htmlWithoutHero);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['content-encoding'], undefined);
      assert.match(response.headers['content-security-policy'], /script-src 'self';/);
      const head = await request(url, { Accept: 'text/html' }, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body.length, 0);
      for (const header of ['content-type', 'content-length', 'etag', 'cache-control', 'content-security-policy']) assert.equal(head.headers[header], response.headers[header]);
    }
    const media = await request('/media/hero.avif', { 'Accept-Encoding': 'br, gzip' });
    assert.equal(media.headers['content-encoding'], undefined);
    assert.equal(media.body.toString(), 'already compressed media');
  });

  await t.test('a missing production document returns the existing safe error response', async (t) => {
    const missing = productionApp(path.join(directory, 'missing')).listen(0, '127.0.0.1');
    await once(missing, 'listening');
    t.after(() => new Promise((resolve) => { missing.close(resolve); missing.closeAllConnections(); }));
    for (const url of ['/', '/results', '/index.html']) {
      const response = await request(url, { Accept: 'text/html' }, 'GET', missing.address().port);
      assert.equal(response.status, 404);
      assert.equal(JSON.parse(response.body).error.code, 'NOT_FOUND');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['content-encoding'], undefined);
    }
  });
});
