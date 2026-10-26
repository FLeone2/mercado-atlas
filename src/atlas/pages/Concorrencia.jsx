import { useEffect, useMemo, useRef, useState } from 'react';
import { Block } from '../base/block.jsx';
import { Bump } from '../base/bump.jsx';
import '../base/bump.css';
import { useAtlas } from '../ctx.js';
import { PageHead, Section, Scope, Seg, Skel } from '../ui.jsx';
import { Slope, Lines, BarRace } from '../charts.jsx';
import { brandName, fmt, pct, pp, signed, label, rangeText, historyGroup, ignoredBy, lastCompleteIndex, hhi, monthLabel, periodMonths, UF_NAMES } from '../lib.js';
import { VersionRanking, VersionCompare } from './versoes.jsx';
import Conexoes from './conexoes.jsx';

const roll12 = a => a.map((_, i) => (i < 11 ? null : a.slice(i - 11, i + 1).reduce((s, v) => s + v, 0)));
const CMP_COLORS = ['#1d1d1f', '#2f6fdf', '#2a9d8f', '#e09a2c', '#8e6bd1'];

/* Monta uma peça pesada só quando ela chega perto da tela (mantém a página rápida). */
function WhenVisible({ children, h = 600 }) {
  const ref = useRef(null), [on, setOn] = useState(false);
  useEffect(() => { const el = ref.current; if (!el || on) return undefined; const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: '600px 0px' }); io.observe(el); return () => io.disconnect(); }, [on]);
  return <div ref={ref} style={on ? undefined : { minHeight: h }}>{on ? children : <div className="px-skel" style={{ height: h }} />}</div>;
}

