// One SVG renderer for every spec chart: line, area, stackedArea, bar, stackedBar,
// stackedBar100, horizontalBar, horizontalStackedBar and rangePosition.
// Thin marks, hairline grid, direct value labels on ranked bars, HTML legend.
import { cloneElement, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DataComponent, ChartTooltip } from './cards.jsx';
import { axisFormatter, axisKind, formatNumber, formatPercent } from './format.js';
import { chartModel } from './chart-model.js';

export { chartModel };

export const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];
const HORIZONTAL = new Set(['horizontalBar', 'horizontalStackedBar', 'horizontalStackedBar100', 'rangePosition', 'rankedList']);
const STACKED = new Set(['stackedArea', 'stackedBar', 'stackedBar100', 'horizontalStackedBar', 'horizontalStackedBar100']);

export function barChartSpec({ presentation, category, value, range, format, ...rest } = {}) {
  return presentation === 'rangePosition'
    ? { type: 'rangePosition', x: category, y: value, range, format, ...rest }
    : { type: 'bar', x: category, y: value, format, ...rest };
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current; if (!node) return undefined;
    setWidth(node.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(node);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function niceTicks(min, max, count = 5) {
  if (!(max > min)) { max = min + 1; }
  const span = max - min, step0 = span / count, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag;
  const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step - 1e-9) * step, ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return ticks;
}

function colorFor(spec, key, index, category) {
  const c = spec.colors;
  if (c && typeof c === 'object') {
    if (category != null && spec.keysAreSingle && c[category]) return c[category];
    if (c[key]) return c[key];
  }
  return PALETTE[index % PALETTE.length];
}

export function Chart({ spec = {}, rows = [], height = 280, chartOptions = {}, title }) {
  const box = useRef(null), width = useWidth(box);
  const model = useMemo(() => chartModel(spec, rows), [spec, rows]);
  const [hover, setHover] = useState(null), [menu, setMenu] = useState(null);
  useEffect(() => { setMenu(null); }, [rows]);
  const labels = { ...(spec.legend?.labels ?? {}) };
  const single = model.keys.length === 1;
  const s = { ...spec, keysAreSingle: single };
  const fmt = v => (v == null ? '—' : model.percent ? formatPercent(v, spec.valueDecimals ?? 1) : formatNumber(v, spec.valueDecimals ?? spec.format?.maximumFractionDigits ?? 0));
  const fmtAxis = v => (model.percent ? formatPercent(v, Math.abs(v) < 0.1 && v !== 0 ? 1 : 0) : Math.abs(v) >= 1e6 ? formatNumber(v / 1e6, 1) + ' mi' : Math.abs(v) >= 1e4 ? formatNumber(v / 1e3, 0) + ' mil' : formatNumber(v, spec.valueDecimals ?? 0));
  const legend = !single || spec.legend?.show ? model.keys.map((k, i) => ({ key: k, label: labels[k] ?? k, color: colorFor(s, k, i) })) : [];
  const actions = chartOptions.getMarkActions;

  const tooltip = () => {
    if (!hover) return null;
    const { category, keys } = hover;
    const payload = keys.map(k => ({ dataKey: k, name: k, color: colorFor(s, k, model.keys.indexOf(k), category), value: model.get(category, k)?.value, payload: model.get(category, k)?.row ?? {} })).filter(p => p.value != null || p.payload);
    const kind = axisKind(model.categories.slice(0, 40));
    const label = axisFormatter(kind === 'text' ? 'text' : kind)(category);
    const content = isValidElement(chartOptions.tooltipContent)
      ? cloneElement(chartOptions.tooltipContent, { active: true, payload, label: category })
      : <ChartTooltip active label={kind === 'month' ? label.replace(/\/(\d\d)$/, '/20$1') : label}
          details={payload.filter(p => p.value != null).map(p => ({ color: p.color, label: labels[p.dataKey] ?? (single ? (labels[spec.y] ?? 'Valor') : p.dataKey), value: fmt(p.value) + (model.type.endsWith('100') && model.get(category, p.dataKey)?.raw != null ? ' · ' + formatNumber(model.get(category, p.dataKey).raw) : '') }))} />;
    const left = Math.min(Math.max(hover.x + 14, 0), Math.max(0, width - 220));
    return <div className="ax-tooltip-host" style={{ left, top: Math.max(0, hover.y - 12) }}>{content}</div>;
  };
  const openMenu = (event, category, key) => {
    if (!actions) return;
    const row = model.get(category, key)?.row; if (!row) return;
    const list = actions({ row, category, series: key }) ?? [];
    if (!list.length) return;
    const rect = box.current.getBoundingClientRect();
    setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, list });
  };

  let body = null;
  if (width > 0 && model.categories.length) {
    body = HORIZONTAL.has(model.type)
      ? <HorizontalBars model={model} spec={s} width={width} height={height} fmt={fmt} fmtAxis={fmtAxis} setHover={setHover} onMark={openMenu} clickable={!!actions} />
      : <Cartesian model={model} spec={s} width={width} height={height} fmtAxis={fmtAxis} hover={hover} setHover={setHover} onMark={openMenu} clickable={!!actions} />;
  }
  return (
    <div className="ax-chart" ref={box} onPointerLeave={() => setHover(null)}>
      {legend.length > 0 && <div className="ax-legend" data-export-legend>{legend.map(l => <span key={l.key}><i style={{ background: l.color }} />{l.label}</span>)}</div>}
      {model.categories.length ? body : <p className="ax-chart-empty" style={{ minHeight: Math.min(height, 160) }}>Sem dados para este recorte.</p>}
      {tooltip()}
      {menu && (
        <div className="ax-popover ax-menu ax-mark-menu" role="menu" style={{ left: Math.min(menu.x, width - 200), top: menu.y + 8 }}>
          {menu.list.map((a, i) => <button key={i} type="button" role="menuitem" onClick={() => { setMenu(null); a.onSelect?.(); }}>{a.label}</button>)}
          <button type="button" role="menuitem" className="ax-menu-dismiss" onClick={() => setMenu(null)}>Fechar</button>
        </div>
      )}
      {title && <span className="visually-hidden">{title}</span>}
    </div>
  );
}

