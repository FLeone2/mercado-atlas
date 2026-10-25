#!/usr/bin/env python3
"""Fetch the economic series the Economia page needs beyond external_sources.json.

Official public APIs only, with a receipt (URL + sha256) for every request. No imputation:
a month the source has not published stays missing. Output: data/scenarios/econ_extra.json.

  python3 scripts/fetch_econ_extra.py            # 2016-01 to today
"""
import argparse, datetime as dt, hashlib, json, sys, time, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_scenario_sources import fetch_series  # noqa: E402  (same BCB fetcher and rules)

# BCB/SGS. 'block' groups the series on the page; 'sign' says which direction helps purchases.
BCB = [
    {'key': 'vehicle_default', 'id': 21121, 'label': 'Inadimplência do crédito PF para veículos (recursos livres)', 'unit': '% da carteira', 'block': 'credito', 'sign': -1},
    {'key': 'vehicle_term', 'id': 20886, 'label': 'Prazo médio das concessões PF para veículos', 'unit': 'meses', 'block': 'credito', 'sign': 1},
    {'key': 'vehicle_credit_stock', 'id': 20581, 'label': 'Saldo da carteira PF para veículos (recursos livres)', 'unit': 'R$ milhões', 'block': 'credito', 'sign': 1},
    {'key': 'vehicle_rate_year', 'id': 20749, 'label': 'Juros médios PF para veículos', 'unit': '% a.a.', 'block': 'credito', 'sign': -1},
    {'key': 'consumer_confidence', 'id': 4393, 'label': 'Índice de Confiança do Consumidor', 'unit': 'índice', 'block': 'renda', 'sign': 1},
    {'key': 'unemployment', 'id': 24369, 'label': 'Taxa de desocupação (PNAD Contínua)', 'unit': '%', 'block': 'renda', 'sign': -1},
    {'key': 'activity', 'id': 24363, 'label': 'Atividade econômica (IBC-Br)', 'unit': 'índice', 'block': 'renda', 'sign': 1},
    {'key': 'activity_agro', 'id': 29601, 'label': 'Atividade agropecuária (IBC-Br Agro)', 'unit': 'índice', 'block': 'agro', 'sign': 1},
    {'key': 'ipca', 'id': 433, 'label': 'IPCA (variação mensal)', 'unit': '% no mês', 'block': 'precos', 'sign': -1},
    {'key': 'production_light', 'id': 1374, 'label': 'Produção de automóveis e comerciais leves (Anfavea)', 'unit': 'unidades', 'block': 'oferta', 'sign': 1},
    {'key': 'dealer_sales_cars', 'id': 7384, 'label': 'Vendas das concessionárias: automóveis (Fenabrave)', 'unit': 'unidades', 'block': 'oferta', 'sign': 1},
    {'key': 'dealer_sales_lcv', 'id': 7385, 'label': 'Vendas das concessionárias: comerciais leves (Fenabrave)', 'unit': 'unidades', 'block': 'oferta', 'sign': 1},
]
for s in BCB:
    s.update(frequency='monthly', kind='level', aggregation='published monthly value', metadataVerified=True,
             metadataUrl=f"https://dadosabertos.bcb.gov.br/dataset/{s['id']}")

# IBGE/SIDRA. PNAD moving quarters are dated by their last month (jun-jul-ago → ago).
SIDRA = [
    {'key': 'income_real', 'table': 6390, 'variable': 5933, 'label': 'Rendimento médio real habitual (PNAD Contínua)', 'unit': 'R$', 'block': 'renda', 'sign': 1},
    {'key': 'wage_bill_real', 'table': 6392, 'variable': 6293, 'label': 'Massa de rendimento real habitual (PNAD Contínua)', 'unit': 'R$ milhões', 'block': 'renda', 'sign': 1},
]
# IPCA "Automóvel novo" (subitem 5102001): table 1419 until 2019, 7060 from 2020; monthly change, chained into an index.
NEW_CAR = [(1419, '201601', '201912'), (7060, '202001', None)]
# Ipeadata: prices received by producers in Paraná (Seab-PR/Deral), the long monthly series available openly.
IPEA = [
    {'key': 'soy_price', 'code': 'DERAL12_PRSO12', 'label': 'Soja: preço ao produtor (PR, saca de 60 kg)', 'unit': 'R$/saca', 'block': 'agro', 'sign': 1},
    {'key': 'cattle_price', 'code': 'DERAL12_PRBGO12', 'label': 'Boi gordo: preço ao produtor (PR, arroba)', 'unit': 'R$/@', 'block': 'agro', 'sign': 1},
]
# Import tax on electrified cars (Gecex, Nov/2023): BEV 10→18→25→35%, HEV 12→25→30→35%, PHEV 12→20→28→35%.
IMPORT_TAX = {
    'source': 'Gecex/Camex, decisão de 10/11/2023 (retomada do imposto de importação de eletrificados)',
    'sourceUrls': ['https://www.legisweb.com.br/noticia/?id=27981', 'https://agenciagov.ebc.com.br/noticias/202311/retomada-de-tributacao-para-veiculos-eletrificados-e-oficializada-pelo-dou'],
    'note': 'Alíquota cheia; cotas com isenção valeram até 30/06/2026. Conferir o texto oficial da resolução antes de uso jurídico.',
    'steps': [
        {'from': '2024-01', 'BEV': 10, 'HEV': 12, 'PHEV': 12},
        {'from': '2024-07', 'BEV': 18, 'HEV': 25, 'PHEV': 20},
        {'from': '2025-07', 'BEV': 25, 'HEV': 30, 'PHEV': 28},
        {'from': '2026-07', 'BEV': 35, 'HEV': 35, 'PHEV': 35},
    ],
}


