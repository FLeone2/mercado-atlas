const test=require('node:test'),assert=require('node:assert/strict'),A=require('../src/market/modules/animations-data.js'),W=require('../src/market/modules/animations-worker.js');
const fields=['date',...A.DIMS.filter(d=>d!=='propulsao')];
function cube(month,records){const dictionaries=Object.fromEntries(fields.map(dim=>[dim,[]]));return {month,columns:[...fields,'count'],dictionaries,rows:records.map(record=>[...fields.map(dim=>{const value=record[dim]??({date:month+'-15',marca:'OTHER',modelo:'MODEL',grupo_modelo:'GROUP',uf:'SP',municipio:'SAO PAULO',segmento:'Auto',tipo_venda:'VAREJO',bd_segmento:'MID',bd_carroceria:'SUV',bd_combustivel:'GASOLINE',bd_origem:'NAT'})[dim]??'X';let index=dictionaries[dim].indexOf(value);if(index<0){index=dictionaries[dim].length;dictionaries[dim].push(value);}return index;}),record.count])};}
const meta=month=>({month,cubePath:month+'.json',scope:[{segment:'Auto'},{segment:'Comercial Leve'}],channelSourceFields:['Tipo Venda']});
const request=extra=>({filters:{population:'light'},dimension:'marca',selectedUF:'SP',...extra});
const aggregate=(month,records,extra={},metadata={})=>A.aggregateCube(cube(month,records),{...meta(month),...metadata},request(extra));
const total=rows=>rows.reduce((n,row)=>n+(row.count??0),0);

test('Exact weighted filters use OR within dimension, AND across fields, and exact midsize pickup only',()=>{
 const records=[{marca:'MITSUBISHI',modelo:'L200',bd_segmento:'PICK-UP MID',bd_carroceria:'DOUBLE CAB',count:10},{marca:'TOYOTA',modelo:'HILUX',bd_segmento:'PICK-UP MID',bd_carroceria:'SINGLE CAB',count:30},{marca:'FIAT',modelo:'STRADA',bd_segmento:'PICK-UP SMALL',count:100},{marca:'RAM',bd_segmento:'PICK-UP LARGE',count:500},{marca:'FORD',bd_segmento:'PICK-UP COMPACT',count:90},{marca:'MITSUBISHI',modelo:'SUV',bd_segmento:'MID',count:9}];
 const frame=aggregate('2026-09',records,{preset:'midsize-pickups'});assert.equal(frame.total,40);assert.deepEqual(frame.groups.modelo.map(r=>r.name),['HILUX','L200']);assert.equal(frame.groups.marca.find(r=>r.name==='MITSUBISHI').share,.25);
 const conflict=aggregate('2026-09',records,{preset:'midsize-pickups',filters:{population:'light',bd_segmento:['PICK-UP SMALL']}});assert.equal(conflict.total,0,'Preset must intersect, not replace a categorical filter');
 assert.equal(aggregate('2026-09',records,{preset:'suv',porte:['MID']}).total,9);
 const filtered=aggregate('2026-09',records,{filters:{population:'light',marca:['MITSUBISHI','TOYOTA'],modelo:['L200','HILUX']}});assert.equal(filtered.total,40);
});

test('All registered dimensions and propulsion filters are honored, not silently removed',()=>{
 const record={marca:'MITSUBISHI',bd_combustivel:'PHEV',count:7};for(const dim of A.DIMS){const raw=cube('2026-01',[record]),value=dim==='propulsao'?'PHEV':raw.dictionaries[dim][0];assert.equal(A.aggregateCube(raw,meta('2026-01'),request({filters:{[dim]:[value]}})).total,7,dim);assert.equal(A.aggregateCube(raw,meta('2026-01'),request({filters:{[dim]:['not-there']}})).total,0,dim);}
 assert.equal(aggregate('2026-01',[{segmento:'Bus',count:100},{segmento:'Auto',count:3}],{}).total,3);
});

