// Additive territorial catalog. All coordinates come from the bundled IBGE paths.
const CATALOG_MAP_CHOICES = [
 {value:'choropleth',label:'Coroplético · participação'}, {value:'bubbles',label:'Bolhas municipais'},
 {value:'hexbin',label:'Hexágonos · centroides'}, {value:'tiles',label:'Grade de UFs'},
 {value:'bivariate',label:'Bivariado · mercado × MIT'}, {value:'spikes',label:'Espigões municipais 3D'},
 {value:'extrusion',label:'Extrusão de UFs 3D'}
];
const CATALOG_UF_TILES = [['RR',2,0],['AP',4,0],['AM',1,1],['PA',3,1],['MA',4,1],['CE',6,1],['RN',7,1],['AC',0,2],['RO',1,2],['MT',2,2],['TO',3,2],['PI',4,2],['PE',6,2],['PB',7,2],['MS',2,3],['GO',3,3],['DF',4,3],['BA',5,3],['AL',6,3],['SE',7,3],['PR',2,4],['SP',3,4],['MG',4,4],['ES',5,4],['SC',2,5],['RJ',4,5],['RS',2,6]];
const CATALOG_BIVARIATE_COLORS = ['#e8e8e8','#ace4e4','#5ac8c8','#dfb0d6','#a5add3','#5698b9','#be64ac','#8c62aa','#3b4994'];
const catalogMapNumber = v => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR',{maximumFractionDigits:0});
const catalogMapPercent = v => v == null || !Number.isFinite(v) ? '—' : (v*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const catalogMapNormalize = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
function catalogMapRows(model,dimension){
 const market=model?.catalog?.market,mit=model?.catalog?.mitsubishi;
 const a=new Map((model?.groups?.[dimension]??[]).map(r=>[r.name,r.count]));
 const b=new Map((market?.groups?.[dimension]??[]).map(r=>[r.name,r.count]));
 const c=new Map((mit?.groups?.[dimension]??[]).map(r=>[r.name,r.count]));
 const prior=model?.catalog?.prior,previous=new Map((prior?.groups?.[dimension]??[]).map(r=>[r.name,r.count]));
 const valid=model?.complete!==false&&market?.complete!==false&&Boolean(market);
 return [...new Set([...a.keys(),...b.keys(),...c.keys(),...previous.keys()])].map(name=>{
  const count=model?.total===null?null:a.get(name)??0,marketCount=market?.total===null||!market?null:b.get(name)??0,mitCount=mit?.total===null||!mit?null:c.get(name)??0;
  const priorCount=prior?.complete!==false&&prior?.total!=null?(previous.get(name)??0):null;
  return {name,count,marketCount,mitCount,priorCount,growth:model?.complete!==false&&count!==null&&priorCount>0?(count/priorCount-1):null,share:valid&&marketCount>0&&count!==null?count/marketCount:null,mitShare:valid&&mit?.complete!==false&&marketCount>0&&mitCount!==null?mitCount/marketCount:null,coverage:valid?'Cobertura completa':'Cobertura incompleta ou referência indisponível'};
 });
}
function catalogPathRings(path){
 // The reviewed assets contain absolute M/L/Z only. Reject other commands.
 if(/[A-KN-Y]/i.test(String(path).replace(/[MLZ]/gi,'')))return [];
 return String(path).split(/[zZ]/).map(part=>{const n=part.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)??[];return Array.from({length:Math.floor(n.length/2)},(_,i)=>[Number(n[i*2]),Number(n[i*2+1])]);}).filter(r=>r.length>=3);
}
function catalogPathCentroid(path){
 const rings=catalogPathRings(path);let area=0,x=0,y=0;
 for(const ring of rings){let twice=0,cx=0,cy=0;for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length],cross=p[0]*q[1]-q[0]*p[1];twice+=cross;cx+=(p[0]+q[0])*cross;cy+=(p[1]+q[1])*cross;}if(Math.abs(twice)>1e-8){const weight=Math.abs(twice);area+=weight;x+=cx/(3*twice)*weight;y+=cy/(3*twice)*weight;}}
 return area?[x/area,y/area]:null;
}
// Geometry assets are immutable. Cache name matching and projected centroids per
// geometry identity, so metric/period changes do not parse thousands of paths.
const catalogMunicipalGeometryIndex=new WeakMap();
function catalogMunicipalIndex(geometry){
 if(!geometry)return new Map();
 if(catalogMunicipalGeometryIndex.has(geometry))return catalogMunicipalGeometryIndex.get(geometry);
 const names=new Map();for(const f of geometry.features??[]){const key=catalogMapNormalize(f.name);names.set(key,names.has(key)?null:{feature:f,point:catalogPathCentroid(f.path)});}
 catalogMunicipalGeometryIndex.set(geometry,names);return names;
}
function catalogMunicipalJoin(rows,geometry){
 const names=catalogMunicipalIndex(geometry); const matches=[],unmatched=[];
 for(const row of rows){if(!row.name.endsWith(' · '+geometry?.uf))continue;const name=row.name.slice(0,-(' · '+geometry.uf).length),entry=names.get(catalogMapNormalize(name)),f=entry?.feature,point=entry?.point;
  if(f&&point)matches.push({...row,ibgeCode:f.code,municipality:f.name,uf:geometry.uf,x:point[0],y:point[1],path:f.path,geographicMatch:'Nome normalizado + UF únicos'});
  else unmatched.push({...row,ibgeCode:null,uf:geometry.uf,geographicMatch:'Sem correspondência única'});
 }
 return {matches,unmatched};
}
function catalogHexbin(rows,size){
 const bins=new Map();for(const row of rows){const q=(Math.sqrt(3)/3*row.x-row.y/3)/size,r=(2/3*row.y)/size;let rx=Math.round(q),rz=Math.round(r),ry=Math.round(-q-r);const dx=Math.abs(rx-q),dy=Math.abs(ry+q+r),dz=Math.abs(rz-r);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dz>dy)rz=-rx-ry;
  const key=rx+','+rz;if(!bins.has(key))bins.set(key,{name:'Célula '+key,q:rx,r:rz,x:size*Math.sqrt(3)*(rx+rz/2),y:size*1.5*rz,count:0,marketCount:0,mitCount:0,members:[],valid:true,marketValid:true,mitValid:true,complete:true});const bin=bins.get(key);bin.members.push(row.name);bin.complete=bin.complete&&row.coverage==='Cobertura completa';bin.valid=bin.valid&&row.count!==null;bin.marketValid=bin.marketValid&&row.marketCount!=null;bin.mitValid=bin.mitValid&&row.mitCount!=null;bin.count+=row.count??0;bin.marketCount+=row.marketCount??0;bin.mitCount+=row.mitCount??0;
 }return [...bins.values()].map(bin=>({...bin,count:bin.valid?bin.count:null,marketCount:bin.marketValid?bin.marketCount:null,mitCount:bin.mitValid?bin.mitCount:null,coverage:bin.complete?'Cobertura completa':'Cobertura incompleta ou referência indisponível',municipalities:bin.members.length,members:bin.members.join('; ')}));
}
function catalogMapRadius(count,max,radius=28){return count>0&&max>0?radius*Math.sqrt(count/max):0;}
function catalogMapHeight(count,max,scale){return count>0&&max>0?110*(scale==='log'?Math.log1p(count)/Math.log1p(max):count/max):0;}
function catalogMapCuts(rows,field){const values=rows.map(r=>r[field]).filter(v=>v!=null&&Number.isFinite(v)).sort((a,b)=>a-b);return values.length?[values[Math.floor((values.length-1)/3)],values[Math.floor((values.length-1)*2/3)]]:[null,null];}
function catalogMapClass(value,cuts){return value==null||cuts[0]==null?null:value<=cuts[0]?0:value<=cuts[1]?1:2;}
function catalogMapColor(value){if(value==null)return '#d6dbe2';const t=Math.max(0,Math.min(1,value));return `rgb(${Math.round(226-194*t)},${Math.round(239-153*t)},${Math.round(252-94*t)})`;}
function catalogGrowthColor(value){if(value==null)return '#d6dbe2';const t=Math.min(1,Math.abs(value));return value<0?`rgb(${Math.round(245-40*t)},${Math.round(245-140*t)},${Math.round(245-170*t)})`:`rgb(${Math.round(245-213*t)},${Math.round(245-159*t)},${Math.round(245-87*t)})`;}
function catalogMapTooltip(row){if(row.inScope===false)return row.name+' | Fora do recorte';return `${row.name} | Seleção: ${catalogMapNumber(row.count)} | Mercado de referência: ${catalogMapNumber(row.marketCount)} | Participação da seleção: ${catalogMapPercent(row.share)} | Mitsubishi: ${catalogMapNumber(row.mitCount)} | Participação MIT: ${catalogMapPercent(row.mitShare)} | Residentes 2026: ${catalogMapNumber(row.population2026)} | Por 1.000 residentes2026: ${row.per1000==null?'—':row.per1000.toLocaleString('pt-BR',{maximumFractionDigits:3})} | Ano anterior: ${catalogMapNumber(row.priorCount)} | Variação anual: ${catalogMapPercent(row.growth)}${row.members?' | Municípios: '+row.members:''}${row.coverage?' | '+row.coverage:''}`;}
function catalogMapProject(x,y,z,width,height,angle,tilt){const a=angle*Math.PI/180,dx=x-width/2,dy=y-height/2;return [width/2+dx*Math.cos(a)-dy*Math.sin(a),height/2+(dx*Math.sin(a)+dy*Math.cos(a))*tilt-z];}
function catalogProjectedPath(path,z,width,height,angle,tilt){return catalogPathRings(path).map(ring=>ring.map((p,i)=>{const q=catalogMapProject(p[0],p[1],z,width,height,angle,tilt);return (i?'L':'M')+q[0]+','+q[1];}).join(' ')+' Z').join(' ');}
function catalogMapProjectedBounds(features,rows,width,height,angle,tilt,maximumHeight=110){
 const points=[];for(const feature of features??[])for(const ring of catalogPathRings(feature.path))for(const p of ring){points.push(catalogMapProject(p[0],p[1],0,width,height,angle,tilt));points.push(catalogMapProject(p[0],p[1],maximumHeight,width,height,angle,tilt));}
 for(const row of rows??[])if(Number.isFinite(row.x)&&Number.isFinite(row.y)){points.push(catalogMapProject(row.x,row.y,0,width,height,angle,tilt));points.push(catalogMapProject(row.x,row.y,maximumHeight,width,height,angle,tilt));}
 if(!points.length)return [0,-maximumHeight,width,height+maximumHeight];
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const [x,y] of points){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}const padding=Math.max(14,Math.max(right-left,bottom-top)*.035);
 return [left-padding,top-padding,right-left+padding*2,bottom-top+padding*2];
}
function catalogMapZoomBounds(bounds,zoom){const [x,y,w,h]=bounds;return [x+w/2-w/(2*zoom),y+h/2-h/(2*zoom),w/zoom,h/zoom];}
const catalogGeometryCache=new Map();
function useCatalogMunicipalGeometry(uf,base,enabled){
 const key=base+'|'+uf;
 const [state,setState]=React.useState({key:null,data:null,error:null,pending:false}),[attempt,setAttempt]=React.useState(0);
 React.useEffect(()=>{if(!enabled||!uf){setState({key,data:null,error:null,pending:false});return;}if(catalogGeometryCache.has(key)){setState({key,data:catalogGeometryCache.get(key),error:null,pending:false});return;}let active=true;const controller=new AbortController();setState({key,data:null,error:null,pending:true});
 fetch(new URL('geography/'+encodeURIComponent(uf)+'.json',base),{signal:controller.signal,credentials:'same-origin',redirect:'error'}).then(r=>{if(!r.ok)throw Error('Malha municipal indisponível. A tabela continua disponível.');return r.json();}).then(data=>{if(data.uf!==uf||!Array.isArray(data.features))throw Error('Malha municipal incompatível.');catalogGeometryCache.set(key,data);if(active)setState({key,data,error:null,pending:false});}).catch(error=>{if(active&&error.name!=='AbortError')setState({key,data:null,error:error.message,pending:false});});return()=>{active=false;controller.abort();};
 },[uf,base,enabled,attempt]);
 // A cached return to a UF is immediate; never expose the previous base/UF's
 // geometry or error for the render before the effect cleans up its request.
 const cached=enabled&&uf?catalogGeometryCache.get(key):null;
 const current=enabled&&uf&&state.key===key?state:{data:null,error:null,pending:Boolean(enabled&&uf)};
 return {...current,data:cached??(current.data?.uf===uf?current.data:null),pending:cached?false:current.pending,error:cached?null:current.error,retry:()=>setAttempt(n=>n+1)};
}
function catalogPopulationRows(rows,population,dimension,complete=true){
 const index=new Map(((dimension==='uf'?population?.states:population?.municipalities)??[]).map(r=>[dimension==='uf'?r.name:r.code,r]));
 return rows.map(row=>{const p=index.get(dimension==='uf'?row.name:row.ibgeCode),denominator=p?.population2026??p?.population??null,compatible=Boolean(p)&&(dimension==='uf'||!p.boundaryAttention)&&row.inScope!==false;
 return {...row,population2026:compatible?denominator:null,per1000:complete&&compatible&&denominator>0&&row.count!=null?row.count/denominator*1000:null,populationStatus:!p?'População não vinculada':p.boundaryAttention&&dimension!=='uf'?'Limite territorial requer validação':row.inScope===false?'Fora do recorte':'População oficial fixa de 2026'};});
}
function useCatalogPopulation(base){
 const [state,setState]=React.useState({data:null,error:null,pending:true}),[attempt,retry]=React.useState(0);
 React.useEffect(()=>{let active=true;const controller=new AbortController();setState({data:null,error:null,pending:true});fetch(new URL('geography/catalog-population.json',base),{signal:controller.signal,credentials:'same-origin',redirect:'error'}).then(r=>{if(!r.ok)throw Error('População oficial indisponível.');return r.json();}).then(data=>{if(data.schemaVersion!=='catalog-population-1'||data.populationYear!==2026||!Array.isArray(data.states))throw Error('População incompatível.');if(active)setState({data,error:null,pending:false});}).catch(error=>{if(active&&error.name!=='AbortError')setState({data:null,error:error.message,pending:false});});return()=>{active=false;controller.abort();};},[base,attempt]);return {...state,retry:()=>retry(n=>n+1)};
}
function CatalogMaps({model,filters={},scope=[],dataBase,setFilter,features=value$3.features,viewBox=value$3.viewBox}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs;
 const [kind,setKind]=React.useState('choropleth'),[metric,setMetric]=React.useState('share'),[localUF,setLocalUF]=React.useState(''),[hexSize,setHexSize]=React.useState(24),[angle,setAngle]=React.useState(0),[tilt,setTilt]=React.useState(.6),[heightScale,setHeightScale]=React.useState('linear'),[flat,setFlat]=React.useState(false),[active,setActive]=React.useState(null);
 const [zoom,setZoom]=React.useState(1);
 const selectedUFs=(Array.isArray(filters.uf)?filters.uf:[filters.uf]).filter(v=>v&&v!=='all');const allowed=features.filter(f=>!selectedUFs.length||selectedUFs.includes(f.uf));
 const uf=selectedUFs.length===1?selectedUFs[0]:allowed.some(f=>f.uf===localUF)?localUF:'';
 const municipal=['bubbles','hexbin','spikes'].includes(kind),threeD=['spikes','extrusion'].includes(kind)&&!flat;
 const loaded=useCatalogMunicipalGeometry(uf,dataBase,municipal),geometry=loaded.data;
 const population=useCatalogPopulation(dataBase);
 const states=React.useMemo(()=>catalogMapRows(model,'uf'),[model]),municipalRows=React.useMemo(()=>catalogMapRows(model,'municipio'),[model]);
 const stateIndex=new Map(states.map(r=>[r.name,r]));const rawStateRows=features.map(f=>({count:model?.total===null?null:0,marketCount:model?.catalog?.market?.total==null?null:0,mitCount:model?.catalog?.mitsubishi?.total==null?null:0,share:null,mitShare:null,priorCount:null,growth:null,coverage:model?.complete===false?'Cobertura incompleta':'Sem registros na área',...stateIndex.get(f.uf),name:f.uf,path:f.path,inScope:!selectedUFs.length||selectedUFs.includes(f.uf)})).map(r=>r.inScope?r:{...r,count:null,marketCount:null,mitCount:null,share:null,mitShare:null,priorCount:null,growth:null,coverage:'Fora do recorte'});
 const stateRows=catalogPopulationRows(rawStateRows,population.data,'uf',model?.complete!==false);
 React.useEffect(()=>setActive(null),[model,uf,metric,hexSize,population.data]);
 const joined=React.useMemo(()=>catalogMunicipalJoin(municipalRows,geometry),[municipalRows,geometry]),bins=React.useMemo(()=>catalogHexbin(joined.matches,hexSize),[joined.matches,hexSize]);
 const rows=municipal?(kind==='hexbin'?bins:joined.matches):stateRows.filter(r=>r.inScope),max=Math.max(1,...rows.map(r=>r.count??0));
 const volumeCuts=catalogMapCuts(stateRows.filter(r=>r.inScope),'marketCount'),shareCuts=catalogMapCuts(stateRows.filter(r=>r.inScope),'mitShare');
 const dimensions=(municipal&&geometry?geometry.viewBox:viewBox).split(/\s+/).map(Number),width=dimensions[2],height=dimensions[3];
 const projectedBounds=React.useMemo(()=>catalogMapProjectedBounds(municipal?geometry?.features:features,municipal?joined.matches:[],width,height,angle,tilt),[municipal,geometry,features,joined.matches,width,height,angle,tilt]);
 const mapViewBox=kind==='tiles'?'0 0 620 490':threeD?catalogMapZoomBounds(projectedBounds,zoom).join(' '):`${-width*.23} ${-height*.3} ${width*1.46} ${height*1.4}`;
 const title=CATALOG_MAP_CHOICES.find(v=>v.value===kind).label;
 const markProps=row=>({tabIndex:0,role:'img','aria-label':catalogMapTooltip(row),onMouseEnter:()=>setActive(row),onFocus:()=>setActive(row),onClick:()=>setActive(row)});
 const maxRate=Math.max(0,...stateRows.map(r=>r.per1000??0));
 const color=row=>row.inScope===false?'#f3f4f6':metric==='growth'?catalogGrowthColor(row.growth):catalogMapColor(metric==='per1000'?(row.per1000==null?null:row.per1000/(maxRate||1)):row[metric]);
 const rendered=[];
 if(kind==='tiles'){
  for(const [name,col,line] of CATALOG_UF_TILES){const row=stateRows.find(r=>r.name===name);rendered.push(hs('g',{...markProps(row),children:[h('rect',{x:col*76+8,y:line*68+8,width:68,height:60,rx:6,fill:color(row),stroke:'#63788d'}),h('text',{x:col*76+42,y:line*68+32,textAnchor:'middle',children:name}),h('text',{x:col*76+42,y:line*68+51,textAnchor:'middle',fontSize:11,children:row.inScope?(metric==='per1000'?(row.per1000==null?'—':row.per1000.toLocaleString('pt-BR',{maximumFractionDigits:3})):catalogMapPercent(row[metric])):'Fora'}),h('title',{children:catalogMapTooltip(row)})]},name));}
 }else{
  const baseFeatures=[...(municipal?geometry?.features??[]:features)].sort((a,b)=>{if(!threeD)return 0;const pa=catalogPathCentroid(a.path),pb=catalogPathCentroid(b.path);return pa&&pb?catalogMapProject(...pa,0,width,height,angle,tilt)[1]-catalogMapProject(...pb,0,width,height,angle,tilt)[1]:0;});
  for(const f of baseFeatures){const row=municipal?joined.matches.find(r=>r.ibgeCode===f.code):stateRows.find(r=>r.name===f.uf);const z=kind==='extrusion'&&threeD&&row?.inScope?catalogMapHeight(row.count,max,heightScale):0;
   if(kind==='extrusion'&&threeD&&z>0){const rings=catalogPathRings(f.path);const sides=rings.map(ring=>ring.map((p,i)=>{const q=ring[(i+1)%ring.length],a=catalogMapProject(...p,0,width,height,angle,tilt),b=catalogMapProject(...q,0,width,height,angle,tilt),c=catalogMapProject(...q,z,width,height,angle,tilt),d=catalogMapProject(...p,z,width,height,angle,tilt);return 'M'+a.join(',')+' L'+b.join(',')+' L'+c.join(',')+' L'+d.join(',')+' Z';}).join(' ')).join(' ');rendered.push(h('path',{d:sides,fill:'#6888a9',stroke:'#496a8d',strokeWidth:.25,opacity:.8},f.uf+'-sides'));}
   const vx=catalogMapClass(row?.marketCount,volumeCuts),vy=catalogMapClass(row?.mitShare,shareCuts),fill=municipal?'#edf2f7':kind==='bivariate'?(row?.inScope&&vx!==null&&vy!==null?CATALOG_BIVARIATE_COLORS[vy*3+vx]:'#d6dbe2'):color(row??{});
   rendered.push(hs('path',{...(row?markProps(row):{}),d:threeD?catalogProjectedPath(f.path,z,width,height,angle,tilt):f.path,fill,stroke:'#fff',strokeWidth:.7,children:[h('title',{children:row?catalogMapTooltip(row):f.name+' · sem registros associados'})]},f.code??f.uf));
  }
  if(municipal)for(const row of [...rows].sort((a,b)=>(b.count??0)-(a.count??0))){const p=threeD?catalogMapProject(row.x,row.y,0,width,height,angle,tilt):[row.x,row.y];
   if(kind==='hexbin'){const points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return [row.x+hexSize*Math.cos(a),row.y+hexSize*Math.sin(a)].join(',');}).join(' ');rendered.push(hs('polygon',{...markProps(row),points,fill:catalogMapColor((row.count??0)/max),stroke:'#fff',strokeWidth:1,fillOpacity:.9,children:[h('title',{children:catalogMapTooltip(row)})]},row.name));}
   else if(kind==='spikes'&&threeD){const z=catalogMapHeight(row.count,max,heightScale);rendered.push(hs('g',{...markProps(row),children:[h('line',{x1:p[0],y1:p[1],x2:p[0],y2:p[1]-z,stroke:'#155ca7',strokeWidth:2.5}),h('circle',{cx:p[0],cy:p[1]-z,r:2,fill:'#08366c'}),h('title',{children:catalogMapTooltip(row)})]},row.name));}
   else rendered.push(hs('circle',{...markProps(row),cx:p[0],cy:p[1],r:catalogMapRadius(row.count,max),fill:'#216eb9',fillOpacity:.55,stroke:'#124477',strokeWidth:.7,children:[h('title',{children:catalogMapTooltip(row)})]},row.name));
  }
 }
 const tableRows=municipal?catalogPopulationRows(geometry?[...joined.matches,...joined.unmatched]:municipalRows.filter(r=>!uf||r.name.endsWith(' · '+uf)),population.data,'municipio',model?.complete!==false):stateRows;
 const method='Volumes são emplacamentos observados no período e filtros selecionados. Mercado de referência e Mitsubishi retiram somente Marca, Modelo e Grupo de modelos; preservam período, canal, território e demais filtros. Participação da seleção = seleção ÷ mercado de referência na mesma área; participação MIT = Mitsubishi ÷ mercado na mesma área. Base zero ou cobertura incompleta: —, nunca participação zero. Variação anual = (volume atual ÷ mesmo período do ano anterior − 1); somente com ambos os períodos completos e base anterior positiva. Taxa por 1.000 = emplacamentos selecionados no período ÷ população oficial fixa de 2026 × 1.000; não anualizada, não frota e não participação de mercado. Denominador estadual inclui todos os municípios da UF, mesmo sem vendas e mesmo com filtros municipais; a seleção afeta somente o numerador. A taxa não representa a população histórica do período. Limites territoriais pendentes de validação ficam indisponíveis. Não são previsões.';
 const tableColumns=[{field:'name',label:municipal?'Município · UF':'UF',presentation:'identity'},{field:'count',label:'Volume selecionado',renderCell:catalogMapNumber},{field:'marketCount',label:'Mercado de referência',renderCell:catalogMapNumber},{field:'share',label:'Participação da seleção',renderCell:catalogMapPercent},{field:'mitCount',label:'Mitsubishi',renderCell:catalogMapNumber},{field:'mitShare',label:'Participação MIT',renderCell:catalogMapPercent},{field:'priorCount',label:'Ano anterior',renderCell:catalogMapNumber},{field:'growth',label:'Variação anual',renderCell:catalogMapPercent},{field:'coverage',label:'Cobertura'},{field:'population2026',label:'Residentes · população 2026',renderCell:catalogMapNumber},{field:'per1000',label:'Seleção por 1.000 residentes2026',renderCell:v=>v==null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:3})},{field:'populationStatus',label:'Compatibilidade populacional'},...(municipal?[{field:'ibgeCode',label:'Código IBGE'},{field:'geographicMatch',label:'Correspondência'}]:[])];
 return hs('section',{className:'cm-catalog','aria-label':'Catálogo de mapas territoriais',children:[
  h('h2',{children:'Mapas territoriais · catálogo'}),
  hs('div',{className:'cm-controls',children:[hs('label',{children:['Visualização',h('select',{'aria-label':'Visualização territorial',value:kind,onChange:e=>{setKind(e.target.value);setActive(null);},children:CATALOG_MAP_CHOICES.map(v=>h('option',{value:v.value,children:v.label},v.value))})]}),
   !municipal&&kind!=='bivariate'&&hs('label',{children:['Cor · medida normalizada',h('select',{value:metric,onChange:e=>setMetric(e.target.value),children:[h('option',{value:'share',children:'Seleção / mercado'}),h('option',{value:'mitShare',children:'Mitsubishi / mercado'}),h('option',{value:'growth',children:'Variação anual (%)'}),h('option',{value:'per1000',children:'Por 1.000 residentes · população 2026'})]})]}),
   municipal&&hs('label',{children:['UF da malha municipal',h('select',{'aria-label':'UF da malha municipal',value:uf,onChange:e=>{setLocalUF(e.target.value);setActive(null);},disabled:selectedUFs.length===1,children:[h('option',{value:'',children:'Escolha uma UF'}),...allowed.map(f=>h('option',{value:f.uf,children:f.uf},f.uf))]})]}),
   kind==='hexbin'&&hs('label',{children:['Resolução',h('select',{value:hexSize,onChange:e=>setHexSize(Number(e.target.value)),children:[12,24,40].map(v=>h('option',{value:v,children:v+' unidades projetadas'},v))})]}),
   ['spikes','extrusion'].includes(kind)&&hs('label',{children:[h('input',{type:'checkbox',checked:flat,onChange:e=>setFlat(e.target.checked)}),'Alternativa 2D']}),
   threeD&&hs('label',{children:['Altura',h('select',{value:heightScale,onChange:e=>setHeightScale(e.target.value),children:[h('option',{value:'linear',children:'Linear'}),h('option',{value:'log',children:'Logarítmica · log(1 + volume)'})]})]}),
   threeD&&hs('label',{children:['Rotação: '+angle+'°',h('input',{type:'range',min:-180,max:180,step:5,value:angle,onChange:e=>setAngle(Number(e.target.value))})]}),
   threeD&&hs('label',{children:['Inclinação',h('input',{type:'range',min:.25,max:1,step:.05,value:tilt,onChange:e=>setTilt(Number(e.target.value))})]}),
   threeD&&hs('label',{children:['Zoom: '+zoom.toFixed(2)+'×',h('input',{type:'range','aria-label':'Zoom do mapa 3D',min:1,max:3,step:.1,value:zoom,onChange:e=>setZoom(Number(e.target.value))})]}),
   threeD&&h('button',{type:'button',onClick:()=>{setZoom(1);setAngle(0);setTilt(.6);},children:'Repor câmera · enquadrar tudo'})]}),
  municipal&&h('p',{className:'cm-method',children:'Brasil → '+(uf||'escolha uma UF')+'. Malha municipal em projeção própria da UF; posições derivadas dos polígonos oficiais. A UF do desenho não altera os filtros globais.'}),
  municipal&&!uf?h('p',{role:'status',children:'Escolha uma UF para carregar a malha municipal oficial. Os registros continuam disponíveis na tabela.'}):municipal&&loaded.pending?h('p',{role:'status',children:'Carregando malha oficial…'}):municipal&&loaded.error?hs('p',{role:'alert',children:[loaded.error,' ',h('button',{type:'button',onClick:loaded.retry,children:'Tentar novamente'})]}):h('div',{className:'cm-viewport',children:hs('svg',{viewBox:mapViewBox,role:'img','aria-label':title,children:[h('title',{children:title}),h('desc',{children:'Use Tab para explorar os dados dos elementos. A tabela seguinte oferece os mesmos valores e exportação.'}),...rendered]})}),
  hs('div',{className:'cm-legend',children:[!municipal&&kind!=='bivariate'&&hs('span',{children:['Cor: '+(metric==='per1000'?'seleção por 1.000 residentes2026 · 0':metric==='growth'?'variação anual · −100%':metric==='mitShare'?'participação MIT · 0%':'participação da seleção · 0%')+' ',h('i',{className:metric==='growth'?'cm-gradient cm-diverging':'cm-gradient'}),metric==='per1000'?' '+maxRate.toLocaleString('pt-BR',{maximumFractionDigits:3}):metric==='growth'?' +100% · branco: 0%; extremos saturam, tooltip exato.':' 100%', ' · cinza: sem base / fora do recorte']}),
   (kind==='bubbles'||kind==='spikes'&&flat)&&hs('span',{children:['Área das bolhas ∝ volume. ',...[.25,.5,1].map(t=>h('span',{className:'cm-size-key',children:catalogMapNumber(max*t)+' → raio '+catalogMapRadius(max*t,max).toFixed(1)},t))]}),
   kind==='hexbin'&&h('span',{children:'Cor: volume agregado · 0 a '+catalogMapNumber(max)+'. Cada hexágono tem área projetada '+(3*Math.sqrt(3)*hexSize*hexSize/2).toFixed(1)+' unidades², igual em toda a malha desta UF.'}),
   threeD&&h('span',{children:'Altura: volume '+(heightScale==='log'?'log(1 + volume)':'linear')+' · 0 → 0; '+catalogMapNumber(max)+' → 110 unidades visuais. Projeção SVG 3D, sem exigência de WebGL. Zoom 1× enquadra toda a geometria e alturas; ampliar pode cortar as bordas. Use Repor câmera para recuperar o enquadramento.'}),
   kind==='bivariate'&&hs('div',{className:'cm-bivariate-key',children:[h('strong',{children:'3 × 3 · tercis no recorte'}),h('div',{className:'cm-bivariate-grid',children:[2,1,0].flatMap(y=>[0,1,2].map(x=>h('span',{style:{background:CATALOG_BIVARIATE_COLORS[y*3+x]},title:'Mercado '+['baixo','médio','alto'][x]+'; MIT '+['baixa','média','alta'][y],children:(x+1)+'/'+(y+1)},x+'-'+y)))}),h('span',{children:'Mercado →; participação MIT ↑'}),h('span',{children:'Cortes mercado: '+volumeCuts.map(catalogMapNumber).join(' / ')+'. Cortes MIT: '+shareCuts.map(catalogMapPercent).join(' / ')+'. Limites incluídos na classe inferior; empates podem esvaziar classes. Cinza: sem base.'})]})]}),
  municipal&&uf&&hs('figure',{className:'cm-context',children:[h('svg',{viewBox,role:'img','aria-label':'Localização de '+uf+' no Brasil',children:features.map(f=>h('path',{d:f.path,fill:f.uf===uf?'#216eb9':'#dce6f0',stroke:'#fff',strokeWidth:1},f.uf))}),h('figcaption',{children:uf+' no Brasil · contexto geográfico'})]}),
  h('p',{className:'cm-details',role:'status','aria-live':'polite',children:active?catalogMapTooltip(active):'Passe o cursor, toque ou use Tab para conferir valores exatos.'}),
  kind==='tiles'&&h('p',{className:'cm-method',children:'Grade esquemática das 27 UFs com áreas iguais; não representa contornos, distâncias ou áreas geográficas. UF fora do filtro permanece identificada como Fora.'}),
  municipal&&h('p',{className:'cm-method',children:(kind==='hexbin'?'Hexbin de centroides municipais, não localização de compradores. Volume integral de cada município atribuído a uma única célula; não estima densidade populacional nem vendas dentro da célula. ':'Centroides derivados das malhas oficiais, não endereços de compradores. ')+'Correspondência única por nome normalizado + UF. '+joined.matches.length+' municípios associados; '+joined.unmatched.length+' não associados ('+catalogMapNumber(joined.unmatched.reduce((a,r)=>a+(r.count??0),0))+' emplacamentos), mantidos na tabela. Centroides podem ficar fora de polígonos côncavos. Áreas projetadas não equivalem a km²; a projeção e a escala variam entre UFs, portanto tamanho e resolução das células não são comparáveis entre estados.'}),
  h('p',{className:'cm-method',children:method}),
  metric==='per1000'&&(population.pending?h('p',{role:'status',children:'Carregando denominadores oficiais de população2026…'}):population.error?hs('p',{role:'alert',children:[population.error,' ',h('button',{type:'button',onClick:population.retry,children:'Tentar novamente'})]}):h('p',{className:'cm-method',children:'Fonte populacional: IBGE/SIDRA6579, estimativa2026. Catálogo integral: '+catalogMapNumber(population.data?.coverage?.municipalities)+' municípios, 27 UFs; total '+catalogMapNumber(population.data?.coverage?.population)+' residentes. As 27 UFs usam a soma integral da população2026. Alterações de limites municipais não retiram população da UF; vínculos municipais com alerta territorial permanecem sem taxa até validação histórica.'})),
  metric==='per1000'&&h('a',{href:'https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/9324/p/2026',target:'_blank',rel:'noreferrer',children:'População oficial2026 · SIDRA/IBGE'}),
  (model?.complete===false||model?.catalog?.market?.complete===false)&&h('p',{role:'status',className:'cm-warning',children:'Cobertura incompleta: TODOS os volumes desenhados são parciais, incluindo áreas de bolhas, células e alturas 3D. Participações e variação anual ficam indisponíveis.'}),
  h('a',{href:'https://servicodados.ibge.gov.br/api/docs/malhas',target:'_blank',rel:'noreferrer',children:'Contornos oficiais · IBGE'}),
  kind==='hexbin'&&h(MarketTable,{id:'catalog-map-hex-data',title:'Células e municípios agregados',rows:bins,scope,columns:[{field:'name',label:'Célula'},{field:'count',label:'Volume',renderCell:catalogMapNumber},{field:'municipalities',label:'Municípios'},{field:'members',label:'Municípios incluídos'}],description:'Agregação de centroides em células de área projetada igual; não representa a localização de compradores.'}),
  h(MarketTable,{id:'catalog-map-data',title:title+' · dados acessíveis',rows:tableRows,scope,columns:tableColumns,description:method,onSelect:setFilter?row=>{if(!municipal&&row.inScope)setFilter('uf',row.name);}:undefined})
 ]});
}
