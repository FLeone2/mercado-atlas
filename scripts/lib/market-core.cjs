// Loads, for node scripts and tests, the pieces of src/market that decide a query:
// the period presets and filter keys from core.js, the request definition, and the
// market worker itself (performance cache + evolution market worker) in its own realm.
const fs = require('fs'), path = require('path'), vm = require('vm'), { webcrypto } = require('crypto');
const MARKET = path.join(__dirname, '../../src/market');
const core = fs.readFileSync(path.join(MARKET, 'core.js'), 'utf8');

// Source of one top-level declaration in core.js (a function or a one-line const).
function pick(name) {
  const m = new RegExp('(function ' + name.replace('$', '\\$') + '\\(|const ' + name.replace('$', '\\$') + '\\s*=)').exec(core);
  if (!m) throw Error('core.js: ' + name + ' not found');
  const rest = core.slice(m.index);
  if (!rest.startsWith('function')) return rest.slice(0, rest.indexOf(';') + 1);
  // Skip the parameter list (it may hold `= {}` defaults), then match the body braces.
  let i = rest.indexOf('('), depth = 0;
  for (; i < rest.length; i++) { if (rest[i] === '(') depth++; else if (rest[i] === ')' && --depth === 0) break; }
  for (i = rest.indexOf('{', i); i < rest.length; i++) {
    if (rest[i] === '{') depth++;
    else if (rest[i] === '}' && --depth === 0) return rest.slice(0, i + 1);
  }
  throw Error('core.js: unbalanced ' + name);
}
const CORE_NAMES = ['SCALAR_MARKET_FILTERS', 'UNKNOWN_CATEGORY', 'categoryLabel', 'categoricalSelection', 'hasFilterSelection', 'canonicalFilters', 'canonicalFilterKey',
  'iso', 'validMonth', 'shortMonth', 'dateLabel', 'monthEnd', 'listMonths', 'sourceCoverageEnd', 'sourceCoverageStart', 'latestPeriodPresets'];

function loadCore() {
  const ctx = vm.createContext({});
  const request = fs.readFileSync(path.join(MARKET, 'modules/market-request.js'), 'utf8').replace(/^if\(typeof module.*$/m, '');
  const precomputed = fs.readFileSync(path.join(MARKET, 'modules/precomputed.js'), 'utf8').replace(/^if\(typeof module.*$/m, '');
  vm.runInContext(CORE_NAMES.map(pick).join('\n') + '\n' + request + '\n' + precomputed +
    '\nglobalThis.api={canonicalFilterKey,latestPeriodPresets,marketRequestOptions,marketFocusBrand,marketRequestKey,precomputedIdentity};', ctx);
  return ctx.api;
}

// The market worker in a fresh realm. Everything it receives is parsed inside that realm,
// as structured clone does in the browser (its caches reject foreign-realm objects).
function loadWorker() {
  const W = path.join(MARKET, 'workers');
  const src = fs.readFileSync(path.join(W, 'performance-cache.js'), 'utf8') + '\n' + fs.readFileSync(path.join(W, 'evolution-market-worker.js'), 'utf8');
  const ctx = vm.createContext({ console, DOMException, TextEncoder, URL, AbortController, crypto: webcrypto, setTimeout, clearTimeout });
  vm.runInContext(src.replace(/\}\)\(\);\s*$/, 'globalThis.api={installMarketWorker};})();'), ctx);
  const parse = text => vm.runInContext('JSON', ctx).parse(text);
  return { installMarketWorker: ctx.api.installMarketWorker, parse };
}
module.exports = { pick, loadCore, loadWorker };
