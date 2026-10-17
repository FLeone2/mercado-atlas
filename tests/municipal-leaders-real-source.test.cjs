// Municipality × brand through the real market worker and cubes: totals and leaders must be exact.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),html=require('./lib/assembled.cjs')();
const worker=[...html.matchAll(/new Blob\(\[("(?:[^"\\]|\\.)*")\]/g)].map(m=>JSON.parse(m[1])).find(w=>w.includes('installMarketWorker'));
assert(worker.includes('includeMunicipalLeaders'),'built index embeds the leader aggregation');
const context=vm.createContext({console,DOMException,TextEncoder,URL,AbortController,crypto:webcrypto,setTimeout});vm.runInContext(worker.replace(/\}\)\(\);\s*$/,'globalThis.api={installMarketWorker};})();'),context);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json')));manifest.months=manifest.months.filter(m=>m.month==='2026-09');manifest.expectedMonths=['2026-09'];
const cube=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',manifest.months[0].cubePath)))),cols=Object.fromEntries(cube.columns.map((c,i)=>[c,i]));
const loader={load:async()=>cube,setNamespace(){},clear(){},stats(){return {};}};
async function run(filters,extra={}){const messages=[],port={postMessage:m=>messages.push(m)};context.api.installMarketWorker(port,{loader});await port.onmessage({data:{id:1,manifest,base:'https://example.com/data/',filters:{date:'2026-09',population:'light',...filters},...extra}});const r=messages.findLast(m=>m.result||m.error);assert(!r.error,r.error);return JSON.parse(JSON.stringify(r.result));}
(async()=>{
 const withLeaders=await run({uf:['MG']},{includeMunicipalLeaders:true}),plain=await run({uf:['MG']});
 assert.equal(plain.municipalBrands,undefined,'only requested');
 // Independent count straight from the cube.
 const D=cube.dictionaries,expected=new Map();let total=0;
 for(const r of cube.rows){if(D.uf[r[cols.uf]]!=='MG')continue;if(!['Auto','Comercial Leve'].includes(D.segmento[r[cols.segmento]]))continue;const k=D.municipio[r[cols.municipio]]+'|'+D.marca[r[cols.marca]];expected.set(k,(expected.get(k)??0)+r[cols.count]);total+=r[cols.count];}
 assert.equal(withLeaders.total,total);
 const got=new Map(withLeaders.municipalBrands.map(r=>[r.municipio+'|'+r.marca,r.count]));
 assert.equal(got.size,expected.size);for(const [k,v] of expected)assert.equal(got.get(k),v,k);
 assert.equal(withLeaders.municipalBrands.reduce((s,r)=>s+r.count,0),withLeaders.total,'every registration belongs to one municipality and brand');
 // Channel filter composes: Varejo only.
 const varejo=await run({uf:['MG'],tipo_venda:['VAREJO']},{includeMunicipalLeaders:true});
 assert(varejo.total<withLeaders.total&&varejo.municipalBrands.reduce((s,r)=>s+r.count,0)===varejo.total);
 // Porte filter (picape média) + varejo + brand filter released by the caller: counts equal the cube.
 const pick=await run({uf:['MG'],tipo_venda:['VAREJO'],bd_segmento:['PICK-UP MID']},{includeMunicipalLeaders:true}),want=new Map();
 for(const r of cube.rows){if(D.uf[r[cols.uf]]!=='MG'||D.tipo_venda[r[cols.tipo_venda]]!=='VAREJO'||D.bd_segmento[r[cols.bd_segmento]]!=='PICK-UP MID'||!['Auto','Comercial Leve'].includes(D.segmento[r[cols.segmento]]))continue;const k=D.municipio[r[cols.municipio]]+'|'+D.marca[r[cols.marca]];want.set(k,(want.get(k)??0)+r[cols.count]);}
 assert.equal(pick.municipalBrands.length,want.size);for(const r of pick.municipalBrands)assert.equal(want.get(r.municipio+'|'+r.marca),r.count);
 const bh=withLeaders.municipalBrands.filter(r=>r.municipio==='BELO HORIZONTE').sort((a,b)=>b.count-a.count);assert(bh.length>10&&bh[0].count>bh[1].count);
 console.log('PASS municipal leaders: municipality × brand equals the cube for MG, composes with channel, leader of BH =',bh[0].marca);
})().catch(e=>{console.error(e);process.exit(1);});
