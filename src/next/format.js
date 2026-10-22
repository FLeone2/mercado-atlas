export const fmt = n => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('pt-BR'));
export const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
export const signed = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + pct(Math.abs(x), d));
export const pp = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < .0005 ? '' : x > 0 ? '+' : '−') + Math.abs(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' p.p.');
export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = m => MONTHS[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4);
export const monthEnd = m => { const [y, mo] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0'); };
export const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
// Whole months read as months; any partial month shows its days, so the label is the window computed.
const lastDay = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
const dayLabel = d => +d.slice(8, 10) + ' ' + monthLabel(d.slice(0, 7));
export const rangeText = r => {
  if (!r?.start || !r?.end) return '';
  const a = r.start.slice(0, 7), b = r.end.slice(0, 7);
  const whole = r.start.slice(8, 10) === '01' && +r.end.slice(8, 10) === lastDay(b);
  if (!whole) return r.start === r.end ? dayLabel(r.start) : a === b ? +r.start.slice(8, 10) + '–' + dayLabel(r.end) : dayLabel(r.start) + ' a ' + dayLabel(r.end);
  if (a === b) return monthLabel(a);
  return monthLabel(a) + ' a ' + monthLabel(b);
};
export const UF_NAMES = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
export const titleCase = s => String(s).toLowerCase().replace(/(^|[\s/\-·])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
