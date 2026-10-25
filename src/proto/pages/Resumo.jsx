import { useMemo } from 'react';
import { engine } from 'virtual:market';
import { BarList, Diverging } from '../../next/charts.jsx';
import { Block, Tile } from '../../next/ui.jsx';
import PanoramaHero from '../../next/areas/panorama-hero.jsx';
import '../../next/areas/panorama.css';
import { useProto } from '../ctx.js';
import { PageHead, Section, Scope, Skel, useFocusStats } from '../ui.jsx';
import { Waterfall, Lines } from '../charts.jsx';
import { brandName, fmt, pct, pp, signed, rangeText, monthLabel, list, shiftShare, historyGroup, ignoredBy, lastCompleteIndex, label } from '../lib.js';

export function useYearShares(market) {
  return useMemo(() => {
    const y = new Map((market?.yearGroups?.marca ?? []).map(r => [r.name, r.count]));
    return { get: n => (market?.year > 0 && y.size ? (y.get(n) ?? 0) / market.year : null), has: y.size > 0 };
  }, [market]);
}

export default function Resumo() {
  const { market, points, filters, focus, focusName, tip, hist, mFilters } = useProto();
  const s = useFocusStats(), ys = useYearShares(market);
  const insights = useMemo(() => (market ? engine.overviewInsights(market) : []), [market]);
  const yearLabel = market?.yearRange ? rangeText(market.yearRange) : 'o ano anterior';

  /* ranking com a marca em foco sempre visível; variação = participação contra o mesmo período do ano anterior */
  const brands = useMemo(() => (market?.groups?.marca ?? []).filter(r => r.count > 0), [market]);
  const total = market?.total ?? 0, fi = brands.findIndex(b => b.name === focus);
  const row = (b, i) => { const d = ys.has ? b.count / total - (ys.get(b.name) ?? 0) : b.shareChange; return { key: b.name, name: b.name, label: brandName(b.name), value: b.count, rank: i + 1, delta: d, deltaText: Number.isFinite(d) ? pp(d) : '', title: pct(b.count / total, 1) + ' do mercado' }; };
  const rankRows = [...brands.slice(0, 10).map(row), ...(fi >= 10 ? [{ key: 'gap', name: 'gap', label: '', value: 0, gap: true, valueText: '···', deltaText: '' }, row(brands[fi], fi)] : [])];
  const movers = brands.filter(b => b.count / total >= .004).map(b => ({ name: b.name, d: ys.has ? b.count / total - (ys.get(b.name) ?? 0) : b.shareChange })).filter(m => Number.isFinite(m.d));
  const gains = [...movers].sort((a, b) => b.d - a.d).slice(0, 5).filter(m => m.d > .0003), losses = [...movers].sort((a, b) => a.d - b.d).slice(0, 5).filter(m => m.d < -.0003);
  if (fi >= 0 && !gains.concat(losses).some(m => m.name === focus)) { const m = movers.find(x => x.name === focus); if (m) (m.d >= 0 ? gains : losses).push(m); }
  const div = [...gains.sort((a, b) => b.d - a.d), ...losses.sort((a, b) => b.d - a.d)].map(m => ({ name: m.name, label: brandName(m.name) + (m.name === focus ? ' ●' : ''), value: m.d, text: pp(m.d) }));

  /* decomposição da variação da marca em foco */
  const ss = useMemo(() => shiftShare(market, market?.focus), [market]);

  /* 24 meses: mercado do recorte e participação da marca em foco */
  const trend = useMemo(() => {
    const g = historyGroup(hist.data, mFilters, ['marca']); if (!g) return null;
    const end = market?.range?.end?.slice(0, 7), i1 = lastCompleteIndex(g, end), i0 = Math.max(0, i1 - 23);
    const months = g.months.slice(i0, i1 + 1), f = g.by.get(focus);
    return { months, market: Array.from(g.total.slice(i0, i1 + 1)), share: months.map((_, k) => (g.total[i0 + k] > 0 ? (f?.[i0 + k] ?? 0) / g.total[i0 + k] : null)) };
  }, [hist.data, mFilters, market?.range, focus]);
  const ignored = ignoredBy(mFilters);

  return (
    <div className="px-page">
      <PageHead title="Resumo" strip={false} toc={[['r-foco', focusName + ' no recorte'], ['r-marcas', 'Marcas'], ['r-tendencia', '24 meses']]} />
      <div className="nx-wrap">
        <div className="nxp-heroframe px-hero">
          <PanoramaHero model={market} points={points} ufFilter={list(filters.uf)} insights={insights} onTip={t => (t ? tip.show(t.e, t.html) : tip.hide())} />
        </div>
      </div>

      <Section id="r-foco" title={focusName + ' no recorte'} sub={s ? <>Comparada com o mercado e com o mesmo período de um ano antes ({yearLabel}).</> : null}>
        {!s ? <div className="nx-c12"><Skel h={150} /></div> : <>
          <div className="nx-c12 px-tiles">
            <Tile dark k={'Emplacamentos · ' + focusName} sub={<>{signed(s.change)} sobre {yearLabel} · mercado {signed(s.marketChange)}</>}>{fmt(s.total)}</Tile>
            <Tile k="Participação no mercado" sub={s.shareChange != null ? <>{pp(s.shareChange, 2)} em um ano</> : null} red>{pct(s.share, 2)}</Tile>
            <Tile k="Posição entre as marcas" sub={s.rankYear ? <>era a {s.rankYear}ª em {yearLabel}</> : <>de {s.brands} marcas</>}>{s.rank ? s.rank + 'ª' : '—'}</Tile>
            {s.seg && <Tile k={'Participação em ' + s.seg.label.toLowerCase()} sub={<>segmento de {pct(s.seg.ofBrand, 0)} das vendas da marca</>}>{pct(s.seg.share, 1)}</Tile>}
          </div>
          {ss && <Block className="nx-c7" title="De onde veio a variação" sub={<>{focusName}: {fmt(ss.before)} → <em>{fmt(ss.after)}</em>. {Math.abs(ss.perf) >= Math.max(Math.abs(ss.size), Math.abs(ss.mix)) ? <>O que mais pesou foi o <b>desempenho dentro dos segmentos</b>.</> : Math.abs(ss.size) >= Math.abs(ss.mix) ? <>O que mais pesou foi o <b>tamanho do mercado</b>.</> : <>O que mais pesou foi o <b>mix de segmentos</b>.</>}</>}
            info="Separa a variação da marca em três partes. Mercado: o que ela teria ganhado ou perdido mantendo a participação em cada segmento. Mix: o efeito de os segmentos onde ela vende crescerem mais ou menos que o mercado. Desempenho: ganho ou perda de participação dentro dos próprios segmentos (porte BD).">
            <Waterfall steps={[
              { label: yearLabel, note: 'antes', value: ss.before, kind: 'total' },
              { label: 'Tamanho do mercado', note: 'participação mantida', value: ss.size, kind: 'step' },
              { label: 'Mix de segmentos', note: 'peso dos seus segmentos', value: ss.mix, kind: 'step' },
              { label: 'Desempenho', note: 'participação dentro dos segmentos', value: ss.perf, kind: 'step' },
              { label: rangeText(market.range), note: 'agora', value: ss.after, kind: 'total' },
            ]} />
          </Block>}
          {ss && <Block className="nx-c5" title="Onde o desempenho mudou" sub="Participação da marca em cada segmento, antes e agora" info="Segmentos (porte BD) onde a marca vende, ordenados pelo efeito de desempenho: participação de agora menos a de antes, vezes o tamanho do segmento agora.">
            <div className="px-segs">
              {ss.segs.slice(0, 6).map(g => <div key={g.name} className="px-segrow"><span>{label('bd_segmento', g.name)}</span><span>{pct(g.share0, 1)} → <b>{pct(g.share1, 1)}</b></span><span className={g.perf >= 0 ? 'up' : 'down'}>{g.perf >= 0 ? '+' : '−'}{fmt(Math.abs(g.perf))}</span></div>)}
            </div>
          </Block>}
        </>}
      </Section>

      <Section id="r-marcas" title="Marcas" sub={brands[0] ? <>{brandName(brands[0].name)} lidera com {pct(brands[0].count / total, 1)}{fi >= 0 ? <>; {focusName} é a {fi + 1}ª, com {pct(brands[fi].count / total, 2)}.</> : '.'}</> : null}>
        {!market ? <div className="nx-c12"><Skel /></div> : <>
          <Block className="nx-c6" title="Ranking de marcas" sub={'Variação: participação contra ' + (ys.has ? yearLabel : 'o período anterior')} info="As 10 maiores marcas do recorte e a marca em foco. A variação é a diferença de participação, em pontos percentuais.">
            <BarList rows={rankRows} focus={focus} />
          </Block>
          <Block className="nx-c6" title="Quem ganhou e quem perdeu participação" sub={'Contra ' + (ys.has ? yearLabel : 'o período anterior') + ' · marcas com 0,4% ou mais'} info="As cinco marcas que mais ganharam e as cinco que mais perderam participação; a marca em foco entra sempre (●).">
            <Diverging rows={div} />
          </Block>
        </>}
      </Section>

      <Section id="r-tendencia" title="Últimos 24 meses" sub={'Até ' + (trend ? monthLabel(trend.months.at(-1)) : '…') + ', o último mês completo do período escolhido.'}>
        {!trend ? <div className="nx-c12"><Skel /></div> : <>
          <Block className="nx-c6" title="Mercado por mês" sub={<>Último mês: <em>{fmt(trend.market.at(-1))}</em> · {signed(trend.market.at(-1) / trend.market.at(-13) - 1)} sobre um ano antes</>}>
            <Lines months={trend.months} series={[{ name: 'Mercado', values: trend.market, color: 'var(--nx-ink)' }]} fmtY={v => (v >= 1000 ? Math.round(v / 1000) + ' mil' : fmt(v))} fmtTip={fmt} endLabels={false} height={300} label="Mercado por mês" />
            <Scope ignored={ignored} />
          </Block>
          <Block className="nx-c6" title={'Participação de ' + focusName} sub={<>Último mês: <em>{pct(trend.share.at(-1), 2)}</em> · um ano antes {pct(trend.share.at(-13), 2)}</>}>
            <Lines months={trend.months} series={[{ name: focusName, values: trend.share, color: 'var(--nx-accent)' }]} fmtY={v => pct(v, 1)} fmtTip={v => pct(v, 2)} endLabels={false} height={300} label={'Participação de ' + focusName + ' por mês'} />
            <Scope ignored={ignored} />
          </Block>
        </>}
      </Section>
    </div>
  );
}

