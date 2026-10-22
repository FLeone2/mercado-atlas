// Marca líder por município: one state at a time, every municipality painted with the
// brand that registers most there, under the same global filters (brand filters released).
// A separate section: it does not touch the main zoom map. Municipality × brand comes
// from the market worker ('leaders' mode); outlines are the IBGE state files already
// published in data/geography/.
const LM_MIN_CHOICES=[[10,'10 emplacamentos'],[30,'30 emplacamentos'],[100,'100 emplacamentos']];
const lmGeometryCache=new Map();
function lmBase(value){return String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();}
// Names differ a little between the registrations and the IBGE outlines (d'Água ↔ DE AGUA, D'Oeste ↔ DO OESTE).
// Same municipality, different spelling in the registrations and in the IBGE outlines.
const LM_ALIASES=[['CAMPOS DOS GOITACAZES','CAMPOS DOS GOYTACAZES'],['EMBU','EMBU DAS ARTES'],['LUIZ EDUARDO MAGALHAES','LUIS EDUARDO MAGALHAES'],['PICARRAS','BALNEARIO PICARRAS'],['ARMACAO DE BUZIOS','ARMACAO DOS BUZIOS']];
const LM_ALIAS_INDEX=new Map(LM_ALIASES.flatMap(([a,b])=>[[a,b],[b,a]]));
function lmKeys(name){const b=lmBase(name),clean=s=>s.replace(/[^A-Z0-9]+/g,' ').trim(),keys=[clean(b.replace(/['’`´]/g,'')),clean(b.replace(/\bD['’`´]\s*/g,'DE ')),clean(b.replace(/\bD['’`´]\s*/g,'DO ')),b.replace(/[^A-Z0-9]/g,'')];const alias=LM_ALIAS_INDEX.get(keys[0]);if(alias)keys.push(alias);return [...new Set(keys)];}
// rows: [{municipio, marca, count}] → one entry per municipality with its brand list.
function lmAggregate(rows){
 const byName=new Map();
 for(const r of rows??[]){if(!(r.count>0))continue;let m=byName.get(r.municipio);if(!m){m={name:r.municipio,total:0,brands:[]};byName.set(r.municipio,m);}m.total+=r.count;m.brands.push({brand:r.marca,count:r.count});}
 for(const m of byName.values()){m.brands.sort((a,b)=>b.count-a.count||String(a.brand).localeCompare(String(b.brand)));const [first,second]=m.brands;m.lead=first;m.tie=Boolean(second&&second.count===first.count);m.leadShare=first.count/m.total;}
 return byName;
}
// Attach each outline to its municipality with the same canonical key the other maps use
// (geoKey with the UF aliases), merging historical spellings of one municipality first so
// none of them is lost. Volume that finds no outline is reported apart, never as zero.
function lmMerge(a,b){const brands=new Map();for(const x of [...a.brands,...b.brands])brands.set(x.brand,(brands.get(x.brand)??0)+x.count);const m={name:a.name,total:a.total+b.total,brands:[...brands].map(([brand,count])=>({brand,count})).sort((x,y)=>y.count-x.count||String(x.brand).localeCompare(String(y.brand)))};const [first,second]=m.brands;m.lead=first;m.tie=Boolean(second&&second.count===first.count);m.leadShare=first.count/m.total;return m;}
function lmJoin(features,byName,focus,uf){
 const key=name=>typeof geoKey==='function'?geoKey(name,uf):lmKeys(name)[0];
 const merged=new Map();for(const m of byName.values()){const k=key(m.name),prev=merged.get(k);merged.set(k,prev?lmMerge(prev,m):m);}
 const index=new Map();for(const [k,m] of merged){index.set(k,m);for(const alt of lmKeys(m.name))if(!index.has(alt))index.set(alt,m);}
 const used=new Set(),items=features.map(f=>{let m=index.get(key(f.name))??null;if(!m)for(const k of lmKeys(f.name)){m=index.get(k);if(m)break;}m=m??null;if(m&&used.has(m))m=null;if(m)used.add(m);
  const rank=m&&focus?(m.brands.findIndex(b=>b.brand===focus)+1)||null:null;return {feature:f,m,rank};});
 const total=[...merged.values()].reduce((s,m)=>s+m.total,0),matched=[...used].reduce((s,m)=>s+m.total,0);
 const unmatched=[...merged.values()].filter(m=>!used.has(m)).sort((a,b)=>b.total-a.total);
 return {items,total,matched,coverage:total>0?matched/total:null,unmatched};
}
function lmSummary(items,minimum){
 const led=new Map();let shown=0,small=0,ties=0,empty=0,ledVolume=0;
 for(const it of items){if(!it.m){empty++;continue;}if(it.m.total<minimum){small++;continue;}if(it.m.tie){ties++;continue;}shown++;ledVolume+=it.m.total;const e=led.get(it.m.lead.brand)??{brand:it.m.lead.brand,municipalities:0,volume:0};e.municipalities++;e.volume+=it.m.total;led.set(it.m.lead.brand,e);}
 return {leaders:[...led.values()].sort((a,b)=>b.municipalities-a.municipalities||b.volume-a.volume),shown,small,ties,empty,ledVolume};
}
function lmCentroid(path){const n=path.match(/-?\d+(?:\.\d+)?/g).map(Number);let x=0,y=0,c=0;for(let i=0;i<n.length-1;i+=2){x+=n[i];y+=n[i+1];c++;}return [x/c,y/c];}
async function lmGeometry(base,uf){
 const url=new URL('geography/'+uf+'.json',base).href;
 if(!lmGeometryCache.has(url))lmGeometryCache.set(url,fetch(url,{credentials:'same-origin',redirect:'error'}).then(r=>{if(!r.ok)throw Error('Malha municipal indisponível (HTTP '+r.status+').');return r.json();}).then(g=>{if(g.uf!==uf||!Array.isArray(g.features))throw Error('Malha municipal incompatível.');return g;}).catch(e=>{lmGeometryCache.delete(url);throw e;}));
 return lmGeometryCache.get(url);
}
function lmInitialUF(filters){const v=filters?.uf,list=(Array.isArray(v)?v:v?[v]:[]).filter(x=>x&&x!=='all');return list.length===1&&TBM_UF_NAMES[list[0]]?list[0]:'SP';}
const lmFmtInt=n=>typeof tbmInt==='function'?tbmInt(n):String(n);
const lmFmtPct=x=>typeof tbmPct==='function'?tbmPct(x):String(x);
const lmColor=b=>typeof tbmColor==='function'?tbmColor(b):'var(--chart-1)';
const lmName=b=>typeof tbmName==='function'?tbmName(b):b;
const lmKnown=b=>typeof tbmKnown==='function'?tbmKnown(b):true;

