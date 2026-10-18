// Long-range analyses on the ten-year monthly history (src/history-data.js):
// Evolução › Ritmo, sazonalidade e meses fora do padrão; Concorrência › De onde veio a
// variação e Modelo contra modelo; Segmentos › Propulsão › Eletrificação em 10 anos;
// Territórios › Emplacamentos por mil habitantes.
const HX_MONTHS=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const hxMonth=m=>HX_MONTHS[+m.slice(5,7)-1]+'/'+m.slice(2,4);
const hxFmt={
 n:v=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('pt-BR').format(Math.round(v)),
 p:(v,d=1)=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:d,maximumFractionDigits:d}).format(v),
 s:(v,d=1)=>v==null||!Number.isFinite(v)?'—':(v>0?'+':'')+new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:d,maximumFractionDigits:d}).format(v),
 sn:v=>v==null||!Number.isFinite(v)?'—':(v>0?'+':v<0?'−':'')+new Intl.NumberFormat('pt-BR').format(Math.abs(Math.round(v))),
 d:(v,d=1)=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v)
};
const hxMedian=list=>{const v=list.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2;};
const hxTicks=(lo,hi)=>typeof chartNiceTicks==='function'?chartNiceTicks(lo,hi,4):[lo,(lo+hi)/2,hi];
function hxWithout(filters,keys){const out={...filters};for(const k of keys)delete out[k];return out;}

// One shared line/bar/area chart: one y-axis, recessive grid, crosshair tooltip, legend.
function HxChart({labels,series=[],band=null,stacked=false,height=260,format=hxFmt.n,yMin=0,tooltip,title,ariaLabel,percentAxis=false,hideLegend=false}){
 const [hover,setHover]=React.useState(null),[width,setWidth]=React.useState(780),box=React.useRef(null),h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,n=labels.length;
 // Draw at the real width so text stays at its CSS size on wide and narrow screens.
 React.useEffect(()=>{const el=box.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(([e])=>{const w=Math.round(e.contentRect.width);if(w>0)setWidth(Math.max(300,w));});ro.observe(el);return ()=>ro.disconnect();},[]);
 const W=width,L=64,R=18,T=14,B=30,PW=W-L-R,PH=height-T-B;
 if(!n)return h('p',{className:'hx-empty',children:'Sem meses disponíveis.'});
 const stack=stacked?labels.map((_,i)=>{let acc=0;return series.map(s=>{const v=s.values[i]??0,y0=acc;acc+=v;return [y0,acc];});}):null;
 const all=[...series.flatMap((s,si)=>stacked?labels.map((_,i)=>stack[i][si][1]):s.values),...(band?[...band.hi]:[])].filter(Number.isFinite);
 const hiRaw=all.length?Math.max(...all):1,ticks=hxTicks(Math.min(yMin,...all),hiRaw*1.04||1),tickStep=ticks.length>1?ticks[1]-ticks[0]:hiRaw||1;while(ticks.at(-1)<hiRaw)ticks.push(ticks.at(-1)+tickStep);const lo=ticks[0],hi=ticks.at(-1)>lo?ticks.at(-1):lo+1;
 const step=PW/n,x=i=>L+(i+.5)*step,y=v=>T+PH-(v-lo)/(hi-lo)*PH,every=Math.max(1,Math.ceil(n/Math.max(3,Math.floor(PW/70))));
 const line=values=>{let d='',pen=false;values.forEach((v,i)=>{if(!Number.isFinite(v)){pen=false;return;}d+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);pen=true;});return d;};
 const area=(top,bottom)=>{const pts=labels.map((_,i)=>[x(i),y(top[i])]),back=labels.map((_,i)=>[x(i),y(bottom[i])]).reverse();return 'M'+pts.map(p=>p.map(c=>c.toFixed(1)).join(' ')).join('L')+'L'+back.map(p=>p.map(c=>c.toFixed(1)).join(' ')).join('L')+'Z';};
 const marks=[];
 for(const t of ticks){marks.push(h('line',{x1:L,x2:W-R,y1:y(t),y2:y(t),className:'hx-grid'},'g'+t));marks.push(h('text',{x:L-8,y:y(t)+4,textAnchor:'end',className:'hx-axis',children:percentAxis?hxFmt.p(t,0):format(t)},'t'+t));}
 labels.forEach((l,i)=>{if(i%every===0||i===n-1)marks.push(h('text',{x:x(i),y:height-8,textAnchor:'middle',className:'hx-axis',children:l},'x'+i));});
 if(band&&band.lo.some(Number.isFinite))marks.push(h('path',{d:area(band.hi.map(v=>v??NaN),band.lo.map(v=>v??NaN)),className:'hx-band'},'band'));
 series.forEach((s,si)=>{
  if(stacked){marks.push(h('path',{d:area(labels.map((_,i)=>stack[i][si][1]),labels.map((_,i)=>stack[i][si][0])),fill:s.color,fillOpacity:.85,stroke:'var(--surface)',strokeWidth:1},s.key));return;}
  if(s.type==='bar'){const bw=Math.max(2,step*.62);s.values.forEach((v,i)=>{if(!Number.isFinite(v))return;const top=y(Math.max(v,lo)),base=y(Math.max(lo,0));marks.push(h('rect',{x:x(i)-bw/2,y:Math.min(top,base),width:bw,height:Math.max(1,Math.abs(base-top)),rx:Math.min(4,bw/2),fill:s.colors?.[i]??s.color,stroke:s.outline?.[i]?'var(--text)':'none',strokeWidth:s.outline?.[i]?1.5:0},s.key+i));});return;}
  marks.push(h('path',{d:line(s.values),fill:'none',stroke:s.color,strokeWidth:s.width??2,strokeDasharray:s.dash,strokeLinejoin:'round',strokeLinecap:'round'},s.key));
  if(s.dots)s.values.forEach((v,i)=>{if(Number.isFinite(v))marks.push(h('circle',{cx:x(i),cy:y(v),r:4,fill:s.color,stroke:'var(--surface)',strokeWidth:2},s.key+'d'+i));});
 });
 if(hover!=null)marks.push(h('line',{x1:x(hover),x2:x(hover),y1:T,y2:T+PH,className:'hx-cross'},'cross'));
 labels.forEach((_,i)=>marks.push(h('rect',{x:L+i*step,y:T,width:step,height:PH,fill:'transparent',onMouseEnter:()=>setHover(i),onFocus:()=>setHover(i),tabIndex:i===n-1?0:-1,onKeyDown:e=>{if(e.key==='ArrowLeft')setHover(v=>Math.max(0,(v??i)-1));if(e.key==='ArrowRight')setHover(v=>Math.min(n-1,(v??i)+1));}},'hit'+i)));
 const tipRows=hover==null?[]:tooltip?tooltip(hover):series.map(s=>[s.name,format(s.values[hover]),s.color]);
 const legendItems=[...series.map(s=>[s.name,s.color,s.dash]),...(band?[[band.name,'band']]:[])];
 return hs('figure',{ref:box,className:'hx-chart','data-export-root':'','data-export-title':title??'',onMouseLeave:()=>setHover(null),children:[
  hs('figcaption',{className:'hx-cap',children:[h('span',{children:title}),typeof ExportImageButton==='function'&&h(ExportImageButton,{name:(title??'grafico').toLowerCase()})]}),
  legendItems.length>1&&h('div',{className:'hx-legend'+(hideLegend?' hx-legend-export':''),'data-export-legend':'',children:legendItems.map(([name,color,dash])=>hs('span',{children:[h('i',{className:color==='band'?'hx-legend-band':dash?'hx-legend-dash':'',style:color==='band'?undefined:{background:color,borderColor:color}}),name]},name))}),
  h('svg',{viewBox:`0 0 ${W} ${height}`,role:'img','aria-label':ariaLabel??title,children:marks}),
  hover!=null&&hs('div',{className:'hx-tip',style:{left:Math.min(78,Math.max(2,(x(hover)/W)*100))+'%'},children:[h('strong',{children:labels[hover]}),...tipRows.map(([k,v,c])=>hs('span',{children:[c&&h('i',{style:{background:c}}),k+': ',h('b',{children:v})]},k))]})
 ]});
}
function HxPanel({title,lead,children,scope}){const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;return hs('section',{className:'hx-panel','aria-label':title,children:[hs('header',{className:'hx-head',children:[h('h2',{children:title}),lead&&h('p',{children:lead})]}),scope,children]});}
function HxSegmented({value,options,onChange,label}){return jsxRuntime.jsx('div',{className:'hx-seg',role:'group','aria-label':label,children:options.map(([v,l])=>jsxRuntime.jsx('button',{type:'button','aria-pressed':value===v,onClick:()=>onChange(v),children:l},v))});}
function HxState({history,children}){if(history.error)return jsxRuntime.jsx('p',{role:'alert',className:'hx-empty',children:history.error});if(history.pending||!history.data)return jsxRuntime.jsx('p',{role:'status',className:'hx-empty',children:'Carregando o histórico…'});return children();}

