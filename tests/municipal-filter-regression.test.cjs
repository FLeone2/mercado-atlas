// Exact-token regression for the reported Salvador map → chart failure.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {primaryMapCanonicalMunicipalityFilters:repair,primaryMapReadState}=require('../src/market/modules/primary-map-state.js');
assert.deepEqual(repair({uf:'BA',municipio:'SALVADOR · BA',marca:'FIAT'}),{uf:'BA',municipio:'SALVADOR',marca:'FIAT'});
assert.deepEqual(repair({uf:['BA'],municipio:['SALVADOR · BA','FEIRA DE SANTANA','SALVADOR · SP']}),{uf:['BA'],municipio:['SALVADOR','FEIRA DE SANTANA','SALVADOR · SP']});
assert.deepEqual(repair({uf:'all',municipio:'SALVADOR · BA'}),{uf:'all',municipio:'SALVADOR · BA'});
assert.deepEqual(repair({uf:'BA',municipio:'São José'}),{uf:'BA',municipio:'São José'});
const saved={version:1,view:{detail:'SALVADOR · BA'},context:{values:{uf:'BA',municipio:'SALVADOR · BA'},pending:[]}};
const restored=primaryMapReadState('?pm.geography='+encodeURIComponent(JSON.stringify(saved)),'geography');
assert.equal(restored.context.values.municipio,'SALVADOR');assert.equal(restored.view.detail,'SALVADOR · BA','Pinned display identity stays intact');
const mapContext=vm.createContext({});vm.runInContext(read('src/market/modules/primary-map.js')+';globalThis.value=primaryMapMunicipalFilterValue;',mapContext);
assert.equal(mapContext.value({name:'SALVADOR · BA',municipality:'Salvador'},'BA'),'SALVADOR','Use exact dictionary spelling, not IBGE display name');
assert.equal(mapContext.value({name:'SAO JOSE · SC',municipality:'São José'},'SC'),'SAO JOSE');
assert.equal(mapContext.value({name:'SALVADOR · BA'},'SP'),null);
const full=JSON.parse(read('data/manifest.json')),months=full.months.filter(m=>m.month>='2026-01'&&m.month<='2026-09');
const manifest={...full,months,expectedMonths:months.map(m=>m.month)};
const context=vm.createContext({console,DOMException,TextEncoder,TextDecoder,URL,AbortController,crypto:webcrypto,setTimeout});
vm.runInContext(read('src/market/workers/evolution-market-worker.js').replace(/\}\)\(\);\s*$/,'globalThis.api={installMarketWorker};})();'),context);
let independent=0;const messages=[],port={postMessage:m=>messages.push(m)};
context.api.installMarketWorker(port,{loader:{async load(meta){
 const cube=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',meta.cubePath))));
 const cols=cube.columns??[...cube.dimensions,'count'],index=name=>cols.indexOf(name),dict=cube.dictionaries;
 assert(!dict.municipio.includes('SALVADOR · BA'),'Decorated display value is absent from source dictionary');
 for(const row of cube.rows){if(dict.uf[row[index('uf')]]==='BA'&&dict.municipio[row[index('municipio')]]==='SALVADOR'&&['Auto','Comercial Leve'].includes(dict.segmento[row[index('segmento')]]))independent+=row[index('count')];}
 return cube;
},setNamespace(){},clear(){},stats(){return {};}}});
(async()=>{
 const filters=repair({date:'2026-01-01..2026-09-30',population:'light',uf:'BA',municipio:'SALVADOR · BA'});
 await port.onmessage({data:{id:1,manifest,base:'https://example.test/data/',filters}});
 const result=messages.findLast(m=>m.result||m.error);assert(result&&!result.error,result?.error);const data=result.result;
 assert.equal(independent,29320,'Independent weighted Jan–Sep Salvador/BA source total');
 assert.equal(data.total,independent,'Applied municipal filter retains all 29,320 registrations');
 assert.equal(data.daily.reduce((sum,r)=>sum+r.count,0),independent,'Daily chart reconciles with KPI');
 assert.equal(data.groups.marca.reduce((sum,r)=>sum+r.count,0),independent,'Brand chart reconciles with KPI');
 assert(data.groups.municipio.some(r=>r.name==='SALVADOR · BA'&&r.count===29320));
 console.log('PASS Salvador/BA Jan–Sep 2026: 29,320 source = filtered KPI = daily evolution = brands; exact spelling, legacy URL repair and mismatched-UF safety.');
})().catch(error=>{console.error(error);process.exitCode=1;});
