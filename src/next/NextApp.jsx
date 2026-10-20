import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { useDataApp } from '../kit/index.js';
import Hero from './Hero.jsx';
import FilterSheet from './FilterSheet.jsx';
import Story from './Story.jsx';
import { useTip } from './charts.jsx';
import { UF_NAMES, rangeText, shiftMonth } from './format.js';
import './next.css';

const AREAS = [['Panorama', null], ['Evolução', 'history'], ['Concorrência', 'competition'], ['Segmentos', 'segments'], ['Territórios', 'geography'], ['Explorar', 'explore'], ['Economia', 'models'], ['Animações', 'animations']];
const CHAPTERS = [['topo', 'Início'], ['resumo', 'Em resumo'], ['tempo', 'Ao longo do tempo'], ['marcas', 'Quem disputa'], ['ganhos', 'Quem está mudando'], ['tecnologia', 'Para onde vai'], ['territorio', 'Onde']];
const BRAND_KEYS = ['marca', 'modelo', 'grupo_modelo'], GEO_KEYS = ['uf', 'regiao', 'municipio'];
const active = v => v != null && v !== 'all' && !(Array.isArray(v) && (v.length === 0 || v.includes('all')));
const without = (filters, keys) => { const f = { ...filters }; for (const k of keys) f[k] = 'all'; return f; };
const legacyHref = tab => { const p = new URLSearchParams(location.search); p.delete('ui'); p.set('tab', tab); return location.pathname + '?' + p.toString(); };

