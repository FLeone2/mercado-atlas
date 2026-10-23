import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { ShareArea, useTip } from '../charts.jsx';
import { useNext } from '../ctx.js';
import { fmt, monthLabel, pct } from '../format.js';
import { Block } from '../ui.jsx';
import './chinesas.css';

const COLORS = ['#e60f2d', '#2f6fed', '#e8a317', '#0f9d8a', '#8e5cf0', '#d9558f', '#5b6b7a', '#b45309'];
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ACRONYMS = new Set(['BYD', 'GWM', 'GAC', 'JAC', 'DFM', 'SWM', 'JMEV', 'MG', 'BMW', 'GM', 'VW', 'RAM', 'DS', 'MINI', 'BAIC', 'FAW']);
export const brandTitle = n => String(n).split(/(\s+|\/)/).map(w => (ACRONYMS.has(w) || /^\s+$|^\/$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join('');
const WINDOWS = [[12, '12 meses'], [24, '24 meses'], [60, '5 anos'], [0, 'Desde 2016']];
const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const short = m => SHORT[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);

/* Brands of the history file, biggest first, as base names (no "(B)"/"(T)" variants). */
export function useBrandNames(hist) {
  return useMemo(() => {
    if (!hist?.data) return [];
    const dict = hist.data.dictionaries.marca ?? [], total = new Map();
    for (const m of engine.historyMonthly(hist.data, { population: 'all_content' }, 'marca')) for (const [name, n] of m.groups) total.set(engine.chineseBase(name), (total.get(engine.chineseBase(name)) ?? 0) + n);
    for (const name of dict) if (!total.has(engine.chineseBase(name))) total.set(engine.chineseBase(name), 0);
    return [...total].filter(([n]) => n && !/^DESCONHECIDO|^NÃO IDENTIFICADO|^NAO IDENTIFICADO/.test(n)).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [hist?.data]);
}

/* Which brands count as "Chinese": preselected with the audited list; every view that talks about Chinese brands follows this choice. */
export function ChineseBrandPicker({ names }) {
  const selection = engine.useChineseSelection(), defaults = useMemo(() => engine.chineseDefaults(), []);
  const chosen = selection ?? defaults, chosenSet = new Set(chosen), [q, setQ] = useState('');
  const show = brandTitle;
  const set = list => engine.setChineseSelection(list, defaults);
  const toggle = n => set(chosenSet.has(n) ? chosen.filter(x => x !== n) : [...chosen, n]);
  const extraOn = ex => ex.brands.every(b => chosenSet.has(engine.chineseBase(b)));
  const toggleExtra = ex => { const bases = ex.brands.map(engine.chineseBase); set(extraOn(ex) ? chosen.filter(x => !bases.includes(x)) : [...chosen, ...bases]); };
  const found = useMemo(() => {
    const t = fold(q.trim());
    return t ? names.filter(n => !chosenSet.has(n) && fold(n).includes(t)).slice(0, 8) : [];
  }, [q, names, selection]);
  const differs = selection != null;
  return (
    <div className="nxch-picker">
      <div className="nx-chips" role="group" aria-label="Marcas consideradas chinesas">
        {chosen.map(n => <button key={n} type="button" className="nx-chip on" onClick={() => toggle(n)} aria-label={'Remover ' + show(n)}>{show(n)} <span aria-hidden>×</span></button>)}
        {!chosen.length && <span className="nxch-empty">Nenhuma marca selecionada: os gráficos de marcas chinesas ficam vazios.</span>}
      </div>
      <div className="nxch-add">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && found[0]) { toggle(found[0]); setQ(''); } }} placeholder="Adicionar outra marca" aria-label="Adicionar outra marca" />
        {found.length > 0 && <ul className="nx-found">{found.map(n => <li key={n}><button type="button" onClick={() => { toggle(n); setQ(''); }}>{show(n)}</button></li>)}</ul>}
        {q.trim() && !found.length && <p className="nx-none">Nada encontrado</p>}
      </div>
      <div className="nxch-extras">
        {engine.chineseExtras.map(ex => <button key={ex.id} type="button" className="nx-chip" aria-pressed={extraOn(ex)} onClick={() => toggleExtra(ex)}>{extraOn(ex) ? '✓ ' : '+ '}{ex.label}</button>)}
        {differs && <button type="button" className="nxch-reset" onClick={() => set(null)}>Restaurar a lista padrão</button>}
      </div>
      <p className="nx-note nx-scope">A lista padrão traz as marcas de origem chinesa da classificação auditada ({defaults.length} marcas). Parcerias Brasil–China, MG e Volvo ficam de fora até você incluí-las. A escolha vale para as barras de origem, a pirâmide e os gráficos desta página, e vai no link.</p>
    </div>
  );
}

