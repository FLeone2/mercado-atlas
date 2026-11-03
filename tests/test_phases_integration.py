import hashlib,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class IntegrationTest(unittest.TestCase):
 def test_manifest_receipts(self):
  m=json.loads((ROOT/'data/scenarios/manifest.json').read_text());self.assertIn('phase123',m)
  for r in m['phase123']['assetReceipts']:
   p=ROOT/'data/scenarios'/r['file'];self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),r['sha256']);self.assertEqual(p.stat().st_size,r['bytes']);self.assertLess(r['bytes'],25*1024*1024)
 def test_original_data_matches_reviewed_baseline(self):
  baseline=json.loads((ROOT/'tests/fixtures/data-baseline.json').read_text())
  paths=['data/manifest.json']
  for folder in ('data/cubes','data/origin-cubes','data/geography'):
   paths.extend(str(p.relative_to(ROOT)) for p in (ROOT/folder).iterdir() if not p.name.startswith('.'))
  self.assertEqual(set(paths),set(baseline))
  for path in paths:self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),baseline[path],path)
 def test_all_static_assets_small(self):
  for p in (ROOT/'data/scenarios').rglob('*'):
   if p.is_file():self.assertLess(p.stat().st_size,25*1024*1024,str(p))
 def test_strict_json(self):
  for p in (ROOT/'data/scenarios').glob('*.json'):
   json.loads(p.read_text(),parse_constant=lambda v:(_ for _ in ()).throw(ValueError(v)))
if __name__=='__main__':unittest.main()