export default function NextApp() {
  const shell = useDataApp(), base = engine.getBase(shell.snapshot);
  const filters = useMemo(() => ({ ...Object.fromEntries((shell.snapshot.filters ?? []).map(f => [f.id, f.defaultValue ?? 'all'])), ...shell.filters }), [shell.snapshot, shell.filters]);
  const hasBrand = BRAND_KEYS.some(k => active(filters[k])), hasGeo = GEO_KEYS.some(k => active(filters[k]));
  const { manifest, result: fresh, pending } = engine.useMarketData(filters, true, 'dashboard', false);
  // Keep showing the last numbers while a new filter loads, so the page never blanks out.
  const lastModel = useRef(null); if (fresh) lastModel.current = fresh; const model = fresh ?? lastModel.current;
  const brandless = engine.useMarketData(without(filters, BRAND_KEYS), hasBrand, 'dashboard', false).result;
  const geoless = engine.useMarketData(without(filters, GEO_KEYS), hasGeo, 'dashboard', false).result;
  const hist = engine.useHistory(filters, base, true);
  const points = engine.useTbmPoints(base).data;
  const focus = engine.marketFocusBrand(filters);
  const names = useMemo(() => { const m = new Map(); for (const [, n, u] of points?.rows ?? []) m.set(engine.geoKey(n, u) + '|' + u, n); return m; }, [points]);
  const cityName = raw => { const i = raw.lastIndexOf(' · '), u = raw.slice(i + 3), n = raw.slice(0, i); return names.get(engine.geoKey(n, u) + '|' + u) ?? n.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); };
  const insights = useMemo(() => engine.overviewInsights(hasBrand ? brandless ?? model : model), [model, brandless, hasBrand]);

  const [sheet, setSheet] = useState(false), [tone, setTone] = useState('dark'), [palette, setPaletteState] = useState(() => { try { return localStorage.getItem('nx-palette') || 'grafite'; } catch { return 'grafite'; } });
  const [chapter, setChapter] = useState('topo'), tip = useTip(), root = useRef(null);
  const setPalette = p => { setPaletteState(p); try { localStorage.setItem('nx-palette', p); } catch { /* storage may be blocked */ } };
  const setFilter = (id, value) => shell.setFilter(id, value);
  const changed = Object.entries(filters).some(([k, v]) => !['date', 'population'].includes(k) && active(v)) || (filters.date && manifest && filters.date !== (shell.snapshot.filters.find(f => f.id === 'date')?.defaultValue));
  const reset = () => { for (const [k, v] of Object.entries(filters)) if (!['date', 'population'].includes(k) && active(v)) shell.setFilter(k, 'all'); const d = shell.snapshot.filters.find(f => f.id === 'date')?.defaultValue; if (d) shell.setFilter('date', d); };

  useEffect(() => { document.documentElement.dataset.nx = ''; document.title = 'Atlas · Mercado automotivo'; return () => { delete document.documentElement.dataset.nx; }; }, []);
  useEffect(() => {
    if (!sheet) return undefined;
    const away = e => { if (!e.target.closest('#nx-sheet,.nx-lens')) setSheet(false); }, esc = e => { if (e.key === 'Escape') setSheet(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [sheet]);
  useEffect(() => {
    const els = CHAPTERS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setChapter(e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el)); return () => io.disconnect();
  }, [model, hist.data]);

  const summary = useMemo(() => {
    const parts = [];
    const ufs = (Array.isArray(filters.uf) ? filters.uf : []).filter(x => x !== 'all').map(u => UF_NAMES[u] ?? u);
    const regs = (Array.isArray(filters.regiao) ? filters.regiao : []).filter(x => x !== 'all');
    const brands = (Array.isArray(filters.marca) ? filters.marca : []).filter(x => x !== 'all').map(engine.insightName);
    parts.push(model ? rangeText(model.range) : '…'); parts.push(ufs.length ? ufs.join(', ') : regs.length ? regs.join(', ') : 'Brasil'); parts.push(brands.length ? brands.join(', ') : 'Todas as marcas');
    const more = ['propulsao', 'segmento', 'tipo_venda'].filter(k => active(filters[k])).length;
    return parts.join(' · ') + (more ? ' +' + more : '');
  }, [filters, model]);

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: id === 'topo' ? 'start' : 'center' });
  const ufFilter = (Array.isArray(filters.uf) ? filters.uf : []).filter(x => x !== 'all');

  return (
    <div className="nx" data-pal={palette} ref={root}>
      <header className="nx-nav" data-tone={tone}>
        <a className="nx-brand" href="?ui=novo" onClick={e => { e.preventDefault(); scrollTo('topo'); }}>Atlas</a>
        <nav className="nx-links" aria-label="Áreas">
          {AREAS.map(([label, tab]) => tab
            ? <a key={label} href={legacyHref(tab)} title="Abre no Atlas atual">{label}</a>
            : <a key={label} href="?ui=novo" aria-current="page" onClick={e => { e.preventDefault(); scrollTo('topo'); }}>{label}</a>)}
        </nav>
        <button type="button" className="nx-lens" aria-expanded={sheet} aria-controls="nx-sheet" onClick={() => setSheet(s => !s)}>
          <i className={'dot' + (changed ? ' on' : '')} />{summary}
          <svg viewBox="0 0 12 8" aria-hidden><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>
      <FilterSheet open={sheet} filters={filters} setFilter={setFilter} manifest={manifest} model={model} onReset={reset} changed={changed} palette={palette} setPalette={setPalette} />
      <main className={pending ? 'nx-pending' : ''}>
        <Hero model={model} points={points} ufFilter={ufFilter} insights={insights} scrollRef={setTone} onTip={t => (t ? tip.show(t.e, t.html) : tip.hide())} />
        <Story model={model} market={hasBrand ? brandless : null} geoMarket={hasGeo ? geoless : null} hist={hist} filters={filters} setFilter={setFilter} insights={insights} focus={focus} cityName={cityName} />
        <footer className="nx-foot">
          <div className="nx-wrap">
            <div className="nx-kicker">Continue explorando</div>
            <h2>Há mais de onde isso veio.</h2>
            <div className="nx-more">{AREAS.filter(([, t]) => t).map(([label, tab]) => <a key={label} href={legacyHref(tab)}>{label}<span aria-hidden>↗</span></a>)}</div>
            <p className="nx-note">As outras áreas abrem no Atlas atual, mantendo os filtros. Fonte: emplacamentos mensais, cubos do Atlas.</p>
          </div>
        </footer>
      </main>
      <nav className="nx-dots" aria-label="Capítulos">{CHAPTERS.map(([id, label]) => <button key={id} type="button" aria-label={label} aria-current={chapter === id || undefined} onClick={() => scrollTo(id)}><span>{label}</span></button>)}</nav>
      {tip.node}
    </div>
  );
}
