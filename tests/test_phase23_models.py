"""Executable statistical/provenance contracts; no network required."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('phase23', ROOT / 'scripts/phase23_models.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class Phase23Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = json.loads((ROOT / 'data/scenarios/phase23_models.json').read_text())
        cls.monthly = json.loads((ROOT / 'data/scenarios/monthly.json').read_text())['rows']
        cls.months = [r['month'] for r in cls.monthly]
        cls.y = np.array([r['registrations'] for r in cls.monthly], float)
        cls.external = json.loads((ROOT / 'data/scenarios/external_sources.json').read_text())['series']
        cls.raw = m.aligned_series(cls.months, cls.external)

    def test_future_y_and_macro_do_not_change_origin_prediction(self):
        origin = 80
        first, _ = m.predict(self.y, self.raw, origin, 12, 'seasonal_arx')
        changed_y = self.y.copy(); changed_y[origin:] = 999999999
        changed_raw = {k: v.copy() for k, v in self.raw.items()}
        for values in changed_raw.values(): values[origin - 1:] = 999999999
        second, _ = m.predict(changed_y, changed_raw, origin, 12, 'seasonal_arx')
        np.testing.assert_array_equal(first, second)

    def test_actual_sarimax_has_no_future_information(self):
        origin = 80
        first, diag = m.predict(self.y, self.raw, origin, 12, 'seasonal_sarimax')
        changed_y = self.y.copy(); changed_y[origin:] = 999999999
        changed_raw = {k: v.copy() for k, v in self.raw.items()}
        for values in changed_raw.values(): values[origin - 1:] = 999999999
        second, _ = m.predict(changed_y, changed_raw, origin, 12, 'seasonal_sarimax')
        np.testing.assert_array_equal(first, second)
        self.assertEqual(diag['implementation'], 'statsmodels.tsa.statespace.sarimax.SARIMAX')
        self.assertEqual(diag['seasonalOrder'], [0, 1, 1, 12])
        self.assertTrue(diag['converged'])

    def test_failed_sarimax_never_substitutes_another_model(self):
        class FailedFit:
            mle_retvals = {'converged': False}
            params = np.zeros(3)
        class FailedModel:
            def __init__(self, *args, **kwargs): pass
            def fit(self, *args, **kwargs): return FailedFit()
        with patch.object(m, 'sarimax_class', return_value=FailedModel):
            with self.assertRaisesRegex(RuntimeError, 'No substituted forecast published'):
                m.sarimax_predict(self.y, self.raw, 80, 12)

    def test_all_sarimax_folds_have_explicit_convergence_audit(self):
        for target in ('registrations', 'mitsubishi', 'nonMitsubishi'):
            audit = self.result['forecasts']['targets'][target]['fitAudit']['seasonal_sarimax']
            self.assertEqual(len(audit['validation']), 34)
            self.assertEqual(len(audit['test']), 13)
            for row in audit['validation'] + audit['test']:
                self.assertTrue(row['converged'])
                self.assertIn(row['optimizer'], ('lbfgs', 'powell_after_lbfgs'))
                self.assertIn('warnings', row)
                self.assertIn('never relabel', row['fitFailurePolicy'])

    def test_independent_share_is_bounded_and_selected_by_validation(self):
        share = self.result['forecasts']['targets']['mitsubishiShare']
        selected = min(m.SHARE_MODELS, key=lambda model: share['validation'][model]['mae'])
        self.assertEqual(share['independentSelectedModel'], selected)
        self.assertEqual(set(m.SHARE_MODELS) - set(share['test']), set())
        for interval in share['independentIntervals']:
            self.assertTrue(0 < interval['point'] < 1)
            self.assertTrue(0 <= interval['lo95'] <= interval['hi95'] <= 1)
        for model in m.SHARE_MODELS:
            rows = share['candidateTestPredictions'][model]
            metric = share['test'][model]
            self.assertAlmostEqual(metric['mae'], np.mean([abs(r['actual'] - r['predicted']) for r in rows]))
            self.assertTrue(all(0 < r['predicted'] < 1 for r in rows))
        self.assertEqual(share['selectedModel'], 'coherent_ratio')

    def test_constrained_national_reconciliation_repairs_inconsistent_bases(self):
        result = m.reconcile_national([100, 40, 80], [9, 1, 4])
        self.assertTrue(np.all(result >= 0))
        self.assertAlmostEqual(result[0], result[1] + result[2])
        self.assertFalse(np.allclose(result, [100, 40, 80]))
        negative = m.reconcile_national([10, -10, 40], [1, 1, 1])
        self.assertTrue(np.all(negative >= 0))
        self.assertAlmostEqual(negative[0], negative[1] + negative[2])

    def test_macro_future_is_flat_and_training_is_unmodified(self):
        origin = 80
        known = m.available_exog(self.raw, origin, 12)
        for key in m.EXOG_KEYS:
            np.testing.assert_array_equal(known[key][:origin - 1], self.raw[key][:origin - 1])
            self.assertTrue(np.all(known[key][origin - 1:] == self.raw[key][origin - 2]))
        self.assertEqual(len(known[m.EXOG_KEYS[0]]), origin + 12)

    def test_forecast_responds_to_available_information(self):
        first, _ = m.predict(self.y, self.raw, 80, 12, 'seasonal_arx')
        changed = {k: v.copy() for k, v in self.raw.items()}
        changed['vehicle_financing_rate'][77:79] += 1
        second, _ = m.predict(self.y, changed, 80, 12, 'seasonal_arx')
        self.assertFalse(np.allclose(first, second))

    def test_seasonal_naive_is_exact(self):
        out, _ = m.predict(self.y, self.raw, 80, 12, 'seasonal_naive')
        np.testing.assert_array_equal(out, self.y[68:80])

    def test_train_only_ccf_ignores_all_test_observations(self):
        train_end = len(self.months) - 24
        series = [s for s in self.external if s['key'] == 'vehicle_credit_concessions']
        first = m.prewhitened_ccf(self.months, self.y, series, train_end)
        changed_y = self.y.copy(); changed_y[train_end:] *= 100
        changed_series = json.loads(json.dumps(series))
        for row in changed_series[0]['monthly']:
            if row['month'] >= self.months[train_end]: row['value'] *= 100
        second = m.prewhitened_ccf(self.months, changed_y, changed_series, train_end)
        self.assertEqual(first, second)
        self.assertEqual([r['lag'] for r in first[0]['rows']], list(range(13)))

    def test_source_vintage_includes_new_public_data(self):
        phase1 = json.loads((ROOT / 'data/scenarios/phase1_sources.json').read_text())
        self.assertGreaterEqual(self.result['sourceAsOf'], phase1['retrievedAt'])
        self.assertGreaterEqual(self.result['sourceAsOf'], self.result['registrationSourceAsOf'])

    def test_validation_targets_precede_test_targets(self):
        p = self.result['protocol']
        self.assertLess(p['validationTargetRange'][1], p['testTargetRange'][0])
        self.assertEqual(p['nValidationOrigins'], 34)
        self.assertEqual(p['nTestOrigins'], 13)
        self.assertEqual(p['testTargetRange'], ['2024-10', '2026-09'])
        self.assertEqual(self.result['coverage']['months'], 129)

    def test_selection_uses_validation_only_and_no_fresh_validation_claim(self):
        for key in ('registrations', 'mitsubishi', 'nonMitsubishi'):
            target = self.result['forecasts']['targets'][key]
            chosen = min(m.MODELS, key=lambda model: target['validation'][model]['mae'])
            self.assertEqual(target['baseSelectedModel'], chosen)
            self.assertEqual(target['selectedModel'], 'constrained_wls')
            self.assertEqual(target['qualityStatus'], 'experimental_retrospective')
            self.assertFalse(target['validationPassed'])
            self.assertEqual(set(target['test']), set(m.MODELS) | {'constrained_wls'})

    def test_reported_test_metrics_recompute_from_predictions(self):
        for name, target in self.result['forecasts']['targets'].items():
            rows = target['testPredictions']
            score = target['test'][target['selectedModel']]
            self.assertEqual(len(rows), 156)
            self.assertAlmostEqual(score['mae'], np.mean([abs(r['actual'] - r['predicted']) for r in rows]))
            self.assertAlmostEqual(score['bias'], np.mean([r['predicted'] - r['actual'] for r in rows]))
            self.assertAlmostEqual(score['mase'], np.mean([abs(r['actual'] - r['predicted']) / r['scale'] for r in rows]))
            for level in (80, 95):
                coverage = np.mean([r['lo' + str(level)] <= r['actual'] <= r['hi' + str(level)] for r in rows])
                self.assertAlmostEqual(score['coverage' + str(level)], coverage)
            self.assertEqual([r['horizon'] for r in score['byHorizon']], [3, 6, 12])
            self.assertEqual([r['nPredictions'] for r in score['byHorizon']], [39, 78, 156])

    def test_real_credit_is_deflated_and_base_is_latest_common_month(self):
        real = self.result['economics']['realCredit']
        self.assertEqual(real['status'], 'descriptive')
        self.assertEqual(real['deflatorBaseMonth'], real['monthly'][-1]['month'])
        self.assertEqual(real['monthly'][-1]['value'], real['monthly'][-1]['nominal'])
        for r in real['monthly']:
            self.assertAlmostEqual(r['value'], r['nominal'] * real['deflatorBaseIndex'] / r['ipcaIndex'])

    def test_share_and_total_are_coherent(self):
        rows = self.result['forecasts']['rows']
        self.assertEqual(len(rows), 12)
        self.assertEqual(rows[0]['month'], '2026-10')
        self.assertEqual(rows[-1]['month'], '2027-09')
        for i, row in enumerate(rows):
            self.assertGreaterEqual(row['mitsubishi'], 0)
            self.assertLessEqual(row['mitsubishi'], row['registrations'])
            self.assertAlmostEqual(row['mitsubishiShare'], row['mitsubishi'] / row['registrations'])
            self.assertAlmostEqual(row['registrations'], row['mitsubishi'] + row['nonMitsubishi'])
            for key in ('registrations', 'mitsubishi', 'nonMitsubishi', 'mitsubishiShare'):
                self.assertAlmostEqual(row[key], self.result['forecasts']['targets'][key]['intervals'][i]['point'])
        self.assertFalse(self.result['simulation']['phase4Activated'])
        self.assertEqual(self.result['simulation']['status'], 'blocked')

    def test_intervals_are_nested_and_no_nan_is_serialized(self):
        for target in self.result['forecasts']['targets'].values():
            for interval in target['intervals']:
                self.assertTrue(0 <= interval['lo95'] <= interval['lo80'] <= interval['hi80'] <= interval['hi95'])
                self.assertEqual(interval['calibrationN'], 34)
        for interval in self.result['forecasts']['targets']['mitsubishiShare']['intervals']:
            self.assertLessEqual(interval['hi95'], 1)
        content = (ROOT / 'data/scenarios/phase23_models.json').read_text()
        self.assertNotIn('NaN', content)
        self.assertNotIn('Infinity', content)

    def test_poisson_offset_retains_true_zeros_and_recovers_total(self):
        count = np.array([0., 3., 5., 0., 12.])
        population = np.array([10., 20., 40., 10., 80.])
        X = np.ones((len(count), 1))
        beta, se, expected, diag = m.poisson_fit(count, population, X)
        self.assertTrue(diag['converged'])
        self.assertEqual(diag['zeroCounts'], 2)
        self.assertAlmostEqual(expected.sum(), count.sum(), places=7)
        np.testing.assert_allclose(expected / population, count.sum() / population.sum())
        self.assertTrue(np.isfinite(se).all())

    def test_regional_zero_mit_rows_remain_and_labels_are_honest(self):
        r = self.result['regional']
        self.assertTrue(r['diagnostics']['converged'])
        self.assertTrue(r['diagnostics']['mitModel']['converged'])
        self.assertEqual(sum(row['mitObserved'] == 0 for row in r['rows']), r['diagnostics']['zeroMitCounts'])
        self.assertGreater(r['diagnostics']['zeroMitCounts'], 3000)
        self.assertEqual(len(r['rows']), r['diagnostics']['n'])
        self.assertGreater(r['diagnostics']['absentMunicipalitiesNotAssumedZero'], 0)
        self.assertTrue('logHouseholdIncomePerCapita2022' in r['covariates'] or any('householdIncome' in x for x in r['missingCovariates']))
        self.assertIn('logGdpPerCapita', r['covariates'])
        self.assertIn('logDensity2022', r['covariates'])
        self.assertIn('urbanization2022', r['covariates'])
        self.assertIn('logPamValuePerCapita', r['covariates'])
        self.assertGreater(r['diagnostics']['dispersion'], 1)


if __name__ == '__main__': unittest.main()
