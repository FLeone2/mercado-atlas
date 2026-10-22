// Two spellings that reach one IBGE code are summed, never overwritten (retest D-03, criterion 3).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
test('catalogMergeByCode sums rows that share a code and reports the collision',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/market/modules/catalog-maps.js'),'utf8').replace(/^[\s\S]*?(?=function catalogMunicipalJoin)/,'');
 const fn=new Function(src.replace(/function catalogMunicipalJoin[\s\S]*?\n}\n/,'')+';return {catalogMergeByCode,catalogMunicipalCollisions};')();
 const rows=[{name:'A · RN',ibgeCode:'1',count:1,marketCount:10},{name:'B · RN',ibgeCode:'1',count:2,marketCount:20},{name:'C · RN',ibgeCode:'2',count:5,marketCount:50}];
 const merged=fn.catalogMergeByCode(rows);
 assert.equal(merged.length,2);
 assert.equal(merged.find(r=>r.ibgeCode==='1').count,3);
 assert.equal(merged.reduce((t,r)=>t+r.count,0),rows.reduce((t,r)=>t+r.count,0));
 assert.deepEqual(fn.catalogMunicipalCollisions(rows),[{ibgeCode:'1',names:['A · RN','B · RN']}]);
});
// Auditoria GEO-09: after the merge every ratio comes from the summed numerators/denominators.
test('catalogMergeByCode recomputes share, mitShare, growth and channelShare after summing',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/market/modules/catalog-maps.js'),'utf8').replace(/^[\s\S]*?(?=function catalogMunicipalJoin)/,'');
 const fn=new Function(src.replace(/function catalogMunicipalJoin[\s\S]*?\n}\n/,'')+';return {catalogMergeByCode};')();
 // Livramento de Nossa Senhora/BA, FIAT, jan/2016–set/2026: two spellings, 615 of 1.724 in total
 const rows=[{name:'LIVRAMENTO DE NOSSA SENHORA · BA',ibgeCode:'2919504',count:604,marketCount:1653,share:604/1653,mitCount:3,mitShare:3/1653,priorCount:500,growth:604/500-1,denominator:1700,channelShare:604/1700},
  {name:'LIVRAMENTO DO BRUMADO · BA',ibgeCode:'2919504',count:11,marketCount:71,share:11/71,mitCount:1,mitShare:1/71,priorCount:10,growth:.1,denominator:80,channelShare:11/80}];
 const [m]=fn.catalogMergeByCode(rows);
 assert.equal(m.count,615);assert.equal(m.marketCount,1724);
 assert.ok(Math.abs(m.share-615/1724)<1e-12,'share 35,67%, not the first spelling 36,54%');
 assert.ok(Math.abs(m.mitShare-4/1724)<1e-12);assert.ok(Math.abs(m.growth-(615/510-1))<1e-12);assert.ok(Math.abs(m.channelShare-615/1780)<1e-12);
});
