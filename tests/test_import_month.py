"""Stable ingestion contract: preserve rows, bound dates, exact keys, safe cubes."""
from collections import Counter
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from openpyxl.utils.datetime import CALENDAR_MAC_1904, to_excel

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('import_month', ROOT / 'scripts/import-month.py')
ingest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)

HEADERS = ['Data_Emplacamento', 'Estado', 'Municipio', 'Fabricante', 'Modelo',
           'GrupoModeloVeiculo', 'Combustivel', 'Segmento', 'SubSegmento',
           'Tipo Venda', 'Região', 'Modelo_Codigo', 'Numero_Chassis',
           'Numero_Placa', 'CNPJ', 'Razao_Social']


def row(**updates):
    record = dict(zip(HEADERS, ['01/10/2026', 'SP', 'SAO PAULO ', 'EXAMPLE ',
                              'EXAMPLE/SEDAN', 'SEDAN', 'Gasolina', 'Auto',
                              'AU - SEDAN MEDIO', 'VAREJO', 'wrong region',
                              123, 'secret-chassis', 'secret-plate',
                              'secret-cnpj', 'secret-company']))
    record.update(updates)
    return tuple(record.get(header) for header in HEADERS)


def decode(cube):
    return Counter({tuple(cube['dictionaries'][dim][record[i]]
                          for i, dim in enumerate(cube['dimensions'])): record[-1]
                    for record in cube['rows']})


