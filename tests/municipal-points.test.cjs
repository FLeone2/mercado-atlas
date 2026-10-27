// Every state's municipal points must spread over its national outline: a fit that counts an
// offshore island (Fernando de Noronha) in the state box squeezes the whole state into a corner.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const pts = read('data/geography/municipal-points.json'), outline = read('src/market/geo/uf-geometry.json');
const OFFSHORE = new Set(['2605459']);
const box = d => { const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number); return [Math.min(...n.filter((_, i) => i % 2 === 0)), Math.min(...n.filter((_, i) => i % 2)), Math.max(...n.filter((_, i) => i % 2 === 0)), Math.max(...n.filter((_, i) => i % 2))]; };
const worst = [];
for (const f of outline.features) {
  const [X0, Y0, X1, Y1] = box(f.path), rows = pts.rows.filter(r => r[2] === f.uf && !OFFSHORE.has(r[0]));
  if (rows.length < 10) continue; // DF has one municipality
  const xs = rows.map(r => r[3]), ys = rows.map(r => r[4]);
  const spreadX = (Math.max(...xs) - Math.min(...xs)) / (X1 - X0), spreadY = (Math.max(...ys) - Math.min(...ys)) / (Y1 - Y0);
  worst.push([f.uf, Math.min(spreadX, spreadY)]);
  assert(spreadX > .45 && spreadY > .45, `${f.uf}: os municípios ocupam só ${(spreadX * 100).toFixed(0)}% × ${(spreadY * 100).toFixed(0)}% do contorno do estado`);
  for (const r of rows) assert(r[3] >= X0 - 1 && r[3] <= X1 + 1 && r[4] >= Y0 - 1 && r[4] <= Y1 + 1, `${f.uf}: ${r[1]} fora do contorno do estado`);
}
worst.sort((a, b) => a[1] - b[1]);
console.log('PASS municipal points: every state fills its outline (smallest spread ' + worst[0][0] + ' ' + (worst[0][1] * 100).toFixed(0) + '%); Fernando de Noronha stays offshore.');
