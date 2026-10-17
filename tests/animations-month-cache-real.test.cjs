const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{performance}=require('node:perf_hooks');
const W=require('../src/market/modules/animations-worker.js');
const data=path.join(__dirname,'../data'),manifest=JSON.parse(fs.readFileSync(path.join(data,'manifest.json')));
test('Reviewed actual cubes: cold/warm/extended range have identical complete numerical results',async t=>{
 const cache=W.createMonthlyFrameCache({persistent:null});let loads=0;
 const loadCube=async meta=>{loads++;return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(data,meta.cubePath))));};
 const options={loadCube,yieldControl:async()=>{}};
 const input={manifest,base:'https://source.example/data/',startMonth:'2026-08',endMonth:'2026-08',dataView:'races',dimension:'marca',includeVehicleOrigin:false,filters:{population:'light'},includeYoY:true};
 const start=performance.now(),cold=await W.runAnimations(input,{...options,monthlyCache:cache}),coldMs=performance.now()-start;
 const count=loads,warmStart=performance.now(),warm=await W.runAnimations(input,{...options,monthlyCache:cache}),warmMs=performance.now()-warmStart;assert.deepEqual(warm,cold);assert.equal(loads,count);
 const extended={...input,endMonth:'2026-09'},extStart=performance.now(),actual=await W.runAnimations(extended,{...options,monthlyCache:cache}),extendedMs=performance.now()-extStart;assert.equal(loads-count,2);
 assert.deepEqual(actual,await W.runAnimations(extended,options));assert.equal(actual.frames[1].total,268721);assert.equal(actual.frames[1].priorTotal,231370);assert.equal(actual.frames[1].entities.find(r=>r.name==='MITSUBISHI').count,1729);
 t.diagnostic(JSON.stringify({coldMs,warmMs,extendedMs,coldSourceMonths:count,extensionNewSourceMonths:2,cache:cache.stats()}));
});
