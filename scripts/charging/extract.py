#!/usr/bin/env python3
"""Public ABVE Power BI municipal charging aggregate extractor; stdlib only."""
from __future__ import annotations

import argparse
import base64
import collections
import csv
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import uuid

PAGE = 'https://abve.org.br/abve-data/bi-eletropostos/'
ROOT = Path(__file__).resolve().parent
COLUMNS = ['Municipio_Codigo', 'SIGLA_UF', 'NM_MUN', 'Região', 'AC', 'DC', 'Data']
WINDOW = 10000


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def fetch(url, key=None, body=None):
    headers = {'User-Agent': 'ABVE-public-aggregate-audit/1.0', 'Accept': 'application/json'}
    if key:
        headers.update({'X-PowerBI-ResourceKey': key, 'ActivityId': str(uuid.uuid4()),
                        'RequestId': str(uuid.uuid4())})
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(url, None if body is None else json.dumps(body).encode(), headers)
    with urlopen(req, timeout=60) as response:
        data = response.read()
        if response.headers.get('Content-Encoding', '').lower() == 'gzip' or data[:2] == b'\x1f\x8b':
            data = gzip.decompress(data)
        return data


def column(source, prop):
    return {'Column': {'Expression': {'SourceRef': {'Source': source}}, 'Property': prop}}


def query_body(model, entity, columns):
    select = [dict(column('b', c), Name=entity + '.' + c) for c in columns]
    command = {'SemanticQueryDataShapeCommand': {
        'Query': {'Version': 2, 'From': [{'Name': 'b', 'Entity': entity, 'Type': 0}],
                  'Select': select},
        'Binding': {'Primary': {'Groupings': [{'Projections': list(range(len(select)))}]},
                    'DataReduction': {'DataVolume': 6, 'Primary': {'Window': {'Count': WINDOW}}},
                    'Version': 1}, 'ExecutionMetricsKind': 1}}
    return {'version': '1.0.0', 'queries': [{'Query': {'Commands': [command]}, 'QueryId': ''}],
            'cancelQueries': [], 'modelId': model}


