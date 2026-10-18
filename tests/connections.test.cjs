// "Explore as conexões": region × brand and brand × fuel come from Concorrência's market
// query and add up to the total; the chord layout covers the circle once per group.
const assert = require('assert'), fs = require('fs'), path = require('path'), zlib = require('zlib'), vm = require('vm');
const { loadWorker } = require('../scripts/lib/market-core.cjs');
const root = path.join(__dirname, '..'), worker = loadWorker();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
const loader = { load: async m => worker.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', m.cubePath))).toString('utf8')), setNamespace() {}, clear() {}, stats() { return {}; } };
const ctx = vm.createContext({ brandColor: b => 'brand:' + b, tbmName: b => b.charAt(0) + b.slice(1).toLowerCase(), module: { exports: {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'src/market/modules/connections-chord.js'), 'utf8') + ';globalThis.api={ccModel,ccLayout};', ctx);
(async () => {
  const messages = [], port = { postMessage: m => messages.push(m) };
  worker.installMarketWorker(port, { loader });
  await port.onmessage({ data: worker.parse(JSON.stringify({ id: 1, manifest, base: 'https://local/data/', filters: { date: '2026-09-01..2026-09-30', population: 'light' }, includeMitsubishiProfile: true, includeConnections: true })) });
  const result = JSON.parse(JSON.stringify(messages.findLast(m => m.result).result)), c = result.connections;
  const sum = rows => rows.reduce((s, r) => s + r.count, 0);
  assert.equal(sum(c.regionBrand), result.total, 'região × marca soma o total');
  assert.equal(sum(c.brandFuel), result.total, 'marca × propulsão soma o total');
  const fiat = result.groups.marca.find(r => r.name === 'FIAT').count;
  assert.equal(sum(c.brandFuel.filter(r => r.marca === 'FIAT')), fiat, 'FIAT = ranking de marcas');
  assert.equal(sum(c.regionBrand.filter(r => r.regiao === 'Sudeste')), result.groups.regiao.find(r => r.name === 'Sudeste').count, 'Sudeste = grupo região');
  const model = ctx.api.ccModel(c, result.total);
  const brands = model.nodes.filter(n => n.type === 'brand').map(n => n.name);
  assert(brands.includes('MITSUBISHI') && brands.at(-1) === 'OUTRAS' && brands.length <= 8, brands.join(','));
  assert.deepEqual(model.nodes.filter(n => n.type === 'region').map(n => n.name), ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']);
  const layout = ctx.api.ccLayout(model.matrix);
  const span = layout.groups.reduce((s, g) => s + g.endAngle - g.startAngle, 0) + .025 * layout.groups.length;
  assert(Math.abs(span - 2 * Math.PI) < 1e-9, 'grupos + espaços fecham o círculo');
  const fiatIndex = model.nodes.findIndex(n => n.name === 'FIAT');
  assert.equal(layout.groups[fiatIndex].value / 2, fiat, 'arco da marca conta cada emplacamento duas vezes');
  console.log('PASS connections:', result.total, 'emplacamentos,', model.nodes.length, 'categorias,', layout.chords.length, 'faixas');
})().catch(e => { console.error(e); process.exit(1); });
