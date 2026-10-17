// Number, date and label formatting shared by charts, tables and cards (pt-BR).
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nf = new Map();
const numberFormat = (min, max) => {
  const key = min + ':' + max;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return nf.get(key);
};

export const formatNumber = (v, decimals = 0) => v == null || !Number.isFinite(Number(v)) ? '—' : numberFormat(0, decimals).format(Number(v));
export const formatPercent = (v, decimals = 1) => v == null || !Number.isFinite(Number(v)) ? '—' : numberFormat(decimals, decimals).format(Number(v) * 100) + '%';
export const compact = v => v == null ? '—' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
export const percentage = v => formatPercent(v);

// A field is a share when its name says so and every value is a fraction (same rule the old shell used).
export function isPercentField(name = '', values = []) {
  const growth = /(?:growth|change|delta|variance).*?(?:rate|ratio|percent|percentage)$/iu.test(String(name));
  return /(?:ratio|rate|conversion|retention|percent|percentage|share|penetration|adoption)$/iu.test(String(name))
    && values.some(Number.isFinite) && values.every(v => !Number.isFinite(v) || growth || (v >= 0 && v <= 1));
}

export function parseDay(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  return m ? { y: +m[1], m: +m[2], d: m[3] ? +m[3] : null } : null;
}
export const monthLabel = value => { const p = parseDay(value); return p ? `${MONTHS[p.m - 1]}/${String(p.y).slice(2)}` : String(value ?? ''); };
export const dayLabel = value => { const p = parseDay(value); return p ? `${p.d ?? 1} ${MONTHS[p.m - 1]}` : String(value ?? ''); };
export const longDate = value => { const p = parseDay(value); return p ? `${p.d ? p.d + ' ' : ''}${MONTHS[p.m - 1]}/${p.y}` : String(value ?? ''); };
export const shortDate = value => longDate(value);

// How to print the categories of an x axis: months, days or plain text.
export function axisKind(values) {
  const parsed = values.map(parseDay);
  if (!parsed.length || parsed.some(p => !p)) return 'text';
  if (parsed.every(p => p.d == null || p.d === 1) && new Set(values.map(v => v.slice(0, 7))).size === values.length) return 'month';
  return 'day';
}
export const axisFormatter = kind => kind === 'month' ? monthLabel : kind === 'day' ? dayLabel : v => String(v ?? '');

export function displayValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return longDate(value);
  return String(value);
}
export const label = key => String(key ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

export function csvText(rows = []) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r ?? {})))];
  const cell = v => { if (v == null) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[";\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
  return '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))].join('\n');
}
export function downloadCsv(name, rows) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = name.endsWith('.csv') ? name : name + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
