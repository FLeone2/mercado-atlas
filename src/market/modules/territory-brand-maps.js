/* Territory brand maps: top 3 brands per state, municipal spikes and states in 3D.
   Live data from the same worker as the rest of the dashboard: brand × UF comes
   from the exploration query, municipal and state volumes from the primary-map
   aggregate. Global filters apply; UF and municipality are released (national
   view) and the channel has its own local switch, Varejo by default, because
   fleet registrations at company headquarters distort territorial reading. */
const TBM_NAMES={FIAT:'Fiat',VW:'VW',BYD:'BYD',GM:'GM',TOYOTA:'Toyota',HYUNDAI:'Hyundai',RENAULT:'Renault',JEEP:'Jeep',HONDA:'Honda',NISSAN:'Nissan',GEELY:'Geely',GWM:'GWM',FORD:'Ford',CITROEN:'Citroën',PEUGEOT:'Peugeot','CAOA CHERY':'Caoa Chery','OMODA JAECOO':'Omoda Jaecoo',MITSUBISHI:'Mitsubishi'};
const TBM_UF_NAMES={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
const tbmName=b=>TBM_NAMES[b]??(String(b).charAt(0)+String(b).slice(1).toLowerCase());
// Every brand with an identity color (src/brand-colors.js) is painted; the rest are hatched and named.
const tbmKnown=b=>typeof brandColorKnown==='function'&&brandColorKnown(b);
const tbmColor=b=>tbmKnown(b)?brandColor(b):'var(--tbm-other)';
const tbmInt=n=>n==null||!Number.isFinite(n)?'—':Math.round(n).toLocaleString('pt-BR');
const tbmPct=x=>x==null||!Number.isFinite(x)?'—':(x*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const tbmEase=t=>1-Math.pow(1-t,3);
const tbmReducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const tbmPointsCache=new Map();

function useTbmPoints(base){
 const [state,setState]=React.useState(()=>({data:tbmPointsCache.get(base)??null,error:null}));
 React.useEffect(()=>{if(tbmPointsCache.has(base)){setState({data:tbmPointsCache.get(base),error:null});return;}let active=true;const controller=new AbortController();
  fetch(new URL('geography/municipal-points.json',base),{signal:controller.signal,credentials:'same-origin',redirect:'error'}).then(r=>{if(!r.ok)throw Error('Posições municipais indisponíveis.');return r.json();})
   .then(data=>{if(data.version!==1||!Array.isArray(data.rows))throw Error('Posições municipais incompatíveis.');tbmPointsCache.set(base,data);if(active)setState({data,error:null});})
   .catch(e=>{if(active&&e.name!=='AbortError')setState({data:null,error:e.message});});
  return()=>{active=false;controller.abort();};},[base]);
 return state;
}

// Brand × UF cells → per state: top 3 brands with their share of the state total.
function tbmTops(result){
 if(!result?.cells)return null;
 const others=result.seriesOthersLabel,byUF=new Map();
 for(const c of result.cells){if(!TBM_UF_NAMES[c.x])continue;const e=byUF.get(c.x)??{total:c.categoryDenominator??null,list:[]};if(c.series!==others&&c.observedCount>0)e.list.push({b:c.series,v:c.observedCount});byUF.set(c.x,e);}
 for(const e of byUF.values()){e.list.sort((a,b)=>b.v-a.v);if(!(e.total>0))e.total=e.list.reduce((s,x)=>s+x.v,0);e.top=e.list.slice(0,3).map(x=>({...x,s:x.v/e.total}));}
 return byUF;
}

// Brand strength per UF: share in the state ÷ national share × 100 (100 = Brazil average).
function tbmStrength(result,brand){
 if(!result?.cells||!brand)return null;let num=0,den=0;const rows=new Map();
 for(const c of result.cells){if(!TBM_UF_NAMES[c.x]||!(c.categoryDenominator>0))continue;if(!rows.has(c.x))rows.set(c.x,{uf:c.x,total:c.categoryDenominator,count:0});if(c.series===brand)rows.get(c.x).count=c.observedCount;}
 for(const r of rows.values()){num+=r.count;den+=r.total;}
 const national=den>0?num/den:0;if(!(national>0))return null;
 for(const r of rows.values()){r.share=r.count/r.total;r.index=r.share/national*100;}
 return {national,rows};
}
const tbmStates=()=>value$3.features.map(f=>{const n=f.path.match(/-?\d+(?:\.\d+)?/g).map(Number);let sx=0,sy=0,c=0;for(let i=0;i<n.length;i+=2){sx+=n[i];sy+=n[i+1];c++;}return {uf:f.uf,d:f.path,p:new Path2D(f.path),cx:sx/c,cy:sy/c,n};});

/* ---------- orbit view shared by the two canvases ---------- */
function tbmGeometry(states){
 const out=[];states.forEach(s=>{for(let i=0;i<s.n.length;i+=8)out.push([s.n[i],s.n[i+1]]);});
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;out.forEach(([x,y])=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);});
 const C=[(x0+x1)/2,(y0+y1)/2];let R=0;
 // Widest extent over all rotations, so the scale never pulses while orbiting.
 for(let k=0;k<36;k++){const t=k*Math.PI/36,a=Math.cos(t),b=Math.sin(t);let lo=1e9,hi=-1e9;for(const [x,y] of out){const r=a*(x-C[0])-b*(y-C[1]);lo=Math.min(lo,r);hi=Math.max(hi,r);}R=Math.max(R,hi-lo);}
 return {C,R:R*1.03};
}
function tbmProjection(view,geo,w,Hmax){
 const s=w*.96/geo.R,ky=Math.cos(view.tilt*Math.PI/180),hz=Math.sin(view.tilt*Math.PI/180),a=Math.cos(view.yaw*Math.PI/180),b=Math.sin(view.yaw*Math.PI/180),[cx,cy]=geo.C;
 const H=Math.round(geo.R*s*ky+Hmax*hz+34),ox=w/2,oy=Hmax*hz+18+geo.R*s*ky/2;
 return {s,ky,H,Hz:Hmax*hz,
  P:(x,y)=>{const dx=x-cx,dy=y-cy;return [ox+(a*dx-b*dy)*s,oy+(b*dx+a*dy)*s*ky];},
  mat:(dpr,z=0)=>[dpr*a*s,dpr*b*s*ky,-dpr*b*s,dpr*a*s*ky,dpr*(ox-s*(a*cx-b*cy)),dpr*(oy-z-s*ky*(b*cx+a*cy))]};
}
function useOrbit(home){
 const [view,setView]=React.useState(home),[spin,setSpin]=React.useState(false),drag=React.useRef(null),anim=React.useRef(0),current=React.useRef(home);
 current.current=view;
 const animateTo=React.useCallback(target=>{cancelAnimationFrame(anim.current);setSpin(false);if(tbmReducedMotion()){setView(target);return;}
  const from=current.current,t0=performance.now(),dy=((target.yaw-from.yaw+540)%360)-180;
  const step=now=>{const k=Math.min(1,(now-t0)/650),e=tbmEase(k);setView({yaw:from.yaw+dy*e,tilt:from.tilt+(target.tilt-from.tilt)*e});if(k<1)anim.current=requestAnimationFrame(step);};anim.current=requestAnimationFrame(step);},[]);
 React.useEffect(()=>{if(!spin)return;let last=performance.now(),id;const step=now=>{setView(v=>({...v,yaw:((v.yaw+(now-last)*.012)%360+540)%360-180}));last=now;id=requestAnimationFrame(step);};id=requestAnimationFrame(step);return()=>cancelAnimationFrame(id);},[spin]);
 React.useEffect(()=>()=>cancelAnimationFrame(anim.current),[]);
 const handlers={
  onPointerDown:e=>{drag.current={x:e.clientX,y:e.clientY,view,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId);setSpin(false);},
  onPointerMove:e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.moved&&Math.abs(dx)+Math.abs(dy)<4)return;d.moved=true;setView({yaw:((d.view.yaw+dx*.45)%360+540)%360-180,tilt:Math.max(home.minT,Math.min(home.maxT,d.view.tilt-dy*.3))});},
  onPointerUp:()=>{drag.current=null;},onPointerCancel:()=>{drag.current=null;}};
 return {view,setView,spin,setSpin,animateTo,handlers,dragging:()=>Boolean(drag.current?.moved)};
}
function OrbitControls({orbit,home}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const views=[['Frente',{yaw:0,tilt:home.tilt}],['Lado oeste',{yaw:-90,tilt:72}],['Lado leste',{yaw:90,tilt:72}],['De trás',{yaw:180,tilt:60}]];
 return hs('div',{className:'tbm-orbit',children:[
  h('span',{className:'tbm-hint',children:'Arraste o mapa para girar e inclinar'}),
  h('div',{className:'tbm-seg',role:'group','aria-label':'Pontos de vista',children:views.map(([label,to])=>h('button',{type:'button',onClick:()=>orbit.animateTo(to),children:label},label))}),
  hs('label',{className:'tbm-range',children:['Rotação',h('input',{type:'range',min:-180,max:180,value:Math.round(orbit.view.yaw),'aria-label':'Rotação',onChange:e=>{orbit.setSpin(false);orbit.setView(v=>({...v,yaw:+e.target.value}));}})]}),
  hs('label',{className:'tbm-range',children:['Inclinação',h('input',{type:'range',min:home.minT,max:home.maxT,value:Math.round(orbit.view.tilt),'aria-label':'Inclinação',onChange:e=>orbit.setView(v=>({...v,tilt:+e.target.value}))})]}),
  h('button',{type:'button',className:'tbm-btn','aria-pressed':orbit.spin,onClick:()=>orbit.setSpin(s=>!s),children:orbit.spin?'Pausar giro':'Girar sozinho'}),
  h('button',{type:'button',className:'tbm-btn',onClick:()=>orbit.animateTo(home),children:'Voltar ao início'})]});
}
function useCanvasWidth(ref){
 const [w,setW]=React.useState(0);
 React.useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(([e])=>setW(Math.round(e.contentRect.width)));ro.observe(el);return()=>ro.disconnect();},[ref]);
 return w;
}
// Animate normalized heights toward their targets whenever the data changes.
function useTweened(target){
 const [cur,setCur]=React.useState(target),from=React.useRef(target);
 React.useEffect(()=>{if(!target)return;const start=from.current&&from.current.length===target.length?from.current:target.map(()=>0);if(tbmReducedMotion()){setCur(target);from.current=target;return;}
  const t0=performance.now();let id;const step=now=>{const k=Math.min(1,(now-t0)/650),e=tbmEase(k);const v=target.map((x,i)=>start[i]+(x-start[i])*e);from.current=v;setCur(v);if(k<1)id=requestAnimationFrame(step);};id=requestAnimationFrame(step);return()=>cancelAnimationFrame(id);},[target]);
 return cur;
}
const tbmCss=(el,name)=>getComputedStyle(el).getPropertyValue(name).trim();
function tbmResolve(el,value){const host=el.parentElement??el,probe=document.createElement('span');probe.style.color=value;host.appendChild(probe);const c=getComputedStyle(probe).color;probe.remove();return c;}
let tbmPixel=null;
// Any CSS color (rgb, color(srgb …), oklab …) → rgb by painting one pixel.
function tbmShade(color,f){tbmPixel??=document.createElement('canvas').getContext('2d',{willReadFrequently:true});tbmPixel.clearRect(0,0,1,1);tbmPixel.fillStyle='#000';tbmPixel.fillStyle=color;tbmPixel.fillRect(0,0,1,1);const [r,g,b]=tbmPixel.getImageData(0,0,1,1).data;const k=x=>Math.max(0,Math.min(255,Math.round(x*f)));return 'rgb('+k(r)+','+k(g)+','+k(b)+')';}

