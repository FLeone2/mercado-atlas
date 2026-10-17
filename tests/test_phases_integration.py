import hashlib,json,re,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class IntegrationTest(unittest.TestCase):
 def test_manifest_receipts(self):
  m=json.loads((ROOT/'data/scenarios/manifest.json').read_text());self.assertIn('phase123',m)
  for r in m['phase123']['assetReceipts']:
   p=ROOT/'data/scenarios'/r['file'];self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),r['sha256']);self.assertEqual(p.stat().st_size,r['bytes']);self.assertLess(r['bytes'],25*1024*1024)
 def test_original_data_immutable(self):
  changed=subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=ROOT,text=True).splitlines()
  self.assertFalse([p for p in changed if p.startswith(('data/cubes/','data/origin-cubes/','data/geography/')) or p=='data/manifest.json'])
 def test_all_static_assets_small(self):
  for p in (ROOT/'data/scenarios').rglob('*'):
   if p.is_file():self.assertLess(p.stat().st_size,25*1024*1024,str(p))
 def test_original_simulation_gate(self):
  text=(ROOT/'src/market/modules/scenarios.js').read_text();self.assertIn('Não há modelo exógeno de dois fatores validado',text);self.assertIn('Os filtros globais acima ficam guardados, mas não recalculam',text)
 def test_strict_json(self):
  for p in (ROOT/'data/scenarios').glob('*.json'):
   json.loads(p.read_text(),parse_constant=lambda v:(_ for _ in ()).throw(ValueError(v)))
if __name__=='__main__':unittest.main()
