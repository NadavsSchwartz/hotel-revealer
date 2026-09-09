import { isIP } from 'node:net';
import { ServiceError } from './provider/errors.js';

function canonicalIp(value) {
  if (typeof value !== 'string' || value.includes('%')) return null;
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(address);
  if (!mapped) return address;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
}

export function clientKey(req, clientIdentity = 'socket') {
  // Caddy mode is only for the deployment whose sole public ingress overwrites
  // this header. Public forwarding headers are never identity inputs.
  const forwarded = clientIdentity === 'caddy' ? canonicalIp(req.headers['x-hotel-revealer-client-ip']) : null;
  return forwarded ?? canonicalIp(req.socket.remoteAddress) ?? 'unknown';
}

export function createClientLimiter({ now = Date.now } = {}) {
  const clients = new Map();
  const burst = 4;
  const refillMs = 10_000;
  const maxClients = 1000;
  let cleanup;

  function prune(current) {
    for (const [key, bucket] of clients) if (bucket.expiresAt <= current) clients.delete(key);
  }

  function scheduleCleanup() {
    if (cleanup || !clients.size) return;
    const earliest = Math.min(...Array.from(clients.values(), bucket => bucket.expiresAt));
    cleanup = setTimeout(() => {
      cleanup = undefined;
      prune(now());
      scheduleCleanup();
    }, Math.max(1, earliest - now()));
    cleanup.unref();
  }

  return key => {
    const current = now();
    prune(current);
    let bucket = clients.get(key);
    if (!bucket) {
      if (clients.size >= maxClients) {
        const retryAt = Math.min(...Array.from(clients.values(), value => value.expiresAt));
        throw new ServiceError('PROVIDER_BUSY', { retryAt: new Date(retryAt).toISOString() });
      }
      bucket = { tokens: burst, updatedAt: current };
    }
    const tokens = Math.min(burst, bucket.tokens + Math.max(0, current - bucket.updatedAt) / refillMs);
    if (tokens < 1) throw new ServiceError('PROVIDER_BUSY', { retryAt: new Date(current + Math.ceil((1 - tokens) * refillMs)).toISOString() });
    bucket.tokens = tokens - 1;
    bucket.updatedAt = current;
    // Forget an identity as soon as its entire allowance has replenished. Never
    // evict an active quota to make room: cycling new identities cannot reset it.
    bucket.expiresAt = current + Math.ceil((burst - bucket.tokens) * refillMs);
    clients.set(key, bucket);
    scheduleCleanup();
  };
}

export function createHotelAdmission({ clientIdentity = 'socket', now } = {}) {
  if (!['socket', 'caddy'].includes(clientIdentity)) throw new Error('HOTEL_CLIENT_IDENTITY must be socket or caddy');
  const admitClient = createClientLimiter({ now });
  let operations = 0;
  const clientOperations = new Map();
  return (req, res, next) => {
    if (req.method !== 'POST' || !/^\/api\/v1\/(?:hotelDeals|deal)\/?$/i.test(req.path)) return next();
    const key = clientKey(req, clientIdentity);
    if (operations >= 8 || (clientOperations.get(key) ?? 0) >= 4) return next(new ServiceError('PROVIDER_BUSY'));
    operations += 1;
    // Subscribers also consume bounded work, even when their upstream request
    // is shared. At most eight active identities can occupy this map.
    clientOperations.set(key, (clientOperations.get(key) ?? 0) + 1);
    let servicePending = false;
    let heldWork = 0;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      operations -= 1;
      const remaining = clientOperations.get(key) - 1;
      if (remaining) clientOperations.set(key, remaining);
      else clientOperations.delete(key);
      res.off('finish', releaseIfSettled);
      res.off('close', releaseIfSettled);
      req.off('aborted', releaseIfSettled);
    };
    const releaseIfSettled = () => { if (!servicePending && !heldWork) release(); };
    req.hotelAdmission = {
      dispatch() { servicePending = true; },
      settle() {
        servicePending = false;
        if (res.writableFinished || res.destroyed) releaseIfSettled();
      },
      holdWork(operation) {
        heldWork += 1;
        Promise.resolve(operation).finally(() => {
          heldWork -= 1;
          if (res.writableFinished || res.destroyed) releaseIfSettled();
        }).catch(() => {});
      },
      admitUpstream() { admitClient(key); },
    };
    // Before dispatch, incomplete/malformed bodies must free capacity. After
    // dispatch, the controller owns the slot until shared service work settles.
    res.once('finish', releaseIfSettled);
    res.once('close', releaseIfSettled);
    req.once('aborted', releaseIfSettled);
    next();
  };
}
