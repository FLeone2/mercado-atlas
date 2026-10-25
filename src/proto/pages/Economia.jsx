import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { NextCtx } from '../../next/ctx.js';
import { Projecoes, Regional } from '../../next/areas/Economia.jsx';
import { Spark } from '../../next/areas/economia-charts.jsx';
import { Block } from '../../next/ui.jsx';
import { useProto } from '../ctx.js';
import { PageHead, Section, Seg, Skel } from '../ui.jsx';
import { ContribBars, Forest, Lines } from '../charts.jsx';
import { brandName, fmt, pct, signed, monthLabel, historyGroup } from '../lib.js';

/* Economia: o que move a compra (juros, renda, crédito, confiança, preço, agro), quanto cada fator pesa
   (modelo em scripts/econ_model.py), um simulador de cenários e a política de importação dos eletrificados.
   Base nacional fixa: os filtros do topo não se aplicam. */
const cache = new Map();
function useJson(base, file) {
  const [s, set] = useState({ data: null, error: null });
  useEffect(() => {
    const url = new URL('scenarios/' + file, new URL(base || './', location.href)).href;
    if (!cache.has(url)) cache.set(url, fetch(url).then(r => { if (!r.ok) throw Error(file + ' · HTTP ' + r.status); return r.json(); }).catch(e => { cache.delete(url); throw e; }));
    let live = true; cache.get(url).then(d => live && set({ data: d, error: null }), e => live && set({ data: null, error: e.message }));
    return () => { live = false; };
  }, [base, file]);
  return s;
}
const nf = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const money = v => 'R$ ' + fmt(v);
const pctLog = v => (v >= 0 ? '+' : '−') + nf(Math.abs((Math.exp(v) - 1) * 100), 1) + '%';
const COLORS = { base: '#c7c7cc', income: '#2a9d8f', rate: '#2f6fdf', confidence: '#8e6bd1', default: '#64748b', agro: '#5b8c3a', soy: '#c0843d', shocks: '#8e8e93', other: '#e09a2c' };

/* indicadores do momento: último valor, variação em 12 meses e a linha dos últimos 24 meses */
const TILES = [
  ['vehicle_rate_year', 'Juros do crédito de veículos', v => nf(v, 1) + '% a.a.', 'pp', -1],
  ['vehicle_term', 'Prazo médio das concessões', v => nf(v, 0) + ' meses', 'abs', 1],
  ['vehicle_default', 'Inadimplência do crédito de veículos', v => nf(v, 1) + '%', 'pp', -1],
  ['wage_bill_real', 'Massa de renda real', v => 'R$ ' + nf(v / 1000, 0) + ' bi', 'pct', 1],
  ['unemployment', 'Desemprego', v => nf(v, 1) + '%', 'pp', -1],
  ['consumer_confidence', 'Confiança do consumidor', v => nf(v, 1), 'pct', 1],
  ['activity_agro', 'Atividade agropecuária', v => nf(v, 1), 'pct', 1],
  ['new_car_price', 'Preço do carro novo (IPCA)', v => nf(v, 1), 'pct', -1],
];

