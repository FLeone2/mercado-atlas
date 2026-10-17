#!/usr/bin/env python3
"""Exploratory Moran diagnostics using verified IBGE geographic polygons.

Default: deterministic, network-free rebuild using the compact geographic receipt
embedded in the previous output. --refresh downloads the pinned official ZIP;
--source-zip imports the same hash-verified ZIP from a local path. The original
237 MB archive is deliberately not distributed with the web overlay.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import struct
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import scipy
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/scenarios/phase23_models.json'
OUTPUT = ROOT / 'data/scenarios/phase3_spatial.json'
SOURCE_URL = 'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/Brasil/BR_Municipios_2025.zip'
SOURCE_SHA256 = '840bbe6f73726ef9d1460ce49fdfe01a278935c41180d3c893e25ca21db083bd'
SOURCE_BYTES = 237062431
SCHEMA = 'phase3-spatial-1.0.0'
SEED = 20261015
PERMUTATIONS = 9999
PRIMARY_K = 8
SENSITIVITY_K = (4, 12)
EARTH_RADIUS_KM = 6371.0088
MAX_ASSET_BYTES = 25 * 1024 * 1024
RESULT_SPECS = (
    ('market_pearson', 'market', 'pearson', 'observed', 'expected'),
    ('market_deviance', 'market', 'deviance', 'observed', 'expected'),
    ('mit_pearson', 'mit', 'pearson', 'mitObserved', 'mitExpected'),
    ('mit_deviance', 'mit', 'deviance', 'mitObserved', 'mitExpected'),
)


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def dbf_records(raw):
    """Minimal DBF reader: fixed-width textual fields, no code execution."""
    if len(raw) < 33:
        raise ValueError('Truncated DBF header')
    count = struct.unpack_from('<I', raw, 4)[0]
    header_len, record_len = struct.unpack_from('<HH', raw, 8)
    if header_len < 33 or header_len + count * record_len > len(raw):
        raise ValueError('Truncated DBF records')
    fields, offset = [], 1
    for start in range(32, header_len - 1, 32):
        name = raw[start:start + 11].split(b'\0')[0].decode('ascii')
        length = raw[start + 16]
        fields.append((name, offset, length))
        offset += length
    if offset != record_len:
        raise ValueError('Unexpected DBF field widths')
    records = []
    for index in range(count):
        row = raw[header_len + index * record_len:header_len + (index + 1) * record_len]
        if row[:1] != b' ':
            raise ValueError('Deleted DBF record; alignment cannot be assumed')
        records.append({name: row[pos:pos + size].decode('utf-8').strip() for name, pos, size in fields})
    return records


def polygon_centroid(points, parts):
    """Signed planar lon/lat polygon centroid; holes/multipart use signed rings.

    These are derived geographic centroids, not official municipal seats and not
    a geodesic/area-preserving centroid. Distances subsequently use the sphere.
    """
    points = np.asarray(points, dtype=float)
    if points.ndim != 2 or points.shape[1] != 2 or len(points) < 4 or not np.isfinite(points).all():
        raise ValueError('Invalid polygon vertices')
    if not np.all((points[:, 0] >= -75) & (points[:, 0] <= -28) & (points[:, 1] >= -35) & (points[:, 1] <= 6)):
        raise ValueError('Polygon is not Brazilian longitude/latitude')
    if not parts or parts[0] != 0 or list(parts) != sorted(set(parts)) or parts[-1] >= len(points):
        raise ValueError('Invalid polygon ring offsets')
    origin = points[0].copy()
    shifted = points - origin
    total_cross, numerator = 0.0, np.zeros(2)
    for start, end in zip(parts, list(parts[1:]) + [len(points)]):
        ring = shifted[start:end]
        if len(ring) < 4 or not np.array_equal(ring[0], ring[-1]):
            raise ValueError('Polygon ring is not explicitly closed')
        a, b = ring[:-1], ring[1:]
        cross = a[:, 0] * b[:, 1] - b[:, 0] * a[:, 1]
        total_cross += float(cross.sum())
        numerator += ((a + b) * cross[:, None]).sum(axis=0)
    if abs(total_cross) < 1e-16:
        raise ValueError('Zero-area polygon')
    result = origin + numerator / (3 * total_cross)
    if not np.isfinite(result).all():
        raise ValueError('Non-finite polygon centroid')
    return result


def read_official_zip(path, retrieved_at=None):
    path = Path(path)
    if path.stat().st_size != SOURCE_BYTES or file_hash(path) != SOURCE_SHA256:
        raise ValueError('Official ZIP does not match the pinned 2025 IBGE byte count and SHA-256')
    with zipfile.ZipFile(path) as archive:
        base = 'BR_Municipios_2025'
        crs = archive.read(base + '.prj').decode('ascii')
        if 'SIRGAS_2000' not in crs or 'UNIT["Degree"' not in crs:
            raise ValueError('Expected geographic SIRGAS 2000, units degrees')
        records = dbf_records(archive.read(base + '.dbf'))
        centroids = []
        with archive.open(base + '.shp') as stream:
            header = stream.read(100)
            if len(header) != 100 or struct.unpack_from('>I', header)[0] != 9994 or struct.unpack_from('<I', header, 32)[0] != 5:
                raise ValueError('Expected ESRI Polygon shapefile')
            for index, record in enumerate(records):
                record_header = stream.read(8)
                if len(record_header) != 8:
                    raise ValueError('Missing SHP record')
                number, words = struct.unpack('>II', record_header)
                body = stream.read(words * 2)
                if number != index + 1 or len(body) != words * 2 or struct.unpack_from('<I', body)[0] != 5:
                    raise ValueError('SHP/DBF alignment or polygon type mismatch')
                n_parts, n_points = struct.unpack_from('<II', body, 36)
                if len(body) != 44 + n_parts * 4 + n_points * 16:
                    raise ValueError('Invalid polygon record size')
                parts = list(struct.unpack_from('<' + 'I' * n_parts, body, 44))
                points = np.frombuffer(body, dtype='<f8', offset=44 + 4 * n_parts).reshape(n_points, 2)
                lon, lat = polygon_centroid(points, parts)
                code, uf = record['CD_MUN'], record['SIGLA_UF']
                if not re.fullmatch(r'[1-5]\d{6}', code) or not re.fullmatch(r'[A-Z]{2}', uf):
                    raise ValueError('Unexpected official code or UF')
                centroids.append({'code': code, 'uf': uf, 'lon': float(lon), 'lat': float(lat), 'vertices': n_points, 'rings': n_parts})
            if stream.read(1):
                raise ValueError('Unmatched additional SHP records')
    centroids.sort(key=lambda row: row['code'])
    if len(centroids) != 5573 or len({r['code'] for r in centroids}) != len(centroids):
        raise ValueError('Expected 5,573 unique official 2025 geographic records')
    source = {
        'url': SOURCE_URL, 'sha256': SOURCE_SHA256, 'bytes': SOURCE_BYTES,
        'retrievedAt': retrieved_at or dt.datetime.now(dt.timezone.utc).isoformat(),
        'lastModified': 'Thu, 26 Feb 2026 20:02:48 GMT', 'geometryVintage': '2025',
        'crs': 'SIRGAS 2000 geographic, EPSG:4674, degrees', 'crsWkt': crs,
        'rawBundled': False, 'derivedCoordinatesBundled': True,
        'centroidMethod': 'Signed polygon centroid in longitude/latitude, weighting multipart rings and subtracting holes. Not an official municipal seat or geodesic centroid.',
        'centroidsSha256': sha256(canonical(centroids)), 'geometryRecords': len(centroids),
        'catalogueNote': 'IBGE 2025 has 5,569 municipalities, Brasília, Fernando de Noronha and two state operational water areas. Only seven-digit codes present in the fitted sample enter the diagnostic.',
    }
    return source, centroids


def validate_geographic_cache(source, centroids):
    if source.get('sha256') != SOURCE_SHA256 or source.get('url') != SOURCE_URL or source.get('bytes') != SOURCE_BYTES:
        raise ValueError('Cached source identity differs from pinned official source')
    if sha256(canonical(centroids)) != source.get('centroidsSha256'):
        raise ValueError('Cached derived geographic coordinates failed SHA-256 verification')
    if len(centroids) != source.get('geometryRecords') or len({r['code'] for r in centroids}) != len(centroids):
        raise ValueError('Duplicate or missing cached geographic codes')
    for row in centroids:
        if not re.fullmatch(r'[1-5]\d{6}', row['code']) or not math.isfinite(row['lon']) or not math.isfinite(row['lat']) or not -75 <= row['lon'] <= -28 or not -35 <= row['lat'] <= 6:
            raise ValueError('Invalid cached geographic coordinate')


def spherical_xyz(lonlat):
    lon, lat = np.radians(np.asarray(lonlat, dtype=float)).T
    return np.column_stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)))


def symmetric_knn(lonlat, k):
    """Union of directed kNN, using true spherical distance and stable index ties."""
    xyz = spherical_xyz(lonlat)
    n = len(xyz)
    if not isinstance(k, int) or not 0 < k < n:
        raise ValueError('k must be a positive integer less than sample size')
    tree = cKDTree(xyz)
    distances, _ = tree.query(xyz, k=k + 1)
    edges = set()
    for i in range(n):
        # Resolve all equal-distance ties by sorted input IBGE code order.
        candidates = tree.query_ball_point(xyz[i], float(distances[i, -1]) + 1e-12)
        candidates = [j for j in candidates if j != i]
        candidates.sort(key=lambda j: (float(np.sum((xyz[i] - xyz[j]) ** 2)), j))
        if len(candidates) < k:
            raise ValueError('Incomplete nearest-neighbor search')
        for j in candidates[:k]:
            edges.add((min(i, j), max(i, j)))
    edges = np.asarray(sorted(edges), dtype=np.int64)
    w = csr_matrix((np.ones(2 * len(edges)), (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(n, n))
    degree = np.asarray(w.sum(axis=1)).ravel()
    lengths = 2 * EARTH_RADIUS_KM * np.arcsin(np.minimum(1, np.linalg.norm(xyz[edges[:, 0]] - xyz[edges[:, 1]], axis=1) / 2))
    components, labels = connected_components(w, directed=False)
    diagnostics = {
        'method': 'symmetric_binary_spherical_knn_union',
        'label': f'União simétrica de {k} vizinhos por distância esférica entre centroides municipais IBGE 2025',
        'k': k, 'n': n, 'symmetric': (w != w.T).nnz == 0,
        'diagonalZero': bool(np.all(w.diagonal() == 0)), 'isolates': np.flatnonzero(degree == 0).tolist(),
        'undirectedEdges': len(edges), 's0': float(w.sum()), 'edges': edges.tolist(),
        'degree': {'min': int(degree.min()), 'median': float(np.median(degree)), 'max': int(degree.max()), 'mean': float(degree.mean())},
        'components': int(components), 'componentSizes': np.bincount(labels).tolist(),
        'distanceKm': {'min': float(lengths.min()), 'median': float(np.median(lengths)), 'p95': float(np.quantile(lengths, .95)), 'max': float(lengths.max()), 'over500Km': int(np.count_nonzero(lengths > 500))},
        'rowStandardized': False, 'indexContract': 'edges contain zero-based indices into coverage.codeOrder, each undirected edge exactly once',
        'edgeSha256': sha256(canonical(edges.tolist())),
    }
    if not diagnostics['symmetric'] or not diagnostics['diagonalZero'] or diagnostics['isolates']:
        raise ValueError('Invalid proximity matrix')
    return w, diagnostics


def residuals(observed, expected, kind):
    y, mu = np.asarray(observed, dtype=float), np.asarray(expected, dtype=float)
    if y.shape != mu.shape or not np.isfinite(y).all() or not np.isfinite(mu).all() or np.any(y < 0) or np.any(mu <= 0):
        raise ValueError('Residuals require finite nonnegative counts and strictly positive fitted means')
    if kind == 'pearson':
        return (y - mu) / np.sqrt(mu)
    if kind != 'deviance':
        raise ValueError('Unknown residual type')
    logterm = np.zeros_like(y)
    positive = y > 0
    logterm[positive] = y[positive] * np.log(y[positive] / mu[positive])
    return np.sign(y - mu) * np.sqrt(np.maximum(0, 2 * (logterm - y + mu)))


def moran(z, w):
    z = np.asarray(z, dtype=float)
    z = z - z.mean(axis=0)
    if z.ndim == 1:
        denominator = np.sum(z * z)
        if denominator <= 1e-24:
            raise ValueError('Moran I is undefined for constant residuals')
        return float(len(z) / w.sum() * np.sum(z * (w @ z)) / denominator)
    denominator = np.sum(z * z, axis=0)
    if np.any(denominator <= 1e-24):
        raise ValueError('Moran I is undefined for constant residuals')
    return len(z) / w.sum() * np.sum(z * (w @ z), axis=0) / denominator


def conditional_expectation(z, w, groups):
    """Exact Moran expectation under independent uniform permutations within UF."""
    z = np.asarray(z, dtype=float)
    if z.ndim == 1:
        z = z[:, None]
    z = z - z.mean(axis=0)
    means = np.zeros_like(z)
    correction = np.zeros(z.shape[1])
    for group in groups:
        values = z[group]
        m = values.mean(axis=0)
        means[group] = m
        if len(group) > 1:
            pair_mean = (values.sum(axis=0) ** 2 - (values * values).sum(axis=0)) / (len(group) * (len(group) - 1))
            correction += float(w[group][:, group].sum()) * (pair_mean - m * m)
    numerator = (means * (w @ means)).sum(axis=0) + correction
    return len(z) / w.sum() * numerator / (z * z).sum(axis=0)


def permutation_diagnostics(z, matrices, groups, count=PERMUTATIONS, seed=SEED):
    if count < 1:
        raise ValueError('At least one permutation is required')
    z = np.asarray(z, dtype=float)
    z = z - z.mean(axis=0)
    n, columns = z.shape
    if sorted(np.concatenate(groups).tolist()) != list(range(n)):
        raise ValueError('Permutation groups must partition the sample exactly once')
    rng = np.random.default_rng(seed)
    observed = [moran(z, w) for w in matrices]
    centers = [conditional_expectation(z, w, groups) for w in matrices]
    sampled = [np.empty((count, columns)) for _ in matrices]
    denominator = (z * z).sum(axis=0)
    batch_size = 48
    for start in range(0, count, batch_size):
        batch = min(batch_size, count - start)
        indices = np.broadcast_to(np.arange(n), (batch, n)).copy()
        for b in range(batch):
            for group in groups:
                indices[b, group] = rng.permutation(group)
        values = z[indices].transpose(1, 0, 2).reshape(n, batch * columns)
        for m, w in enumerate(matrices):
            values_i = (values * (w @ values)).sum(axis=0).reshape(batch, columns)
            sampled[m][start:start + batch] = n / w.sum() * values_i / denominator
    results = []
    for obs, center, sims in zip(observed, centers, sampled):
        extreme = (np.abs(sims - center) >= np.abs(obs - center) - 1e-14).sum(axis=0)
        p = (extreme + 1) / (count + 1)
        results.append([{
            'moranI': float(obs[j]), 'expectedI': float(center[j]),
            'unrestrictedExpectedI': -1 / (n - 1),
            'permutationMean': float(sims[:, j].mean()), 'permutationStd': float(sims[:, j].std(ddof=1)) if count > 1 else None,
            'pValue': float(p[j]), 'extremePermutations': int(extreme[j]),
            'permutations': count, 'minimumPValue': 1 / (count + 1),
            'monteCarloStandardError': float(np.sqrt(p[j] * (1 - p[j]) / (count + 1))),
            'nullInterval95': [float(x) for x in np.quantile(sims[:, j], [.025, .975])],
        } for j in range(columns)])
    return results


def holm(values):
    p = np.asarray(values, dtype=float)
    order = np.argsort(p, kind='stable')
    adjusted = np.empty(len(p))
    adjusted[order] = np.minimum(1, np.maximum.accumulate(p[order] * np.arange(len(p), 0, -1)))
    return adjusted.tolist()


def build(model, source, centroids, input_sha256, count=PERMUTATIONS, seed=SEED):
    validate_geographic_cache(source, centroids)
    rows = sorted(model['regional']['rows'], key=lambda row: row['code'])
    if len({row['code'] for row in rows}) != len(rows):
        raise ValueError('Duplicate fitted municipality codes')
    geographic = {row['code']: row for row in centroids}
    missing = [row['code'] for row in rows if row['code'] not in geographic]
    rows = [row for row in rows if row['code'] in geographic]
    if len(rows) <= max(SENSITIVITY_K):
        raise ValueError('Insufficient matched municipalities')
    if any(row['uf'] != geographic[row['code']]['uf'] for row in rows):
        raise ValueError('Model and official geometry UF mismatch')
    coordinates = [(geographic[row['code']]['lon'], geographic[row['code']]['lat']) for row in rows]
    groups = [np.array([i for i, row in enumerate(rows) if row['uf'] == uf], dtype=int) for uf in sorted({r['uf'] for r in rows})]
    z = np.column_stack([residuals([r[obs] for r in rows], [r[exp] for r in rows], kind) for _, _, kind, obs, exp in RESULT_SPECS])
    z -= z.mean(axis=0)
    matrices, weights = zip(*(symmetric_knn(coordinates, k) for k in (PRIMARY_K, *SENSITIVITY_K)))
    all_results = permutation_diagnostics(z, matrices, groups, count, seed)
    adjusted = iter(holm([r['pValue'] for results in all_results for r in results]))
    for m, results in enumerate(all_results):
        for j, (result, spec) in enumerate(zip(results, RESULT_SPECS)):
            key, outcome, kind, _, _ = spec
            result.update(key=key, outcome=outcome, residual=kind, n=len(rows), pAdjustedHolm=next(adjusted))
            if m == 0:
                standardized = z[:, j] / np.sqrt(np.mean(z[:, j] ** 2))
                lag = matrices[m] @ standardized / weights[m]['degree']['mean']
                result['scatterRows'] = [{'code': row['code'], 'name': row['name'], 'uf': row['uf'], 'standardizedResidual': float(standardized[i]), 'spatialLag': float(lag[i])} for i, row in enumerate(rows)]
    return {
        'schemaVersion': SCHEMA, 'status': 'available_exploratory',
        'source': source, 'input': {'path': 'data/scenarios/phase23_models.json', 'sha256': input_sha256, 'period': model['regional']['period'], 'rows': len(model['regional']['rows']), 'sourceAsOf': model.get('sourceAsOf')},
        'coverage': {'fittedMunicipalities': len(model['regional']['rows']), 'geometryMunicipalities': len(centroids), 'matchedMunicipalities': len(rows), 'excludedCodes': missing, 'geometryCodesOutsideModel': sorted(set(geographic) - {r['code'] for r in rows}), 'codeOrder': [r['code'] for r in rows]},
        'weights': weights[0],
        'permutation': {'count': count, 'seed': seed, 'generator': 'numpy.default_rng PCG64', 'scheme': 'within_uf', 'groups': [{'uf': rows[group[0]]['uf'], 'n': len(group)} for group in groups], 'alternative': 'two_sided_centered_permutation', 'pValueFormula': '(1 + number of |I_perm − E_UF[I]| >= |I_observed − E_UF[I]|) / (B + 1)', 'expectedIDefinition': 'Exact conditional expectation under independent permutations within each UF, retaining global residual centering. This is generally not −1/(n−1).', 'multipleTesting': 'Holm family-wise adjustment over all 12 prespecified diagnostics: 2 outcomes × 2 residuals × 3 k values. No selection of the most favorable matrix.', 'scatterDefinition': 'z uses global population-standard-deviation scaling; spatialLag = binary Wz / mean degree, so the zero-intercept Moran scatter slope equals I. This is not a row-standardized local lag.', 'calibration': 'Exploratory randomization reference only; residual exchangeability is not guaranteed for fitted overdispersed Poisson models.'},
        'results': all_results[0],
        'sensitivity': [{'k': weights[i]['k'], 'weights': weights[i], 'results': all_results[i]} for i in range(1, len(weights))],
        'geography': {'centroids': centroids},
        'interpretation': 'Moran I measures residual similarity under the declared proximity matrix. Statistical evidence does not identify a causal mechanism or choose SAR/SEM. Non-significance does not prove independence.',
        'limitations': [
            'Exploratory in-sample residual diagnostic; not an independent regional prediction validation, causal test, or automatic SAR/SEM specification decision.',
            'Poisson residuals can be nonexchangeable because of heterogeneous means, leverage, misspecification and overdispersion. Within-UF permutations retain state composition but do not fix these problems; p-values are descriptive randomization references.',
            'Municipal proximity is defined by symmetric binary spherical k-nearest-neighbor links, not border contiguity, roads, flows or travel time. No state-local SVG coordinates are used.',
            'Derived planar longitude/latitude polygon centroids are not official municipal seats and can lie outside irregular or multipart municipalities; distances are spherical approximations, especially relevant for large northern municipalities and ocean islands.',
            'kNN includes long-distance links rather than dropping islands. Matrix distance summaries disclose this; sensitivity k=4 and k=12 does not establish robustness to every weight definition.',
            'The 2025 geographic vintage and the 2026 fitted sample can differ. Unmatched model codes are excluded and listed; geography-only codes are not silently imputed to zero registrations.',
            'Market and MIT share the fitted sample and covariates; Pearson and deviance diagnostics are related. Holm adjustment covers the complete 12-test family, not independent tests.',
            'Monte Carlo p-values have finite resolution and uncertainty; all outcomes and matrices use the same within-UF permutations and fixed seed.',
            'The full 237 MB official ZIP is not bundled. Compact derived coordinates, the exact source SHA-256 and the reproducible parser are bundled; offline runs verify the compact coordinate hash before rebuilding weights.',
        ],
        'provenance': {'script': 'scripts/phase3_spatial.py', 'numpyVersion': np.__version__, 'scipyVersion': scipy.__version__, 'phase4Activated': False, 'sarSemFitted': False, 'geometryDownloadApiFailures': [{'url': 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/json&qualidade=intermediaria&intrarregiao=municipio', 'error': 'HTTP 502 on 2026-10-16; official IBGE static ZIP used instead'}], 'references': ['https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/15774-malhas.html', 'https://r-spatial.github.io/spdep/reference/moran.html', 'https://r-spatial.github.io/spdep/reference/moran.mc.html', 'https://pysal.org/esda/stable/user-guide/global_morans_i.html']},
    }


def blocked(model, input_hash, error):
    return {'schemaVersion': SCHEMA, 'status': 'blocked', 'reason': str(error), 'input': {'path': 'data/scenarios/phase23_models.json', 'sha256': input_hash, 'rows': len(model.get('regional', {}).get('rows', []))}, 'source': {'url': SOURCE_URL, 'sha256': SOURCE_SHA256, 'bytes': SOURCE_BYTES, 'rawBundled': False}, 'results': [], 'sensitivity': [], 'limitations': ['No usable spatial diagnostic was produced; no Moran statistic or p-value is manufactured.'], 'provenance': {'script': 'scripts/phase3_spatial.py', 'phase4Activated': False, 'sarSemFitted': False}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Download and parse the pinned official national municipal ZIP (237 MB)')
    parser.add_argument('--source-zip', type=Path, help='Import a previously downloaded ZIP; pinned SHA-256 and byte count required')
    parser.add_argument('--retrieved-at', help='Verified download timestamp for --source-zip')
    parser.add_argument('--permutations', type=int, default=PERMUTATIONS)
    parser.add_argument('--seed', type=int, default=SEED)
    args = parser.parse_args()
    raw = INPUT.read_bytes()
    model = json.loads(raw)
    try:
        if args.refresh and args.source_zip:
            raise ValueError('Choose --refresh or --source-zip, not both')
        if args.refresh:
            with tempfile.TemporaryDirectory(prefix='phase3-spatial-') as folder:
                path = Path(folder) / 'BR_Municipios_2025.zip'
                with urllib.request.urlopen(SOURCE_URL, timeout=120) as response, path.open('wb') as target:
                    for chunk in iter(lambda: response.read(1024 * 1024), b''):
                        target.write(chunk)
                source, centroids = read_official_zip(path)
        elif args.source_zip:
            source, centroids = read_official_zip(args.source_zip, args.retrieved_at)
        else:
            previous = json.loads(OUTPUT.read_bytes())
            source, centroids = previous['source'], previous['geography']['centroids']
        result = build(model, source, centroids, sha256(raw), args.permutations, args.seed)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        result = blocked(model, sha256(raw), error)
    encoded = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False).encode() + b'\n'
    if len(encoded) > MAX_ASSET_BYTES:
        raise ValueError('Spatial artifact exceeds 25 MiB delivery budget')
    OUTPUT.write_bytes(encoded)
    print(json.dumps({'status': result['status'], 'bytes': len(encoded), 'coverage': {k: v for k, v in result.get('coverage', {}).items() if k not in ('codeOrder', 'geometryCodesOutsideModel', 'excludedCodes')}, 'results': [{k: v for k, v in row.items() if k != 'scatterRows'} for row in result['results']], 'reason': result.get('reason')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
