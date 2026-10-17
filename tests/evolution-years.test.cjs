const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/market/modules/evolution-years.js'),'utf8');
const context=vm.createContext({PageNote:"p"});vm.runInContext(source+';globalThis.api={evolutionYearFilters,evolutionYearRows,evolutionYearSelection,evolutionYearFocus,evolutionYearCommon,evolutionYearPath,evolutionYearColor,EvolutionYears}',context);const api=context.api;
const plain=x=>JSON.parse(JSON.stringify(x));
const filters={date:'2025-02-10..2026-03-15',marca:['MITSUBISHI'],uf:['SP'],bd_carroceria:['SUV']};
assert.deepEqual(plain(api.evolutionYearFilters(filters,false)),filters);
assert.deepEqual(plain(api.evolutionYearFilters(filters,true)),{...filters,date:'all'});
assert.equal(filters.date,'2025-02-10..2026-03-15');
const monthly=[{month:'2024-01',count:5,complete:true},{month:'2024-02',count:null,complete:false},{month:'2024-03',count:9,complete:true},{month:'2025-01',count:0,complete:true},{month:'2025-02',count:10,complete:true},{month:'2025-03',count:12,complete:true},{month:'2026-01',count:14,complete:true},{month:'2026-02',count:null,complete:false,coverageStatus:'partial'}];
const coverage=monthly.map(r=>({month:r.month,complete:r.complete,status:r.coverageStatus??(r.complete?'complete':'missing'),sourceComplete:r.complete,coverageStart:r.month+'-01',coverageEnd:r.month+'-'+new Date(Date.UTC(Number(r.month.slice(0,4)),Number(r.month.slice(5,7)),0)).getUTCDate()}));
// No future months invented. True covered zero remains zero; missing stays null.
const rows=api.evolutionYearRows({monthly,coverage});assert.equal(rows.length,8);assert.equal(rows[3].count,0);assert.equal(rows[1].count,null);assert.equal(rows[1].coverageLabel,'Sem cobertura');assert.equal(rows[7].coverageLabel,'Cobertura parcial');
assert.deepEqual(plain(api.evolutionYearSelection(rows,null).selected),['2024','2025','2026']);
assert.deepEqual(plain(api.evolutionYearSelection(rows,['2023','2025']).selected),['2025']);
assert.deepEqual(plain(api.evolutionYearSelection(rows,[]).selected),[]);
assert.equal(api.evolutionYearFocus(['2024','2025'],'2024'),'2024');assert.equal(api.evolutionYearFocus(['2025'],'2024'),'2025');assert.equal(api.evolutionYearFocus([],null),null);
const common=api.evolutionYearCommon(rows,['2024','2025','2026']);assert.deepEqual(plain(common.months),[0]);assert.deepEqual(plain(common.totals.map(r=>r.count)),[5,0,14]);
assert.deepEqual(plain(api.evolutionYearCommon(rows,['2024','2025']).months),[0,2]);
const pathString=api.evolutionYearPath(rows.filter(r=>r.year==='2024'),i=>i,n=>n);assert.equal(pathString,'M0 5 M2 9');
assert.equal(api.evolutionYearPath([{monthIndex:0,count:1},{monthIndex:2,count:3}],i=>i,n=>n),'M0 1 M2 3');
assert.equal(api.evolutionYearColor('2026','2026',true),'#d71920');assert.notEqual(api.evolutionYearColor('2025','2026',true),'#d71920');
const clipped=api.evolutionYearRows({monthly:[{month:'2025-03',count:10,complete:true}],coverage:[{month:'2025-03',complete:true,sourceComplete:true}],range:{start:'2025-03-15',end:'2025-03-31'}});assert.equal(clipped[0].complete,false);assert.equal(api.evolutionYearCommon(clipped,['2025']).totals[0].count,null);
const unknown=api.evolutionYearRows({monthly:[{month:'2025-01',count:10}]});assert.equal(unknown[0].complete,false);
const partial=api.evolutionYearRows({monthly:[{month:'2025-01',count:10,complete:true}],coverage:[{month:'2025-01',complete:true,sourceComplete:false,coverageStart:'2025-01-01',coverageEnd:'2025-01-15'}]});assert.equal(partial[0].complete,false);
// Structural render without a browser, plus execute the checkbox and focus handlers.
let state=[],cursor=0,capturedQuery;context.React={useState:init=>{const key=cursor++;if(!(key in state))state[key]=init;return [state[key],v=>state[key]=typeof v==='function'?v(state[key]):v]},useMemo:f=>f()};context.jsxRuntime={Fragment:'fragment',jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};context.MarketTable='MarketTable';context.number=n=>String(n);context.useMarketData=(...args)=>{capturedQuery=args;return {result:{interactive:{monthly,coverage,groups:{marca:[{name:'MITSUBISHI'}]}}}}};context.download=()=>{};context.exportScope=x=>x;
function render(){cursor=0;return api.EvolutionYears({filters,scope:[{field:'date',value:filters.date},{field:'marca',value:'MITSUBISHI'}]});}
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
let all=nodes(render());assert.equal(capturedQuery[2],'interactive');assert.equal(capturedQuery[3],false);assert.equal(capturedQuery[0].date,filters.date);
const history=all.find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(history.props.checked,false);history.props.onChange({target:{checked:true}});all=nodes(render());assert.equal(capturedQuery[0].date,'all');assert.deepEqual(capturedQuery[0].marca,filters.marca);
assert.ok(all.some(n=>n.type==='svg'&&n.props.role==='img'&&n.props['aria-label']));assert.ok(all.some(n=>n.type==='fieldset'));assert.ok(all.some(n=>n.type==='legend'));
const yearButton=all.find(n=>n.type==='button'&&n.props['aria-pressed']===false);yearButton.props.onClick();all=nodes(render());assert.ok(all.some(n=>n.type==='button'&&n.props['aria-pressed']===true));
const table=all.find(n=>n.type==='MarketTable');assert.equal(table.props.rows.length,8);assert.equal(table.props.scope.find(s=>s.field==='date').value,'Todo o histórico disponível');assert.ok(all.some(n=>n.type==='button'&&n.props.children==='Baixar CSV da comparação'));
console.log('Annual comparison: filter isolation, null gaps, partial years, common coverage, selection, focus, accessibility and audit export passed.');