/* ---------- 1. top 3 per state ---------- */
function TopThreeMap({tops,states}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const [mode,setMode]=React.useState('bands'),[hover,setHover]=React.useState(null),[tip,setTip]=React.useState(null);
 const ufs=states.filter(s=>tops.get(s.uf)?.top?.length);
 const tipFor=uf=>{const e=tops.get(uf);return hs('div',{children:[h('strong',{children:TBM_UF_NAMES[uf]}),...e.top.map((x,i)=>hs('div',{className:'tbm-tip-row',children:[hs('span',{children:[h('i',{style:{background:tbmColor(x.b)}}),(i+1)+'º '+tbmName(x.b)]}),h('span',{children:tbmPct(x.s)})]},x.b)),hs('div',{className:'tbm-tip-row tbm-muted',children:[h('span',{children:'Total no estado'}),h('span',{children:tbmInt(e.total)})]})]});};
 const enter=(uf,e)=>{setHover(uf);setTip({uf,x:e.clientX,y:e.clientY});};
 const leave=()=>{setHover(null);setTip(null);};
 const fill=(uf,pos,id)=>{const e=tops.get(uf);if(pos!=null){const b=e.top[pos]?.b;return b?(tbmKnown(b)?tbmColor(b):'url(#'+id+'-hatch)'):'var(--muted)';}return 'url(#'+id+'-g-'+uf+')';};
 const map=(id,pos,small)=>hs('svg',{viewBox:value$3.viewBox,className:'tbm-svg',role:'img','aria-label':pos==null?'Três primeiras marcas por estado':(pos+1)+'º lugar por estado',children:[
  hs('defs',{children:[
   hs('pattern',{id:id+'-hatch',width:5,height:5,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)',children:[h('rect',{width:5,height:5,fill:'var(--tbm-other)',opacity:.45}),h('rect',{width:2.2,height:5,fill:'var(--tbm-other)'})]}),
   pos==null&&ufs.map(s=>{const e=tops.get(s.uf),sum=e.top.reduce((a,x)=>a+x.v,0),gap=.012;let acc=0;const stops=[];
    e.top.forEach((x,i)=>{const w=x.v/sum,a=acc+(i?gap/2:0),z=acc+w-(i<e.top.length-1?gap/2:0),c=tbmColor(x.b),o=tbmKnown(x.b)?1:.7;
     if(i)stops.push(h('stop',{offset:acc-gap/2,stopColor:'var(--surface)'},'s'+i),h('stop',{offset:a,stopColor:'var(--surface)'},'t'+i));
     stops.push(h('stop',{offset:a,stopColor:c,stopOpacity:o},'a'+i),h('stop',{offset:z,stopColor:c,stopOpacity:o},'z'+i));acc+=w;});
    return h('linearGradient',{id:id+'-g-'+s.uf,children:stops},s.uf);})]}),
  ...ufs.map(s=>h('path',{d:s.d,className:'tbm-state'+(hover&&hover!==s.uf?' is-dim':''),fill:fill(s.uf,pos,id),tabIndex:small?-1:0,role:'img','aria-label':TBM_UF_NAMES[s.uf]+': '+tops.get(s.uf).top.map(x=>tbmName(x.b)+' '+tbmPct(x.s)).join(', '),
   onMouseMove:e=>enter(s.uf,e),onMouseLeave:leave,onFocus:e=>{const r=e.currentTarget.getBoundingClientRect();enter(s.uf,{clientX:r.right,clientY:r.top});},onBlur:leave},s.uf)),
  ...ufs.map(s=>{const lead=tops.get(s.uf).top[pos??0]?.b;return lead&&!tbmKnown(lead)?h('text',{x:s.cx,y:s.cy+3,className:'tbm-label',children:tbmName(lead)},'l'+s.uf):null;})]});
 const rows=[...ufs].sort((a,b)=>tops.get(b.uf).total-tops.get(a.uf).total);
 const shown=new Map();ufs.forEach(s=>tops.get(s.uf).top.forEach(x=>shown.set(x.b,(shown.get(x.b)||0)+x.v)));
 const legendBrands=[...shown.keys()].filter(tbmKnown).sort((a,b)=>shown.get(b)-shown.get(a)),hasOther=[...shown.keys()].some(b=>!tbmKnown(b));
 return hs('div',{className:'tbm-card','data-export-root':'',children:[typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'mapa-marcas'}),
  hs('div',{className:'tbm-card-head',children:[hs('div',{children:[h('h3',{children:'Top 3 marcas por estado'}),h('p',{children:'1ª, 2ª e 3ª marca em cada estado.'})]}),
   h('div',{className:'tbm-seg',role:'group','aria-label':'Forma do mapa',children:[['bands','Faixas'],['multi','1º · 2º · 3º lugar']].map(([v,l])=>h('button',{type:'button','aria-pressed':mode===v,onClick:()=>setMode(v),children:l},v))})]}),
  hs('div',{className:'tbm-legend',children:legendBrands.map(b=>hs('span',{children:[h('i',{style:{background:tbmColor(b)}}),tbmName(b)]},b)).concat(hasOther?[hs('span',{children:[h('i',{className:'tbm-hatch'}),'Outras marcas (nome no mapa e na lista)']},'o')]:[])}),
  hs('div',{className:'tbm-top3',children:[
   h('div',{className:'tbm-fade',children:mode==='bands'?map('tbmb',null,false):h('div',{className:'tbm-multi',children:[0,1,2].map(i=>hs('figure',{children:[h('figcaption',{children:(i+1)+'º lugar'}),map('tbmm'+i,i,true)]},i))})},mode),
   hs('div',{className:'tbm-rank',role:'list',tabIndex:0,'aria-label':'Três primeiras marcas por estado',children:rows.map(s=>{const e=tops.get(s.uf);return hs('div',{role:'listitem',className:'tbm-row'+(hover===s.uf?' is-hl':''),onMouseEnter:()=>setHover(s.uf),onMouseLeave:()=>setHover(null),children:[
    h('b',{children:s.uf}),h('span',{className:'tbm-stack',children:e.top.map(x=>h('span',{className:tbmKnown(x.b)?'':'tbm-hatch',style:{width:(x.s*100).toFixed(1)+'%',background:tbmKnown(x.b)?tbmColor(x.b):undefined},title:tbmName(x.b)+' '+tbmPct(x.s)},x.b))}),
    h('span',{className:'tbm-names',children:e.top.map(x=>tbmName(x.b)).join(' · ')})]},s.uf);})})]}),
  tip&&h('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:tipFor(tip.uf)})]});
}

/* ---------- 1b. brand strength ---------- */
function BrandStrengthMap({result,states}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const brands=React.useMemo(()=>(result?.selectedSeries??[]).filter(b=>b!==result.seriesOthersLabel),[result]);
 const [brand,setBrand]=React.useState(null),chosen=brand&&brands.includes(brand)?brand:brands.includes('MITSUBISHI')?'MITSUBISHI':brands[0];
 const data=React.useMemo(()=>tbmStrength(result,chosen),[result,chosen]),[hover,setHover]=React.useState(null);
 if(!data)return null;
 const fill=r=>{if(!r)return 'var(--muted)';const k=Math.max(-1,Math.min(1,(r.index-100)/60)),pct=Math.round(Math.abs(k)*85);return pct<4?'var(--muted)':'color-mix(in srgb,'+(k>0?'var(--chart-1)':'var(--chart-2)')+' '+pct+'%,var(--muted))';};
 const sorted=[...data.rows.values()].sort((a,b)=>b.index-a.index),best=sorted.slice(0,3).map(r=>r.uf),hr=hover?data.rows.get(hover):null;
 return hs('div',{className:'tbm-card','data-export-root':'',children:[typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'mapa-marcas'}),
  hs('div',{className:'tbm-card-head',children:[hs('div',{children:[h('h3',{children:'Onde '+tbmName(chosen)+' é mais forte: '+best.join(', ')}),h('p',{children:'Participação da marca em cada estado comparada com a média do Brasil ('+tbmPct(data.national)+'). Verde: acima da média; dourado: abaixo.'})]}),
   hs('label',{className:'tbm-range',children:['Marca',h('select',{value:chosen,onChange:e=>setBrand(e.target.value),'aria-label':'Marca',children:brands.map(b=>h('option',{value:b,children:tbmName(b)},b))})]})]}),
  hs('div',{className:'tbm-strength',children:[
   hs('svg',{viewBox:value$3.viewBox,className:'tbm-svg',role:'img','aria-label':'Força de '+tbmName(chosen)+' por estado',children:[
    ...states.map(s=>{const r=data.rows.get(s.uf);return h('path',{d:s.d,className:'tbm-state'+(hover&&hover!==s.uf?' is-dim':''),fill:fill(r),tabIndex:0,role:'img','aria-label':TBM_UF_NAMES[s.uf]+': índice '+(r?Math.round(r.index):'—'),onMouseEnter:()=>setHover(s.uf),onMouseLeave:()=>setHover(null),onFocus:()=>setHover(s.uf),onBlur:()=>setHover(null)},s.uf);}),
    ...states.map(s=>{const r=data.rows.get(s.uf);return r&&Math.abs(r.index-100)>=25?h('text',{x:s.cx,y:s.cy+3,className:'tbm-label',children:Math.round(r.index)},'l'+s.uf):null;})]}),
   hs('div',{className:'tbm-strength-side',children:[
    h('div',{className:'tbm-scale','aria-hidden':true}),hs('div',{className:'tbm-scale-labels',children:[h('span',{children:'40'}),h('span',{children:'100 = Brasil'}),h('span',{children:'160+'})]}),
    h('p',{className:'tbm-readout',role:'status',children:hr?TBM_UF_NAMES[hr.uf]+': '+tbmPct(hr.share)+' do mercado do estado, índice '+Math.round(hr.index)+'.':'Passe o mouse sobre um estado.'}),
    h('ol',{className:'tbm-toplist',children:sorted.slice(0,5).map(r=>hs('li',{children:[h('b',{children:r.uf}),' índice '+Math.round(r.index)+' · '+tbmPct(r.share)]},r.uf))})]})]})]});
}

/* ---------- 2. municipal spikes ---------- */
function SpikeMap({spikes,states,geo,channelLabel}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const wrap=React.useRef(null),canvas=React.useRef(null),w=useCanvasWidth(wrap);
 const home={yaw:0,tilt:55,minT:15,maxT:82},orbit=useOrbit(home);
 const [color,setColor]=React.useState('market'),[hover,setHover]=React.useState(null),[tip,setTip]=React.useState(null);
 const values=color==='mit'?spikes.mit:spikes.market;
 // Network mode: markets without a Mitsubishi dealer in the municipality stand out.
 const gaps=React.useMemo(()=>spikes.market.map((v,i)=>({i,v,has:spikes.dealer[i]})).filter(r=>!r.has&&r.v>0).sort((a,b)=>b.v-a.v).slice(0,8),[spikes]);
 const target=React.useMemo(()=>{const max=Math.max(1,...values);return values.map(v=>v/max);},[values]);
 const cur=useTweened(target);
 const frame=React.useRef(null);
 React.useEffect(()=>{const cv=canvas.current;if(!cv||!w||!cur)return;const dpr=Math.min(devicePixelRatio||1,2),pr=tbmProjection(orbit.view,geo,w,Math.min(260,w*.32));
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(pr.H*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(pr.H*dpr);cv.style.height=pr.H+'px';}
  const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,pr.H);
  ctx.save();ctx.setTransform(...pr.mat(dpr));ctx.fillStyle=tbmResolve(cv,'var(--muted)');ctx.strokeStyle=tbmResolve(cv,'var(--surface)');ctx.lineWidth=1.2/pr.s;states.forEach(s=>{ctx.fill(s.p);ctx.stroke(s.p);});ctx.restore();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const col=tbmResolve(cv,color==='mit'?'var(--mitsubishi-color)':'var(--accent)'),muted=tbmResolve(cv,'var(--tbm-other)'),pts=spikes.points.map(p=>pr.P(p[0],p[1]));
  const order=cur.map((v,i)=>i).filter(i=>cur[i]>.0015).sort((a,b)=>pts[a][1]-pts[b][1]),bw=Math.max(1.6,pr.s*1.6);
  ctx.fillStyle=col;ctx.strokeStyle=col;ctx.lineWidth=.6;
  for(const i of order){const [x,y]=pts[i],hh=cur[i]*pr.Hz;if(color==='network'){const c=spikes.dealer[i]?muted:col;ctx.fillStyle=c;ctx.strokeStyle=c;}ctx.beginPath();ctx.moveTo(x-bw,y);ctx.lineTo(x,y-hh);ctx.lineTo(x+bw,y);ctx.closePath();ctx.globalAlpha=.8;ctx.fill();ctx.globalAlpha=1;ctx.stroke();}
  if(hover!=null&&cur[hover]>.0015){const [x,y]=pts[hover],hh=cur[hover]*pr.Hz;ctx.strokeStyle=tbmResolve(cv,'var(--text)');ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-bw-1,y);ctx.lineTo(x,y-hh-1);ctx.lineTo(x+bw+1,y);ctx.stroke();}
  ctx.font='600 11px '+tbmCss(cv,'--font-sans');ctx.textAlign='center';
  cur.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,3).forEach(([v,i])=>{if(v<.02)return;const [x,y0]=pts[i],y=y0-v*pr.Hz-6;ctx.lineWidth=3;ctx.strokeStyle=tbmResolve(cv,'var(--surface)');ctx.strokeText(spikes.names[i],x,y);ctx.fillStyle=tbmResolve(cv,'var(--text)');ctx.fillText(spikes.names[i],x,y);});
  frame.current={pts,order,pr};
 },[w,cur,orbit.view,hover,color,spikes,states,geo]);
 const move=e=>{const f=frame.current;if(!f||orbit.dragging()){setTip(null);return;}const r=canvas.current.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;let best=null,bd=9;
  for(const i of f.order){const [x,y]=f.pts[i],hh=cur[i]*f.pr.Hz;const d=(py>=y-hh&&py<=y+2)?Math.abs(px-x):Math.hypot(px-x,py-(py<y-hh?y-hh:y));if(d<=bd){bd=d;best=i;}}
  setHover(best);setTip(best==null?null:{i:best,x:e.clientX,y:e.clientY});};
 const top=React.useMemo(()=>{let t=-1;values.forEach((v,i)=>{if(t<0||v>values[t])t=i;});const sum=values.reduce((a,b)=>a+b,0);return t<0?null:{name:spikes.names[t],v:values[t],share:sum>0?values[t]/sum:null};},[values,spikes]);
 return hs('div',{className:'tbm-card','data-export-root':'',children:[typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'mapa-marcas'}),
  hs('div',{className:'tbm-card-head',children:[hs('div',{children:[h('h3',{children:'Espigões por município'}),h('p',{children:'Altura proporcional aos emplacamentos de cada município, '+channelLabel+'.'})]}),
   h('div',{className:'tbm-seg',role:'group','aria-label':'Medida dos espigões',children:[['market','Mercado'],['mit','Mitsubishi'],['network','Rede × oportunidade']].map(([v,l])=>h('button',{type:'button','aria-pressed':color===v,onClick:()=>setColor(v),children:l},v))})]}),
  h(OrbitControls,{orbit,home}),
  h('div',{ref:wrap,className:'tbm-canvas',children:h('canvas',{ref:canvas,role:'img','aria-label':'Mapa de espigões dos municípios brasileiros',...orbit.handlers,onMouseMove:move,onMouseLeave:()=>{setHover(null);setTip(null);}})}),
  color==='network'?hs('div',{className:'tbm-callout',children:[h('b',{children:'Maiores mercados sem concessionária Mitsubishi na cidade: '}),gaps.map(g=>spikes.names[g.i]+' ('+tbmInt(g.v)+')').join(', ')+'. Cinza: municípios com loja da rede (lista de 07/07/2026, localização por município).']}):top&&hs('p',{className:'tbm-callout',children:[h('b',{children:'Maior espigão: '}),top.name+' com '+tbmInt(top.v)+' emplacamentos, '+tbmPct(top.share)+' do total'+(color==='mit'?' da Mitsubishi':'')+'.']}),
  tip&&hs('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:[h('strong',{children:spikes.names[tip.i]}),hs('div',{className:'tbm-tip-row',children:[h('span',{children:'Mercado'}),h('span',{children:tbmInt(spikes.market[tip.i])})]}),hs('div',{className:'tbm-tip-row',children:[h('span',{children:'Mitsubishi'}),h('span',{children:tbmInt(spikes.mit[tip.i])})]})]})]});
}

/* ---------- 3. states in 3D ---------- */
function ExtrudedStates({states,geo,tops,ufTotals,population,channelLabel}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const wrap=React.useRef(null),canvas=React.useRef(null),w=useCanvasWidth(wrap);
 const home={yaw:0,tilt:50,minT:20,maxT:80},orbit=useOrbit(home);
 const [metric,setMetric]=React.useState('volume'),[hover,setHover]=React.useState(null),[tip,setTip]=React.useState(null);
 const pop=React.useMemo(()=>new Map((population?.states??[]).map(s=>[s.name,s.population2026])),[population]);
 const raw=React.useMemo(()=>states.map(s=>{const v=ufTotals.get(s.uf)??0;return metric==='volume'?v:(pop.get(s.uf)>0?v/pop.get(s.uf)*1000:0);}),[states,ufTotals,metric,pop]);
 const target=React.useMemo(()=>{const max=Math.max(1e-9,...raw);return raw.map(v=>v/max);},[raw]);
 const cur=useTweened(target),frame=React.useRef(null);
 React.useEffect(()=>{const cv=canvas.current;if(!cv||!w||!cur)return;const dpr=Math.min(devicePixelRatio||1,2),pr=tbmProjection(orbit.view,geo,w,Math.min(170,w*.2));
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(pr.H*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(pr.H*dpr);cv.style.height=pr.H+'px';}
  const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,pr.H);const surf=tbmResolve(cv,'var(--surface)');
  const cen=states.map(s=>pr.P(s.cx,s.cy)),order=states.map((s,i)=>i).sort((a,b)=>cen[a][1]-cen[b][1]),drawn=[];
  for(const i of order){const s=states[i],hh=(cur[i]||0)*pr.Hz,lead=tops?.get(s.uf)?.top?.[0]?.b,base=tbmResolve(cv,lead?tbmColor(lead):'var(--tbm-other)'),side=tbmShade(base,.62),step=Math.max(1,hh/40);
   for(let z=0;z<hh;z+=step){ctx.setTransform(...pr.mat(dpr,z));ctx.fillStyle=side;ctx.fill(s.p);}
   ctx.setTransform(...pr.mat(dpr,hh));ctx.fillStyle=hover===i?tbmShade(base,1.12):base;ctx.fill(s.p);ctx.strokeStyle=surf;ctx.lineWidth=1/pr.s;ctx.stroke(s.p);drawn.push([i,hh]);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.font='600 11px '+tbmCss(cv,'--font-sans');ctx.textAlign='center';
  target.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,4).forEach(([v,i])=>{const hh=(cur[i]||0)*pr.Hz,[x,y0]=cen[i],t=states[i].uf+' '+(metric==='volume'?tbmInt(raw[i]):raw[i].toLocaleString('pt-BR',{maximumFractionDigits:1}));ctx.lineWidth=3;ctx.strokeStyle=surf;ctx.strokeText(t,x,y0-hh-6);ctx.fillStyle=tbmResolve(cv,'var(--text)');ctx.fillText(t,x,y0-hh-6);});
  frame.current={pr,drawn};
 },[w,cur,orbit.view,hover,metric,states,geo,tops]);
 const move=e=>{const f=frame.current;if(!f||orbit.dragging()){setTip(null);return;}const r=canvas.current.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,ctx=canvas.current.getContext('2d');let hit=null;
  for(let k=f.drawn.length-1;k>=0;k--){const [i,hh]=f.drawn[k];ctx.setTransform(...f.pr.mat(1,hh));if(ctx.isPointInPath(states[i].p,px,py)){hit=i;break;}}
  ctx.setTransform(1,0,0,1,0,0);setHover(hit);setTip(hit==null?null:{i:hit,x:e.clientX,y:e.clientY});};
 return hs('div',{className:'tbm-card','data-export-root':'',children:[typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'mapa-marcas'}),
  hs('div',{className:'tbm-card-head',children:[hs('div',{children:[h('h3',{children:'Brasil em 3D'}),h('p',{children:'Altura = medida escolhida; cor = marca líder.'})]}),
   h('div',{className:'tbm-seg',role:'group','aria-label':'Medida da altura',children:[['volume','Volume'],['per1000','Por mil habitantes']].map(([v,l])=>h('button',{type:'button','aria-pressed':metric===v,onClick:()=>setMetric(v),children:l},v))})]}),
  h(OrbitControls,{orbit,home}),
  h('div',{ref:wrap,className:'tbm-canvas',children:h('canvas',{ref:canvas,role:'img','aria-label':'Estados extrudados em 3D',...orbit.handlers,onMouseMove:move,onMouseLeave:()=>{setHover(null);setTip(null);}})}),
  jsxRuntime.jsx(HxMethod,{children:'População: estimativa oficial do IBGE para 2026. “Por mil habitantes” mostra onde os carros são emplacados, não onde moram os compradores.'}),
  tip&&hs('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:[h('strong',{children:TBM_UF_NAMES[states[tip.i].uf]}),hs('div',{className:'tbm-tip-row',children:[h('span',{children:'Emplacamentos'}),h('span',{children:tbmInt(ufTotals.get(states[tip.i].uf))})]}),hs('div',{className:'tbm-tip-row',children:[h('span',{children:'Por mil habitantes'}),h('span',{children:pop.get(states[tip.i].uf)>0?((ufTotals.get(states[tip.i].uf)??0)/pop.get(states[tip.i].uf)*1000).toLocaleString('pt-BR',{maximumFractionDigits:1}):'—'})]}),tops?.get(states[tip.i].uf)?.top?.[0]&&hs('div',{className:'tbm-tip-row tbm-muted',children:[h('span',{children:'Marca líder'}),h('span',{children:tbmName(tops.get(states[tip.i].uf).top[0].b)})]})]})]});
}

/* ---------- 2b. heat map ---------- */
// Every municipality adds a soft blob of heat at its position; the blobs add up where cities are close
// together. One hue, light to dark (sequential), compressed so the biggest metros do not erase the rest.
// Draws one heat layer: soft alpha blobs per municipality, coloured with a one-hue ramp and clipped to Brazil.
function tbmDrawHeat(cv,w,{points,values,scale,radius,color,states,view,max=Math.max(1,...values)}){
 const [vx,vy,vw,vh]=view;
 const dpr=Math.min(devicePixelRatio||1,2),H=Math.round(w*vh/vw),W=Math.round(w*dpr),HH=Math.round(H*dpr);
  if(cv.width!==W||cv.height!==HH){cv.width=W;cv.height=HH;cv.style.height=H+'px';}
  const ctx=cv.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,HH);
  const k=W/vw,drawStates=(fill,stroke)=>{ctx.save();ctx.setTransform(k,0,0,k,-vx*k,-vy*k);ctx.lineWidth=1.1/k;states.forEach(st=>{if(fill){ctx.fillStyle=fill;ctx.fill(st.p);}ctx.strokeStyle=stroke;ctx.stroke(st.p);});ctx.restore();};
  const surface=tbmResolve(cv,'var(--surface)');drawStates(tbmResolve(cv,'var(--muted)'),surface);
  // 1. accumulate alpha with soft blobs
  const layer=document.createElement('canvas');layer.width=W;layer.height=HH;const lc=layer.getContext('2d',{willReadFrequently:true});
  const weight=v=>scale==='log'?Math.log1p(v)/Math.log1p(max):Math.sqrt(v/max),r0=radius*dpr*(W/(900*dpr));
  const pts=[];
  for(let i=0;i<values.length;i++){const v=values[i];if(!(v>0))continue;const x=(points[i][0]-vx)*k,y=(points[i][1]-vy)*k,wt=weight(v),rad=r0*(.55+.9*wt),a=Math.min(.9,.05+.55*wt);pts.push([x/dpr,y/dpr,i]);
   const g=lc.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,'rgba(0,0,0,'+a+')');g.addColorStop(1,'rgba(0,0,0,0)');lc.fillStyle=g;lc.beginPath();lc.arc(x,y,rad,0,Math.PI*2);lc.fill();}
  // 2. colour the accumulated alpha with a one-hue ramp
  const base=tbmResolve(cv,color),stops=[[0,base,0],[.18,base,.22],[.5,base,.6],[.8,tbmShade(base,.82),.88],[1,tbmShade(base,.6),1]];
  const lut=document.createElement('canvas');lut.width=256;lut.height=1;const lg=lut.getContext('2d',{willReadFrequently:true}),grad=lg.createLinearGradient(0,0,256,0);
  const rgba=(c,a)=>{const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);return m?'rgba('+m[1]+','+m[2]+','+m[3]+','+a+')':c;};
  stops.forEach(([o,c,a])=>grad.addColorStop(o,rgba(tbmShade(c,1),a)));lg.fillStyle=grad;lg.fillRect(0,0,256,1);const ramp=lg.getImageData(0,0,256,1).data;
  const img=lc.getImageData(0,0,W,HH),d=img.data;for(let p=0;p<d.length;p+=4){const a=d[p+3],q=a*4;d[p]=ramp[q];d[p+1]=ramp[q+1];d[p+2]=ramp[q+2];d[p+3]=ramp[q+3];}
  lc.putImageData(img,0,0);
  // Heat stays inside Brazil: clip to the union of the state outlines.
  const country=new Path2D();states.forEach(st=>country.addPath(st.p));ctx.save();ctx.setTransform(k,0,0,k,-vx*k,-vy*k);ctx.clip(country);ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(layer,0,0);ctx.restore();
  drawStates(null,tbmResolve(cv,'var(--surface)'));
  return pts;

}
function HeatMap({spikes,states,channelLabel}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const wrap=React.useRef(null),canvas=React.useRef(null),w=useCanvasWidth(wrap),frame=React.useRef(null);
 const [measure,setMeasure]=React.useState('market'),[scale,setScale]=React.useState('sqrt'),[radius,setRadius]=React.useState(18),[tip,setTip]=React.useState(null);
 const [vx,vy,vw,vh]=React.useMemo(()=>value$3.viewBox.split(/\s+/).map(Number),[]);
 const values=measure==='mit'?spikes.mit:spikes.market;
 const top=React.useMemo(()=>values.map((v,i)=>({i,v})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,5),[values]),total=React.useMemo(()=>values.reduce((a,b)=>a+b,0),[values]);
 React.useEffect(()=>{const cv=canvas.current;if(!cv||!w)return;frame.current={pts:tbmDrawHeat(cv,w,{points:spikes.points,values,scale,radius,color:measure==='mit'?'var(--mitsubishi-color)':'var(--accent)',states,view:[vx,vy,vw,vh]})};
 },[w,values,scale,radius,measure,states,spikes,vx,vy,vw,vh]);
 const move=e=>{const f=frame.current;if(!f)return;const r=canvas.current.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;let best=null,bd=14;for(const [x,y,i] of f.pts){const dd=Math.hypot(px-x,py-y);if(dd<bd||(dd<=bd&&best!=null&&values[i]>values[best])){bd=dd;best=i;}}setTip(best==null?null:{i:best,x:e.clientX,y:e.clientY});};
 return hs('div',{className:'tbm-card tbm-heat','data-export-root':'',children:[typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'mapa-de-calor'}),
  hs('div',{className:'tbm-card-head',children:[hs('div',{children:[h('h3',{children:'Mapa de calor'}),h('p',{children:'Concentração dos emplacamentos '+channelLabel+'; escala relativa.'})]}),
   hs('div',{className:'tbm-heat-controls',children:[h('div',{className:'tbm-seg',role:'group','aria-label':'Medida do mapa de calor',children:[['market','Mercado'],['mit','Mitsubishi']].map(([v,l])=>h('button',{type:'button','aria-pressed':measure===v,onClick:()=>setMeasure(v),children:l},v))}),
    h('div',{className:'tbm-seg',role:'group','aria-label':'Escala de cor',children:[['sqrt','Suave'],['log','Realça o interior']].map(([v,l])=>h('button',{type:'button','aria-pressed':scale===v,onClick:()=>setScale(v),title:v==='sqrt'?'Raiz quadrada: as grandes metrópoles aparecem sem apagar o resto':'Logarítmica: municípios pequenos ganham mais destaque',children:l},v))}),
    hs('label',{className:'tbm-range',children:['Raio',h('input',{type:'range',min:8,max:40,value:radius,'aria-label':'Raio do mapa de calor',onChange:e=>setRadius(+e.target.value)})]})]})]}),
  h('div',{ref:wrap,className:'tbm-canvas',children:h('canvas',{ref:canvas,role:'img','aria-label':'Mapa de calor dos emplacamentos por município',onMouseMove:move,onMouseLeave:()=>setTip(null)})}),
  hs('div',{className:'tbm-heat-scale'+(measure==='mit'?' is-mit':''),children:[h('span',{children:'Menos concentrado'}),h('i',{'aria-hidden':true}),h('span',{children:'Mais concentrado'})]}),
  hs('p',{className:'tbm-callout',children:[h('b',{children:'Maiores pontos: '}),top.map(t=>spikes.names[t.i]+' ('+tbmInt(t.v)+')').join(', ')+'. Juntos, são '+tbmPct(total>0?top.reduce((a,t)=>a+t.v,0)/total:null)+' do total'+(measure==='mit'?' da Mitsubishi':'')+'.']}),
  tip&&hs('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:[h('strong',{children:spikes.names[tip.i]}),hs('div',{className:'tbm-tip-row',children:[h('span',{children:measure==='mit'?'Mitsubishi':'Mercado'}),h('span',{children:tbmInt(values[tip.i])})]})]})]});
}

function TerritoryBrandMaps({filters,manifest,base,view='main'}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const [channel,setChannel]=React.useState('VAREJO');
 const local=React.useMemo(()=>({...filters,uf:'all',municipio:'all',tipo_venda:channel}),[canonicalFilterKey(filters),channel]);
 const market=useMarketData(local,true,'primary-map',false),model=market.result;
 const explore=useExploration({type:'explore',filters:local,xDimension:'uf',seriesDimension:'marca',topN:20,xTopN:50,order:'value_desc',includeOthers:true,highlightBrands:['MITSUBISHI']},manifest,base);
 const points=useTbmPoints(base),population=useCatalogPopulation(base);
 const states=React.useMemo(tbmStates,[]),geo=React.useMemo(()=>tbmGeometry(states),[states]);
 const tops=React.useMemo(()=>tbmTops(explore.result),[explore.result]);
 const ufTotals=React.useMemo(()=>new Map((model?.groups?.uf??[]).map(r=>[r.name,r.count??0])),[model]);
 // Join municipal aggregates ("NOME · UF") to national points by normalized name + UF.
 const spikes=React.useMemo(()=>{if(!points.data||!model)return null;const key=(n,uf)=>catalogMapNormalize(n)+'|'+uf;
  const split=rows=>{const m=new Map();for(const r of rows??[]){const i=String(r.name).lastIndexOf(' · ');if(i<0)continue;m.set(key(r.name.slice(0,i),r.name.slice(i+3)),r.count??0);}return m;};
  const mk=split(model.groups?.municipio),mit=split(model.catalog?.mitsubishi?.groups?.municipio);
  const dealers=new Set((typeof value$2==='undefined'?[]:value$2.municipalities??[]).map(d=>String(d.municipalityCode)));
  const rows=points.data.rows;return {points:rows.map(r=>[r[3],r[4]]),names:rows.map(r=>r[1]+' · '+r[2]),market:rows.map(r=>mk.get(key(r[1],r[2]))??0),mit:rows.map(r=>mit.get(key(r[1],r[2]))??0),dealer:rows.map(r=>dealers.has(String(r[0])))};},[points.data,model]);
 const channelLabel=channel==='VAREJO'?'no varejo':'em todos os canais';
 const loading=market.pending||explore.pending;
 return hs('section',{className:'tbm',id:'territory-brand-maps','aria-labelledby':'tbm-title',children:[
  hs('div',{className:'tbm-head',children:[
   hs('div',{children:[h('h2',{id:'tbm-title',children:view==='3d'?'Em relevo':'Marcas no território'}),h('p',{children:'Visão nacional, com canal próprio.'})]}),
   hs('div',{className:'tbm-channel',children:[h('span',{children:'Canal'}),h('div',{className:'tbm-seg',role:'group','aria-label':'Canal de venda',children:[['VAREJO','Varejo'],['all','Todos os canais']].map(([v,l])=>h('button',{type:'button','aria-pressed':channel===v,onClick:()=>setChannel(v),children:l},v))})]})]}),
  channel==='all'&&h('p',{className:'tbm-warn',children:'Todos os canais inclui locadoras e frotas, que emplacam na sede da empresa. Belo Horizonte e Curitiba aparecem muito maiores do que a demanda das lojas.'}),
  (market.error||explore.error||points.error)&&h('p',{role:'alert',className:'tbm-warn',children:market.error||explore.error||points.error}),
  loading&&!tops&&h('p',{role:'status',className:'tbm-status',children:'Calculando marcas por estado…'}),
  view==='3d'?hs(jsxRuntime.Fragment,{children:[spikes&&h(SpikeMap,{spikes,states,geo,channelLabel}),tops&&model&&h(ExtrudedStates,{states,geo,tops,ufTotals,population:population.data,channelLabel})]}):hs(jsxRuntime.Fragment,{children:[
  tops&&h(TopThreeMap,{tops,states}),
  explore.result&&h(BrandStrengthMap,{result:explore.result,states}),
  spikes&&h(HeatMap,{spikes,states,channelLabel})]})]});
}

if(typeof module!=='undefined'&&module.exports)module.exports={tbmTops,tbmStrength,tbmGeometry,tbmProjection,tbmName,tbmColor};
