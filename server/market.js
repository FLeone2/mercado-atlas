// O cálculo do Atlas no servidor (Cloudflare Pages Function em functions/api/market.js): o mesmo motor do
// navegador (server/engine.js, gerado de src/market), lendo os cubos do próprio site, com cada resposta guardada
// no cache da Cloudflare (por região) e no KV RESPOSTAS (global). Fica desligado enquanto o KV não estiver ligado
// ao projeto: responde 404 na hora e o navegador calcula sozinho, como antes.
//
// GET /api/market?v=<identidade dos dados>&m=<modo>&b=<marca em foco>&f=<filtros em JSON>
//   200 resposta (JSON)  ·  404 desligado  ·  409 dados de outra versão  ·  400 pedido inválido  ·  422 erro do cálculo
import { installMarketWorker, createMarketCubeLoader, createMonthlyAggregateCache, createResultCache, canonicalFilterKey, marketRequestOptions, precomputedIdentity } from './engine.js';

export const MODES = ['atlas', 'leaders-br', 'conexoes'];
const DAYS = 86400;

const json = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const answer = (text, source) => new Response(text, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable', 'x-atlas-source': source } });
const bytesOf = async stream => new Uint8Array(await new Response(stream).arrayBuffer());
const gzip = text => bytesOf(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')));
const gunzip = bytes => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
async function sha256(text) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

// filtros: objeto simples de textos ou listas de textos, com tamanho limitado
function readFilters(raw) {
  if (typeof raw !== 'string' || raw.length > 8000) return null;
  let f; try { f = JSON.parse(raw); } catch { return null; }
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  for (const [k, v] of Object.entries(f)) {
    if (!/^[a-z_]{1,40}$/.test(k)) return null;
    if (typeof v === 'string') { if (v.length > 200) return null; continue; }
    if (!Array.isArray(v) || v.length > 600 || v.some(x => typeof x !== 'string' || x.length > 200)) return null;
  }
  return f;
}

// por instância (cada publicação do site tem as suas): manifesto, identidade, índice das fatias e agregados mensais recentes
let shared = null;
async function dataOf(env, origin) {
  if (shared?.origin === origin) return shared;
  const get = async p => { const r = await env.ASSETS.fetch(new Request(origin + '/data/' + p)); if (!r.ok) throw Error(p + ': HTTP ' + r.status); return r.json(); };
  const manifest = await get('manifest.json');
  let splitIndex = null; try { const i = await get('cubes-split/index.json'); if (i?.version === 2 && i.dims) splitIndex = i; } catch { /* sem fatias: cubos completos */ }
  shared = { origin, manifest, identity: precomputedIdentity(manifest), splitIndex, aggregates: createMonthlyAggregateCache({ maxEntries: 0 }) };
  return shared;
}

export async function compute(env, data, filters, mode, focusBrand) {
  // sem guardar cubos na memória (limite de 128 MB por instância): cada mês é lido, somado e descartado
  const loader = createMarketCubeLoader({ fetchImpl: (url, init = {}) => env.ASSETS.fetch(new Request(String(url), { signal: init.signal })), origin: data.origin, maxCells: 0, maxCompressedBytes: 0 });
  const messages = [], port = { postMessage: m => messages.push(m) };
  installMarketWorker(port, { loader, resultCache: createResultCache({ maxEntries: 0 }), aggregateCache: data.aggregates, aggregateStore: null, resultStore: null });
  await port.onmessage({ data: { id: 1, manifest: data.manifest, filters, base: data.origin + '/data/', ...marketRequestOptions(mode), focusBrand, splitIndex: data.splitIndex } });
  const reply = messages.findLast(m => m.result || m.error);
  if (!reply) throw Error('O cálculo não respondeu.');
  if (reply.error) { const e = Error(reply.error); e.status = 422; throw e; }
  return reply.result;
}

export async function handle(request, env, waitUntil = () => {}) {
  if (!env.RESPOSTAS) return json({ error: 'Cálculo no servidor desligado.' }, 404);
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
  const url = new URL(request.url), q = url.searchParams;
  const mode = q.get('m'), version = q.get('v'), focus = q.get('b') || 'MITSUBISHI', filters = readFilters(q.get('f'));
  if (!MODES.includes(mode) || !filters || !version || !/^[A-Z0-9 .&-]{1,40}$/i.test(focus)) return json({ error: 'Pedido inválido.' }, 400);
  const data = await dataOf(env, url.origin);
  if (version !== data.identity) return json({ error: 'Os dados publicados mudaram.', identity: data.identity }, 409);

  // filtros equivalentes (ordem, "all") dão a mesma chave, como no navegador
  const key = 'r1:' + await sha256([data.identity, mode, focus, canonicalFilterKey(filters)].join('|'));
  const cache = globalThis.caches?.default, cacheKey = new Request(url.origin + '/api/market/_/' + key.slice(3));
  const hit = cache ? await cache.match(cacheKey) : null;
  if (hit) return hit;
  const stored = await env.RESPOSTAS.get(key, 'arrayBuffer');
  if (stored) {
    const res = answer(await gunzip(stored), 'kv');
    if (cache) waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }
  let result;
  try { result = await compute(env, data, filters, mode, focus); }
  catch (e) { return json({ error: e.message }, e.status ?? 500); }
  const text = JSON.stringify(result), res = answer(text, 'calculo');
  waitUntil(Promise.all([
    cache ? cache.put(cacheKey, res.clone()) : null,
    gzip(text).then(gz => env.RESPOSTAS.put(key, gz, { expirationTtl: 60 * DAYS })),
  ]).catch(() => {}));
  return res;
}
