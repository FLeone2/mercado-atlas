import { useEffect, useMemo, useState } from 'react';
import ufGeometry from '../../market/geo/uf-geometry.json';
import { UF_NAMES, fmt, pct } from '../format.js';

export const REGIOES = {
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
export const regionOf = uf => Object.keys(REGIOES).find(r => REGIOES[r].includes(uf));
export const dec = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));

/* ---------- population (IBGE/SIDRA 6579, estimate 2026), read once ---------- */
const popCache = new Map();
export function usePopulation(base) {
  const [state, set] = useState(() => ({ data: popCache.get(base) ?? null, error: null }));
  useEffect(() => {
    if (popCache.has(base)) { set({ data: popCache.get(base), error: null }); return undefined; }
    let live = true;
    fetch(new URL('geography/catalog-population.json', base), { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw Error('População indisponível'); return r.json(); })
      .then(d => { if (d.schemaVersion !== 'catalog-population-1' || !Array.isArray(d.states)) throw Error('População incompatível'); popCache.set(base, d); if (live) set({ data: d, error: null }); })
      .catch(e => { if (live) set({ data: null, error: e.message }); });
    return () => { live = false; };
  }, [base]);
  return useMemo(() => {
    const d = state.data;
    if (!d) return { ...state, year: null, uf: new Map(), city: new Map() };
    return {
      ...state, year: d.populationYear,
      uf: new Map(d.states.map(s => [s.name, s.population2026])),
      city: new Map(d.municipalities.map(m => [m.code, m.boundaryAttention ? null : m.population])),
    };
  }, [state]);
}