class MonthlyImportTest(unittest.TestCase):
    def setUp(self):
        self.bd = {123: ingest.bd_values('PASSENGER', 'MID', 'SEDAN', 'FFV', 'LOCAL')}

    def test_duplicate_source_rows_are_counted_and_private_values_never_published(self):
        base, origin, receipt = ingest.compile_rows('2026-10', HEADERS, [row(), row()], self.bd)
        self.assertEqual(sum(record[-1] for record in base['rows']), 2)
        self.assertEqual(len(base['rows']), 1)
        self.assertEqual(receipt['qualityTotals']['exact_duplicate_excess_rows'], 1)
        self.assertEqual(receipt['monthEntry']['repeatedChassis'], 1)
        self.assertEqual(receipt['monthEntry']['repeatedPlates'], 1)
        self.assertEqual(receipt['monthEntry']['scope'], [{'segment': 'Auto', 'count': 2}])
        public = json.dumps([base, origin, receipt], ensure_ascii=False)
        for identifier in ['secret-chassis', 'secret-plate', 'secret-cnpj', 'secret-company']:
            self.assertNotIn(identifier, public)
        self.assertNotIn('CNPJ', receipt['analyticalSourceColumns'])
        self.assertEqual(base['dictionaries']['regiao'], ['Sudeste'])
        self.assertEqual(base['dictionaries']['marca'], ['EXAMPLE'])

    def test_invalid_and_out_of_month_rows_do_not_reach_either_cube(self):
        records = [row(), row(Data_Emplacamento='invalid'),
                   row(Data_Emplacamento='2026-11-01'), tuple(None for _ in HEADERS)]
        base, origin, receipt = ingest.compile_rows('2026-10', HEADERS, records, self.bd)
        totals = receipt['qualityTotals']
        self.assertEqual((totals['rows'], totals['eligible_rows'], totals['blank_rows']), (3, 1, 1))
        self.assertEqual((totals['invalid_date_rows'], totals['month_mismatch_rows']), (1, 1))
        self.assertEqual(sum(record[-1] for record in origin['rows']), 1)
        self.assertEqual(base['dictionaries']['date'], ['2026-10-01'])

    def test_exact_numeric_bd_join_never_uses_model_text_or_rounds_a_code(self):
        records = [row(Modelo_Codigo='00123.0'), row(Modelo_Codigo='123.1'),
                   row(Modelo_Codigo=None), row(Modelo_Codigo=True)]
        base, origin, receipt = ingest.compile_rows('2026-10', HEADERS, records, self.bd)
        self.assertEqual(receipt['bdCounts'], {'matched': 1, 'unmatched': 3})
        self.assertEqual(receipt['originCounts'], {'LOCAL': 1, ingest.NO_BD: 3})
        self.assertEqual(base['dictionaries']['bd_classe'], ['SEDAN / MID', ingest.NO_BD])
        empty = ingest.bd_values(None, 'MID', None, None, None)
        self.assertEqual(empty['bd_classe'], ingest.EMPTY_BD)
        self.assertEqual(empty['bd_origem'], ingest.EMPTY_BD)

    def test_origin_projection_preserves_every_joint_cell(self):
        other = ingest.bd_values('PASSENGER', 'MID', 'SEDAN', 'FFV', 'IMP')
        records = [row(), row(Modelo_Codigo=124),
                   row(Modelo_Codigo=124, Estado='RJ', Data_Emplacamento='02/10/2026')]
        base, origin, receipt = ingest.compile_rows('2026-10', HEADERS, records, {**self.bd, 124: other})
        projected = Counter()
        for key, count in decode(origin).items():
            projected[key[:-1]] += count
        self.assertEqual(decode(base), projected)
        self.assertEqual(sorted(origin['rows']), origin['rows'])
        self.assertTrue(all(values == sorted(values) for values in origin['dictionaries'].values()))
        self.assertEqual(base['dictionaries']['regiao'], ['Sudeste'])
        self.assertEqual(receipt['monthEntry']['chassisDateConflictGroups'], 1)

    def test_unmatched_codes_and_incomplete_matched_classifications_are_distinct(self):
        incomplete = ingest.bd_values('PASSENGER', 'MID', None, 'FFV', 'LOCAL')
        _, _, receipt = ingest.compile_rows('2026-10', HEADERS,
                                            [row(Modelo_Codigo=124), row(Modelo_Codigo=999)],
                                            {124: incomplete})
        self.assertEqual(receipt['bdCounts'], {'matched': 1, 'unmatched': 1})
        self.assertEqual(receipt['monthEntry']['bdUnclassifiedRows'], 1)
        self.assertEqual(receipt['bdMatchedWithoutCompleteClass'], 1)

    def test_excel_epochs_and_day_first_dates_are_explicit(self):
        target = dt.datetime(2026, 10, 31)
        for epoch in [ingest.CALENDAR_WINDOWS_1900, CALENDAR_MAC_1904]:
            self.assertEqual(ingest.parse_date(to_excel(target, epoch), epoch), target.date())
        self.assertEqual(ingest.parse_date('03/10/2026'), dt.date(2026, 10, 3))
        self.assertIsNone(ingest.parse_date('31/02/2026'))
        self.assertIsNone(ingest.parse_date(True))

    def test_schema_drift_is_reported_and_missing_keys_fail_before_aggregation(self):
        with self.assertRaisesRegex(ValueError, 'Missing required source columns'):
            ingest.compile_rows('2026-10', ['Estado'], [('SP',)], self.bd)
        with self.assertRaisesRegex(ValueError, 'Duplicate source column'):
            ingest.compile_rows('2026-10', HEADERS + ['Estado'], [], self.bd)
        base, origin, receipt = ingest.compile_rows('2026-10', HEADERS + ['New field'],
                                                   [row() + ('new value',)], self.bd)
        self.assertEqual(receipt['monthEntry']['newColumns'], ['New field'])
        self.assertEqual(receipt['monthEntry']['qualityStatus'], 'review')
        self.assertNotIn('new value', json.dumps(base))

    def test_compression_is_reproducible(self):
        base, _, _ = ingest.compile_rows('2026-10', HEADERS, [row()], self.bd)
        with tempfile.TemporaryDirectory() as directory:
            first, second = Path(directory) / 'first.gz', Path(directory) / 'second.gz'
            ingest.write_cube(first, base)
            ingest.write_cube(second, base)
            self.assertEqual(first.read_bytes(), second.read_bytes())


if __name__ == '__main__':
    unittest.main()
