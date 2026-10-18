const ANIMATIONS_WORKER_SOURCE=/*@string ./workers/performance-cache.js + ./modules/animations-data.js + ./modules/animations-worker.js*/;
/*@include ./modules/animations-data.js*/
/* Animation views consume reviewed monthly/YTD frames. No chart fabricates source data.
 * Exports are deliberately dependency-free until a React component is rendered. */
const ANIMATION_TECH_ORDER = ['ICE','HEV','PHEV','BEV','MHEV'];
const ANIMATION_MIX_FIELDS = {technology:'propulsao',body:'bd_carroceria',porte:'bd_segmento',channel:'tipo_venda',vehicleOrigin:'bd_origem'};
const ANIMATION_MIX_LABELS = {technology:'Tecnologia de propulsão',body:'Carroceria',porte:'Porte / segmento BD',origin:'Origem da marca · chinesa ou outras',channel:'Canal de venda',vehicleOrigin:'Origem do veículo · IMP / LOCAL'};
const ANIMATION_COLORS = ['#287dcc','#ad6f00','#008f82','#8b5bd6','#d85899','#718a00','#b4673c','#168caf','#7270d4','#a947ba','#38867b','#926d23'];
function animationFinite(value){return typeof value==='number'&&Number.isFinite(value);}
function animationNumber(value){return animationFinite(value)?value.toLocaleString('pt-BR',{maximumFractionDigits:3}):'N/D';}
function animationPercent(value,digits=2){return animationFinite(value)?(value*100).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits})+'%':'N/D';}
function animationExactPercent(value){return animationFinite(value)?(value*100).toLocaleString('pt-BR',{maximumFractionDigits:12})+'%':'N/D';}
function animationSigned(value,digits=2){return animationFinite(value)?(value>0?'+':'')+animationPercent(value,digits):'N/D';}
function animationCompareNames(a,b){return String(a).localeCompare(String(b),'pt-BR',{sensitivity:'base'})||String(a).localeCompare(String(b),'pt-BR');}
function animationFrame(frames,frame){return frame&&typeof frame==='object'?frame:(frames??[])[Math.max(0,Math.min((frames??[]).length-1,Number(frame)||0))]??null;}
function animationFrameIndex(frames,frame){if(frame&&typeof frame==='object'){const i=(frames??[]).findIndex(f=>f===frame||f.month===frame.month);return i<0?0:i;}return Math.max(0,Math.min((frames??[]).length-1,Number(frame)||0));}
function animationMonth(frame){if(frame?.granularity&&frame.label)return frame.granularity==='year'?(frame.periodLabel??frame.label):frame.label;const m=String(frame?.month??frame?.date??'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(m))return 'Período indisponível';return m.slice(5)+'/'+m.slice(0,4);}
function animationPeriod(frame,ytd){if(frame?.granularity==='day')return 'Diário · 7 dias até '+frame.label;if(frame?.granularity==='year')return (frame.periodLabel??frame.label)+' · acumulado';return (ytd||frame?.mode==='ytd'?'Acumulado no ano até ':'Mensal · ')+animationMonth(frame);}
function animationComplete(frame){return Boolean(frame)&&frame.complete!==false&&animationFinite(frame.total);}
function animationCoverage(frame){if(!frame)return 'Sem quadro disponível';return ({complete:'Cobertura completa',partial:'Cobertura parcial · valores indisponíveis',missing:'Mês ausente · valores indisponíveis',unavailable:'Cobertura indisponível','incomplete-ytd':'Acumulado incompleto · falta cobertura desde janeiro','scope-changed':'Universo de cobertura mudou · valores indisponíveis'})[frame.coverageStatus]||frame.coverageStatus||(animationComplete(frame)?'Cobertura completa':'Cobertura incompleta · valores indisponíveis');}
function animationBrands(row){return Array.isArray(row?.brands)?row.brands.map(b=>String(typeof b==='string'?b:b.name??b.brand)):Object.entries(row?.brands??{}).filter(([,count])=>count>0).map(([brand])=>brand);}
function animationHasMIT(row){return Boolean(row&&(String(row.name).toUpperCase()==='MITSUBISHI'||row.isMIT||row.mitCount>0||animationBrands(row).some(b=>b.toUpperCase()==='MITSUBISHI')));}
function animationExclusiveMIT(row){if(!row)return false;if(String(row.name).toUpperCase()==='MITSUBISHI')return true;if(row.count>0&&row.mitCount===row.count)return true;const brands=animationBrands(row);return brands.length===1&&brands[0].toUpperCase()==='MITSUBISHI';}
function animationEntityColor(name,row){
 if(animationExclusiveMIT(row)||String(name).toUpperCase()==='MITSUBISHI')return 'var(--mitsubishi-color, #ed1c24)';
 const tech={ICE:'#677a94',HEV:'#23896b',PHEV:'#7d60b9',BEV:'#2389c0',MHEV:'#b68025'};if(tech[name])return tech[name];
 if(/não informado|não classificado|sem correspondência|desconhecid|indisponível/i.test(String(name)))return 'var(--secondary, #7b8492)';
 if(typeof brandColor==='function')return brandColor(name);
 let hash=2166136261;for(const c of String(name))hash=Math.imul(hash^c.codePointAt(0),16777619)>>>0;
 return ANIMATION_COLORS[hash%ANIMATION_COLORS.length];
}
function animationDimensionRows(frame,dimension='marca'){
 const source=frame?.groups?.[dimension]??(frame?.dimension===dimension?frame.entities:[])??[];
 return source.map(row=>({...row,name:String(row.name??''),count:animationComplete(frame)&&animationFinite(row.count)?row.count:null,mitCount:animationComplete(frame)&&animationFinite(row.mitCount)?row.mitCount:null,share:animationComplete(frame)?(animationFinite(row.share)?row.share:animationFinite(row.marketShare)?row.marketShare:frame.total>0&&animationFinite(row.count)?row.count/frame.total:null):null}));
}
function animationRankRows(frame,dimension='marca',options={}){
 const metric=options.metric??'count',topN=Math.max(1,Math.floor(Number(options.topN)||10));
 const all=animationDimensionRows(frame,dimension).map(r=>({...r,value:metric==='mitCount'?(animationComplete(frame)&&animationFinite(r.mitCount)?r.mitCount:null):metric==='share'?r.share:r.count})).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity)||animationCompareNames(a.name,b.name));
 let last=null,rank=0;all.forEach((row,i)=>{if(row.value!==last||i===0)rank=i+1;row.rank=row.value==null?null:rank;last=row.value;row.pinned=false;row.inTopN=i<topN;});
 const display=all.filter((row,i)=>row.value!==null&&(i<topN||(options.pinMIT&&dimension!=='uf'&&animationHasMIT(row)))).map(row=>({...row,pinned:!row.inTopN}));
 return {all,display,topN,excluded:Math.max(0,all.length-display.length),pinned:display.filter(r=>r.pinned),metric};
}
function animationRacePool(frames,dimension,options={}){
 const map=new Map();let slots=0,max=0;
 for(const frame of frames??[]){const ranked=animationRankRows(frame,dimension,options);slots=Math.max(slots,ranked.display.length);for(const r of ranked.display){map.set(r.name,r);max=Math.max(max,r.value??0);}}
 return {rows:[...map.values()].sort((a,b)=>animationCompareNames(a.name,b.name)),slots:Math.max(1,slots),max:max||1};
}
function animationBubbleRows(frame,dimension='marca'){
 return animationDimensionRows(frame,dimension).map(row=>{
  const prior=animationFinite(row.priorCount)?row.priorCount:null;
  // Missing and zero comparison bases are distinct from zero growth.
  const yoy=animationComplete(frame)&&row.count!==null&&prior>0?(row.count/prior-1):null;
  return {...row,priorCount:prior,yoy,x:row.share,y:yoy,radiusValue:row.count,yoyStatus:({comparable:'Comparável','zero-base':'Base anterior zero',unavailable:'Base anterior indisponível'})[row.yoyStatus]||row.yoyStatus||(yoy!==null?'Comparável':prior===0?'Base anterior zero':'Base anterior indisponível')};
 });
}
function animationBubbleScales(frames,dimension='marca'){
 let maxShare=.01,maxCount=1;const growth=[];
 for(const frame of frames??[])for(const row of animationBubbleRows(frame,dimension)){maxCount=Math.max(maxCount,row.count??0);if(animationFinite(row.x)&&animationFinite(row.y)){maxShare=Math.max(maxShare,row.x);growth.push(row.y*100);}}
 // Robust vertical range: a handful of tiny-base outliers (e.g. +97.150%) must not flatten everyone else.
 const range=typeof chartRobustRange==='function'?chartRobustRange(growth):{lo:growth.reduce((m,v)=>Math.min(m,v),-10),hi:growth.reduce((m,v)=>Math.max(m,v),10),step:10,over:0};
 return {x:[0,Math.min(1,Math.max(.05,Math.ceil(maxShare*1.12*20)/20))],y:[Math.max(-1,range.lo/100),range.hi/100],maxCount,over:range.over};
}
function animationBubbleLabels(rows,scales){
 const items=rows.map(r=>({row:r,p:animationBubblePoint(r,scales)})).filter(d=>d.p).sort((a,b)=>(/mitsubishi/i.test(b.row.name)-/mitsubishi/i.test(a.row.name))||(b.row.count-a.row.count));
 const cand=items.map(({row,p})=>{const name=row.name.length>20?row.name.slice(0,18)+'…':row.name,pinned=p.clamp?(p.clamp>0?'▲ ':'▼ ')+name+' '+animationSigned(row.y,0):name;return {x:p.x,y:p.y,r:p.r,text:pinned,key:row.name,force:/mitsubishi/i.test(row.name)||p.clamp!==0};});
 const out=typeof chartPlaceLabels==='function'?chartPlaceLabels(cand,{charWidth:6,height:12,bounds:{x0:20,y0:48,x1:940,y1:480}}):cand.map(c=>({...c,lx:c.x,ly:c.y-c.r-8,anchor:'middle'}));
 return new Map(out.map(o=>[o.key,o]));
}
function animationBubblePoint(row,scales){if(!animationFinite(row?.x)||!animationFinite(row?.y)||!animationFinite(row?.count))return null;const f=(row.y-scales.y[0])/(scales.y[1]-scales.y[0]),clamp=f>1?1:f<0?-1:0,fy=Math.min(1,Math.max(0,f)),x=100+row.x/scales.x[1]*760,y=440-fy*350;return {x,y,r:44*Math.sqrt(Math.max(0,row.count)/scales.maxCount),clamp};}
function animationTrail(frames,index,name,dimension,scales){
 const points=(frames??[]).slice(Math.max(0,index-5),index+1).map(frame=>animationBubblePoint(animationBubbleRows(frame,dimension).find(r=>r.name===name),scales));
 const segments=[];let segment=[];for(const p of points){if(p)segment.push(p);else{if(segment.length>1)segments.push(segment);segment=[];}}if(segment.length>1)segments.push(segment);
 return segments.map(points=>points.map((p,i)=>(i?'L':'M')+p.x.toFixed(3)+' '+p.y.toFixed(3)).join(' '));
}
function animationMixSource(frame,kind){if(kind==='origin')return frame?.mixes?.origin??frame?.originRows??[];return frame?.mixes?.[kind]??frame?.groups?.[ANIMATION_MIX_FIELDS[kind]]??[];}
function animationMixRows(frame,kind='technology'){
 const complete=animationComplete(frame),source=animationMixSource(frame,kind),map=new Map();
 for(const row of source){const name=String(row.name??'Não informado');const previous=map.get(name);map.set(name,{...row,name,count:complete&&animationFinite(row.count)?(previous?.count??0)+row.count:null});}
 if(kind==='technology'&&source.length)for(const name of ANIMATION_TECH_ORDER)if(!map.has(name))map.set(name,{name,count:complete?0:null});
 // Unknown categories remain explicit; absent classification is never inferred.
 if(complete&&source.length&&source.every(r=>animationFinite(r.count))){const known=[...map.values()].reduce((s,r)=>s+(r.count??0),0);if(frame.total>known)map.set('Não informado · residual',{name:'Não informado · residual',count:frame.total-known});}
 return [...map.values()].map(r=>({...r,share:complete&&frame.total>0&&r.count!==null?r.count/frame.total:null,denominator:complete?frame.total:null,kind}));
}
function animationMixOrder(frames,kind){const totals=new Map();for(const frame of frames??[])for(const row of animationMixRows(frame,kind))totals.set(row.name,(totals.get(row.name)??0)+(row.count??0));return [...totals.keys()].sort((a,b)=>kind==='technology'&&(ANIMATION_TECH_ORDER.includes(a)||ANIMATION_TECH_ORDER.includes(b))?(ANIMATION_TECH_ORDER.indexOf(a)<0?99:ANIMATION_TECH_ORDER.indexOf(a))-(ANIMATION_TECH_ORDER.indexOf(b)<0?99:ANIMATION_TECH_ORDER.indexOf(b)):(totals.get(b)-totals.get(a)||animationCompareNames(a,b)));}
function animationLeadershipRows(frames,dimension='marca',metric='count'){
 return (frames??[]).map((frame,index)=>{
  const ranked=animationRankRows(frame,dimension,{topN:2,metric}).all.filter(r=>r.value!==null&&r.value>0),first=ranked[0],second=ranked[1],leaders=first?ranked.filter(r=>r.value===first.value).map(r=>r.name):[];
  return {index,month:frame.month??String(frame.date??'').slice(0,7),coverage:animationCoverage(frame),complete:animationComplete(frame),leader:first?.name??null,leaderCount:first?.value??null,runnerUp:second?.name??null,runnerCount:second?.value??null,leaders,tie:leaders.length>1,margin:first&&second?first.value-second.value:null,marginPP:first&&second&&frame.total>0?(first.value-second.value)/frame.total*100:null,total:frame.total,leaderRow:first??null};
 });
}
function animationChartRows({view='race',frames=[],frame=0,dimension='marca',topN=10,pinMIT=false,metric='count',kind='technology'}={}){
 if(view==='leadership')return animationLeadershipRows(frames,dimension,metric).map(({leaderRow,...row})=>row);
 const current=animationFrame(frames,frame),meta={month:current?.month??'',mode:current?.mode??'monthly',coverage:animationCoverage(current),denominator:animationComplete(current)?current.total:null};
 if(view==='mix')return animationMixRows(current,kind).map(row=>({...meta,...row}));
 if(view==='bubbles'||view==='bubble')return animationBubbleRows(current,dimension).map(row=>({...meta,...row}));
 const ranked=animationRankRows(current,dimension,{topN,pinMIT,metric}),display=new Map(ranked.display.map(r=>[r.name,r]));
 return ranked.all.map(row=>({...meta,...row,displayed:display.has(row.name),pinned:display.get(row.name)?.pinned??false}));
}
function AnimationChartTable({rows,columns,caption}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,[open,setOpen]=React.useState(false);
 return hs('details',{className:'ac-exact-table',onToggle:event=>setOpen(event.currentTarget.open),children:[h('summary',{children:'Ver tabela completa · '+rows.length+' linhas'}),open&&h('div',{className:'ac-table-scroll',tabIndex:0,'aria-label':caption,children:hs('table',{children:[h('caption',{children:caption}),h('thead',{children:h('tr',{children:columns.map(c=>h('th',{scope:'col',children:c.label},c.key))})}),h('tbody',{children:rows.map((row,i)=>h('tr',{children:columns.map((c,k)=>h(k===0?'th':'td',{scope:k===0?'row':undefined,children:c.format?c.format(row[c.key],row):(row[c.key]??'N/D')},c.key))},String(row.name??row.month??i)+'|'+i))})]})})]});
}
function AnimationFrameMeta({frame,ytd}){const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;return hs('div',{className:'ac-frame-meta',children:[h('strong',{children:animationPeriod(frame,ytd)}),h('span',{className:animationComplete(frame)?'ac-coverage':'ac-coverage ac-warning',children:animationCoverage(frame)}),h('span',{children:'Universo: '+animationNumber(animationComplete(frame)?frame.total:null)+' emplacamentos'})]});}
function AnimationRace({frames=[],frame=0,dimension='marca',topN=10,pinMIT=false,ytd=false,metric='count'}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,current=animationFrame(frames,frame),options={topN,pinMIT,metric},ranked=animationRankRows(current,dimension,options),pool=React.useMemo(()=>animationRacePool(frames,dimension,options),[frames,dimension,topN,pinMIT,metric]),lookup=new Map(ranked.display.map((r,i)=>[r.name,{...r,slot:i}])),height=pool.slots*52;
 const unit=metric==='share'?'Participação no universo (%)':metric==='mitCount'?'Emplacamentos Mitsubishi por UF':'Emplacamentos (unidades)',format=v=>metric==='share'?animationPercent(v):animationNumber(v),tableRows=animationChartRows({view:'race',frames,frame,dimension,topN,pinMIT,metric});
 return hs('section',{className:'ac-chart ac-race','aria-label':'Corrida do ranking',children:[h(AnimationFrameMeta,{frame:current,ytd}),hs('div',{className:'ac-axis-note',children:[h('span',{children:unit}),h('span',{children:'Escala fixa na janela · máximo '+format(pool.max)})]}),!animationComplete(current)?h('p',{className:'ac-empty',role:'status',children:'Este quadro não tem cobertura completa. O ranking permanece indisponível; ausência não significa zero.'}):!ranked.display.length?h('p',{className:'ac-empty',role:'status',children:'Nenhuma entidade com volume disponível neste recorte.'}):null,h('div',{className:'ac-chart-scroll',children:h('div',{className:'ac-race-canvas',style:{height},role:'img','aria-label':animationPeriod(current,ytd)+'. '+ranked.display.map(r=>r.rank+'º '+r.name+': '+format(r.value)).join('; '),children:pool.rows.map(base=>{const r=lookup.get(base.name),visible=Boolean(r),row=r??base,width=visible?Math.max(0,row.value)/pool.max*100:0;return hs('div',{className:'ac-race-row'+(r?.pinned?' ac-pinned':''),'aria-hidden':true,'data-entity':base.name,'data-rank':r?.rank,'data-pinned':Boolean(r?.pinned),style:{transform:'translateY('+((r?.slot??pool.slots)*52)+'px)',opacity:visible?1:0,pointerEvents:visible?'auto':'none'},children:[hs('div',{className:'ac-race-name',title:row.name,children:[h('span',{className:'ac-rank',children:r?.rank!=null?r.rank+'º':'—'}),h('span',{children:row.name}),r?.pinned&&h('small',{children:'MIT fixada'})]}),h('div',{className:'ac-race-track',children:h('div',{className:'ac-race-bar',style:{width:width+'%',background:animationEntityColor(row.name,row)},children:animationHasMIT(row)&&!animationExclusiveMIT(row)&&h('i',{className:'ac-mit-marker',title:'Inclui Mitsubishi; composição exata na tabela'})})}),hs('div',{className:'ac-race-value',children:[h('strong',{children:format(r?.value)}),h('small',{children:metric==='mitCount'?'MIT / UF: '+animationPercent(r?.count>0?r.mitCount/r.count:null):animationPercent(r?.share)})]})]},base.name);})})}),jsxRuntime.jsx(HxMethod,{children:['Top ',ranked.topN,' por ',metric==='mitCount'?'volume Mitsubishi':'volume',': ',ranked.display.filter(r=>!r.pinned).length,' entidades',ranked.pinned.length?' + '+ranked.pinned.length+' Mitsubishi fora do Top '+ranked.topN+' fixada(s)':'', '. ',ranked.excluded,' entidades não exibidas no gráfico. O denominador inclui todo o universo. Empates compartilham posição; a ordem alfabética desempata somente a exibição.']}),h(AnimationChartTable,{rows:tableRows,caption:'Ranking completo · '+animationPeriod(current,ytd)+' · unidades e participação do universo',columns:[{key:'name',label:'Entidade'},{key:'rank',label:'Posição'},{key:'count',label:'Volume',format:animationNumber},{key:'share',label:'Participação',format:animationExactPercent},{key:'mitCount',label:'Volume Mitsubishi',format:animationNumber},{key:'denominator',label:'Denominador',format:animationNumber},{key:'displayed',label:'No gráfico',format:(v,r)=>v?(r.pinned?'Sim · MIT fora do Top N':'Sim'):'Não'}]})]});
}
function AnimationBubbles({frames=[],frame=0,dimension='marca',topN=10,trail=false}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,index=animationFrameIndex(frames,frame),current=animationFrame(frames,frame),all=animationBubbleRows(current,dimension),ranked=animationRankRows(current,dimension,{topN}),selectedNames=new Set(ranked.display.map(r=>r.name)),selected=all.filter(r=>selectedNames.has(r.name)),scales=React.useMemo(()=>animationBubbleScales(frames,dimension),[frames,dimension]),pool=React.useMemo(()=>animationRacePool(frames,dimension,{topN}),[frames,dimension,topN]),lookup=new Map(all.map(r=>[r.name,r])),placed=animationBubbleLabels(selected,scales),omitted=selected.filter(r=>!animationBubblePoint(r,scales)),ticks=Array.from({length:5},(_,i)=>i/4),tableRows=animationChartRows({view:'bubbles',frames,frame,dimension});
 return hs('section',{className:'ac-chart ac-bubbles','aria-label':'Bolhas de participação e crescimento anual','data-export-root':'','data-export-title':'Participação × crescimento · '+animationPeriod(current),children:[h(AnimationFrameMeta,{frame:current}),typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'bolhas-'+String(current?.month??'')}),h('p',{className:'ac-axis-note',children:'X: participação no universo · Y: variação anual (YoY) · área da bolha: volume em unidades. Eixos e área mantêm a mesma escala em toda a janela; ▲ marca bolhas acima da escala (valor real no rótulo).'}),h('div',{className:'ac-chart-scroll',children:hs('svg',{className:'ac-bubble-svg',viewBox:'0 0 960 540',role:'img','aria-label':'Participação no eixo horizontal, variação anual no eixo vertical e área proporcional ao volume. Consulte a tabela completa.',children:[h('title',{children:'Participação × crescimento anual · '+animationMonth(current)}),h('desc',{children:'Bolhas sem base anterior comparável não são desenhadas. Trilhas interrompem em lacunas e mostram no máximo seis meses.'}),...ticks.map(t=>{const x=100+t*760;return hs('g',{children:[h('line',{x1:x,x2:x,y1:90,y2:440,className:'ac-grid'}),h('text',{x,y:467,textAnchor:'middle',children:animationPercent(t*scales.x[1],1)})]},'x'+t);}),...ticks.map(t=>{const value=scales.y[0]+t*(scales.y[1]-scales.y[0]),y=440-t*350;return hs('g',{children:[h('line',{x1:100,x2:860,y1:y,y2:y,className:'ac-grid'}),h('text',{x:85,y:y+4,textAnchor:'end',children:animationSigned(value,1)})]},'y'+t);}),h('text',{x:480,y:506,textAnchor:'middle',className:'ac-axis-title',children:'Participação no universo (%)'}),h('text',{x:100,y:28,className:'ac-axis-title',children:'Variação anual de volume (%)'}),scales.y[0]<=0&&scales.y[1]>=0&&h('line',{x1:100,x2:860,y1:440-(0-scales.y[0])/(scales.y[1]-scales.y[0])*350,y2:440-(0-scales.y[0])/(scales.y[1]-scales.y[0])*350,className:'ac-zero'}),trail&&pool.rows.filter(r=>selectedNames.has(r.name)).flatMap(row=>animationTrail(frames,index,row.name,dimension,scales).map((d,k)=>h('path',{d,fill:'none',stroke:animationEntityColor(row.name,row),strokeWidth:2,strokeOpacity:.45,className:'ac-trail'},row.name+'|'+k))),...pool.rows.map(base=>{const row=lookup.get(base.name),p=selectedNames.has(base.name)?animationBubblePoint(row,scales):null,lab=p?placed.get(base.name):null;return hs('g',{className:'ac-bubble-entity',style:{transform:'translate('+(p?.x??100)+'px,'+(p?.y??440)+'px)',opacity:p?1:0},'data-entity':base.name,'aria-hidden':p?undefined:true,children:[h('circle',{r:p?.r??0,style:{r:(p?.r??0)+'px'},fill:animationEntityColor(base.name,row??base),fillOpacity:.68,stroke:animationEntityColor(base.name,row??base),strokeWidth:2,tabIndex:p?0:-1,role:'img','aria-label':base.name+': volume '+animationNumber(row?.count)+', participação '+animationPercent(row?.share)+', YoY '+animationSigned(row?.yoy),children:h('title',{children:base.name+'\nVolume: '+animationNumber(row?.count)+'\nParticipação: '+animationExactPercent(row?.share)+'\nAno anterior: '+animationNumber(row?.priorCount)+'\nYoY: '+animationExactPercent(row?.yoy)})}),h('text',{x:lab?lab.lx-p.x:0,y:lab?lab.ly-p.y:-(p?.r??0)-8,textAnchor:lab?.anchor??'middle',className:'ac-bubble-label',style:{opacity:p&&lab?1:0},children:lab?.text??''})]},base.name);}),h('text',{x:860,y:28,textAnchor:'end',children:'Bolha máxima: '+animationNumber(scales.maxCount)+' unidades'})]})}),jsxRuntime.jsx(HxMethod,{children:'Top '+ranked.topN+' por volume. '+(selected.length-omitted.length)+' bolhas desenhadas; '+omitted.length+' entidade(s) do Top sem YoY comparável. Base anterior ausente ou zero gera N/D. '+(trail?'Trilha: últimos seis meses, incluindo o atual; lacunas interrompem o traço.':'Trilha desativada.')}),h(AnimationChartTable,{rows:tableRows,caption:'Todas as entidades · '+animationPeriod(current)+' · valores do quadro, sem interpolação',columns:[{key:'name',label:'Entidade'},{key:'count',label:'Volume',format:animationNumber},{key:'share',label:'Participação',format:animationExactPercent},{key:'priorCount',label:'Mesmo período anterior',format:animationNumber},{key:'yoy',label:'YoY',format:animationExactPercent},{key:'yoyStatus',label:'Comparabilidade'},{key:'denominator',label:'Denominador',format:animationNumber}]})]});
}
function AnimationMix({frames=[],frame=0,kind='technology'}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,current=animationFrame(frames,frame),rows=animationMixRows(current,kind),order=React.useMemo(()=>animationMixOrder(frames,kind),[frames,kind]),lookup=new Map(rows.map(r=>[r.name,r])),tableRows=animationChartRows({view:'mix',frames,frame,kind});
 const method=kind==='origin'?'Origem da marca usa correspondências documentadas e válidas para o ano do quadro. Marcas sem classificação verificável ficam explícitas; origem chinesa não significa veículo importado.':kind==='vehicleOrigin'?'IMP / LOCAL descreve a origem do veículo na base BD. Esta classificação é independente do país de origem da marca.':kind==='channel'?'VAREJO, VD e Não informado permanecem no denominador. Cobertura do canal não é inferida a partir de outro período.':kind==='technology'?'ICE, HEV, PHEV, BEV e MHEV são categorias distintas. Não classificados continuam no total.':'Categorias originais do BD; sem correspondência e não classificados permanecem no total.';
 return hs('section',{className:'ac-chart ac-mix','aria-label':ANIMATION_MIX_LABELS[kind]??kind,children:[h(AnimationFrameMeta,{frame:current}),h('h3',{className:'ac-chart-title',children:ANIMATION_MIX_LABELS[kind]??kind}),h('p',{className:'ac-axis-note',children:'Participação no universo (%) · barra completa = 100% · volumes em unidades'}),!rows.length?h('p',{className:'ac-empty',role:'status',children:animationComplete(current)&&current.total===0?'Nenhum emplacamento neste recorte. Participação indisponível sem denominador positivo.':'Classificação indisponível neste quadro. Nenhuma origem ou categoria foi inferida.'}):!animationComplete(current)?h('p',{className:'ac-empty',role:'status',children:'Cobertura incompleta. Composição e volumes indisponíveis neste quadro.'}):null,h('div',{className:'ac-mix-stack',role:'img','aria-label':rows.map(r=>r.name+': '+animationPercent(r.share)).join('; ')||'Sem composição disponível',children:order.map(name=>{const row=lookup.get(name);return h('div',{className:'ac-mix-segment',style:{width:Math.max(0,row?.share??0)*100+'%',background:animationEntityColor(name)},title:name+': '+animationNumber(row?.count)+' · '+animationExactPercent(row?.share),children:row?.share>=.08?h('span',{children:animationPercent(row.share,1)}):null},name);})}),h('div',{className:'ac-chart-scroll',children:h('div',{className:'ac-mix-bars',children:order.map(name=>{const row=lookup.get(name),share=row?.share??(animationComplete(current)&&rows.length?0:null);return hs('div',{className:'ac-mix-row',children:[h('span',{className:'ac-mix-name',title:name,children:name}),h('div',{className:'ac-mix-track',children:h('i',{style:{width:Math.max(0,share??0)*100+'%',background:animationEntityColor(name)}})}),hs('span',{className:'ac-mix-value',children:[h('strong',{children:animationPercent(share)}),h('small',{children:animationNumber(row?.count??(share===0?0:null))+' un.'})]})]},name);})})}),jsxRuntime.jsx(HxMethod,{children:method}),kind==='channel'&&current?.channelCoverage&&jsxRuntime.jsx(HxMethod,{children:'Cobertura informada do canal: '+(typeof current.channelCoverage==='string'?current.channelCoverage:animationNumber(current.channelCoverage.knownCount??current.channelCoverage.informedCount)+' com canal · '+animationNumber(current.channelCoverage.unknownCount)+' não informado')}),h(AnimationChartTable,{rows:tableRows,caption:(ANIMATION_MIX_LABELS[kind]??kind)+' · '+animationPeriod(current),columns:[{key:'name',label:'Categoria'},{key:'count',label:'Volume',format:animationNumber},{key:'share',label:'Participação',format:animationExactPercent},{key:'denominator',label:'Denominador',format:animationNumber}]})]});
}
function AnimationLeadership({frames=[],frame=0,dimension='marca',metric='count',onSelect}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,current=animationFrame(frames,frame),index=animationFrameIndex(frames,frame),rows=React.useMemo(()=>animationLeadershipRows(frames,dimension,metric),[frames,dimension,metric]),active=rows[index],leaderText=active?.tie?active.leaders.join(' / '):active?.leader??'Indisponível';
 return hs('section',{className:'ac-chart ac-leadership','aria-label':'Liderança ao longo dos meses',children:[h(AnimationFrameMeta,{frame:current}),h('p',{className:'ac-axis-note',children:(metric==='mitCount'?'Liderança por emplacamentos Mitsubishi nas UFs. ':'')+'Cada coluna representa um '+(frames?.[0]?.granularity==='day'?'dia':frames?.[0]?.granularity==='year'?'ano':'mês')+'; clique para ver o quadro.'}),h('div',{className:'ac-leadership-scroll',children:h('div',{className:'ac-leadership-ribbon',children:rows.map((row,i)=>hs('button',{type:'button',className:'ac-leadership-month'+(row.tie?' ac-tied':''),'aria-current':i===index?'true':undefined,onClick:()=>onSelect?.(i),'aria-label':animationMonth(frames[i])+': '+(row.tie?'Empate entre '+row.leaders.join(', '):row.leader??'Sem dados'),style:{'--leader-color':row.leader?animationEntityColor(row.leader,row.leaderRow):'var(--secondary)'},children:[h('span',{children:animationMonth(frames[i])}),h('i',{'aria-hidden':true}),h('strong',{title:row.leaders.join(' / '),children:row.tie?'EMPATE':row.leader??'N/D'}),h('small',{children:row.tie?row.leaders.length+' líderes':animationNumber(row.leaderCount)+' un.'})]},row.month+'|'+i))})}),hs('div',{className:'ac-leadership-detail',children:[hs('div',{children:[h('span',{children:active?.tie?'Liderança empatada':'Líder'}),h('strong',{children:leaderText}),h('small',{children:animationNumber(active?.leaderCount)+' emplacamentos por líder'})]}),hs('div',{children:[h('span',{children:active?.tie?'Outra entidade empatada':'Segundo colocado'}),h('strong',{children:active?.runnerUp??'Indisponível'}),h('small',{children:animationNumber(active?.runnerCount)+' emplacamentos'})]}),hs('div',{children:[h('span',{children:'Margem de liderança'}),h('strong',{children:animationNumber(active?.margin)+' unidades'}),h('small',{children:animationFinite(active?.marginPP)?active.marginPP.toLocaleString('pt-BR',{maximumFractionDigits:6})+' p.p. do universo':'N/D'})]})]}),jsxRuntime.jsx(HxMethod,{children:'Líder e segundo são ordenados por volume. Empate no primeiro lugar mantém todos os líderes, margem zero e ordem alfabética apenas para apresentação. Cobertura incompleta ou ausência de segundo colocado gera N/D.'}),h(AnimationChartTable,{rows,caption:'Liderança e margem exata em cada mês',columns:[{key:'month',label:'Mês'},{key:'leaders',label:'Líder(es)',format:v=>v.length?v.join(' / '):'N/D'},{key:'leaderCount',label:'Volume do líder',format:animationNumber},{key:'runnerUp',label:'Segundo colocado'},{key:'runnerCount',label:'Volume do segundo',format:animationNumber},{key:'margin',label:'Margem (un.)',format:animationNumber},{key:'marginPP',label:'Margem (p.p.)',format:v=>animationFinite(v)?v.toLocaleString('pt-BR',{maximumFractionDigits:12}):'N/D'},{key:'coverage',label:'Cobertura'}]})]});
}
const AnimationCharts={AnimationRace,AnimationBubbles,AnimationMix,AnimationLeadership,animationChartRows,animationRankRows,animationRacePool,animationBubbleRows,animationBubbleScales,animationBubblePoint,animationTrail,animationMixRows,animationMixOrder,animationLeadershipRows,animationEntityColor,animationFrame,animationComplete};
if(typeof globalThis!=='undefined')globalThis.AnimationCharts=AnimationCharts;
if(typeof module!=='undefined'&&module.exports)module.exports=AnimationCharts;