/* ---------- brand leader per UF, from the monthly history by UF (all brands, current period, other filters kept) ---------- */
const sel = v => (v == null || v === '' || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all').map(String));
export function ufBrandTable(data, filters, range) {
  if (!data || !range) return null;
  const dims = data.dimensions, iU = dims.indexOf('uf') + 1, iB = dims.indexOf('marca') + 1, last = data.columns.length - 1;
  if (iU < 1 || iB < 1) return null;
  const a = range.start.slice(0, 7), b = range.end.slice(0, 7);
  const masks = [];
  dims.forEach((d, i) => {
    if (d === 'uf' || d === 'marca') return;
    const w = sel(filters[d]); if (!w.length) return;
    const set = new Set(w), dict = data.dictionaries[d]; masks.push([i + 1, dict.map(x => set.has(x))]);
  });
  const okMonth = data.months.map(m => m.month >= a && m.month <= b);
  const dU = data.dictionaries.uf, dB = data.dictionaries.marca, nB = dB.length;
  const acc = new Float64Array(dU.length * nB);
  for (const row of data.rows) {
    if (!okMonth[row[0]]) continue;
    let ok = true; for (const [c, m] of masks) if (!m[row[c]]) { ok = false; break; }
    if (ok) acc[row[iU] * nB + row[iB]] += row[last];
  }
  const out = new Map();
  dU.forEach((uf, u) => {
    if (!UF_NAMES[uf]) return;
    const list = []; let total = 0;
    for (let k = 0; k < nB; k++) { const n = acc[u * nB + k]; if (n > 0) { list.push({ b: dB[k], n }); total += n; } }
    list.sort((x, y) => y.n - x.n);
    if (total > 0) out.set(uf, { uf, total, list });
  });
  return out;
}

/* ---------- state map: fill intensity follows a value ---------- */
const BOX = ufGeometry.features.map(f => {
  const n = f.path.match(/-?\d+(?:\.\d+)?/g).map(Number); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n.length - 1; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return { uf: f.uf, path: f.path, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
});

/* paint(uf) → { fill?, opacity } ; tip(uf) → JSX ; labels shown for states big enough */
export function UfMap({ paint, selected = [], onPick, tip, hot, label }) {
  return (
    <svg className="nxt-uf" viewBox="0 0 630 565" role="img" aria-label={label} onPointerLeave={tip.hide}>
      {BOX.map(f => {
        const p = paint(f.uf), on = selected.includes(f.uf);
        return <path key={f.uf} d={f.path} className={'nxt-ufp' + (on ? ' on' : '') + (hot && hot !== f.uf ? ' dim' : '')} style={{ fill: p.fill, fillOpacity: p.opacity }} onClick={() => onPick?.(f.uf)} onPointerMove={e => tip.show(e, p.tip)} />;
      })}
      {BOX.filter(f => f.w > 20 && f.h > 17).map(f => <text key={f.uf} className="nxt-uflab" x={f.cx} y={f.cy + 3.5} textAnchor="middle">{f.uf}</text>)}
    </svg>
  );
}

/* ---------- municipal dots: area proportional to registrations, framed on the chosen UFs ---------- */
export function DotMap({ dots, ufs, points, hover, setHover, tip, nameOf, onPick }) {
  const view = useMemo(() => {
    const rows = (points?.rows ?? []).filter(r => !ufs.length || ufs.includes(r[2]));
    if (!rows.length) return { box: [0, 0, 630, 565], span: 630, single: false };
    const xs = rows.map(r => r[3]), ys = rows.map(r => r[4]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(30, x1 - x0), h = Math.max(30, y1 - y0), pad = Math.max(w, h) * .09;
    if (!ufs.length) return { box: [0, 0, 630, 565], span: 630, single: false };
    return { box: [x0 - pad, y0 - pad, w + pad * 2, h + pad * 2], span: Math.max(w, h), single: true };
  }, [points, ufs]);
  const max = dots.length ? Math.max(...dots.map(d => d.v)) : 1;
  const rmax = view.single ? view.span * .07 : 21, rmin = view.single ? view.span * .004 : .7;
  const r = v => rmin + Math.sqrt(v / max) * rmax;
  const outlines = BOX.filter(f => !ufs.length || ufs.includes(f.uf));
  const fs = view.span * (view.single ? .026 : .021), gap = view.span * .008;
  const labelled = (() => {
    const out = [], [bx, , bw] = view.box;
    for (const d of dots.slice(0, 8)) {
      if (out.length >= (view.single ? 4 : 5)) break;
      const w = nameOf(d.raw).length * fs * .6, rr = r(d.v);
      let x = d.x + rr + gap, anchor = 'start';
      if (x + w > bx + bw) { x = d.x - rr - gap; anchor = 'end'; }
      const x0 = anchor === 'start' ? x : x - w, box = [x0, d.y - fs, x0 + w, d.y + fs * .35];
      if (out.some(o => box[0] < o.box[2] && box[2] > o.box[0] && box[1] < o.box[3] && box[3] > o.box[1])) continue;
      out.push({ d, x, anchor, box });
    }
    return out;
  })();
  const key = ufs.join(',') || 'br';
  return (
    <svg className="nxt-dots" viewBox={view.box.map(n => +n.toFixed(1)).join(' ')} role="img" aria-label="Mapa de municípios: cada ponto é um município, com área proporcional aos emplacamentos" onPointerLeave={() => { setHover(null); tip.hide(); }}>
      <g className="nxt-dots-uf">{outlines.map(f => <path key={f.uf} d={f.path} />)}</g>
      <g key={key} className="nxt-dots-g">
        {[...dots].sort((a, b) => a.v - b.v).map(d => (
          <circle key={d.code} className={'nxt-dot' + (hover === d.code ? ' hot' : '')} cx={d.x} cy={d.y} r={r(d.v)}
            onPointerEnter={() => setHover(d.code)} onClick={() => onPick?.(d)}
            onPointerMove={e => tip.show(e, <><strong>{nameOf(d.raw)}</strong><span>{fmt(d.v)} emplacamentos</span>{d.per1000 != null && <span>{dec(d.per1000, 1)} por mil habitantes</span>}</>)} />
        ))}
      </g>
      {labelled.map(({ d, x, anchor }) => <text key={d.code} className="nxt-dot-lab" x={x} y={d.y + fs * .35} textAnchor={anchor} style={{ fontSize: fs }}>{nameOf(d.raw)}</text>)}
    </svg>
  );
}

/* the share of a thing, as a sentence fragment */
export const share = (a, b) => (b > 0 ? pct(a / b, a / b < .1 ? 1 : 0) : '—');
