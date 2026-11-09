#!/usr/bin/env python3
"""Compile one original monthly XLSX and its source-year BD tab into public cubes.

This command writes a staging directory only. Review receipt.json, reconcile its
counts, and merge the month into manifest/snapshot before update-derived.sh.
Original workbooks and direct identifiers must never be committed or published.

Dependencies: pip install -r scripts/requirements-import.txt
"""
import argparse
import calendar
from collections import Counter, defaultdict
import datetime as dt
from decimal import Decimal, InvalidOperation
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import re

from openpyxl import load_workbook
from openpyxl.utils.datetime import CALENDAR_WINDOWS_1900, from_excel

DIMENSIONS = ['date', 'uf', 'municipio', 'marca', 'modelo', 'grupo_modelo',
              'combustivel', 'segmento', 'subsegmento', 'tipo_venda', 'regiao',
              'nacionalidade', 'ano_fabricacao', 'potencia', 'capacidade_carga',
              'capacidade_passageiros', 'bd_segmento', 'bd_carroceria',
              'bd_classe', 'bd_macro', 'bd_combustivel']
SOURCE_FIELDS = {
    'uf': 'Estado', 'municipio': 'Municipio', 'marca': 'Fabricante',
    'modelo': 'Modelo', 'grupo_modelo': 'GrupoModeloVeiculo',
    'combustivel': 'Combustivel', 'segmento': 'Segmento',
    'subsegmento': 'SubSegmento', 'nacionalidade': 'Codigo_Nacionalidade',
    'ano_fabricacao': 'Ano_Fabricacao', 'potencia': 'Potencia',
    'capacidade_carga': 'Capacidade_Carga',
    'capacidade_passageiros': 'Capacidade_Passageiros',
}
MISSING = 'Não informado'
NO_BD = 'Sem correspondência BD'
EMPTY_BD = 'Não classificado no BD'
REGIONS = {uf: region for region, ufs in {
    'Norte': 'AC AP AM PA RO RR TO', 'Nordeste': 'AL BA CE MA PB PE PI RN SE',
    'Centro-Oeste': 'DF GO MT MS', 'Sudeste': 'ES MG RJ SP', 'Sul': 'PR RS SC',
}.items() for uf in ufs.split()}
BD_FIELDS = ['bd_segmento', 'bd_carroceria', 'bd_classe', 'bd_macro',
             'bd_combustivel', 'bd_origem']
COUNT_MEANING = 'Source registration rows; duplicates retained and reported.'
ANALYTICAL_FIELDS = set(SOURCE_FIELDS.values()) | {
    'Data_Emplacamento', 'Modelo_Codigo', 'Fabricante_Codigo',
    'GrupoModeloVeiculo_Codigo', 'Municipio_Codigo', 'Combustivel_Codigo',
    'Segmento_Codigo', 'SubSegmento_Codigo', 'Tipo Venda', 'Vendas Diretas',
    'Região', 'ano mod',
}
DIAGNOSTIC_FIELDS = {'CNPJ', 'Razao_Social', 'Numero_Chassis', 'Numero_Placa'}


def text(value):
    if value is None:
        return ''
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def numeric_code(value):
    """Accept exact integral numeric representations, never approximate a key."""
    if isinstance(value, bool) or not text(value):
        return None
    try:
        number = Decimal(text(value))
        if number.is_finite() and number == number.to_integral_value():
            return int(number)
    except InvalidOperation:
        pass
    return None


def parse_date(value, epoch=CALENDAR_WINDOWS_1900):
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            result = from_excel(value, epoch=epoch)
            return result.date() if isinstance(result, dt.datetime) else None
        except (OverflowError, ValueError):
            return None
    value = text(value)
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).date()
    except ValueError:
        pass
    for pattern in ('%d/%m/%Y', '%d/%m/%Y %H:%M:%S', '%d-%m-%Y',
                    '%d-%m-%Y %H:%M:%S'):
        try:
            return dt.datetime.strptime(value, pattern).date()
        except ValueError:
            pass
    return None


def bd_text(value):
    """A BD cell, with its blank markers ("---", "-", "—") read as empty, as in the months before 2026-10."""
    value = text(value)
    return '' if re.fullmatch(r'[-–—\s]*', value) else value


def bd_values(macro, segment, body, fuel, origin):
    segment, body = bd_text(segment), bd_text(body)
    return {
        'bd_segmento': segment or EMPTY_BD,
        'bd_carroceria': body or EMPTY_BD,
        'bd_classe': f'{body} / {segment}' if body and segment else EMPTY_BD,
        'bd_macro': bd_text(macro) or EMPTY_BD,
        'bd_combustivel': bd_text(fuel) or EMPTY_BD,
        'bd_origem': bd_text(origin) or EMPTY_BD,
    }


