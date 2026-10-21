import { useRef, useState, useMemo } from 'react';
import { fmt } from './format.js';

/* Tooltip shared by the charts: one floating label that follows the pointer. */
export function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, html) => setTip({ x: Math.min(e.clientX + 16, innerWidth - 250), y: e.clientY + 16, html });
  const hide = () => setTip(null);
  const node = tip && <div className="nx-tip" style={{ left: tip.x, top: tip.y }}>{tip.html}</div>;
  return { show, hide, node };
}

/* Years laid over each other, Jan to Dec: the current year in the accent colour, earlier years in greys. */
export function YearLines({ years, labels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] }) {
  const W = 1000, H = 460, pad = { l: 58, r: 16, t: 14, b: 34 };
  const ref = useRef(null), tip = useTip(), [hover, setHover] = useState(null);
  const max = Math.max(1, ...years.flatMap(y => y.values.filter(v => v != null))) * 1.08;
  const X = i => pad.l + (i / 11) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = vals => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
  const ticks = [0, .5, 1].map(t => max * t);
  const move = e => {
    const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(11, Math.round((x - pad.l) / (W - pad.l - pad.r) * 11)));
    setHover(i);
    tip.show(e, <><strong>{labels[i]}</strong>{[...years].reverse().map(y => y.values[i] != null && <span key={y.year}><i style={{ background: y.color }} />{y.year} <b>{fmt(y.values[i])}</b></span>)}</>);
  };
  return (
    <>
      <svg ref={ref} className="nx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Emplacamentos por mês, um ano sobre o outro" onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g className="nx-axis">
          {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{fmt(t)}</text></g>)}
          {labels.map((l, i) => <text key={l} x={X(i)} y={H - 8} textAnchor="middle">{l}</text>)}
        </g>
        {years.map((y, k) => <path key={y.year} className="nx-line" d={path(y.values)} stroke={y.color} strokeWidth={y.main ? 4 : 2.2} style={{ animationDelay: k * 120 + 'ms' }} />)}
        {hover != null && <line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />}
        {hover != null && years.map(y => y.values[hover] != null && <circle key={y.year} cx={X(hover)} cy={Y(y.values[hover])} r={y.main ? 6 : 4} fill="var(--nx-card)" stroke={y.color} strokeWidth="2.5" />)}
        {years.filter(y => y.main).map(y => { const i = y.values.reduce((a, v, k) => v != null ? k : a, 0); return <text key={y.year} className="nx-endlabel" x={X(i) + 10} y={Y(y.values[i]) + 4} fill={y.color}>{y.year}</text>; })}
      </svg>
      <div className="nx-legend">{[...years].reverse().map(y => <span key={y.year}><i style={{ background: y.color }} />{y.year}</span>)}</div>
      {tip.node}
    </>
  );
}

/* Horizontal bars with the value and the change next to the name. */
export function BarList({ rows, max, onPick, focus }) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="nx-bars">
      {rows.map((r, i) => (
        <button key={r.key ?? r.name} type="button" className={'nx-bar' + (r.name === focus ? ' hl' : '') + (r.gap ? ' gap' : '')} onClick={() => onPick?.(r)} title={r.title}>
          <span className="nx-bar-name"><i>{r.rank ?? i + 1}</i>{r.label ?? r.name}</span>
          <span className="nx-bar-track"><span className="nx-bar-fill" style={{ transform: `scaleX(${Math.max(.004, r.value / top)})`, animationDelay: i * 45 + 'ms' }} /></span>
          <span className="nx-bar-val">{r.valueText ?? fmt(r.value)}</span>
          <span className={'nx-bar-delta ' + (r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : '')}>{r.deltaText}</span>
        </button>
      ))}
    </div>
  );
}

/* Gainers and losers around a centre line. */
export function Diverging({ rows, onPick }) {
  const max = Math.max(1e-6, ...rows.map(r => Math.abs(r.value)));
  return (
    <div className="nx-div">
      {rows.map((r, i) => (
        <button key={r.name} type="button" className="nx-div-row" onClick={() => onPick?.(r)}>
          <span className="nx-div-name">{r.label}</span>
          <span className="nx-div-track">
            <span className={'nx-div-fill ' + (r.value >= 0 ? 'pos' : 'neg')} style={{ width: Math.abs(r.value) / max * 50 + '%', [r.value >= 0 ? 'left' : 'right']: '50%', animationDelay: i * 50 + 'ms' }} />
          </span>
          <span className={'nx-div-val ' + (r.value >= 0 ? 'up' : 'down')}>{r.text}</span>
        </button>
      ))}
    </div>
  );
}

/* Shares over time, stacked to 100%. */
export function ShareArea({ months, series, max = 1 }) {
  const W = 1000, H = 440, pad = { l: 44, r: 16, t: 10, b: 30 }, ref = useRef(null), tip = useTip(), [hover, setHover] = useState(null);
  const n = months.length;
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const stacks = useMemo(() => {
    const acc = new Array(n).fill(0);
    return series.map(s => { const lo = acc.slice(); s.values.forEach((v, i) => { acc[i] += v; }); return { ...s, lo, hi: acc.slice() }; });
  }, [series, n]);
  const area = s => 'M' + s.hi.map((v, i) => X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('L') + 'L' + s.lo.map((v, i) => [X(i), Y(v)]).reverse().map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  const move = e => {
    const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / (W - pad.l - pad.r) * (n - 1))));
    setHover(i);
    tip.show(e, <><strong>{months[i].label}</strong>{[...series].reverse().filter(s => s.values[i] > 0.0005).map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{(s.values[i] * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b></span>)}</>);
  };
  const step = Math.max(1, Math.round(n / 6));
  return (
    <>
      <svg ref={ref} className="nx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Participação de cada propulsão ao longo do tempo" onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g className="nx-axis">
          {[0, .25, .5, .75, 1].map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t * max)} y2={Y(t * max)} /><text x={0} y={Y(t * max) + 4}>{Math.round(t * max * 100)}%</text></g>)}
          {months.map((m, i) => i % step === 0 && <text key={m.label} x={X(i)} y={H - 8} textAnchor="middle">{m.short}</text>)}
        </g>
        {stacks.map((s, k) => <path key={s.name} className="nx-area" d={area(s)} fill={s.color} style={{ animationDelay: k * 90 + 'ms' }} />)}
        {hover != null && <line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />}
      </svg>
      <div className="nx-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      {tip.node}
    </>
  );
}