test('Membership is exact, shared labels do not imply Mitsubishi, and Top N preserves true ranking',()=>{
 const frame=aggregate('2026-01',[{marca:'OTHER',modelo:'A',count:20},{marca:'OTHER',modelo:'B',count:20},{marca:'MITSUBISHI',modelo:'SHARED',count:2},{marca:'OTHER',modelo:'SHARED',count:5},{marca:'OTHER',modelo:'MITSUBISHI LOOKALIKE',count:4}]);
 const ranked=A.rankFrame(frame,'modelo',{topN:1,pinMIT:true});assert.deepEqual(ranked.map(r=>r.name),['A','SHARED']);assert.equal(ranked[1].rank,3);assert(ranked[1].pinned);assert.equal(ranked[1].mitCount,2);assert.deepEqual({...frame.brandMembership.modelo.SHARED},{MITSUBISHI:2,OTHER:5});assert.equal(frame.groups.modelo.find(r=>r.name==='MITSUBISHI LOOKALIKE').isMIT,false);
});

test('Shares and technology map metrics are weighted, never average shares',()=>{
 const frames=[aggregate('2026-01',[{marca:'MITSUBISHI',bd_combustivel:'BEV',count:1},{count:9}]),aggregate('2026-02',[{marca:'MITSUBISHI',bd_combustivel:'PHEV',count:80},{bd_combustivel:'HEV',count:20}])];
 const ytd=A.yearToDateFrames(frames)[1];assert.equal(ytd.total,110);const uf=ytd.ufRows[0];assert.equal(uf.mitCount,81);assert.equal(uf.mitShare,81/110);assert.equal(uf.electrifiedCount,101);assert.equal(uf.electrifiedShare,101/110);assert.equal(uf.technologyCounts.BEV,1);assert.equal(uf.technologyCounts.PHEV,80);assert.equal(total(ytd.groups.propulsao),110);assert.equal(total(ytd.groups.marca),110);assert.equal(uf.share,1);
});

test('YTD resets January and becomes unavailable when January or any month is missing/partial',()=>{
 const rows=[aggregate('2025-12',[{count:99}]),aggregate('2026-01',[{count:10}]),aggregate('2026-02',[{count:20}]),aggregate('2026-04',[{count:40}])],ytd=A.yearToDateFrames(rows);assert.equal(ytd[1].total,10);assert.equal(ytd[2].total,30);assert.equal(ytd[3].total,null);assert.equal(ytd[3].observedTotal,70);assert.deepEqual(ytd[3].missingMonths,['2026-03']);assert.equal(ytd[0].total,null);
 const partial=aggregate('2026-01',[{count:4}],{},{partialMonth:true});assert.equal(partial.total,null);assert.equal(partial.observedTotal,4);assert.equal(partial.ufRows[0].mitShare,null);assert.equal(A.yearToDateFrames([partial])[0].total,null);
});

test('Zero, unavailable, and changed-scope YoY never become infinities or false drops',()=>{
 let rows=A.attachYoY([aggregate('2025-01',[{marca:'A',count:0},{marca:'B',count:10}]),aggregate('2026-01',[{marca:'A',count:3},{marca:'C',count:20}])]);const current=rows[1];assert.equal(current.groups.marca.find(r=>r.name==='A').yoy,null);assert.equal(current.groups.marca.find(r=>r.name==='A').yoyStatus,'zero-base');assert.equal(current.groups.marca.find(r=>r.name==='B').yoy,-1);assert.equal(current.groups.marca.find(r=>r.name==='C').yoy,null);assert.equal(current.yoy,1.3);
 const absent=A.attachYoY([aggregate('2026-01',[{count:1}])])[0];assert.equal(absent.yoy,null);assert.equal(absent.groups.marca[0].priorCount,null);
 rows=A.attachYoY([aggregate('2025-01',[{count:10}],{},{scope:[{segment:'Auto'}]}),aggregate('2026-01',[{count:20}])]);assert.equal(rows[1].yearAvailable,false);
});

