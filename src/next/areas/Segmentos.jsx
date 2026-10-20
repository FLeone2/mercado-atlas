import { useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { useNext } from '../ctx.js';
import { ShareArea } from '../charts.jsx';
import { fmt, monthLabel, pct, pp, rangeText, signed } from '../format.js';
import { Chapter } from '../ui.jsx';
import { GroupBars, LENSES, LeaderCards, groupLabel, isUnclassified, prepGroups } from './segmentos-charts.jsx';
import './segmentos.css';

const GREYS = ['#3f3f46', '#a1a1aa', '#71717a', '#d4d4d8', '#8b8b94', '#e4e4e7'];
const YEARS = ['um ano', 'dois anos', 'três anos', 'quatro anos', 'cinco anos', 'seis anos', 'sete anos', 'oito anos', 'nove anos', 'dez anos'];
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const brandName = n => engine.insightName(n);
const avg = (arr, k) => arr.reduce((s, x) => s + (x.get(k) ?? 0), 0) / arr.length;

export default function Segmentos() {
  const { filters, setFilter, model, hist } = useNext();
  const [lensId, setLensId] = useState('porte');
  const lens = LENSES.find(l => l.id === lensId), dim = lens.dim;
  const selected = list(filters[dim]);

  /* with a filter on the lens dimension the page model only has the chosen groups, so ask once more for all of them */
  const stripped = useMemo(() => ({ ...filters, [dim]: 'all' }), [filters, dim]);
  const wide = engine.useMarketData(stripped, selected.length > 0, 'dashboard', false).result;
  const last = useRef({}); const base = selected.length ? wide ?? last.current[dim] ?? null : model; if (selected.length && wide) last.current[dim] = wide;

  const rows = useMemo(() => (base ? prepGroups(dim, base.groups?.[dim], base.total, base.previous) : []), [base, dim]);
  const real = rows.filter(r => !r.unclassified);
  const top = real[0];
  const shown = useMemo(() => {
    const head = rows.slice(0, 10), rest = rows.slice(10);
    if (!rest.length) return head;
    const count = rest.reduce((s, r) => s + r.count, 0), previous = rest.reduce((s, r) => s + r.previous, 0), hasPrev = rest.some(r => r.hasPrev);
    return [...head, { label: `Outros ${rest.length} grupos`, names: rest.flatMap(r => r.names), count, previous, hasPrev, share: base.total > 0 ? count / base.total : 0, changeRate: hasPrev && previous > 0 ? count / previous - 1 : null, other: true }];
  }, [rows, base]);
  const mover = useMemo(() => real.filter(r => r.share >= .01 && r.shareChange != null).sort((a, b) => b.shareChange - a.shareChange)[0], [real]);

  /* ---------- como o mix mudou ---------- */
  const end = (model?.range?.end ?? '').slice(0, 7);
  const mix = useMemo(() => {
    if (!hist.data || !hist.data.dimensions.includes(dim)) return null;
    const months = engine.historyMonthly(hist.data, stripped, dim).filter(m => m.complete && m.count > 0 && (!end || m.month <= end)).slice(-60);
    if (months.length < 24) return null;
    const shares = months.map(m => {
      const by = new Map(); let tot = 0;
      for (const [raw, n] of m.groups) { const l = groupLabel(dim, raw); if (isUnclassified(l)) continue; by.set(l, (by.get(l) ?? 0) + n); tot += n; }
      for (const [l, n] of by) by.set(l, n / tot);
      return by;
    });
    const labels = [...new Set(shares.flatMap(s => [...s.keys()]))];
    const early = shares.slice(0, 12), late = shares.slice(-12);
    const stat = labels.map(l => ({ label: l, a: avg(early, l), b: avg(late, l), now: shares.at(-1).get(l) ?? 0 })).map(s => ({ ...s, d: s.b - s.a }));
    const ordered = [...stat].sort((x, y) => y.b - x.b);
    const dominant = ordered[0]?.now >= .55 && ordered.length > 2 ? ordered[0] : null;
    const kept = ordered.filter(s => s !== dominant);
    const focus = stat.filter(s => s !== dominant).filter(s => Math.max(s.a, s.b) >= .003).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    const grown = [...stat].filter(s => s.d > 0 && s !== focus && Math.max(s.a, s.b) >= .01).sort((x, y) => y.d - x.d)[0];
    const lost = [...stat].filter(s => s.d < 0 && s !== focus && Math.max(s.a, s.b) >= .01).sort((x, y) => x.d - y.d)[0];
    const heads = kept.slice(0, 6), rest = kept.slice(6).map(s => s.label);
    const mk = (name, f, color) => ({ name, color, values: shares.map(f) });
    const series = heads.map((s, i) => mk(s.label, m => m.get(s.label) ?? 0, s === focus || (!focus && i === 0) ? 'var(--nx-accent)' : GREYS[i % GREYS.length]));
    if (rest.length) series.push(mk('Outros', m => rest.reduce((t, l) => t + (m.get(l) ?? 0), 0), '#ececef'));
    const topSum = Math.max(...shares.map((_, i) => series.reduce((t, s) => t + s.values[i], 0)));
    return {
      series, focus, grown, lost, dominant, n: months.length, first: months[0].month, lastM: months.at(-1).month,
      axis: dominant ? Math.max(.04, Math.ceil(topSum * 1.15 / .04) * .04) : 1,
      months: months.map(m => ({ label: monthLabel(m.month), short: monthLabel(m.month) })),
    };
  }, [hist.data, stripped, dim, end]);

  /* ---------- quem vence em cada grupo (cruza o histórico com o recorte do período) ---------- */
  const brandless = useMemo(() => ({ ...filters, marca: 'all', modelo: 'all', grupo_modelo: 'all' }), [filters]);
  const period = model?.range ? [model.range.start.slice(0, 7), model.range.end.slice(0, 7)] : null;
  const cards = useMemo(() => {
    if (!hist.data || !period || !hist.data.dimensions.includes('marca') || !hist.data.dimensions.includes(dim)) return null;
    const out = [];
    for (const g of real.slice(0, 8)) {
      const by = new Map();
      for (const raw of g.names) for (const m of engine.historyMonthly(hist.data, { ...brandless, [dim]: [raw] }, 'marca')) {
        if (m.month < period[0] || m.month > period[1]) continue;
        for (const [b, n] of m.groups) by.set(b, (by.get(b) ?? 0) + n);
      }
      const total = [...by.values()].reduce((s, n) => s + n, 0);
      if (!(total > 0)) continue;
      const sorted = [...by].map(([name, count]) => ({ name, count, share: count / total })).sort((a, b) => b.count - a.count);
      out.push({ label: g.label, names: g.names, groupShare: g.share, total, leader: sorted[0], next: sorted.slice(1, 3) });
    }
    return out;
  }, [hist.data, brandless, dim, real, period?.[0], period?.[1]]);
  const wins = useMemo(() => {
    if (!cards?.length) return null;
    const m = new Map(); for (const c of cards) m.set(c.leader.name, (m.get(c.leader.name) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || cards.findIndex(c => c.leader.name === a[0]) - cards.findIndex(c => c.leader.name === b[0]))[0];
  }, [cards]);

  const ignored = engine.historyPlan(brandless).ignoredLabels;
  const noteIgnored = ignored.length ? `Esta série não aplica: ${ignored.join(', ')}.` : '';
  const pick = r => { if (r.other) return; const on = r.names.every(n => selected.includes(n)) && selected.length === r.names.length; setFilter(dim, on ? 'all' : r.names); };

  const lensBar = (
    <div className="nxs-lensbar">
      <div className="nx-wrap">
        <div className="nxs-lensbar-in">
          <span>Dividir por</span>
          <div className="nxs-seg" role="group" aria-label="Lente de segmentação">
            {LENSES.map(l => <button key={l.id} type="button" aria-pressed={l.id === lensId} onClick={() => setLensId(l.id)}>{l.label}</button>)}
          </div>
        </div>
      </div>
    </div>
  );

  if (!base) return <>{lensBar}<Chapter id="seg-ranking" kicker={lens.title} title="Carregando…"><div className="nxs-skel" /></Chapter></>;
  if (!rows.length) return <>{lensBar}<Chapter id="seg-ranking" kicker={lens.title} title="Nenhum emplacamento neste recorte."><p className="nx-lede">Os filtros atuais não deixam nada para dividir. Ajuste o período ou limpe filtros na barra do topo.</p></Chapter></>;

  const change = top?.changeRate;
  const pl = Boolean(lens.plural), verb = (a, b) => (pl ? b : a);
  const growth = change == null ? '' : Math.abs(change) < .0005 ? 'e ' + verb('fica', 'ficam') + ' estável' + (pl ? 's' : '') : change > 0 ? <>e <em className="up">{verb('cresce', 'crescem')} {pct(change)}</em></> : <>e <em className="down">{verb('cai', 'caem')} {pct(-change)}</em></>;
  const unclassified = rows.find(r => r.unclassified);

  return (
    <>
      {lensBar}
      {/* 1 — ranking */}
      <Chapter id="seg-ranking" kicker={lens.title + ' · quem concentra'} title={top ? <><em>{top.label}</em> {verb('concentra', 'concentram')} <em>{pct(top.share)}</em> do mercado {growth}.</> : 'Sem grupos classificados neste recorte.'}
        lede={`Participação de cada ${lens.noun} nos emplacamentos de ${rangeText(base.range)}. A seta compara o volume com o período anterior.${mover && mover !== top ? ` Quem mais ganha espaço: ${mover.label} (${pp(mover.shareChange)}).` : mover ? ` É também quem mais ganha espaço (${pp(mover.shareChange)}).` : ''} Clique num grupo para filtrar todo o painel.`}>
        <div className="nx-card">
          {selected.length > 0 && <div className="nxs-active"><span>Painel filtrado por <b>{[...new Set(selected.map(n => groupLabel(dim, n)))].join(', ')}</b>.</span><button type="button" onClick={() => setFilter(dim, 'all')}>Limpar</button></div>}
          <GroupBars rows={shown} highlight={selected} onPick={pick} />
          <p className="nx-note">As participações somam o total de {fmt(base.total)} emplacamentos do período{unclassified ? `; ${pct(unclassified.share)} não têm classificação nesta lente` : ''}. {base.previous == null ? 'Não há período anterior para comparar.' : ''}</p>
        </div>
      </Chapter>

      {/* 2 — mix no tempo */}
      {mix ? (
        <Chapter id="seg-mix" kicker={lens.title + ' · ao longo do tempo'}
          title={mix.focus ? <>{Math.abs(mix.focus.d) < .005 ? <>O mix mal mudou em {YEARS[Math.max(0, Math.round((mix.n - 12) / 12) - 1)] ?? 'anos'}.</> : <>Em {YEARS[Math.max(0, Math.round((mix.n - 12) / 12) - 1)] ?? 'alguns anos'}, <em>{mix.focus.label}</em> {verb('foi', 'foram')} de {pct(mix.focus.a)} para <em className={mix.focus.d > 0 ? 'up' : 'down'}>{pct(mix.focus.b)}</em> do mercado.</>}</> : 'O mix se manteve estável.'}
          lede={`Cada faixa é a fatia de um ${lens.noun} nos emplacamentos de cada mês, de ${monthLabel(mix.first)} a ${monthLabel(mix.lastM)}.${mix.grown ? ` Também ganhou: ${mix.grown.label} (${pp(mix.grown.d)}).` : ''}${mix.lost ? ` Também perdeu: ${mix.lost.label} (${pp(mix.lost.d)}).` : ''}`}>
          <div className="nx-card">
            <ShareArea months={mix.months} series={mix.series} max={mix.axis} />
            <p className="nx-note">A comparação usa a média dos 12 primeiros contra os 12 últimos meses da janela, sem depender do período escolhido. {mix.dominant ? `A faixa de ${mix.dominant.label} (${pct(mix.dominant.now)} no último mês) fica de fora para as demais aparecerem; o espaço vazio acima é dela. ` : ''}Itens sem classificação não entram na conta. {noteIgnored}</p>
          </div>
        </Chapter>
      ) : (
        hist.data && <Chapter id="seg-mix" kicker={lens.title + ' · ao longo do tempo'} title="Sem histórico suficiente para esta lente."><p className="nx-lede">A série mensal não tem ao menos dois anos de dados para este recorte.</p></Chapter>
      )}

      {/* 3 — líderes por grupo */}
      {cards && cards.length > 0 && (
        <Chapter id="seg-lideres" kicker={lens.title + ' · quem vence'}
          title={wins && wins[1] >= 2 ? <><em>{brandName(wins[0])}</em> lidera em <em>{wins[1]}</em> dos {cards.length} maiores grupos.</> : <>Cada grupo tem o seu líder: <em>{cards.length}</em> grupos, <em>{new Set(cards.map(c => c.leader.name)).size}</em> marcas.</>}
          lede={`A marca com mais emplacamentos dentro de cada ${lens.noun} em ${rangeText(base.range)}, considerando todas as marcas. Clique num cartão para filtrar o painel pelo grupo.`}>
          <div className="nx-card">
            <LeaderCards cards={cards} active={selected} onPick={pick} brandName={brandName} />
            <p className="nx-note">Mostra os {cards.length} maiores grupos; abaixo de cada líder aparecem as duas seguintes e a fatia de cada uma dentro do grupo. {noteIgnored}</p>
          </div>
        </Chapter>
      )}
    </>
  );
}
