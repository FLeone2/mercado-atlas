import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTip } from '../charts.jsx';
import { fmt, monthLabel, pct } from '../format.js';

/* Ranking em barras. As linhas têm chave estável: quando a medida muda, as barras deslizam para o novo tamanho
   e as linhas que mudam de posição deslizam até o novo lugar (FLIP). */
export function BarRows({ rows, selected, onPick, tone, max: top, colors }) {
  const isSel = r => (Array.isArray(selected) ? selected.includes(r.name) : selected === r.name);
  const refs = useRef(new Map()), tops = useRef(new Map());
  useLayoutEffect(() => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map();
    refs.current.forEach((el, k) => { if (el) next.set(k, el.offsetTop); });
    if (!calm) next.forEach((top, k) => {
      const was = tops.current.get(k), el = refs.current.get(k);
      if (was == null || was === top || !el) return;
      el.style.transition = 'none'; el.style.transform = `translateY(${was - top}px)`; void el.offsetHeight;
      el.style.transition = 'transform .6s cubic-bezier(.23,1,.32,1), background .15s'; el.style.transform = '';
    });
    tops.current = next;
  });
  const max = Math.max(1e-9, top ?? 0, ...(top ? [] : rows.map(r => Math.abs(r.bar))));
  return (
    <div className="nxx-rows" role="list">
      {rows.map((r, i) => (
        <button key={r.name} role="listitem" ref={el => { if (el) refs.current.set(r.name, el); else refs.current.delete(r.name); }} type="button" aria-pressed={isSel(r)}
          className={'nxx-row' + (isSel(r) ? ' on' : '') + (r.bar < 0 ? ' neg' : '')} onClick={() => onPick(r)} title={r.title}>
          <span className="nxx-name"><i>{r.rank}</i><span>{r.label}</span></span>
          <span className="nxx-track"><span className="nxx-fill" data-tone={tone} style={{ ...(colors?.[r.name] ? { background: colors[r.name] } : {}), transform: `scaleX(${Math.max(.004, Math.abs(r.bar) / max)})`, animationDelay: Math.min(i, 12) * 35 + 'ms' }} /></span>
          <span className={'nxx-val ' + (r.valueTone ?? '')}>{r.value}</span>
          <span className={'nxx-sub ' + (r.subTone ?? '')}>{r.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* Série mensal de um item, 2016 em diante. */
export function MonthLine({ points, label }) {
  const W = 400, H = 240, pad = { l: 48, r: 8, t: 12, b: 26 }, ref = useRef(null), tip = useTip(), [hover, setHover] = useState(null);
  const n = points.length, max = Math.max(1, ...points.map(p => p.value)) * 1.1;
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = useMemo(() => points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1)).join(''), [points]);
  const area = line + `L${X(n - 1).toFixed(1)} ${Y(0)}L${X(0).toFixed(1)} ${Y(0)}Z`;
  const years = points.map((p, i) => [p, i]).filter(([p]) => p.month.endsWith('-01') || (p.month === points[0].month));
  const every = years.length > 5 ? 2 : 1;
  const move = e => {
    const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / (W - pad.l - pad.r) * (n - 1))));
    setHover(i); tip.show(e, <><strong>{monthLabel(points[i].month)}</strong><span>{label} <b>{fmt(points[i].value)}</b></span></>);
  };
  return (
    <>
      <svg ref={ref} className="nx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Emplacamentos mensais de ' + label} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g className="nx-axis">
          {[0, .5, 1].map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(max * t / 1.1)} y2={Y(max * t / 1.1)} /><text x={0} y={Y(max * t / 1.1) + 4}>{fmt(max * t / 1.1)}</text></g>)}
          {years.filter((_, k) => k % every === 0).map(([p, i]) => <text key={p.month} x={X(i)} y={H - 8} textAnchor="middle">{p.month.slice(0, 4)}</text>)}
        </g>
        <path className="nx-area" d={area} fill="var(--nx-accent)" fillOpacity=".09" style={{ animationDelay: '500ms' }} />
        <path className="nx-line" d={line} stroke="var(--nx-accent)" strokeWidth="2.2" />
        {hover != null && <><line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} /><circle cx={X(hover)} cy={Y(points[hover].value)} r="5.5" fill="var(--nx-card)" stroke="var(--nx-accent)" strokeWidth="2.5" /></>}
      </svg>
      {tip.node}
    </>
  );
}

