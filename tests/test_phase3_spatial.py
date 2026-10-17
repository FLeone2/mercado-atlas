import copy
import importlib.util
import itertools
import json
from pathlib import Path
import struct
import tempfile
import unittest

import numpy as np
from scipy.sparse import csr_matrix

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('phase3_spatial', ROOT / 'scripts/phase3_spatial.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class GeometryAndMathTests(unittest.TestCase):
    def test_polygon_centroid_holes_and_multipart(self):
        # Exterior 4 x 4, with a 1 x 1 hole off-center; signed ring orientation.
        outer = [(-50, -10), (-50, -6), (-46, -6), (-46, -10), (-50, -10)]
        hole = [(-49, -9), (-48, -9), (-48, -8), (-49, -8), (-49, -9)]
        expected = (16 * np.array([-48, -8]) - np.array([-48.5, -8.5])) / 15
        np.testing.assert_allclose(s.polygon_centroid(outer + hole, [0, 5]), expected)
        second = [(-46, -10), (-46, -8), (-44, -8), (-44, -10), (-46, -10)]
        np.testing.assert_allclose(s.polygon_centroid(outer + second, [0, 5]), (16 * np.array([-48, -8]) + 4 * np.array([-45, -9])) / 20)

    def test_centroid_rejects_svg_and_invalid_rings(self):
        with self.assertRaises(ValueError):
            s.polygon_centroid([(0, 0), (600, 0), (600, 300), (0, 0)], [0])
        with self.assertRaises(ValueError):
            s.polygon_centroid([(-50, -10), (-49, -10), (-49, -9), (-50, -9)], [0])

    def test_dbf_reader_alignment(self):
        raw = bytearray(65 + 8)
        struct.pack_into('<IHH', raw, 4, 1, 65, 8)
        raw[32:38] = b'CD_MUN'
        raw[43], raw[48], raw[64] = ord('C'), 7, 13
        raw[65:] = b' 3550308'
        self.assertEqual(s.dbf_records(raw), [{'CD_MUN': '3550308'}])
        raw[65] = ord('*')
        with self.assertRaises(ValueError):
            s.dbf_records(raw)

    def test_official_archive_hash_rejects_unverified_bytes(self):
        with tempfile.NamedTemporaryFile() as file:
            file.write(b'not the official archive')
            file.flush()
            with self.assertRaisesRegex(ValueError, 'pinned'):
                s.read_official_zip(file.name)

    def test_spherical_knn_is_symmetric_and_has_no_isolates(self):
        coordinates = [(-50, -10), (-49, -10), (-48, -10), (-30, -5), (-30, -5)]
        w, diagnostics = s.symmetric_knn(coordinates, 1)
        self.assertEqual((w != w.T).nnz, 0)
        self.assertTrue(np.all(w.diagonal() == 0))
        self.assertEqual(diagnostics['isolates'], [])
        self.assertEqual(diagnostics['components'], 2)
        self.assertTrue(np.all(np.asarray(w.sum(axis=1)).ravel() >= 1))
        self.assertEqual(diagnostics['edgeSha256'], s.sha256(s.canonical(diagnostics['edges'])))
        self.assertEqual(s.symmetric_knn(coordinates, 1)[1], diagnostics)
        with self.assertRaises(ValueError):
            s.symmetric_knn(coordinates, 5)

    def test_residuals_zeros_and_invalid_expected(self):
        np.testing.assert_allclose(s.residuals([0, 4], [2, 4], 'pearson'), [-np.sqrt(2), 0])
        np.testing.assert_allclose(s.residuals([0, 4], [2, 4], 'deviance'), [-2, 0])
        with self.assertRaises(ValueError):
            s.residuals([1], [0], 'pearson')
        with self.assertRaises(ValueError):
            s.residuals([-1], [1], 'deviance')

    def test_moran_matches_direct_formula_and_constant_rejected(self):
        w = csr_matrix([[0, 1, 0], [1, 0, 1], [0, 1, 0]], dtype=float)
        x = np.array([1., 2., 4.])
        z = x - x.mean()
        expected = 3 / 4 * sum(w[i, j] * z[i] * z[j] for i in range(3) for j in range(3)) / sum(z * z)
        self.assertAlmostEqual(s.moran(x, w), expected)
        self.assertAlmostEqual(s.moran(5 * x + 3, w), expected)
        with self.assertRaises(ValueError):
            s.moran(np.ones(3), w)

    def test_conditional_expectation_matches_exhaustive_enumeration(self):
        w = csr_matrix([[0, 1, 1, 0, 1], [1, 0, 0, 0, 0], [1, 0, 0, 1, 1], [0, 0, 1, 0, 0], [1, 0, 1, 0, 0]], dtype=float)
        z = np.array([1., 5., -2., 2., 3.])
        groups = [np.array([0, 1]), np.array([2, 3]), np.array([4])]
        values = [s.moran(z[list(a) + list(b) + [4]], w) for a in itertools.permutations([0, 1]) for b in itertools.permutations([2, 3])]
        self.assertAlmostEqual(s.conditional_expectation(z, w, groups)[0], np.mean(values))
        all_group = [np.arange(5)]
        self.assertAlmostEqual(s.conditional_expectation(z, w, all_group)[0], -1 / 4)

    def test_permutation_p_value_matches_independent_loop(self):
        w = csr_matrix([[0, 1, 1, 0, 1], [1, 0, 0, 0, 0], [1, 0, 0, 1, 1], [0, 0, 1, 0, 0], [1, 0, 1, 0, 0]], dtype=float)
        z = np.array([1., 5., -2., 2., 3.])[:, None]
        groups = [np.array([0, 1]), np.array([2, 3]), np.array([4])]
        result = s.permutation_diagnostics(z, [w], groups, count=99, seed=7)[0][0]
        rng = np.random.default_rng(7)
        sims = []
        for _ in range(99):
            index = np.arange(5)
            for group in groups:
                index[group] = rng.permutation(group)
            sims.append(s.moran(z[index, 0], w))
        center = s.conditional_expectation(z, w, groups)[0]
        extreme = sum(abs(x - center) >= abs(s.moran(z[:, 0], w) - center) - 1e-14 for x in sims)
        self.assertEqual(result['pValue'], (extreme + 1) / 100)
        self.assertEqual(result['extremePermutations'], extreme)
        self.assertEqual(s.permutation_diagnostics(z, [w], groups, count=99, seed=7)[0][0], result)

    def test_blocked_artifact_has_exact_reason_and_no_invented_results(self):
        value = s.blocked({'regional': {'rows': []}}, 'abc', ValueError('Cached derived geographic coordinates failed SHA-256 verification'))
        self.assertEqual(value['status'], 'blocked')
        self.assertIn('SHA-256', value['reason'])
        self.assertEqual(value['results'], [])
        self.assertEqual(value['sensitivity'], [])
        self.assertFalse(value['provenance']['phase4Activated'])

    def test_holm_and_partition_validation(self):
        np.testing.assert_allclose(s.holm([.01, .04, .03]), [.03, .06, .06])
        with self.assertRaises(ValueError):
            s.permutation_diagnostics(np.arange(3.)[:, None], [csr_matrix(np.ones((3, 3)) - np.eye(3))], [np.array([0, 1])], 10)


class ArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = ROOT / 'data/scenarios/phase3_spatial.json'
        cls.data = json.loads(cls.path.read_text())
        cls.model = json.loads((ROOT / 'data/scenarios/phase23_models.json').read_text())

    def test_receipts_and_input_hash(self):
        d = self.data
        self.assertEqual(d['schemaVersion'], 'phase3-spatial-1.0.0')
        self.assertEqual(d['status'], 'available_exploratory')
        s.validate_geographic_cache(d['source'], d['geography']['centroids'])
        self.assertEqual(d['input']['sha256'], s.file_hash(ROOT / d['input']['path']))
        self.assertEqual(d['source']['geometryRecords'], 5573)
        self.assertFalse(d['source']['rawBundled'])
        self.assertFalse(d['provenance']['phase4Activated'])
        self.assertFalse(d['provenance']['sarSemFitted'])
        self.assertLess(self.path.stat().st_size, 25 * 1024 * 1024)
        bad = copy.deepcopy(d['geography']['centroids'])
        bad[0]['lat'] += .01
        with self.assertRaises(ValueError):
            s.validate_geographic_cache(d['source'], bad)

    def test_real_coordinates_known_city_and_geometry_coverage(self):
        d = self.data
        geo = {r['code']: r for r in d['geography']['centroids']}
        sp = geo['3550308']
        self.assertTrue(-47 < sp['lon'] < -46)
        self.assertTrue(-24.5 < sp['lat'] < -23)
        self.assertEqual(sp['uf'], 'SP')
        model_codes = {r['code'] for r in self.model['regional']['rows']}
        self.assertEqual(set(d['coverage']['codeOrder']), model_codes & set(geo))
        self.assertEqual(set(d['coverage']['excludedCodes']), model_codes - set(geo))
        self.assertEqual(len(set(d['coverage']['codeOrder'])), d['weights']['n'])

    def test_rebuild_matrix_and_all_reported_moran_statistics(self):
        d = self.data
        geo = {r['code']: r for r in d['geography']['centroids']}
        fitted = {r['code']: r for r in self.model['regional']['rows']}
        rows = [fitted[code] for code in d['coverage']['codeOrder']]
        coordinates = [(geo[r['code']]['lon'], geo[r['code']]['lat']) for r in rows]
        for entry in [{'weights': d['weights'], 'results': d['results']}] + d['sensitivity']:
            w, metadata = s.symmetric_knn(coordinates, entry['weights']['k'])
            self.assertEqual(metadata, entry['weights'])
            self.assertTrue(metadata['symmetric'])
            self.assertTrue(metadata['diagonalZero'])
            self.assertEqual(metadata['isolates'], [])
            for result, spec in zip(entry['results'], s.RESULT_SPECS):
                _, _, kind, observed, expected = spec
                residual = s.residuals([r[observed] for r in rows], [r[expected] for r in rows], kind)
                self.assertAlmostEqual(s.moran(residual, w), result['moranI'], places=12)
                self.assertGreaterEqual(result['pValue'], .0001)
                self.assertLessEqual(result['pValue'], 1)
                self.assertEqual(result['permutations'], 9999)

    def test_scatter_slope_and_family_adjustment(self):
        for result in self.data['results']:
            z = np.array([r['standardizedResidual'] for r in result['scatterRows']])
            lag = np.array([r['spatialLag'] for r in result['scatterRows']])
            self.assertAlmostEqual(np.sum(z * lag) / np.sum(z * z), result['moranI'], places=12)
            self.assertAlmostEqual(z.mean(), 0, places=12)
            self.assertAlmostEqual(np.mean(z * z), 1, places=12)
        results = self.data['results'] + [r for entry in self.data['sensitivity'] for r in entry['results']]
        self.assertEqual(len(results), 12)
        np.testing.assert_allclose(s.holm([r['pValue'] for r in results]), [r['pAdjustedHolm'] for r in results])
        self.assertEqual(self.data['permutation']['scheme'], 'within_uf')
        self.assertEqual(self.data['permutation']['seed'], 20261015)


if __name__ == '__main__':
    unittest.main()
