/* Atlas · service worker: o que não muda sai do aparelho; o que muda vem da rede, com o aparelho de reserva.
   - código (/assets/app/) e arquivos de dados com nome único (cubos, cubos por estado e por porte, pré-cálculo):
     guardados de vez (o nome muda quando o conteúdo muda), com limite de espaço;
   - página (/) e demais dados (manifesto, índices, histórico, geografia, cenários): da rede (o cache HTTP
     responde 304 quando nada mudou); se a rede falhar ou passar de 3 s, a cópia guardada;
   - /api/ e o resto: direto da rede.
   Não assume a página aberta (sem clients.claim): ela termina de carregar sem service worker, e a próxima já usa.
   Para desligar: publique um sw.js que só faça self.registration.unregister(). */
const SHELL = 'atlas-shell-v2', DATA = 'atlas-data-v2', FILES = 'atlas-files-v1', KEEP = [SHELL, DATA, FILES];
const MAX_FILES = 160; // ~1 ano de cubos completos com folga; os mais antigos saem primeiro
const PATIENCE = 3000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
  await self.registration.navigationPreload?.enable();
})()));

const immutable = path => /^\/assets\/app\//.test(path) || /^\/data\/(cubes|origin-cubes|precomputed)\//.test(path) || /^\/data\/cubes-split\/[^/]+\/[^/]+\/[^/]+\.json\.gz$/.test(path);

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') { if (url.pathname === '/') event.respondWith(network(event, SHELL, '/', event.preloadResponse)); return; }
  if (immutable(url.pathname)) { event.respondWith(kept(req)); return; }
  if (url.pathname.startsWith('/data/') || url.pathname === '/favicon.svg') event.respondWith(network(event, DATA, url.pathname));
});

// pedidos iguais ao mesmo tempo (a pré-busca do index.html e o fetch da página) usam uma só ida à rede
const inflight = new Map();
function once(key, make) {
  let p = inflight.get(key);
  if (!p) { p = make(); inflight.set(key, p); p.catch(() => {}).finally(() => setTimeout(() => inflight.delete(key), 2000)); }
  return p.then(res => res.clone());
}

// guardado de vez: do aparelho se houver; senão da rede, e guarda
async function kept(req) {
  const cache = await caches.open(FILES), key = new URL(req.url).pathname, hit = await cache.match(key);
  if (hit) return hit;
  return once('k' + key, async () => {
    const res = await fetch(req);
    if (res.status === 200) { await cache.put(key, res.clone()); trim(cache); }
    return res;
  });
}
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
}

// da rede (guardando a cópia); sem rede ou depois de PATIENCE ms, a cópia guardada
async function network(event, name, key, preload) {
  const cache = await caches.open(name);
  const live = once('n' + key, () => Promise.resolve(preload).then(r => r ?? fetch(event.request)).then(async res => {
    if (res.status === 200 && !res.redirected) await cache.put(key, res.clone());
    return res;
  }));
  live.catch(() => {}); // se a cópia já respondeu, uma falha da rede depois não importa
  const late = new Promise(resolve => setTimeout(resolve, PATIENCE, null));
  try {
    const first = await Promise.race([live, late]);
    if (first) return first;
    return (await cache.match(key)) ?? (await live);
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw new TypeError('sem rede e sem cópia guardada');
  }
}