// ---------- Ritmo por dia útil, sazonalidade e meses fora do padrão ----------
// Expected rate for a month = level (average rate per business day of the 12 previous
// months) × seasonal index of that calendar month (median of month rate ÷ year average
// over the reference years). Months whose residual is beyond 2.5 robust deviations
// (median absolute deviation of all residuals since 2018) are flagged.
function hxRhythmModel(months,endMonth,{excludePandemic=true}={}){
 const index=new Map(months.map((m,i)=>[m.month,i])),end=index.get(endMonth)??months.length-1,Y=+months[end].month.slice(0,4);
 const rate=m=>m&&m.complete&&m.count!=null?m.count/historyWorkingDays(m.month):null;
 const rows=months.map(m=>({...m,days:historyWorkingDays(m.month),rate:rate(m)}));
 const byYear=new Map();for(const r of rows){const y=+r.month.slice(0,4);if(!byYear.has(y))byYear.set(y,new Array(12).fill(null));byYear.get(y)[+r.month.slice(5,7)-1]=r;}
 const fullYears=[...byYear].filter(([y,list])=>y<Y&&list.every(r=>r&&r.rate!=null)).map(([y])=>y).sort((a,b)=>b-a).filter(y=>!(excludePandemic&&(y===2020||y===2021))).slice(0,5).sort((a,b)=>a-b);
 const seasonal=HX_MONTHS.map((_,mi)=>hxMedian(fullYears.map(y=>{const list=byYear.get(y),avg=list.reduce((s,r)=>s+r.rate,0)/12;return list[mi].rate/avg;}))??1);
 const expected=i=>{const prev=rows.slice(Math.max(0,i-12),i).map(r=>r.rate);if(prev.length<12||prev.some(v=>v==null))return null;const level=prev.reduce((s,v)=>s+v,0)/12,mi=+rows[i].month.slice(5,7)-1,avgIndex=rows.slice(i-12,i).reduce((s,r)=>s+seasonal[+r.month.slice(5,7)-1],0)/12;return level/avgIndex*seasonal[mi];};
 const residuals=rows.map((r,i)=>{const e=expected(i);return e&&r.rate!=null?r.rate/e-1:null;});
 const usable=residuals.filter((v,i)=>v!=null&&rows[i].month>='2018-01'&&!(excludePandemic&&/^202[01]/.test(rows[i].month)));
 const med=hxMedian(usable)??0,mad=(hxMedian(usable.map(v=>Math.abs(v-med)))??0.05)*1.4826||0.05;
 const recent=rows.slice(Math.max(0,end-23),end+1).map((r,k)=>{const i=Math.max(0,end-23)+k,e=expected(i),res=residuals[i],z=res==null?null:(res-med)/mad;return {...r,expected:e,residual:res,z,flag:z!=null&&Math.abs(z)>2.5};});
 const current=byYear.get(Y)??[],prior=byYear.get(Y-1)??[];
 const season=HX_MONTHS.map((_,mi)=>{const ref=fullYears.map(y=>byYear.get(y)[mi].rate);return {lo:ref.length?Math.min(...ref):null,hi:ref.length?Math.max(...ref):null,median:hxMedian(ref),current:current[mi]&&current[mi].month<=months[end].month?current[mi].rate:null,prior:prior[mi]?.rate??null,currentCount:current[mi]&&current[mi].month<=months[end].month?current[mi].count:null,priorCount:prior[mi]?.count??null,refCounts:fullYears.map(y=>byYear.get(y)[mi].count)};});
 return {endMonth:months[end].month,year:Y,referenceYears:fullYears,recent,season,seasonal};
}
function RhythmSeasonality({filters,base}){
 const history=useHistory(filters,base),[measure,setMeasure]=React.useState('rate'),[excludePandemic,setExclude]=React.useState(true),h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 return h(HxPanel,{title:'Ritmo, sazonalidade e meses fora do padrão',lead:'Volume por dia útil (sem fins de semana, feriados nacionais, Carnaval e Corpus Christi), comparado com o mesmo mês dos anos anteriores e com o que seria esperado para a época.',scope:h(HistoryScopeNote,{plan:history.plan,extra:'O período global define o mês final; a análise olha para trás a partir dele.'}),children:h(HxState,{history,children:()=>{
  const months=historyMonthly(history.data,filters),end=historyEndMonth(filters,months),model=hxRhythmModel(months,end,{excludePandemic}),last=model.recent.at(-1),seasonRow=model.season[+model.endMonth.slice(5,7)-1];
  const useRate=measure==='rate',val=(rate,count)=>useRate?rate:count,unit=useRate?' por dia útil':'';
  const refLabel=model.referenceYears.length?model.referenceYears[0]+'–'+model.referenceYears.at(-1)+(excludePandemic&&model.referenceYears.some(y=>y>2021)&&model.referenceYears[0]<2020?' (sem 2020–2021)':''):'sem anos completos de referência';
  const vsMedian=seasonRow.median&&seasonRow.current!=null?seasonRow.current/seasonRow.median-1:null,inBand=seasonRow.current!=null&&seasonRow.lo!=null?seasonRow.current<seasonRow.lo?'abaixo':seasonRow.current>seasonRow.hi?'acima':'dentro':null;
  const flagged=model.recent.filter(r=>r.flag).reverse();
  return hs(jsxRuntime.Fragment,{children:[
   hs('div',{className:'hx-controls',children:[h(HxSegmented,{label:'Medida',value:measure,onChange:setMeasure,options:[['rate','Por dia útil'],['count','Volume do mês']]}),hs('label',{className:'hx-check',children:[h('input',{type:'checkbox',checked:excludePandemic,onChange:e=>setExclude(e.target.checked)}),'Excluir 2020 e 2021 (pandemia) da referência']})]}),
   h('p',{className:'hx-insight',children:last?.rate!=null?hxMonth(model.endMonth)+': '+hxFmt.n(last.rate)+' emplacamentos por dia útil ('+last.days+' dias úteis), '+(vsMedian==null?'sem referência histórica':hxFmt.s(vsMedian)+' sobre a mediana de '+HX_MONTHS[+model.endMonth.slice(5,7)-1]+' em '+refLabel+(inBand?', '+inBand+' da faixa histórica':''))+'. '+(last.residual!=null?'Contra o esperado para a época: '+hxFmt.s(last.residual)+'.':''):'Mês final sem dados completos.'}),
   hs('div',{className:'hx-grid2',children:[
    h(HxChart,{title:'Últimos 24 meses'+unit,labels:model.recent.map(r=>hxMonth(r.month)),height:250,series:[{key:'actual',name:useRate?'Por dia útil':'Volume',type:'bar',color:'var(--chart-1)',colors:model.recent.map(r=>r.flag?(r.residual>0?'var(--positive)':'var(--negative)'):'var(--chart-1)'),outline:model.recent.map(r=>r.flag),values:model.recent.map(r=>val(r.rate,r.count))},{key:'expected',name:'Esperado para a época',color:'var(--text)',dash:'5 4',width:1.5,values:model.recent.map(r=>r.expected==null?null:useRate?r.expected:r.expected*r.days)}],
     tooltip:i=>{const r=model.recent[i];return [['Volume',hxFmt.n(r.count)],['Dias úteis',String(r.days)],['Por dia útil',hxFmt.n(r.rate)],['Esperado',hxFmt.n(useRate?r.expected:r.expected*r.days)],['Desvio',hxFmt.s(r.residual)+(r.flag?' · fora do padrão':'')]];}}),
    h(HxChart,{title:'Sazonalidade'+unit,labels:HX_MONTHS,height:250,band:{name:'Faixa '+refLabel,lo:model.season.map(s=>useRate?s.lo:s.refCounts.length?Math.min(...s.refCounts):null),hi:model.season.map(s=>useRate?s.hi:s.refCounts.length?Math.max(...s.refCounts):null)},series:[{key:'median',name:'Mediana '+refLabel,color:'var(--secondary)',dash:'4 4',width:1.5,values:model.season.map(s=>useRate?s.median:hxMedian(s.refCounts))},{key:'prior',name:String(model.year-1),color:'var(--chart-2)',values:model.season.map(s=>val(s.prior,s.priorCount))},{key:'current',name:String(model.year),color:'var(--chart-1)',width:2.5,dots:true,values:model.season.map(s=>val(s.current,s.currentCount))}]})
   ]}),
   hs('div',{className:'hx-flags',children:[h('h3',{children:'Meses fora do padrão (últimos 24)'}),flagged.length?h('ul',{children:flagged.slice(0,6).map(r=>h('li',{children:hs('span',{children:[h('b',{children:(r.residual>0?'▲ ':'▼ ')+hxMonth(r.month)}),': '+hxFmt.s(r.residual,0)+' contra o esperado para a época ('+hxFmt.n(r.rate)+' por dia útil; esperado '+hxFmt.n(r.expected)+').']})},r.month))}):h('p',{children:'Nenhum mês ficou fora do padrão: todos dentro de 2,5 desvios robustos do esperado.'})]}),
   h('p',{className:'hx-method',children:'Esperado = média por dia útil dos 12 meses anteriores × índice sazonal do mês (mediana de '+refLabel+'). Fora do padrão = desvio maior que 2,5 desvios robustos (MAD) dos desvios desde 2018. Indica onde olhar, não a causa.'})
  ]});
 }})});
}

