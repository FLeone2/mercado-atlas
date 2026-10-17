// Primary-map deep state is additive to the host's f.* / tab state and hash.
// Only explicit map context and view settings are persisted; never source rows.
const PRIMARY_MAP_ALLOWED_METRICS=['count','share','per1000','channelShare'];
// Repair old display-label filters without changing source spelling or widening UF scope.
function primaryMapCanonicalMunicipalityFilters(filters){
 const ufs=(Array.isArray(filters?.uf)?filters.uf:[filters?.uf]).filter(v=>v&&v!=='all');
 const canonical=value=>{
  if(typeof value!=='string')return value;
  const match=value.match(/^(.*) · ([A-Z]{2})$/);
  return match&&match[1]&&ufs.includes(match[2])?match[1]:value;
 };
 const value=filters?.municipio;
 const municipio=Array.isArray(value)?value.map(canonical):canonical(value);
 return {...filters,...(value===undefined?{}:{municipio})};
}
function primaryMapReadState(search,tab){
 try{
  const raw=new URLSearchParams(search).get('pm.'+tab);if(!raw||raw.length>16000)return null;
  const data=JSON.parse(raw);if(!data||data.version!==1)return null;
  const view={metric:PRIMARY_MAP_ALLOWED_METRICS.includes(data.view?.metric)?data.view.metric:'count',showDealers:data.view?.showDealers!==false,detail:typeof data.view?.detail==='string'?data.view.detail.slice(0,200):null};
  let context=null;
  if(tab==='geography'&&data.context&&typeof data.context.values==='object'){
   const values={};for(const [field,value] of Object.entries(data.context.values)){
    if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field)||['constructor','prototype','__proto__'].includes(field))continue;
    if(typeof value==='string'&&value.length<=500)values[field]=value;
   }
   const pending=Array.isArray(data.context.pending)?data.context.pending.filter(p=>p&&typeof p.field==='string'&&Array.isArray(p.values)).map(p=>({field:p.field,values:p.values.filter(v=>typeof v==='string').slice(0,100)})):[];
   context={values:primaryMapCanonicalMunicipalityFilters(values),pending};
  }
  return {view,context};
 }catch{return null;}
}
function primaryMapStateURL(href,tab,view,context){
 const url=new URL(href);url.searchParams.set('pm.'+tab,JSON.stringify({version:1,view:{metric:view.metric,showDealers:view.showDealers,detail:view.detail??null},...(tab==='geography'&&context?{context}:{})}));return url.href;
}
function usePrimaryMapPersistence(tab,view,context,setView,setContext){
 React.useEffect(()=>{
  if(!['dashboard','geography'].includes(tab)||!globalThis.location?.href)return;
  const href=primaryMapStateURL(globalThis.location.href,tab,view,context);
  if(href!==globalThis.location.href)globalThis.history?.replaceState(globalThis.history.state,'',href);
 },[tab,view,context]);
 React.useEffect(()=>{
  const restore=()=>{const saved=primaryMapReadState(globalThis.location?.search??'',tab);if(saved){setView(saved.view);if(tab==='geography'&&saved.context)setContext(saved.context);}};
  globalThis.addEventListener?.('popstate',restore);return()=>globalThis.removeEventListener?.('popstate',restore);
 },[tab,setView,setContext]);
}
if(typeof module!=='undefined'&&module.exports)module.exports={primaryMapCanonicalMunicipalityFilters,PRIMARY_MAP_ALLOWED_METRICS,primaryMapReadState,primaryMapStateURL};
