import copy
import gzip
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import phase1_sources as sources


def row(variable='93', unit='Pessoas', label='População residente', value='100', code='3550308', period='2022', category='6795'):
    return {'NC': '6', 'D1C': code, 'D1N': 'São Paulo (SP)', 'D2C': variable, 'D2N': label, 'D3C': period, 'D3N': period, 'D4C': category, 'MN': unit, 'V': value}


class ParserTests(unittest.TestCase):
    def test_missing_is_distinct_from_zero(self):
        for value in (None, '', '..', '...', 'X'):
            self.assertIsNone(sources.numeric(value))
        self.assertEqual(sources.numeric('-'), 0)
        self.assertEqual(sources.numeric('0'), 0)
        self.assertEqual(sources.numeric('12.5'), 12.5)

    def test_nonfinite_and_unknown_tokens_are_rejected(self):
        for value in ('NaN', 'Infinity', '-Infinity', 'unexpected'):
            with self.assertRaises(ValueError):
                sources.numeric(value)

    def test_ibge_keys_are_not_silently_padded_or_guessed(self):
        self.assertEqual(sources.ibge_code('3550308'), '3550308')
        for value in ('355030', '35503080', 'foo', None, '0000000', '3550308.0'):
            with self.assertRaises(ValueError):
                sources.ibge_code(value)

    def test_duplicate_rows_fail(self):
        data = [row(), row()]
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            sources.validate_rows(data, {'93': ('Pessoas', 'População')})

    def test_schema_and_units_fail_closed(self):
        for data in ([row(unit='Mil Pessoas')], [row(label='Outra medida')], [row(variable='94')]):
            with self.assertRaises(ValueError):
                sources.validate_rows(data, {'93': ('Pessoas', 'População')})

    def test_urban_ratio_uses_matching_2022_denominator(self):
        municipalities = {}
        sources.populate_source('census_urbanization', [{}, row(value='120'), row(value='90', category='1')], municipalities)
        self.assertEqual(municipalities['3550308']['urbanization2022'], .75)
        self.assertEqual(municipalities['3550308']['censusPopulation2022'], 120)

    def test_urban_missing_not_zero(self):
        municipalities = {}
        sources.populate_source('census_urbanization', [{}, row(value='120'), row(value='...', category='1')], municipalities)
        self.assertIsNone(municipalities['3550308']['urbanization2022'])

    def test_inconsistent_urban_count_fails(self):
        with self.assertRaisesRegex(ValueError, 'Inconsistent'):
            sources.populate_source('census_urbanization', [{}, row(value='120'), row(value='121', category='1')], {})

    def test_reference_period_is_not_relabelled(self):
        with self.assertRaisesRegex(ValueError, 'reference period'):
            sources.populate_source('census_urbanization', [{}, row(period='2023')], {})

    def test_pam_currency_multiplier_and_null(self):
        municipalities = {}
        data = [{}, row(variable='8331', unit='Hectares', label='Área plantada ou destinada à colheita', value='20', period='2025', category='0'), row(variable='215', unit='Mil Reais', label='Valor da produção', value='12.5', period='2025', category='0')]
        sources.populate_source('pam', data, municipalities)
        self.assertEqual(municipalities['3550308']['pamValueBRL'], 12500)
        self.assertEqual(municipalities['3550308']['pamAreaHa'], 20)
        self.assertEqual(municipalities['3550308']['pamYear'], 2025)
        data[2]['V'] = 'X'
        sources.populate_source('pam', data, municipalities)
        self.assertIsNone(municipalities['3550308']['pamValueBRL'])

    def test_pam_categories_cannot_double_count(self):
        with self.assertRaisesRegex(ValueError, 'total products'):
            sources.populate_source('pam', [{}, row(variable='215', unit='Mil Reais', label='Valor da produção', value='12', period='2025', category='123')], {})

    def test_household_income_is_separate_from_gdp_and_head_income(self):
        data = row(variable='13431', unit='Reais', label='Valor do rendimento nominal médio mensal domiciliar per capita', value='2713.36', category='6794')
        data.update(D5C='95253', D6C='95251')
        municipalities = {}
        sources.populate_source('census_household_income', [{}, data], municipalities)
        self.assertEqual(municipalities['3550308']['householdIncomePerCapita2022'], 2713.36)
        self.assertEqual(municipalities['3550308']['householdIncomeYear'], 2022)
        self.assertNotIn('gdpPerCapita', municipalities['3550308'])
        data['D6C'] = 'not_total'
        with self.assertRaisesRegex(ValueError, 'totals for sex, age and race'):
            sources.populate_source('census_household_income', [{}, data], {})

    def test_rolling_quarter_is_explicit_and_not_backtest_eligible(self):
        data = row(variable='5933', unit='Reais', label='Rendimento médio mensal real', period='202608')
        data.update(NC='1', D1C='1', D3N='jun-jul-ago 2026')
        result = sources.monthly_series([data], '5933', 'pnad_real_income', 'Renda', 'BRL real', 'rolling_quarter')
        self.assertEqual(result['monthly'][0]['month'], '2026-08')
        self.assertEqual(result['monthly'][0]['periodLabel'], 'jun-jul-ago 2026')
        self.assertEqual(result['frequency'], 'rolling_quarter')
        self.assertFalse(result['historicalAsOfEligible'])
        self.assertIsNone(result['monthly'][0]['releaseDate'])

    def test_verified_cache_rebuild_never_networks(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = Path(temp)
            raw = b'[{"V":"Valor"},{"V":"1"}]'
            (cache / 'sample.json.gz').write_bytes(gzip.compress(raw))
            receipt = {'url': 'https://apisidra.ibge.gov.br/test', 'sha256': hashlib.sha256(raw).hexdigest()}
            (cache / 'sample.receipt.json').write_text(json.dumps(receipt))
            with mock.patch.object(sources, 'get_bytes', side_effect=AssertionError('Network used during offline build')):
                result, _ = sources.cached_fetch('sample', receipt['url'], cache=cache)
            self.assertEqual(result[1]['V'], '1')
            (cache / 'sample.json.gz').write_bytes(gzip.compress(b'[]'))
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                sources.cached_fetch('sample', receipt['url'], cache=cache)

    def test_cached_url_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = Path(temp)
            raw = b'[]'
            (cache / 'sample.json.gz').write_bytes(gzip.compress(raw))
            (cache / 'sample.receipt.json').write_text(json.dumps({'url': 'https://old.example/', 'sha256': hashlib.sha256(raw).hexdigest()}))
            with self.assertRaisesRegex(ValueError, 'URL or content hash'):
                sources.cached_fetch('sample', 'https://apisidra.ibge.gov.br/new', cache=cache)


class FrozenDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads((ROOT / 'data/scenarios/phase1_sources.json').read_text())

    def test_public_sources_have_receipts_or_explicit_blockers(self):
        for source in self.payload['sources']:
            self.assertEqual(source['releaseVintage'], 'unknown')
            self.assertIsNone(source['releaseDate'])
            if source['status'] == 'available':
                self.assertTrue(source['receipts'])
                self.assertIsNone(source['blocker'])
            else:
                self.assertTrue(source['blocker'])

    def test_raw_hashes_and_asset_budget(self):
        for source in self.payload['sources']:
            for receipt in source['receipts']:
                path = ROOT / receipt['file']
                raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), receipt['sha256'])
        self.assertLess(sum(p.stat().st_size for p in sources.CACHE.iterdir() if p.is_file()), 25 * 1024 * 1024)

    def test_national_series_coverage(self):
        expected = {'ipca_index': 129, 'ipca_monthly': 129, 'ipca_yoy': 129, 'pnad_real_income': 128, 'pnad_real_mass': 128}
        self.assertEqual({s['key']: len(s['monthly']) for s in self.payload['monthlySeries']}, expected)
        for series in self.payload['monthlySeries']:
            self.assertFalse(series['historicalAsOfEligible'])
            self.assertEqual(series['coverageStart'], '2016-01')
            months = [r['month'] for r in series['monthly']]
            self.assertEqual(months, sorted(set(months)))

    def test_municipal_keys_and_measure_bounds(self):
        rows = self.payload['municipalities']
        self.assertEqual(len(rows), len({r['code'] for r in rows}))
        for item in rows:
            self.assertEqual(sources.ibge_code(item['code']), item['code'])
            if item.get('urbanization2022') is not None:
                self.assertGreaterEqual(item['urbanization2022'], 0)
                self.assertLessEqual(item['urbanization2022'], 1)
            for key in ('density2022', 'pamAreaHa', 'pamValueBRL', 'fleetTotal', 'householdIncomePerCapita2022'):
                if item.get(key) is not None:
                    self.assertGreaterEqual(item[key], 0)

    def test_coverage_counts_match_observations(self):
        for key in ('density2022', 'urbanization2022', 'pamAreaHa', 'pamValueBRL', 'fleetTotal', 'householdIncomePerCapita2022'):
            self.assertEqual(self.payload['coverage'][key], sum(row.get(key) is not None for row in self.payload['municipalities']))

    def test_fleet_source_totals_and_types_reconcile(self):
        source = next(r for r in self.payload['sources'] if r['key'] == 'senatran_fleet')
        self.assertEqual(source['coverage']['nationalFleetVehicles'], 133337839)
        self.assertEqual(source['coverage']['matchedFleetVehicles'] + source['coverage']['unmatchedFleetVehicles'], 133337839)
        self.assertTrue(source['coverage']['municipalAndNationalTotalsReconciled'])
        self.assertEqual(source['coverage']['unmatched'], 35)
        for item in self.payload['municipalities']:
            if item.get('fleetTotal') is not None:
                self.assertEqual(sum(item['fleetByType'].values()), item['fleetTotal'])
                self.assertEqual(item['fleetMonth'], '2026-09')

    def test_offline_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(sources, 'get_bytes', side_effect=AssertionError('offline build requested network')), mock.patch('builtins.print'):
            a, b = Path(temp) / 'a.json', Path(temp) / 'b.json'
            sources.build(out=a)
            sources.build(out=b)
            self.assertEqual(a.read_bytes(), b.read_bytes())

    def test_sao_paulo_census_and_pam_spot_check(self):
        item = next(r for r in self.payload['municipalities'] if r['code'] == '3550308')
        self.assertEqual(item['density2022'], 7528.26)
        self.assertAlmostEqual(item['urbanization2022'], 11434786 / 11451999)
        self.assertEqual(item['pamAreaHa'], 1731)
        self.assertEqual(item['pamValueBRL'], 231825000)
        self.assertEqual(item['householdIncomePerCapita2022'], 2713.36)
        self.assertEqual(item['householdIncomeMedian2022'], 1340)


if __name__ == '__main__':
    unittest.main()