// ---------- De onde veio a variação (mercado × mix de segmentos × desempenho) ----------
// V = M · Σ w_k · s_k (mercado, peso do segmento, participação da marca no segmento).
// ΔV = ΔM·s0 + M1·Σ(w1−w0)·s0 + M1·Σ w1·(s1−s0): exata, sem resíduo.
function hxPeriodMonths(filters,months){
 const d=String(filters?.date??''),m=/^(\d{4}-\d{2})-\d{2}\.\.(\d{4}-\d{2})-\d{2}$/.exec(d),list=months.map(x=>x.month);
 if(!m)return list.slice(-1);return list.filter(x=>x>=m[1]&&x<=m[2]);
}
function hxDecomposition(data,filters,focus,periodMonths){
 const marketFilters=hxWithout(filters,['marca','modelo','grupo_modelo']),{rows,countIndex}=historyRows(data,marketFilters);
 const mi=new Map(data.months.map((m,i)=>[m.month,i])),cur=new Set(periodMonths.map(m=>mi.get(m))),prior=new Set(periodMonths.map(m=>mi.get(`${+m.slice(0,4)-1}${m.slice(4)}`)).filter(v=>v!=null));
 if(prior.size!==cur.size)return null;
 const si=data.dimensions.indexOf('bd_segmento')+1,bi=data.dimensions.indexOf('marca')+1,segs=data.dictionaries.bd_segmento,brands=data.dictionaries.marca,focusCode=brands.indexOf(focus);
 const agg=()=>({M:0,V:0,seg:new Map()}),A=agg(),B=agg();
 for(const r of rows){const t=cur.has(r[0])?B:prior.has(r[0])?A:null;if(!t)continue;const n=r[countIndex],k=segs[r[si]];let s=t.seg.get(k);if(!s){s={m:0,b:0};t.seg.set(k,s);}s.m+=n;t.M+=n;if(r[bi]===focusCode){s.b+=n;t.V+=n;}}
 if(!A.M||!B.M)return null;
 const s0=A.V/A.M,keys=new Set([...A.seg.keys(),...B.seg.keys()]);let mix=0,perf=0;const bySeg=[];
 for(const k of keys){const a=A.seg.get(k)??{m:0,b:0},b=B.seg.get(k)??{m:0,b:0},w0=a.m/A.M,w1=b.m/B.M,s0k=a.m?a.b/a.m:0,s1k=b.m?b.b/b.m:0,mixK=B.M*(w1-w0)*s0k,perfK=B.M*w1*(s1k-s0k);mix+=mixK;perf+=perfK;bySeg.push({segment:k,mix:mixK,perf:perfK,share0:s0k,share1:s1k,volume0:a.b,volume1:b.b});}
 return {V0:A.V,V1:B.V,M0:A.M,M1:B.M,market:(B.M-A.M)*s0,mix,perf,bySeg:bySeg.sort((x,y)=>Math.abs(y.perf)-Math.abs(x.perf))};
}
function ShareDecomposition({filters,base}){
 const focus=typeof pulseFocusBrand==='function'?pulseFocusBrand(filters):'MITSUBISHI',name=focus.charAt(0)+focus.slice(1).toLowerCase(),history=useHistory(hxWithout(filters,['marca','modelo','grupo_modelo']),base),h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 return h(HxPanel,{title:'De onde veio a variação da '+name,lead:'A mudança de volume contra o mesmo período do ano anterior, separada em três partes que somam exatamente a variação total.',scope:h(HistoryScopeNote,{plan:history.plan,extra:'Usa os meses completos do período global contra os mesmos meses do ano anterior; filtros de marca e modelo não se aplicam ao mercado.'}),children:h(HxState,{history,children:()=>{
  const months=historyMonthly(history.data,{}),period=hxPeriodMonths(filters,months),d=hxDecomposition(history.data,filters,focus,period);
  if(!d)return h('p',{className:'hx-empty',children:'Sem o mesmo período no ano anterior para comparar.'});
  const back=m=>`${+m.slice(0,4)-1}${m.slice(4)}`,steps=[['start',hxMonth(back(period[0]))+(period.length>1?'–'+hxMonth(back(period.at(-1))):'')+' (ano anterior)',d.V0,'total'],['market','Tamanho do mercado',d.market,'delta'],['mix','Mix de segmentos',d.mix,'delta'],['perf','Desempenho dentro dos segmentos',d.perf,'delta'],['end',hxMonth(period[0])+(period.length>1?'–'+hxMonth(period.at(-1)):'')+' (atual)',d.V1,'total']];
  let run=0;const bars=steps.map(([key,label,v,kind])=>{const from=kind==='total'?0:run,to=kind==='total'?v:run+v;if(kind==='total')run=v;else run=to;return {key,label,v,kind,from:Math.min(from,to),to:Math.max(from,to)};});
  const max=Math.max(...bars.map(b=>b.to),1),min=Math.min(0,...bars.map(b=>b.from)),scale=v=>((v-min)/(max-min))*100;
  const top=d.bySeg.filter(s=>Math.abs(s.perf)>=1&&!(typeof HIDDEN_CATEGORIES!=='undefined'&&HIDDEN_CATEGORIES.has(s.segment))).slice(0,3);
  const sentence=(v,pos,neg)=>Math.abs(v)<0.5?null:(v>0?pos:neg).replace('{v}',hxFmt.n(Math.abs(v)));
  return hs(jsxRuntime.Fragment,{children:[
   h('div',{className:'hx-waterfall',role:'img','aria-label':'Variação de '+hxFmt.n(d.V0)+' para '+hxFmt.n(d.V1)+' emplacamentos',children:bars.map(b=>hs('div',{className:'hx-wf-row',children:[h('span',{className:'hx-wf-label',children:b.label}),h('div',{className:'hx-wf-track',children:h('i',{className:'hx-wf-bar hx-wf-'+(b.kind==='total'?'total':b.v>=0?'up':'down'),style:{left:scale(b.from)+'%',width:Math.max(.4,scale(b.to)-scale(b.from))+'%'}})}),h('b',{children:b.kind==='total'?hxFmt.n(b.v):hxFmt.sn(b.v)})]},b.key))}),
   h('ul',{className:'hx-bullets',children:[
    sentence(d.market,'O mercado cresceu e, mantida a participação, isso traria {v} emplacamentos a mais.','O mercado encolheu e, mantida a participação, isso tiraria {v} emplacamentos.'),
    sentence(d.mix,'Os segmentos onde a '+name+' atua ganharam peso no mercado: +{v}.','Os segmentos onde a '+name+' atua perderam peso no mercado: −{v}.'),
    sentence(d.perf,'Dentro dos seus segmentos, a '+name+' ganhou participação: +{v}.','Dentro dos seus segmentos, a '+name+' perdeu participação: −{v}.')
   ].filter(Boolean).map((t,i)=>h('li',{children:t},i))}),
   top.length>0&&hs('div',{className:'hx-table-wrap',children:[h('h3',{children:'Onde o desempenho mudou'}),h('table',{className:'hx-table',children:[h('thead',{children:h('tr',{children:['Segmento','Participação antes','Participação agora','Efeito no volume'].map(c=>h('th',{children:c},c))})}),h('tbody',{children:top.map(s=>hs('tr',{children:[h('th',{children:s.segment}),h('td',{children:hxFmt.p(s.share0,2)}),h('td',{children:hxFmt.p(s.share1,2)}),h('td',{children:hxFmt.sn(s.perf)})]},s.segment))})]})]}),
   h('p',{className:'hx-method',children:'Mercado = variação do mercado × participação anterior. Mix = mudança no peso de cada segmento × participação anterior da marca nele. Desempenho = mudança da participação da marca dentro de cada segmento. Segmento = porte (bd_segmento).'})
  ]});
 }})});
}

