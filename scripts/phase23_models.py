#!/usr/bin/env python3
"""Reproducible, retrospective phase 2/3 models. No causal/simulation permission.

Run: python scripts/phase23_models.py --repo .
Dependencies: numpy, scipy. All model definitions are fixed before this run.
"""
import argparse
import collections
import hashlib
import json
import os
import sys
import warnings
from pathlib import Path

import numpy as np
from scipy.special import xlogy, expit, logit
from scipy.optimize import nnls
from scipy.stats import norm

MODELS = ('seasonal_naive', 'seasonal_ar1', 'seasonal_arx', 'seasonal_sarimax')
SHARE_MODELS = ('share_seasonal_naive', 'share_logit_sarimax')
HORIZONS = (3, 6, 12)
EXOG_KEYS = ('vehicle_financing_rate', 'vehicle_credit_concessions')
MAX_HORIZON = 12
MIN_TRAIN = 60


def safe(value):
    if isinstance(value, dict): return {k: safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [safe(v) for v in value]
    if isinstance(value, np.ndarray): return safe(value.tolist())
    if isinstance(value, (np.floating, float)):
        return float(value) if np.isfinite(value) else None
    if isinstance(value, (np.integer,)): return int(value)
    if isinstance(value, np.bool_): return bool(value)
    return value


def load(path):
    return json.loads(path.read_text())


def add_month(month, delta):
    year, mo = map(int, month.split('-'))
    i = year * 12 + mo - 1 + delta
    return f'{i // 12:04d}-{i % 12 + 1:02d}'


def aligned_series(months, series):
    result = {}
    for item in series:
        if not item.get('monthly'): continue
        values = {r['month']: r.get('value') for r in item['monthly']}
        result[item['key']] = np.array([values.get(m) if values.get(m) is not None else np.nan for m in months], float)
    return result


def available_exog(raw, origin, horizon):
    """Never read indices >= origin-1: monthly release lag of one full month.

    origin is first forecast month; origin-1 is last observed registration month.
    Monthly financing/credit values are assumed known only through origin-2.
    This is a conservative release rule, not a historical publication database.
    """
    length = origin + horizon
    out = {}
    for key in EXOG_KEYS:
        a = np.full(length, np.nan)
        supplied = np.asarray(raw[key], float)
        cutoff = min(origin - 1, len(supplied))
        a[:cutoff] = supplied[:cutoff]
        # Forward fill only after actual observations; never backward-fill.
        last = np.nan
        for i in range(length):
            if np.isfinite(a[i]): last = a[i]
            elif np.isfinite(last): a[i] = last
        out[key] = a
    return out


def exog_features(known):
    size = len(known[EXOG_KEYS[0]])
    transformed = []
    for key in EXOG_KEYS:
        a = known[key]
        z = np.full(size, np.nan)
        if key == 'vehicle_credit_concessions':
            z[12:] = np.log(a[12:] / a[:-12])
        else:
            z[12:] = a[12:] - a[:-12]
        transformed.append(z)
    # Fixed distributed lags 2,3,4, constrained to equal weights, one coefficient.
    output = np.full((size, 2), np.nan)
    for t in range(16, size):
        output[t] = [np.mean(z[t - 4:t - 1]) for z in transformed]
    return output


def seasonal_design(y, raw, origin, horizon, model):
    log_y = np.log(np.maximum(np.asarray(y[:origin], float), 1e-9))
    z = np.full(origin, np.nan)
    z[12:] = log_y[12:] - log_y[:-12]
    if model == 'seasonal_arx':
        ex = exog_features(available_exog(raw, origin, horizon))
        indices = np.arange(16, origin)
        indices = indices[np.isfinite(ex[indices]).all(axis=1)]
        center = np.mean(ex[indices], axis=0)
        scale = np.std(ex[indices], axis=0)
        scale[scale < 1e-10] = 1
        ex = (ex - center) / scale
        X = np.column_stack([np.ones(len(indices)), z[indices - 1], ex[indices]])
        terms = ['intercept', 'seasonal_growth_ar1', 'financing_rate_yoy_lag2_4', 'credit_log_yoy_lag2_4']
    else:
        indices = np.arange(13, origin)
        X = np.column_stack([np.ones(len(indices)), z[indices - 1]])
        ex = None
        center = scale = None
        terms = ['intercept', 'seasonal_growth_ar1']
    target = z[indices]
    # Fixed weak ridge regularisation on slopes; no test/validation tuning.
    penalty = np.diag([0.] + [1.] * (X.shape[1] - 1))
    beta = np.linalg.solve(X.T @ X + penalty, X.T @ target)
    residual = target - X @ beta
    inv = np.linalg.pinv(X.T @ X + penalty)
    covariance = inv @ ((X * residual[:, None]).T @ (X * residual[:, None])) @ inv
    return log_y, z, ex, beta, {
        'coefficients': [{'term': term, 'coefficient': b, 'standardError': se} for term, b, se in zip(terms, beta, np.sqrt(np.maximum(0, np.diag(covariance))))],
        'n': len(indices), 'rSquared': 1 - np.sum(residual ** 2) / np.sum((target - target.mean()) ** 2),
        'exogenousCenters': center, 'exogenousScales': scale,
        'coefficientUnits': 'Exogenous predictors are standardized using this training window only; response is log seasonal registration growth.',
        'standardErrorWarning': 'HC0 ridge sandwich is descriptive; it does not account for serial dependence, model selection or all uncertainty.',
    }


def sarimax_class():
    try:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
    except ModuleNotFoundError:
        # This executor has a read-only global site-packages. A documented,
        # official-PyPI installation lives in a writable target, not the repo.
        dependency_path = Path(os.environ.get('PHASE23_DEPS', '/tmp/phase23-python'))
        if not dependency_path.exists():
            raise RuntimeError('Install statsmodels==0.15.0, or set PHASE23_DEPS to its installed dependency directory. No statistical fallback is used.')
        sys.path.insert(0, str(dependency_path))
        from statsmodels.tsa.statespace.sarimax import SARIMAX
    return SARIMAX


def sarimax_predict(y, raw, origin, horizon, share=False):
    SARIMAX = sarimax_class()
    if share:
        response = logit(np.clip(np.asarray(y[:origin], float), 1e-6, 1 - 1e-6))
        ex = future_ex = None
        first = 0
    else:
        first = 16
        response = np.log(np.asarray(y[first:origin], float))
        features = exog_features(available_exog(raw, origin, horizon))
        center = features[first:origin].mean(axis=0)
        scale = features[first:origin].std(axis=0)
        scale[scale < 1e-10] = 1.
        features = (features - center) / scale
        ex, future_ex = features[first:origin], features[origin:origin + horizon]
    specification = SARIMAX(response, exog=ex, order=(1, 0, 0), seasonal_order=(0, 1, 1, 12),
                            trend='n', enforce_stationarity=True, enforce_invertibility=True)
    captured = []
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        fit = specification.fit(method='lbfgs', maxiter=200, disp=False)
        optimizer = 'lbfgs'
        if not fit.mle_retvals.get('converged', False):
            # Same data and specification; optimizer recovery, never a baseline.
            fit = specification.fit(start_params=fit.params, method='powell', maxiter=400, disp=False)
            optimizer = 'powell_after_lbfgs'
        captured = sorted(set(str(w.message) for w in caught))
    converged = bool(fit.mle_retvals.get('converged', False))
    if not converged:
        raise RuntimeError(f'SARIMAX fit did not converge at origin {origin}; share={share}. No substituted forecast published. {fit.mle_retvals}')
    forecast = np.asarray(fit.forecast(horizon, exog=future_ex), float)
    points = expit(forecast) if share else np.exp(forecast)
    if not np.isfinite(points).all(): raise RuntimeError('Non-finite SARIMAX forecast; no fallback published')
    return points, {'implementation': 'statsmodels.tsa.statespace.sarimax.SARIMAX', 'order': [1, 0, 0],
        'seasonalOrder': [0, 1, 1, 12], 'transformation': 'logit' if share else 'log',
        'converged': converged, 'optimizer': optimizer, 'iterations': int(fit.mle_retvals.get('iterations', 0)),
        'n': len(response), 'trainingFirstIndex': first, 'aic': float(fit.aic), 'warnings': captured,
        'parameters': [{'term': term, 'value': float(value)} for term, value in zip(fit.param_names, fit.params)],
        'futureExogenous': False if share else 'Available-at-origin financing/nominal credit; unknown future levels held flat.',
        'fitFailurePolicy': 'Stop generation with explicit error if both fixed-specification optimizers fail; never relabel another model as SARIMAX.'}


def reconcile_national(base, variances):
    """Constrained WLS of [total, MIT, nonMIT], not MinT covariance fitting."""
    S = np.array([[1., 1.], [1., 0.], [0., 1.]])
    sd = np.sqrt(np.maximum(np.asarray(variances, float), 1e-12))
    bottom, _ = nnls(S / sd[:, None], np.asarray(base, float) / sd)
    return S @ bottom


def predict(y, raw, origin, horizon, model):
    if origin < 24 or horizon > 12: raise ValueError('Requires >=24 months and horizon <=12')
    if model in ('seasonal_sarimax', 'share_logit_sarimax'):
        return sarimax_predict(y, raw, origin, horizon, share=model == 'share_logit_sarimax')
    if model in ('seasonal_naive', 'share_seasonal_naive'):
        return np.asarray([y[origin - 12 + h] for h in range(horizon)], float), {}
    log_y, z, ex, beta, diagnostics = seasonal_design(y, raw, origin, horizon, model)
    path = list(log_y)
    growth = list(z)
    for t in range(origin, origin + horizon):
        features = [1., growth[t - 1]]
        if model == 'seasonal_arx': features.extend(ex[t])
        value = float(np.dot(features, beta))
        growth.append(value)
        path.append(path[t - 12] + value)
    points = np.exp(np.asarray(path[origin:]))
    if not np.isfinite(points).all(): raise ValueError('Non-finite forecast; do not publish')
    return points, diagnostics


def records(y, raw, months, origins, model):
    output = []
    for origin in origins:
        points, diag = predict(y, raw, origin, MAX_HORIZON, model)
        scale = float(np.mean(np.abs(y[12:origin] - y[:origin - 12])))
        for h, p in enumerate(points, 1):
            output.append({'origin': months[origin - 1], 'originIndex': origin,
                           'month': months[origin + h - 1], 'horizon': h,
                           'actual': float(y[origin + h - 1]), 'predicted': float(p), 'scale': scale,
                           'fitDiagnostics': diag if h == 1 else None})
    return output


def error_quantiles(calibration):
    return {h: np.quantile([r['actual'] - r['predicted'] for r in calibration if r['horizon'] == h], [.025, .1, .9, .975]) for h in range(1, 13)}


def bounds(point, quantiles, upper=None):
    b = np.maximum(0., point + np.asarray(quantiles))
    if upper is not None: b = np.minimum(upper, b)
    return dict(zip(('lo95', 'lo80', 'hi80', 'hi95'), map(float, b)))


def with_intervals(rows, calibration, share=False):
    quantiles = error_quantiles(calibration)
    return [{**r, **bounds(r['predicted'], quantiles[r['horizon']], 1 if share else None)} for r in rows]


def metrics(rows):
    def one(rs):
        error = np.asarray([r['predicted'] - r['actual'] for r in rs])
        scaled = [abs(r['predicted'] - r['actual']) / r['scale'] for r in rs if r['scale'] > 0]
        result = {'mae': float(np.mean(np.abs(error))), 'mase': float(np.mean(scaled)) if scaled else None,
                  'bias': float(np.mean(error)), 'nPredictions': len(rs),
                  'nOrigins': len(set(r['originIndex'] for r in rs))}
        for pct in (80, 95):
            result['coverage' + str(pct)] = float(np.mean([r['lo' + str(pct)] <= r['actual'] <= r['hi' + str(pct)] for r in rs])) if rs and 'lo' + str(pct) in rs[0] else None
        return result
    return {**one(rows), 'byHorizon': [{'horizon': h, **one([r for r in rows if r['horizon'] <= h])} for h in HORIZONS],
            'atHorizon': [{'horizon': h, **one([r for r in rows if r['horizon'] == h])} for h in HORIZONS]}


def fit_forecasts(monthly, raw):
    monthly = [{**r, 'nonMitsubishi': r['registrations'] - r['mitsubishi']} for r in monthly]
    months = [r['month'] for r in monthly]
    n = len(months)
    test_start = n - 24
    validation_origins = list(range(MIN_TRAIN, test_start - MAX_HORIZON + 1))
    test_origins = list(range(test_start, n - MAX_HORIZON + 1))
    if len(validation_origins) < 24 or len(test_origins) < 12: raise ValueError('Insufficient rolling-origin folds')
    output = {'targets': {}, 'horizons': list(HORIZONS)}
    chosen_records = {}
    chosen_points = {}
    for target in ('registrations', 'mitsubishi', 'nonMitsubishi'):
        y = np.asarray([r[target] for r in monthly], float)
        val = {m: records(y, raw, months, validation_origins, m) for m in MODELS}
        validation = {m: metrics(v) for m, v in val.items()}
        selected = min(MODELS, key=lambda m: validation[m]['mae'])
        test_rows = {m: with_intervals(records(y, raw, months, test_origins, m), val[m]) for m in MODELS}
        test = {m: metrics(v) for m, v in test_rows.items()}
        points, diag = predict(y, raw, n, MAX_HORIZON, selected)
        quantiles = error_quantiles(val[selected])
        intervals = [{'month': add_month(months[-1], h), 'horizon': h, 'point': float(p),
                      **bounds(p, quantiles[h]), 'calibrationN': len(validation_origins)} for h, p in enumerate(points, 1)]
        gate = all(test[selected]['byHorizon'][i]['mae'] <= test['seasonal_naive']['byHorizon'][i]['mae'] and
                   test[selected]['byHorizon'][i]['coverage80'] >= .7 and test[selected]['byHorizon'][i]['coverage95'] >= .85 for i in range(3))
        output['targets'][target] = {
            'selectedModel': selected, 'qualityStatus': 'experimental_retrospective', 'validationPassed': False,
            'retrospectiveGatePassed': gate,
            'selection': 'Lowest validation MAE across the complete 12-month path. Test scores do not select the model.',
            'validation': validation, 'test': test, 'intervals': intervals,
            'testIntervalCoverage': {'80': test[selected]['coverage80'], '95': test[selected]['coverage95']},
            'testPredictions': test_rows[selected], 'candidateTestPredictions': test_rows, 'fitDiagnostics': diag,
            'testBeatSeasonalNaive': test[selected]['mae'] < test['seasonal_naive']['mae'],
            'fitAudit': {model: {'validation': [{'origin': r['origin'], **(r.get('fitDiagnostics') or {})} for r in val[model] if r['horizon'] == 1], 'test': [{'origin': r['origin'], **(r.get('fitDiagnostics') or {})} for r in test_rows[model] if r['horizon'] == 1]} for model in MODELS},
            'qualityWarning': 'The same historical evaluation period was examined in earlier work. This is not a fresh independent test or real-time-vintage validation.',
        }
        chosen_records[target] = {'validation': val[selected], 'test': test_rows[selected]}
        chosen_points[target] = points
    # Three independently fitted national count nodes. Diagonal WLS weights
    # are seasonal-error second moments estimated from each origin's train only.
    count_targets = ('registrations', 'mitsubishi', 'nonMitsubishi')
    series_by_target = {t: np.array([r[t] for r in monthly], float) for t in count_targets}
    def train_variances(origin):
        return [float(np.mean((series_by_target[t][12:origin] - series_by_target[t][:origin - 12]) ** 2)) for t in count_targets]
    reconciled_records = {t: {} for t in count_targets}
    for split in ('validation', 'test'):
        for t in count_targets: reconciled_records[t][split] = []
        for triplet in zip(*(chosen_records[t][split] for t in count_targets)):
            origin = triplet[0]['originIndex']
            reconciled = reconcile_national([r['predicted'] for r in triplet], train_variances(origin))
            for t, r, point in zip(count_targets, triplet, reconciled):
                reconciled_records[t][split].append({k: v for k, v in {**r, 'predicted': float(point)}.items() if not k.startswith(('lo80', 'lo95', 'hi80', 'hi95'))})
    future_path = np.stack([reconcile_national([chosen_points[t][h] for t in count_targets], train_variances(n)) for h in range(12)])
    for i, t in enumerate(count_targets):
        target = output['targets'][t]
        target['baseSelectedModel'] = target['selectedModel']
        target['selectedModel'] = 'constrained_wls'
        target['selection'] += ' Published counts then undergo national nonnegative weighted least-squares reconciliation.'
        target['validation']['constrained_wls'] = metrics(reconciled_records[t]['validation'])
        final_test = with_intervals(reconciled_records[t]['test'], reconciled_records[t]['validation'])
        target['test']['constrained_wls'] = metrics(final_test)
        target['testPredictions'] = final_test
        target['testIntervalCoverage'] = {'80': target['test']['constrained_wls']['coverage80'], '95': target['test']['constrained_wls']['coverage95']}
        target['baseFitDiagnostics'] = target['fitDiagnostics']
        target['fitDiagnostics'] = {'method': 'Constrained WLS', 'variances': train_variances(n), 'baseModel': target['baseSelectedModel']}
        quantiles = error_quantiles(reconciled_records[t]['validation'])
        target['intervals'] = [{'month': add_month(months[-1], h), 'horizon': h, 'point': float(point), **bounds(point, quantiles[h]), 'calibrationN': len(validation_origins)} for h, point in enumerate(future_path[:, i], 1)]
        chosen_points[t] = future_path[:, i]
        chosen_records[t] = reconciled_records[t]
        target['retrospectiveGatePassed'] = all(s['mae'] <= target['test']['seasonal_naive']['byHorizon'][j]['mae'] and s['coverage80'] >= .7 and s['coverage95'] >= .85 for j, s in enumerate(target['test']['constrained_wls']['byHorizon']))
        target['testBeatSeasonalNaive'] = target['test']['constrained_wls']['mae'] < target['test']['seasonal_naive']['mae']
    # Reconcile national point forecasts. Count models are unconstrained during
    # estimation; the forecast product always enforces 0 <= MIT <= market.
    clip_count = 0
    share_records = {}
    for split in ('validation', 'test'):
        share_records[split] = []
        for market, mit in zip(chosen_records['registrations'][split], chosen_records['mitsubishi'][split]):
            assert (market['originIndex'], market['horizon']) == (mit['originIndex'], mit['horizon'])
            count = min(max(0., mit['predicted']), market['predicted'])
            clip_count += count != mit['predicted']
            history = np.array([r['mitsubishiShare'] for r in monthly[:market['originIndex']]])
            scale = float(np.mean(np.abs(history[12:] - history[:-12])))
            share_records[split].append({**{k: market[k] for k in ('origin', 'originIndex', 'month', 'horizon')},
                'actual': mit['actual'] / market['actual'], 'predicted': count / market['predicted'], 'scale': scale})
    share_test = with_intervals(share_records['test'], share_records['validation'], share=True)
    sq = error_quantiles(share_records['validation'])
    forecast_rows, share_intervals = [], []
    for h, (market, mit) in enumerate(zip(chosen_points['registrations'], chosen_points['mitsubishi']), 1):
        mit = min(max(0., mit), market)
        share = mit / market
        month = add_month(months[-1], h)
        forecast_rows.append({'month': month, 'horizon': h, 'registrations': float(market), 'mitsubishi': float(mit), 'nonMitsubishi': float(market - mit), 'mitsubishiShare': float(share)})
        share_intervals.append({'month': month, 'horizon': h, 'point': float(share), **bounds(share, sq[h], 1), 'calibrationN': len(validation_origins)})
    sm = metrics(share_test)
    output['targets']['mitsubishiShare'] = {
        'selectedModel': 'coherent_ratio', 'qualityStatus': 'experimental_retrospective', 'validationPassed': False,
        'selection': 'Ratio of independently validation-selected market and MIT point forecasts; no separate share tuning.',
        'validation': {'coherent_ratio': metrics(share_records['validation'])}, 'test': {'coherent_ratio': sm},
        'intervals': share_intervals, 'testPredictions': share_test, 'testIntervalCoverage': {'80': sm['coverage80'], '95': sm['coverage95']},
    }
    # An independent bounded share experiment is retained even when it loses.
    # The published share is the ratio of reconciled counts, so it remains coherent.
    share_y = np.array([r['mitsubishiShare'] for r in monthly], float)
    independent_val = {model: records(share_y, raw, months, validation_origins, model) for model in SHARE_MODELS}
    independent_scores = {model: metrics(rs) for model, rs in independent_val.items()}
    independent_selected = min(SHARE_MODELS, key=lambda model: independent_scores[model]['mae'])
    independent_test = {model: with_intervals(records(share_y, raw, months, test_origins, model), independent_val[model], share=True) for model in SHARE_MODELS}
    independent_points, independent_diag = predict(share_y, raw, n, MAX_HORIZON, independent_selected)
    independent_q = error_quantiles(independent_val[independent_selected])
    share_target = output['targets']['mitsubishiShare']
    share_target['independentSelectedModel'] = independent_selected
    share_target['validation'].update(independent_scores)
    share_target['test'].update({model: metrics(rs) for model, rs in independent_test.items()})
    share_target['candidateTestPredictions'] = {'coherent_ratio': share_test, **independent_test}
    share_target['independentFitDiagnostics'] = independent_diag
    share_target['fitAudit'] = {model: {'validation': [{'origin': r['origin'], **(r.get('fitDiagnostics') or {})} for r in independent_val[model] if r['horizon'] == 1], 'test': [{'origin': r['origin'], **(r.get('fitDiagnostics') or {})} for r in independent_test[model] if r['horizon'] == 1]} for model in SHARE_MODELS}
    share_target['independentIntervals'] = [{'month': add_month(months[-1], h), 'horizon': h, 'point': float(point), **bounds(point, independent_q[h], 1), 'calibrationN': len(validation_origins)} for h, point in enumerate(independent_points, 1)]
    share_target['selection'] = 'Independent seasonal share and logit-SARIMAX are compared by validation MAE. Published share remains MIT / market after constrained count reconciliation; the independent winner is retained as a separate comparator, not silently discarded.'
    output['rows'] = forecast_rows
    output['coherence'] = {'method': 'Nonnegative weighted least squares on national market = MIT + nonMIT; share = MIT / market.',
        'hierarchy': {'nodes': ['registrations', 'mitsubishi', 'nonMitsubishi'], 'summingMatrix': [[1, 1], [1, 0], [0, 1]]},
        'weightMethod': 'Inverse seasonal-naive training error second moments, recomputed at each origin; diagonal weights, not an estimated full residual covariance or MinT.',
        'latestTrainingVariances': train_variances(n), 'independentShareUsedAsConstraint': False, 'pointForecastsCoherent': True,
        'backtestClippedPredictions': int(clip_count), 'geographicReconciliation': 'separate_experiment',
        'warning': 'Marginal intervals are calibrated separately and are not simultaneous joint bands. UF hierarchy is a separate experiment; its reconciled paths must not be represented as reconciliation of these SARIMAX paths.'}
    output['protocol'] = {
        'initialTrainingMonths': MIN_TRAIN, 'validationOrigins': [months[o - 1] for o in validation_origins],
        'testOrigins': [months[o - 1] for o in test_origins], 'validationTargetRange': [months[MIN_TRAIN], months[test_start - 1]],
        'testTargetRange': [months[test_start], months[-1]], 'nValidationOrigins': len(validation_origins), 'nTestOrigins': len(test_origins),
        'evaluation': 'Expanding rolling origin. Common origins and complete 12-step paths for all candidates. byHorizon aggregates steps 1..H; atHorizon reports step H only.',
        'biasSign': 'positive = overprediction; predicted minus actual', 'maseDenominator': 'Mean absolute seasonal-naive training difference |y[t]-y[t-12]|, recomputed at each origin.',
        'intervals': 'Horizon-specific empirical 2.5/10/90/97.5% quantiles of validation actual-minus-predicted errors, frozen before test. Lower bound clipped at zero; share bounds clipped to [0,1]. No Gaussian or guaranteed coverage claim.',
        'testFreshness': 'Historical dates already inspected in prior experiments; all outputs remain experimental even if retrospective gates pass.',
        'originDependence': 'Overlapping targets mean prediction errors and coverage observations are dependent; no nominal significance from their raw count.',
        'macroAvailability': 'Monthly financing and credit observed only through origin-2 index; origin is first forecast month. Unknown subsequent levels held flat. Never uses realized future macro values.',
        'vintage': 'Current source vintage; assumed one-month publication delay. Historical releases and revisions unavailable, so this is pseudo-out-of-sample, not true real-time validation.',
    }
    return output


def prewhitened_ccf(months, registrations, series, train_end):
    """Same training-window AR filter applied to macro and outcome innovations."""
    y = np.log(np.asarray(registrations[:train_end], float))
    y = y[12:] - y[:-12]
    results = []
    for item in series:
        mapping = {r['month']: r['value'] for r in item.get('monthly', [])}
        x = np.array([mapping.get(m, np.nan) for m in months[:train_end]], float)
        if item.get('kind') == 'rate': x = x[12:] - x[:-12]
        else: x = np.log(x[12:] / x[:-12])
        valid = np.isfinite(x) & np.isfinite(y)
        if valid.sum() < 36: continue
        indices = np.arange(len(y))[valid]
        # No full-sample detrending: window is frozen before evaluation starts.
        design = np.column_stack([np.ones(len(indices)), indices / 12, *[(indices % 12 == m).astype(float) for m in range(1, 12)]])
        xr = np.full(len(y), np.nan); yr = np.full(len(y), np.nan)
        xr[valid] = x[valid] - design @ np.linalg.lstsq(design, x[valid], rcond=None)[0]
        yr[valid] = y[valid] - design @ np.linalg.lstsq(design, y[valid], rcond=None)[0]
        good = np.isfinite(xr[1:]) & np.isfinite(xr[:-1])
        phi = float(np.dot(xr[1:][good], xr[:-1][good]) / np.dot(xr[:-1][good], xr[:-1][good]))
        xf = xr[1:] - phi * xr[:-1]
        yf = yr[1:] - phi * yr[:-1]
        rows = []
        for lag in range(13):
            left = xf[:len(xf) - lag] if lag else xf
            right = yf[lag:]
            keep = np.isfinite(left) & np.isfinite(right)
            sample = int(keep.sum())
            corr = float(np.corrcoef(left[keep], right[keep])[0, 1]) if sample >= 24 and left[keep].std() > 0 and right[keep].std() > 0 else None
            threshold = 1.96 / np.sqrt(sample) if sample else None
            bonf = norm.ppf(1 - .05 / (2 * 13 * len(series))) / np.sqrt(sample) if sample else None
            rows.append({'lag': lag, 'n': sample, 'r': corr, 'threshold95': threshold, 'bonferroniThreshold': bonf,
                         'screened': bool(corr is not None and abs(corr) > bonf)})
        results.append({'key': item['key'], 'label': item.get('label', item['key']), 'trainingEnd': months[train_end - 1],
            'trainingN': train_end, 'rows': rows, 'ar1WhiteningCoefficient': phi,
            'filteredMacroLag1Autocorrelation': float(np.corrcoef(xf[:-1], xf[1:])[0, 1]) if np.isfinite(xf).all() else None,
            'filteredOutcomeLag1Autocorrelation': float(np.corrcoef(yf[:-1], yf[1:])[0, 1]) if np.isfinite(yf).all() else None,
            'transformation': '12-month difference for percentage-point rates; log 12-month difference for levels; train-only trend/month residualisation; AR(1) whitening on macro applied identically to outcome.',
            'warning': 'Positive lag means macro leads registrations. Approximate Bonferroni screen across all series/lags, not an exact test; AR(1) may leave serial dependence. No causal interpretation or automated feature selection.'})
    return results


def poisson_fit(counts, population, X):
    counts, population = np.asarray(counts, float), np.asarray(population, float)
    offset = np.log(population)
    beta = np.zeros(X.shape[1]); beta[0] = np.log(max(counts.sum(), 1) / population.sum())
    converged = False
    for iteration in range(100):
        eta = np.clip(offset + X @ beta, -30, 30)
        mu = np.exp(eta)
        gradient = X.T @ (counts - mu)
        hessian = (X.T * mu) @ X
        step = np.linalg.lstsq(hessian, gradient, rcond=None)[0]
        old = float(np.sum(mu - counts * eta))
        factor = 1.
        while factor > 1e-8:
            candidate = beta + factor * step
            ce = np.clip(offset + X @ candidate, -30, 30)
            if np.sum(np.exp(ce) - counts * ce) <= old + 1e-7: break
            factor /= 2
        beta += factor * step
        if np.max(np.abs(factor * step)) < 1e-8:
            converged = True; break
    mu = np.exp(np.clip(offset + X @ beta, -30, 30))
    bread = np.linalg.pinv((X.T * mu) @ X)
    score = X * (counts - mu)[:, None]
    covariance = bread @ (score.T @ score) @ bread
    covariance *= len(counts) / max(1, len(counts) - X.shape[1])
    pearson = np.sum((counts - mu) ** 2 / mu) / max(1, len(counts) - X.shape[1])
    deviance = 2 * np.sum(xlogy(counts, counts / mu) - (counts - mu))
    return beta, np.sqrt(np.maximum(0., np.diag(covariance))), mu, {
        'converged': converged, 'iterations': iteration + 1, 'dispersion': float(pearson),
        'deviance': float(deviance), 'n': len(counts), 'zeroCounts': int((counts == 0).sum()),
        'parameterCount': X.shape[1], 'standardErrors': 'HC1 municipality-level robust sandwich; spatial dependence is not corrected.',
        'conditionalOnly': True,
    }


def regional_model(regional, socioeconomic, phase1=None):
    optional = {r['code']: r for r in (phase1 or {}).get('municipalities', [])}
    all_observed = regional['municipalities']
    rows = []
    excluded = collections.Counter()
    for row in all_observed:
        if not row.get('code'):
            excluded['unmatchedGeography'] += 1; continue
        if not row.get('population') or row['population'] <= 0:
            excluded['missingPopulation'] += 1; continue
        if not row.get('gdpPerCapita') or row['gdpPerCapita'] <= 0:
            excluded['missingGDP'] += 1; continue
        if row.get('boundaryAttention'):
            excluded['boundaryChange'] += 1; continue
        rows.append({**row, **optional.get(row['code'], {})})
    covariates = [('logGdpPerCapita', 'gdpPerCapita', 'log')]
    optional_definitions = [('logHouseholdIncomePerCapita2022', 'householdIncomePerCapita2022', 'log'), ('logDensity2022', 'density2022', 'log'), ('urbanization2022', 'urbanization2022', 'identity'), ('logPamValuePerCapita', 'pamValueBRL', 'agro')]
    missing = []
    for term, key, transform in optional_definitions:
        coverage = sum(isinstance(r.get(key), (int, float)) and r[key] >= 0 for r in rows) / max(1, len(rows))
        if coverage >= .8:
            covariates.append((term, key, transform))
        else: missing.append(key + ': insufficient coverage' + ('; GDP per capita is not household income' if key == 'householdIncomePerCapita2022' else ''))
    complete = []
    for r in rows:
        if all(isinstance(r.get(k), (int, float)) and (r[k] > 0 if trans == 'log' else r[k] >= 0) for _, k, trans in covariates): complete.append(r)
        else: excluded['missingConditionalCovariate'] += 1
    rows = complete
    X = [np.ones(len(rows))]
    terms = ['intercept']; scales = {}
    for term, key, transform in covariates:
        vals = np.asarray([r[key] for r in rows], float)
        if transform == 'log': vals = np.log(vals)
        if transform == 'agro': vals = np.log1p(vals / np.asarray([r['population'] for r in rows]))
        center, scale = float(vals.mean()), float(vals.std())
        if scale < 1e-10:
            missing.append(term + ': no variation'); continue
        X.append((vals - center) / scale); terms.append(term); scales[term] = {'center': center, 'scale': scale}
    # Fixed effects condition on state; omitted alphabetical state is reference.
    states = sorted({r['uf'] for r in rows})
    for uf in states[1:]: X.append(np.asarray([float(r['uf'] == uf) for r in rows])); terms.append('uf_' + uf)
    X = np.column_stack(X)
    market = [r['registrations'] for r in rows]; mit = [r['mitsubishi'] for r in rows]; population = [r['population'] for r in rows]
    beta, se, expected, diag = poisson_fit(market, population, X)
    mbeta, mse, mexpected, mdiag = poisson_fit(mit, population, X)
    absent = set(r['code'] for r in socioeconomic['rows']) - set(r['code'] for r in all_observed if r.get('code'))
    vif = {}
    for j, term in enumerate(terms[1:], 1):
        if term.startswith('uf_'): continue
        other = np.delete(X, j, axis=1)
        resid = X[:, j] - other @ np.linalg.lstsq(other, X[:, j], rcond=None)[0]
        vif[term] = float(np.sum((X[:, j] - X[:, j].mean()) ** 2) / max(np.sum(resid ** 2), 1e-12))
    diag.update({'covariateVif': vif, 'zeroMitCounts': sum(v == 0 for v in mit), 'excluded': dict(excluded), 'absentMunicipalitiesNotAssumedZero': len(absent),
        'referenceState': states[0], 'transformationScales': scales, 'designConditionNumber': float(np.linalg.cond(X)), 'mitModel': mdiag})
    return {'status': 'partial_conditional_exploratory', 'model': 'Poisson log link / population offset / state fixed effects',
        'period': regional['period'], 'covariates': terms[1:], 'missingCovariates': missing,
        'coefficients': [{'term': t, 'coefficient': b, 'standardError': s, 'rateRatio': np.exp(b), 'mitCoefficient': m, 'mitStandardError': ms, 'mitRateRatio': np.exp(m)} for t, b, s, m, ms in zip(terms, beta, se, mbeta, mse)],
        'diagnostics': diag,
        'rows': [{'code': r['code'], 'uf': r['uf'], 'name': r['name'], 'population': r['population'],
                  'observed': r['registrations'], 'expected': p, 'ratio': r['registrations'] / p,
                  'mitObserved': r['mitsubishi'], 'mitExpected': mp, 'mitRatio': r['mitsubishi'] / mp} for r, p, mp in zip(rows, expected, mexpected)],
        'warning': 'Conditional association, not causal demand or actionable sales potential. GDP per capita is not household income. Counts refer to Jan–Sep registrations, not unique residents; fleets/headquarters and spatial dependence matter. GDP 2023, population 2026, income/density/urbanisation 2022 and PAM vintage differ. Overdispersion is reported; HC1 does not repair missing controls or spatial dependence.',
        'zeroPolicy': 'Observed zero MIT counts are retained in Poisson with log(population) offset. Municipalities absent from the registration table are excluded and are never silently treated as zero.',
        'validation': 'In-sample conditional fit, no out-of-sample regional predictive validation. Expected-minus-observed is not unmet demand.'}


def real_credit_series(external, phase1):
    credit = next((s for s in external['series'] if s['key'] == 'vehicle_credit_concessions'), None)
    ipca = next((s for s in (phase1 or {}).get('monthlySeries', []) if s['key'] == 'ipca_index'), None)
    if not credit or not ipca:
        return {'status': 'unavailable', 'reason': 'Credit flow and IPCA index are both required.'}
    price = {r['month']: r['value'] for r in ipca['monthly'] if r.get('value') and r['value'] > 0}
    common = [r for r in credit['monthly'] if r['month'] in price]
    base = common[-1]['month']
    return {'status': 'descriptive', 'key': 'vehicle_credit_concessions_real',
            'unit': 'BRL million at ' + base + ' prices', 'deflatorBaseMonth': base, 'deflatorBaseIndex': price[base],
            'formula': 'nominal credit flow * IPCA[base month] / IPCA[observation month]',
            'monthly': [{'month': r['month'], 'nominal': r['value'], 'value': r['value'] * price[base] / price[r['month']], 'ipcaIndex': price[r['month']]} for r in common],
            'warning': 'Descriptive current-vintage real flow, not credit stock. Does not replace the pre-specified nominal-credit forecasting candidate or create an intervention model.'}


def build(repo):
    folder = repo / 'data/scenarios'
    monthly_file = load(folder / 'monthly.json'); monthly = monthly_file['rows']
    months = [r['month'] for r in monthly]
    if any(add_month(months[0], i) != m for i, m in enumerate(months)): raise ValueError('Monthly gaps')
    if any(not np.isfinite(r['registrations']) or not 0 < r['mitsubishi'] <= r['registrations'] for r in monthly):
        raise ValueError('National series requires positive finite counts and MIT <= market')
    external = load(folder / 'external_sources.json')
    series = [s for s in external['series'] if s.get('status') == 'available']
    raw = aligned_series(months, series)
    if not all(k in raw for k in EXOG_KEYS): raise ValueError('Required macro series unavailable; no fabricated fallback')
    forecasts = fit_forecasts(monthly, raw)
    train_end = len(months) - 24
    ccf = prewhitened_ccf(months, [r['registrations'] for r in monthly], series, train_end)
    _, _, _, _, dl = seasonal_design(np.array([r['registrations'] for r in monthly]), raw, train_end, 12, 'seasonal_arx')
    phase1_path = folder / 'phase1_sources.json'
    phase1 = load(phase1_path) if phase1_path.exists() else None
    regional = regional_model(load(folder / 'regional.json'), load(folder / 'socioeconomic.json'), phase1)
    files = ['monthly.json', 'external_sources.json', 'regional.json', 'socioeconomic.json']
    if phase1_path.exists(): files.append('phase1_sources.json')
    output = {
        'schemaVersion': 'phase23-1.0.0', 'coverage': {'start': months[0], 'end': months[-1], 'months': len(months), 'creditThrough': max(r['month'] for s in series if s['key'] == 'vehicle_credit_concessions' for r in s['monthly'])},
        'unit': monthly_file['unit'], 'scope': monthly_file['scope'],
        'sourceAsOf': max(monthly_file['sourceAsOf'], (phase1 or {}).get('retrievedAt', monthly_file['sourceAsOf'])),
        'registrationSourceAsOf': monthly_file['sourceAsOf'],
        'filterContract': 'Fixed national monthly history and fixed regional Jan–Sep cross-section; dashboard filters do not refit models.',
        'protocol': forecasts['protocol'],
        'economics': {'prewhitenedCcf': ccf, 'realCredit': real_credit_series(external, phase1),
            'distributedLag': {'status': 'experimental', 'specification': 'Log seasonal-difference AR(1) plus equal-weight distributed lags 2–4 of financing-rate YoY percentage-point changes and credit-flow log YoY changes. Fixed weak ridge penalty 1 on slopes.',
                'trainingEnd': months[train_end - 1], 'features': list(EXOG_KEYS), 'coefficients': dl['coefficients'],
                'diagnostics': {k: v for k, v in dl.items() if k != 'coefficients'},
                'warning': 'A fixed parsimonious forecasting candidate, not a validated economic elasticity. Lags were specified in advance, not selected from the CCF. No causal or intervention interpretation.'}},
        'regional': regional, 'forecasts': forecasts,
        'simulation': {'status': 'blocked', 'phase4Activated': False, 'reason': 'No causal model, identification strategy or validated intervention response. Phase 4 is outside this task.'},
        'limitations': ['All tests are retrospective on a current vintage; historical release vintages unavailable.',
            'The evaluation dates were inspected in prior experiments; no fresh independent validation claim.',
            'Forecast intervals are empirical and approximate; overlap, regime changes and model selection affect coverage.',
            'Credit concessions are nominal flows, not outstanding balances or real credit. Monthly macro availability is conservatively assumed, not verified historical release-by-release.',
            'Regional controls use different vintages and omit unavailable variables; GDP per capita must never be renamed household income.',
            'This package reconciles the national count hierarchy only. A separate UF experiment does not reconcile these model paths; no joint probabilistic coherence is claimed.',
            'PNAD rolling-quarter values are not treated as independent monthly observations or inserted into this fixed model.'],
        'provenance': {'inputs': [{'file': f, 'sha256': hashlib.sha256((folder / f).read_bytes()).hexdigest()} for f in files],
            'script': 'scripts/phase23_models.py', 'numpyVersion': np.__version__, 'statsmodelsVersion': __import__('statsmodels').__version__, 'randomness': 'none',
            'methods': ['https://otexts.com/fpp3/toolbox.html#time-series-cross-validation', 'https://otexts.com/fpp3/toolbox.html#evaluating-point-forecast-accuracy', 'https://otexts.com/fpp3/dynamic-regression.html']},
    }
    path = folder / 'phase23_models.json'
    path.write_text(json.dumps(safe(output), ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    print(json.dumps({k: {'selected': v['selectedModel'], 'quality': v['qualityStatus'], 'coverage': v['testIntervalCoverage'], 'test': v['test'][v['selectedModel']]['mae']} for k, v in forecasts['targets'].items()}, indent=2))
    print('Regional:', len(regional['rows']), regional['diagnostics']['converged'], regional['diagnostics']['zeroMitCounts'], regional['missingCovariates'])
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    build(args.repo)