test('Origin is sourced brand classification, vehicle manufacturing origin stays separate',()=>{
 const mapping={brands:{CHINA:{chineseOrigin:true,sourceUrl:'https://example.org/china'},OTHER:{chineseOrigin:false,sourceUrl:'https://example.org/other'},UNSOURCED:{chineseOrigin:true},LATER:{chineseOrigin:true,startYear:2027,sourceUrl:'https://example.org/later'},PARTNER:{originCode:'BRA_CHN_PARTNERSHIP',sourceUrl:'https://example.org/partner'}}};
 const frame=aggregate('2026-01',[{marca:'CHINA',bd_origem:'NAT',count:5},{marca:'OTHER',bd_origem:'IMP',count:3},{marca:'UNSOURCED',count:4},{marca:'LATER',count:2},{marca:'PARTNER',count:1}],{originMapping:mapping});assert.equal(frame.originRows.find(r=>r.kind==='china').count,5);assert.equal(frame.originRows.find(r=>r.kind==='unknown').count,6);assert.equal(frame.originRows.find(r=>r.kind==='partnership').count,1);assert.equal(frame.groups.bd_origem.find(r=>r.name==='IMP').count,3);assert.equal(total(frame.originRows),15);
});

test('Missing channels stay unknown and filtering an unavailable known channel is not a false zero',()=>{
 const records=[{tipo_venda:'Não informado',count:8},{tipo_venda:'VD',count:2}];const frame=aggregate('2026-01',records);assert.equal(frame.channelCoverage.unknownCount,8);assert.equal(frame.channelCoverage.unknownShare,.8);
 const missing=aggregate('2016-01',[{tipo_venda:'Não informado',count:40}],{filters:{tipo_venda:['VD']}},{channelSourceFields:[]});assert.equal(missing.total,null);assert.equal(missing.coverageStatus,'unavailable');
});

test('Municipality official identity uses unique normalized name plus selected UF only',()=>{
 const frame=aggregate('2026-01',[{municipio:'SAO PAULO',uf:'SP',count:3},{municipio:'SAME',uf:'SP',count:2},{municipio:'SAO PAULO',uf:'RJ',count:9}]);const geometry={uf:'SP',features:[{code:'3550308',name:'São Paulo',uf:'SP'},{code:'1234567',name:'Same',uf:'SP'},{code:'2345678',name:'SAME',uf:'SP'}]};const joined=A.joinMunicipalities([frame],geometry)[0];assert.equal(joined.municipalityRows.length,2);assert.equal(joined.municipalityRows.find(r=>r.municipality==='SAO PAULO').ibgeCode,'3550308');assert.equal(joined.municipalityRows.find(r=>r.municipality==='SAME').ibgeCode,null);assert.equal(joined.selectedUF,'SP');assert.equal(joined.municipalityRequested,true);
});

test('Fixed bubble domains and area-proportional radii use the entire window',()=>{
 const frames=A.attachYoY([aggregate('2025-01',[{count:10}]),aggregate('2025-02',[{count:100}]),aggregate('2026-01',[{count:20}]),aggregate('2026-02',[{count:400}])]).slice(2),scales=A.fixedBubbleScales(frames);assert.equal(scales.maxCount,400);assert(scales.yDomain[1]>3);assert.equal(scales.radius(100),scales.radius(400)/2);assert.equal(A.bubbleRows(frames[0])[0].y,1);
});

test('Worker reads only required monthly cubes and prior-year matching months; global dates are explicitly replaced',async()=>{
 const seen=[],manifest={months:[meta('2025-09'),meta('2026-09')]};const result=await W.runAnimations({manifest,base:'https://example.com/data/',filters:{population:'light',date:'2026-09-13',marca:['MITSUBISHI']},start:'2026-09',end:'2026-09',dimension:'modelo'},{loadCube:async m=>{seen.push(m.month);return cube(m.month,[{marca:'MITSUBISHI',count:5},{count:10}]);},yieldControl:async()=>{}});assert.deepEqual(seen,['2025-09','2026-09']);assert.equal(result.frames[0].total,5);assert.equal(result.frames[0].yearAvailable,true);assert.deepEqual(result.filters.marca,['MITSUBISHI']);assert.equal(result.filters.date,'2026-09-01..2026-09-30');assert(result.windowDisclosure.includes('2026-09-13'));assert.deepEqual(result.replacedFilters,['date']);
});