// ---------- Modelo contra modelo ----------
function hxGroupStats(data,filters,months){
 const {rows,countIndex}=historyRows(data,hxWithout(filters,['marca','modelo','grupo_modelo'])),gi=data.dimensions.indexOf('grupo_modelo')+1,bi=data.dimensions.indexOf('marca')+1,si=data.dimensions.indexOf('bd_segmento')+1,ti=data.dimensions.indexOf('tipo_venda')+1,pi=data.dimensions.indexOf('propulsao')+1;
 const D=data.dictionaries,pos=new Map(months.map((m,i)=>[data.months.findIndex(x=>x.month===m),i])),groups=new Map(),segTotals=new Map();
 for(const r of rows){const k=pos.get(r[0]);if(k==null)continue;const n=r[countIndex],g=D.grupo_modelo[r[gi]],seg=D.bd_segmento[r[si]];let e=groups.get(g);if(!e){e={name:g,series:new Array(months.length).fill(0),brands:new Map(),segs:new Map(),vd:0,elec:0,total:0};groups.set(g,e);}e.series[k]+=n;e.total+=n;e.brands.set(D.marca[r[bi]],(e.brands.get(D.marca[r[bi]])??0)+n);e.segs.set(seg,(e.segs.get(seg)??0)+n);if(D.tipo_venda[r[ti]]==='VD')e.vd+=n;if(['HEV','PHEV','BEV','MHEV'].includes(D.propulsao[r[pi]]))e.elec+=n;const st=segTotals.get(seg)??new Array(months.length).fill(0);st[k]+=n;segTotals.set(seg,st);}
 for(const e of groups.values()){e.brand=[...e.brands].sort((a,b)=>b[1]-a[1])[0][0];e.segment=[...e.segs].sort((a,b)=>b[1]-a[1])[0][0];}
 return {groups,segTotals};
}
function ModelDuel({filters,base}){
 const focus=typeof pulseFocusBrand==='function'?pulseFocusBrand(filters):'MITSUBISHI',duelFilters=hxWithout(filters,['marca','modelo','grupo_modelo','uf','regiao','municipio']),history=useHistory(duelFilters,base),[picked,setPicked]=React.useState(null),[windowSize,setWindow]=React.useState(24),[measure,setMeasure]=React.useState('count'),h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 return h(HxPanel,{title:'Modelo contra modelo',lead:'Escolha até quatro grupos de modelos e compare volume mensal, participação no segmento, canal e eletrificação.',scope:h(HistoryScopeNote,{plan:{...history.plan,ignored:[...new Set([...history.plan.ignored,...['uf','regiao','municipio'].filter(k=>historySelection(filters[k]).length)])],ignoredLabels:[...new Set([...history.plan.ignoredLabels,...['uf','regiao','municipio'].filter(k=>historySelection(filters[k]).length).map(k=>HISTORY_FILTER_LABELS[k])])]},extra:'Comparação nacional; filtros de marca e modelo não restringem os concorrentes. Grupos seguem o nome da fonte: uma troca de nome (por exemplo, L200 → Triton) aparece como outro grupo, que você pode adicionar. Preço não faz parte da base de emplacamentos.'}),children:h(HxState,{history,children:()=>{
  const all=historyMonthly(history.data,{}),end=historyEndMonth(filters,all),endIndex=all.findIndex(m=>m.month===end),months=all.slice(Math.max(0,endIndex-windowSize+1),endIndex+1).map(m=>m.month),last12=all.slice(Math.max(0,endIndex-11),endIndex+1).map(m=>m.month),prev12=all.slice(Math.max(0,endIndex-23),Math.max(0,endIndex-11)).map(m=>m.month);
  const stats=hxGroupStats(history.data,duelFilters,months),s12=hxGroupStats(history.data,duelFilters,last12),p12=hxGroupStats(history.data,duelFilters,prev12);
  const ranked=[...s12.groups.values()].sort((a,b)=>b.total-a.total);
  const defaults=(()=>{const own=ranked.find(g=>g.brand===focus);if(!own)return ranked.slice(0,3).map(g=>g.name);return [own.name,...ranked.filter(g=>g.segment===own.segment&&g.brand!==focus).slice(0,2).map(g=>g.name)];})();
  const chosen=(picked??defaults).filter(n=>stats.groups.has(n)||s12.groups.has(n)).slice(0,4);
  const brandsDistinct=new Set(chosen.map(n=>s12.groups.get(n)?.brand)).size===chosen.length,palette=['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)'];
  const colorOf=(n,i)=>brandsDistinct&&typeof brandColor==='function'?brandColor(s12.groups.get(n)?.brand??n):palette[i];
  const toggle=n=>{const cur=picked??defaults;setPicked(cur.includes(n)?cur.filter(x=>x!==n):[...cur,n].slice(-4));};
  const series=chosen.map((n,i)=>{const g=stats.groups.get(n),seg=g?stats.segTotals.get(g.segment):null;return {key:n,name:n,color:colorOf(n,i),width:2,values:months.map((_,k)=>!g?null:measure==='share'?(seg?.[k]?g.series[k]/seg[k]:null):g.series[k])};});
  const options=ranked.slice(0,60);
  return hs(jsxRuntime.Fragment,{children:[
   hs('div',{className:'hx-controls',children:[h(HxSegmented,{label:'Janela',value:windowSize,onChange:setWindow,options:[[12,'12 meses'],[24,'24 meses'],[60,'5 anos']]}),h(HxSegmented,{label:'Medida',value:measure,onChange:setMeasure,options:[['count','Volume'],['share','Participação no segmento']]}),hs('label',{className:'hx-select',children:['Adicionar grupo',h('select',{value:'',onChange:e=>{if(e.target.value)toggle(e.target.value);},children:[h('option',{value:'',children:'Escolha (top 60 em 12 meses)'}),...options.map(g=>h('option',{value:g.name,disabled:chosen.includes(g.name),children:g.name+' · '+g.brand},g.name))]})]})]}),
   h('div',{className:'hx-chips',children:chosen.map((n,i)=>hs('button',{type:'button',className:'hx-chip',onClick:()=>toggle(n),'aria-label':'Remover '+n,children:[h('i',{style:{background:colorOf(n,i)}}),n,h('span',{'aria-hidden':true,children:' ×'})]},n))}),
   chosen.length?h(HxChart,{title:'Modelo contra modelo',labels:months.map(hxMonth),height:280,hideLegend:true,series,percentAxis:measure==='share',format:measure==='share'?v=>hxFmt.p(v,1):hxFmt.n}):h('p',{className:'hx-empty',children:'Escolha ao menos um grupo de modelos.'}),
   chosen.length>0&&h('div',{className:'hx-table-wrap',children:h('table',{className:'hx-table',children:[h('thead',{children:h('tr',{children:['Grupo','Marca','Segmento','12 meses','vs 12 anteriores','Part. no segmento','Venda direta','Eletrificado'].map(c=>h('th',{children:c},c))})}),h('tbody',{children:chosen.map(n=>{const g=s12.groups.get(n),p=p12.groups.get(n),seg=g?s12.segTotals.get(g.segment)?.reduce((a,b)=>a+b,0):0;return hs('tr',{children:[h('th',{children:n}),h('td',{children:g?.brand??'—'}),h('td',{children:g?.segment??'—'}),h('td',{children:hxFmt.n(g?.total)}),h('td',{children:p?.total?hxFmt.s(g.total/p.total-1):'—'}),h('td',{children:g&&seg?hxFmt.p(g.total/seg,1):'—'}),h('td',{children:g?.total?hxFmt.p(g.vd/g.total,0):'—'}),h('td',{children:g?.total?hxFmt.p(g.elec/g.total,0):'—'})]},n);})})]})})
  ]});
 }})});
}

