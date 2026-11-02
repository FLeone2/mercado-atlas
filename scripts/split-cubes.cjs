// Splits the recent monthly cubes by state and by size class (porte): data/cubes-split/<dim>/<cube>/<value>.json.gz
// holds only the rows of that value, with the same columns and the same (complete) dictionaries as the source cube.
// A query filtered to one state (or to one size class) reads ~2–25% of the bytes and returns exactly the same
// answer: every collection of a request keeps these two filters (tests/cubes-split.test.cjs checks it).
// Index: data/cubes-split/index.json { version: 2, dims: { <dim>: { <source cubePath>: { dir, files: { <value>: <file> } } } } }.
// Incremental (a source already split is kept) and run before vite build (~45 s from scratch); output is not versioned.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..'), DATA = path.join(root, 'data');
// Months covered: enough for every quick period and its comparison with the year before.
const MONTHS = Number(process.env.ATLAS_SPLIT_MONTHS ?? 36);
const DIMS = ['uf', 'bd_segmento'];
// the worker compares filters with String(value) (categoryLabel); null stays only in the full cube
const label = v => (v == null ? null : String(v));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

function split(cubePath, dim, { data = DATA, out = path.join(DATA, 'cubes-split') } = {}) {
  const name = path.basename(cubePath).replace(/\.json\.gz$/, ''), rel = dim + '/' + name + '/', target = path.join(out, dim, name), done = path.join(target, 'files.json');
  if (fs.existsSync(done)) return { dir: 'cubes-split/' + rel, files: JSON.parse(fs.readFileSync(done, 'utf8')), cached: true };
  const cube = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(data, cubePath))).toString('utf8'));
  const columns = cube.columns ?? [...cube.dimensions, 'count'], col = columns.indexOf(dim), values = cube.dictionaries?.[dim];
  if (col < 0 || !Array.isArray(values)) return null;
  const groups = new Map(); // label -> rows, in the source order
  for (const row of cube.rows) { const l = label(values[row[col]]); if (l === null) continue; if (!groups.has(l)) groups.set(l, []); groups.get(l).push(row); }
  fs.rmSync(target, { recursive: true, force: true }); fs.mkdirSync(target, { recursive: true });
  const files = {}, used = new Set();
  for (const [l, rows] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    let file = slug(l), n = 1; while (used.has(file)) file = slug(l) + '-' + ++n; used.add(file);
    fs.writeFileSync(path.join(target, file + '.json.gz'), zlib.gzipSync(JSON.stringify({ ...cube, rows }), { level: 6 }));
    files[l] = file + '.json.gz';
  }
  fs.writeFileSync(done, JSON.stringify(files));
  return { dir: 'cubes-split/' + rel, files, cached: false };
}

function main() {
  const started = Date.now(), out = path.join(DATA, 'cubes-split');
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
  const months = manifest.months.filter(m => m.cubePath).sort((a, b) => a.month.localeCompare(b.month)).slice(-MONTHS);
  const dims = {}, keep = new Set();
  let made = 0, count = 0;
  for (const dim of DIMS) {
    dims[dim] = {};
    for (const m of months) for (const p of [m.cubePath, m.originCubePath].filter(Boolean)) {
      const r = split(p, dim); if (!r) continue;
      dims[dim][p] = { dir: r.dir, files: r.files }; keep.add(r.dir.replace(/^cubes-split\//, '').replace(/\/$/, '')); count++; if (!r.cached) made++;
    }
  }
  // sources that left the window (or were replaced by a revision) are removed
  for (const dim of fs.readdirSync(out)) {
    if (!fs.statSync(path.join(out, dim)).isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(out, dim))) if (!keep.has(dim + '/' + name)) fs.rmSync(path.join(out, dim, name), { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ version: 2, dims }));
  console.log(`split: ${count} cubos (${made} novos) por ${DIMS.join(' e ')}, ${months[0]?.month}..${months.at(-1)?.month}, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
if (require.main === module) main();
module.exports = { split, DIMS };
