const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../src/market/modules/animations-worker.js');
const months=['2025-01','2025-02','2025-03','2026-01','2026-02','2026-03'];
const meta=month=>({month,cubePath:month+'.json.gz',scope:[{segment:'Auto'}],channelSourceFields:['channel']});
const manifest={months:months.map(meta)};
function cube(month){return {month,columns:['date','marca','modelo','segmento','uf','municipio','bd_combustivel','bd_origem','tipo_venda','count'],dictionaries:{date:[month+'-01'],marca:['MITSUBISHI','OTHER'],modelo:['ONE','TWO'],segmento:['Auto'],uf:['SP'],municipio:['SAO PAULO'],bd_combustivel:['HEV','UNKNOWN'],bd_origem:['NACIONAL','IMPORTADO'],tipo_venda:['VD','Não informado']},rows:[[0,0,0,0,0,0,0,0,0,10+Number(month.slice(-2))],[0,1,1,0,0,0,1,1,1,7]]};}
const base={manifest,base:'https://source.example/data/',startMonth:'2026-02',endMonth:'2026-02',filters:{population:'light'},includeVehicleOrigin:false};
const geometry={uf:'SP',features:[{name:'SAO PAULO',uf:'SP',code:'3550308'}]};
const options={loadCube:async m=>cube(m.month),yieldControl:async()=>{},geometryLoader:async()=>geometry};
const views=[{}, {dataView:'races',dimension:'modelo'}, {dataView:'bubbles'}, {dataView:'mix',mixKind:'technology'}, {dataView:'mix',mixKind:'origin'}, {dataView:'maps',mapMetric:'mitShare'}, {dataView:'maps',mapMetric:'municipality',selectedUF:'SP'}];
test('Monthly cache cold/warm/range extension matches uncached results across projections, YTD and YoY',async()=>{
 for(const view of views){let loads=0;const monthlyCache=W.createMonthlyFrameCache({persistent:null});const cachedOptions={...options,monthlyCache,loadCube:async m=>{loads++;return cube(m.month);}};
  for(const mode of ['monthly','ytd']){
   const input={...base,...view,mode};
   const expected=await W.runAnimations(input,options);assert.deepEqual(await W.runAnimations(input,cachedOptions),expected);
   const before=loads;assert.deepEqual(await W.runAnimations(input,cachedOptions),expected);assert.equal(loads,before,'warm run should not load cubes');
   const extended={...input,endMonth:'2026-03'};assert.deepEqual(await W.runAnimations(extended,cachedOptions),await W.runAnimations(extended,options));
   assert.equal(loads-before,mode==='monthly'?2:0,'only new current/prior months should load');
  }
  assert(monthlyCache.stats().hits>0);
 }
});
test('Cache identity isolates source, filters, projection, presets, origins, coverage and selected UF',async()=>{
 const monthlyCache=W.createMonthlyFrameCache({persistent:null});let loads=0;const opt={...options,monthlyCache,loadCube:async m=>{loads++;return cube(m.month);}};
 const input={...base,includeYoY:false,dataView:'races'};await W.runAnimations(input,opt);
 for(const delta of [{filters:{population:'all'}},{filters:{population:'light',marca:['MITSUBISHI']}},{dimension:'modelo'},{dataView:'maps'},{selectedUF:'SP'},{preset:'suv'},{porte:['MID']},{includeVehicleOrigin:true},{originMapping:{brands:{}}},{manifest:{...manifest,version:2}}]){
  const before=loads,q={...input,...delta};assert.deepEqual(await W.runAnimations(q,opt),await W.runAnimations(q,options));assert.equal(loads,before+1,JSON.stringify(delta));
 }
 const before=loads;await W.runAnimations({...input,filters:{date:'2020-01-01',population:'light'}},opt);assert.equal(loads,before,'replaced date does not invalidate monthly aggregates');
});
test('Partial, missing, scope-changed and unknown data remain exact after monthly cache reuse',async()=>{
 const variants=[{months:manifest.months.map(m=>m.month==='2026-02'?{...m,partialMonth:true}:m)}, {months:manifest.months.filter(m=>m.month!=='2026-01')}, {months:manifest.months.map(m=>m.month==='2025-02'?{...m,scope:[{segment:'Comercial Leve'}]}:m)}];
 for(const manifest of variants){const input={...base,manifest,mode:'ytd',dataView:'maps'};const opt={...options,monthlyCache:W.createMonthlyFrameCache({persistent:null})};const expected=await W.runAnimations(input,options);assert.deepEqual(await W.runAnimations(input,opt),expected);assert.deepEqual(await W.runAnimations(input,opt),expected);}
});
test('Persistent monthly cache survives a new memory cache; failures degrade and memory stays bounded',async()=>{
 const store=new Map(),persistent={get:async k=>structuredClone(store.get(k)),set:async(k,v)=>store.set(k,structuredClone(v))};
 const input={...base,dataView:'races'};const first=W.createMonthlyFrameCache({persistent});const expected=await W.runAnimations(input,{...options,monthlyCache:first});
 const second=W.createMonthlyFrameCache({persistent});assert.deepEqual(await W.runAnimations(input,{...options,monthlyCache:second,loadCube:async()=>{throw Error('Should not read source');}}),structuredClone(expected));assert.equal(second.stats().persistentHits,2);
 const broken=W.createMonthlyFrameCache({maxBytes:4096,maxEntries:1,persistent:{get:async()=>{throw Error('blocked');},set:async()=>{throw Error('quota');}}});
 assert.deepEqual(await W.runAnimations(input,{...options,monthlyCache:broken}),expected);assert(broken.stats().logicalBytes<=4096);assert(broken.stats().entries<=1);
});
test('Transient source failures are retried rather than retained as monthly results',async()=>{
 const monthlyCache=W.createMonthlyFrameCache({persistent:null}),input={...base,includeYoY:false};const failed=await W.runAnimations(input,{...options,monthlyCache,loadCube:async()=>{throw Error('offline');}});assert.equal(failed.frames[0].coverageStatus,'unavailable');
 assert.deepEqual(await W.runAnimations(input,{...options,monthlyCache}),await W.runAnimations(input,options));
});
test('Explicit persistent clear orders behind pending writes and rejects malformed persisted entries',async()=>{
 const store=new Map(),persistent={get:async k=>store.get(k),set:async(k,v)=>store.set(k,v),clear:async()=>store.clear()},cache=W.createMonthlyFrameCache({persistent});
 await W.runAnimations({...base,includeYoY:false,dataView:'races'},{...options,monthlyCache:cache});assert.equal(store.size,1);
 for(const [key,value] of store)store.set(key,{...value,frame:{...value.frame,groups:null}});
 cache.clear();let loads=0;await W.runAnimations({...base,includeYoY:false,dataView:'races'},{...options,monthlyCache:cache,loadCube:async m=>{loads++;return cube(m.month);}});assert.equal(loads,1);
 const writing=cache.set('test',{version:1,frame:{},choices:{}}),clearing=cache.clear({persistent:true});await Promise.all([writing,clearing]);assert.equal(store.size,0);assert.equal(cache.stats().entries,0);
});
test('Worker cancellation during persistent write suppresses stale results and clear removes the write',async()=>{
 let release,started;const begun=new Promise(r=>started=r),held=new Promise(r=>release=r),store=new Map();
 const monthlyCache=W.createMonthlyFrameCache({persistent:{get:async k=>store.get(k),set:async(k,v)=>{started();await held;store.set(k,v);},clear:async()=>store.clear()}}),messages=[],port={postMessage:m=>messages.push(m)};
 W.installAnimationWorker(port,{monthlyCache,identity:async v=>JSON.stringify(v),loader:{load:async m=>cube(m.month),clear(){},setNamespace(){},stats(){return {};}},yieldControl:async()=>{}});
 const pending=port.onmessage({data:{...base,id:1,type:'animations',includeYoY:false}});await begun;const clearing=port.onmessage({data:{type:'clear-cache'}});release();await Promise.all([pending,clearing]);assert(!messages.some(m=>m.result||m.error));assert.equal(store.size,0);assert.equal(monthlyCache.stats().entries,0);
});