// ---------- Eletrificação em 10 anos ----------
const HX_TECHS=[['HEV','Híbrido (HEV)'],['PHEV','Híbrido plug-in (PHEV)'],['BEV','Elétrico (BEV)'],['MHEV','Híbrido leve (MHEV)']];
function ElectrificationHistory({filters,base}){
 const scoped=hxWithout(filters,['propulsao','bd_combustivel']),history=useHistory(scoped,base),[windowSize,setWindow]=React.useState(60),h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 return h(HxPanel,{title:'Eletrificação ao longo dos anos',lead:'Parcela de cada tecnologia no mercado, mês a mês, e as marcas que mais vendem eletrificados.',scope:h(HistoryScopeNote,{plan:history.plan,extra:'O filtro de propulsão não se aplica aqui, para mostrar o mercado inteiro.'}),children:h(HxState,{history,children:()=>{
  const months=historyMonthly(history.data,scoped,'propulsao'),end=historyEndMonth(filters,months),ei=months.findIndex(m=>m.month===end),view=months.slice(Math.max(0,ei-windowSize+1),ei+1);
  const series=HX_TECHS.map(([k,label],i)=>({key:k,name:label,color:['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)'][i],values:view.map(m=>m.count>0?(m.groups.get(k)??0)/m.count:null)}));
  const share=m=>m&&m.count>0?HX_TECHS.reduce((s,[k])=>s+(m.groups.get(k)??0),0)/m.count:null,now=share(view.at(-1)),ago=share(months[ei-12]);
  // Brands, last 12 months vs the 12 before.
  const {rows,countIndex}=historyRows(history.data,scoped),D=history.data.dictionaries,bi=history.data.dimensions.indexOf('marca')+1,pi=history.data.dimensions.indexOf('propulsao')+1,idx=new Map(history.data.months.map((m,i)=>[m.month,i])),endIdx=idx.get(end),brands=new Map();
  for(const r of rows){const age=endIdx-r[0];if(age<0||age>23)continue;const b=D.marca[r[bi]],e=['HEV','PHEV','BEV','MHEV'].includes(D.propulsao[r[pi]]),n=r[countIndex];let x=brands.get(b);if(!x){x={name:b,elec:0,total:0,prevElec:0};brands.set(b,x);}if(age<12){x.total+=n;if(e)x.elec+=n;}else if(e)x.prevElec+=n;}
  const top=[...brands.values()].filter(b=>b.elec>0).sort((a,b)=>b.elec-a.elec).slice(0,10);
  return hs(jsxRuntime.Fragment,{children:[
   hs('div',{className:'hx-controls',children:[h(HxSegmented,{label:'Janela',value:windowSize,onChange:setWindow,options:[[24,'24 meses'],[60,'5 anos'],[129,'Tudo (2016+)']]})]}),
   h('p',{className:'hx-insight',children:'Em '+hxMonth(end)+', '+hxFmt.p(now,1)+' dos emplacamentos foram eletrificados'+(ago!=null?' (eram '+hxFmt.p(ago,1)+' um ano antes).':'.')}),
   h(HxChart,{title:'Eletrificação no mercado',labels:view.map(m=>hxMonth(m.month)),height:260,stacked:true,series,percentAxis:true,format:v=>hxFmt.p(v,1),tooltip:i=>[...series.map(s=>[s.name,hxFmt.p(s.values[i],2),s.color]),['Total eletrificado',hxFmt.p(share(view[i]),1)]]}),
   top.length>0&&h('div',{className:'hx-table-wrap',children:h('table',{className:'hx-table',children:[h('thead',{children:h('tr',{children:['Marca','Eletrificados em 12 meses','% das vendas da marca','vs 12 meses anteriores'].map(c=>h('th',{children:c},c))})}),h('tbody',{children:top.map(b=>hs('tr',{children:[h('th',{children:b.name}),h('td',{children:hxFmt.n(b.elec)}),h('td',{children:hxFmt.p(b.total?b.elec/b.total:null,0)}),h('td',{children:b.prevElec>=500?hxFmt.s(b.elec/b.prevElec-1,0):b.prevElec>0?'base pequena ('+hxFmt.n(b.prevElec)+')':'novo'})]},b.name))})]})})
  ]});
 }})});
}

