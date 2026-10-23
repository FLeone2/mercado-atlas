import { Children, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import { fmt } from './format.js';
import { exportRootToPng, exportContextSlug } from '../kit/index.js';

/* Building blocks every area shares: a chapter (one question, one finding, one chart), a count-up number and a figure tile. */
export function Chapter({ id, kicker, title, lede, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { el.setAttribute('data-in', ''); io.disconnect(); } }), { threshold: .12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <section className="nx-chapter" id={id} ref={ref} data-chapter data-title={kicker}>
      <div className="nx-wrap">
        <div className="nx-kicker">{kicker}</div>
        <h2>{title}</h2>
        {lede && <p className="nx-lede">{lede}</p>}
        <div className={'nx-body' + (wide ? ' wide' : '')}>{children}</div>
      </div>
    </section>
  );
}

export function CountUp({ value }) {
  const [v, setV] = useState(0), ref = useRef(null);
  useEffect(() => {
    const el = ref.current; let raf = 0;
    const io = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; io.disconnect(); const t0 = performance.now(), from = 0; const run = t => { const k = Math.min(1, (t - t0) / 1200); setV(from + (value - from) * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(run); }; raf = requestAnimationFrame(run); });
    io.observe(el); return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);
  return <span ref={ref}>{fmt(v)}</span>;
}

export const Tile = ({ k, children, sub, dark, red, small }) => <div className={'nx-tile' + (dark ? ' dark' : '')}><div className="nx-tile-k">{k}</div><div><div className={'nx-tile-n' + (red ? ' red' : '') + (small ? ' sm' : '')}>{children}</div>{sub && <div className="nx-tile-s">{sub}</div>}</div></div>;


/* Compact header of an area: just the title and, when the area has sub-areas, pill tabs. tabs = [[key,label],…]
   (`finding` is accepted for compatibility but no longer shown: the user asked for less text.) */
export function AreaHead({ title, tabs, tab, onTab, children }) {
  return (
    <header className="nx-areahead">
      <div className="nx-wrap">
        <h1>{title}</h1>
        {tabs && <div className="nx-tabs" role="tablist" aria-label="Seções">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => onTab(k)}>{l}</button>)}</div>}
        {children}
      </div>
    </header>
  );
}

/* ⓘ that opens a short explanation on hover, focus or tap. */
export function InfoTip({ children, label = 'O que este gráfico mostra' }) {
  const [open, setOpen] = useState(false);
  if (children == null || children === '' || children === false) return null;
  return (
    <span className="nx-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}>i</button>
      {open && <span className="nx-info-pop" role="note">{children}</span>}
    </span>
  );
}

/* One chart = one card: a short title, a one-line subtitle (the key fact) and an ⓘ with the explanation.
   title: short label ("Marcas"); sub: one line ("Fiat lidera com 19,9%"); info: what the chart means and how to read it.
   `caption` (older blocks) goes into the ⓘ. */
export function Block({ title, sub, info, caption, children, className = '', actions }) {
  // Footnotes written as <p className="nx-note"> directly inside the card join the ⓘ instead of showing as text.
  const notes = [], body = [];
  Children.toArray(children).forEach(c => (isValidElement(c) && c.type === 'p' && String(c.props.className ?? '').includes('nx-note') ? notes : body).push(c));
  const base = info ?? caption;
  const tip = notes.length ? <>{base && <span style={{ display: 'block', marginBottom: 6 }}>{base}</span>}{notes.map((n, i) => <span key={i} style={{ display: 'block' }}>{n.props.children}</span>)}</> : base;
  const root = useRef(null), [busy, setBusy] = useState(false);
  const download = async () => {
    if (!root.current) return;
    setBusy(true);
    try {
      const slug = String(typeof title === 'string' ? title : 'grafico').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await exportRootToPng(root.current, { filename: 'atlas-' + slug + '_' + exportContextSlug(), title: typeof title === 'string' ? title : '' });
    } catch (error) { globalThis.alert?.(error.message); } finally { setBusy(false); }
  };
  return (
    <div className={'nx-card nx-block ' + className} ref={root}>
      {(title || actions) && (
        <div className="nx-block-head">
          <div className="nx-block-titles">
            {title && <h3 className="nx-block-t">{title}<InfoTip>{tip}</InfoTip><button type="button" className="nx-dl" onClick={download} disabled={busy} aria-label="Baixar imagem (PNG)" title="Baixar imagem (PNG)"><svg viewBox="0 0 16 16" aria-hidden><path d="M8 2v8m0 0L4.5 6.6M8 10l3.5-3.4M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></h3>}
            {sub && <p className="nx-block-sub">{sub}</p>}
          </div>
          {actions && <div className="nx-block-actions">{actions}</div>}
        </div>
      )}
      <div className="nx-block-body">{body}</div>
    </div>
  );
}

// Local view state kept in the address bar (?key=value), so a copied link or a reload restores
// the same sub-tab, measure, dimension, selection or comparison. `parse` returns undefined for
// anything invalid, which falls back to the default; the default itself is never written.
export function useUrlState(key, initial, parse = v => v, format = v => String(v)) {
  const [value, setValue] = useState(() => {
    try { const raw = new URLSearchParams(location.search).get(key); const v = raw == null ? undefined : parse(raw); return v === undefined ? initial : v; } catch { return initial; }
  });
  const set = useCallback(next => setValue(prev => {
    const v = typeof next === 'function' ? next(prev) : next;
    try {
      const url = new URL(location.href), text = v == null ? null : format(v);
      if (text == null || text === format(initial)) url.searchParams.delete(key); else url.searchParams.set(key, text);
      if (url.href !== location.href) history.replaceState(history.state, '', url);
    } catch { /* address bar not writable: state still works locally */ }
    return v;
  }), [key]);
  return [value, set];
}
export const oneOf = list => v => (list.includes(v) ? v : undefined);
export const jsonList = v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 5) : undefined; } catch { return undefined; } };
