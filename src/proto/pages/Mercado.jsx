import { useMemo } from 'react';
import { engine } from 'virtual:market';
import { BarList } from '../../next/charts.jsx';
import { Block } from '../../next/ui.jsx';
import { useProto } from '../ctx.js';
import { PageHead, Section, Scope, Skel } from '../ui.jsx';
import { DailyBars, Lines, PairBars, SeasonHeat } from '../charts.jsx';
import { brandName, fmt, pct, signed, label, monthLabel, monthEnd, historyGroup, ignoredBy, lastCompleteIndex, sumRange } from '../lib.js';

const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const YEAR_COLORS = ['#d1d1d6', '#b4b4ba', '#8e8e93', '#5f5f66'];
const ELEC = [['BEV', 'Elétrico', '#e60f2d'], ['PHEV', 'Híbrido plug-in', '#1d1d1f'], ['HEV', 'Híbrido', '#6e6e73'], ['MHEV', 'Microhíbrido', '#b4b4ba']];
const compactK = v => (v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : v >= 1e3 ? Math.round(v / 1e3) + ' mil' : fmt(v));

export default function Mercado() {
  const { market, focus, focusName, hist, mFilters } = useProto();
  const ignored = ignoredBy(mFilters), end = market?.range?.end?.slice(0, 7);

  /* ---------- ritmo do período ---------- */
  const rhythm = useMemo(() => {
    if (!market?.daily?.length) return null;
    const days = market.daily, hol = new Set(); new Set(days.map(d => +d.date.slice(0, 4))).forEach(y => engine.historyHolidays(y).forEach(x => hol.add(x)));
    const work = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w !== 0 && w !== 6 && !hol.has(d); };
    const wd = days.filter(d => d.count != null && work(d.date)), avg = wd.length ? wd.reduce((s, d) => s + d.count, 0) / wd.length : 0;
    const lastMonth = market.range.end.slice(0, 7), partial = market.range.end !== monthEnd(lastMonth);
    let projection = null;
    if (partial) { const all = engine.historyWorkingDays(lastMonth), done = wd.filter(d => d.date.startsWith(lastMonth)).length, sofar = days.filter(d => d.date.startsWith(lastMonth)).reduce((s, d) => s + (d.count ?? 0), 0); projection = { month: lastMonth, value: sofar + avg * Math.max(0, all - done), left: Math.max(0, all - done) }; }
    return { days, avg, workdays: wd.length, partial, projection };
  }, [market]);
  const sameMonthLastYear = useMemo(() => {
    const g = historyGroup(hist.data, mFilters); if (!g || !end || !market) return null;
    const single = market.range.start.slice(0, 7) === end; if (!single) return null;
    const prev = (+end.slice(0, 4) - 1) + end.slice(4), i = g.months.indexOf(prev); if (i < 0) return null;
    return { month: prev, perDay: g.total[i] / engine.historyWorkingDays(prev) };
  }, [hist.data, mFilters, end, market]);

  /* ---------- tendência: 12 meses acumulados e ano contra ano ---------- */
  const g = useMemo(() => historyGroup(hist.data, mFilters, ['marca']), [hist.data, mFilters]);
  const trend = useMemo(() => {
    if (!g) return null;
    const i1 = lastCompleteIndex(g, end), tot = Array.from(g.total), r12 = tot.map((_, i) => (i < 11 || i > i1 ? null : sumRange(tot, i - 11, i)));
    const months = g.months.slice(11, i1 + 1), vals = r12.slice(11, i1 + 1);
    let mx = 0, mn = 0; vals.forEach((v, k) => { if (v > vals[mx]) mx = k; if (v < vals[mn]) mn = k; });
    const ly = +g.months[i1].slice(0, 4), years = [];
    for (let y = ly - 3; y <= ly; y++) years.push({ name: String(y), color: y === ly ? 'var(--nx-accent)' : YEAR_COLORS[y - ly + 3], width: y === ly ? 3.5 : 2, values: Array.from({ length: 12 }, (_, m) => { const i = g.months.indexOf(y + '-' + String(m + 1).padStart(2, '0')); return i >= 0 && i <= i1 && g.complete[i] ? tot[i] : null; }) });
    const lm = +g.months[i1].slice(5, 7), ytd = years.at(-1).values.slice(0, lm).reduce((s, v) => s + (v ?? 0), 0), ytdPrev = years.at(-2).values.slice(0, lm).reduce((s, v) => s + (v ?? 0), 0);
    return { months, vals, marks: [{ i: mx, v: vals[mx], text: 'máx. ' + monthLabel(months[mx]) }, { i: mn, v: vals[mn], text: 'mín. ' + monthLabel(months[mn]), down: true }], years, ly, lm, ytd, ytdPrev, last: vals.at(-1), yearAgo: vals.at(-13) };
  }, [g, end]);

  /* ---------- sazonalidade ---------- */
  const season = useMemo(() => {
    if (!g) return null;
    const i1 = lastCompleteIndex(g, end), byYear = new Map();
    g.months.forEach((m, i) => { if (i > i1 || !g.complete[i]) return; const y = +m.slice(0, 4); if (!byYear.has(y)) byYear.set(y, new Array(12).fill(null)); byYear.get(y)[+m.slice(5, 7) - 1] = g.total[i]; });
    const years = [...byYear].map(([year, vals]) => { const known = vals.filter(v => v != null), mean = known.reduce((s, v) => s + v, 0) / Math.max(1, known.length); return { year, vals, dev: vals.map(v => (v == null || known.length < 12 ? (v == null ? null : v / mean - 1) : v / mean - 1)) }; });
    const full = years.filter(y => y.vals.every(v => v != null) && y.year !== 2020 && y.year !== 2021);
    const med = Array.from({ length: 12 }, (_, m) => { const a = full.map(y => y.dev[m]).sort((x, z) => x - z); return a.length ? a[Math.floor(a.length / 2)] : null; });
    const best = med.reduce((b, v, i) => (v > med[b] ? i : b), 0), worst = med.reduce((b, v, i) => (v < med[b] ? i : b), 0);
    return { years: [...years, { year: 'Mediana', dev: med, median: true }], best, worst, med };
  }, [g, end]);

  /* ---------- o que o mercado compra × o que a marca em foco vende ---------- */
  const mix = useMemo(() => {
    if (!market?.focus?.groups) return null;
    return [['bd_segmento', 'Porte'], ['bd_carroceria', 'Carroceria'], ['propulsao', 'Propulsão'], ['tipo_venda', 'Canal']].map(([dim, title]) => {
      const m = (market.groups?.[dim] ?? []).filter(r => r.count > 0), f = new Map((market.focus.groups[dim] ?? []).map(r => [r.name, r.count]));
      const mt = m.reduce((s, r) => s + r.count, 0), ft = [...f.values()].reduce((s, v) => s + v, 0);
      const merged = new Map();
      for (const r of m) { const l = label(dim, r.name); if (l === 'Não classificado') continue; const e = merged.get(l) ?? { name: l, label: l, market: 0, focus: 0 }; e.market += mt > 0 ? r.count / mt : 0; e.focus += ft > 0 ? (f.get(r.name) ?? 0) / ft : 0; merged.set(l, e); }
      const rows = [...merged.values()].sort((a, b) => b.market - a.market), shown = rows.filter(r => r.focus >= .01 || r.market >= .04).slice(0, 8);
      const top = [...rows].sort((a, b) => b.focus - a.focus)[0];
      return { dim, title, rows: shown, top };
    });
  }, [market]);

  /* ---------- eletrificação ---------- */
  const elec = useMemo(() => {
    const p = historyGroup(hist.data, mFilters, ['propulsao']); if (!p) return null;
    const i1 = lastCompleteIndex(p, end), i0 = Math.max(0, i1 - 59), months = p.months.slice(i0, i1 + 1);
    const share = k => months.map((_, j) => (p.total[i0 + j] > 0 ? (p.by.get(k)?.[i0 + j] ?? 0) / p.total[i0 + j] : null));
    const series = ELEC.map(([k, n, c]) => ({ name: n, color: c, values: share(k) })).filter(s => s.values.some(v => v > .001));
    const totalS = months.map((_, j) => series.reduce((s, x) => s + (x.values[j] ?? 0), 0));
    return { months, series: [{ name: 'Eletrificados', color: 'var(--nx-up)', width: 3.5, values: totalS }, ...series], now: totalS.at(-1), yearAgo: totalS.at(-13) };
  }, [hist.data, mFilters, end]);

  /* ---------- marcas chinesas ---------- */
  const sel = engine.useChineseSelection();
  const chinese = useMemo(() => {
    if (!g) return null;
    const isCn = n => engine.isChineseBrand(n, sel);
    const i1 = lastCompleteIndex(g, end), i0 = Math.max(0, i1 - 59), months = g.months.slice(i0, i1 + 1);
    const cn = months.map((_, j) => { let s = 0; for (const [n, a] of g.by) if (isCn(n)) s += a[i0 + j]; return g.total[i0 + j] > 0 ? s / g.total[i0 + j] : null; });
    const fseg = market?.focus?.groups?.bd_segmento?.[0]?.name;
    let inSeg = null;
    if (fseg) { const gs = historyGroup(hist.data, { ...mFilters, bd_segmento: [fseg] }, ['marca']); if (gs) inSeg = months.map((_, j) => { let s = 0; for (const [n, a] of gs.by) if (isCn(n)) s += a[i0 + j]; return gs.total[i0 + j] > 0 ? s / gs.total[i0 + j] : null; }); }
    const brands = (market?.groups?.marca ?? []).filter(r => isCn(r.name) && r.count > 0), t = market?.total ?? 0;
    return { months, cn, inSeg, seg: fseg, brands: brands.slice(0, 10).map((r, i) => ({ key: r.name, name: r.name, label: brandName(r.name), value: r.count, rank: i + 1, valueText: pct(r.count / t, 1), deltaText: fmt(r.count) })), period: t > 0 ? brands.reduce((s, r) => s + r.count, 0) / t : null };
  }, [g, end, market, sel, hist.data, mFilters]);

  return (
    <div className="px-page">
      <PageHead title="Mercado" toc={[['m-ritmo', 'Ritmo'], ['m-tendencia', 'Tendência'], ['m-sazonalidade', 'Sazonalidade'], ['m-mix', 'O que se compra'], ['m-eletrificacao', 'Eletrificação'], ['m-chinesas', 'Marcas chinesas']]} />

      <Section id="m-ritmo" title="Ritmo do período" sub={rhythm ? <>Média de {fmt(rhythm.avg)} emplacamentos por dia útil{sameMonthLastYear ? <> ({signed(rhythm.avg / sameMonthLastYear.perDay - 1)} sobre {monthLabel(sameMonthLastYear.month)})</> : ''}.</> : null}>
        {!rhythm ? <div className="nx-c12"><Skel h={240} /></div> : (
          <Block className="nx-c12" title="Emplacamentos por dia" sub="Dias úteis em grafite; fins de semana e feriados em cinza (cartórios fechados)" info="A média considera só dias úteis: segunda a sexta, menos feriados nacionais, Carnaval, Sexta-feira Santa e Corpus Christi.">
            <div className="px-kv">
              <div><small>Total no período</small><b>{fmt(market.total)}</b></div>
              <div><small>Dias úteis</small><b>{rhythm.workdays}</b></div>
              <div><small>Média por dia útil</small><b>{fmt(rhythm.avg)}</b></div>
              {rhythm.projection && <div><small>Projeção de {monthLabel(rhythm.projection.month)} ({rhythm.projection.left} dias úteis a correr)</small><b className="red">{fmt(rhythm.projection.value)}</b></div>}
            </div>
            <DailyBars days={rhythm.days} />
          </Block>
        )}
      </Section>

      <Section id="m-tendencia" title="Tendência" sub={trend ? <>Nos 12 meses até {monthLabel(trend.months.at(-1))}: {fmt(trend.last)} emplacamentos, {signed(trend.last / trend.yearAgo - 1)} sobre os 12 anteriores.</> : null}>
        {!trend ? <div className="nx-c12"><Skel h={320} /></div> : <>
          <Block className="nx-c12" title="Acumulado de 12 meses" sub="Cada ponto soma os 12 meses até ali: tira a sazonalidade e mostra a direção do mercado">
            <Lines months={trend.months} series={[{ name: 'Mercado', values: trend.vals, color: 'var(--nx-ink)', width: 3 }]} fmtY={compactK} fmtTip={fmt} endLabels={false} marks={trend.marks} height={300} label="Emplacamentos acumulados em 12 meses" />
            <Scope ignored={ignored} />
          </Block>
          <Block className="nx-c12" title="Ano contra ano" sub={<>{trend.ly} até {MONTH[trend.lm - 1]}: <em>{fmt(trend.ytd)}</em> · {signed(trend.ytd / trend.ytdPrev - 1)} sobre o mesmo intervalo de {trend.ly - 1}</>}>
            <Lines months={MONTH} xFmt={m => m} series={trend.years} fmtY={compactK} fmtTip={fmt} height={300} label="Emplacamentos por mês, um ano sobre o outro" />
          </Block>
        </>}
      </Section>

      <Section id="m-sazonalidade" title="Sazonalidade" sub={season ? <>Em mediana, {MONTH[season.best]} fica {pct(season.med[season.best], 0)} acima da média do ano e {MONTH[season.worst]} {pct(-season.med[season.worst], 0)} abaixo.</> : null}>
        {!season ? <div className="nx-c12"><Skel h={360} /></div> : (
          <Block className="nx-c12" title="Cada mês contra a média mensal do ano" sub="Verde acima da média, âmbar abaixo · a mediana deixa de fora 2020 e 2021 (pandemia)">
            <SeasonHeat years={season.years} />
            <Scope ignored={ignored} />
          </Block>
        )}
      </Section>

      <Section id="m-mix" title={'O que o mercado compra e o que a ' + focusName + ' vende'} sub="Participação de cada categoria nas vendas da marca (vermelho) e no mercado do recorte (cinza).">
        {!mix ? <div className="nx-c12"><Skel h={300} /></div> : mix.map(m => (
          <Block key={m.dim} className="nx-c6" title={m.title} sub={m.top ? <>{focusName}: {pct(m.top.focus, 0)} em {m.top.label.toLowerCase()}, contra {pct(m.top.market, 0)} do mercado</> : null}>
            <PairBars rows={m.rows} focusName={focusName} />
          </Block>
        ))}
      </Section>

      <Section id="m-eletrificacao" title="Eletrificação" sub={elec ? <>{pct(elec.now, 1)} dos emplacamentos no último mês completo; {pct(elec.yearAgo, 1)} um ano antes.</> : null}>
        {!elec ? <div className="nx-c12"><Skel h={300} /></div> : (
          <Block className="nx-c12" title="Participação por tipo de propulsão, últimos 60 meses" sub="Eletrificados = microhíbrido, híbrido, plug-in e elétrico">
            <Lines months={elec.months} series={elec.series} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} height={320} label="Participação dos eletrificados" />
            <Scope ignored={ignored} />
          </Block>
        )}
      </Section>

      <Section id="m-chinesas" title="Marcas chinesas" sub={chinese?.period != null ? <>{pct(chinese.period, 1)} do mercado no período{chinese.inSeg ? <>; em {label('bd_segmento', chinese.seg).toLowerCase()}, o segmento principal de {focusName}, {pct(chinese.inSeg.at(-1), 1)} no último mês</> : ''}.</> : null}>
        {!chinese ? <div className="nx-c12"><Skel h={300} /></div> : <>
          <Block className="nx-c8" title="Participação das marcas de origem chinesa" sub="No mercado do recorte e no segmento principal da marca em foco">
            <Lines months={chinese.months} series={[{ name: 'Mercado', values: chinese.cn, color: 'var(--nx-ink)', width: 3 }, ...(chinese.inSeg ? [{ name: label('bd_segmento', chinese.seg), values: chinese.inSeg, color: 'var(--nx-accent)' }] : [])]} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} height={300} label="Participação das marcas chinesas" />
            <Scope ignored={ignored} extra="Classificação de origem auditada do Atlas (BYD, GWM, Chery, Geely, GAC, Omoda Jaecoo, Leapmotor e outras)." />
          </Block>
          <Block className="nx-c4" title="As maiores" sub="Participação no período">
            <BarList rows={chinese.brands} />
          </Block>
        </>}
      </Section>
    </div>
  );
}
