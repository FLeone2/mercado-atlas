// Independent XLSX streaming readback: source totals are fixed regression facts.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
const manifest = read('data/manifest.json'), snapshot = read('data/snapshot.json');
const meta = manifest.months.find(month => month.month === '2026-10');
assert(meta, 'October 2026 source must be present');
assert.equal(meta.sha256, 'd528b73e0f4be663838439083d4e096e4e934ecd17872012fcb7e9204be42bcc');
assert.equal(meta.rows, 254011);
assert.equal(meta.eligibleRows, 254011);
assert.equal(meta.invalidDateRows, 0);
assert.equal(meta.monthMismatchRows, 0);
assert.equal(meta.dateMin, '2026-10-01');
assert.equal(meta.dateMax, '2026-10-31');
assert.notEqual(path.basename(meta.cubePath), path.basename(meta.originCubePath), 'Base and origin slice directories must not collide');
const cube = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', meta.cubePath))));
const ix = Object.fromEntries(cube.columns.map((column, i) => [column, i]));
const sum = (dimension, value) => cube.rows.reduce((total, row) => total +
  (cube.dictionaries[dimension][row[ix[dimension]]] === value ? row[ix.count] : 0), 0);
assert.equal(cube.rows.reduce((total, row) => total + row[ix.count], 0), 254011);
assert.equal(sum('segmento', 'Auto'), 205947);
assert.equal(sum('segmento', 'Comercial Leve'), 48064);
assert.equal(sum('tipo_venda', 'VAREJO'), 124468);
assert.equal(sum('tipo_venda', 'VD'), 129543);
assert.equal(sum('marca', 'MITSUBISHI'), 1320);
assert.deepEqual(snapshot.marketManifest, manifest);
assert.equal(manifest.totals.rows, manifest.months.reduce((total, month) => total + month.rows, 0));
assert.equal(manifest.totals.eligible_rows, manifest.months.reduce((total, month) => total + month.eligibleRows, 0));
assert.equal(manifest.originExtension.sourceRows, manifest.totals.eligible_rows);
for (const dimension of cube.dimensions) {
  assert(!/cnpj|razao|chassi|placa/i.test(dimension), 'No direct identifiers in public cubes');
}
console.log('PASS October 2026: independent source totals, scope, channel, Mitsubishi, snapshot and cumulative coverage.');
