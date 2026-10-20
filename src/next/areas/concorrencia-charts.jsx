import { useState } from 'react';
import { useTip } from '../charts.jsx';
import { fmt, monthLabel } from '../format.js';

/* Ranking mês a mês (gráfico de posições): cada linha é uma marca, a altura é a posição no ranking.
   rows = [{ name, label, ranks:[posição|null por mês], values:[volume por mês], focus }]. Passar o mouse destaca a marca; clicar filtra o painel. */
export function Bump({ months, rows, maxRank, onPick, picked, label, measure = 'Emplacamentos' }) {
  const [hov, setHov] = useState(null), tip = useTip();
  const n = months.length, W = 1000, rowH = 30, pad = { l: 128, r: 128, t: 34, b: 12 }, H = pad.t + pad.b + (maxRank - 1) * rowH + 18;
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = r => pad.t + (r - 1) * rowH;
  const path = ranks => {
    let d = '', prev = null;
    ranks.forEach((r, i) => {
      if (r == null) { prev = null; return; }
      const x = X(i), y = Y(r);
      if (prev == null) d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      else { const mx = (prev.x + x) / 2; d += `C${mx.toFixed(1)} ${prev.y.toFixed(1)} ${mx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`; }
      prev = { x, y };
    });
    return d;
  };
  const edge = (r, last) => { const ks = r.ranks.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0); return ks.length ? (last ? ks.at(-1) : ks[0]) : -1; };
  const tickIdx = months.map((m, i) => [i, m]).filter(([i, m]) => (n > 18 ? m.endsWith('-01') || m.endsWith('-07') || i === n - 1 : i % 2 === 0 || i === n - 1));
  const show = (e, r, i) => tip.show(e, <><strong>{r.label}</strong><span>{monthLabel(months[i])}</span><span><b>{r.ranks[i] != null ? r.ranks[i] + 'º lugar' : 'fora do ranking'}</b></span>{r.values[i] != null && <span>{measure}: <b>{fmt(r.values[i])}</b></span>}</>);
  const active = r => hov === r.name || (hov == null && (r.focus || picked === r.name));
  const ordered = [...rows].sort((a, b) => (active(a) ? 1 : 0) - (active(b) ? 1 : 0));
  return (
    <>
      <svg className="nx-chart nxc-bump" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => { setHov(null); tip.hide(); }}>
        <g className="nx-axis">
          {Array.from({ length: maxRank }, (_, k) => k + 1).filter(r => r === 1 || r % 5 === 0 || r === maxRank).map(r => <g key={r}><line x1={pad.l} x2={W - pad.r} y1={Y(r)} y2={Y(r)} /><text x={pad.l - 100} y={Y(r) + 4} style={{ opacity: 0 }}>{r}</text></g>)}
          {tickIdx.map(([i, m]) => <text key={m} x={X(i)} y={14} textAnchor="middle">{n > 18 ? (m.endsWith('-01') ? m.slice(0, 4) : monthLabel(m).slice(0, 3)) : monthLabel(m)}</text>)}
        </g>
        {ordered.map(r => {
          const on = active(r), dim = hov != null && hov !== r.name, color = on ? (r.focus ? 'var(--nx-accent)' : 'var(--nx-ink)') : 'var(--nx-soft)';
          return (
            <g key={r.name} className="nxc-bump-row" style={{ opacity: dim ? .18 : on ? 1 : .55 }}>
              <path d={path(r.ranks)} fill="none" stroke={color} strokeWidth={on ? 4 : 2} strokeLinecap="round" strokeLinejoin="round" />
              {r.ranks.map((v, i) => v != null && (on || i === 0 || i === n - 1) && <circle key={i} cx={X(i)} cy={Y(v)} r={on ? 4.5 : 3} fill={on ? 'var(--nx-card)' : color} stroke={color} strokeWidth={on ? 2.5 : 0} />)}
              {on && r.ranks.map((v, i) => v != null && (i % 6 === 0 || i === n - 1) && <text key={'t' + i} x={X(i)} y={Y(v) - 10} textAnchor="middle" className="nxc-bump-n" fill={color}>{v}º</text>)}
              {edge(r, false) >= 0 && <text className="nxc-bump-l" x={X(edge(r, false)) - 12} y={Y(r.ranks[edge(r, false)]) + 4} textAnchor="end" fill={color}>{r.label}</text>}
              {edge(r, true) >= 0 && <text className="nxc-bump-l" x={X(edge(r, true)) + 12} y={Y(r.ranks[edge(r, true)]) + 4} fill={color}>{r.ranks[edge(r, true)]}º {r.label}</text>}
              <path d={path(r.ranks)} fill="none" stroke="transparent" strokeWidth="16" style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHov(r.name)} onPointerMove={e => { const b = e.currentTarget.ownerSVGElement.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * W; show(e, r, Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / (W - pad.l - pad.r) * (n - 1))))); }}
                onClick={() => onPick?.(r)} />
            </g>
          );
        })}
      </svg>
      {tip.node}
    </>
  );
}
