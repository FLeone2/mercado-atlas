// Categories with almost no volume ("Não classificado no BD", "Sem correspondência BD",
// propulsão "Não classificado": together under 0,1% of registrations) stay out of the
// ranking lists (`groups.<dimension>`), and only there: a row is dropped only when the row
// itself IS that category (its `name`). Every other structure (connections, catalog
// compositions, origin series, pyramids, monthly rows) keeps the complete data, so totals,
// denominators and 100% compositions are computed on the full universe.
const HIDDEN_CATEGORIES=new Set(['Não classificado no BD','Sem correspondência BD','Não classificado']);
function hideUnclassified(value,depth=0,inGroups=false){
 if(value===null||typeof value!=='object'||depth>12)return value;
 if(Array.isArray(value)){
  if(!inGroups)return value;
  const out=value.filter(row=>!(row&&typeof row==='object'&&HIDDEN_CATEGORIES.has(row.name)));
  return out.length===value.length?value:out;
 }
 if(Object.getPrototypeOf(value)!==Object.prototype)return value;
 let out=null;
 for(const key in value){
  const next=key==='groups'&&!inGroups?hideGroups(value[key]):inGroups?value[key]:hideUnclassified(value[key],depth+1);
  if(next!==value[key]){out??={...value};out[key]=next;}
 }
 return out??value;
}
function hideGroups(groups){
 if(!groups||typeof groups!=='object'||Array.isArray(groups))return groups;
 let out=null;
 for(const key in groups){const next=hideUnclassified(groups[key],0,true);if(next!==groups[key]){out??={...groups};out[key]=next;}}
 return out??groups;
}
if(typeof module!=='undefined'&&module.exports)module.exports={HIDDEN_CATEGORIES,hideUnclassified};
