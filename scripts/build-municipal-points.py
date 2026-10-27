"""Write data/geography/municipal-points.json: one national map position per municipality.

Each state file in data/geography/ is an equirectangular projection centred on
that state; the national state outlines (src/market/geo/uf-geometry.json) use one
equirectangular projection for Brazil. Both are linear in longitude and latitude, so
mapping a state's local bounding box onto its national bounding box is an exact affine
transform. The point is the mean of the municipality's outline vertices
(approximate centre, not an address).

Offshore municipalities that the national outline leaves out (Fernando de Noronha,
far off the coast of Pernambuco) do not enter the bounding box: counting them would
squeeze the whole state into a corner of its outline. They keep the same transform,
so they land in the ocean where they are.
"""
from pathlib import Path
import json, re

root = Path(__file__).resolve().parents[1]
national = json.loads((root / 'src/market/geo/uf-geometry.json').read_text())
OFFSHORE = {'2605459'}  # Fernando de Noronha (PE): not part of the national state outline
num = lambda p: [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', p)]

def bbox(points):
    xs, ys = points[0::2], points[1::2]
    return min(xs), min(ys), max(xs), max(ys)

state_box = {f['uf']: bbox(num(f['path'])) for f in national['features']}
rows = []
for path in sorted((root / 'data/geography').glob('[A-Z][A-Z].json')):
    g = json.loads(path.read_text())
    feats = [(f, num(f['path'])) for f in g['features']]
    feats = [(f, v) for f, v in feats if v]
    main = [(f, v) for f, v in feats if str(f['code']) not in OFFSHORE]
    lx0 = min(min(v[0::2]) for _, v in main); ly0 = min(min(v[1::2]) for _, v in main)
    lx1 = max(max(v[0::2]) for _, v in main); ly1 = max(max(v[1::2]) for _, v in main)
    X0, Y0, X1, Y1 = state_box[g['uf']]
    for f, v in feats:
        cx, cy = sum(v[0::2]) / (len(v) / 2), sum(v[1::2]) / (len(v) / 2)
        x = X0 + (cx - lx0) / ((lx1 - lx0) or 1) * (X1 - X0)
        y = Y0 + (cy - ly0) / ((ly1 - ly0) or 1) * (Y1 - Y0)
        rows.append([str(f['code']), f['name'], g['uf'], round(x, 1), round(y, 1)])

out = {'version': 1, 'viewBox': national['viewBox'],
       'columns': ['code', 'name', 'uf', 'x', 'y'],
       'method': 'Centro aproximado (média dos vértices da malha IBGE), convertido para a projeção nacional por caixa delimitadora da UF (sem ilhas oceânicas fora do contorno estadual, como Fernando de Noronha).',
       'rows': rows}
(root / 'data/geography/municipal-points.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(len(rows), 'municipal points')
