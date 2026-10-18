// The precomputed files answer exactly the request they are filed under: rebuilt from the
// manifest in use, one entry per area for both quick periods, and identical to a live run.
// Needs `npm run precompute` (or `npm run build`) first.
const assert = require('assert'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { loadCore, loadWorker } = require('../scripts/lib/market-core.cjs');
const root = path.join(__dirname, '..'), core = loadCore(), worker = loadWorker();
const indexPath = path.join(root, 'data/precomputed.json');
assert(fs.existsSync(indexPath), 'data/precomputed.json ausente: rode npm run precompute');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
assert.equal(index.version, 1);
assert.equal(index.identity, core.precomputedIdentity(manifest), 'índice gerado de outro manifesto: rode npm run precompute');
const presets = core.latestPeriodPresets(manifest).presets.map(p => p.value);
assert.deepEqual(index.presets, presets, 'períodos rápidos = Ano atual e Último mês do manifesto');
const read = file => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data/precomputed', file))).toString('utf8'));
for (const date of presets) for (const mode of ['dashboard', 'pulse', 'history', 'competition', 'ranking', 'segments', 'technology', 'origin', 'geography', 'primary-map', 'catalog']) {
  const filters = { date, population: 'light' }, key = core.marketRequestKey(core.canonicalFilterKey(filters), core.marketRequestOptions(mode), core.marketFocusBrand(filters));
  const file = index.entries[key]; assert(file, `sem entrada para ${date} ${mode}`);
  assert(fs.existsSync(path.join(root, 'data/precomputed', file)), file);
}
// A filtered view never matches an entry.
assert(!index.entries[core.marketRequestKey(core.canonicalFilterKey({ date: presets[0], population: 'light', uf: ['SP'] }), core.marketRequestOptions('dashboard'), 'MITSUBISHI')]);
// The latest month's main query equals a live run of the same request.
const loader = { load: async m => worker.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', m.cubePath))).toString('utf8')), setNamespace() {}, clear() {}, stats() { return {}; } };
(async () => {
  const filters = { date: presets[1], population: 'light' }, options = core.marketRequestOptions('dashboard'), focusBrand = core.marketFocusBrand(filters);
  const messages = [], port = { postMessage: m => messages.push(m) };
  worker.installMarketWorker(port, { loader });
  await port.onmessage({ data: worker.parse(JSON.stringify({ id: 1, manifest, filters, base: 'https://local/data/', ...options, focusBrand })) });
  const live = JSON.parse(JSON.stringify(messages.findLast(m => m.result).result));
  const stored = read(index.entries[core.marketRequestKey(core.canonicalFilterKey(filters), options, focusBrand)]);
  assert.deepEqual(stored, live, 'arquivo pré-calculado = cálculo ao vivo');
  console.log('PASS precomputed:', Object.keys(index.entries).length, 'pedidos; último mês total', stored.total, '· Mitsubishi', stored.focus.total);
})().catch(e => { console.error(e); process.exit(1); });
