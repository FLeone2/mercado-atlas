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

  // Display-only Portuguese translations of exact source tokens. Never use these
  // labels as aggregation keys and never infer an absent BODY TYPE or SEGMENT.
  const CLASS_LABEL_MAPPING_VERSION = 'pt-BR-bd-class-1.0.0';
  const STRUCTURE_GROUPINGS = ['bd_classe','bd_segmento'];
  const groupingLabel = dimension => dimension === 'bd_segmento' ? 'Somente porte (SEGMENT)' : 'Carroceria + porte (Classe BD)';
  const BODY_TYPE_LABELS = Object.freeze({
   'AMBULANCE':'Ambulância','CABRIOLET':'Conversível','CARGO':'Carga','CHASSIS CAB':'Chassi-cabine',
   'COUPE':'Cupê','DOUBLE CAB':'Cabine dupla','EXTENDED CAB':'Cabine estendida','EXTRA-LIGHT TRUCK':'Caminhão extraleve',
   'HATCH':'Hatchback','MINI TRUCK':'Minicaminhão','MPV':'Monovolume','OFF-ROAD':'Fora de estrada',
   'PASSENGER':'Passageiros','PICK-UP LARGE':'Picape grande','SEDAN':'Sedã','SEMI-LIGHT TRUCK':'Caminhão semileve',
   'SINGLE CAB':'Cabine simples','SMALL TRUCK':'Caminhão pequeno','SPECIALITY':'Especial','SPORT':'Esportivo',
   'SUV':'SUV','WAGON':'Perua','MID TRUCK':'Caminhão médio','BUS':'Ônibus','LIGHT TRUCK':'Caminhão leve',
   'MILITARY':'Militar','HEAVY TRUCK':'Caminhão pesado','SEMI-HEAVY TRUCK':'Caminhão semipesado'
  });
  const SEGMENT_LABELS = Object.freeze({
   'COMPACT':'Compacto','SMALL':'Pequeno','MICRO':'Micro','SUB-SMALL':'Subpequeno','MID':'Médio','LARGE':'Grande',
   'LARGE PLUS':'Grande plus','UPPER-MID':'Médio superior (UPPER-MID)','MID-UPPER':'Médio superior (MID-UPPER)',
   'COMPACT COMMERCIAL VAN':'Van comercial compacta','SMALL COMMERCIAL VAN':'Van comercial pequena',
   'MID COMMERCIAL VAN':'Van comercial média','LARGE COMMERCIAL VAN':'Van comercial grande',
   'SMALL VAN':'Van pequena','SUB-SMALL VAN':'Van subpequena','PICK-UP COMPACT':'Picape compacta',
   'PICK-UP MID':'Picape média','PICK-UP SMALL':'Picape pequena','PICK-UP LARGE':'Picape grande',
   'EXTRA-LIGHT TRUCK':'Caminhão extraleve','MINI TRUCK':'Minicaminhão','SEMI-LIGHT TRUCK':'Caminhão semileve',
   'SMALL TRUCK':'Caminhão pequeno','MID TRUCK':'Caminhão médio','LIGHT TRUCK':'Caminhão leve',
   'HEAVY TRUCK':'Caminhão pesado','SEMI-HEAVY TRUCK':'Caminhão semipesado','BUS':'Ônibus','MILITARY':'Militar',
   'OLD':'Antigo (OLD)','OUT PORTFOLIO':'Fora de portfólio'
  });
  const sourceLabel=(map,key)=>Object.hasOwn(map,key)?map[key]:key;
  function structureDisplayLabel(rawValue,groupingDimension='bd_classe') {
   const raw=String(rawValue??'Não informado');
   if(groupingDimension==='bd_segmento')return sourceLabel(SEGMENT_LABELS,raw);
   const parts=raw.split(' / ');
   // Preserve unfamiliar or nonstandard source values verbatim, without guessing.
   if(parts.length!==2)return raw;
   return `${sourceLabel(BODY_TYPE_LABELS,parts[0])} / ${sourceLabel(SEGMENT_LABELS,parts[1])}`;
  }
  // SVG title has a fixed 290px gutter. At 14px, a 9px-per-codepoint
  // allowance plus a hard clip keeps long labels contained in either font theme.
  // Complete translated and source labels remain in title/aria-label/list/table.
  function truncatePyramidLabel(label,maxWidth=290) {
   const value=String(label),chars=Array.from(value),maxChars=Math.max(1,Math.floor(maxWidth/9));
   return chars.length<=maxChars?value:chars.slice(0,Math.max(0,maxChars-1)).join('')+'…';
  }

  // Pyramid labels keep the original English size tokens recognizable. Translations
  // remain separate evidence fields; neither function is an aggregation key.
  const atypicalSizes = new Set(['MID-UPPER','MIDCOMMERCIAL VAN']);
  const nonPhysicalSizes = new Set(['OLD','OUT PORTFOLIO','MILITARY']);
  const missingSizes = new Set(['','---','N/A','NULL','UNKNOWN','NÃO INFORMADO','NÃO CLASSIFICADO','NÃO CLASSIFICADO NO BD','SEM CORRESPONDÊNCIA BD','BD PENDENTE','CLASSIFICAÇÃO AMBÍGUA','ANO SEM BD','CÓDIGO DE MODELO INVÁLIDO','CLASSIFICAÇÃO NÃO REVISADA']);
  function sizeCategoryStatus(value){const token=String(value??'Não informado').trim().toUpperCase();return atypicalSizes.has(token)?'Rótulo atípico da fonte; preservado sem equivalência presumida':nonPhysicalSizes.has(token)?'Categoria da fonte; não representa porte físico':missingSizes.has(token)?'Porte não classificado':'Porte informado no BD';}
  function pyramidSizeLabel(value){const raw=String(value??'Não informado');if(sizeCategoryStatus(raw)==='Porte não classificado')return raw==='---'?'Não informado (---)':raw;const title=raw.replace(/[A-Z]+/g,word=>word[0]+word.slice(1).toLowerCase());return nonPhysicalSizes.has(raw)?title+' · categoria BD':title;}
  const pyramidPercent=value=>!Number.isFinite(value)?'—':value>0&&value<.001?'<0,1%':(value*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const bodyTypeLabel=value=>value==='all'?'Todas as carrocerias':Object.hasOwn(BODY_TYPE_LABELS,value)&&BODY_TYPE_LABELS[value]!==value?`${BODY_TYPE_LABELS[value]} (${value})`:value;

  const DIMS = ['uf','municipio','marca','modelo','grupo_modelo','combustivel','segmento','subsegmento','tipo_venda','regiao','nacionalidade','ano_fabricacao','potencia','capacidade_carga','capacidade_passageiros','bd_segmento','bd_carroceria','bd_classe','bd_macro','bd_combustivel','bd_origem','propulsao'];
  const LABELS = {uf:'UF',municipio:'Município',marca:'Marca',modelo:'Modelo',grupo_modelo:'Grupo de modelos',combustivel:'Combustível',segmento:'Segmento',subsegmento:'Subsegmento',tipo_venda:'Canal de venda',regiao:'Região',nacionalidade:'Código de nacionalidade da fonte',ano_fabricacao:'Ano de fabricação',potencia:'Potência',capacidade_carga:'Capacidade de carga',capacidade_passageiros:'Capacidade de passageiros',bd_segmento:'Porte (SEGMENT)',bd_carroceria:'Carroceria (BODY TYPE)',bd_classe:'Classe BD',bd_macro:'Macrosegmento BD',bd_combustivel:'Tecnologia BD',bd_origem:'Origem do veículo · BD',propulsao:'Propulsão'};
  function propulsionClass(value){const v=String(value??'').trim().toUpperCase();if(['GASOLINE','FFV','DIESEL','ETANOL','ETHANOL','TETRAFUEL','GNV'].includes(v))return 'ICE';if(['HEV','PHEV','BEV','MHEV','FCEL'].includes(v))return v;return 'Não classificado';}
  const number = v => v == null ? '—' : new Intl.NumberFormat('pt-BR').format(v);
  const compact = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(v);
  const percent = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(v);
  const monthLabel = m => new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(m.slice(0,7)+'-01T12:00:00Z')).replace('.','');
  const dateLabel = d => d ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')) : '—';
  const iso$1 = d => d.toISOString().slice(0,10);
  function monthEnd(month) { return iso$1(new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)),0))); }
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
  function listMonths(range) {if(!range)return [];let d=new Date(range.start.slice(0,7)+'-01T12:00:00Z'),out=[];while(iso$1(d)<=range.end){out.push(iso$1(d).slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}return out;}
  function comparisonRange(range,kind='previous') {
   if(!range)return null; const s=new Date(range.start+'T12:00:00Z'),e=new Date(range.end+'T12:00:00Z');
   if(kind==='year'){const shift=d=>new Date(Date.UTC(d.getUTCFullYear()-1,d.getUTCMonth(),Math.min(d.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear()-1,d.getUTCMonth()+1,0)).getUTCDate()),12));return {start:iso$1(shift(s)),end:iso$1(shift(e))};}
   if(range.start.endsWith('-01')&&range.end===monthEnd(range.end.slice(0,7))){const n=listMonths(range).length;s.setUTCMonth(s.getUTCMonth()-n);const pe=new Date(range.start+'T12:00:00Z');pe.setUTCDate(0);return {start:iso$1(s),end:iso$1(pe)};}
   if(range.start.endsWith('-01')&&range.start.slice(0,7)===range.end.slice(0,7)){const endDay=e.getUTCDate();s.setUTCMonth(s.getUTCMonth()-1);const last=new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth()+1,0)).getUTCDate();const pe=new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth(),Math.min(endDay,last),12));return {start:iso$1(s),end:iso$1(pe)};}
   const n=Math.round((e-s)/86400000)+1; s.setUTCDate(s.getUTCDate()-n);e.setUTCDate(e.getUTCDate()-n);return {start:iso$1(s),end:iso$1(e)};
  }
  function createAccumulator(){return {total:0,groups:Object.fromEntries(DIMS.map(d=>[d,new Map()])),daily:new Map(),monthly:new Map(),brandsByMonth:new Map(),fuelByMonth:new Map(),modelsByMonth:new Map(),technologyByMonth:new Map(),propulsionByMonth:new Map(),bodyByMonth:new Map(),channelByMonth:Object.fromEntries(['marca','modelo','bd_carroceria'].map(d=>[d,new Map()])),channelCoverage:new Map(),originByMonth:new Map(),sourceRows:0};}
  // Count dictionary codes inside each monthly cube, then decode categories once.
  // Municipality remains a joint (municipality, UF) key; filters still intersect before counting.
  function collectCube(acc,cube,filters,range,options={}){
   const cols=cube.columns??[...cube.dimensions,'count'],idx=Object.fromEntries(cols.map((x,i)=>[x,i])),dictionaries=cube.dictionaries??{};
   const dimensions=options.groupDimensions??DIMS,descriptors=new Map();
   const onAcceptedRow=options.onAcceptedRow;
   const historyDimensions=options.includeHistoryComparisons?['marca','modelo','bd_carroceria']:[];
   const trackChannels=options.includeHistoryComparisons||options.includeChannelCoverage;
   const add=(map,key,count)=>map.set(key,(map.get(key)??0)+count);
   const descriptor=d=>{if(descriptors.has(d))return descriptors.get(d);const source=d==='propulsao'?'bd_combustivel':d,values=dictionaries[source]??[],labels=values.map(v=>d==='propulsao'?propulsionClass(v):categoryLabel(v));const fallback=labels.length;labels.push(d==='propulsao'?'Não classificado':'Não informado');const result={dim:d,col:idx[source],labels,fallback};descriptors.set(d,result);return result;};
   const codeFor=(d,row)=>{const code=row[d.col];return d.labels[code]===undefined?d.fallback:code;};
   const checks=DIMS.filter(d=>hasFilterSelection(filters[d],d)).map(d=>{const desc=descriptor(d),allowed=new Set(categoricalSelection(filters[d]));return {...desc,allowed:desc.labels.map(v=>allowed.has(v))};});
   if(filters.population==='light'){const desc=descriptor('segmento');checks.push({...desc,allowed:desc.labels.map(v=>v==='Auto'||v==='Comercial Leve')});}
   const grouped=dimensions.filter(d=>d!=='municipio').map(descriptor),municipality=dimensions.includes('municipio')?descriptor('municipio'):null;
   const ufValues=dictionaries.uf??[],ufFallback=ufValues.length,ufLabels=ufValues.map(v=>String(v??'UF não informada'));ufLabels.push('UF não informada');
   const newCounter=desc=>({...desc,counts:new Float64Array(desc.labels.length),seen:new Uint8Array(desc.labels.length),touched:[]});
   const increment=(counter,code,count)=>{counter.counts[code]+=count;if(!counter.seen[code]){counter.seen[code]=1;counter.touched.push(code);}};
   const channelDescriptor=trackChannels?descriptor('tipo_venda'):null;
   const jointSpecs=historyDimensions.map(dim=>({left:descriptor(dim),right:channelDescriptor,target:acc.channelByMonth[dim]}));
   if(options.includeOriginAnalysis)jointSpecs.push({left:descriptor('marca'),right:descriptor('bd_origem'),target:acc.originByMonth});
   const newJointCounter=spec=>{const length=spec.left.labels.length*spec.right.labels.length;return {...spec,stride:spec.right.labels.length,counts:new Float64Array(length),seen:new Uint8Array(length),touched:[]};};
   const months=new Map(),dates=new Map();
   const datePlan=date=>{if(dates.has(date))return dates.get(date);if(!date||date<range.start||date>range.end){dates.set(date,null);return null;}const month=date.slice(0,7);if(!months.has(month))months.set(month,{month,total:0,seen:false,counters:grouped.map(newCounter),joints:jointSpecs.map(newJointCounter),channelTotals:{observedCount:0,knownCount:0,unknownCount:0},municipalities:new Map()});const plan={date,count:0,seen:false,month:months.get(month)};dates.set(date,plan);return plan;};
   const datePlans=(dictionaries.date??[]).map(date=>date==null?undefined:datePlan(date));
   for(const row of cube.rows??[]){
    const dateCode=row[idx.date],plan=datePlans[dateCode]===undefined?datePlan(dictionaries.date?.[dateCode]??dateCode):datePlans[dateCode];if(!plan)continue;
    let valid=true;for(const check of checks){if(!check.allowed[codeFor(check,row)]){valid=false;break;}}if(!valid)continue;
    const count=Number(row[idx.count]);if(!Number.isFinite(count)||count<0)throw Error('Quantidade inválida no cubo revisado.');
    // Optional aggregate-only consumer hook: every existing date/population/dimension filter has passed.
    if(onAcceptedRow)onAcceptedRow(row,count,plan.date,d=>{const desc=descriptor(d);return desc.labels[codeFor(desc,row)];});
    if(trackChannels){const label=channelDescriptor.labels[codeFor(channelDescriptor,row)],totals=plan.month.channelTotals;totals.observedCount+=count;if(label==='VD'||label==='VAREJO')totals.knownCount+=count;else totals.unknownCount+=count;}
    for(const joint of plan.month.joints)increment(joint,codeFor(joint.left,row)*joint.stride+codeFor(joint.right,row),count);
    acc.total+=count;acc.sourceRows++;plan.count+=count;plan.seen=true;const month=plan.month;month.total+=count;month.seen=true;
    for(const counter of month.counters)increment(counter,codeFor(counter,row),count);
    if(municipality){const rawUf=row[idx.uf],uf=ufLabels[rawUf]===undefined?ufFallback:rawUf;let counter=month.municipalities.get(uf);if(!counter){counter=newCounter(municipality);month.municipalities.set(uf,counter);}increment(counter,codeFor(counter,row),count);}
   }
   const targets={marca:acc.brandsByMonth,combustivel:acc.fuelByMonth,modelo:acc.modelsByMonth,bd_combustivel:acc.technologyByMonth,propulsao:acc.propulsionByMonth,...(options.includeHistoryComparisons?{bd_carroceria:acc.bodyByMonth}:{})};
   for(const plan of dates.values())if(plan?.seen)acc.daily.set(plan.date,(acc.daily.get(plan.date)??0)+plan.count);
   for(const month of months.values()){if(!month.seen)continue;acc.monthly.set(month.month,(acc.monthly.get(month.month)??0)+month.total);
    for(const counter of month.counters){const group=acc.groups[counter.dim],timeline=targets[counter.dim];for(const code of counter.touched){const label=counter.labels[code],count=counter.counts[code];group.set(label,(group.get(label)??0)+count);if(timeline){const key=month.month+'|'+label;timeline.set(key,(timeline.get(key)??0)+count);}}}
    for(const joint of month.joints)for(const code of joint.touched){const left=joint.left.labels[Math.floor(code/joint.stride)],right=joint.right.labels[code%joint.stride];add(joint.target,JSON.stringify([month.month,left,right]),joint.counts[code]);}
    for(const [uf,counter]of month.municipalities)for(const code of counter.touched){const key=counter.labels[code]+' · '+ufLabels[uf];acc.groups.municipio.set(key,(acc.groups.municipio.get(key)??0)+counter.counts[code]);}
   }
   if(trackChannels){const meta=options.sourceMeta??{},sourceValues=dictionaries.tipo_venda??[],available=sourceValues.some(v=>v==='VD'||v==='VAREJO');for(const month of listMonths(range).filter(m=>m===cube.month)){const totals=months.get(month)?.channelTotals??{observedCount:0,knownCount:0,unknownCount:0};const previous=acc.channelCoverage.get(month);acc.channelCoverage.set(month,{month,available,sourceFields:[...(meta.channelSourceFields??[])],aliasRows:meta.channelAliasRows??0,observedCount:totals.observedCount+(previous?.observedCount??0),knownCount:totals.knownCount+(previous?.knownCount??0),unknownCount:totals.unknownCount+(previous?.unknownCount??0)});}}
   return acc;
  }
  function finish(acc,prior,year,range,coverage,comparisonAvailable,yearAvailable){
   const rows=(map,pmap)=>[...map].map(([name,count])=>({name,count,marketShare:acc.total?count/acc.total:null,previous:comparisonAvailable?(pmap.get(name)??0):null,changeRate:comparisonAvailable&&pmap.get(name)>0?(count-pmap.get(name))/pmap.get(name):null,shareChange:comparisonAvailable&&prior.total?count/acc.total-(pmap.get(name)??0)/prior.total:null})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
   const groups=Object.fromEntries(DIMS.map(d=>[d,rows(acc.groups[d],prior.groups[d])]));
   const covered=new Set(coverage.map(m=>m.month));const daily=[];for(let d=new Date(range.start+'T12:00:00Z');iso$1(d)<=range.end;d.setUTCDate(d.getUTCDate()+1)){const date=iso$1(d);daily.push({date,count:covered.has(date.slice(0,7))?(acc.daily.get(date)??0):null});}
   const monthly=listMonths(range).map(month=>({date:month+'-01',month,count:covered.has(month)?(acc.monthly.get(month)??0):null}));
   const jointTimeline=map=>[...map].map(([key,count])=>{const [month,name,channel]=JSON.parse(key);return {date:month+'-01',month,name,channel,count};});
   const timeline=(map)=>[...map].map(([key,count])=>({date:key.slice(0,7)+'-01',name:key.slice(8),count,marketShare:acc.monthly.get(key.slice(0,7))?count/acc.monthly.get(key.slice(0,7)):null}));
   return {total:acc.total,previous:comparisonAvailable?prior.total:null,year:yearAvailable?year.total:null,changeRate:comparisonAvailable&&prior.total?(acc.total-prior.total)/prior.total:null,yearChangeRate:yearAvailable&&year.total?(acc.total-year.total)/year.total:null,groups,daily,monthly,brandsByMonth:timeline(acc.brandsByMonth),fuelByMonth:timeline(acc.fuelByMonth),modelsByMonth:timeline(acc.modelsByMonth),technologyByMonth:timeline(acc.technologyByMonth),propulsionByMonth:timeline(acc.propulsionByMonth),bodyByMonth:timeline(acc.bodyByMonth),channelByMonth:Object.fromEntries(Object.entries(acc.channelByMonth).map(([dim,map])=>[dim,jointTimeline(map)])),channelCoverage:[...acc.channelCoverage.values()].sort((a,b)=>a.month.localeCompare(b.month)),originByMonth:[...acc.originByMonth].map(([key,count])=>{const [month,name,origin]=JSON.parse(key);return {date:month+'-01',month,brand:name,vehicleOrigin:origin,name,origin,count,marketShare:acc.monthly.get(month)?count/acc.monthly.get(month):null};}),range,coverage,comparisonAvailable,yearAvailable,sourceRows:acc.sourceRows};
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

  // These modules read only reviewed aggregate cubes. Display selection never changes market filters.
  const EXPLORATION_LIMITS = {dailyDays:366,maxSeries:20,maxCategories:50,maxDisplayCells:10000,maxMonths:240};
  const EXPLORER_X = ['day','month','year',...DIMS];
  const EXPLORER_SERIES = [...DIMS];
  const aliases = {body:'bd_carroceria',BDsize:'bd_segmento',originalsegment:'segmento',channel:'tipo_venda',brand:'marca',model:'modelo',BDsegment:'bd_segmento',region:'regiao',UF:'uf',originalfuel:'combustivel',BDtechnology:'bd_combustivel',propulsion:'propulsao'};
  const iso = d => d.toISOString().slice(0,10);
  const day = value => new Date(value+'T12:00:00Z');
  const addDays = (value,n) => {const d=day(value);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
  const compareText = (a,b) => a<b?-1:a>b?1:0;
  const increment = (map,key,n) => map.set(key,(map.get(key)??0)+n);
  const active = value => hasFilterSelection(value);
  const selected = categoricalSelection;
  const limit = (value,fallback,max) => Math.max(1,Math.min(max,Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback));
  const abort = () => {const e=new Error('Consulta cancelada.');e.name='AbortError';throw e;};
  function checkCancelled(context){if(context.isCancelled?.())abort();}
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(day(value).valueOf())&&iso(day(value))===value;}
  function parsePeriod(value,manifest){
   const r=typeof value==='object'&&value!==null?{start:value.start,end:value.end}:rangeFrom(value,manifest);
   if(!r||!validDate(r.start)||!validDate(r.end)||r.start>r.end)throw Error('Período inválido. Informe datas válidas em ordem crescente.');
   if(listMonths(r).length>240)throw Error('O período deve conter no máximo 240 meses.');
   return r;
  }
  function manifestIndex(manifest){
   const index=new Map();for(const meta of manifest?.months??[]){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(meta.month??''))throw Error('Manifesto com mês inválido.');if(index.has(meta.month))throw Error('Manifesto com mês duplicado: '+meta.month);if(meta.cubePath)index.set(meta.month,meta);}
   return index;
  }
  function effectiveRange(range,index){const end=sourceCoverageEnd(index.get(range.end.slice(0,7)));return end&&validDate(end)&&end<range.end&&end>=range.start?{...range,end}:range;}
  function selectedScope(meta,filters){let scope=(meta?.scope??[]).map(s=>s.segment??s.segmento).filter(Boolean);if(filters.population==='light')scope=scope.filter(s=>s==='Auto'||s==='Comercial Leve');if(active(filters.segmento)){const keep=new Set(selected(filters.segmento));scope=scope.filter(s=>keep.has(s));}return [...new Set(scope)].sort(compareText);}
  function needsBD(filters,dimensions=[]){return dimensions.some(d=>d?.startsWith('bd_')||d==='propulsao')||Object.keys(filters).some(k=>(k.startsWith('bd_')||k==='propulsao')&&active(filters[k]));}
  function coverageFor(range,index,filters,dimensions=[]){
   const expected=listMonths(range),available=expected.filter(m=>index.has(m)),missingMonths=expected.filter(m=>!index.has(m));
   const insufficientMonths=available.filter(m=>{const end=m===range.end.slice(0,7)?range.end:monthEnd(m);const coveredEnd=sourceCoverageEnd(index.get(m)),coveredStart=sourceCoverageStart(index.get(m)),start=m===range.start.slice(0,7)?range.start:m+'-01';return !coveredEnd||!coveredStart||coveredEnd<end||coveredStart>start;});
   const bdPendingMonths=needsBD(filters,dimensions)?available.filter(m=>!index.get(m).bdCoverage):[];
   const needsChannel=dimensions.includes('tipo_venda')||categoricalSelection(filters.tipo_venda).some(value=>value==='VD'||value==='VAREJO'),channelUnavailableMonths=needsChannel?available.filter(m=>Array.isArray(index.get(m).channelSourceFields)&&index.get(m).channelSourceFields.length===0):[];
   const scopes=available.map(m=>selectedScope(index.get(m),filters));
   return {range,expectedMonths:expected,availableMonths:available,missingMonths,insufficientMonths,bdPendingMonths,channelUnavailableMonths,complete:missingMonths.length===0&&insufficientMonths.length===0&&bdPendingMonths.length===0&&channelUnavailableMonths.length===0,available:available.length>0,scopeChanged:new Set(scopes.map(s=>JSON.stringify(s))).size>1,scopes};
  }
  function compareCoverage(a,b){
   if(!a.complete||!b.complete)return 'unavailable';
   const scopes=[...a.scopes,...b.scopes].map(s=>JSON.stringify(s));
   if(scopes.some(s=>s==='[]')||new Set(scopes).size>1)return 'scope_changed';
   return 'comparable';
  }
  function validateCube(cube,meta,filters,dimensions){
   if(cube.month!==meta.month||!Array.isArray(cube.rows))throw Error('Cubo mensal incompatível: '+meta.month);
   const bdDims=[...dimensions,...Object.keys(filters).filter(k=>active(filters[k]))].filter(k=>k?.startsWith('bd_')||k==='propulsao').map(k=>k==='propulsao'?'bd_combustivel':k);
   if(bdDims.some(k=>!cube.dimensions?.includes(k)&&!cube.columns?.includes(k)))throw Error('A classificação BD ainda está em processamento para '+meta.month+'.');
  }
  function createBucket(range,index,filters,dimensions){return {range,coverage:coverageFor(range,index,filters,dimensions),total:0,values:new Map(),groups:new Map()};}
  function addCell(bucket,x,series,count){increment(bucket.values,JSON.stringify([x,series]),count);increment(bucket.groups,series,count);bucket.total+=count;}
  function timeWindows(range,grain){
   const out=[];
   if(grain==='day'){for(let date=range.start;date<=range.end;date=addDays(date,1))out.push({x:date,range:{start:date,end:date}});return out;}
   if(grain==='month')return listMonths(range).map(month=>({x:month,range:{start:month===range.start.slice(0,7)?range.start:month+'-01',end:month===range.end.slice(0,7)?range.end:monthEnd(month)}}));
   for(let year=Number(range.start.slice(0,4));year<=Number(range.end.slice(0,4));year++)out.push({x:String(year),range:{start:Math.max(year,0)===Number(range.start.slice(0,4))?range.start:year+'-01-01',end:year===Number(range.end.slice(0,4))?range.end:year+'-12-31'}});
   return out;
  }
  function priorWindow(window,grain){
   if(grain==='year')return comparisonRange(window,'year');
   if(grain==='day')return {start:addDays(window.start,-1),end:addDays(window.end,-1)};
   const month=window.start.slice(0,7),full=window.start===month+'-01'&&window.end===monthEnd(month);if(full)return comparisonRange(window);
   const d=day(month+'-01');d.setUTCMonth(d.getUTCMonth()-1);const prior=iso(d).slice(0,7),last=Number(monthEnd(prior).slice(-2));
   const startDay=Number(window.start.slice(-2)),endDay=Number(window.end.slice(-2));
   // A source window extending beyond the prior month's end has no equal elapsed-day comparator.
   if(startDay>last||endDay>last)return null;
   return {start:prior+'-'+String(startDay).padStart(2,'0'),end:prior+'-'+String(endDay).padStart(2,'0')};
  }
  function shapeMatches(a,b){
   if(day(a.end)-day(a.start)===day(b.end)-day(b.start))return true;
   const full=r=>r.start.endsWith('-01')&&r.end===monthEnd(r.end.slice(0,7));
   if(full(a)&&full(b))return listMonths(a).length===listMonths(b).length;
   if(a.start.slice(5)===b.start.slice(5)&&a.end.slice(5)===b.end.slice(5))return true;
   return listMonths(a).length===1&&listMonths(b).length===1&&a.start.slice(-2)===b.start.slice(-2)&&a.end.slice(-2)===b.end.slice(-2);
  }
  async function loadBuckets(index,buckets,filters,dimensions,context,onRow){
   const byMonth=new Map();for(const bucket of buckets)for(const month of bucket.coverage.availableMonths){if(!byMonth.has(month))byMonth.set(month,[]);byMonth.get(month).push(bucket);}
   const months=[...byMonth.keys()].sort(compareText);
   for(let i=0;i<months.length;i++){
    checkCancelled(context);const meta=index.get(months[i]),needsOrigin=dimensions.includes('bd_origem')||hasFilterSelection(filters.bd_origem,'bd_origem');
    if(needsOrigin&&!meta.originCubePath)throw Error('A origem do veículo no BD ainda não está disponível para '+meta.month+'. Remova a dimensão ou o filtro de origem, ou escolha outro período.');
    const loadMeta=needsOrigin?{...meta,cubePath:meta.originCubePath,sha256:meta.originCubeSha256??meta.sha256}:meta,cube=await context.loadCube(loadMeta);checkCancelled(context);validateCube(cube,meta,filters,dimensions);
    const targets=byMonth.get(meta.month),routes=new Map(),envelope={start:targets.map(b=>b.range.start).sort()[0],end:targets.map(b=>b.range.end).sort().at(-1)};
    collectCube(createAccumulator(),cube,filters,envelope,{groupDimensions:[],onAcceptedRow:(row,count,date,value)=>{if(!routes.has(date))routes.set(date,targets.filter(b=>date>=b.range.start&&date<=b.range.end));for(const bucket of routes.get(date))onRow(bucket,count,date,value);}});
    context.onProgress?.({done:i+1,total:months.length});
    // Yield even for warm-cache queries so a newer request can cancel before the next monthly cube.
    if(context.yieldControl)await context.yieldControl();
   }
   checkCancelled(context);
  }
  function otherLabel(existing){let label='Outros';while(existing.has(label))label+=' (agrupado)';return label;}
  function dimension(value){return aliases[value]??value;}
  function displaySelection(totals,topN,explicit,pinned=[],maximum=50){
   const ordered=[...totals].filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]||compareText(a[0],b[0])).map(([v])=>v);
   const base=Array.isArray(explicit)&&explicit.length?[...new Set(explicit.map(String))].filter(v=>totals.has(v)).slice(0,topN):ordered.slice(0,topN);
   const chosen=[...new Set([...base,...pinned.filter(v=>(totals.get(v)??0)>0)])].slice(0,maximum+pinned.length);
   return {chosen,omitted:ordered.filter(v=>!chosen.includes(v)),all:ordered};
  }
  function comparisonFields(count,previousCount,status){
   if(status!=='comparable')return {previousCount:null,changeRate:null,comparisonStatus:status};
   return {previousCount,changeRate:previousCount>0?(count-previousCount)/previousCount:null,comparisonStatus:previousCount>0?'comparable':count>0?'new_from_zero':'both_zero'};
  }
  async function runExploration(request,context){
   const filters={...canonicalFilters(request.filters??{}),population:request.filters?.population??'light'},index=manifestIndex(request.manifest);
   const xDimension=dimension(request.xDimension==='date'?(request.timeGrain??'month'):request.xDimension??'month'),seriesDimension=request.seriesDimension==='none'?null:dimension(request.seriesDimension)||null;
   if(!EXPLORER_X.includes(xDimension))throw Error('Eixo X não suportado.');if(seriesDimension&&!EXPLORER_SERIES.includes(seriesDimension))throw Error('Série não suportada.');
   const temporal=['day','month','year'].includes(xDimension),requestedRange=parsePeriod(filters.date??'all',request.manifest),range=effectiveRange(requestedRange,index),dimensions=[temporal?null:xDimension,seriesDimension].filter(Boolean);
   if(xDimension==='day'&&(day(range.end)-day(range.start))/86400000+1>EXPLORATION_LIMITS.dailyDays)throw Error('A visão diária aceita até 366 dias. Reduza o período ou altere o eixo X para mês ou ano.');
   const coverage=coverageFor(range,index,filters,dimensions),windows=temporal?timeWindows(range,xDimension):[{x:null,range}];
   const buckets=[],current=[],prior=[];for(const window of windows){const bucket=createBucket(window.range,index,filters,dimensions);bucket.x=window.x;current.push(bucket);buckets.push(bucket);const priorRange=temporal?priorWindow(window.range,xDimension):null,p=priorRange?createBucket(priorRange,index,filters,dimensions):null;prior.push(p);if(p){p.x=window.x;buckets.push(p);}}
   const modelBrands=new Map(),categoryBrands=new Map(),seriesBrands=new Map(),currentSet=new Set(current);
   const sourceValue=(field,value)=>field==='municipio'?value('municipio')+' · '+value('uf'):field==='modelo'?value('marca')+' · '+value('modelo'):value(field);
   const remember=(map,key,brand)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(brand);};
   await loadBuckets(index,buckets,filters,dimensions,context,(bucket,count,date,value)=>{const x=temporal?bucket.x:sourceValue(xDimension,value),series=seriesDimension?sourceValue(seriesDimension,value):'Total';addCell(bucket,x,series,count);if(currentSet.has(bucket)&&count>0){const brand=value('marca');remember(categoryBrands,x,brand);remember(seriesBrands,series,brand);if(xDimension==='modelo'||seriesDimension==='modelo')remember(modelBrands,value('modelo'),brand);}});
   const highlighted=map=>[...map].filter(([,brands])=>brands.size===1&&brands.has('MITSUBISHI')).map(([key])=>key),highlightOn=(request.highlightBrands??[]).includes('MITSUBISHI'),highlightedCategories=highlightOn&&['marca','modelo'].includes(xDimension)?highlighted(categoryBrands):[],highlightedSeries=highlightOn&&['marca','modelo'].includes(seriesDimension)?highlighted(seriesBrands):[];
   const seriesTotals=new Map(),categoryTotals=new Map();for(const bucket of current)for(const [key,count]of bucket.values){const [x,s]=JSON.parse(key);increment(seriesTotals,s,count);increment(categoryTotals,x,count);}
   // Keep prior-only members in the exact residual membership used for temporal comparisons.
   for(const bucket of prior)if(bucket)for(const key of bucket.groups.keys())if(!seriesTotals.has(key))seriesTotals.set(key,0);
   const seriesChoice=seriesDimension?displaySelection(seriesTotals,limit(request.topN,8,20),request.displaySeries,seriesDimension==='marca'?highlightedSeries:[],20):{chosen:['Total'],omitted:[],all:['Total']};
   if(seriesDimension){seriesChoice.all=[...new Set([...seriesChoice.all,...seriesTotals.keys()])];seriesChoice.omitted=seriesChoice.all.filter(s=>!seriesChoice.chosen.includes(s));}
   const categoryChoice=temporal?{chosen:windows.map(w=>w.x),omitted:[],all:windows.map(w=>w.x)}:displaySelection(categoryTotals,limit(request.xTopN??(seriesDimension?20:request.topN),seriesDimension?20:10,50),request.displayCategories,xDimension==='marca'?highlightedCategories:[],50);
   const order=['value_desc','value_asc','label_asc','label_desc'].includes(request.order)?request.order:'value_desc';
   if(!temporal){const sign=order.endsWith('_asc')?1:-1;categoryChoice.chosen.sort((a,b)=>order.startsWith('label_')?sign*a.localeCompare(b,'pt-BR',{numeric:true}):sign*((categoryTotals.get(a)??0)-(categoryTotals.get(b)??0))||a.localeCompare(b,'pt-BR'));}
   const includeOthers=request.includeOthers!==false,seriesOthersLabel=otherLabel(new Set(seriesChoice.all)),categoryOthersLabel=otherLabel(new Set(categoryChoice.all));
   const selectedSeries=[...seriesChoice.chosen,...(includeOthers&&seriesChoice.omitted.length?[seriesOthersLabel]:[])],xValues=[...categoryChoice.chosen,...(includeOthers&&categoryChoice.omitted.length?[categoryOthersLabel]:[])];
   const seriesSet=new Set(seriesChoice.chosen),categorySet=new Set(categoryChoice.chosen);
   const collapse=bucket=>{const out=new Map();if(!bucket)return out;for(const [key,count]of bucket.values){let [x,s]=JSON.parse(key);if(!seriesSet.has(s)){if(!includeOthers)continue;s=seriesOthersLabel;}if(!temporal&&!categorySet.has(x)){if(!includeOthers)continue;x=categoryOthersLabel;}increment(out,JSON.stringify([x,s]),count);}return out;};
   if(xValues.length*selectedSeries.length>EXPLORATION_LIMITS.maxDisplayCells)throw Error('O gráfico excede 10.000 pontos. Reduza o período ou o Top N, ou altere o eixo X para mês ou ano.');
   const cells=[];
   for(let i=0;i<current.length;i++){
    const bucket=current[i],p=prior[i],values=collapse(bucket),previous=collapse(p),status=temporal?(p?compareCoverage(bucket.coverage,p.coverage):'unaligned_periods'):'non_temporal';
    for(const x of temporal?[bucket.x]:xValues)for(const series of selectedSeries){const key=JSON.stringify([x,series]),observedCount=values.get(key)??0,count=bucket.coverage.complete?observedCount:null,denominator=bucket.coverage.complete?bucket.total:null,previousCount=p?.coverage.complete?(previous.get(JSON.stringify([p.x??x,series]))??0):null;
     cells.push({x,series,count,observedCount,denominator,marketShare:count!==null&&denominator>0?count/denominator:null,...comparisonFields(count,previousCount,status),periodStart:bucket.range.start,periodEnd:bucket.range.end,previousStart:p?.range.start??null,previousEnd:p?.range.end??null,complete:bucket.coverage.complete});
    }
   }
   // A 100% stack uses the full filtered X-category denominator, independently of Top N.
   for(const cell of cells){const observedCategoryTotal=temporal?current.find(bucket=>bucket.x===cell.x)?.total??0:cell.x===categoryOthersLabel?categoryChoice.omitted.reduce((sum,key)=>sum+(categoryTotals.get(key)??0),0):categoryTotals.get(cell.x)??0;cell.categoryDenominator=cell.complete?observedCategoryTotal:null;cell.categoryShare=cell.count!==null&&cell.categoryDenominator>0?cell.count/cell.categoryDenominator:null;}
   const observedTotal=current.reduce((s,b)=>s+b.total,0);
   return {type:'explore',order,xTopN:limit(request.xTopN??request.topN,20,50),highlightedCategories,highlightedSeries,modelBrandIdentities:[...modelBrands].map(([model,brands])=>({model,brands:[...brands].sort(),status:brands.size===1?'Fabricante exato da fonte':'Rótulo de modelo presente em mais de um fabricante; identidades separadas'})),limits:EXPLORATION_LIMITS,xDimension,seriesDimension,temporal,cells,total:coverage.complete?observedTotal:null,observedTotal,complete:coverage.complete,range,requestedRange,observationClipped:range.end!==requestedRange.end,xValues,selectedSeries,selectedCategories:categoryChoice.chosen,othersSeries:seriesChoice.omitted,othersCategories:categoryChoice.omitted,seriesOthersLabel,categoryOthersLabel,allSeries:seriesChoice.all,allCategories:categoryChoice.all,displayedTotal:cells.reduce((s,r)=>s+r.observedCount,0),topN:limit(request.topN,seriesDimension?8:10,seriesDimension?20:50),denominatorScope:temporal?'full_filtered_market_per_time_period':'full_filtered_market_selected_range',denominatorDescription:temporal?'Todo o mercado filtrado em cada período do eixo X, antes do Top N e de Outros.':'Todo o mercado filtrado no período selecionado, antes do Top N e de Outros; a participação soma-se entre categorias e séries.',coverage,missingMonths:coverage.missingMonths,scopeChanged:coverage.scopeChanged,filters};
  }

  function competitionRanks(counts){
   const ordered=[...counts].filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]||compareText(a[0],b[0])),ranks=new Map(),tieSizes=new Map();let previous=null,rank=0;
   for(let i=0;i<ordered.length;i++){const [brand,count]=ordered[i];if(count!==previous)rank=i+1;ranks.set(brand,rank);increment(tieSizes,rank,1);previous=count;}return {ranks,tieSizes};
  }
  function alignedPeriods(a,b,index){
   let before=effectiveRange(a,index),after=effectiveRange(b,index),alignmentApplied=false;
   const fullMonths=r=>r.start.endsWith('-01')&&r.end===monthEnd(r.end.slice(0,7));
   const matchingSeason=a.start.slice(5)===b.start.slice(5)&&a.end.slice(5)===b.end.slice(5)&&listMonths(a).length===listMonths(b).length;
   if(((fullMonths(a)&&fullMonths(b)&&listMonths(a).length===listMonths(b).length)||matchingSeason)&&(before.end!==a.end||after.end!==b.end)){
    const days=Math.min(Number(before.end.slice(-2)),Number(after.end.slice(-2)));before={...before,end:before.end.slice(0,7)+'-'+String(days).padStart(2,'0')};after={...after,end:after.end.slice(0,7)+'-'+String(days).padStart(2,'0')};alignmentApplied=true;
   }
   return {before,after,alignmentApplied,aligned:shapeMatches(before,after)};
  }
  async function runRanking(request,context){
   const filters={...canonicalFilters(request.filters??{}),population:request.filters?.population??'light'},index=manifestIndex(request.manifest),requestedA=parsePeriod(request.periodA,request.manifest),requestedB=parsePeriod(request.periodB??filters.date,request.manifest),aligned=alignedPeriods(requestedA,requestedB,index);
   const dimension=request.dimension??'marca';
   if(!['marca','modelo','grupo_modelo'].includes(dimension))throw Error('Agrupamento do ranking inválido.');
   const a=createBucket(aligned.before,index,filters,[dimension,'marca']),b=createBucket(aligned.after,index,filters,[dimension,'marca']);
   a.mitsubishi=new Map();b.mitsubishi=new Map();a.brandMembership=new Map();b.brandMembership=new Map();
   await loadBuckets(index,[a,b],filters,[dimension,'marca'],context,(bucket,count,date,value)=>{const name=value(dimension),sourceBrand=value('marca');increment(bucket.values,name,count);if(sourceBrand==='MITSUBISHI')increment(bucket.mitsubishi,name,count);if(count>0){if(!bucket.brandMembership.has(name))bucket.brandMembership.set(name,new Map());increment(bucket.brandMembership.get(name),sourceBrand,count);}bucket.total+=count;});
   const ar=competitionRanks(a.values),br=competitionRanks(b.values),comparisonStatus=aligned.aligned?compareCoverage(a.coverage,b.coverage):'unaligned_periods',comparable=comparisonStatus==='comparable';
   const rows=[...new Set([...a.values.keys(),...b.values.keys()])].map(brand=>{
    const beforeCount=a.coverage.complete?(a.values.get(brand)??0):null,afterCount=b.coverage.complete?(b.values.get(brand)??0):null,beforeRank=beforeCount>0?ar.ranks.get(brand):null,afterRank=afterCount>0?br.ranks.get(brand):null;
    let status=!comparable?comparisonStatus:beforeRank===null&&afterRank===null?'unranked':beforeRank===null?'entered':afterRank===null?'exited':afterRank<beforeRank?'rise':afterRank>beforeRank?'fall':'unchanged';
    return {brand,dimension,beforeBrandCounts:Object.fromEntries(a.brandMembership.get(brand)??[]),afterBrandCounts:Object.fromEntries(b.brandMembership.get(brand)??[]),beforeMitsubishiCount:a.mitsubishi.get(brand)??0,afterMitsubishiCount:b.mitsubishi.get(brand)??0,mitsubishiExclusive:((a.values.get(brand)??0)+(b.values.get(brand)??0)>0)&&((a.mitsubishi.get(brand)??0)+(b.mitsubishi.get(brand)??0)===(a.values.get(brand)??0)+(b.values.get(brand)??0)),beforeCount,afterCount,beforeDenominator:a.coverage.complete?a.total:null,afterDenominator:b.coverage.complete?b.total:null,beforePeriodStart:a.range.start,beforePeriodEnd:a.range.end,afterPeriodStart:b.range.start,afterPeriodEnd:b.range.end,beforeShare:beforeCount!==null&&a.total>0?beforeCount/a.total:null,afterShare:afterCount!==null&&b.total>0?afterCount/b.total:null,beforeRank,afterRank,beforeTie:beforeRank!==null&&ar.tieSizes.get(beforeRank)>1,afterTie:afterRank!==null&&br.tieSizes.get(afterRank)>1,beforeTied:beforeRank!==null&&ar.tieSizes.get(beforeRank)>1,afterTied:afterRank!==null&&br.tieSizes.get(afterRank)>1,beforeTieSize:beforeRank===null?0:ar.tieSizes.get(beforeRank),afterTieSize:afterRank===null?0:br.tieSizes.get(afterRank),rankChange:comparable&&beforeRank!==null&&afterRank!==null?beforeRank-afterRank:null,status};
   }).sort((x,y)=>(x.afterRank??Infinity)-(y.afterRank??Infinity)||(x.beforeRank??Infinity)-(y.beforeRank??Infinity)||compareText(x.brand,y.brand));
   const topN=request.topN===''?Number.MAX_SAFE_INTEGER:Number(request.topN??10),displayBrands=Array.isArray(request.displayBrands)&&request.displayBrands.length?[...new Set(request.displayBrands.map(String))]:null;
   if(!Number.isSafeInteger(topN)||topN<1)throw Error('Escolha uma posição inteira maior que zero.');
   const displayRows=rows.filter(r=>(request.highlightBrands??[]).includes(r.brand)||(displayBrands?displayBrands.includes(r.brand):(r.beforeRank!==null&&r.beforeRank<=topN)||(r.afterRank!==null&&r.afterRank<=topN))).map(r=>({...r,beforeInTopN:r.beforeRank!==null&&r.beforeRank<=topN,afterInTopN:r.afterRank!==null&&r.afterRank<=topN,boundaryStatus:!comparable?'not_comparable':r.beforeRank!==null&&r.beforeRank<=topN&&!(r.afterRank!==null&&r.afterRank<=topN)?'left_top_n':!(r.beforeRank!==null&&r.beforeRank<=topN)&&r.afterRank!==null&&r.afterRank<=topN?'entered_top_n':'within_display'}));
   return {type:'ranking',dimension,rows,displayRows,topN,displayBrands,periodA:{...a.range,...a.coverage,requestedRange:requestedA,observedTotal:a.total,total:a.coverage.complete?a.total:null},periodB:{...b.range,...b.coverage,requestedRange:requestedB,observedTotal:b.total,total:b.coverage.complete?b.total:null},beforeTotal:a.coverage.complete?a.total:null,afterTotal:b.coverage.complete?b.total:null,comparable,comparisonStatus,alignmentApplied:aligned.alignmentApplied,rankDefinition:'1 + número de entidades com volume estritamente maior; apenas volumes positivos recebem posição.',denominatorScope:'full_filtered_market_each_period',filters};
  }

  async function runStructure(request,context){
   if(request.pyramidView===true)return runPyramidStructure(request,context);
   const filters={...canonicalFilters(request.filters??{}),population:request.filters?.population??'light'},index=manifestIndex(request.manifest),requestedRange=parsePeriod(filters.date??'all',request.manifest),range=effectiveRange(requestedRange,index),previousRange=comparisonRange(range,request.comparison==='previous'?'previous':'year'),mapping=request.originMapping,groupingDimension=request.grouping??'bd_classe';
   if(!STRUCTURE_GROUPINGS.includes(groupingDimension))throw Error('Agrupamento BD não suportado.');
   if(!mapping?.brands)throw Error('A classificação auditada de origem das marcas não está disponível.');
   const a=createBucket(range,index,filters,[groupingDimension]),b=createBucket(previousRange,index,filters,[groupingDimension]);
   await loadBuckets(index,[a,b],filters,[groupingDimension],context,(bucket,count,date,value)=>{const segment=value(groupingDimension),kind=classifyBrandOrigin(value('marca'),Number(date.slice(0,4)),mapping).kind;increment(bucket.values,JSON.stringify([segment,kind]),count);increment(bucket.groups,segment,count);bucket.total+=count;});
   const comparisonStatus=shapeMatches(range,previousRange)?compareCoverage(a.coverage,b.coverage):'unaligned_periods',comparable=comparisonStatus==='comparable';
   const rows=[...new Set([...a.groups.keys(),...b.groups.keys()])].map(segment=>{
    const observedTotal=a.groups.get(segment)??0,previousObservedTotal=b.groups.get(segment)??0,complete=a.coverage.complete,total=complete?observedTotal:null,previousTotal=b.coverage.complete?previousObservedTotal:null;
    const read=kind=>complete?(a.values.get(JSON.stringify([segment,kind]))??0):null,strictChinese=read('china'),brazilChinaPartnership=read('partnership'),otherVerified=read('other'),unknown=read('unknown'),strictShare=total>0?strictChinese/total:null,inclusiveShare=total>0?(strictChinese+brazilChinaPartnership)/total:null;
    const previousStrictShare=comparable&&previousTotal>0?(b.values.get(JSON.stringify([segment,'china']))??0)/previousTotal:null,previousInclusiveShare=comparable&&previousTotal>0?((b.values.get(JSON.stringify([segment,'china']))??0)+(b.values.get(JSON.stringify([segment,'partnership']))??0))/previousTotal:null;
    return {segment,rawClass:groupingDimension==='bd_classe'?segment:null,rawSegment:groupingDimension==='bd_segmento'?segment:null,displayLabel:structureDisplayLabel(segment,groupingDimension),groupingDimension,total,observedTotal,strictChinese,brazilChinaPartnership,otherVerified,unknown,strictShare,inclusiveShare,unknownShare:total>0?unknown/total:null,previousTotal,previousStrictShare,previousInclusiveShare,strictShareChange:strictShare!==null&&previousStrictShare!==null?strictShare-previousStrictShare:null,inclusiveShareChange:inclusiveShare!==null&&previousInclusiveShare!==null?inclusiveShare-previousInclusiveShare:null,comparisonStatus:!comparable?comparisonStatus:previousTotal===0?'new_from_zero':total===0?'current_zero':'comparable'};
   }).sort((a,b)=>a.observedTotal-b.observedTotal||compareText(a.segment,b.segment));
   return {type:'structure',groupingDimension,groupingLabel:groupingLabel(groupingDimension),labelMappingVersion:CLASS_LABEL_MAPPING_VERSION,sourceGroupingFields:groupingDimension==='bd_classe'?'BODY TYPE + SEGMENT':'SEGMENT',rows,total:a.coverage.complete?a.total:null,observedTotal:a.total,previousTotal:b.coverage.complete?b.total:null,complete:a.coverage.complete,comparable,comparisonStatus,range,requestedRange,previousRange,coverage:a.coverage,previousCoverage:b.coverage,missingMonths:a.coverage.missingMonths,scopeChanged:a.coverage.scopeChanged,denominatorScope:groupingDimension==='bd_classe'?'full_filtered_market_within_each_bd_class':'full_filtered_market_within_each_bd_segment',classificationVersion:mapping.version??mapping.schemaVersion??null,filters};
  }


  // The pyramid has view-only vehicle exclusions and shares the global body/size filters.
  // Raw BD tokens remain keys; counting never mutates global filters or source cubes.
  const excludedPyramidBody = body => body === 'BUS' || body === 'TRUCK' || body.endsWith(' TRUCK');
  async function runPyramidStructure(request,context){
   const requestedFilters={...canonicalFilters(request.filters??{}),population:request.filters?.population??'light'},filters={...requestedFilters,population:'light'},bodyType=requestedFilters.bd_carroceria??[],size=requestedFilters.bd_segmento??[],bodySelection=categoricalSelection(bodyType),sizeSelection=categoricalSelection(size),groupingDimension=request.structureGrouping??'bd_segmento',dimensions=['bd_carroceria','bd_segmento'],index=manifestIndex(request.manifest),requestedRange=parsePeriod(filters.date??'all',request.manifest),range=effectiveRange(requestedRange,index),previousRange=comparisonRange(range,request.comparison==='previous'?'previous':'year'),mapping=request.originMapping;
   if(!['bd_segmento','bd_carroceria'].includes(groupingDimension))throw Error('Agrupamento da pirâmide não suportado.');
   if(!mapping?.brands)throw Error('A classificação auditada de origem das marcas não está disponível.');
   const make=range=>({...createBucket(range,index,filters,dimensions),bodyOptions:new Map(),sizeOptions:new Map(),excludedBodies:new Map(),excludedSegments:new Map(),excludedHeavy:0,globalObserved:0,eligibleObserved:0}),a=make(range),b=make(previousRange);
   // Read the original global scope so exclusions can be counted without overlap.
   await loadBuckets(index,[a,b],{...requestedFilters,bd_carroceria:'all',bd_segmento:'all'},dimensions,context,(bucket,count,date,value)=>{
    bucket.globalObserved+=count;
    if(!['Auto','Comercial Leve'].includes(value('segmento'))){bucket.excludedHeavy+=count;return;}
    const body=value('bd_carroceria'),segment=value('bd_segmento');
    if(excludedPyramidBody(body)){increment(bucket.excludedBodies,body,count);return;}
    if(excludedPyramidBody(segment)){increment(bucket.excludedSegments,segment,count);return;}
    bucket.eligibleObserved+=count;
    if(!sizeSelection.length||sizeSelection.includes(segment))increment(bucket.bodyOptions,body,count);
    if(!bodySelection.length||bodySelection.includes(body))increment(bucket.sizeOptions,segment,count);
    if((bodySelection.length&&!bodySelection.includes(body))||(sizeSelection.length&&!sizeSelection.includes(segment)))return;
    const kind=classifyBrandOrigin(value('marca'),Number(date.slice(0,4)),mapping).kind;
    const group=groupingDimension==='bd_carroceria'?body:segment;increment(bucket.values,JSON.stringify([group,kind]),count);increment(bucket.groups,group,count);bucket.total+=count;
   });
   const comparisonStatus=shapeMatches(range,previousRange)?compareCoverage(a.coverage,b.coverage):'unaligned_periods',comparable=comparisonStatus==='comparable',denominator=a.coverage.complete?a.total:null,previousDenominator=b.coverage.complete?b.total:null;
   const tableRows=[...new Set([...a.groups.keys(),...b.groups.keys()])].map(segment=>{
    const observedTotal=a.groups.get(segment)??0,previousObservedTotal=b.groups.get(segment)??0,complete=a.coverage.complete,total=complete?observedTotal:null,previousTotal=b.coverage.complete?previousObservedTotal:null,read=kind=>complete?(a.values.get(JSON.stringify([segment,kind]))??0):null,strictChinese=read('china'),brazilChinaPartnership=read('partnership'),otherVerified=read('other'),unknown=read('unknown'),strictShare=total>0?strictChinese/total:null,inclusiveShare=total>0?(strictChinese+brazilChinaPartnership)/total:null;
    const previousStrictShare=comparable&&previousTotal>0?(b.values.get(JSON.stringify([segment,'china']))??0)/previousTotal:null,previousInclusiveShare=comparable&&previousTotal>0?((b.values.get(JSON.stringify([segment,'china']))??0)+(b.values.get(JSON.stringify([segment,'partnership']))??0))/previousTotal:null;
    return {segment,rawSegment:groupingDimension==='bd_segmento'?segment:null,rawBodyType:groupingDimension==='bd_carroceria'?segment:null,sourceGroupingField:groupingDimension==='bd_carroceria'?'BODY TYPE':'SEGMENT',displayLabel:groupingDimension==='bd_carroceria'?bodyTypeLabel(segment):structureDisplayLabel(segment,'bd_segmento'),pyramidLabel:groupingDimension==='bd_carroceria'?bodyTypeLabel(segment):pyramidSizeLabel(segment),segmentCategoryStatus:groupingDimension==='bd_carroceria'?'Carroceria da fonte; categoria preservada':sizeCategoryStatus(segment),groupingDimension,bodyType:bodySelection.join(' | ')||'all',size:sizeSelection.join(' | ')||'all',total,observedTotal,denominator,marketShare:denominator>0?total/denominator:null,strictChinese,brazilChinaPartnership,otherVerified,unknown,strictShare,inclusiveShare,unknownShare:total>0?unknown/total:null,previousTotal,previousDenominator,previousMarketShare:previousDenominator>0?previousTotal/previousDenominator:null,previousStrictShare,previousInclusiveShare,strictShareChange:strictShare!==null&&previousStrictShare!==null?strictShare-previousStrictShare:null,inclusiveShareChange:inclusiveShare!==null&&previousInclusiveShare!==null?inclusiveShare-previousInclusiveShare:null,comparisonStatus:!comparable?comparisonStatus:previousTotal===0?'new_from_zero':total===0?'current_zero':'comparable'};
   }).sort((a,b)=>a.observedTotal-b.observedTotal||compareText(a.segment,b.segment));
   const options=map=>[...map].filter(([,count])=>count>0).sort(([a],[b])=>compareText(a,b)).map(([value,count])=>({value,count})),excludedBodyLabels=options(a.excludedBodies),excludedBodyCount=excludedBodyLabels.reduce((n,r)=>n+r.count,0),excludedSegmentLabels=options(a.excludedSegments),excludedSegmentCount=excludedSegmentLabels.reduce((n,r)=>n+r.count,0),scopeExclusions={basis:'other_global_filters_before_body_and_size',requestedPopulation:requestedFilters.population,effectivePopulation:'light',globalObservedTotal:a.globalObserved,excludedHeavyCount:a.excludedHeavy,excludedBodyCount,excludedBodyLabels,excludedSegmentCount,excludedSegmentLabels,eligibleObservedTotal:a.eligibleObserved,countsComplete:a.coverage.complete};
   return {type:'structure',pyramidView:true,groupingDimension,groupingLabel:groupingDimension==='bd_carroceria'?'Carroceria BD (BODY TYPE)':'Porte BD (SEGMENT)',sourceGroupingFields:groupingDimension==='bd_carroceria'?'BODY TYPE':'SEGMENT',globalFilterFields:['BODY TYPE','SEGMENT'],labelMappingVersion:CLASS_LABEL_MAPPING_VERSION,rows:tableRows.filter(r=>r.observedTotal>0),tableRows,total:denominator,denominator,observedTotal:a.total,previousTotal:previousDenominator,bodyType,size,bodyOptions:options(a.bodyOptions),sizeOptions:options(a.sizeOptions),scopeExclusions,complete:a.coverage.complete,comparable,comparisonStatus,range,requestedRange,previousRange,coverage:a.coverage,previousCoverage:b.coverage,missingMonths:a.coverage.missingMonths,scopeChanged:a.coverage.scopeChanged,denominatorScope:'full_global_filtered_light_market_after_body_and_size_excluding_truck_bus_body_or_segment_including_unknown_size',chineseDenominatorScope:groupingDimension==='bd_carroceria'?'full_filtered_market_within_each_bd_body_including_unknown_origin':'full_filtered_market_within_each_bd_segment_including_unknown_origin',classificationVersion:mapping.version??mapping.schemaVersion??null,filters,requestedFilters};
  }


  // Exact source-brand highlight. This display-only mode never adds a brand filter.
  // The only approved source alias is raw Fabricante "MITSUBISHI " → trimmed cube "MITSUBISHI".
  const MITSUBISHI_BRAND = 'MITSUBISHI';
  async function runMitsubishiBenchmark(request,context){
   const filters={...canonicalFilters(request.filters??{}),population:request.filters?.population??'light'},index=manifestIndex(request.manifest),requestedRange=parsePeriod(filters.date??'all',request.manifest),range=effectiveRange(requestedRange,index),previousRange=comparisonRange(range,request.comparison==='previous'?'previous':'year');
   const conflictKeys=new Set(['2016-03-31|I/TRIUMPH TR4A ROADSTER|OUT PORTFOLIO','2016-06-20|I/FORDE T|OLD','2018-08-01|I/FORDE T|OLD','2019-01-21|I/FORDE T|OLD','2019-11-29|I/FORDE T|OLD','2025-07-31|I/TRIUMPH TR4 COUPE|OLD']);
   const missingClassMonths=new Set();
   const make=r=>({...createBucket(r,index,filters,[]),brands:new Map(),models:new Map(),segments:new Map(),ufs:new Map(),brandUF:new Map(),brandTotal:0,identityConflicts:new Map()});
   const a=make(range),b=make(previousRange),months=timeWindows(range,'month').map(w=>({...make(w.range),month:w.x})),priorMonths=months.map(w=>({...make(comparisonRange(w.range,'year')),month:w.month}));
   await loadBuckets(index,[a,b,...months,...priorMonths],filters,[],{...context,loadCube:async meta=>{const cube=await context.loadCube(meta);if(!(cube.columns??cube.dimensions??[]).includes('bd_classe'))missingClassMonths.add(meta.month);return cube;}},(bucket,count,date,value)=>{
    const brand=value('marca'),model=value('modelo'),segment=value('bd_classe'),sourceSize=value('bd_segmento'),uf=value('uf');bucket.total+=count;increment(bucket.brands,brand,count);increment(bucket.ufs,uf,count);
    if(brand===MITSUBISHI_BRAND){bucket.brandTotal+=count;increment(bucket.brandUF,uf,count);}
    // Only main current/prior buckets need potentially large model maps.
    if(!bucket.month){const identity=JSON.stringify([segment,brand,model]);if(brand===MITSUBISHI_BRAND&&conflictKeys.has(date+'|'+model+'|'+sourceSize))increment(bucket.identityConflicts,identity,count);increment(bucket.models,identity,count);increment(bucket.segments,segment,count);}
   });
   const status=shapeMatches(range,previousRange)?compareCoverage(a.coverage,b.coverage):'unaligned_periods',comparable=status==='comparable',count=a.coverage.complete?a.brandTotal:null,denominator=a.coverage.complete?a.total:null,previousCount=b.coverage.complete?b.brandTotal:null,previousDenominator=b.coverage.complete?b.total:null,ar=competitionRanks(a.brands),br=competitionRanks(b.brands);
   const summary={brand:MITSUBISHI_BRAND,count,observedCount:a.brandTotal,denominator,marketShare:denominator>0?count/denominator:null,...comparisonFields(count,previousCount,status),previousDenominator,previousShare:comparable&&previousDenominator>0?previousCount/previousDenominator:null,marketChangeRate:comparable&&b.total>0?(a.total-b.total)/b.total:null,rank:count>0?ar.ranks.get(MITSUBISHI_BRAND):null,previousRank:previousCount>0?br.ranks.get(MITSUBISHI_BRAND):null,periodStart:range.start,periodEnd:range.end,previousStart:previousRange.start,previousEnd:previousRange.end,complete:a.coverage.complete};
   const rankingRows=[...new Set([...a.brands.keys(),...b.brands.keys()])].map(brand=>{const ac=a.coverage.complete?(a.brands.get(brand)??0):null,bc=b.coverage.complete?(b.brands.get(brand)??0):null;return {brand,count:ac,previousCount:bc,denominator,previousDenominator,marketShare:denominator>0?ac/denominator:null,previousShare:previousDenominator>0?bc/previousDenominator:null,rank:ac>0?ar.ranks.get(brand):null,previousRank:bc>0?br.ranks.get(brand):null,highlight:brand===MITSUBISHI_BRAND,...comparisonFields(ac,bc,status),periodStart:range.start,periodEnd:range.end,previousStart:previousRange.start,previousEnd:previousRange.end};}).sort((x,y)=>(x.rank??Infinity)-(y.rank??Infinity)||compareText(x.brand,y.brand));
   const topN=limit(request.topN,10,50),displayRanking=rankingRows.filter(r=>r.highlight||(r.rank!==null&&r.rank<=topN)||(r.previousRank!==null&&r.previousRank<=topN));
   const trajectory=months.map((m,i)=>{const p=priorMonths[i],s=shapeMatches(m.range,p.range)?compareCoverage(m.coverage,p.coverage):'unaligned_periods',n=m.coverage.complete?m.brandTotal:null,d=m.coverage.complete?m.total:null;return {month:m.month,date:m.month+'-01',brand:MITSUBISHI_BRAND,count:n,observedCount:m.brandTotal,denominator:d,marketShare:d>0?n/d:null,...comparisonFields(n,p.coverage.complete?p.brandTotal:null,s),marketChangeRate:s==='comparable'&&p.total>0?(m.total-p.total)/p.total:null,periodStart:m.range.start,periodEnd:m.range.end,previousStart:p.range.start,previousEnd:p.range.end,complete:m.coverage.complete};});
   const modelCoverage=coverageFor(range,index,filters,['bd_classe']),modelRows=[],unclassifiedBrandRows=[];
   modelCoverage.groupingDimension='bd_classe';modelCoverage.missingDimensionMonths=modelCoverage.availableMonths.filter(m=>missingClassMonths.has(m));modelCoverage.complete=modelCoverage.complete&&modelCoverage.missingDimensionMonths.length===0;
   const unusable=new Set(['','---','N/A','NULL','UNKNOWN','OLD','OUT PORTFOLIO','NÃO INFORMADO','NÃO CLASSIFICADO','SEM CORRESPONDÊNCIA','BD PENDENTE','SEM CORRESPONDÊNCIA BD','CLASSIFICAÇÃO AMBÍGUA','ANO SEM BD','CÓDIGO DE MODELO INVÁLIDO','CLASSIFICAÇÃO NÃO REVISADA','NÃO CLASSIFICADO NO BD']);
   // The reviewed class already contains BODY TYPE + SEGMENT. Never synthesize it from size or body columns.
   const validSegment=s=>{const parts=String(s??'').split(' / ');return parts.length===2&&parts.every(p=>!unusable.has(p.trim().toUpperCase()));};
   const unclassifiedMarketCount=[...a.segments].filter(([s])=>!validSegment(s)).reduce((n,[,count])=>n+count,0),unclassifiedBrandCount=[...a.models].filter(([key])=>{const [s,brand]=JSON.parse(key);return brand===MITSUBISHI_BRAND&&!validSegment(s);}).reduce((n,[,count])=>n+count,0);
   Object.assign(modelCoverage,{observedMarketCount:a.total,classifiedMarketCount:a.total-unclassifiedMarketCount,unclassifiedMarketCount,observedBrandCount:a.brandTotal,classifiedBrandCount:a.brandTotal-unclassifiedBrandCount,unclassifiedBrandCount,marketClassifiedShare:a.total>0?(a.total-unclassifiedMarketCount)/a.total:null,brandClassifiedShare:a.brandTotal>0?(a.brandTotal-unclassifiedBrandCount)/a.brandTotal:null});
   const selectedSegments=new Set([...a.models].filter(([key,n])=>n>0&&JSON.parse(key)[1]===MITSUBISHI_BRAND).map(([key])=>JSON.parse(key)[0]));
   for(const segment of selectedSegments){
    const members=[...a.models].filter(([key])=>JSON.parse(key)[0]===segment),ranks=competitionRanks(new Map(members)),segmentDenominator=modelCoverage.complete?a.segments.get(segment):null;
    for(const [key,observedCount]of members){const [,brand,model]=JSON.parse(key),r={segment,rawClass:segment,displayLabel:structureDisplayLabel(segment,'bd_classe'),groupingDimension:'bd_classe',brand,model,modelIdentity:brand+' · '+model,count:modelCoverage.complete?observedCount:null,observedCount,segmentDenominator,segmentShare:segmentDenominator>0?observedCount/segmentDenominator:null,rank:modelCoverage.complete?ranks.ranks.get(key)??null:null,highlight:brand===MITSUBISHI_BRAND,periodStart:range.start,periodEnd:range.end,identityConflictCount:a.identityConflicts.get(key)??0,identityWarning:a.identityConflicts.has(key)?'Fabricante Mitsubishi informado; marca BD discordante em '+a.identityConflicts.get(key)+' registro(s)':null,classificationStatus:validSegment(segment)?'Classe BD anual da fonte':'Sem classe BD utilizável'};
     if(validSegment(segment))modelRows.push(r);else if(r.highlight)unclassifiedBrandRows.push({...r,count:a.coverage.complete?observedCount:null,segmentDenominator:null,segmentShare:null,rank:null});
    }
   }
   modelRows.sort((x,y)=>compareText(x.segment,y.segment)||(x.rank??Infinity)-(y.rank??Infinity)||compareText(x.modelIdentity,y.modelIdentity));
   const ufRows=[...a.ufs].map(([uf,market])=>{const n=a.brandUF.get(uf)??0;return {uf,count:a.coverage.complete?n:null,observedCount:n,denominator:a.coverage.complete?market:null,marketShare:a.coverage.complete&&market>0?n/market:null,brandDistributionShare:a.coverage.complete&&a.brandTotal>0?n/a.brandTotal:null,marketDistributionShare:a.coverage.complete&&a.total>0?market/a.total:null,periodStart:range.start,periodEnd:range.end};}).sort((x,y)=>y.observedCount-x.observedCount||compareText(x.uf,y.uf));
   return {type:'mitsubishi',filters,summary,trajectory,rankingRows,displayRanking,modelRows,unclassifiedBrandRows,modelCoverage,peerGroupingDimension:'bd_classe',modelDenominatorScope:'full_filtered_market_within_exact_bd_class',labelMappingVersion:CLASS_LABEL_MAPPING_VERSION,ufRows,range,requestedRange,previousRange,comparisonStatus:status,comparable,complete:a.coverage.complete,coverage:a.coverage,previousCoverage:b.coverage,missingMonths:a.coverage.missingMonths,topN,restrictedCompetitors:['marca','modelo','grupo_modelo'].filter(k=>active(filters[k])),brandPresent:a.brandTotal>0,denominatorScope:'full_filtered_market_before_display_selection'};
  }

  async function manifestCacheIdentity(manifest,base){const bytes=new TextEncoder().encode(JSON.stringify(manifest)),digest=await crypto.subtle.digest('SHA-256',bytes);return new URL(base).href+'|'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
  function createResultCache({maxBytes=8*1024*1024,maxEntries=4}={}){
   const cache=new Map();let bytes=0;
   return {get(key){if(!cache.has(key))return null;const item=cache.get(key);cache.delete(key);cache.set(key,item);return item.value;},set(key,value){const size=new TextEncoder().encode(JSON.stringify(value)).byteLength;if(cache.has(key)){bytes-=cache.get(key).bytes;cache.delete(key);}if(size>maxBytes||maxEntries<1)return;while(cache.size&&(bytes+size>maxBytes||cache.size>=maxEntries)){const first=cache.keys().next().value;bytes-=cache.get(first).bytes;cache.delete(first);}cache.set(key,{value,bytes:size});bytes+=size;},clear(){cache.clear();bytes=0;},stats:()=>({entries:cache.size,logicalBytes:bytes,maxBytes,maxEntries})};
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

  // Preserve the original Explore loader API while sharing the bounded source-aware cache.
  function createCubeLoader(options={}){
   const loader=createMarketCubeLoader(options);
   return {...loader,stats:()=>{const stats=loader.stats();return {...stats,entries:stats.decodedEntries};}};
  }
  // Every analytical/display option (including the entire origin mapping) participates.
  // Object property order is immaterial; array order is preserved because output order can matter.
  function explorationRequestKey(request){
   const {id,manifest,base,...options}=request;
   const encode=value=>{
    if(value===null)return ['null'];const type=typeof value;
    if(type==='object'){
     if(Array.isArray(value))return ['array',value.map(encode)];
     if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('Formato de opção de consulta não suportado.');
     return ['object',Object.keys(value).sort().map(key=>[key,encode(value[key])])];
    }
    if(type==='undefined')return [type];
    if(type==='number')return [type,Number.isFinite(value)?(Object.is(value,-0)?'-0':value):String(value)];
    if(type==='string'||type==='boolean'||type==='bigint')return [type,type==='bigint'?String(value):value];
    throw Error('Formato de opção de consulta não suportado.');
   };
   return JSON.stringify(encode({...options,filters:canonicalFilters({population:options.filters?.population??'light',...(options.filters??{})})}));
  }
  const defaultRunners={explore:runExploration,ranking:runRanking,structure:runStructure,mitsubishi:runMitsubishiBenchmark};
  function installExplorationWorker(port,{loader=createCubeLoader(),resultCache=createResultCache(),identity=manifestCacheIdentity,runners=defaultRunners,yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
   let generation=0,controller=null,namespace=null;
   const clear=()=>{generation++;controller?.abort();controller=null;loader.clear();resultCache.clear();namespace=null;};
   port.onmessage=async({data})=>{
    const token=++generation;controller?.abort();controller=null;
    if(data.type==='clear-cache'){loader.clear();resultCache.clear();namespace=null;return;}
    if(data.type==='cancel'){if(data.releaseCubes)loader.clear();return;}
    const {id,base}=data,runner=Object.hasOwn(runners,data.type)?runners[data.type]:null;
    if(!runner){port.postMessage({id,error:'Tipo de consulta não suportado.'});return;}
    const activeController=new AbortController();controller=activeController;
    const current=()=>generation===token&&!activeController.signal.aborted;
    try{
     const sourceIdentity=await identity(data.manifest,base);if(!current())return;
     if(sourceIdentity!==namespace){loader.setNamespace(sourceIdentity);resultCache.clear();namespace=sourceIdentity;}
     // Hash the complete request to bound key retention even with a large mapping/options object.
     const queryKey=await identity(explorationRequestKey(data),base);if(!current())return;
     const cached=resultCache.get(queryKey);if(cached!==null){port.postMessage({id,result:cached});return;}
     const result=await runner(data,{loadCube:meta=>loader.load(meta,base,activeController.signal),isCancelled:()=>!current(),onProgress:progress=>{if(current())port.postMessage({id,progress});},yieldControl});
     if(current()){resultCache.set(queryKey,result);port.postMessage({id,result});}
    }catch(error){if(current()&&error.name!=='AbortError')port.postMessage({id,error:error.message||String(error)||'Não foi possível concluir a consulta.'});}
    finally{if(generation===token)controller=null;}
   };
   return {clear,cacheStats:()=>{const cubes=loader.stats();return {...cubes,cubes,results:resultCache.stats()};}};
  }
  if(typeof self!=='undefined'&&typeof self.postMessage==='function')installExplorationWorker(self);

})();