// Monthly/YTD playback maps. Data is never interpolated or carried forward.
// Depends on catalog-maps.js, the bundled IBGE value$3 and MarketTable.
const ANIMATION_MAP_TECHNOLOGIES = Object.freeze(['BEV','PHEV','HEV','MHEV']);
const ANIMATION_MAP_TECHNOLOGY_LABELS = Object.freeze({BEV:'BEV · elétricos a bateria',PHEV:'PHEV · híbridos plug-in',HEV:'HEV · híbridos',MHEV:'MHEV · híbridos leves',ALL_ELECTRIFIED:'Eletrificados · BEV + PHEV + HEV + MHEV'});
const animationMapNumber = value => Number.isFinite(value) ? value.toLocaleString('pt-BR',{maximumFractionDigits:0}) : '—';
const animationMapPercent = value => Number.isFinite(value) ? (value*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—';
const animationMapNonnegative = value => Number.isFinite(value)&&value>=0 ? value : null;
function animationMapTechnology(value){
 const key=String(value??'ALL_ELECTRIFIED').trim().toUpperCase().replace(/[ -]/g,'_');
 return ['ALL','ELECTRIFIED','ALL_ELECTRIC','ALLELECTRIC','ALL_ELECTRIFIED','TODOS','ELETRIFICADOS'].includes(key)?'ALL_ELECTRIFIED':ANIMATION_MAP_TECHNOLOGIES.includes(key)?key:null;
}
function animationMapMetric(value){
 const key=String(value??'mitShare');
 return ['municipalVolume','municipality','municipal','municipal-volume','concentration','volume','count'].includes(key)?'municipalVolume':['electrification','electrifiedShare','electric','technology','technologyShare'].includes(key)?'electrification':'mitShare';
}
function animationMapFrameList(input){return Array.isArray(input)?input:Array.isArray(input?.frames)?input.frames:[];}
function animationMapCurrentFrame(input,selection){
 const frames=animationMapFrameList(input);
 if(selection&&typeof selection==='object')return selection;
 if(typeof selection==='string')return frames.find(f=>f.month===selection||f.date===selection)||null;
 const index=selection==null?0:Number(selection);
 return Number.isInteger(index)&&index>=0&&index<frames.length?frames[index]:null;
}
function animationBrandLabel(brand){return typeof tbmName==='function'?tbmName(brand):String(brand).charAt(0)+String(brand).slice(1).toLowerCase();}
function animationMapTechnologyCount(row,technology){
 if(!technology||!row?.technologyCounts||typeof row.technologyCounts!=='object')return null;
 const keys=technology==='ALL_ELECTRIFIED'?ANIMATION_MAP_TECHNOLOGIES:[technology];
 const values=keys.map(key=>Object.hasOwn(row.technologyCounts,key)?animationMapNonnegative(row.technologyCounts[key]):0);
 return values.every(value=>value!==null)?values.reduce((sum,value)=>sum+value,0):null;
}
function animationMapStandardRow(raw,frame,technology){
 const complete=frame?.complete===true&&raw?.complete!==false&&raw?.coverageComplete!==false;
 const rawCount=Object.hasOwn(raw,'count')?raw.count:Object.hasOwn(raw,'total')?raw.total:raw.marketCount;
 const count=complete?animationMapNonnegative(rawCount):null;
 const marketCount=complete?animationMapNonnegative(Object.hasOwn(raw,'marketCount')?raw.marketCount:rawCount):null;
 const mitCount=complete?animationMapNonnegative(raw.mitCount):null;
 const technologyCount=complete&&frame?.technologyAvailable!==false?animationMapTechnologyCount(raw,technology):null;
 const unclassifiedCount=complete?animationMapNonnegative(Object.hasOwn(raw,'unclassifiedCount')?raw.unclassifiedCount:raw.technologyCounts?.['Não classificado']??(raw.technologyCounts?0:null)):null;
 return {...raw,count,marketCount,mitCount,technologyCount,unclassifiedCount,
  mitShare:marketCount>0&&mitCount!==null?mitCount/marketCount:null,
  technologyShare:marketCount>0&&technologyCount!==null?technologyCount/marketCount:null,
  observedCount:animationMapNonnegative(raw.observedCount??(complete?rawCount:null)),
  period:frame?.granularity?(frame.periodLabel??frame.label):String(frame?.month??frame?.date??'—'),mode:frame?.granularity==='day'?'Média móvel de 7 dias':frame?.granularity==='year'?'Acumulado no ano':frame?.mode==='ytd'?'Acumulado no ano':'Mensal',
  coverage:complete?(count===null?'Valor indisponível':'Cobertura completa'):'Cobertura incompleta ou desconhecida',
  coverageStatus:String(raw.coverageStatus??frame?.coverageStatus??(complete?'complete':'unknown'))};
}
function animationMapEmptyRow(name,uf,available){
 return {name,uf,count:available?0:null,marketCount:available?0:null,mitCount:available?0:null,technologyCounts:available?{}:null,unclassifiedCount:available?0:null,observedCount:available?0:null};
}
function animationMapStateRows(frame,technology,features=value$3.features){
 const source=Array.isArray(frame?.ufRows)?frame.ufRows:[],index=new Map(source.map(row=>[String(row.uf??row.name).toUpperCase(),row]));
 const known=new Set(features.map(feature=>feature.uf));
 return [...features.map(feature=>animationMapStandardRow({...animationMapEmptyRow(feature.uf,feature.uf,frame?.complete===true&&Array.isArray(frame?.ufRows)),...index.get(feature.uf),name:feature.uf,uf:feature.uf,path:feature.path,geographicMatch:'Malha oficial da UF'},frame,technology)),
  ...source.filter(row=>!known.has(String(row.uf??row.name).toUpperCase())).map(row=>animationMapStandardRow({...row,name:String(row.name??row.uf??'UF não informada'),path:null,geographicMatch:'UF sem correspondência na malha'},frame,technology))];
}
function animationMapMunicipalSource(frame,uf){
 const rows=Array.isArray(frame?.municipalityRows)?frame.municipalityRows:[];
 const selected=String(frame?.selectedUF??'').toUpperCase();
 const ready=Boolean(uf)&&Array.isArray(frame?.municipalityRows)&&(selected===uf||(!selected&&rows.some(row=>row.uf===uf||String(row.name).endsWith(' · '+uf))));
 const scoped=rows.filter(row=>row.uf===uf||String(row.name).endsWith(' · '+uf)).map(row=>{
  const municipality=String(row.municipality??String(row.name??'').replace(new RegExp(' · '+uf+'$'),''));
  return {...row,uf,municipality,name:municipality+' · '+uf};
 });
 return {ready,rows:ready?scoped:[],frame:ready?frame:{...frame,complete:false,coverageStatus:'municipal-unavailable'}};
}
function animationMapMergeMunicipalRows(rows){
 const first=rows[0];if(rows.length===1)return first;
 const sum=field=>rows.every(row=>animationMapNonnegative(row[field])!==null)?rows.reduce((total,row)=>total+row[field],0):null;
 const technologyKeys=[...new Set(rows.flatMap(row=>Object.keys(row.technologyCounts??{})))];
 return {...first,count:sum('count'),marketCount:sum('marketCount'),mitCount:sum('mitCount'),observedCount:sum('observedCount'),unclassifiedCount:sum('unclassifiedCount'),
  technologyCounts:rows.every(row=>row.technologyCounts)?Object.fromEntries(technologyKeys.map(key=>[key,rows.every(row=>!Object.hasOwn(row.technologyCounts,key)||animationMapNonnegative(row.technologyCounts[key])!==null)?rows.reduce((total,row)=>total+(row.technologyCounts[key]??0),0):null])):null};
}
function animationMapMunicipalRows(frame,uf,geometry,technology='ALL_ELECTRIFIED'){
 const source=animationMapMunicipalSource(frame,uf),complete=source.ready&&source.frame?.complete===true;
 if(!geometry||geometry.uf!==uf)return {ready:source.ready,rows:source.rows.map(row=>animationMapStandardRow({...row,ibgeCode:row.ibgeCode??null,path:null,x:null,y:null,geographicMatch:'Malha municipal indisponível; valor preservado'},source.frame,technology)),matches:[],unmatched:source.rows};
 const joined=catalogMunicipalJoin(source.rows,geometry),grouped=new Map();
 for(const row of joined.matches){const key=String(row.ibgeCode);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
 const matched=geometry.features.map(feature=>{
  const found=grouped.get(String(feature.code)),point=catalogPathCentroid(feature.path);
  const raw=found?animationMapMergeMunicipalRows(found):{...animationMapEmptyRow(feature.name+' · '+uf,uf,complete),municipality:feature.name};
  return animationMapStandardRow({...raw,name:feature.name+' · '+uf,municipality:feature.name,uf,ibgeCode:feature.code,path:feature.path,x:point?.[0]??null,y:point?.[1]??null,geographicMatch:found?'Nome normalizado + UF únicos':complete?'Sem registros no recorte':'Cobertura indisponível'},source.frame,technology);
 });
 const unmatched=joined.unmatched.map(row=>animationMapStandardRow({...row,ibgeCode:null,path:null,x:null,y:null},source.frame,technology));
 return {ready:source.ready,rows:[...matched,...unmatched],matches:matched.filter(row=>Number.isFinite(row.x)&&Number.isFinite(row.y)),unmatched};
}
function animationMapDomains(frames,metric,technology,uf){
 let maximum=0;
 for(const frame of animationMapFrameList(frames)){
  if(metric==='municipalVolume'){
   const source=animationMapMunicipalSource(frame,uf);
   if(source.ready&&source.frame?.complete===true){
    const grouped=new Map();for(const row of source.rows){const key=catalogMapNormalize(row.name);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
    for(const rows of grouped.values())maximum=Math.max(maximum,animationMapNonnegative(animationMapMergeMunicipalRows(rows).count)??0);
   }
  }else for(const row of animationMapStateRows(frame,technology))maximum=Math.max(maximum,row[metric==='electrification'?'technologyShare':'mitShare']??0);
 }
 return {min:0,max:maximum>0?maximum:1,observedMax:maximum};
}
function animationMapColor(value,maximum){
 if(!Number.isFinite(value))return null;
 const t=Math.max(0,Math.min(1,value/(maximum||1)));
 return `rgb(${Math.round(233-212*t)},${Math.round(243-151*t)},${Math.round(255-83*t)})`;
}
function animationMapViewBox(viewBox,padding=32){
 const values=String(viewBox??'').split(/\s+/).map(Number);
 if(values.length!==4||!values.every(Number.isFinite)||values[2]<=0||values[3]<=0)return '0 0 640 600';
 return [values[0]-padding,values[1]-padding,values[2]+padding*2,values[3]+padding*2].join(' ');
}
function animationMapTooltip(row,metric,technology,brand='Mitsubishi'){
 const measure=metric==='municipalVolume'?'Volume: '+animationMapNumber(row.count):metric==='electrification'?(ANIMATION_MAP_TECHNOLOGY_LABELS[technology]??'Tecnologia indisponível')+': '+animationMapPercent(row.technologyShare):'Participação '+brand+': '+animationMapPercent(row.mitShare);
 return row.name+' | '+row.period+' · '+row.mode+' | '+measure+' | Mercado no recorte: '+animationMapNumber(row.marketCount)+' | '+brand+': '+animationMapNumber(row.mitCount)+(metric==='electrification'?' | Tecnologia selecionada: '+animationMapNumber(row.technologyCount)+' | Não classificado: '+animationMapNumber(row.unclassifiedCount):'')+' | '+row.coverage;
}
function AnimationMaps({frames=[],frame=0,metric='mitShare',technology='ALL_ELECTRIFIED',uf='',dataBase,brand='MITSUBISHI'}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,brandName=animationBrandLabel(brand);
 const kind=animationMapMetric(metric),tech=animationMapTechnology(technology),selectedUF=String(uf??'').toUpperCase(),municipal=kind==='municipalVolume';
 const list=animationMapFrameList(frames),selected=animationMapCurrentFrame(frames,frame);
 const current=selected&&{...selected,selectedUF:selected.selectedUF??frames?.selectedUF};
 const scopedFrames=React.useMemo(()=>list.map(item=>({...item,selectedUF:item.selectedUF??frames?.selectedUF})),[list,frames?.selectedUF]);
 const [activeKey,setActiveKey]=React.useState(null),[query,setQuery]=React.useState('');
 const svgId=React.useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const loaded=useCatalogMunicipalGeometry(selectedUF,dataBase,municipal&&value$3.features.some(feature=>feature.uf===selectedUF));
 const geometry=loaded.data?.uf===selectedUF?loaded.data:null;
 const stateRows=React.useMemo(()=>animationMapStateRows(current,tech),[selected,tech,frames?.selectedUF]);
 const cities=React.useMemo(()=>animationMapMunicipalRows(current,selectedUF,geometry,tech),[selected,selectedUF,geometry,tech,frames?.selectedUF]);
 const domain=React.useMemo(()=>animationMapDomains(scopedFrames,kind,tech,selectedUF),[scopedFrames,kind,tech,selectedUF]);
 const rows=municipal?cities.rows:stateRows,shownRows=rows.filter(row=>catalogMapNormalize(row.name).includes(catalogMapNormalize(query)));
 const cityIndex=new Map(cities.rows.filter(row=>row.ibgeCode).map(row=>[String(row.ibgeCode),row]));
 const legendValues=[...new Set([.25,.5,1].map(ratio=>Math.ceil(domain.observedMax*ratio)))].filter(value=>value>0);
 const active=rows.find(row=>row.name===activeKey),period=current?.granularity?(current.periodLabel??current.label):current?.month??current?.date??'Período indisponível',mode=current?.granularity==='day'?'Média móvel de 7 dias':current?.mode==='ytd'?'Acumulado no ano':'Mensal';
 const title=municipal?'Concentração municipal · '+(selectedUF||'escolha uma UF'):kind==='electrification'?'Brasil · '+(ANIMATION_MAP_TECHNOLOGY_LABELS[tech]??'tecnologia indisponível'):'Brasil · participação '+brandName+' por UF';
 const validUF=value$3.features.some(feature=>feature.uf===selectedUF),valueField=municipal?'count':kind==='electrification'?'technologyShare':'mitShare';
 const unknownRows=rows.filter(row=>row[valueField]===null),positiveCities=cities.matches.filter(row=>row.count>0).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 const geoUnmatched=municipal?cities.unmatched:stateRows.filter(row=>!row.path);
 const unmatchedVolume=geoUnmatched.every(row=>animationMapNonnegative(row.count)!==null)?geoUnmatched.reduce((sum,row)=>sum+row.count,0):null;
 const extent=list.length?(list[0].label??list[0].month??list[0].date)+' a '+(list[list.length-1].label??list[list.length-1].month??list[list.length-1].date):'janela indisponível';
 const inspect=row=>({tabIndex:0,role:'button','aria-label':animationMapTooltip(row,kind,tech,brandName),'aria-pressed':activeKey===row.name,onMouseEnter:()=>setActiveKey(row.name),onFocus:()=>setActiveKey(row.name),onClick:()=>setActiveKey(row.name),onKeyDown:event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setActiveKey(row.name);}if(event.key==='Escape')setActiveKey(null);}});
 React.useEffect(()=>{setActiveKey(null);setQuery('');},[kind,selectedUF,tech]);
 const marks=municipal?(geometry?.features??[]).map(feature=>{
  const row=cityIndex.get(String(feature.code));
  return h('path',{...(row?inspect(row):{}),className:'anm-map-city','data-ibge':feature.code,d:feature.path,fill:row?.count==null?'url(#'+svgId+'-unknown)':'var(--anm-map-land)',children:h('title',{children:row?animationMapTooltip(row,kind,tech,brandName):feature.name})},feature.code);
 }):value$3.features.map(feature=>{
  const row=stateRows.find(item=>item.uf===feature.uf),fill=animationMapColor(row?.[valueField],domain.max);
  return h('path',{...inspect(row),className:'anm-map-state','data-uf':feature.uf,d:feature.path,fill:fill??'url(#'+svgId+'-unknown)',children:h('title',{children:animationMapTooltip(row,kind,tech,brandName)})},feature.uf);
 });
 const explanation='Emplacamentos observados no recorte e período de cada quadro. Nenhum valor é interpolado entre meses. Participação da marca = marca em foco ÷ mercado no mesmo recorte e UF; todos os filtros recebidos são preservados. Eletrificação = tecnologia selecionada ÷ mercado no mesmo recorte e UF. O denominador inclui ICE, FCEL e não classificados; eletrificados somam apenas BEV + PHEV + HEV + MHEV. As participações representam a classificação conhecida; registros não classificados podem conter outras tecnologias. Base zero, cobertura incompleta ou tecnologia indisponível geram —. No acumulado, janeiro até o quadro; reinicia a cada ano e exige cobertura completa. Domínios fixos na janela inteira de reprodução, incluindo meses não desenhados neste instante.';
 const columns=[{field:'period',label:'Período'},{field:'mode',label:'Modo'},{field:'name',label:municipal?'Município · UF':'UF',presentation:'identity'},...(municipal?[{field:'ibgeCode',label:'Código IBGE'}]:[]),{field:'count',label:'Volume no recorte',renderCell:animationMapNumber},{field:'marketCount',label:'Mercado no recorte',renderCell:animationMapNumber},{field:'mitCount',label:brandName,renderCell:animationMapNumber},{field:'mitShare',label:brandName+' / mercado',renderCell:animationMapPercent},{field:'technologyCount',label:ANIMATION_MAP_TECHNOLOGY_LABELS[tech]??'Tecnologia indisponível',renderCell:animationMapNumber},{field:'technologyShare',label:'Tecnologia / mercado',renderCell:animationMapPercent},{field:'unclassifiedCount',label:'Não classificado',renderCell:animationMapNumber},{field:'observedCount',label:'Volume observado, inclusive parcial',renderCell:animationMapNumber},{field:'coverage',label:'Cobertura'},{field:'coverageStatus',label:'Status da fonte'},{field:'geographicMatch',label:'Correspondência geográfica'}];
 let blocked=null;
 if(!current)blocked='Nenhum quadro disponível para este período. Não há substituição pelo mês anterior.';
 else if(municipal&&!validUF)blocked='Escolha uma única UF para ver a concentração municipal na malha oficial.';
 else if(municipal&&!cities.ready)blocked='Os dados municipais desta UF ainda não estão disponíveis para este quadro. Aguardando o recorte correspondente.';
 else if(municipal&&!geometry)blocked=loaded.error??'Carregando malha municipal oficial… A tabela permanece disponível.';
 return hs('section',{className:'anm-maps','aria-label':'Mapas animados · dados exatos do quadro',children:[
  hs('header',{className:'anm-map-heading',children:[hs('div',{children:[h('span',{className:'anm-map-kicker',children:'Geografia oficial · IBGE'}),h('h3',{children:title})]}),hs('div',{className:'anm-map-period',children:[h('strong',{children:period}),h('span',{children:mode})]})]}),
  current?.complete!==true&&h('p',{className:'anm-map-warning',role:'status',children:'Cobertura incompleta ou desconhecida: mapa sem valores quantitativos neste quadro. Os registros observados, quando disponíveis, ficam identificados como parciais na tabela.'}),
  kind==='electrification'&&!tech&&h('p',{className:'anm-map-warning',role:'status',children:'Tecnologia não reconhecida. Selecione BEV, PHEV, HEV, MHEV ou o conjunto explícito de eletrificados.'}),
  blocked?hs('div',{className:'anm-map-empty',role:loaded.error&&municipal?'alert':'status',children:[h('p',{children:blocked}),municipal&&loaded.error&&h('button',{type:'button',onClick:loaded.retry,children:'Tentar carregar a malha novamente'})]}):hs('div',{className:'anm-map-layout',children:[
   h('div',{className:'anm-map-viewport',children:hs('svg',{className:'anm-map-svg',viewBox:animationMapViewBox(municipal?geometry.viewBox:value$3.viewBox),role:'group','aria-label':title+' · '+period,'data-domain-max':domain.max,children:[h('title',{children:title+' · '+period}),h('desc',{children:'Áreas com traços indicam valores indisponíveis. Tab, toque ou clique revelam os números. Todos os valores também estão na tabela abaixo.'}),h('defs',{children:hs('pattern',{id:svgId+'-unknown',width:8,height:8,patternUnits:'userSpaceOnUse',children:[h('rect',{width:8,height:8,fill:'#e5e9ef'}),h('path',{d:'M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6',stroke:'#a5afbc',strokeWidth:1.3})]})}),...marks,
    ...(municipal?positiveCities.map(row=>hs('g',{...inspect(row),className:'anm-map-bubble','data-municipality':row.name,children:[h('circle',{cx:row.x,cy:row.y,r:catalogMapRadius(row.count,domain.max,28),className:'anm-map-bubble-fill'}),h('title',{children:animationMapTooltip(row,kind,tech,brandName)})]},row.ibgeCode)):[])]})}),
   hs('aside',{className:'anm-map-side',children:[h('h4',{children:'Escala fixa na reprodução'}),h('p',{children:extent}),municipal?hs(React.Fragment,{children:[domain.observedMax>0&&h('svg',{className:'anm-map-size-legend',viewBox:'0 0 180 82',role:'img','aria-label':'Área proporcional ao volume, de 0 a '+animationMapNumber(domain.observedMax),children:legendValues.map((value,index)=>hs('g',{children:[h('circle',{cx:30+index*60,cy:31,r:catalogMapRadius(value,domain.max,24),className:'anm-map-bubble-fill'}),h('text',{x:30+index*60,y:72,textAnchor:'middle',children:animationMapNumber(value)})]},value))}),h('p',{children:domain.observedMax>0?'Área das bolhas proporcional ao volume. Mesmo volume, mesma área em todos os quadros. Máximo observado: '+animationMapNumber(domain.observedMax)+'.':'Nenhum volume positivo confirmado na janela. Nenhuma bolha é desenhada.'})]}):hs(React.Fragment,{children:[h('span',{className:'anm-map-gradient','aria-hidden':true}),hs('div',{className:'anm-map-range',children:[h('span',{children:'0%'}),h('span',{children:animationMapPercent(domain.max)})]}),h('p',{children:'Cor = '+(kind==='electrification'?'participação da tecnologia selecionada':'participação '+brandName)+'. O domínio considera a janela inteira.'})]}),h('p',{children:'Tom claro: zero confirmado. Hachura: sem base ou cobertura incompleta.'}),municipal&&hs('figure',{className:'anm-map-inset',children:[h('svg',{viewBox:value$3.viewBox,role:'img','aria-label':selectedUF+' no Brasil',children:value$3.features.map(feature=>h('path',{d:feature.path,fill:feature.uf===selectedUF?'#155cac':'#dce5ef',stroke:'#fff',strokeWidth:1},feature.uf))}),h('figcaption',{children:selectedUF+' no Brasil'})]})]})]}),
  h('p',{className:'anm-map-inspect','aria-live':'off',children:active?animationMapTooltip(active,kind,tech,brandName):'A tabela mostra o quadro atual sem arredondar os volumes.'}),
  h(PageNote,{className:'anm-map-note',children:unknownRows.length+' áreas com medida indisponível. '+geoUnmatched.length+' registros territoriais sem desenho ('+animationMapNumber(unmatchedVolume)+' emplacamentos); valores preservados na tabela.'}),
  municipal&&h(PageNote,{className:'anm-map-note',children:'Bolhas em centroides das malhas municipais oficiais: '+positiveCities.length+' municípios com volume positivo, sem limite de quantidade na tabela. Correspondência única por nome normalizado + UF. Sem ponto fictício para nomes não associados. Os pontos não são endereços de compradores; centroides podem ficar fora de polígonos côncavos. A projeção é própria da UF e não permite comparar áreas geográficas entre estados.'}),
  hs(PageNoteBlock,{className:'anm-map-method',children:[h('summary',{children:'Medidas, cobertura e fontes'}),h('p',{children:explanation}),h('a',{href:'https://servicodados.ibge.gov.br/api/docs/malhas',target:'_blank',rel:'noreferrer',children:'Malhas oficiais · IBGE'})]}),
  hs('label',{className:'anm-map-search',children:['Buscar na tabela do quadro',h('input',{type:'search',value:query,onChange:event=>setQuery(event.target.value),'aria-label':'Buscar na tabela do mapa animado',placeholder:municipal?'Município':'UF'})]}),
  h(MarketTable,{id:'animation-map-'+svgId+'-table',title:title+' · '+period+' · dados exatos',rows:shownRows,scope:[{field:'period',label:'Período',value:String(period)},{field:'mode',label:'Modo',value:mode},...(municipal?[{field:'uf',label:'UF do desenho',value:selectedUF}]:[])],columns,description:explanation+' '+shownRows.length+' de '+rows.length+' áreas na tabela. Geografia sem correspondência permanece na lista.',onSelect:row=>setActiveKey(row.name)})
 ]});
}

/* Mapa de calor animado: uma marca por painel, lado a lado, sempre acumulado desde janeiro. */
function AnimationHeatPanel({brand,values,coords,names,max,total,places,states,complete}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,wrap=React.useRef(null),canvas=React.useRef(null),hit=React.useRef([]),w=useCanvasWidth(wrap),[tip,setTip]=React.useState(null);
 const view=React.useMemo(()=>value$3.viewBox.split(/\s+/).map(Number),[]);
 const color=String(brand).toUpperCase()==='MITSUBISHI'?'var(--mitsubishi-color)':tbmColor(brand);
 React.useEffect(()=>{const cv=canvas.current;if(!cv||!w)return;hit.current=tbmDrawHeat(cv,w,{points:coords,values:complete?values:[],max,scale:'sqrt',radius:18,color,states,view});},[w,values,coords,max,color,states,complete]);
 const move=e=>{const r=canvas.current.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;let best=null,bd=14;for(const [x,y,i] of hit.current){const d=Math.hypot(px-x,py-y);if(d<bd||(d<=bd&&best!=null&&values[i]>values[best])){bd=d;best=i;}}setTip(best==null?null:{i:best,x:e.clientX,y:e.clientY});};
 return hs('article',{className:'anh-panel','data-brand':brand,children:[
  hs('header',{children:[h('h4',{style:{'--anh-color':color},children:animationBrandLabel(brand)}),h('strong',{children:complete?animationNumber(total):'N/D'}),h('span',{children:complete?animationNumber(places)+' municípios':'cobertura incompleta'})]}),
  h('div',{ref:wrap,className:'tbm-canvas',children:h('canvas',{ref:canvas,role:'img','aria-label':'Mapa de calor acumulado de '+animationBrandLabel(brand),onMouseMove:move,onMouseLeave:()=>setTip(null)})}),
  hs('div',{className:'anh-scale',children:[h('span',{children:'0'}),h('i',{style:{'--anh-color':color},'aria-hidden':true}),h('span',{children:animationNumber(max)+' por município'})]}),
  tip&&hs('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:[h('strong',{children:names[tip.i]??''}),h('div',{className:'tbm-tip-row',children:[h('span',{children:animationBrandLabel(brand)}),h('span',{children:animationNumber(values[tip.i])})]})]})]});
}
function AnimationHeat({frames=[],frame=0,brands=[],commonScale=false,dataBase}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,points=useTbmPoints(dataBase),states=React.useMemo(tbmStates,[]);
 const list=animationMapFrameList(frames),current=animationMapCurrentFrame(frames,frame),rows=points.data?.rows;
 const coords=React.useMemo(()=>(rows??[]).map(r=>[r[3],r[4]]),[rows]);
 const names=React.useMemo(()=>(rows??[]).map(r=>r[1]+' · '+r[2]),[rows]);
 const index=React.useMemo(()=>{const m=new Map();(rows??[]).forEach((r,i)=>m.set(catalogMapNormalize(r[1])+'|'+r[2],i));return m;},[rows]);
 const maxes=React.useMemo(()=>{const out={};for(const b of brands){let m=0;for(const f of list)for(const n of Object.values(f.heat?.[b]??{}))if(n>m)m=n;out[b]=Math.max(1,m);}return out;},[list,brands.join('|')]);
 const common=Math.max(1,...Object.values(maxes));
 const panels=brands.map(b=>{const heat=current?.heat?.[b]??{},v=new Array(coords.length).fill(0);let total=0,places=0;for(const [name,n] of Object.entries(heat)){total+=n;const cut=name.lastIndexOf(' · '),i=index.get(catalogMapNormalize(name.slice(0,cut))+'|'+name.slice(cut+3));if(i!=null){v[i]=n;places++;}}return {brand:b,values:v,total,places};});
 if(points.error)return h('p',{role:'alert',children:points.error});
 if(!rows)return h('p',{role:'status',children:'Carregando as posições dos municípios…'});
 return hs('section',{className:'anh','aria-label':'Mapa de calor acumulado por marca',children:[
  hs('header',{className:'anh-head',children:[h('span',{children:'Volume acumulado por município'}),h('strong',{children:animationPeriod(current,true)})]}),
  h('div',{className:'anh-grid','data-count':panels.length,children:panels.map(p=>h(AnimationHeatPanel,{...p,coords,names,states,max:commonScale?common:maxes[p.brand],complete:animationComplete(current)},p.brand))}),
  h('p',{className:'anh-note',children:commonScale?'Mesma escala para todas as marcas.':'Cada painel tem escala própria, fixa durante a reprodução.'})]});
}

/* Animation workspace (days, months or years).  No autoplay; a request identity gates every result. */
const ANIMATION_VIEWS=[['races','Corridas'],['bubbles','Bolhas em movimento'],['mix','Transformação do mercado'],['maps','Brasil no tempo'],['heat','Calor por marca']];
// Janela padrão: janeiro do ano do último mês disponível até esse mês.
function animationDefaultStart(months){const last=months.at(-1);return last?months.find(m=>m.slice(0,4)===last.slice(0,4))??months[0]:undefined;}
const ANIMATION_PRESETS=[['all','Mercado selecionado'],['midsize-pickups','Somente picapes médias · PICK-UP MID'],['suv','SUV · modelos']];
function animationMonthChoices(manifest){return [...new Set((manifest?.months??[]).filter(m=>m.cubePath||m.originCubePath).map(m=>m.month))].sort();}
function animationRequestFilters(filters,compareAllBrands){const result={...filters};delete result.date;if(compareAllBrands){delete result.marca;delete result.modelo;delete result.grupo_modelo;}return result;}
function animationExportRows(frames,{view,dimension,mixKind,metric,technology,uf,filters,preset,mode,topN=10,pinMIT=true}){
 const rankingMetric=dimension==='uf'?'mitCount':'count',params={view,dimension,mixKind,metric,rankingMetric,technology,uf,preset,mode,topN,pinMIT,filters};
 const charts=typeof AnimationCharts==='undefined'?null:AnimationCharts;
 const leadership=charts&&view==='races'?charts.animationLeadershipRows(frames,dimension,rankingMetric):[];
 return frames.flatMap((frame,index)=>{
  let rows;
  if(view==='heat')rows=Object.entries(frame.heat??{}).flatMap(([brand,counts])=>Object.entries(counts).map(([name,count])=>({brand,name,count})));
  else if(view==='maps')rows=metric==='municipalVolume'?(frame.municipalityRows??[]).map(row=>typeof animationMapStandardRow==='function'?animationMapStandardRow(row,frame,technology):row):typeof animationMapStateRows==='function'?animationMapStateRows(frame,technology):frame.ufRows;
  else if(charts)rows=charts.animationChartRows({view:view==='races'?'race':view,frames,frame,dimension,topN,pinMIT,metric:rankingMetric,kind:mixKind});
  else rows=view==='mix'?(mixKind==='vehicleOrigin'?frame.groups?.bd_origem:frame.mixes?.[mixKind]):frame.groups?.[dimension];
  const lead=leadership[index];
  return (rows??[]).map(row=>({...row,brands:JSON.stringify(row.brands??[]),technologyCounts:JSON.stringify(row.technologyCounts??{}),month:frame.month,complete:frame.complete,coverageStatus:frame.coverageStatus,universe:frame.total,...(lead?{leaders:JSON.stringify(lead.leaders),runnerUp:lead.runnerUp,leadershipMargin:lead.margin,leadershipMarginPP:lead.marginPP,tiedLeadership:lead.tie}:{}),parameters:JSON.stringify(params)}));
 });
}
function useAnimationQuery({manifest,base,filters,startMonth,endMonth,preset,porte,selectedUF,mode,granularity,includeYoY,dataView,dimension,mixKind,mapMetric,technology,focusBrand=null,heatBrands=null}){
 const [state,setState]=React.useState({pending:false,result:null,error:null,progress:null,key:null}),worker=React.useRef(null),sequence=React.useRef(0);
 const filterKey=canonicalFilterKey(filters),porteKey=JSON.stringify(porte),key=JSON.stringify([base,filterKey,startMonth,endMonth,preset,porteKey,selectedUF,mode,granularity,includeYoY,dataView,dimension,mixKind,mapMetric,technology,focusBrand,heatBrands,manifest?.generatedAt]);
 React.useEffect(()=>{let url=null;try{url=URL.createObjectURL(new Blob([ANIMATIONS_WORKER_SOURCE],{type:'application/javascript'}));worker.current=createSharedQueryWorker(()=>new Worker(url),'animations');worker.current.onerror=()=>setState(s=>({...s,pending:false,error:'Não foi possível iniciar o cálculo. Recarregue ou tente um navegador atualizado.'}));}catch(e){setState(s=>({...s,pending:false,error:e.message}));}return ()=>{sequence.current++;worker.current?.terminate();worker.current=null;if(url)URL.revokeObjectURL(url);};},[]);
 React.useEffect(()=>{if(!manifest||!startMonth||!endMonth)return;const id=++sequence.current;setState({pending:true,result:null,error:null,progress:null,key});const w=worker.current;if(!w){setState({pending:false,result:null,error:'O navegador não iniciou a consulta local.',progress:null,key});return;}
  w.onmessage=({data})=>{if(data.id!==sequence.current)return;if(data.progress){setState(s=>({...s,progress:data.progress}));return;}setState({pending:false,result:typeof hideUnclassified==='function'?hideUnclassified(data.result??null):data.result??null,error:data.error??null,progress:null,key});};
  w.postMessage({type:'animations',id,manifest,base,filters,startMonth,endMonth,preset,porte,selectedUF,mode,granularity,includeYoY,dataView,dimension,mixKind,mapMetric,technology,focusBrand,heatBrands,originMapping:typeof value==='undefined'?null:value});
  return ()=>{sequence.current++;try{w.postMessage({type:'cancel'});}catch{}};
 },[manifest,key]);
 return state.key!==key?{pending:Boolean(manifest),result:null,error:null,progress:null}:state;
}
function useAnimationPlayer(length,resetKey,paused=false){
 const [index,setIndex]=React.useState(0),[playing,setPlaying]=React.useState(false),[speed,setSpeed]=React.useState(1000),[reduced,setReduced]=React.useState(false);
 React.useEffect(()=>{const media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const update=()=>{setReduced(media.matches);if(media.matches)setPlaying(false);};update();media.addEventListener?.('change',update);return ()=>media.removeEventListener?.('change',update);},[]);
 React.useEffect(()=>{setPlaying(false);setIndex(0);},[resetKey]);
 React.useEffect(()=>{if(!playing||paused||reduced||length<2)return;const timer=setTimeout(()=>{setIndex(i=>Math.min(i+1,length-1));},speed);return ()=>clearTimeout(timer);},[playing,paused,reduced,index,length,speed]);
 React.useEffect(()=>{if(paused||index>=length-1)setPlaying(false);},[index,length,paused]);
 const seek=i=>{setPlaying(false);setIndex(Math.max(0,Math.min(length-1,i)));};
 return {index:Math.min(index,Math.max(0,length-1)),playing,speed,reduced,setSpeed,seek,toggle:()=>{if(paused||reduced||length<2)return;if(index>=length-1)setIndex(0);setPlaying(v=>!v);}};
}
function AnimationWorkspace({manifest,filters={},scope=[]}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,shell=dataApp.useDataApp(),base=getBase(shell.snapshot),months=animationMonthChoices(manifest);
 const [view,setView]=React.useState('races'),[preset,setPreset]=React.useState('all'),[dimension,setDimension]=React.useState('marca'),[porte,setPorte]=React.useState(''),[start,setStart]=React.useState(''),[end,setEnd]=React.useState(''),[focusBrand,setFocusBrand]=React.useState('MITSUBISHI'),[heatBrands,setHeatBrands]=React.useState(['MITSUBISHI','TOYOTA']),[commonScale,setCommonScale]=React.useState(false),[topN,setTopN]=React.useState(10),[pinMIT,setPinMIT]=React.useState(true),[compareAllBrands,setCompareAllBrands]=React.useState(false),[trail,setTrail]=React.useState(false),[mixKind,setMixKind]=React.useState('technology'),[metric,setMetric]=React.useState('mitShare'),[technology,setTechnology]=React.useState('ALL_ELECTRIFIED'),[uf,setUF]=React.useState(''),[granularity,setGranularity]=React.useState('month');
 const startMonth=start&&months.includes(start)?start:animationDefaultStart(months),endMonth=end&&months.includes(end)?end:months.at(-1),requestFilters=animationRequestFilters(filters,compareAllBrands),windowMonths=months.filter(m=>m>=startMonth&&m<=endMonth).length,dayBlocked=windowMonths>12,gran=granularity==='day'&&(dayBlocked||view==='heat')?'month':granularity,actualMode=gran==='day'?'monthly':'ytd',brandChoices=[...new Set(['MITSUBISHI',...(manifest?.dimensionChoices?.marca??[])])],activeHeat=heatBrands.filter(Boolean).filter((b,i,a)=>a.indexOf(b)===i),actualDimension=preset==='all'?(view==='bubbles'&&dimension==='uf'?'marca':dimension):'modelo';
 const query=useAnimationQuery({manifest,base,filters:requestFilters,startMonth,endMonth,preset,porte:preset==='suv'&&porte?[porte]:[],selectedUF:uf,mode:actualMode,granularity:gran,includeYoY:view==='bubbles',dataView:view,dimension:actualDimension,mixKind,mapMetric:metric,technology,focusBrand:view==='maps'?focusBrand:null,heatBrands:view==='heat'?activeHeat:null}),frames=query.result?.frames??[];
 const player=useAnimationPlayer(frames.length,JSON.stringify([view,canonicalFilterKey(filters),compareAllBrands,startMonth,endMonth,preset,porte,uf,actualMode,gran,actualDimension,metric,technology,mixKind,topN,pinMIT,focusBrand,activeHeat]),query.pending),frame=frames[player.index];
 const control=(label,value,onChange,options)=>hs('label',{children:[h('span',{children:label}),h('select',{value,onChange:e=>onChange(e.target.value),children:options.map(([v,l])=>h('option',{value:v,children:l},v))})]});
 const chooseStart=v=>{setStart(v);if(v>endMonth)setEnd(v);},chooseEnd=v=>{setEnd(v);if(v<startMonth)setStart(v);};
 const exportOptions={view,dimension:actualDimension,mixKind,metric,technology,uf,filters:requestFilters,preset,mode:actualMode,topN,pinMIT},exportRows=()=>animationExportRows(frames,exportOptions);
 const unit=gran==='day'?'dia':gran==='year'?'ano':'mês',units=gran==='day'?'dias':gran==='year'?'anos':'meses',frameLabel=f=>f?(f.granularity==='year'?(f.periodLabel??f.label):f.label??f.month):'',essential=gran==='day'?'Cada quadro soma os 7 dias terminados no dia (média móvel), para não oscilar entre dias úteis e fins de semana. Crescimento compara com a mesma janela do ano anterior.':gran==='year'?'Cada quadro soma janeiro até o mês de término da janela, para comparar anos em períodos iguais. '+(frames.length===1?'Só um ano na janela: um único ponto; amplie o De para navegar por vários anos.':''):'Acumulado de janeiro até o mês, reiniciado a cada ano.';
 const progress=query.progress?typeof query.progress==='string'?query.progress:(query.progress.done??0)+' de '+(query.progress.total??'—')+' meses carregados · '+(query.progress.month??''):'';
 return hs('section',{className:'animations-workspace','aria-label':'Animações do mercado','aria-busy':query.pending,children:[
  hs('header',{className:'animations-heading',children:[hs('div',{children:[h('h2',{children:'Animações'}),h('p',{children:'O mercado em movimento · dados reais de emplacamentos'})]}),h('span',{className:'animations-month',children:frame?frameLabel(frame):'Selecione o período'})]}),
  h('nav',{className:'animations-views','aria-label':'Visualizações animadas',children:ANIMATION_VIEWS.map(([id,label])=>h('button',{type:'button','aria-pressed':view===id,onClick:()=>setView(id),children:label},id))}),
  hs('div',{className:'animations-controls',children:[control('De',startMonth??'',chooseStart,months.map(m=>[m,m])),control('Até',endMonth??'',chooseEnd,months.map(m=>[m,m])),control('Percorrer por',granularity,setGranularity,[['month','Meses · acumulado'],...(view==='heat'?[]:[['day','Dias · média móvel de 7 dias']]),['year','Anos · jan até o mês final']]),control('Universo',preset,setPreset,ANIMATION_PRESETS),preset==='suv'&&control('Porte SUV',porte,setPorte,[['','Todos os portes'],...(manifest?.dimensionChoices?.bd_segmento??[]).map(p=>[p,p])]),(view==='races'||view==='bubbles')&&preset==='all'&&control('Comparar',dimension,setDimension,[['marca','Marcas'],['modelo','Modelos'],['grupo_modelo','Grupos de modelos'],...(view==='races'?[['uf','UFs · volume Mitsubishi']]:[])]),(view==='races'||view==='bubbles')&&control('Top N',String(topN),v=>setTopN(Number(v)),[5,10,15,20].map(n=>[String(n),String(n)])),view==='maps'&&metric==='mitShare'&&control('Marca',focusBrand,setFocusBrand,brandChoices.map(b=>[b,animationBrandLabel(b)])),view==='heat'&&[0,1,2].map(i=>h(React.Fragment,{key:i,children:control('Marca '+(i+1),heatBrands[i]??'',v=>setHeatBrands(cur=>{const next=[...cur];next[i]=v;return next.slice(0,3);}),[...(i?[['','Nenhuma']]:[]),...brandChoices.map(b=>[b,animationBrandLabel(b)])])})),view==='mix'&&control('Composição',mixKind,setMixKind,[['technology','Propulsão'],['body','Carroceria'],['porte','Porte'],['origin','Origem histórica das marcas'],['vehicleOrigin','Origem do veículo · LOCAL / IMP'],['channel','Venda direta / varejo / não informado']]),view==='maps'&&control('Mapa',metric,setMetric,[['mitShare','Participação da marca'],['electrification','Participação da eletrificação'],['municipalVolume','Concentração municipal · volume']]),view==='maps'&&metric==='electrification'&&control('Tecnologia',technology,setTechnology,[['ALL_ELECTRIFIED','HEV + PHEV + BEV + MHEV'],...['BEV','PHEV','HEV','MHEV'].map(v=>[v,v])]),view==='maps'&&metric==='municipalVolume'&&control('Uma UF para os municípios',uf,setUF,[['','Selecione uma UF'],...(manifest?.dimensionChoices?.uf??[]).map(v=>[v,v])])]}),
  hs('div',{className:'animations-toggles',children:[hs('label',{children:[h('input',{type:'checkbox',checked:compareAllBrands,onChange:e=>setCompareAllBrands(e.target.checked)}),'Comparar todas as marcas e modelos (retira somente esses 3 filtros)']}),view==='heat'&&hs('label',{children:[h('input',{type:'checkbox',checked:commonScale,onChange:e=>setCommonScale(e.target.checked)}),'Mesma escala para todas as marcas']}),view==='races'&&actualDimension!=='uf'&&hs('label',{children:[h('input',{type:'checkbox',checked:pinMIT,onChange:e=>setPinMIT(e.target.checked)}),'Manter Mitsubishi visível fora do Top N']}),view==='bubbles'&&hs('label',{children:[h('input',{type:'checkbox',checked:trail,onChange:e=>setTrail(e.target.checked)}),'Rastro dos últimos 6 meses disponíveis']})]}),
  h('p',{className:'animations-context',children:'Janela local: '+(startMonth??'—')+' a '+(endMonth??'—')+'.'}),
  granularity==='day'&&dayBlocked&&h('p',{role:'status',className:'animations-context',children:'A visão por dias aceita janelas de até 12 meses (a atual tem '+windowMonths+'). Mostrando por meses; reduza o período em De/Até para percorrer por dias.'}),h('p',{className:'animations-context',children:essential+(preset==='midsize-pickups'?' Picapes: somente classificação exata PICK-UP MID.':'')}),
  query.pending&&h('p',{role:'status',children:'Preparando a série mensal no navegador… '+progress}),query.pending&&months.filter(m=>m>=startMonth&&m<=endMonth).length>36&&h('p',{className:'animations-context',children:'Históricos longos podem levar mais tempo e memória. Reduza a janela para acelerar; mudar os filtros ou sair da aba cancela a consulta anterior.'}),query.error&&h('p',{role:'alert',children:query.error}),
  !query.pending&&!query.error&&frames.length===0&&h('p',{role:'status',children:'Nenhum quadro disponível neste recorte.'}),
  h(PendingChartSnapshot,{pending:query.pending,error:query.error,ready:frames.length>0,compatibilityKey:JSON.stringify([view,actualDimension,actualMode,mixKind,metric,technology,manifest?.schemaVersion]),label:performanceFilterLabel({...requestFilters,date:startMonth+' a '+endMonth,preset,porte,uf}),children:hs(jsxRuntime.Fragment,{children:[
  frames.length>0&&hs('div',{className:'animations-player',children:[h('button',{type:'button',disabled:player.reduced||frames.length<2,onClick:player.toggle,children:player.playing?'Pausar':'Reproduzir'}),h('button',{type:'button',disabled:player.index===0,onClick:()=>player.seek(player.index-1),'aria-label':'Quadro anterior',children:'Anterior'}),h('input',{type:'range',min:0,max:frames.length-1,value:player.index,onChange:e=>player.seek(Number(e.target.value)),'aria-label':'Quadro da animação ('+unit+')','aria-valuetext':frameLabel(frame)}),h('button',{type:'button',disabled:player.index===frames.length-1,onClick:()=>player.seek(player.index+1),'aria-label':'Próximo quadro',children:'Próximo'}),control('Velocidade',String(player.speed),v=>player.setSpeed(Number(v)),[['2000','Lenta · 2 s'],['1000','Normal · 1 s'],['500','Rápida · 0,5 s'],['250','Muito rápida · 0,25 s']]),control('Ir ao '+unit,String(player.index),v=>player.seek(Number(v)),frames.map((f,i)=>[String(i),frameLabel(f)])),h('output',{'aria-live':player.playing?'off':'polite',children:frameLabel(frame)}),player.reduced&&h('p',{children:'Movimento reduzido ativo: avance manualmente pelos quadros.'})]}),
  frame&&!frame.complete&&h('p',{role:'alert',className:'animations-warning',children:'Cobertura incompleta neste mês. Valores indisponíveis não são zero; consulte a tabela e as notas de cobertura.'}),
  frame&&view==='races'&&hs(jsxRuntime.Fragment,{children:[h(AnimationRace,{frames,frame,dimension:actualDimension,topN,pinMIT,ytd:actualMode==='ytd',metric:actualDimension==='uf'?'mitCount':'count'}),h(AnimationLeadership,{frames,frame,dimension:actualDimension,metric:actualDimension==='uf'?'mitCount':'count',onSelect:i=>player.seek(typeof i==='number'?i:frames.findIndex(f=>f.month===i))})]}),
  frame&&view==='bubbles'&&h(AnimationBubbles,{frames,frame,dimension:actualDimension==='uf'?'marca':actualDimension,topN,trail}),frame&&view==='mix'&&h(AnimationMix,{frames,frame,kind:mixKind}),frame&&view==='maps'&&h(AnimationMaps,{frames,frame,metric,technology,uf,dataBase:base,brand:focusBrand}),frame&&view==='heat'&&h(AnimationHeat,{frames,frame,brands:activeHeat,commonScale,dataBase:base}),
  frames.length>0&&h('button',{type:'button',onClick:()=>download('animacoes-'+view+'-'+startMonth+'-'+endMonth+'.csv',exportRows()),children:'Exportar valores de todos os quadros · CSV'}),
  hs('footer',{className:'animations-method',children:[hs('details',{children:[h('summary',{children:'Como ler · fontes, universo e limites'}),h('p',{children:'Fonte: cubos mensais de emplacamentos e manifesto de cobertura. Cada linha agrega a quantidade count da fonte; não contamos as linhas compactadas. As categorias, marcas e tecnologias respeitam a classificação BD do ano correspondente, sem projeções nem simulações.'}),h('p',{children:'Corridas ordenam pelo volume; empates mantêm ordem estável por nome e são identificados. Top N não muda o denominador. Mitsubishi é identificada pelo fabricante da fonte e pode permanecer visível fora do Top N. No acumulado anual, a soma sempre começa em janeiro; lacunas de cobertura impedem apresentar uma soma completa.'}),h('p',{children:'Nas bolhas, X = participação no universo mensal filtrado, Y = variação contra o mesmo mês do ano anterior, área = volume. Base anterior ausente ou zero não produz crescimento infinito. Eixos e escala de área ficam fixos na janela; os rastros usam somente meses observados. Tabelas apresentam os valores exatos.'}),h('p',{children:'Transformação mostra composição ponderada pelo volume, mantendo não informado. Origem histórica de marca, parceria local e origem LOCAL/IMP do veículo são dimensões distintas. País de fabricação não está disponível. MHEV continua separado de HEV/PHEV/BEV. Canal ausente, especialmente no início da série, permanece desconhecido.'}),h('p',{children:'Brasil no tempo usa malhas oficiais e centróides municipais, que não representam endereço de emplacamento. A participação MIT e a eletrificação usam o mercado dentro dos mesmos filtros. Compare todas as marcas explicitamente se desejar retirar os filtros de marca/modelo. As escalas são fixas na janela. Nenhuma animação inicia sozinha; mudar filtros, visualização ou sair da aba interrompe o player.'}),...(query.result?.notes??[]).map((note,i)=>h('p',{children:typeof note==='string'?note:JSON.stringify(note)},i)),h('p',{children:'Parâmetros ativos: '+JSON.stringify(exportOptions)})]})]})
  ]})})
 ]});
}
