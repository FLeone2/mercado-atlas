const assert = require('node:assert/strict');

(async () => {
  const { electrificationSeries } = await import('../src/atlas/base/electrification.js');
  const fixture = {
    months: ['2024-12', '2025-01', '2025-02'],
    total: [10000, 10000, 0],
    by: new Map([['BEV', [5, 5, 0]], ['PHEV', [1000, 2000, 0]], ['HEV', [2000, 1000, 0]], ['MHEV', [3000, 4000, 0]]]),
  };
  const narrow = electrificationSeries(fixture);
  assert.equal(narrow.series.some(row => row.name === 'Elétrico'), false, 'Tiny individual category may be hidden');
  assert.ok(Math.abs(narrow.series[0].values[0] - .3005) < 1e-12, 'Hidden BEV count still contributes to total');
  assert.ok(Math.abs(narrow.series[0].values[1] - .3005) < 1e-12, 'Excluding MHEV applies on both sides of January 2025');
  assert.equal(narrow.series[0].values[2], null, 'No denominator remains missing rather than zero percent');
  const broad = electrificationSeries({ ...fixture, includeMhev: true });
  assert.ok(Math.abs(broad.series[0].values[0] - .6005) < 1e-12);
  assert.ok(Math.abs(broad.series[0].values[1] - .7005) < 1e-12);
  assert.equal(broad.series.at(-1).name, 'Microhíbrido');
  assert.equal(broad.series[0].values[2], null);
  const tail = electrificationSeries({ ...fixture, months: ['2025-01', '2025-02'], start: 1 });
  assert.deepEqual(tail.series[0].values, narrow.series[0].values.slice(1), 'Displayed range uses the corresponding source indices');
  console.log('electrification-scope: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
