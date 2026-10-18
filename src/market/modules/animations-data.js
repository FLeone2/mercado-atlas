/* Full-calendar-month animation data. Counts are weighted registrations, never cube-row counts. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AnimationData = root.AnimationsData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DIMS = ['uf','municipio','marca','modelo','grupo_modelo','combustivel','segmento','subsegmento','tipo_venda','regiao','nacionalidade','ano_fabricacao','potencia','capacidade_carga','capacidade_passageiros','bd_segmento','bd_carroceria','bd_classe','bd_macro','bd_combustivel','bd_origem','propulsao'];
  const GROUP_DIMS = ['marca','modelo','grupo_modelo','uf','propulsao','bd_combustivel','bd_carroceria','bd_segmento','tipo_venda','bd_origem'];
  const ELECTRIFIED = ['BEV','PHEV','HEV','MHEV'];
  const UNKNOWN = 'Não informado';
  const textCompare = (a,b) => String(a).localeCompare(String(b),'pt-BR') || (String(a)<String(b)?-1:String(a)>String(b)?1:0);
  const label = v => String(v ?? UNKNOWN);
  function selection(value) { if (value == null || value === '' || value === 'all') return []; const a = Array.isArray(value)?value:[value]; return a.includes('all')?[]:[...new Set(a.map(label))].sort(textCompare); }
  function canonicalFilters(filters={}) { return Object.fromEntries(Object.keys(filters).sort().flatMap(key=>['date','population'].includes(key)?filters[key]&&filters[key]!=='all'?[[key,filters[key]]]:[]:selection(filters[key]).length?[[key,selection(filters[key])]]:[])); }
  function validMonth(month) { return typeof month==='string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month); }
  function monthEnd(month) { if(!validMonth(month))throw Error('Mês inválido.');return new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10); }
  function listMonths(start,end) { if(!validMonth(start)||!validMonth(end)||start>end)throw Error('Escolha um intervalo mensal válido.');const out=[];let y=+start.slice(0,4),m=+start.slice(5,7);while(`${y}-${String(m).padStart(2,'0')}`<=end){out.push(`${y}-${String(m).padStart(2,'0')}`);if(++m>12){m=1;y++;}if(out.length>600)throw Error('A janela excede 50 anos.');}return out; }
  const priorMonth = month => `${+month.slice(0,4)-1}-${month.slice(5,7)}`;
  function sourceCoverage(meta,month) {
    if(!meta?.cubePath)return {month,status:'missing',complete:false,coverageStart:null,coverageEnd:null};
    const start=meta.coverageStartDate??(typeof meta.partialCoverage==='object'?meta.partialCoverage?.start:null)??month+'-01';
    const partial=meta.partialCoverage===true||meta.partialMonth===true||meta.isPartial===true||meta.sourceComplete===false||['partial','missing','unavailable','unknown'].includes(meta.coverageStatus);
    const end=meta.coverageEndDate??meta.coverageEnd??meta.coverageThrough??(typeof meta.partialCoverage==='object'?meta.partialCoverage?.end:null)??(partial?null:monthEnd(month));
    const complete=!partial&&Boolean(start&&end&&start<=month+'-01'&&end>=monthEnd(month));
    return {month,status:complete?'complete':'partial',complete,coverageStart:start,coverageEnd:end};
  }
  function propulsion(value) { const v=String(value??'').trim().toUpperCase();return ['GASOLINE','FFV','DIESEL','ETANOL','TETRAFUEL','GNV'].includes(v)?'ICE':['HEV','PHEV','BEV','MHEV','FCEL'].includes(v)?v:'Não classificado'; }
  function classifyBrandOrigin(name,year,mapping) {
    const rule=mapping?.brands?.[String(name??'').trim().toUpperCase()];
    // Classification must be traceable. bd_origem/nacionalidade never imply brand origin.
    if(!rule||(rule.status&&rule.status!=='verified_primary_source')||typeof rule.sourceUrl!=='string'||!/^https?:\/\//.test(rule.sourceUrl)||(rule.startYear&&year<rule.startYear)||(rule.endYear&&year>rule.endYear))return {name:'Origem não classificada',kind:'unknown',sourceUrl:null};
    if(rule.chineseOrigin===true)return {name:'Marcas chinesas',kind:'china',sourceUrl:rule.sourceUrl};
    if(rule.originCode==='BRA_CHN_PARTNERSHIP')return {name:'Parceria Brasil–China',kind:'partnership',sourceUrl:rule.sourceUrl};
    if(rule.chineseOrigin===false||rule.originCode)return {name:'Outras origens verificadas',kind:'other',sourceUrl:rule.sourceUrl};
    return {name:'Origem não classificada',kind:'unknown',sourceUrl:null};
  }
  function presetChecks(preset,porte) { const checks=[];if(['midsize-pickups','pickups','pickup','pickups-mid','midsize'].includes(preset))checks.push(['bd_segmento',['PICK-UP MID']]);else if(preset==='suv')checks.push(['bd_carroceria',['SUV']]);if(selection(porte).length)checks.push(['bd_segmento',selection(porte)]);return checks; }
  function normalizeRequest(request) {
    const months=[...new Set([...(request.manifest?.expectedMonths??[]),...(request.manifest?.months??[]).map(m=>m.month)])].filter(validMonth).sort();
    const start=String(request.startMonth??request.start??months[0]??'').slice(0,7),end=String(request.endMonth??request.end??months.at(-1)??'').slice(0,7);listMonths(start,end);
    const filters={...(request.filters??{})};const originalDate=filters.date??'all';filters.date=start+'-01..'+monthEnd(end);
    const selectedUF=String(request.selectedUF??request.uf??'').toUpperCase();if(selectedUF&&!/^[A-Z]{2}$/.test(selectedUF))throw Error('Escolha uma UF válida.');
    return {...request,startMonth:start,endMonth:end,granularity:['day','year'].includes(request.granularity)?request.granularity:'month',mode:request.granularity==='year'||request.mode==='ytd'&&request.granularity!=='day'?'ytd':'monthly',dimension:GROUP_DIMS.includes(request.dimension)?request.dimension:'marca',filters,originalDate,selectedUF,preset:request.preset??'all',includeYoY:request.includeYoY!==false};
  }
  const MIX_DIMENSIONS = {technology:'propulsao',body:'bd_carroceria',porte:'bd_segmento',vehicleOrigin:'bd_origem',channel:'tipo_venda'};
  function projectionSpec(request={}) {
    const view=request.dataView;
    if(!['races','bubbles','mix','maps','heat'].includes(view))return null;
    const kind=request.mixKind??'technology',municipal=view==='maps'&&['municipalVolume','municipality','municipal','municipal-volume','concentration','volume','count'].includes(request.mapMetric);
    return {view,kind,dimensions:['races','bubbles'].includes(view)?[request.dimension??'marca']:view==='mix'&&kind!=='origin'?[MIX_DIMENSIONS[kind]??'propulsao']:[],origin:view==='mix'&&kind==='origin',ufs:view==='maps'&&!municipal,municipal,brands:['races','bubbles'].includes(view),heat:view==='heat'};
  }
  function projectFrame(frame,request={},final=false) {
    const spec=projectionSpec(request);if(!spec)return frame;
    const compact=(row,type)=>{
      const keys=type==='map'?['name','uf','municipality','ibgeCode','geographicMatch','count','observedCount','marketCount','mitCount','mitShare','share','technologyCounts','unclassifiedCount','electrifiedCount','electrifiedShare']:type==='entity'?['name','count','observedCount','share','brands','isMIT','mitCount','priorCount','priorShare','yoy','yoyStatus']:['name','kind','count','observedCount','share','sourceUrls'];
      if(!final)keys.push('observedMitCount','observedTechnologyCounts');
      return Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
    };
    const groups=Object.fromEntries(spec.dimensions.map(dim=>[dim,(frame.groups?.[dim]??[]).map(row=>compact(row,spec.brands?'entity':'mix'))]));
    const originRows=spec.origin?(frame.originRows??[]).map(row=>compact(row,'mix')):[];
    const out={...frame,municipalityRequested:spec.municipal&&Boolean(frame.selectedUF),groups,entities:groups[frame.dimension??request.dimension??'marca']??[],mixes:spec.view==='mix'?{[spec.kind]:spec.origin?originRows:groups[spec.dimensions[0]]??[]}: {},originRows,ufRows:spec.ufs?(frame.ufRows??[]).map(row=>compact(row,'map')):[],municipalityRows:spec.municipal?(frame.municipalityRows??[]).map(row=>compact(row,'map')):[],dataView:spec.view};
    delete out.brandMembership;
    return out;
  }
  function scopeKey(meta,filters) { const selected=selection(filters.segmento);return JSON.stringify([...new Set((meta?.scope??[]).map(s=>s.segment??s.segmento).filter(Boolean).filter(s=>filters.population!=='light'||['Auto','Comercial Leve'].includes(s)).filter(s=>!selected.length||selected.includes(s)))].sort()); }
  const add = (object,key,count) => { object[key]=(object[key]??0)+count; };
  const record = () => Object.create(null);
  function counter(name,extra={}) { return {name,observedCount:0,observedMitCount:0,brands:record(),observedTechnologyCounts:record(),...extra}; }
  function increment(map,name,count,brand,technology,extra,trackBrands=true,focus='MITSUBISHI') { let row=map.get(name);if(!row){row=counter(name,extra);map.set(name,row);}row.observedCount+=count;if(brand===focus)row.observedMitCount+=count;if(trackBrands)add(row.brands,brand,count);if(technology)add(row.observedTechnologyCounts,technology,count);return row; }
  function finishRow(row,total,complete) {
    const count=complete?row.observedCount:null,mitCount=complete?row.observedMitCount:null;
    const observedElectrifiedCount=ELECTRIFIED.reduce((sum,key)=>sum+(row.observedTechnologyCounts?.[key]??0),0);
    return {...row,count,total:count,marketCount:count,share:complete&&total>0?count/total:null,marketShare:complete&&total>0?count/total:null,mitCount,mitShare:complete&&count>0?mitCount/count:null,isMIT:(row.brands?.MITSUBISHI??0)>0,electrifiedCount:complete?observedElectrifiedCount:null,observedElectrifiedCount,electrifiedShare:complete&&count>0?observedElectrifiedCount/count:null,technologyCounts:complete?{...row.observedTechnologyCounts}:null,unclassifiedCount:complete?(row.observedTechnologyCounts?.['Não classificado']??0):null};
  }
  function finishFrame(frame) {
    const complete=frame.complete,total=complete?frame.observedTotal:null;
    const rows = input => input.map(row=>finishRow(row,total,complete)).sort((a,b)=>b.observedCount-a.observedCount||textCompare(a.name,b.name));
    const groups=Object.fromEntries(GROUP_DIMS.map(dim=>[dim,rows(frame.groups?.[dim]??[])]));
    const originRows=rows(frame.originRows??[]),ufRows=rows(frame.ufRows??[]),municipalityRows=rows(frame.municipalityRows??[]);
    const channel=frame.channelCoverage??{observedCount:0,knownCount:0,unknownCount:0,available:false};
    const channelCoverage={...channel,knownShare:complete&&frame.observedTotal>0?channel.knownCount/frame.observedTotal:null,unknownShare:complete&&frame.observedTotal>0?channel.unknownCount/frame.observedTotal:null};
    const brandMembership=Object.fromEntries(['marca','modelo','grupo_modelo','uf'].map(dim=>[dim,Object.fromEntries(groups[dim].map(row=>[row.name,{...row.brands}]))]));
    return {...frame,total,groups,originRows,ufRows,municipalityRows,brandMembership,channelCoverage,frequency:'monthly',electrifiedTechnologies:[...ELECTRIFIED],entities:groups[frame.dimension??'marca'],mixes:{technology:groups.propulsao,body:groups.bd_carroceria,porte:groups.bd_segmento,origin:originRows,channel:groups.tipo_venda,vehicleOrigin:groups.bd_origem}};
  }
  function emptyFrame(month,meta,request,status) {
    const coverage=sourceCoverage(meta,month);if(status){coverage.status=status;coverage.complete=false;}
    return finishFrame({month,date:month+'-01',mode:'monthly',dimension:request.dimension??'marca',complete:coverage.complete,coverageStatus:coverage.status,coverage,scopeKey:scopeKey(meta,request.filters??{}),observedTotal:['missing','unavailable'].includes(coverage.status)?null:0,groups:{},originRows:[],ufRows:[],municipalityRows:[],sourceRows:0,selectedUF:request.selectedUF??'',municipalityRequested:Boolean(request.selectedUF),channelCoverage:{observedCount:0,knownCount:0,unknownCount:0,available:false,sourceFields:meta?.channelSourceFields??[]}});
  }
  function aggregateCube(cube,meta,request) {
    const projection=projectionSpec(request),dimensions=projection?.dimensions??GROUP_DIMS,focus=String(request.focusBrand||'MITSUBISHI').toUpperCase();
    const heatSet=projection?.heat?new Set((request.heatBrands??[]).map(b=>String(b).toUpperCase())):null,heat=Object.fromEntries([...(heatSet??[])].map(b=>[b,record()]));
    const filters=request.filters??{},month=cube.month,frame=emptyFrame(month,meta,request),cols=cube.columns??[...cube.dimensions,'count'],index=Object.fromEntries(cols.map((c,i)=>[c,i])),dict=cube.dictionaries??{};
    const descriptors=new Map();
    function descriptor(dim){if(descriptors.has(dim))return descriptors.get(dim);const field=dim==='propulsao'?'bd_combustivel':dim;const labels=(dict[field]??[]).map(v=>dim==='propulsao'?propulsion(v):label(v));const d={column:index[field],labels,fallback:dim==='propulsao'?'Não classificado':UNKNOWN};descriptors.set(dim,d);return d;}
    const value=(row,dim)=>{const d=descriptor(dim);return d.labels[row[d.column]]??d.fallback;};
    const rules=[...DIMS.filter(dim=>selection(filters[dim]).length).map(dim=>[dim,selection(filters[dim])]),...presetChecks(request.preset,request.porte)];
    if(filters.population==='light')rules.push(['segmento',['Auto','Comercial Leve']]);
    const missingFields=rules.map(([dim])=>dim==='propulsao'?'bd_combustivel':dim).filter(dim=>!cols.includes(dim));
    if(missingFields.length)return {...emptyFrame(month,meta,request,'unavailable'),reason:'Dimensões indisponíveis: '+[...new Set(missingFields)].join(', ')};
    const knownChannel=selection(filters.tipo_venda);if(knownChannel.length&&knownChannel.every(v=>['VD','VAREJO'].includes(v))&&Array.isArray(meta?.channelSourceFields)&&!meta.channelSourceFields.length)return {...emptyFrame(month,meta,request,'unavailable'),reason:'Canal de venda ausente na fonte mensal.'};
    const checks=rules.map(([dim,allowed])=>{const d=descriptor(dim),set=new Set(allowed);return {...d,allowed:d.labels.map(v=>set.has(v)),fallbackAllowed:set.has(d.fallback)};});
    const groups=Object.fromEntries(dimensions.map(dim=>[dim,new Map()])),ufs=new Map(),municipalities=new Map(),origins=new Map();
    const channel={observedCount:0,knownCount:0,unknownCount:0,available:(dict.tipo_venda??[]).some(v=>v==='VD'||v==='VAREJO'),sourceFields:meta?.channelSourceFields??[]};
    const trackOrigin=!projection||projection.origin,trackUF=!projection||projection.ufs,trackMunicipal=!projection||projection.municipal;
    const brandOrigins=trackOrigin?new Map((dict.marca??[]).map(name=>[label(name),classifyBrandOrigin(name,+month.slice(0,4),request.originMapping)])):null;
    for(const row of cube.rows??[]){
      if(checks.some(d=>!(d.allowed[row[d.column]]??d.fallbackAllowed)))continue;
      const date=dict.date?.[row[index.date]]??row[index.date];if(typeof date!=='string'||date.slice(0,7)!==month)throw Error('Data fora do mês de origem: '+month);
      const count=Number(row[index.count]);if(!Number.isSafeInteger(count)||count<0)throw Error('Quantidade inválida no cubo revisado.');if(!count)continue;
      const brand=value(row,'marca'),technology=value(row,'propulsao'),uf=value(row,'uf');frame.observedTotal+=count;frame.sourceRows++;
      for(const dim of dimensions)increment(groups[dim],value(row,dim),count,brand,projection?null:technology,undefined,!projection||projection.brands,focus);
      if(trackUF)increment(ufs,uf,count,brand,technology,{uf},!projection,focus);
      if(trackMunicipal&&request.selectedUF&&uf===request.selectedUF){const municipality=value(row,'municipio'),name=municipality+' · '+uf;increment(municipalities,name,count,brand,technology,{municipality,uf,ibgeCode:null,geographicMatch:'Sem correspondência oficial'},!projection,focus);}
      if(trackOrigin){const origin=brandOrigins.get(brand)??classifyBrandOrigin(brand,+month.slice(0,4),request.originMapping);const originRow=increment(origins,origin.name,count,brand,projection?null:technology,{kind:origin.kind,sourceUrls:[]},!projection,focus);if(origin.sourceUrl&&!originRow.sourceUrls.includes(origin.sourceUrl))originRow.sourceUrls.push(origin.sourceUrl);}
      if(heatSet?.has(brand)){const key=value(row,'municipio')+' · '+uf;add(heat[brand],key,count);}
      channel.observedCount+=count;if(['VD','VAREJO'].includes(value(row,'tipo_venda')))channel.knownCount+=count;else channel.unknownCount+=count;
    }
    return finishFrame({...frame,vehicleOriginAvailable:cols.includes('bd_origem'),technologyAvailable:cols.includes('bd_combustivel'),groups:Object.fromEntries(dimensions.map(dim=>[dim,[...groups[dim].values()]])),ufRows:[...ufs.values()],municipalityRows:[...municipalities.values()],originRows:[...origins.values()],channelCoverage:channel,...(heatSet?{heat}:{})});
  }
  function mergeRows(frames,field,dimension) {
    const rows=new Map();for(const frame of frames)for(const original of dimension?frame[field]?.[dimension]??[]:frame[field]??[]){let row=rows.get(original.name);if(!row){row={...original,observedCount:0,observedMitCount:0,brands:record(),observedTechnologyCounts:record(),sourceUrls:[]};rows.set(original.name,row);}row.observedCount+=original.observedCount??0;row.observedMitCount+=original.observedMitCount??0;for(const [brand,n]of Object.entries(original.brands??{}))add(row.brands,brand,n);for(const [tech,n]of Object.entries(original.observedTechnologyCounts??{}))add(row.observedTechnologyCounts,tech,n);for(const source of original.sourceUrls??[])if(!row.sourceUrls.includes(source))row.sourceUrls.push(source);}
    return [...rows.values()];
  }
  // Cumulative municipality counts per brand: the sum of every month's heat in the window.
  function mergeHeat(frames) {
    const out={};for(const frame of frames)for(const [brand,rows] of Object.entries(frame.heat??{})){const target=out[brand]??(out[brand]=record());for(const [name,n] of Object.entries(rows))add(target,name,n);}
    return out;
  }
  function yearToDateFrames(frames,request={}) {
    const index=new Map(frames.map(f=>[f.month,f]));return [...frames].sort((a,b)=>textCompare(a.month,b.month)).map(frame=>{
      const expected=listMonths(frame.month.slice(0,4)+'-01',frame.month),rows=expected.map(month=>index.get(month)),present=rows.filter(Boolean),missingMonths=expected.filter((m,i)=>!rows[i]||!rows[i].complete);
      const scopeConsistent=new Set(present.map(f=>f.scopeKey)).size<=1,complete=!missingMonths.length&&scopeConsistent;
      const total=present.reduce((sum,f)=>sum+f.observedTotal,0),channel={observedCount:total,knownCount:0,unknownCount:0,available:present.some(f=>f.channelCoverage.available),sourceFields:[...new Set(present.flatMap(f=>f.channelCoverage.sourceFields??[]))]};for(const f of present){channel.knownCount+=f.channelCoverage.knownCount;channel.unknownCount+=f.channelCoverage.unknownCount;}
      return projectFrame(finishFrame({...frame,mode:'ytd',periodStart:frame.month.slice(0,4)+'-01-01',periodEnd:monthEnd(frame.month),complete,coverageStatus:complete?'complete':scopeConsistent?'incomplete-ytd':'scope-changed',missingMonths,scopeConsistent,observedTotal:total,groups:Object.fromEntries(GROUP_DIMS.map(dim=>[dim,mergeRows(present,'groups',dim)])),ufRows:mergeRows(present,'ufRows'),municipalityRows:mergeRows(present,'municipalityRows'),originRows:mergeRows(present,'originRows'),heat:mergeHeat(present),channelCoverage:channel,sourceRows:present.reduce((sum,f)=>sum+f.sourceRows,0)}),request);
    });
  }

  const ABBR=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const priorDay = day => { const y=+day.slice(0,4)-1,m=+day.slice(5,7),d=+day.slice(8,10),t=new Date(Date.UTC(y,m-1,d));return (t.getUTCMonth()===m-1?t:new Date(Date.UTC(y,m,0))).toISOString().slice(0,10); };
  const dayLabel = day => day.slice(8,10)+'/'+day.slice(5,7)+'/'+day.slice(0,4);
  const prevMonth = month => { const y=+month.slice(0,4),m=+month.slice(5,7);return m===1?(y-1)+'-12':y+'-'+String(m-1).padStart(2,'0'); };
  function daysOf(month) { const n=+monthEnd(month).slice(8,10);return Array.from({length:n},(_,i)=>month+'-'+String(i+1).padStart(2,'0')); }
  const asDay = (frame,day) => ({...frame,month:day,date:day,granularity:'day',label:dayLabel(day)});
  // One frame per calendar day of the month; days without rows are empty, not missing.
  function dailyFrames(cube,meta,request) {
    const cols=cube.columns??[...cube.dimensions,'count'],dateCol=cols.indexOf('date'),dates=cube.dictionaries?.date??[],byDate=new Map();
    for(const row of cube.rows??[]){const d=dates[row[dateCol]]??row[dateCol];let list=byDate.get(d);if(!list){list=[];byDate.set(d,list);}list.push(row);}
    return daysOf(cube.month).map(day=>asDay(byDate.has(day)?aggregateCube({...cube,rows:byDate.get(day)},meta,request):emptyFrame(cube.month,meta,request),day));
  }
  function emptyDays(month,meta,request,status,reason) { return daysOf(month).map(day=>asDay({...emptyFrame(month,meta,request,status),...(reason?{reason}:{})},day)); }
  // Trailing window of `size` days ending at each day: smooths weekday/weekend noise.
  function rollingFrames(days,size,request={}) {
    const sorted=[...days].sort((a,b)=>textCompare(a.month,b.month));
    return sorted.map((frame,i)=>{
      const present=sorted.slice(Math.max(0,i-size+1),i+1),missingMonths=present.filter(f=>!f.complete).map(f=>f.month),scopeConsistent=new Set(present.map(f=>f.scopeKey)).size<=1,complete=present.length===size&&!missingMonths.length&&scopeConsistent;
      const total=present.reduce((sum,f)=>sum+f.observedTotal,0),channel={observedCount:total,knownCount:0,unknownCount:0,available:present.some(f=>f.channelCoverage.available),sourceFields:[...new Set(present.flatMap(f=>f.channelCoverage.sourceFields??[]))]};for(const f of present){channel.knownCount+=f.channelCoverage.knownCount;channel.unknownCount+=f.channelCoverage.unknownCount;}
      return projectFrame(finishFrame({...frame,mode:'monthly',periodStart:present[0].month,periodEnd:frame.month,windowDays:size,complete,coverageStatus:complete?'complete':scopeConsistent?'incomplete-window':'scope-changed',missingMonths,scopeConsistent,observedTotal:total,groups:Object.fromEntries(GROUP_DIMS.map(dim=>[dim,mergeRows(present,'groups',dim)])),ufRows:mergeRows(present,'ufRows'),municipalityRows:mergeRows(present,'municipalityRows'),originRows:mergeRows(present,'originRows'),channelCoverage:channel,sourceRows:present.reduce((sum,f)=>sum+f.sourceRows,0)}),request);
    });
  }
  // One frame per year: January to the window's end month, so every year compares like with like.
  function pickYearFrames(frames,startMonth,endMonth) {
    const mm=endMonth.slice(5),y0=+startMonth.slice(0,4),y1=+endMonth.slice(0,4);
    return frames.filter(f=>f.month.slice(5)===mm&&+f.month.slice(0,4)>=y0&&+f.month.slice(0,4)<=y1).map(f=>{const y=f.month.slice(0,4);return {...f,granularity:'year',label:y,periodLabel:mm==='12'?'Ano '+y:'Ano '+y+' · jan–'+ABBR[+mm-1]};});
  }
  function safeYoY(current,prior,comparable=true) { return comparable&&Number.isFinite(current)&&Number.isFinite(prior)&&prior>0?(current-prior)/prior:null; }
  function attachYoY(frames,request={}) {
    const index=new Map(frames.map(frame=>[frame.month,frame]));return frames.map(frame=>{
      const previous=index.get(frame.granularity==='day'?priorDay(frame.month):priorMonth(frame.month)),comparable=Boolean(frame.complete&&previous?.complete&&frame.mode===previous.mode&&frame.scopeKey===previous.scopeKey);
      const transform=(current,prior)=>{const older=new Map((prior??[]).map(row=>[row.name,row])),now=new Map((current??[]).map(row=>[row.name,row]));return [...new Set([...now.keys(),...older.keys()])].map(name=>{const row=now.get(name)??finishRow({...older.get(name),observedCount:0,observedMitCount:0,brands:record(),observedTechnologyCounts:record()},frame.total,frame.complete),old=older.get(name),priorCount=comparable?(old?.count??0):null;return {...row,priorCount,priorShare:comparable?(old?.share??(previous.total>0?0:null)):null,yoy:safeYoY(row.count,priorCount,comparable),yoyStatus:!comparable?'unavailable':priorCount===0?'zero-base':'comparable'};}).sort((a,b)=>(b.count??-1)-(a.count??-1)||textCompare(a.name,b.name));};
      const groups=Object.fromEntries(GROUP_DIMS.map(dim=>[dim,transform(frame.groups[dim],previous?.groups?.[dim])]));const originRows=transform(frame.originRows,previous?.originRows);
      return projectFrame({...frame,priorTotal:comparable?previous.total:null,yoy:safeYoY(frame.total,previous?.total,comparable),yearAvailable:comparable,groups,entities:groups[frame.dimension??'marca'],originRows,ufRows:transform(frame.ufRows,previous?.ufRows),municipalityRows:transform(frame.municipalityRows,previous?.municipalityRows),mixes:{technology:groups.propulsao,body:groups.bd_carroceria,porte:groups.bd_segmento,origin:originRows,channel:groups.tipo_venda,vehicleOrigin:groups.bd_origem}},request);
    });
  }
  function rankFrame(frame,dimension='marca',{topN=10,pinMIT=true,metric='count'}={}) {
    if(!frame?.complete)return [];
    const rows=(frame.groups?.[dimension]??frame.entities??[]).filter(row=>row.count>0&&Number.isFinite(row[metric])).slice().sort((a,b)=>b[metric]-a[metric]||textCompare(a.name,b.name)).map((row,index)=>({...row,rank:index+1,position:index+1,isMIT:row.isMIT||(row.brands?.MITSUBISHI??0)>0,pinned:false}));
    const limit=Math.max(1,Math.min(100,Math.floor(topN)||10)),shown=rows.slice(0,limit);if(pinMIT)for(const row of rows)if(row.isMIT&&!shown.some(r=>r.name===row.name))shown.push({...row,pinned:true});return shown;
  }
  function bubbleRows(frame,dimension='marca') { return (frame?.groups?.[dimension]??[]).map(row=>({...row,x:row.share,y:row.yoy,radiusValue:row.count,available:frame.complete&&Number.isFinite(row.share)&&Number.isFinite(row.yoy)&&Number.isFinite(row.count)})); }
  function fixedBubbleScales(frames,dimension='marca') {
    let maxCount=0,maxShare=0,low=0,high=0;
    for(const frame of frames)for(const row of bubbleRows(frame,dimension))if(row.available){maxCount=Math.max(maxCount,row.count);maxShare=Math.max(maxShare,row.share);low=Math.min(low,row.yoy);high=Math.max(high,row.yoy);}
    const pad=Math.max(.05,(high-low)*.06);
    return {xDomain:[0,Math.min(1,maxShare>0?maxShare*1.08:1)],yDomain:[low-pad,high+pad],radiusDomain:[0,maxCount],maxCount,maxShare,radius:count=>count>0&&maxCount>0?32*Math.sqrt(count/maxCount):0};
  }

  const normalizeName = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
  function joinMunicipalities(frames,geometry) {
    const index=new Map();for(const feature of geometry?.features??[]){if(feature.uf&&feature.uf!==geometry.uf)continue;const key=normalizeName(feature.name);index.set(key,index.has(key)?null:feature);}
    return frames.map(frame=>({...frame,municipalityRows:frame.municipalityRows.map(row=>{const feature=row.uf===geometry?.uf?index.get(normalizeName(row.municipality)):null;const code=feature&&/^\d{7}$/.test(String(feature.code))?String(feature.code):null;return {...row,ibgeCode:code,geographicMatch:code?'Nome normalizado + UF únicos':'Sem correspondência única'};})}));
  }
  return {DIMS,GROUP_DIMS,ELECTRIFIED,selection,canonicalFilters,validMonth,monthEnd,listMonths,priorMonth,sourceCoverage,propulsion,classifyBrandOrigin,presetChecks,normalizeRequest,projectionSpec,projectFrame,scopeKey,aggregateCube,emptyFrame,yearToDateFrames,dailyFrames,emptyDays,rollingFrames,pickYearFrames,priorDay,prevMonth,daysOf,attachYoY,safeYoY,rankFrame,bubbleRows,fixedBubbleScales,joinMunicipalities,textCompare};
});