test('Worker exposes incomplete YTD, missing monthly frames and transport failures without invented zeros',async()=>{
 const manifest={months:[meta('2026-01'),meta('2026-03')]},result=await W.runAnimations({manifest,base:'https://example.com/data/',start:'2026-01',end:'2026-03',mode:'ytd',includeYoY:false},{loadCube:async m=>{if(m.month==='2026-03')throw Error('Offline');return cube(m.month,[{count:5}]);},yieldControl:async()=>{}});assert.equal(result.frames[0].total,5);assert.equal(result.frames[1].total,null);assert.equal(result.frames[2].total,null);assert.equal(result.sourceErrors[0].error,'Offline');assert.equal(result.monthlyFrames[1].coverageStatus,'missing');assert.equal(result.monthlyFrames[2].coverageStatus,'unavailable');
});

test('Fixed bubble scales handle more than 200,000 model-month points without argument spreading',()=>{
 const rows=Array.from({length:1100},(_,i)=>({name:'Model '+i,count:i+1,share:(i+1)/2000000,yoy:i/1000-0.5}));
 const frames=Array.from({length:200},()=>({complete:true,groups:{modelo:rows}}));const scales=A.fixedBubbleScales(frames,'modelo');assert.equal(scales.maxCount,1100);assert.equal(scales.maxShare,1100/2000000);assert(scales.yDomain[0]<-.5);assert(scales.yDomain[1]>.599);
});

test('Explicit incomplete-source flags override conflicting full-month boundary metadata',()=>{
 for(const flag of [{partialMonth:true},{sourceComplete:false},{coverageStatus:'unknown'},{coverageStatus:'missing'},{partialCoverage:true}]){
  const m={...meta('2026-09'),coverageEndDate:'2026-09-30',...flag};assert.equal(A.sourceCoverage(m,'2026-09').complete,false);
  const f=A.aggregateCube(cube('2026-09',[{count:10}]),m,request());assert.equal(f.total,null);assert.equal(f.observedTotal,10);
 }
});

