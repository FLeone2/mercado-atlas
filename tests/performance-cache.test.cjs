const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/market/workers/performance-cache.js'), 'utf8');
const { createPersistentCache, estimateBytes } = require('../src/market/workers/performance-cache.js');
let sequence = 0;
const cache = options => createPersistentCache({namespace: 'unit-' + ++sequence, ...options});

// Small asynchronous IndexedDB stand-in, exercising request/transaction ordering
// without dependencies or browser/network access.
function fakeIndexedDB({quota = false, blocked = false} = {}) {
  const databases = new Map();
  return {
    databases,
    open(name) {
      const request = {};
      setImmediate(() => {
        if (blocked) { request.onblocked?.(); return; }
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map([['entries', new Map()], ['metadata', new Map()]]));
        const rows = databases.get(name);
        request.result = {
          objectStoreNames: {contains: () => !fresh}, createObjectStore() {}, close() {},
          transaction() {
            const stores = new Map([...rows].map(([name, values]) => [name, new Map(values)]));
            let pending = 0, aborted = false;
            const tx = {error: null, abort() { aborted = true; tx.error = new Error('Aborted'); tx.onabort?.(); }};
            function schedule(callback) {
              pending++;
              setImmediate(() => {
                if (aborted) return;
                try { callback(); } catch (error) { aborted = true; tx.error = error; tx.onerror?.(); return; }
                pending--;
                if (!pending) setImmediate(() => {
                  if (pending || aborted) return;
                  rows.clear(); for (const [key, value] of stores) rows.set(key, value);
                  tx.oncomplete?.();
                });
              });
            }
            function makeStore(working) { const store = {
              get(key) { const req = {}; schedule(() => { req.result = structuredClone(working.get(key)); req.onsuccess?.(); }); return req; },
              put(value) { schedule(() => { if (quota) { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error; } working.set(value.key, structuredClone(value)); }); },
              delete(key) { schedule(() => working.delete(key)); },
              clear() { schedule(() => working.clear()); },
              openCursor() {
                const req = {}; let keys, index = 0;
                function step() {
                  if (!keys) keys = [...working.keys()];
                  const key = keys[index++];
                  req.result = key === undefined ? null : { value: structuredClone(working.get(key)), delete() { store.delete(key); }, continue() { schedule(step); } };
                  req.onsuccess?.();
                }
                schedule(step); return req;
              }
            };
            return store; }
            tx.objectStore = name => makeStore(stores.get(name));
            return tx;
          }
        };
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}
function api(indexedDB) {
  const context = { indexedDB, structuredClone, setTimeout, clearTimeout, Map, Set, ArrayBuffer, Date, Object, Number, module: {exports: {}} };
  vm.runInNewContext(source, context);
  return context.module.exports;
}

test('memory fallback preserves Maps, Sets, cycles, and snapshot isolation', async () => {
  const c = cache();
  const value = {counts: new Map([['A', 3]]), seen: new Set(['A'])}; value.self = value;
  const write = c.set('monthly', value); value.counts.set('A', 99);
  assert.equal(await write, true);
  const result = await c.get('monthly');
  assert.equal(result.counts.get('A'), 3); assert.equal(result.self, result);
  assert.ok(result.seen instanceof Set);
  result.counts.set('A', 0);
  assert.equal((await c.get('monthly')).counts.get('A'), 3);
  assert.equal(c.stats().persistent, false);
});

test('bounded memory LRU promotes reads and rejects oversized graphs', async () => {
  const c = cache({maxEntries: 2, maxBytes: 2048});
  await c.set('a', {n: 1}); await c.set('b', {n: 2}); await c.get('a'); await c.set('c', {n: 3});
  assert.equal(await c.get('b'), undefined); assert.equal((await c.get('a')).n, 1);
  assert.equal(await c.set('big', new Array(1000000).fill(1)), false);
  assert.ok(c.stats().bytes <= 2048); assert.equal(c.stats().entries, 2);
  assert.ok(estimateBytes('x'.repeat(10000), 100) > 100);
});

test('byte estimator counts shared graphs once and rejects unsupported objects', () => {
  const shared = new Map([['a', 1]]);
  assert.ok(estimateBytes([shared, shared]) < estimateBytes([shared, new Map([['a', 1]])]));
  assert.equal(estimateBytes({fn() {}}), Infinity);
  assert.equal(estimateBytes(new WeakMap()), Infinity);
});

test('clear cannot be undone by an earlier queued write; later writes survive', async () => {
  const c = cache();
  const before = c.set('old', {n: 1}); const clearing = c.clear(); const after = c.set('new', {n: 2});
  await Promise.all([before, clearing, after]);
  assert.equal(await c.get('old'), undefined); assert.equal((await c.get('new')).n, 2);
});

test('IndexedDB persistence survives new cache instances and isolates versions', async () => {
  const idb = fakeIndexedDB(); const {createPersistentCache: create} = api(idb);
  const first = create({namespace: 'source-v1'});
  await first.set('month', {counts: new Map([['A', 4]])});
  const second = create({namespace: 'source-v1'});
  assert.equal((await second.get('month')).counts.get('A'), 4);
  assert.equal(second.stats().diskHits, 1);
  assert.equal(await create({namespace: 'source-v2'}).get('month'), undefined);
  await first.clear();
  assert.equal(await second.get('month'), undefined);
});

test('persistent eviction bounds entries and bytes across instances', async () => {
  const idb = fakeIndexedDB(); const {createPersistentCache: create} = api(idb);
  const options = {namespace: 'bounded', maxEntries: 2, maxBytes: 700};
  const c = create(options);
  await c.set('a', {n: 1}); await c.set('b', {n: 2}); await c.set('c', {n: 3});
  const rows = [...idb.databases.values()][0].get('entries');
  assert.ok(rows.size <= 2); assert.ok([...rows.values()].reduce((n, r) => n + r.bytes, 0) <= 700);
  assert.equal(await create(options).get('a'), undefined);
  assert.equal((await create(options).get('c')).n, 3);
});

test('quota and blocked database failures retain bounded usable memory', async () => {
  for (const failure of [{quota: true}, {blocked: true}]) {
    const {createPersistentCache: create} = api(fakeIndexedDB(failure));
    const c = create({namespace: 'fallback', maxEntries: 1});
    assert.equal(await c.set('a', {n: 1}), true);
    assert.equal((await c.get('a')).n, 1); assert.equal(c.stats().persistent, false);
    await c.set('b', {n: 2}); assert.equal(await c.get('a'), undefined);
  }
});

test('expired disk and memory entries are misses', async () => {
  const idb = fakeIndexedDB(); const {createPersistentCache: create} = api(idb);
  const c = create({namespace: 'age', maxAgeMs: 5});
  await c.set('a', {n: 1});
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(await c.get('a'), undefined);
  assert.equal([...idb.databases.values()][0].get('entries').size, 0);
});

test('unavailable and hanging IndexedDB safely degrade after a bounded wait', async () => {
  for (const indexedDB of [{open() { throw new Error('SecurityError'); }}, {open() { return {}; }}]) {
    const c = api(indexedDB).createPersistentCache({namespace: 'unavailable', timeoutMs: 5});
    assert.equal(await c.set('a', {n: 1}), true);
    assert.equal(c.stats().persistent, false);
    assert.equal((await c.get('a')).n, 1);
  }
});

test('clear synchronously invalidates pending snapshots and retained memory', async () => {
  const c = cache();
  await c.set('existing', 1);
  const stale = c.set('stale', 2);
  const cleared = c.clear();
  assert.equal(c.stats().entries, 0);
  assert.equal(await stale, false);
  await cleared;
  assert.equal(await c.get('stale'), undefined);
});

test('an in-flight disk read cannot repopulate memory after clear', async () => {
  const {createPersistentCache: create} = api(fakeIndexedDB());
  await create({namespace: 'read-race'}).set('a', {n: 1});
  const c = create({namespace: 'read-race'});
  const reading = c.get('a');
  await Promise.resolve(); // Let the queued read start waiting for IndexedDB.
  const clearing = c.clear();
  assert.equal(await reading, undefined);
  await clearing;
  assert.equal(c.stats().entries, 0);
  assert.equal(await create({namespace: 'read-race'}).get('a'), undefined);
});


test('restricted IndexedDB getter never prevents cache or worker startup', async () => {
  const context = vm.createContext({module: {exports: {}}, structuredClone, setTimeout, clearTimeout});
  vm.runInContext("Object.defineProperty(globalThis, 'indexedDB', {get() { const error = new Error('Storage access denied'); error.name = 'SecurityError'; throw error; }});", context);
  vm.runInContext(source, context);
  const c = vm.runInContext("PerformanceCache.createPersistentCache({namespace: 'restricted-storage'})", context);
  assert.equal(c.stats().persistent, false);
  assert.equal(c.stats().lastError, 'SecurityError');
  assert.equal(await c.set('a', 1), true);
  assert.equal(await c.get('a'), 1);
  context.self = {postMessage() {}};
  vm.runInContext(fs.readFileSync(require.resolve('../src/market/workers/evolution-market-worker.js'), 'utf8'), context);
  assert.equal(typeof context.self.onmessage, 'function');
});
