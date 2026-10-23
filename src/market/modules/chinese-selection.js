// Which brands count as "Chinese" in every Chinese-origin view (origin charts, pyramid, Economia).
// The audited list is the default; the reader can add or remove brands and the choice travels in
// the address bar (?chn=["BYD","GWM",…]). Everything downstream keeps using classifyBrandOrigin:
// the selection only rewrites the mapping it reads (chineseMapping), so the worker, the pyramid and
// the origin views all agree.
const CHINESE_PARAM='chn';
const CHINESE_SUFFIX=/\s*\((?:B|T)\)\s*$/;
// base name of a brand: no (B)/(T) variant and no hyphen/space difference (CAOA-CHERY = CAOA CHERY)
const chineseBase=name=>String(name??'').trim().toUpperCase().replace(CHINESE_SUFFIX,'').replace(/-/g,' ').replace(/\s+/g,' ');
// One-click additions that are NOT in the default (policy of the audited classification).
const CHINESE_EXTRAS=[
 {id:'caoa',label:'Parcerias Brasil–China (CAOA Chery, CAOA Changan)',brands:['CAOA CHERY','CAOA-CHERY','CAOA CHANGAN','CAOA-CHANGAN']},
 {id:'mg',label:'MG (controlada pela SAIC)',brands:['MG']},
 {id:'volvo',label:'Volvo (controlada pela Geely)',brands:['VOLVO']},
];
function chineseDefaults(mapping){return [...new Set(Object.entries(mapping?.brands??{}).filter(([,r])=>r.chineseOrigin===true).map(([k])=>chineseBase(k)))].sort();}
function chineseParse(raw){
 try{const list=JSON.parse(raw);if(Array.isArray(list))return [...new Set(list.map(chineseBase).filter(Boolean))].slice(0,250).sort();}catch{}
 return null;
}
// null = default (audited) list. The snapshot is replaced on every change so React can compare it.
let chineseCurrent=(()=>{try{const raw=new URLSearchParams(globalThis.location?.search??'').get(CHINESE_PARAM);return raw?chineseParse(raw):null;}catch{return null;}})();
const chineseListeners=new Set();
function chineseGet(){return chineseCurrent;}
function chineseSubscribe(fn){chineseListeners.add(fn);return ()=>chineseListeners.delete(fn);}
function setChineseSelection(list,defaults=null){
 const next=list==null?null:[...new Set(list.map(chineseBase).filter(Boolean))].sort();
 const same=next&&defaults&&next.length===defaults.length&&next.every((b,i)=>b===defaults[i]);
 chineseCurrent=same?null:next;
 try{const url=new URL(globalThis.location.href);if(chineseCurrent)url.searchParams.set(CHINESE_PARAM,JSON.stringify(chineseCurrent));else url.searchParams.delete(CHINESE_PARAM);if(url.href!==globalThis.location.href)globalThis.history.replaceState(globalThis.history.state,'',url);}catch{}
 for(const fn of chineseListeners)fn();
}
function useChineseSelection(){return React.useSyncExternalStore(chineseSubscribe,chineseGet,chineseGet);}
// The mapping classifyBrandOrigin should read for this selection (memoized per selection snapshot).
const chineseMappingCache=new WeakMap();
function chineseMapping(mapping,selection){
 if(!selection||!mapping?.brands)return mapping;
 let byMapping=chineseMappingCache.get(selection);if(!byMapping){byMapping=new WeakMap();chineseMappingCache.set(selection,byMapping);}
 if(byMapping.has(mapping))return byMapping.get(mapping);
 const chosen=new Set(selection),brands={};
 for(const [key,rule] of Object.entries(mapping.brands)){
  const wanted=chosen.has(chineseBase(key));
  brands[key]=wanted?(rule.chineseOrigin===true?rule:{...rule,chineseOrigin:true}):(rule.chineseOrigin===true?{...rule,chineseOrigin:false,originCode:'EXCLUDED_BY_READER'}:rule);
 }
 for(const name of chosen)if(!Object.keys(brands).some(k=>chineseBase(k)===name))brands[name]={origin:'Escolhida pelo leitor',originCode:'READER_SELECTED',chineseOrigin:true,sourceUrl:null,startYear:null};
 const out={...mapping,brands};byMapping.set(mapping,out);return out;
}
const isChineseBrand=(name,mapping,selection)=>{const base=chineseBase(name);return selection?selection.includes(base):chineseDefaults(mapping).includes(base);};
if(typeof module!=='undefined'&&module.exports)module.exports={chineseBase,chineseDefaults,chineseParse,chineseMapping,CHINESE_EXTRAS};
