import json, math, unittest
from pathlib import Path
R=Path(__file__).resolve().parents[1]
class RegionalTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.d=json.loads((R/'data/scenarios/phase2_regional.json').read_text())
 def test_total_preservation(self):
  d=self.d;old=json.loads((R/'data/scenarios/regional.json').read_text());self.assertEqual(sum(r['registrations'] for r in d['states']),d['national']['registrations']);self.assertEqual(sum(r['registrations'] for r in d['municipalities']),sum(r['registrations'] for r in old['municipalities']))
 def test_ql_definition(self):
  d=self.d;s={r['uf']:r for r in d['states']}
  for r in d['municipalities']:
   if r['registrations']:
    self.assertAlmostEqual(r['qlBrazil'],r['mitsubishi']/r['registrations']/d['national']['mitsubishiShare'])
    if s[r['uf']]['mitsubishiShare']:self.assertAlmostEqual(r['qlUF'],r['mitsubishi']/r['registrations']/s[r['uf']]['mitsubishiShare'])
   if r.get('pickups') is not None:self.assertLessEqual(r['tritonL200'],r['pickups']);self.assertLessEqual(r['pickups'],r['registrations'])
 def test_channel_origin_conservation(self):
  for r in self.d['monthlyCoverage']:
   self.assertEqual(r['total'],r['VD']+r['VAREJO']+r['channelUnknown']);self.assertEqual(r['total'],r['LOCAL']+r['IMP']+r['originUnknown'])
  self.assertTrue(any(r['channelUnknown'] for r in self.d['monthlyCoverage'] if r['month']<'2018'))
 def test_classification_documented(self):
  for r in self.d['classificationAudit']['mitsubishiGroups']:
   if r['isTritonL200']:self.assertTrue(r['isPickup']);self.assertTrue('TRITON' in r['group'] or 'L200' in r['group'].replace(' ',''))
 def test_assets_size(self):
  self.assertLess((R/'data/scenarios/phase2_regional.json').stat().st_size,25*1024*1024)
if __name__=='__main__':unittest.main()
