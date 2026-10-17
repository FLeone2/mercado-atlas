// Origin → channel → fuel → vehicle-type paths through the real worker and the real origin cube.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),html=require('./lib/assembled.cjs')();
const worker=[...html.matchAll(/new Blob\(\[("(?:[^"\\]|\\.)*")\]/g)].map(m=>JSON.parse(m[1])).find(w=>w.includes('installMarketWorker'));
const context=vm.createContext({console,DOMException,TextEncoder,URL,AbortController,crypto:webcrypto,setTimeout});vm.runInContext(worker.replace(/\}\)\(\);\s*$/,'globalThis.api={installMarketWorker};})();'),context);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json')));manifest.months=manifest.months.filter(m=>m.month==='2026-09');manifest.expectedMonths=['2026-09'];
const meta=manifest.months[0],cube=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',meta.originCubePath)))),ix=Object.fromEntries(cube.columns.map((c,i)=>[c,i])),D=cube.dictionaries;
const seen=[];const loader={load:async m=>{seen.push(m.cubePath);return cube;},setNamespace(){},clear(){},stats(){return {};}};
async function run(filters,extra={}){const messages=[],port={postMessage:m=>messages.push(m)};context.api.installMarketWorker(port,{loader});await port.onmessage({data:{id:1,manifest,base:'https://example.com/data/',filters:{date:'2026-09',population:'light',...filters},...extra}});const r=messages.findLast(m=>m.result||m.error);assert(!r.error,r.error);return JSON.parse(JSON.stringify(r.result));}
const FUEL={FFV:'Flex',GASOLINE:'Gasolina',ETANOL:'Etanol',DIESEL:'Diesel',MHEV:'Híbrido leve',HEV:'Híbrido',PHEV:'Híbrido plug-in',BEV:'Elétrico'};
(async()=>{
 const r=await run({},{includeFlow:true});
 assert(seen.every(p=>p===meta.originCubePath),'the flow reads the origin cube');
 assert.equal(r.flowPaths.reduce((s,x)=>s+x.count,0),r.total,'every registration is on exactly one path');assert.equal(r.total,268721);
 const by=(key)=>r.flowPaths.reduce((m,x)=>m.set(x[key],(m.get(x[key])??0)+x.count),new Map());
 // Independent totals from the cube.
 let imp=0,local=0,vd=0,varejo=0,flex=0,suv=0,pickMid=0;
 for(const row of cube.rows){if(!['Auto','Comercial Leve'].includes(D.segmento[row[ix.segmento]]))continue;const n=row[ix.count],o=D.bd_origem[row[ix.bd_origem]],c=D.tipo_venda[row[ix.tipo_venda]],f=D.bd_combustivel[row[ix.bd_combustivel]],k=D.bd_classe[row[ix.bd_classe]];
  if(o==='IMP')imp+=n;if(o==='LOCAL')local+=n;if(c==='VD')vd+=n;if(c==='VAREJO')varejo+=n;if(FUEL[f]==='Flex')flex+=n;if(/^SUV \//.test(k))suv+=n;if(/\/ PICK-UP MID$/.test(k)&&/CAB/.test(k))pickMid+=n;}
 assert.equal(by('origem').get('Importado'),imp);assert.equal(by('origem').get('Nacional'),local);
 assert.equal(by('canal').get('Venda direta'),vd);assert.equal(by('canal').get('Varejo'),varejo);
 assert.equal(by('combustivel').get('Flex'),flex);assert.equal(by('segmento').get('SUV'),suv);
 assert(by('segmento').get('Picape média')>=pickMid,'chassis-cab pickups of the mid class count too');
 assert([...by('segmento').keys()].every(k=>['SUV','Hatch','Sedan','Minivan','Perua','Furgão e van','Caminhão leve','Outros','Não classificado','Picape pequena','Picape compacta','Picape média','Picape grande'].includes(k)),'segments: '+[...by('segmento').keys()]);
 // Filters compose: Mitsubishi is (almost) all imported or local-assembled L200 pickups, never more than the market.
 const mit=await run({marca:['MITSUBISHI']},{includeFlow:true});assert.equal(mit.total,1729);assert.equal(mit.flowPaths.reduce((s,x)=>s+x.count,0),1729);
 const plain=await run({});assert.equal(plain.flowPaths,undefined,'only on request');
 console.log('PASS flow: paths equal the origin cube (origin, channel, fuel, vehicle type), filters compose. Imported share',(imp/r.total*100).toFixed(1)+'%');
})().catch(e=>{console.error(e);process.exit(1);});
