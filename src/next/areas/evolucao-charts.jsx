import { useRef, useState } from 'react';
import { useTip } from '../charts.jsx';
import { fmt, monthLabel } from '../format.js';
import './evolucao.css';

/* Linha do tempo genérica: uma ou várias séries mensais, cruz interativa, rótulos diretos no fim das linhas,
   faixas de referência e marcações (máximo/mínimo). Valores nulos quebram a linha. */
const niceStep = raw => { const mag = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag; return 10 * mag; };

export function TimeLines({ months, series, fmtY = fmt, fmtTip, bands, marks, label, height = 360, endLabels = true, yMax: yMaxIn, tipExtra, replayKey }) {
  const W = 1000, H = height, pad = { l: 62, r: endLabels ? 104 : 18, t: 22, b: 34 };
  const ref = useRef(null), tip = useTip(), [hover, setHover] = useState(null), n = months.length;
  const all = series.flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
  const rawMax = yMaxIn ?? Math.max(1e-9, ...all) * 1.06, step = niceStep(rawMax / 6), yMax = Math.ceil(rawMax / step) * step;
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const path = vals => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null || !Number.isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
  const ticks = []; for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  const first = Math.max(0, Math.min(...series.map(s => s.values.findIndex(v => v != null)).filter(k => k >= 0)));
  const xt = []; if (n > 40) months.forEach((m, i) => { if (m.endsWith('-01') && i >= first) xt.push([i, m.slice(0, 4)]); }); else { const k = Math.max(1, Math.round(n / 6)); months.forEach((m, i) => { if (i % k === 0) xt.push([i, monthLabel(m)]); }); }
  const fmtT = fmtTip ?? fmtY;
  const move = e => {
    const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / (W - pad.l - pad.r) * (n - 1))));
    setHover(i);
    tip.show(e, <><strong>{monthLabel(months[i])}</strong>{series.filter(s => s.values[i] != null).map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{fmtT(s.values[i])}</b></span>)}{tipExtra?.(i)}</>);
  };
  /* rótulos no fim: empurra para baixo os que se sobrepõem */
  const ends = endLabels ? (() => {
    const rows = series.map(s => { let k = s.values.length - 1; while (k >= 0 && s.values[k] == null) k--; return k === n - 1 ? { s, y: Y(s.values[k]) } : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i++) if (rows[i].y - rows[i - 1].y < 15) rows[i].y = rows[i - 1].y + 15;
    return rows;
  })() : [];
  return (
    <>
      <svg ref={ref} className="nx-chart nxe-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        {bands?.filter(b => b.from < yMax).map(b => <g key={b.label}><rect x={pad.l} width={W - pad.l - pad.r} y={Y(Math.min(b.to, yMax))} height={Math.max(0, Y(b.from) - Y(Math.min(b.to, yMax)))} className={'nxe-band ' + (b.tone ?? '')} /><text className="nxe-bandlabel" x={pad.l + 10} y={Y(Math.min(b.to, yMax)) + 16}>{b.label}</text></g>)}
        <g className="nx-axis">
          {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{fmtY(t)}</text></g>)}
          {xt.map(([i, l]) => <text key={i} x={X(i)} y={H - 8} textAnchor="middle">{l}</text>)}
        </g>
        {series.map((s, k) => <path key={s.name + (replayKey ?? '')} className="nx-line" d={path(s.values)} stroke={s.color} strokeWidth={s.width ?? 3} strokeDasharray={s.dash} style={{ animationDelay: k * 90 + 'ms', ...(s.dash ? { animation: 'none', strokeDashoffset: 0 } : null) }} />)}
        {marks?.map((m, k) => { const x = X(m.i), y = Y(m.v), anchor = x > W - 170 ? 'end' : x < 150 ? 'start' : 'middle'; return <g key={k} className="nxe-mark"><circle cx={x} cy={y} r="5" fill="var(--nx-card)" stroke={m.color ?? 'var(--nx-ink)'} strokeWidth="2.5" /><text x={x} y={y + (m.pos === 'down' ? 26 : -14)} textAnchor={anchor}>{m.text}</text></g>; })}
        {hover != null && <line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />}
        {hover != null && series.map(s => s.values[hover] != null && <circle key={s.name} cx={X(hover)} cy={Y(s.values[hover])} r="5" fill="var(--nx-card)" stroke={s.color} strokeWidth="2.5" />)}
        {ends.map(({ s, y }) => <text key={s.name} className="nx-endlabel" x={W - pad.r + 10} y={y + 4} fill={s.color}>{s.name}</text>)}
      </svg>
      {tip.node}
    </>
  );
}

/* Alternador em pílulas (segmentado) */
export function Seg({ value, options, onChange, label }) {
  return <div className="nxe-seg" role="group" aria-label={label}>{options.map(o => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
