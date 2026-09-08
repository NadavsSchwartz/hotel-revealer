import { ServiceError } from './errors.js';

export const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

export class ProviderScheduler {
  constructor({ clock = realClock, gapMs = 1_000, maxWaiting = 4, beforeDispatch = async () => {}, afterDispatch = async () => {} } = {}) {
    this.clock = clock;
    this.gapMs = gapMs;
    this.maxWaiting = maxWaiting;
    this.beforeDispatch = beforeDispatch;
    this.afterDispatch = afterDispatch;
    this.queue = [];
    this.active = null;
    this.lastStart = -Infinity;
    this.gapTimer = null;
    this.closed = false;
  }

  run(task, { deadline }) {
    if (this.closed) return Promise.reject(new ServiceError('SERVICE_DRAINING'));
    if (deadline <= this.clock.now()) return Promise.reject(new ServiceError('DEADLINE_EXCEEDED'));
    if (this.queue.length >= this.maxWaiting) return Promise.reject(new ServiceError('PROVIDER_BUSY'));
    return new Promise((resolve, reject) => {
      const entry = { task, deadline, resolve, reject, settled: false, controller: new AbortController() };
      entry.timer = this.clock.setTimeout(() => {
        entry.controller.abort();
        this.settle(entry, new ServiceError('DEADLINE_EXCEEDED'));
        this.queue = this.queue.filter((item) => item !== entry);
        this.pump();
      }, deadline - this.clock.now());
      this.queue.push(entry);
      this.pump();
    });
  }

  settle(entry, error, value) {
    if (entry.settled) return;
    entry.settled = true;
    this.clock.clearTimeout(entry.timer);
    if (error) entry.reject(error);
    else entry.resolve(value);
  }

  pump() {
    if (this.active || this.closed) return;
    if (this.gapTimer !== null) {
      this.clock.clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
    while (this.queue[0]?.deadline <= this.clock.now()) {
      this.settle(this.queue.shift(), new ServiceError('DEADLINE_EXCEEDED'));
    }
    if (!this.queue.length) return;
    const wait = this.lastStart + this.gapMs - this.clock.now();
    if (wait > 0) {
      this.gapTimer = this.clock.setTimeout(() => {
        this.gapTimer = null;
        this.pump();
      }, wait);
      return;
    }
    const entry = this.queue.shift();
    this.active = entry;
    void this.dispatch(entry);
  }

  async dispatch(entry) {
    try {
      await this.beforeDispatch();
      let value;
      try {
        if (entry.settled || entry.deadline <= this.clock.now()) throw new ServiceError('DEADLINE_EXCEEDED');
        this.lastStart = this.clock.now();
        value = await entry.task(entry.controller.signal);
      } finally {
        // Complete durable control-state changes before admitting another call,
        // including when preparation used the remaining admission budget.
        await this.afterDispatch();
      }
      if (entry.deadline <= this.clock.now()) throw new ServiceError('DEADLINE_EXCEEDED');
      this.settle(entry, null, value);
    } catch (error) {
      this.settle(entry, error);
    } finally {
      // Keep the active slot until the adapter and control-state work settle.
      // An adapter that ignores AbortSignal must never create overlapping calls.
      this.active = null;
      this.pump();
    }
  }

  close() {
    this.closed = true;
    if (this.gapTimer !== null) this.clock.clearTimeout(this.gapTimer);
    for (const entry of this.queue.splice(0)) this.settle(entry, new ServiceError('SERVICE_DRAINING'));
    if (this.active) {
      this.active.controller.abort();
      this.settle(this.active, new ServiceError('SERVICE_DRAINING'));
    }
  }
}
