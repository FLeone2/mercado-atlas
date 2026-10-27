import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import ufGeometry from '../../market/geo/uf-geometry.json';
import { downloadCsv } from '../../kit/index.js';
import { Block } from '../base/block.jsx';
import { BarList } from '../base/charts.jsx';
import { UfMap } from '../base/geo.jsx';
import '../base/geo.css';
import { useWidth } from '../base/model-charts.jsx';
import { useAtlas } from '../ctx.js';
import { PageHead, Section, Scope, Seg, Skel } from '../ui.jsx';
import { Lines } from '../charts.jsx';
import { MapaCalor, Top3 } from './lab-mapas.jsx';
import Piramide from './piramide.jsx';
import { active, brandName, fmt, pct, signed, label, monthLabel, rangeText, UF_NAMES, historyGroup, ignoredBy, lastCompleteIndex, versionLabel, SHORT_MONTH } from '../lib.js';

/* Laboratório: perguntas rápidas, construtor de gráficos, mapa e composição no tempo, Brasil em
   relevo e a metodologia. Tudo com os filtros do site. */

const valid = r => r.count > 0 && !/classific|informado|correspond/i.test(r.name);
const PALETTE = ['#2f6fdf', '#e09a2c', '#2a9d8f', '#8e6bd1', '#d2589b', '#5b8c3a', '#3fa7d6', '#9a7b4f', '#64748b', '#c0843d'];
const ELECTRIC = ['HEV', 'PHEV', 'BEV', 'MHEV'];

