import { useMemo, useRef, useState } from 'react';
import { useWidth } from '../next/areas/economia-charts.jsx';
import { engine } from 'virtual:market';
import { useTip } from '../next/charts.jsx';
import { fmt, pct, pp, signed, monthLabel } from './lib.js';

const niceStep = raw => { const mag = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag; return 10 * mag; };
export const niceMax = (v, ticks = 4) => { if (!(v > 0)) return { max: 1, step: .25 }; const step = niceStep(v / ticks); return { max: Math.ceil(v / step) * step, step }; };
const compact = n => (n >= 1e6 ? (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : n >= 1e3 ? (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : fmt(n));
export { compact };

/* ============ Ranking conectado (A × B) ============
   Duas colunas de posições ligadas por curvas. As linhas são as marcas (ou modelos) do topo em qualquer
   um dos dois períodos, mais a marca em foco; a posição escrita é a real. Verde subiu, âmbar caiu,
   vermelho é a marca em foco. Passar o mouse destaca; clicar fixa o destaque. */
export function Slope({ a, b, focus, measure = 'volume', topN = 15, labelA, labelB, totalA, totalB }) {
  const [hov, setHov] = useState(null), [lock, setLock] = useState(null), tip = useTip();
  const d = useMemo(() => {
    const rank = rows => new Map([...rows].filter(r => r.count > 0).sort((x, y) => y.count - x.count).map((r, i) => [r.name, { ...r, rank: i + 1 }]));
    const A = rank(a), B = rank(b), keep = new Set(), isFocus = n => (focus instanceof Set ? focus.has(n) : n === focus);
    for (const [n, r] of A) if (r.rank <= topN) keep.add(n);
    for (const [n, r] of B) if (r.rank <= topN) keep.add(n);
    for (const n of new Set([...A.keys(), ...B.keys()])) if (isFocus(n) && ((B.get(n)?.count ?? 0) + (A.get(n)?.count ?? 0)) > 0) keep.add(n);
    const names = [...keep];
    const order = side => [...names].sort((x, y) => (side.get(x)?.rank ?? 1e9) - (side.get(y)?.rank ?? 1e9));
    const left = order(A), right = order(B);
    const rows = names.map(n => {
      const ra = A.get(n), rb = B.get(n), move = ra && rb ? ra.rank - rb.rank : null;
      return { name: n, label: (rb ?? ra).label, a: ra, b: rb, ia: ra ? left.indexOf(n) : null, ib: rb ? right.indexOf(n) : null, move, focus: isFocus(n) };
    });
    return { rows, n: names.length };
  }, [a, b, focus, topN]);
  const [ref, w] = useWidth(), W = Math.max(300, w || 1000), narrow = W < 720;
  const rowH = narrow ? 28 : 30, top = 52, H = top + d.n * rowH + 6, xa = Math.round(W * (narrow ? .43 : .34)), xb = Math.round(W * (narrow ? .57 : .66));
  const y = i => top + i * rowH + rowH / 2;
  const val = (r, total) => (measure === 'share' ? pct(total > 0 ? r.count / total : 0, 1) : fmt(r.count));
  const delta = r => {
    if (!r.a || !r.b) return r.b ? 'novo' : '';
    if (measure === 'share') return pp(r.b.count / totalB - r.a.count / totalA, 1);
    return signed(r.b.count / r.a.count - 1, 0);
  };
  const on = r => (lock ?? hov) === r.name, anyOn = (lock ?? hov) != null;
  const color = r => (r.focus ? 'var(--nx-accent)' : r.move > 0 ? 'var(--nx-up)' : r.move < 0 ? 'var(--nx-down)' : 'var(--nx-soft)');
  const show = (e, r) => tip.show(e, <><strong>{r.label}</strong>{r.a && <span>{labelA}: <b>{r.a.rank}º · {val(r.a, totalA)}</b></span>}{r.b && <span>{labelB}: <b>{r.b.rank}º · {val(r.b, totalB)}</b></span>}{r.move ? <span>{r.move > 0 ? 'Subiu ' + r.move : 'Caiu ' + -r.move} {Math.abs(r.move) === 1 ? 'posição' : 'posições'}</span> : null}</>);
  const ordered = [...d.rows].sort((p, q) => (on(p) || p.focus ? 1 : 0) - (on(q) || q.focus ? 1 : 0));
  return (
    <div ref={ref} className="px-chartbox">
      <svg className="px-ch px-slope" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ranking conectado: ${labelA} contra ${labelB}`} onPointerLeave={() => { setHov(null); tip.hide(); }}>
        <text className="px-slope-h" x={0} y={18}>{labelA}</text><text className="px-slope-h" x={W} y={18} textAnchor="end">{labelB}</text>
        <text className="px-slope-s" x={0} y={36}>{fmt(totalA)}{narrow ? '' : ' emplacamentos'}</text><text className="px-slope-s" x={W} y={36} textAnchor="end">{fmt(totalB)}{narrow ? '' : ' emplacamentos'}</text>
        {d.rows.map(r => r.ia != null && r.ia % 2 === 0 && <rect key={'z' + r.name} className="px-slope-zebra" x={0} width={W} y={top + r.ia * rowH} height={rowH} rx="8" />)}
        {ordered.map(r => {
          const lit = on(r) || (!anyOn && r.focus), dim = anyOn && !on(r), c = color(r);
          const path = r.ia != null && r.ib != null ? `M${xa} ${y(r.ia)} C${(xa + xb) / 2} ${y(r.ia)} ${(xa + xb) / 2} ${y(r.ib)} ${xb} ${y(r.ib)}` : null;
          return (
            <g key={r.name} className="px-slope-row" style={{ opacity: dim ? .16 : 1 }} onPointerEnter={() => setHov(r.name)} onPointerMove={e => show(e, r)} onClick={() => setLock(l => (l === r.name ? null : r.name))}>
              {path && <path d={path} fill="none" stroke={c} strokeWidth={lit ? 4 : r.move ? 2 : 1.4} strokeOpacity={lit ? 1 : r.move ? .55 : .35} className="px-slope-line" />}
              {r.ia != null && <g className={'px-slope-l' + (lit ? ' lit' : '') + (r.focus ? ' focus' : '')}>
                <text x={8} y={y(r.ia) + 5} className="px-slope-rank">{r.a.rank}º</text>
                <text x={narrow ? 36 : 52} y={y(r.ia) + 5} className="px-slope-name">{narrow && r.label.length > 11 ? r.label.slice(0, 10) + '…' : r.label}</text>
                {!narrow && <text x={xa - 14} y={y(r.ia) + 5} textAnchor="end" className="px-slope-val">{val(r.a, totalA)}</text>}
                <circle cx={xa} cy={y(r.ia)} r={lit ? 5 : 3.5} fill={c} />
              </g>}
              {r.ib != null && <g className={'px-slope-r' + (lit ? ' lit' : '') + (r.focus ? ' focus' : '')}>
                <circle cx={xb} cy={y(r.ib)} r={lit ? 5 : 3.5} fill={c} />
                <text x={xb + 12} y={y(r.ib) + 5} className="px-slope-rank">{r.b.rank}º</text>
                <text x={xb + (narrow ? 44 : 58)} y={y(r.ib) + 5} className="px-slope-name">{narrow && r.label.length > 11 ? r.label.slice(0, 10) + '…' : r.label}</text>
                {!narrow && <text x={W - 92} y={y(r.ib) + 5} textAnchor="end" className="px-slope-val">{val(r.b, totalB)}</text>}
                {!narrow && <text x={W - 6} y={y(r.ib) + 5} textAnchor="end" className={'px-slope-d ' + (r.move > 0 ? 'up' : r.move < 0 ? 'down' : '')}>{delta(r)}</text>}
              </g>}
              <rect x={0} width={W} y={top + (r.ib ?? r.ia) * rowH} height={rowH} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

/* ============ Ritmo diário ============
   Barras por dia; fins de semana e feriados em cinza claro (cartórios fechados), linha da média por dia útil. */
export function DailyBars({ days, focusDays }) {
  const tip = useTip(), ref = useRef(null);
  const hol = useMemo(() => { const ys = new Set(days.map(d => +d.date.slice(0, 4))); const s = new Set(); ys.forEach(yv => engine.historyHolidays(yv).forEach(x => s.add(x))); return s; }, [days]);
  const work = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w !== 0 && w !== 6 && !hol.has(d); };
  const [box, w] = useWidth(), n = days.length, W = Math.max(280, w || 1000), H = 230, pad = { l: 48, r: 8, t: 14, b: 26 };
  const max = niceMax(Math.max(1, ...days.map(d => d.count ?? 0)), 3);
  const bw = (W - pad.l - pad.r) / Math.max(1, n), X = i => pad.l + i * bw, Y = v => pad.t + (1 - v / max.max) * (H - pad.t - pad.b);
  const wd = days.filter(d => d.count != null && work(d.date)), avg = wd.length ? wd.reduce((s, d) => s + d.count, 0) / wd.length : 0;
  const ticks = []; for (let v = 0; v <= max.max + 1e-9; v += max.step) ticks.push(v);
  const every = Math.max(1, Math.ceil(n / Math.max(4, W / 46)));
  return (
    <div ref={box} className="px-chartbox">
      <svg ref={ref} className="px-ch" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Emplacamentos por dia" onPointerLeave={tip.hide}>
        <g className="nx-axis">{ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{compact(t)}</text></g>)}
          {days.map((d, i) => i % every === 0 && <text key={d.date} x={X(i) + bw / 2} y={H - 6} textAnchor="middle">{+d.date.slice(8, 10)}{n > 31 && d.date.slice(8, 10) === '01' ? '/' + d.date.slice(5, 7) : ''}</text>)}</g>
        {days.map((d, i) => d.count != null && <rect key={d.date} x={X(i) + bw * .14} width={bw * .72} y={Y(d.count)} height={Math.max(0, Y(0) - Y(d.count))} rx={Math.min(4, bw * .2)} className={'px-day' + (work(d.date) ? '' : ' off')}
          onPointerMove={e => tip.show(e, <><strong>{new Date(d.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong><span>Mercado <b>{fmt(d.count)}</b></span>{focusDays?.get(d.date) != null && <span>Marca em foco <b>{fmt(focusDays.get(d.date))}</b></span>}{!work(d.date) && <span>Fim de semana ou feriado</span>}</>)} />)}
        {avg > 0 && <g><line x1={pad.l} x2={W - pad.r} y1={Y(avg)} y2={Y(avg)} className="px-avg" /><text x={pad.l + 6} y={Y(avg) - 6} className="px-avg-t">média por dia útil {fmt(avg)}</text></g>}
      </svg>
      {tip.node}
    </div>
  );
}

/* ============ Sazonalidade: anos × meses, desvio sobre a média mensal do ano ============ */
export function SeasonHeat({ years }) {
  const tip = useTip();
  const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const max = Math.max(.05, ...years.flatMap(y => y.dev.filter(v => v != null).map(Math.abs)));
  const bg = v => (v == null ? 'transparent' : v >= 0 ? `color-mix(in srgb, var(--nx-up) ${Math.round(Math.min(1, v / max) * 70)}%, var(--nx-card))` : `color-mix(in srgb, var(--nx-down) ${Math.round(Math.min(1, -v / max) * 70)}%, var(--nx-card))`);
  return (
    <div className="px-heat" role="table" aria-label="Sazonalidade: cada célula compara o mês com a média mensal do ano">
      <div className="px-heat-row head" role="row"><span role="columnheader" />{M.map(m => <span key={m} role="columnheader">{m}</span>)}</div>
      {years.map(y => (
        <div key={y.year} className={'px-heat-row' + (y.median ? ' med' : '')} role="row">
          <span role="rowheader">{y.year}</span>
          {y.dev.map((v, i) => <span key={i} role="cell" style={{ background: bg(v) }} className={v == null ? 'empty' : ''} onPointerMove={e => v != null && tip.show(e, <><strong>{M[i]}/{y.year}</strong><span>{v >= 0 ? '+' : '−'}{Math.abs(Math.round(v * 100))}% sobre a média mensal do ano</span>{y.vals?.[i] != null && <span>{fmt(y.vals[i])} emplacamentos</span>}</>)} onPointerLeave={tip.hide}>{v == null ? '' : Math.round(v * 100) === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(Math.round(v * 100))}</span>)}
        </div>
      ))}
      {tip.node}
    </div>
  );
}

/* ============ Marca em foco × mercado, categoria a categoria ============ */
export function PairBars({ rows, focusName, max: maxIn }) {
  const max = maxIn ?? Math.max(.01, ...rows.flatMap(r => [r.focus, r.market]));
  return (
    <div className="px-pairs">
      {rows.map((r, i) => (
        <div key={r.name} className="px-pair">
          <span className="px-pair-n">{r.label}</span>
          <span className="px-pair-bars">
            <span className="px-pair-t f"><span style={{ transform: `scaleX(${Math.max(.004, r.focus / max)})`, animationDelay: i * 40 + 'ms' }} /></span>
            <span className="px-pair-t m"><span style={{ transform: `scaleX(${Math.max(.004, r.market / max)})`, animationDelay: i * 40 + 'ms' }} /></span>
          </span>
          <span className="px-pair-v"><b>{pct(r.focus, r.focus < .1 ? 1 : 0)}</b><small>{pct(r.market, r.market < .1 ? 1 : 0)}</small></span>
        </div>
      ))}
      <div className="nx-legend"><span><i style={{ background: 'var(--nx-accent)' }} />{focusName}</span><span><i style={{ background: 'var(--nx-line)' }} />Mercado</span></div>
    </div>
  );
}

/* ============ De onde veio a variação: antes → efeitos → depois ============ */
export function Waterfall({ steps }) {
  const vals = []; let run = 0;
  for (const s of steps) { if (s.kind === 'total') { vals.push([0, s.value]); run = s.value; } else { vals.push([run, run + s.value]); run += s.value; } }
  const max = Math.max(1, ...vals.flat()), min = Math.min(0, ...vals.flat()), span = max - min, X = v => ((v - min) / span) * 100;
  return (
    <div className="px-wf">
      {steps.map((s, i) => {
        const [x0, x1] = vals[i], l = X(Math.min(x0, x1)), w = Math.max(.4, Math.abs(X(x1) - X(x0)));
        return (
          <div key={s.label} className={'px-wf-row ' + s.kind}>
            <span className="px-wf-l">{s.label}<small>{s.note}</small></span>
            <span className="px-wf-t"><span className={'px-wf-b ' + (s.kind === 'total' ? 'tot' : s.value >= 0 ? 'up' : 'down')} style={{ left: l + '%', width: w + '%', animationDelay: i * 90 + 'ms' }} /></span>
            <span className={'px-wf-v ' + (s.kind === 'total' ? '' : s.value >= 0 ? 'up' : 'down')}>{s.kind === 'total' ? fmt(s.value) : (s.value >= 0 ? '+' : '−') + fmt(Math.abs(s.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ============ Dispersão: tamanho do segmento × participação da marca em foco, por UF ============ */
export function Scatter({ rows, xLabel, yLabel, medX, medY }) {
  const tip = useTip(), [box, w] = useWidth(), W = Math.max(280, w || 1000), H = Math.min(440, Math.max(300, W * .55)), pad = { l: 48, r: 20, t: 16, b: 42 };
  const xs = rows.map(r => r.x), ys = rows.map(r => r.y);
  const xmax = Math.sqrt(Math.max(1, ...xs)), ym = niceMax(Math.max(.01, ...ys) * 1.08, 4);
  const X = v => pad.l + Math.sqrt(Math.max(0, v)) / xmax * (W - pad.l - pad.r), Y = v => pad.t + (1 - v / ym.max) * (H - pad.t - pad.b);
  const ticks = []; for (let v = 0; v <= ym.max + 1e-9; v += ym.step) ticks.push(v);
  const xt = [0, .1, .25, .5, 1].map(k => Math.round(k * xmax * xmax / 100) * 100).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div ref={box} className="px-chartbox">
      <svg className="px-ch" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={yLabel + ' por ' + xLabel} onPointerLeave={tip.hide}>
        <g className="nx-axis">
          {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{pct(t, 0)}</text></g>)}
          {xt.map(t => <text key={t} x={X(t)} y={H - 18} textAnchor="middle">{compact(t)}</text>)}
          <text x={(W + pad.l) / 2} y={H - 1} textAnchor="middle">{xLabel} (escala raiz)</text>
        </g>
        {medX != null && <line className="px-med" x1={X(medX)} x2={X(medX)} y1={pad.t} y2={H - pad.b} />}
        {medY != null && <line className="px-med" x1={pad.l} x2={W - pad.r} y1={Y(medY)} y2={Y(medY)} />}
        <text className="px-quad" x={W - pad.r - 6} y={pad.t + 14} textAnchor="end">forte em mercado grande</text>
        <text className="px-quad" x={W - pad.r - 6} y={H - pad.b - 8} textAnchor="end">{W < 520 ? 'oportunidade' : 'oportunidade: mercado grande, presença baixa'}</text>
        {rows.map(r => <g key={r.key} className={'px-dot' + (r.hot ? ' hot' : '')} onPointerMove={e => tip.show(e, r.tip)}>
          <circle cx={X(r.x)} cy={Y(r.y)} r={r.hot ? 8 : 6} />
          <text x={X(r.x) + 10} y={Y(r.y) + 4}>{r.key}</text>
        </g>)}
      </svg>
      {tip.node}
    </div>
  );
}

/* barras de um mês: rótulo curto para o eixo */
export const monthTick = m => monthLabel(m);

/* ============ Linhas no tempo, desenhadas em pixels reais (o texto não encolhe em cartão estreito) ============ */
export function Lines({ months, series, fmtY = fmt, fmtTip, height = 300, endLabels = true, label: aria, yMin, marks, shade, xFmt }) {
  const [box, w] = useWidth(), tip = useTip(), [hover, setHover] = useState(null);
  const W = Math.max(260, w || 600), H = height, n = months.length;
  const longest = endLabels ? Math.max(0, ...series.map(s => String(s.name).length)) : 0;
  const pad = { l: 50, r: endLabels ? Math.min(140, 16 + longest * 7.2) : 12, t: 14, b: 28 };
  const all = series.flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
  const lo = yMin ?? 0, nm = niceMax(Math.max(1e-9, ...all) * 1.05 - lo, 4), yMax = lo + nm.max;
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = v => pad.t + (1 - (v - lo) / (yMax - lo)) * (H - pad.t - pad.b);
  const path = vals => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null || !Number.isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
  const ticks = []; for (let v = lo; v <= yMax + 1e-9; v += nm.step) ticks.push(v);
  const every = Math.max(1, Math.ceil(n / Math.max(3, (W - pad.l - pad.r) / 78)));
  const xt = xFmt ? months.map((m, i) => [i, xFmt(m)]).filter(([i]) => i % every === 0) : n > 40 ? months.map((m, i) => [i, m]).filter(([, m]) => m.endsWith('-01')).filter((_, k, a) => a.length <= (W - 80) / 52 || k % 2 === 0).map(([i, m]) => [i, m.slice(0, 4)])
    : months.map((m, i) => [i, m]).filter(([i]) => (n - 1 - i) % every === 0).map(([i, m]) => [i, monthLabel(m).replace('/20', '/')]);
  const ft = fmtTip ?? fmtY;
  const move = e => { const r = e.currentTarget.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - pad.l) / (W - pad.l - pad.r) * (n - 1)))); setHover(i); tip.show(e, <><strong>{xFmt ? xFmt(months[i]) : monthLabel(months[i])}</strong>{series.filter(s => s.values[i] != null).map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{ft(s.values[i])}</b></span>)}</>); };
  const ends = endLabels ? series.map(s => { let k = s.values.length - 1; while (k >= 0 && s.values[k] == null) k--; return k >= 0 ? { s, y: Y(s.values[k]) } : null; }).filter(Boolean).sort((a, b) => a.y - b.y) : [];
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  return (
    <div ref={box} className="px-chartbox">
      <svg className="px-ch" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        {shade && <rect x={X(shade[0]) - 3} width={Math.max(6, X(shade[1]) - X(shade[0]) + 6)} y={pad.t} height={H - pad.t - pad.b} className="px-shade" />}
        <g className="px-axis">
          {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={pad.l - 8} y={Y(t) + 4} textAnchor="end">{fmtY(t)}</text></g>)}
          {xt.map(([i, l]) => <text key={i} x={X(i)} y={H - 8} textAnchor="middle">{l}</text>)}
        </g>
        {series.map((s, k) => <path key={s.name} className="px-line" d={path(s.values)} stroke={s.color} strokeWidth={s.width ?? 2.5} strokeDasharray={s.dash} style={{ animationDelay: k * 90 + 'ms' }} />)}
        {marks?.map((m, k) => <g key={k} className="px-mark"><circle cx={X(m.i)} cy={Y(m.v)} r="4.5" /><text x={X(m.i)} y={Y(m.v) + (m.down ? 20 : -10)} textAnchor={X(m.i) > W - 120 ? 'end' : X(m.i) < 120 ? 'start' : 'middle'}>{m.text}</text></g>)}
        {hover != null && <line className="px-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />}
        {hover != null && series.map(s => s.values[hover] != null && <circle key={s.name} cx={X(hover)} cy={Y(s.values[hover])} r="4.5" fill="var(--nx-card)" stroke={s.color} strokeWidth="2.5" />)}
        {ends.map(({ s, y }) => <text key={s.name} className="px-endlabel" x={W - pad.r + 8} y={y + 4} fill={s.color}>{s.name}</text>)}
      </svg>
      {tip.node}
    </div>
  );
}
