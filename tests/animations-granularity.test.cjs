const test=require('node:test'),assert=require('node:assert/strict'),A=require('../src/market/modules/animations-data.js'),W=require('../src/market/modules/animations-worker.js');
const meta=month=>({month,cubePath:month+'.json',scope:[{segment:'Auto'}],channelSourceFields:['Tipo Venda']});
// Every day of the month gets 1 unit of FIAT, except the 1st of each month: 10.
const cube=(month,mult=1)=>{const n=A.daysOf(month),dates=n,rows=n.map((d,i)=>[i,0,0,(i===0?10:1)*mult]);return {month,columns:['date','marca','segmento','count'],dictionaries:{date:dates,marca:['FIAT'],segmento:['Auto']},rows};};
const run=(options)=>W.runAnimations({manifest:{months:['2025-01','2025-02','2025-03','2026-01','2026-02','2026-03'].map(meta)},base:'https://example.com/data/',dataView:'bubbles',dimension:'marca',...options},{loadCube:async m=>cube(m.month,m.month.startsWith('2025')?1:2),yieldControl:async()=>{}});
test('daily frames: one per calendar day, 7-day rolling sum, YoY against the same window a year before',async()=>{
 const r=await run({startMonth:'2026-02',endMonth:'2026-02',granularity:'day',includeYoY:true});
 assert.equal(r.frames.length,28);assert.equal(r.frames[0].month,'2026-02-01');assert.equal(r.frames[0].label,'01/02/2026');assert.equal(r.granularity,'day');
 const last=r.frames.at(-1).groups.marca.find(x=>x.name==='FIAT');
 assert.equal(last.count,14,'7 days x 2 units');assert.equal(last.priorCount,7);assert.equal(last.yoy,1);
 const first=r.frames[0].groups.marca.find(x=>x.name==='FIAT');
 assert.equal(first.count,2*10+2*6,'6 January days of 2 plus 1 February day of 20');
});
test('daily view refuses windows over 12 months',async()=>{await assert.rejects(()=>run({startMonth:'2025-01',endMonth:'2026-03',granularity:'day'}),/12 meses/);});
test('yearly frames: January to the end month of each year, comparable',async()=>{
 const r=await run({startMonth:'2025-01',endMonth:'2026-02',granularity:'year',includeYoY:true});
 assert.deepEqual(r.frames.map(f=>f.label),['2025','2026']);assert.equal(r.frames[1].periodLabel,'Ano 2026 · jan–fev');
 const a=r.frames[0].groups.marca[0],b=r.frames[1].groups.marca[0];
 assert.equal(a.count,77,'jan 40 + feb 37');assert.equal(b.count,2*a.count);assert.equal(b.yoy,1);
});
test('a single year gives a single point',async()=>{const r=await run({startMonth:'2026-01',endMonth:'2026-03',granularity:'year'});assert.equal(r.frames.length,1);});
