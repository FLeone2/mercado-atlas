// Atlas · funções de dados que as páginas compartilham: nomes de exibição, filtros de recorte
// × marca em foco, séries do histórico mensal e a decomposição da variação da marca em foco.
import { engine } from 'virtual:market';
import { groupLabel } from '../next/areas/segmentos-charts.jsx';
import { MONTHS, monthEnd, shiftMonth, titleCase } from '../next/format.js';

export { fmt, pct, pp, signed, monthLabel, monthEnd, shiftMonth, rangeText, UF_NAMES, titleCase } from '../next/format.js';
export { groupLabel };

/* ---------- nomes ---------- */
export const brandName = n => (n ? engine.insightName(n) : '');
const FUEL = {
  'Álcool / Gasolina': 'Flex', Gasolina: 'Gasolina', Diesel: 'Diesel', Álcool: 'Etanol', 'GASOLINA/ALCOOL/ELETRICO': 'Híbrido flex', 'GASOLINA/ELETRICO': 'Híbrido a gasolina',
  'Elétrico / Fonte Externa': 'Elétrico', ELETRICO: 'Elétrico', 'Elétrico / Fonte Interna': 'Híbrido', HIBRIDO: 'Híbrido', 'HIBRIDO PLUG-IN': 'Híbrido plug-in', 'DIESEL/ELETRICO': 'Híbrido a diesel',
};
export const label = (dim, name) => {
  if (dim === 'marca') return brandName(name);
  if (dim === 'combustivel') return FUEL[name] ?? (String(name).includes('Gás') ? 'GNV' : titleCase(name));
  if (dim === 'grupo_modelo') return titleCase(name).replace(/\bHb20\b/i, 'HB20').replace(/\bT Cross\b/i, 'T-Cross');
  if (dim === 'municipio') return titleCase(name);
  if (dim === 'tipo_venda') return name === 'VD' ? 'Venda direta' : name === 'VAREJO' ? 'Varejo' : groupLabel(dim, name);
  return groupLabel(dim, name);
};
export const SHORT_MONTH = m => MONTHS[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);

/* ---------- filtros: recorte × marca em foco ----------
   A marca em foco nunca encolhe o mercado: ranking, participação e mapas usam o mercado inteiro do
   recorte e destacam a marca. Tudo o mais (período, território, porte, propulsão, canal, modelo…) recorta. */
export const FOCUS_DEFAULT = 'MITSUBISHI';
export const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
export const active = v => list(v).length > 0;
export const marketFiltersOf = filters => ({ ...filters, marca: 'all' });
export const focusOf = filters => list(filters.marca)[0] ?? FOCUS_DEFAULT;

/* ---------- período ---------- */
export const periodMonths = range => {
  if (!range?.start || !range?.end) return [];
  const out = []; let m = range.start.slice(0, 7); const end = range.end.slice(0, 7);
  while (m <= end && out.length < 200) { out.push(m); m = shiftMonth(m, 1); }
  return out;
};
export const wholeMonths = range => Boolean(range?.start?.endsWith('-01') && range?.end && range.end === monthEnd(range.end.slice(0, 7)));
export const presets = latest => latest ? [
  ['Último mês', latest + '-01..' + monthEnd(latest)],
  ['Ano atual', latest.slice(0, 4) + '-01-01..' + monthEnd(latest)],
  ['12 meses', shiftMonth(latest, -11) + '-01..' + monthEnd(latest)],
  ['Ano passado', (+latest.slice(0, 4) - 1) + '-01-01..' + (+latest.slice(0, 4) - 1) + '-12-31'],
] : [];

/* ---------- histórico mensal (data/history) ----------
   group(data, filters, dims) → { months:[YYYY-MM], complete:[bool], total:Float64Array, by: Map(chave → Float64Array) }
   chave = valores das dimensões unidos por '|'. Filtros que o histórico não aplica voltam em `ignored`. */
