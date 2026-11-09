#!/usr/bin/env python3
"""Audit September/October annual BD vintages and apply reviewed aggregate fixes.

Original private BD workbooks remain outside this repository. Exact annual keys
are compared first; source cubes lack Modelo_Codigo, so only two explicitly
reviewed version bridges with matching full old BD tuples are applied. New keys
are reported pending an original-source numeric-code reimport, never guessed.
Usage: python scripts/revise-bd.py --old /private/september.xlsb --new /private/october.xlsb --apply
"""
from pathlib import Path
import argparse, collections, datetime as dt, gzip, hashlib, importlib.util, json, functools
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('monthly_import',ROOT/'scripts/import-month.py')
ingest=importlib.util.module_from_spec(spec);spec.loader.exec_module(ingest)
BD_FIELDS=ingest.BD_FIELDS
SOURCE_FIELDS=['CODE','BRAND','MODEL','VERSION','MACRO','SEGMENT','BODY TIPE','PREMIUM','FUEL','TRANSM','TRACTION','ORIGIN']
# Exact source labels reviewed against the numeric-key BD versions. No fuzzy aliases.
BRIDGES={203225:'I/GWM TANK 300 PHEV FLEX',203381:'JEEP/COMPASS LONGIT HYB'}

def save(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')

@functools.lru_cache(maxsize=32)
def load_records(path,year):
 out={};header=False
 for source in ingest.bd_rows(path,year):
  row=list(source)
  if not header:
   if row and ingest.text(row[0])=='CODE':header=True
   continue
  code=ingest.numeric_code(row[0] if row else None)
  if code is None:continue
  row += [None]*max(0,12-len(row));row=row[:12]
  values={'version':ingest.text(row[3]),'fields':row,
          'classification':ingest.bd_values(row[4],row[5],row[6],row[8],row[11])}
  if code in out and out[code]!=values:raise ValueError('Conflicting annual BD code')
  out[code]=values
 return out

def patch_cube(cube,rules):
 cols=cube.get('columns') or cube['dimensions']+['count'];ix={d:i for i,d in enumerate(cols)}
 dictionaries={d:list(v) for d,v in cube['dictionaries'].items()};lookups={d:{v:i for i,v in enumerate(vals)}for d,vals in dictionaries.items()}
 model_rules={r['model']:r for r in rules};changed=collections.Counter();mismatch=collections.Counter();rows=collections.Counter()
 for old in cube['rows']:
  row=list(old);model=dictionaries['modelo'][row[ix['modelo']]];rule=model_rules.get(model)
  if rule:
   fields=[d for d in BD_FIELDS if d in ix]
   if all(dictionaries[d][row[ix[d]]]==rule['old'][d] for d in fields):
    for d in fields:
     value=rule['new'][d]
     if value not in lookups[d]:lookups[d][value]=len(dictionaries[d]);dictionaries[d].append(value)
     row[ix[d]]=lookups[d][value]
    changed[rule['code']]+=row[ix['count']]
   elif any(dictionaries[d][row[ix[d]]]!=rule['new'][d]for d in fields):mismatch[rule['code']]+=row[ix['count']]
  rows[tuple(row[:-1])]+=row[-1]
 # Keep sorted dictionaries, sorted rows and merged joint cells.
 remaps={d:{i:j for j,(_,i)in enumerate(sorted((v,i)for i,v in enumerate(vals)))}for d,vals in dictionaries.items()}
 final=[[*[remaps[d][key[i]]for i,d in enumerate(cube['dimensions'])],count]for key,count in rows.items()]
 result={**cube,'dictionaries':{d:sorted(vals)for d,vals in dictionaries.items()},'rows':sorted(final)}
 assert sum(r[-1]for r in result['rows'])==sum(r[-1]for r in cube['rows'])
 return result,changed,mismatch

def decoded(cube,drop_bd=False):
 dims=[d for d in cube['dimensions']if not(drop_bd and d.startswith('bd_'))];ix={d:i for i,d in enumerate(cube['dimensions'])};out=collections.Counter()
 for r in cube['rows']:out[tuple(cube['dictionaries'][d][r[ix[d]]]for d in dims)]+=r[-1]
 return out

def validate_propulsion_rule(rule, record, annual_records=None):
 if record is None or ingest.text(record['fields'][1])!=rule['bdBrand'] or record['version']!=rule['bdVersion'] or record['classification']['bd_combustivel']!=rule['expectedBdFuel']:
  raise ValueError('Audited propulsion rule no longer matches exact annual BD code, brand, version and fuel')
 if annual_records is not None and sum(r['version']==rule['bdVersion']for r in annual_records.values())!=1:
  raise ValueError('Audited propulsion version is ambiguous in annual BD')

def dataset_signature(manifest):
 values=[{k:meta.get(k)for k in ['month','cubePath','originCubePath','sha256','propulsionOverrides']}for meta in manifest['months']]
 return hashlib.sha256(json.dumps(values,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--old',type=Path,required=True);p.add_argument('--new',type=Path,required=True);p.add_argument('--apply',action='store_true');p.add_argument('--root',type=Path,default=ROOT);a=p.parse_args();root=a.root
 manifest=json.loads((root/'data/manifest.json').read_text());snapshot=json.loads((root/'data/snapshot.json').read_text());rules_file=json.loads((root/'data/classification/propulsion-overrides.json').read_text());summary=[];patches=[];issues=[];changed_records=[]
 previous_receipt=root/'data/revisions/2026-11-bd-october.json'
 rules_hash=ingest.sha256(root/'data/classification/propulsion-overrides.json')
 if a.apply and previous_receipt.exists():
  previous=json.loads(previous_receipt.read_text())
  if previous['oldSource']['sha256']==ingest.sha256(a.old) and previous['newSource']['sha256']==ingest.sha256(a.new) and previous.get('rulesSha256')==rules_hash and previous.get('appliedDatasetSignature')==dataset_signature(manifest):
   print('Revision already applied; leaving cubes, manifest and timestamps unchanged.');return
 for year in range(2016,2027):
  old,new=load_records(a.old,year),load_records(a.new,year);common=old.keys()&new.keys();changed=[code for code in common if old[code]['fields']!=new[code]['fields']];class_changed=[code for code in common if old[code]['classification']!=new[code]['classification']]
  summary.append({'year':year,'oldKeys':len(old),'newKeys':len(new),'addedKeys':len(new.keys()-old.keys()),'removedKeys':len(old.keys()-new.keys()),'changedRecords':len(changed),'changedAnalyticalClassifications':len(class_changed)})
  print(summary[-1],flush=True)
  for code in sorted(class_changed):
   changed_records.append({'year':year,'code':code,'version':new[code]['version'],'old':old[code]['classification'],'new':new[code]['classification']})
   if code in BRIDGES:
    version=new[code]['version'];source_model=BRIDGES[code]
    if source_model.split('/',1)[-1]!=version:raise ValueError('Reviewed source bridge no longer matches exact BD version')
    if any(sum(r['version']==version for r in records.values())!=1 for records in [old,new]):raise ValueError('Reviewed source version is ambiguous in annual BD')
    patches.append({'year':year,'code':code,'model':source_model,'old':old[code]['classification'],'new':new[code]['classification']})
   else:issues.append({'year':year,'code':code,'version':new[code]['version'],'status':'No reviewed source-code bridge; requires exact original-source reimport'})
 # Confirm curated exception code/version identity in each exact annual source tab.
 for rule in rules_file['rules']:
  for year in rule['years']:
   annual=load_records(a.new,year);record=annual.get(rule['bdCode'])
   validate_propulsion_rule(rule,record,annual)
 receipt={'revision':'bd-october-2026-and-audited-propulsion-v1','rulesSha256':rules_hash,'reviewedAt':rules_file['reviewedAt'],'oldSource':{'name':a.old.name,'sha256':ingest.sha256(a.old)},'newSource':{'name':a.new.name,'sha256':ingest.sha256(a.new)},'annualComparison':summary,'analyticalChanges':changed_records,'pendingClassifications':issues,'method':'Annual numeric CODE comparison; reviewed exact source version bridge + all old BD fields guarded. New BD keys are NOT guessed against aggregates. Curated propulsion exceptions preserve raw BD FUEL.','newKeysPendingExactOriginalSourceReimport':sum(s['addedKeys']for s in summary),'monthlyChanges':[],'propulsionChanges':[]}
 if not a.apply:
  print(json.dumps(receipt,ensure_ascii=False,indent=2));return
 now=dt.datetime.now(dt.timezone.utc).isoformat();old_files=[]
 for meta in manifest['months']:
  year=int(meta['month'][:4]);month_rules=[r for r in patches if r['year']==year]
  if year<2024:continue
  old_base=json.loads(gzip.decompress((root/'data'/meta['cubePath']).read_bytes()));old_origin=json.loads(gzip.decompress((root/'data'/meta['originCubePath']).read_bytes()))if month_rules else None
  base,counts,mismatch=patch_cube(old_base,month_rules)if month_rules else(old_base,{},{});origin,ocounts,omismatch=patch_cube(old_origin,month_rules)if month_rules else(None,{},{})
  if counts!=ocounts or mismatch!=omismatch:raise ValueError('Base/origin reviewed classification bridge mismatch')
  if counts:
   if decoded(base,True)!=decoded(old_base,True) or decoded(origin,True)!=decoded(old_origin,True):raise ValueError('Revision changed source registration dimensions')
   projected=collections.Counter()
   for row,count in decoded(origin).items():projected[row[:-1]]+=count
   if projected!=decoded(base):raise ValueError('Origin joint projection differs after revision')
   item={'month':meta['month'],'rowsByCode':dict(counts),'unmatchedOldTupleRowsByCode':dict(mismatch),'previousCubePath':meta['cubePath'],'previousCubeSha256':ingest.sha256(root/'data'/meta['cubePath']),'previousOriginCubePath':meta['originCubePath'],'previousOriginCubeSha256':ingest.sha256(root/'data'/meta['originCubePath'])}
   for field,folder,cube in [('cubePath','cubes',base),('originCubePath','origin-cubes',origin)]:
    raw=json.dumps(cube,ensure_ascii=False,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest()[:16];relative=f'{folder}/{meta["month"]}_{digest}_bd-oct26.json.gz';old_files.append(root/'data'/meta[field]);ingest.write_cube(root/'data'/relative,cube);meta[field]=relative
   meta.update(cubeRows=len(base['rows']),compressedBytes=(root/'data'/meta['cubePath']).stat().st_size,originCubeSha256=ingest.sha256(root/'data'/meta['originCubePath']),bdRevisionSourceSha256=receipt['newSource']['sha256'])
   receipt['monthlyChanges'].append(item)
  overrides=[];ix={d:i for i,d in enumerate(base['columns'])}
  for rule in rules_file['rules']:
   if year not in rule['years']:continue
   n=sum(r[-1]for r in base['rows']if base['dictionaries']['modelo'][r[ix['modelo']]]==rule['model']and base['dictionaries']['bd_combustivel'][r[ix['bd_combustivel']]]==rule['expectedBdFuel'])
   if n:
    overrides.append({k:rule[k]for k in ['id','model','bdCode','expectedBdFuel','propulsion']});receipt['propulsionChanges'].append({'month':meta['month'],'rule':rule['id'],'count':n,'fromBdFuel':rule['expectedBdFuel'],'to':rule['propulsion']})
  if overrides:meta['propulsionOverrides']=overrides
  else:meta.pop('propulsionOverrides',None)
 manifest['generatedAt']=now;bd=manifest['bdClassification'];bd['sourceFiles']=[{'name':a.old.name,'sha256':receipt['oldSource']['sha256'],'updatedAt':'2026-10-07T18:22:51.762Z'},{'name':a.new.name,'sha256':receipt['newSource']['sha256'],'updatedAt':'2026-11-05T16:39:24.947Z'}];bd['sourceHashes']=sorted({*bd.get('sourceHashes',[]),receipt['oldSource']['sha256'],receipt['newSource']['sha256']});bd['revisionReceiptPath']='revisions/2026-11-bd-october.json';bd['revisionNote']='Reviewed2026 analytical corrections only; annual2016–2025 unchanged in October BD.115 new keys pending original-source numeric-code reimport. RawBDfuel preserved where curated propulsion exception is applied.'
 manifest['method']['propulsion']='BD FUEL class plus reviewed exact-source-version/year and expected-BD-fuel exceptions in data/classification/propulsion-overrides.json. Original BD fuel preserved.'
 manifest['originExtension']['originalCubeBytesUnchanged']=False;manifest['originExtension']['revisionReceiptPath']=bd['revisionReceiptPath'];manifest['originExtension']['fullJointProjectionVerified']=True
 snapshot['generatedAt']=now;snapshot['marketManifest']=manifest;snapshot['queries']['coverage']['rows']=manifest['months'];snapshot['queries']['coverage']['source']['executedAt']=now;snapshot['queries']['registrations']['source']['executedAt']=now
 for meta in manifest['months']:
  if meta.get('importReceiptPath') and (meta.get('bdRevisionSourceSha256') or meta.get('propulsionOverrides')):
   import_path=root/'data'/meta['importReceiptPath']
   if import_path.exists():
    receipt.setdefault('previousImportReceiptSha256',{})[meta['month']]=ingest.sha256(import_path)
    imported=json.loads(import_path.read_text());imported['monthEntry']=dict(meta)
    imported['classificationRevisionReceiptPath']=bd['revisionReceiptPath']
    imported['classificationRevisionNote']='Original import/source and BD hash retained; reviewed aggregate corrections and curated propulsion exceptions are documented separately.'
    save(import_path,imported)
 receipt['appliedDatasetSignature']=dataset_signature(manifest)
 if previous_receipt.exists():
  previous_hash=ingest.sha256(previous_receipt);receipt['previousRevisionReceiptSha256']=previous_hash
  (root/'data/revisions/archive').mkdir(parents=True,exist_ok=True)
  (root/'data/revisions/archive'/f'{previous_hash}.json').write_bytes(previous_receipt.read_bytes())
 save(root/'data/revisions/2026-11-bd-october.json',receipt);save(root/'data/manifest.json',manifest);save(root/'data/snapshot.json',snapshot)
 for file in old_files:file.unlink()
 print(json.dumps({'physicalMonthsRevised':len(receipt['monthlyChanges']),'bdRowsChanged':sum(sum(x['rowsByCode'].values())for x in receipt['monthlyChanges']),'propulsionRowsChanged':sum(x['count']for x in receipt['propulsionChanges']),'pendingNewKeys':receipt['newKeysPendingExactOriginalSourceReimport']},ensure_ascii=False))

if __name__=='__main__':main()
