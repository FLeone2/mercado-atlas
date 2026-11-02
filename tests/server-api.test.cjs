// O cálculo no servidor (server/market.js, a função /api/market): desligado sem o KV, recusa pedidos
// inválidos e dados de outra versão, responde exatamente o que o navegador calcularia e guarda a
// resposta no KV, de onde a segunda chamada sai sem recalcular.
require('../scripts/build-server.cjs'); // gera server/engine.js a partir de src/market
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const { loadCore, loadWorker } = require('../scripts/lib/market-core.cjs');
const root = path.join(__dirname, '..'), data = path.join(root, 'data');
const core = loadCore(), worker = loadWorker();
const manifest = JSON.parse(fs.readFileSync(path.join(data, 'manifest.json'), 'utf8'));
const last = manifest.months.filter(m => m.cubePath).sort((a, b) => a.month.localeCompare(b.month)).at(-1);

const ASSETS = { fetch: async req => { const p = new URL(typeof req === 'string' ? req : req.url).pathname.replace(/^\/data\//, ''), f = path.join(data, p); return fs.existsSync(f) && fs.statSync(f).isFile() ? new Response(fs.readFileSync(f)) : new Response('não há', { status: 404 }); } };
const kv = new Map(), RESPOSTAS = { get: async key => (kv.has(key) ? kv.get(key).buffer.slice(0) : null), put: async (key, value, opts) => { assert.ok(opts.expirationTtl > 0); kv.set(key, new Uint8Array(value)); } };

async function call(env, params) {
  const pending = [], url = 'https://atlas.test/api/market?' + new URLSearchParams(params);
  const res = await (await import('../server/market.js')).handle(new Request(url), env, p => pending.push(p));
  await Promise.all(pending);
  return { status: res.status, source: res.headers.get('x-atlas-source'), text: await res.text() };
}
async function local(filters, mode) {
  const options = core.marketRequestOptions(mode), messages = [], port = { postMessage: m => messages.push(m) };
  worker.installMarketWorker(port, { loader: { load: async m => worker.parse(zlib.gunzipSync(fs.readFileSync(path.join(data, m.cubePath))).toString('utf8')), setNamespace() {}, clear() {}, stats() { return {}; } } });
  await port.onmessage({ data: worker.parse(JSON.stringify({ id: 1, manifest, filters, base: 'https://atlas.test/data/', ...options, focusBrand: 'MITSUBISHI' })) });
  return JSON.stringify(messages.findLast(m => m.result).result);
}

(async () => {
  const v = core.precomputedIdentity(manifest), filters = { date: last.month + '-01..' + last.dateMax, population: 'light', uf: ['SP'] };
  const ok = { v, m: 'atlas', b: 'MITSUBISHI', f: JSON.stringify(filters) };
  assert.equal((await call({ ASSETS }, ok)).status, 404, 'sem o KV RESPOSTAS a função fica desligada');
  const env = { ASSETS, RESPOSTAS };
  assert.equal((await call(env, { ...ok, m: 'outro' })).status, 400, 'modo desconhecido');
  assert.equal((await call(env, { ...ok, f: '{"uf":[1]}' })).status, 400, 'filtro que não é texto');
  assert.equal((await call(env, { ...ok, v: 'v2|antigo|0' })).status, 409, 'dados de outra versão');
  console.log('PASS desligado sem KV; pedidos inválidos (400) e outra versão dos dados (409)');

  const t = Date.now(), first = await call(env, ok);
  assert.equal(first.status, 200, first.text.slice(0, 200)); assert.equal(first.source, 'calculo');
  assert.equal(first.text, await local(filters, 'atlas'), 'mesma resposta que o navegador calcula');
  assert.equal(kv.size, 1, 'a resposta foi guardada no KV');
  const second = await call(env, ok);
  assert.equal(second.source, 'kv'); assert.equal(second.text, first.text);
  console.log('PASS SP, último mês: igual ao cálculo do navegador (' + (Date.now() - t) + ' ms) e a 2ª chamada sai do KV');

  const pick = { ...ok, m: 'conexoes', f: JSON.stringify({ ...filters, uf: 'all', bd_segmento: ['PICK-UP MID'] }) };
  const r = await call(env, pick);
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.text, await local({ ...filters, uf: 'all', bd_segmento: ['PICK-UP MID'] }, 'conexoes'));
  console.log('PASS picape média, conexões: igual ao cálculo do navegador');
})().catch(e => { console.error(e); process.exitCode = 1; });