function Simulator({ model, models, focusName, mitPickup }) {
  const KEYS = [['rate', 'Juros de veículos', 'p.p.', -6, 6, .5], ['income', 'Massa de renda real', '%', -6, 6, .5], ['confidence', 'Confiança do consumidor', '%', -20, 20, 1], ['default', 'Inadimplência', 'p.p.', -2, 2, .25], ['agro', 'Atividade agro', '%', -10, 10, 1], ['soy', 'Preço real da soja', '%', -30, 30, 5]];
  const [v, setV] = useState({ rate: 0, income: 0, confidence: 0, default: 0, agro: 0, soy: 0 });
  const dx = k => (['rate', 'default'].includes(k) ? v[k] : Math.log(1 + v[k] / 100));
  const out = ['mercado', 'varejo', 'picape_media'].map(key => {
    const m = models[key], f = m.factors, d = f.map(dx), e = f.reduce((s, k, i) => s + m.coef[i].beta * d[i], 0);
    const se = Math.sqrt(Math.max(0, d.reduce((s, a, i) => s + d.reduce((t, b, j) => t + a * m.cov[i][j] * b, 0), 0)));
    const ignored = KEYS.filter(([k]) => !f.includes(k) && v[k] !== 0).map(([, l]) => l.toLowerCase());
    return { key, label: m.label, e, lo: e - 1.6449 * se, hi: e + 1.6449 * se, units: m.last12 * (Math.exp(e) - 1), last12: m.last12, ignored };
  });
  return (
    <div className="px-sim">
      <div className="px-sim-presets"><span>Cenários prontos:</span>{model.presets.map(p => <button key={p.id} type="button" className="nx-chip" onClick={() => setV({ rate: 0, income: 0, confidence: 0, default: 0, agro: 0, soy: 0, ...Object.fromEntries(Object.entries(p.shock).map(([k, x]) => [k, ['rate', 'default'].includes(k) ? x : Math.round(x * 1000) / 10])) })}>{p.label}</button>)}<button type="button" className="px-link" onClick={() => setV({ rate: 0, income: 0, confidence: 0, default: 0, agro: 0, soy: 0 })}>Zerar</button></div>
      <div className="px-sim-grid">
        <div className="px-sliders">{KEYS.map(([k, l, u, mn, mx, st]) => (
          <label key={k} className="px-slider"><span>{l}<b className={v[k] === 0 ? '' : v[k] > 0 ? 'up' : 'down'}>{v[k] > 0 ? '+' : ''}{nf(v[k], st < 1 ? (st < .5 ? 2 : 1) : 0)} {u}</b></span>
            <input type="range" min={mn} max={mx} step={st} value={v[k]} onChange={e => setV(o => ({ ...o, [k]: +e.target.value }))} /></label>))}
          <p className="px-pop-note">Variação sustentada por 12 meses, contra o cenário sem mudança.</p>
        </div>
        <div className="px-sim-out">{out.map(o => (
          <div key={o.key} className="px-sim-r">
            <span className="px-sim-l">{o.label}</span>
            <b className={o.e > 0.0005 ? 'up' : o.e < -0.0005 ? 'down' : ''}>{pctLog(o.e)}</b>
            <span className="px-sim-ci">de {pctLog(o.lo)} a {pctLog(o.hi)} · {o.units >= 0 ? '+' : '−'}{fmt(Math.abs(o.units))} emplacamentos em 12 meses</span>
            {o.key === 'picape_media' && mitPickup > 0 && <span className="px-sim-ci f">{focusName} mantendo a participação no segmento: {o.units >= 0 ? '+' : '−'}{fmt(Math.abs(mitPickup * (Math.exp(o.e) - 1)))} emplacamentos</span>}
            {o.ignored.length > 0 && <span className="px-sim-ci">Não entra neste modelo: {o.ignored.join(', ')}.</span>}
          </div>))}
        </div>
      </div>
    </div>
  );
}

