#!/usr/bin/env python3
"""Exact-scope grouped forecasts: Brazil/UF crossed with MIT/non-MIT.

Run: python scripts/phase3_hierarchy.py --repo .
Only immutable original registration cubes are used. No future exogenous data.
"""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.linalg import solve_triangular
from scipy.optimize import nnls


ROOT = Path(__file__).resolve().parents[1]
UF_CODES = tuple('AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split())
UNKNOWN = 'UNKNOWN'
COMPONENTS = ('total', 'mit', 'nonMit')
HORIZONS = (3, 6, 12)
INITIAL_TRAINING = 60
INNER_TRAINING = 36
SHRINKAGE = .5
RIDGE = 1e-6
MODELS = {
    'seasonal_naive_bottom_up': {
        'label': 'Sazonal ingênuo bottom-up', 'coherent': True, 'eligibleForSelection': True,
        'description': 'Repeat each disjoint UF × brand-complement count from twelve months earlier, then sum.'},
    'seasonal_growth_bottom_up': {
        'label': 'AR sazonal bottom-up', 'coherent': True, 'eligibleForSelection': True,
        'description': 'Fit seasonal log1p-growth AR(1) independently to each bottom series, then sum.'},
    'seasonal_growth_base_unreconciled': {
        'label': 'AR sazonal independente (sem reconciliação)', 'coherent': False, 'eligibleForSelection': False,
        'description': 'Independent seasonal log1p-growth AR(1) fits at all nodes; diagnostic benchmark only.'},
    'mint_shrink_nonnegative': {
        'label': 'MinT-shrink não negativo', 'coherent': True, 'eligibleForSelection': True,
        'description': 'Independent all-node base forecasts reconciled by shrinkage-covariance weighted least squares with nonnegative bottom counts.'},
}


def safe(value):
    if isinstance(value, dict): return {k: safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [safe(v) for v in value]
    if isinstance(value, np.ndarray): return safe(value.tolist())
    if isinstance(value, (np.floating, float)):
        if not np.isfinite(value): raise ValueError('Nonfinite output must not be published')
        return float(value)
    if isinstance(value, np.integer): return int(value)
    if isinstance(value, np.bool_): return bool(value)
    return value


def load(path):
    return json.loads(path.read_text())


def add_month(month, delta):
    year, mo = map(int, month.split('-'))
    value = year * 12 + mo - 1 + delta
    return f'{value // 12:04d}-{value % 12 + 1:02d}'


def summing_structure(geographies):
    """Full column rank crossed grouping; each leaf belongs to exactly one UF/brand."""
    bottom = [(geo, part) for geo in geographies for part in ('mit', 'nonMit')]
    nodes = []
    rows = []
    for geo in ('BR', *geographies):
        for part in COMPONENTS:
            nodes.append({'key': f'{geo}:{part}', 'geo': geo, 'component': part,
                          'label': f'{"Brasil" if geo == "BR" else "UF não informada" if geo == UNKNOWN else geo} · {dict(total="Mercado", mit="Mitsubishi", nonMit="Não Mitsubishi")[part]}',
                          'level': 'national' if geo == 'BR' else 'uf'})
            rows.append([int((geo == 'BR' or geo == g) and (part == 'total' or part == p)) for g, p in bottom])
    return nodes, [f'{g}:{p}' for g, p in bottom], np.array(rows, dtype=float)


def load_source_history(repo=ROOT):
    """Read every origin cube, verify compressed digest, preserve all source rows."""
    data = repo / 'data'
    manifest = load(data / 'manifest.json')
    monthly = {r['month']: r for r in load(data / 'scenarios/monthly.json')['rows']}
    receipts = sorted(manifest['months'], key=lambda r: r['month'])
    months = [r['month'] for r in receipts]
    if months != manifest['expectedMonths'] or manifest['missingMonths']:
        raise ValueError('Complete ordered monthly source coverage is required')
    observations = []
    source_audit = []
    unknown_labels = collections.Counter()
    observed_brand_labels = collections.Counter()
    for receipt in receipts:
        raw = (data / receipt['originCubePath']).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != receipt['originCubeSha256']:
            raise ValueError(f'Origin cube digest mismatch: {receipt["month"]}')
        cube = json.loads(gzip.decompress(raw))
        if cube['month'] != receipt['month']:
            raise ValueError('Cube month differs from manifest receipt')
        cols = {key: i for i, key in enumerate(cube['columns'])}
        dictionaries = cube['dictionaries']
        uf_values = dictionaries['uf']
        uf_mapping = [uf if uf in UF_CODES else UNKNOWN for uf in uf_values]
        mit_mapping = [str(brand).strip().upper() == 'MITSUBISHI' for brand in dictionaries['marca']]
        scope = [segment in ('Auto', 'Comercial Leve') for segment in dictionaries['segmento']]
        uf_col, brand_col, segment_col, count_col = [cols[k] for k in ('uf', 'marca', 'segmento', 'count')]
        counts = collections.Counter()
        excluded = 0
        for row in cube['rows']:
            count = row[count_col]
            if not isinstance(count, int) or count < 0:
                raise ValueError('Registration counts must be nonnegative integers')
            if not scope[row[segment_col]]:
                excluded += count
                continue
            geo = uf_mapping[row[uf_col]]
            mit = mit_mapping[row[brand_col]]
            counts[(geo, 'mit' if mit else 'nonMit')] += count
            if geo == UNKNOWN: unknown_labels[str(uf_values[row[uf_col]])] += count
            if mit: observed_brand_labels[str(dictionaries['marca'][row[brand_col]])] += count
        total = sum(counts.values())
        mit_total = sum(n for (geo, part), n in counts.items() if part == 'mit')
        expected = monthly[receipt['month']]
        if total != receipt['lightVehicleRows'] or total != expected['registrations'] or mit_total != expected['mitsubishi']:
            raise ValueError(f'Source conservation failed for {receipt["month"]}')
        observations.append(counts)
        source_audit.append({'month': receipt['month'], 'path': receipt['originCubePath'], 'sha256': digest,
                             'sourceTotal': total, 'sourceMitsubishi': mit_total,
                             'manifestLightVehicleRows': receipt['lightVehicleRows'],
                             'unknownUfRows': sum(n for (geo, _), n in counts.items() if geo == UNKNOWN),
                             'excludedOutsideScope': excluded, 'conserved': True})
    geographies = list(UF_CODES) + ([UNKNOWN] if unknown_labels else [])
    nodes, bottom_keys, summing = summing_structure(geographies)
    bottom_values = np.asarray([[count[tuple(key.split(':'))] for key in bottom_keys] for count in observations], float)
    history = bottom_values @ summing.T
    audit = {'months': len(months), 'coverageStart': months[0], 'coverageEnd': months[-1],
             'manifestSha256': hashlib.sha256((data / 'manifest.json').read_bytes()).hexdigest(),
             'monthlyReferenceSha256': hashlib.sha256((data / 'scenarios/monthly.json').read_bytes()).hexdigest(),
             'allMonthsConserved': True, 'receipts': source_audit,
             'unknownUfRows': sum(unknown_labels.values()), 'unknownUfSourceLabels': dict(unknown_labels),
             'mitsubishiSourceLabels': dict(observed_brand_labels),
             'totalRows': int(np.sum(history[:, 0])), 'mitsubishiRows': int(np.sum(history[:, 1]))}
    return months, nodes, bottom_keys, summing, history, audit


def base_forecast(history, origin, horizon=12):
    """Independent ridge AR(1) fits to each node's log1p seasonal growth.

    No input at origin or later is read. Slopes use a fixed unit ridge penalty;
    no intercept penalty. Nonnegative base counts use max(0, expm1(log level)).
    """
    if origin < INNER_TRAINING or not 1 <= horizon <= 12: raise ValueError('Invalid forecasting window')
    logged = np.log1p(np.asarray(history[:origin], float))
    seasonal_growth = logged[12:] - logged[:-12]
    x, y = seasonal_growth[:-1], seasonal_growth[1:]
    x_mean, y_mean = x.mean(axis=0), y.mean(axis=0)
    centered = x - x_mean
    slope = np.sum(centered * (y - y_mean), axis=0) / (np.sum(centered ** 2, axis=0) + 1.)
    intercept = y_mean - slope * x_mean
    previous = seasonal_growth[-1]
    path = []
    for h in range(horizon):
        previous = intercept + slope * previous
        point = np.maximum(0., np.expm1(logged[origin - 12 + h] + previous))
        path.append(point)
    result = np.asarray(path)
    if not np.isfinite(result).all(): raise ValueError('Invalid base forecast')
    return result


def training_covariance(history, origin, residual_cache=None):
    """Rolling one-step residuals whose outcome months are strictly < origin."""
    if origin <= INNER_TRAINING + 1: raise ValueError('Not enough covariance observations')
    if residual_cache is None:
        errors = np.asarray([history[t] - base_forecast(history, t, 1)[0] for t in range(INNER_TRAINING, origin)])
    else:
        errors = np.asarray([residual_cache[t] for t in range(INNER_TRAINING, origin)])
    covariance = np.cov(errors, rowvar=False, ddof=1)
    diagonal = np.diag(covariance)
    covariance = (1 - SHRINKAGE) * covariance + SHRINKAGE * np.diag(diagonal)
    covariance += np.diag(RIDGE * np.maximum(diagonal, 1.))
    return covariance, {'nResidualMonths': len(errors), 'firstResidualIndex': INNER_TRAINING,
                        'lastResidualIndex': origin - 1, 'maximumTrainingIndex': origin - 1,
                        'shrinkageToDiagonal': SHRINKAGE, 'relativeDiagonalRidge': RIDGE,
                        'minimumEigenvalue': float(np.linalg.eigvalsh(covariance)[0])}


def reconcile_nonnegative(base, summing, covariance):
    """Minimize (S b - base)' W^-1 (S b - base), b >= 0.

    Equal to linear MinT when its leaves are nonnegative. Otherwise solves
    the constrained quadratic projection; never clips aggregates separately.
    Column scaling improves numerical stability without changing the objective.
    """
    cholesky = np.linalg.cholesky(covariance)
    a = solve_triangular(cholesky, summing, lower=True, check_finite=False)
    targets = solve_triangular(cholesky, np.asarray(base).T, lower=True, check_finite=False).T
    norms = np.linalg.norm(a, axis=0)
    normalized = a / norms
    unconstrained = np.linalg.lstsq(normalized, targets.T, rcond=None)[0].T / norms
    leaves = []
    constrained = 0
    for target, candidate in zip(targets, unconstrained):
        if np.min(candidate) >= 0.:
            leaves.append(candidate)
        else:
            optimum, _ = nnls(normalized, target, maxiter=100 * normalized.shape[1])
            leaves.append(optimum / norms)
            constrained += 1
    reconciled = np.asarray(leaves) @ summing.T
    return reconciled, {'nonnegativeConstrainedSteps': constrained,
                         'maxAbsoluteBaseAdjustment': float(np.max(np.abs(reconciled - base))),
                         'meanAbsoluteBaseAdjustment': float(np.mean(np.abs(reconciled - base)))}


def coherence_errors(path, nodes, geographies):
    values = np.atleast_2d(path)
    indices = {node['key']: i for i, node in enumerate(nodes)}
    national = max(float(np.max(np.abs(values[:, indices[f'BR:{part}']] - sum(values[:, indices[f'{geo}:{part}']] for geo in geographies)))) for part in COMPONENTS)
    composition = max(float(np.max(np.abs(values[:, indices[f'{geo}:total']] - values[:, indices[f'{geo}:mit']] - values[:, indices[f'{geo}:nonMit']]))) for geo in ('BR', *geographies))
    return {'maxNationalMinusUfSum': national, 'maxTotalMinusMitAndNonMit': composition,
            'minimumPrediction': float(np.min(values))}


def forecast_candidates(history, origin, summing, bottom_indices, residual_cache=None):
    base = base_forecast(history, origin)
    covariance, covariance_audit = training_covariance(history, origin, residual_cache)
    reconciled, reconciliation_audit = reconcile_nonnegative(base, summing, covariance)
    naive_bottom = history[origin - 12:origin, bottom_indices]
    paths = {
        'seasonal_naive_bottom_up': naive_bottom @ summing.T,
        'seasonal_growth_bottom_up': base[:, bottom_indices] @ summing.T,
        'seasonal_growth_base_unreconciled': base,
        'mint_shrink_nonnegative': reconciled,
    }
    return paths, {**covariance_audit, **reconciliation_audit}


def summarize_errors(actual, predicted, scales, node_indices):
    """Pool equal node/origin/step observations; MASE excludes zero scales."""
    actual = actual[:, :, node_indices]
    predicted = predicted[:, :, node_indices]
    scales = scales[:, node_indices]
    def one(steps):
        difference = (predicted - actual)[:, steps, :]
        if difference.ndim == 2: difference = difference[:, None, :]
        expanded_scale = np.broadcast_to(scales[:, None, :], difference.shape)
        valid = expanded_scale > 0.
        return {'mae': float(np.mean(np.abs(difference))), 'rmse': float(np.sqrt(np.mean(difference ** 2))),
                'mase': float(np.mean(np.abs(difference[valid]) / expanded_scale[valid])) if valid.any() else None,
                'bias': float(np.mean(difference)), 'nPredictions': int(difference.size),
                'nOrigins': int(difference.shape[0]), 'nNodes': int(difference.shape[-1]),
                'nScaledPredictions': int(valid.sum())}
    return {**one(slice(None)), 'byHorizon': [{'horizon': h, **one(slice(0, h))} for h in HORIZONS],
            'atHorizon': [{'horizon': h, **one(h - 1)} for h in HORIZONS]}


def group_metrics(actual, predicted, scales, nodes):
    return {
        'allNodes': summarize_errors(actual, predicted, scales, list(range(len(nodes)))),
        'national': {part: summarize_errors(actual, predicted, scales, [i for i, node in enumerate(nodes) if node['level'] == 'national' and node['component'] == part]) for part in COMPONENTS},
        'ufAggregate': {part: summarize_errors(actual, predicted, scales, [i for i, node in enumerate(nodes) if node['level'] == 'uf' and node['component'] == part]) for part in COMPONENTS},
        'perNode': {node['key']: summarize_errors(actual, predicted, scales, [i]) for i, node in enumerate(nodes)},
    }


def build(repo=ROOT):
    months, nodes, bottom_keys, summing, history, source_audit = load_source_history(repo)
    keys = [node['key'] for node in nodes]
    bottom_indices = [keys.index(key) for key in bottom_keys]
    geographies = [node['geo'] for node in nodes if node['level'] == 'uf' and node['component'] == 'total']
    n = len(months)
    validation_origins = list(range(INITIAL_TRAINING, n - 24 - 12 + 1))
    test_origins = list(range(n - 24, n - 12 + 1))
    if len(validation_origins) < 24 or len(test_origins) < 12: raise ValueError('Insufficient complete folds')
    cache = {t: history[t] - base_forecast(history, t, 1)[0] for t in range(INNER_TRAINING, n)}
    forecast_sets, summaries, covariance_audits, coherence_audits = {}, {}, [], {}
    for split, origins in (('validation', validation_origins), ('test', test_origins)):
        actual = np.asarray([history[origin:origin + 12] for origin in origins])
        scales = np.asarray([np.mean(np.abs(history[12:origin] - history[:origin - 12]), axis=0) for origin in origins])
        forecasts = {model: [] for model in MODELS}
        for origin in origins:
            paths, audit = forecast_candidates(history, origin, summing, bottom_indices, cache)
            covariance_audits.append({'split': split, 'origin': months[origin - 1], 'originIndex': origin,
                                      'lastResidualMonth': months[origin - 1], **audit})
            for model, path in paths.items(): forecasts[model].append(path)
        forecasts = {model: np.asarray(paths) for model, paths in forecasts.items()}
        forecast_sets[split] = forecasts
        summaries[split] = {model: group_metrics(actual, predicted, scales, nodes) for model, predicted in forecasts.items()}
        coherence_audits[split] = {model: coherence_errors(predicted.reshape(-1, len(nodes)), nodes, geographies) for model, predicted in forecasts.items()}
    eligible = [model for model in MODELS if MODELS[model]['eligibleForSelection']]
    selected = min(eligible, key=lambda model: summaries['validation'][model]['allNodes']['mase'])
    future, future_audit = forecast_candidates(history, n, summing, bottom_indices, cache)
    covariance_audits.append({'split': 'future', 'origin': months[-1], 'originIndex': n,
                              'lastResidualMonth': months[-1], **future_audit})
    coherence_audits['future'] = {model: coherence_errors(path, nodes, geographies) for model, path in future.items()}
    def node_dict(row): return dict(zip(keys, map(float, row)))
    def predictions_for(model):
        return [{'origin': months[origin - 1], 'originIndex': origin, 'month': months[origin + h], 'horizon': h + 1,
                 'actual': node_dict(history[origin + h]), 'predicted': node_dict(forecast_sets['test'][model][i, h])}
                for i, origin in enumerate(test_origins) for h in range(12)]
    def future_rows(model):
        return [{'month': add_month(months[-1], h + 1), 'horizon': h + 1, 'nodes': node_dict(row)} for h, row in enumerate(future[model])]
    result = {
        'schemaVersion': 'phase3-hierarchy-1.0.0', 'unit': 'registrations',
        'unitDefinition': 'Original source registration rows; duplicates retained, not deduplicated vehicles. Forecasts are expected counts, not rounded integers.',
        'scope': ['Auto', 'Comercial Leve'], 'qualityStatus': 'experimental_retrospective', 'validationPassed': False,
        'geography': {'states': geographies, 'unknownKey': UNKNOWN if UNKNOWN in geographies else None,
                      'unknownRule': 'Any source UF outside the exact 27-code whitelist is kept in UNKNOWN, never dropped or allocated to a state.'},
        'brandRule': 'Source marca stripped and uppercased equals MITSUBISHI exactly; nonMit is the exhaustive complement, including unclassified brands. Never inferred from model name.',
        'nodes': nodes, 'bottomKeys': bottom_keys, 'summingMatrix': summing.astype(int).tolist(),
        'sourceAudit': source_audit,
        'history': [{'month': month, 'nodes': node_dict(row)} for month, row in zip(months, history)],
        'models': MODELS, 'selectedModel': selected,
        'selection': {'criterion': 'Lowest validation allNodes MASE among coherent candidates only; equal node/origin/horizon weights for nonzero seasonal scales.',
                      'excludedCandidate': 'seasonal_growth_base_unreconciled',
                      'selectedUsingTest': False, 'eligibleCandidates': eligible},
        'validation': summaries['validation'], 'test': summaries['test'],
        'selectedTestPredictions': predictions_for(selected),
        'candidateTestPredictions': {model: predictions_for(model) for model in MODELS},
        'futureForecasts': future_rows(selected), 'futureBaseForecasts': future_rows('seasonal_growth_base_unreconciled'),
        'candidateFutureForecasts': {model: future_rows(model) for model in MODELS},
        'reconciliationAudit': {'history': coherence_errors(history, nodes, geographies),
                                **coherence_audits, 'covarianceFits': covariance_audits,
                                'nonnegativeConstrainedSteps': sum(a['nonnegativeConstrainedSteps'] for a in covariance_audits)},
        'comparison': {'selectedTestBeatsSeasonalNaiveMase': summaries['test'][selected]['allNodes']['mase'] < summaries['test']['seasonal_naive_bottom_up']['allNodes']['mase'],
                       'mintTestBeatsSeasonalNaiveMase': summaries['test']['mint_shrink_nonnegative']['allNodes']['mase'] < summaries['test']['seasonal_naive_bottom_up']['allNodes']['mase'],
                       'mintTestBeatsUnreconciledMase': summaries['test']['mint_shrink_nonnegative']['allNodes']['mase'] < summaries['test']['seasonal_growth_base_unreconciled']['allNodes']['mase']},
        'protocol': {
            'initialTrainingMonths': INITIAL_TRAINING, 'innerCovarianceInitialTrainingMonths': INNER_TRAINING,
            'validationOrigins': [months[i - 1] for i in validation_origins], 'testOrigins': [months[i - 1] for i in test_origins],
            'nValidationOrigins': len(validation_origins), 'nTestOrigins': len(test_origins),
            'validationTargetRange': [months[validation_origins[0]], months[validation_origins[-1] + 11]],
            'testTargetRange': [months[test_origins[0]], months[test_origins[-1] + 11]],
            'horizons': list(HORIZONS), 'forecastPathLength': 12,
            'evaluation': 'Expanding rolling origin with complete common 12-step paths. byHorizon pools steps 1..H; atHorizon measures step H only.',
            'biasSign': 'positive = overprediction; predicted minus actual',
            'maseDenominator': 'Each node and origin uses mean |y[t]-y[t-12]| inside its own training window. Zero denominators are excluded from MASE, retained in MAE/bias.',
            'covariance': 'Expanding one-step out-of-fold residuals with outcome dates strictly before each forecast origin. Fixed 50% shrinkage toward diagonal plus 1e-6 diagonal ridge; same covariance shape at all horizons.',
            'covarianceForecastWindow': 'Each residual at index t is actual[t] minus an independent base forecast trained on [0,t). Residual t is included only when t < origin.',
            'reconciliation': 'Solve min b>=0 (S b - base)^T W^-1 (S b - base). Without active bounds this is MinT; active bounds give a nonlinear nonnegative weighted projection.',
            'modelFamily': 'Separate regularized seasonal-growth AR(1) on log1p counts for each node, with fixed slope ridge 1.0. Not a SARIMAX or macro model.',
            'exogenousData': 'None. Neither future macro observations nor realized future regional shares are used.',
            'intervals': 'Not estimated for this hierarchy; no calibrated probabilistic reconciliation or coverage claim.',
            'testFreshness': 'The historical test period has been inspected in earlier project work; retrospective and pseudo-out-of-sample, not a new independent or real-time-vintage test.',
            'originDependence': 'Overlapping forecast targets induce dependent errors; prediction counts are not independent sample sizes.',
        },
        'limitations': [
            'This grouped forecast is a separate candidate family. It does not reconcile or replace the independently selected national SARIMAX/share forecasts.',
            'Shrinkage strength and ridge are fixed design choices, not optimally estimated or tuned on test data. The short residual window makes covariance uncertain.',
            'The one-step covariance shape is reused at horizons 1–12; horizon-specific covariance is not estimated.',
            'Nonnegative constrained projection differs from linear MinT whenever a bound is active; no universal accuracy improvement is assumed.',
            'All counts reconcile to Brazil including unknown UF. Unknown UF is an explicit accounting bucket, not a 28th Brazilian state.',
            'No hierarchical prediction intervals or interval coverage estimates are supplied.',
            'Current source vintage and past test-period inspection limit the result to retrospective experimentation; no operational validation or causal conclusion.',
            'No municipal, vehicle-segment, sales-channel, rental-company or model hierarchy is forecast in this phase.',
        ],
        'methodSources': [
            {'title': 'Wickramasuriya, Athanasopoulos and Hyndman (2019), Optimal Forecast Reconciliation Through Trace Minimization', 'url': 'https://www.tandfonline.com/doi/full/10.1080/01621459.2018.1448825'},
            {'title': 'Forecasting: Principles and Practice, Forecast reconciliation', 'url': 'https://otexts.robjhyndman.com/fpp3/reconciliation.html'},
            {'title': 'Optimal non-negative forecast reconciliation, Monash working paper', 'url': 'https://www.monash.edu/business/ebs/research/publications/ebs/wp15-2019.pdf'},
        ],
    }
    output = repo / 'data/scenarios/phase3_hierarchy.json'
    content = json.dumps(safe(result), ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n'
    if len(content.encode()) >= 25 * 1024 * 1024: raise ValueError('Hierarchy asset exceeds 25 MiB')
    output.write_text(content)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    args = parser.parse_args()
    result = build(args.repo.resolve())
    print(json.dumps({'selectedModel': result['selectedModel'], 'sourceAudit': {k: result['sourceAudit'][k] for k in ('months', 'totalRows', 'mitsubishiRows', 'unknownUfRows')},
                      'validationMase': {key: val['allNodes']['mase'] for key, val in result['validation'].items()},
                      'testMase': {key: val['allNodes']['mase'] for key, val in result['test'].items()},
                      'comparison': result['comparison']}, ensure_ascii=False, indent=2))
