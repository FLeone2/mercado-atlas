// Long-range analyses on the real ten-year history: exact decomposition, sane seasonal model.
const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
Object.assign(globalThis,require('../src/market/modules/history-data.js'),require('../src/market/modules/chart-scales.js'));
const A=require('../src/market/modules/history-analyses.js');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync('data/history/national.json.gz')));
// Decomposition is exact: market + mix + performance = V1 − V0.
for(const [focus,period] of [['MITSUBISHI',['2026-09']],['TOYOTA',['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']],['BYD',['2025-06']]]){
 const d=A.hxDecomposition(data,{},focus,period);
 assert(Math.abs(d.market+d.mix+d.perf-(d.V1-d.V0))<1e-6,focus+' decomposition must be exact');
 assert(Math.abs(d.bySeg.reduce((s,x)=>s+x.mix+x.perf,0)-(d.mix+d.perf))<1e-6);
}
const sep=A.hxDecomposition(data,{},'MITSUBISHI',['2026-09']);assert.equal(sep.V1,1729);assert.equal(sep.M1,268721);
// Brand filters never shrink the market of the decomposition.
assert.equal(A.hxDecomposition(data,{marca:['MITSUBISHI']},'MITSUBISHI',['2026-09']).M1,268721);
assert.equal(A.hxPeriodMonths({date:'2026-01-01..2026-03-31'},data.months).join(),'2026-01,2026-02,2026-03');
// Seasonal model: five reference years, indices around 1, 24 recent months with expectations.
const months=historyMonthly(data,{}),m=A.hxRhythmModel(months,'2026-09');
assert.equal(m.referenceYears.length,5);assert(!m.referenceYears.includes(2020)&&!m.referenceYears.includes(2021));
assert(Math.abs(m.seasonal.reduce((a,b)=>a+b,0)/12-1)<0.05,'seasonal indices average ~1');
assert.equal(m.recent.length,24);assert(m.recent.every(r=>r.expected>0));
assert.equal(m.recent.at(-1).rate,268721/21);
assert(m.recent.filter(r=>r.flag).length<=6,'only a few months may be flagged');
// Model groups: totals add up to the market in the same months.
const g=A.hxGroupStats(data,{},['2026-09']);assert.equal([...g.groups.values()].reduce((s,x)=>s+x.total,0),268721);
assert.equal(g.groups.get('TRITON').brand,'MITSUBISHI');
assert.equal(A.hxNorm('São José dos Pinhais'),'SAO JOSE DOS PINHAIS');
console.log('PASS history analyses: exact market/mix/performance decomposition, seasonal model, model-group totals.');
