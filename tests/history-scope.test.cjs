// Auditoria CODE-H01/H02: the history applies the light universe and never turns an empty
// UF × região intersection into Brazil. Runs on the published history files.
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const H = require('../src/market/modules/history-data.js');
const load = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../data/history', f + '.json.gz'))));
const nat = load('national'), uf = load('uf');
const at = (d, f, m) => H.historyMonthly(d, f).find(x => x.month === m);
const aug = at(nat, { population: 'light' }, '2024-08');
assert.equal(aug.count, 223196, 'ago/2024 leves = 223.196 (sem caminhões e ônibus)');
assert.equal(aug.market, 223196, 'mercado de referência no mesmo universo');
assert.equal(at(nat, {}, '2024-08').count, 223196, 'universo padrão = leves');
assert.equal(at(nat, { population: 'all_content' }, '2024-08').count, 237384, 'todo o conteúdo inclui os 14.188');
assert.equal(at(nat, { segmento: ['Caminhão'] }, '2024-08').count, 0, 'segmento fora do universo leve não vira mercado inteiro');
assert.equal(at(uf, { uf: ['SP'], regiao: ['Sul'] }, '2026-09').count, 0, 'SP ∩ Sul é vazio');
assert.ok(at(uf, { uf: ['SP'] }, '2026-09').count > 0);
console.log('PASS history scope: universo leve aplicado e interseção vazia continua vazia.');
