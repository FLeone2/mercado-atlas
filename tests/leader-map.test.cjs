const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
globalThis.TBM_UF_NAMES={SP:'São Paulo',PR:'Paraná',SC:'Santa Catarina'};
const L=require('../src/market/modules/leader-map.js');
// Names differ between the registrations and the IBGE outlines; the keys must bridge them.
const has=(a,b)=>L.lmKeys(a).some(k=>L.lmKeys(b).includes(k));
assert(has("Olho d'Água das Flores",'OLHO DAGUA DAS FLORES')||has("Olho d'Água das Flores",'OLHO DE AGUA DAS FLORES'));
assert(has("Conquista D'Oeste",'CONQUISTA DO OESTE'));assert(has('São Paulo','SAO PAULO'));assert(has('Mogi-Mirim','MOGI MIRIM'));assert(!has('Santa Rita','Santa Rosa'));
// Aggregation: leader, tie, shares, ordering.
const rows=[{municipio:'A',marca:'FIAT',count:6},{municipio:'A',marca:'VW',count:3},{municipio:'A',marca:'GM',count:1},{municipio:'B',marca:'FIAT',count:5},{municipio:'B',marca:'VW',count:5},{municipio:'C',marca:'GM',count:2}];
const by=L.lmAggregate(rows);assert.equal(by.get('A').lead.brand,'FIAT');assert.equal(by.get('A').leadShare,.6);assert.equal(by.get('A').total,10);
assert.equal(by.get('B').tie,true);assert.equal(by.get('C').tie,false);
const feats=[{code:'1',name:'A',path:'M0,0'},{code:'2',name:'B',path:'M0,0'},{code:'3',name:'C',path:'M0,0'},{code:'4',name:'D',path:'M0,0'}];
const joined=L.lmJoin(feats,by,'VW');assert.equal(joined.items[0].rank,2);assert.equal(joined.items[3].m,null);assert.equal(joined.coverage,1);
const sum=L.lmSummary(joined.items,3);assert.equal(sum.shown,1,'only A is above the minimum and untied');assert.equal(sum.ties,1);assert.equal(sum.small,1);assert.equal(sum.empty,1);assert.equal(sum.leaders[0].brand,'FIAT');
assert.equal(L.lmInitialUF({uf:['PR']}),'PR');assert.equal(L.lmInitialUF({uf:'all'}),'SP');assert.equal(L.lmInitialUF({uf:['PR','SC']}),'SP');
// Real outlines × real registrations: almost every registration finds its municipality.
const manifest=JSON.parse(fs.readFileSync('data/manifest.json'));
const cube=JSON.parse(zlib.gunzipSync(fs.readFileSync('data/'+manifest.months.at(-1).cubePath))),ix=Object.fromEntries(cube.columns.map((c,i)=>[c,i])),D=cube.dictionaries;
for(const uf of ['SP','MG','BA','RS','MT']){
 const acc=new Map();for(const r of cube.rows){if(D.uf[r[ix.uf]]!==uf)continue;const k=D.municipio[r[ix.municipio]]+'|'+D.marca[r[ix.marca]];acc.set(k,(acc.get(k)??0)+r[ix.count]);}
 const data=[...acc].map(([k,count])=>{const [municipio,marca]=k.split('|');return {municipio,marca,count};});
 const geo=JSON.parse(fs.readFileSync('data/geography/'+uf+'.json')),j=L.lmJoin(geo.features,L.lmAggregate(data),'MITSUBISHI');
 assert(j.coverage>.985,uf+' coverage '+j.coverage);
}
console.log('PASS leader map: name bridging, aggregation, ties, thresholds and >98.5% volume coverage on real outlines (SP, MG, BA, RS, MT).');
