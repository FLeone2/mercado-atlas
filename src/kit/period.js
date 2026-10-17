// Period labels and presets for the date picker (pt-BR).
import { longDate, monthLabel } from './format.js';

export const pad = n => String(n).padStart(2, '0');
export const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
export const shiftMonth = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };

export function rangeLabel(value, first, last) {
  if (!value || value === 'all') return first && last ? rangeLabel(`${first}..${last}`) : 'Todo o período';
  const [a, b = a] = String(value).split('..');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return String(value);
  const fullMonths = a.endsWith('-01') && b === monthEnd(b.slice(0, 7));
  if (fullMonths && a.slice(0, 7) === b.slice(0, 7)) return monthLabel(a).replace(/\/(\d\d)$/, '/20$1');
  if (fullMonths) return `${monthLabel(a)} – ${monthLabel(b)}`;
  return `${longDate(a)} – ${longDate(b)}`;
}

export function periodPresets(first, last) {
  if (!first || !last) return [];
  const lastMonth = last.slice(0, 7), year = last.slice(0, 4);
  const items = [
    { id: 'latest', label: 'Último mês', value: `${lastMonth}-01..${last}` },
    { id: 'year', label: 'Ano atual', value: `${year}-01-01..${last}` },
    { id: '12m', label: 'Últimos 12 meses', value: `${shiftMonth(lastMonth, -11)}-01..${last}` },
    { id: 'prev-year', label: String(+year - 1), value: `${+year - 1}-01-01..${+year - 1}-12-31` },
    { id: 'all', label: 'Todo o período', value: `${first}..${last}` },
  ];
  return items.map(p => { const [s, e] = p.value.split('..'); return { ...p, value: `${s < first ? first : s}..${e > last ? last : e}` }; });
}


export function monthsBetween(first, last) {
  const out = []; for (let m = first.slice(0, 7); m <= last.slice(0, 7); m = shiftMonth(m, 1)) out.push(m); return out;
}
