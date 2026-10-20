import { useEffect, useRef, useState } from 'react';
import { fmt } from './format.js';

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


/* Compact header of an area: title, one-line finding, optional tabs (sub-areas). tabs = [[key,label],…] */
export function AreaHead({ title, finding, tabs, tab, onTab, children }) {
  return (
    <header className="nx-areahead">
      <div className="nx-wrap">
        <h1>{title}</h1>
        {finding && <p>{finding}</p>}
        {tabs && <div className="nx-tabs" role="tablist" aria-label="Seções">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => onTab(k)}>{l}</button>)}</div>}
        {children}
      </div>
    </header>
  );
}

/* A card with a one-line conclusion and a short caption; put charts inside. */
export function Block({ title, caption, children, className = '', actions }) {
  return (
    <div className={'nx-card ' + className}>
      {(title || actions) && <div className="nx-block-head" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}><div>{title && <h3 className="nx-block-t">{title}</h3>}{caption && <p className="nx-block-s">{caption}</p>}</div>{actions}</div>}
      {children}
    </div>
  );
}
