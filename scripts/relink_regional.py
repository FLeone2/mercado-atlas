#!/usr/bin/env python3
"""Re-link registration municipalities to IBGE codes in data/scenarios/regional.json with the shared name rule
(scripts/lib/geo_names.py = src/market/modules/geo-names.js). Only rows that have no code are touched: matched rows,
totals and the 30-row sample stay exactly as they were. Run, then rebuild what derives from it (see README):
    python3 scripts/relink_regional.py && python3 scripts/phase2_regional.py && python3 scripts/phase23_models.py && python3 scripts/phase3_spatial.py
Boundary: a name that finds no single municipality with an outline stays unmatched (never guessed, never zero)."""
import collections, glob, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts' / 'lib'))
from geo_names import geo_key


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')


def relink(root=ROOT):
    scen = root / 'data/scenarios'
    regional = json.loads((scen / 'regional.json').read_text())
    socio = {r['code']: r for r in json.loads((scen / 'socioeconomic.json').read_text())['rows']}
    lookup = collections.defaultdict(set)
    for path in sorted((root / 'data/geography').glob('*.json')):
        geo = json.loads(path.read_text())
        if isinstance(geo, dict) and 'features' in geo:
            for f in geo['features']:
                lookup[(f['uf'], geo_key(f['name'], f['uf']))].add(f['code'])
    rows, relinked, regs = regional['municipalities'], 0, 0
    used = {r['code'] for r in rows if r.get('code')}
    for row in rows:
        if row.get('code'):
            continue
        codes = lookup.get((row['uf'], geo_key(row['name'], row['uf'])), set())
        if len(codes) != 1:
            continue
        code = next(iter(codes))
        if code in used:  # another registration spelling already owns this municipality: merging would be a guess
            continue
        ext = socio.get(code, {})
        row.update({'code': code, 'joinStatus': 'matched'})
        row.update({k: ext.get(k) for k in ['population', 'populationYear', 'gdpPerCapita', 'gdpYear', 'boundaryAttention']})
        row['registrationsPer1000'] = 1000 * row['registrations'] / ext['population'] if ext.get('population', 0) else None
        used.add(code); relinked += 1; regs += row['registrations']
    matched = [r for r in rows if r.get('code')]
    unmatched = [r for r in rows if not r.get('code')]
    total = sum(r['registrations'] for r in rows)
    audit = regional['joinAudit']
    audit.update({'keys': len(rows), 'matchedKeys': len(matched), 'unmatchedKeys': len(unmatched),
                  'registrationCoverage': sum(r['registrations'] for r in matched) / total, 'unmatched': unmatched,
                  'relink': {'rule': 'geo-names: accents, apostrophes and de/do/da ignored, plus UF-scoped aliases', 'rowsRelinked': relinked, 'registrationsRelinked': regs}})
    write(scen / 'regional.json', regional)
    return {'relinked': relinked, 'registrations': regs, 'matchedKeys': len(matched), 'unmatchedKeys': len(unmatched), 'coverage': audit['registrationCoverage']}


if __name__ == '__main__':
    print(json.dumps(relink(), ensure_ascii=False))
