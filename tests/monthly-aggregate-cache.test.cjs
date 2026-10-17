const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/market/workers/evolution-market-worker.js'),'utf8');
function api(oracle=false){const context=vm.createContext({console,DOMException,TextEncoder,TextDecoder,URL,AbortController,crypto:webcrypto,setTimeout});let code=source;if(oracle)code=code.replace('let contribution=aggregateCache.get(key);',`collectCube(target,await ensureCube(),selected,selectedRange,{...projection,onAcceptedRow:(_row,count,date,value)=>{if(membership)collectBrandMembership(membership,count,value);if(catalogExtra)collectCatalogRow(catalogExtra,count,date,value,columns.includes('bd_classe')?'bd_classe':'segmento');}});return;let contribution=aggregateCache.get(key);`);vm.runInContext(code.replace(/\}\)\(\);\s*$/,'globalThis.api={installMarketWorker,createMonthlyAggregateCache,createAccumulator,createCatalogExtras,collectCatalogRow,mergeCatalogExtras};})();'),context);return context.api;}
const cached=api(),oracle=api(true),portable=x=>JSON.parse(JSON.stringify(x));
const months=['2025-01','2025-02','2025-03','2026-01','2026-02','2026-03'];
function cube(month){const columns=['date','marca','modelo','grupo_modelo','segmento','uf','municipio','tipo_venda','bd_combustivel','bd_carroceria','bd_classe','bd_origem','regiao','combustivel','count'];const dictionaries=Object.fromEntries(columns.filter(d=>d!=='count').map(d=>[d,[]]));const rows=Array.from({length:48},(_,i)=>{const record={date:month+'-'+String(1+i%28).padStart(2,'0'),marca:['MITSUBISHI','TOYOTA',null][i%3],modelo:['Shared','Other','__proto__'][i%3],grupo_modelo:'Shared',segmento:i%5?'Auto':'Caminhão',uf:i%2?'SP':'RJ',municipio:'City',tipo_venda:['VD','VAREJO',null][i%3],bd_combustivel:i%2?'BEV':'DIESEL',bd_carroceria:'SUV',bd_classe:'SUV',bd_origem:i%2?'Nacional':'Importado',regiao:'SE',combustivel:'Diesel',count:i%7===0?0:i*3};return columns.map(d=>{if(d==='count')return record.count;let n=dictionaries[d].indexOf(record[d]);if(n<0){n=dictionaries[d].length;dictionaries[d].push(record[d]);}return n;});});return {month,columns,dictionaries,rows};}
const cubes=new Map(months.map(m=>[m,cube(m)]));
const manifest={expectedMonths:months,months:months.map(month=>({month,cubePath:month+'.json',originCubePath:month+'-origin.json',sha256:month,bdCoverage:true,scope:[{segment:'Auto'},{segment:'Caminhão'}],channelSourceFields:['CANAL']}))};
const all={includeCatalog:true,includeMitsubishiProfile:true,includeInteractive:true,includeHistoryComparisons:true,includeOriginAnalysis:true,includeMarketBaseline:true,includeChannelReference:true};
function runner(implementation,options={}){const messages=[],loads=[],port={postMessage:m=>messages.push(m)};const handle=implementation.installMarketWorker(port,{loader:{load:async meta=>{loads.push(meta.month);return cubes.get(meta.month);},setNamespace(){},clear(){},stats(){return {}; }},yieldControl:async()=>{},...options});return {loads,handle,port,async query(filters,flags=all,sourceManifest=manifest){await port.onmessage({data:{id:messages.length,manifest:sourceManifest,filters,base:'https://example.com/data/',...flags}});const last=messages.at(-1);assert(!last.error,last.error);assert(last.result);return portable(last.result);}};}
(async()=>{
 const warm=runner(cached),fresh=runner(oracle);
 for(const filters of [
  {date:'2026-01',population:'light'},
  {date:'2026-01..2026-02',population:'light'},
  {date:'2026-01-10..2026-03-15',population:'light'},
  {date:'2026-01..2026-03',population:'light'},
  {date:'2026-01..2026-03',population:'light',marca:['TOYOTA','MITSUBISHI'],tipo_venda:['VD'],uf:['SP','RJ']},
  {date:'2026-01..2026-03',population:'light',marca:['MITSUBISHI','TOYOTA'],tipo_venda:'VD',uf:['RJ','SP']},
  {date:'2026-03-01..2026-03-17',marca:'Absent'},
  {date:'2026-01..2026-04',bd_origem:['Nacional']},
  {date:'2026-01..2026-03',marca:['Não informado']},
 ])assert.deepEqual(await warm.query(filters),await fresh.query(filters));
 assert(warm.handle.cacheStats().aggregates.hits>0);
 // With complete previous/prior-year support, extension must load only its new
 // month and new prior-year month. Old source rows and gzip need not be loaded.
 const incremental=runner(cached);await incremental.query({date:'2026-01'});incremental.loads.length=0;
 await incremental.query({date:'2026-01..2026-02'});assert.deepEqual(incremental.loads,['2025-02','2026-02']);
 const before=incremental.handle.cacheStats().aggregates.hits;
 await incremental.query({date:'2026-01..2026-02'},{});assert(incremental.handle.cacheStats().aggregates.hits>=before);
 // Persistence adapter round trip, fresh worker, and source-version isolation.
 const disk=new Map(),store={get:async k=>disk.get(k),set:async(k,v)=>disk.set(k,v),clear:async()=>disk.clear()};
 const first=runner(cached,{aggregateStore:store});const expected=await first.query({date:'2026-01'});
 const second=runner(cached,{aggregateStore:store});assert.deepEqual(await second.query({date:'2026-01'}),expected);assert.equal(second.loads.length,0);
 const changed={...manifest,revision:2};assert.deepEqual(await second.query({date:'2026-01'},all,changed),await runner(oracle).query({date:'2026-01'},all,changed));assert(second.loads.length>0);
 await second.port.onmessage({data:{type:'clear-cache'}});assert.equal(disk.size,0);assert.equal(second.handle.cacheStats().aggregates.entries,0);
 const corrupted=runner(cached,{aggregateStore:{get:async()=>({version:1,safe:true,acc:{total:1}}),set:async()=>{}}});assert.deepEqual(await corrupted.query({date:'2026-01'}),expected);
 await first.handle.clear();assert.equal(disk.size,0);
 const partialManifest={...manifest,months:manifest.months.map(m=>m.month==='2026-03'?{...m,coverageEnd:'2026-03-17'}:m)};assert.deepEqual(await warm.query({date:'2026-01..2026-03'},all,partialManifest),await fresh.query({date:'2026-01..2026-03'},all,partialManifest));
 const broken=runner(cached,{aggregateStore:{get:async()=>{throw Error('blocked')},set:async()=>{throw Error('quota')}}});assert.deepEqual(await broken.query({date:'2026-01'}),expected);
 // LRU bounds, accounting Maps/Sets rather than serializing them as {}.
 const cache=cached.createMonthlyAggregateCache({maxEntries:2,maxBytes:300});cache.set('a',new Map([['large','x'.repeat(500)]]));assert.equal(cache.stats().entries,0);
 cache.set('a',{n:1});cache.set('b',{n:2});cache.get('a');cache.set('c',{n:3});assert.equal(cache.get('b'),null);assert.equal(cache.stats().entries,2);cache.clear();assert.equal(cache.stats().logicalBytes,0);
 // Overflow is all-or-nothing even when a bucket limit is crossed across months.
 const x=cached.createCatalogExtras(2),y=cached.createCatalogExtras(2);for(const [extra,names]of [[x,['A','B']],[y,['B','C']]])for(const name of names)cached.collectCatalogRow(extra,1,'2026-01-01',d=>d==='modelo'?name:d,'segmento');cached.mergeCatalogExtras(x,y);assert(x.overflow.has('segmentBrandModel'));assert.equal(x.joints.segmentBrandModel.size,0);
 // A noninteger/unsafe custom source falls back to original row-order summation.
 const original=cubes.get('2026-01');for(const counts of [[0.1,0.2,0.3],[Number.MAX_SAFE_INTEGER,1,1]]){const custom=cube('2026-01');custom.rows=custom.rows.slice(0,3);custom.rows.forEach((row,i)=>row[row.length-1]=counts[i]);cubes.set('2026-01',custom);assert.deepEqual(await runner(cached).query({date:'2026-01'}),await runner(oracle).query({date:'2026-01'}));}cubes.set('2026-01',original);
 console.log('PASS: exact monthly cache equivalence, all projections/filters, partial days, comparisons, unknown/zero/missing values, incremental loads, persistence fallback/versioning, LRU and overflow.');
})().catch(error=>{console.error(error);process.exitCode=1;});
