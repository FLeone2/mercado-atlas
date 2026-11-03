#!/usr/bin/env python3
"""Validate a staged import and append it to manifest + snapshot.

Usage: python scripts/append-month.py --staging /path/to/import/output
Historical cubes and frozen snapshot analyses are preserved. Run update-derived.sh
afterward, review its results, and publish only after all checks pass.
"""
import argparse
from collections import Counter
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text())


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    temp.replace(path)


def cells(cube):
    dimensions = cube['dimensions']
    result = Counter()
    for row in cube['rows']:
        if len(row) != len(dimensions) + 1 or not isinstance(row[-1], int) or row[-1] <= 0:
            raise ValueError('Malformed cube count/row')
        result[tuple(cube['dictionaries'][d][row[i]] for i, d in enumerate(dimensions))] += row[-1]
    return result


def validate_metadata(receipt, base_cube, origin_cube, base, origin):
    entry = receipt['monthEntry']
    if receipt['dimensionChoices'] != base_cube['dictionaries'] or receipt['originDimensionChoices'] != origin_cube['dictionaries']['bd_origem']:
        raise ValueError('Receipt filter domains differ from cube dictionaries')
    origin_counts = Counter()
    for row, count in origin.items():
        origin_counts[row[-1]] += count
    if origin_counts != receipt['originCounts']:
        raise ValueError('Receipt origin counts differ from cube')
    indexes = {dim: i for i, dim in enumerate(base_cube['dimensions'])}
    scope, bd_counts = Counter(), Counter(matched=0, unmatched=0)
    incomplete = 0
    bd_fields = ['bd_segmento', 'bd_carroceria', 'bd_classe', 'bd_macro', 'bd_combustivel']
    for row, count in base.items():
        scope[row[indexes['segmento']]] += count
        unmatched = row[indexes['bd_segmento']] == 'Sem correspondência BD'
        bd_counts['unmatched' if unmatched else 'matched'] += count
        if not unmatched and any(row[indexes[dim]] == 'Não classificado no BD' for dim in bd_fields):
            incomplete += count
    if bd_counts != receipt['bdCounts'] or incomplete != receipt['bdMatchedWithoutCompleteClass'] or incomplete != entry['bdUnclassifiedRows']:
        raise ValueError('Receipt BD coverage differs from cube')
    if scope != {s['segment']: s['count'] for s in entry['scope']} or entry['lightVehicleRows'] != sum(scope[s] for s in ['Auto', 'Comercial Leve']):
        raise ValueError('Receipt vehicle scope differs from cube')
    if entry['cubeRows'] != len(base_cube['rows']):
        raise ValueError('Receipt cube row count mismatch')


