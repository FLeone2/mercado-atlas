#!/usr/bin/env python3
"""Exact-scope geographic specialization and classification coverage; immutable inputs."""
import collections, datetime, gzip, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def build(root=ROOT):
 data=root/'data'; out=data/'scenarios'; manifest=json.loads((data/'manifest.json').read_text()); regional=json.loads((out/'regional.json').read_text())
 end=manifest['coverageEnd']; year=end[:4]; states=collections.defaultdict(collections.Counter); cities=collections.defaultdict(collections.Counter); coverage=[]; evidence=collections.Counter(); hashes=[]
 for receipt in manifest['months']:
  path=data/receipt['originCubePath']; raw=path.read_bytes(); cube=json.loads(gzip.decompress(raw)); cols={k:i for i,k in enumerate(cube['columns'])}; ds=cube['dictionaries']; totals=collections.Counter(); ytd=receipt['month'].startswith(year)
  for row in cube['rows']:
   def v(k):return ds[k][row[cols[k]]]
   if v('segmento') not in ('Auto','Comercial Leve'):continue
   n=row[cols['count']]; totals['total']+=n; channel=v('tipo_venda'); origin=v('bd_origem');totals[channel if channel in ('VD','VAREJO') else 'channelUnknown']+=n;totals[origin if origin in ('LOCAL','IMP') else 'originUnknown']+=n
   if not ytd:continue
   uf=v('uf');name=v('municipio');mit=v('marca').strip().upper()=='MITSUBISHI';sub=v('subsegmento');pickup=sub in ('CL - PICK-UP GRANDE','CL - PICK-UP PEQUENA'); group=v('grupo_modelo').upper();triton=mit and pickup and ('TRITON' in group or 'L200' in group.replace(' ',''))
   vals={'registrations':n,'mitsubishi':n*mit,'pickups':n*pickup,'tritonL200':n*triton}
   states[uf].update(vals);cities[(uf,name)].update(vals)
   if mit:evidence[(group,sub,pickup,triton)]+=n
  assert totals['total']==receipt['lightVehicleRows']
  coverage.append({'month':receipt['month'],**{k:totals[k] for k in ('total','VD','VAREJO','channelUnknown','LOCAL','IMP','originUnknown')}})
  hashes.append({'month':receipt['month'],'path':receipt['originCubePath'],'sha256':hashlib.sha256(raw).hexdigest()})
 total=sum(s['registrations'] for s in states.values());mit=sum(s['mitsubishi'] for s in states.values());share=mit/total
 phase1=json.loads((out/'phase1_sources.json').read_text()) if (out/'phase1_sources.json').exists() else {};extra={r['code']:r for r in phase1.get('municipalities',[])}
 rows=[]
 for r in regional['municipalities']:
  r=dict(r); c=cities.get((r['uf'],r['name']),{});s=states[r['uf']];assert not c or c['registrations']==r['registrations'];p=r.get('population');r.update({'mitsubishiPer1000':r['mitsubishi']/p*1000 if p else None,'qlBrazil':r['mitsubishiShare']/share if r['mitsubishiShare'] is not None else None,'qlUF':r['mitsubishiShare']/(s['mitsubishi']/s['registrations']) if r['mitsubishiShare'] is not None and s['mitsubishi'] else None,'pickups':c.get('pickups'),'tritonL200':c.get('tritonL200')})
  x=extra.get(r.get('code'),{});r.update({k:v for k,v in x.items() if k!='fleetByType'});r['pickupsPer1000']=r['pickups']/p*1000 if p and r['pickups'] is not None else None;area=x.get('pamAreaHa');r['pickupsPer1000Ha']=r['pickups']/area*1000 if area and r['pickups'] is not None else None;r['fleetAllTypesPer1000']=x['fleetTotal']/p*1000 if p and x.get('fleetTotal') is not None else None;r['pamValuePerCapita']=x['pamValueBRL']/p if p and x.get('pamValueBRL') is not None else None;rows.append(r)
 state_rows=[{'uf':uf,**s,'mitsubishiShare':s['mitsubishi']/s['registrations'],'qlBrazil':(s['mitsubishi']/s['registrations'])/share} for uf,s in sorted(states.items())]
 result={'schemaVersion':'scenarios-1.0.0','sourceAsOf':max(regional.get('sourceAsOf',''),phase1.get('retrievedAt','')),'period':[year+'-01',end],'national':{'registrations':total,'mitsubishi':mit,'mitsubishiShare':share},'municipalities':rows,'states':state_rows,'classificationAudit':{'pickupRule':'Exact original subsegmento CL - PICK-UP GRANDE or CL - PICK-UP PEQUENA; not inferred from brand.','tritonRule':'Exact Mitsubishi brand AND pickup rule AND normalized group containing TRITON or L200.','mitsubishiGroups':[{'group':g,'subsegment':s,'isPickup':p,'isTritonL200':t,'registrations':n} for (g,s,p,t),n in sorted(evidence.items())]},'coverage':{'municipalities':len(rows),'codesMatched':sum(bool(r.get('code')) for r in rows),'rows':total,'unmatchedRows':sum(r['registrations'] for r in rows if not r.get('code'))},'monthlyCoverage':coverage,'sources':[{'name':'Original light-vehicle origin cubes','url':None,'receipts':hashes},{'name':'Original geographic joins, population and GDP','file':'regional.json','sha256':hashlib.sha256((out/'regional.json').read_bytes()).hexdigest()}],'limitations':['QL = municipal Mitsubishi share divided by Brazil or UF share, always Jan–Sep 2026 Auto + Comercial Leve; no ratio across different periods or universes.','Registration address reflects fleets/headquarters and is not resident household demand.','Population 2026, GDP 2023 and additional public vintages remain separate; ratios are descriptive mixed-vintage exposures.','PAM planted area measures hectares of crops and can include successive crops; value of agricultural production is not agro GDP or household income.','VD includes multiple direct-sales customer classes, not only rental companies. Missing channels in 2016–2017 remain unknown.','LOCAL/IMP derives from retrospective model-level BD origin classification, never brand nationality. Unmatched remains unknown.','This descriptive regional artifact does not estimate forecast covariance; the independent UF × brand hierarchy and nonnegative MinT experiment are in phase3_hierarchy.json. No segment hierarchy is forecast.']}
 (out/'phase2_regional.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n');return result
if __name__=='__main__':
 d=build();print(json.dumps({'national':d['national'],'coverage':d['coverage'],'classification':d['classificationAudit']['mitsubishiGroups']},ensure_ascii=False))
