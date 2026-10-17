const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),html=require('./lib/assembled.cjs')();
const worker=[...html.matchAll(/new Blob\(\[("(?:[^"\\]|\\.)*")\]/g)].map(m=>JSON.parse(m[1])).find(w=>w.includes('installMarketWorker'));
assert(worker?.includes('finishInteractive'),'Built index must embed interactive worker');
const context=vm.createContext({console,DOMException,TextEncoder,URL,AbortController,crypto:webcrypto,setTimeout});vm.runInContext(worker.replace(/\}\)\(\);\s*$/,'globalThis.api={installMarketWorker};})();'),context);
const {evolutionBrushSummary}=require('../src/market/modules/evolution-brush.js');
const years=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'src/market/modules/evolution-years.js'),'utf8')+';globalThis.api={evolutionYearRows,evolutionYearCommon};',years);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json')));manifest.months=manifest.months.filter(m=>['2025-09','2026-09'].includes(m.month));manifest.expectedMonths=manifest.months.map(m=>m.month);
const cubes=new Map(),read=meta=>{if(!cubes.has(meta.month))cubes.set(meta.month,JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',meta.cubePath)))));return cubes.get(meta.month);};
const loader=load=>({load:load??(async meta=>read(meta)),setNamespace(){},clear(){},stats(){return {};}}),plain=x=>JSON.parse(JSON.stringify(x));
function makePort(customLoader){const messages=[],port={postMessage:m=>messages.push(m)};context.api.installMarketWorker(port,{loader:customLoader??loader()});return {port,messages};}
const request=(id,filters)=>({data:{id,manifest,base:'https://example.com/data/',filters:{date:'2026-09',population:'light',...filters},includeInteractive:true}});
async function query(filters){const {port,messages}=makePort();await port.onmessage(request(1,filters));const response=messages.findLast(m=>m.result||m.error);assert(response);assert(!response.error,response.error);return plain(response.result.interactive);}
(async()=>{
 const national=await query(),mit=await query({marca:['MITSUBISHI']});assert.equal(national.total,268721);assert.equal(mit.total,1729);
 for(const snapshot of [national,mit])for(const dim of ['bd_carroceria','bd_segmento','combustivel','marca']){const sum=rows=>rows.reduce((s,r)=>s+r.count,0);assert.equal(sum(snapshot.monthlyGroups[dim]),snapshot.total);const brush=evolutionBrushSummary(snapshot,dim,['2026-09','2026-09']);assert(brush.complete);assert.equal(brush.total,snapshot.total);assert.equal(sum(brush.rows),snapshot.total);for(const row of brush.rows)assert.equal(row.share,row.count/snapshot.total);assert(Math.abs(brush.rows.reduce((s,r)=>s+r.share,0)-1)<1e-12);}
 assert.equal(evolutionBrushSummary(national,'marca',null).rows.find(r=>r.name==='MITSUBISHI').share,1729/268721);assert.deepEqual(mit.filters.marca,['MITSUBISHI']);assert.equal(evolutionBrushSummary(mit,'marca',null).rows[0].share,1);
 const both=await query({date:'2025-09..2026-09'}),rows=years.api.evolutionYearRows(both),common=plain(years.api.evolutionYearCommon(rows,['2025','2026']));assert.deepEqual(common.months,[8]);assert.deepEqual(common.totals.map(r=>r.count),[231370,268721]);assert.equal(both.monthly.length,13);assert.equal(both.monthly.filter(r=>r.count===null).length,11);assert.equal(evolutionBrushSummary(both,'marca',null).complete,false);assert.equal(evolutionBrushSummary(both,'marca',['2026-09','2026-09']).total,268721);
 // A transport ignoring abort still cannot publish an obsolete result.
 let release,startedResolve;const started=new Promise(r=>startedResolve=r),held=new Promise(r=>release=r);let first=true;
 const replacement=makePort(loader(async meta=>{if(first){first=false;startedResolve();await held;}return read(meta);}));
 const stale=replacement.port.onmessage(request(10,{}));await started;await replacement.port.onmessage(request(11,{marca:['MITSUBISHI']}));release();await stale;
 assert(!replacement.messages.some(m=>m.id===10&&(m.result||m.error)),'Replaced query must not publish stale terminal response');assert.equal(replacement.messages.find(m=>m.id===11&&m.result).result.interactive.total,1729);
 let releaseCancel,startCancel;const cancelStarted=new Promise(r=>startCancel=r),cancelHeld=new Promise(r=>releaseCancel=r);const cancel=makePort(loader(async meta=>{startCancel();await cancelHeld;return read(meta);}));const pending=cancel.port.onmessage(request(20,{}));await cancelStarted;await cancel.port.onmessage({data:{type:'cancel',releaseCubes:true}});releaseCancel();await pending;assert(!cancel.messages.some(m=>m.id===20&&(m.result||m.error)),'Canceled query must not publish terminal response');
 console.log('PASS: embedded interactive worker on September 2025/2026 real sources; national 268721, Mitsubishi 1729; four exact weighted compositions, local brush summaries, common September annual totals, replacement and cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
// Per-day composition (Explorar período · Dia): same totals as the monthly view, from real cubes.
(async()=>{
 const run=async filters=>{const {port,messages}=makePort();await port.onmessage({data:{...request(9,filters).data,includeDaily:true}});const response=messages.findLast(m=>m.result||m.error);assert(!response.error,response.error);return plain(response.result.interactive);};
 const day=await run({date:'2026-09'}),month=await query({date:'2026-09'}),sum=rows=>rows.reduce((s,r)=>s+r.count,0);
 assert.equal(day.daily.length,30);assert.equal(sum(day.daily),month.total);assert.equal(day.total,month.total);
 for(const dim of ['bd_carroceria','bd_segmento','combustivel','marca'])assert.equal(sum(day.dailyGroups[dim]),month.total,dim);
 assert.equal(month.daily,null,'daily data is requested explicitly');
 const mit=await run({date:'2026-09',marca:['MITSUBISHI']});assert.equal(sum(mit.dailyGroups.marca),1729);
 const pick=evolutionBrushSummary(day,'marca',['2026-09-01','2026-09-30'],'day');assert.equal(pick.total,month.total);assert.equal(pick.rows.find(r=>r.name==='MITSUBISHI').count,1729);
 console.log('PASS: real-source daily composition matches monthly totals for every dimension and brand filter.');
})().catch(e=>{console.error(e);process.exit(1);});
