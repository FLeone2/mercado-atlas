"""Write data/geography/municipal-points.json: one national map position per municipality.

Each state file in data/geography/ is an equirectangular projection centred on
that state; the national state outlines in index.html use one equirectangular
projection for Brazil. Both are linear in longitude and latitude, so mapping a
state's local bounding box onto its national bounding box is an exact affine
transform. The point is the mean of the municipality's outline vertices
(approximate centre, not an address).
"""
from pathlib import Path
import json, re

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text()
m = re.search(r'value\$3 = JSON\.parse\("(.*?)"\);', html, re.S)
national = json.loads(json.loads('"' + m.group(1) + '"'))
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
    lx0 = min(min(v[0::2]) for _, v in feats); ly0 = min(min(v[1::2]) for _, v in feats)
    lx1 = max(max(v[0::2]) for _, v in feats); ly1 = max(max(v[1::2]) for _, v in feats)
    X0, Y0, X1, Y1 = state_box[g['uf']]
    for f, v in feats:
        cx, cy = sum(v[0::2]) / (len(v) / 2), sum(v[1::2]) / (len(v) / 2)
        x = X0 + (cx - lx0) / ((lx1 - lx0) or 1) * (X1 - X0)
        y = Y0 + (cy - ly0) / ((ly1 - ly0) or 1) * (Y1 - Y0)
        rows.append([str(f['code']), f['name'], g['uf'], round(x, 1), round(y, 1)])

out = {'version': 1, 'viewBox': national['viewBox'],
       'columns': ['code', 'name', 'uf', 'x', 'y'],
       'method': 'Centro aproximado (média dos vértices da malha IBGE), convertido para a projeção nacional por caixa delimitadora da UF.',
       'rows': rows}
(root / 'data/geography/municipal-points.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(len(rows), 'municipal points')
