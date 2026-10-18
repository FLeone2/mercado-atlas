// Precomputes the market results for the two quick periods (Ano atual, Último mês) with no
// filters, for every area's main query, the pulse and the territory map. Same worker, same
// request as the browser; the site uses a file only when the manifest and request match.
// Output: data/precomputed.json (index) + data/precomputed/*.json.gz. Runs before vite build.
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { loadCore, loadWorker } = require('./lib/market-core.cjs');
const root = path.join(__dirname, '..'), out = path.join(root, 'data/precomputed');
const core = loadCore(), worker = loadWorker();
const manifestText = fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText);
// Main query of each area plus the pulse (also the query of areas without one) and the map.
const MODES = ['dashboard', 'pulse', 'history', 'competition', 'ranking', 'segments', 'technology', 'origin', 'geography', 'primary-map'];

(async () => {
  const started = Date.now();
  const presets = core.latestPeriodPresets(manifest);
  if (!presets) throw Error('Sem períodos rápidos no manifesto.');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const cubes = new Map();
  const loader = {
    load: async meta => { if (!cubes.has(meta.cubePath)) cubes.set(meta.cubePath, zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', meta.cubePath))).toString('utf8')); return worker.parse(cubes.get(meta.cubePath)); },
    setNamespace() {}, clear() {}, stats() { return {}; },
  };
  const entries = {}, done = new Map();
  let bytes = 0;
  for (const preset of presets.presets) {
    const filters = { date: preset.value, population: 'light' };
    const filterKey = core.canonicalFilterKey(filters), focusBrand = core.marketFocusBrand(filters);
    for (const mode of MODES) {
      const options = core.marketRequestOptions(mode), key = core.marketRequestKey(filterKey, options, focusBrand);
      if (entries[key]) continue;
      const t = Date.now(), messages = [], port = { postMessage: m => messages.push(m) };
      worker.installMarketWorker(port, { loader });
      await port.onmessage({ data: worker.parse(JSON.stringify({ id: 1, manifest, filters, base: 'https://local/data/', ...options, focusBrand })) });
      const reply = messages.findLast(m => m.result || m.error);
      if (!reply || reply.error) throw Error(`${preset.id}/${mode}: ${reply?.error ?? 'sem resposta'}`);
      const json = JSON.stringify(reply.result), digest = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
      const file = `${preset.id}-${mode}-${digest}.json.gz`;
      if (!done.has(digest)) { const gz = zlib.gzipSync(json, { level: 9 }); fs.writeFileSync(path.join(out, file), gz); bytes += gz.length; done.set(digest, file); }
      entries[key] = done.get(digest);
      console.log(`${preset.id.padEnd(6)} ${mode.padEnd(12)} ${String(Date.now() - t).padStart(6)} ms  ${(json.length / 1024).toFixed(0).padStart(5)} KB`);
    }
  }
  fs.writeFileSync(path.join(root, 'data/precomputed.json'), JSON.stringify({ version: 1, identity: core.precomputedIdentity(manifest), generatedAt: new Date().toISOString(), presets: presets.presets.map(p => p.value), entries }));
  console.log(`precompute: ${Object.keys(entries).length} pedidos, ${done.size} arquivos, ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
})().catch(e => { console.error('precompute falhou:', e.message); process.exit(1); });