/* Quanto do total cabe nos primeiros itens. A escala horizontal é logarítmica: o começo da lista é onde tudo acontece. */
export function Pareto({ items, label }) {
  const W = 620, H = 320, pad = { l: 46, r: 20, t: 16, b: 34 }, ref = useRef(null), tip = useTip(), [hover, setHover] = useState(null);
  const n = items.length, lg = Math.log(Math.max(2, n));
  const X = k => pad.l + (Math.log(k) / lg) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v) * (H - pad.t - pad.b);
  const d = items.map((it, i) => (i ? 'L' : 'M') + X(i + 1).toFixed(1) + ' ' + Y(it.cum).toFixed(1)).join('');
  const ticks = [1, 5, 10, 50, 100, 500, 1000, 5000].filter(t => t < n).concat(n);
  const marks = [.5, .8].map(t => { const i = items.findIndex(it => it.cum >= t - 1e-9); return i < 0 ? null : { t, k: i + 1 }; }).filter(Boolean);
  const move = e => {
    const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const k = Math.max(1, Math.min(n, Math.round(Math.exp((x - pad.l) / (W - pad.l - pad.r) * lg))));
    setHover(k); tip.show(e, <><strong>Os {k} maiores</strong><span>somam <b>{pct(items[k - 1].cum, 1)}</b></span><span>último: {items[k - 1].label}</span></>);
  };
  return (
    <>
      <svg ref={ref} className="nx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Concentração acumulada por ' + label} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g className="nx-axis">
          {[0, .25, .5, .75, 1].map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{Math.round(t * 100)}%</text></g>)}
          {ticks.map(t => <text key={t} x={X(t)} y={H - 8} textAnchor={t === n && n > 1 ? 'end' : 'middle'}>{t === 1 ? '1º' : fmt(t) + (t === n ? ' (todos)' : '')}</text>)}
        </g>
        <path className="nx-area" d={d + `L${X(n)} ${Y(0)}L${X(1)} ${Y(0)}Z`} fill="var(--nx-accent)" fillOpacity=".08" style={{ animationDelay: '500ms' }} />
        <path className="nx-line" d={d} stroke="var(--nx-accent)" strokeWidth="3.5" />
        {marks.map(m => <g key={m.t}><line x1={pad.l} x2={X(m.k)} y1={Y(m.t)} y2={Y(m.t)} stroke="var(--nx-ink)" strokeDasharray="3 4" opacity=".4" /><line x1={X(m.k)} x2={X(m.k)} y1={Y(m.t)} y2={Y(0)} stroke="var(--nx-ink)" strokeDasharray="3 4" opacity=".4" /><circle cx={X(m.k)} cy={Y(m.t)} r="6" fill="var(--nx-ink)" /><text className="nxx-mark" x={X(m.k) + 12} y={Y(m.t) + 22}>{Math.round(m.t * 100)}% em {fmt(m.k)}</text></g>)}
        {hover != null && <><line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} /><circle cx={X(hover)} cy={Y(items[hover - 1].cum)} r="5.5" fill="var(--nx-card)" stroke="var(--nx-accent)" strokeWidth="2.5" /></>}
      </svg>
      {tip.node}
    </>
  );
}

/* Várias séries mensais lado a lado (comparação). series: [{name,label,color,points:[{month,value}]}] */
export function MultiLine({ series, share }) {
  const W = 400, H = 240, pad = { l: 48, r: 8, t: 12, b: 26 }, ref = useRef(null), tip = useTip(), [hover, setHover] = useState(null);
  const pts = series[0]?.points ?? [], n = pts.length;
  const max = Math.max(share ? .01 : 1, ...series.flatMap(s => s.points.map(p => p.value))) * 1.1;
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const f = v => (share ? pct(v, v < .1 ? 1 : 0) : fmt(v));
  const years = pts.map((p, i) => [p, i]).filter(([p, i]) => p.month.endsWith('-01') || i === 0), every = years.length > 5 ? 2 : 1;
  const move = e => {
    const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / (W - pad.l - pad.r) * (n - 1))));
    setHover(i); tip.show(e, <><strong>{monthLabel(pts[i].month)}</strong>{[...series].sort((a, b) => b.points[i].value - a.points[i].value).map(s => <span key={s.name}><i style={{ background: s.color }} />{s.label} <b>{f(s.points[i].value)}</b></span>)}</>);
  };
  if (n < 2) return <p className="nx-note">Poucos meses completos para desenhar a série.</p>;
  return (
    <>
      <svg ref={ref} className="nx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Séries mensais comparadas" onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g className="nx-axis">
          {[0, .5, 1].map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(max * t / 1.1)} y2={Y(max * t / 1.1)} /><text x={0} y={Y(max * t / 1.1) + 4}>{f(max * t / 1.1)}</text></g>)}
          {years.filter((_, k) => k % every === 0).map(([p, i]) => <text key={p.month} x={X(i)} y={H - 8} textAnchor="middle">{p.month.slice(0, 4)}</text>)}
        </g>
        {series.map(s => <path key={s.name} className="nx-line" d={s.points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1)).join('')} stroke={s.color} strokeWidth="2.2" fill="none" />)}
        {hover != null && <><line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />{series.map(s => <circle key={s.name} cx={X(hover)} cy={Y(s.points[hover].value)} r="4.5" fill="var(--nx-card)" stroke={s.color} strokeWidth="2.5" />)}</>}
      </svg>
      {tip.node}
    </>
  );
}