/* ---------- perguntas rápidas ---------- */
function Perguntas() {
  const { market, focus, focusName, go } = useAtlas(), sel = engine.useChineseSelection();
  const qa = useMemo(() => {
    if (!market) return null;
    const g = market.groups ?? {}, T = market.total, out = [], yr = d => new Map((market.yearGroups?.[d] ?? []).map(r => [r.name, r.count]));
    const top = (g.marca ?? []).filter(valid)[0];
    if (top) { const y0 = yr('marca').get(top.name); out.push({ q: 'Quem lidera o mercado?', a: <>{brandName(top.name)}, com <em>{pct(top.count / T, 1)}</em> dos emplacamentos{y0 > 0 ? <> ({signed(top.count / y0 - 1, 0)} em um ano)</> : ''}.</>, to: ['concorrencia', 'c-conectado'] }); }
    const mod = (g.grupo_modelo ?? []).filter(valid)[0];
    if (mod) out.push({ q: 'Qual é o modelo mais vendido?', a: <>{label('grupo_modelo', mod.name)}: {fmt(mod.count)} emplacamentos, {pct(mod.count / T, 1)} do mercado.</>, to: ['concorrencia', 'c-conectado'] });
    const ver = (g.modelo ?? []).filter(valid)[0], vi = ver && (market.versionInfo ?? []).find(v => v.modelo === ver.name);
    if (ver) out.push({ q: 'E a versão mais vendida?', a: <>{versionLabel(ver.name, vi?.grupo_modelo)}{vi ? ' (' + brandName(vi.marca) + ')' : ''}: {fmt(ver.count)} emplacamentos.</>, to: ['concorrencia', 'c-versoes'] });
    const f = market.focus;
    if (f) { const rank = (g.marca ?? []).filter(valid).findIndex(r => r.name === focus) + 1; out.push({ q: 'Como está a ' + focusName + '?', a: <>{fmt(f.total)} emplacamentos ({signed(f.yearChangeRate, 1)} em um ano; mercado {signed(market.yearChangeRate, 1)}), <em>{pct(T > 0 ? f.total / T : 0, 2)}</em> do mercado{rank ? ', ' + rank + 'ª marca' : ''}.</>, to: ['foco'] }); }
    if (f?.groups?.uf && T > 0 && f.total > 0) {
      const fu = new Map(f.groups.uf.map(r => [r.name, r.count])), nat = f.total / T;
      const best = (g.uf ?? []).filter(r => UF_NAMES[r.name] && r.count >= 300).map(r => ({ uf: r.name, s: (fu.get(r.name) ?? 0) / r.count })).sort((a, b) => b.s - a.s)[0];
      if (best) out.push({ q: 'Onde a ' + focusName + ' é mais forte?', a: <>{UF_NAMES[best.uf]}: {pct(best.s, 1)} do mercado do estado, {(best.s / nat).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a média do país.</>, to: ['territorios', 't-estados'] });
    }
    const ys = yr('bd_segmento'), segs = (g.bd_segmento ?? []).filter(r => valid(r) && r.count / T >= .02 && ys.get(r.name) > 0).map(r => ({ ...r, ch: r.count / ys.get(r.name) - 1 })).sort((a, b) => b.ch - a.ch);
    if (segs.length > 1) out.push({ q: 'Qual porte mais cresce?', a: <>{label('bd_segmento', segs[0].name)}: <em className={segs[0].ch >= 0 ? 'up' : 'down'}>{signed(segs[0].ch, 0)}</em> em um ano. O que mais cai: {label('bd_segmento', segs.at(-1).name).toLowerCase()} ({signed(segs.at(-1).ch, 0)}).</>, to: ['mercado'] });
    const yp = yr('propulsao'), el = (g.propulsao ?? []).filter(r => ELECTRIC.includes(r.name)).reduce((s, r) => s + r.count, 0), el0 = ELECTRIC.reduce((s, k) => s + (yp.get(k) ?? 0), 0);
    if (T > 0) out.push({ q: 'Quanto pesam os eletrificados?', a: <><em>{pct(el / T, 1)}</em> dos emplacamentos são híbridos ou elétricos{market.year > 0 && el0 > 0 ? <>, contra {pct(el0 / market.year, 1)} um ano antes</> : ''}.</>, to: ['mercado'] });
    const vd = (g.tipo_venda ?? []).find(r => r.name === 'VD')?.count ?? 0, fvd = (f?.groups?.tipo_venda ?? []).find(r => r.name === 'VD')?.count ?? 0;
    if (T > 0 && vd > 0) out.push({ q: 'Varejo ou venda direta?', a: <>Venda direta (locadoras, frotistas, PcD, produtor rural) é {pct(vd / T, 0)} do mercado{f?.total > 0 ? <> e {pct(fvd / f.total, 0)} das vendas da {focusName}</> : ''}.</>, to: ['foco', 'f-canal'] });
    const cn = rows => rows.filter(r => engine.isChineseBrand(r.name, sel)).reduce((s, r) => s + r.count, 0), ch = cn(g.marca ?? []), ych = cn(market.yearGroups?.marca ?? []);
    if (T > 0) out.push({ q: 'Quanto as marcas chinesas já vendem?', a: <><em>{pct(ch / T, 1)}</em> do mercado{market.year > 0 && ych > 0 ? <>; eram {pct(ych / market.year, 1)} um ano antes</> : ''}.</>, to: ['mercado'] });
    return out;
  }, [market, focus, focusName, sel]);
  if (!qa) return <div className="nx-c12"><Skel h={220} /></div>;
  return <div className="nx-c12 px-qa">{qa.map(x => <button key={x.q} type="button" className="px-qa-i" onClick={() => go(...x.to)}><b>{x.q}</b><p>{x.a}</p><span aria-hidden>→</span></button>)}</div>;
}

/* ---------- construtor de gráficos ---------- */
const DIMS = [['marca', 'Marca'], ['grupo_modelo', 'Modelo'], ['modelo', 'Versão'], ['bd_segmento', 'Porte'], ['bd_carroceria', 'Carroceria'], ['segmento', 'Tipo de veículo'], ['combustivel', 'Combustível'], ['propulsao', 'Propulsão'], ['tipo_venda', 'Canal'], ['regiao', 'Região'], ['uf', 'Estado'], ['municipio', 'Município'], ['bd_origem', 'Origem'], ['ano_fabricacao', 'Ano de fabricação']];
const HIST_DIMS = { marca: 1, grupo_modelo: 1, modelo: 1, bd_segmento: 1, bd_carroceria: 1, segmento: 1, combustivel: 1, propulsao: 1, tipo_venda: 1, uf: 1 };
function Construtor() {
  const { market, focus, focusName, mFilters, base, cityName } = useAtlas();
  const [dim, setDim] = useState('marca'), [measure, setMeasure] = useState('volume'), [form, setForm] = useState('barras'), [n, setN] = useState(15);
  const canLines = Boolean(HIST_DIMS[dim]);
  const shape = form === 'linhas' && !canLines ? 'barras' : form;
  const histScope = useMemo(() => (dim === 'uf' && !active(mFilters.uf) ? { ...mFilters, uf: Object.keys(UF_NAMES) } : mFilters), [mFilters, dim]);
  const h = engine.useHistory(histScope, base, shape === 'linhas', dim === 'modelo' ? 'versions' : null);
  const vinfo = useMemo(() => new Map((market?.versionInfo ?? []).map(r => [r.modelo, r])), [market]);
  const name = v => (dim === 'modelo' ? versionLabel(v, vinfo.get(v)?.grupo_modelo) : dim === 'municipio' ? cityName(v) : dim === 'uf' ? UF_NAMES[v] ?? v : label(dim, v));
  const isFocus = v => (dim === 'marca' ? v === focus : dim === 'modelo' ? vinfo.get(v)?.marca === focus : dim === 'grupo_modelo' ? (market?.focus?.groups?.grupo_modelo ?? []).some(r => r.name === v && r.count > 0) : false);
  const rows = useMemo(() => {
    if (!market?.groups?.[dim]) return null;
    const yr = market.yearGroups?.[dim] ? new Map(market.yearGroups[dim].map(r => [r.name, r.count])) : null, T = market.total;
    return market.groups[dim].filter(valid).map((r, i) => {
      const before = yr ? yr.get(r.name) ?? 0 : r.previous ?? 0;
      return { name: r.name, label: name(r.name), count: r.count, share: T > 0 ? r.count / T : 0, before, change: before > 0 ? r.count / before - 1 : null, rank: i + 1 };
    });
  }, [market, dim, vinfo]); // eslint-disable-line react-hooks/exhaustive-deps
  const vs = market?.yearGroups?.[dim] ? 'mesmo período do ano anterior (' + rangeText(market.yearRange) + ')' : 'período anterior (' + rangeText(market?.previousRange) + ')';
  const shown = useMemo(() => {
    if (!rows) return null;
    const sorted = measure === 'change' ? rows.filter(r => r.change != null && r.before >= 30).sort((a, b) => b.change - a.change) : rows;
    return sorted.slice(0, n);
  }, [rows, measure, n]);
  const lines = useMemo(() => {
    if (shape !== 'linhas' || !h.data || !shown) return null;
    const g = historyGroup(h.data, histScope, [dim]); if (!g) return null;
    const i1 = lastCompleteIndex(g, market?.range?.end?.slice(0, 7)), i0 = Math.max(0, i1 - 35), months = g.months.slice(i0, i1 + 1);
    const pick = shown.slice(0, 8);
    let k = 0;
    return { months, series: pick.map(r => ({ name: r.label, color: isFocus(r.name) ? 'var(--nx-accent)' : PALETTE[k++ % PALETTE.length], width: isFocus(r.name) ? 3.2 : 2, values: months.map((_, j) => { const v = g.by.get(r.name)?.[i0 + j] ?? 0, t = g.total[i0 + j]; return measure === 'share' ? (t > 0 ? v / t : null) : v; }) })) };
  }, [shape, h.data, histScope, dim, shown, measure, market?.range]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = r => (measure === 'share' ? r.share : measure === 'change' ? r.change : r.count);
  const text = r => (measure === 'share' ? pct(r.share, 1) : measure === 'change' ? signed(r.change, 1) : fmt(r.count));
  const csv = () => downloadCsv('atlas-construtor-' + dim, (rows ?? []).map(r => ({ [DIMS.find(d => d[0] === dim)[1]]: r.label, registro: r.name, emplacamentos: r.count, participacao: +r.share.toFixed(6), periodo_comparado: r.before, variacao: r.change == null ? '' : +r.change.toFixed(6) })));
  const dimLabel = DIMS.find(d => d[0] === dim)[1];
  return (
    <Block className="nx-c12" title={'Emplacamentos por ' + dimLabel.toLowerCase()} sub={<>{market ? rangeText(market.range) : '…'} · {measure === 'change' ? 'variação contra o ' + vs + ', entre os que tinham 30 emplacamentos ou mais' : measure === 'share' ? 'participação no recorte' : 'volume no recorte'}{dim === 'marca' || dim === 'modelo' || dim === 'grupo_modelo' ? <> · em <em>vermelho</em>, {focusName}</> : ''}</>}
      info="Escolha o que agrupar, a medida, o formato e quantos itens. Os filtros do site valem aqui. Linhas no tempo usam o histórico mensal (36 meses, até 8 séries). O CSV traz todas as linhas, não só as exibidas."
      actions={<div className="px-ctl">
        <label className="px-select">Agrupar por<select value={dim} onChange={e => setDim(e.target.value)}>{DIMS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <Seg label="Medida" value={measure} onChange={setMeasure} options={[['volume', 'Volume'], ['share', 'Participação'], ['change', 'Variação']]} />
        <Seg label="Formato" value={shape} onChange={setForm} options={[['barras', 'Barras'], ['tabela', 'Tabela'], ...(canLines ? [['linhas', 'No tempo']] : [])]} />
        <Seg label="Quantos" value={n} onChange={setN} options={[[10, '10'], [15, '15'], [30, '30'], [50, '50']]} />
        <button type="button" className="px-btn-link" onClick={csv} disabled={!rows}>Baixar CSV</button>
      </div>}>
      {!shown ? <Skel h={420} /> : !shown.length ? <p className="px-scopenote">Nada para mostrar neste recorte.</p> : shape === 'barras' ? (
        <BarList rows={shown.map(r => ({ key: r.name, name: isFocus(r.name) ? focus : r.name, label: r.label, title: r.name, rank: r.rank, value: Math.abs(value(r) ?? 0), valueText: text(r), delta: measure === 'volume' ? r.change : null, deltaText: measure === 'volume' && r.change != null ? signed(r.change, 0) : '' }))} focus={focus} />
      ) : shape === 'tabela' ? (
        <div className="px-table-wrap"><table className="px-table">
          <thead><tr><th>#</th><th>{dimLabel}</th><th>Emplacamentos</th><th>Participação</th><th>Comparado</th><th>Variação</th></tr></thead>
          <tbody>{shown.map(r => <tr key={r.name} className={isFocus(r.name) ? 'f' : ''}><td>{r.rank}</td><th title={r.name}>{r.label}</th><td>{fmt(r.count)}</td><td>{pct(r.share, 2)}</td><td>{fmt(r.before)}</td><td className={r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}>{signed(r.change, 1)}</td></tr>)}</tbody>
        </table></div>
      ) : lines ? <Lines months={lines.months} series={lines.series} fmtY={measure === 'share' ? v => pct(v, 0) : fmt} fmtTip={measure === 'share' ? v => pct(v, 1) : fmt} height={340} label={'Emplacamentos por ' + dimLabel.toLowerCase() + ' no tempo'} /> : h.error ? <p className="px-scopenote">Histórico indisponível ({h.error}).</p> : <Skel h={340} />}
      {shape === 'linhas' && <Scope ignored={engine.historyPlan(histScope, dim === 'modelo' ? 'versions' : null).ignoredLabels} />}
    </Block>
  );
}

/* ---------- mapa no tempo: estados mês a mês (acumulado de 12 meses) ---------- */
function MapaTempo() {
  const { mFilters, base, focus, focusName, tip } = useAtlas();
  const scope = useMemo(() => ({ ...mFilters, uf: active(mFilters.uf) ? mFilters.uf : Object.keys(UF_NAMES) }), [mFilters]);
  const h = engine.useHistory(scope, base, true);
  const [mode, setMode] = useState('share'), [i, setI] = useState(null), [play, setPlay] = useState(false), [speed, setSpeed] = useState(1);
  const F = useMemo(() => {
    const g = historyGroup(h.data, scope, ['uf', 'marca']); if (!g) return null;
    const last = lastCompleteIndex(g, null), ufs = new Map();
    for (const [k, a] of g.by) { const [u, b] = k.split('|'); if (!UF_NAMES[u]) continue; if (!ufs.has(u)) ufs.set(u, new Map()); ufs.get(u).set(b, a); }
    const frames = [], led = new Map();
    for (let t = 11; t <= last; t++) {
      const st = new Map();
      for (const [u, brands] of ufs) {
        let tot = 0, foc = 0, lead = null, lv = 0;
        for (const [b, a] of brands) { let s = 0; for (let q = t - 11; q <= t; q++) s += a[q]; tot += s; if (b === focus) foc = s; if (s > lv) { lv = s; lead = b; } }
        if (tot > 0) { st.set(u, { tot, foc, share: foc / tot, lead, leadShare: lv / tot }); led.set(lead, (led.get(lead) ?? 0) + 1); }
      }
      frames.push({ month: g.months[t], st });
    }
    const color = new Map([...led].sort((a, b) => b[1] - a[1]).map(([b]) => b).filter(b => b !== focus).slice(0, PALETTE.length).map((b, k) => [b, PALETTE[k]]));
    color.set(focus, 'var(--nx-accent)');
    const maxShare = Math.max(1e-6, ...frames.flatMap(f => [...f.st.values()].map(x => x.share)));
    const nat = frames.map(f => { let a = 0, b = 0; for (const x of f.st.values()) { a += x.foc; b += x.tot; } return b > 0 ? a / b : null; });
    return { frames, color, maxShare, nat };
  }, [h.data, scope, focus]);
  const k = F ? Math.min(i ?? F.frames.length - 1, F.frames.length - 1) : 0;
  useEffect(() => {
    if (!play || !F) return undefined;
    const id = setInterval(() => setI(x => { const nx = (x ?? 0) + 1; if (nx >= F.frames.length) { setPlay(false); return F.frames.length - 1; } return nx; }), 320 / speed);
    return () => clearInterval(id);
  }, [play, speed, F]);
  if (!F) return <div className="nx-c12">{h.error ? <p className="px-scopenote">Histórico indisponível ({h.error}).</p> : <Skel h={520} />}</div>;
  const fr = F.frames[k], rows = [...fr.st].map(([u, x]) => ({ u, ...x }));
  const paint = u => {
    const x = fr.st.get(u); if (!x) return { fill: '#e6e6ea', opacity: 1, tip: <strong>{UF_NAMES[u]}</strong> };
    const t = <><strong>{UF_NAMES[u]} · 12 meses até {monthLabel(fr.month)}</strong><span>{fmt(x.tot)} emplacamentos</span><span>{focusName}: <b>{pct(x.share, 1)}</b></span><span>Líder: <b>{brandName(x.lead)}</b> ({pct(x.leadShare, 0)})</span></>;
    if (mode === 'lider') return { fill: F.color.get(x.lead) ?? '#a8a29e', opacity: .35 + .65 * Math.min(1, x.leadShare / .35), tip: t };
    return { fill: 'var(--nx-accent)', opacity: .06 + .94 * Math.min(1, x.share / F.maxShare), tip: t };
  };
  const top = [...rows].sort((a, b) => b.share - a.share).slice(0, 5), leaders = new Map(); for (const r of rows) leaders.set(r.lead, (leaders.get(r.lead) ?? 0) + 1);
  return (
    <Block className="nx-c12" title={mode === 'lider' ? 'A marca líder em cada estado, mês a mês' : 'Participação da ' + focusName + ' em cada estado, mês a mês'} sub={<>Acumulado de 12 meses até <em>{monthLabel(fr.month)}</em> · aperte o play ou arraste a linha do tempo</>}
      actions={<div className="px-ctl"><Seg label="Cor" value={mode} onChange={setMode} options={[['share', 'Participação da ' + focusName], ['lider', 'Marca líder']]} /><Seg label="Velocidade" value={speed} onChange={setSpeed} options={[[.5, '0,5×'], [1, '1×'], [2, '2×']]} /></div>}>
      <div className="px-mt">
        <div className="px-mt-map"><UfMap paint={paint} tip={tip} label={'Mapa no tempo · ' + monthLabel(fr.month)} /></div>
        <div className="px-mt-side">
          <span className="px-mt-month">{monthLabel(fr.month)}</span>
          <small>{focusName} no recorte: <b>{pct(F.nat[k], 2)}</b></small>
          {mode === 'share' ? <><h5>Onde a {focusName} tem mais participação</h5>{top.map(r => <div key={r.u} className="px-mt-r"><span>{UF_NAMES[r.u]}</span><b>{pct(r.share, 1)}</b></div>)}</>
            : <><h5>Estados liderados</h5>{[...leaders].sort((a, b) => b[1] - a[1]).map(([b, c]) => <div key={b} className="px-mt-r"><span><i style={{ background: F.color.get(b) ?? '#a8a29e' }} />{brandName(b)}</span><b>{c}</b></div>)}</>}
        </div>
      </div>
      <div className="px-mt-bar">
        <button type="button" className="px-play" onClick={() => { if (!play && k >= F.frames.length - 1) setI(0); setPlay(!play); }} aria-label={play ? 'Pausar' : 'Tocar'}>{play ? '❚❚' : '▶'}</button>
        <input type="range" min={0} max={F.frames.length - 1} value={k} onChange={e => { setPlay(false); setI(+e.target.value); }} aria-label="Mês" />
        <span>{SHORT_MONTH(F.frames[0].month)} – {SHORT_MONTH(F.frames.at(-1).month)}</span>
      </div>
      <Scope ignored={ignoredBy(scope)} />
    </Block>
  );
}

/* ---------- composição no tempo: participação de cada grupo, mês a mês ---------- */
function StackArea({ months, series, height = 340 }) {
  const [ref, w] = useWidth(), { tip } = useAtlas(), [hv, setHv] = useState(null);
  const W = Math.max(300, w || 900), pad = { l: 40, r: 12, t: 8, b: 26 }, n = months.length, H = height;
  const X = i => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = v => pad.t + (1 - v) * (H - pad.t - pad.b);
  const st = useMemo(() => { const acc = new Array(n).fill(0); return series.map(s => { const lo = acc.slice(); s.values.forEach((v, i) => { acc[i] += v ?? 0; }); return { ...s, lo, hi: acc.slice() }; }); }, [series, n]);
  const d = s => 'M' + s.hi.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('L') + 'L' + s.lo.map((v, i) => [X(i), Y(v)]).reverse().map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
  const step = Math.max(1, Math.round(n / (W < 600 ? 4 : 8)));
  const move = e => { const r = e.currentTarget.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - pad.l) / (W - pad.l - pad.r) * (n - 1)))); setHv(i); tip.show(e, <><strong>{monthLabel(months[i])}</strong>{[...series].reverse().filter(s => (s.values[i] ?? 0) > .0005).map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{pct(s.values[i], 1)}</b></span>)}</>); };
  return (
    <div ref={ref}>
      <svg width={W} height={H} className="px-stack" role="img" aria-label="Composição do mercado no tempo" onPointerMove={move} onPointerLeave={() => { setHv(null); tip.hide(); }}>
        {[0, .25, .5, .75, 1].map(t => <g key={t} className="px-ax"><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={pad.l - 6} y={Y(t) + 4} textAnchor="end">{Math.round(t * 100)}%</text></g>)}
        {months.map((m, i) => i % step === 0 && <text key={m} className="px-ax-x" x={X(i)} y={H - 6} textAnchor="middle">{SHORT_MONTH(m)}</text>)}
        {st.map((s, k) => <path key={s.name} d={d(s)} fill={s.color} className="px-stack-a" style={{ animationDelay: k * 80 + 'ms' }} />)}
        {hv != null && <line x1={X(hv)} x2={X(hv)} y1={pad.t} y2={H - pad.b} stroke="#1d1d1f" strokeOpacity=".5" />}
      </svg>
      <div className="nx-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}
const COMP = [['propulsao', 'Propulsão'], ['bd_segmento', 'Porte'], ['bd_carroceria', 'Carroceria'], ['tipo_venda', 'Canal'], ['combustivel', 'Combustível']];
const COMP_COLORS = ['#1d1d1f', '#2f6fdf', '#2a9d8f', '#e09a2c', '#8e6bd1', '#d2589b', '#c7c7cc'];
function Composicao() {
  const { hist, mFilters } = useAtlas(), [dim, setDim] = useState('propulsao'), [span, setSpan] = useState(60);
  const d = useMemo(() => {
    const g = historyGroup(hist.data, mFilters, [dim]); if (!g) return null;
    const i1 = lastCompleteIndex(g, null), i0 = Math.max(0, i1 - span + 1), months = g.months.slice(i0, i1 + 1);
    const tot = [...g.by].filter(([k]) => !/classific|informado|correspond/i.test(k)).map(([k, a]) => [k, a.slice(i0, i1 + 1).reduce((s, v) => s + v, 0)]).sort((a, b) => b[1] - a[1]);
    const keep = tot.slice(0, 6).map(([k]) => k), rest = [...g.by.keys()].filter(k => !keep.includes(k));
    const share = arr => months.map((_, j) => (g.total[i0 + j] > 0 ? arr(i0 + j) / g.total[i0 + j] : 0));
    const series = keep.map((k, c) => ({ name: label(dim, k), color: COMP_COLORS[c], values: share(i => g.by.get(k)[i]) }));
    if (rest.length) series.push({ name: 'Outros e não classificados', color: '#e5e5ea', values: share(i => rest.reduce((s, k) => s + g.by.get(k)[i], 0)) });
    const first = series[0], delta = first ? first.values.at(-1) - first.values[0] : 0;
    return { months, series, first, delta };
  }, [hist.data, mFilters, dim, span]);
  return (
    <Block className="nx-c12" title={'Composição do mercado por ' + COMP.find(c => c[0] === dim)[1].toLowerCase()} sub={d?.first ? <>{d.first.name}: {pct(d.first.values[0], 0)} em {monthLabel(d.months[0])} → <em>{pct(d.first.values.at(-1), 0)}</em> em {monthLabel(d.months.at(-1))}</> : null}
      actions={<div className="px-ctl"><Seg label="Grupo" value={dim} onChange={setDim} options={COMP.map(([k, t]) => [k, t])} /><Seg label="Janela" value={span} onChange={setSpan} options={[[36, '3 anos'], [60, '5 anos'], [129, 'Desde 2016']]} /></div>}>
      {!d ? <Skel h={360} /> : <StackArea months={d.months} series={d.series} />}
      <Scope ignored={ignoredBy(mFilters)} />
    </Block>
  );
}

/* ---------- Brasil em relevo: um espigão por município, altura pelos emplacamentos ---------- */
const UF_PATHS = ufGeometry.features.map(f => f.path);
function Relevo() {
  const { mFilters, focus, focusName, points } = useAtlas();
  const q = engine.useMarketData(mFilters, true, 'leaders-br', false, focus);
  const [what, setWhat] = useState('total'), [ref, w] = useWidth(), cv = useRef(null), view = useRef({ rot: 0, tilt: .55, drag: null }), [hover, setHover] = useState(null), [, kick] = useState(0);
  const spikes = useMemo(() => {
    if (!points || !q.result?.municipalLeaders) return null;
    const pos = new Map(points.rows.map(([, n, u, x, y]) => [engine.geoKey(n, u) + '|' + u, { x, y, name: n, uf: u }]));
    const out = [];
    for (const m of q.result.municipalLeaders) { const p = pos.get(engine.geoKey(m.municipio, m.uf) + '|' + m.uf); if (!p) continue; out.push({ ...p, total: m.total, focus: m.focus, lead: m.top?.[0]?.[0], focusLeads: m.top?.[0]?.[0] === focus }); }
    return out;
  }, [points, q.result, focus]);
  const W = Math.max(300, w || 900), H = Math.round(Math.min(620, Math.max(380, W * .62)));
  useEffect(() => {
    const c = cv.current; if (!c || !spikes) return;
    const dpr = Math.min(2, devicePixelRatio || 1); c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d'), { rot, tilt } = view.current, s = Math.min(W / 660, H / 400), cx = W / 2, cy = H * .6, mx = 315, my = 282;
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = tilt;
    const P = (x, y) => { const dx = x - mx, dy = y - my, rx = dx * cr - dy * sr, ry = dx * sr + dy * cr; return [cx + rx * s, cy + ry * ct * s, ry]; };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    // estados no chão (a mesma transformação afim do relevo)
    ctx.save(); ctx.setTransform(dpr * s * cr, dpr * s * sr * ct, -dpr * s * sr, dpr * s * cr * ct, dpr * (cx - s * (mx * cr - my * sr)), dpr * (cy - s * ct * (mx * sr + my * cr)));
    for (const d of UF_PATHS) { const p = new Path2D(d); ctx.fillStyle = '#ececf0'; ctx.fill(p); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 / s; ctx.stroke(p); }
    ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const val = m => (what === 'foco' ? m.focus : m.total), max = Math.max(1, ...spikes.map(val)), hMax = H * .5;
    const list = spikes.filter(m => val(m) > 0).map(m => { const [x, y, depth] = P(m.x, m.y); return { m, x, y, depth, h: hMax * Math.pow(val(m) / max, .6) }; }).sort((a, b) => a.depth - b.depth);
    for (const t of list) {
      const red = what === 'foco' || t.m.focusLeads;
      ctx.strokeStyle = red ? 'rgba(230,15,45,.85)' : 'rgba(29,29,31,.55)'; ctx.lineWidth = t.h > 40 ? 2.2 : 1.3;
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x, t.y - t.h); ctx.stroke();
      if (t.h > 60) { ctx.fillStyle = red ? '#e60f2d' : '#1d1d1f'; ctx.beginPath(); ctx.arc(t.x, t.y - t.h, 2.2, 0, Math.PI * 2); ctx.fill(); }
    }
    view.current.list = list;
  }, [spikes, W, H, what, kick]); // eslint-disable-line react-hooks/exhaustive-deps
  const redraw = () => kick(x => x + 1);
  const down = e => { view.current.drag = { x: e.clientX, y: e.clientY, rot: view.current.rot, tilt: view.current.tilt }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = e => {
    const v = view.current;
    if (v.drag) { v.rot = v.drag.rot + (e.clientX - v.drag.x) / 260; v.tilt = Math.max(.22, Math.min(.95, v.drag.tilt + (e.clientY - v.drag.y) / 400)); setHover(null); redraw(); return; }
    const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bd = 64; for (const t of v.list ?? []) { if (t.h < 6) continue; const d = (t.x - px) ** 2 + (t.y - t.h - py) ** 2; if (d < bd) { bd = d; best = t; } }
    setHover(best ? { ...best.m, sx: best.x, sy: best.y - best.h } : null);
  };
  const up = () => { view.current.drag = null; };
  const top = spikes ? [...spikes].sort((a, b) => (what === 'foco' ? b.focus - a.focus : b.total - a.total)).slice(0, 5) : [];
  return (
    <Block className="nx-c12" title="Brasil em relevo" sub={<>Um espigão por município, mais alto onde há mais {what === 'foco' ? 'emplacamentos da ' + focusName : 'emplacamentos'} · arraste para girar e inclinar{what === 'total' ? <> · em vermelho, municípios liderados pela {focusName}</> : ''}</>}
      info="A altura cresce com os emplacamentos do município no período, numa escala comprimida (potência 0,6) para que as capitais não escondam o resto. O chão é o mapa dos estados na mesma projeção."
      actions={<div className="px-ctl"><Seg label="Altura" value={what} onChange={setWhat} options={[['total', 'Mercado'], ['foco', focusName]]} /><button type="button" className="px-btn-link" onClick={() => { view.current.rot = 0; view.current.tilt = .55; redraw(); }}>Voltar à vista inicial</button></div>}>
      <div ref={ref} className="px-relevo">
        {!spikes ? <Skel h={H} /> : <canvas ref={cv} style={{ width: W, height: H, touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => { up(); setHover(null); }} aria-label="Relevo dos emplacamentos por município" role="img" />}
        {hover && <div className="nx-tip px-relevo-tip" style={{ left: Math.min(hover.sx + 12, W - 230), top: Math.max(0, hover.sy - 10) }}><strong>{hover.name} · {hover.uf}</strong><span>{fmt(hover.total)} emplacamentos</span><span>{focusName}: <b>{fmt(hover.focus)}</b></span><span>Líder: <b>{brandName(hover.lead)}</b></span></div>}
      </div>
      {top.length > 0 && <p className="px-scopenote">Mais altos: {top.map(m => m.name + ' (' + fmt(what === 'foco' ? m.focus : m.total) + ')').join(', ')}.</p>}
    </Block>
  );
}

/* ---------- dados e metodologia ---------- */
function Metodologia() {
  const { manifest, base } = useAtlas(), [econ, setEcon] = useState(null);
  useEffect(() => { let live = true; fetch(new URL('scenarios/econ_extra.json', base)).then(r => (r.ok ? r.json() : null)).then(d => live && setEcon(d)).catch(() => {}); return () => { live = false; }; }, [base]);
  const f = useMemo(() => {
    const months = [...(manifest?.months ?? [])].sort((a, b) => (a.month < b.month ? -1 : 1)), channel = months.find(m => (m.channelSourceFields ?? []).length > 0), bd = manifest?.bdClassification ?? {};
    return { start: manifest?.coverageStart, end: manifest?.coverageEnd, months: months.length, rows: manifest?.totals?.eligible_rows ?? manifest?.totals?.rows ?? null, generated: manifest?.generatedAt ? new Date(manifest.generatedAt).toLocaleDateString('pt-BR') : '—', missing: manifest?.missingMonths ?? [], channelFrom: channel?.month ?? null, repeated: manifest?.totals?.repeated_plate_excess_rows ?? null, verified: manifest?.sourceAvailability?.verifiedDownloads ?? null, expected: manifest?.sourceAvailability?.expectedSourceFiles ?? null, bdJoin: bd.join ?? null, bdMonths: (bd.coveredMonths ?? []).length, partial: months.filter(m => m.cubePath && m.complete === false).map(m => m.month) };
  }, [manifest]);
  const m = x => (x ? monthLabel(String(x).slice(0, 7)) : '—');
  const card = (t, items) => <div className="px-met-c" key={t}><h3>{t}</h3><ul>{items.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
  const series = econ?.series ?? [];
  return <>
    <div className="nx-c12 px-met">
      {card('De onde vêm', [fmt(f.months) + ' arquivos mensais de emplacamentos de automóveis e comerciais leves, de ' + m(f.start) + ' a ' + m(f.end) + (f.missing.length ? ' (faltam ' + f.missing.join(', ') + ')' : ', sem mês faltando') + '.', f.rows != null ? fmt(f.rows) + ' registros no total; cada linha da fonte conta uma vez.' : null, f.verified != null ? fmt(f.verified) + ' de ' + fmt(f.expected) + ' arquivos de origem conferidos no download.' : null, 'Base atualizada em ' + f.generated + '.'])}
      {card('O que os números medem', ['Emplacamento é o registro de um veículo novo, na data do registro. Não é venda faturada nem frota em circulação.', 'Participação é a parte do recorte escolhido nos filtros; mudar os filtros muda o universo. A marca em foco nunca encolhe o mercado.', 'Variação anual compara com o mesmo período do ano anterior; ritmo por dia útil desconta fins de semana, feriados nacionais, Carnaval e Corpus Christi.', 'Versão é o campo modelo do registro (Renavam); o rótulo mostra o nome do modelo na frente.', 'O local é o município de registro, não necessariamente o de uso: locadoras concentram registros em poucas cidades.'])}
      {card('O que não medem', ['Preço, desconto, estoque e vendas no atacado.', 'Usados, motos, caminhões e ônibus (fora do universo).', f.channelFrom ? 'Canal de venda (venda direta × varejo) só existe a partir de ' + m(f.channelFrom) + '; antes disso aparece como não informado.' : 'Canal de venda quando a fonte não informa.', 'Projeções e simulações da Economia são modelos, marcados como tal; não são dados observados.'])}
      {card('Como o site é conferido', ['Nada é deduplicado automaticamente' + (f.repeated != null ? ': ' + fmt(f.repeated) + ' placas repetidas ficam como na fonte' : '') + '. Datas inválidas ou fora do mês ficam fora das contas.', f.bdJoin ? 'Porte, carroceria e tecnologia vêm da classificação BD pelo código exato do modelo (' + fmt(f.bdMonths) + ' meses cobertos), sem correspondência aproximada.' : null, 'Testes automáticos conferem os totais mensais contra os arquivos, o histórico de 10 anos (nacional, por estado e por versão) contra os mesmos arquivos, e o pré-cálculo contra o cálculo ao vivo.', 'Categorias quase vazias (“Não classificado”, “Sem correspondência BD”) ficam fora dos gráficos, mas continuam no total e nos denominadores.', f.partial.length ? 'Meses parciais: ' + f.partial.map(m).join(', ') + ' (as séries mensais usam só meses completos).' : null])}
    </div>
    <Block className="nx-c12" title="Fontes econômicas na base" sub={series.length ? <>{series.length} séries oficiais, cada uma com recibo (endereço e impressão digital sha256 do arquivo baixado)</> : 'Carregando…'}>
      {series.length > 0 && <div className="px-table-wrap"><table className="px-table">
        <thead><tr><th>Série</th><th>Fonte</th><th>Desde</th><th>Último dado</th></tr></thead>
        <tbody>{series.map(s => <tr key={s.key}><th>{s.label ?? s.key}</th><td>{s.source ?? s.receipts?.[0]?.url?.split('/')[2] ?? '—'}</td><td>{s.monthly?.[0] ? m(s.monthly[0].month) : '—'}</td><td>{s.monthly?.at(-1) ? m(s.monthly.at(-1).month) : '—'}</td></tr>)}</tbody>
      </table></div>}
    </Block>
  </>;
}

export default function Laboratorio() {
  return (
    <div className="px-page">
      <PageHead title="Laboratório" strip={false} toc={[['l-perguntas', 'Perguntas rápidas'], ['l-construtor', 'Construtor de gráficos'], ['l-mapa', 'Mapa no tempo'], ['l-calor', 'Mapa de calor'], ['l-top3', 'Três primeiras marcas'], ['l-piramide', 'Pirâmide de segmentos'], ['l-composicao', 'Composição'], ['l-relevo', 'Brasil em relevo'], ['l-metodologia', 'Dados e metodologia']]} />
      <Section id="l-perguntas" title="Perguntas rápidas" sub="Respostas de uma linha para o recorte dos filtros. Clique para ir à análise completa."><Perguntas /></Section>
      <Section id="l-construtor" title="Construtor de gráficos" sub="Monte o seu cruzamento: qualquer agrupamento, volume, participação ou variação, em barras, tabela ou no tempo, com CSV."><Construtor /></Section>
      <Section id="l-mapa" title="Mapa no tempo" sub="Os estados mês a mês desde 2016, pelo acumulado de 12 meses."><MapaTempo /></Section>
      <Section id="l-calor" title="Mapa de calor" sub="Onde os emplacamentos se concentram, município a município, do mercado ou da marca em foco."><MapaCalor /></Section>
      <Section id="l-top3" title="Três primeiras marcas" sub="A 1ª, a 2ª e a 3ª marca de cada estado e de cada município."><Top3 /></Section>
      <Section id="l-piramide" title="Pirâmide de segmentos" sub="O tamanho de cada segmento no mercado e, dentro dele, quanto é da marca em foco, das chinesas ou dos eletrificados."><Piramide /></Section>
      <Section id="l-composicao" title="Composição no tempo" sub="Como o mercado se divide entre propulsões, portes, carrocerias, canais e combustíveis, mês a mês."><Composicao /></Section>
      <Section id="l-relevo" title="Brasil em relevo" sub="Os 5.570 municípios em três dimensões."><Relevo /></Section>
      <Section id="l-metodologia" title="Dados e metodologia" sub="De onde vêm os dados, o que cada número mede (e o que não mede) e como o site é conferido."><Metodologia /></Section>
    </div>
  );
}
