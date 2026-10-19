"""The Python name rule (scripts/lib/geo_names.py) must stay identical to the site's (src/market/modules/geo-names.js),
and the regional package must keep its municipality links (audit AT-04)."""
import json, subprocess, sys, unittest
from pathlib import Path
R = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(R / 'scripts' / 'lib'))
import geo_names


def js(expression, payload=None):
    code = "const G=require('./src/market/modules/geo-names.js');const input=JSON.parse(require('fs').readFileSync(0,'utf8')||'null');process.stdout.write(JSON.stringify(" + expression + "))"
    return json.loads(subprocess.check_output(['node', '-e', code], cwd=R, input=json.dumps(payload, ensure_ascii=False).encode()))


class GeoNamesTest(unittest.TestCase):
    def test_alias_lists_are_identical(self):
        self.assertEqual(js('G.GEO_ALIAS_PAIRS'), geo_names.ALIAS_PAIRS)

    def test_keys_match_the_site_for_every_catalog_name_and_alias(self):
        catalog = json.loads((R / 'data/geography/catalog-population.json').read_text())['municipalities']
        pairs = [[m['name'], m['uf']] for m in catalog] + [[source, uf] for uf, source, _ in geo_names.ALIAS_PAIRS] + [["Alta Floresta D’Oeste", 'RO'], ['NOVA DO MAMORE', 'RO']]
        site = js('input.map(([n,u])=>G.geoKey(n,u))', pairs)
        self.assertEqual(site, [geo_names.geo_key(n, u) for n, u in pairs])

    def test_regional_package_keeps_its_links(self):
        regional = json.loads((R / 'data/scenarios/regional.json').read_text())
        rows = regional['municipalities']
        unmatched = sorted((r['uf'], r['name']) for r in rows if not r.get('code'))
        self.assertEqual(unmatched, [('MT', 'BOA ESPERANCA DO NORTE'), ('Não informado', 'Não Identificado'), ('PB', 'SAO BENTO DE POMBAL')])
        self.assertEqual(sum(r['registrations'] for r in rows), 2156654)
        self.assertGreater(regional['joinAudit']['registrationCoverage'], 0.9999)
        by_name = {(r['uf'], r['name']): r for r in rows}
        for name, population in [('ALTA FLORESTA DO OESTE', 22724), ('ESPIGAO DO OESTE', 32960), ('NOVA DO MAMORE', 28894), ('SAO FELIPE DO OESTE', 5571)]:
            row = by_name[('RO', name)]
            self.assertTrue(row['code'], name)
            self.assertEqual(row['population'], population)
            self.assertAlmostEqual(row['registrationsPer1000'], 1000 * row['registrations'] / population, places=9)
        phase2 = json.loads((R / 'data/scenarios/phase2_regional.json').read_text())
        self.assertEqual(phase2['coverage']['unmatchedRows'], 61)
        self.assertEqual(phase2['national']['registrations'], 2156654)


if __name__ == '__main__':
    unittest.main()
