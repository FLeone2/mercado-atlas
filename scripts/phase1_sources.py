#!/usr/bin/env python3
"""Fetch and freeze Phase 1 public statistics; missing values are never imputed.

Run without --refresh to rebuild offline from hash-verified raw receipts. A refresh
uses official HTTPS sources and preserves metadata and download failures. SIDRA
observation labels/units are verified even if its separate metadata API is down.
"""
from __future__ import annotations

import argparse
import collections
import copy
import datetime as dt
import gzip
import hashlib
import json
import math
import re
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/scenarios/sources'
OUT = ROOT / 'data/scenarios/phase1_sources.json'
MAX_ASSET_BYTES = 25 * 1024 * 1024
SENATRAN_PAGE = 'https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-2026'
SOURCE_SPECS = [
    {'key': 'ipca', 'table': 1737, 'label': 'IPCA', 'url': 'https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266,63,2265/p/201601-202609', 'unit': 'index December 1993=100; percent', 'referencePeriod': '2016-01/2026-09'},
    {'key': 'pnad_real_income', 'table': 6390, 'label': 'Rendimento médio real habitual de todos os trabalhos', 'url': 'https://apisidra.ibge.gov.br/values/t/6390/n1/all/v/5933/p/201601-202608', 'unit': 'BRL real, published IBGE price reference', 'referencePeriod': '2016-01/2026-08'},
    {'key': 'pnad_real_mass', 'table': 6392, 'label': 'Massa real habitual de todos os trabalhos', 'url': 'https://apisidra.ibge.gov.br/values/t/6392/n1/all/v/6293/p/201601-202608', 'unit': 'BRL millions real, published IBGE price reference', 'referencePeriod': '2016-01/2026-08'},
    {'key': 'census_density', 'table': 4714, 'label': 'Densidade demográfica Censo 2022', 'url': 'https://apisidra.ibge.gov.br/values/t/4714/n6/all/v/614/p/2022', 'unit': 'inhabitants/km2', 'referencePeriod': '2022'},
    {'key': 'census_urbanization', 'table': 9923, 'label': 'População urbana e total Censo 2022', 'url': 'https://apisidra.ibge.gov.br/values/t/9923/n6/all/v/93/p/2022/c1/6795,1', 'unit': 'persons; derived urban proportion 0-1', 'referencePeriod': '2022'},
    {'key': 'census_household_income', 'table': 10295, 'label': 'Rendimento domiciliar per capita mensal, médio e mediano, Censo 2022', 'url': 'https://apisidra.ibge.gov.br/values/t/10295/n6/all/v/13431,13534/p/2022/c2/6794/c58/95253/c86/95251', 'unit': 'BRL nominal monthly per resident, 2022', 'referencePeriod': '2022'},
    {'key': 'pam', 'table': 5457, 'label': 'Produção Agrícola Municipal: área e valor, total de produtos', 'url': 'https://apisidra.ibge.gov.br/values/t/5457/n6/all/v/8331,215/p/2025/c782/0', 'unit': 'ha; BRL nominal (published thousand BRL × 1000)', 'referencePeriod': '2025'},
]


def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def numeric(value):
    """SIDRA '-' means exact zero; suppressed/unknown/inapplicable stay None."""
    if value == '-':
        return 0.0
    if value is None or value in ('', '..', '...', 'X'):
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError('Non-finite observation')
    return result


def ibge_code(value):
    code = str(value).strip()
    if not re.fullmatch(r'[1-5]\d{6}', code):
        raise ValueError(f'Invalid seven-digit IBGE municipality code: {value!r}')
    return code


def normalized_name(value):
    return re.sub('[^A-Z0-9]', '', unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().upper())