export default function Economia() {
  const { base, focus, focusName } = useProto();
  const em = useJson(base, 'econ_model.json'), d = em.data;
  const histNat = engine.useHistory({ population: 'light' }, base, true);
  const sel = engine.useChineseSelection();
  const [modelKey, setModelKey] = useState('mercado');
  const legacy = useMemo(() => ({ base }), [base]);

  const tiles = useMemo(() => d ? TILES.map(([k, l, f, kind, sign]) => {
    const rows = d.levels[k]?.rows ?? []; if (!rows.length) return null;
    const last = rows.at(-1), prev = rows.find(r => r.month === (+last.month.slice(0, 4) - 1) + last.month.slice(4));
    const diff = prev ? (kind === 'pp' ? last.value - prev.value : kind === 'abs' ? last.value - prev.value : last.value / prev.value - 1) : null;
    const good = diff == null || Math.abs(diff) < 1e-9 ? '' : diff * sign > 0 ? 'up' : 'down';
    return { k, l, value: f(last.value), month: last.month, diff: diff == null ? '—' : kind === 'pct' ? signed(diff, 1) : (diff > 0 ? '+' : '−') + nf(Math.abs(diff), kind === 'abs' ? 0 : 1) + (kind === 'abs' ? ' meses' : ' p.p.'), good, spark: rows.slice(-24).map(r => r.value), source: d.levels[k].source };
  }).filter(Boolean) : null, [d]);

  /* decomposição do crescimento de 12 meses: base + fatores + choques + o que o modelo não explica */
  const decomp = useMemo(() => {
    if (!d) return null; const m = d.models[modelKey], rows = m.index.slice(-36), c = new Map(m.contributions.map(r => [r.month, r]));
    const shock = mo => m.shocks.reduce((s, x) => s + (x.window[0] <= mo && mo <= x.window[1] ? x.beta : 0), 0);
    const parts = [{ key: 'base', label: 'Tendência média', color: COLORS.base, values: rows.map(() => m.intercept) }, ...m.factors.map(k => ({ key: k, label: m.coef.find(x => x.key === k).label, color: COLORS[k], values: rows.map(r => c.get(r.month)?.[k] ?? 0) })), { key: 'shocks', label: 'Choques (pandemia, chips)', color: COLORS.shocks, values: rows.map(r => shock(r.month)) }, { key: 'other', label: 'Fora do modelo', color: COLORS.other, values: rows.map(r => r.actual - r.fitted) }].filter(p => p.values.some(v => Math.abs(v) > 1e-4));
    const last = rows.at(-1), lc = c.get(last.month);
    return { m, months: rows.map(r => r.month), parts, actual: rows.map(r => r.actual), last, lc, other: last.actual - last.fitted };
  }, [d, modelKey]);

  /* custo da parcela e o que mudou em 12 meses (preço, juros, prazo, renda) */
  const afford = useMemo(() => {
    if (!d) return null; const rows = d.affordability.rows, a = rows.at(-1), b = rows.find(r => r.month === (+a.month.slice(0, 4) - 1) + a.month.slice(4));
    const A = (y, n) => { const i = (1 + y / 100) ** (1 / 12) - 1; return i / (1 - (1 + i) ** -n); };
    const parts = b ? [['Preço do carro', Math.log(a.price / b.price)], ['Juros', Math.log(A(a.rateYear, b.term) / A(b.rateYear, b.term))], ['Prazo', Math.log(A(a.rateYear, a.term) / A(a.rateYear, b.term))], ['Renda', -Math.log(a.income / b.income)]] : [];
    return { rows, a, b, parts };
  }, [d]);

  /* política de importação × elétricos e chinesas */
  const policy = useMemo(() => {
    if (!d || !histNat.data) return null;
    const p = historyGroup(histNat.data, { population: 'light' }, ['propulsao']), g = historyGroup(histNat.data, { population: 'light' }, ['marca']);
    const from = p.months.indexOf('2022-01'), to = p.months.length - 1, months = p.months.slice(from, to + 1);
    const share = (grp, f) => months.map((_, j) => { const i = from + j; let s = 0; for (const [k, a] of grp.by) if (f(k)) s += a[i]; return grp.total[i] > 0 ? s / grp.total[i] : null; });
    const steps = d.importTax.steps, tax = t => months.map(m => { let v = 0; for (const s of steps) if (m >= s.from) v = s[t]; return v / 100; });
    return { months, bev: share(p, k => k === 'BEV'), hyb: share(p, k => ['PHEV', 'HEV'].includes(k)), cn: share(g, k => engine.isChineseBrand(k, sel)), tax: { BEV: tax('BEV'), PHEV: tax('PHEV'), HEV: tax('HEV') }, steps };
  }, [d, histNat.data, sel]);

  /* oferta: produção (Anfavea), vendas das concessionárias (Fenabrave) e emplacamentos (Atlas), em 12 meses */
  const supply = useMemo(() => {
    if (!d || !histNat.data) return null;
    const g = historyGroup(histNat.data, { population: 'light' }, []), reg = new Map(g.months.map((m, i) => [m, g.total[i]]));
    const map = k => new Map(d.levels[k].rows.map(r => [r.month, r.value])), prod = map('production_light'), cars = map('dealer_sales_cars'), lcv = map('dealer_sales_lcv');
    const months = g.months.filter(m => m >= '2018-01');
    const roll = f => months.map(m => { let s = 0; for (let k = 0; k < 12; k++) { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 - k, mm = (y + Math.floor(mo / 12)) + '-' + String(((mo % 12) + 12) % 12 + 1).padStart(2, '0'), v = f(mm); if (v == null) return null; s += v; } return s; });
    return { months, prod: roll(m => prod.get(m)), sales: roll(m => (cars.has(m) && lcv.has(m) ? cars.get(m) + lcv.get(m) : null)), reg: roll(m => reg.get(m)) };
  }, [d, histNat.data]);

  /* picapes médias: observado × explicado; e quanto a marca em foco tem no segmento (12 meses) */
  const pick = d?.models?.picape_media;
  const mitPickup = useMemo(() => {
    if (!histNat.data) return 0; const g = historyGroup(histNat.data, { population: 'light', bd_segmento: ['PICK-UP MID'] }, ['marca']); if (!g) return 0;
    const a = g.by.get(focus); if (!a) return 0; let i = g.months.length - 1; while (i >= 0 && !g.complete[i]) i--; let s = 0; for (let k = 0; k < 12; k++) s += a[i - k] ?? 0; return s;
  }, [histNat.data, focus]);

  const root = useRef(null);
  useEffect(() => {  // notas longas dos blocos reaproveitados viram ⓘ
    const el = root.current; if (!el) return undefined; let t = 0;
    const scan = () => { for (const p of el.querySelectorAll('p.nx-note')) { const text = p.textContent.replace(/\s+/g, ' ').trim(); if (text.length > 90 && p.getAttribute('data-nxnote') !== text) { p.setAttribute('data-nxnote', text); p.setAttribute('tabindex', '0'); p.setAttribute('role', 'note'); } } };
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 120); }); mo.observe(el, { childList: true, subtree: true }); scan();
    return () => { mo.disconnect(); clearTimeout(t); };
  }, []);

  const m = decomp?.m;
  return (
    <div className="px-page px-econ">
      <PageHead title="Economia" toc={[['e-agora', 'Condições agora'], ['e-explica', 'O que explica o mercado'], ['e-pesos', 'Quanto pesa cada fator'], ['e-simulador', 'Simulador'], ['e-parcela', 'Parcela'], ['e-importacao', 'Importação'], ['e-oferta', 'Oferta'], ['e-projecao', 'Projeções'], ['e-uf', 'Potencial regional']]} />
      <div className="nx-wrap"><p className="px-basefix"><b>Base nacional fixa:</b> Brasil, automóveis e comerciais leves. Os filtros do topo não se aplicam a esta página. Fontes: BCB, IBGE (PNAD, IPCA), Anfavea, Fenabrave, Deral/PR e Gecex.</p></div>
      {em.error && <div className="nx-wrap"><p className="px-scopenote">Não foi possível carregar o modelo econômico ({em.error}).</p></div>}

      <Section id="e-agora" title="Condições de compra agora" sub="Último dado publicado de cada fonte e a variação em 12 meses. Verde ajuda a compra; âmbar atrapalha.">
        {!tiles ? <div className="nx-c12"><Skel h={180} /></div> : <div className="nx-c12 px-etiles">{tiles.map(t => (
          <div key={t.k} className="px-etile"><span className="px-etile-k">{t.l}</span><b>{t.value}</b><span className={'px-etile-d ' + t.good}>{t.diff} <small>em 12 meses · {monthLabel(t.month)}</small></span><Spark values={t.spark} /><small className="px-etile-s">{t.source}</small></div>))}</div>}
      </Section>

      <Section id="e-explica" title="O que explica o crescimento" sub={decomp ? <>Em {monthLabel(decomp.last.month)}, {decomp.m.label.toLowerCase()} cresceu {pctLog(decomp.last.actual)} em 12 meses. {m.factors.map(k => <span key={k}>{m.coef.find(x => x.key === k).label}: {(decomp.lc?.[k] ?? 0) >= 0 ? '+' : '−'}{nf(Math.abs((decomp.lc?.[k] ?? 0) * 100), 1)} p.p. · </span>)}fora do modelo (lançamentos, importados, vendas diretas): {decomp.other >= 0 ? '+' : '−'}{nf(Math.abs(decomp.other * 100), 1)} p.p.</> : null}>
        {!decomp ? <div className="nx-c12"><Skel h={340} /></div> : (
          <Block className="nx-c12" title="Crescimento de 12 meses, decomposto" sub={decomp.m.horizon} actions={<Seg label="Mercado" value={modelKey} onChange={setModelKey} options={[['mercado', 'Mercado'], ['varejo', 'Varejo'], ['picape_media', 'Picapes médias']]} />}
            info="Cada barra soma a tendência média do período, a contribuição de cada fator (coeficiente × variação do fator), os choques identificados e o que sobra fora do modelo. A linha é o crescimento observado.">
            <ContribBars months={decomp.months} parts={decomp.parts} actual={decomp.actual} />
          </Block>
        )}
      </Section>

      <Section id="e-pesos" title="Quanto pesa cada fator" sub={d ? <>Efeito estimado sobre os emplacamentos, com intervalo de 90%. Modelos estimados de {monthLabel(d.models.mercado.start)} a {monthLabel(d.models.mercado.end)}, com erros robustos de Newey–West.</> : null}>
        {!d ? <div className="nx-c12"><Skel h={300} /></div> : ['mercado', 'varejo', 'picape_media'].map(k => {
          const mm = d.models[k], v = mm.validation;
          return (
            <Block key={k} className="nx-c4" title={mm.label} sub={<>R² {nf(mm.r2, 2)} · {mm.n} meses · erro fora da amostra {nf(v.mae * 100, 1)} p.p. ({v.mae < v.maeNaive ? 'melhor' : 'pior'} que a persistência, {nf(v.maeNaive * 100, 1)})</>}
              info={'Efeito de uma mudança sustentada no fator sobre ' + mm.horizon + '. ' + (mm.kind === 'ardl' ? 'Modelo mensal com o crescimento do mês anterior; efeito de longo prazo = b/(1−ρ), ρ = ' + nf(mm.rho, 2) + '. ' : '') + 'Coeficientes estimados só até dez/2023: ' + mm.coef.map(c => c.label + ' ' + nf(mm.stability.beta[c.key] * c.step * 100, 1) + '%').join('; ') + '.'}>
              <Forest rows={mm.coef.map(c => ({ key: c.key, label: c.stepText, sub: c.label, effect: c.effect, lo: c.effectLo, hi: c.effectHi }))} />
            </Block>
          );
        })}
      </Section>

      <Section id="e-simulador" title="Simulador de cenários" sub="Mexa nos fatores e veja o efeito estimado nos emplacamentos de 12 meses, com o intervalo de 90% calculado pela covariância dos coeficientes.">
        {!d ? <div className="nx-c12"><Skel h={300} /></div> : <div className="nx-c12 nx-card"><Simulator model={d} models={d.models} focusName={focusName} mitPickup={mitPickup} /></div>}
      </Section>

      <Section id="e-parcela" title="Quanto pesa a parcela" sub={afford ? <>{d.affordability.assumptions.text}</> : null}>
        {!afford ? <div className="nx-c12"><Skel h={300} /></div> : <>
          <Block className="nx-c8" title="Parcela de referência ÷ rendimento médio" sub={<>{monthLabel(afford.a.month)}: <em>{money(afford.a.pmt)}</em> por mês, {pct(afford.a.share, 0)} do rendimento médio ({money(afford.a.income)}){afford.b ? <> · {pct(afford.b.share, 0)} um ano antes</> : ''}</>}>
            <Lines months={afford.rows.map(r => r.month)} series={[{ name: 'Parcela ÷ renda', values: afford.rows.map(r => r.share), color: 'var(--nx-ink)', width: 3 }]} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} endLabels={false} height={280} label="Parcela de referência sobre o rendimento médio" />
          </Block>
          <Block className="nx-c4" title="O que mudou em 12 meses" sub="Contribuição de cada parte para a variação da parcela ÷ renda">
            <div className="px-segs">{afford.parts.map(([l, v]) => <div key={l} className="px-segrow"><span>{l}</span><span /><span className={v > 0 ? 'down' : 'up'}>{v >= 0 ? '+' : '−'}{nf(Math.abs(v * 100), 1)}%</span></div>)}
              <div className="px-segrow"><span><b>Total</b></span><span /><span className={afford.parts.reduce((s, p) => s + p[1], 0) > 0 ? 'down' : 'up'}><b>{pctLog(afford.parts.reduce((s, p) => s + p[1], 0))}</b></span></div></div>
            <p className="px-scopenote">Prazo maior e renda maior baixam a parcela relativa; preço e juros maiores sobem.</p>
          </Block>
        </>}
      </Section>

      <Section id="e-importacao" title="Imposto de importação e eletrificados" sub={policy ? <>O imposto sobre elétricos subiu de 10% (jan/2024) para 35% (jul/2026). No mesmo período, os elétricos foram de {pct(policy.bev[policy.months.indexOf('2024-01')], 1)} para {pct(policy.bev.at(-1), 1)} do mercado e as marcas chinesas para {pct(policy.cn.at(-1), 1)}.</> : null}>
        {!policy ? <div className="nx-c12"><Skel h={300} /></div> : <>
          <Block className="nx-c6" title="Alíquota de importação" sub={d.importTax.source} info={d.importTax.note}>
            <Lines months={policy.months} series={[{ name: 'Elétricos', values: policy.tax.BEV, color: '#e60f2d', width: 3 }, { name: 'Plug-in', values: policy.tax.PHEV, color: '#1d1d1f' }, { name: 'Híbridos', values: policy.tax.HEV, color: '#8e8e93' }]} fmtY={v => pct(v, 0)} height={280} label="Alíquota do imposto de importação" />
          </Block>
          <Block className="nx-c6" title="Participação no mercado" sub="Elétricos, híbridos (HEV + PHEV) e marcas chinesas">
            <Lines months={policy.months} series={[{ name: 'Chinesas', values: policy.cn, color: '#c0843d', width: 3 }, { name: 'Híbridos', values: policy.hyb, color: '#8e8e93' }, { name: 'Elétricos', values: policy.bev, color: '#e60f2d' }]} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} height={280} label="Participação de elétricos, híbridos e chinesas" />
          </Block>
        </>}
      </Section>

      <Section id="e-oferta" title="Produção, vendas e emplacamentos" sub="Somas de 12 meses. A produção inclui exportação; os emplacamentos incluem importados. A diferença sinaliza estoque e comércio exterior.">
        {!supply ? <div className="nx-c12"><Skel h={300} /></div> : <>
          <Block className="nx-c8" title="Em 12 meses" sub={<>Emplacamentos {fmt(supply.reg.at(-1))} · produção (Anfavea) {fmt(supply.prod.filter(v => v != null).at(-1))}</>}>
            <Lines months={supply.months} series={[{ name: 'Emplacamentos', values: supply.reg, color: 'var(--nx-ink)', width: 3 }, { name: 'Produção', values: supply.prod, color: '#2f6fdf' }, { name: 'Concessionárias', values: supply.sales, color: '#8e8e93', dash: '5 4' }]} fmtY={v => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'} fmtTip={fmt} height={280} label="Produção, vendas e emplacamentos em 12 meses" />
          </Block>
          {pick && <Block className="nx-c4" title="Picapes médias e o agro" sub={<>Modelo do segmento: juros, renda, atividade agro e preço da soja explicam {pct(pick.r2, 0)} da variação{mitPickup > 0 ? <>; {brandName(focus)} teve {fmt(mitPickup)} picapes médias em 12 meses</> : ''}</>}>
            <Lines months={pick.index.slice(-48).map(r => r.month)} series={[{ name: 'Observado', values: pick.index.slice(-48).map(r => r.actual), color: 'var(--nx-ink)', width: 2.5 }, { name: 'Modelo', values: pick.index.slice(-48).map(r => r.fitted), color: '#5b8c3a', dash: '5 4' }]} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} endLabels={false} height={250} label="Picapes médias: crescimento observado e explicado" />
          </Block>}
        </>}
      </Section>

      <NextCtx.Provider value={legacy}>
        <div className="nx-wrap nxo-main" ref={root}>
          <h2 className="px-econ-h">Para onde o mercado pode ir</h2>
          <Projecoes />
          <h2 className="px-econ-h">Potencial regional</h2>
          <Regional />
        </div>
      </NextCtx.Provider>
      {d && <div className="nx-wrap"><p className="px-scopenote">Método: {d.method.mercado} {d.method.picape} {d.method.estimator} {d.method.validation} {d.method.caveats.join(' ')}</p></div>}
    </div>
  );
}