/* Mensal ou média de 12 meses; two or more lines on one axis. */
function Lines({ months, series, label }) {
  const W = 1000, H = 440, pad = { l: 64, r: 16, t: 14, b: 34 }, n = months.length, tip = useTip();
  const [hover, setHover] = useState(null);
  const raw = Math.max(1, ...series.flatMap(s => s.values.filter(v => v != null))) * 1.04, pow = 10 ** Math.floor(Math.log10(raw));
  const max = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(k => k * pow).find(v => v >= raw);
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = vals => { let d = '', pen = false; vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
  const step = Math.max(1, Math.round(n / 7));
  const move = e => {
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / (W - pad.l - pad.r) * (n - 1))));
    setHover(i);
    tip.show(e, <><strong>{monthLabel(months[i])}</strong>{series.map(s => s.values[i] != null && <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{fmt(Math.round(s.values[i]))}</b></span>)}</>);
  };
  return (
    <>
      <svg className="nx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => { setHover(null); tip.hide(); }}>
        <g className="nx-axis">
          {[0, .25, .5, .75, 1].map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t * max)} y2={Y(t * max)} /><text x={0} y={Y(t * max) + 4}>{fmt(Math.round(t * max))}</text></g>)}
          {months.map((m, i) => i % step === 0 && <text key={m} x={X(i)} y={H - 8} textAnchor="middle">{short(m)}</text>)}
        </g>
        {series.map((s, k) => <path key={s.name} className="nx-line" d={path(s.values)} stroke={s.color} strokeWidth={s.main ? 4 : 3} style={{ animationDelay: k * 120 + 'ms' }} />)}
        {hover != null && <line className="nx-cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} />}
        {hover != null && series.map(s => s.values[hover] != null && <circle key={s.name} cx={X(hover)} cy={Y(s.values[hover])} r="5" fill="var(--nx-card)" stroke={s.color} strokeWidth="2.5" />)}
      </svg>
      <div className="nx-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      {tip.node}
    </>
  );
}

