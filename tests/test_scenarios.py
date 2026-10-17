import json,sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from scenario_statistics import distribution,predict,forecast,lag_correlations
from build_scenarios import norm
ROOT=Path(__file__).resolve().parents[1]/'data/scenarios'

class StatisticsTests(unittest.TestCase):
 def test_distribution_no_normal_assumption(self):
  d=distribution([0,0,1,3,100,None]);self.assertEqual(d['n'],5);self.assertFalse(d['normalityAssumed']);self.assertEqual(sum(x['n'] for x in d['histogram']),5)
 def test_zero_guard(self):
  self.assertEqual(forecast([str(x) for x in range(100)],[0]*100)['status'],'insufficient_data')
 def test_seasonal_naive(self):
  np.testing.assert_array_equal(predict(np.arange(24),3,'seasonal_naive'),[12,13,14])
 def test_no_future_leak(self):
  y=np.arange(129,dtype=float)+100; a=predict(y[:80],6,'seasonal_trend');y[80:]=1e9;b=predict(y[:80],6,'seasonal_trend');np.testing.assert_equal(a,b)
 def test_constant_correlations_are_missing(self):
  months=[f'{2000+i//12}-{1+i%12:02}' for i in range(100)];d=lag_correlations(months,[100]*100,dict.fromkeys(months,5),True);self.assertTrue(all(x['r'] is None for x in d['rows']))
 def test_normalization(self):self.assertEqual(norm('São Paulo'),norm('SAO PAULO'))

class OutputTests(unittest.TestCase):
 def load(self,name):return json.loads((ROOT/name).read_text())
 def test_months_and_scope(self):
  m=self.load('monthly.json');self.assertEqual(len(m['rows']),129);self.assertEqual(sum(x['registrations'] for x in m['rows']),24541931)
 def test_sankey_reconciles(self):
  c=self.load('composition.json');m=self.load('monthly.json');self.assertEqual(sum(x['count'] for x in c['rows']),sum(x['registrations'] for x in m['rows'] if x['month'].startswith('2026')))
 def test_join_audit_reconciles(self):
  r=self.load('regional.json');self.assertEqual(len(r['municipalities']),r['joinAudit']['keys']);self.assertEqual(sum(x['joinStatus']!='matched' for x in r['municipalities']),r['joinAudit']['unmatchedKeys']);self.assertTrue(all(x['code'] is None or len(x['code'])==7 for x in r['municipalities']))
 def test_sample_not_masquerading_as_national(self):
  r=self.load('regional.json');self.assertEqual(len(r['selectedSample']),30);self.assertIn('Not a representative',r['sampleWarning']);self.assertTrue(all(x['gdpYear']==2023 and x['populationYear']==2026 for x in r['selectedSample']))
 def test_forecast_folds_and_intervals(self):
  for f in self.load('forecasts.json')['models'].values():
   self.assertLess(f['validationTargetRange'][1],f['testTargetRange'][0]);self.assertFalse(f['exogenousInputs'])
   for d in f['testPredictions']:self.assertLess(d['trainEndIndex'],d['targetIndex'])
   for d in f['intervals']:self.assertTrue(0<=d['lo95']<=d['lo80']<=d['point']<=d['hi80']<=d['hi95'])
 def test_failed_validation_disclosed(self):
  for f in self.load('forecasts.json')['models'].values():
   if not f['validationPassed']:self.assertEqual(f['usage'],'exploratory_only')
 def test_no_fabricated_simulation(self):self.assertEqual(self.load('macro_analysis.json')['simulation']['status'],'blocked')


class OfficialSourceTests(unittest.TestCase):
 def test_official_data_coverage(self):
  d=json.loads((ROOT/'socioeconomic.json').read_text());self.assertEqual(d['coverage']['populationMunicipalities'],5571);self.assertEqual(d['coverage']['gdpMunicipalities'],5570);self.assertEqual(d['coverage']['populationWithoutGdp'],['5101837'])
 def test_all_macro_sources_have_metadata(self):
  d=json.loads((ROOT/'external_sources.json').read_text());self.assertEqual(len(d['series']),5)
  for s in d['series']:
   self.assertEqual(s['status'],'available');self.assertTrue(s['metadataVerified']);self.assertTrue(all(r['month']<'2026-10' for r in s['monthly']))
 def test_scatter_matches_heatmap(self):
  d=json.loads((ROOT/'macro_analysis.json').read_text())
  for v in d['lagCorrelations'].values():
   for r in v['rows']:
    if r['r'] is not None:
     points=v['pairsByLag'][str(r['lag'])];self.assertAlmostEqual(float(np.corrcoef([p['x'] for p in points],[p['y'] for p in points])[0,1]),r['r'],places=12)
 def test_per1000_units(self):
  d=json.loads((ROOT/'regional.json').read_text())
  for r in d['municipalities']:
   if r['population']:self.assertAlmostEqual(r['registrationsPer1000'],1000*r['registrations']/r['population'])

if __name__=='__main__':unittest.main()
