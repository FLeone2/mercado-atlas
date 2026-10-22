import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { exportContextSlug } from '../../kit/index.js';
import { useNext } from '../ctx.js';
import { Diverging } from '../charts.jsx';
import { UF_NAMES, fmt, monthLabel, pct, pp, rangeText, signed } from '../format.js';
import { AreaHead, Block, useUrlState, oneOf, jsonList } from '../ui.jsx';
import LegacyTab from '../LegacyTab.jsx';
import { BarRows, MonthLine, MultiLine, Pareto } from './explorar-charts.jsx';
import { arrow, groupLabel } from './segmentos-charts.jsx';
import './explorar.css';
import './explorar-skin.css';

/* art: artigo do plural ("os"/"as"); f: feminino */
const DIMS = [
  { id: 'marca', label: 'marca', sing: 'marca', plural: 'marcas', art: 'as', f: true },
  { id: 'uf', label: 'estado', sing: 'estado', plural: 'estados', art: 'os' },
  { id: 'municipio', label: 'município', sing: 'município', plural: 'municípios', art: 'os' },
  { id: 'modelo', label: 'modelo', sing: 'modelo', plural: 'modelos', art: 'os' },
  { id: 'grupo_modelo', label: 'grupo de modelos', sing: 'grupo de modelos', plural: 'grupos de modelos', art: 'os' },
  { id: 'combustivel', label: 'combustível', sing: 'combustível', plural: 'combustíveis', art: 'os' },
  { id: 'propulsao', label: 'propulsão', sing: 'propulsão', plural: 'propulsões', art: 'as', f: true },
  { id: 'bd_carroceria', label: 'carroceria', sing: 'carroceria', plural: 'carrocerias', art: 'as', f: true },
  { id: 'bd_segmento', label: 'porte', sing: 'porte', plural: 'portes', art: 'os' },
  { id: 'subsegmento', label: 'categoria', sing: 'categoria', plural: 'categorias', art: 'as', f: true },
  { id: 'segmento', label: 'tipo de veículo', sing: 'tipo de veículo', plural: 'tipos de veículo', art: 'os' },
  { id: 'tipo_venda', label: 'canal de venda', sing: 'canal de venda', plural: 'canais de venda', art: 'os' },
  { id: 'regiao', label: 'região', sing: 'região', plural: 'regiões', art: 'as', f: true },
  { id: 'ano_fabricacao', label: 'ano de fabricação', sing: 'ano de fabricação', plural: 'anos de fabricação', art: 'os' },
  { id: 'potencia', label: 'potência', sing: 'potência', plural: 'potências', art: 'as', f: true },
  { id: 'capacidade_passageiros', label: 'lotação', sing: 'lotação', plural: 'lotações', art: 'as', f: true },
];
const MEASURES = [['volume', 'volume'], ['share', 'participação'], ['change', 'variação']];
const BRAND = ['marca', 'modelo', 'grupo_modelo'], GEO = ['uf', 'regiao', 'municipio'];
const FAMILY = { marca: 'marca', modelo: 'versão', grupo_modelo: 'modelo', uf: 'estado', regiao: 'região', municipio: 'município' };
const HIST_DIMS = ['marca', 'uf', 'segmento', 'bd_segmento', 'bd_carroceria', 'combustivel', 'propulsao', 'tipo_venda', 'grupo_modelo'];
const CHEV = <svg viewBox="0 0 12 8" aria-hidden><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tone = x => (x == null || !Number.isFinite(x) || Math.abs(x) < .0005 ? '' : x > 0 ? 'up' : 'down');
const csvNum = (x, d = 2) => (x == null || !Number.isFinite(x) ? '' : String(+x.toFixed(d)).replace('.', ','));
const csvText = s => (/[;"\n\r]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));

function Perguntas() {
  const { filters, setFilter, model, market, geoless, hist, base, cityName } = useNext();
  // every control lives in the link (q.*), so sharing or reloading restores the same question
  const [measure, setMeasure] = useUrlState('q.m', 'volume', oneOf(MEASURES.map(m => m[0]))), [dimId, setDimId] = useUrlState('q.d', 'marca', oneOf(DIMS.map(d => d.id)));
  const [topN, setTopN] = useUrlState('q.n', 10, v => ([10, 25, 50].includes(+v) ? +v : undefined)), [q, setQ] = useUrlState('q.q', '');
  const [view, setView] = useUrlState('q.v', 'bars', oneOf(['bars', 'table'])), [sel, setSel] = useUrlState('q.s', null), [dir, setDir] = useUrlState('q.dir', 'up', oneOf(['up', 'down']));
  const [mode, setMode] = useUrlState('q.mode', 'detail', oneOf(['detail', 'compare'])), [cmp, setCmp] = useUrlState('q.c', [], jsonList, v => JSON.stringify(v)), [cmpMeasure, setCmpMeasure] = useUrlState('q.cm', 'abs', oneOf(['abs', 'share']));
  const dim = DIMS.find(d => d.id === dimId);
  // One filter contract for the ranking, the table and the monthly series: for a brand or a
  // geography dimension the whole family of filters is lifted (to compare against the market);
  // any other dimension keeps every filter.
  const strip = BRAND.includes(dimId) ? BRAND : GEO.includes(dimId) ? GEO : [];
  const src = BRAND.includes(dimId) ? market ?? model : GEO.includes(dimId) ? geoless ?? model : model;
  const dimFiltered = list(filters[dimId]);
  const lifted = strip.filter(k => list(filters[k]).length);

  const labelOf = useMemo(() => name => {
    if (dimId === 'uf') return UF_NAMES[name] ?? name;
    if (dimId === 'municipio') { const u = name.slice(name.lastIndexOf(' · ') + 3); return cityName(name) + ' · ' + u; }
    if (dimId === 'marca') return engine.insightName(name);
    if (dimId === 'modelo') return name;
    if (dimId === 'capacidade_passageiros') return name + (name === '1' ? ' lugar' : ' lugares');
    return groupLabel(dimId, name);
  }, [dimId, cityName]);

  const byCount = useMemo(() => {
    if (!src) return [];
    const prevTotal = src.previous, total = src.total;
    return (src.groups?.[dimId] ?? []).filter(g => g.count > 0).map(g => {
      const share = total > 0 ? g.count / total : 0, hasPrev = Number.isFinite(g.previous) && prevTotal > 0;
      return { name: g.name, label: labelOf(g.name), count: g.count, share, previous: Number.isFinite(g.previous) ? g.previous : null, changeRate: g.previous > 0 ? g.count / g.previous - 1 : null, shareChange: hasPrev ? share - g.previous / prevTotal : null };
    }).sort((a, b) => b.count - a.count);
  }, [src, dimId, labelOf]);

  const ranked = useMemo(() => {
    let a = byCount;
    if (measure === 'change') { a = byCount.filter(r => r.changeRate != null && r.share >= .001 && r.previous >= 30).sort(dir === 'up' ? (x, y) => y.changeRate - x.changeRate : (x, y) => x.changeRate - y.changeRate); }
    return a.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [byCount, measure, dir]);
  const matches = useMemo(() => { const f = fold(q.trim()); return f ? ranked.filter(r => fold(r.label).includes(f) || fold(r.name).includes(f)) : ranked; }, [ranked, q]);
  const shown = matches.slice(0, topN);

  const scaleMax = ranked.length ? Math.max(...ranked.slice(0, 200).map(r => Math.abs(measure === 'share' ? r.share : measure === 'change' ? r.changeRate : r.count))) : 1;
  const rows = useMemo(() => shown.map(r => {
    if (measure === 'share') return { ...r, bar: r.share, value: pct(r.share, r.share < .1 ? 2 : 1), sub: pp(r.shareChange), subTone: tone(r.shareChange), title: fmt(r.count) + ' emplacamentos' };
    if (measure === 'change') return { ...r, bar: r.changeRate, value: signed(r.changeRate), valueTone: tone(r.changeRate), sub: fmt(r.count) + ' empl.', title: pct(r.share, 2) + ' do mercado' };
    return { ...r, bar: r.count, value: fmt(r.count), sub: r.changeRate == null ? '' : arrow(r.changeRate), subTone: tone(r.changeRate), title: pct(r.share, 2) + ' do mercado' };
  }), [shown, measure]);

  const pick = r => (mode === 'compare' ? setCmp(c => (c.includes(r.name) ? c.filter(x => x !== r.name) : c.length >= 5 ? c : [...c, r.name])) : setSel(s => (s === r.name ? null : r.name)));
  const changeDim = id => { setDimId(id); setSel(null); setCmp([]); setQ(''); };
  const changeMode = m => { setMode(m); if (m === 'compare' && sel && !cmp.length) setCmp([sel]); };
  const selRow = sel ? byCount.find(r => r.name === sel) : null;

  /* ---------- história mensal do item escolhido ---------- */
  const ufHist = engine.useHistory({ uf: ['SP'] }, base, dimId === 'uf');
  const hsrc = dimId === 'uf' ? ufHist : hist;
  const histFilters = useMemo(() => ({ ...filters, ...Object.fromEntries(strip.map(k => [k, 'all'])) }), [filters, dimId]);
  const histOk = HIST_DIMS.includes(dimId);
  const monthly = useMemo(() => (histOk && hsrc?.data && hsrc.data.dimensions.includes(dimId) ? engine.historyMonthly(hsrc.data, histFilters, dimId).filter(m => m.complete) : null), [histOk, hsrc?.data, histFilters, dimId]);
  const series = useMemo(() => (sel && monthly ? monthly.map(m => ({ month: m.month, value: m.groups.get(sel) ?? 0 })) : null), [sel, monthly]);
  const COLORS = ['#2f6fed', '#e8a317', '#0f9d8a', '#8e5cf0', '#d9558f'];
  const cmpRows = useMemo(() => cmp.map((n, i) => ({ ...byCount.find(r => r.name === n), name: n, color: COLORS[i] })).filter(r => r.label), [cmp, byCount]);
  const cmpSeries = useMemo(() => (monthly ? cmpRows.map(r => ({ name: r.name, label: r.label, color: r.color, points: monthly.map(m => { const v = m.groups.get(r.name) ?? 0; return { month: m.month, value: cmpMeasure === 'share' ? (m.count > 0 ? v / m.count : 0) : v }; }) })) : null), [monthly, cmpRows, cmpMeasure]);
  const peak = series?.reduce((a, p) => (p.value > (a?.value ?? -1) ? p : a), null);
  const ignored = engine.historyPlan(dimId === 'uf' ? { ...histFilters, uf: ['XX'] } : histFilters).ignoredLabels;

  /* ---------- exportação ---------- */
  const period = model?.range?.start ? (model.range.start.slice(0, 7) === model.range.end.slice(0, 7) ? model.range.start.slice(0, 7) : model.range.start.slice(0, 7) + '_' + model.range.end.slice(0, 7)) : 'periodo';
  const exportCsv = () => {
    const head = ['posicao', dim.sing.replace(/ /g, '_'), 'codigo_original', 'emplacamentos', 'participacao_pct', 'periodo_anterior', 'variacao_pct', 'variacao_participacao_pp'];
    const lines = [head.join(';'), ...shown.map(r => [r.rank, csvText(r.label), csvText(r.name), r.count, csvNum(r.share * 100, 3), r.previous ?? '', csvNum(r.changeRate == null ? null : r.changeRate * 100, 2), csvNum(r.shareChange == null ? null : r.shareChange * 100, 3)].join(';'))];
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `atlas-${dimId}-${period}_${exportContextSlug()}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ---------- manchete ---------- */
  const N = byCount.length, total = src?.total ?? 0, who = dim.f ? 'a' : 'o';
  const k = Math.min(5, N), topShare = byCount.slice(0, k).reduce((s, r) => s + r.count, 0) / (total || 1);
  const first = ranked[0];
  let title = 'Carregando…';
  if (src) {
    if (!N) title = 'Nenhum emplacamento neste recorte.';
    else if (measure === 'change') {
      if (!first) title = 'Sem variação calculável neste recorte.';
      else {
        const v = first.changeRate, rise = v >= 0;
        const what = dir === 'up' ? (rise ? 'Maior alta' : 'Menor queda') : (rise ? 'Menor alta' : 'Maior queda');
        title = <>{what} entre {dim.art} {dim.plural}: <em>{first.label}</em>, <em className={rise ? 'up' : 'down'}>{signed(v)}</em> sobre o período anterior.</>;
      }
    } else if (N === 1) title = <>Neste recorte há apenas <em>{byCount[0].label}</em>.</>;
    else if (N <= 5) title = <>Líder entre {dim.art} {N} {dim.plural}: <em>{byCount[0].label}</em>, com <em>{pct(byCount[0].share)}</em>.</>;
    else title = <>Entre {dim.art} <em>{fmt(N)}</em> {dim.plural}, {dim.art} {k} maiores somam <em>{pct(topShare, 0)}</em>.</>;
  }
  const lede = measure === 'volume' ? `Emplacamentos de ${rangeText(src?.range)}. A seta compara com o período anterior. Clique numa linha para ver a história mensal.`
    : measure === 'share' ? `Fatia de cada ${dim.sing} no total do período; ao lado, o ganho ou a perda em pontos percentuais sobre o período anterior.`
      : `Variação do volume sobre o período anterior, só entre itens com ao menos 0,1% do mercado e 30 emplacamentos no período anterior, para que oscilações de poucas unidades não dominem a lista.`;

  /* ---------- concentração e movimentos ---------- */
  const pareto = useMemo(() => { const sum = byCount.reduce((s, r) => s + r.count, 0); let c = 0; return byCount.map(r => ({ label: r.label, cum: (c += r.count) / sum })); }, [byCount]);
  const k50 = pareto.findIndex(p => p.cum >= .5) + 1, k80 = pareto.findIndex(p => p.cum >= .8) + 1;
  const moves = useMemo(() => {
    let pool = byCount.filter(r => r.shareChange != null && r.share >= .005);
    if (pool.length < 8) pool = byCount.filter(r => r.shareChange != null && r.share >= .001);
    if (pool.length < 8) pool = byCount.filter(r => r.shareChange != null);
    const gains = [...pool].sort((a, b) => b.shareChange - a.shareChange).slice(0, 5).filter(r => r.shareChange > .0003);
    const losses = [...pool].sort((a, b) => a.shareChange - b.shareChange).slice(0, 5).filter(r => r.shareChange < -.0003);
    return { gains, losses, rows: [...gains, ...[...losses].reverse()].map(r => ({ name: r.name, label: r.label, value: r.shareChange, text: pp(r.shareChange) })) };
  }, [byCount]);
  const jump = r => { setMode('detail'); setSel(r.name); setMeasure('volume'); document.querySelector('.nxx-main')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };

  const filtered = sel != null && dimFiltered.includes(sel);
  const gender = dim.f ? 'a' : 'o';

  return (
    <div className="nxx-view nx-grid">
      <Block className="nx-c12 nxx-main" title="Ranking" sub={title} caption={src ? lede : undefined}>
        <div className="nxx-sentence" role="group" aria-label="Pergunta">
          <span>Mostrar</span>
          <label className="nxx-pill">{MEASURES.find(m => m[0] === measure)[1]}{CHEV}<select value={measure} onChange={e => setMeasure(e.target.value)} aria-label="Medida">{MEASURES.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></label>
          <span>por</span>
          <label className="nxx-pill">{dim.label}{CHEV}<select value={dimId} onChange={e => changeDim(e.target.value)} aria-label="Dimensão">{DIMS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        </div>
        <div className="nxx-tools">
          <div className="nxx-seg" role="group" aria-label="Quantidade de itens">{[10, 25, 50].map(n => <button key={n} type="button" aria-pressed={topN === n} onClick={() => setTopN(n)}>Top {n}</button>)}</div>
          {measure === 'change' && <div className="nxx-seg" role="group" aria-label="Sentido da variação"><button type="button" aria-pressed={dir === 'up'} onClick={() => setDir('up')}>Crescem mais</button><button type="button" aria-pressed={dir === 'down'} onClick={() => setDir('down')}>Caem mais</button></div>}
          <div className="nxx-search"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar entre ${fmt(ranked.length)} ${dim.plural}`} aria-label={'Buscar ' + dim.sing} /></div>
          <div className="nxx-seg grow" role="group" aria-label="Formato"><button type="button" aria-pressed={view === 'bars'} onClick={() => setView('bars')}>Barras</button><button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Tabela</button></div>
          <div className="nxx-seg" role="group" aria-label="Modo de seleção"><button type="button" aria-pressed={mode === 'detail'} onClick={() => changeMode('detail')}>Detalhar um</button><button type="button" aria-pressed={mode === 'compare'} onClick={() => changeMode('compare')}>Comparar até 5</button></div>
          <button type="button" className="nxx-btn ghost" onClick={exportCsv} disabled={!shown.length}>Baixar CSV</button>
        </div>
        <div className="nxx-body">
          {!src ? <div className="nxx-skel" /> : (
            <div className={'nxx-split' + (view === 'table' ? ' stack' : '')}>
              <div>
                {lifted.length > 0 ? <p className="nx-note nx-scope" style={{ marginTop: 0, marginBottom: 14 }}>Para comparar, esta lista e as séries retiram o filtro de {lifted.map(k => FAMILY[k]).join(', ')} e mostram todo o mercado com os demais filtros; o item filtrado aparece destacado entre os outros.</p>
                  : dimFiltered.length > 0 && <p className="nx-note" style={{ marginTop: 0, marginBottom: 14 }}>Há filtro de {dim.sing} ativo ({dimFiltered.slice(0, 3).map(labelOf).join(', ')}{dimFiltered.length > 3 ? '…' : ''}): a lista mostra só o recorte.</p>}
                {!shown.length ? <div className="nxx-empty">{q ? `Nenhum resultado para “${q}”.` : measure === 'change' ? 'Sem itens com período anterior para comparar.' : 'Nenhum item neste recorte.'}</div>
                  : view === 'bars' ? <BarRows rows={rows} selected={mode === 'compare' ? cmp : sel} colors={mode === 'compare' ? Object.fromEntries(cmpRows.map(r => [r.name, r.color])) : null} onPick={pick} tone={measure} max={scaleMax} />
                    : (
                      <div className="nxx-tablewrap"><table className="nxx-table">
                        <thead><tr><th>#</th><th>{dim.label[0].toUpperCase() + dim.label.slice(1)}</th><th>Emplacamentos</th><th>Participação</th><th>Período anterior</th><th>Variação</th><th>Δ participação</th></tr></thead>
                        <tbody>{shown.map(r => <tr key={r.name} className={r.name === sel ? 'on' : ''} onClick={() => pick(r)}><td>{r.rank}</td><td>{r.label}</td><td>{fmt(r.count)}</td><td>{pct(r.share, 2)}</td><td>{r.previous == null ? '—' : fmt(r.previous)}</td><td className={tone(r.changeRate)}>{r.changeRate == null ? '—' : signed(r.changeRate)}</td><td className={tone(r.shareChange)}>{r.shareChange == null ? '—' : pp(r.shareChange, 2)}</td></tr>)}</tbody>
                      </table></div>
                    )}
                {shown.length > 0 && <p className="nxx-more">{q ? `${fmt(matches.length)} resultado${matches.length === 1 ? '' : 's'} para “${q}”. ` : ''}Mostrando {fmt(shown.length)} de {fmt(q ? matches.length : ranked.length)}. O CSV leva exatamente estas linhas.</p>}
              </div>
              {mode === 'compare' ? (
                <aside className="nxx-detail" aria-live="polite">
                  <div className="k">Comparar {dim.plural}</div>
                  {!cmpRows.length ? <div className="nxx-empty">Clique em até 5 {dim.plural} na lista para colocá-{dim.f ? 'las' : 'los'} lado a lado.</div> : (
                    <>
                      <div className="nxx-seg" role="group" aria-label="Medida da comparação" style={{ marginBottom: 10 }}>
                        <button type="button" aria-pressed={cmpMeasure === 'abs'} onClick={() => setCmpMeasure('abs')}>Volume mensal</button>
                        <button type="button" aria-pressed={cmpMeasure === 'share'} onClick={() => setCmpMeasure('share')}>Participação</button>
                      </div>
                      {!histOk ? <p className="nx-note">A série mensal de dez anos não existe para {dim.sing}; abaixo, a comparação do período.</p>
                        : !cmpSeries ? <p className="nx-note">{hsrc?.error ? hsrc.error : !hsrc?.data ? 'Carregando as séries mensais…' : `A série mensal não traz ${dim.sing} quando há um estado ou região filtrado.`}</p>
                          : <><MultiLine series={cmpSeries} share={cmpMeasure === 'share'} />{ignored.length > 0 && <p className="nx-note nx-scope">A série mensal não aplica {ignored.join(', ')}; a tabela abaixo aplica. Por isso os números podem diferir.</p>}</>}
                      <div className="nxx-legend">{cmpRows.map(r => <button key={r.name} type="button" onClick={() => setCmp(c => c.filter(x => x !== r.name))} title="Remover da comparação"><i style={{ background: r.color }} />{r.label} ×</button>)}</div>
                      <div className="nxx-tablewrap sm"><table className="nxx-table">
                        <thead><tr><th>{dim.label[0].toUpperCase() + dim.label.slice(1)}</th><th>Emplac.</th><th>Part.</th><th>Var.</th><th>Δ part.</th></tr></thead>
                        <tbody>{cmpRows.map(r => <tr key={r.name}><td><i className="nxx-dot" style={{ background: r.color }} />{r.label}</td><td>{fmt(r.count)}</td><td>{pct(r.share, 2)}</td><td className={tone(r.changeRate)}>{r.changeRate == null ? '—' : signed(r.changeRate)}</td><td className={tone(r.shareChange)}>{r.shareChange == null ? '—' : pp(r.shareChange, 2)}</td></tr>)}</tbody>
                      </table></div>
                      <div className="nxx-actions"><button type="button" className="nxx-btn ghost" onClick={() => setCmp([])}>Limpar comparação</button></div>
                    </>
                  )}
                </aside>
              ) : (
                <aside className={'nxx-detail' + (selRow ? '' : ' idle')} aria-live="polite">
                  {!selRow ? <div className="nxx-empty">Clique em {dim.f ? 'uma' : 'um'} {dim.sing} para ver {dim.f ? 'a história dela' : 'a história dele'} mês a mês e filtrar o painel.</div> : (
                    <>
                      <div className="k">{dim.label}</div>
                      <h3>{selRow.label}</h3>
                      <div className="nxx-stats">
                        <div><small>Emplacamentos</small><b>{fmt(selRow.count)}</b></div>
                        <div><small>Participação</small><b>{pct(selRow.share, 2)}</b></div>
                        <div><small>Variação</small><b className={tone(selRow.changeRate)}>{selRow.changeRate == null ? '—' : signed(selRow.changeRate)}</b></div>
                      </div>
                      {!histOk ? <p className="nx-note">A série mensal de dez anos não existe para {dim.sing}: o histórico cobre marca, estado, grupo de modelos, combustível, propulsão, carroceria, porte, tipo de veículo e canal.</p>
                        : !series ? <p className="nx-note">{hsrc?.error ? hsrc.error : !hsrc?.data ? 'Carregando a série mensal…' : `A série mensal não traz ${dim.sing} quando há um estado ou região filtrado.`}</p>
                          : series.every(p => p.value === 0) ? <p className="nx-note">Sem emplacamentos mensais deste item no histórico.</p>
                            : <><MonthLine key={dimId + sel} points={series} label={selRow.label} />{peak && <p className="nx-note">Maior mês: {monthLabel(peak.month)}, com {fmt(peak.value)} emplacamentos.</p>}{ignored.length > 0 && <p className="nx-note nx-scope">A série mensal não aplica {ignored.join(', ')}; os números do período acima aplicam.</p>}</>}
                      <div className="nxx-actions">
                        <button type="button" className="nxx-btn" onClick={() => setFilter(dimId, filtered ? 'all' : [sel])}>{filtered ? 'Remover filtro do painel' : 'Filtrar o painel por ' + (dim.f ? 'esta ' : 'este ') + dim.sing}</button>
                        <button type="button" className="nxx-btn ghost" onClick={() => setSel(null)}>Fechar</button>
                      </div>
                    </>
                  )}
                </aside>
              )}
            </div>
          )}
        </div>
      </Block>

      {src && N >= 6 && (
        <Block className="nx-c6" title="Concentração" sub={k50 === 1 ? <><em>{byCount[0].label}</em> sozinh{gender} tem metade dos emplacamentos.</> : <><em>{k50}</em> de {fmt(N)} {dim.plural} somam metade dos emplacamentos.</>}
          caption={`Para chegar a 80% são necessári${dim.f ? 'as' : 'os'} ${fmt(k80)} (${pct(k80 / N, k80 / N < .1 ? 1 : 0)} da lista). Curva acumulada do maior ao menor; escala horizontal logarítmica.`}>
          <Pareto items={pareto} label={dim.plural} />
          <p className="nx-note">Considera os {fmt(N)} {dim.plural} com emplacamentos em {rangeText(src.range)}, e não apenas os da lista.</p>
        </Block>
      )}

      {src && moves.rows.length > 1 && (
        <Block className="nx-c6" title="Ganhos e perdas" sub={<>{moves.gains[0] ? <>{moves.gains[0].label} ganhou mais espaço (<em className="up">{pp(moves.gains[0].shareChange)}</em>)</> : 'Sem ganhos relevantes'}{moves.losses[0] ? <>; {moves.losses[0].label} perdeu mais (<em className="down">{pp(moves.losses[0].shareChange)}</em>)</> : ''}.</>}
          caption={`Variação da participação sobre o período anterior, entre ${dim.art} ${dim.plural} com peso suficiente. Clique para abrir no explorador.`}>
          <Diverging rows={moves.rows} onPick={jump} />
        </Block>
      )}
    </div>
  );
}

const TABS = [['perguntas', 'Perguntas rápidas'], ['construtor', 'Construtor de gráficos'], ['catalogo', 'Catálogo de formatos'], ['estrutura', 'Estrutura do mercado']];
const readTab = () => { try { const v = new URLSearchParams(location.search).get('x'); return TABS.some(t => t[0] === v) ? v : 'perguntas'; } catch { return 'perguntas'; } };

export default function Explorar() {
  const { model, market, geoless } = useNext();
  const [tab, setTab] = useState(readTab);
  const change = v => {
    setTab(v);
    try { const p = new URLSearchParams(location.search); p.set('x', v); history.replaceState(history.state, '', location.pathname + '?' + p.toString()); } catch { /* the address bar is optional */ }
  };
  const src = market ?? model, groups = src?.groups?.marca ?? [];
  const sorted = useMemo(() => [...groups].filter(g => g.count > 0).sort((a, b) => b.count - a.count), [groups]);
  const top5 = sorted.slice(0, 5).reduce((s, g) => s + g.count, 0) / (src?.total || 1);
  const finding = src && sorted.length > 5 ? `${fmt(src.total)} emplacamentos em ${rangeText(src.range)}; as 5 maiores marcas somam ${pct(top5, 0)} entre ${fmt(sorted.length)}. Pergunte, compare itens lado a lado, monte gráficos ou abra o catálogo.` : 'Pergunte, compare itens lado a lado, monte gráficos e abra o catálogo de formatos.';
  return (
    <>
      <AreaHead title="Explorar" finding={finding} tabs={TABS} tab={tab} onTab={change} />
      <div className="nx-wrap nxx-area">
        {tab === 'perguntas' && <Perguntas />}
        {tab === 'construtor' && <LegacyTab tab="explore" className="nxx-leg-builder" />}
        {tab === 'catalogo' && <LegacyTab tab="explore" className="nxx-leg-catalog" />}
        {tab === 'estrutura' && <LegacyTab tab="structure" />}
      </div>
    </>
  );
}