function LeaderMap({filters,base}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const [uf,setUF]=React.useState(()=>lmInitialUF(filters)),[channel,setChannel]=React.useState('VAREJO'),[minimum,setMinimum]=React.useState(30),[highlight,setHighlight]=React.useState(null),[hover,setHover]=React.useState(null),[tip,setTip]=React.useState(null);
 const [geometry,setGeometry]=React.useState({uf:null,data:null,error:null}),[box,setBox]=React.useState(null),drag=React.useRef(null);
 const focus=typeof pulseFocusBrand==='function'?pulseFocusBrand(filters):'MITSUBISHI';
 const local=React.useMemo(()=>({...filters,uf:[uf],municipio:'all',regiao:'all',marca:'all',tipo_venda:channel==='all'?'all':channel}),[canonicalFilterKey(filters),uf,channel]);
 const query=useMarketData(local,true,'leaders',false);
 React.useEffect(()=>{let alive=true;setBox(null);lmGeometry(base,uf).then(data=>{if(!alive)return;const [x,y,w,hh]=data.viewBox.split(/\s+/).map(Number);setGeometry({uf,data,error:null});setBox({x,y,w,h:hh,full:{x,y,w,h:hh}});}).catch(error=>{if(alive)setGeometry({uf,data:null,error:error.message});});return ()=>{alive=false;};},[base,uf]);
 const byName=React.useMemo(()=>lmAggregate(query.result?.municipalBrands),[query.result]);
 const joined=React.useMemo(()=>geometry.data&&geometry.uf===uf?lmJoin(geometry.data.features,byName,focus,uf):null,[geometry,byName,focus,uf]);
 const summary=React.useMemo(()=>joined?lmSummary(joined.items,minimum):null,[joined,minimum]);
 const centroids=React.useMemo(()=>geometry.data?geometry.data.features.map(f=>lmCentroid(f.path)):[],[geometry.data]);
 // Every brand that leads somewhere gets its own colour (identity colours first, free palette slots for the rest).
 const colors=React.useMemo(()=>typeof catalogColorMap==='function'?catalogColorMap([...(summary?.leaders??[]).map(e=>e.brand),focus],'marca'):new Map(),[summary,focus]);
 const colorOf=b=>colors.get(b)??lmColor(b);
 const pending=query.pending||!geometry.data||geometry.uf!==uf,error=query.error||geometry.error;
 const fillFor=it=>{if(!it.m)return 'var(--muted)';if(it.m.total<minimum||it.m.tie)return 'var(--muted)';return colorOf(it.m.lead.brand);};
 const opacityFor=it=>{if(!it.m||it.m.total<minimum||it.m.tie)return 1;const base=.5+.5*Math.min(1,Math.max(0,(it.m.leadShare-.25)/.45));return highlight&&it.m.lead.brand!==highlight?.12:base;};
 const zoom=(factor,cx,cy)=>setBox(b=>{if(!b)return b;const w=Math.min(b.full.w,Math.max(b.full.w/24,b.w/factor)),k=w/b.w,hh=b.h*k,px=cx??b.x+b.w/2,py=cy??b.y+b.h/2;let x=px-(px-b.x)*k,y=py-(py-b.y)*k;x=Math.min(b.full.x+b.full.w-w,Math.max(b.full.x,x));y=Math.min(b.full.y+b.full.h-hh,Math.max(b.full.y,y));return {...b,x,y,w,h:hh};});
 const svgPoint=(e,b)=>{const r=e.currentTarget.getBoundingClientRect();return [b.x+(e.clientX-r.left)/r.width*b.w,b.y+(e.clientY-r.top)/r.height*b.h];};
 // One wheel listener for the life of the svg (a ref callback re-created per render stacked listeners and over-zoomed).
 const latest=React.useRef(null),wheelRef=React.useRef(null);latest.current={box,zoom};
 React.useEffect(()=>{const el=wheelRef.current;if(!el)return;const onWheel=e=>{const {box:b,zoom:z}=latest.current;if(!(e.ctrlKey||e.metaKey)||!b)return;e.preventDefault();const [x,y]=svgPoint(e,b);z(e.deltaY<0?1.25:.8,x,y);};el.addEventListener('wheel',onWheel,{passive:false});return()=>el.removeEventListener('wheel',onWheel);},[Boolean(box&&joined&&!pending)]);
 const down=e=>{if(!box||box.w>=box.full.w-.5)return;drag.current={x:e.clientX,y:e.clientY,box,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId);};
 const move=e=>{const d=drag.current;if(d){const r=e.currentTarget.getBoundingClientRect(),dx=(e.clientX-d.x)/r.width*d.box.w,dy=(e.clientY-d.y)/r.height*d.box.h;if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>3)d.moved=true;if(d.moved){setTip(null);setBox({...d.box,x:Math.min(d.box.full.x+d.box.full.w-d.box.w,Math.max(d.box.full.x,d.box.x-dx)),y:Math.min(d.box.full.y+d.box.full.h-d.box.h,Math.max(d.box.full.y,d.box.y-dy))});return;}}
  const i=e.target?.dataset?.i;if(i===undefined){setHover(null);setTip(null);return;}setHover(+i);setTip({i:+i,x:e.clientX,y:e.clientY});};
 const up=()=>{drag.current=null;};
 const items=joined?.items??[];
 const top=React.useMemo(()=>items.map((it,i)=>({it,i})).filter(x=>x.it.m).sort((a,b)=>b.it.m.total-a.it.m.total).slice(0,12),[items]);
 const focusLead=items.filter(it=>it.m&&it.m.total>=minimum&&!it.m.tie&&it.m.lead.brand===focus).length,focusSecond=items.filter(it=>it.m&&it.m.total>=minimum&&it.rank===2).length,focusPresent=items.filter(it=>it.rank).length;
 // Name only the biggest cities, and never two labels on top of each other.
 const labelled=[];for(const entry of top){if(labelled.length>=5||!box)break;const [cx,cy]=centroids[entry.i];if(labelled.every(o=>Math.hypot(centroids[o.i][0]-cx,centroids[o.i][1]-cy)>box.full.w*.11))labelled.push(entry);}
 const tipItem=tip?items[tip.i]:null;
 const stateTotal=query.result?.total;
 return hs('section',{className:'lm',id:'leader-map','aria-labelledby':'lm-title',children:[
  hs('div',{className:'tbm-head',children:[
   hs('div',{children:[h('h2',{id:'lm-title',children:'Marca líder por município'}),h('p',{children:'A marca que mais emplaca em cada município do estado.'})]}),
   hs('div',{className:'lm-controls',children:[
    hs('label',{className:'hx-select',children:['Estado',h('select',{value:uf,onChange:e=>{setUF(e.target.value);setHighlight(null);},children:Object.entries(TBM_UF_NAMES).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([k,v])=>h('option',{value:k,children:v+' · '+k},k))})]}),
    hs('div',{className:'tbm-channel',children:[h('span',{children:'Canal'}),h('div',{className:'tbm-seg',role:'group','aria-label':'Canal de venda',children:[['VAREJO','Varejo'],['all','Todos os canais']].map(([v,l])=>h('button',{type:'button','aria-pressed':channel===v,onClick:()=>setChannel(v),children:l},v))})]}),
    hs('label',{className:'hx-select',children:['Mínimo para colorir',h('select',{value:minimum,onChange:e=>setMinimum(+e.target.value),children:LM_MIN_CHOICES.map(([v,l])=>h('option',{value:v,children:l},v))})]})]})]}),
  channel==='all'&&h('p',{className:'tbm-warn',children:'Todos os canais inclui locadoras e frotas, que emplacam na sede da empresa e podem “eleger” a líder de uma cidade.'}),
  error&&h('p',{role:'alert',className:'tbm-warn',children:error}),
  pending&&!error&&h('p',{role:'status',className:'tbm-status',children:'Calculando a marca líder de cada município…'}),
  joined&&summary&&!pending&&hs(React.Fragment,{children:[
   h('p',{className:'hx-insight',children:(summary.leaders[0]?lmName(summary.leaders[0].brand)+' lidera em '+lmFmtInt(summary.leaders[0].municipalities)+' dos '+lmFmtInt(summary.shown)+' municípios coloridos de '+TBM_UF_NAMES[uf]+'. ':'Nenhum município atinge o mínimo para colorir neste recorte. ')+(focusLead||focusSecond?lmName(focus)+' lidera em '+lmFmtInt(focusLead)+(focusSecond?' e é a 2ª em '+lmFmtInt(focusSecond):'')+'; está presente em '+lmFmtInt(focusPresent)+' municípios.':lmName(focus)+' está presente em '+lmFmtInt(focusPresent)+' municípios do estado.')}),
   hs('div',{className:'lm-grid',children:[
    hs('figure',{className:'lm-card','data-export-root':'','data-export-title':'Marca líder por município · '+TBM_UF_NAMES[uf],children:[
     hs('figcaption',{className:'hx-cap',children:[h('span',{children:TBM_UF_NAMES[uf]+' · '+(channel==='all'?'todos os canais':'varejo')}),typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'marca-lider-'+uf})]}),
     hs('div',{className:'lm-zoom',children:[h('button',{type:'button','aria-label':'Ampliar',onClick:()=>zoom(1.6),children:'+'}),h('button',{type:'button','aria-label':'Reduzir',onClick:()=>zoom(1/1.6),children:'−'}),h('button',{type:'button',onClick:()=>box&&setBox({...box,...box.full}),children:'Estado inteiro'}),h('span',{className:'tbm-hint',children:'Ctrl + rolagem amplia; arraste para mover'})]}),
     box&&hs('svg',{ref:wheelRef,viewBox:box.x+' '+box.y+' '+box.w+' '+box.h,className:'lm-svg'+(box.w<box.full.w-.5?' is-zoomed':''),role:'img','aria-label':'Mapa da marca líder por município de '+TBM_UF_NAMES[uf],onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,onMouseLeave:()=>{setHover(null);setTip(null);},children:[
      ...items.map((it,i)=>h('path',{d:it.feature.path,'data-i':i,className:'lm-muni'+(hover===i?' is-hover':''),fill:fillFor(it),fillOpacity:opacityFor(it),vectorEffect:'non-scaling-stroke'},it.feature.code)),
      ...labelled.map(({it,i})=>h('text',{x:centroids[i][0],y:centroids[i][1],className:'lm-label',style:{fontSize:Math.max(4,box.w/60)},children:it.feature.name},'l'+it.feature.code))]}),
     hs('div',{className:'hx-legend','data-export-legend':'',children:[...summary.leaders.slice(0,10).map(e=>hs('span',{children:[h('i',{style:{background:colorOf(e.brand)}}),lmName(e.brand)]},e.brand)),hs('span',{children:[h('i',{style:{background:'var(--muted)',border:'1px solid var(--border-strong)'}}),'Poucos emplacamentos / empate / sem dados']},'none')]}),
     jsxRuntime.jsx(HxMethod,{children:'Cor = marca líder; quanto mais forte o tom, maior a parte da líder no município. Cinza: menos de '+minimum+' emplacamentos no período ('+lmFmtInt(summary.small)+' municípios), empate na liderança ('+lmFmtInt(summary.ties)+') ou sem registros ('+lmFmtInt(summary.empty)+'). Cruzamento por nome do município: '+lmFmtPct(joined.coverage)+' dos emplacamentos do estado encontraram o seu contorno.'+(joined.unmatched?.length?' Sem contorno (não contados como zero): '+joined.unmatched.slice(0,5).map(m=>m.name+' '+lmFmtInt(m.total)).join(', ')+(joined.unmatched.length>5?' e mais '+(joined.unmatched.length-5):'')+'.':'')})]}),
    hs('div',{className:'lm-side',children:[
     hs('details',{className:'hx-table-wrap am-geo-tables',children:[h('summary',{children:'Tabela · Quem lidera mais municípios'}),h('table',{className:'hx-table',children:[h('thead',{children:h('tr',{children:['Marca','Municípios','Parcela do volume do estado'].map(c=>h('th',{children:c},c))})}),h('tbody',{children:summary.leaders.slice(0,10).map(e=>h('tr',{className:highlight===e.brand?'is-active':undefined,children:[h('th',{children:hs('button',{type:'button',className:'lm-brand','aria-pressed':highlight===e.brand,onClick:()=>setHighlight(highlight===e.brand?null:e.brand),title:'Destacar no mapa',children:[h('i',{style:{background:colorOf(e.brand)}}),lmName(e.brand)]})}),h('td',{children:lmFmtInt(e.municipalities)}),h('td',{children:stateTotal>0?lmFmtPct(e.volume/stateTotal):lmFmtInt(e.volume)})]},e.brand))})]})]}),
     hs('details',{className:'hx-table-wrap am-geo-tables',children:[h('summary',{children:'Tabela · Maiores municípios e sua líder'}),h('table',{className:'hx-table',children:[h('thead',{children:h('tr',{children:['Município','Emplac.','Líder','Parte da líder',lmName(focus)].map(c=>h('th',{children:c},c))})}),h('tbody',{children:top.map(({it})=>hs('tr',{children:[h('th',{children:it.feature.name}),h('td',{children:lmFmtInt(it.m.total)}),h('td',{children:it.m.tie?'Empate':lmName(it.m.lead.brand)}),h('td',{children:lmFmtPct(it.m.leadShare)}),h('td',{children:it.rank?it.rank+'º':'—'})]},it.feature.code))})]})]})]})]})]}),
  tipItem&&tipItem.m&&hs('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:[h('strong',{children:tipItem.feature.name}),...tipItem.m.brands.slice(0,3).map((b,k)=>hs('div',{className:'tbm-tip-row',children:[hs('span',{children:[h('i',{style:{background:colorOf(b.brand)}}),(k+1)+'º '+lmName(b.brand)]}),h('span',{children:lmFmtInt(b.count)+' · '+lmFmtPct(b.count/tipItem.m.total)})]},b.brand)),hs('div',{className:'tbm-tip-row tbm-muted',children:[h('span',{children:'Total no município'}),h('span',{children:lmFmtInt(tipItem.m.total)})]}),tipItem.m.total<minimum&&h('div',{className:'tbm-muted',children:'Abaixo do mínimo para colorir'})]}),
  tipItem&&!tipItem.m&&hs('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:[h('strong',{children:tipItem.feature.name}),h('div',{className:'tbm-muted',children:'Sem emplacamentos neste recorte (ou nome não encontrado)'})]})
 ]});
}
if(typeof module!=='undefined'&&module.exports)module.exports={lmKeys,lmAggregate,lmJoin,lmSummary,lmInitialUF};
