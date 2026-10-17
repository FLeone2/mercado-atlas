// The two quick period buttons ("Ano atual" = janeiro até o último mês, "Último mês")
// must always exist and follow the newest month in the manifest, including when the
// newest month is partial and does not declare its end date.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const core = fs.readFileSync(path.join(__dirname, '../src/market/core.js'), 'utf8');
const pick = name => {
  const m = new RegExp('(function ' + name + '\\(|const ' + name + '\\s*=)').exec(core);
  assert(m, 'missing ' + name);
  // A function runs until its closing brace at column 0 or the end of a one-line arrow.
  const start = m.index, rest = core.slice(start);
  const end = rest.startsWith('function') ? (() => { let d = 0; for (let i = rest.indexOf('{'); i < rest.length; i++) { if (rest[i] === '{') d++; else if (rest[i] === '}' && --d === 0) return i + 1; } })() : rest.indexOf(';') + 1;
  return rest.slice(0, end);
};
const names = ['iso', 'validMonth', 'shortMonth', 'dateLabel', 'monthEnd', 'listMonths', 'sourceCoverageEnd', 'sourceCoverageStart', 'latestPeriodPresets'];
const ctx = vm.createContext({});
vm.runInContext(names.map(pick).join('\n') + '\nglobalThis.api={latestPeriodPresets};', ctx);
const { latestPeriodPresets } = ctx.api;
const month = (m, extra = {}) => ({ month: m, cubePath: 'cubes/' + m + '.json.gz', ...extra });
const months = n => Array.from({ length: n }, (_, i) => month('2026-' + String(i + 1).padStart(2, '0')));

// Complete months: Ano atual = jan..set, Último mês = set.
let p = latestPeriodPresets({ months: months(9) });
assert.deepEqual(p.presets.map(x => x.value), ['2026-01-01..2026-09-30', '2026-09-01..2026-09-30']);
assert.equal(p.presets[0].label, 'jan–set/2026');

// A new month arrives: both buttons move forward on their own.
p = latestPeriodPresets({ months: months(10) });
assert.deepEqual(p.presets.map(x => x.value), ['2026-01-01..2026-10-31', '2026-10-01..2026-10-31']);

// Partial newest month with a declared end: the buttons end on that day.
p = latestPeriodPresets({ months: [...months(9), month('2026-10', { coverageEndDate: '2026-10-15' })] });
assert.deepEqual(p.presets.map(x => x.value), ['2026-01-01..2026-10-15', '2026-10-01..2026-10-15']);

// Partial newest month WITHOUT a declared end: the buttons stay, on the last known month.
p = latestPeriodPresets({ months: [...months(9), month('2026-10', { partialCoverage: true })] });
assert(p && p.presets.length === 2, 'shortcuts must not disappear');
assert.deepEqual(p.presets.map(x => x.value), ['2026-01-01..2026-09-30', '2026-09-01..2026-09-30']);

// January: Ano atual and Último mês are the same month, still two buttons in the data.
p = latestPeriodPresets({ months: [month('2027-01')] });
assert.equal(p.presets.length, 2);

// The real manifest.
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/manifest.json'), 'utf8'));
p = latestPeriodPresets(manifest);
const last = manifest.months.filter(m => m.cubePath).map(m => m.month).sort().at(-1);
assert(p.presets[1].value.startsWith(last + '-01..'), 'Último mês = newest month in the manifest');
assert(p.presets[0].value.startsWith(last.slice(0, 4) + '-01-01..'), 'Ano atual starts in January');
console.log('PASS period shortcuts:', p.presets.map(x => x.value).join(' · '));