export default function Chinesas() {
  const { base } = useNext(), hist = engine.useHistory({}, base, true), names = useBrandNames(hist);
  const selection = engine.useChineseSelection(), defaults = useMemo(() => engine.chineseDefaults(), []);
  const chosen = selection ?? defaults, chosenKey = chosen.join('|');
  const [span, setSpan] = useState(60), [smooth, setSmooth] = useState(false);

  /* every complete month of the light universe, national: market total and the selected brands */
  const all = useMemo(() => {
    if (!hist.data) return null;
    const set = new Set(chosen);
    return engine.historyMonthly(hist.data, { population: 'light' }, 'marca').filter(m => m.complete && m.market > 0).map(m => {
      const by = new Map();
      for (const [name, n] of m.groups) { const b = engine.chineseBase(name); if (set.has(b)) by.set(b, (by.get(b) ?? 0) + n); }
      return { month: m.month, market: m.market, china: [...by.values()].reduce((s, v) => s + v, 0), by };
    });
  }, [hist.data, chosenKey]);

  const view = useMemo(() => {
    if (!all?.length) return null;
    const rows = span ? all.slice(-span) : all;
    const avg = key => all.map((_, i) => (i < 11 ? null : all.slice(i - 11, i + 1).reduce((s, r) => s + r[key], 0) / 12));
    const win = (arr, len) => arr.slice(-len);
    const mk = avg('market'), ch = avg('china'), len = rows.length;
    const lines = [
      { name: 'Mercado total', color: '#8e8e93', values: smooth ? win(mk, len) : rows.map(r => r.market) },
      { name: 'Marcas chinesas', color: '#e60f2d', main: true, values: smooth ? win(ch, len) : rows.map(r => r.china) },
    ];
    const totals = new Map();
    for (const r of rows) for (const [b, n] of r.by) totals.set(b, (totals.get(b) ?? 0) + n);
    const top = [...totals].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]), heads = top.slice(0, 7).map(([b]) => b), rest = top.slice(7).map(([b]) => b);
    const stack = heads.map((b, i) => ({ name: brandTitle(b), color: COLORS[i % COLORS.length], values: rows.map(r => (r.by.get(b) ?? 0) / r.market) }));
    if (rest.length) stack.push({ name: 'Outras chinesas', color: '#c7c7cc', values: rows.map(r => rest.reduce((s, b) => s + (r.by.get(b) ?? 0), 0) / r.market) });
    const shareNow = rows.at(-1).china / rows.at(-1).market, shareThen = rows[0].china / rows[0].market;
    const peak = rows.reduce((a, r) => (r.china / r.market > a.v ? { v: r.china / r.market, month: r.month } : a), { v: -1 });
    return { rows, lines, stack, months: rows.map(r => r.month), shareNow, shareThen, peak, maxShare: Math.min(1, Math.max(.05, Math.ceil(Math.max(...rows.map(r => r.china / r.market)) * 1.15 / .05) * .05)) };
  }, [all, span, smooth]);

  const last = view?.rows.at(-1);
  const sub = view && last ? <>Em <em>{monthLabel(last.month)}</em>, as {chosen.length} marcas escolhidas somam <em>{fmt(last.china)}</em> emplacamentos, <em>{pct(view.shareNow, 1)}</em> do mercado{view.rows.length > 12 ? <>; no início da janela eram {pct(view.shareThen, 1)}</> : ''}.</> : 'Carregando a série mensal…';
  return (
    <div className="nxo-view nxo-grid nxch">
      <Block className="nx-c12" title="Quais marcas contam como chinesas" sub={`${chosen.length} marcas selecionadas`}
        info="Começa com as marcas de origem chinesa da classificação auditada. Você pode tirar ou incluir marcas; a escolha vale para os gráficos desta página, para as barras de origem e para a pirâmide em Segmentos.">
        <ChineseBrandPicker names={names} />
      </Block>
      <Block className="nx-c12" title="Mercado × marcas chinesas" sub={sub}
        info="Emplacamentos mensais de automóveis e comerciais leves no Brasil: o mercado inteiro e a soma das marcas escolhidas. Série nacional desde 2016; os filtros do topo não se aplicam."
        actions={<div className="nxch-ctl">
          <div className="nx-seg" role="group" aria-label="Janela">{WINDOWS.map(([k, l]) => <button key={k} type="button" aria-pressed={span === k} onClick={() => setSpan(k)}>{l}</button>)}</div>
          <div className="nx-seg" role="group" aria-label="Suavização"><button type="button" aria-pressed={!smooth} onClick={() => setSmooth(false)}>Mensal</button><button type="button" aria-pressed={smooth} onClick={() => setSmooth(true)}>Média 12 meses</button></div>
        </div>}>
        {view ? <Lines months={view.months} series={view.lines} label="Emplacamentos mensais: mercado total e marcas chinesas" /> : <div className="nxch-skel" />}
      </Block>
      <Block className="nx-c12" title="Participação das chinesas no mercado" sub={view ? <>De {pct(view.shareThen, 1)} para <em>{pct(view.shareNow, 1)}</em>{view.peak.v > view.shareNow + .005 ? <>, com pico de {pct(view.peak.v, 1)} em {monthLabel(view.peak.month)}</> : ''}.</> : ''}
        info="Cada faixa é a fatia de uma marca no total de emplacamentos do mês; a altura total é a participação das marcas escolhidas. As sete maiores aparecem separadas e as demais ficam em 'Outras chinesas'.">
        {view ? (view.stack.length ? <ShareArea months={view.months.map(m => ({ label: monthLabel(m), short: short(m) }))} series={view.stack} max={view.maxShare} /> : <p className="nx-note">Nenhuma das marcas escolhidas emplacou nesta janela.</p>) : <div className="nxch-skel" />}
        <p className="nx-note">Base: emplacamentos (registros) de automóveis e comerciais leves, meses completos, todo o Brasil. Marcas com variantes (B)/(T) somam numa só.</p>
      </Block>
    </div>
  );
}
