#!/usr/bin/env python3
"""Recompute the hash and size of every scenario file listed in data/scenarios/manifest.json (phase123.assetReceipts).
Run after regenerating any of them: python3 scripts/refresh_scenario_receipts.py"""
import hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'data/scenarios/manifest.json'
manifest = json.loads(path.read_text())
changed = []
for receipt in manifest['phase123']['assetReceipts']:
    raw = (path.parent / receipt['file']).read_bytes()
    sha, size = hashlib.sha256(raw).hexdigest(), len(raw)
    if (receipt['sha256'], receipt['bytes']) != (sha, size):
        receipt.update(sha256=sha, bytes=size); changed.append(receipt['file'])
path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
print(json.dumps({'updated': changed}))
