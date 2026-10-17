// Annual presentation consumes reviewed worker aggregates; it never synthesizes observations.
const EV_YEAR_MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
// Use source coverage, never the last observed registration (a covered day can be zero).
function evolutionYearPlan(filters,manifest,chosen=null){
 const months=(manifest?.months??[]).filter(m=>m.cubePath&&/^\d{4}-\d{2}$/.test(m.month??'')).sort((a,b)=>a.month.localeCompare(b.month));
 if(!months.length)return null;
 const last=months.at(-1),declared=last.coverageEndDate??last.coverageEnd??last.coverageThrough??last.partialCoverage?.end;
 const sourceEnd=typeof declared==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(declared)?declared:evolutionYearEnd(last.month);
 const date=String(filters.date??'all'),rawEnd=date==='all'?sourceEnd:date.split('..').at(-1);
 const requestedEnd=/^\d{4}-\d{2}$/.test(rawEnd)?evolutionYearEnd(rawEnd):/^\d{4}$/.test(rawEnd)?rawEnd+'-12-31':/^\d{4}-\d{2}-\d{2}$/.test(rawEnd)?rawEnd:sourceEnd;
 const end=requestedEnd<sourceEnd?requestedEnd:sourceEnd,anchor=end.slice(0,4);
 const years=[...new Set(months.filter(m=>m.month<=end.slice(0,7)).map(m=>m.month.slice(0,4)))];
 const selected=chosen===null?years.filter(y=>Number(y)>=Number(anchor)-2):years.filter(y=>chosen.includes(y));
 const start=(selected[0]??anchor)+'-01-01',selectedEnd=selected.length&&selected.at(-1)<anchor?selected.at(-1)+'-12-31':end;
 return {years,selected,start,end:selectedEnd,date:start+'..'+selectedEnd};
}
function evolutionYearFilters(filters,allHistory,manifest,chosen=null){
 if(allHistory)return {...filters,date:'all'};
 const plan=evolutionYearPlan(filters,manifest,chosen);
 return plan?{...filters,date:plan.date}:{...filters};
}
function evolutionYearEnd(month){return month+'-'+String(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()).padStart(2,'0');}
function evolutionYearRows(snapshot){
 const coverage=new Map((snapshot?.coverage??[]).map(r=>[r.month,r]));
 return (snapshot?.monthly??[]).filter(r=>/^\d{4}-\d{2}/.test(r.month??r.date??'')).map(r=>{
  const month=String(r.month??r.date).slice(0,7),meta=coverage.get(month),first=month+'-01',last=evolutionYearEnd(month);
  const count=typeof r.count==='number'&&Number.isFinite(r.count)?r.count:null;
  const start=r.coverageStart??r.coverageStartDate??meta?.coverageStart??meta?.coverageStartDate??meta?.partialCoverage?.start??first;
  const end=r.coverageEnd??r.coverageEndDate??meta?.coverageEndDate??meta?.coverageEnd??meta?.coverageThrough??meta?.partialCoverage?.end;
  const partial=r.partial===true||r.partialMonth===true||r.sourceComplete===false||r.coverageStatus==='partial'||meta?.partialCoverage===true||meta?.partialMonth===true||meta?.isPartial===true||meta?.sourceComplete===false||meta?.coverageStatus==='partial';
  const clipped=(snapshot?.range?.start>first&&snapshot.range.start<=last)||(snapshot?.range?.end>=first&&snapshot.range.end<last);
  const complete=count!==null&&r.complete!==false&&meta?.complete!==false&&!partial&&!clipped&&start<=first&&(end?end>=last:Boolean(meta)||r.coverageStatus==='complete'||r.complete===true);
  return {...r,date:r.date??first,month,year:month.slice(0,4),monthIndex:Number(month.slice(5,7))-1,count,complete,coverageLabel:r.coverageStatus==='missing'||meta?.status==='missing'?'Sem cobertura':r.coverageStatus==='unavailable'||meta?.status==='unavailable'?'Fonte indisponível para o recorte':complete?'Mês completo':clipped?'Recorte parcial do mês':partial||r.coverageStatus==='partial'||meta?.status==='partial'?'Cobertura parcial':count===null?'Sem cobertura':'Cobertura não confirmada'};
 }).sort((a,b)=>a.month.localeCompare(b.month));
}
function evolutionYearSelection(rows,selected){const years=[...new Set(rows.map(r=>r.year))].sort();return {years,selected:selected===null?years.slice(-3):selected.filter(y=>years.includes(y))};}
function evolutionYearFocus(selected,focus){return selected.includes(focus)?focus:selected.at(-1)??null;}
function evolutionYearCommon(rows,years){
 if(!years.length)return {months:[],totals:[]};
 const indexes=new Map(years.map(y=>[y,new Map(rows.filter(r=>r.year===y).map(r=>[r.monthIndex,r]))]));
 const months=Array.from({length:12},(_,i)=>i).filter(i=>years.every(y=>indexes.get(y).get(i)?.complete));
 return {months,totals:years.map(year=>({year,count:months.length?months.reduce((sum,i)=>sum+indexes.get(year).get(i).count,0):null,months:months.length}))};
}
function evolutionYearPath(rows,x,y){let previous=-2;return rows.map(r=>{if(r.count===null){previous=-2;return '';}const command=r.monthIndex===previous+1?'L':'M';previous=r.monthIndex;return command+x(r.monthIndex)+' '+y(r.count);}).filter(Boolean).join(' ');}
function evolutionYearColor(year,focus,soleMit){return year===focus?(soleMit?'#d71920':'var(--chart-1)'):'var(--muted-text, #77879b)';}
function EvolutionYears({filters={},scope=[],manifest:providedManifest}){
 const [allHistory,setAllHistory]=React.useState(false),[chosen,setChosen]=React.useState(null),[focused,setFocused]=React.useState(null);
 const shell=typeof dataApp==='undefined'?null:dataApp.useDataApp(),manifest=providedManifest??shell?.snapshot?.marketManifest;
 const plan=evolutionYearPlan(allHistory?{...filters,date:'all'}:filters,manifest,chosen);
 const queryFilters=React.useMemo(()=>evolutionYearFilters(filters,allHistory,manifest,chosen),[filters,allHistory,manifest,chosen]);
 const operation=useMarketData(queryFilters,!plan||plan.selected.length>0,'interactive',false),snapshot=operation.result?.interactive;
 const rows=React.useMemo(()=>evolutionYearRows(snapshot),[snapshot]),selection=evolutionYearSelection(rows,chosen),years=plan?.years??selection.years,selected=allHistory?(chosen??years):plan?.selected??selection.selected,focus=evolutionYearFocus(selected,focused);
 const visible=rows.filter(r=>selected.includes(r.year)),common=evolutionYearCommon(visible,selected),brands=snapshot?.groups?.marca??[],soleMit=brands.length===1&&brands[0].name==='MITSUBISHI';
 const max=Math.max(1,...visible.map(r=>r.count??0)),x=i=>64+i*65,y=n=>284-n/max*240;
 const effectiveScope=[...scope.filter(s=>s.field!=='date'),{field:'date',label:'Período da comparação',value:allHistory?'Todo o histórico disponível':queryFilters.date},{field:'years',label:'Anos exibidos',value:selected.join(', ')},{field:'focusYear',label:'Ano em foco',value:focus??''}];
 const audit=visible.map(r=>({date:r.date,year:r.year,month:EV_YEAR_MONTHS[r.monthIndex],count:r.count,coverage:r.coverageLabel,commonMonth:common.months.includes(r.monthIndex)?'Sim':'Não'}));
 return jsxRuntime.jsxs('section',{className:'ev-years','aria-label':'Comparação entre anos',children:[
  jsxRuntime.jsxs('label',{className:'ev-years-history',children:[jsxRuntime.jsx('input',{type:'checkbox',checked:allHistory,onChange:e=>{setAllHistory(e.target.checked);setChosen(null);setFocused(null);}}),'Comparar todo o histórico (mantém os demais filtros)']}),
  jsxRuntime.jsx(PageNote,{originalTag:'p',className:'am-footnote',children:allHistory?'Todo o histórico disponível, mantendo marca e todos os demais filtros. Meses futuros não são estimados.':'Os anos disponíveis vêm da cobertura da fonte. O período é ampliado para os anos escolhidos, mantendo marca e todos os demais filtros. O fim do período global e a cobertura da fonte limitam o último ano. Linhas interrompidas indicam ausência de cobertura; meses futuros não são estimados.'}),
  jsxRuntime.jsxs('fieldset',{className:'ev-years-picker',children:[jsxRuntime.jsx('legend',{children:'Anos visíveis'}),...years.map(year=>jsxRuntime.jsxs('label',{children:[jsxRuntime.jsx('input',{type:'checkbox',checked:selected.includes(year),onChange:e=>{setAllHistory(false);setChosen(e.target.checked?[...selected,year].sort():selected.filter(y=>y!==year));}}),year]},year)),jsxRuntime.jsx('button',{type:'button',className:'am-small-button',onClick:()=>{setAllHistory(false);setChosen(null);setFocused(null);},children:'Últimos 3 anos'})]}),
  !selected.length&&(plan||chosen!==null)?jsxRuntime.jsx('p',{role:'status',children:'Selecione pelo menos um ano para comparar.'}):operation.pending?jsxRuntime.jsx('p',{role:'status',children:'Carregando comparação entre anos…'}):operation.error?jsxRuntime.jsx('p',{role:'alert',children:'Não foi possível carregar a comparação. '+operation.error}):!snapshot?jsxRuntime.jsx('p',{role:'status',children:'Comparação indisponível para este recorte.'}):jsxRuntime.jsxs(jsxRuntime.Fragment,{children:[
   jsxRuntime.jsxs(jsxRuntime.Fragment,{children:[
    jsxRuntime.jsxs('div',{className:'ev-years-legend','aria-label':'Ano em foco',children:[jsxRuntime.jsx('span',{children:'Destacar ano:'}),...selected.map(year=>jsxRuntime.jsxs('button',{type:'button','aria-pressed':focus===year,onClick:()=>setFocused(year),style:{'--year-color':evolutionYearColor(year,focus,soleMit)},children:[jsxRuntime.jsx('i',{'aria-hidden':true}),year,focus===year?' · em foco':'']},year))]}),
    jsxRuntime.jsx('div',{className:'ev-years-scroll',tabIndex:0,role:'region','aria-label':'Gráfico anual. Role horizontalmente em telas pequenas; valores exatos na tabela abaixo.',children:jsxRuntime.jsxs('svg',{viewBox:'0 0 820 332',className:'ev-years-chart',role:'img','aria-label':'Volumes mensais por ano; destaque '+focus,children:[
     jsxRuntime.jsx('desc',{children:'Cada linha é um ano. Meses ausentes interrompem a linha. Um círculo maior marca o último mês observado de cada ano. Consulte a tabela para os valores exatos e a cobertura.'}),
     ...[0,.25,.5,.75,1].map(t=>jsxRuntime.jsxs('g',{children:[jsxRuntime.jsx('line',{x1:64,x2:779,y1:y(t*max),y2:y(t*max),className:'ev-years-grid'}),jsxRuntime.jsx('text',{x:56,y:y(t*max)+4,textAnchor:'end',children:number(Math.round(t*max))})]},t)),
     ...EV_YEAR_MONTHS.map((month,i)=>jsxRuntime.jsx('text',{x:x(i),y:310,textAnchor:'middle',children:month},month)),
     ...[...selected].sort((a,b)=>(a===focus?1:0)-(b===focus?1:0)).map(year=>{const series=visible.filter(r=>r.year===year),observed=series.filter(r=>r.count!==null),last=observed.at(-1),color=evolutionYearColor(year,focus,soleMit);return jsxRuntime.jsxs('g',{opacity:year===focus?1:.45,'data-year':year,children:[jsxRuntime.jsx('path',{d:evolutionYearPath(series,x,y),fill:'none',stroke:color,strokeWidth:year===focus?3:1.6}),...observed.map(r=>jsxRuntime.jsx('circle',{cx:x(r.monthIndex),cy:y(r.count),r:r===last?5:2.5,fill:color,stroke:'var(--surface)',strokeWidth:1,children:jsxRuntime.jsx('title',{children:year+' · '+EV_YEAR_MONTHS[r.monthIndex]+': '+number(r.count)+' · '+r.coverageLabel+(r===last?' · último mês observado':'')})},r.month))]},year);})
    ]})}),
    jsxRuntime.jsx(PageNote,{originalTag:'p',className:'am-footnote',children:'Fonte: agregados mensais revisados da base de emplacamentos. Cobertura de cada mês na tabela. Ponto maior = último mês observado; um mês parcial não equivale a um mês completo.'}),
    jsxRuntime.jsxs('div',{className:'ev-years-common',children:[jsxRuntime.jsx('strong',{children:'Acumulado comparável · mesmos meses completos'}),jsxRuntime.jsx('p',{children:common.months.length?common.months.map(i=>EV_YEAR_MONTHS[i]).join(', ')+' · '+common.months.length+' meses em todos os anos selecionados. Não é um total anual nem necessariamente janeiro até o mês atual.':'Não há meses completos em comum. Acumulado indisponível; lacunas não são convertidas em zero.'}),...common.totals.map(r=>jsxRuntime.jsxs('span',{children:[r.year+': ',jsxRuntime.jsx('strong',{children:r.count===null?'N/D':number(r.count)})]},r.year))]}),
    jsxRuntime.jsx(MarketTable,{id:'evolution-years-table',title:'Comparação anual · valores mensais exatos',rows:audit,scope:effectiveScope,columns:[{field:'year',label:'Ano'},{field:'month',label:'Mês'},{field:'count',label:'Emplacamentos',renderCell:v=>v===null?'N/D':number(v)},{field:'coverage',label:'Cobertura'},{field:'commonMonth',label:'No acumulado comparável'}]}),
    jsxRuntime.jsx('button',{type:'button',className:'am-small-button',disabled:!audit.length,onClick:()=>download('comparacao-anual.csv',exportScope(audit,effectiveScope)),children:'Baixar CSV da comparação'})
   ]})
  ]})
 ]});
}
