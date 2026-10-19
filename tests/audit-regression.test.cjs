// Regression for the 2026-10-19 production audit: the audit's own reference numbers, run against the real data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),zlib=require('zlib'),path=require('path'),vm=require('vm'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),data=p=>path.join(root,'data',p);
const CR=require('../src/market/modules/competitive-reading.js'),HX=require('../src/market/modules/history-analyses.js'),PM=require('../src/market/modules/market-pulse.js');

test('AT-03: one complete population for every map (5.571 municipalities, Brazil 214.211.951, RO 1.757.338)',()=>{
 const pop=HX.hxPopulationFromCatalog(JSON.parse(fs.readFileSync(data('geography/catalog-population.json'),'utf8')));
 assert.equal(pop.municipalities.length,5571);assert.equal(new Set(pop.municipalities.map(m=>m[0])).size,5571);
 assert.equal(Object.values(pop.states).reduce((a,b)=>a+b,0),214211951);assert.equal(pop.states.RO,1757338);
 for(const uf of Object.keys(pop.states))assert.equal(pop.municipalities.filter(m=>m[2]===uf).reduce((s,m)=>s+m[3],0),pop.states[uf],'municipalities add up to the state '+uf);
 const rate=1679/pop.states.RO*1000;assert(Math.abs(rate-0.9554)<0.001,'RO rate '+rate);
});

test('AT-08: no market total (channel absent from the source) makes the brand unavailable, not zero',()=>{
 const market={total:null,groups:{marca:[]},range:{start:'2016-01-01',end:'2016-01-31'}};
 const m=PM.pulseModel(market,{total:0,year:0,yearChangeRate:null,groups:{}},'MITSUBISHI',{date:'2016-01-01..2016-01-31'});
 assert.equal(m.focusTotal,null);assert.equal(m.share,null);
 const ok=PM.pulseModel({total:100,groups:{marca:[{name:'MITSUBISHI',count:0}]}},{total:0,groups:{}},'MITSUBISHI',{});
 assert.equal(ok.focusTotal,0,'a really empty cut may show zero');
});

test('AT-02: Outlander stays found, ranked and shared when it is outside the visible Top 12',async()=>{
 const html=require('./lib/assembled.cjs')();
 const worker=[...html.matchAll(/new Blob\(\[("(?:[^"\\]|\\.)*")\]/g)].map(m=>JSON.parse(m[1])).find(w=>w.includes('installExplorationWorker'));
 const ctx=vm.createContext({console,DOMException,TextEncoder,URL,AbortController,crypto:webcrypto,setTimeout});
 vm.runInContext(worker.replace(/\}\)\(\);\s*$/,'globalThis.api={installExplorationWorker};})();'),ctx);
 const manifest=JSON.parse(fs.readFileSync(data('manifest.json')));manifest.months=manifest.months.filter(m=>m.month==='2026-09');manifest.expectedMonths=['2026-09'];
 const cube=JSON.parse(zlib.gunzipSync(fs.readFileSync(data(manifest.months[0].cubePath))));
 const loader={load:async()=>cube,setNamespace(){},clear(){},stats(){return {};}};
 const run=async limit=>{const out=[],port={postMessage:m=>out.push(m)};ctx.api.installExplorationWorker(port,{loader});
  await port.onmessage({data:{id:1,type:'explore',manifest,base:'https://example.com/data/',filters:{date:'2026-09-01..2026-09-30',population:'light',bd_segmento:'MID',bd_carroceria:'SUV'},xDimension:'grupo_modelo',seriesDimension:null,topN:1,xTopN:limit,order:'value_desc',includeOthers:true,highlightBrands:['MITSUBISHI']}});
  for(let i=0;i<200&&!out.some(m=>m.result||m.error);i++)await new Promise(r=>setTimeout(r,25));
  const last=out.find(m=>m.result||m.error);assert(!last.error,last.error);return last.result;};
 const full=CR.crModelRanking(await run(CR.CR_MODEL_LIMIT));
 assert.equal(full.total,20846,'MID+SUV universe');
 const mit=full.rows.filter(r=>r.mitsubishi&&/OUTLANDER/.test(r.model));
 assert(mit.length>=1,'Outlander groups are present');
 const volume=mit.reduce((s,r)=>s+r.count,0);assert.equal(volume,95,'Outlander volume');
 assert(mit.every(r=>r.rank>12),'Outlander really sits below the Top 12 cut (the audit case)');
 // The old Top-12 request is what produced the false zero: Outlander was folded into "Outros".
 const cut=CR.crModelRanking(await run(12));assert.equal(cut.rows.filter(r=>r.mitsubishi&&/OUTLANDER/.test(r.model)).length,0,'documents the old failure');
 const shown=CR.crDisplayRows(full.rows);
 assert(shown.length<full.rows.length&&shown.filter(r=>r.mitsubishi&&/OUTLANDER/.test(r.model)).length===mit.length,'visible list is short but keeps Outlander with its real rank');
});
