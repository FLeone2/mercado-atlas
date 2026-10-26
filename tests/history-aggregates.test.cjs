// data/history must equal the monthly cubes exactly, with the worker's labels.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),read=f=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,f))));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json')));
const national=read('data/history/national.json.gz'),uf=read('data/history/uf.json.gz'),versions=read('data/history/versions.json.gz');
assert.equal(national.sourceGeneratedAt,manifest.generatedAt,'history is stale: run python3 scripts/build-history.py');
assert.deepEqual(national.months.map(m=>m.month),manifest.months.map(m=>m.month).sort());
const sumBy=(file,dim,month,value)=>{const mi=file.months.findIndex(m=>m.month===month),di=file.columns.indexOf(dim),code=dim?file.dictionaries[dim].indexOf(value):null;return file.rows.reduce((s,r)=>s+(r[0]===mi&&(dim==null||r[di]===code)?r.at(-1):0),0);};
// Exact totals against the cubes for three months spread over the series.
for(const month of ['2016-01','2021-06','2026-09']){
 const meta=manifest.months.find(m=>m.month===month),cube=read('data/'+meta.cubePath),ix=Object.fromEntries(cube.columns.map((c,i)=>[c,i]));
 const total=cube.rows.reduce((s,r)=>s+r[ix.count],0),mit=cube.rows.reduce((s,r)=>s+(cube.dictionaries.marca[r[ix.marca]]==='MITSUBISHI'?r[ix.count]:0),0);
 assert.equal(national.months.find(m=>m.month===month).total,total);
 assert.equal(sumBy(national,null,month),total);assert.equal(sumBy(uf,null,month),total);assert.equal(sumBy(versions,null,month),total);
 assert.equal(sumBy(national,'marca',month,'MITSUBISHI'),mit);assert.equal(sumBy(uf,'marca',month,'MITSUBISHI'),mit);assert.equal(sumBy(versions,'marca',month,'MITSUBISHI'),mit);
}
// Versions: the Renavam version string, summed exactly like the cube.
{const meta=manifest.months.find(m=>m.month==='2026-09'),cube=read('data/'+meta.cubePath),ix=Object.fromEntries(cube.columns.map((c,i)=>[c,i])),v='MMC/TRITON HPE AT4';
 assert.equal(sumBy(versions,'modelo','2026-09',v),cube.rows.reduce((s,r)=>s+(cube.dictionaries.modelo[r[ix.modelo]]===v?r[ix.count]:0),0));}
// Same reference totals the worker tests use (September 2026, light vehicles).
assert.equal(sumBy(national,null,'2026-09'),268721);assert.equal(sumBy(national,'marca','2026-09','MITSUBISHI'),1729);
assert(national.dictionaries.propulsao.every(v=>['ICE','HEV','PHEV','BEV','MHEV','FCEL','Não classificado'].includes(v)));
console.log('PASS history aggregates: 129 months, exact cube totals (national, UF and version files), Mitsubishi identity and worker labels.');
