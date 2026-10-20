import { flushSync } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { useDataApp } from '../kit/index.js';
import FilterSheet from './FilterSheet.jsx';
import { AREAS } from './areas/index.js';
import { NextCtx } from './ctx.js';
import { useTip } from './charts.jsx';
import { UF_NAMES, rangeText } from './format.js';
import './next.css';

const BRAND_KEYS = ['marca', 'modelo', 'grupo_modelo'], GEO_KEYS = ['uf', 'regiao', 'municipio'];
const active = v => v != null && v !== 'all' && !(Array.isArray(v) && (v.length === 0 || v.includes('all')));
const without = (filters, keys) => { const f = { ...filters }; for (const k of keys) f[k] = 'all'; return f; };
const list = v => (active(v) ? (Array.isArray(v) ? v : [v]).filter(x => x !== 'all') : []);
const readArea = () => { const s = new URLSearchParams(location.search).get('a'); return AREAS.some(a => a.slug === s) ? s : 'panorama'; };
const legacyQuality = () => { const p = new URLSearchParams(location.search); p.delete('ui'); p.delete('a'); p.set('tab', 'quality'); return location.pathname + '?' + p.toString(); };
const legacyHome = () => { const p = new URLSearchParams(location.search); p.delete('ui'); p.delete('a'); return location.pathname + '?' + p.toString(); };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function NextApp() {
  const shell = useDataApp(), base = engine.getBase(shell.snapshot);
  const filters = useMemo(() => ({ ...Object.fromEntries((shell.snapshot.filters ?? []).map(f => [f.id, f.defaultValue ?? 'all'])), ...shell.filters }), [shell.snapshot, shell.filters]);
  const hasBrand = BRAND_KEYS.some(k => active(filters[k])), hasGeo = GEO_KEYS.some(k => active(filters[k]));
  const { manifest, result: fresh, pending } = engine.useMarketData(filters, true, 'dashboard', false);
  // Keep showing the last numbers while a new filter loads, so the page never blanks out.
  const lastModel = useRef(null); if (fresh) lastModel.current = fresh; const model = fresh ?? lastModel.current;
  const market = engine.useMarketData(without(filters, BRAND_KEYS), hasBrand, 'dashboard', false).result;
  const geoless = engine.useMarketData(without(filters, GEO_KEYS), hasGeo, 'dashboard', false).result;
  const hist = engine.useHistory(filters, base, true);
  const points = engine.useTbmPoints(base).data;
  const focus = engine.marketFocusBrand(filters);
  const names = useMemo(() => { const m = new Map(); for (const [, n, u] of points?.rows ?? []) m.set(engine.geoKey(n, u) + '|' + u, n); return m; }, [points]);
  const cityName = useCallback(raw => { const i = raw.lastIndexOf(' · '), u = raw.slice(i + 3), n = raw.slice(0, i); return names.get(engine.geoKey(n, u) + '|' + u) ?? n.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); }, [names]);
  const insights = useMemo(() => engine.overviewInsights(hasBrand ? market ?? model : model), [model, market, hasBrand]);

  const [area, setArea] = useState(readArea), [sheet, setSheet] = useState(false), [tone, setTone] = useState('dark');
  const [palette, setPaletteState] = useState(() => { try { return localStorage.getItem('nx-palette') || 'grafite'; } catch { return 'grafite'; } });
  const [chapters, setChapters] = useState([]), [chapter, setChapter] = useState(null), tip = useTip();
  const setPalette = p => { setPaletteState(p); try { localStorage.setItem('nx-palette', p); } catch { /* storage may be blocked */ } };
  const setFilter = useCallback((id, value) => shell.setFilter(id, value), [shell]);
  const dateDefault = shell.snapshot.filters.find(f => f.id === 'date')?.defaultValue;
  const changed = Object.entries(filters).some(([k, v]) => !['date', 'population'].includes(k) && active(v)) || Boolean(filters.date && dateDefault && filters.date !== dateDefault);
  const reset = () => { for (const [k, v] of Object.entries(filters)) if (!['date', 'population'].includes(k) && active(v)) shell.setFilter(k, 'all'); if (dateDefault) shell.setFilter('date', dateDefault); };
  const current = AREAS.find(a => a.slug === area) ?? AREAS[0];

  /* ---- navigation between areas: the URL carries ?a=, the page slides in the direction of travel ---- */
  const go = useCallback(slug => {
    if (slug === area) { scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return; }
    const p = new URLSearchParams(location.search); p.set('a', slug); history.pushState(null, '', location.pathname + '?' + p.toString());
    const from = AREAS.findIndex(a => a.slug === area), to = AREAS.findIndex(a => a.slug === slug);
    const swap = () => { setSheet(false); setArea(slug); scrollTo(0, 0); };
    if (typeof document.startViewTransition === 'function' && !reduced()) {
      document.documentElement.dataset.nxDir = to >= from ? 'fwd' : 'back';
      document.startViewTransition(() => flushSync(swap)).finished.finally(() => { delete document.documentElement.dataset.nxDir; });
    } else swap();
  }, [area]);
  useEffect(() => { const pop = () => { setSheet(false); setArea(readArea()); scrollTo(0, 0); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
  useEffect(() => { setTone(current.tone); }, [current]);
  useEffect(() => { document.documentElement.dataset.nx = ''; document.title = 'Atlas · ' + current.label; return () => { delete document.documentElement.dataset.nx; }; }, [current]);

  useEffect(() => {
    if (!sheet) return undefined;
    const away = e => { if (!e.target.closest('#nx-sheet,.nx-lens')) setSheet(false); }, esc = e => { if (e.key === 'Escape') setSheet(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [sheet]);

  /* ---- chapter dots are built from whatever chapters the current area rendered ---- */
  const main = useRef(null);
  useEffect(() => {
    let t = 0;
    const scan = () => { const next = [...document.querySelectorAll('[data-chapter]')].map(el => [el.id, el.dataset.title || el.id]); setChapters(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)); };
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 120); });
    mo.observe(main.current, { childList: true, subtree: true }); scan();
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [area]);
  useEffect(() => {
    const els = chapters.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return undefined;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setChapter(e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el)); return () => io.disconnect();
  }, [chapters]);
  const scrollToChapter = id => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: id === 'topo' ? 'start' : 'center' });

  const summary = useMemo(() => {
    const ufs = list(filters.uf).map(u => UF_NAMES[u] ?? u), regs = list(filters.regiao), brands = list(filters.marca).map(engine.insightName);
    const more = ['propulsao', 'segmento', 'tipo_venda'].filter(k => active(filters[k])).length;
    return [model ? rangeText(model.range) : '…', ufs.length ? ufs.join(', ') : regs.length ? regs.join(', ') : 'Brasil', brands.length ? brands.join(', ') : 'Todas as marcas'].join(' · ') + (more ? ' +' + more : '');
  }, [filters, model]);

  const ctx = useMemo(() => ({
    filters, setFilter, manifest, model, market: hasBrand ? market : null, geoless: hasGeo ? geoless : null, hasBrand, hasGeo, hist, points, focus, insights, cityName, base, go,
    ufFilter: list(filters.uf), setTone, onTip: t => (t ? tip.show(t.e, t.html) : tip.hide()), pending, shell,
  }), [filters, setFilter, manifest, model, market, geoless, hasBrand, hasGeo, hist, points, focus, insights, cityName, base, go, pending, shell, tip.show, tip.hide]);

  const View = current.Component;
  return (
    <NextCtx.Provider value={ctx}>
      <div className="nx" data-pal={palette} data-area={area}>
        <header className="nx-nav" data-tone={tone}>
          <a className="nx-brand" href="?ui=novo" onClick={e => { e.preventDefault(); go('panorama'); }}>Atlas</a>
          <nav className="nx-links" aria-label="Áreas">
            {AREAS.map(a => <a key={a.slug} href={'?ui=novo&a=' + a.slug} aria-current={a.slug === area ? 'page' : undefined} onClick={e => { e.preventDefault(); go(a.slug); }}>{a.label}</a>)}
          </nav>
          <button type="button" className="nx-lens" aria-expanded={sheet} aria-controls="nx-sheet" onClick={() => setSheet(s => !s)}>
            <i className={'dot' + (changed ? ' on' : '')} /><span>{summary}</span>
            <svg viewBox="0 0 12 8" aria-hidden><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>
        <nav className="nx-dock" aria-label="Áreas (celular)">
          {AREAS.map(a => <a key={a.slug} href={'?ui=novo&a=' + a.slug} aria-current={a.slug === area ? 'page' : undefined} onClick={e => { e.preventDefault(); go(a.slug); }}>{a.label}</a>)}
        </nav>
        <FilterSheet open={sheet} filters={filters} setFilter={setFilter} manifest={manifest} model={model} onReset={reset} changed={changed} palette={palette} setPalette={setPalette} />
        <main ref={main} className={pending ? 'nx-pending' : ''}>
          <View />
          <footer className="nx-foot">
            <div className="nx-wrap">
              <div className="nx-kicker">Continue explorando</div>
              <h2>Há mais de onde isso veio.</h2>
              <div className="nx-more">{AREAS.filter(a => a.slug !== area).map(a => <a key={a.slug} href={'?ui=novo&a=' + a.slug} onClick={e => { e.preventDefault(); go(a.slug); }}>{a.label}<span aria-hidden>→</span></a>)}</div>
              <p className="nx-note"><a href={legacyQuality()}>Dados e metodologia ↗</a> · <a href={legacyHome()}>Voltar ao Atlas atual ↗</a> · Fonte: emplacamentos mensais, cubos do Atlas.</p>
            </div>
          </footer>
        </main>
        <nav className="nx-dots" aria-label="Capítulos">{chapters.map(([id, label]) => <button key={id} type="button" aria-label={label} aria-current={chapter === id || undefined} onClick={() => scrollToChapter(id)}><span>{label}</span></button>)}</nav>
        {tip.node}
      </div>
    </NextCtx.Provider>
  );
}
