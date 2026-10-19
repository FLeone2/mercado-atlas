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
