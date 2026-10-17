// Pure parts of the Atlas kit: number formats, chart matrix and the date picker presets.
const assert = require('assert');
(async () => {
  const F = await import('../src/kit/format.js'), P = await import('../src/kit/period.js'), C = await import('../src/kit/chart-model.js');
  assert.equal(F.formatNumber(268721), '268.721');
  assert.equal(F.formatPercent(0.0064, 2), '0,64%');
  assert.equal(F.isPercentField('marketShare', [0.1, 0.2]), true);
  assert.equal(F.isPercentField('count', [0.1]), false);
  assert.equal(F.isPercentField('changeRate', [-0.3, 1.4]), true);
  assert.equal(F.axisKind(['2026-01-01', '2026-02-01']), 'month');
  assert.equal(F.axisKind(['2026-09-01', '2026-09-02']), 'day');
  assert.equal(F.monthLabel('2026-09-01'), 'set/26');
  assert(F.csvText([{ a: 1, b: 'x;y' }]).includes('"x;y"'));

  assert.equal(P.rangeLabel('2026-09-01..2026-09-30'), 'set/2026');
  assert.equal(P.rangeLabel('2026-01-01..2026-09-30'), 'jan/26 – set/26');
  assert.equal(P.rangeLabel('2026-09-03..2026-09-15'), '3 set/2026 – 15 set/2026');
  const presets = P.periodPresets('2016-01-01', '2026-09-30');
  assert.deepEqual(presets.map(p => p.value), ['2026-09-01..2026-09-30', '2026-01-01..2026-09-30', '2025-10-01..2026-09-30', '2025-01-01..2025-12-31', '2016-01-01..2026-09-30']);

  // Long rows with a series field, wide rows with fields, and 100% stacking.
  let m = C.chartModel({ type: 'line', x: 'date', y: 'count', series: 'name' }, [
    { date: '2026-02-01', name: 'FIAT', count: 5 }, { date: '2026-01-01', name: 'FIAT', count: 3 }, { date: '2026-01-01', name: 'VW', count: 2 }]);
  assert.deepEqual(m.categories, ['2026-01-01', '2026-02-01']);
  assert.deepEqual(m.keys, ['FIAT', 'VW']);
  assert.equal(m.get('2026-02-01', 'VW'), undefined);
  m = C.chartModel({ type: 'line', x: 'date', y: 'a', fields: ['a', 'b'] }, [{ date: '2026-01', a: 0.1, b: 0.2 }]);
  assert.equal(m.percent, false, 'fields named a/b are not shares');
  m = C.chartModel({ type: 'stackedBar100', x: 'k', y: 'count', series: 's' }, [{ k: 'x', s: 'p', count: 1 }, { k: 'x', s: 'q', count: 3 }]);
  assert.equal(m.get('x', 'q').value, 0.75);
  assert.equal(m.percent, true);
  console.log('PASS kit');
})().catch(e => { console.error(e); process.exit(1); });