export default function Concorrencia() {
  const { market, focus, focusName, hist, mFilters } = useAtlas();
  const ignored = ignoredBy(mFilters);

  /* ---------- ranking conectado ---------- */
  const [dim, setDim] = useState('marca'), [cmp, setCmp] = useState('ano'), [measure, setMeasure] = useState('volume'), [topN, setTopN] = useState(15);
  const slope = useMemo(() => {
    if (!market) return null;
    const cur = (market.groups?.[dim] ?? []).filter(r => r.count > 0 && !/classific|informado/i.test(r.name));
    const yearOk = Boolean(market.yearGroups?.[dim]);
    const mode = cmp === 'ano' && yearOk ? 'ano' : 'anterior';
    const prev = mode === 'ano' ? market.yearGroups[dim] : cur.map(r => ({ name: r.name, count: r.previous ?? 0 }));
    const lab = r => ({ name: r.name, count: r.count, label: label(dim, r.name) });
    const focusSet = dim === 'marca' ? focus : new Set((market.focus?.groups?.grupo_modelo ?? []).slice(0, 3).map(r => r.name));
    return { a: prev.map(lab), b: cur.map(lab), focusSet, mode, labelA: rangeText(mode === 'ano' ? market.yearRange : market.previousRange), labelB: rangeText(market.range), totalA: mode === 'ano' ? market.year : market.previous, totalB: market.total };
  }, [market, dim, cmp, focus]);
  const movers = useMemo(() => {
    if (!slope) return null;
    const ra = new Map([...slope.a].sort((x, y) => y.count - x.count).map((r, i) => [r.name, i + 1])), rb = [...slope.b].sort((x, y) => y.count - x.count).slice(0, 30);
    const m = rb.map((r, i) => ({ r, d: (ra.get(r.name) ?? 99) - (i + 1) })).filter(x => ra.has(x.r.name));
    return { up: [...m].sort((x, y) => y.d - x.d)[0], down: [...m].sort((x, y) => x.d - y.d)[0] };
  }, [slope]);

  /* ---------- ranking mês a mês (24 meses, histórico) ---------- */
  const [bumpMode, setBumpMode] = useState('mes'), [bumpN, setBumpN] = useState(10);
  const brandsG = useMemo(() => historyGroup(hist.data, mFilters, ['marca']), [hist.data, mFilters]);
  const bump = useMemo(() => {
    if (!brandsG) return null;
    const end = market?.range?.end?.slice(0, 7), i1 = lastCompleteIndex(brandsG, end), K = 24, i0 = i1 - K + 1;
    if (i0 < 12) return null;
    const val = new Map([...brandsG.by].map(([n, a]) => { const arr = Array.from(a); return [n, bumpMode === 'mes' ? arr : roll12(arr)]; }));
    const rankAt = i => new Map([...val].map(([n, a]) => [n, a[i]]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([n], k) => [n, k + 1]));
    const R = Array.from({ length: K }, (_, k) => rankAt(i0 + k)), last = R[K - 1];
    const chosen = [...last].filter(([, r]) => r <= bumpN).map(([n]) => n); if (last.has(focus) && !chosen.includes(focus)) chosen.push(focus);
    const rows = chosen.map(n => ({ name: n, label: brandName(n), focus: n === focus, ranks: R.map(m => m.get(n) ?? null), values: val.get(n).slice(i0, i1 + 1) }));
    return { months: brandsG.months.slice(i0, i1 + 1), rows, maxRank: Math.max(bumpN, ...rows.flatMap(r => r.ranks.filter(Boolean))), fr: rows.find(r => r.focus) };
  }, [brandsG, market?.range, bumpMode, bumpN, focus]);

  /* ---------- concentração ---------- */
  const conc = useMemo(() => {
    if (!brandsG) return null;
    const end = market?.range?.end?.slice(0, 7), i1 = lastCompleteIndex(brandsG, end), vals = [], eq = [];
    for (let i = 0; i <= i1; i++) { const h = hhi([...brandsG.by.values()].map(a => a[i])); vals.push(h?.hhi ?? null); eq.push(h?.equiv ?? null); }
    const top = (market?.groups?.marca ?? []).slice(0, 5), t = market?.total ?? 0;
    return { months: brandsG.months.slice(0, i1 + 1), vals, now: vals.at(-1), eq: eq.at(-1), five: vals.length > 60 ? vals.at(-61) : vals[0], top3: t > 0 ? top.slice(0, 3).reduce((s, r) => s + r.count, 0) / t : null, top5: t > 0 ? top.reduce((s, r) => s + r.count, 0) / t : null };
  }, [brandsG, market]);

  /* ---------- duelo: marca em foco × rival, participação no mercado ---------- */
  const rivals = (market?.groups?.marca ?? []).filter(r => r.name !== focus).slice(0, 15);
  const segRival = useMemo(() => {
    const seg = market?.focus?.groups?.bd_segmento?.[0]?.name; if (!seg || !hist.data) return null;
    const g = historyGroup(hist.data, { ...mFilters, bd_segmento: [seg] }, ['marca']); if (!g) return null;
    const i1 = lastCompleteIndex(g, market.range.end.slice(0, 7)), from = Math.max(0, i1 - 11);
    const tot = [...g.by].map(([n, a]) => [n, a.slice(from, i1 + 1).reduce((s, v) => s + v, 0)]).filter(([n]) => n !== focus).sort((x, y) => y[1] - x[1]);
    return { seg, name: tot[0]?.[0] };
  }, [market, hist.data, mFilters, focus]);
  const [rival, setRival] = useState(null), [duelSeg, setDuelSeg] = useState('seg');
  const rv = rival ?? segRival?.name ?? rivals[0]?.name;
  const duel = useMemo(() => {
    if (!hist.data || !rv) return null;
    const scoped = duelSeg === 'seg' && segRival?.seg ? { ...mFilters, bd_segmento: [segRival.seg] } : mFilters;
    const g = historyGroup(hist.data, scoped, ['marca']); if (!g) return null;
    const i1 = lastCompleteIndex(g, market?.range?.end?.slice(0, 7)), i0 = Math.max(0, i1 - 35), months = g.months.slice(i0, i1 + 1);
    const sh = n => months.map((_, k) => (g.total[i0 + k] > 0 ? (g.by.get(n)?.[i0 + k] ?? 0) / g.total[i0 + k] : null));
    const a = sh(focus), b = sh(rv);
    return { months, a, b, where: duelSeg === 'seg' && segRival?.seg ? label('bd_segmento', segRival.seg).toLowerCase() : 'o mercado' };
  }, [hist.data, mFilters, market?.range, focus, rv, duelSeg, segRival]);

  /* ---------- comparar marcas: a marca em foco e até 4 outras ---------- */
  const months = useMemo(() => periodMonths(market?.range), [market?.range]);
  const segRivals = useMemo(() => {
    const seg = market?.focus?.groups?.bd_segmento?.[0]?.name; if (!seg || !hist.data) return [];
    const g = historyGroup(hist.data, { ...mFilters, bd_segmento: [seg] }, ['marca']); if (!g) return [];
    const i1 = lastCompleteIndex(g, market.range.end.slice(0, 7)), from = Math.max(0, i1 - 11);
    return [...g.by].map(([n, a]) => [n, a.slice(from, i1 + 1).reduce((x, v) => x + v, 0)]).filter(([n, v]) => n !== focus && v > 0).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n]) => n);
  }, [market, hist.data, mFilters, focus]);
  const [picked, setPicked] = useState(null);
  const cmpBrands = [focus, ...(picked ?? segRivals).filter(n => n !== focus)].slice(0, 5);
  const cmpData = useMemo(() => {
    if (!market || !hist.data) return null;
    const cur = new Map((market.groups?.marca ?? []).map(r => [r.name, r.count])), yr = new Map((market.yearGroups?.marca ?? []).map(r => [r.name, r.count]));
    const rank = new Map([...(market.groups?.marca ?? [])].sort((a, b) => b.count - a.count).map((r, i) => [r.name, i + 1]));
    const ch = historyGroup(hist.data, mFilters, ['marca', 'tipo_venda']), pr = historyGroup(hist.data, mFilters, ['marca', 'propulsao']), sg = historyGroup(hist.data, mFilters, ['marca', 'bd_segmento']);
    const idx = g => months.map(m => g.months.indexOf(m)).filter(i => i >= 0 && g.complete[i]);
    const sumKey = (g, f) => { const ii = idx(g); let s = 0; for (const [k, a] of g.by) if (f(k.split('|'))) for (const i of ii) s += a[i]; return s; };
    const nat = new Map(); const ufTot = new Map((market.groups?.uf ?? []).map(r => [r.name, r.count]));
    for (const r of market.ufBrands ?? []) { if (!nat.has(r.marca)) nat.set(r.marca, []); nat.get(r.marca).push(r); }
    const rows = cmpBrands.map((b, k) => {
      const c = cur.get(b) ?? 0, y = yr.get(b), sh = market.total > 0 ? c / market.total : 0, shy = market.year > 0 && y != null ? y / market.year : null;
      const tot = sumKey(ch, ([m]) => m === b), vd = sumKey(ch, ([m, t]) => m === b && t === 'VD'), el = sumKey(pr, ([m, t]) => m === b && ['BEV', 'PHEV', 'HEV', 'MHEV'].includes(t));
      const segs = new Map(); { const ii = idx(sg); for (const [key, a] of sg.by) { const [m, s2] = key.split('|'); if (m !== b) continue; let v = 0; for (const i of ii) v += a[i]; segs.set(s2, (segs.get(s2) ?? 0) + v); } }
      const topSeg = [...segs].sort((x, z) => z[1] - x[1])[0], segTotal = [...segs.values()].reduce((x, v) => x + v, 0);
      const ufs = (nat.get(b) ?? []).map(r => ({ uf: r.uf, idx: sh > 0 && ufTot.get(r.uf) > 0 ? r.count / ufTot.get(r.uf) / sh : 0, n: r.count })).filter(r => r.n >= 30).sort((x, z) => z.idx - x.idx)[0];
      return { b, color: b === focus ? 'var(--nx-accent)' : CMP_COLORS[k - 1] ?? '#8e8e93', count: c, change: y > 0 ? c / y - 1 : null, share: sh, dShare: shy == null ? null : sh - shy, rank: rank.get(b), vd: tot > 0 ? vd / tot : null, el: tot > 0 ? el / tot : null, seg: topSeg ? { name: topSeg[0], share: segTotal > 0 ? topSeg[1] / segTotal : 0 } : null, uf: ufs };
    });
    const g = historyGroup(hist.data, mFilters, ['marca']), i1 = lastCompleteIndex(g, market.range.end.slice(0, 7)), i0 = Math.max(0, i1 - 35), ms = g.months.slice(i0, i1 + 1);
    const series = rows.map(r => ({ name: brandName(r.b), color: r.color, width: r.b === focus ? 3.5 : 2.2, values: ms.map((_, j) => (g.total[i0 + j] > 0 ? (g.by.get(r.b)?.[i0 + j] ?? 0) / g.total[i0 + j] : null)) }));
    return { rows, ms, series };
  }, [market, hist.data, mFilters, months, cmpBrands.join('|'), focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const addable = (market?.groups?.marca ?? []).slice(0, 40).map(r => r.name).filter(n => !cmpBrands.includes(n));

  /* ---------- corrida das marcas: acumulado de 12 meses, mês a mês desde 2017 ---------- */
  const race = useMemo(() => {
    if (!brandsG) return null;
    const i1 = lastCompleteIndex(brandsG, market?.range?.end?.slice(0, 7)); if (i1 < 24) return null;
    const frames = [];
    for (let i = 11; i <= i1; i++) { const vals = new Map(); for (const [n, a] of brandsG.by) { let s = 0; for (let k = 0; k < 12; k++) s += a[i - k]; if (s > 0) vals.set(n, s); } frames.push({ month: brandsG.months[i], vals }); }
    return frames;
  }, [brandsG, market?.range]);

  return (
    <div className="px-page">
      <PageHead title="Concorrência" toc={[['c-conectado', 'Ranking conectado'], ['c-versoes', 'Versões'], ['c-comparar', 'Comparar marcas'], ['c-mes', 'Mês a mês'], ['c-corrida', 'Corrida das marcas'], ['c-duelo', 'Duelo'], ['c-conexoes', 'Conexões'], ['c-concentracao', 'Concentração']]} />

      <Section id="c-conectado" title="Ranking conectado" sub={movers?.up && movers.up.d > 0 ? <>{label(dim, movers.up.r.name)} foi quem mais subiu ({movers.up.d} {movers.up.d === 1 ? 'posição' : 'posições'}){movers.down && movers.down.d < 0 ? <>; {label(dim, movers.down.r.name)} quem mais caiu ({-movers.down.d}).</> : '.'}</> : 'Posições de um período contra o outro.'}>
        {!slope ? <div className="nx-c12"><Skel h={520} /></div> : (
          <Block className="nx-c12" title={dim === 'marca' ? 'Marcas: quem ganhou e perdeu posições' : 'Modelos: quem ganhou e perdeu posições'}
            sub={<>{slope.labelA} → {slope.labelB} · verde subiu, âmbar caiu, <em>vermelho</em> é {dim === 'marca' ? focusName : 'a ' + focusName}</>}
            info="Cada linha liga a posição de uma marca (ou modelo) no primeiro período à posição no segundo. Entram as do topo em qualquer um dos dois períodos e a marca em foco; a posição escrita é sempre a real. Passe o mouse para destacar; clique para fixar."
            actions={<div className="px-ctl">
              <Seg label="O quê" value={dim} onChange={setDim} options={[['marca', 'Marcas'], ['grupo_modelo', 'Modelos']]} />
              <Seg label="Comparar com" value={cmp} onChange={setCmp} options={[['ano', 'Mesmo período, ano anterior'], ['anterior', 'Período anterior']]} />
              <Seg label="Medida" value={measure} onChange={setMeasure} options={[['volume', 'Volume'], ['share', 'Participação']]} />
              <Seg label="Quantos" value={topN} onChange={setTopN} options={[[10, 'Top 10'], [15, 'Top 15'], [25, 'Top 25']]} />
            </div>}>
            {slope.mode !== cmp && <p className="px-scopenote">Sem o mesmo período do ano anterior para este recorte; comparando com o período anterior.</p>}
            <Slope a={slope.a} b={slope.b} focus={slope.focusSet} measure={measure} topN={topN} labelA={slope.labelA} labelB={slope.labelB} totalA={slope.totalA} totalB={slope.totalB} />
          </Block>
        )}
      </Section>

      <Section id="c-versoes" title="Versões" sub="O mesmo ranking conectado, versão por versão, e a comparação de versões de marcas diferentes. Os filtros do site valem aqui: escolha um modelo, um porte ou um canal para focar.">
        <VersionRanking />
        <div className="nx-c12"><WhenVisible h={620}><VersionCompare /></WhenVisible></div>
      </Section>

      <Section id="c-comparar" title="Comparar marcas" sub={<>{focusName} e até quatro marcas: por padrão, as maiores do segmento principal dela. Mesmo período e filtros do site.</>}>
        {!cmpData ? <div className="nx-c12"><Skel h={360} /></div> : <>
          <Block className="nx-c12" title="Lado a lado" sub={'Variações contra ' + (market?.yearRange ? rangeText(market.yearRange) : 'o ano anterior')}
            actions={<div className="px-ctl"><div className="nx-chips">{cmpBrands.map(b => <button key={b} type="button" className={'nx-chip' + (b === focus ? ' on' : '')} disabled={b === focus} onClick={() => setPicked(cmpBrands.filter(x => x !== b && x !== focus))}>{brandName(b)}{b !== focus && <span aria-hidden> ×</span>}</button>)}</div>
              {cmpBrands.length < 5 && <label className="px-select">Adicionar<select value="" onChange={e => e.target.value && setPicked([...cmpBrands.filter(x => x !== focus), e.target.value])}><option value="">marca…</option>{addable.map(n => <option key={n} value={n}>{brandName(n)}</option>)}</select></label>}</div>}>
            <div className="px-table-wrap"><table className="px-table px-cmp">
              <thead><tr><th>Marca</th><th>Emplacamentos</th><th>Var. a/a</th><th>Participação</th><th>Var. p.p.</th><th>Posição</th><th>Venda direta</th><th>Eletrificados</th><th>Segmento principal</th><th>Estado mais forte</th></tr></thead>
              <tbody>{cmpData.rows.map(r => <tr key={r.b} className={r.b === focus ? 'f' : ''}><th><i style={{ background: r.color }} />{brandName(r.b)}</th><td>{fmt(r.count)}</td><td className={r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}>{signed(r.change, 1)}</td><td>{pct(r.share, 2)}</td><td className={r.dShare > 0 ? 'up' : r.dShare < 0 ? 'down' : ''}>{pp(r.dShare, 2)}</td><td>{r.rank ? r.rank + 'ª' : '—'}</td><td>{pct(r.vd, 0)}</td><td>{pct(r.el, 0)}</td><td>{r.seg ? label('bd_segmento', r.seg.name) + ' · ' + pct(r.seg.share, 0) : '—'}</td><td>{r.uf ? UF_NAMES[r.uf.uf] + ' · ' + r.uf.idx.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '×' : '—'}</td></tr>)}</tbody>
            </table></div>
            <h4 className="px-h4" style={{ marginTop: 22 }}>Participação no mercado, 36 meses</h4>
            <Lines months={cmpData.ms} series={cmpData.series} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 2)} height={300} label="Participação das marcas comparadas" />
            <Scope ignored={ignored} extra="Venda direta, eletrificados e segmento usam os meses completos do período no histórico mensal; estado mais forte = participação no estado ÷ participação no país (30 emplacamentos ou mais)." />
          </Block>
        </>}
      </Section>

      <Section id="c-mes" title="Ranking mês a mês" sub={bump?.fr ? <>{focusName}: {bump.fr.ranks[0] ? bump.fr.ranks[0] + 'ª' : 'fora do top'} há 24 meses, {bump.fr.ranks.at(-1)}ª em {monthLabel(bump.months.at(-1))}.</> : null}>
        {!bump ? <div className="nx-c12"><Skel h={420} /></div> : (
          <Block className="nx-c12" title="Posição de cada marca nos últimos 24 meses" sub={bumpMode === 'mes' ? 'Mês a mês' : 'Pelo acumulado de 12 meses (mais estável)'}
            actions={<div className="px-ctl"><Seg label="Medida" value={bumpMode} onChange={setBumpMode} options={[['mes', 'Mês a mês'], ['12m', 'Acumulado 12 meses']]} /><Seg label="Quantas" value={bumpN} onChange={setBumpN} options={[[8, 'Top 8'], [10, 'Top 10'], [15, 'Top 15']]} /></div>}>
            <div className="nxc-scroll"><Bump months={bump.months} rows={bump.rows} maxRank={bump.maxRank} label="Posição de cada marca no ranking, mês a mês" measure={bumpMode === 'mes' ? 'Emplacamentos no mês' : 'Acumulado de 12 meses'} /></div>
            <Scope ignored={ignored} />
          </Block>
        )}
      </Section>

      <Section id="c-corrida" title="Corrida das marcas" sub="Acumulado de 12 meses, mês a mês desde 2017. Aperte o play ou arraste a linha do tempo.">
        {!race ? <div className="nx-c12"><Skel h={460} /></div> : <Block className="nx-c12" title="Quem esteve no topo, mês a mês" sub={focusName + ' em vermelho'}><BarRace frames={race} focus={focus} name={brandName} /><Scope ignored={ignored} /></Block>}
      </Section>

      <Section id="c-duelo" title="Duelo" sub={duel ? <>{focusName} contra {brandName(rv)}, participação em {duel.where} nos últimos 36 meses.</> : null}>
        {!duel ? <div className="nx-c12"><Skel h={360} /></div> : (
          <Block className="nx-c12" title={focusName + ' × ' + brandName(rv)} sub={<>Último mês: <em>{pct(duel.a.at(-1), 1)}</em> contra {pct(duel.b.at(-1), 1)}</>}
            actions={<div className="px-ctl">
              {segRival?.seg && <Seg label="Onde" value={duelSeg} onChange={setDuelSeg} options={[['seg', 'Em ' + label('bd_segmento', segRival.seg).toLowerCase()], ['all', 'No mercado todo']]} />}
              <label className="px-select">Rival<select value={rv} onChange={e => setRival(e.target.value)}>{[...new Set([segRival?.name, ...rivals.map(r => r.name)].filter(Boolean))].map(n => <option key={n} value={n}>{brandName(n)}</option>)}</select></label>
            </div>}>
            <Lines months={duel.months} series={[{ name: focusName, values: duel.a, color: 'var(--nx-accent)', width: 3.5 }, { name: brandName(rv), values: duel.b, color: 'var(--nx-ink)' }]} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} height={320} label={'Participação de ' + focusName + ' e ' + brandName(rv)} />
            <Scope ignored={ignored} />
          </Block>
        )}
      </Section>

      <Section id="c-conexoes" title="Conexões" sub="Como origem, canal, combustível e segmento se ligam ponta a ponta (Sankey) e quem vende o quê em cada região (cordas). Passe o mouse para destacar um caminho.">
        <div className="nx-c12"><WhenVisible h={1100}><div className="nx-grid"><Conexoes /></div></WhenVisible></div>
      </Section>

      <Section id="c-concentracao" title="Concentração do mercado">
        {!conc ? <div className="nx-c12"><Skel h={300} /></div> : <>
          <Block className="nx-c4" title="Hoje" sub="Quanto do mercado está nas maiores">
            <div className="px-kv col"><div><small>3 maiores marcas</small><b>{pct(conc.top3, 0)}</b></div><div><small>5 maiores marcas</small><b>{pct(conc.top5, 0)}</b></div><div><small>Equivale a</small><b>{conc.eq ? Math.round(conc.eq) : '—'} marcas do mesmo tamanho</b></div></div>
          </Block>
          <Block className="nx-c8" title="Índice de concentração (HHI)" sub={<>{fmt(conc.now)} no último mês · {conc.now < conc.five ? 'menos' : 'mais'} concentrado que há cinco anos ({fmt(conc.five)})</>} info="HHI soma o quadrado da participação (em %) de cada marca: 10.000 seria uma marca só; abaixo de 1.500 é considerado pouco concentrado.">
            <Lines months={conc.months} series={[{ name: 'HHI', values: conc.vals, color: 'var(--nx-ink)' }]} fmtY={fmt} endLabels={false} height={260} label="Índice HHI mês a mês" />
            <Scope ignored={ignored} />
          </Block>
        </>}
      </Section>
    </div>
  );
}
