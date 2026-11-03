"""Check source receipts against real cube domains and reject silent metadata drift."""
import copy
import gzip
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('append_month', ROOT / 'scripts/append-month.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class AppendMetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.receipt = json.loads((ROOT / 'data/imports/2026-10.json').read_text())
        cls.base = json.loads(gzip.decompress((ROOT / 'data' / cls.receipt['monthEntry']['cubePath']).read_bytes()))
        cls.origin = json.loads(gzip.decompress((ROOT / 'data' / cls.receipt['monthEntry']['originCubePath']).read_bytes()))
        # Public receipts omit duplicated full dictionaries; the staged receipt
        # carries these domains and must match them before publishing filters.
        cls.receipt['dimensionChoices'] = cls.base['dictionaries']
        cls.base_cells, cls.origin_cells = MODULE.cells(cls.base), MODULE.cells(cls.origin)

    def validate(self, receipt):
        MODULE.validate_metadata(receipt, self.base, self.origin, self.base_cells, self.origin_cells)

    def test_verified_october_receipt_matches_cube(self):
        self.validate(self.receipt)

    def test_wrong_origin_mix_rejected_even_when_grand_total_is_correct(self):
        receipt = copy.deepcopy(self.receipt)
        receipt['originCounts']['LOCAL'] += 1
        receipt['originCounts']['IMP'] -= 1
        with self.assertRaisesRegex(ValueError, 'origin counts'):
            self.validate(receipt)

    def test_missing_filter_value_rejected(self):
        receipt = copy.deepcopy(self.receipt)
        receipt['dimensionChoices']['modelo'].pop()
        with self.assertRaisesRegex(ValueError, 'filter domains'):
            self.validate(receipt)

    def test_wrong_bd_coverage_rejected_even_when_total_is_correct(self):
        receipt = copy.deepcopy(self.receipt)
        receipt['bdCounts']['matched'] += 1
        receipt['bdCounts']['unmatched'] -= 1
        with self.assertRaisesRegex(ValueError, 'BD coverage'):
            self.validate(receipt)


if __name__ == '__main__':
    unittest.main()
