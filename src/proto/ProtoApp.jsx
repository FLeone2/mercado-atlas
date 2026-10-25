import { flushSync } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ctx } from './ctx.js';
import { engine } from 'virtual:market';
import { useDataApp, normalizePeriod } from '../kit/index.js';
import { useTip } from '../next/charts.jsx';
import FilterBar from './FilterBar.jsx';
import { focusOf, marketFiltersOf, list, rangeText, UF_NAMES, brandName } from './lib.js';
import Resumo from './pages/Resumo.jsx';
import Mercado from './pages/Mercado.jsx';
import Concorrencia from './pages/Concorrencia.jsx';
import Foco from './pages/Foco.jsx';
import Territorios from './pages/Territorios.jsx';
import Economia from './pages/Economia.jsx';
import Laboratorio from './pages/Laboratorio.jsx';
import '../next/next.css';
import './proto.css';

/* Protótipo da reorganização: 6 páginas + laboratório, rolagem contínua (sem subabas), uma barra de
   filtros fixa e a marca em foco (Mitsubishi por padrão) comparada com o resto em todas as páginas. */
export const PAGES = [
  { slug: 'resumo', label: 'Resumo', C: Resumo },
  { slug: 'mercado', label: 'Mercado', C: Mercado },
  { slug: 'concorrencia', label: 'Concorrência', C: Concorrencia },
  { slug: 'foco', label: 'Mitsubishi', C: Foco },
  { slug: 'territorios', label: 'Territórios', C: Territorios },
  { slug: 'economia', label: 'Economia', C: Economia },
  { slug: 'laboratorio', label: 'Laboratório', C: Laboratorio },
];
// links da interface atual (?a=panorama…) abrem a página equivalente
const OLD = { panorama: 'resumo', evolucao: 'mercado', segmentos: 'mercado', explorar: 'laboratorio', animacoes: 'laboratorio' };
const readPage = () => { const s = new URLSearchParams(location.search).get('a'); const v = OLD[s] ?? s; return PAGES.some(p => p.slug === v) ? v : 'resumo'; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;


export default function ProtoApp() {
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
  const atual = (() => { const p = new URLSearchParams(location.search); p.set('ui', 'atual'); return location.pathname + '?' + p.toString(); })();
  return (
    <Ctx.Provider value={ctx}>
      <div className="nx px" data-page={page}>
        <header className="nx-nav px-nav" data-tone="light">
          <a className="nx-brand" href="?" onClick={e => { e.preventDefault(); go('resumo'); }}>Atlas</a>
          <nav className="nx-links" aria-label="Páginas">
            {PAGES.map(p => <a key={p.slug} href={'?a=' + p.slug} aria-current={p.slug === page ? 'page' : undefined} className={p.slug === 'foco' ? 'px-focus-link' : p.slug === 'laboratorio' ? 'px-lab-link' : undefined} onClick={e => { e.preventDefault(); go(p.slug); }}>{label(p)}</a>)}
          </nav>
          <span className="px-proto-tag" title="Protótipo para validação">Protótipo</span>
        </header>
        <FilterBar />
        <nav className="nx-dock" aria-label="Páginas (celular)">
          {PAGES.map(p => <a key={p.slug} href={'?a=' + p.slug} aria-current={p.slug === page ? 'page' : undefined} onClick={e => { e.preventDefault(); go(p.slug); }}>{label(p)}</a>)}
        </nav>
        {q.error && <div className="nx-status err" role="alert">Não foi possível calcular este recorte ({q.error}). Ajuste os filtros ou recarregue a página.</div>}
        <main className={'px-main' + (stale ? ' nx-stale' : '')} aria-busy={q.pending || undefined}>
          <Page />
          <footer className="px-foot nx-wrap">
            <span>Fonte: emplacamentos mensais (cubos do Atlas) · série mensal desde 2016 · BCB para os indicadores econômicos.</span>
            <a href={atual}>Ver a versão atual do site ↗</a>
          </footer>
        </main>
        {tip.node}
      </div>
    </Ctx.Provider>
  );
}
