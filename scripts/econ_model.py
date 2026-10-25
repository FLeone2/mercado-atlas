#!/usr/bin/env python3
"""Economia do Atlas: o que explica os emplacamentos, quanto cada fator pesa e o que muda num cenário.

Dois modelos, escolhidos pelo que passou na validação e manteve o sinal econômico esperado:

1. Mercado e varejo — tendência de 12 meses (jan/2018 em diante; varejo desde set/2019, quando o canal existe):
     y_t = ln(S_t / S_{t−12}),  S_t = soma dos emplacamentos dos últimos 12 meses
     x_kt = variação da média de 12 meses de cada fator (ln para renda; p.p. para juros)
     y_t = a + Σ b_k·x_kt + choques + e_t
   b_k já é o efeito em 12 meses: renda é elasticidade (1% de renda → b% de emplacamentos), juros é
   semi-elasticidade (1 p.p. → 100·b% de emplacamentos).

2. Picapes médias (segmento da Triton) — mês contra o mesmo mês do ano anterior, por dia útil (ARDL):
     y_t = a + ρ·y_{t−1} + Σ b_k·x_kt + choques + e_t   (x = variação em 12 meses, média de 3 meses)
   efeito de longo prazo θ_k = b_k / (1 − ρ), variância pelo método delta.

Fatores: juros PF para veículos (BCB 20749), massa de renda real (PNAD), confiança do consumidor (BCB 4393),
inadimplência PF veículos (BCB 21121), atividade agropecuária (IBC-Br Agro) e preço real da soja (Deral/PR ÷ IPCA).
Choques (dummies): pandemia, base de comparação da pandemia e falta de semicondutores.
Estimador: MQO com erros de Newey–West (12 defasagens); intervalos de 90%.
Validação honesta: re-estima só com dados até t−12 e projeta t com os fatores observados, contra
"crescimento zero" e "mesmo crescimento de 12 meses antes". O simulador usa a matriz de covariância dos
coeficientes: erro do efeito = √(Δxᵀ V Δx). Parcela de referência: fórmula Price, PMT = P·i / (1 − (1+i)^−n).

Saída: data/scenarios/econ_model.json.  Uso: python3 scripts/econ_model.py
"""
import datetime as dt, gzip, json, math
from pathlib import Path

import numpy as np
import statsmodels.api as sm

ROOT = Path(__file__).resolve().parents[1]
EXTRA = ROOT / 'data/scenarios/econ_extra.json'
SOURCES = ROOT / 'data/scenarios/external_sources.json'
HISTORY = ROOT / 'data/history/national.json.gz'
OUT = ROOT / 'data/scenarios/econ_model.json'
START = '2017-01'


def month_list(a, b):
    out, y, m = [], int(a[:4]), int(a[5:7])
    while f'{y}-{m:02}' <= b:
        out.append(f'{y}-{m:02}'); m += 1
        if m > 12: y, m = y + 1, 1
    return out


def shift(m, k):
    y, mo = int(m[:4]), int(m[5:7]) - 1 + k
    return f'{y + mo // 12}-{mo % 12 + 1:02}'


def easter(y):
    a, b, c = y % 19, y // 100, y % 100; d, e = b // 4, b % 4; f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i, k = c // 4, c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7; mm = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * mm + 114) // 31; day = (h + l - 7 * mm + 114) % 31 + 1
    return dt.date(y, month, day)


