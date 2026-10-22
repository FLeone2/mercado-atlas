// Results computed at build time (scripts/precompute.cjs) for the quick periods without
// filters. They are used only when the index was built from this exact manifest and lists
// this exact request; anything else (or any error) falls back to the live calculation.
// Identity = calculation version + hash of the WHOLE manifest (keys sorted), so any change in
// coverage, revision or metadata, not only in file names, invalidates the stored answers.
// Bump PRECOMPUTED_CALC_VERSION whenever the worker's answer to the same request changes.
const PRECOMPUTED_CALC_VERSION='market-2026-10-22';
function precomputedCanonical(value){
 if(Array.isArray(value))return '['+value.map(precomputedCanonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+precomputedCanonical(value[k])).join(',')+'}';
 return JSON.stringify(value)??'null';
}
function precomputedHash(text){
 // two FNV-1a 32-bit passes with different seeds: 64 bits, identical in the browser and in Node
 let a=0x811c9dc5,b=0x01000193^0x9e3779b9;
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,0x01000193)>>>0;b=Math.imul(b^c,0x01000193^0x5bd1e995)>>>0;}
 return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
function precomputedIdentity(manifest){
 return 'v2|'+PRECOMPUTED_CALC_VERSION+'|'+precomputedHash(precomputedCanonical(manifest??null));
}
const precomputedIndexes=new Map();
async function precomputedJson(url){
 const response=await fetch(url,{credentials:'same-origin',redirect:'error'});
 if(!response.ok)throw Error('HTTP '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 // Hosts may or may not decode .gz on the way: inflate only when the gzip magic is there.
 const text=bytes[0]===0x1f&&bytes[1]===0x8b?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);
 return JSON.parse(text);
}
async function loadPrecomputed(base,manifest,key){
 try{
  if(typeof DecompressionStream!=='function'||!manifest)return null;
  if(!precomputedIndexes.has(base))precomputedIndexes.set(base,precomputedJson(new URL('precomputed.json',base)).catch(()=>null));
  const index=await precomputedIndexes.get(base);
  const file=index?.version===1&&index.identity===precomputedIdentity(manifest)?index.entries?.[key]:null;
  if(!file)return null;
  const result=await precomputedJson(new URL('precomputed/'+file,base));
  return result&&typeof result==='object'?result:null;
 }catch{return null;}
}
if(typeof module!=='undefined'&&module.exports)module.exports={precomputedIdentity,precomputedCanonical,precomputedHash,PRECOMPUTED_CALC_VERSION};
