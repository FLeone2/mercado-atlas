const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const PerformanceCache=require('../src/market/workers/performance-cache.js');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/market/workers/evolution-market-worker.js'),'utf8');
function implementation(oracle=false){let code=source;if(oracle)code=code.replace('let contribution=aggregateCache.get(key);',`collectCube(target,await ensureCube(),selected,selectedRange,{...projection,onAcceptedRow:(_row,count,date,value)=>{if(membership)collectBrandMembership(membership,count,value);if(catalogExtra)collectCatalogRow(catalogExtra,count,date,value,columns.includes('bd_classe')?'bd_classe':'segmento');}});return;let contribution=aggregateCache.get(key);`);return Function('return '+code.replace(/\}\)\(\);\s*$/,'return {installMarketWorker,createMonthlyAggregateCache};})();'))();}
const cached=implementation(),uncached=implementation(true);
const complete=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json'))),months=['2025-08','2025-09','2026-08','2026-09'];
const manifest={...complete,expectedMonths:months,months:complete.months.filter(m=>months.includes(m.month))};
function runner(api,{aggregateStore=null,aggregateCache}={}){const loads=[],messages=[],port={postMessage:m=>messages.push(m)};const handle=api.installMarketWorker(port,{resultCache:{get:()=>null,set(){},clear(){},stats:()=>({disabled:true})},aggregateStore,...(aggregateCache?{aggregateCache}:{}),yieldControl:async()=>{},loader:{async load(meta){loads.push(meta.month);return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',meta.cubePath))));},setNamespace(){},clear(){},stats:()=>({decodedCacheDisabled:true})}});return {loads,handle,async query(date,options){loads.length=0;const start=performance.now();await port.onmessage({data:{id:messages.length,manifest,base:'https://example.com/data/',filters:{date,population:'light'},...options}});const response=messages.at(-1);assert(response.result,response.error);return {result:response.result,milliseconds:Number((performance.now()-start).toFixed(2)),sourceLoads:[...loads]};}};}
(async()=>{
 const diagnostics={environment:'local Node; gzip parsing included; exact result cache and decoded cube cache disabled; not browser timings',profiles:[]};
 for(const [name,flags]of [['market',{}],['catalog_mitsubishi',{includeCatalog:true,includeMitsubishiProfile:true}]]){
  const warm=runner(cached),reference=runner(uncached);
  const cold=await warm.query('2026-08',flags),again=await warm.query('2026-08',flags),extended=await warm.query('2026-08..2026-09',flags),fresh=await reference.query('2026-08..2026-09',flags);
  assert.deepEqual(again.result,cold.result);assert.deepEqual(extended.result,fresh.result);assert.deepEqual(again.sourceLoads,[]);assert.deepEqual(extended.sourceLoads,['2025-09','2026-09']);
  diagnostics.profiles.push({name,coldMs:cold.milliseconds,warmMs:again.milliseconds,extendMs:extended.milliseconds,uncachedExtendedMs:fresh.milliseconds,coldLoads:cold.sourceLoads,warmLoads:again.sourceLoads,extendedLoads:extended.sourceLoads,total:extended.result.total,sourceRows:extended.result.sourceRows,aggregateCache:warm.handle.cacheStats().aggregates});
 }
 // Exercise the actual production helper (Maps/Sets structured-cloned), not an
 // injected Map stub. Node has no IndexedDB: this verifies its memory fallback.
 const aggregateStore=PerformanceCache.createPersistentCache({namespace:'market-monthly-real-integration-v1',maxBytes:48*1024*1024,maxEntries:384});
 const storeRunner=()=>runner(cached,{aggregateStore,aggregateCache:cached.createMonthlyAggregateCache({maxEntries:0})});
 const first=storeRunner(),cold=await first.query('2026-08',{includeMitsubishiProfile:true});
 const second=storeRunner(),restored=await second.query('2026-08',{includeMitsubishiProfile:true});
 assert.deepEqual(restored.result,cold.result);assert.deepEqual(restored.sourceLoads,[]);assert(aggregateStore.stats().hits>0);assert(aggregateStore.stats().entries>0);
 diagnostics.productionHelper={coldMs:cold.milliseconds,restoredMs:restored.milliseconds,restoredSourceLoads:restored.sourceLoads,stats:aggregateStore.stats(),note:'Production structuredClone and bounded memory fallback verified; browser IndexedDB is covered separately.'};
 await second.handle.clear();assert.equal(aggregateStore.stats().entries,0);
 console.log(JSON.stringify(diagnostics,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
