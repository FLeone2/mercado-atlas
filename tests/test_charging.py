"""Conservation and source-safety regressions for the real public charging snapshot."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import shutil

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('build_charging', ROOT/'scripts/build-charging.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ChargingSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = module.build()

    def test_all_source_counts_survive_geographic_join(self):
        data = self.data
        self.assertEqual(data['totals']['total'], 29866)
        self.assertEqual(data['totals']['ac'], 18469)
        self.assertEqual(data['totals']['dc'], 11397)
        self.assertEqual(data['totals']['rawRows'], 1914)
        self.assertEqual(sum(r['sourceRowCount'] for r in data['places']), 1914)
        for rows in [data['places'], data['states']]:
            self.assertEqual(sum(r['total'] for r in rows), 29866)
            self.assertTrue(all(r['ac'] + r['dc'] == r['total'] for r in rows))
        self.assertEqual(data['totals']['matchedPoints'] + data['totals']['unmatchedPoints'], 29866)
        self.assertEqual(data['totals']['unmatchedPoints'], 52)

    def test_districts_and_non_identical_repeats_are_not_reassigned_or_dropped(self):
        labels = {r['id']:r for r in self.data['places']}
        for name in ['Guará','Sobradinho','Taguatinga']:
            row = labels['DF|' + name]
            self.assertIsNone(row['ibgeCode'])
            self.assertEqual(row['matchStatus'], 'unmatched')
        self.assertEqual(labels['DF|Guará']['total'], 26)
        self.assertEqual(labels['BA|Mata De São João']['sourceRowCount'], 2)
        self.assertEqual(labels['MA|Itapecuru Mirim']['sourceRowCount'], 2)
        self.assertEqual(labels['RS|Soledade']['sourceRowCount'], 2)
        self.assertEqual(len(self.data['states']), 27)
        self.assertEqual(self.data['metadata']['referenceMonth'], '2026-09')
        self.assertEqual(self.data['history'][-1], {'month':'2026-09','total':29866})

    def test_build_rejects_lost_source_rows_before_shipping(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'source'
            shutil.copytree(module.DEFAULT_SOURCE/'values',source/'values')
            path=source/'values/municipal_raw.csv'
            lines=path.read_text(encoding='utf-8-sig').splitlines()
            path.write_text('\n'.join([lines[0],*lines[2:]])+'\n',encoding='utf-8-sig')
            with self.assertRaisesRegex(ValueError,'independently extracted UF totals'):
                module.build(source)

    def test_committed_asset_matches_source_builder(self):
        shipped=json.loads((ROOT/'data/charging/abve.json').read_text())
        self.assertEqual(shipped,self.data)


if __name__ == '__main__':
    unittest.main()
