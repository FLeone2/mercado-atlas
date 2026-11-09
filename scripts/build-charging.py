"""Build the source-preserving public charging asset consumed by the Atlas laboratory.

python scripts/build-charging.py
python scripts/build-charging.py --refresh --source data/charging/source/new-capture

A refresh queries only the report published by ABVE; no Tupi platform access.
Source files remain separate from the production JSON. Existing geographic aliases
are reused; unmatched labels and administrative regions are never discarded.
"""
from __future__ import annotations
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from lib.geo_names import geo_key

DEFAULT_SOURCE = ROOT / 'data/charging/source/2026-09'
UF_NAMES = dict(zip(
    ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],
    ['Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará','Distrito Federal','Espírito Santo','Goiás','Maranhão','Mato Grosso','Mato Grosso do Sul','Minas Gerais','Pará','Paraíba','Paraná','Pernambuco','Piauí','Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondônia','Roraima','Santa Catarina','São Paulo','Sergipe','Tocantins']))


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(source=DEFAULT_SOURCE, catalog_path=None):
    values = source / 'values'
    catalog_path = catalog_path or ROOT / 'data/geography/catalog-population.json'
    catalog = json.loads(catalog_path.read_text())
    by_key = collections.defaultdict(list)
    for row in catalog['municipalities']:
        by_key[(row['uf'], geo_key(row['name'], row['uf']))].append(row)
    raw = read_csv(values / 'municipal_raw.csv')
    state_source = read_csv(values / 'uf_aggregated.csv')
    history_source = read_csv(values / 'national_history.csv')
    metadata = json.loads((values / 'metadata.json').read_text())
    quality = json.loads((values / 'quality.json').read_text())
    if not raw:
        raise ValueError('Charging source contains no observations')
    dates = {row['reference_date'] for row in raw}
    if len(dates) != 1:
        raise ValueError('One reference date per charging asset is required')
    reference = next(iter(dates))
    grouped = collections.defaultdict(list)
    for row in raw:
        ac, dc, total = (int(row[k]) for k in ['ac','dc','total'])
        if min(ac, dc) < 0 or ac + dc != total or row['uf'] not in UF_NAMES:
            raise ValueError('Invalid public charging observation')
        grouped[(row['uf'], row['municipality_name'])].append(row)
    places = []
    for (uf, name), rows in sorted(grouped.items()):
        regions = {row['region'] for row in rows}
        if len(regions) != 1:
            raise ValueError('Geographic label has conflicting regions')
        candidates = by_key[(uf, geo_key(name, uf))]
        match = candidates[0] if len(candidates) == 1 else None
        ac, dc = (sum(int(row[k]) for row in rows) for k in ['ac','dc'])
        places.append({'id': uf + '|' + name, 'name': name, 'uf': uf, 'region': next(iter(regions)),
            'ac': ac, 'dc': dc, 'total': ac + dc,
            'sourceRowCount': len(rows),
            'sourceCodes': sorted({row['source_municipality_code'] for row in rows}),
            'ibgeCode': match['code'] if match else None,
            'ibgeName': match['name'] if match else None,
            'matchStatus': 'matched' if match else 'ambiguous' if candidates else 'unmatched'})
    states = []
    for uf in sorted({row['uf'] for row in places}):
        rows = [row for row in places if row['uf'] == uf]
        ac, dc = (sum(row[k] for row in rows) for k in ['ac','dc'])
        states.append({'uf':uf, 'name':UF_NAMES[uf], 'region':rows[0]['region'],
            'ac':ac,'dc':dc,'total':ac+dc,'geographicLabels':len(rows)})
    expected = {row['uf']:(int(row['ac']),int(row['dc'])) for row in state_source}
    if {row['uf']:(row['ac'],row['dc']) for row in states} != expected:
        raise ValueError('Charging observations disagree with independently extracted UF totals')
    ac, dc = (sum(row[k] for row in places) for k in ['ac','dc'])
    if quality['totals'] != {'ac':ac,'dc':dc,'total':ac+dc}:
        raise ValueError('Charging observations disagree with extraction quality receipt')
    history = sorted([{'month':row['reference_month'],'total':int(row['total'])} for row in history_source], key=lambda r:r['month'])
    if len({row['month'] for row in history}) != len(history):
        raise ValueError('Duplicate national charging history month')
    if next((row['total'] for row in history if row['month'] == reference[:7]), None) != ac + dc:
        raise ValueError('National historical snapshot does not reconcile with latest territorial counts')
    matched = [row for row in places if row['matchStatus'] == 'matched']
    unmatched = [row for row in places if row['matchStatus'] != 'matched']
    public_metadata = {
        'source':'ABVE/Tupi Mobilidade', 'sourceUrl':metadata['page_url'],
        'reportUrl':metadata['report_url'], 'reportName':metadata['report_name'],
        'referenceDate':reference, 'referenceMonth':reference[:7],
        'retrievedAt':metadata['retrieved_at_utc'], 'refreshedAt':metadata['last_refresh_time'],
        'grain':'Contagens por rótulo geográfico e UF; inclui municípios, distritos e regiões administrativas.',
        'unit':'Pontos de recarga públicos e semipúblicos, conforme publicados pela fonte.',
        'periodCaveat':metadata['period_conflict'],
        'geoCaveat':'Os nomes da fonte não equivalem a municípios IBGE validados. Códigos da fonte são opacos; correspondências incertas são preservadas.',
        'historyCaveat':'Fotografias nacionais em datas irregulares; não representam uma série mensal completa nem histórico municipal.',
        'mapCaveat':'Dados territoriais agregados; não há endereços ou coordenadas de postos individuais.',
        'reuseLicense':metadata['reuse_license'],
        'joinMethod':'Nome/UF com normalização e aliases já existentes no Atlas; apenas correspondência única. Nenhum novo alias ou remapeamento de distrito aplicado.',
        'sourceSha256':{name:sha256(values/name) for name in ['municipal_raw.csv','uf_aggregated.csv','national_history.csv','metadata.json','quality.json']},
        'catalogSha256':sha256(catalog_path),
        'schemaVersion':1,
    }
    return {'schemaVersion':1, 'metadata':public_metadata,
        'totals':{'ac':ac,'dc':dc,'total':ac+dc,'rawRows':len(raw),'geographicLabels':len(places),'states':len(states),
            'matchedPoints':sum(row['total'] for row in matched),'unmatchedPoints':sum(row['total'] for row in unmatched),
            'matchedLabels':len(matched),'unmatchedLabels':len(unmatched),
            'matchedMunicipalities':len({row['ibgeCode'] for row in matched})},
        'states':states,'places':places,'history':history}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE)
    parser.add_argument('--output',type=Path,default=ROOT/'data/charging/abve.json')
    parser.add_argument('--refresh',action='store_true')
    args=parser.parse_args()
    if args.refresh:
        subprocess.run([sys.executable,str(ROOT/'scripts/charging/extract.py'),'--refresh',
            '--snapshot',str(args.source/'snapshots'),'--output',str(args.source/'values')],check=True)
    data=build(args.source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'asset':str(args.output),'reference':data['metadata']['referenceMonth'],**data['totals']},ensure_ascii=False))


if __name__ == '__main__':
    main()
