// Ten-year monthly history from data/history/ (built by scripts/build-history.py).
// Long-range panels read these small aggregates instead of 129 monthly cubes. The
// global filters are applied when the file has that dimension; any other active
// filter is reported back so each panel can say what it ignores.
const HISTORY_FILES={national:['segmento','marca','grupo_modelo','bd_segmento','bd_carroceria','combustivel','propulsao','tipo_venda'],uf:['uf','segmento','marca','bd_segmento','bd_carroceria','combustivel','propulsao','tipo_venda']};
const HISTORY_REGIONS={Norte:['AC','AM','AP','PA','RO','RR','TO'],Nordeste:['AL','BA','CE','MA','PB','PE','PI','RN','SE'],'Centro-Oeste':['DF','GO','MS','MT'],Sudeste:['ES','MG','RJ','SP'],Sul:['PR','RS','SC']};
const HISTORY_FILTER_LABELS={uf:'UF',regiao:'Região',municipio:'Município',marca:'Marca',modelo:'Modelo',grupo_modelo:'Grupo de modelos',combustivel:'Combustível',segmento:'Segmento',subsegmento:'Subsegmento',tipo_venda:'Canal de venda',nacionalidade:'Nacionalidade',ano_fabricacao:'Ano de fabricação',potencia:'Potência',capacidade_carga:'Capacidade de carga',capacidade_passageiros:'Capacidade de passageiros',bd_segmento:'Porte',bd_carroceria:'Carroceria',bd_classe:'Classe BD',bd_macro:'Macrosegmento BD',bd_combustivel:'Tecnologia BD',bd_origem:'Origem do veículo',propulsao:'Propulsão'};
const historyCache=new Map();
function historySelection(value){if(value==null||value===''||value==='all')return [];const list=Array.isArray(value)?value:[value];return list.includes('all')?[]:list.map(String);}
// Which file serves these filters, and which active filters it cannot apply.
function historyPlan(filters={}){
 const active=Object.keys(filters).filter(k=>!['date','population'].includes(k)&&historySelection(filters[k]).length);
 const territorial=active.some(k=>k==='uf'||k==='regiao'),file=territorial?'uf':'national',dims=HISTORY_FILES[file];
 const ignored=active.filter(k=>!(dims.includes(k)||(k==='regiao'&&file==='uf')));
 return {file,active,ignored,ignoredLabels:ignored.map(k=>HISTORY_FILTER_LABELS[k]??k)};
}
async function historyFetch(file,base){
 const url=new URL('history/'+file+'.json.gz',base).href;
 if(!historyCache.has(url))historyCache.set(url,(async()=>{
  const response=await fetch(url,{credentials:'same-origin',redirect:'error'});if(!response.ok)throw Error('Histórico indisponível (HTTP '+response.status+').');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const text=bytes[0]===31&&bytes[1]===139?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);
  return JSON.parse(text);
 })().catch(error=>{historyCache.delete(url);throw error;}));
 return historyCache.get(url);
}
// Rows that pass the filters, as {month index, row}. `keep` lists dims to keep for grouping.
// population=light keeps only Auto and Comercial Leve, the same rule as the market worker.
// An impossible intersection (UF outside the chosen region, segment outside the universe)
// matches nothing; it never falls back to the whole country.
const HISTORY_LIGHT=['Auto','Comercial Leve'];
function historyRows(data,filters={}){
 const cols=data.columns,dims=data.dimensions,allowed=[];
 for(const [i,dim] of dims.entries()){
  let wanted=historySelection(filters[dim]),constrained=wanted.length>0;
  if(dim==='uf'&&historySelection(filters.regiao).length){const regions=historySelection(filters.regiao).flatMap(r=>HISTORY_REGIONS[r]??[]);wanted=constrained?wanted.filter(u=>regions.includes(u)):regions;constrained=true;}
  if(dim==='segmento'&&(filters.population??'light')==='light'){wanted=constrained?wanted.filter(v=>HISTORY_LIGHT.includes(v)):HISTORY_LIGHT;constrained=true;}
  if(!constrained)continue;
  const set=new Set(wanted),dict=data.dictionaries[dim];allowed.push([i+1,new Uint8Array(dict.length).map((_,code)=>set.has(dict[code])?1:0)]);
 }
 const out=[];for(const row of data.rows){let ok=true;for(const [c,mask] of allowed)if(!mask[row[c]]){ok=false;break;}if(ok)out.push(row);}
 return {rows:out,countIndex:cols.length-1};
}
// Monthly totals (filtered) next to the market total of the same month.
function historyMonthly(data,filters={},groupBy=null){
 const {rows,countIndex}=historyRows(data,filters),gi=groupBy?data.dimensions.indexOf(groupBy)+1:0,dict=groupBy?data.dictionaries[groupBy]:null;
 // market of reference = same universe (light or all content), no other filter
 const universe=historyRows(data,{population:filters.population??'light'}),market=new Float64Array(data.months.length);
 for(const row of universe.rows)market[row[0]]+=row[universe.countIndex];
 const months=data.months.map((m,i)=>({month:m.month,count:0,market:market[i],complete:m.complete,groups:groupBy?new Map():null}));
 for(const row of rows){const m=months[row[0]],n=row[countIndex];m.count+=n;if(gi){const name=dict[row[gi]];m.groups.set(name,(m.groups.get(name)??0)+n);}}
 return months;
}
// Business days: Monday–Friday minus national holidays, Carnaval (Monday and Tuesday),
// Good Friday and Corpus Christi, the days registrations offices usually close.
function historyEaster(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return Date.UTC(year,month-1,day);}
function historyHolidays(year){
 const iso=t=>new Date(t).toISOString().slice(0,10),easter=historyEaster(year),day=86400000;
 const fixed=['01-01','04-21','05-01','09-07','10-12','11-02','11-15','12-25',...(year>=2024?['11-20']:[])].map(d=>year+'-'+d);
 return new Set([...fixed,iso(easter-48*day),iso(easter-47*day),iso(easter-2*day),iso(easter+60*day)]);
}
function historyWorkingDays(month){
 const y=+month.slice(0,4),m=+month.slice(5,7),holidays=historyHolidays(y),last=new Date(Date.UTC(y,m,0)).getUTCDate();let n=0;
 for(let d=1;d<=last;d++){const t=new Date(Date.UTC(y,m-1,d)),w=t.getUTCDay();if(w!==0&&w!==6&&!holidays.has(t.toISOString().slice(0,10)))n++;}
 return n;
}
// End month of the global period (history panels look back from it).
function historyEndMonth(filters,months){const d=String(filters?.date??'');const end=/\.\.(\d{4}-\d{2})/.exec(d)?.[1]??(/^\d{4}-\d{2}/.exec(d)?.[0]);const list=months.map(m=>m.month);return end&&list.includes(end)?end:list.at(-1);}
function useHistory(filters,base,enabled=true){
 const plan=historyPlan(filters),[state,setState]=React.useState({data:null,error:null,file:null});
 React.useEffect(()=>{if(!enabled)return;let alive=true;historyFetch(plan.file,base).then(data=>{if(alive)setState({data,error:null,file:plan.file});}).catch(error=>{if(alive)setState({data:null,error:error.message,file:plan.file});});return ()=>{alive=false;};},[plan.file,base,enabled]);
 return {...state,pending:enabled&&state.file!==plan.file,plan};
}
// Always rendered when there is anything to declare: filters the history cannot apply and the
// panel's own intentional exception (`extra`), which holds even with no filter ignored.
function HistoryScopeNote({plan,extra}){
 if(!plan.ignored.length&&!extra)return null;
 return jsxRuntime.jsx('p',{className:'hx-scope',children:(plan.ignored.length?'Histórico mensal pré-calculado (2016 em diante), com os filtros globais exceto '+plan.ignoredLabels.join(', ')+', que este painel não consegue aplicar.':'')+(extra?(plan.ignored.length?' ':'')+extra:'')});
}
if(typeof module!=='undefined'&&module.exports)module.exports={HISTORY_FILES,HISTORY_REGIONS,historyPlan,historyRows,historyMonthly,historyEaster,historyHolidays,historyWorkingDays,historyEndMonth,historySelection};
