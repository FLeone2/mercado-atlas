const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context=vm.createContext({PageNote:"p"});vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/market/modules/evolution-years.js'),'utf8')+';globalThis.api={evolutionYearPlan,evolutionYearFilters,EvolutionYears}',context);
const api=context.api,plain=x=>JSON.parse(JSON.stringify(x));
const months=[];for(let y=2016;y<=2026;y++)for(let m=1;m<=(y===2026?9:12);m++)months.push({month:`${y}-${String(m).padStart(2,'0')}`,cubePath:'reviewed.gz'});
const manifest={months},filters={date:'2026-01-01..2026-12-31',population:'light',marca:['MITSUBISHI'],uf:['SP'],municipio:['SÃO PAULO'],tipo_venda:['VD'],bd_carroceria:['SUV']};
assert.deepEqual(plain(api.evolutionYearPlan(filters,manifest).selected),['2024','2025','2026']);
assert.equal(api.evolutionYearPlan(filters,manifest).date,'2024-01-01..2026-09-30');
assert.equal(api.evolutionYearPlan({...filters,date:'2026-09-01..2026-09-30'},manifest).date,'2024-01-01..2026-09-30');
assert.equal(api.evolutionYearPlan({...filters,date:'2025-03-15..2025-06-17'},manifest).date,'2023-01-01..2025-06-17');
assert.equal(api.evolutionYearPlan({...filters,date:'all'},manifest).date,'2024-01-01..2026-09-30');
assert.equal(api.evolutionYearPlan(filters,{months:months.map(m=>m.month==='2026-09'?{...m,coverageEndDate:'2026-09-18',sourceComplete:false}:m)}).date,'2024-01-01..2026-09-18');
assert.equal(api.evolutionYearPlan(filters,manifest,['2020','2021']).date,'2020-01-01..2021-12-31');
assert.deepEqual(plain(api.evolutionYearFilters(filters,false,manifest)),{...filters,date:'2024-01-01..2026-09-30'});
assert.equal(filters.date,'2026-01-01..2026-12-31');
// Render against a query-aware worker stub: chart, table, and export must share the exact source rows.
let state=[],cursor=0,captured,exported;
context.React={useState:init=>{const i=cursor++;if(!(i in state))state[i]=init;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]},useMemo:f=>f()};
context.jsxRuntime={Fragment:'fragment',jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};context.MarketTable='MarketTable';context.number=String;
const available=months.map((m,i)=>({month:m.month,date:m.month+'-01',count:m.month==='2025-02'?null:m.month==='2025-03'?0:i+1,complete:m.month!=='2025-02',coverageStatus:m.month==='2025-02'?'missing':'complete'}));
context.useMarketData=(f,enabled,...args)=>{captured={filters:f,enabled,args};const [start,end]=f.date==='all'?['2016-01-01','2026-09-30']:f.date.split('..');return{pending:false,result:{interactive:{range:{start,end},monthly:available.filter(r=>r.date>=start&&r.date<=end),coverage:available.map(r=>({month:r.month,status:r.coverageStatus,complete:r.complete,sourceComplete:r.complete})),groups:{marca:[{name:'MITSUBISHI'}]}}}}};
context.exportScope=(rows,scope)=>({rows,scope});context.download=(name,data)=>exported={name,data};
function nodes(t){return !t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];}
function render(){cursor=0;return nodes(api.EvolutionYears({filters,manifest,scope:[{field:'date',value:filters.date},{field:'marca',value:'MITSUBISHI'}]}));}
function years(all){return all.filter(n=>n.type==='g'&&n.props['data-year']).map(n=>n.props['data-year']);}
let all=render();assert.deepEqual(years(all),['2024','2025','2026']);assert.equal(captured.filters.date,'2024-01-01..2026-09-30');assert.equal(captured.args[0],'interactive');assert.equal(captured.args[1],false);
let table=all.find(n=>n.type==='MarketTable');assert.equal(table.props.rows.length,33);assert.equal(table.props.rows.filter(r=>r.year==='2026').length,9);assert.equal(table.props.rows.find(r=>r.date==='2025-02-01').count,null);assert.equal(table.props.rows.find(r=>r.date==='2025-03-01').count,0);
all.find(n=>n.type==='button'&&n.props.children==='Baixar CSV da comparação').props.onClick();assert.equal(exported.data.rows,table.props.rows);assert.equal(exported.data.scope,table.props.scope);assert.equal(table.props.scope.find(s=>s.field==='date').value,captured.filters.date);
function toggle(year,checked){const label=all.find(n=>n.type==='label'&&Array.isArray(n.props.children)&&n.props.children[1]===year);label.props.children[0].props.onChange({target:{checked}});all=render();}
toggle('2023',true);assert.equal(captured.filters.date,'2023-01-01..2026-09-30');assert.deepEqual(years(all),['2023','2024','2025','2026']);
all.find(n=>n.type==='button'&&n.props.children==='Últimos 3 anos').props.onClick();all=render();assert.deepEqual(years(all),['2024','2025','2026']);assert.equal(captured.filters.date,'2024-01-01..2026-09-30');
for(const y of ['2024','2025','2026'])toggle(y,false);assert.equal(captured.enabled,false);assert.ok(all.some(n=>n.type==='fieldset'));assert.ok(!all.some(n=>n.type==='MarketTable'));
toggle('2020',true);assert.equal(captured.enabled,true);assert.equal(captured.filters.date,'2020-01-01..2020-12-31');
all.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});all=render();assert.equal(captured.filters.date,'all');assert.equal(years(all).length,11);
all.find(n=>n.type==='button'&&n.props.children==='Últimos 3 anos').props.onClick();all=render();assert.equal(captured.filters.date,'2024-01-01..2026-09-30');assert.deepEqual(years(all),['2024','2025','2026']);assert.deepEqual(plain(captured.filters),{...filters,date:'2024-01-01..2026-09-30'});
console.log('Annual period regression: bounded last three years, source/global end caps, manifest choices, exact null/zero/CSV parity, empty and rapid manual/preset changes passed.');
