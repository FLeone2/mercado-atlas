#!/usr/bin/env python3
"""Official IBGE SIDRA population + fixed-width GDP; preserve raw snapshots."""
import argparse,datetime as dt,hashlib,json,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
URLS={'gdp.zip':'https://ftp.ibge.gov.br/Pib_Municipios/2022_2023/base/base_de_dados_2010_2023_txt.zip','population_sidra.json':'https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/9324/p/2026'}

def build(refresh=False):
 receipts=[]
 for name,url in URLS.items():
  path=ROOT/'data'/name
  if refresh or not path.exists():
   with urllib.request.urlopen(url,timeout=40) as r:path.write_bytes(r.read())
  receipts.append({'url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'retrievedDate':dt.datetime.fromtimestamp(path.stat().st_mtime,dt.timezone.utc).date().isoformat(),'file':name})
 pops=json.loads((ROOT/'data/population_sidra.json').read_text());pop={}
 for r in pops[1:]:
  if r['D2C']!='9324' or r['D3C']!='2026' or r['MN']!='Pessoas':raise ValueError('Population schema/unit changed')
  value=int(r['V']) if r['V'].isdigit() else None
  if r['D1C'] in pop:raise ValueError('Duplicate population code')
  pop[r['D1C']]={'code':r['D1C'],'name':r['D1N'].rsplit(' - ',1)[0],'uf':r['D1N'].rsplit(' - ',1)[1],'population':value,'populationYear':2026}
 gdp={};years=set()
 with zipfile.ZipFile(ROOT/'data/gdp.zip') as z:
  name=next(n for n in z.namelist() if n.endswith('.txt'))
  for line in z.read(name).decode('latin1').splitlines():
   year=int(line[:4]);years.add(year)
   if year!=2023:continue
   # Verified against bundled official layout PDF: position 47 size 7; position 954 size 18, BRL per capita.
   code=line[46:53].strip();v=line[953:971].strip();gdp[code]=float(v) if v else None
 if max(years)!=2023:raise ValueError('GDP vintage changed; review layout before updating')
 for code,r in pop.items():r.update(gdpPerCapita=gdp.get(code),gdpYear=2023 if code in gdp else None,boundaryAttention=code not in gdp)
 result={'schemaVersion':'scenarios-regional-sources-1.0.0','asOf':dt.datetime.now(dt.timezone.utc).date().isoformat(),'rows':list(pop.values()),'sources':receipts,
   'coverage':{'populationMunicipalities':len(pop),'gdpMunicipalities':len(gdp),'matched':len(set(pop)&set(gdp)),'populationWithoutGdp':sorted(set(pop)-set(gdp)),'gdpWithoutPopulation':sorted(set(gdp)-set(pop))},
   'gdpUnit':'BRL nominal per inhabitant','populationUnit':'persons','gdpYear':2023,'populationYear':2026,
   'methodology':'GDP per capita is the published IBGE value, not GDP divided by 2026 population. Official 2023 GDP denominator uses Census 2022 population updated for 2023 boundaries. 2022/2023 GDP subject to revision.',
   'layoutSource':'layout_da_base_de_dados_2010_2023_em_formato_txt.pdf bundled in official ZIP','registrationJoin':'IBGE code only after strict UF+normalized-name geographic crosswalk; no fuzzy matches.'}
 out=ROOT/'data/scenarios/socioeconomic.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n');print(result['coverage'])

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');a=p.parse_args();build(a.refresh)
