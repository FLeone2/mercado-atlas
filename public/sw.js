/* Atlas · service worker: a volta ao site abre do aparelho, sem esperar a rede.
   - página (/): mostra a guardada e atualiza por trás;
   - código (/assets/app/) e arquivos de dados com nome único (cubos, cubos por estado e por porte, pré-cálculo):
     guardados de vez (o nome muda quando o conteúdo muda), com limite de espaço;
   - demais dados (manifesto, índices, histórico, geografia, cenários): mostra o guardado e atualiza
     por trás; se o manifesto mudou, avisa a página ("dados novos");
   - /api/ e o resto: direto da rede.
   Para desligar: publique um sw.js que só faça self.registration.unregister(). */
const SHELL = 'atlas-shell-v1', DATA = 'atlas-data-v1', FILES = 'atlas-files-v1', KEEP = [SHELL, DATA, FILES];
const MAX_FILES = 160; // ~1 ano de cubos completos com folga; os mais antigos saem primeiro

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
  await self.clients.claim();
})()));

const immutable = path => /^\/assets\/app\//.test(path) || /^\/data\/(cubes|origin-cubes|precomputed)\//.test(path) || /^\/data\/cubes-split\/[^/]+\/[^/]+\/[^/]+\.json\.gz$/.test(path);

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') { if (url.pathname === '/') event.respondWith(fresh(event, SHELL, '/')); return; }
  if (immutable(url.pathname)) { event.respondWith(kept(req)); return; }
  if (url.pathname.startsWith('/data/') || url.pathname === '/favicon.svg') event.respondWith(fresh(event, DATA, url.pathname, url.pathname === '/data/manifest.json'));
});

// guardado de vez: do cache se houver; senão da rede, e guarda
async function kept(req) {
  const cache = await caches.open(FILES), key = new URL(req.url).pathname, hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) { await cache.put(key, res.clone()); trim(cache); }
  return res;
}
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
}

// o guardado na hora; a rede atualiza por trás (e, para o manifesto, avisa se mudou)
async function fresh(event, name, key, notify = false) {
  const cache = await caches.open(name), hit = await cache.match(key), before = notify && hit ? hit.clone() : null;
  const update = fetch(event.request).then(async res => {
    if (res.status !== 200 || res.redirected) return res;
    if (before) { const [a, b] = await Promise.all([before.text(), res.clone().text()]); if (a !== b) tell({ type: 'atlas-data-updated' }); }
    await cache.put(key, res.clone());
    return res;
  });
  if (hit) { event.waitUntil(update.catch(() => {})); return hit; }
  return update;
}
async function tell(message) { for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage(message); }
