"""Reviewed BD revision fails closed on changed identities or source tuples."""
from pathlib import Path
import importlib.util
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bd_revision',ROOT/'scripts/revise-bd.py');revision=importlib.util.module_from_spec(spec);spec.loader.exec_module(revision)

class BDRevisionTest(unittest.TestCase):
 def test_bd_identity_and_ambiguity_guards(self):
  rule={'bdBrand':'EXAMPLE','bdVersion':'SUV HYBRID','expectedBdFuel':'GASOLINE'}
  record={'fields':[1,'EXAMPLE'],'version':'SUV HYBRID','classification':{'bd_combustivel':'GASOLINE'}}
  revision.validate_propulsion_rule(rule,record,{1:record})
  with self.assertRaisesRegex(ValueError,'code, brand, version and fuel'):
   revision.validate_propulsion_rule(rule,{**record,'version':'SUV GASOLINE'})
  with self.assertRaisesRegex(ValueError,'ambiguous'):
   revision.validate_propulsion_rule(rule,record,{1:record,2:record})
 def test_patch_preserves_source_joint_and_guards_entire_old_classification(self):
  old=revision.ingest.bd_values('PASSENGER','MID','SUV','FFV','IMP');new={**old,'bd_combustivel':'PHEV'}
  dims=['modelo','segmento',*revision.BD_FIELDS]
  rows=[('I/EXAMPLE HYBRID','Auto',*old.values()),('OTHER','Auto',*old.values()),('I/EXAMPLE HYBRID','Comercial Leve',*{**old,'bd_segmento':'LARGE'}.values())]
  cube=revision.ingest.encode_cube('2026-10',dims,{r:1 for r in rows});rule={'code':1,'model':'I/EXAMPLE HYBRID','old':old,'new':new}
  changed,counts,mismatch=revision.patch_cube(cube,[rule])
  self.assertEqual(counts,{1:1});self.assertEqual(mismatch,{1:1})
  self.assertEqual(revision.decoded(cube,True),revision.decoded(changed,True))
  again,counts,_=revision.patch_cube(changed,[rule]);self.assertEqual(counts,{})
  self.assertEqual(revision.decoded(again),revision.decoded(changed))
 def test_monthly_dataset_signature_detects_new_sources_and_metadata_changes(self):
  m={'months':[{'month':'2026-10','cubePath':'a','originCubePath':'b','sha256':'source'}]}
  before=revision.dataset_signature(m);m['months'][0]['propulsionOverrides']=[{'model':'EXAMPLE','propulsion':'HEV'}]
  self.assertNotEqual(before,revision.dataset_signature(m))

if __name__=='__main__':unittest.main()
