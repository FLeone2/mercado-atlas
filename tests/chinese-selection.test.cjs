// Seleção de marcas chinesas: lista padrão, variantes (B)/(T), mapeamento derivado e classificação.
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const C = require('../src/market/modules/chinese-selection.js');
const src = fs.readFileSync(path.join(__dirname, '../src/market/core.js'), 'utf8');
const line = src.split('\n').find(l => l.startsWith('const value = JSON.parse("{\\"brands\\":{\\"ALFA'));
const mapping = JSON.parse(JSON.parse(line.slice('const value = JSON.parse('.length, line.lastIndexOf(');'))));
const kind = (name, m) => { const r = m.brands[String(name).trim().toUpperCase()]; return !r ? 'unknown' : r.chineseOrigin === true ? 'china' : r.originCode === 'BRA_CHN_PARTNERSHIP' ? 'partnership' : 'other'; };

const defaults = C.chineseDefaults(mapping);
assert.ok(defaults.includes('BYD') && defaults.includes('GWM') && defaults.includes('EFFA'), 'EFFA agora é chinesa na lista padrão');
assert.ok(!defaults.includes('CAOA CHERY') && !defaults.includes('MG'), 'parcerias e MG ficam fora do padrão');
assert.ok(!defaults.some(b => /\((B|T)\)/.test(b)), 'variantes (B)/(T) viram a marca base');
assert.equal(kind('EFFA', mapping), 'china');

// sem escolha: o mapa original, a mesma referência
assert.equal(C.chineseMapping(mapping, null), mapping);

// com CAOA e MG escolhidos e BYD retirado
const sel = [...defaults.filter(b => b !== 'BYD'), 'CAOA CHERY', 'CAOA-CHERY', 'MG'];
const m = C.chineseMapping(mapping, C.chineseParse(JSON.stringify(sel)));
assert.equal(kind('CAOA CHERY', m), 'china'); assert.equal(kind('MG', m), 'china');
assert.equal(kind('BYD', m), 'other'); assert.equal(kind('BYD (T)', m), 'other', 'variante segue a marca');
assert.equal(kind('GWM', m), 'china'); assert.equal(kind('FIAT', m), 'other');
assert.equal(kind('CAOA CHANGAN', m), 'partnership', 'o que não foi escolhido continua parceria');
// marca sem regra, escolhida pelo leitor
const m2 = C.chineseMapping(mapping, C.chineseParse('["RDK"]'));
assert.equal(kind('RDK', m2), 'china'); assert.equal(kind('BYD', m2), 'other');
// o mapa original não foi alterado
assert.equal(kind('BYD', mapping), 'china');
assert.deepEqual(C.chineseParse('lixo'), null);
console.log('PASS chinese selection: padrão auditado + EFFA, variantes, extras e mapeamento derivado.');