test('Scoped projections preserve exact values for every view, mix, map metric, monthly and YTD',async()=>{
 const manifest={months:['2025-01','2025-02','2026-01','2026-02'].map(meta)};
 const geometry={uf:'SP',features:[{uf:'SP',name:'São Paulo',code:'3550308'}]};
 const mapping={brands:{MITSUBISHI:{chineseOrigin:false,sourceUrl:'https://example.com/mit'},CHINA:{chineseOrigin:true,sourceUrl:'https://example.com/china'}}};
 const deps={loadCube:async m=>cube(m.month,[{marca:'MITSUBISHI',modelo:'SHARED',bd_combustivel:'PHEV',count:m.month.startsWith('2026')?8:4},{marca:'OTHER',modelo:'SHARED',count:2},{marca:'CHINA',modelo:'SECOND',bd_combustivel:'BEV',tipo_venda:'VD',count:5},{marca:'OTHER',uf:'RJ',municipio:'RIO DE JANEIRO',bd_combustivel:'HEV',count:20}]),yieldControl:async()=>{},geometryLoader:async()=>geometry};
 const base={manifest,base:'https://example.com/data/',startMonth:'2026-01',endMonth:'2026-02',selectedUF:'SP',filters:{population:'light'},includeYoY:true,originMapping:mapping};
 const cases=[...['marca','modelo','grupo_modelo','uf'].map(dimension=>({dataView:'races',dimension})),{dataView:'bubbles',dimension:'modelo'},...['technology','body','porte','origin','vehicleOrigin','channel'].map(mixKind=>({dataView:'mix',mixKind})),...['mitShare','electrification','municipalVolume'].map(mapMetric=>({dataView:'maps',mapMetric,technology:'BEV'}))];
 const plain=value=>JSON.parse(JSON.stringify(value));
 function sameRows(compact,full){assert.equal(compact.length,full.length);const index=new Map(full.map(row=>[row.name,row]));for(const row of compact)for(const key of Object.keys(row))assert.deepEqual(plain(row[key]),plain(index.get(row.name)[key]),row.name+'.'+key);}
 for(const mode of ['monthly','ytd'])for(const options of cases){
   const full=await W.runAnimations({...base,mode,dimension:options.dimension},deps),projected=await W.runAnimations({...base,mode,...options},deps);
   for(let i=0;i<full.frames.length;i++){
     const f=full.frames[i],p=projected.frames[i];for(const field of ['total','complete','coverageStatus','priorTotal','yoy','yearAvailable'])assert.equal(p[field],f[field],field);
     assert(!Object.hasOwn(p,'brandMembership'));for(const [dimension,rows]of Object.entries(p.groups))sameRows(rows,f.groups[dimension]);
     sameRows(p.originRows,f.originRows.length&&options.mixKind==='origin'?f.originRows:[]);
     sameRows(p.ufRows,options.dataView==='maps'&&options.mapMetric!=='municipalVolume'?f.ufRows:[]);
     sameRows(p.municipalityRows,options.dataView==='maps'&&options.mapMetric==='municipalVolume'?f.municipalityRows:[]);
     for(const rows of [...Object.values(p.groups),p.originRows,p.ufRows,p.municipalityRows])for(const row of rows){assert(!Object.hasOwn(row,'observedTechnologyCounts'));assert(!Object.hasOwn(row,'observedMitCount'));}
   }
   if(mode==='monthly')assert.strictEqual(projected.monthlyFrames,projected.frames,'Monthly history aliases one frame array');else {assert.deepEqual(projected.monthlyFrames,[]);assert.equal(projected.monthlyFramesIncluded,false);}
   if(options.dataView!=='maps')assert(projected.frames.every(f=>!f.municipalityRequested&&f.municipalityRows.length===0));
   assert(JSON.stringify(projected).length<JSON.stringify(full).length*.6,JSON.stringify(options));
 }
 const expanded=await W.runAnimations({...base,mode:'ytd',dataView:'races',dimension:'modelo',includeMonthlyFrames:true},deps);assert.equal(expanded.monthlyFrames.length,2);assert.equal(expanded.monthlyFramesIncluded,true);assert.equal(expanded.frames[1].total,expanded.monthlyFrames[1].total*2);
});

test('Cumulative frames sum from January, any brand can be in focus, and heat counts add up per municipality',()=>{
 const rec=(marca,municipio,count)=>({marca,municipio,uf:'SP',count});
 const records={'2026-01':[rec('TOYOTA','Santos',5),rec('FIAT','Santos',20),rec('TOYOTA','Campinas',2)],'2026-02':[rec('TOYOTA','Santos',3),rec('FIAT','Campinas',10)],'2026-03':[rec('TOYOTA','Campinas',4)]};
 const frames=Object.entries(records).map(([month,rows])=>aggregate(month,rows,{dataView:'heat',heatBrands:['toyota','FIAT'],focusBrand:'TOYOTA'}));
 const ytd=A.yearToDateFrames(frames,{dataView:'heat',heatBrands:['TOYOTA','FIAT']});
 assert.deepEqual(ytd.map(f=>f.total),[27,40,44]);
 assert.deepEqual({...ytd[1].heat.TOYOTA},{'Santos · SP':8,'Campinas · SP':2});
 assert.deepEqual({...ytd[2].heat.TOYOTA},{'Santos · SP':8,'Campinas · SP':6});
 assert.deepEqual({...ytd[2].heat.FIAT},{'Santos · SP':20,'Campinas · SP':10});
 const maps=Object.entries(records).map(([month,rows])=>aggregate(month,rows,{dataView:'maps',focusBrand:'TOYOTA'}));
 const last=A.yearToDateFrames(maps,{dataView:'maps',focusBrand:'TOYOTA'}).at(-1).ufRows[0];
 assert.equal(last.mitCount,14);assert.equal(last.mitShare,14/44);
});
