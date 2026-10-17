"""Source conservation, chronology, grouped reconciliation and artifact checks."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('phase3_hierarchy', ROOT / 'scripts/phase3_hierarchy.py')
hierarchy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hierarchy)


class HierarchyMathTests(unittest.TestCase):
    def setUp(self):
        self.nodes, self.bottom, self.summing = hierarchy.summing_structure(['SP', 'RJ', 'UNKNOWN'])
        rng = np.random.default_rng(42)
        leaves = rng.poisson(30, size=(96, len(self.bottom))).astype(float)
        leaves[:, 0] += np.arange(96) * .6
        self.history = leaves @ self.summing.T

    def test_summing_matrix_full_rank_and_disjoint_leaves(self):
        self.assertEqual(np.linalg.matrix_rank(self.summing), len(self.bottom))
        keys = [n['key'] for n in self.nodes]
        np.testing.assert_array_equal(self.summing[[keys.index(k) for k in self.bottom]], np.eye(len(self.bottom)))
        np.testing.assert_array_equal(self.summing[0], np.ones(len(self.bottom)))

    def test_base_does_not_read_future(self):
        changed = self.history.copy()
        changed[60:] *= 1000000
        np.testing.assert_array_equal(hierarchy.base_forecast(changed, 60), hierarchy.base_forecast(self.history, 60))

    def test_covariance_uses_training_only_and_is_positive_definite(self):
        changed = self.history.copy()
        changed[60:] *= 1000000
        covariance, audit = hierarchy.training_covariance(self.history, 60)
        changed_covariance, changed_audit = hierarchy.training_covariance(changed, 60)
        np.testing.assert_array_equal(covariance, changed_covariance)
        self.assertEqual(audit, changed_audit)
        self.assertEqual(audit['nResidualMonths'], 24)
        self.assertLess(audit['lastResidualIndex'], 60)
        self.assertGreater(np.min(np.linalg.eigvalsh(covariance)), 0)

    def test_reconciliation_preserves_coherent_nonnegative_input(self):
        original = self.history[-12:]
        covariance = np.diag(np.arange(1, len(self.nodes) + 1))
        reconciled, _ = hierarchy.reconcile_nonnegative(original, self.summing, covariance)
        np.testing.assert_allclose(reconciled, original, rtol=1e-11, atol=1e-9)

    def test_nonnegative_projection_beats_arbitrary_clipping_objective(self):
        # Inconsistent aggregate/split values require an active leaf bound.
        nodes, bottom, summing = hierarchy.summing_structure(['SP'])
        base = np.array([[2., 100., -90., 5., -180., 100.]])
        covariance = np.eye(len(nodes))
        reconciled, audit = hierarchy.reconcile_nonnegative(base, summing, covariance)
        unconstrained = np.linalg.lstsq(summing, base.T, rcond=None)[0].T
        clipped = np.maximum(unconstrained, 0) @ summing.T
        self.assertEqual(audit['nonnegativeConstrainedSteps'], 1)
        self.assertGreaterEqual(reconciled.min(), 0)
        self.assertLessEqual(np.sum((reconciled - base) ** 2), np.sum((clipped - base) ** 2) + 1e-9)
        errors = hierarchy.coherence_errors(reconciled, nodes, ['SP'])
        self.assertLess(errors['maxNationalMinusUfSum'], 1e-9)
        self.assertLess(errors['maxTotalMinusMitAndNonMit'], 1e-9)

    def test_independent_node_models_are_actually_incoherent(self):
        base = hierarchy.base_forecast(self.history, 60)
        errors = hierarchy.coherence_errors(base, self.nodes, ['SP', 'RJ', 'UNKNOWN'])
        self.assertGreater(max(errors['maxNationalMinusUfSum'], errors['maxTotalMinusMitAndNonMit']), .001)

    def test_mase_excludes_constant_zero_scale_but_mae_keeps_it(self):
        actual = np.zeros((2, 12, 2))
        predicted = np.ones((2, 12, 2))
        scale = np.tile([0., 2.], (2, 1))
        metrics = hierarchy.summarize_errors(actual, predicted, scale, [0, 1])
        self.assertEqual(metrics['mae'], 1)
        self.assertEqual(metrics['mase'], .5)
        self.assertEqual(metrics['nPredictions'], 48)
        self.assertEqual(metrics['nScaledPredictions'], 24)
        self.assertEqual([r['nPredictions'] for r in metrics['byHorizon']], [12, 24, 48])


class HierarchyArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = ROOT / 'data/scenarios/phase3_hierarchy.json'
        cls.data = json.loads(cls.path.read_text())
        cls.keys = [n['key'] for n in cls.data['nodes']]
        cls.history = np.array([[r['nodes'][key] for key in cls.keys] for r in cls.data['history']])
        cls.geographies = cls.data['geography']['states']

    def assertCoherent(self, array):
        errors = hierarchy.coherence_errors(array, self.data['nodes'], self.geographies)
        self.assertLessEqual(errors['maxNationalMinusUfSum'], 1e-7)
        self.assertLessEqual(errors['maxTotalMinusMitAndNonMit'], 1e-7)
        self.assertGreaterEqual(errors['minimumPrediction'], 0)

    def test_all_129_months_conserve_manifest_and_monthly(self):
        manifest = json.loads((ROOT / 'data/manifest.json').read_text())
        monthly = json.loads((ROOT / 'data/scenarios/monthly.json').read_text())['rows']
        self.assertEqual(len(self.data['history']), 129)
        self.assertEqual([r['month'] for r in self.data['history']], manifest['expectedMonths'])
        self.assertEqual(self.data['sourceAudit']['manifestSha256'], hashlib.sha256((ROOT / 'data/manifest.json').read_bytes()).hexdigest())
        np.testing.assert_array_equal(self.history[:, 0], [r['registrations'] for r in monthly])
        np.testing.assert_array_equal(self.history[:, 1], [r['mitsubishi'] for r in monthly])
        self.assertCoherent(self.history)
        for receipt, audit in zip(manifest['months'], self.data['sourceAudit']['receipts']):
            self.assertEqual(audit['sourceTotal'], receipt['lightVehicleRows'])
            self.assertEqual(audit['sha256'], receipt['originCubeSha256'])
            self.assertTrue(audit['conserved'])

    def test_all_original_cube_counts_match_every_geographic_leaf(self):
        # Deliberately read original inputs independently from the build loader.
        # This test guards against dropping unknown UF, model-name brand inference,
        # accidental segment exclusions, joins, duplicate removal and stale assets.
        for audit, stored in zip(self.data['sourceAudit']['receipts'], self.data['history']):
            raw = (ROOT / 'data' / audit['path']).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), audit['sha256'])
            cube = json.loads(gzip.decompress(raw))
            cols = {name: i for i, name in enumerate(cube['columns'])}
            dictionaries = cube['dictionaries']
            leaf_counts = {key: 0 for key in self.data['bottomKeys']}
            for row in cube['rows']:
                if dictionaries['segmento'][row[cols['segmento']]] not in ('Auto', 'Comercial Leve'):
                    continue
                raw_uf = dictionaries['uf'][row[cols['uf']]]
                uf = raw_uf if raw_uf in hierarchy.UF_CODES else 'UNKNOWN'
                brand = dictionaries['marca'][row[cols['marca']]].strip().upper()
                leaf_counts[f'{uf}:{"mit" if brand == "MITSUBISHI" else "nonMit"}'] += row[cols['count']]
            for key, value in leaf_counts.items(): self.assertEqual(value, stored['nodes'][key], f'{audit["month"]} {key}')

    def test_unknown_and_complements_are_kept(self):
        self.assertEqual(len(self.geographies), 28)
        self.assertEqual(set(self.geographies) - {'UNKNOWN'}, set(hierarchy.UF_CODES))
        self.assertGreater(self.data['sourceAudit']['unknownUfRows'], 0)
        unknown_index = self.keys.index('UNKNOWN:total')
        self.assertEqual(int(self.history[:, unknown_index].sum()), self.data['sourceAudit']['unknownUfRows'])
        self.assertEqual(self.data['sourceAudit']['totalRows'], int(self.history[:, 0].sum()))

    def test_protocol_matches_national_complete_paths(self):
        national = json.loads((ROOT / 'data/scenarios/phase23_models.json').read_text())['protocol']
        protocol = self.data['protocol']
        for key in ('initialTrainingMonths', 'validationOrigins', 'testOrigins', 'validationTargetRange', 'testTargetRange', 'nValidationOrigins', 'nTestOrigins'):
            self.assertEqual(protocol[key], national[key], key)
        self.assertEqual(protocol['nValidationOrigins'], 34)
        self.assertEqual(protocol['nTestOrigins'], 13)
        self.assertEqual(protocol['forecastPathLength'], 12)
        for audit in self.data['reconciliationAudit']['covarianceFits']:
            self.assertLess(audit['lastResidualIndex'], audit['originIndex'])
            self.assertEqual(audit['nResidualMonths'], audit['originIndex'] - 36)
            self.assertGreater(audit['minimumEigenvalue'], 0)

    def test_selection_uses_validation_coherent_candidates_only(self):
        candidates = self.data['selection']['eligibleCandidates']
        expected = min(candidates, key=lambda key: self.data['validation'][key]['allNodes']['mase'])
        self.assertEqual(self.data['selectedModel'], expected)
        self.assertNotIn('seasonal_growth_base_unreconciled', candidates)
        self.assertFalse(self.data['selection']['selectedUsingTest'])
        self.assertFalse(self.data['validationPassed'])

    def test_all_test_paths_and_metrics_are_recomputable(self):
        nodes = self.data['nodes']
        for model, records in self.data['candidateTestPredictions'].items():
            self.assertEqual(len(records), 13 * 12)
            origins = sorted(set(r['originIndex'] for r in records))
            self.assertEqual(origins, list(range(105, 118)))
            predicted = np.array([[r['predicted'][key] for key in self.keys] for r in records]).reshape(13, 12, len(nodes))
            actual = np.array([[r['actual'][key] for key in self.keys] for r in records]).reshape(13, 12, len(nodes))
            scales = np.asarray([np.mean(np.abs(self.history[12:o] - self.history[:o - 12]), axis=0) for o in origins])
            recomputed = hierarchy.group_metrics(actual, predicted, scales, nodes)
            self.assertEqual(recomputed, self.data['test'][model])
            for origin in origins:
                rs = [r for r in records if r['originIndex'] == origin]
                self.assertEqual([r['horizon'] for r in rs], list(range(1, 13)))
                for row in rs:
                    index = origin + row['horizon'] - 1
                    self.assertEqual(row['month'], self.data['history'][index]['month'])
                    self.assertEqual(row['actual'], self.data['history'][index]['nodes'])
            if self.data['models'][model]['coherent']: self.assertCoherent(predicted.reshape(-1, len(nodes)))
        self.assertEqual(self.data['selectedTestPredictions'], self.data['candidateTestPredictions'][self.data['selectedModel']])

    def test_future_selected_and_all_coherent_candidates_conserve(self):
        self.assertEqual(len(self.data['futureForecasts']), 12)
        self.assertEqual([r['month'] for r in self.data['futureForecasts']], [hierarchy.add_month('2026-09', h) for h in range(1, 13)])
        self.assertEqual(self.data['futureForecasts'], self.data['candidateFutureForecasts'][self.data['selectedModel']])
        for model, rows in self.data['candidateFutureForecasts'].items():
            array = np.array([[r['nodes'][key] for key in self.keys] for r in rows])
            self.assertTrue(np.isfinite(array).all())
            if self.data['models'][model]['coherent']: self.assertCoherent(array)

    def test_baseline_is_exact_previous_year_not_top_down_share(self):
        for row in self.data['candidateTestPredictions']['seasonal_naive_bottom_up']:
            source = self.data['history'][row['originIndex'] + row['horizon'] - 13]
            self.assertEqual(row['predicted'], source['nodes'])
        for h, row in enumerate(self.data['candidateFutureForecasts']['seasonal_naive_bottom_up']):
            self.assertEqual(row['nodes'], self.data['history'][-12 + h]['nodes'])

    def test_independent_bases_really_adjusted_and_no_false_interval_claim(self):
        audit = self.data['reconciliationAudit']['test']
        self.assertGreater(audit['seasonal_growth_base_unreconciled']['maxNationalMinusUfSum'], 1)
        self.assertLess(audit['mint_shrink_nonnegative']['maxNationalMinusUfSum'], 1e-7)
        self.assertTrue(any(r['maxAbsoluteBaseAdjustment'] > 1 for r in self.data['reconciliationAudit']['covarianceFits']))
        self.assertIn('Not estimated', self.data['protocol']['intervals'])
        self.assertTrue(all('lo80' not in r for r in self.data['futureForecasts']))

    def test_static_asset_limit(self):
        self.assertLess(self.path.stat().st_size, 25 * 1024 * 1024)


if __name__ == '__main__':
    unittest.main()