def workdays(m):
    """Dias úteis: segunda a sexta, menos feriados nacionais, Carnaval, Sexta-feira Santa e Corpus Christi (igual ao site)."""
    y, mo = int(m[:4]), int(m[5:7]); e = easter(y)
    hol = {dt.date(y, a, b) for a, b in [(1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (12, 25)] + ([(11, 20)] if y >= 2024 else [])}
    hol |= {e - dt.timedelta(48), e - dt.timedelta(47), e - dt.timedelta(2), e + dt.timedelta(60)}
    d, n = dt.date(y, mo, 1), 0
    while d.month == mo:
        if d.weekday() < 5 and d not in hol: n += 1
        d += dt.timedelta(1)
    return n


def load_series():
    ex = json.loads(EXTRA.read_text()); src = json.loads(SOURCES.read_text())
    s = {x['key']: {r['month']: r['value'] for r in x['monthly']} for x in ex['series']}
    for x in src['series']:
        s[x['key']] = {r['month']: r['value'] for r in x['monthly']}
    meta = {x['key']: {k: x.get(k) for k in ('label', 'unit', 'source', 'block', 'sign', 'id')} for x in ex['series']}
    return s, meta, ex


def load_registrations():
    """Emplacamentos mensais de automóveis + comerciais leves: total, varejo e picapes médias (+ a Mitsubishi)."""
    h = json.loads(gzip.open(HISTORY).read())
    dims, D = h['dimensions'], h['dictionaries']
    ix = {d: dims.index(d) + 1 for d in dims}
    light = {i for i, v in enumerate(D['segmento']) if v in ('Auto', 'Comercial Leve')}
    var = D['tipo_venda'].index('VAREJO'); pm = D['bd_segmento'].index('PICK-UP MID'); mit = D['marca'].index('MITSUBISHI')
    months = [m['month'] for m in h['months']]; n = len(months)
    tot, ret, pick, mits = np.zeros(n), np.zeros(n), np.zeros(n), np.zeros(n)
    for r in h['rows']:
        if r[ix['segmento']] not in light: continue
        c, t = r[-1], r[0]
        tot[t] += c
        if r[ix['tipo_venda']] == var: ret[t] += c
        if r[ix['bd_segmento']] == pm: pick[t] += c
        if r[ix['marca']] == mit: mits[t] += c
    complete = {m['month'] for m in h['months'] if m['complete']}
    # o canal (varejo × venda direta) só existe nos arquivos a partir de 2017: mês sem canal fica de fora, nunca zero
    return {k: {months[i]: float(a[i]) for i in range(n) if months[i] in complete and a[i] > 0} for k, a in (('mercado', tot), ('varejo', ret), ('picape_media', pick), ('mitsubishi', mits))}


def chain(pct):
    """Índice a partir de variações mensais em %."""
    out, lvl = {}, 100.0
    for m in sorted(pct):
        lvl *= 1 + pct[m] / 100; out[m] = lvl
    return out


def yoy(series, m, kind):
    a, b = series.get(m), series.get(shift(m, -12))
    if a is None or b is None or (kind == 'log' and (a <= 0 or b <= 0)): return None
    return math.log(a / b) if kind == 'log' else a - b


def ma3(f, m):
    v = [f(shift(m, -k)) for k in range(3)]
    return None if any(x is None for x in v) else sum(v) / 3


FACTORS = {
    'rate': {'label': 'Juros PF para veículos', 'unit': 'p.p. ao ano', 'kind': 'diff', 'step': 1.0, 'stepText': '+1 p.p. nos juros', 'raw': 'vehicle_rate_year'},
    'income': {'label': 'Massa de renda real', 'unit': '% em 12 meses', 'kind': 'log', 'step': .01, 'stepText': '+1% na massa de renda real', 'raw': 'wage_bill_real'},
    'confidence': {'label': 'Confiança do consumidor', 'unit': '% em 12 meses', 'kind': 'log', 'step': .05, 'stepText': '+5% na confiança', 'raw': 'consumer_confidence'},
    'default': {'label': 'Inadimplência do crédito de veículos', 'unit': 'p.p.', 'kind': 'diff', 'step': .5, 'stepText': '+0,5 p.p. na inadimplência', 'raw': 'vehicle_default'},
    'agro': {'label': 'Atividade agropecuária', 'unit': '% em 12 meses', 'kind': 'log', 'step': .05, 'stepText': '+5% na atividade agro', 'raw': 'activity_agro'},
    'soy': {'label': 'Preço real da soja ao produtor', 'unit': '% em 12 meses', 'kind': 'log', 'step': .10, 'stepText': '+10% no preço real da soja', 'raw': 'soy_real'},
}
SHOCKS12 = {'pandemia': ('2020-03', '2021-02'), 'base_pandemia': ('2021-03', '2022-02'), 'semicondutores': ('2021-06', '2022-12')}
SHOCKS1 = {'pandemia': ('2020-03', '2020-08'), 'base_pandemia': ('2021-03', '2021-08'), 'semicondutores': ('2021-06', '2022-06')}
SHOCK_LABEL = {'pandemia': 'Choque da pandemia', 'base_pandemia': 'Base de comparação da pandemia', 'semicondutores': 'Falta de semicondutores'}
MODELS = {
    'mercado': {'label': 'Mercado (automóveis + comerciais leves)', 'kind': '12m', 'factors': ['rate', 'income'], 'start': '2018-01'},
    'mercado_ampliado': {'label': 'Mercado, com confiança e inadimplência', 'kind': '12m', 'factors': ['rate', 'income', 'confidence', 'default'], 'start': '2018-01', 'target': 'mercado'},
    'varejo': {'label': 'Varejo (vendas a pessoa física nas concessionárias)', 'kind': '12m', 'factors': ['rate', 'income'], 'start': '2019-09'},
    'picape_media': {'label': 'Picapes médias (segmento da Triton)', 'kind': 'ardl', 'factors': ['rate', 'income', 'agro', 'soy'], 'start': '2017-01'},
}


def avg12(series, m):
    v = [series.get(shift(m, -k)) for k in range(12)]
    return None if any(x is None for x in v) else sum(v) / 12


def build_factors(s):
    ipca = chain(s['ipca'])
    raw = {f['raw']: s[f['raw']] for k, f in FACTORS.items() if f['raw'] in s}
    raw['soy_real'] = {m: s['soy_price'][m] / ipca[m] * 100 for m in s['soy_price'] if m in ipca}
    def f12(k, m):  # variação da média de 12 meses
        f = FACTORS[k]; a, b = avg12(raw[f['raw']], m), avg12(raw[f['raw']], shift(m, -12))
        if a is None or b is None: return None
        return math.log(a / b) if f['kind'] == 'log' else a - b
    def f3(k, m):  # variação em 12 meses, média de 3 meses
        f = FACTORS[k]; return ma3(lambda mm: yoy(raw[f['raw']], mm, f['kind']), m)
    return f12, f3, raw


def fit(y, X):
    return sm.OLS(y, sm.add_constant(X, has_constant='add')).fit(cov_type='HAC', cov_kwds={'maxlags': 12})


def dataset(key, spec, regs, f12, f3):
    reg = regs[spec.get('target', key)]; rows = []
    if spec['kind'] == '12m':
        S = {m: avg12(reg, m) for m in month_list('2016-01', max(reg))}
        for m in month_list(spec['start'], max(reg)):
            if S.get(m) is None or S.get(shift(m, -12)) is None: continue
            x = [f12(k, m) for k in spec['factors']]
            if any(v is None for v in x): continue
            rows.append((m, math.log(S[m] / S[shift(m, -12)]), x, [1.0 if a <= m <= b else 0.0 for a, b in SHOCKS12.values()]))
        return rows, []
    yv = {m: math.log(reg[m] / workdays(m)) - math.log(reg[shift(m, -12)] / workdays(shift(m, -12))) for m in reg if shift(m, -12) in reg}
    for m in month_list(spec['start'], max(reg)):
        if m not in yv or shift(m, -1) not in yv: continue
        x = [f3(k, m) for k in spec['factors']]
        if any(v is None for v in x): continue
        rows.append((m, yv[m], [yv[shift(m, -1)]] + x, [1.0 if a <= m <= b else 0.0 for a, b in SHOCKS1.values()]))
    return rows, ['lag']


def run_model(key, spec, regs, f12, f3):
    rows, pre = dataset(key, spec, regs, f12, f3)
    M = [r[0] for r in rows]; Y = np.array([r[1] for r in rows]); X = np.array([r[2] + r[3] for r in rows])
    shocks = SHOCKS12 if spec['kind'] == '12m' else SHOCKS1
    names = pre + spec['factors'] + list(shocks); nf = len(pre) + len(spec['factors'])
    res = fit(Y, X); P, V = np.asarray(res.params), np.asarray(res.cov_params())
    fi = [names.index(k) + 1 for k in spec['factors']]
    if spec['kind'] == 'ardl':  # efeito de longo prazo b/(1−ρ) e covariância pelo método delta
        rho = P[1]; theta = P[fi] / (1 - rho)
        J = np.zeros((len(fi), len(P)))
        for r, j in enumerate(fi): J[r, j] = 1 / (1 - rho); J[r, 1] = P[j] / (1 - rho) ** 2
        Vt = J @ V @ J.T
    else:
        rho = None; theta = P[fi]; Vt = V[np.ix_(fi, fi)]
    se = np.sqrt(np.diag(Vt)); z = 1.6449
    from scipy.stats import norm
    coef = []
    for r, k in enumerate(spec['factors']):
        f = FACTORS[k]; b = float(theta[r]); p = float(2 * (1 - norm.cdf(abs(b / se[r])))) if se[r] > 0 else None
        Xk = X[:, nf - len(spec['factors']) + r]
        coef.append({'key': k, 'label': f['label'], 'unit': f['unit'], 'kind': f['kind'], 'beta': b, 'se': float(se[r]), 'lo90': b - z * se[r], 'hi90': b + z * se[r], 'p': p,
                     'step': f['step'], 'stepText': f['stepText'], 'effect': b * f['step'], 'effectLo': (b - z * se[r]) * f['step'], 'effectHi': (b + z * se[r]) * f['step'],
                     'short': float(P[fi[r]]), 'std': float(np.std(Xk)), 'weight': abs(b) * float(np.std(Xk))})
    tw = sum(c['weight'] for c in coef)
    for c in coef: c['weightShare'] = c['weight'] / tw if tw else None
    shocks_out = [{'key': n, 'label': SHOCK_LABEL[n], 'beta': float(P[i + 1]), 'p': float(res.pvalues[i + 1]), 'window': list(shocks[n])} for i, n in enumerate(names) if n in shocks]
    # contribuição de cada fator (no horizonte do próprio modelo) e o índice de condições de compra
    contrib, index = [], []
    for t in range(len(M)):
        c = {k: float(P[fi[r]] * X[t, fi[r] - 1]) for r, k in enumerate(spec['factors'])}
        contrib.append({'month': M[t], **c})
        index.append({'month': M[t], 'actual': float(Y[t]), 'fitted': float(res.fittedvalues[t]), 'conditions': float(sum(c.values()))})
    # validação: estima só com dados até t−12 e projeta t com os fatores observados
    gap = 12 if spec['kind'] == '12m' else 1
    oos = []
    for t in range(len(M)):
        if M[t] < '2022-01': continue
        tr = t - gap
        keep = [j for j in range(X.shape[1]) if j < nf or X[:tr, j].any()]
        if tr < 24: continue
        r = fit(Y[:tr], X[:tr][:, keep]); pred = float(r.params[0] + np.asarray(r.params[1:]) @ X[t][keep])
        oos.append({'month': M[t], 'actual': float(Y[t]), 'pred': pred, 'naive': float(Y[t - 12]) if spec['kind'] == '12m' else float(Y[t - 1])})
    mae = lambda key: float(np.mean([abs(o['actual'] - o[key]) for o in oos])) if oos else None
    mz = float(np.mean([abs(o['actual']) for o in oos])) if oos else None
    val = {'from': oos[0]['month'] if oos else None, 'n': len(oos), 'gapMonths': gap, 'mae': mae('pred'), 'maeNaive': mae('naive'), 'maeZero': mz,
           'naiveLabel': 'mesmo crescimento de 12 meses antes' if spec['kind'] == '12m' else 'crescimento do mês anterior', 'rows': oos}
    val['skillNaive'] = 1 - val['mae'] / val['maeNaive'] if val['maeNaive'] else None
    val['skillZero'] = 1 - val['mae'] / mz if mz else None
    # estabilidade: os mesmos coeficientes estimados só até dez/2023
    cut = sum(1 for m in M if m <= '2023-12'); r2 = fit(Y[:cut], X[:cut][:, [j for j in range(X.shape[1]) if X[:cut, j].any() or j < nf]])
    stab = {k: float(r2.params[fi[r]] / (1 - r2.params[1]) if spec['kind'] == 'ardl' else r2.params[fi[r]]) for r, k in enumerate(spec['factors'])}
    reg = regs[spec.get('target', key)]; lm = max(reg)
    return {
        'label': spec['label'], 'kind': spec['kind'], 'horizon': 'tendência de 12 meses' if spec['kind'] == '12m' else 'mês contra o mesmo mês do ano anterior (efeito de longo prazo)',
        'n': len(M), 'start': M[0], 'end': M[-1], 'r2': float(res.rsquared), 'r2adj': float(res.rsquared_adj), 'rho': float(rho) if rho is not None else None,
        'factors': spec['factors'], 'coef': coef, 'cov': Vt.tolist(), 'shocks': shocks_out, 'intercept': float(P[0]),
        'index': index, 'contributions': contrib, 'validation': val, 'stability': {'until': '2023-12', 'beta': stab},
        'last12': float(sum(reg[m] for m in month_list(shift(lm, -11), lm) if m in reg)), 'lastMonth': lm,
    }


def affordability(s, raw):
    """Parcela de um carro de referência e o peso dela na renda média (fórmula Price)."""
    ref_price, financed, ref_month = 120000.0, .6, max(m for m in s['new_car_price'] if m in s['vehicle_rate_year'] and m in s['vehicle_term'] and m in s['income_real'])
    rows = []
    for m in sorted(s['new_car_price']):
        if m < '2016-01' or m not in s['vehicle_rate_year'] or m not in s['vehicle_term'] or m not in s['income_real']: continue
        price = ref_price * s['new_car_price'][m] / s['new_car_price'][ref_month]
        i = (1 + s['vehicle_rate_year'][m] / 100) ** (1 / 12) - 1; n = s['vehicle_term'][m]; P = price * financed
        pmt = P * i / (1 - (1 + i) ** -n)
        rows.append({'month': m, 'price': price, 'rateYear': s['vehicle_rate_year'][m], 'term': n, 'pmt': pmt, 'income': s['income_real'][m], 'share': pmt / s['income_real'][m]})
    return {'assumptions': {'price': ref_price, 'priceMonth': ref_month, 'financed': financed,
                            'text': f'Carro de R$ {ref_price:,.0f} a preços de {ref_month}, corrigido para trás pelo IPCA do automóvel novo; 60% financiado nos juros médios e no prazo médio das concessões PF do mês.'.replace(',', '.')},
            'rows': rows}


def main():
    s, meta, ex = load_series()
    regs = load_registrations()
    f12, f3, raw = build_factors(s)
    models = {k: run_model(k, spec, regs, f12, f3) for k, spec in MODELS.items()}
    drivers = {}
    for k, f in FACTORS.items():
        ms = [m for m in month_list(START, max(raw[f['raw']])) if f12(k, m) is not None]
        drivers[k] = {**f, 'change12': [{'month': m, 'value': f12(k, m)} for m in ms[-60:]], 'last': f12(k, ms[-1]) if ms else None, 'lastMonth': ms[-1] if ms else None}
    level_keys = ['vehicle_rate_year', 'vehicle_term', 'vehicle_default', 'vehicle_credit_stock', 'consumer_confidence', 'unemployment', 'income_real', 'wage_bill_real', 'activity', 'activity_agro', 'new_car_price', 'soy_price', 'cattle_price', 'production_light', 'dealer_sales_cars', 'dealer_sales_lcv', 'ipca']
    levels = {k: {**meta.get(k, {}), 'rows': [{'month': m, 'value': v} for m, v in sorted(s[k].items()) if m >= '2016-01']} for k in level_keys}
    payload = {
        'schemaVersion': 'econ-model-1.0.0', 'builtAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'sourceRetrievedAt': ex['retrievedAt'],
        'method': {
            'mercado': 'Tendência de 12 meses: ln da soma de 12 meses contra a de 12 meses antes, explicada pela variação da média de 12 meses dos fatores.',
            'picape': 'Picapes médias: mês contra o mesmo mês do ano anterior, por dia útil, com o crescimento do mês anterior (ARDL); efeito de longo prazo b/(1−ρ).',
            'estimator': 'Mínimos quadrados com erros robustos de Newey–West (12 defasagens); intervalos de 90%.',
            'shocks12': {k: list(v) for k, v in SHOCKS12.items()}, 'shocks1': {k: list(v) for k, v in SHOCKS1.items()},
            'validation': 'Re-estima só com dados até t−12 (mercado) ou t−1 (picapes) e projeta t com os fatores observados; compara com crescimento zero e com a persistência.',
            'caveats': ['Associação estimada, não prova de causa: juros, renda e confiança andam juntos.', 'Fatores contemporâneos: o modelo explica e simula; para prever, os fatores também precisam de projeção.', 'Fontes nas versões atuais das APIs; revisões podem mudar os números.'],
        },
        'models': models, 'drivers': drivers, 'levels': levels, 'affordability': affordability(s, raw), 'importTax': ex['importTax'],
        'presets': [
            {'id': 'selic_cai', 'label': 'Selic cai 2 p.p. (juros de veículos −2,5 p.p.)', 'shock': {'rate': -2.5}},
            {'id': 'renda_sobe', 'label': 'Renda real +3%', 'shock': {'income': .03}},
            {'id': 'confianca_cai', 'label': 'Confiança −10%', 'shock': {'confidence': -.10}},
            {'id': 'credito_aperta', 'label': 'Crédito aperta: inadimplência +1 p.p.', 'shock': {'default': 1.0}},
            {'id': 'agro_forte', 'label': 'Safra forte: agro +6%, soja +15%', 'shock': {'agro': .06, 'soy': .15}},
        ],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    for k, m in models.items():
        v = m['validation']
        print(f"{k:17s} n={m['n']} R²={m['r2']:.2f} oos MAE={v['mae']:.3f} naive={v['maeNaive']:.3f} zero={v['maeZero']:.3f} | " + ' '.join(f"{c['key']}={c['beta']:+.3f}[{c['lo90']:+.3f},{c['hi90']:+.3f}] p={c['p']:.2f} (até 2023: {m['stability']['beta'][c['key']]:+.3f})" for c in m['coef']))


if __name__ == '__main__':
    main()
