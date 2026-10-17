// Concorrência › "Do veículo ao segmento": Sankey of origin (nacional/importado) → channel
// (varejo/venda direta) → fuel → vehicle type. Each ribbon keeps the origin colour end to
// end because the worker returns whole paths, not pairs of columns. Global filters apply.
const FLOW_COLUMNS=[['origem','Origem'],['canal','Canal de venda'],['combustivel','Combustível'],['segmento','Tipo de veículo']];
const FLOW_ORDER={origem:['Nacional','Importado'],canal:['Varejo','Venda direta','Canal não informado'],combustivel:['Flex','Gasolina','Etanol','Diesel','Híbrido leve','Híbrido','Híbrido plug-in','Elétrico']};
const FLOW_ORIGIN_COLORS={Nacional:'var(--chart-1)',Importado:'var(--chart-2)'};
const flowFmt={n:v=>Math.round(v).toLocaleString('pt-BR'),p:v=>(v*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'};
// Paths → nodes per column and links per origin. Unclassified vehicles leave the picture (and are reported); small vehicle types fold into "Outros".
function flowModel(paths,{topSegments=8}={}){
 const usable=[],dropped={count:0};
 for(const p of paths??[]){if(p.origem==='Não classificado'||p.combustivel==='Não classificado'||p.segmento==='Não classificado'){dropped.count+=p.count;continue;}usable.push(p);}
 const bySegment=new Map();for(const p of usable)bySegment.set(p.segmento,(bySegment.get(p.segmento)??0)+p.count);
 const keep=new Set([...bySegment].filter(([k])=>k!=='Outros').sort((a,b)=>b[1]-a[1]).slice(0,topSegments).map(([k])=>k));
 const rows=usable.map(p=>({...p,segmento:keep.has(p.segmento)?p.segmento:'Outros'}));
 const total=rows.reduce((s,p)=>s+p.count,0),nodes=FLOW_COLUMNS.map(([key,title])=>{
  const totals=new Map();for(const p of rows)totals.set(p[key],(totals.get(p[key])??0)+p.count);
  const fixed=FLOW_ORDER[key],names=[...totals.keys()].sort((a,b)=>fixed?(fixed.indexOf(a)<0?99:fixed.indexOf(a))-(fixed.indexOf(b)<0?99:fixed.indexOf(b)):(a==='Outros')-(b==='Outros')||totals.get(b)-totals.get(a));
  return {key,title,nodes:names.map(name=>({name,value:totals.get(name)}))};
 });
 const links=[];
 for(let c=0;c<FLOW_COLUMNS.length-1;c++){const a=FLOW_COLUMNS[c][0],b=FLOW_COLUMNS[c+1][0],map=new Map();
  for(const p of rows){const k=JSON.stringify([p[a],p[b],p.origem]);map.set(k,(map.get(k)??0)+p.count);}
  for(const [k,value] of map){const [from,to,origin]=JSON.parse(k);links.push({col:c,from,to,origin,value});}}
 const top=[...rows].sort((x,y)=>y.count-x.count).slice(0,10);
 return {total,dropped:dropped.count,columns:nodes,links,top,rows};
}
// Vertical layout: one scale for every column; gaps are spread so each column fills the same height.
function flowLayout(model,{width,height,nodeWidth=14,left=132,right=176}){
 const cols=model.columns,count=Math.max(...cols.map(c=>c.nodes.length)),minGap=10,scale=(height-(count-1)*minGap)/model.total,step=(width-left-right-nodeWidth)/(cols.length-1);
 const placed=cols.map((col,ci)=>{const gap=col.nodes.length>1?(height-model.total*scale)/(col.nodes.length-1):0;let y=0;return col.nodes.map(n=>{const node={...n,col:ci,x:left+ci*step,y,h:n.value*scale};y+=node.h+gap;return node;});});
 const find=(ci,name)=>placed[ci].find(n=>n.name===name);
 const originRank=o=>FLOW_ORDER.origem.indexOf(o);
 // Ribbons leave and enter nodes in the order of the node at the other end (fewer crossings), then by origin.
 const out=new Map(),inn=new Map();
 for(const l of model.links){const s=find(l.col,l.from),t=find(l.col+1,l.to);if(!s||!t)continue;const it={l,s,t};(out.get(s)??out.set(s,[]).get(s)).push(it);(inn.get(t)??inn.set(t,[]).get(t)).push(it);}
 const ribbons=[];
 for(const [node,list] of out){list.sort((a,b)=>cols[a.t.col].nodes.findIndex(n=>n.name===a.t.name)-cols[b.t.col].nodes.findIndex(n=>n.name===b.t.name)||originRank(a.l.origin)-originRank(b.l.origin));let y=node.y;for(const it of list){it.y0=y;y+=it.l.value*scale;}}
 for(const [node,list] of inn){list.sort((a,b)=>cols[a.s.col].nodes.findIndex(n=>n.name===a.s.name)-cols[b.s.col].nodes.findIndex(n=>n.name===b.s.name)||originRank(a.l.origin)-originRank(b.l.origin));let y=node.y;for(const it of list){it.y1=y;y+=it.l.value*scale;}}
 for(const list of out.values())for(const it of list){const x0=it.s.x+nodeWidth,x1=it.t.x,xm=(x0+x1)/2,th=it.l.value*scale;
  ribbons.push({...it.l,sourceNode:it.s,targetNode:it.t,thickness:th,d:`M${x0},${it.y0}C${xm},${it.y0} ${xm},${it.y1} ${x1},${it.y1}L${x1},${it.y1+th}C${xm},${it.y1+th} ${xm},${it.y0+th} ${x0},${it.y0+th}Z`});}
 // Labels keep 13px between lines, so small nodes (gasolina, etanol, minivan…) are named too.
 for(const col of placed){let last=-1e9;for(const n of col){n.labelY=Math.max(n.y+n.h/2+4,last+13);last=n.labelY;}}
 return {nodes:placed.flat(),ribbons,scale,step};
}
function FlowSankey({filters,base}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const query=useMarketData(filters,true,'flow',false),box=React.useRef(null),[width,setWidth]=React.useState(900),[focus,setFocus]=React.useState(null),[tip,setTip]=React.useState(null);
 React.useEffect(()=>{const el=box.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(([e])=>{const w=Math.round(e.contentRect.width);if(w>0)setWidth(Math.max(680,w));});ro.observe(el);return()=>ro.disconnect();},[query.result]);
 const model=React.useMemo(()=>query.result?.flowPaths?flowModel(query.result.flowPaths):null,[query.result]);
 const H=420,T=34,layout=React.useMemo(()=>model&&model.total>0?flowLayout(model,{width,height:H}):null,[model,width]);
 const share=v=>model?.total>0?v/model.total:null;
 const nodeTotal=(col,name)=>model?.columns[col].nodes.find(n=>n.name===name)?.value??0;
 const insight=model&&model.total>0?[flowFmt.p(share(nodeTotal(0,'Importado')))+' importados','venda direta em '+flowFmt.p(share(nodeTotal(1,'Venda direta'))),'flex em '+flowFmt.p(share(nodeTotal(2,'Flex'))),'eletrificados (híbridos e elétricos) em '+flowFmt.p(share(['Híbrido leve','Híbrido','Híbrido plug-in','Elétrico'].reduce((s,n)=>s+nodeTotal(2,n),0)))].join(' · '):null;
 const touches=r=>!focus||(focus.col===r.sourceNode.col&&focus.name===r.sourceNode.name)||(focus.col===r.targetNode.col&&focus.name===r.targetNode.name)||(focus.origin&&r.origin===focus.origin&&false);
 const pick=(n,e)=>{if(e?.type==='keydown'&&!['Enter',' '].includes(e.key))return;if(e?.type==='keydown')e.preventDefault();setFocus(f=>f&&f.col===n.col&&f.name===n.name?null:{col:n.col,name:n.name});};
 const noData=query.result&&!query.pending&&(!model||model.total===0);
 return hs('section',{className:'fs hx-panel','aria-labelledby':'fs-title',children:[
  hs('header',{className:'hx-head',children:[h('h2',{id:'fs-title',children:'Do veículo ao segmento: origem, canal e combustível'}),h('p',{children:'Cada faixa é um grupo de emplacamentos e mantém a cor da origem do começo ao fim. A largura é proporcional ao volume. Clique em uma caixa para destacar o caminho dela.'})]}),
  h('p',{className:'hx-scope',children:'Período e filtros do painel, incluindo marca. Origem vem do cadastro da classificação (nacional = montado no Brasil; importado = trazido pronto). Canal informado só a partir de 2018.'}),
  query.error&&h('p',{role:'alert',className:'hx-empty',children:query.error}),
  query.pending&&h('p',{role:'status',className:'hx-empty',children:'Montando os caminhos…'}),
  noData&&h('p',{className:'hx-empty',role:'status',children:'Sem emplacamentos classificados neste recorte.'}),
  layout&&!query.pending&&hs(React.Fragment,{children:[
   h('p',{className:'hx-insight',children:flowFmt.n(model.total)+' emplacamentos: '+insight+'.'}),
   hs('figure',{ref:box,className:'hx-chart fs-chart','data-export-root':'','data-export-title':'Origem, canal, combustível e tipo de veículo',onMouseLeave:()=>setTip(null),children:[
    hs('figcaption',{className:'hx-cap',children:[h('span',{children:'Caminhos dos emplacamentos'}),typeof ExportImageButton==='function'&&h(ExportImageButton,{name:'sankey-origem-canal-combustivel'})]}),
    hs('div',{className:'hx-legend','data-export-legend':'',children:Object.entries(FLOW_ORIGIN_COLORS).map(([name,color])=>hs('span',{children:[h('i',{style:{background:color}}),name]},name))}),
    h('div',{className:'fs-scroll',children:hs('svg',{viewBox:`0 0 ${width} ${H+T+8}`,width:'100%',role:'img','aria-label':'Sankey: origem, canal de venda, combustível e tipo de veículo',children:[
     ...model.columns.map((c,ci)=>h('text',{x:layout.nodes.find(n=>n.col===ci).x+(ci===0?0:ci===model.columns.length-1?14:0),y:14,className:'hx-axis fs-title-col',textAnchor:ci===model.columns.length-1?'end':'start',children:c.title.toUpperCase()},'c'+ci)),
     hs('g',{transform:`translate(0,${T})`,children:[
      ...layout.ribbons.map((r,i)=>h('path',{d:r.d,fill:FLOW_ORIGIN_COLORS[r.origin]??'var(--secondary)',className:'fs-ribbon',style:{opacity:focus?(touches(r)?.7:.08):.42},onMouseMove:e=>setTip({x:e.clientX,y:e.clientY,r}),onMouseLeave:()=>setTip(null)},'r'+i)),
      ...layout.nodes.map(n=>{const last=n.col===model.columns.length-1,first=n.col===0,active=focus&&focus.col===n.col&&focus.name===n.name;return hs('g',{className:'fs-node'+(active?' is-active':''),role:'button',tabIndex:0,'aria-pressed':Boolean(active),'aria-label':n.name+': '+flowFmt.n(n.value)+' emplacamentos, '+flowFmt.p(share(n.value)),onClick:e=>pick(n,e),onKeyDown:e=>pick(n,e),onMouseMove:e=>setTip({x:e.clientX,y:e.clientY,node:n}),onMouseLeave:()=>setTip(null),children:[
       h('rect',{x:n.x,y:n.y,width:14,height:Math.max(1.5,n.h),rx:3,className:'fs-bar'}),
       hs('text',{x:first?n.x-8:last?n.x+14+8:n.x+14+7,y:n.labelY,textAnchor:first?'end':'start',className:'fs-label',children:[n.name,h('tspan',{className:'fs-pct',dx:6,children:flowFmt.p(share(n.value))})]})]},n.col+n.name);})]})]})}),
    tip&&hs('div',{className:'tbm-tip',style:{left:tip.x+14,top:tip.y+14},children:tip.r?[h('strong',{key:'t',children:tip.r.origin}),hs('div',{key:'a',className:'tbm-tip-row',children:[h('span',{children:tip.r.from+' → '+tip.r.to}),h('span',{children:flowFmt.n(tip.r.value)})]}),h('div',{key:'b',className:'tbm-muted',children:flowFmt.p(share(tip.r.value))+' do total'})]:[h('strong',{key:'t',children:tip.node.name}),hs('div',{key:'a',className:'tbm-tip-row',children:[h('span',{children:'Emplacamentos'}),h('span',{children:flowFmt.n(tip.node.value)})]}),h('div',{key:'b',className:'tbm-muted',children:flowFmt.p(share(tip.node.value))+' do total'})]})]}),
   hs('div',{className:'hx-table-wrap',children:[h('h3',{children:'Dez maiores caminhos'}),h('table',{className:'hx-table',children:[h('thead',{children:h('tr',{children:['Origem','Canal','Combustível','Tipo de veículo','Emplacamentos','Do total'].map(c=>h('th',{children:c},c))})}),h('tbody',{children:model.top.map(p=>hs('tr',{children:[h('th',{children:p.origem}),h('td',{children:p.canal}),h('td',{children:p.combustivel}),h('td',{children:p.segmento}),h('td',{children:flowFmt.n(p.count)}),h('td',{children:flowFmt.p(share(p.count))})]},[p.origem,p.canal,p.combustivel,p.segmento].join('|')))})]})]}),
   h('p',{className:'hx-method',children:'Tipo de veículo junta carroceria e porte do BD: SUV, hatch, sedan, minivan, perua, picapes por porte (pequena, compacta, média, grande), furgão e van, caminhão leve; os menores entram em “Outros”. Combustível é a tecnologia do BD (flex, gasolina, etanol, diesel, híbrido leve, híbrido, plug-in, elétrico). '+(model.dropped>0?flowFmt.n(model.dropped)+' emplacamentos ('+flowFmt.p(model.dropped/(model.total+model.dropped))+') sem classificação no BD ficam fora do desenho, mas contam no total do painel.':'Todos os emplacamentos do recorte estão classificados.')})]})
 ]});
}
if(typeof module!=='undefined'&&module.exports)module.exports={flowModel,flowLayout,FLOW_ORDER};
