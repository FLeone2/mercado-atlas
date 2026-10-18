/* Standalone worker: concatenate animations-data.js before this file in a Blob. */
(function (root) {
  'use strict';
  const A = root.AnimationData || (typeof require === 'function' ? require('./animations-data.js') : null);
  if (!A) throw Error('O módulo de dados das animações não foi carregado.');
  async function hashCacheIdentity(value){const bytes=new TextEncoder().encode(JSON.stringify(value)),digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
  async function manifestCacheIdentity(manifest,base){return new URL(base).href+'|'+await hashCacheIdentity(manifest);}
  // Conservative retained-object estimate. Stop at the budget without serializing,
  // encoding, allocating a full traversal stack, or revisiting shared aliases.
  function boundedResultSize(value,limit) {
    let bytes=0;const seen=new WeakSet();
    function visit(item,depth=0) {
      if(bytes>limit)return;
      if(item===null||item===undefined){bytes+=8;return;}
      if(typeof item==='string'){bytes+=16+item.length*2;return;}
      if(typeof item!=='object'){bytes+=8;return;}
      if(seen.has(item))return;seen.add(item);
      if(depth>64){bytes=limit+1;return;}
      if(Array.isArray(item)){
        bytes+=32+item.length*8;if(bytes>limit)return;
        for(let i=0;i<item.length&&bytes<=limit;i++)visit(item[i],depth+1);
      }else{
        bytes+=48;
        for(const key in item){if(!Object.hasOwn(item,key))continue;bytes+=24+key.length*2;if(bytes>limit)return;visit(item[key],depth+1);if(bytes>limit)return;}
      }
    }
    visit(value);return bytes;
  }
  function createResultCache({maxBytes=8*1024*1024,maxEntries=4}={}){
   const cache=new Map();let bytes=0;
   return {get(key){if(!cache.has(key))return null;const item=cache.get(key);cache.delete(key);cache.set(key,item);return item.value;},set(key,value){const size=maxEntries<1?maxBytes+1:boundedResultSize(value,maxBytes);if(cache.has(key)){bytes-=cache.get(key).bytes;cache.delete(key);}if(size>maxBytes||maxEntries<1)return;while(cache.size&&(bytes+size>maxBytes||cache.size>=maxEntries)){const first=cache.keys().next().value;bytes-=cache.get(first).bytes;cache.delete(first);}cache.set(key,{value,bytes:size});bytes+=size;},clear(){cache.clear();bytes=0;},stats:()=>({entries:cache.size,logicalBytes:bytes,maxBytes,maxEntries,sizing:'bounded-retained-graph-estimate'})};
  }

  // Cache only source-month aggregates, before window-sensitive YTD/YoY and geometry joins.
  // Keep dictionary choices alongside frames so a warm visible month needs no cube decode.
  function createMonthlyFrameCache({maxBytes=24*1024*1024,maxEntries=240,persistent}={}) {
    const memory=createResultCache({maxBytes,maxEntries});
    if(persistent===undefined)persistent=root.PerformanceCache?.createPersistentCache({namespace:'animation-months-v1',maxBytes:64*1024*1024,maxEntries:480});
    let hits=0,misses=0,persistentHits=0,epoch=0,writes=Promise.resolve();
    const enqueue=work=>(writes=writes.then(work).catch(()=>{}));
    const valid=(value,key)=>value?.version===1&&value.key===key&&A.validMonth(value.frame?.month)&&typeof value.frame.complete==='boolean'&&typeof value.frame.coverageStatus==='string'&&
      (value.frame.observedTotal===null||Number.isFinite(value.frame.observedTotal))&&value.frame.groups&&Object.values(value.frame.groups).every(Array.isArray)&&
      ['originRows','ufRows','municipalityRows'].every(field=>Array.isArray(value.frame[field]))&&value.choices&&Object.values(value.choices).every(values=>Array.isArray(values)&&values.every(value=>typeof value==='string'));
    return {
      async get(key){const active=epoch;let value=memory.get(key);if(value){hits++;return value;}try{await writes;value=await persistent?.get(key);}catch{}if(active!==epoch)return null;if(valid(value,key)){memory.set(key,value);hits++;persistentHits++;return value;}misses++;return null;},
      async set(key,value){const entry={...value,key};memory.set(key,entry);await enqueue(()=>persistent?.set(key,entry));},
      clear({persistent:clearPersistent=false}={}){epoch++;memory.clear();return clearPersistent?enqueue(()=>persistent?.clear()):Promise.resolve();},
      stats:()=>({...memory.stats(),hits,misses,persistentHits})
    };
  }

  function monthlyRequestIdentity(request) {
    const filters=A.canonicalFilters(request.filters);delete filters.date;
    return JSON.stringify({version:1,filters,dimension:request.dimension,projection:A.projectionSpec(request),selectedUF:request.selectedUF,preset:request.preset,porte:A.selection(request.porte),focusBrand:request.focusBrand??null,heatBrands:request.heatBrands??null,originMapping:request.originMapping??null,includeVehicleOrigin:request.includeVehicleOrigin!==false});
  }

  const cancelled=(signal,stale=false)=>{if(signal?.aborted||stale)throw new DOMException('Consulta cancelada.','AbortError');};
  function validateMonthlyCube(cube,meta){
   if(!cube||cube.month!==meta.month||!Array.isArray(cube.rows)||(!Array.isArray(cube.columns)&&!Array.isArray(cube.dimensions)))throw Error('Cubo mensal incompatível: '+meta.month);
   const columns=cube.columns??[...cube.dimensions,'count'];
   if(!columns.includes('date')||!columns.includes('count'))throw Error('Cubo mensal sem data ou quantidade: '+meta.month);
   if(columns.some(c=>typeof c!=='string')||new Set(columns).size!==columns.length)throw Error('Colunas mensais inválidas: '+meta.month);
   const countIndex=columns.indexOf('count'),dictSizes=columns.map((column,i)=>{
    if(i===countIndex)return 0;
    const dictionary=cube.dictionaries?.[column];if(!Array.isArray(dictionary))throw Error('Dicionário mensal inválido: '+meta.month);
    return dictionary.length;
   });
   if(cube.dictionaries.date.some(date=>typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==meta.month||Number(date.slice(-2))<1||Number(date.slice(-2))>new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate()))throw Error('Data fora do mês de origem: '+meta.month);
   for(const row of cube.rows){
    if(!Array.isArray(row)||row.length!==columns.length)throw Error('Linha mensal incompatível: '+meta.month);
    for(let i=0;i<row.length;i++){const value=row[i];if(!Number.isSafeInteger(value)||value<0||(i!==countIndex&&value>=dictSizes[i]))throw Error('Valor mensal inválido: '+meta.month);}
   }
  }
  // Limits cover retained aggregate cells and compressed input bytes, not transient/total JS heap.
  function createMarketCubeLoader({fetchImpl=globalThis.fetch,origin=globalThis.location?.origin,maxCells=5000000,maxCompressedBytes=16*1024*1024}={}){
   const decoded=new Map(),compressed=new Map();let cells=0,bytes=0,namespace='',epoch=0;
   const size=c=>c.rows.length*(c.columns?.length??c.dimensions.length+1);
   const touch=(map,key)=>{const value=map.get(key);map.delete(key);map.set(key,value);return value;};
   // Epoch invalidation also retires pending loads, even if a transport ignores abort.
   const clear=()=>{epoch++;decoded.clear();compressed.clear();cells=0;bytes=0;};
   async function load(meta,base,signal){
    const activeEpoch=epoch,check=()=>cancelled(signal,activeEpoch!==epoch);check();
    const baseURL=new URL(base),url=new URL(meta.cubePath,baseURL);
    if(!['http:','https:'].includes(baseURL.protocol)||!['http:','https:'].includes(url.protocol)||url.origin!==baseURL.origin||(origin&&origin!=='null'&&url.origin!==origin))throw Error('A fonte de dados deve ter a mesma origem.');
    if(baseURL.username||baseURL.password||url.username||url.password)throw Error('Credenciais não são aceitas na URL de dados.');
    // sha256 identifies the original source workbook; it is not a gzip-body checksum.
    const key=JSON.stringify([namespace,url.href,meta.sha256??'',meta.month]);
    if(decoded.has(key))return touch(decoded,key);
    let input;const reusedCompressed=compressed.has(key);
    if(reusedCompressed)input=touch(compressed,key);else {
     const response=await fetchImpl(url,{signal,credentials:'same-origin',redirect:'error'});check();
     if(!response.ok)throw Error('Arquivo indisponível: '+meta.month+' (HTTP '+response.status+').');
     input=new Uint8Array(await response.arrayBuffer());check();
    }
    let text;if(input[0]===31&&input[1]===139){
     if(typeof DecompressionStream==='undefined')throw Error('Este navegador não oferece descompressão gzip. Abra em uma versão recente do Chrome, Edge, Safari ou Firefox.');
     try{text=await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}catch{check();throw Error('Arquivo mensal gzip inválido: '+meta.month+'.');}
    }else text=new TextDecoder().decode(input);
    check();let cube;try{cube=JSON.parse(text);}catch{throw Error('Arquivo mensal inválido: '+meta.month+'.');}
    // JSON.parse/validation are synchronous; abort takes effect at the next boundary.
    // Already-retained bytes passed the same validation on their first decode.
    if(!reusedCompressed)validateMonthlyCube(cube,meta);check();
    if(!compressed.has(key)&&input.byteLength<=maxCompressedBytes){
     while(compressed.size&&bytes+input.byteLength>maxCompressedBytes){const first=compressed.keys().next().value;bytes-=compressed.get(first).byteLength;compressed.delete(first);}
     compressed.set(key,input);bytes+=input.byteLength;
    }
    const n=size(cube);if(n<=maxCells){
     // Concurrent identical loads may finish together. Replacement must not double-count cells.
     if(decoded.has(key)){cells-=size(decoded.get(key));decoded.delete(key);}
     while(decoded.size&&cells+n>maxCells){const first=decoded.keys().next().value;cells-=size(decoded.get(first));decoded.delete(first);}
     decoded.set(key,cube);cells+=n;
    }
    return cube;
   }
   return {load,clear,setNamespace(value){if(value!==namespace){clear();namespace=value;}},stats:()=>({decodedEntries:decoded.size,cells,maxCells,compressedEntries:compressed.size,compressedBytes:bytes,maxCompressedBytes})};
  }
  async function loadGeometry(uf,base,signal) {
    const baseURL=new URL(base),url=new URL('geography/'+encodeURIComponent(uf)+'.json',baseURL);
    if(!['http:','https:'].includes(baseURL.protocol)||url.origin!==baseURL.origin||(globalThis.location?.origin&&globalThis.location.origin!=='null'&&url.origin!==globalThis.location.origin)||baseURL.username||baseURL.password)throw Error('A malha deve ter a mesma origem.');
    const response=await fetch(url,{signal,credentials:'same-origin',redirect:'error'});if(!response.ok)throw Error('Malha municipal indisponível (HTTP '+response.status+').');
    const geometry=await response.json();if(geometry.uf!==uf||!Array.isArray(geometry.features))throw Error('Malha municipal incompatível.');return geometry;
  }
  async function runAnimations(input,{loadCube,isCancelled=()=>false,onProgress=()=>{},yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0)),geometryLoader=loadGeometry,signal,monthlyCache,sourceIdentity}={}) {
    const request=A.normalizeRequest(input),projection=A.projectionSpec(request),{manifest,filters,startMonth,endMonth}=request,index=new Map((manifest?.months??[]).map(meta=>[meta.month,meta]));
    const gran=request.granularity,visible=A.listMonths(startMonth,endMonth);
    if(gran==='day'&&visible.length>12)throw Error('A visão por dias aceita janelas de até 12 meses. Reduza o período ou percorra por meses.');
    const context=gran==='day'?A.listMonths(A.prevMonth(startMonth),endMonth):request.mode==='ytd'?A.listMonths(startMonth.slice(0,4)+'-01',endMonth):visible;
    const needed=[...new Set([...context,...(request.includeYoY?context.map(A.priorMonth):[])])].sort();
    const monthNamespace=monthlyCache?await hashCacheIdentity([sourceIdentity??[request.base,manifest],monthlyRequestIdentity(request)]):null;
    const frames=[],choices=Object.fromEntries(A.DIMS.map(dim=>[dim,new Set()])),errors=[];
    for(let i=0;i<needed.length;i++){
      if(isCancelled())throw new DOMException('Consulta cancelada.','AbortError');
      if(gran==='day'){
        const month=needed[i],meta=index.get(month);let list;
        if(!meta?.cubePath)list=A.emptyDays(month,meta,request);
        else {
          try{
            const needsOrigin=A.selection(filters.bd_origem).length>0;
            if(needsOrigin&&!meta.originCubePath)throw Error('Origem do veículo indisponível na fonte mensal.');
            const loadMeta=meta.originCubePath&&(request.includeVehicleOrigin!==false||needsOrigin)?{...meta,cubePath:meta.originCubePath,sha256:meta.originCubeSha256??meta.sha256}:meta;
            const cube=await loadCube(loadMeta,request.base,signal);if(isCancelled())throw new DOMException('Consulta cancelada.','AbortError');
            list=A.dailyFrames(cube,meta,request);
            if(visible.includes(month))for(const dim of A.DIMS)for(const value of cube.dictionaries?.[dim]??[])choices[dim].add(String(value??'Não informado'));
          }catch(error){if(error.name==='AbortError'||isCancelled())throw error;list=A.emptyDays(month,meta,request,'unavailable',error.message);errors.push({month,error:error.message});}
        }
        frames.push(...list);onProgress({done:i+1,total:needed.length,month});if(i<needed.length-1)await yieldControl();continue;
      }
      const month=needed[i],meta=index.get(month),monthKey=monthlyCache?JSON.stringify([monthNamespace,month,meta??null]):null;let frame,monthlyChoices=null;
      const cached=monthlyCache?await monthlyCache.get(monthKey):null;cancelled(signal,isCancelled());
      if(cached){frame=cached.frame;monthlyChoices=cached.choices;}
      else if(!meta?.cubePath)frame=A.emptyFrame(month,meta,request);
      else {
        try {
          const needsOrigin=A.selection(filters.bd_origem).length>0;
          if(needsOrigin&&!meta.originCubePath)throw Error('Origem do veículo indisponível na fonte mensal.');
          const loadMeta=meta.originCubePath&&request.includeVehicleOrigin!==false?{...meta,cubePath:meta.originCubePath,sha256:meta.originCubeSha256??meta.sha256}:needsOrigin?{...meta,cubePath:meta.originCubePath,sha256:meta.originCubeSha256??meta.sha256}:meta;
          const cube=await loadCube(loadMeta,request.base,signal);if(isCancelled())throw new DOMException('Consulta cancelada.','AbortError');
          frame=A.aggregateCube(cube,meta,request);
          monthlyChoices=Object.fromEntries(A.DIMS.map(dim=>[dim,(cube.dictionaries?.[dim]??[]).map(value=>String(value??'Não informado'))]));
        } catch(error) {
          if(error.name==='AbortError'||isCancelled())throw error;
          frame={...A.emptyFrame(month,meta,request,'unavailable'),reason:error.message};errors.push({month,error:error.message});
        }
      }
      const projected=cached?frame:A.projectFrame(frame,request);
      if(!cached&&monthlyCache&&frame.coverageStatus!=='unavailable'){cancelled(signal,isCancelled());await monthlyCache.set(monthKey,{version:1,frame:projected,choices:monthlyChoices??{}});cancelled(signal,isCancelled());}
      if(visible.includes(month))for(const dim of A.DIMS)for(const value of monthlyChoices?.[dim]??[])choices[dim].add(value);
      frames.push(projected);onProgress({done:i+1,total:needed.length,month});if(i<needed.length-1)await yieldControl();
    }
    let monthlyFrames=frames,geometryWarning=null;
    if(request.selectedUF&&(!projection||projection.municipal)){try{const geometry=input.geometry??await geometryLoader(request.selectedUF,request.base,signal);if(isCancelled())throw new DOMException('Consulta cancelada.','AbortError');monthlyFrames=A.joinMunicipalities(frames,geometry);}catch(error){if(error.name==='AbortError'||isCancelled())throw error;geometryWarning=error.message;}}
    const transformed=gran==='day'?A.rollingFrames(monthlyFrames,7,request):request.mode==='ytd'?A.yearToDateFrames(monthlyFrames,request):monthlyFrames;
    const compared=request.includeYoY?A.attachYoY(transformed,request):transformed;
    const dayFrom=startMonth+'-01',dayTo=A.monthEnd(endMonth),shown=gran==='day'?compared.filter(frame=>frame.month>=dayFrom&&frame.month<=dayTo):gran==='year'?A.pickYearFrames(compared,startMonth,endMonth):compared.filter(frame=>visible.includes(frame.month));
    const resultFrames=shown.map(frame=>A.projectFrame(frame,request,true));
    const includeMonthlyFrames=gran==='month'&&(!projection||request.mode==='monthly'||request.includeMonthlyFrames===true);
    const monthlyCompared=request.mode==='monthly'?resultFrames:!includeMonthlyFrames?[]:(request.includeYoY?A.attachYoY(monthlyFrames,request):monthlyFrames).filter(frame=>visible.includes(frame.month)).map(frame=>A.projectFrame(frame,request,true));
    const coverage=resultFrames.map(frame=>({month:frame.month,status:frame.coverageStatus,complete:frame.complete,missingMonths:frame.missingMonths??[],reason:frame.reason??null}));
    const windowDisclosure=(gran==='day'?'Quadros diários: cada quadro soma os 7 dias terminados no dia (média móvel), e o crescimento compara com a mesma janela do ano anterior. ':gran==='year'?'Quadros anuais: cada ano soma janeiro até '+endMonth.slice(5)+'/ano, para comparar períodos iguais. ':'')+'Animações usam meses civis completos de '+startMonth+' a '+endMonth+'. O filtro global de datas ('+String(request.originalDate)+') é substituído apenas nesta aba; os demais filtros são preservados.';
    const presetNotes=A.presetChecks(request.preset,request.porte).map(([dim,values])=>dim+' = '+values.join(' ou ')+' (interseção com os filtros globais).');
    const notes=[windowDisclosure,...presetNotes,'Participações usam volumes ponderados do recorte completo, antes do Top N.','Mês ausente ou parcial fica indisponível; YTD reinicia em janeiro e exige todos os meses.',...(geometryWarning?[geometryWarning]:[])];
    return {frames:resultFrames,monthlyFrames:monthlyCompared,monthlyFramesIncluded:includeMonthlyFrames,dataView:projection?.view??null,coverage,complete:coverage.every(c=>c.complete),mode:request.mode,granularity:gran,dimension:request.dimension,filters:A.canonicalFilters(filters),originalDate:request.originalDate,removedFilters:[],replacedFilters:['date'],range:{start:startMonth+'-01',end:A.monthEnd(endMonth)},startMonth,endMonth,selectedUF:request.selectedUF,municipalityRequested:Boolean(request.selectedUF)&&(!projection||projection.municipal),windowDisclosure,notes,preset:request.preset,presetFilters:A.presetChecks(request.preset,request.porte),presetValidation:{required:A.presetChecks(request.preset,request.porte),observed: Object.fromEntries(['bd_segmento','bd_carroceria'].map(dim=>[dim,[...choices[dim]].sort(A.textCompare)]))},choices:Object.fromEntries(Object.entries(choices).map(([dim,values])=>[dim,[...values].sort(A.textCompare)])),sourceErrors:errors.filter(e=>visible.includes(e.month)),geometryWarning,denominatorDefinition:'Volume de emplacamentos no mesmo mês e recorte, antes da seleção visual Top N.',electrifiedTechnologies:[...A.ELECTRIFIED]};
  }
  function installAnimationWorker(port,{loader=createMarketCubeLoader(),resultCache=createResultCache({maxBytes:24*1024*1024,maxEntries:4}),identity=manifestCacheIdentity,yieldControl,geometryLoader=loadGeometry,monthlyCache=createMonthlyFrameCache()}={}) {
    let generation=0,controller=null,namespace=null;
    const clear=()=>{generation++;controller?.abort();controller=null;loader.clear();resultCache.clear();namespace=null;return monthlyCache.clear({persistent:true});};
    port.onmessage=async({data})=>{
      const token=++generation;controller?.abort();controller=null;
      if(data.type==='clear-cache'){loader.clear();resultCache.clear();namespace=null;await monthlyCache.clear({persistent:true});return;}
      if(data.type==='cancel'){if(data.releaseCubes)loader.clear();return;}
      if(data.type&&data.type!=='animations'){port.postMessage({id:data.id,error:'Tipo de consulta não suportado.'});return;}
      const activeController=new AbortController();controller=activeController;const current=()=>generation===token&&!activeController.signal.aborted;
      try {
        const sourceIdentity=await identity(data.manifest,data.base);if(!current())return;
        if(sourceIdentity!==namespace){loader.setNamespace(sourceIdentity);resultCache.clear();monthlyCache.clear();namespace=sourceIdentity;}
        const {id,manifest,base,...options}=data,key=await identity({...options,filters:A.canonicalFilters(options.filters??{})},base);if(!current())return;
        const cached=resultCache.get(key);if(cached){port.postMessage({id,result:cached});return;}
        const result=await runAnimations(data,{loadCube:meta=>loader.load(meta,base,activeController.signal),isCancelled:()=>!current(),signal:activeController.signal,onProgress:progress=>{if(current())port.postMessage({id,progress});},yieldControl,geometryLoader,monthlyCache,sourceIdentity});
        if(current()){resultCache.set(key,result);port.postMessage({id,result});}
      }catch(error){if(current()&&error.name!=='AbortError')port.postMessage({id:data.id,error:error.message||String(error)});}
      finally{if(generation===token)controller=null;}
    };
    return {clear,cacheStats:()=>({cubes:loader.stats(),results:resultCache.stats(),months:monthlyCache.stats()})};
  }
  const api={runAnimations,installAnimationWorker,installAnimationsWorker:installAnimationWorker,createMarketCubeLoader,validateMonthlyCube,createResultCache,boundedResultSize,createMonthlyFrameCache,monthlyRequestIdentity};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.AnimationWorker=api;
  if(typeof self!=='undefined'&&typeof self.postMessage==='function')installAnimationWorker(self);
})(typeof globalThis!=='undefined'?globalThis:this);
