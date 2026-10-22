const assert=require('node:assert/strict');const {hideUnclassified}=require('../src/market/modules/display-filters.js');
const input={total:100,groups:{bd_segmento:[{name:'SUV',count:60,marketShare:.6},{name:'Sem correspondência BD',count:1,marketShare:.01},{name:'HATCH',count:39}],marca:[{name:'FIAT',count:100}]},technologyByMonth:[{date:'2026-09-01',name:'Não classificado',count:1},{date:'2026-09-01',name:'HEV',count:5}],joints:{x:{rows:[{month:'2026-09',left:'FIAT',right:'Não classificado no BD',count:2}]}},interactive:{monthlyGroups:{bd_segmento:[{name:'Sem correspondência BD',count:1}]}},labels:['Não classificado']};
const out=hideUnclassified(input);
assert.equal(out.total,100,'totals untouched');assert.deepEqual(out.groups.bd_segmento.map(r=>r.name),['SUV','HATCH']);assert.equal(out.groups.bd_segmento[0].marketShare,.6,'shares keep the full denominator');
assert.equal(out.groups.marca,input.groups.marca,'untouched branches are shared, not copied');
// auditoria LEG-02: hiding must not change any calculation input outside the ranking lists
assert.equal(out.technologyByMonth,input.technologyByMonth,'monthly composition stays complete');assert.equal(out.joints.x.rows.length,1,'joint rows that merely mention a hidden category stay');
assert.equal(out.interactive,input.interactive,'Explorar período keeps the complete composition');
assert.deepEqual(out.labels,['Não classificado'],'plain string lists are not data rows');
assert.equal(input.groups.bd_segmento.length,3,'input never mutated');
assert.deepEqual(hideUnclassified({focus:{groups:{propulsao:[{name:'Não classificado',count:3},{name:'ICE',count:5}]}}}).focus.groups.propulsao.map(r=>r.name),['ICE'],'nested ranking lists also hide');
console.log('PASS display filters: unclassified rows hidden only from ranking lists; every other structure keeps complete data.');