function Cartesian({ model, spec, width, height, fmtAxis, hover, setHover, onMark, clickable }) {
  const { categories, keys, get, type } = model;
  const stacked = STACKED.has(type) && spec.stackable !== false || type.endsWith('100');
  const isBar = type === 'bar' || type === 'stackedBar' || type === 'stackedBar100';
  const stacks = new Map();
  let min = 0, max = 0;
  for (const c of categories) {
    let pos = 0, neg = 0;
    for (const k of keys) {
      const v = get(c, k)?.value; if (v == null) continue;
      if (stacked) { const base = v >= 0 ? pos : neg; stacks.set(c + '\u0000' + k, [base, base + v]); if (v >= 0) pos += v; else neg += v; max = Math.max(max, pos); min = Math.min(min, neg); }
      else { max = Math.max(max, v); min = Math.min(min, v); }
    }
  }
  if (type.endsWith('100')) max = Math.max(max, 1);
  const ticks = niceTicks(min, max * (stacked ? 1 : 1.04));
  const lo = ticks[0], hi = ticks.at(-1);
  const labelW = Math.max(...ticks.map(t => fmtAxis(t).length)) * 6.6 + 10;
  const m = { l: Math.min(90, labelW), r: 12, t: 10, b: 28 };
  const W = width, H = height, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const n = categories.length, band = pw / Math.max(1, n);
  const xc = i => m.l + (isBar ? (i + 0.5) * band : n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = v => m.t + ph * (1 - (v - lo) / (hi - lo || 1));
  const kind = axisKind(categories.slice(0, 40)), fx = axisFormatter(kind);
  const every = Math.max(1, Math.ceil((Math.max(...categories.slice(0, 60).map(c => fx(c).length)) * 6.5 + 14) / Math.max(1, isBar ? band : pw / Math.max(1, n - 1))));
  const marks = [];
  if (isBar) {
    const groupW = band * (n > 40 ? 0.9 : 0.68), bw = stacked || keys.length === 1 ? groupW : groupW / keys.length;
    categories.forEach((c, i) => keys.forEach((k, j) => {
      const item = get(c, k); if (item?.value == null) return;
      const [a, b] = stacked ? stacks.get(c + '\u0000' + k) : [0, item.value];
      const x0 = xc(i) - groupW / 2 + (stacked || keys.length === 1 ? 0 : j * bw);
      const top = y(Math.max(a, b)), h = Math.max(item.value === 0 ? 0 : 1, Math.abs(y(a) - y(b)));
      marks.push(<rect key={i + '-' + j} x={x0 + (n > 40 ? 0 : 0.5)} y={top} width={Math.max(1, bw - (n > 40 ? 0 : 1))} height={h}
        style={{ fill: colorFor(spec, k, j, c) }} className={clickable ? 'ax-mark ax-clickable' : 'ax-mark'}
        onPointerEnter={() => setHover({ category: c, keys: stacked || keys.length > 1 ? keys : [k], x: xc(i), y: top })}
        onClick={e => onMark(e, c, k)} />);
    }));
  } else {
    const area = type === 'area' || type === 'stackedArea';
    keys.forEach((k, j) => {
      const color = colorFor(spec, k, j);
      const pts = categories.map((c, i) => { const v = get(c, k)?.value; if (v == null) return null; const [a, b] = stacked ? stacks.get(c + '\u0000' + k) : [lo < 0 && area ? 0 : Math.max(lo, 0), v]; return [xc(i), y(b), y(a)]; });
      const segs = []; let cur = [];
      pts.forEach(p => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
      if (cur.length) segs.push(cur);
      segs.forEach((seg, si) => {
        const line = seg.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
        if (area) marks.push(<path key={'a' + j + '-' + si} d={line + seg.slice().reverse().map(p => 'L' + p[0].toFixed(1) + ',' + p[2].toFixed(1)).join('') + 'Z'} style={{ fill: color }} fillOpacity={stacked ? 0.78 : 0.16} />);
        marks.push(<path key={'l' + j + '-' + si} d={line} fill="none" style={{ stroke: color }} strokeWidth={keys.length > 6 ? 1.4 : 2} strokeLinejoin="round" strokeLinecap="round" />);
        if (seg.length === 1) marks.push(<circle key={'d' + j + '-' + si} cx={seg[0][0]} cy={seg[0][1]} r={3} style={{ fill: color }} />);
      });
    });
  }
  const onMove = e => {
    if (isBar) return;
    const rect = e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left;
    const i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((px - m.l) / pw) * (n - 1))));
    setHover({ category: categories[i], keys, x: xc(i), y: e.clientY - rect.top, index: i });
  };
  const hi_ = hover && !isBar && hover.index != null ? hover : null;
  return (
    <svg className="ax-chart-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" onPointerMove={onMove}
      onClick={!isBar && clickable ? e => { const rect = e.currentTarget.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left - m.l) / pw) * (n - 1)))); onMark(e, categories[i], keys[0]); } : undefined}