def bd_rows(path, year):
    """Read only an exact annual tab, preserving the workbook's native values."""
    if Path(path).suffix.lower() == '.xlsb':
        from pyxlsb import open_workbook
        with open_workbook(str(path)) as workbook:
            if str(year) not in workbook.sheets:
                raise ValueError(f'BD has no exact annual sheet {year}; no backcast allowed')
            with workbook.get_sheet(str(year)) as sheet:
                for row in sheet.rows():
                    yield [cell.v for cell in row]
    elif Path(path).suffix.lower() == '.xlsx':
        workbook = load_workbook(path, read_only=True, data_only=True)
        try:
            if str(year) not in workbook.sheetnames:
                raise ValueError(f'BD has no exact annual sheet {year}; no backcast allowed')
            yield from workbook[str(year)].iter_rows(values_only=True)
        finally:
            workbook.close()
    else:
        raise ValueError('BD must be an original .xlsb or .xlsx workbook')


def load_bd(path, year):
    result, header = {}, None
    for source in bd_rows(path, year):
        values = list(source)
        if header is None:
            if values and text(values[0]) == 'CODE':
                header = [text(value) for value in values]
                expected = {0: 'CODE', 4: 'MACRO', 5: 'SEGMENT',
                            6: 'BODY TIPE', 8: 'FUEL', 11: 'ORIGIN'}
                if any(len(header) <= col or header[col] != name
                       for col, name in expected.items()):
                    raise ValueError('Unexpected BD classification layout')
            continue
        code = numeric_code(values[0] if values else None)
        if code is None:
            continue
        values += [None] * max(0, 12 - len(values))
        classification = bd_values(values[4], values[5], values[6],
                                   values[8], values[11])
        if code in result and result[code] != classification:
            raise ValueError('Conflicting BD classifications for an exact annual key')
        result[code] = classification
    if not result:
        raise ValueError('BD annual sheet contains no numeric classification keys')
    return result


def encode_cube(month, dimensions, counts):
    dictionaries = {dim: sorted({row[i] for row in counts})
                    for i, dim in enumerate(dimensions)}
    indexes = [{value: i for i, value in enumerate(dictionaries[dim])}
               for dim in dimensions]
    rows = sorted([indexes[i][value] for i, value in enumerate(row)] + [count]
                  for row, count in counts.items())
    return {'schemaVersion': 1, 'month': month, 'dimensions': dimensions,
            'dictionaries': dictionaries, 'columns': dimensions + ['count'],
            'rows': rows, 'countMeaning': COUNT_MEANING}