def get_bytes(url, timeout=40):
    req = urllib.request.Request(url, headers={'User-Agent': 'MercadoAutomotivoSourceAudit/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read(MAX_ASSET_BYTES + 1)
        if len(raw) > MAX_ASSET_BYTES:
            raise ValueError('Response exceeds 25 MiB asset budget')
        return raw, dict(response.headers)


def cached_fetch(key, url, refresh=False, timeout=40, cache=CACHE):
    cache.mkdir(parents=True, exist_ok=True)
    path, receipt_path = cache / f'{key}.json.gz', cache / f'{key}.receipt.json'
    if not refresh:
        if not path.exists() or not receipt_path.exists():
            raise FileNotFoundError(f'No verified raw cache for {key}; run --refresh')
        receipt = json.loads(receipt_path.read_text())
        raw = gzip.decompress(path.read_bytes())
        if receipt['url'] != url or receipt['sha256'] != sha256(raw):
            raise ValueError(f'Cache URL or content hash mismatch for {key}')
        return json.loads(raw), receipt
    raw, headers = get_bytes(url, timeout)
    data = json.loads(raw)
    if not isinstance(data, list) or len(data) < 2 or data[0].get('V') != 'Valor':
        raise ValueError('SIDRA did not return header plus observations')
    compressed = gzip.compress(raw, mtime=0)
    other_size = sum(p.stat().st_size for p in cache.iterdir() if p.is_file() and p != path)
    if other_size + len(compressed) > MAX_ASSET_BYTES:
        raise ValueError('Combined raw cache exceeds 25 MiB asset budget')
    receipt = {'url': url, 'file': f'data/scenarios/sources/{path.name}', 'sha256': sha256(raw), 'compressedSha256': sha256(compressed), 'retrievedAt': utcnow(), 'bytes': len(raw), 'compressedBytes': len(compressed), 'rows': len(data) - 1, 'contentType': headers.get('Content-Type'), 'releaseDate': None, 'releaseVintage': 'unknown', 'hashDefinition': 'sha256 of exact uncompressed HTTP response body'}
    path.write_bytes(compressed)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    return data, receipt


def validate_rows(rows, expected):
    """Fail closed on changed variables, units, dimensions, periods, or duplicates."""
    seen = set()
    for row in rows:
        variable = row['D2C']
        if variable not in expected:
            raise ValueError(f'Unexpected variable: {variable}')
        unit, text = expected[variable]
        if row['MN'] != unit or text.casefold() not in row['D2N'].casefold():
            raise ValueError(f'SIDRA label/unit mismatch: {variable}: {row["D2N"]}, {row["MN"]}')
        key = tuple((x, row[x]) for x in sorted(row) if re.fullmatch(r'D\d+C', x))
        if key in seen:
            raise ValueError(f'Duplicate observation key: {key}')
        seen.add(key)
        numeric(row['V'])


def monthly_series(rows, variable, key, label, unit, frequency='monthly'):
    values = []
    for row in rows:
        if row['D2C'] != variable:
            continue
        period = row['D3C']
        if row['NC'] != '1' or row['D1C'] != '1' or not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', period):
            raise ValueError('Expected national month/rolling-quarter observation')
        month = period[:4] + '-' + period[4:]
        values.append({'month': month, 'value': numeric(row['V']), 'periodLabel': row['D3N'], 'releaseDate': None})
    values.sort(key=lambda row: row['month'])
    return {'key': key, 'label': label, 'unit': unit, 'frequency': frequency, 'table': 1737 if key.startswith('ipca') else 6390 if key == 'pnad_real_income' else 6392, 'variable': variable, 'status': 'available' if values else 'no_observations', 'monthly': values, 'coverageStart': values[0]['month'] if values else None, 'coverageEnd': values[-1]['month'] if values else None, 'releaseVintage': 'unknown', 'releaseDate': None, 'historicalAsOfEligible': False, 'note': 'Current downloaded vintage. Historical publication dates and revision snapshots unavailable.' + (' Three-month moving quarters overlap; month is the quarter end, not a single-month estimate. Already deflated by IBGE; do not deflate again.' if frequency == 'rolling_quarter' else '')}


def populate_source(key, data, municipalities):
    rows = data[1:]
    series = []
    if key == 'ipca':
        validate_rows(rows, {'2266': ('Número-índice', 'Número-índice'), '63': ('%', 'Variação mensal'), '2265': ('%', '12 meses')})
        series = [monthly_series(rows, '2266', 'ipca_index', 'IPCA número-índice', 'December 1993 = 100'), monthly_series(rows, '63', 'ipca_monthly', 'IPCA mensal', '% m/m'), monthly_series(rows, '2265', 'ipca_yoy', 'IPCA acumulado em 12 meses', '% y/y')]
    elif key in ('pnad_real_income', 'pnad_real_mass'):
        variable, unit, label = ('5933', 'Reais', 'Rendimento médio mensal real') if key == 'pnad_real_income' else ('6293', 'Milhões de Reais', 'Massa de rendimento mensal real')
        validate_rows(rows, {variable: (unit, label)})
        series = [monthly_series(rows, variable, key, label + ' habitual', 'BRL real' if variable == '5933' else 'BRL million real', 'rolling_quarter')]
    else:
        expected = {'614': ('Habitante por quilômetro quadrado', 'Densidade demográfica')} if key == 'census_density' else {'93': ('Pessoas', 'População residente')} if key == 'census_urbanization' else {'13431': ('Reais', 'rendimento nominal médio mensal domiciliar per capita'), '13534': ('Reais', 'rendimento nominal mediano mensal domiciliar per capita')} if key == 'census_household_income' else {'8331': ('Hectares', 'Área plantada ou destinada'), '215': ('Mil Reais', 'Valor da produção')}
        validate_rows(rows, expected)
        urban = collections.defaultdict(dict)
        for row in rows:
            code = ibge_code(row['D1C'])
            if row['NC'] != '6':
                raise ValueError('Expected municipality geography')
            if row['D3C'] != ('2025' if key == 'pam' else '2022'):
                raise ValueError('Unexpected annual reference period')
            record = municipalities.setdefault(code, {'code': code})
            value = numeric(row['V'])
            if key == 'census_density':
                record['density2022'] = value
            elif key == 'census_urbanization':
                if row.get('D4C') not in ('6795', '1'):
                    raise ValueError('Unexpected urbanization category')
                urban[code][row['D4C']] = value
            elif key == 'census_household_income':
                if (row.get('D4C'), row.get('D5C'), row.get('D6C')) != ('6794', '95253', '95251'):
                    raise ValueError('Household income must use totals for sex, age and race')
                record['householdIncomeYear'] = 2022
                record['householdIncomePerCapita2022' if row['D2C'] == '13431' else 'householdIncomeMedian2022'] = value
            else:
                if row.get('D4C') != '0':
                    raise ValueError('PAM must use total products without double counting')
                record['pamYear'] = 2025
                record['pamAreaHa' if row['D2C'] == '8331' else 'pamValueBRL'] = value if row['D2C'] == '8331' or value is None else value * 1000
        for code, values in urban.items():
            total, urban_count = values.get('6795'), values.get('1')
            if total is not None and urban_count is not None and (total <= 0 or not 0 <= urban_count <= total):
                raise ValueError('Inconsistent urban/total population')
            municipalities[code].update(censusPopulation2022=total, urbanPopulation2022=urban_count, urbanization2022=urban_count / total if total and urban_count is not None else None)
    return series


def read_fleet_xlsx(path, socioeconomic):
    """Read official municipal/type XLSX; strict UF/name join with explicit rejects."""
    import openpyxl
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(workbook.active.iter_rows(values_only=True))
    if not rows or 'SETEMBRO2026' not in normalized_name(rows[0][0]):
        raise ValueError('Fleet workbook reference month changed; expected September 2026')
    header_at = next((i for i, row in enumerate(rows[:20]) if any(normalized_name(v) == 'MUNICIPIO' for v in row)), None)
    if header_at is None:
        raise ValueError('Frota XLSX municipal header not found')
    header = [normalized_name(v) for v in rows[header_at]]
    uf_at, name_at = header.index('UF'), header.index('MUNICIPIO')
    total_at = next((i for i, value in enumerate(header) if value in ('TOTAL', 'TOTALVEICULOS')), None)
    if total_at is None:
        raise ValueError('Frota XLSX total header not found')
    lookup = collections.defaultdict(list)
    valid_ufs = {row['uf'] for row in socioeconomic}
    for row in socioeconomic:
        lookup[(row['uf'], normalized_name(row['name']))].append(ibge_code(row['code']))
    result, rejected = {}, []
    source_total = 0
    for row in rows[header_at + 1:]:
        if len(row) <= max(uf_at, name_at, total_at) or not isinstance(row[uf_at], str) or row[uf_at].strip() not in valid_ufs:
            continue
        total = numeric(str(row[total_at])) if row[total_at] is not None else None
        types = {header[i]: float(v) for i, v in enumerate(row) if i not in (uf_at, name_at, total_at) and header[i] and isinstance(v, (int, float))}
        if total is None or total < 0 or total != int(total) or any(v < 0 or v != int(v) for v in types.values()):
            raise ValueError('Invalid fleet count')
        if sum(types.values()) != total:
            raise ValueError('Fleet type counts do not reconcile to municipal total')
        source_total += total
        match = lookup.get((row[uf_at].strip(), normalized_name(row[name_at])), [])
        if len(match) != 1:
            rejected.append({'uf': row[uf_at], 'name': row[name_at], 'reason': 'missing_or_ambiguous_exact_normalized_name', 'fleetTotal': total})
            continue
        code = match[0]
        if code in result:
            raise ValueError('Duplicate matched Senatran municipality')
        result[code] = {'fleetTotal': total, 'fleetByType': types, 'fleetMonth': '2026-09'}
    declared_totals = [v for row in rows[1:header_at] for v in row if isinstance(v, (int, float))]
    if len(declared_totals) != 1 or source_total != declared_totals[0]:
        raise ValueError('Fleet municipal totals do not reconcile to published national total')
    workbook.close()
    return result, rejected


def fleet_source(refresh, timeout, cache, municipalities, socioeconomic):
    receipt_path = cache / 'senatran.receipt.json'
    asset = cache / 'senatran_2026_09.xlsx'
    source = {'key': 'senatran_fleet', 'label': 'Frota municipal por tipo Senatran', 'sourceUrl': SENATRAN_PAGE, 'referencePeriod': '2026-09', 'unit': 'registered vehicles (stock)', 'releaseVintage': 'unknown', 'releaseDate': None, 'historicalAsOfEligible': False, 'receipts': [], 'coverage': {'municipalities': 0}, 'status': 'blocked_fetch', 'blocker': None}
    try:
        if refresh:
            # Discover the official file from the public catalogue; do not guess a URL.
            raw, _ = get_bytes(SENATRAN_PAGE, timeout)
            html = raw.decode('utf-8')
            candidates = re.findall(r'href=[\"\x27]([^\"\x27]+)[\"\x27][^>]*>[^<]*Frota por Município e Tipo', html, re.I)
            candidates = [u for u in candidates if '2026' in u and any(t in normalized_name(u) for t in ('SETEMBRO', 'SET26', '092026'))]
            if not candidates:
                raise ValueError('Official September 2026 municipal/type XLSX link not discoverable in fetched catalogue')
            url = candidates[0]
            if not url.startswith('https://www.gov.br/transportes/'):
                raise ValueError('Unexpected official fleet asset origin')
            raw, headers = get_bytes(url.removesuffix('/view'), timeout)
            if not raw.startswith(b'PK'):
                raise ValueError('Fleet download is not XLSX')
            if sum(p.stat().st_size for p in cache.iterdir() if p.is_file() and p != asset) + len(raw) > MAX_ASSET_BYTES:
                raise ValueError('Combined raw cache exceeds 25 MiB asset budget')
            asset.write_bytes(raw)
            receipt = {'url': url, 'file': 'data/scenarios/sources/' + asset.name, 'sha256': sha256(raw), 'bytes': len(raw), 'retrievedAt': utcnow(), 'releaseDate': None, 'releaseVintage': 'unknown'}
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        elif receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
            if receipt.get('status') == 'blocked_fetch':
                source.update(receipt)
                return source
        else:
            raise FileNotFoundError('No cached official fleet download; run --refresh')
        receipt = json.loads(receipt_path.read_text())
        if receipt['sha256'] != sha256(asset.read_bytes()):
            raise ValueError('Fleet cache hash mismatch')
        fleet, rejected = read_fleet_xlsx(asset, socioeconomic)
        for code, values in fleet.items():
            municipalities.setdefault(code, {'code': code}).update(values)
        source.update(status='available' if fleet else 'no_observations', receipts=[receipt], coverage={'municipalities': len(fleet), 'unmatched': len(rejected), 'unmatchedRows': rejected, 'matchedFleetVehicles': sum(v['fleetTotal'] for v in fleet.values()), 'unmatchedFleetVehicles': sum(v['fleetTotal'] for v in rejected), 'nationalFleetVehicles': sum(v['fleetTotal'] for v in fleet.values()) + sum(v['fleetTotal'] for v in rejected), 'municipalAndNationalTotalsReconciled': True}, join='strict UF + accent/punctuation-normalized name to current official IBGE municipality catalogue; no fuzzy match', blocker=None)
    except Exception as error:
        source['blocker'] = f'{type(error).__name__}: {error}'
        if refresh:
            receipt_path.write_text(json.dumps({'status': 'blocked_fetch', 'blocker': source['blocker'], 'attemptedUrl': SENATRAN_PAGE, 'attemptedAt': utcnow()}, ensure_ascii=False, indent=2) + '\n')
    return source


def build(refresh=False, timeout=40, out=OUT, cache=CACHE):
    sources, monthly, municipalities = [], [], {}
    socioeconomic_path = ROOT / 'data/scenarios/socioeconomic.json'
    socioeconomic = json.loads(socioeconomic_path.read_text())['rows'] if socioeconomic_path.exists() else []
    for row in socioeconomic:
        municipalities[ibge_code(row['code'])] = {'code': row['code'], 'name': row['name'], 'uf': row['uf'], 'density2022': None, 'urbanization2022': None, 'pamAreaHa': None, 'pamValueBRL': None, 'pamYear': None, 'fleetTotal': None, 'fleetMonth': None, 'householdIncomePerCapita2022': None, 'householdIncomeMedian2022': None, 'householdIncomeYear': None}
    for spec in SOURCE_SPECS:
        source = {'key': spec['key'], 'label': spec['label'], 'table': spec['table'], 'sourceUrl': spec['url'], 'metadataUrl': f'https://servicodados.ibge.gov.br/api/v3/agregados/{spec["table"]}/metadados', 'referencePeriod': spec['referencePeriod'], 'unit': spec['unit'], 'releaseDate': None, 'releaseVintage': 'unknown', 'historicalAsOfEligible': False, 'status': 'blocked_fetch', 'blocker': None, 'receipts': [], 'coverage': {}}
        try:
            data, receipt = cached_fetch(spec['key'], spec['url'], refresh, timeout, cache)
            source['receipts'] = [receipt]
            staged = copy.deepcopy(municipalities)
            added_series = populate_source(spec['key'], data, staged)
            municipalities = staged
            monthly.extend(added_series)
            source.update(status='available', metadataVerification='Variable labels, units, geography and periods verified against official SIDRA response; separate metadata endpoint not required.', coverage={'observations': len(data) - 1, 'municipalities': len({row['D1C'] for row in data[1:] if row['NC'] == '6'}), 'periods': sorted({row['D3C'] for row in data[1:]}), 'missingObservations': sum(numeric(row['V']) is None for row in data[1:]), 'missingTokens': dict(collections.Counter(row['V'] for row in data[1:] if numeric(row['V']) is None))})
        except Exception as error:
            source['blocker'] = f'{type(error).__name__}: {error}'
        sources.append(source)
        print(spec['key'], source['status'], source['blocker'] or {k: v for k, v in source['coverage'].items() if k != 'periods'}, flush=True)
    sources.append(fleet_source(refresh, timeout, cache, municipalities, socioeconomic))
    timestamp = max((receipt['retrievedAt'] for source in sources for receipt in source.get('receipts', []) if receipt.get('retrievedAt')), default='unknown')
    result = {'schemaVersion': 'scenarios-phase1-1.0.0', 'asOf': timestamp[:10], 'retrievedAt': timestamp, 'sources': sources, 'monthlySeries': monthly, 'municipalities': sorted(municipalities.values(), key=lambda row: row['code']), 'coverage': {'municipalities': len(municipalities), 'density2022': sum(r.get('density2022') is not None for r in municipalities.values()), 'urbanization2022': sum(r.get('urbanization2022') is not None for r in municipalities.values()), 'pamAreaHa': sum(r.get('pamAreaHa') is not None for r in municipalities.values()), 'pamValueBRL': sum(r.get('pamValueBRL') is not None for r in municipalities.values()), 'fleetTotal': sum(r.get('fleetTotal') is not None for r in municipalities.values()), 'householdIncomePerCapita2022': sum(r.get('householdIncomePerCapita2022') is not None for r in municipalities.values())}, 'geography': {'key': 'seven-digit IBGE municipality code', 'catalogueSource': 'data/scenarios/socioeconomic.json', 'catalogueSha256': sha256(socioeconomic_path.read_bytes()) if socioeconomic_path.exists() else None, 'note': '2022 census and 2025 PAM geographies can differ from 2026 population catalogue; preserve unmatched codes and do not impute across boundaries.'}, 'rules': ['Current-vintage snapshots only; releaseDate is unknown, so these values are not eligible for leakage-free historical as-of backtests.', 'Unknown, suppressed or inapplicable SIDRA values remain null. SIDRA dash represents exact zero.', 'PNAD observations are overlapping rolling quarters, indexed by the ending month; never treat them as independent single-month observations.', 'PNAD real measures are already deflated by IBGE and must not be deflated again.', 'Census 2022 household per-capita income is nominal monthly resident income, not GDP per capita, household-head income, or current 2026 income.', 'PAM is an annual local agricultural production proxy; it is not household income or directly measured vehicle demand.', 'PAM area can count successive crops; it is crop area, not unique physical land area.', 'Senatran fleet is a registered-vehicle stock, not new registrations or new vehicle sales.', 'Population, GDP, census and PAM reference years differ; report each year and retain boundary gaps.']}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Fetch official sources; otherwise rebuild offline from verified cached assets')
    parser.add_argument('--timeout', type=int, default=40)
    parser.add_argument('--out', type=Path, default=OUT)
    args = parser.parse_args()
    payload = build(args.refresh, args.timeout, args.out)
    print(json.dumps(payload['coverage']))
