/* Leitura competitiva (Concorrência): Mitsubishi against the cars it actually
   competes with, not the whole market. Three competitive sets follow the BD
   classification of the current portfolio: Triton/L200 (PICK-UP MID),
   Eclipse Cross (COMPACT SUV) and Outlander (MID SUV). All global filters apply
   except brand/model, which the set replaces. Data comes from the same worker
   exploration as Explorar. */
const CR_SETS=[
 {id:'pickup',label:'Picapes médias',of:'das picapes médias',product:'Triton',filters:{bd_segmento:'PICK-UP MID'}},
 {id:'suv-compact',label:'SUVs compactos',of:'dos SUVs compactos',product:'Eclipse Cross',filters:{bd_segmento:'COMPACT',bd_carroceria:'SUV'}},
 {id:'suv-mid',label:'SUVs médios',of:'dos SUVs médios',product:'Outlander',filters:{bd_segmento:'MID',bd_carroceria:'SUV'}}
];
const CR_MITSUBISHI_GROUPS=new Set(['TRITON','L200','ECLIPSE CROSS','OUTLANDER','PAJERO','ASX','PAJERO SPORT']);
const crTitle=s=>String(s).toLowerCase().replace(/(^|[\s\/-])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());
const crPct=(x,d=1)=>x==null||!Number.isFinite(x)?'—':(x*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const crInt=n=>n==null||!Number.isFinite(n)?'—':Math.round(n).toLocaleString('pt-BR');

// Model ranking inside a set: shares over the whole set (others included).
function crModelRanking(result){
 if(!result?.cells)return null;
 const others=result.categoryOthersLabel,brands=new Map((result.modelBrandIdentities??[]).map(r=>[r.model,r.brands??[]]));
 const rows=result.cells.filter(c=>c.x!==others&&c.observedCount>0).map(c=>({model:c.x,count:c.observedCount,brands:brands.get(c.x)??[]}));
 const total=result.observedTotal||rows.reduce((s,r)=>s+r.count,0);
 rows.sort((a,b)=>b.count-a.count);
 // Fallback when the worker reports no brand identity for a model group.
 return {total,rows:rows.map((r,i)=>({...r,rank:i+1,share:total>0?r.count/total:null,mitsubishi:r.brands.length?r.brands.includes('MITSUBISHI'):CR_MITSUBISHI_GROUPS.has(String(r.model).toUpperCase())}))};
}
// Per UF: size of the set and Mitsubishi share of it.
function crStateMatrix(result){
 if(!result?.cells)return null;const byUF=new Map();
 for(const c of result.cells){if(!/^[A-Z]{2}$/.test(c.x))continue;const e=byUF.get(c.x)??{uf:c.x,total:c.categoryDenominator??0,mit:0};if(c.series==='MITSUBISHI')e.mit=c.observedCount;byUF.set(c.x,e);}
 const rows=[...byUF.values()].filter(r=>r.total>0).map(r=>({...r,share:r.mit/r.total}));
 if(!rows.length)return null;const med=a=>{const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
 return {rows,medianTotal:med(rows.map(r=>r.total)),medianShare:med(rows.map(r=>r.share))};
}
function crQuadrant(r,m){const big=r.total>=m.medianTotal,strong=r.share>=m.medianShare;return big&&!strong?'opportunity':big&&strong?'defend':!big&&strong?'niche':'watch';}
const CR_QUADRANTS={opportunity:'Mercado grande, participação baixa',defend:'Mercado grande, participação alta',niche:'Mercado menor, participação alta',watch:'Mercado menor, participação baixa'};

function CrMatrix({matrix}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,[hover,setHover]=React.useState(null);
 const W=640,H=340,L=52,R=16,T=16,B=36,maxT=Math.max(...matrix.rows.map(r=>r.total)),maxS=Math.max(.01,...matrix.rows.map(r=>r.share))*1.1;
 const x=v=>L+Math.sqrt(v/maxT)*(W-L-R),y=v=>T+(1-v/maxS)*(H-T-B);
 const xt=[.05,.25,.5,1].map(f=>Math.round(maxT*f/100)*100).filter(v=>v>0);
 const yt=[0,maxS/3,2*maxS/3].map(v=>Math.round(v*1000)/1000);
 const hr=hover?matrix.rows.find(r=>r.uf===hover):null;
 return hs('div',{className:'cr-matrix',children:[
  hs('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':'Matriz por UF: tamanho do segmento e participação Mitsubishi',children:[
   ...yt.map(v=>hs('g',{children:[h('line',{x1:L,x2:W-R,y1:y(v),y2:y(v),className:'cr-grid'}),h('text',{x:L-6,y:y(v)+3,textAnchor:'end',children:crPct(v,1)})]},'y'+v)),
   ...xt.map(v=>h('text',{x:x(v),y:H-B+16,textAnchor:'middle',children:crInt(v)},'x'+v)),
   h('text',{x:(L+W-R)/2,y:H-4,textAnchor:'middle',className:'cr-axis',children:'Tamanho do segmento na UF (emplacamentos, escala raiz)'}),
   h('line',{x1:x(matrix.medianTotal),x2:x(matrix.medianTotal),y1:T,y2:H-B,className:'cr-median'}),
   h('line',{x1:L,x2:W-R,y1:y(matrix.medianShare),y2:y(matrix.medianShare),className:'cr-median'}),
   h('text',{x:W-R-4,y:T+12,textAnchor:'end',className:'cr-q',children:'Defender'}),
   h('text',{x:W-R-4,y:H-B-6,textAnchor:'end',className:'cr-q cr-q-opp',children:'Oportunidade'}),
   h('text',{x:L+6,y:T+12,className:'cr-q',children:'Nicho'}),
   ...matrix.rows.map(r=>hs('g',{className:'cr-point cr-'+crQuadrant(r,matrix)+(hover===r.uf?' is-hover':''),tabIndex:0,'aria-label':r.uf+': segmento '+crInt(r.total)+', Mitsubishi '+crPct(r.share),onMouseEnter:()=>setHover(r.uf),onMouseLeave:()=>setHover(null),onFocus:()=>setHover(r.uf),onBlur:()=>setHover(null),children:[
    h('circle',{cx:x(r.total),cy:y(r.share),r:5}),h('text',{x:x(r.total)>W-R-34?x(r.total)-8:x(r.total)+7,y:y(r.share)+3,textAnchor:x(r.total)>W-R-34?'end':'start',children:r.uf})]},r.uf))]}),
  h('p',{className:'cr-readout',role:'status',children:hr?hr.uf+': '+crInt(hr.total)+' emplacamentos no segmento, Mitsubishi com '+crInt(hr.mit)+' ('+crPct(hr.share)+'). '+CR_QUADRANTS[crQuadrant(hr,matrix)]+'.':'Linhas tracejadas: medianas entre as UFs. Passe o mouse ou use Tab sobre uma UF.'})]});
}
function CrConcentration(){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,shell=dataApp.useDataApp();
 const rows=(shell.queries?.phase2_competition_monthly?.rows??[]).filter(r=>Number.isFinite(r.hhi));
 if(rows.length<13)return null;
 const last=rows[rows.length-1],yearAgo=rows[rows.length-13],first=rows[0];
 const W=1000,H=170,L=44,R=12,T=12,B=24,lo=Math.floor(Math.min(...rows.map(r=>r.hhi))/100)*100,hi=Math.ceil(Math.max(...rows.map(r=>r.hhi))/100)*100;
 const x=i=>L+i*(W-L-R)/(rows.length-1),y=v=>T+(1-(v-lo)/(hi-lo||1))*(H-T-B),d=rows.map((r,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(r.hhi).toFixed(1)).join('');
 const trend=last.hhi<first.hhi?'menos concentrado (mais disputado)':'mais concentrado';
 return hs('div',{className:'cr-card',children:[
  h('h3',{children:'O mercado está '+trend+' do que em '+first.month.slice(0,4)}),
  h('p',{className:'cr-sub',children:'Índice de concentração (HHI) por mês: '+Math.round(last.hhi).toLocaleString('pt-BR')+' em '+last.month.split('-').reverse().join('/')+', contra '+Math.round(yearAgo.hhi).toLocaleString('pt-BR')+' um ano antes e '+Math.round(first.hhi).toLocaleString('pt-BR')+' em '+first.month.split('-').reverse().join('/')+'. Abaixo de 1.500 é considerado pouco concentrado. Mercado nacional completo, sem os filtros do painel.'}),
  hs('svg',{viewBox:'0 0 '+W+' '+H,className:'cr-hhi',role:'img','aria-label':'Concentração do mercado ao longo do tempo',children:[
   ...[lo,(lo+hi)/2,hi].map(v=>hs('g',{children:[h('line',{x1:L,x2:W-R,y1:y(v),y2:y(v),className:'cr-grid'}),h('text',{x:L-6,y:y(v)+3,textAnchor:'end',children:Math.round(v).toLocaleString('pt-BR')})]},v)),
   ...rows.map((r,i)=>r.month.endsWith('-01')&&i%24===0?h('text',{x:x(i),y:H-6,textAnchor:'middle',children:r.month.slice(0,4)},r.month):null),
   h('path',{d,className:'cr-line'}),h('circle',{cx:x(rows.length-1),cy:y(last.hhi),r:3.5,className:'cr-end'})]})]});
}
function CompetitiveReading({filters,manifest,base}){
 const h=jsxRuntime.jsx,hs=jsxRuntime.jsxs,[setId,setSetId]=React.useState(CR_SETS[0].id);
 const set=CR_SETS.find(s=>s.id===setId);
 const local=React.useMemo(()=>({...filters,marca:'all',modelo:'all',grupo_modelo:'all',bd_segmento:'all',bd_carroceria:'all',...set.filters}),[canonicalFilterKey(filters),setId]);
 const models=useExploration({type:'explore',filters:local,xDimension:'grupo_modelo',seriesDimension:null,topN:1,xTopN:12,order:'value_desc',includeOthers:true,highlightBrands:['MITSUBISHI']},manifest,base);
 const states=useExploration({type:'explore',filters:local,xDimension:'uf',seriesDimension:'marca',topN:12,xTopN:50,order:'value_desc',includeOthers:true,highlightBrands:['MITSUBISHI']},manifest,base);
 const ranking=React.useMemo(()=>crModelRanking(models.result),[models.result]),matrix=React.useMemo(()=>crStateMatrix(states.result),[states.result]);
 const mitRows=ranking?.rows.filter(r=>r.mitsubishi)??[],lead=mitRows[0];
 const headline=!ranking?set.label:lead?crTitle(lead.model)+' tem '+crPct(lead.share)+' '+set.of+' e é o '+lead.rank+'º modelo':'Mitsubishi sem emplacamentos '+set.of.replace(/^d/,'n')+' no recorte';
 const opp=matrix?matrix.rows.filter(r=>crQuadrant(r,matrix)==='opportunity').sort((a,b)=>b.total-a.total).slice(0,3).map(r=>r.uf):[];
 const max=ranking?.rows[0]?.count??1;
 return hs('section',{className:'cr','aria-labelledby':'cr-title',children:[
  hs('div',{className:'cr-head',children:[hs('div',{children:[h('h2',{id:'cr-title',children:'Mitsubishi no seu segmento'}),h('p',{children:'Comparação com os modelos que disputam o mesmo comprador. Filtros do painel valem, exceto marca e modelo.'})]}),
   h('div',{className:'tbm-seg',role:'group','aria-label':'Segmento',children:CR_SETS.map(s=>h('button',{type:'button','aria-pressed':s.id===setId,onClick:()=>setSetId(s.id),children:s.label+' · '+s.product},s.id))})]}),
  (models.error||states.error)&&h('p',{role:'alert',className:'tbm-warn',children:models.error||states.error}),
  hs('div',{className:'cr-grid2',children:[
   hs('div',{className:'cr-card',children:[h('h3',{children:headline}),h('p',{className:'cr-sub',children:ranking?'Participação no segmento, '+crInt(ranking.total)+' emplacamentos no total. Mitsubishi em vermelho.':'Calculando…'}),
    ranking&&h('div',{className:'cr-bars',role:'list',children:ranking.rows.map(r=>hs('div',{role:'listitem',className:'cr-bar'+(r.mitsubishi?' is-mit':''),children:[h('span',{className:'cr-name',children:r.rank+'. '+crTitle(r.model)}),h('span',{className:'cr-track',children:h('span',{className:'cr-fill',style:{width:(r.count/max*100).toFixed(1)+'%'}})}),h('span',{className:'cr-val',children:crPct(r.share)})]},r.model))})]}),
   hs('div',{className:'cr-card',children:[h('h3',{children:opp.length?'Onde crescer: '+opp.join(', '):'Participação Mitsubishi por UF'}),h('p',{className:'cr-sub',children:'Cada ponto é uma UF: tamanho do segmento contra a participação Mitsubishi nele. “Oportunidade” reúne UFs com segmento acima da mediana e participação abaixo dela.'}),
    matrix?h(CrMatrix,{matrix}):h('p',{className:'cr-sub',children:'Calculando…'})]})]}),
  h(CrConcentration,{})]});
}
if(typeof module!=='undefined'&&module.exports)module.exports={crModelRanking,crStateMatrix,crQuadrant,CR_SETS};
