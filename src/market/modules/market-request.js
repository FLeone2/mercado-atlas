// One definition of a market query, shared by useMarketData and scripts/precompute.cjs:
// which collections the worker computes for a mode, the brand the pulse follows, and the
// key that identifies the request. A precomputed result is only used for the same key.
function marketRequestOptions(mode){
 return {
  includeInteractive:mode==='interactive'||mode==='interactive-daily',
  includeDaily:mode==='interactive-daily',
  includeMunicipalLeaders:mode==='leaders',
  includeMunicipalLeadersUF:mode==='leaders-br',
  includeYearGroups:mode==='atlas',
  includeFlow:mode==='flow'||mode==='conexoes',
  includeCatalog:['catalog','primary-map'].includes(mode),
  includeMarketBaseline:['technology','origin'].includes(mode),
  includeHistoryComparisons:mode==='history',
  includeChannelReference:['geography','primary-map'].includes(mode),
  includeOriginAnalysis:mode==='origin',
  includeMitsubishiProfile:['competition','ranking','segments'].includes(mode),
  includeConnections:mode==='competition'||mode==='conexoes'
 };
}
// The pulse follows the single brand in the filters, otherwise Mitsubishi.
function marketFocusBrand(filters){
 const list=(Array.isArray(filters?.marca)?filters.marca:filters?.marca&&filters.marca!=='all'?[filters.marca]:[]).filter(v=>v!=='all');
 return list.length===1?String(list[0]):'MITSUBISHI';
}
function marketRequestKey(filterKey,options,focusBrand){
 return filterKey+'|'+JSON.stringify(Object.keys(options).sort().filter(k=>options[k]))+'|'+(focusBrand??'');
}
if(typeof module!=='undefined'&&module.exports)module.exports={marketRequestOptions,marketFocusBrand,marketRequestKey};
