// The pulse's brand in focus comes from the same pass over the cubes as the market query
// (result.focus). It must equal what the separate brand query used to return.
const assert = require('assert'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { loadWorker } = require('../scripts/lib/market-core.cjs');
const root = path.join(__dirname, '..'), worker = loadWorker();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
const loader = { load: async m => worker.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', m.cubePath))).toString('utf8')), setNamespace() {}, clear() {}, stats() { return {}; } };
async function run(filters, extra = {}) {
  const messages = [], port = { postMessage: m => messages.push(m) };
  worker.installMarketWorker(port, { loader });
  await port.onmessage({ data: worker.parse(JSON.stringify({ id: 1, manifest, base: 'https://local/data/', filters, ...extra })) });
  const reply = messages.findLast(m => m.result || m.error); assert(!reply.error, reply.error); return JSON.parse(JSON.stringify(reply.result));
}
(async () => {
  for (const [label, filters, brand] of [['setembro, sem filtros', { date: '2026-09-01..2026-09-30', population: 'light' }, 'MITSUBISHI'],
    ['setembro, SP, foco FIAT', { date: '2026-09-01..2026-09-30', population: 'light', uf: ['SP'] }, 'FIAT']]) {
    const market = await run(filters, { focusBrand: brand }), separate = await run({ ...filters, marca: [brand] });
    assert.equal(market.focus.brand, brand);
    assert.equal(market.focus.total, separate.total, label + ': total');
    assert.equal(market.focus.year, separate.year, label + ': ano anterior');
    assert.equal(market.focus.yearChangeRate, separate.yearChangeRate, label + ': variação anual');
    assert.deepEqual(market.focus.groups.uf, separate.groups.uf.map(r => ({ ...r, previous: null, changeRate: null, shareChange: null })), label + ': UFs');
    assert.deepEqual(market.focus.groups.bd_segmento, separate.groups.bd_segmento.map(r => ({ ...r, previous: null, changeRate: null, shareChange: null })), label + ': segmentos');
    const plain = await run(filters);
    delete market.focus; assert.deepEqual(market, plain, label + ': o resto do resultado não muda');
    console.log('OK', label, brand, separate.total);
  }
  console.log('PASS focus brand in the market query');
})().catch(e => { console.error(e); process.exit(1); });
