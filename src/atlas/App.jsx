import { flushSync } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ctx } from './ctx.js';
import { engine } from 'virtual:market';
import { useDataApp, normalizePeriod } from '../kit/index.js';
import { useTip } from './base/charts.jsx';
import FilterBar from './FilterBar.jsx';
import { focusOf, marketFiltersOf, list, rangeText, UF_NAMES, brandName } from './lib.js';
import Resumo from './pages/Resumo.jsx';
import Mercado from './pages/Mercado.jsx';
import Concorrencia from './pages/Concorrencia.jsx';
import Foco from './pages/Foco.jsx';
import Territorios from './pages/Territorios.jsx';
import Economia from './pages/Economia.jsx';
import Laboratorio from './pages/Laboratorio.jsx';
import './base/base.css';
import './atlas.css';
import './refinement.css';

/* Atlas: 6 páginas + laboratório, rolagem contínua (sem subabas), uma barra de
   filtros fixa e a marca em foco (Mitsubishi por padrão) comparada com o resto em todas as páginas. */
/* A marca do Atlas: o mesmo desenho do favicon (public/favicon.svg). */
const Mark = () => <svg className="px-logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="var(--nx-ink)" /><path d="M32 12.5 49.5 51h-7.9L32 29.4 22.4 51h-7.9z" fill="#fff" /><rect x="22.8" y="39.6" width="18.4" height="5.2" rx="1.6" fill="var(--nx-accent)" /></svg>;
export const PAGES = [
  { slug: 'resumo', label: 'Resumo', C: Resumo },
  { slug: 'mercado', label: 'Mercado', C: Mercado },
  { slug: 'concorrencia', label: 'Concorrência', C: Concorrencia },
  { slug: 'foco', label: 'Mitsubishi', C: Foco },
  { slug: 'territorios', label: 'Territórios', C: Territorios },
  { slug: 'economia', label: 'Economia', C: Economia },
  { slug: 'laboratorio', label: 'Laboratório', C: Laboratorio },
];
// links antigos (?a=panorama…) abrem a página equivalente
const OLD = { panorama: 'resumo', evolucao: 'mercado', segmentos: 'mercado', explorar: 'laboratorio', animacoes: 'laboratorio' };
const readPage = () => { const s = new URLSearchParams(location.search).get('a'); const v = OLD[s] ?? s; return PAGES.some(p => p.slug === v) ? v : 'resumo'; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;


export default function App() {
  const shell = useDataApp(), base = engine.getBase(shell.snapshot);
  const filters = useMemo(() => {
    const f = { ...Object.fromEntries((shell.snapshot.filters ?? []).map(d => [d.id, d.defaultValue ?? 'all'])), ...shell.filters };
    for (const k of Object.keys(f)) if (!['date', 'population'].includes(k) && typeof f[k] === 'string' && f[k] !== 'all') f[k] = [f[k]];
    if (f.date && f.date !== 'all' && /^\d{4}-\d{2}(-\d{2})?(\.\.\d{4}-\d{2}(-\d{2})?)?$/.test(String(f.date))) f.date = normalizePeriod(f.date);
    return f;
  }, [shell.snapshot, shell.filters]);
  const focus = focusOf(filters), mFilters = useMemo(() => marketFiltersOf(filters), [filters]);

  // Uma consulta principal: o mercado do recorte (sem a marca em foco), com a marca em foco e o mesmo período do ano anterior.
  const q = engine.useMarketData(mFilters, true, 'atlas', false, focus);
  const last = useRef(null); if (q.result) last.current = q.result; if (q.error) last.current = null;
  const market = q.error ? null : q.result ?? last.current, stale = q.pending && !q.result && Boolean(market);
  const hist = engine.useHistory(mFilters, base, true);
  const points = engine.useTbmPoints(base).data;
  const names = useMemo(() => { const m = new Map(); for (const [, n, u] of points?.rows ?? []) m.set(engine.geoKey(n, u) + '|' + u, n); return m; }, [points]);
  const cityName = useCallback((raw, uf) => {
    let n = raw, u = uf; if (!u) { const i = raw.lastIndexOf(' · '); n = raw.slice(0, i); u = raw.slice(i + 3); }
    return names.get(engine.geoKey(n, u) + '|' + u) ?? n.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  }, [names]);

  const [page, setPage] = useState(readPage);
  const [menuOpen, setMenuOpen] = useState(false), menu = useRef(null), menuButton = useRef(null), firstPage = useRef(true);
  useEffect(() => {
    const dialog = menu.current;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog.open) dialog.close();
  }, [menuOpen]);
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    const frame = requestAnimationFrame(() => document.querySelector('#atlas-content h1')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [page]);
  const go = useCallback((slug, anchor) => {
    const done = () => { if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' })); };
    if (slug === page) { if (anchor) done(); else scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return; }
    const p = new URLSearchParams(location.search); p.set('a', slug); history.pushState(null, '', location.pathname + '?' + p.toString());
    const from = PAGES.findIndex(x => x.slug === page), to = PAGES.findIndex(x => x.slug === slug);
    const swap = () => { setPage(slug); scrollTo(0, 0); };
    if (typeof document.startViewTransition === 'function' && !reduced()) {
      document.documentElement.dataset.nxDir = to >= from ? 'fwd' : 'back';
      document.startViewTransition(() => flushSync(swap)).finished.finally(() => { delete document.documentElement.dataset.nxDir; done(); });
    } else { swap(); done(); }
  }, [page]);
  useEffect(() => { const pop = () => { setPage(readPage()); scrollTo(0, 0); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
  const current = PAGES.find(p => p.slug === page) ?? PAGES[0];
  useEffect(() => { document.documentElement.dataset.nx = ''; document.title = 'Atlas · ' + (current.slug === 'foco' ? brandName(focus) : current.label); }, [current, focus]);

  const tip = useTip();
  const dateDefault = shell.snapshot.filters.find(f => f.id === 'date')?.defaultValue;
  const setFilter = useCallback((id, value) => shell.setFilter(id, value), [shell]);
  const reset = useCallback(() => { for (const [k, v] of Object.entries(filters)) if (!['date', 'population'].includes(k) && list(v).length) shell.setFilter(k, 'all'); if (dateDefault) shell.setFilter('date', dateDefault); if (filters.population === 'all_content') shell.setFilter('population', 'light'); }, [filters, shell, dateDefault]);

  // o recorte em uma linha: período · território · universo (a marca em foco aparece no placar)
  const scope = useMemo(() => {
    const ufs = list(filters.uf).map(u => UF_NAMES[u] ?? u), regs = list(filters.regiao), cities = list(filters.municipio).map(c => cityName(c, list(filters.uf)[0] ?? ''));
    const where = cities.length ? cities.join(', ') : ufs.length ? ufs.join(', ') : regs.length ? regs.join(', ') : 'Brasil';
    return [market ? rangeText(market.range) : '…', where, filters.population === 'all_content' ? 'todo o conteúdo dos arquivos' : 'automóveis e comerciais leves'].join(' · ');
  }, [filters, market, cityName]);

  const ctx = useMemo(() => ({
    filters, mFilters, setFilter, reset, focus, focusName: brandName(focus), market, pending: q.pending, error: q.error, manifest: q.manifest, hist, points, cityName, base, go, tip, scope, shell,
  }), [filters, mFilters, setFilter, reset, focus, market, q.pending, q.error, q.manifest, hist, points, cityName, base, go, tip, scope, shell]);

  const Page = current.C;
  const label = p => (p.slug === 'foco' ? brandName(focus) : p.label);
  const pageHref = slug => { const params = new URLSearchParams(location.search); params.set('a', slug); return '?' + params.toString(); };
  const navigate = (e, slug, anchor) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); setMenuOpen(false); go(slug, anchor);
  };
  const closeMenu = () => { setMenuOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); };
  return (
    <Ctx.Provider value={ctx}>
      <div className="nx px" data-page={page}>
        <a className="px-skip" href="#atlas-content">Pular para o conteúdo</a>
        <header className="nx-nav px-nav" data-tone="light">
          <a className="nx-brand px-brand" href={pageHref('resumo')} onClick={e => navigate(e, 'resumo')} aria-label="Atlas · Mercado Automotivo, início"><Mark />Atlas</a>
          <nav className="nx-links" aria-label="Páginas">
            {PAGES.map(p => <a key={p.slug} href={pageHref(p.slug)} aria-current={p.slug === page ? 'page' : undefined} className={p.slug === 'foco' ? 'px-focus-link' : undefined} onClick={e => navigate(e, p.slug)}>{label(p)}</a>)}
          </nav>
          <button className="px-menu-toggle" type="button" ref={menuButton} aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="atlas-menu" onClick={() => setMenuOpen(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>Menu</button>
        </header>
        <dialog className="px-dialog px-menu-dialog" ref={menu} id="atlas-menu" aria-labelledby="atlas-menu-title" onCancel={e => { e.preventDefault(); closeMenu(); }} onClick={e => { if (e.target === e.currentTarget) closeMenu(); }}>
          <div className="px-dialog-head"><h2 id="atlas-menu-title">Navegar pelo Atlas</h2><button type="button" onClick={closeMenu}>Fechar</button></div>
          <nav aria-label="Todas as páginas">{PAGES.map(p => <a key={p.slug} href={pageHref(p.slug)} aria-current={p.slug === page ? 'page' : undefined} onClick={e => navigate(e, p.slug)}>{label(p)}</a>)}</nav>
        </dialog>
        <FilterBar />
        {q.error && <div className="nx-status err" role="alert">Não foi possível calcular este recorte ({q.error}). Ajuste os filtros ou recarregue a página.</div>}
        <main id="atlas-content" tabIndex={-1} className={'px-main' + (stale ? ' nx-stale' : '')} aria-busy={q.pending || undefined}>
          <Page />
          <footer className="px-foot nx-wrap">
            <span>Fonte: emplacamentos mensais (cubos do Atlas) · série mensal desde 2016 · BCB para os indicadores econômicos.</span>
            <a href={pageHref('laboratorio') + '#l-metodologia'} onClick={e => navigate(e, 'laboratorio', 'l-metodologia')}>Dados e metodologia</a>
          </footer>
        </main>
        {tip.node}
      </div>
    </Ctx.Provider>
  );
}
