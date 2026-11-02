// Cubes split by state and by size class (scripts/split-cubes.cjs): a query filtered to one state (or one
// size class) must give exactly the same answer reading the slices as reading the full cubes, in the Atlas
// main query (with the focus brand and the year before) and in the connections query (origin cubes), and it
// must read only the slices. Queries with two values, or none, keep reading the full cubes.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const { loadCore, loadWorker } = require('../scripts/lib/market-core.cjs');
const { split, DIMS } = require('../scripts/split-cubes.cjs');
const root = path.join(__dirname, '..'), data = path.join(root, 'data');
const core = loadCore(), worker = loadWorker();
const manifest = JSON.parse(fs.readFileSync(path.join(data, 'manifest.json'), 'utf8'));
const months = manifest.months.filter(m => m.cubePath).sort((a, b) => a.month.localeCompare(b.month));
const last = months.at(-1), prev = months.at(-2), yearBack = m => String(+m.slice(0, 4) - 1) + m.slice(4);

// split the months the queries below read (the period, the period before and the year before) into a temporary folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cubes-split-')), out = path.join(tmp, 'cubes-split'), dims = Object.fromEntries(DIMS.map(d => [d, {}]));
const wanted = new Set([...months.slice(-4).map(m => m.month), yearBack(last.month), yearBack(prev.month)]);
for (const dim of DIMS) for (const m of months.filter(m => wanted.has(m.month))) for (const p of [m.cubePath, m.originCubePath].filter(Boolean)) { const r = split(p, dim, { out }); dims[dim][p] = { dir: r.dir, files: r.files }; }
const splitIndex = { version: 2, dims };

const read = [];
const loader = {
  load: async meta => { read.push(meta.cubePath); const dir = meta.cubePath.startsWith('cubes-split/') ? tmp : data; return worker.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, meta.cubePath))).toString('utf8')); },
  setNamespace() {}, clear() {}, stats() { return {}; },
};
async function query(filters, mode, withIndex) {
  read.length = 0;
  const options = core.marketRequestOptions(mode), messages = [], port = { postMessage: m => messages.push(m) };
  worker.installMarketWorker(port, { loader });
  const message = { id: 1, manifest, filters: { population: 'light', ...filters }, base: 'https://local/data/', ...options, focusBrand: 'MITSUBISHI', ...(withIndex ? { splitIndex } : {}) };
  await port.onmessage({ data: worker.parse(JSON.stringify(message)) });
  const reply = messages.findLast(m => m.result || m.error);
  assert(reply && !reply.error, reply?.error);
  return { json: JSON.stringify(reply.result), read: [...read] };
}

(async () => {
  const lastMonth = last.month + '-01..' + last.dateMax, twoMonths = prev.month + '-01..' + last.dateMax;
  for (const [label, filters, mode, slice] of [
    ['SP, último mês, consulta principal', { date: lastMonth, uf: ['SP'] }, 'atlas', 'uf/.*/SP'],
    ['PE, dois meses, consulta principal', { date: twoMonths, uf: ['PE'] }, 'atlas', 'uf/.*/PE'],
    ['SP + picape média: lê o estado', { date: lastMonth, uf: ['SP'], bd_segmento: ['PICK-UP MID'] }, 'atlas', 'uf/.*/SP'],
    ['picape média, dois meses, consulta principal', { date: twoMonths, bd_segmento: ['PICK-UP MID'] }, 'atlas', 'bd_segmento/.*/PICK-UP-MID'],
    ['SUV compacto + Mitsubishi em foco, mapa nacional', { date: lastMonth, bd_segmento: ['COMPACT'] }, 'leaders-br', 'bd_segmento/.*/COMPACT'],
    ['BA, último mês, conexões (cubos de origem)', { date: lastMonth, uf: ['BA'] }, 'conexoes', 'uf/.*/BA'],
    ['picape média, conexões (cubos de origem)', { date: lastMonth, bd_segmento: ['PICK-UP MID'] }, 'conexoes', 'bd_segmento/.*/PICK-UP-MID'],
  ]) {
    const full = await query(filters, mode, false), sliced = await query(filters, mode, true), re = new RegExp('^cubes-split/' + slice + '\\.json\\.gz$');
    assert.ok(full.read.every(p => !p.startsWith('cubes-split/')), label + ': sem índice lê os cubos completos');
    assert.ok(sliced.read.length > 0 && sliced.read.every(p => re.test(p)), label + ': com índice lê só a fatia: ' + sliced.read.join(', '));
    assert.equal(sliced.json, full.json, label + ': mesma resposta');
    console.log('PASS', label, '·', sliced.read.length, 'arquivos da fatia');
  }
  // two states, or none: full cubes
  const two = await query({ date: lastMonth, uf: ['SP', 'RJ'] }, 'atlas', true);
  assert.ok(two.read.every(p => !p.startsWith('cubes-split/')), 'dois estados leem os cubos completos');
  const none = await query({ date: lastMonth }, 'atlas', true);
  assert.ok(none.read.every(p => !p.startsWith('cubes-split/')), 'sem estado nem porte lê os cubos completos');
  // every row of the full cube is in exactly one slice of each dimension (or has no value)
  const cube = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(data, last.cubePath))));
  const count = cube.columns.indexOf('count'), all = cube.rows.reduce((s, r) => s + r[count], 0);
  for (const dim of DIMS) {
    const col = cube.columns.indexOf(dim), entry = dims[dim][last.cubePath]; let parts = 0;
    for (const [value, file] of Object.entries(entry.files)) { const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(tmp, entry.dir, file)))); assert.deepEqual(c.dictionaries, cube.dictionaries); assert.ok(c.rows.every(r => String(cube.dictionaries[dim][r[col]]) === value)); parts += c.rows.reduce((s, r) => s + r[count], 0); }
    const none = cube.rows.filter(r => cube.dictionaries[dim][r[col]] == null).reduce((s, r) => s + r[count], 0);
    assert.equal(parts + none, all, dim + ': as fatias somam o cubo completo');
  }
  console.log('PASS dois estados e Brasil leem os cubos completos; as fatias de', last.month, 'somam o cubo completo');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exitCode = 1; });
