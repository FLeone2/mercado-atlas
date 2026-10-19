// Municipality names: one comparison rule for every map, table and export (AT-04 of the 2026-10-19 audit).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),zlib=require('zlib'),path=require('path');
const G=require('../src/market/modules/geo-names.js');
const root=path.join(__dirname,'..','data');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'geography/catalog-population.json'),'utf8')).municipalities;
const byUF=new Map();for(const m of catalog){if(!byUF.has(m.uf))byUF.set(m.uf,new Map());const k=G.geoKey(m.name,m.uf),list=byUF.get(m.uf).get(k)??[];list.push(m);byUF.get(m.uf).set(k,list);}

test('the rule never merges two different municipalities of the same state',()=>{
 for(const [uf,map] of byUF)for(const [key,list] of map)assert.equal(list.length,1,uf+' '+key+' -> '+list.map(m=>m.name).join(' / '));
});
test('apostrophes and particles are ignored: the eight RO municipalities of the audit match',()=>{
 const ro=[['ALTA FLORESTA DO OESTE',1.056],['ESPIGAO DO OESTE',.455],['MACHADINHO DO OESTE',.438],['NOVA BRASILANDIA DO OESTE',1.231],['SANTA LUZIA DO OESTE',1.282],['ALVORADA DO OESTE',.441],['SAO FELIPE DO OESTE',1.436],['NOVA DO MAMORE',.796]];
 for(const [name] of ro)assert.equal(byUF.get('RO').get(G.geoKey(name,'RO'))?.length,1,name);
 assert.equal(G.geoKey("Alta Floresta D’Oeste",'RO'),G.geoKey('ALTA FLORESTA DO OESTE','RO'));
});
test('every alias points to a real catalog municipality and never hides a real one',()=>{
 for(const [uf,from,to] of G.GEO_ALIAS_PAIRS){
  const map=byUF.get(uf);
  assert(map.has(G.geoBase(to)),'target missing in catalog: '+uf+' '+to);
  assert(!map.has(G.geoBase(from)),'alias shadows a real municipality: '+uf+' '+from);
 }
});
test('aliases are scoped to their state',()=>{
 assert.equal(G.geoKey('Santa Rosa','AC'),G.geoBase('Santa Rosa do Purus'));
 assert.equal(G.geoKey('Santa Rosa','RS'),G.geoBase('Santa Rosa'));
 assert.equal(G.geoKey('Embu','SP'),G.geoBase('Embu das Artes'));
});
// Nothing is left unmatched on purpose except the unidentified places.
const KNOWN_UNMATCHED=new Set([]);
test('across all 129 monthly cubes, only unidentified places stay unmatched',()=>{
 const dir=path.join(root,'cubes'),pairs=new Map();
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.gz'))){
  const cube=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,file))).toString()),cols=cube.columns??[...cube.dimensions,'count'],iu=cols.indexOf('uf'),im=cols.indexOf('municipio'),ic=cols.indexOf('count'),d=cube.dictionaries;
  for(const r of cube.rows){const k=d.uf[r[iu]]+'|'+d.municipio[r[im]];pairs.set(k,(pairs.get(k)??0)+r[ic]);}
 }
 let total=0,lost=0;const missing=[];
 for(const [k,n] of pairs){total+=n;const [uf,name]=k.split('|');if(!byUF.get(uf)?.has(G.geoKey(name,uf))){lost+=n;missing.push([k,n]);}}
 const real=missing.filter(([k])=>!/^Não informado\|/.test(k)&&!KNOWN_UNMATCHED.has(k.replace(/\|(.*)$/,(m,n)=>'|'+n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase())));
 assert.equal(real.length,0,'unmatched: '+JSON.stringify(real.slice(0,8)));
 assert(lost/total<0.00006,'unidentified volume '+lost+' of '+total);
});

// Retest of 2026-10-19 (D-03): two spellings of one place must land on the right municipality and totals must survive the join.
function monthByCode(month){
 const file=fs.readdirSync(path.join(root,'cubes')).find(f=>f.startsWith(month+'_'));
 const cube=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'cubes',file))).toString()),cols=cube.columns??[...cube.dimensions,'count'],iu=cols.indexOf('uf'),im=cols.indexOf('municipio'),ic=cols.indexOf('count'),d=cube.dictionaries;
 const out=new Map();let total=0;
 for(const r of cube.rows){const uf=d.uf[r[iu]],name=d.municipio[r[im]],n=r[ic];total+=n;const hit=byUF.get(uf)?.get(G.geoKey(name,uf))?.[0];const key=hit?hit.code:'sem|'+uf+'|'+name;out.set(key,(out.get(key)??0)+n);}
 return {out,total,code:(uf,name)=>byUF.get(uf).get(G.geoKey(name,uf))[0].code};
}
test('RN 2016-02: Espírito Santo do Oeste is Paraú, Espírito Santo keeps its own count, sum is preserved',()=>{
 const m=monthByCode('2016-02');
 assert.equal(G.geoKey('Espirito Santo do Oeste','RN'),G.geoKey('Paraú','RN'));
 assert.notEqual(G.geoKey('Espirito Santo','RN'),G.geoKey('Paraú','RN'));
 assert.equal(m.out.get(m.code('RN','Paraú')),1);
 assert.equal(m.out.get(m.code('RN','Espírito Santo')),1);
 assert.equal([...m.out.values()].reduce((a,b)=>a+b,0),m.total);
});
test('PB 2016-01: São Bento de Pombal is São Bentinho, São Bento keeps 17',()=>{
 const m=monthByCode('2016-01');
 assert.equal(m.out.get(m.code('PB','São Bento')),17);
 assert.equal(m.out.get(m.code('PB','São Bentinho')),1);
 assert.equal([...m.out.values()].reduce((a,b)=>a+b,0),m.total);
});