// ---------- Emplacamentos por mil habitantes ----------
const hxPopulationCache=new Map();
function hxPopulation(base){const url=new URL('reference/population.json',base).href;if(!hxPopulationCache.has(url))hxPopulationCache.set(url,fetch(url,{credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error('População indisponível (HTTP '+r.status+').');return r.json();}).catch(e=>{hxPopulationCache.delete(url);throw e;}));return hxPopulationCache.get(url);}
const hxNorm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
function PenetrationMap({filters,base}){
 const [population,setPopulation]=React.useState(null),[error,setError]=React.useState(null),[who,setWho]=React.useState('market'),[hover,setHover]=React.useState(null),h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 React.useEffect(()=>{let alive=true;hxPopulation(base).then(p=>{if(alive)setPopulation(p);}).catch(e=>{if(alive)setError(e.message);});return ()=>{alive=false;};},[base]);
 const focus=pulseFocusBrand(filters),name=focus.charAt(0)+focus.slice(1).toLowerCase();
 // One query: the market result carries the focus brand (result.focus, with its UF groups).
 const market=useMarketData(pulseFilters(filters,focus).market,true,'pulse',false,focus),src=who==='market'?market.result:(market.result?.focus?.brand===focus?market.result.focus:null);
 const body=()=>{
  if(error)return h('p',{role:'alert',className:'hx-empty',children:error});
  if(!population||!src)return h('p',{role:'status',className:'hx-empty',children:'Carregando…'});
  const ufRows=(src.groups?.uf??[]).map(r=>({uf:r.name,count:r.count,pop:population.states[r.name]})).filter(r=>r.pop),rate=new Map(ufRows.map(r=>[r.uf,r.count/r.pop*1000]));
  const values=[...rate.values()].sort((a,b)=>a-b),q=k=>values[Math.min(values.length-1,Math.floor(k*values.length))],breaks=[q(.2),q(.4),q(.6),q(.8)],cls=v=>breaks.filter(b=>v>b).length;
  const shades=[14,32,50,70,90].map(p=>`color-mix(in oklab, var(--accent) ${p}%, var(--surface))`);
  const national=population&&src.total?src.total/Object.values(population.states).reduce((a,b)=>a+b,0)*1000:null;
  const popIndex=new Map(population.municipalities.map(([code,mun,uf,pop])=>[hxNorm(mun)+'|'+uf,{pop,name:mun}]));
  const cities=(src.groups?.municipio??[]).map(r=>{const [mun,uf]=String(r.name).split(' · ');const ref=popIndex.get(hxNorm(mun)+'|'+uf);return ref?{name:ref.name,uf,count:r.count,pop:ref.pop,rate:r.count/ref.pop*1000}:null;}).filter(r=>r&&r.pop>=50000).sort((a,b)=>b.rate-a.rate);
  const states=typeof tbmStates==='function'?tbmStates():[];
  const fmt=v=>hxFmt.d(v,v<1?2:1);
  return hs(jsxRuntime.Fragment,{children:[
   hs('div',{className:'hx-controls',children:[h(HxSegmented,{label:'Quem',value:who,onChange:setWho,options:[['market','Mercado'],['focus',name]]})]}),
   h('p',{className:'hx-insight',children:'Brasil: '+fmt(national)+' emplacamentos por mil habitantes no período'+(who==='focus'?' ('+name+')':'')+'. Maior: '+(ufRows.length?[...ufRows].sort((a,b)=>rate.get(b.uf)-rate.get(a.uf))[0].uf+' ('+fmt(Math.max(...values))+')':'—')+'.'}),
   hs('div',{className:'hx-grid2',children:[
    hs('figure',{className:'hx-chart hx-map','data-export-root':'','data-export-title':'Emplacamentos por mil habitantes'+(who==='focus'?' · '+name:''),onMouseLeave:()=>setHover(null),children:[
     hs('figcaption',{className:'hx-cap',children:[h('span',{children:'Por mil habitantes, por UF'}),typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'penetracao-uf'})]}),
     h('div',{className:'hx-legend','data-export-legend':'',children:shades.map((c,i)=>hs('span',{children:[h('i',{style:{background:c}}),i===0?'até '+fmt(breaks[0]):i===4?'acima de '+fmt(breaks[3]):fmt(breaks[i-1])+'–'+fmt(breaks[i])]},i))}),
     h('svg',{viewBox:value$3.viewBox,role:'img','aria-label':'Emplacamentos por mil habitantes por UF',children:states.map(s=>{const v=rate.get(s.uf);return h('path',{d:s.d,fill:v==null?'var(--muted)':shades[cls(v)],stroke:hover===s.uf?'var(--text)':'var(--surface)',strokeWidth:hover===s.uf?1.6:.8,onMouseEnter:()=>setHover(s.uf),tabIndex:0,onFocus:()=>setHover(s.uf),children:h('title',{children:s.uf+': '+fmt(v)+' por mil habitantes'})},s.uf);})}),
     hover&&hs('div',{className:'hx-tip hx-tip-map',children:[h('strong',{children:hover}),hs('span',{children:['Por mil habitantes: ',h('b',{children:fmt(rate.get(hover))})]}),hs('span',{children:['Emplacamentos: ',h('b',{children:hxFmt.n(ufRows.find(r=>r.uf===hover)?.count)})]}),hs('span',{children:['População '+population.year+': ',h('b',{children:hxFmt.n(population.states[hover])})]})]})
    ]}),
    hs('div',{className:'hx-table-wrap',children:[h('h3',{children:'Municípios com 50 mil habitantes ou mais'}),h('table',{className:'hx-table',children:[h('thead',{children:h('tr',{children:['Município','Por mil hab.','Emplacamentos','População'].map(c=>h('th',{children:c},c))})}),h('tbody',{children:cities.slice(0,12).map(c=>hs('tr',{children:[h('th',{children:c.name+' · '+c.uf}),h('td',{children:fmt(c.rate)}),h('td',{children:hxFmt.n(c.count)}),h('td',{children:hxFmt.n(c.pop)})]},c.name+c.uf))})]})]})
   ]}),
   h('p',{className:'hx-method',children:'Emplacamentos do período com os filtros globais ÷ população '+population.year+' × 1.000. População: '+population.source+' '+population.year+'; a UF soma os '+hxFmt.n(population.municipalities.length)+' municípios com população publicada. Município pelo nome e UF da fonte de emplacamentos; o local é o de registro do veículo, não necessariamente o de uso. Frotas de locadoras concentram registros em poucos municípios.'})
  ]});
 };
 return h(HxPanel,{title:'Emplacamentos por mil habitantes',lead:'Onde o mercado (ou a marca em foco) é mais denso em relação à população: aponta espaço para crescer.',children:body()});
}
if(typeof module!=='undefined'&&module.exports)module.exports={hxRhythmModel,hxDecomposition,hxGroupStats,hxPeriodMonths,hxMedian,hxNorm};
