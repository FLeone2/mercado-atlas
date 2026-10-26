"""Write data/history/: compact monthly aggregates of the full series (2016 onward).

Long-range analyses (sazonalidade, ritmo por dia útil, anomalias, modelo × modelo,
decomposição da variação, eletrificação) need ten years of monthly totals. Loading
129 monthly cubes (~110 MB) in the browser for that is too slow, so the build sums
the same cubes once, with the same labels the market worker uses:

  national.json.gz  month × segmento × marca × grupo_modelo × bd_segmento × bd_carroceria × combustivel × propulsao × tipo_venda
  uf.json.gz        month × uf × segmento × marca × bd_segmento × bd_carroceria × combustivel × propulsao × tipo_venda
  versions.json.gz  the national dimensions plus modelo (a versão do Renavam), loaded only by the version panels

Every row of every cube is counted once in each file, so totals match the cubes
exactly (tests/history-aggregates.test.cjs checks this against the worker).
Filters on dimensions that are not in a file cannot be applied to it; the panels
that read these files say which filters they ignore.

Usage: python3 scripts/build-history.py   (rerun whenever data/cubes changes)
"""
from pathlib import Path
import collections, gzip, json

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'data/manifest.json').read_text())
UNKNOWN = 'Não informado'
ICE = {'GASOLINE', 'FFV', 'DIESEL', 'ETANOL', 'ETHANOL', 'TETRAFUEL', 'GNV'}
ELECTRIC = {'HEV', 'PHEV', 'BEV', 'MHEV', 'FCEL'}
FILES = {
    'national': ['segmento', 'marca', 'grupo_modelo', 'bd_segmento', 'bd_carroceria', 'combustivel', 'propulsao', 'tipo_venda'],
    'uf': ['uf', 'segmento', 'marca', 'bd_segmento', 'bd_carroceria', 'combustivel', 'propulsao', 'tipo_venda'],
    'versions': ['segmento', 'marca', 'grupo_modelo', 'modelo', 'bd_segmento', 'bd_carroceria', 'combustivel', 'propulsao', 'tipo_venda'],
}


def label(v):
    return UNKNOWN if v is None else str(v)


def propulsion(v):
    v = str(v or '').strip().upper()
    return 'ICE' if v in ICE else v if v in ELECTRIC else 'Não classificado'


def month_end(month):
    y, m = int(month[:4]), int(month[5:7])
    nxt = (y + (m == 12), 1 if m == 12 else m + 1)
    import datetime
    return (datetime.date(*nxt, 1) - datetime.timedelta(days=1)).isoformat()


def coverage(meta):
    # Same rule as the market worker: declared coverage dates, else the whole month.
    partial = meta.get('partialCoverage') if isinstance(meta.get('partialCoverage'), dict) else {}
    start = meta.get('coverageStartDate') or partial.get('start') or meta['month'] + '-01'
    end = meta.get('coverageEndDate') or partial.get('end') or month_end(meta['month'])
    return start, end, start <= meta['month'] + '-01' and end >= month_end(meta['month'])


def build():
    tables = {name: collections.Counter() for name in FILES}
    dictionaries = {name: {d: {} for d in dims} for name, dims in FILES.items()}
    months = []
    for mi, meta in enumerate(sorted(manifest['months'], key=lambda m: m['month'])):
        cube = json.loads(gzip.open(root / 'data' / meta['cubePath']).read())
        cols = cube.get('columns') or cube['dimensions'] + ['count']
        ix = {c: i for i, c in enumerate(cols)}
        dicts = cube['dictionaries']
        value = {d: (lambda d: (lambda r: propulsion(dicts['bd_combustivel'][r[ix['bd_combustivel']]]) if 'bd_combustivel' in ix else 'Não classificado'))(d)
                 if d == 'propulsao' else
                 (lambda d: (lambda r: label(dicts[d][r[ix[d]]]) if d in ix else UNKNOWN))(d)
                 for d in {x for dims in FILES.values() for x in dims}}
        total = 0
        for r in cube['rows']:
            n = r[ix['count']]
            if not n:
                continue
            total += n
            for name, dims in FILES.items():
                codes = []
                for d in dims:
                    v = value[d](r)
                    book = dictionaries[name][d]
                    codes.append(book.setdefault(v, len(book)))
                tables[name][(mi, *codes)] += n
        start, end, complete = coverage(meta)
        months.append({'month': meta['month'], 'total': total, 'coverageStart': start, 'coverageEnd': end, 'complete': complete})
        print(meta['month'], total)
    out = root / 'data' / 'history'
    out.mkdir(exist_ok=True)
    for name, dims in FILES.items():
        rows = [list(k) + [n] for k, n in sorted(tables[name].items())]
        body = {'version': 1, 'sourceGeneratedAt': manifest.get('generatedAt'), 'months': months,
                'dimensions': dims, 'columns': ['month'] + dims + ['count'],
                'dictionaries': {d: [v for v, _ in sorted(book.items(), key=lambda kv: kv[1])] for d, book in dictionaries[name].items()},
                'rows': rows,
                'note': 'Soma mensal dos cubos revisados, com os mesmos rótulos do painel. Propulsão = classe de bd_combustivel.'}
        data = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
        (out / (name + '.json.gz')).write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
        print(name, len(rows), 'rows', round((out / (name + '.json.gz')).stat().st_size / 1e6, 2), 'MB')


if __name__ == '__main__':
    build()
