// Results computed at build time (scripts/precompute.cjs) for the quick periods without
// filters. They are used only when the index was built from this exact manifest and lists
// this exact request; anything else (or any error) falls back to the live calculation.
function precomputedIdentity(manifest){
 // Cube file names carry their content hash, so this changes whenever any month changes.
 const files=(manifest?.months??[]).filter(m=>m.cubePath).map(m=>m.cubePath+'+'+(m.originCubePath??''));
 return [manifest?.generatedAt??'',manifest?.coverageEnd??'',...files].join('|');
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
if(typeof module!=='undefined'&&module.exports)module.exports={precomputedIdentity};
