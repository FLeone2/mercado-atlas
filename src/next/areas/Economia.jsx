import { useEffect, useMemo, useRef, useState } from 'react';
import ufGeometry from '../../market/geo/uf-geometry.json';
import { BarList, useTip } from '../charts.jsx';
import { useNext } from '../ctx.js';
import { UF_NAMES, fmt, monthLabel, pct, signed } from '../format.js';
import { AreaHead, InfoTip } from '../ui.jsx';
import LegacyTab from '../LegacyTab.jsx';
import { useDataApp } from '../../kit/index.js';
import Chinesas from './chinesas.jsx';
import { ForecastChart, GapRows, IndexedLines, LagHeat, Spark, UfScatter } from './economia-charts.jsx';
import './economia.css';
import './economia-skin.css';

/* ---------- dados: arquivos de data/scenarios, cada um buscado uma só vez ---------- */
const cache = new Map();
function loadScenario(base, file) {
  const key = String(base) + '|' + file;
  if (!cache.has(key)) {
    const url = new URL('scenarios/' + file, new URL(base || './', location.href));
    cache.set(key, fetch(url).then(r => { if (!r.ok) throw new Error(file + ' · HTTP ' + r.status); return r.json(); }).catch(e => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}
function useScenario(file) {
  const { base } = useNext(), [s, set] = useState({ data: null, error: null });
  useEffect(() => {
    if (!file) { set({ data: null, error: null }); return undefined; }
    let live = true; set({ data: null, error: null });
    loadScenario(base, file).then(data => live && set({ data, error: null }), error => live && set({ data: null, error }));
    return () => { live = false; };
  }, [base, file]);
  return s;
}
const bad = (...ss) => ss.find(s => s.error);
const waiting = (...ss) => ss.some(s => !s.data && !s.error);

/* ---------- formatação ---------- */
const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const mil = (v, d = 1) => (!Number.isFinite(v) ? '—' : Math.abs(v) >= 1e6 ? nf(v / 1e6, 2) + ' milhões' : Math.abs(v) >= 1e3 ? nf(v / 1e3, d) + ' mil' : nf(v));
const ppSigned = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d) + '\u00a0p.p.';
const cls = v => (v >= 0 ? 'up' : 'down');
const dateBR = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const shiftYear = (m, n) => String(+m.slice(0, 4) + n) + m.slice(4);

const KINDS = {
  official: ['Dado oficial + análise', 'Séries oficiais com cálculos descritivos (correlações, índices, participações).'],
  model: ['Projeção / modelo', 'Resultado de modelo estatístico: não é dado observado.'],
};

/* ---------- peças pequenas ---------- */
const Seg = ({ options, value, onChange, label, small }) => (
  <div className={'nxo-seg' + (small ? ' sm' : '')} role="group" aria-label={label}>
    {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
  </div>
);
const Chip = ({ children, warn, title }) => <span className={'nxo-chip' + (warn ? ' warn' : '')} title={title}>{children}</span>;
const Source = ({ children }) => <span className="nxo-chip">{children}</span>;
function Unavailable({ s }) { return <p className="nxo-state" role="status">Não foi possível carregar estes dados agora{s?.error?.message ? ' (' + s.error.message + ')' : ''}. Nada foi estimado no lugar.</p>; }
function Skeleton({ h = 300 }) { return <div className="nxo-skel" style={{ height: h }} aria-busy aria-label="Carregando" />; }
/* Cartão do painel: faixa de uma conclusão (título), legenda curta e o conteúdo. `bare`: sem fundo (os próprios filhos são cartões). */
function Panel({ id, kicker, title, lede, span = '12', bare, children }) {
  return (
    <section id={id} className={'nxo-panel nx-c' + span + (bare ? ' bare' : ' nx-card')}>
      <div className="nx-block-head"><div className="nx-block-titles">
        <h3 className="nx-block-t">{kicker ?? title}<InfoTip>{lede}</InfoTip></h3>
        {kicker && title && <p className="nx-block-sub">{title}</p>}
      </div></div>
      <div className="nxo-body">{children}</div>
    </section>
  );
}

const LEG_KEY = 'models:scenarios-workspace';
/* Hospeda uma das visões do Atlas atual (a escolha vive em sectionViews). `hide`: ids de cartões que o painel nativo já mostra. */
function LegacyModels({ view, hide = [], heading, dedupe }) {
  const shell = useDataApp(), cur = shell.sectionViews?.[LEG_KEY]?.tab;
  useEffect(() => { if (cur !== view) shell.setSectionView?.(LEG_KEY, { ...(shell.sectionViews?.[LEG_KEY] ?? {}), tab: view }); }, [cur, view]);
  if (cur !== view) return <Skeleton h={320} />;
  return <div className="nxo-legacy">{heading}<LegacyTab tab="models" hide={hide} className={dedupe ? 'nxo-dedupe' : ''} /></div>;
}

const headline = (ss, ready) => (bad(...ss) ? 'Dados indisponíveis no momento.' : waiting(...ss) ? 'Carregando dados verificados…' : ready);

function Meta() {
  const m = useScenario('manifest.json').data;
  if (!m) return null;
  return (
    <div className="nxo-metawrap">
      <p className="nx-note nxo-meta">
        Cobertura do acervo: {monthLabel(m.coverageStart)} a {monthLabel(m.coverageEnd)} · dados processados em {dateBR(String(m.sourceAsOf).slice(0, 10))} · autos e comerciais leves.
        Unidade: registros de origem, com duplicidades mantidas; não são veículos únicos. Os filtros do topo não recalculam estes arquivos.
      </p>
    </div>
  );
}

/* =====================================================================================
   1 · CONTEXTO
   ===================================================================================== */
const IND = [
  { key: 'selic_target', label: 'Selic (meta)', unit: '% ao ano', rate: true, d: 2, src: 'BCB · SGS 432' },
  { key: 'vehicle_financing_rate', label: 'Juros do crédito de veículos', unit: '% ao mês', rate: true, d: 2, src: 'BCB · SGS 25471' },
  { key: 'vehicle_credit_concessions', label: 'Crédito concedido para veículos', unit: 'R$ bilhões no mês', d: 1, scale: 1 / 1000, src: 'BCB · SGS 20673' },
  { key: 'usd_sale', label: 'Dólar (PTAX, média do mês)', unit: 'R$ por US$', d: 2, src: 'BCB · SGS 1' },
];
const LAG_LABEL = { selic_effective_month: 'Selic efetiva no mês', selic_target: 'Meta Selic', vehicle_financing_rate: 'Juros do crédito de veículos', vehicle_credit_concessions: 'Crédito para veículos', usd_sale: 'Dólar' };
const LAG_SUBJECT = { selic_effective_month: 'A Selic efetiva', selic_target: 'A meta Selic', vehicle_financing_rate: 'O juro do crédito de veículos', vehicle_credit_concessions: 'O crédito para veículos', usd_sale: 'O dólar' };

const seriesOf = (src, key) => ((src?.series ?? []).find(s => s.key === key)?.monthly ?? []).filter(r => Number.isFinite(r.value)).map(r => ({ month: r.month, value: r.value }));
function cardOf(series, def) {
  if (!series.length) return null;
  const last = series.at(-1), prev = series.find(r => r.month === shiftYear(last.month, -1)), k = def.scale ?? 1;
  const diff = prev ? last.value - prev.value : null;
  return { last, prev, value: nf(last.value * k, def.d), diff, change: prev ? (def.rate ? ppSigned(diff) : signed(last.value / prev.value - 1)) : null, spark: series.slice(-24).map(r => r.value) };
}

function Contexto() {
  const src = useScenario('external_sources.json'), mon = useScenario('monthly.json'), mac = useScenario('macro_analysis.json');
  const [span, setSpan] = useState(36);

  const cards = useMemo(() => (src.data ? IND.map(def => ({ def, card: cardOf(seriesOf(src.data, def.key), def) })) : []), [src.data]);
  const common = useMemo(() => {
    if (!src.data || !mon.data) return null;
    const credit = new Map(seriesOf(src.data, 'vehicle_credit_concessions').map(r => [r.month, r.value]));
    const rows = mon.data.rows.filter(r => credit.has(r.month) && r.registrations > 0).map(r => ({ month: r.month, rawA: r.registrations, rawB: credit.get(r.month) }));
    return rows.length > 13 ? rows : null;
  }, [src.data, mon.data]);
  const yoy = useMemo(() => {
    if (!common) return null;
    const a = common.at(-1), b = common.find(r => r.month === shiftYear(a.month, -1));
    return b ? { month: a.month, reg: a.rawA / b.rawA - 1, credit: a.rawB / b.rawB - 1 } : null;
  }, [common]);
  const rows = useMemo(() => {
    if (!common) return null;
    const win = span === 0 ? common : common.slice(-span), r0 = win[0];
    return win.map(r => ({ ...r, a: r.rawA / r0.rawA * 100, b: r.rawB / r0.rawB * 100 }));
  }, [common, span]);

  const selic = cards.find(c => c.def.key === 'selic_target')?.card, credit = cards.find(c => c.def.key === 'vehicle_credit_concessions')?.card, rate = cards.find(c => c.def.key === 'vehicle_financing_rate')?.card;

  /* correlações defasadas */
  const lag = useMemo(() => {
    const L = mac.data?.lagCorrelations; if (!L) return null;
    const series = Object.keys(LAG_LABEL).filter(k => L[k]?.rows?.length).map(k => ({ key: k, label: LAG_LABEL[k], rows: L[k].rows }));
    if (!series.length) return null;
    let best = null;
    for (const s of series) for (const r of s.rows) if (Number.isFinite(r.r) && (!best || Math.abs(r.r) > Math.abs(best.r))) best = { key: s.key, lag: r.lag, r: r.r };
    const lags = [...new Set(series.flatMap(s => s.rows.map(r => r.lag)))].sort((a, b) => a - b);
    return { series, best, lags, warning: L[series[0].key].warning };
  }, [mac.data]);

  const idx = rows?.at(-1);
  return (
    <div className="nxo-view nxo-grid">
      <Panel id="e-resumo" span="12" bare="1" kicker="Juros, crédito e câmbio"
        title={headline([src], selic ? <>Selic em <em>{nf(selic.last.value, 2)}%</em> ao ano{selic.diff == null ? '.' : selic.diff === 0 ? ', igual à de um ano atrás.' : <>, {nf(Math.abs(selic.diff), 2)} p.p. {selic.diff < 0 ? 'abaixo' : 'acima'} de um ano atrás.</>}</> : 'Séries indisponíveis.')}
        lede={credit && rate ? `Em ${monthLabel(credit.last.month)}, o crédito para veículos somou R$ ${credit.value} bi${credit.prev ? ', ' + signed(credit.last.value / credit.prev.value - 1) + ' sobre um ano antes' : ''}; as novas operações de financiamento custaram ${rate.value}% ao mês.` : undefined}>
        {src.error ? <Unavailable s={src} /> : !src.data ? <Skeleton h={226} /> : (
          <div className="nxo-kpis">
            {cards.map(({ def, card }) => (
              <div key={def.key} className="nxo-kpi">
                <div className="nxo-kpi-k">{def.label}</div>
                {card ? <>
                  <div className="nxo-kpi-row">
                    <div className="nxo-kpi-n">{card.value}<small>{def.unit} · {monthLabel(card.last.month)}</small></div>
                    <Spark values={card.spark} />
                  </div>
                  <div className="nxo-kpi-d">{card.diff == null ? 'Sem mês comparável' : <>{card.diff >= 0 ? '▲' : '▼'} {card.change} <span>em 12 meses</span></>}</div>
                </> : <div className="nxo-kpi-d">Indisponível</div>}
                <Source>Dado oficial · {def.src}</Source>
              </div>
            ))}
          </div>
        )}
        <p className="nx-note">Cada indicador mostra o último mês publicado pela fonte; meses ausentes não são preenchidos. A linha pequena cobre os últimos 24 meses. Selic é a meta definida pelo Copom, não a taxa efetiva do mês. Base fixa: os filtros do topo não se aplicam.</p>
      </Panel>

      <Panel id="e-credito" span="5" kicker="Crédito e emplacamentos"
        title={headline([src, mon], yoy ? <>Emplacamentos <em className={cls(yoy.reg)}>{signed(yoy.reg)}</em> e crédito para veículos <em className={cls(yoy.credit)}>{signed(yoy.credit)}</em> em 12 meses.</> : 'Séries insuficientes para comparar.')}
        lede={idx ? `Duas séries na mesma escala: índice 100 em ${monthLabel(rows[0].month)}. Em ${monthLabel(idx.month)}, os emplacamentos estão em ${nf(idx.a)} e o crédito em ${nf(idx.b)}. Variações de 12 meses até ${monthLabel(yoy.month)}, último mês com as duas séries.` : undefined}>
        {bad(src, mon) ? <Unavailable s={bad(src, mon)} /> : waiting(src, mon) ? <Skeleton /> : !rows ? <p className="nxo-state">Não há meses suficientes em comum entre as duas séries.</p> : (
          <div className="nx-card">
            <div className="nxo-sub">
              <span className="nxo-basefix">Janela de comparação</span>
              <Seg small label="Janela" value={String(span)} onChange={v => setSpan(+v)} options={[['36', '3 anos'], ['60', '5 anos'], ['0', 'Tudo']]} />
            </div>
            <IndexedLines rows={rows} a={{ label: 'Emplacamentos', color: 'var(--nx-ink)' }} b={{ label: 'Crédito para veículos', color: 'var(--nx-accent)' }} fmtRawA={v => fmt(v)} fmtRawB={v => 'R$ ' + nf(v / 1000, 1) + ' bi'} />
            <div className="nxo-chips"><Source>Dado oficial · BCB · SGS 20673</Source><Source>Emplacamentos · Fenabrave, conferidos mês a mês</Source></div>
            <p className="nx-note">Crédito: concessões livres a pessoas físicas para comprar veículo, em valores correntes (fluxo mensal, não estoque; sem correção pela inflação). Emplacamentos: autos e comerciais leves, registros de origem, não veículos únicos. As duas séries só se comparam até o último mês que ambas têm.</p>
          </div>
        )}
      </Panel>

      <Panel id="e-lag" span="7" kicker="O que anda junto"
        title={headline([mac], lag ? <>{LAG_SUBJECT[lag.best.key]} é o que mais acompanha os emplacamentos: correlação de <em>{nf(lag.best.r, 2)}</em> {lag.best.lag === 0 ? 'no mesmo mês' : `com ${lag.best.lag} ${lag.best.lag === 1 ? 'mês' : 'meses'} de antecedência`}.</> : 'Correlações indisponíveis.')}
        lede="Cada célula compara a variação em 12 meses do indicador com a dos emplacamentos. Verde: andam no mesmo sentido; vermelho: em sentido oposto. As colunas dizem com quantos meses de antecedência o indicador se move.">
        {mac.error ? <Unavailable s={mac} /> : !mac.data ? <Skeleton h={260} /> : !lag ? <p className="nxo-state">Sem correlações publicadas.</p> : (
          <div className="nx-card">
            <div className="nxo-chips" style={{ marginTop: 0, marginBottom: 14 }}><Chip warn>Exploratório · associação, não causa</Chip></div>
            <LagHeat series={lag.series} lags={lag.lags} best={lag.best} />
            <p className="nxo-axis-note">meses de antecedência do indicador →</p>
            <p className="nx-note">{lag.best.key === 'vehicle_credit_concessions' ? 'Parte do crédito financia justamente as compras, então andar junto no mesmo mês é esperado. ' : ''}Variações de 12 meses, sem efeito de mês do ano e tendência linear. Como as janelas de 12 meses se sobrepõem e vários atrasos foram testados, não há teste de significância nem superfície de resposta: o quadro descreve, não prova nem permite prever o impacto de uma mudança nos juros.</p>
            <div className="nxo-chips"><Source>Dado oficial + análise · BCB e Fenabrave</Source></div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* =====================================================================================
   2 · PROJEÇÕES
   ===================================================================================== */
const TARGETS = { registrations: 'Mercado', mitsubishi: 'Mitsubishi', nonMitsubishi: 'Demais marcas', mitsubishiShare: 'Participação Mitsubishi' };
const MODEL = {
  seasonal_naive: 'Mesmo mês do ano anterior', seasonal_ar1: 'Sazonal + AR(1)', seasonal_arx: 'Sazonal + macro', seasonal_sarimax: 'SARIMAX sazonal com macro',
  constrained_wls: 'Publicado · reconciliado (WLS)', coherent_ratio: 'Publicado · razão Mitsubishi / mercado', share_seasonal_naive: 'Participação · mesmo mês do ano anterior', share_logit_sarimax: 'Participação · SARIMAX logit',
};
const HIER_MODEL = { seasonal_naive_bottom_up: 'Mesmo mês do ano anterior · soma das UFs', seasonal_growth_bottom_up: 'Crescimento sazonal · soma das UFs', seasonal_growth_base_unreconciled: 'Crescimento sazonal · sem reconciliação', mint_shrink_nonnegative: 'Reconciliação MinT não negativa' };

const OF = { registrations: '', mitsubishi: ' da Mitsubishi', nonMitsubishi: ' das demais marcas' };
const histOf = (rows, target) => rows.map(r => ({ month: r.month, value: target === 'registrations' ? r.registrations : target === 'mitsubishi' ? r.mitsubishi : target === 'nonMitsubishi' ? r.registrations - r.mitsubishi : r.mitsubishiShare })).filter(r => Number.isFinite(r.value));
const metricAt = (t, model, h) => t.test?.[model]?.byHorizon?.find(x => x.horizon === h);

function Projecoes() {
  const mod = useScenario('phase23_models.json'), mon = useScenario('monthly.json');
  const [target, setTarget] = useState('registrations'), [h, setH] = useState(12);
  const targets = mod.data?.forecasts?.targets ?? {}, keys = Object.keys(TARGETS).filter(k => targets[k]);
  const t = targets[target] ?? targets[keys[0]], share = target === 'mitsubishiShare';
  const horizons = mod.data?.forecasts?.horizons ?? [3, 6, 12];

  const hist = useMemo(() => (mon.data ? histOf(mon.data.rows, target) : []), [mon.data, target]);
  const rows = useMemo(() => (t?.intervals ?? []).filter(r => Number.isFinite(r.point) && r.horizon <= h), [t, h]);
  const fmtV = share ? v => nf(v * 100, 2) + '%' : v => fmt(v), fmtAxis = share ? v => nf(v * 100, 1) + '%' : v => (v >= 1000 ? nf(v / 1000) + ' mil' : nf(v));

  const sum = useMemo(() => {
    if (share || !rows.length || !hist.length) return null;
    const byMonth = new Map(hist.map(r => [r.month, r.value])), last = rows.map(r => byMonth.get(shiftYear(r.month, -1)));
    if (last.some(v => v == null)) return { f: rows.reduce((s, r) => s + r.point, 0), l: null, repeats: false };
    return { f: rows.reduce((s, r) => s + r.point, 0), l: last.reduce((s, v) => s + v, 0), repeats: rows.every((r, i) => Math.abs(r.point - last[i]) < 1) };
  }, [rows, hist, share]);
  const recent = useMemo(() => { if (share || hist.length < 13) return null; const a = hist.at(-1), b = hist.find(r => r.month === shiftYear(a.month, -1)); return b && b.value > 0 ? { month: a.month, yoy: a.value / b.value - 1 } : null; }, [hist, share]);

  /* comparação entre modelos */
  const cmp = useMemo(() => {
    if (!t?.test) return null;
    const list = Object.keys(t.test).map(m => ({ m, s: metricAt(t, m, h) })).filter(x => x.s && Number.isFinite(x.s.mae)).sort((a, b) => a.s.mae - b.s.mae);
    const sel = list.find(x => x.m === t.selectedModel);
    if (!list.length || !sel) return null;
    const best = list.filter(x => x.s.mae <= list[0].s.mae * (1 + 1e-9));
    return { list, sel, best, selectedIsBest: best.some(x => x.m === t.selectedModel) };
  }, [t, h]);
  const maeText = v => (share ? nf(v * 100, 2) + ' p.p.' : mil(v));
  const protocol = mod.data?.forecasts?.protocol, testRange = protocol?.testTargetRange, nOrig = protocol?.nTestOrigins;
  const failed = t && t.validationPassed !== true;
  const sel = cmp?.sel?.s;
  const baseModel = t?.baseSelectedModel;

  const first = rows[0], lastRow = rows.at(-1);
  const ready = rows.length > 0 && hist.length > 0;
  const title = headline([mod, mon], !ready ? 'Projeção indisponível para esta série.' : share
    ? <>Participação da Mitsubishi projetada para {monthLabel(first.month)}: <em>{fmtV(first.point)}</em>, com faixa de 80% de {fmtV(first.lo80)} a {fmtV(first.hi80)}.</>
    : sum?.repeats ? <>Os próximos {h} meses repetem o mesmo período do ano anterior: <em>{mil(sum.f)}</em> emplacamentos{OF[target]}.</>
      : <>Projeção de <em>{mil(sum.f)}</em> emplacamentos{OF[target]} nos próximos {h} meses{sum.l ? <>, {signed(sum.f / sum.l - 1)} sobre os mesmos meses do ano anterior</> : ''}.</>);
  const lede = ready ? [
    failed ? 'Modelo exploratório: não passou na validação do protocolo e não sustenta metas comerciais.' : 'O modelo passou nos critérios retrospectivos, mas a projeção segue experimental.',
    sum?.repeats && recent && Math.abs(recent.yoy) > .03 ? `O último mês observado (${monthLabel(recent.month)}) está ${signed(recent.yoy)} sobre um ano antes, e a projeção não extrapola essa tendência.` : '',
    `Faixas por mês, de ${monthLabel(first.month)} a ${monthLabel(lastRow.month)}.`,
  ].filter(Boolean).join(' ') : undefined;

  const title2 = headline([mod], !cmp ? 'Comparação indisponível.' : cmp.selectedIsBest
    ? <>No teste de {h} meses, o modelo publicado <em>foi o que menos errou</em>: {maeText(cmp.sel.s.mae)}{share ? '' : ' por mês'}.</>
    : <>No teste de {h} meses, <em>{MODEL[cmp.best[0].m] ?? cmp.best[0].m}</em> errou {nf((1 - cmp.best[0].s.mae / cmp.sel.s.mae) * 100)}% menos que o modelo publicado.</>);
  const barRows = cmp?.list.map((x, i) => ({ key: x.m, name: x.m, label: MODEL[x.m] ?? x.m, rank: i + 1, value: x.s.mae, valueText: maeText(x.s.mae), deltaText: 'MASE ' + nf(x.s.mase, 2) }));

  return (
    <div className="nxo-view nxo-grid">
      <Panel id="e-projecao" span="8" kicker="Para onde pode ir" title={title} lede={lede}>
        {bad(mod, mon) ? <Unavailable s={bad(mod, mon)} /> : waiting(mod, mon) ? <Skeleton h={380} /> : !ready ? <p className="nxo-state">Nenhum horizonte válido foi publicado para esta série.</p> : (
          <div className="nx-card">
            <div className="nxo-sub">
              <Seg small label="Série projetada" value={target} onChange={setTarget} options={keys.map(k => [k, TARGETS[k]])} />
              <Seg small label="Horizonte" value={String(h)} onChange={v => setH(+v)} options={horizons.map(x => [String(x), x + ' meses'])} />
            </div>
            <ForecastChart hist={hist.slice(-24)} rows={rows} fmtV={fmtV} fmtAxis={fmtAxis} label={`Histórico e projeção de ${TARGETS[target]}, com faixas de incerteza`} />
            <div className="nxo-chips">
              {failed && <Chip warn>Exploratório · não passou na validação</Chip>}
              <Chip>Modelo <b>{baseModel ? (MODEL[baseModel] ?? baseModel) + ' + reconciliação' : (MODEL[t.selectedModel] ?? t.selectedModel)}</b></Chip>
              {sel && <Chip title="Erro absoluto médio dos meses 1 a h no teste reservado. MASE compara com uma escala sazonal de treino.">Erro médio no teste <b>{maeText(sel.mae)}{share ? '' : ' por mês'}</b> · MASE <b>{nf(sel.mase, 2)}</b></Chip>}
              {sel && Number.isFinite(sel.bias) && !share && Math.abs(sel.bias) > 1 && <Chip title="Previsão menos observado, média no teste.">{sel.bias < 0 ? 'Subestimou' : 'Superestimou'} em média <b>{mil(Math.abs(sel.bias))}</b> por mês</Chip>}
              {sel && Number.isFinite(sel.coverage80) && <Chip warn={sel.coverage80 < .7} title="Parcela das observações do teste que caíram dentro da faixa. O nominal é 80%.">Faixa de 80% cobriu <b>{pct(sel.coverage80, 0)}</b> no teste</Chip>}
              {sel && Number.isFinite(sel.coverage95) && <Chip warn={sel.coverage95 < .85} title="O nominal é 95%.">Faixa de 95% cobriu <b>{pct(sel.coverage95, 0)}</b></Chip>}
            </div>
            <p className="nx-note">Teste retrospectivo com {nOrig ?? '—'} origens{testRange ? ` (alvos de ${monthLabel(testRange[0])} a ${monthLabel(testRange[1])})` : ''}, usando a versão atual dos dados: as mesmas datas já foram examinadas antes e não há reconstrução do que se sabia na época. Faixas empíricas aproximadas, sem garantia de cobertura futura. {share ? 'A participação publicada é a razão entre os volumes reconciliados de Mitsubishi e do mercado.' : 'Os volumes de Mitsubishi e das demais marcas são reconciliados para somar o mercado.'} Base fixa: os filtros do topo não se aplicam.</p>
          </div>
        )}
      </Panel>

      <Panel id="e-modelos" span="4" kicker="Entre os modelos" title={title2}
        lede={cmp ? `Erro absoluto médio dos meses 1 a ${h}, nas mesmas ${nOrig ?? ''} origens do teste reservado; menor é melhor. O modelo publicado é escolhido só pelo menor erro na validação, sem olhar o teste.` : undefined}>
        {bad(mod) ? <Unavailable s={mod} /> : !mod.data ? <Skeleton h={260} /> : !cmp ? <p className="nxo-state">Sem métricas de teste para esta série.</p> : (
          <div className="nx-card">
            <div className="nxo-sub">
              <Seg small label="Série" value={target} onChange={setTarget} options={keys.map(k => [k, TARGETS[k]])} />
              <Seg small label="Horizonte" value={String(h)} onChange={v => setH(+v)} options={horizons.map(x => [String(x), x + ' meses'])} />
            </div>
            <BarList rows={barRows} focus={t.selectedModel} />
            <p className="nx-note">Barra em destaque: modelo publicado. MASE compara o erro com o de uma previsão sazonal ingênua calculada no treino (abaixo de 1: erra menos que ela). {share ? 'Erros da participação em pontos percentuais.' : 'Erros em registros por mês.'} Os erros de meses vizinhos se sobrepõem e não são independentes; com poucas origens, diferenças pequenas entre modelos não são conclusivas.</p>
          </div>
        )}
      </Panel>

      <PorEstado h={h} setH={setH} horizons={horizons} />
      <Meta />
    </div>
  );
}

function PorEstado({ h, setH, horizons }) {
  const sentinel = useRef(null), [near, setNear] = useState(false), [uf, setUf] = useState('SP');
  useEffect(() => {
    const el = sentinel.current; if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '900px 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  const hier = useScenario(near ? 'phase3_hierarchy.json' : null);
  const d = hier.data;
  const ufs = useMemo(() => (d ? Object.keys(UF_NAMES).filter(u => d.history.at(-1)?.nodes?.[u + ':total'] != null).sort((a, b) => UF_NAMES[a].localeCompare(UF_NAMES[b], 'pt-BR')) : []), [d]);
  const hist = useMemo(() => (d ? d.history.map(r => ({ month: r.month, value: r.nodes?.[uf + ':total'] })).filter(r => Number.isFinite(r.value)) : []), [d, uf]);
  const rows = useMemo(() => (d ? d.futureForecasts.filter(r => r.horizon <= h && Number.isFinite(r.nodes?.[uf + ':total'])).map(r => ({ month: r.month, point: r.nodes[uf + ':total'] })) : []), [d, uf, h]);
  const sum = useMemo(() => {
    if (!rows.length) return null;
    const by = new Map(hist.map(r => [r.month, r.value])), last = rows.map(r => by.get(shiftYear(r.month, -1)));
    const f = rows.reduce((s, r) => s + r.point, 0);
    return last.some(v => v == null) ? { f, l: null, repeats: false } : { f, l: last.reduce((s, v) => s + v, 0), repeats: rows.every((r, i) => Math.abs(r.point - last[i]) < 1) };
  }, [rows, hist]);
  const ready = d && sum;
  const title = !near || waiting(hier) ? 'Carregando as projeções por estado…' : hier.error ? 'Projeções por estado indisponíveis.' : !ready ? 'Sem projeção para este estado.'
    : sum.repeats ? <>{UF_NAMES[uf]} repete o mesmo período do ano anterior: <em>{mil(sum.f)}</em> emplacamentos em {h} meses.</>
      : <>{UF_NAMES[uf]}: <em>{mil(sum.f)}</em> emplacamentos projetados em {h} meses{sum.l ? <>, {signed(sum.f / sum.l - 1)} sobre os mesmos meses do ano anterior</> : ''}.</>;
  return (
    <>
      <div ref={sentinel} aria-hidden />
      <Panel id="e-estados" span="12" kicker="Por estado" title={title} lede={ready ? 'Experimento hierárquico: as projeções dos estados somam o Brasil. Diferente do quadro nacional, não há faixa de incerteza publicada para estados.' : undefined}>
        {hier.error ? <Unavailable s={hier} /> : !d ? <Skeleton h={380} /> : (
          <div className="nx-card">
            <div className="nxo-sub">
              <select className="nxo-select" aria-label="Estado" value={uf} onChange={e => setUf(e.target.value)}>{ufs.map(u => <option key={u} value={u}>{UF_NAMES[u]}</option>)}</select>
              <Seg small label="Horizonte" value={String(h)} onChange={v => setH(+v)} options={horizons.map(x => [String(x), x + ' meses'])} />
            </div>
            {rows.length ? <ForecastChart hist={hist.slice(-24)} rows={rows} fmtV={v => fmt(v)} fmtAxis={v => (v >= 1000 ? nf(v / 1000) + ' mil' : nf(v))} label={`Histórico e projeção de ${UF_NAMES[uf]}`} /> : <p className="nxo-state">Sem projeção para este estado.</p>}
            <div className="nxo-chips">
              <Chip warn>Exploratório · não passou na validação</Chip>
              <Chip>Modelo <b>{HIER_MODEL[d.selectedModel] ?? d.selectedModel}</b></Chip>
              <Chip>Sem faixa de incerteza para estados</Chip>
            </div>
            <p className="nx-note">Os estados são contabilizados com uma categoria à parte para registros sem UF identificada, que não é tratada como estado. Teste retrospectivo na versão atual dos dados; não há validação em tempo real. Base fixa: os filtros do topo não se aplicam.</p>
          </div>
        )}
      </Panel>
    </>
  );
}

/* =====================================================================================
   3 · POTENCIAL REGIONAL
   ===================================================================================== */
const COVARIATE = { logGdpPerCapita: 'PIB por habitante', logHouseholdIncomePerCapita2022: 'renda domiciliar', logDensity2022: 'densidade', urbanization2022: 'urbanização', logPamValuePerCapita: 'valor agrícola por habitante' };
const MIN_POP = 300000;

function Regional() {
  const reg = useScenario('regional.json'), soc = useScenario('socioeconomic.json'), mod = useScenario('phase23_models.json');
  const [all, setAll] = useState(false), [focus, setFocus] = useState(null), tip = useTip();

  /* estados: emplacamentos por mil habitantes (jan–set), PIB por habitante ponderado pela população, curva log-log */
  const uf = useMemo(() => {
    if (!reg.data || !soc.data) return null;
    const pop = {}, g = {}, gp = {}, regs = {};
    for (const r of soc.data.rows) { if (!UF_NAMES[r.uf]) continue; pop[r.uf] = (pop[r.uf] ?? 0) + r.population; if (Number.isFinite(r.gdpPerCapita)) { g[r.uf] = (g[r.uf] ?? 0) + r.gdpPerCapita * r.population; gp[r.uf] = (gp[r.uf] ?? 0) + r.population; } }
    for (const r of reg.data.municipalities) if (UF_NAMES[r.uf]) regs[r.uf] = (regs[r.uf] ?? 0) + r.registrations;
    const rows = Object.keys(UF_NAMES).filter(u => pop[u] && regs[u] != null && gp[u]).map(u => ({ uf: u, name: UF_NAMES[u], pop: pop[u], regs: regs[u], per: regs[u] / pop[u] * 1000, gdp: g[u] / gp[u] }));
    const n = rows.length; if (n < 5) return null;
    const xs = rows.map(r => Math.log(r.gdp)), ys = rows.map(r => Math.log(r.per)), mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const b = sxy / sxx, a = my - b * mx, r2 = sxy * sxy / (sxx * syy);
    for (const r of rows) r.ratio = r.per / Math.exp(a + b * Math.log(r.gdp));
    const national = rows.reduce((s, r) => s + r.regs, 0) / rows.reduce((s, r) => s + r.pop, 0) * 1000;
    return { rows: rows.sort((x, y) => y.per - x.per), fit: { a, b, r2 }, national, popYear: soc.data.populationYear, gdpYear: soc.data.gdpYear };
  }, [reg.data, soc.data]);
  const byUf = useMemo(() => new Map((uf?.rows ?? []).map(r => [r.uf, r])), [uf]);
  const period = reg.data?.period ? `${monthLabel(reg.data.period[0])} a ${monthLabel(reg.data.period[1])}` : 'jan a set';

  /* municípios: observado × esperado do modelo de contagem */
  const mu = useMemo(() => {
    const m = mod.data?.regional; if (!m?.rows?.length) return null;
    const big = m.rows.filter(r => r.population >= MIN_POP && r.expected > 0).map(r => ({ ...r, gap: r.observed - r.expected }));
    if (big.length < 6) return null;
    const down = [...big].sort((a, b) => a.gap - b.gap).slice(0, 6), up = [...big].sort((a, b) => b.gap - a.gap).slice(0, 6);
    return { m, n: big.length, down, up, max: Math.max(...[...down, ...up].map(r => Math.abs(r.gap))) };
  }, [mod.data]);
  const gapRow = r => ({ key: r.code, label: r.name, sub: `${r.uf} · ${nf(r.population / 1e6, 1)} mi hab.`, gap: r.gap, text: (r.gap < 0 ? '−' : '+') + mil(Math.abs(r.gap)), detail: `${mil(r.observed)} de ${mil(r.expected)}` });

  const top = uf?.rows[0], bottom = uf?.rows.at(-1), low = uf && [...uf.rows].sort((a, b) => a.ratio - b.ratio)[0];
  const shown = uf && (all ? uf.rows : [...uf.rows.slice(0, 8), { gap: true, uf: 'gap', name: 'gap' }, ...uf.rows.slice(-5)]);
  const maxPer = top?.per ?? 1;
  const barRows = shown?.map((r, i) => (r.gap ? { key: 'gap', name: 'gap', label: '', value: 0, gap: true, valueText: '···', deltaText: '' } : { key: r.uf, name: r.uf, label: r.name, value: r.per, valueText: nf(r.per, 1), rank: uf.rows.indexOf(r) + 1, deltaText: nf(r.per / uf.national, 1) + '×', title: `${fmt(r.regs)} emplacamentos para ${fmt(r.pop)} habitantes` }));
  const join = reg.data?.joinAudit, diag = mod.data?.regional?.diagnostics;
  const unmatchedRows = (join?.unmatched ?? []).reduce((s, r) => s + (r.registrations ?? 0), 0);
  const covText = (mod.data?.regional?.coefficients ?? []).map(c => COVARIATE[c.term]).filter(Boolean);

  const stateReady = uf && !bad(reg, soc);
  return (
    <div className="nxo-view nxo-grid">
      <Panel id="e-uf" span="12" kicker="Onde se emplaca mais por habitante"
        title={headline([reg, soc], stateReady ? <>{top.name} emplaca <em>{nf(top.per, 1)}</em> por mil habitantes; {bottom.name}, só <em>{nf(bottom.per, 1)}</em>.</> : 'Ranking indisponível.')}
        lede={stateReady ? `Emplacamentos de ${period} (autos e comerciais leves, sem anualizar) por mil habitantes. Média do Brasil: ${nf(uf.national, 1)}. O endereço do registro pode refletir sede e frota de empresas, não só a demanda de quem mora ali.` : undefined}>
        {bad(reg, soc) ? <Unavailable s={bad(reg, soc)} /> : !stateReady ? <Skeleton h={420} /> : (
          <div className="nx-card nxo-pair">
            <div>
              <svg className="nx-uf" viewBox="0 0 630 565" role="img" aria-label="Mapa dos estados por emplacamentos por mil habitantes" onPointerLeave={tip.hide}>
                {ufGeometry.features.map(f => {
                  const r = byUf.get(f.uf), a = r ? .1 + Math.pow(r.per / maxPer, .8) * .9 : .05;
                  return <path key={f.uf} d={f.path} className={'nx-ufp' + (focus === f.uf ? ' on' : '')} style={{ fillOpacity: a }} onClick={() => setFocus(focus === f.uf ? null : f.uf)}
                    onPointerMove={e => tip.show(e, <><strong>{UF_NAMES[f.uf]}</strong>{r ? <><span>{nf(r.per, 1)} por mil habitantes</span><span>{fmt(r.regs)} emplacamentos · {fmt(r.pop)} hab.</span></> : <span>Sem dados</span>}</>)} />;
                })}
              </svg>
              <div className="nxo-ramp"><span>menos</span><i /><span>mais por mil hab.</span></div>
            </div>
            <div>
              <BarList rows={barRows} focus={focus} onPick={r => r.name !== 'gap' && setFocus(focus === r.name ? null : r.name)} />
              <button type="button" className="nxo-more" onClick={() => setAll(a => !a)}>{all ? 'Mostrar só os extremos' : `Mostrar os ${uf.rows.length} estados`}</button>
            </div>
          </div>
        )}
        {tip.node}
        {stateReady && <div className="nxo-chips"><Source>População {uf.popYear} · IBGE</Source><Source>Emplacamentos · Fenabrave</Source></div>}
        <p className="nx-note">A coluna da direita mostra quantas vezes cada estado supera (×) a média do Brasil. Estados somam os municípios com registro; {unmatchedRows ? `${fmt(unmatchedRows)} registros sem município identificado ficam fora, ` : ''}o que não altera o ranking. Base fixa: os filtros do topo não se aplicam.</p>
      </Panel>

      <Panel id="e-renda" span="12" kicker="Renda e emplacamentos"
        title={headline([reg, soc], stateReady ? <>O PIB por habitante explica <em>{nf(uf.fit.r2 * 100)}%</em> das diferenças entre estados; {low.name} fica <em className="down">{nf((1 - low.ratio) * 100)}%</em> abaixo da curva.</> : 'Relação indisponível.')}
        lede="Cada ponto é um estado. A linha pontilhada é a relação média entre PIB por habitante e emplacamentos por mil habitantes; os pontos vermelhos emplacam menos do que ela sugere, os escuros mais. Clique num ponto para destacá-lo no mapa.">
        {bad(reg, soc) ? <Unavailable s={bad(reg, soc)} /> : !stateReady ? <Skeleton h={440} /> : (
          <div className="nx-card">
            <UfScatter rows={uf.rows} fit={uf.fit} focus={focus} onPick={r => setFocus(focus === r.uf ? null : r.uf)} />
            <div className="nxo-chips"><Source>PIB municipal {uf.gdpYear} · IBGE</Source><Source>População {uf.popYear} · IBGE</Source></div>
            <p className="nx-note">Distância da curva descreve, não mede potencial de vendas nem demanda reprimida: sedes de locadoras, frotas e incentivos locais deslocam o registro de onde as pessoas vivem. PIB por habitante é produção local, não renda das famílias; aqui é a média dos municípios ponderada pela população. Curva ajustada por mínimos quadrados em escala logarítmica entre {uf.rows.length} estados (anos de referência diferentes: PIB {uf.gdpYear}, população {uf.popYear}).</p>
          </div>
        )}
      </Panel>

      <Panel id="e-municipios" span="12" kicker="Dentro dos estados"
        title={headline([mod], mu ? <>{mu.down[0].name} ({mu.down[0].uf}) emplaca <em className="down">{nf((1 - mu.down[0].observed / mu.down[0].expected) * 100)}% abaixo</em> do esperado para o seu perfil: {mil(mu.down[0].observed)} contra {mil(mu.down[0].expected)}.</> : 'Comparação municipal indisponível.')}
        lede={mu ? `Entre os ${mu.n} municípios com mais de ${nf(MIN_POP / 1000)} mil habitantes, comparamos os emplacamentos de ${period} com o que um modelo estatístico esperaria dado o estado${covText.length ? ', ' + covText.join(', ') : ''}. Como o modelo já considera o estado, ele descreve diferenças dentro de cada UF.` : undefined}>
        {bad(mod, reg) ? <Unavailable s={bad(mod, reg)} /> : !mod.data ? <Skeleton h={360} /> : !mu ? <p className="nxo-state">O modelo regional não publicou linhas municipais.</p> : (
          <div className="nx-card">
            <div className="nxo-chips" style={{ marginTop: 0, marginBottom: 18 }}><Chip warn>Exploratório · ajuste dentro da amostra, sem validação fora dela</Chip></div>
            <div className="nxo-gaps">
              <div><h3 className="nx-h3">Abaixo do esperado</h3><GapRows rows={mu.down.map(gapRow)} /></div>
              <div><h3 className="nx-h3">Acima do esperado</h3><GapRows rows={mu.up.map(gapRow)} /></div>
            </div>
            <p className="nx-note">Em cada linha: emplacamentos observados de um total esperado; as barras de cada coluna têm escala própria. Esperado = contagem prevista por um modelo de Poisson com população como base e efeito fixo de estado. Diferença esperada menos observada não é demanda reprimida nem potencial acionável: a dependência espacial, a sobredispersão{diag ? ` (${nf(diag.dispersion)}×)` : ''} e as sedes de locadoras e frotas limitam a leitura. PIB por habitante não é renda das famílias. Registros não são veículos únicos.</p>
            <p className="nx-note">Cobertura: {reg.data?.municipalities ? fmt(reg.data.municipalities.length) + ' municípios com registro; ' : ''}{join ? `${fmt(join.unmatchedKeys)} sem código IBGE (${fmt(unmatchedRows)} registros, ${nf((1 - join.registrationCoverage) * 100, 3)}% do total) ficaram fora; ` : ''}o modelo usa {fmt(diag?.n)} municípios{diag?.excluded ? ` e exclui ${fmt(diag.excluded.missingConditionalCovariate)} sem todas as variáveis` : ''}; {diag ? `${fmt(diag.absentMunicipalitiesNotAssumedZero)} municípios ausentes da base de registros não são tratados como zero. ` : ''}Vintages diferentes: PIB {uf?.gdpYear ?? '2023'}, população {uf?.popYear ?? '2026'}, renda, densidade e urbanização de 2022.</p>
          </div>
        )}
      </Panel>
      <Meta />
    </div>
  );
}

/* =====================================================================================
   ÁREA
   ===================================================================================== */
const TABS = [['contexto', 'Contexto'], ['projecoes', 'Projeções'], ['regional', 'Potencial regional'], ['economia', 'Economia e mercado'], ['chinesas', 'Marcas chinesas'], ['simulacoes', 'Simulações'], ['tecnicas', 'Análises técnicas']];
const kindOf = v => (v === 'projecoes' || v === 'simulacoes' ? 'model' : 'official');
const readTab = () => { try { const v = new URLSearchParams(location.search).get('e'); return TABS.some(x => x[0] === v) ? v : 'contexto'; } catch { return 'contexto'; } };
const LEG_HIDE_FORECAST = ['scenarios-phase3-projection-registrations-published', 'scenarios-phase3-benchmark-registrations'];

export default function Economia() {
  const [view, setView] = useState(readTab);
  const src = useScenario('external_sources.json').data;
  const change = v => {
    setView(v);
    try { const p = new URLSearchParams(location.search); p.set('e', v); history.replaceState(history.state, '', location.pathname + '?' + p.toString()); } catch { /* the address bar is optional */ }
  };
  const kind = KINDS[kindOf(view)];
  const selic = src ? cardOf(seriesOf(src, 'selic_target'), IND[0]) : null, rate = src ? cardOf(seriesOf(src, 'vehicle_financing_rate'), IND[1]) : null;
  const finding = selic ? `Selic em ${nf(selic.last.value, 2)}% ao ano${rate ? ` e financiamento de veículos a ${rate.value}% ao mês` : ''} (${monthLabel(selic.last.month)}). Dados oficiais e modelos ao lado dos emplacamentos; os filtros do topo não se aplicam.` : 'Juros, crédito e câmbio ao lado dos emplacamentos; projeções e potencial regional. Os filtros do topo não se aplicam.';
  return (
    <>
      <AreaHead title="Economia" finding={finding} tabs={TABS} tab={view} onTab={change}>
        <div className="nxo-basefix">
          <span className={'nxo-kind' + (kindOf(view) === 'model' ? ' model' : '')} title={kind[1]}>{kind[0]}</span>
          <span><b>Base fixa:</b> os filtros do topo não se aplicam a esta área.</span>
        </div>
      </AreaHead>
      <div className="nx-wrap nxo-main">
        {view === 'contexto' && <><Contexto /><Meta /></>}
        {view === 'projecoes' && <>
          <Projecoes />
          <LegacyModels view="forecasts" dedupe hide={LEG_HIDE_FORECAST} heading={<h3 className="nxo-sec">Reconciliação hierárquica, validação e tabelas completas</h3>} />
        </>}
        {view === 'regional' && <>
          <Regional />
          <LegacyModels view="regional" dedupe heading={<h3 className="nxo-sec">Modelo regional, dependência espacial (Moran) e tabelas</h3>} />
        </>}
        {view === 'economia' && <LegacyModels view="economy" heading={<h3 className="nxo-sec">Defasagens, crédito real, IPCA e PNAD</h3>} />}
        {view === 'chinesas' && <Chinesas />}
        {view === 'simulacoes' && <LegacyModels view="simulations" />}
        {view === 'tecnicas' && <LegacyModels view="diagnostic" heading={<h3 className="nxo-sec">Diagnóstico do acervo, cobertura e comprovantes</h3>} />}
      </div>
    </>
  );
}
