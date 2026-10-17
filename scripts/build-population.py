"""Write data/reference/population.json: 2026 population by UF and municipality.

Source: IBGE municipal population estimates already reviewed in
data/scenarios/phase2_regional.json (populationYear 2026). UF totals are the sum
of their municipalities. Used for registrations per 1,000 inhabitants.
Usage: python3 scripts/build-population.py
"""
from pathlib import Path
import collections, json

root = Path(__file__).resolve().parents[1]
regional = json.loads((root / 'data/scenarios/phase2_regional.json').read_text())
rows, states, years = [], collections.Counter(), set()
for m in regional['municipalities']:
    if not m.get('population'):
        continue
    rows.append([m['code'], m['name'], m['uf'], int(m['population'])])
    states[m['uf']] += int(m['population'])
    years.add(m.get('populationYear'))
out = {'version': 1, 'year': sorted(y for y in years if y)[-1], 'source': 'IBGE, estimativas municipais de população',
       'states': dict(sorted(states.items())), 'columns': ['code', 'name', 'uf', 'population'], 'municipalities': rows}
(root / 'data/reference').mkdir(exist_ok=True)
(root / 'data/reference/population.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(len(rows), 'municipalities,', sum(states.values()), 'inhabitants,', len(states), 'UFs')
