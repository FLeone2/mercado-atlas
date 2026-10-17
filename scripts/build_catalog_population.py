"""Derive only official population denominators; never use scenario registrations."""
import hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=ROOT/'data/scenarios/socioeconomic.json'
raw=p.read_bytes();source=json.loads(raw)
assert source['populationYear']==2026
rows=[{k:r[k] for k in ['code','name','uf','population','populationYear','boundaryAttention']} for r in source['rows']]
assert len(rows)==5571 and len({r['code'] for r in rows})==5571
assert all(r['populationYear']==2026 and r['population']>0 for r in rows)
states={}
for r in rows:
    s=states.setdefault(r['uf'],{'name':r['uf'],'population2026':0,'municipalities':0,'boundaryAttention':False})
    s['population2026']+=r['population'];s['municipalities']+=1;s['boundaryAttention']|=r['boundaryAttention']
pop_source=[r for r in source['sources'] if '6579' in r['url']]
assert len(pop_source)==1
out={'schemaVersion':'catalog-population-1','populationYear':2026,'asOf':source['asOf'],'sourceFile':'data/scenarios/socioeconomic.json','sourceSha256':hashlib.sha256(raw).hexdigest(),'sources':pop_source,'coverage':{'municipalities':len(rows),'states':len(states),'population':sum(r['population'] for r in rows),'boundaryAttentionCodes':[r['code'] for r in rows if r['boundaryAttention']]},'states':sorted(states.values(),key=lambda r:r['name']),'municipalities':rows}
target=ROOT/'data/geography/catalog-population.json';target.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps(out['coverage']),target.stat().st_size)