export function historyGroup(data, filters, dims = []) {
  if (!data) return null;
  const { rows, countIndex } = engine.historyRows(data, filters);
  const idx = dims.map(d => data.dimensions.indexOf(d) + 1), dicts = dims.map(d => data.dictionaries[d]);
  if (idx.some(i => i < 1)) return null;
  const n = data.months.length, total = new Float64Array(n), by = new Map();
  for (const row of rows) {
    const m = row[0], c = row[countIndex];
    total[m] += c;
    if (!dims.length) continue;
    const key = dims.length === 1 ? dicts[0][row[idx[0]]] : idx.map((i, k) => dicts[k][row[i]]).join('|');
    let a = by.get(key); if (!a) { a = new Float64Array(n); by.set(key, a); }
    a[m] += c;
  }
  return { months: data.months.map(m => m.month), complete: data.months.map(m => m.complete), total, by };
}
export const ignoredBy = filters => engine.historyPlan(filters).ignoredLabels;
/* índice do último mês completo até `end` */
export const lastCompleteIndex = (g, end) => { let i = g.months.lastIndexOf(end); if (i < 0) i = g.months.length - 1; while (i >= 0 && !g.complete[i]) i--; return i; };
export const sumRange = (arr, from, to) => { let s = 0; for (let i = Math.max(0, from); i <= to; i++) s += arr[i] ?? 0; return s; };

/* ---------- decomposição da variação (mesmo período do ano anterior) ----------
   V0 = Σ M0s·p0s e V1 = Σ M1s·p1s (M = mercado do segmento, p = participação da marca no segmento).
   tamanho do mercado = V0·(M1/M0 − 1); mix = Σ (M1s − M0s·M1/M0)·p0s; desempenho = Σ M1s·(p1s − p0s). */
export function shiftShare(market, focus) {
  const m1 = new Map((market?.groups?.bd_segmento ?? []).map(r => [r.name, r.count]));
  const m0 = new Map((market?.yearGroups?.bd_segmento ?? []).map(r => [r.name, r.count]));
  const f1 = new Map((focus?.groups?.bd_segmento ?? []).map(r => [r.name, r.count]));
  const f0 = new Map((focus?.yearGroups?.bd_segmento ?? []).map(r => [r.name, r.count]));
  if (!m0.size || !f0.size) return null;
  const M1 = [...m1.values()].reduce((a, b) => a + b, 0), M0 = [...m0.values()].reduce((a, b) => a + b, 0);
  if (!(M0 > 0)) return null;
  const g = M1 / M0; let V0 = 0, V1 = 0, size = 0, mix = 0, perf = 0;
  const segs = [];
  for (const s of new Set([...m0.keys(), ...m1.keys()])) {
    const a0 = m0.get(s) ?? 0, a1 = m1.get(s) ?? 0, b0 = f0.get(s) ?? 0, b1 = f1.get(s) ?? 0;
    const p0 = a0 > 0 ? b0 / a0 : 0, p1 = a1 > 0 ? b1 / a1 : 0;
    V0 += b0; V1 += b1; size += b0 * (g - 1); mix += (a1 - a0 * g) * p0;
    const dPerf = a1 * (p1 - p0); perf += dPerf;
    if (b0 > 0 || b1 > 0) segs.push({ name: s, before: b0, after: b1, share0: p0, share1: p1, perf: dPerf, market0: a0, market1: a1 });
  }
  // ajuste mínimo de arredondamento: segmentos que só existem num dos lados entram em desempenho
  perf += (V1 - V0) - (size + mix + perf);
  return { before: V0, after: V1, size, mix, perf, segs: segs.sort((a, b) => Math.abs(b.perf) - Math.abs(a.perf)) };
}

/* participação e posição de uma marca num conjunto de linhas {name,count} */
export function standing(rows, name) {
  const sorted = [...(rows ?? [])].filter(r => r.count > 0).sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, r) => s + r.count, 0), i = sorted.findIndex(r => r.name === name);
  return { total, count: i >= 0 ? sorted[i].count : 0, rank: i >= 0 ? i + 1 : null, share: total > 0 && i >= 0 ? sorted[i].count / total : 0, rows: sorted };
}

/* índice de concentração HHI (0–10.000) e o número equivalente de marcas */
export const hhi = counts => { const t = counts.reduce((a, b) => a + b, 0); if (!(t > 0)) return null; const h = counts.reduce((s, c) => s + (c / t * 100) ** 2, 0); return { hhi: h, equiv: 10000 / h }; };

export const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
