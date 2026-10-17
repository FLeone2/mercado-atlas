const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const H=require('../src/market/modules/history-data.js');
// Business days: weekdays minus national holidays, Carnaval, Good Friday and Corpus Christi.
assert.equal(new Date(H.historyEaster(2026)).toISOString().slice(0,10),'2026-04-05');
assert.equal(new Date(H.historyEaster(2024)).toISOString().slice(0,10),'2024-03-31');
assert.equal(H.historyWorkingDays('2026-09'),21,'7 de setembro cai na segunda');
assert.equal(H.historyWorkingDays('2026-02'),18,'Carnaval 16 e 17 de fevereiro');
assert.equal(H.historyWorkingDays('2026-04'),20,'Sexta-feira Santa 3/4 e Tiradentes 21/4');
assert(H.historyHolidays(2024).has('2024-11-20'));assert(!H.historyHolidays(2023).has('2023-11-20'));
// Filter plans: UF/região switch to the UF file; unknown dimensions are reported, never silently applied.
assert.deepEqual(H.historyPlan({date:'2026-01-01..2026-09-30',marca:['MITSUBISHI']}),{file:'national',active:['marca'],ignored:[],ignoredLabels:[]});
const p=H.historyPlan({uf:['SP'],grupo_modelo:['L200'],municipio:['Campinas · SP']});assert.equal(p.file,'uf');assert.deepEqual(p.ignored,['grupo_modelo','municipio']);
assert.equal(H.historyEndMonth({date:'2026-01-01..2026-06-30'},[{month:'2026-05'},{month:'2026-06'},{month:'2026-07'}]),'2026-06');
// Filtering on the real national file reproduces the reference September 2026 totals.
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync('data/history/national.json.gz')));
const sep=H.historyMonthly(data,{marca:['MITSUBISHI']}).find(m=>m.month==='2026-09');assert.equal(sep.count,1729);assert.equal(sep.market,268721);
const bySeg=H.historyMonthly(data,{},'propulsao').find(m=>m.month==='2026-09');assert.equal([...bySeg.groups.values()].reduce((a,b)=>a+b,0),268721);
const uf=JSON.parse(zlib.gunzipSync(fs.readFileSync('data/history/uf.json.gz')));
const se=H.historyMonthly(uf,{regiao:['Sudeste']}).find(m=>m.month==='2026-09'),sp=H.historyMonthly(uf,{uf:['SP']}).find(m=>m.month==='2026-09');assert(se.count>sp.count&&sp.count>0);
assert.equal(H.historyMonthly(uf,{regiao:['Sudeste'],uf:['SP']}).find(m=>m.month==='2026-09').count,sp.count,'UF inside the region');
console.log('PASS history data: business days, file plans with ignored filters, real-file filters and regional mapping.');
