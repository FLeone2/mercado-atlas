// "Explore as conexões" (from the Atlas Automotivo): one chord diagram linking regions,
// brands and fuels of the registrations in the current filters. Brand arcs carry both
// links (region and fuel), so their arc counts each registration twice, as in the Atlas;
// the readout divides by two. Data: result.connections of Concorrência's market query.
const CC_REGIONS=['Norte','Nordeste','Centro-Oeste','Sudeste','Sul'];
const CC_FUEL_COLORS={Flex:'#39776a',Diesel:'#a29d82',Gasolina:'#9db3a1',Etanol:'#83a69a',Elétrico:'#507fa5','Híbrido plug-in':'#8c91b0',Híbrido:'#c3a267','Híbrido leve':'#b6b89c'};
const ccInt=n=>n==null||!Number.isFinite(n)?'—':Math.round(n).toLocaleString('pt-BR');
const ccPct=x=>x==null||!Number.isFinite(x)?'—':(x*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const ccBrandLabel=b=>b==='OUTRAS'?'Outras':typeof tbmName==='function'?tbmName(b):b;

// Nodes and the symmetric matrix: top 6 brands (+ Mitsubishi) and the rest as "Outras".
function ccModel(connections,total){
 if(!connections)return null;
 const rb=connections.regionBrand??[],bf=connections.brandFuel??[];
 const brandTotals=new Map();for(const r of bf)brandTotals.set(r.marca,(brandTotals.get(r.marca)??0)+r.count);
 const ranked=[...brandTotals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([b])=>b);
 const brands=ranked.slice(0,6);if(brandTotals.has('MITSUBISHI')&&!brands.includes('MITSUBISHI'))brands.push('MITSUBISHI');
 if(ranked.some(b=>!brands.includes(b)))brands.push('OUTRAS');
 const group=b=>brands.includes(b)?b:'OUTRAS';
 const fuelTotals=new Map();for(const r of bf)fuelTotals.set(r.combustivel,(fuelTotals.get(r.combustivel)??0)+r.count);
 const regions=CC_REGIONS.filter(r=>rb.some(x=>x.regiao===r)),fuels=[...fuelTotals].sort((a,b)=>b[1]-a[1]).map(([f])=>f);
 const nodes=[...regions.map(name=>({name,type:'region',label:name,color:'var(--sage)'})),
  ...brands.map(name=>({name,type:'brand',label:ccBrandLabel(name),color:name==='OUTRAS'?'var(--tbm-other)':brandColor(name)})),
  ...fuels.map(name=>({name,type:'fuel',label:name,color:CC_FUEL_COLORS[name]??'var(--tbm-other)'}))];
 const at=new Map(nodes.map((n,i)=>[n.type+'|'+n.name,i])),matrix=nodes.map(()=>nodes.map(()=>0));
 const link=(a,b,n)=>{if(a==null||b==null||!(n>0))return;matrix[a][b]+=n;matrix[b][a]+=n;};
 for(const r of rb)link(at.get('region|'+r.regiao),at.get('brand|'+group(r.marca)),r.count);
 for(const r of bf)link(at.get('brand|'+group(r.marca)),at.get('fuel|'+r.combustivel),r.count);
 return {nodes,matrix,total};
}
// Same geometry as d3.chord().padAngle(pad).sortSubgroups(descending): clockwise from 12 o'clock.
function ccLayout(matrix,pad=.025){
 const n=matrix.length,sums=matrix.map(r=>r.reduce((s,v)=>s+v,0)),total=sums.reduce((s,v)=>s+v,0);
 if(!total)return {groups:[],chords:[]};
 const k=Math.max(0,2*Math.PI-pad*n)/total,sub=matrix.map(()=>[]),groups=[];let x=0;
 for(let i=0;i<n;i++){
  const x0=x,order=matrix[i].map((v,j)=>j).sort((a,b)=>matrix[i][b]-matrix[i][a]);
  for(const j of order){const v=matrix[i][j];sub[i][j]={index:i,subindex:j,startAngle:x,endAngle:x+v*k,value:v};x+=v*k;}
  groups.push({index:i,startAngle:x0,endAngle:x,value:sums[i]});x+=pad;
 }
 const chords=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(matrix[i][j]>0)chords.push({source:sub[i][j],target:sub[j][i]});
 return {groups,chords};
}
const ccPoint=(r,a)=>[r*Math.sin(a),-r*Math.cos(a)];
const ccF=v=>v.toFixed(2);
function ccArcPath(r0,r1,a0,a1){
 const large=a1-a0>Math.PI?1:0,[x0,y0]=ccPoint(r1,a0),[x1,y1]=ccPoint(r1,a1),[x2,y2]=ccPoint(r0,a1),[x3,y3]=ccPoint(r0,a0);
 return `M${ccF(x0)},${ccF(y0)}A${r1},${r1} 0 ${large} 1 ${ccF(x1)},${ccF(y1)}L${ccF(x2)},${ccF(y2)}A${r0},${r0} 0 ${large} 0 ${ccF(x3)},${ccF(y3)}Z`;
}
function ccRibbonPath(r,s,t){
 const [sx0,sy0]=ccPoint(r,s.startAngle),[sx1,sy1]=ccPoint(r,s.endAngle),[tx0,ty0]=ccPoint(r,t.startAngle),[tx1,ty1]=ccPoint(r,t.endAngle);
 const sl=s.endAngle-s.startAngle>Math.PI?1:0,tl=t.endAngle-t.startAngle>Math.PI?1:0;
 return `M${ccF(sx0)},${ccF(sy0)}A${r},${r} 0 ${sl} 1 ${ccF(sx1)},${ccF(sy1)}Q0,0 ${ccF(tx0)},${ccF(ty0)}A${r},${r} 0 ${tl} 1 ${ccF(tx1)},${ccF(ty1)}Q0,0 ${ccF(sx0)},${ccF(sy0)}Z`;
}

function ConnectionsChord({model,filters,setFilter}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const data=React.useMemo(()=>ccModel(model?.connections,model?.total),[model]);
 const layout=React.useMemo(()=>data?ccLayout(data.matrix):null,[data]);
 const [hover,setHover]=React.useState(null),[locked,setLocked]=React.useState(null),[tip,setTip]=React.useState(null);
 React.useEffect(()=>{setLocked(null);setHover(null);},[data]);
 if(!data||!layout?.groups.length)return null;
 const {nodes,matrix,total}=data,active=hover??locked;
 const selectedBrands=categoricalSelection(filters?.marca);
 const nodeCount=i=>layout.groups[i].value/(nodes[i].type==='brand'?2:1);
 const related=i=>active==null||i===active||matrix[active][i]>0;
 const choose=i=>{const node=nodes[i];if(node.type==='brand'&&node.name!=='OUTRAS'){const only=selectedBrands.length===1&&selectedBrands[0]===node.name;setFilter?.('marca',only?[]:[node.name]);return;}setLocked(l=>l===i?null:i);};
 const R=306,box=410;
 const focusNode=active!=null?nodes[active]:null;
 return h(dataApp.Section,{id:'connections-chord-heading',title:'Explore as conexões',children:hs('div',{className:'cc-chord','data-export-root':true,'data-export-title':'Explore as conexões',children:[
  hs('div',{className:'cc-chord-copy',children:[
   h('p',{className:'cc-chord-lede',children:'As faixas ligam regiões, marcas e propulsões dos emplacamentos do recorte. Passe o mouse para destacar uma categoria; clique em uma marca para filtrar todo o painel.'}),
   hs('div',{className:'cc-chord-focus','aria-live':'polite',children:[
    h('strong',{children:focusNode?focusNode.label:'Todas as conexões'}),
    h('span',{children:focusNode?ccInt(nodeCount(active))+' emplacamentos · '+ccPct(nodeCount(active)/total)+' do recorte':ccInt(total)+' emplacamentos'}),
    h('p',{children:focusNode?(focusNode.type==='brand'&&focusNode.name!=='OUTRAS'?(selectedBrands.length===1&&selectedBrands[0]===focusNode.name?'Clique de novo para remover o filtro de marca.':'Clique para filtrar o painel por esta marca.'):'Clique para fixar o destaque; clique de novo para soltar.'):'Regiões em verde-claro, marcas nas suas cores, propulsões no fim do círculo.'})
   ]}),
   hs('div',{className:'cc-chord-legend','data-export-legend':true,children:[
    hs('span',{children:[h('i',{style:{background:'var(--sage)'}}),'Regiões']}),
    hs('span',{children:[h('i',{style:{background:brandColor('FIAT')}}),'Marcas']}),
    hs('span',{children:[h('i',{style:{background:CC_FUEL_COLORS.Flex}}),'Propulsões']})
   ]}),
   (locked!=null||selectedBrands.length===1)&&h('button',{type:'button',className:'am-small-button',onClick:()=>{setLocked(null);if(selectedBrands.length===1)setFilter?.('marca',[]);},children:'Limpar destaque e filtro de marca'}),
   h('p',{className:'am-footnote',children:'Seis marcas de maior volume, mais Mitsubishi; as demais ficam em "Outras". O arco de cada marca soma suas ligações com região e com propulsão (cada emplacamento aparece duas vezes); os números do destaque contam uma vez. Propulsão sem classificação BD fica fora, como no resto do painel.'})
  ]}),
  hs('div',{className:'cc-chord-figure',children:[
   hs('svg',{viewBox:`${-box} ${-box} ${box*2} ${box*2}`,role:'group','aria-label':'Conexões entre regiões, marcas e propulsões',onPointerLeave:()=>{setHover(null);setTip(null);},children:[
    h('g',{className:'cc-ribbons',children:layout.chords.map((c,k)=>{const a=nodes[c.source.index],b=nodes[c.target.index],fill=a.type==='brand'?a.color:b.color,on=active==null||c.source.index===active||c.target.index===active;
     return h('path',{d:ccRibbonPath(R,c.source,c.target),style:{fill},className:on?'cc-ribbon':'cc-ribbon cc-dim',onPointerMove:e=>{const rect=e.currentTarget.ownerSVGElement.getBoundingClientRect();setTip({x:e.clientX-rect.left,y:e.clientY-rect.top,title:a.label+' × '+b.label,value:c.source.value});}},k);})}),
    h('g',{children:layout.groups.map(g=>{const node=nodes[g.index],mid=(g.startAngle+g.endAngle)/2,flip=mid>Math.PI;
     return hs('g',{className:related(g.index)?'cc-group':'cc-group cc-dim',children:[
      h('path',{d:ccArcPath(R+5,R+28,g.startAngle,g.endAngle),style:{fill:node.color},className:'cc-arc',tabIndex:0,role:'button','aria-label':node.label+', '+ccInt(nodeCount(g.index))+' emplacamentos','aria-pressed':node.type==='brand'?selectedBrands.includes(node.name):locked===g.index,
       onPointerEnter:()=>setHover(g.index),onPointerLeave:()=>setHover(null),onFocus:()=>setHover(g.index),onBlur:()=>setHover(null),onClick:()=>choose(g.index),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(g.index);}}}),
      g.endAngle-g.startAngle>.012&&h('text',{className:'cc-label cc-label-'+node.type+(g.endAngle-g.startAngle<.06&&node.name!=='MITSUBISHI'?' cc-label-small':''),dy:'.35em',textAnchor:flip?'end':'start',transform:`rotate(${(mid*180/Math.PI-90).toFixed(2)}) translate(${R+40}) ${flip?'rotate(180)':''}`,children:node.label})
     ]},g.index);})}),
    hs('g',{className:'cc-center',pointerEvents:'none',children:[h('circle',{r:93}),h('text',{y:-12,textAnchor:'middle',className:'cc-center-label',children:'COMPOSIÇÃO'}),h('text',{y:28,textAnchor:'middle',className:'cc-center-number',children:ccInt(total)})]})
   ]}),
   tip&&hs('div',{className:'ax-tooltip-host',style:{left:Math.max(0,tip.x+12),top:Math.max(0,tip.y-8)},children:hs('div',{className:'ax-tooltip',children:[h('strong',{children:tip.title}),hs('div',{className:'ax-tooltip-row',children:[h('span',{children:'Emplacamentos'}),h('b',{children:ccInt(tip.value)})]}),hs('div',{className:'ax-tooltip-row',children:[h('span',{children:'Do recorte'}),h('b',{children:ccPct(tip.value/total)})]})]})})
  ]})
 ]})});
}
if(typeof module!=='undefined'&&module.exports)module.exports={ccModel,ccLayout};
