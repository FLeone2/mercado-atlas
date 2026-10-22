(function () {
  'use strict';

  // One selection contract for analytical filters, cache keys and saved criteria.
  // Within a categorical field values are OR-ed; distinct fields are AND-ed.
  // Empty lists and legacy `all` mean no restriction. Date and population stay scalar.
  const SCALAR_MARKET_FILTERS = Object.freeze(['date', 'population']);
  const UNKNOWN_CATEGORY = 'Não informado';
  const categoryLabel = value => String(value ?? UNKNOWN_CATEGORY);
  function categoricalSelection(value) {
    if (value == null || value === '' || value === 'all') return [];
    const values = Array.isArray(value) ? value : [value];
    if (values.includes('all')) return [];
    return [...new Set(values.map(categoryLabel))].sort();
  }
  function hasFilterSelection(value, field) {
    return SCALAR_MARKET_FILTERS.includes(field)
      ? value != null && value !== '' && value !== 'all'
      : categoricalSelection(value).length > 0;
  }
  function canonicalFilters(filters = {}) {
    return Object.fromEntries(Object.keys(filters).sort().flatMap(field => {
      const value = filters[field];
      if (SCALAR_MARKET_FILTERS.includes(field)) return hasFilterSelection(value, field) ? [[field, value]] : [];
      const values = categoricalSelection(value);
      return values.length ? [[field, values]] : [];
    }));
  }
  function canonicalFilterKey(filters = {}) { return JSON.stringify(canonicalFilters(filters)); }
  // Export/UI callers can preserve the user's complete selected scope without
  // accidentally reporting [] or `all` as an active categorical restriction.
  function activeFilterEntries(filters = {}) {
    return Object.entries(filters).filter(([field, value]) => hasFilterSelection(value, field));
  }

  const INTERACTIVE_DIMS = ['bd_carroceria','bd_segmento','combustivel','marca'];
  const DIMS = ['uf','municipio','marca','modelo','grupo_modelo','combustivel','segmento','subsegmento','tipo_venda','regiao','nacionalidade','ano_fabricacao','potencia','capacidade_carga','capacidade_passageiros','bd_segmento','bd_carroceria','bd_classe','bd_macro','bd_combustivel','bd_origem','propulsao'];
  const LABELS = {uf:'UF',municipio:'Município',marca:'Marca',modelo:'Modelo',grupo_modelo:'Grupo de modelos',combustivel:'Combustível',segmento:'Segmento',subsegmento:'Subsegmento',tipo_venda:'Canal de venda',regiao:'Região',nacionalidade:'Código de nacionalidade da fonte',ano_fabricacao:'Ano de fabricação',potencia:'Potência',capacidade_carga:'Capacidade de carga',capacidade_passageiros:'Capacidade de passageiros',bd_segmento:'Porte (SEGMENT)',bd_carroceria:'Carroceria (BODY TYPE)',bd_classe:'Classe BD',bd_macro:'Macrosegmento BD',bd_combustivel:'Tecnologia BD',bd_origem:'Origem do veículo · BD',propulsao:'Propulsão'};
  // Labels of the origin → channel → fuel → vehicle-type flow (Concorrência). Several source codes may share one label.
  const FLOW_SOURCE={fluxo_origem:'bd_origem',fluxo_canal:'tipo_venda',fluxo_combustivel:'bd_combustivel',fluxo_segmento:'bd_classe'};
  const FLOW_FUEL={FFV:'Flex',GASOLINE:'Gasolina',ETANOL:'Etanol',ETHANOL:'Etanol',DIESEL:'Diesel',MHEV:'Híbrido leve',HEV:'Híbrido',PHEV:'Híbrido plug-in',BEV:'Elétrico'};
  const FLOW_PICKUP={'PICK-UP SMALL':'Picape pequena','PICK-UP COMPACT':'Picape compacta','PICK-UP MID':'Picape média','PICK-UP LARGE':'Picape grande'};
  const FLOW_BODY={SUV:'SUV',HATCH:'Hatch',SEDAN:'Sedan',MPV:'Minivan',WAGON:'Perua'};
  function flowSegment(value){
   const text=String(value??'').trim().toUpperCase(),[body,size='']=text.split(' / ');
   if(!size)return 'Não classificado';
   if(FLOW_PICKUP[size])return FLOW_PICKUP[size];
   if(FLOW_BODY[body])return FLOW_BODY[body];
   if(/VAN$/.test(size)||body==='CARGO'||body==='AMBULANCE')return 'Furgão e van';
   if(/TRUCK/.test(body)||/TRUCK/.test(size))return 'Caminhão leve';
   return 'Outros';
  }
  function flowLabel(dim,value){
   const v=String(value??'').trim();
   if(dim==='fluxo_origem')return v==='LOCAL'?'Nacional':v==='IMP'?'Importado':'Não classificado';
   if(dim==='fluxo_canal')return v==='VAREJO'?'Varejo':v==='VD'?'Venda direta':'Canal não informado';
   if(dim==='fluxo_combustivel')return FLOW_FUEL[v.toUpperCase()]??'Não classificado';
   return flowSegment(v);
  }
  function propulsionClass(value){const v=String(value??'').trim().toUpperCase();if(['GASOLINE','FFV','DIESEL','ETANOL','ETHANOL','TETRAFUEL','GNV'].includes(v))return 'ICE';if(['HEV','PHEV','BEV','MHEV','FCEL'].includes(v))return v;return 'Não classificado';}
  const number = v => v == null ? '—' : new Intl.NumberFormat('pt-BR').format(v);
  const compact = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(v);
  const percent = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(v);
  const monthLabel = m => new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(m.slice(0,7)+'-01T12:00:00Z')).replace('.','');
  const dateLabel = d => d ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')) : '—';
  const iso = d => d.toISOString().slice(0,10);
  function monthEnd(month) { return iso(new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)),0))); }
  // Observed first/last registration dates do not delimit source coverage: a covered day may have zero rows.
  // Importers declare the endpoint with an ISO coverageEnd/coverageThrough or partialCoverage.end.
  // A partial flag without that endpoint leaves coverage unknown; dateMax is only the last observation.
  function sourceCoverageEnd(meta){
   const declared=meta?.coverageEndDate??meta?.coverageEnd??meta?.coverageThrough??(typeof meta?.partialCoverage==='object'?meta.partialCoverage?.end:null);
   if(typeof declared==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(declared))return declared;
   return meta?.partialCoverage===true||meta?.partialMonth===true||meta?.isPartial===true||meta?.sourceComplete===false||meta?.coverageStatus==='partial'?null:meta?.month?monthEnd(meta.month):null;
  }
  function sourceCoverageStart(meta){const declared=meta?.coverageStartDate??(typeof meta?.partialCoverage==='object'?meta.partialCoverage?.start:null);return typeof declared==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(declared)?declared:meta?.month?meta.month+'-01':null;}
  function rangeFrom(value, manifest) {
   const months=(manifest?.months??[]).filter(m=>m.cubePath).map(m=>m.month).sort(); if(!months.length)return null;
   if(!value||value==='all'){const expected=[...new Set([...(Array.isArray(manifest.expectedMonths)?manifest.expectedMonths:[]),...months])].sort();return {start:expected[0]+'-01',end:monthEnd(expected.at(-1))};}
   const [start,end=start]=value.split('..'); return {start:start.length===7?start+'-01':start,end:end.length===7?monthEnd(end):end};
  }
  function listMonths(range) {if(!range)return [];let d=new Date(range.start.slice(0,7)+'-01T12:00:00Z'),out=[];while(iso(d)<=range.end){out.push(iso(d).slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}return out;}
  function comparisonRange(range,kind='previous') {
   if(!range)return null; const s=new Date(range.start+'T12:00:00Z'),e=new Date(range.end+'T12:00:00Z');
   if(kind==='year'){const shift=d=>new Date(Date.UTC(d.getUTCFullYear()-1,d.getUTCMonth(),Math.min(d.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear()-1,d.getUTCMonth()+1,0)).getUTCDate()),12));return {start:iso(shift(s)),end:iso(shift(e))};}
   if(range.start.endsWith('-01')&&range.end===monthEnd(range.end.slice(0,7))){const n=listMonths(range).length;s.setUTCMonth(s.getUTCMonth()-n);const pe=new Date(range.start+'T12:00:00Z');pe.setUTCDate(0);return {start:iso(s),end:iso(pe)};}
   if(range.start.endsWith('-01')&&range.start.slice(0,7)===range.end.slice(0,7)){const endDay=e.getUTCDate();s.setUTCMonth(s.getUTCMonth()-1);const last=new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth()+1,0)).getUTCDate();const pe=new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth(),Math.min(endDay,last),12));return {start:iso(s),end:iso(pe)};}
   const n=Math.round((e-s)/86400000)+1; s.setUTCDate(s.getUTCDate()-n);e.setUTCDate(e.getUTCDate()-n);return {start:iso(s),end:iso(e)};
  }
  function createAccumulator(){return {total:0,groups:Object.fromEntries(DIMS.map(d=>[d,new Map()])),daily:new Map(),monthly:new Map(),brandsByMonth:new Map(),fuelByMonth:new Map(),modelsByMonth:new Map(),technologyByMonth:new Map(),propulsionByMonth:new Map(),bodyByMonth:new Map(),channelByMonth:Object.fromEntries(['marca','modelo','bd_carroceria'].map(d=>[d,new Map()])),channelCoverage:new Map(),stateChannelsByMonth:new Map(),originByMonth:new Map(),municipalBrands:new Map(),flowPaths:new Map(),regionBrands:new Map(),brandFuels:new Map(),sourceRows:0};}
  // Preserve exact source-brand membership after every analytical filter has passed.
  // A model/group label can belong to multiple manufacturers; never infer aliases.
  const RANKING_BRAND_DIMENSIONS = ['marca','modelo','grupo_modelo'];
  function createBrandMembership(){return Object.fromEntries(RANKING_BRAND_DIMENSIONS.map(d=>[d,new Map()]));}
  function collectBrandMembership(membership,count,value){
   if(count<=0)return;
   const brand=value('marca');
   for(const dimension of RANKING_BRAND_DIMENSIONS){const name=dimension==='marca'?brand:value(dimension),entities=membership[dimension];if(!entities.has(name))entities.set(name,new Map());const counts=entities.get(name);counts.set(brand,(counts.get(brand)??0)+count);}
  }
  function finishBrandMembership(membership){return Object.fromEntries(RANKING_BRAND_DIMENSIONS.map(d=>[d,Object.fromEntries([...membership[d]].map(([name,counts])=>[name,Object.fromEntries(counts)]))]));}
  // Count dictionary codes inside each monthly cube, then decode categories once.
  // Municipality remains a joint (municipality, UF) key; filters still intersect before counting.
  function collectCube(acc,cube,filters,range,options={}){
   const cols=cube.columns??[...cube.dimensions,'count'],idx=Object.fromEntries(cols.map((x,i)=>[x,i])),dictionaries=cube.dictionaries??{};
   const dimensions=options.groupDimensions??DIMS,descriptors=new Map();
   const onAcceptedRow=options.onAcceptedRow;
   if(options.includeInteractive&&!acc.interactiveMonthlyGroups)acc.interactiveMonthlyGroups=Object.fromEntries(INTERACTIVE_DIMS.map(d=>[d,new Map()]));
   const trackDaily=Boolean(options.includeInteractive&&options.includeDaily);if(trackDaily&&!acc.interactiveDailyGroups)acc.interactiveDailyGroups=Object.fromEntries(INTERACTIVE_DIMS.map(d=>[d,new Map()]));
   const historyDimensions=options.includeHistoryComparisons?['marca','modelo','bd_carroceria']:[];
   const trackChannels=options.includeHistoryComparisons||options.includeChannelCoverage||options.includeStateChannels;
   const add=(map,key,count)=>map.set(key,(map.get(key)??0)+count);
   const descriptor=d=>{if(descriptors.has(d))return descriptors.get(d);const flow=FLOW_SOURCE[d]!==undefined,source=flow?FLOW_SOURCE[d]:d==='propulsao'?'bd_combustivel':d,values=dictionaries[source]??[],labels=values.map(v=>flow?flowLabel(d,v):d==='propulsao'?propulsionClass(v):categoryLabel(v));const fallback=labels.length;labels.push(flow?flowLabel(d,null):d==='propulsao'?'Não classificado':'Não informado');const result={dim:d,col:idx[source],labels,fallback};descriptors.set(d,result);return result;};
   const codeFor=(d,row)=>{const code=row[d.col];return d.labels[code]===undefined?d.fallback:code;};
   const checks=DIMS.filter(d=>hasFilterSelection(filters[d],d)).map(d=>{const desc=descriptor(d),allowed=new Set(categoricalSelection(filters[d]));return {...desc,allowed:desc.labels.map(v=>allowed.has(v))};});
   if(filters.population==='light'){const desc=descriptor('segmento');checks.push({...desc,allowed:desc.labels.map(v=>v==='Auto'||v==='Comercial Leve')});}
   const grouped=dimensions.filter(d=>d!=='municipio').map(descriptor),municipality=dimensions.includes('municipio')?descriptor('municipio'):null;
   const ufValues=dictionaries.uf??[],ufFallback=ufValues.length,ufLabels=ufValues.map(v=>String(v??'UF não informada'));ufLabels.push('UF não informada');
   const newCounter=desc=>({...desc,counts:new Float64Array(desc.labels.length),seen:new Uint8Array(desc.labels.length),touched:[]});
   const increment=(counter,code,count)=>{counter.counts[code]+=count;if(!counter.seen[code]){counter.seen[code]=1;counter.touched.push(code);}};
   const channelDescriptor=trackChannels?descriptor('tipo_venda'):null;
   const jointSpecs=historyDimensions.map(dim=>({left:descriptor(dim),right:channelDescriptor,target:acc.channelByMonth[dim]}));
   if(options.includeStateChannels)jointSpecs.push({left:descriptor('uf'),right:channelDescriptor,target:acc.stateChannelsByMonth});
   if(options.includeOriginAnalysis)jointSpecs.push({left:descriptor('marca'),right:descriptor('bd_origem'),target:acc.originByMonth});
   // Municipality × brand over the whole period (no month in the key): the leader map reads one UF at a time.
   if(options.includeMunicipalLeaders)jointSpecs.push({left:descriptor('municipio'),right:descriptor('marca'),target:acc.municipalBrands,noMonth:true});
   // Region × brand and brand × fuel over the whole period, for the connections chord.
   if(options.includeConnections){jointSpecs.push({left:descriptor('regiao'),right:descriptor('marca'),target:acc.regionBrands,noMonth:true});jointSpecs.push({left:descriptor('marca'),right:descriptor('fluxo_combustivel'),target:acc.brandFuels,noMonth:true});}
   // Four-way path origin × channel × fuel × vehicle type, kept whole so ribbons can be traced end to end.
   const flowDims=options.includeFlow?['fluxo_origem','fluxo_canal','fluxo_combustivel','fluxo_segmento'].map(descriptor):null,flowRadix=flowDims?flowDims.map(d=>d.labels.length):null;
   const newJointCounter=spec=>{const length=spec.left.labels.length*spec.right.labels.length;return {...spec,stride:spec.right.labels.length,counts:new Float64Array(length),seen:new Uint8Array(length),touched:[]};};
   const months=new Map(),dates=new Map();
   const datePlan=date=>{if(dates.has(date))return dates.get(date);if(!date||date<range.start||date>range.end){dates.set(date,null);return null;}const month=date.slice(0,7);if(!months.has(month))months.set(month,{month,total:0,seen:false,counters:grouped.map(newCounter),joints:jointSpecs.map(newJointCounter),flow:flowDims?new Map():null,channelTotals:{observedCount:0,knownCount:0,unknownCount:0},municipalities:new Map()});const plan={date,count:0,seen:false,month:months.get(month),dayCounters:trackDaily?grouped.filter(desc=>INTERACTIVE_DIMS.includes(desc.dim)).map(newCounter):null};dates.set(date,plan);return plan;};
   const datePlans=(dictionaries.date??[]).map(date=>date==null?undefined:datePlan(date));
   for(const row of cube.rows??[]){
    const dateCode=row[idx.date],plan=datePlans[dateCode]===undefined?datePlan(dictionaries.date?.[dateCode]??dateCode):datePlans[dateCode];if(!plan)continue;
    let valid=true;for(const check of checks){if(!check.allowed[codeFor(check,row)]){valid=false;break;}}if(!valid)continue;
    const count=Number(row[idx.count]);if(!Number.isFinite(count)||count<0)throw Error('Quantidade inválida no cubo revisado.');
    // Optional aggregate-only consumer hook: every existing date/population/dimension filter has passed.
    if(onAcceptedRow)onAcceptedRow(row,count,plan.date,d=>{const desc=descriptor(d);return desc.labels[codeFor(desc,row)];});
    if(trackChannels){const label=channelDescriptor.labels[codeFor(channelDescriptor,row)],totals=plan.month.channelTotals;totals.observedCount+=count;if(label==='VD'||label==='VAREJO')totals.knownCount+=count;else totals.unknownCount+=count;}
    for(const joint of plan.month.joints)increment(joint,codeFor(joint.left,row)*joint.stride+codeFor(joint.right,row),count);
    if(plan.month.flow){let k=0;for(let i=0;i<flowDims.length;i++)k=k*flowRadix[i]+codeFor(flowDims[i],row);plan.month.flow.set(k,(plan.month.flow.get(k)??0)+count);}
    acc.total+=count;acc.sourceRows++;plan.count+=count;plan.seen=true;const month=plan.month;month.total+=count;month.seen=true;
    for(const counter of month.counters)increment(counter,codeFor(counter,row),count);
    if(plan.dayCounters)for(const counter of plan.dayCounters)increment(counter,codeFor(counter,row),count);
    if(municipality){const rawUf=row[idx.uf],uf=ufLabels[rawUf]===undefined?ufFallback:rawUf;let counter=month.municipalities.get(uf);if(!counter){counter=newCounter(municipality);month.municipalities.set(uf,counter);}increment(counter,codeFor(counter,row),count);}
   }
   const targets={marca:acc.brandsByMonth,combustivel:acc.fuelByMonth,modelo:acc.modelsByMonth,bd_combustivel:acc.technologyByMonth,propulsao:acc.propulsionByMonth,...((options.includeHistoryComparisons||options.includeBody)?{bd_carroceria:acc.bodyByMonth}:{})};
   for(const plan of dates.values())if(plan?.seen){acc.daily.set(plan.date,(acc.daily.get(plan.date)??0)+plan.count);if(plan.dayCounters)for(const counter of plan.dayCounters){const map=acc.interactiveDailyGroups[counter.dim];for(const code of counter.touched){const key=JSON.stringify([plan.date,counter.labels[code]]);map.set(key,(map.get(key)??0)+counter.counts[code]);}}}
   for(const month of months.values()){if(!month.seen)continue;acc.monthly.set(month.month,(acc.monthly.get(month.month)??0)+month.total);
    for(const counter of month.counters){const group=acc.groups[counter.dim],timeline=targets[counter.dim];for(const code of counter.touched){const label=counter.labels[code],count=counter.counts[code];group.set(label,(group.get(label)??0)+count);if(timeline){const key=month.month+'|'+label;timeline.set(key,(timeline.get(key)??0)+count);}if(options.includeInteractive&&acc.interactiveMonthlyGroups[counter.dim]){const map=acc.interactiveMonthlyGroups[counter.dim],key=JSON.stringify([month.month,label]);map.set(key,(map.get(key)??0)+count);}}}
    if(month.flow)for(const [packed,n] of month.flow){let k=packed;const parts=new Array(flowDims.length);for(let i=flowDims.length-1;i>=0;i--){parts[i]=flowDims[i].labels[k%flowRadix[i]];k=Math.floor(k/flowRadix[i]);}add(acc.flowPaths,JSON.stringify(parts),n);}
    for(const joint of month.joints)for(const code of joint.touched){const left=joint.left.labels[Math.floor(code/joint.stride)],right=joint.right.labels[code%joint.stride];add(joint.target,joint.noMonth?JSON.stringify([left,right]):JSON.stringify([month.month,left,right]),joint.counts[code]);}
    for(const [uf,counter]of month.municipalities)for(const code of counter.touched){const key=counter.labels[code]+' · '+ufLabels[uf];acc.groups.municipio.set(key,(acc.groups.municipio.get(key)??0)+counter.counts[code]);}
   }
   if(trackChannels){const meta=options.sourceMeta??{},sourceValues=dictionaries.tipo_venda??[],available=sourceValues.some(v=>v==='VD'||v==='VAREJO');for(const month of listMonths(range).filter(m=>m===cube.month)){const totals=months.get(month)?.channelTotals??{observedCount:0,knownCount:0,unknownCount:0};const previous=acc.channelCoverage.get(month);acc.channelCoverage.set(month,{month,available,sourceFields:[...(meta.channelSourceFields??[])],aliasRows:meta.channelAliasRows??0,observedCount:totals.observedCount+(previous?.observedCount??0),knownCount:totals.knownCount+(previous?.knownCount??0),unknownCount:totals.unknownCount+(previous?.unknownCount??0)});}}
   return acc;
  }
  function finish(acc,prior,year,range,coverage,comparisonAvailable,yearAvailable){
   const rows=(map,pmap)=>[...map].map(([name,count])=>({name,count,marketShare:acc.total?count/acc.total:null,previous:comparisonAvailable?(pmap.get(name)??0):null,changeRate:comparisonAvailable&&pmap.get(name)>0?(count-pmap.get(name))/pmap.get(name):null,shareChange:comparisonAvailable&&prior.total?count/acc.total-(pmap.get(name)??0)/prior.total:null})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
   const groups=Object.fromEntries(DIMS.map(d=>[d,rows(acc.groups[d],prior.groups[d])]));
   const covered=new Set(coverage.map(m=>m.month));const daily=[];for(let d=new Date(range.start+'T12:00:00Z');iso(d)<=range.end;d.setUTCDate(d.getUTCDate()+1)){const date=iso(d);daily.push({date,count:covered.has(date.slice(0,7))?(acc.daily.get(date)??0):null});}
   const monthly=listMonths(range).map(month=>({date:month+'-01',month,count:covered.has(month)?(acc.monthly.get(month)??0):null}));
   const jointTimeline=map=>[...map].map(([key,count])=>{const [month,name,channel]=JSON.parse(key);return {date:month+'-01',month,name,channel,count};});
   const timeline=(map)=>[...map].map(([key,count])=>({date:key.slice(0,7)+'-01',name:key.slice(8),count,marketShare:acc.monthly.get(key.slice(0,7))?count/acc.monthly.get(key.slice(0,7)):null}));
   const municipalBrands=acc.municipalBrands.size?[...acc.municipalBrands].map(([key,count])=>{const [municipio,marca]=JSON.parse(key);return {municipio,marca,count};}):undefined;
   const flowPaths=acc.flowPaths.size?[...acc.flowPaths].map(([key,count])=>{const [origem,canal,combustivel,segmento]=JSON.parse(key);return {origem,canal,combustivel,segmento,count};}):undefined;
   const pairs=(map,a,b)=>[...map].map(([key,count])=>{const [x,y]=JSON.parse(key);return {[a]:x,[b]:y,count};});
   const connections=acc.regionBrands.size||acc.brandFuels.size?{regionBrand:pairs(acc.regionBrands,'regiao','marca'),brandFuel:pairs(acc.brandFuels,'marca','combustivel')}:undefined;
   return {total:acc.total,municipalBrands,flowPaths,connections,previous:comparisonAvailable?prior.total:null,year:yearAvailable?year.total:null,changeRate:comparisonAvailable&&prior.total?(acc.total-prior.total)/prior.total:null,yearChangeRate:yearAvailable&&year.total?(acc.total-year.total)/year.total:null,groups,daily,monthly,brandsByMonth:timeline(acc.brandsByMonth),fuelByMonth:timeline(acc.fuelByMonth),modelsByMonth:timeline(acc.modelsByMonth),technologyByMonth:timeline(acc.technologyByMonth),propulsionByMonth:timeline(acc.propulsionByMonth),bodyByMonth:timeline(acc.bodyByMonth),channelByMonth:Object.fromEntries(Object.entries(acc.channelByMonth).map(([dim,map])=>[dim,jointTimeline(map)])),channelCoverage:[...acc.channelCoverage.values()].sort((a,b)=>a.month.localeCompare(b.month)),stateChannelsByMonth:jointTimeline(acc.stateChannelsByMonth),originByMonth:[...acc.originByMonth].map(([key,count])=>{const [month,name,origin]=JSON.parse(key);return {date:month+'-01',month,brand:name,vehicleOrigin:origin,name,origin,count,marketShare:acc.monthly.get(month)?count/acc.monthly.get(month):null};}),range,coverage,comparisonAvailable,yearAvailable,sourceRows:acc.sourceRows};
  }
  // Interactive charts keep the exact selected universe. Counts are weighted source
  // registrations, not row counts; uncovered periods have no valid denominator.
  function finishInteractive(acc,filters,range,index,covered,unavailableMonths=[]){
   const months=listMonths(range),missingMonths=months.filter(m=>!index.has(m));
   const incompleteMonths=months.filter(m=>index.has(m)&&!covered(m,range));
   const coverage=months.map(month=>{const meta=index.get(month),unavailable=unavailableMonths.includes(month),complete=Boolean(meta&&covered(month,range)&&!unavailable);return {month,status:!meta?'missing':unavailable?'unavailable':complete?'complete':'partial',complete,coverageStart:meta?sourceCoverageStart(meta):null,coverageEnd:meta?sourceCoverageEnd(meta):null,sourceComplete:!!meta&&sourceCoverageStart(meta)<=month+'-01'&&sourceCoverageEnd(meta)>=monthEnd(month),selectedStart:range.start>month+'-01'?range.start:month+'-01',selectedEnd:range.end<monthEnd(month)?range.end:monthEnd(month)};});
   const monthly=coverage.map(c=>({date:c.month+'-01',month:c.month,count:c.complete?(acc.monthly.get(c.month)??0):null,observedCount:index.has(c.month)&&c.status!=='unavailable'?(acc.monthly.get(c.month)??0):null,complete:c.complete,coverageStatus:c.status}));
   const monthlyGroups=Object.fromEntries(INTERACTIVE_DIMS.map(d=>{const names=[...acc.groups[d].keys()].sort(),map=acc.interactiveMonthlyGroups?.[d]??new Map();return [d,monthly.flatMap(m=>names.map(name=>{const observedCount=map.get(JSON.stringify([m.month,name]))??0,count=m.complete?observedCount:null;return {date:m.date,month:m.month,name,count,observedCount:m.observedCount===null?null:observedCount,denominator:m.count,marketShare:m.count>0?count/m.count:null,complete:m.complete,coverageStatus:m.coverageStatus};}))];}));
   const complete=coverage.every(c=>c.complete),total=complete?acc.total:null;
   const groups=Object.fromEntries(INTERACTIVE_DIMS.map(d=>[d,[...acc.groups[d]].map(([name,count])=>({name,count:complete?count:null,observedCount:count,marketShare:total>0?count/total:null})).sort((a,b)=>b.observedCount-a.observedCount||a.name.localeCompare(b.name))]));
   const daily=acc.interactiveDailyGroups?(()=>{const out=[],done=new Map(monthly.map(m=>[m.month,m.complete]));for(let d=new Date(range.start+'T12:00:00Z');iso(d)<=range.end;d.setUTCDate(d.getUTCDate()+1)){const date=iso(d),ok=done.get(date.slice(0,7))===true;out.push({date,month:date.slice(0,7),count:ok?(acc.daily.get(date)??0):null,complete:ok});}return out;})():null;
   const dailyGroups=acc.interactiveDailyGroups?Object.fromEntries(INTERACTIVE_DIMS.map(d=>[d,[...acc.interactiveDailyGroups[d]].map(([key,count])=>{const [date,name]=JSON.parse(key);return {date,name,count};})])):null;
   return {total,observedTotal:acc.total,denominator:total,denominatorDefinition:'Registros no recorte e filtros declarados; períodos incompletos não têm denominador',groups,monthly,monthlyGroups,daily,dailyGroups,coverage,complete,missingMonths,incompleteMonths,unavailableMonths,range,requestedRange:range,filters:canonicalFilters(filters),removedFilters:[]};
  }
  // Optional catalog: sparse exact triples, never products of marginal totals.
  const CATALOG_BUCKET_LIMIT=100000, CATALOG_TIMELINE_LIMIT=250000;
  function createCatalogExtras(limit=CATALOG_BUCKET_LIMIT){return {limit,segmentFields:new Set(),joints:{segmentBrandModel:new Map(),modelChannelRegion:new Map()},overflow:new Set(),ufByMonth:new Map()};}
  function collectCatalogRow(extra,count,date,value,segmentField){
   extra.segmentFields.add(segmentField);
   const add=(name,values)=>{if(extra.overflow.has(name))return;const map=extra.joints[name],key=JSON.stringify(values);if(!map.has(key)&&map.size>=extra.limit){map.clear();extra.overflow.add(name);return;}map.set(key,(map.get(key)??0)+count);};
   add('segmentBrandModel',[segmentField,value(segmentField),value('marca'),value('modelo')]);
   add('modelChannelRegion',[value('modelo'),value('tipo_venda'),value('regiao')]);
   const key=JSON.stringify([date.slice(0,7),value('uf')]);extra.ufByMonth.set(key,(extra.ufByMonth.get(key)??0)+count);
  }
  function finishCatalog(acc,extra,range,coverage,{complete=true,missingMonths=[],incompleteMonths=[],unavailableMonths=[]}={}){
   const result=finish(acc,createAccumulator(),createAccumulator(),range,coverage,false,false);
   result.observedTotal=acc.total;result.complete=complete;result.missingMonths=missingMonths;result.incompleteMonths=incompleteMonths;result.unavailableMonths=unavailableMonths;
   if(unavailableMonths.length&&listMonths(range).filter(m=>!missingMonths.includes(m)).every(m=>unavailableMonths.includes(m)))result.total=null;
   result.denominator=result.total;result.denominatorDefinition='Registros observados no recorte e filtros declarados';
   if(extra){
    result.joints=Object.fromEntries(Object.entries(extra.joints).map(([name,map])=>[name,{available:!extra.overflow.has(name),dimensions:name==='segmentBrandModel'?['segment','marca','modelo']:['modelo','tipo_venda','regiao'],segmentFields:name==='segmentBrandModel'?[...extra.segmentFields].sort():undefined,total:acc.total,bucketLimit:extra.limit,reason:extra.overflow.has(name)?'Limite de combinações exatas excedido; nenhuma linha parcial é exibida.':null,rows:extra.overflow.has(name)?[]:[...map].map(([key,count])=>{const parts=JSON.parse(key);return name==='segmentBrandModel'?{segmentDimension:parts[0],values:parts.slice(1),count}:{values:parts,count};})}]));
    const ufRows=[...extra.ufByMonth].map(([key,count])=>{const [month,name]=JSON.parse(key);return {date:month+'-01',name,count};});
    result.timelines={};result.timelineAvailability={};
    for(const [dim,rows]of [['marca',result.brandsByMonth],['modelo',result.modelsByMonth],['uf',ufRows]]){
     const names=result.groups[dim].map(r=>r.name),available=names.length*result.monthly.length<=CATALOG_TIMELINE_LIMIT;
     result.timelines[dim]=available?completeSeries(rows,result.monthly,names).map(row=>{const month=result.monthly.find(m=>m.date===row.date);return {...row,month:row.date.slice(0,7),count:month.count===null?null:row.count,denominator:month.count,marketShare:month.count?row.count/month.count:null};}):[];
     result.timelineAvailability[dim]={available,reason:available?null:'Limite de células da série excedido; série indisponível sem truncamento.',cellLimit:CATALOG_TIMELINE_LIMIT};
    }
   }
   return result;
  }

  function csvText(rows){const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];const esc=v=>{let text=String(v??'');if(typeof v==='string'&&/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};return '\ufeff'+[keys.map(esc).join(';'),...rows.map(r=>keys.map(k=>esc(r[k])).join(';'))].join('\r\n');}

  function coverageMonths(manifest){const available=[...(Array.isArray(manifest?.expectedMonths)?manifest.expectedMonths:[]),...(manifest?.months??[]).map(m=>m.month)].filter(Boolean).sort();return available.length?listMonths({start:available[0]+'-01',end:monthEnd(available.at(-1))}):[];}

  function annualRows(monthly){const years=new Map();for(const row of monthly){const year=row.date.slice(0,4);if(!years.has(year))years.set(year,{date:year+'-01-01',year,count:0,coveredMonths:0,selectedMonths:0});const y=years.get(year);y.selectedMonths++;if(row.count!==null){y.count+=row.count;y.coveredMonths++;}}return [...years.values()].map(y=>({...y,observedCount:y.count,count:y.coveredMonths===y.selectedMonths?y.count:null,coverageStatus:y.coveredMonths===y.selectedMonths?'Completo no recorte':'Meses ausentes'}));}

  function completeSeries(rows,monthly,names){const index=new Map(rows.map(r=>[r.date+'|'+r.name,r]));return monthly.flatMap(m=>[...names].map(name=>index.get(m.date+'|'+name)??{date:m.date,name,count:m.count===null?null:0,marketShare:m.count===null||!m.count?null:0}));}
  function classifyBrandOrigin(name,year,mapping){const rule=mapping?.brands?.[String(name??'').trim().toUpperCase()];if(!rule||(rule.startYear&&year<rule.startYear))return {origin:'Não classificada',kind:'unknown'};return {origin:rule.origin,kind:rule.chineseOrigin===true?'china':rule.originCode==='BRA_CHN_PARTNERSHIP'?'partnership':'other',sourceUrl:rule.sourceUrl};}
  function originSeries(baseline,mapping){if(!baseline)return {rows:[],brands:[],total:0,china:0,partnership:0,unknown:0};const byMonth=new Map(baseline.monthly.map(r=>[r.date,{date:r.date,total:r.count,china:r.count===null?null:0,partnership:r.count===null?null:0,unknown:r.count===null?null:0}])),brands=new Map();for(const row of baseline.brandsByMonth){const classification=classifyBrandOrigin(row.name,Number(row.date.slice(0,4)),mapping),month=byMonth.get(row.date);if(!month||month.total===null)continue;if(['china','partnership','unknown'].includes(classification.kind))month[classification.kind]+=row.count;const key=row.name+'|'+classification.origin;if(!brands.has(key))brands.set(key,{name:row.name,origin:classification.origin,kind:classification.kind,count:0,sourceUrl:classification.sourceUrl??null});brands.get(key).count+=row.count;}const rows=[...byMonth.values()].map(r=>({...r,chineseMarketShare:r.total?r.china/r.total:null,inclusiveMarketShare:r.total?(r.china+r.partnership)/r.total:null,partnershipMarketShare:r.total?r.partnership/r.total:null,unknownMarketShare:r.total?r.unknown/r.total:null}));return {rows,brands:[...brands.values()].sort((a,b)=>b.count-a.count),total:baseline.total,china:rows.reduce((s,r)=>s+(r.china??0),0),partnership:rows.reduce((s,r)=>s+(r.partnership??0),0),unknown:rows.reduce((s,r)=>s+(r.unknown??0),0)};}

  // The compact seed keeps domain rows once. Rehydrate only the local fallback;
  // live owner manifests continue to come directly from the complete private source.
  function fallbackManifestFromSnapshot(snapshot){
   const manifest=snapshot?.marketManifest;if(!manifest||manifest.dimensionChoices)return manifest;
   const choices=Object.fromEntries([...DIMS,'date'].map(d=>[d,new Set()]));
   for(const row of snapshot.queries?.filter_choices?.rows??[])for(const [field,value]of Object.entries(row))if(choices[field]&&(field!=='date'||value!=null))choices[field].add(field==='date'?String(value):categoryLabel(value));
   return {...manifest,dimensionChoices:Object.fromEntries(Object.entries(choices).map(([field,values])=>[field,[...values]]))};
  }

  // Keep reviewed domains available before the manifest request finishes or when it
  // fails. Exact source tokens, including unknown labels, remain distinct choices.
  function marketFilterChoiceRows(manifest,fallbackRows=[]){
   const values=Object.fromEntries(['population','date',...DIMS].map(field=>[field,new Set()]));
   const add=(field,value)=>{if(!values[field])return;if(['date','population'].includes(field)){if(value!=null&&String(value)!=='')values[field].add(String(value));}else values[field].add(categoryLabel(value));};
   for(const row of fallbackRows)for(const [field,value]of Object.entries(row))add(field,value);
   for(const [field,choices]of Object.entries(manifest?.dimensionChoices??{}))for(const value of choices)add(field,value);
   for(const value of ['light','all_content'])add('population',value);
   for(const value of ['ICE','HEV','PHEV','BEV','MHEV','FCEL','Não classificado'])add('propulsao',value);
   for(const month of coverageMonths(manifest))for(let day=1;day<=Number(monthEnd(month).slice(-2));day++)add('date',month+'-'+String(day).padStart(2,'0'));
   return Object.entries(values).flatMap(([field,choices])=>[...choices].map(value=>({[field]:value})));
  }

  // Complete only requested display series. A missing source channel field stays
  // null even when the market month itself is covered; no VD/Varejo imputation.
  function completeChannelSeries(rows,monthly,names,coverage,channels=['VD','VAREJO']){
   const index=new Map(rows.map(row=>[JSON.stringify([row.date,row.name,row.channel]),row]));
   const observed=new Map((coverage??[]).map(row=>[row.month,row.available]));
   return monthly.flatMap(month=>[...names].flatMap(name=>channels.map(channel=>{
    const row=index.get(JSON.stringify([month.date,name,channel]));
    const channelSourceAvailable=observed.get(month.month??month.date.slice(0,7))===true;
    const available=month.count!==null&&(!['VD','VAREJO'].includes(channel)||channelSourceAvailable);
    return {...(row??{}),date:month.date,month:month.month??month.date.slice(0,7),name,channel,count:available?(row?.count??0):null,channelAvailable:available,channelSourceAvailable};
   })));
  }

  async function manifestCacheIdentity(manifest,base){const bytes=new TextEncoder().encode(JSON.stringify(manifest)),digest=await crypto.subtle.digest('SHA-256',bytes);return new URL(base).href+'|'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
  function retainedAggregateBytes(value,limit){
   if(globalThis.PerformanceCache?.estimateBytes)return globalThis.PerformanceCache.estimateBytes(value,limit);
   const seen=new Set();let bytes=0;
   const visit=(item,depth=0)=>{if(bytes>limit)return;if(depth>128){bytes=Infinity;return;}if(item===null||typeof item!=='object'){bytes+=typeof item==='string'?16+item.length*2:16;return;}if(seen.has(item)){bytes+=8;return;}seen.add(item);bytes+=64;
    const tag=Object.prototype.toString.call(item);
    if(tag==='[object Map]'){for(const [key,v]of item){bytes+=32;visit(key,depth+1);visit(v,depth+1);if(bytes>limit)break;}}
    else if(tag==='[object Set]'){for(const v of item){bytes+=24;visit(v,depth+1);if(bytes>limit)break;}}
    else if(Array.isArray(item)){bytes+=item.length*8;for(let i=0;i<item.length&&bytes<=limit;i++)visit(item[i],depth+1);}
    else for(const key in item)if(Object.prototype.hasOwnProperty.call(item,key)){bytes+=24+key.length*2;visit(item[key],depth+1);if(bytes>limit)break;}
   };try{visit(value);}catch{return Infinity;}return bytes;
  }
  function validMonthlyContribution(value,membership,extra){
   if(value?.version!==1||value.safe!==true||!value.acc||!Number.isSafeInteger(value.acc.total)||value.acc.total<0||!Number.isSafeInteger(value.acc.sourceRows)||value.acc.sourceRows<0)return false;
   const countMap=map=>{if(!(map instanceof Map))return false;for(const [key,count]of map)if(typeof key!=='string'||!Number.isSafeInteger(count)||count<0)return false;return true;};
   const template=createAccumulator();
   if(Object.keys(value.acc).some(field=>!Object.hasOwn(template,field)&&field!=='interactiveMonthlyGroups'&&field!=='interactiveDailyGroups'))return false;
   for(const [field,empty]of Object.entries(template)){
    if(field==='total'||field==='sourceRows')continue;
    const actual=value.acc[field];
    if(field==='channelCoverage'){if(!(actual instanceof Map)||![...actual].every(([key,v])=>typeof key==='string'&&v?.month===key&&Array.isArray(v.sourceFields)&&['observedCount','knownCount','unknownCount'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0)))return false;}
    else if(empty instanceof Map){if(!countMap(actual))return false;}
    else if(!actual||!Object.keys(empty).every(dim=>countMap(actual[dim])))return false;
   }
   if(value.acc.interactiveMonthlyGroups&&!INTERACTIVE_DIMS.every(dim=>countMap(value.acc.interactiveMonthlyGroups[dim])))return false;
   if(value.acc.interactiveDailyGroups&&!INTERACTIVE_DIMS.every(dim=>countMap(value.acc.interactiveDailyGroups[dim])))return false;
   if(membership&&!RANKING_BRAND_DIMENSIONS.every(dim=>value.membership?.[dim] instanceof Map&&[...value.membership[dim]].every(([key,map])=>typeof key==='string'&&countMap(map))))return false;
   if(extra&&(!value.extra||value.extra.limit!==extra.limit||!(value.extra.segmentFields instanceof Set)||!(value.extra.overflow instanceof Set)||!countMap(value.extra.ufByMonth)||!['segmentBrandModel','modelChannelRegion'].every(name=>countMap(value.extra.joints?.[name]))))return false;
   return true;
  }
  function createResultCache({maxBytes=8*1024*1024,maxEntries=4}={}){
   const cache=new Map();let bytes=0;
   return {get(key){if(!cache.has(key))return null;const item=cache.get(key);cache.delete(key);cache.set(key,item);return item.value;},set(key,value){const size=retainedAggregateBytes(value,maxBytes);if(cache.has(key)){bytes-=cache.get(key).bytes;cache.delete(key);}if(size>maxBytes||maxEntries<1)return;while(cache.size&&(bytes+size>maxBytes||cache.size>=maxEntries)){const first=cache.keys().next().value;bytes-=cache.get(first).bytes;cache.delete(first);}cache.set(key,{value,bytes:size});bytes+=size;},clear(){cache.clear();bytes=0;},stats:()=>({entries:cache.size,logicalBytes:bytes,maxBytes,maxEntries})};
  }
  // Cache additive monthly contributions, never ratios or finalized denominators.
  // Map insertion order is retained so ties, sparse joints and zero-count labels
  // have the same presentation as a fresh chronological scan.
  function createMonthlyAggregateCache({maxBytes=24*1024*1024,maxEntries=192}={}){
   const cache=new Map();let bytes=0,hits=0,misses=0;
   return {get(key){const item=cache.get(key);if(!item){misses++;return null;}hits++;cache.delete(key);cache.set(key,item);return item.value;},set(key,value){
    const size=retainedAggregateBytes(value,maxBytes);
    if(cache.has(key)){bytes-=cache.get(key).bytes;cache.delete(key);}if(size>maxBytes||maxEntries<1)return;
    while(cache.size&&(bytes+size>maxBytes||cache.size>=maxEntries)){const first=cache.keys().next().value;bytes-=cache.get(first).bytes;cache.delete(first);}
    cache.set(key,{value,bytes:size});bytes+=size;
   },clear(){cache.clear();bytes=0;},stats:()=>({entries:cache.size,logicalBytes:bytes,maxBytes,maxEntries,hits,misses})};
  }
  function mergeCountMaps(target,source){for(const [key,value]of source){if(value instanceof Map){if(!target.has(key))target.set(key,new Map());mergeCountMaps(target.get(key),value);}else target.set(key,(target.get(key)??0)+value);}}
  function mergeAccumulator(target,source){
   target.total+=source.total;target.sourceRows+=source.sourceRows;
   for(const [field,value]of Object.entries(source)){
    if(field==='total'||field==='sourceRows')continue;
    if(field==='channelCoverage'){for(const [month,coverage]of value){const old=target.channelCoverage.get(month);target.channelCoverage.set(month,{...coverage,sourceFields:[...coverage.sourceFields],observedCount:coverage.observedCount+(old?.observedCount??0),knownCount:coverage.knownCount+(old?.knownCount??0),unknownCount:coverage.unknownCount+(old?.unknownCount??0)});}continue;}
    if(value instanceof Map)mergeCountMaps(target[field],value);
    else {if(!target[field])target[field]={};for(const [dim,map]of Object.entries(value)){if(!target[field][dim])target[field][dim]=new Map();mergeCountMaps(target[field][dim],map);}}
   }
  }
  function mergeCatalogExtras(target,source){
   for(const field of source.segmentFields)target.segmentFields.add(field);
   mergeCountMaps(target.ufByMonth,source.ufByMonth);
   for(const [name,map]of Object.entries(source.joints)){
    if(target.overflow.has(name))continue;
    if(source.overflow.has(name)){target.joints[name].clear();target.overflow.add(name);continue;}
    for(const [key,count]of map){const out=target.joints[name];if(!out.has(key)&&out.size>=target.limit){out.clear();target.overflow.add(name);break;}out.set(key,(out.get(key)??0)+count);}
   }
  }
  const cancelled=(signal,stale=false)=>{if(signal?.aborted||stale)throw new DOMException('Consulta cancelada.','AbortError');};
  function validateMonthlyCube(cube,meta){
   if(!cube||cube.month!==meta.month||!Array.isArray(cube.rows)||(!Array.isArray(cube.columns)&&!Array.isArray(cube.dimensions)))throw Error('Cubo mensal incompatível: '+meta.month);
   const columns=cube.columns??[...cube.dimensions,'count'];
   if(!columns.includes('date')||!columns.includes('count'))throw Error('Cubo mensal sem data ou quantidade: '+meta.month);
   if(columns.some(c=>typeof c!=='string')||new Set(columns).size!==columns.length)throw Error('Colunas mensais inválidas: '+meta.month);
   const countIndex=columns.indexOf('count'),dictSizes=columns.map((column,i)=>{
    if(i===countIndex)return 0;
    const dictionary=cube.dictionaries?.[column];if(!Array.isArray(dictionary))throw Error('Dicionário mensal inválido: '+meta.month);
    return dictionary.length;
   });
   if(cube.dictionaries.date.some(date=>typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==meta.month||Number(date.slice(-2))<1||Number(date.slice(-2))>new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate()))throw Error('Data fora do mês de origem: '+meta.month);
   for(const row of cube.rows){
    if(!Array.isArray(row)||row.length!==columns.length)throw Error('Linha mensal incompatível: '+meta.month);
    for(let i=0;i<row.length;i++){const value=row[i];if(!Number.isSafeInteger(value)||value<0||(i!==countIndex&&value>=dictSizes[i]))throw Error('Valor mensal inválido: '+meta.month);}
   }
  }
  // Limits cover retained aggregate cells and compressed input bytes, not transient/total JS heap.
  function createMarketCubeLoader({fetchImpl=globalThis.fetch,origin=globalThis.location?.origin,maxCells=5000000,maxCompressedBytes=16*1024*1024}={}){
   const decoded=new Map(),compressed=new Map();let cells=0,bytes=0,namespace='',epoch=0;
   const size=c=>c.rows.length*(c.columns?.length??c.dimensions.length+1);
   const touch=(map,key)=>{const value=map.get(key);map.delete(key);map.set(key,value);return value;};
   // Epoch invalidation also retires pending loads, even if a transport ignores abort.
   const clear=()=>{epoch++;decoded.clear();compressed.clear();cells=0;bytes=0;};
   async function load(meta,base,signal){
    const activeEpoch=epoch,check=()=>cancelled(signal,activeEpoch!==epoch);check();
    const baseURL=new URL(base),url=new URL(meta.cubePath,baseURL);
    if(!['http:','https:'].includes(baseURL.protocol)||!['http:','https:'].includes(url.protocol)||url.origin!==baseURL.origin||(origin&&origin!=='null'&&url.origin!==origin))throw Error('A fonte de dados deve ter a mesma origem.');
    if(baseURL.username||baseURL.password||url.username||url.password)throw Error('Credenciais não são aceitas na URL de dados.');
    // sha256 identifies the original source workbook; it is not a gzip-body checksum.
    const key=JSON.stringify([namespace,url.href,meta.sha256??'',meta.month]);
    if(decoded.has(key))return touch(decoded,key);
    let input;const reusedCompressed=compressed.has(key);
    if(reusedCompressed)input=touch(compressed,key);else {
     const response=await fetchImpl(url,{signal,credentials:'same-origin',redirect:'error'});check();
     if(!response.ok)throw Error('Arquivo indisponível: '+meta.month+' (HTTP '+response.status+').');
     input=new Uint8Array(await response.arrayBuffer());check();
    }
    let text;if(input[0]===31&&input[1]===139){
     if(typeof DecompressionStream==='undefined')throw Error('Este navegador não oferece descompressão gzip. Abra em uma versão recente do Chrome, Edge, Safari ou Firefox.');
     try{text=await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}catch{check();throw Error('Arquivo mensal gzip inválido: '+meta.month+'.');}
    }else text=new TextDecoder().decode(input);
    check();let cube;try{cube=JSON.parse(text);}catch{throw Error('Arquivo mensal inválido: '+meta.month+'.');}
    // JSON.parse/validation are synchronous; abort takes effect at the next boundary.
    // Already-retained bytes passed the same validation on their first decode.
    if(!reusedCompressed)validateMonthlyCube(cube,meta);check();
    if(!compressed.has(key)&&input.byteLength<=maxCompressedBytes){
     while(compressed.size&&bytes+input.byteLength>maxCompressedBytes){const first=compressed.keys().next().value;bytes-=compressed.get(first).byteLength;compressed.delete(first);}
     compressed.set(key,input);bytes+=input.byteLength;
    }
    const n=size(cube);if(n<=maxCells){
     // Concurrent identical loads may finish together. Replacement must not double-count cells.
     if(decoded.has(key)){cells-=size(decoded.get(key));decoded.delete(key);}
     while(decoded.size&&cells+n>maxCells){const first=decoded.keys().next().value;cells-=size(decoded.get(first));decoded.delete(first);}
     decoded.set(key,cube);cells+=n;
    }
    return cube;
   }
   return {load,clear,setNamespace(value){if(value!==namespace){clear();namespace=value;}},stats:()=>({decodedEntries:decoded.size,cells,maxCells,compressedEntries:compressed.size,compressedBytes:bytes,maxCompressedBytes})};
  }

  const overlaps=(month,range)=>month>=range.start.slice(0,7)&&month<=range.end.slice(0,7);
  const bdField=field=>field.startsWith('bd_')||field==='propulsao';
  const sourceField=field=>field==='propulsao'?'bd_combustivel':field;
  function installMarketWorker(port,{loader=createMarketCubeLoader(),resultCache=createResultCache(),aggregateCache=createMonthlyAggregateCache(),aggregateStore=globalThis.PerformanceCache?.createPersistentCache({namespace:'market-monthly-aggregates-v1',maxBytes:48*1024*1024,maxEntries:384}),yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
   let generation=0,controller=null,namespace=null;
   const sourceSummaries=createResultCache({maxBytes:4*1024*1024,maxEntries:96});
   port.onmessage=async({data})=>{
    const token=++generation;controller?.abort();controller=null;
    if(data.type==='clear-cache'){loader.clear();resultCache.clear();aggregateCache.clear();sourceSummaries.clear();namespace=null;try{await aggregateStore?.clear();}catch{}return;}
    if(data.type==='cancel'){if(data.releaseCubes)loader.clear();return;}
    const {id,manifest,filters={},base,includeMarketBaseline=false,includeHistoryComparisons=false,includeChannelReference=false,includeOriginAnalysis=false,includeMitsubishiProfile=false,includeInteractive=false,includeDaily=false,includeMunicipalLeaders=false,includeFlow=false,includeCatalog=false,includeConnections=false,focusBrand=null}=data;
    const activeController=new AbortController();controller=activeController;
    try{
     const identity=await manifestCacheIdentity(manifest,base);if(generation!==token)return;
     if(identity!==namespace){loader.setNamespace(identity);resultCache.clear();aggregateCache.clear();sourceSummaries.clear();namespace=identity;}
     const options={includeMarketBaseline:Boolean(includeMarketBaseline),includeHistoryComparisons:Boolean(includeHistoryComparisons),includeChannelReference:Boolean(includeChannelReference),includeOriginAnalysis:Boolean(includeOriginAnalysis),includeMitsubishiProfile:Boolean(includeMitsubishiProfile),includeInteractive:Boolean(includeInteractive),includeDaily:Boolean(includeInteractive&&includeDaily),includeMunicipalLeaders:Boolean(includeMunicipalLeaders),includeFlow:Boolean(includeFlow),includeCatalog:Boolean(includeCatalog),includeConnections:Boolean(includeConnections),focusBrand:typeof focusBrand==='string'&&focusBrand?focusBrand:null};
     const queryKey=canonicalFilterKey(filters)+'|'+JSON.stringify(options),cached=resultCache.get(queryKey);
     if(cached){port.postMessage({id,result:cached});return;}
     const requestedRange=rangeFrom(filters.date,manifest);let range=requestedRange;
     if(!range)throw Error('Ainda não há arquivos mensais prontos para análise.');
     const lastMeta=manifest.months.find(m=>m.month===range.end.slice(0,7)),declaredEnd=lastMeta?sourceCoverageEnd(lastMeta):null;
     if(declaredEnd&&declaredEnd<range.end&&declaredEnd>=range.start)range={...range,end:declaredEnd};
     const previousRange=comparisonRange(range),yearRange=comparisonRange(range,'year');
     const index=new Map(manifest.months.filter(m=>m.cubePath).map(m=>[m.month,m])),expected=listMonths(range),missing=expected.filter(m=>!index.has(m));
     const covered=(month,r)=>{const meta=index.get(month),start=sourceCoverageStart(meta),end=sourceCoverageEnd(meta);return Boolean(meta&&start&&end&&start<=(r.start>month+'-01'?r.start:month+'-01')&&end>=(r.end<monthEnd(month)?r.end:monthEnd(month)));};
     const incomplete=expected.filter(m=>index.has(m)&&!covered(m,range)),accepted=expected.filter(m=>index.has(m));
     if(!accepted.length)throw Error('Nenhum arquivo está processado no período selecionado. Consulte a cobertura mensal.');
     const segments=categoricalSelection(filters.segmento);
     const scopeOf=month=>[...new Set((index.get(month)?.scope??[]).map(s=>s.segment??s.segmento).filter(Boolean).filter(s=>filters.population!=='light'||['Auto','Comercial Leve'].includes(s)).filter(s=>!segments.length||segments.includes(s)))].sort();
     const bdFilters=DIMS.filter(field=>bdField(field)&&hasFilterSelection(filters[field],field));
     const needsOrigin=includeOriginAnalysis||includeFlow||hasFilterSelection(filters.bd_origem,'bd_origem');
     const channelSelection=categoricalSelection(filters.tipo_venda);
     const filteredKnownChannel=channelSelection.length>0&&channelSelection.every(channel=>channel==='VD'||channel==='VAREJO');
     const channelUnavailableMonths=filteredKnownChannel?accepted.filter(month=>Array.isArray(index.get(month)?.channelSourceFields)&&index.get(month).channelSourceFields.length===0):[];
     const originPath=meta=>meta?.originCubePath;
     const comparable=r=>{
      const previousMonths=listMonths(r);if(missing.length||incomplete.length||!previousMonths.every(m=>index.has(m)&&covered(m,r)))return false;
      if(bdFilters.length&&!previousMonths.every(m=>index.get(m).bdCoverage))return false;
      if(needsOrigin&&!previousMonths.every(m=>originPath(index.get(m))))return false;
      const selected=[...expected,...previousMonths];
      // A missing channel field is unavailable, never an observed VD/Varejo zero.
      if(filteredKnownChannel&&selected.some(m=>Array.isArray(index.get(m)?.channelSourceFields)&&index.get(m).channelSourceFields.length===0))return false;
      const scopes=selected.map(m=>JSON.stringify(scopeOf(m)));return scopes.every(scope=>scope!=='[]'&&scope===scopes[0]);
     };
     const priorOK=comparable(previousRange),yearOK=comparable(yearRange);
     const needed=[...new Set([...accepted,...(priorOK?listMonths(previousRange):[]),...(yearOK?listMonths(yearRange):[])])].sort();
     const a=createAccumulator(),p=createAccumulator(),y=createAccumulator(),baseline=createAccumulator(),channelReference=createAccumulator(),mitsubishiProfile=createAccumulator(),historyMarket=createAccumulator(),historyMit=createAccumulator(),historyYear=createAccumulator();
     const catalogMarket=includeCatalog?createAccumulator():null,catalogMarketPrior=includeCatalog?createAccumulator():null,catalogMit=includeCatalog?createAccumulator():null,catalogCurrentExtra=includeCatalog?createCatalogExtras():null,catalogMarketExtra=includeCatalog?createCatalogExtras():null;
     const brandMembership=includeMitsubishiProfile?createBrandMembership():null;
     // The pulse's brand in focus, in the same pass over the cubes: the market without
     // brand/model filters, restricted to that brand (what a separate pulse query would ask).
     const focus=options.focusBrand,focusFilters=focus?{...filters,modelo:'all',grupo_modelo:'all',marca:[focus]}:null;
     const focusCurrent=focus?createAccumulator():null,focusYear=focus?createAccumulator():null;
     const baselineFilters={...filters,marca:'all',modelo:'all',grupo_modelo:'all',propulsao:'all'},channelReferenceFilters={...filters,tipo_venda:'all'};
     const historyFilters={...filters,marca:'all',modelo:'all',grupo_modelo:'all'};
     const selectedBrands=categoricalSelection(filters.marca),mitsubishiAllowed=!selectedBrands.length||selectedBrands.includes('MITSUBISHI');
     const choices=Object.fromEntries(DIMS.map(d=>[d,new Set()]));
     for(let i=0;i<needed.length;i++){
      if(generation!==token)return;
      const meta=index.get(needed[i]);
      if(needsOrigin&&!originPath(meta))throw Error('A origem do veículo no BD ainda não está disponível para '+needed[i]+'. Remova o filtro de origem ou escolha outro período.');
      const loadMeta=needsOrigin?{...meta,cubePath:originPath(meta),sha256:meta.originCubeSha256??meta.sha256}:meta;
      const summaryKey=JSON.stringify(['source-summary-v1',namespace,loadMeta.cubePath,loadMeta.sha256??'',meta.month]);
      let summary=sourceSummaries.get(summaryKey),loadedCube=null;
      if(!summary&&aggregateStore){try{summary=await aggregateStore.get(summaryKey);if(summary?.month!==meta.month||!Array.isArray(summary.columns)||!summary.columns.every(c=>typeof c==='string')||!DIMS.every(dim=>Array.isArray(summary.dictionaries?.[dim])))summary=null;if(summary)sourceSummaries.set(summaryKey,summary);}catch{}}
      const ensureCube=async()=>{
       if(!loadedCube){loadedCube=await loader.load(loadMeta,base,activeController.signal);cancelled(activeController.signal,generation!==token);}
       return loadedCube;
      };
      if(!summary){const source=await ensureCube();summary={month:source.month,columns:source.columns??source.dimensions??[],dictionaries:Object.fromEntries(DIMS.map(dim=>[dim,source.dictionaries?.[dim]??[]]))};sourceSummaries.set(summaryKey,summary);try{await aggregateStore?.set(summaryKey,summary);}catch{}}
      if(generation!==token)return;
      const cube=summary;
      const columns=cube.columns??cube.dimensions??[];
      if(bdFilters.some(field=>!columns.includes(sourceField(field))))throw Error('A classificação BD ainda está em processamento para '+needed[i]+'. Escolha um período já classificado ou remova o filtro BD.');
      if((includeOriginAnalysis||includeFlow)&&!columns.includes('bd_origem'))throw Error('O agregado de origem do veículo é incompatível para '+needed[i]+'.');
      const collectMonthly=async(target,cube,selected,selectedRange,collectOptions={})=>{
       const clipped={start:selectedRange.start>cube.month+'-01'?selectedRange.start:cube.month+'-01',end:selectedRange.end<monthEnd(cube.month)?selectedRange.end:monthEnd(cube.month)};
       const {membership,catalogExtra,...projection}=collectOptions;
       const nonDate={...selected};delete nonDate.date;
       const key=JSON.stringify([namespace,loadMeta.cubePath,loadMeta.sha256??'',cube.month,canonicalFilterKey(nonDate),clipped,projection,Boolean(membership),catalogExtra?catalogExtra.limit:null]);
       let contribution=aggregateCache.get(key);
       if(!contribution&&aggregateStore){try{contribution=await aggregateStore.get(key);if(!validMonthlyContribution(contribution,membership,catalogExtra))contribution=null;if(contribution)aggregateCache.set(key,contribution);}catch{}}
       cancelled(activeController.signal,generation!==token);
       const scan=(acc,member,extra,onCount)=>collectCube(acc,loadedCube,selected,clipped,{...projection,onAcceptedRow:(_row,count,date,value)=>{if(onCount)onCount(count);if(member)collectBrandMembership(member,count,value);if(extra)collectCatalogRow(extra,count,date,value,columns.includes('bd_classe')?'bd_classe':'segmento');}});
       if(!contribution){
        await ensureCube();
        contribution={version:1,acc:createAccumulator(),membership:membership?createBrandMembership():null,extra:catalogExtra?createCatalogExtras(catalogExtra.limit):null,safe:true};
        scan(contribution.acc,contribution.membership,contribution.extra,count=>{if(!Number.isSafeInteger(count))contribution.safe=false;});
        contribution.safe=contribution.safe&&Number.isSafeInteger(contribution.acc.total);
        if(contribution.safe){aggregateCache.set(key,contribution);try{await aggregateStore?.set(key,contribution);}catch{}cancelled(activeController.signal,generation!==token);}
       }
       // Preserve row-by-row floating-point behavior for noninteger custom loaders
       // and exceptionally large totals, where regrouping additions is not exact.
       if(!contribution.safe||!Number.isSafeInteger(target.total+contribution.acc.total)){await ensureCube();scan(target,membership,catalogExtra);return;}
       mergeAccumulator(target,contribution.acc);
       if(membership)for(const dim of RANKING_BRAND_DIMENSIONS)mergeCountMaps(membership[dim],contribution.membership[dim]);
       if(catalogExtra)mergeCatalogExtras(catalogExtra,contribution.extra);
      };
      if(overlaps(cube.month,range)){
       await collectMonthly(a,cube,filters,range,{includeConnections:Boolean(includeConnections),includeInteractive,includeDaily:Boolean(includeInteractive&&includeDaily),includeMunicipalLeaders:Boolean(includeMunicipalLeaders),includeFlow:Boolean(includeFlow),includeHistoryComparisons,includeOriginAnalysis,includeChannelCoverage:includeChannelReference,sourceMeta:meta,membership:brandMembership,catalogExtra:catalogCurrentExtra});
       if(includeCatalog){await collectMonthly(catalogMarket,cube,historyFilters,range,{catalogExtra:catalogMarketExtra});await collectMonthly(catalogMit,cube,{...historyFilters,marca:['MITSUBISHI']},range);}
       if(includeHistoryComparisons){await collectMonthly(historyMarket,cube,historyFilters,range,{groupDimensions:['marca','propulsao','bd_carroceria'],includeBody:true});await collectMonthly(historyMit,cube,{...historyFilters,marca:['MITSUBISHI']},range,{groupDimensions:['marca','propulsao','bd_carroceria'],includeBody:true});}
       if(includeMitsubishiProfile&&mitsubishiAllowed)await collectMonthly(mitsubishiProfile,cube,{...filters,marca:['MITSUBISHI']},range,{groupDimensions:['marca','modelo','grupo_modelo','bd_segmento','bd_classe','bd_combustivel','subsegmento','ano_fabricacao']});
       if(includeMarketBaseline)await collectMonthly(baseline,cube,baselineFilters,range,{groupDimensions:['marca','propulsao','bd_carroceria'],includeBody:true});
       if(includeChannelReference)await collectMonthly(channelReference,cube,channelReferenceFilters,range,{groupDimensions:['uf','municipio','tipo_venda'],includeChannelCoverage:true,includeStateChannels:true,sourceMeta:meta});
      }
      if(focus&&overlaps(cube.month,range))await collectMonthly(focusCurrent,cube,focusFilters,range,{groupDimensions:['uf','bd_segmento']});
      if(focus&&yearOK&&overlaps(cube.month,yearRange))await collectMonthly(focusYear,cube,focusFilters,yearRange,{groupDimensions:['uf','bd_segmento']});
      if(priorOK&&overlaps(cube.month,previousRange))await collectMonthly(p,cube,filters,previousRange);
      if(yearOK&&overlaps(cube.month,yearRange)){await collectMonthly(y,cube,filters,yearRange,{groupDimensions:includeCatalog?DIMS:[]});if(includeCatalog)await collectMonthly(catalogMarketPrior,cube,historyFilters,yearRange);if(includeHistoryComparisons)await collectMonthly(historyYear,cube,historyFilters,yearRange,{groupDimensions:['marca','propulsao','bd_carroceria'],includeBody:true});}
      if(expected.includes(needed[i]))for(const dim of DIMS)for(const value of cube.dictionaries?.[dim]??[])choices[dim].add(categoryLabel(value));
      port.postMessage({id,progress:{done:i+1,total:needed.length}});
      // Always yield between cubes, including a warm cache, before checking token again.
      if(i<needed.length-1)await yieldControl();
     }
     const temporalCoverage=accepted.filter(m=>covered(m,range)).map(m=>index.get(m));
     const fullCoverage=temporalCoverage.filter(m=>!channelUnavailableMonths.includes(m.month));
     const result=finish(a,p,y,range,fullCoverage,priorOK,yearOK);
     result.missingMonths=missing;result.channelUnavailableMonths=channelUnavailableMonths;result.observedTotal=result.total;result.complete=missing.length===0&&incomplete.length===0&&channelUnavailableMonths.length===0;
     if(channelUnavailableMonths.length===accepted.length)result.total=null;result.incompleteMonths=incomplete;
     result.scopeChanged=new Set(accepted.map(m=>JSON.stringify(scopeOf(m)))).size>1;
     result.bdPendingMonths=accepted.filter(m=>!index.get(m).bdCoverage);result.requestedRange=requestedRange;
     result.observationClipped=requestedRange.end!==range.end;result.previousRange=previousRange;result.yearRange=yearRange;
     if(includeHistoryComparisons){const empty=()=>createAccumulator();const yearCoverage=yearOK?listMonths(yearRange).map(m=>index.get(m)):[];result.evolution={market:finish(historyMarket,empty(),empty(),range,fullCoverage,false,false),mitsubishi:finish(historyMit,empty(),empty(),range,fullCoverage,false,false),priorYear:yearOK?finish(historyYear,empty(),empty(),yearRange,yearCoverage,false,false):null,removedFilters:['marca','modelo','grupo_modelo'],yearAvailable:yearOK};}
     if(includeMitsubishiProfile){result.mitsubishiProfile=finish(mitsubishiProfile,createAccumulator(),createAccumulator(),range,fullCoverage,false,false);result.brandMembership=finishBrandMembership(brandMembership);}
     if(includeMarketBaseline){result.marketBaseline=finish(baseline,createAccumulator(),createAccumulator(),range,fullCoverage,false,false);result.marketBaseline.observedTotal=result.marketBaseline.total;if(channelUnavailableMonths.length===accepted.length)result.marketBaseline.total=null;}
     if(includeChannelReference){result.channelReference=finish(channelReference,createAccumulator(),createAccumulator(),range,temporalCoverage,false,false);result.channelReference.removedFilters=['tipo_venda'];result.channelReference.complete=missing.length===0&&incomplete.length===0;result.channelReference.missingMonths=missing;result.channelReference.incompleteMonths=incomplete;}
     if(includeInteractive)result.interactive=finishInteractive(a,filters,requestedRange,index,covered,channelUnavailableMonths);
     if(includeCatalog){
      const state={complete:result.complete,missingMonths:missing,incompleteMonths:incomplete,unavailableMonths:channelUnavailableMonths},yearCoverage=yearOK?listMonths(yearRange).map(m=>index.get(m)):[];
      result.catalog={current:finishCatalog(a,catalogCurrentExtra,range,fullCoverage,state),prior:yearOK?finishCatalog(y,null,yearRange,yearCoverage):null,market:finishCatalog(catalogMarket,catalogMarketExtra,range,fullCoverage,state),marketPrior:yearOK?finishCatalog(catalogMarketPrior,null,yearRange,yearCoverage):null,mitsubishi:finishCatalog(catalogMit,null,range,fullCoverage,state),removedFilters:['marca','modelo','grupo_modelo'],filters:canonicalFilters(filters),marketFilters:canonicalFilters(historyFilters),range,priorRange:yearRange,comparisonKind:'same_dates_prior_year',yearAvailable:yearOK};
     }
     if(focus){const f=finish(focusCurrent,createAccumulator(),focusYear,range,fullCoverage,false,yearOK);result.focus={brand:focus,total:f.total,year:f.year,yearChangeRate:f.yearChangeRate,groups:{uf:f.groups.uf,bd_segmento:f.groups.bd_segmento}};}
     result.choices=Object.fromEntries(DIMS.map(d=>[d,[...choices[d]].sort()]));
     if(generation!==token)return;resultCache.set(queryKey,result);port.postMessage({id,result});
    }catch(error){if(generation===token&&error.name!=='AbortError')port.postMessage({id,error:error.message});}
   };
   return {cacheStats:()=>({cubes:loader.stats(),results:resultCache.stats(),aggregates:aggregateCache.stats(),sourceSummaries:sourceSummaries.stats(),persistentAggregates:aggregateStore?.stats?.()??null}),clear:async()=>{generation++;controller?.abort();loader.clear();resultCache.clear();aggregateCache.clear();sourceSummaries.clear();namespace=null;try{await aggregateStore?.clear();}catch{}}};
  }
  if(typeof self!=='undefined'&&typeof self.postMessage==='function')installMarketWorker(self);

})();