>
      {ticks.map(t => <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'ax-zero' : 'ax-grid'} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="ax-tick">{fmtAxis(t)}</text></g>)}
      {categories.map((c, i) => (i % every === 0 || (i === n - 1 && n - 1 - Math.floor((n - 1) / every) * every > every / 2)) && <text key={'x' + i} x={xc(i)} y={H - 8} textAnchor="middle" className="ax-tick">{fx(c)}</text>)}
      {marks}
      {hi_ && <g className="ax-crosshair" pointerEvents="none">
        <line x1={xc(hi_.index)} x2={xc(hi_.index)} y1={m.t} y2={H - m.b} />
        {keys.map((k, j) => { const v = get(hi_.category, k)?.value; if (v == null) return null; const top = stacked ? stacks.get(hi_.category + '\u0000' + k)?.[1] : v; return <circle key={k} cx={xc(hi_.index)} cy={y(top)} r={3.5} style={{ fill: colorFor(spec, k, j) }} />; })}
      </g>}
    </svg>
  );
}

function HorizontalBars({ model, spec, width, height, fmt, fmtAxis, setHover, onMark, clickable }) {
  const { categories, keys, get, type } = model;
  const stacked = type.startsWith('horizontalStacked');
  const range = type === 'rangePosition' ? spec.range ?? [] : null;
  const longest = Math.max(...categories.map(c => String(c).length));
  const labelW = Math.min(Math.max(70, longest * 6.8 + 14), width * 0.42);
  const valueW = keys.length === 1 || stacked ? 64 : 12;
  const m = { l: labelW, r: valueW, t: 6, b: 24 };
  const rowH = Math.max(14, (height - m.t - m.b) / Math.max(1, categories.length));
  const H = Math.max(height, m.t + m.b + rowH * categories.length);
  let min = 0, max = 0;
  for (const c of categories) {
    if (range) { const r = get(c, keys[0])?.row ?? {}; for (const v of [r[range[0]], r[range[1]], get(c, keys[0])?.value]) if (Number.isFinite(+v)) { max = Math.max(max, +v); min = Math.min(min, +v); } continue; }
    let pos = 0, neg = 0;
    for (const k of keys) { const v = get(c, k)?.value; if (v == null) continue; if (stacked) { if (v >= 0) pos += v; else neg += v; } else { pos = Math.max(pos, v); neg = Math.min(neg, v); } }
    max = Math.max(max, pos); min = Math.min(min, neg);
  }
  const ticks = niceTicks(min, max, Math.max(2, Math.min(5, Math.floor((width - labelW) / 90))));
  const lo = ticks[0], hi = ticks.at(-1), pw = width - m.l - m.r;
  const x = v => m.l + ((v - lo) / (hi - lo || 1)) * pw;
  const bar = Math.min(22, rowH * (keys.length > 1 && !stacked ? 0.8 : 0.62));
  const out = [];
  categories.forEach((c, i) => {
    const cy = m.t + (i + 0.5) * rowH;
    out.push(<text key={'l' + i} x={m.l - 10} y={cy + 4} textAnchor="end" className="ax-bar-label">{truncate(String(c), Math.floor((labelW - 14) / 6.6))}<title>{String(c)}</title></text>);
    if (range) {
      const item = get(c, keys[0]), r = item?.row ?? {};
      const a = +r[range[0]], b = +r[range[1]];
      if (Number.isFinite(a) && Number.isFinite(b)) out.push(<line key={'r' + i} x1={x(a)} x2={x(b)} y1={cy} y2={cy} className="ax-range" />);
      if (item?.value != null) out.push(<circle key={'p' + i} cx={x(item.value)} cy={cy} r={4.5} style={{ fill: colorFor(spec, keys[0], 0, c) }}
        onPointerEnter={() => setHover({ category: c, keys, x: x(item.value), y: cy })} />);
      return;
    }
    let pos = 0, neg = 0;
    keys.forEach((k, j) => {
      const v = get(c, k)?.value; if (v == null) return;
      let a = 0, b = v;
      if (stacked) { const base = v >= 0 ? pos : neg; a = base; b = base + v; if (v >= 0) pos += v; else neg += v; }
      const y0 = stacked || keys.length === 1 ? cy - bar / 2 : cy - bar / 2 + (j * bar) / keys.length;
      const h = stacked || keys.length === 1 ? bar : bar / keys.length - 1;
      out.push(<rect key={i + '-' + j} x={Math.min(x(a), x(b))} y={y0} width={Math.max(v === 0 ? 0 : 1.5, Math.abs(x(b) - x(a)))} height={Math.max(1, h)}
        style={{ fill: colorFor(spec, k, j, c) }} className={clickable ? 'ax-mark ax-clickable' : 'ax-mark'}
        onPointerEnter={() => setHover({ category: c, keys: stacked || keys.length > 1 ? keys : [k], x: Math.max(x(a), x(b)), y: y0 })}
        onClick={e => onMark(e, c, k)} />);
    });
    if (keys.length === 1 || stacked) {
      const total = stacked ? pos + neg : get(c, keys[0])?.value;
      if (total != null && rowH >= 13) out.push(<text key={'v' + i} x={x(Math.max(0, stacked ? pos : total)) + 6} y={cy + 4} className="ax-bar-value">{fmt(total)}</text>);
    }
  });
  return (
    <svg className="ax-chart-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img">
      {ticks.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} className={t === 0 ? 'ax-zero' : 'ax-grid'} /><text x={x(t)} y={H - 6} textAnchor="middle" className="ax-tick">{fmtAxis(t)}</text></g>)}
      {out}
    </svg>
  );
}
const truncate = (s, n) => (s.length > n && n > 3 ? s.slice(0, n - 1) + '…' : s);

export function EvidenceChart({ id, title, rows = [], sourceRows, spec, height = 260, description, headerControls, chartOptions, className, variant, children }) {
  return (
    <DataComponent id={id} title={title} kind="chart" className={className} variant={variant} sourceRows={sourceRows ?? rows} description={description} headerControls={headerControls}>
      <Chart spec={spec} rows={rows} height={height} chartOptions={chartOptions} title={title} />
      {children}
    </DataComponent>
  );
}
export const ChartRenderer = Chart;
