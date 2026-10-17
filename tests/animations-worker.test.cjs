const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib'),W=require('../src/market/modules/animations-worker.js');
const makeCube=(month,n=3)=>({month,columns:['date','marca','segmento','count'],dictionaries:{date:[month+'-01'],marca:['MITSUBISHI'],segmento:['Auto']},rows:[[0,0,0,n]]});
const makeMeta=month=>({month,cubePath:month+'.json.gz',scope:[{segment:'Auto'}]});
const request=(id,extra={})=>({data:{id,type:'animations',base:'https://source.example/data/',manifest:{months:[makeMeta('2026-01')]},start:'2026-01',end:'2026-01',includeYoY:false,filters:{population:'light'},...extra}});
const fakeLoader=load=>({load,clear(){},setNamespace(){},stats(){return {};}});
const identity=async(value,base)=>base+'|'+JSON.stringify(value);
function setup(loader){const messages=[],port={postMessage:value=>messages.push(value)};const api=W.installAnimationWorker(port,{loader,identity,yieldControl:async()=>{}});return {port,messages,api};}

test('Latest request wins even when old fetch ignores abort',async()=>{
 let release,started;const begun=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve);let first=true;
 const t=setup(fakeLoader(async meta=>{if(first){first=false;started();await held;return makeCube(meta.month,2);}return makeCube(meta.month,9);}));
 const old=t.port.onmessage(request(1));await begun;await t.port.onmessage(request(2));release();await old;
 assert(!t.messages.some(m=>m.id===1&&(m.result||m.error)));assert.equal(t.messages.find(m=>m.id===2&&m.result).result.frames[0].total,9);
});

test('Cancel and cache clear suppress pending stale terminal messages',async()=>{
 for(const type of ['cancel','clear-cache']){let release,started;const begun=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve);const t=setup(fakeLoader(async meta=>{started();await held;return makeCube(meta.month);}));const old=t.port.onmessage(request(1));await begun;await t.port.onmessage({data:{type,releaseCubes:true}});release();await old;assert(!t.messages.some(m=>m.id===1&&(m.result||m.error)),type);}
});

test('Result cache includes scope, window, population, origin mapping and source identity',async()=>{
 let loads=0;const t=setup(fakeLoader(async meta=>{loads++;return makeCube(meta.month);}));await t.port.onmessage(request(1));await t.port.onmessage(request(2));assert.equal(loads,1);
 await t.port.onmessage(request(3,{filters:{population:'all'}}));assert.equal(loads,2);
 await t.port.onmessage(request(4,{originMapping:{brands:{MITSUBISHI:{sourceUrl:'https://example.org',chineseOrigin:false}}}}));assert.equal(loads,3);
 await t.port.onmessage(request(5,{manifest:{version:2,months:[makeMeta('2026-01')]}}));assert.equal(loads,4);
});

test('Cube loader validates gzip and calendar data, caches lazily, and obeys memory bounds',async()=>{
 let calls=0;const loader=W.createMarketCubeLoader({origin:'https://source.example',maxCells:8,maxCompressedBytes:100000,fetchImpl:async url=>{calls++;const month=url.pathname.includes('2026-02')?'2026-02':'2026-01';return new Response(zlib.gzipSync(JSON.stringify(makeCube(month))));}});
 await loader.load(makeMeta('2026-01'),'https://source.example/data/');await loader.load(makeMeta('2026-01'),'https://source.example/data/');assert.equal(calls,1);
 await loader.load(makeMeta('2026-02'),'https://source.example/data/');assert(loader.stats().cells<=8);assert(loader.stats().compressedBytes<=100000);assert.equal(calls,2);
 loader.setNamespace('new');assert.equal(loader.stats().cells,0);assert.equal(loader.stats().compressedEntries,0);
 const bad=makeCube('2026-01');bad.dictionaries.date=['2026-01-32'];assert.throws(()=>W.validateMonthlyCube(bad,makeMeta('2026-01')),/Data/);
 bad.dictionaries.date=['2026-01-01'];bad.rows[0][3]=-3;assert.throws(()=>W.validateMonthlyCube(bad,makeMeta('2026-01')),/Valor/);
});

test('Cube loader rejects cross-origin, credential-bearing and non-http URLs before fetch',async()=>{
 let calls=0;const loader=W.createMarketCubeLoader({origin:'https://source.example',fetchImpl:async()=>{calls++;return new Response('{}');}});
 await assert.rejects(()=>loader.load({...makeMeta('2026-01'),cubePath:'https://other.example/cube'},'https://source.example/data/'),/mesma origem/);
 await assert.rejects(()=>loader.load(makeMeta('2026-01'),'https://user:pass@source.example/data/'),/Credenciais/);
 await assert.rejects(()=>loader.load(makeMeta('2026-01'),'file:///data/'),/mesma origem/);assert.equal(calls,0);
});

test('Loader epoch retires a pending response after cache clear',async()=>{
 let release,started;const begun=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve);const loader=W.createMarketCubeLoader({origin:'https://source.example',fetchImpl:async()=>{started();await held;return new Response(JSON.stringify(makeCube('2026-01')));}});
 const load=loader.load(makeMeta('2026-01'),'https://source.example/data/');await begun;loader.clear();release();await assert.rejects(()=>load,{name:'AbortError'});assert.equal(loader.stats().cells,0);
});

test('Oversized result cache rejects before full serialization, encoding, or later getters',()=>{
 const limit=24*1024*1024,cache=W.createResultCache({maxBytes:limit}),value={huge:'x'.repeat(13*1024*1024),get shouldNotBeRead(){throw Error('Traversal did not stop at budget');}};
 const stringify=JSON.stringify,encoder=global.TextEncoder;JSON.stringify=()=>{throw Error('Cache must not serialize');};global.TextEncoder=function(){throw Error('Cache must not encode a full result');};
 try {cache.set('oversized',value);assert.equal(cache.get('oversized'),null);assert.equal(cache.stats().entries,0);assert.equal(cache.stats().logicalBytes,0);assert(W.boundedResultSize(value,limit)>limit);}finally{JSON.stringify=stringify;global.TextEncoder=encoder;}
});

test('Result size estimator recognizes shared aliases/cycles and bounded cache eviction',()=>{
 const shared={name:'same row',values:[1,2,3]},once={frames:[shared]},aliased={frames:[shared],monthlyFrames:[shared]};aliased.self=aliased;
 const a=W.boundedResultSize(once,100000),b=W.boundedResultSize(aliased,100000);assert(b>a);assert(b<a*2);const cache=W.createResultCache({maxBytes:2000,maxEntries:1});cache.set('one',once);cache.set('two',aliased);assert.equal(cache.get('one'),null);assert.strictEqual(cache.get('two'),aliased);assert(cache.stats().logicalBytes<=2000);
});
