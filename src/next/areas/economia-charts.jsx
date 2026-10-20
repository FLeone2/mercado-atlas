import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTip } from '../charts.jsx';
import { MONTHS } from '../format.js';

/* Charts of the Economia area. They measure their container and draw in real pixels,
   so labels keep their size on a phone instead of shrinking with a scaled viewBox. */

export function useWidth() {
  const ref = useRef(null), [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el); setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const short = m => MONTHS[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);
const niceStep = (span, n) => { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const ticksFor = (lo, hi, n = 4) => { const s = niceStep(hi - lo, n), out = []; for (let v = Math.ceil(lo / s - 1e-9) * s; v <= hi + s * 1e-6; v += s) out.push(+v.toFixed(10)); return out; };
const pathOf = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
const hoverIndex = (e, el, left, right, n) => { const r = el.getBoundingClientRect(), x = e.clientX - r.left; return Math.max(0, Math.min(n - 1, Math.round((x - left) / Math.max(1, r.width - left - right) * (n - 1)))); };

/* Small trend line for the KPI tiles. */
export function Spark({ values }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), w = 112, h = 38;
  const x = i => 3 + i * (w - 6) / (values.length - 1), y = v => h - 4 - (max === min ? .5 : (v - min) / (max - min)) * (h - 8);
  return (
    <svg className="nxo-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <path d={pathOf(values.map((v, i) => [x(i), y(v)]))} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3.2" />
    </svg>
  );
}

/* Two series on the same index (base 100), with a shared hover. rows: [{month, a, b, rawA, rawB}] */
export function IndexedLines({ rows, a, b, fmtRawA, fmtRawB }) {
  const [ref, w] = useWidth(), tip = useTip(), [hover, setHover] = useState(null), svg = useRef(null);
  const narrow = w < 560, H = narrow ? 280 : 360, pad = { l: 44, r: narrow ? 44 : 56, t: 16, b: 32 };
  const vals = rows.flatMap(r => [r.a, r.b]), lo = Math.floor(Math.min(...vals, 100) / 10) * 10, hi = Math.ceil(Math.max(...vals, 100) / 10) * 10;
  const X = i => pad.l + i * (w - pad.l - pad.r) / Math.max(1, rows.length - 1), Y = v => pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const ticks = ticksFor(lo, hi, 4), step = Math.max(1, Math.round(rows.length / (narrow ? 4 : 8)));
  const move = e => {
    const i = hoverIndex(e, svg.current, pad.l, pad.r, rows.length), r = rows[i]; setHover(i);
    tip.show(e, <><strong>{short(r.month)}</strong><span><i style={{ background: a.color }} />{a.label} <b>{fmtRawA(r.rawA)}</b> · índice {nf(r.a)}</span><span><i style={{ background: b.color }} />{b.label} <b>{fmtRawB(r.rawB)}</b> · índice {nf(r.b)}</span></>);
  };
  const last = rows[rows.length - 1];
  return (
    <>
      <div ref={ref} className="nxo-plot">
        {w > 0 && (
          <svg ref={svg} className="nxo-svg" width={w} height={H} role="img" aria-label={`${a.label} e ${b.label}, índice base 100`} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
            <g className="nx-axis">
              {ticks.map(t => <g key={t}><line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{t}</text></g>)}
              {rows.map((r, i) => (i % step === 0 || i === rows.length - 1) && (rows.length - 1 - i >= step * .6 || i === rows.length - 1) && <text key={r.month} x={X(i)} y={H - 8} textAnchor="middle">{short(r.month)}</text>)}
            </g>
            <line className="nxo-base" x1={pad.l} x2={w - pad.r} y1={Y(100)} y2={Y(100)} />
            <path className="nx-line" d={pathOf(rows.map((r, i) => [X(i), Y(r.b)]))} stroke={b.color} strokeWidth="3" style={{ animationDelay: '120ms' }} fill="none" />
            <path className="nx-line" d={pathOf(rows.map((r, i) => [X(i), Y(r.a)]))} stroke={a.color} strokeWidth="3" fill="none" />
            {hover != null && <line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />}
            {hover != null && [[a, 'a'], [b, 'b']].map(([s, k]) => <circle key={k} cx={X(hover)} cy={Y(rows[hover][k])} r="5" fill="var(--nx-card)" stroke={s.color} strokeWidth="2.5" />)}
            {hover == null && <g className="nxo-endpts">
              {[[a, 'a'], [b, 'b']].map(([s, k]) => <g key={k}><circle cx={X(rows.length - 1)} cy={Y(last[k])} r="4.5" fill={s.color} /><text x={X(rows.length - 1) + 9} y={Y(last[k]) + 4} fill={s.color}>{nf(last[k])}</text></g>)}
            </g>}
          </svg>
        )}
      </div>
      <div className="nx-legend"><span><i style={{ background: a.color }} />{a.label}</span><span><i style={{ background: b.color }} />{b.label}</span></div>
      {tip.node}
    </>
  );
}

/* History (solid), forecast (dashed) and uncertainty bands. hist: [{month, value}], rows: [{month, point, lo80, hi80, lo95, hi95}] */
export function ForecastChart({ hist, rows, fmtV, fmtAxis, label }) {
  const [ref, w] = useWidth(), tip = useTip(), [hover, setHover] = useState(null), svg = useRef(null);
  const narrow = w < 560, H = narrow ? 300 : 380, pad = { l: narrow ? 46 : 54, r: 14, t: 16, b: 32 };
  const all = useMemo(() => [...hist.map(h => ({ month: h.month, value: h.value, obs: true })), ...rows.map(r => ({ ...r, value: r.point, obs: false }))], [hist, rows]);
  const n = all.length, bands = rows.some(r => Number.isFinite(r.lo95));
  const top = Math.max(...all.map(r => (r.obs ? r.value : (r.hi95 ?? r.point)))) * 1.06;
  const X = i => pad.l + i * (w - pad.l - pad.r) / Math.max(1, n - 1), Y = v => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const ticks = ticksFor(0, top, 4), step = Math.max(1, Math.round(n / (narrow ? 4 : 9))), h0 = hist.length - 1;
  const band = (lo, hi) => {
    const ok = rows.map((r, i) => [r, h0 + 1 + i]).filter(([r]) => Number.isFinite(r[lo]) && Number.isFinite(r[hi]));
    if (!ok.length) return '';
    return 'M' + ok.map(([r, i]) => X(i).toFixed(1) + ' ' + Y(r[hi]).toFixed(1)).join('L') + 'L' + [...ok].reverse().map(([r, i]) => X(i).toFixed(1) + ' ' + Y(r[lo]).toFixed(1)).join('L') + 'Z';
  };
  const move = e => {
    const i = hoverIndex(e, svg.current, pad.l, pad.r, n), r = all[i]; setHover(i);
    tip.show(e, <><strong>{short(r.month)}</strong>
      {r.obs ? <span>Observado <b>{fmtV(r.value)}</b></span> : <><span><i style={{ background: 'var(--nx-accent)' }} />Projeção <b>{fmtV(r.point)}</b></span>
        {Number.isFinite(r.lo80) && <span>Faixa de 80%: {fmtV(r.lo80)} a {fmtV(r.hi80)}</span>}
        {Number.isFinite(r.lo95) && <span>Faixa de 95%: {fmtV(r.lo95)} a {fmtV(r.hi95)}</span>}</>}</>);
  };
  return (
    <>
      <div ref={ref} className="nxo-plot">
        {w > 0 && (
          <svg ref={svg} className="nxo-svg" width={w} height={H} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
            <g className="nx-axis">
              {ticks.map(t => <g key={t}><line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{fmtAxis(t)}</text></g>)}
              {all.map((r, i) => i % step === 0 && <text key={r.month} x={X(i)} y={H - 8} textAnchor="middle">{short(r.month)}</text>)}
            </g>
            {bands && <path className="nxo-fade nxo-band95" d={band('lo95', 'hi95')} />}
            {bands && <path className="nxo-fade nxo-band80" d={band('lo80', 'hi80')} />}
            <line className="nxo-today" x1={X(h0) + (X(h0 + 1) - X(h0)) / 2} x2={X(h0) + (X(h0 + 1) - X(h0)) / 2} y1={pad.t} y2={H - pad.b} />
            <text className="nxo-todaylabel" x={X(h0) + (X(h0 + 1) - X(h0)) / 2 + 6} y={pad.t + 10}>projeção →</text>
            <path className="nx-line" d={pathOf(hist.map((r, i) => [X(i), Y(r.value)]))} stroke="var(--nx-ink)" strokeWidth="2.6" fill="none" />
            <path className="nxo-fade nxo-dash" d={pathOf([[X(h0), Y(hist[h0].value)], ...rows.map((r, i) => [X(h0 + 1 + i), Y(r.point)])])} />
            {rows.map((r, i) => <circle key={r.month} className="nxo-fade" cx={X(h0 + 1 + i)} cy={Y(r.point)} r={hover === h0 + 1 + i ? 6 : 3.4} fill="var(--nx-accent)" stroke="var(--nx-card)" strokeWidth="1.5" />)}
            {hover != null && <line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />}
            {hover != null && all[hover].obs && <circle cx={X(hover)} cy={Y(all[hover].value)} r="5" fill="var(--nx-card)" stroke="var(--nx-ink)" strokeWidth="2.5" />}
          </svg>
        )}
      </div>
      <div className="nx-legend">
        <span><i style={{ background: 'var(--nx-ink)' }} />Observado</span>
        <span><i className="nxo-sw-dash" />Projeção</span>
        {bands && <span><i style={{ background: 'var(--nx-accent)', opacity: .3 }} />Faixa de 80%</span>}
        {bands && <span><i style={{ background: 'var(--nx-accent)', opacity: .13 }} />Faixa de 95%</span>}
      </div>
      {tip.node}
    </>
  );
}

/* Correlation by lag, one row per indicator. series: [{key, label, rows:[{lag,r,n}]}] */
export function LagHeat({ series, lags, best }) {
  const tip = useTip();
  return (
    <div className="nxo-heatwrap">
      <table className="nxo-heat" onPointerLeave={tip.hide}>
        <thead><tr><th scope="col"><span className="nxo-sr">Indicador</span></th>{lags.map(l => <th key={l} scope="col">{l}</th>)}</tr></thead>
        <tbody>
          {series.map(s => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              {lags.map(l => {
                const c = s.rows.find(r => r.lag === l), r = c?.r;
                if (!Number.isFinite(r)) return <td key={l} className="nxo-na">·</td>;
                const strong = best && best.key === s.key && best.lag === l;
                return <td key={l} className={strong ? 'best' : ''} style={{ background: `color-mix(in srgb, ${r >= 0 ? 'var(--nx-up)' : 'var(--nx-down)'} ${Math.round(Math.min(1, Math.abs(r)) * 88)}%, transparent)`, color: Math.abs(r) > .55 ? '#fff' : undefined }}
                  onPointerMove={e => tip.show(e, <><strong>{s.label}</strong><span>{l === 0 ? 'No mesmo mês' : `Indicador ${l} ${l === 1 ? 'mês' : 'meses'} antes`}</span><span>Correlação <b>{nf(r, 2)}</b> · {c.n} meses</span></>)}>{nf(r, 2)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {tip.node}
    </div>
  );
}

/* UFs on two axes: GDP per capita (x) and registrations per 1,000 inhabitants (y), with the fitted curve. */
export function UfScatter({ rows, fit, onPick, focus }) {
  const [ref, w] = useWidth(), tip = useTip(), svg = useRef(null);
  const narrow = w < 560, H = narrow ? 340 : 440, pad = { l: 44, r: 16, t: 16, b: 44 };
  const xMax = Math.ceil(Math.max(...rows.map(r => r.gdp)) / 20000) * 20000, yMax = Math.ceil(Math.max(...rows.map(r => r.per)) / 5) * 5;
  const X = v => pad.l + v / xMax * (w - pad.l - pad.r), Y = v => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const curve = useMemo(() => { const pts = []; for (let v = 20000; v <= xMax; v += xMax / 60) pts.push([X(v), Y(Math.exp(fit.a + fit.b * Math.log(v)))]); return pathOf(pts); }, [fit, xMax, w, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelled = new Set(rows.filter(r => r.ratio < .8 || r.ratio > 1.25 || r.uf === focus).map(r => r.uf));
  const tone = r => (r.ratio < .8 ? 'var(--nx-accent)' : r.ratio > 1.25 ? 'var(--nx-ink)' : '#a1a1aa');
  return (
    <>
      <div ref={ref} className="nxo-plot">
        {w > 0 && (
          <svg ref={svg} className="nxo-svg" width={w} height={H} role="img" aria-label="Estados: PIB por habitante e emplacamentos por mil habitantes" onPointerLeave={tip.hide}>
            <g className="nx-axis">
              {ticksFor(0, yMax, 4).map(t => <g key={t}><line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{t}</text></g>)}
              {ticksFor(0, xMax, narrow ? 3 : 5).map(t => <text key={t} x={X(t)} y={H - 22} textAnchor="middle">{t ? nf(t / 1000) + ' mil' : '0'}</text>)}
              <text x={pad.l + (w - pad.l - pad.r) / 2} y={H - 4} textAnchor="middle">PIB por habitante (R$)</text>
            </g>
            <path className="nxo-fade nxo-curve" d={curve} />
            {rows.map((r, i) => (
              <g key={r.uf} className="nxo-dot" style={{ animationDelay: i * 14 + 'ms' }} onClick={() => onPick?.(r)} onPointerMove={e => tip.show(e, <><strong>{r.name}</strong><span>{nf(r.per, 1)} emplacamentos por mil hab.</span><span>PIB por habitante: R$ {nf(r.gdp)}</span><span>{r.ratio >= 1 ? nf((r.ratio - 1) * 100) + '% acima' : nf((1 - r.ratio) * 100) + '% abaixo'} da curva</span></>)}>
                <circle cx={X(r.gdp)} cy={Y(r.per)} r={r.uf === focus ? 9 : 7} fill={tone(r)} stroke={r.uf === focus ? 'var(--nx-ink)' : 'var(--nx-card)'} strokeWidth={r.uf === focus ? 2.5 : 1.5} />
                {labelled.has(r.uf) && <text x={X(r.gdp)} y={Y(r.per) - 11} textAnchor="middle">{r.uf}</text>}
              </g>
            ))}
          </svg>
        )}
      </div>
      <div className="nx-legend">
        <span><i style={{ background: 'var(--nx-accent)' }} />Mais de 20% abaixo da curva</span>
        <span><i style={{ background: '#a1a1aa' }} />Perto da curva</span>
        <span><i style={{ background: 'var(--nx-ink)' }} />Mais de 25% acima</span>
        <span><i className="nxo-sw-line" />Curva ajustada</span>
      </div>
      {tip.node}
    </>
  );
}

/* Observed against expected for municipalities: one centred bar per row. rows: [{key,label,sub,gap,obs,exp,ratio}] */
export function GapRows({ rows }) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.gap)));
  return (
    <div className="nxo-gap" role="list">
      {rows.map((r, i) => (
        <div key={r.key} className="nxo-gap-row" role="listitem">
          <span className="nxo-gap-name">{r.label}<small>{r.sub}</small></span>
          <span className="nxo-gap-track" aria-hidden><span className={'nxo-gap-fill ' + (r.gap < 0 ? 'neg' : 'pos')} style={{ width: Math.abs(r.gap) / max * 50 + '%', [r.gap < 0 ? 'right' : 'left']: '50%', animationDelay: i * 45 + 'ms' }} /></span>
          <span className={'nxo-gap-val ' + (r.gap < 0 ? 'down' : 'up')}>{r.text}<small>{r.detail}</small></span>
        </div>
      ))}
    </div>
  );
}
