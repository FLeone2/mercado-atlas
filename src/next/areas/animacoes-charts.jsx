import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmt, pct } from '../format.js';

/* A number that counts to its new value over the same time the bars take to move. */
export function Num({ v, dur }) {
  const [d, setD] = useState(v), cur = useRef(v);
  useEffect(() => {
    if (!dur || dur < 90) { cur.current = v; setD(v); return undefined; }
    const from = cur.current, t0 = performance.now(); let raf = 0;
    const tick = t => { const k = Math.min(1, (t - t0) / dur), x = from + (v - from) * (1 - Math.pow(1 - k, 3)); cur.current = x; setD(x); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v, dur]);
  return <>{fmt(d)}</>;
}

/* The race. Every item keeps one DOM node for the whole year: order is a translateY, length is a scaleX,
   so a change of month is a CSS transition and the bars glide past each other.
   items: [{ key, label, value, rank, slot, focus, hidden }]  (value for the current frame) */
export function Race({ items, max, rowH, height, dur, month, tip, total }) {
  const probe = useRef(null), [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = probe.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width)); ro.observe(el); setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const ease = `${dur}ms cubic-bezier(.23,1,.32,1)`;
  return (
    <div className="nxa-stage" style={{ height, '--row': rowH + 'px', '--dur': dur + 'ms' }} role="img" aria-label="Corrida de barras com o acumulado mês a mês" onPointerLeave={tip.hide}>
      <div className="nxa-probe" ref={probe} />
      <div className="nxa-month" aria-hidden>{month}</div>
      {items.map(it => {
        const px = w > 0 && max > 0 ? Math.max(1, it.value / max * w) : 0, inside = px > it.label.length * (w < 340 ? 7.4 : 8.8) + 34;
        return (
          <div key={it.key} className={'nxa-row' + (it.focus ? ' focus' : '') + (it.hidden ? ' off' : '')} style={{ transform: `translateY(${it.slot * rowH}px)`, transition: dur ? `transform ${ease}, opacity ${Math.min(dur, 500)}ms ease` : 'none' }}
            onPointerMove={e => !it.hidden && tip.show(e, <><strong>{it.label}</strong><span>{it.rank}º lugar · {fmt(it.value)}</span>{total > 0 && <span>{pct(it.value / total, 1)} do total do período</span>}{it.extra && <span>{it.extra}</span>}</>)}>
            <span className="nxa-rk">{it.rank}</span>
            <div className="nxa-track">
              <div className="nxa-fill" style={{ transform: `scaleX(${px / Math.max(1, w)})`, transition: dur ? `transform ${ease}` : 'none' }} />
              <div className="nxa-lab" style={{ transform: `translateX(${px}px)`, transition: dur ? `transform ${ease}` : 'none' }}>
                {inside
                  ? <><span className="nm in">{it.label}</span><span className="val"><Num v={it.value} dur={dur} /></span></>
                  : <span className="nm out">{it.label}<b><Num v={it.value} dur={dur} /></b></span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