def get(url, timeout):
    req = urllib.request.Request(url, headers={'User-Agent': 'MercadoAutomotivoSourceAudit/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def sidra_series(s, start, end, timeout):
    out = dict(s, frequency='moving quarter', aggregation='PNAD moving quarter, dated by its last month', monthly=[], receipts=[])
    url = f"https://apisidra.ibge.gov.br/values/t/{s['table']}/n1/all/v/{s['variable']}/p/{start.replace('-', '')[:6]}-{end.replace('-', '')[:6]}"
    try:
        rows, sha = get(url, timeout)
        out['receipts'].append({'url': url, 'sha256': sha, 'rows': len(rows) - 1})
        for r in rows[1:]:
            code, v = r['D3C'], r['V']
            if v in ('-', '..', '...', 'X', ''):
                continue
            out['monthly'].append({'month': code[:4] + '-' + code[4:6], 'value': float(v), 'period': r['D3N']})
        out['status'] = 'available' if out['monthly'] else 'no_observations'
    except Exception as e:
        out.update(status='blocked_fetch', error=f'{type(e).__name__}: {e}')
    return out


def new_car_series(start, end, timeout):
    out = {'key': 'new_car_price', 'label': 'IPCA Automóvel novo (índice, jan/2016 = 100)', 'unit': 'índice', 'block': 'precos', 'sign': -1,
           'frequency': 'monthly', 'aggregation': 'monthly change of IPCA subitem 5102001 chained into an index', 'monthly': [], 'receipts': []}
    try:
        changes = []
        for table, a, b in NEW_CAR:
            b = b or end.replace('-', '')[:6]
            url = f'https://apisidra.ibge.gov.br/values/t/{table}/n1/all/v/63/p/{a}-{b}/c315/7641'
            rows, sha = get(url, timeout)
            out['receipts'].append({'url': url, 'sha256': sha, 'rows': len(rows) - 1})
            for r in rows[1:]:
                if r['V'] not in ('-', '..', '...', ''):
                    changes.append((r['D3C'][:4] + '-' + r['D3C'][4:6], float(r['V'])))
        level = 100.0
        for i, (m, c) in enumerate(sorted(changes)):
            if i:
                level *= 1 + c / 100
            out['monthly'].append({'month': m, 'value': round(level, 4), 'change': c})
        out['status'] = 'available' if out['monthly'] else 'no_observations'
    except Exception as e:
        out.update(status='blocked_fetch', error=f'{type(e).__name__}: {e}')
    return out


def ipea_series(s, start, timeout):
    out = dict(s, frequency='monthly', aggregation='published monthly value', monthly=[], receipts=[])
    url = f"https://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='{s['code']}')"
    try:
        data, sha = get(url, timeout)
        out['receipts'].append({'url': url, 'sha256': sha, 'rows': len(data['value'])})
        for r in data['value']:
            m = r['VALDATA'][:7]
            if m >= start[:7] and r['VALVALOR'] is not None:
                out['monthly'].append({'month': m, 'value': float(r['VALVALOR'])})
        out['status'] = 'available' if out['monthly'] else 'no_observations'
    except Exception as e:
        out.update(status='blocked_fetch', error=f'{type(e).__name__}: {e}')
    return out


def main(out, start, end, timeout):
    def bcb(s):
        # the SGS API sometimes answers a burst of requests with an error page: wait and try again
        for attempt in range(4):
            r = fetch_series(s, start, end, timeout)
            if r['status'] == 'available':
                return r
            time.sleep(4 * (attempt + 1))
        return r
    series = [bcb(s) for s in BCB]
    for s in series:
        s['source'] = 'BCB/SGS'
    for s in SIDRA:
        x = sidra_series(s, start, end, timeout); x['source'] = 'IBGE/SIDRA'; series.append(x)
    x = new_car_series(start, end, timeout); x['source'] = 'IBGE/SIDRA'; series.append(x)
    for s in IPEA:
        x = ipea_series(s, start, timeout); x['source'] = 'Ipeadata (Seab-PR/Deral)'; series.append(x)
    payload = {'schemaVersion': 'econ-extra-1.0.0', 'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'start': start, 'end': end,
               'series': series, 'importTax': IMPORT_TAX,
               'rules': ['No filling of missing months.', 'Current API vintages; revisions may exist.', 'PNAD moving quarters are dated by their last month.']}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({s['key']: [s['status'], len(s['monthly']), s['monthly'][-1]['month'] if s['monthly'] else None] for s in series}, ensure_ascii=False))
    if any(s['status'] != 'available' for s in series):
        sys.exit(1)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1] / 'data/scenarios/econ_extra.json')
    p.add_argument('--start', default='2016-01-01')
    p.add_argument('--end', default=dt.date.today().isoformat())
    p.add_argument('--timeout', type=float, default=30)
    a = p.parse_args()
    main(a.out, a.start, a.end, a.timeout)
