// Published data must not change as a side effect of interface work.
// The baseline lists a SHA-256 for every data file; refresh it only when new
// monthly data is deliberately added: node tests/lib/data-baseline.cjs --update
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..','..'),baselinePath=path.join(__dirname,'..','fixtures','data-baseline.json');
const DIRS=['data/cubes','data/origin-cubes','data/geography'],FILES=['data/manifest.json'];
function current(){
 const files=[...FILES];
 for(const dir of DIRS)for(const name of fs.readdirSync(path.join(root,dir)).sort())if(!name.startsWith('.'))files.push(dir+'/'+name);
 return Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
}
function assertDataUnchanged(assert){
 const expected=JSON.parse(fs.readFileSync(baselinePath,'utf8')),actual=current();
 assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),'Data file list changed; if intentional run node tests/lib/data-baseline.cjs --update');
 for(const [file,hash]of Object.entries(expected))assert.equal(actual[file],hash,'Data file changed: '+file+' (if intentional run node tests/lib/data-baseline.cjs --update)');
}
if(require.main===module&&process.argv.includes('--update')){fs.writeFileSync(baselinePath,JSON.stringify(current(),null,1)+'\n');console.log('Data baseline updated:',baselinePath);}
module.exports={assertDataUnchanged};
