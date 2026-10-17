/* Bounded cache for COMPACT analytical aggregates only, never source history.
 * Include the data/source version in namespace; keys must be stable strings.
 * IndexedDB is optional: failures retain the bounded, clone-isolated memory LRU.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PerformanceCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const SCHEMA_VERSION = 2;
  const states = new Map();
  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

  // Conservative retained-graph estimate, with an early cutoff. No JSON copy of
  // the graph, and no unbounded work list for large arrays, Maps, or Sets.
  function estimateBytes(value, limit = Infinity) {
    const seen = new Set();
    let bytes = 0;
    function visit(item, depth) {
      if (bytes > limit) return;
      if (depth > 128) { bytes = Infinity; return; }
      if (item == null) { bytes += 8; return; }
      switch (typeof item) {
        case 'string': bytes += 16 + item.length * 2; return;
        case 'number': case 'bigint': bytes += 16; return;
        case 'boolean': case 'undefined': bytes += 8; return;
        case 'function': case 'symbol': bytes = Infinity; return;
      }
      if (seen.has(item)) { bytes += 8; return; }
      seen.add(item); bytes += 64;
      if (ArrayBuffer.isView(item)) { visit(item.buffer, depth + 1); return; }
      if (item instanceof ArrayBuffer) { bytes += item.byteLength; return; }
      if (item instanceof Date) { bytes += 8; return; }
      if (item instanceof Map) {
        for (const [key, entry] of item) { bytes += 32; visit(key, depth + 1); visit(entry, depth + 1); if (bytes > limit) break; }
      } else if (item instanceof Set) {
        for (const entry of item) { bytes += 24; visit(entry, depth + 1); if (bytes > limit) break; }
      } else if (Array.isArray(item)) {
        bytes += item.length * 8;
        for (let i = 0; i < item.length && bytes <= limit; i++) visit(item[i], depth + 1);
      } else {
        const proto = Object.getPrototypeOf(item);
        if (proto !== Object.prototype && proto !== null) { bytes = Infinity; return; }
        for (const key in item) if (Object.prototype.hasOwnProperty.call(item, key)) {
          bytes += 24 + key.length * 2; visit(item[key], depth + 1); if (bytes > limit) break;
        }
      }
    }
    try { visit(value, 0); } catch (_) { return Infinity; }
    return bytes;
  }

  function createPersistentCache(options = {}) {
    const namespace = options.namespace;
    if (typeof namespace !== 'string' || !namespace || namespace.length > 1024) throw new TypeError('A nonempty, versioned cache namespace is required (maximum 1024 characters).');
    const maxBytes = positive(options.maxBytes, 16 * 1024 * 1024);
    const maxEntries = positive(options.maxEntries, 24);
    const maxAgeMs = positive(options.maxAgeMs, 7 * 86400000);
    const timeoutMs = positive(options.timeoutMs, 1500);
    const stateKey = 'performance-cache:v' + SCHEMA_VERSION + ':' + namespace;
    if (!states.has(stateKey)) states.set(stateKey, { queue: Promise.resolve(), revision: 0, epoch: 0 });
    const state = states.get(stateKey);
    let revision = state.revision, memoryBytes = 0, database = null, opening = null;
    // Accessing indexedDB itself can throw SecurityError in restricted storage
    // contexts. Optional persistence must never prevent worker installation.
    let indexedDB = null, persistent = false, lastError = null;
    try { indexedDB = root.indexedDB; persistent = !!indexedDB; }
    catch (error) { lastError = error && (error.name || error.message) || 'IndexedDB unavailable'; }
    const memory = new Map();
    const counters = { hits: 0, misses: 0, diskHits: 0, writes: 0, rejected: 0, evictions: 0 };
    const clone = value => {
      if (typeof root.structuredClone !== 'function') throw new Error('structuredClone unavailable');
      return root.structuredClone(value);
    };
    function synchronize() {
      if (revision !== state.revision) { memory.clear(); memoryBytes = 0; revision = state.revision; }
    }
    function remove(key) { const entry = memory.get(key); if (entry) { memoryBytes -= entry.bytes; memory.delete(key); } }
    function remember(record) {
      remove(record.key); memory.set(record.key, record); memoryBytes += record.bytes;
      while (memory.size > maxEntries || memoryBytes > maxBytes) { remove(memory.keys().next().value); counters.evictions++; }
    }
    function disable(error) {
      persistent = false; lastError = error && (error.name || error.message) || 'IndexedDB unavailable';
      if (database) database.close(); database = null;
    }
    function open() {
      if (!persistent) return Promise.resolve(null);
      if (database) return Promise.resolve(database);
      if (opening) return opening;
      opening = new Promise(resolve => {
        let settled = false, request;
        const finish = (db, error) => {
          if (settled) { if (db) db.close(); return; }
          settled = true; clearTimeout(timer);
          if (error) disable(error); else database = db;
          resolve(db);
        };
        const timer = setTimeout(() => finish(null, new Error('IndexedDB open timeout')), timeoutMs);
        try {
          request = indexedDB.open(stateKey, SCHEMA_VERSION);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('entries')) request.result.createObjectStore('entries', { keyPath: 'key' });
            if (!request.result.objectStoreNames.contains('metadata')) request.result.createObjectStore('metadata', { keyPath: 'key' });
          };
          request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => { db.close(); if (database === db) database = null; opening = null; };
            finish(db);
          };
          request.onerror = () => finish(null, request.error);
          request.onblocked = () => finish(null, new Error('IndexedDB blocked'));
        } catch (error) { finish(null, error); }
      });
      return opening;
    }
    async function disk(operation) {
      const db = await open(); if (!db) return undefined;
      return new Promise(resolve => {
        let transaction, result, done = false;
        const finish = error => {
          if (done) return; done = true; clearTimeout(timer);
          if (error) disable(error);
          resolve(error ? undefined : result);
        };
        const timer = setTimeout(() => {
          try { if (transaction) transaction.abort(); } catch (_) { /* already completed */ }
          finish(new Error('IndexedDB transaction timeout'));
        }, timeoutMs);
        try {
          transaction = db.transaction(['entries', 'metadata'], 'readwrite');
          transaction.oncomplete = () => finish();
          transaction.onabort = transaction.onerror = () => finish(transaction.error || new Error('IndexedDB transaction failed'));
          operation(transaction.objectStore('entries'), value => { result = value; }, transaction.objectStore('metadata'));
        } catch (error) { try { if (transaction) transaction.abort(); } catch (_) {} finish(error); }
      });
    }
    function enqueue(operation) {
      const promise = state.queue.then(() => { synchronize(); return operation(); });
      state.queue = promise.catch(() => {});
      return promise;
    }
    function valid(record, now) {
      return record && record.schema === SCHEMA_VERSION && Number.isFinite(record.bytes) && record.bytes > 0 && record.bytes <= maxBytes && Number.isFinite(record.createdAt) && now - record.createdAt < maxAgeMs && now >= record.createdAt;
    }
    return {
      get(key) {
        return enqueue(async () => {
          if (typeof key !== 'string') { counters.misses++; return undefined; }
          const epoch = state.epoch;
          const now = Date.now(); let record = memory.get(key);
          if (record && !valid(record, now)) { remove(key); record = null; }
          if (!record) {
            record = await disk((store, result, metadata) => {
              const request = store.get(key);
              request.onsuccess = () => {
                const found = request.result;
                if (!valid(found, now)) { if (found) { store.delete(key); metadata.delete(key); } result(undefined); return; }
                found.accessedAt = now;
                metadata.put({key, bytes: found.bytes, createdAt: found.createdAt, accessedAt: now, schema: SCHEMA_VERSION}); result(found);
              };
            });
            if (record) counters.diskHits++;
          }
          if (!record || epoch !== state.epoch) { counters.misses++; return undefined; }
          remember(record); counters.hits++;
          try { return clone(record.value); } catch (_) { remove(key); counters.misses++; return undefined; }
        });
      },
      set(key, value) {
        // Snapshot at invocation, before awaiting another queued write/clear.
        const epoch = state.epoch;
        let snapshot, bytes = typeof key === 'string' ? estimateBytes(value, maxBytes) + key.length * 2 + 128 : Infinity;
        try { if (bytes <= maxBytes) snapshot = clone(value); } catch (_) { bytes = Infinity; }
        return enqueue(async () => {
          if (bytes > maxBytes || epoch !== state.epoch) { counters.rejected++; return false; }
          state.revision++; revision = state.revision;
          const now = Date.now();
          const record = { key, value: snapshot, bytes, createdAt: now, accessedAt: now, schema: SCHEMA_VERSION };
          remember(record); counters.writes++;
          await disk((store, result, metadata) => {
            store.put(record);
            metadata.put({key, bytes, createdAt: now, accessedAt: now, schema: SCHEMA_VERSION});
            const rows = []; let total = 0;
            const request = metadata.openCursor();
            request.onsuccess = () => {
              const cursor = request.result;
              if (cursor) {
                const row = cursor.value;
                if (!valid(row, now)) { cursor.delete(); store.delete(row.key); }
                else { rows.push({ key: row.key, bytes: row.bytes, accessedAt: row.accessedAt || row.createdAt }); total += row.bytes; }
                cursor.continue(); return;
              }
              rows.sort((a, b) => a.accessedAt - b.accessedAt || (a.key === key ? 1 : b.key === key ? -1 : 0));
              let count = rows.length;
              for (const row of rows) {
                if (count <= maxEntries && total <= maxBytes) break;
                store.delete(row.key); metadata.delete(row.key); total -= row.bytes; count--;
              }
              result(true);
            };
          });
          return true;
        });
      },
      clear() {
        // Invalidate synchronously, including reads/writes already awaiting disk.
        state.epoch++; state.revision++; revision = state.revision;
        memory.clear(); memoryBytes = 0;
        return enqueue(async () => {
          state.revision++; revision = state.revision; memory.clear(); memoryBytes = 0;
          await disk((store, result, metadata) => { store.clear(); metadata.clear(); });
        });
      },
      stats() {
        synchronize();
        return { ...counters, namespace, schemaVersion: SCHEMA_VERSION, entries: memory.size, bytes: memoryBytes, maxBytes, maxEntries, maxAgeMs, persistent, lastError };
      }
    };
  }
  return { SCHEMA_VERSION, createPersistentCache, estimateBytes };
});
