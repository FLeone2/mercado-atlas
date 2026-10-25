"""Economia: séries novas na base e o modelo publicado em data/scenarios/econ_model.json."""
import json, math, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import econ_model  # noqa: E402

EXTRA = json.loads((ROOT / 'data/scenarios/econ_extra.json').read_text())
MODEL = json.loads((ROOT / 'data/scenarios/econ_model.json').read_text())


class Sources(unittest.TestCase):
    def test_every_series_has_receipts_and_no_gaps_filled(self):
        for s in EXTRA['series']:
            self.assertEqual(s['status'], 'available', s['key'])
            self.assertTrue(s['receipts'] and all(r['sha256'] and r['url'].startswith('https://') for r in s['receipts']), s['key'])
            months = [r['month'] for r in s['monthly']]
            self.assertEqual(months, sorted(set(months)), s['key'])
            self.assertTrue(all(isinstance(r['value'], float) and math.isfinite(r['value']) for r in s['monthly']), s['key'])

    def test_import_tax_schedule_reaches_35_percent(self):
        last = EXTRA['importTax']['steps'][-1]
        self.assertEqual((last['from'], last['BEV'], last['HEV'], last['PHEV']), ('2026-07', 35, 35, 35))


class Model(unittest.TestCase):
    def test_signs_follow_economics(self):
        for key in ('mercado', 'varejo', 'picape_media'):
            c = {x['key']: x for x in MODEL['models'][key]['coef']}
            self.assertLess(c['rate']['hi90'], 0, key)       # juros mais altos, menos emplacamentos
            self.assertGreater(c['income']['lo90'], 0, key)  # renda maior, mais emplacamentos
        c = {x['key']: x for x in MODEL['models']['picape_media']['coef']}
        self.assertGreater(c['agro']['beta'], 0)

    def test_intervals_and_covariance_are_consistent(self):
        for key, m in MODEL['models'].items():
            for i, c in enumerate(m['coef']):
                self.assertLessEqual(c['lo90'], c['beta']); self.assertGreaterEqual(c['hi90'], c['beta'])
                self.assertAlmostEqual(math.sqrt(m['cov'][i][i]), c['se'], places=9, msg=key)
            self.assertGreater(m['validation']['n'], 12, key)

    def test_retail_and_pickups_beat_persistence_out_of_sample(self):
        for key in ('varejo', 'picape_media'):
            v = MODEL['models'][key]['validation']
            self.assertLess(v['mae'], v['maeNaive'], key)

    def test_workdays_match_the_site_rule(self):
        self.assertEqual(econ_model.workdays('2026-09'), 21)  # mesmo número que a página Mercado mostra
        self.assertEqual(econ_model.workdays('2024-11'), 19)  # 2, 15 e 20 de novembro
        self.assertEqual(econ_model.workdays('2026-02'), 18)  # Carnaval: 16 e 17 de fevereiro

    def test_installment_uses_the_price_formula(self):
        r = MODEL['affordability']['rows'][-1]; a = MODEL['affordability']['assumptions']
        i = (1 + r['rateYear'] / 100) ** (1 / 12) - 1
        self.assertAlmostEqual(r['pmt'], r['price'] * a['financed'] * i / (1 - (1 + i) ** -r['term']), places=6)
        self.assertAlmostEqual(r['price'], a['price'], places=6)


if __name__ == '__main__':
    unittest.main()
