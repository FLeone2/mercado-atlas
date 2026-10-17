// Rows -> categories × series matrix for every spec chart (pure, testable).
import { isPercentField } from './format.js';

const isDateLike = v => typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v);

// Rows -> categories × series matrix. Long rows (spec.series), wide rows (spec.fields) or one measure.
export function chartModel(spec = {}, rows = []) {
  const x = spec.x ?? 'name', type = spec.type ?? 'bar';
  let categories = spec.categoryOrder?.length ? [...spec.categoryOrder] : [...new Set(rows.map(r => r?.[x]).filter(v => v != null))];
  if (!spec.categoryOrder?.length && categories.length && categories.every(isDateLike)) categories.sort();
  const keys = spec.series
    ? (spec.seriesOrder?.length ? spec.seriesOrder : [...new Set(rows.map(r => r?.[spec.series]).filter(v => v != null))]).map(String)
    : (spec.fields?.length ? spec.fields : [spec.y]);
  const cell = new Map();
  for (const r of rows) {
    const c = r?.[x]; if (c == null) continue;
    if (spec.series) { const k = String(r[spec.series]); cell.set(c + '\u0000' + k, { row: r, value: num(r[spec.y]) }); }
    else for (const k of keys) cell.set(c + '\u0000' + k, { row: r, value: num(r[k]) });
  }
  const get = (c, k) => cell.get(c + '\u0000' + k);
  if (type === 'stackedBar100' || type === 'horizontalStackedBar100') {
    for (const c of categories) {
      const total = keys.reduce((s, k) => s + Math.max(0, get(c, k)?.value ?? 0), 0);
      for (const k of keys) { const item = get(c, k); if (item) cell.set(c + '\u0000' + k, { ...item, raw: item.value, value: total ? item.value / total : null }); }
    }
  }
  const valuesOf = k => categories.map(c => get(c, k)?.value).filter(Number.isFinite);
  const percent = type.endsWith('100') || keys.some(k => isPercentField(spec.series ? spec.y : k, valuesOf(k)));
  return { x, type, categories, keys, get, percent };
}
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