def compile_rows(month, headers, rows, bd_map, epoch=CALENDAR_WINDOWS_1900):
    """Aggregate rows while diagnostics retain only ephemeral salted hashes."""
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
        raise ValueError('month must be YYYY-MM')
    if len(headers) != len(set(headers)):
        raise ValueError('Duplicate source column names')
    required = {'Data_Emplacamento', 'Modelo_Codigo', 'Segmento', 'Estado'}
    if not required.issubset(headers):
        raise ValueError('Missing required source columns: ' + ', '.join(sorted(required - set(headers))))
    totals = Counter(rows=0, eligible_rows=0, blank_rows=0, invalid_date_rows=0,
                     month_mismatch_rows=0, missing_chassis_rows=0)
    base, origin = Counter(), Counter()
    unknown = Counter({dim: 0 for dim in list(SOURCE_FIELDS) + ['tipo_venda']})
    scope, origin_counts, bd_counts = Counter(), Counter(), Counter(matched=0, unmatched=0)
    dates = set()
    salt = os.urandom(32)
    exact, chassis, plates, chassis_date, plate_date = [Counter() for _ in range(5)]
    chassis_dates, plate_dates = defaultdict(set), defaultdict(set)
    channel_aliases = channel_conflicts = incomplete_bd = invalid_ufs = 0

    def private_hash(value):
        return hashlib.blake2b(value.encode('utf-8'), key=salt, digest_size=20).digest()

    for source_row in rows:
        if all(value is None or text(value) == '' for value in source_row):
            totals['blank_rows'] += 1
            continue
        totals['rows'] += 1
        raw = dict(zip(headers, source_row))
        # Full raw values/types distinguish source rows; only salted digests survive.
        exact[private_hash(repr(tuple(source_row)))] += 1
        parsed = parse_date(raw.get('Data_Emplacamento'), epoch)
        day = parsed.isoformat() if parsed else 'invalid'
        for field, counts, per_day, known_dates in (
                ('Numero_Chassis', chassis, chassis_date, chassis_dates),
                ('Numero_Placa', plates, plate_date, plate_dates)):
            identifier = text(raw.get(field))
            if identifier:
                key = private_hash(identifier)
                counts[key] += 1
                per_day[(key, day)] += 1
                known_dates[key].add(day)
            elif field == 'Numero_Chassis':
                totals['missing_chassis_rows'] += 1
        if parsed is None:
            totals['invalid_date_rows'] += 1
            continue
        if day[:7] != month:
            totals['month_mismatch_rows'] += 1
            continue
        totals['eligible_rows'] += 1
        dates.add(day)
        values = {'date': day}
        for dim, field in SOURCE_FIELDS.items():
            values[dim] = text(raw.get(field)) or MISSING
            unknown[dim] += values[dim] == MISSING
        # Original region abbreviations vary over time; geography always follows UF.
        values['regiao'] = REGIONS.get(values['uf'], MISSING)
        invalid_ufs += values['uf'] not in REGIONS
        channel, alias = text(raw.get('Tipo Venda')), text(raw.get('Vendas Diretas'))
        channel_conflicts += bool(channel and alias and channel != alias)
        channel_aliases += bool(not channel and alias)
        values['tipo_venda'] = channel or alias or MISSING
        unknown['tipo_venda'] += values['tipo_venda'] == MISSING
        classification = bd_map.get(numeric_code(raw.get('Modelo_Codigo')))
        if classification is None:
            bd_counts['unmatched'] += 1
            classification = dict.fromkeys(BD_FIELDS, NO_BD)
        else:
            bd_counts['matched'] += 1
            incomplete_bd += any(classification[field] == EMPTY_BD for field in BD_FIELDS[:-1])
        values.update(classification)
        row = tuple(values[dim] for dim in DIMENSIONS)
        base[row] += 1
        origin[row + (values['bd_origem'],)] += 1
        scope[values['segmento']] += 1
        origin_counts[values['bd_origem']] += 1

    def repeats(counts):
        return sum(count - 1 for count in counts.values() if count > 1)

    def diagnostic(counts):
        counts = [count for count in counts.values() if count > 1]
        return {'groups': len(counts), 'rows': sum(counts),
                'excessRows': sum(count - 1 for count in counts)}

    totals.update(exact_duplicate_excess_rows=repeats(exact),
                  repeated_chassis_excess_rows=repeats(chassis),
                  repeated_plate_excess_rows=repeats(plates))
    # Full projection, not only grand totals: origin must preserve every joint cell.
    projected = Counter()
    for row, count in origin.items():
        projected[row[:-1]] += count
    if projected != base or sum(base.values()) != totals['eligible_rows']:
        raise AssertionError('Joint cube projection/count reconciliation failed')
    year, month_number = map(int, month.split('-'))
    dates_without_rows = [f'{month}-{day:02d}' for day in range(1, calendar.monthrange(year, month_number)[1] + 1)
                          if f'{month}-{day:02d}' not in dates]
    warnings = [f'{key}: {totals[key]}' for key in (
        'invalid_date_rows', 'month_mismatch_rows', 'exact_duplicate_excess_rows',
        'repeated_chassis_excess_rows', 'repeated_plate_excess_rows', 'missing_chassis_rows') if totals[key]]
    new_columns = sorted(set(headers) - ANALYTICAL_FIELDS - DIAGNOSTIC_FIELDS)
    missing_columns = sorted(set(SOURCE_FIELDS.values()) - set(headers))
    if new_columns:
        warnings.append('New source columns require review: ' + ', '.join(new_columns))
    if missing_columns:
        warnings.append('Missing source columns retained as Não informado: ' + ', '.join(missing_columns))
    if not {'Tipo Venda', 'Vendas Diretas'}.intersection(headers):
        warnings.append('Missing channel source columns retained as Não informado')
    chassis_conflicts = sum(len(known) > 1 for known in chassis_dates.values())
    plate_conflicts = sum(len(known) > 1 for known in plate_dates.values())
    for label, count in [('chassis_date_conflict_groups', chassis_conflicts),
                         ('plate_date_conflict_groups', plate_conflicts),
                         ('invalid_uf_rows', invalid_ufs), ('channel_conflict_rows', channel_conflicts)]:
        if count:
            warnings.append(f'{label}: {count}')
    details = {
        'qualityTotals': dict(totals), 'bdCounts': dict(bd_counts),
        'bdMatchedWithoutCompleteClass': incomplete_bd, 'originCounts': dict(origin_counts),
        'sourceColumns': headers,
        'analyticalSourceColumns': sorted(set(headers) & ANALYTICAL_FIELDS),
        'duplicateDiagnostics': {'exact_source_rows': diagnostic(exact),
                                 'chassis_any_date': diagnostic(chassis),
                                 'plate_any_date': diagnostic(plates),
                                 'chassis_date': diagnostic(chassis_date),
                                 'plate_date': diagnostic(plate_date)},
        'monthEntry': {
            'month': month, 'rows': totals['rows'], 'eligibleRows': totals['eligible_rows'],
            'cubeRows': len(base), 'qualityStatus': 'review' if warnings else 'passed',
            'scope': [{'segment': segment, 'count': count} for segment, count in sorted(scope.items())],
            'lightVehicleRows': sum(scope[segment] for segment in ['Auto', 'Comercial Leve']),
            'dateMin': min(dates) if dates else None, 'dateMax': max(dates) if dates else None,
            'warnings': warnings, 'newColumns': new_columns,
            'missingColumns': missing_columns,
            'unknownDimensions': dict(sorted(unknown.items())),
            'duplicateRows': repeats(exact), 'repeatedChassis': repeats(chassis),
            'repeatedPlates': repeats(plates), 'invalidDateRows': totals['invalid_date_rows'],
            'monthMismatchRows': totals['month_mismatch_rows'], 'sourceSheet': 'dados',
            'sheetExceptionAuthorized': False, 'recoveredFromAlternateSource': False,
            'retrievalSourceName': None, 'retrievalMethod': None,
            'channelSourceFields': [field for field in ['Tipo Venda', 'Vendas Diretas'] if field in headers],
            'channelAliasRows': channel_aliases, 'channelConflictRows': channel_conflicts,
            'datesWithoutRows': dates_without_rows, 'chassisDateConflictGroups': chassis_conflicts,
            'plateDateConflictGroups': plate_conflicts,
            'bdCoverage': dict(bd_counts), 'bdUnclassifiedRows': incomplete_bd,
            'bdSourceSheet': str(year),
        },
    }
    return encode_cube(month, DIMENSIONS, base), encode_cube(month, DIMENSIONS + ['bd_origem'], origin), details


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def write_cube(path, cube):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(cube, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    # Fix mtime and omit a source filename so identical inputs yield identical bytes.
    path.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--bd', type=Path, required=True)
    parser.add_argument('--month', required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--source-name')
    parser.add_argument('--source-modified-time')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', args.month):
        parser.error('--month must be YYYY-MM')
    bd_map = load_bd(args.bd, args.month[:4])
    workbook = load_workbook(args.source, read_only=True, data_only=True)
    try:
        names = [name for name in workbook.sheetnames if name.strip().lower() == 'dados']
        if len(names) != 1:
            raise ValueError('Expected exactly one dados sheet; other sheets are not source records')
        rows = workbook[names[0]].iter_rows(values_only=True)
        headers = [text(value) for value in next(rows)]
        base, origin, receipt = compile_rows(args.month, headers, rows, bd_map, workbook.epoch)
        receipt['monthEntry']['sourceSheet'] = names[0]
    finally:
        workbook.close()
    if not receipt['qualityTotals']['eligible_rows']:
        raise ValueError('No eligible registration rows; refusing an empty monthly cube')
    source_hash, bd_hash = sha256(args.source), sha256(args.bd)
    base_path = f'cubes/{args.month}_{source_hash[:16]}_import-v2_bd{bd_hash[:16]}.json.gz'
    write_cube(args.output_dir / base_path, base)
    origin_path = f'origin-cubes/{args.month}_{source_hash[:16]}_origin-import-v2_bd{bd_hash[:16]}.json.gz'
    write_cube(args.output_dir / origin_path, origin)
    receipt.update(importerVersion='monthly-import-1.1.0',
                   generatedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                   sourceSha256=source_hash, bdSourceSha256=bd_hash,
                   dimensionChoices=base['dictionaries'],
                   originDimensionChoices=origin['dictionaries']['bd_origem'],
                   fullJointProjectionVerified=True)
    receipt['monthEntry'].update(
        cubePath=base_path, compressedBytes=(args.output_dir / base_path).stat().st_size,
        originCubePath=origin_path, originCubeSha256=sha256(args.output_dir / origin_path),
        sha256=source_hash, sourceName=args.source_name or args.source.name,
        sourceModifiedTime=args.source_modified_time)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'month': args.month, 'rows': receipt['qualityTotals']['rows'],
                      'eligibleRows': receipt['qualityTotals']['eligible_rows'],
                      'bdCoverage': receipt['bdCounts'],
                      'receipt': str(args.output_dir / 'receipt.json')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
