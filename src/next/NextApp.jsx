import { flushSync } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { useDataApp, normalizePeriod } from '../kit/index.js';
import FilterSheet from './FilterSheet.jsx';
import { AREAS } from './areas/index.js';
import { NextCtx } from './ctx.js';
import LegacyTab from './LegacyTab.jsx';
import { useTip } from './charts.jsx';
import { UF_NAMES, rangeText } from './format.js';
import './next.css';
import './legacy-skin.css';

const BRAND_KEYS = ['marca', 'modelo', 'grupo_modelo'], GEO_KEYS = ['uf', 'regiao', 'municipio'];
const active = v => v != null && v !== 'all' && !(Array.isArray(v) && (v.length === 0 || v.includes('all')));
const without = (filters, keys) => { const f = { ...filters }; for (const k of keys) f[k] = 'all'; return f; };
const list = v => (active(v) ? (Array.isArray(v) ? v : [v]).filter(x => x !== 'all') : []);
const readArea = () => { const s = new URLSearchParams(location.search).get('a'); return AREAS.some(a => a.slug === s) ? s : 'panorama'; };
const legacyQuality = () => { const p = new URLSearchParams(location.search); p.set('ui', 'antigo'); p.delete('a'); p.set('tab', 'quality'); return location.pathname + '?' + p.toString(); };
const legacyHome = () => { const p = new URLSearchParams(location.search); p.set('ui', 'antigo'); p.delete('a'); return location.pathname + '?' + p.toString(); };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function NextApp() {
  const shell = useDataApp(), base = engine.getBase(shell.snapshot);
  const filters = useMemo(() => {
    const f = { ...Object.fromEntries((shell.snapshot.filters ?? []).map(f => [f.id, f.defaultValue ?? 'all'])), ...shell.filters };
    // f.date=2026-09 or f.date=2026-09-15 from a link: one explicit start..end for every panel and label
    // f.marca=MITSUBISHI from a link behaves exactly like f.marca=["MITSUBISHI"] (toggles, chips, summary)
    for (const k of Object.keys(f)) if (!['date', 'population'].includes(k) && typeof f[k] === 'string' && f[k] !== 'all') f[k] = [f[k]];
    if (f.date && f.date !== 'all' && /^\d{4}-\d{2}(-\d{2})?(\.\.\d{4}-\d{2}(-\d{2})?)?$/.test(String(f.date))) f.date = normalizePeriod(f.date);
    return f;
  }, [shell.snapshot, shell.filters]);
  const hasBrand = BRAND_KEYS.some(k => active(filters[k])), hasGeo = GEO_KEYS.some(k => active(filters[k]));
  const { manifest, result: fresh, pending, error, manifestError } = engine.useMarketData(filters, true, 'dashboard', false);
  // While a new filter loads, the previous numbers stay on screen dimmed and locked under an
  // "Atualizando" notice; if the query fails they are dropped, never shown under the new filters.
  const lastModel = useRef(null); if (fresh) lastModel.current = fresh; if (error) lastModel.current = null;
  const model = error ? null : fresh ?? lastModel.current, stale = pending && !fresh && Boolean(model);
  const market = engine.useMarketData(without(filters, BRAND_KEYS), hasBrand, 'dashboard', false).result;
  const geoless = engine.useMarketData(without(filters, GEO_KEYS), hasGeo, 'dashboard', false).result;
  const hist = engine.useHistory(filters, base, true);
  const points = engine.useTbmPoints(base).data;
  // com só modelo/versão escolhidos, a marca em foco é a dona do modelo (e não a marca padrão)
  const modelOnly = !active(filters.marca) && (active(filters.grupo_modelo) || active(filters.modelo));
  const focus = (modelOnly && model?.groups?.marca?.[0]?.name) || engine.marketFocusBrand(filters);
  const names = useMemo(() => { const m = new Map(); for (const [, n, u] of points?.rows ?? []) m.set(engine.geoKey(n, u) + '|' + u, n); return m; }, [points]);
  const cityName = useCallback(raw => { const i = raw.lastIndexOf(' · '), u = raw.slice(i + 3), n = raw.slice(0, i); return names.get(engine.geoKey(n, u) + '|' + u) ?? n.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); }, [names]);
  const insights = useMemo(() => engine.overviewInsights(hasBrand ? market ?? model : model), [model, market, hasBrand]);

  const [area, setArea] = useState(readArea), [sheet, setSheet] = useState(false), [tone, setTone] = useState('dark');
  const [palette, setPaletteState] = useState(() => { try { return localStorage.getItem('nx-palette') || 'grafite'; } catch { return 'grafite'; } });
  const [chapters, setChapters] = useState([]), [chapter, setChapter] = useState(null), tip = useTip();
  const setPalette = p => { setPaletteState(p); try { localStorage.setItem('nx-palette', p); } catch { /* storage may be blocked */ } };
  const setFilter = useCallback((id, value) => shell.setFilter(id, value), [shell]);
  const dateDefault = shell.snapshot.filters.find(f => f.id === 'date')?.defaultValue;
  const changed = filters.population === 'all_content' || Object.entries(filters).some(([k, v]) => !['date', 'population'].includes(k) && active(v)) || Boolean(filters.date && dateDefault && filters.date !== dateDefault);
  const reset = () => { for (const [k, v] of Object.entries(filters)) if (!['date', 'population'].includes(k) && active(v)) shell.setFilter(k, 'all'); if (dateDefault) shell.setFilter('date', dateDefault); if (filters.population === 'all_content') shell.setFilter('population', 'light'); };
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
  /* ---- less text: long notes and descriptions (ours and the current Atlas') collapse into an ⓘ whose balloon shows the text ---- */
  useEffect(() => {
    const root = main.current; let t = 0;
    const SKIP = '.nx-scope,.hx-scope,.tbm-warn,.am-frozen-base,[role="note"],.nx-block-head,.nx-areahead,.nx-tip,.nx-info,.ax-popover,.ax-tooltip,table,[role="status"],[role="alert"],.am-loading,.am-empty,.nx-foot,.nx-tile,.nxl-actions,.nx-callouts,.am-map-pending,.nx-tiles,.nxp-hero';
    const scan = () => {
      for (const el of root.querySelectorAll('p, .ax-section-lede, .ax-card-note')) {
        if (el.closest(SKIP) || el.querySelector('a,button,input,select,label,svg,canvas,img')) continue;
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        const always = el.matches('.nx-note, .nx-lede, .ax-section-lede, .ax-card-note');
        if (!text || (!always && text.length <= 110)) { if (el.hasAttribute('data-nxnote') && !text) el.removeAttribute('data-nxnote'); continue; }
        if (el.getAttribute('data-nxnote') !== text) { el.setAttribute('data-nxnote', text); el.setAttribute('tabindex', '0'); el.setAttribute('role', 'note'); el.setAttribute('aria-label', 'Nota: ' + text); }
      }
    };
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 150); });
    mo.observe(root, { childList: true, subtree: true, characterData: true }); scan();
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [area]);
  const scrollToChapter = id => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: id === 'topo' ? 'start' : 'center' });

  const summary = useMemo(() => {
    const ufs = list(filters.uf).map(u => UF_NAMES[u] ?? u), regs = list(filters.regiao), brands = list(filters.marca).map(engine.insightName), models = [...list(filters.grupo_modelo), ...list(filters.modelo)];
    const shown = ['date', 'population', 'uf', 'regiao', 'marca', 'grupo_modelo', 'modelo'];
    const more = Object.keys(filters).filter(k => !shown.includes(k) && active(filters[k])).length + (filters.population === 'all_content' ? 1 : 0);
    const what = models.length ? models.join(', ') : brands.length ? brands.join(', ') : 'Todas as marcas';
    return [model ? rangeText(model.range) : '…', ufs.length && regs.length ? ufs.join(', ') + ' ∩ ' + regs.join(', ') : ufs.length ? ufs.join(', ') : regs.length ? regs.join(', ') : 'Brasil', what].join(' · ') + (more ? ' +' + more : '');
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
          <a className="nx-brand" href="?" onClick={e => { e.preventDefault(); go('panorama'); }}>Atlas</a>
          <nav className="nx-links" aria-label="Áreas">
            {AREAS.map(a => <a key={a.slug} href={'?a=' + a.slug} aria-current={a.slug === area ? 'page' : undefined} onClick={e => { e.preventDefault(); go(a.slug); }}>{a.label}</a>)}
          </nav>
          <button type="button" className="nx-lens" aria-expanded={sheet} aria-controls="nx-sheet" onClick={() => setSheet(s => !s)}>
            <i className={'dot' + (changed ? ' on' : '')} /><span>{summary}</span>
            <svg viewBox="0 0 12 8" aria-hidden><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>
        <nav className="nx-dock" aria-label="Áreas (celular)">
          {AREAS.map(a => <a key={a.slug} href={'?a=' + a.slug} aria-current={a.slug === area ? 'page' : undefined} onClick={e => { e.preventDefault(); go(a.slug); }}>{a.label}</a>)}
        </nav>
        <FilterSheet open={sheet} filters={filters} setFilter={setFilter} manifest={manifest} model={model} onReset={reset} changed={changed} palette={palette} setPalette={setPalette} />
        {stale && <div className="nx-status" role="status">Atualizando para os novos filtros… os números abaixo ainda são do recorte anterior.</div>}
        {error && <div className="nx-status err" role="alert">Não foi possível calcular este recorte ({error}). Os números anteriores foram retirados; ajuste os filtros ou recarregue a página.</div>}
        {!error && manifestError && <div className="nx-status warn" role="status">A lista de meses publicada não carregou; usando a cópia embutida no site ({manifestError}).</div>}
        <main ref={main} className={(pending ? 'nx-pending' : '') + (stale ? ' nx-stale' : '')}>
          {new URLSearchParams(location.search).get('legacy') ? <div className="nx-wrap" style={{ paddingTop: 100 }}><LegacyTab tab={new URLSearchParams(location.search).get('legacy')} /></div> : <View />}
          <footer className="nx-foot">
            <div className="nx-wrap">
              <div className="nx-kicker">Outras áreas</div>
              <h2>Há mais de onde isso veio.</h2>
              <div className="nx-more">{AREAS.filter(a => a.slug !== area).map(a => <a key={a.slug} href={'?a=' + a.slug} onClick={e => { e.preventDefault(); go(a.slug); }}>{a.label}<span aria-hidden>→</span></a>)}</div>
              <p className="nx-note"><a href={legacyQuality()}>Dados e metodologia ↗</a> · <a href={legacyHome()}>Versão antiga ↗</a> · Fonte: emplacamentos mensais, cubos do Atlas.</p>
            </div>
          </footer>
        </main>
        <nav className="nx-dots" aria-label="Capítulos">{chapters.map(([id, label]) => <button key={id} type="button" aria-label={label} aria-current={chapter === id || undefined} onClick={() => scrollToChapter(id)}><span>{label}</span></button>)}</nav>
        {tip.node}
      </div>
    </NextCtx.Provider>
  );
}
