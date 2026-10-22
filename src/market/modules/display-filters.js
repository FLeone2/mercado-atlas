// Categories with almost no volume ("Não classificado no BD", "Sem correspondência BD",
// propulsão "Não classificado": together under 0,1% of registrations) stay out of the
// charts and tables. Totals and every share keep using the full universe: rows are
// dropped from category lists only, never subtracted from denominators.
const HIDDEN_CATEGORIES=new Set(['Não classificado no BD','Sem correspondência BD','Não classificado']);
// Keys whose subtree keeps every row: the Explorar período check needs the complete
// composition to confirm it covers the total, and hides these rows itself when drawing.
const HIDDEN_CATEGORY_KEEP=new Set(['interactive']);
const hiddenCategoryRow=row=>{for(const key in row){const v=row[key];if(typeof v==='string'&&HIDDEN_CATEGORIES.has(v))return true;}return false;};
function hideUnclassified(value,depth=0){
 if(value===null||typeof value!=='object'||depth>12)return value;
 if(Array.isArray(value)){
  let changed=false;const out=[];
  for(const item of value){
   if(item&&typeof item==='object'&&!Array.isArray(item)&&hiddenCategoryRow(item)){changed=true;continue;}
   const next=hideUnclassified(item,depth+1);if(next!==item)changed=true;out.push(next);
  }
  return changed?out:value;
 }
 if(Object.getPrototypeOf(value)!==Object.prototype)return value;
 let out=null;
 for(const key in value){if(HIDDEN_CATEGORY_KEEP.has(key))continue;const next=hideUnclassified(value[key],depth+1);if(next!==value[key]){out??={...value};out[key]=next;}}
 return out??value;
}
if(typeof module!=='undefined'&&module.exports)module.exports={HIDDEN_CATEGORIES,hideUnclassified};
