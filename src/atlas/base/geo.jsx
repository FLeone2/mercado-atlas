import { useEffect, useMemo, useState } from 'react';
import ufGeometry from '../../market/geo/uf-geometry.json';
import { pct } from './format.js';

export const REGIOES = {
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
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

/* the share of a thing, as a sentence fragment */
export const share = (a, b) => (b > 0 ? pct(a / b, a / b < .1 ? 1 : 0) : '—');