def refresh(snapshot):
    """Discover only the report and public model published by the ABVE webpage."""
    html = fetch(PAGE).decode()
    matches = re.findall(r'https://app\.powerbi\.com/view\?r=[A-Za-z0-9_=-]+', html)
    if len(set(matches)) != 1:
        raise ValueError('Expected one public Power BI report on the ABVE charging page')
    view = matches[0]
    encoded = parse_qs(urlparse(view).query)['r'][0]
    key = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))['k']
    app_html = fetch(view).decode()
    match = re.search(r"var resolvedClusterUri = '([^']+)'", app_html)
    if not match:
        raise ValueError('Power BI cluster could not be discovered')
    cluster = urlparse(match.group(1))
    api = cluster.scheme + '://' + cluster.hostname.replace('-redirect', '').replace('global-', '').replace('.analysis.', '-api.analysis.')
    models = json.loads(fetch(f'{api}/public/reports/{key}/modelsAndExploration?preferReadOnlySession=true', key))
    schema = json.loads(fetch(f'{api}/public/reports/{key}/conceptualschema', key))
    write_json(snapshot / 'models.json', models)
    write_json(snapshot / 'schema.json', schema)
    model = models['models'][0]['id']
    entities = {e['Name']: e for e in schema['schemas'][0]['schema']['Entities']}
    required = set(COLUMNS)
    actual = {p['Name'] for p in entities['BaseEletropostos_Mun']['Properties']}
    if not required <= actual:
        raise ValueError('Public schema changed: missing municipal columns')
    for name, entity, cols in [
        ('municipalities', 'BaseEletropostos_Mun', COLUMNS),
        ('history', 'Eletroposto_BaseGeral', ['Ano', 'Nome do Mês', 'Eletropostos']),
    ]:
        body = query_body(model, entity, cols)
        write_json(snapshot / (name + '.request.json'), body)
        data = json.loads(fetch(api + '/public/reports/querydata?synchronous=true', key, body))
        write_json(snapshot / (name + '.response.json'), data)
    # Independent UF visual equivalent: SUM(AC), SUM(DC), municipal total measure.
    body = query_body(model, 'BaseEletropostos_Mun', ['SIGLA_UF'])
    cmd = body['queries'][0]['Query']['Commands'][0]['SemanticQueryDataShapeCommand']
    for c in ['AC', 'DC']:
        cmd['Query']['Select'].append({'Aggregation': {'Expression': column('b', c), 'Function': 0}, 'Name': 'Sum(' + c + ')'})
    cmd['Binding']['Primary']['Groupings'][0]['Projections'] = [0, 1, 2]
    write_json(snapshot / 'states.request.json', body)
    write_json(snapshot / 'states.response.json', json.loads(fetch(api + '/public/reports/querydata?synchronous=true', key, body)))
    write_json(snapshot / 'retrieval.json', {'page_url': PAGE, 'report_url': view,
        'api_url': api, 'resource_key': key, 'retrieved_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()})


def dataset(path):
    result = json.loads(path.read_text())
    data = result['results'][0]['result'].get('data')
    if not data or 'dsr' not in data:
        raise ValueError(f'Power BI query failed: {path.name}')
    ds = data['dsr']['DS'][0]
    if ds.get('IC') is not True or ds.get('RT'):
        raise ValueError(f'Incomplete/truncated public response: {path.name}')
    return ds


def decode(ds, records):
    previous = []; schema = []; rows = []
    for record in records:
        schema = record.get('S', schema)
        if not schema:
            raise ValueError('DSR schema missing')
        cells = iter(record.get('C', [])); values = []
        for i, col in enumerate(schema):
            if record.get('R', 0) & (1 << i):
                value = previous[i]
            elif record.get('Ø', 0) & (1 << i):
                value = None
            else:
                value = next(cells)
            values.append(value)
        if list(cells):
            raise ValueError('Unexpected extra DSR cells')
        previous = values
        rows.append([ds['ValueDicts'][col['DN']][value]
                     if col.get('DN') and isinstance(value, int) else value
                     for col, value in zip(schema, values)])
    return rows


def main_rows(ds):
    # Captured visuals include a total partition DM0 and detail DM1.
    parts = [(name, rows) for part in ds['PH'] for name, rows in part.items()]
    name, rows = next(((n, r) for n, r in parts if n == 'DM1'), parts[0])
    return decode(ds, rows)


def save_csv(path, rows):
    if not rows:
        raise ValueError('Cannot save empty dataset')
    with path.open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)


def build(snapshot, output):
    output.mkdir(parents=True, exist_ok=True)
    ds = dataset(snapshot / 'municipalities.response.json')
    decoded = main_rows(ds)
    if len(decoded) >= WINDOW:
        raise ValueError('Municipal row count reached window; pagination required')
    raw = []
    for n, values in enumerate(decoded, 1):
        code, uf, name, region, ac, dc, date = values
        if any(v is None for v in values) or not isinstance(ac, int) or not isinstance(dc, int) or min(ac, dc) < 0:
            raise ValueError('Invalid or missing municipal observation')
        reference = dt.datetime.strptime(date, '%d/%m/%Y').date().isoformat()
        raw.append({'source_row': n, 'reference_date': reference, 'source_municipality_code': str(code),
                    'uf': uf, 'municipality_name': name, 'region': region, 'ac': ac, 'dc': dc, 'total': ac + dc})
    groups = collections.defaultdict(list)
    for row in raw:
        groups[(row['reference_date'], row['uf'], row['municipality_name'])].append(row)
    municipalities = []
    for key, source in sorted(groups.items()):
        regions = {r['region'] for r in source}
        if len(regions) != 1:
            raise ValueError('Inconsistent region for same municipal name/UF')
        municipalities.append({'reference_date': key[0], 'uf': key[1], 'municipality_name': key[2],
            'region': source[0]['region'], 'ac': sum(r['ac'] for r in source), 'dc': sum(r['dc'] for r in source),
            'total': sum(r['total'] for r in source), 'source_row_count': len(source),
            'source_codes': '|'.join(sorted({r['source_municipality_code'] for r in source}))})
    uf_groups = collections.defaultdict(list)
    for row in municipalities:
        uf_groups[(row['reference_date'], row['uf'])].append(row)
    states = [{'reference_date': k[0], 'uf': k[1], 'ac': sum(r['ac'] for r in source),
               'dc': sum(r['dc'] for r in source), 'total': sum(r['total'] for r in source),
               'geographic_label_uf_groups': len(source)} for k, source in sorted(uf_groups.items())]
    check_rows = main_rows(dataset(snapshot / 'states.response.json'))
    expected = {row[0]: (row[1], row[2]) for row in check_rows}
    observed = {r['uf']: (r['ac'], r['dc']) for r in states}
    if len(states) != len(expected) or observed != expected:
        raise ValueError('Municipal aggregates do not reconcile with independent public UF query')
    history_ds = dataset(snapshot / 'history.response.json')
    history_values = main_rows(history_ds)
    # A raw public table query can expose the semantic model's all-null blank member.
    blank_history_members = sum(all(value is None for value in row) for row in history_values)
    history_values = [row for row in history_values if not all(value is None for value in row)]
    month_numbers = {name: i for i, name in enumerate(['janeiro','fevereiro','março','abril','maio','junho',
        'julho','agosto','setembro','outubro','novembro','dezembro'], 1)}
    if any(any(value is None for value in row[:3]) for row in history_values):
        raise ValueError('Partially missing national historical observation')
    history = [{'reference_month': f'{v[0]:04d}-{month_numbers[v[1]]:02d}', 'total': v[2]} for v in history_values]
    history.sort(key=lambda r: r['reference_month'])
    totals = {'ac': sum(r['ac'] for r in raw), 'dc': sum(r['dc'] for r in raw), 'total': sum(r['total'] for r in raw)}
    latest = max(r['reference_date'] for r in raw)[:7]
    matching_history = [r for r in history if r['reference_month'] == latest]
    if len(matching_history) != 1 or matching_history[0]['total'] != totals['total']:
        raise ValueError('Municipal totals do not agree with matching national historical snapshot')
    duplicate_groups = [r for r in municipalities if r['source_row_count'] > 1]
    code_groups = collections.defaultdict(set)
    for row in raw:
        code_groups[row['source_municipality_code']].add((row['uf'], row['municipality_name']))
    collisions = {k: [list(v) for v in sorted(vals)] for k, vals in code_groups.items() if len(vals) > 1}
    code_counts = collections.Counter(row['source_municipality_code'] for row in raw)
    models = json.loads((snapshot / 'models.json').read_text())['models'][0]
    retrieval_path = snapshot / 'retrieval.json'
    metadata = json.loads(retrieval_path.read_text()) if retrieval_path.exists() else {
        'page_url': PAGE, 'retrieved_at_utc': '2026-11-09T16:14:02.27Z',
        'report_url': 'https://app.powerbi.com/view?r=eyJrIjoiZTliZDk2MzktNTAyYi00MTk5LWIyZTktNWIwMDFmN2UwOWY2IiwidCI6IjQwNmMyNTc1LWM5ZDQtNGQ0NC1hNWI2LWJiNThiYzg2MDMzZSJ9'}
    metadata.update({'source': 'ABVE/Tupi Mobilidade — painel público ABVE',
        'report_name': models['displayName'], 'model_id': models['id'],
        'last_refresh_time': models.get('LastRefreshTime'), 'reference_dates': sorted({r['reference_date'] for r in raw}),
        'grain': 'observação agregada por rótulo geográfico/UF/data; inclui distritos; sem locais individuais',
        'municipality_code_system': 'código opaco da fonte; não presumir IBGE',
        'reuse_license': 'Licença aberta de redistribuição não identificada; verificar antes de publicar/comercializar',
        'period_conflict': 'Painel: setembro/2026. Matéria ABVE de 28/09/2026: agosto/2026 para os mesmos totais.',
        'snapshot_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(snapshot.glob('*.json'))}})
    quality = {'raw_rows': len(raw), 'geographic_label_uf_groups': len(municipalities), 'states': len(states),
        'history_snapshots': len(history), 'blank_history_members_excluded': blank_history_members,
        'totals': totals, 'complete_response': True,
        'municipal_state_reconciliation': 'passed', 'national_history_reconciliation': 'passed',
        'repeated_name_uf_groups': duplicate_groups, 'source_code_collisions': collisions,
        'distinct_source_codes': len(code_counts),
        'repeated_source_codes': {k: v for k, v in code_counts.items() if v > 1},
        'aggregation_rule': 'SUM(AC), SUM(DC) por data/UF/rótulo exato; linhas originais preservadas; aliases não resolvidos',
        'geographic_label_warning': '1911 rótulos distintos não equivalem a 1911 municípios IBGE. Há distritos/regiões administrativas e nomes sem correspondência.'}
    tables = {'municipal_raw': raw, 'geographic_label_aggregated': municipalities,
              'uf_aggregated': states, 'national_history': history}
    for name, rows in tables.items():
        save_csv(output / (name + '.csv'), rows)
    write_json(output / 'metadata.json', metadata)
    write_json(output / 'quality.json', quality)
    db = output / 'abve_charging.sqlite'
    if db.exists():
        db.unlink()
    with sqlite3.connect(db) as connection:
        for name, rows in tables.items():
            cols = list(rows[0]); types = ['INTEGER' if isinstance(rows[0][c], int) else 'TEXT' for c in cols]
            connection.execute('CREATE TABLE "' + name + '" (' + ','.join('"' + c + '" ' + t for c,t in zip(cols,types)) + ')')
            connection.executemany('INSERT INTO "' + name + '" VALUES (' + ','.join('?' for c in cols) + ')', [[r[c] for c in cols] for r in rows])
        connection.execute('CREATE TABLE provenance (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)')
        connection.executemany('INSERT INTO provenance VALUES (?,?)', [(k, json.dumps(v, ensure_ascii=False)) for k,v in metadata.items()])
        connection.execute('CREATE TABLE quality (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)')
        connection.executemany('INSERT INTO quality VALUES (?,?)', [(k, json.dumps(v, ensure_ascii=False)) for k,v in quality.items()])
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
    print(json.dumps({k: quality[k] for k in ['raw_rows','geographic_label_uf_groups','states','history_snapshots','totals']}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--offline', action='store_true', help='Rebuild from captured public responses')
    mode.add_argument('--refresh', action='store_true', help='Discover and read current public ABVE report')
    parser.add_argument('--snapshot', type=Path, default=ROOT.parent.parent / 'data/charging/source/2026-09/snapshots')
    parser.add_argument('--output', type=Path, default=ROOT.parent.parent / 'data/charging/source/2026-09/values')
    args = parser.parse_args()
    args.snapshot.mkdir(parents=True, exist_ok=True)
    if args.refresh:
        refresh(args.snapshot)
    build(args.snapshot, args.output)