def append(staging, root=ROOT):
    receipt = read(staging / 'receipt.json')
    entry = receipt['monthEntry']
    month = entry['month']
    manifest_path = root / 'data/manifest.json'
    previous_bytes = manifest_path.read_bytes()
    manifest = json.loads(previous_bytes)
    snapshot = read(root / 'data/snapshot.json')
    year, number = map(int, manifest['coverageEnd'].split('-'))
    expected = f'{year + (number == 12):04}-{1 if number == 12 else number + 1:02}'
    if month != expected or any(m['month'] == month for m in manifest['months']):
        raise ValueError(f'Only the next new month ({expected}) may be appended')
    if receipt['bdSourceSha256'] not in [s['sha256'] for s in manifest['bdClassification']['sourceFiles']]:
        raise ValueError('BD revision changed; review classification vintage before appending')
    if Path(entry['cubePath']).name == Path(entry['originCubePath']).name:
        raise ValueError('Base and origin cubes must have distinct filenames for slice/cache identity')
    cubes = []
    for field, folder in [('cubePath', 'cubes'), ('originCubePath', 'origin-cubes')]:
        relative = Path(entry[field])
        if len(relative.parts) != 2 or relative.parts[0] != folder or relative.suffix != '.gz':
            raise ValueError('Cube path must be a direct child of its data folder')
        source = staging / relative
        target = root / 'data' / relative
        if target.exists():
            raise ValueError('Refusing to overwrite an existing cube')
        cube = json.loads(gzip.decompress(source.read_bytes()))
        expected_dims = manifest['dimensions'] + (['bd_origem'] if folder == 'origin-cubes' else [])
        if cube['month'] != month or cube['dimensions'] != expected_dims or cube['columns'] != expected_dims + ['count']:
            raise ValueError('Cube schema/month does not match manifest')
        cubes.append((source, target, cube))
    if hashlib.sha256(cubes[1][0].read_bytes()).hexdigest() != entry['originCubeSha256']:
        raise ValueError('Origin cube hash mismatch')
    base, origin = [cells(cube) for _, _, cube in cubes]
    projected = Counter()
    for row, count in origin.items():
        projected[row[:-1]] += count
    if projected != base or sum(base.values()) != entry['eligibleRows']:
        raise ValueError('Origin joint projection or source count mismatch')
    if entry['eligibleRows'] != receipt['qualityTotals']['eligible_rows'] or sum(receipt['originCounts'].values()) != entry['eligibleRows']:
        raise ValueError('Receipt count mismatch')
    if receipt['sourceSha256'] != entry['sha256'] or entry['bdCoverage'] != receipt['bdCounts']:
        raise ValueError('Receipt source/BD mismatch')
    validate_metadata(receipt, cubes[0][2], cubes[1][2], base, origin)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    manifest['months'].append(entry)
    manifest['expectedMonths'].append(month)
    manifest.update(coverageEnd=month, generatedAt=now)
    for key, value in receipt['qualityTotals'].items():
        manifest['totals'][key] = manifest['totals'].get(key, 0) + value
    for dimension, values in receipt['dimensionChoices'].items():
        manifest['dimensionChoices'][dimension] = sorted(set(manifest['dimensionChoices'].get(dimension, [])) | set(values))
    manifest['analyticalSourceColumns'] = sorted(set(manifest['analyticalSourceColumns']) | set(receipt['analyticalSourceColumns']))
    manifest['method'].setdefault('stagedMonthlyImports', {})[month] = {
        'importer': receipt['importerVersion'],
        'sourceValues': 'Original restricted XLSX retained outside the public repository; aggregate cubes and an aggregate quality receipt only. No new private analytical Parquet or cross-month identifier store was produced.'}
    segments = sorted(s['segment'] for s in entry['scope'])
    audit = manifest['scopeAudit']
    for variant in audit['variants']:
        if sorted(variant['segments']) == segments:
            variant['months'].append(month)
            break
    else:
        audit['variants'].append({'segments': segments, 'months': [month]})
    audit['commonSegmentsAcrossLoadedMonths'] = sorted(set(audit['commonSegmentsAcrossLoadedMonths']) & set(segments))
    available = manifest['sourceAvailability']
    available.update(retrievalCheckedAt=now, verifiedDownloads=available['verifiedDownloads'] + 1,
                     expectedSourceFiles=available['expectedSourceFiles'] + 1)
    bd = manifest['bdClassification']
    bd['coveredMonths'].append(month)
    for key, value in receipt['bdCounts'].items():
        bd['totals'][key] += value
    bd['matchedWithoutCompleteClass'] += receipt['bdMatchedWithoutCompleteClass']
    extension = manifest['originExtension']
    extension['months'] += 1
    extension['sourceRows'] += entry['eligibleRows']
    extension['dimensionChoices'] = sorted(set(extension['dimensionChoices']) | set(receipt['originDimensionChoices']))
    for key, value in receipt['originCounts'].items():
        extension['originCounts'][key] = extension['originCounts'].get(key, 0) + value
    # Existing cross-file checks used private historical identifier hashes. A new
    # intra-month check cannot claim those private cross-month checks were rerun.
    cross = manifest['crossFileChecks']
    cross.update(status='partial', pendingMonths=cross.get('pendingMonths', []) + [month],
                 limitation='New month validated within its source; cross-month identifier checks require the restricted historical sources. No deduplication applied.')
    receipt_path = f'imports/{month}.json'
    entry['importReceiptPath'] = receipt_path
    public_receipt = {k: v for k, v in receipt.items() if k not in ['dimensionChoices', 'sourceColumns']}
    public_receipt.update(previousManifestSha256=hashlib.sha256(previous_bytes).hexdigest(),
                          crossMonthIdentifierChecks='pending; restricted historical sources unavailable')
    snapshot.update(generatedAt=now, marketManifest=manifest)
    for setting in snapshot['filters']:
        if setting['id'] == 'date':
            setting['defaultValue'] = month + '-01..' + entry['dateMax']
    queries = snapshot['queries']
    queries['coverage']['rows'] = manifest['months']
    queries['coverage']['source']['executedAt'] = now
    for dimension, values in {**manifest['dimensionChoices'], 'bd_origem': extension['dimensionChoices']}.items():
        if dimension == 'date':
            continue
        existing = {row[dimension] for row in queries['filter_choices']['rows'] if dimension in row}
        queries['filter_choices']['rows'].extend({dimension: value} for value in values if value not in existing)
    source = queries['registrations']['source']
    source['executedAt'] = now
    source['coverage']['endDate'] = entry['dateMax']
    source['sourceFiles'].append(entry['sourceName'])
    for source_path, target_path, _ in cubes:
        shutil.copyfile(source_path, target_path)
    save(root / 'data' / receipt_path, public_receipt)
    save(manifest_path, manifest)
    save(root / 'data/snapshot.json', snapshot)
    print(json.dumps({'appended': month, 'rows': entry['eligibleRows'], 'receipt': receipt_path}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staging', type=Path, required=True)
    append(parser.parse_args().staging)
