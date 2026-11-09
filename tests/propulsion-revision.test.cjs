// Reviewed exceptions must affect live groups, filters and caches exactly as the
// materialized history, while the supplier's raw BD FUEL remains available.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {loadWorker,loadCore}=require('../scripts/lib/market-core.cjs');
const root=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json'))),worker=loadWorker();
const ruleBytes=fs.readFileSync(path.join(root,'data/classification/propulsion-overrides.json')),rules=JSON.parse(ruleBytes).rules,receipt=JSON.parse(fs.readFileSync(path.join(root,'data/revisions/2026-11-bd-october.json')));
assert.equal(require('node:crypto').createHash('sha256').update(ruleBytes).digest('hex'),receipt.rulesSha256,'Reviewed rule receipt');
for(const month of manifest.months)for(const override of month.propulsionOverrides??[]){
 const rule=rules.find(r=>r.id===override.id);assert(rule&&rule.years.includes(+month.month.slice(0,4)),'No year backcast of audited rules');
 for(const field of ['model','bdCode','expectedBdFuel','propulsion'])assert.equal(override[field],rule[field],'Month override matches reviewed source rule');
}
const loader={load:async meta=>worker.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data',meta.cubePath))).toString()),setNamespace(){},clear(){},stats(){return {};}};
const messages=[],port={postMessage:m=>messages.push(m)};worker.installMarketWorker(port,{loader,aggregateStore:null,resultStore:null});
let id=0;
async function run(filters,source=manifest,extra={}){const current=++id;await port.onmessage({data:worker.parse(JSON.stringify({id:current,manifest:source,base:'https://local/data/',filters,population:'light',...extra}))});const reply=messages.findLast(m=>m.id===current&&(m.result||m.error));assert(reply, 'worker reply');assert(!reply.error,reply.error);return JSON.parse(JSON.stringify(reply.result));}
(async()=>{
 const cases=[['2024-12','I/PORSCHE MACAN E4','BEV','GASOLINE'],['2025-12','I/CHEV CAPTIVA EV PR','BEV','GASOLINE'],['2026-09','I/GWM TANK 300 PHEV','PHEV','GASOLINE'],['2026-09','TOYOTA/YCROSS XRE-HYBRID','HEV','FFV']];
 const history=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/history/versions.json.gz'))));
 for(const [month,model,propulsion,rawFuel]of cases){
  const year=+month.slice(0,4),m=+month.slice(5),end=new Date(Date.UTC(year,m,0)).getUTCDate(),filters={date:month+'-01..'+month+'-'+end,population:'light',modelo:[model]};
  const result=await run(filters,manifest,{includeYearGroups:true});assert(result.total>0,model+' source rows');
  assert.equal(result.groups.propulsao.find(r=>r.name===propulsion)?.count,result.total,model+' reviewed class');
  assert.equal(result.groups.bd_combustivel.find(r=>r.name===rawFuel)?.count,result.total,model+' raw BD fuel is preserved');
  const selected=await run({...filters,propulsao:[propulsion]});assert.equal(selected.total,result.total,model+' propulsion filter');
  const mi=history.months.findIndex(v=>v.month===month),ix=Object.fromEntries(history.columns.map((v,i)=>[v,i])),mc=history.dictionaries.modelo.indexOf(model),pc=history.dictionaries.propulsao.indexOf(propulsion);
  assert.equal(history.rows.filter(r=>r[0]===mi&&r[ix.modelo]===mc&&r[ix.propulsao]===pc).reduce((n,r)=>n+r[ix.count],0),result.total,model+' history/live reconciliation');
 }
 // Changing only guarded metadata must invalidate the same worker's result cache.
 const filters={date:'2026-09-01..2026-09-30',population:'light',modelo:['I/GWM TANK 300 PHEV'],propulsao:['PHEV']};
 const before=await run(filters);assert(before.total>0);
 const changed=JSON.parse(JSON.stringify(manifest));const month=changed.months.find(m=>m.month==='2026-09');month.propulsionOverrides=month.propulsionOverrides.map(r=>r.model==='I/GWM TANK 300 PHEV'?{...r,expectedBdFuel:'DIESEL'}:r);
 assert.notEqual(loadCore().precomputedIdentity(changed),loadCore().precomputedIdentity(manifest),'Metadata-only correction invalidates precomputed answers');
 assert.equal((await run(filters,changed)).total,0,'Expected-BD-fuel guard and manifest cache identity');
 assert.equal((await run(filters)).total,before.total,'Original metadata restores audited classification');
 console.log('PASS reviewed propulsion: exact versions, preserved raw BD, live/history/filter consistency, expected-fuel guard and cache invalidation.');
})().catch(e=>{console.error(e);process.exit(1);});
