import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { Diverging, YearLines, useTip } from '../charts.jsx';
import { useNext } from '../ctx.js';
import { fmt, monthEnd, monthLabel, pct, pp, shiftMonth, signed, titleCase } from '../format.js';
import LegacyTab from '../LegacyTab.jsx';
import { AreaHead, Block, Tile } from '../ui.jsx';
import { Seg, TimeLines } from './evolucao-charts.jsx';
import './evolucao.css';
import './evolucao-skin.css';

const FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const name = n => { const s = engine.insightName(n); return s === n.charAt(0) + n.slice(1).toLowerCase() ? titleCase(n) : s; };
const roll = (arr, k = 12) => arr.map((_, i) => (i < k - 1 ? null : arr.slice(i - k + 1, i + 1).reduce((s, v) => s + v, 0)));
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const GREYS = ['#7c7c82', '#98989e', '#b0b0b6', '#c6c6cb', '#8a8a90'];


const TABS = [['geral', 'Visão geral'], ['sazonalidade', 'Sazonalidade'], ['marcas', 'Marcas'], ['composicao', 'Composição']];

export default function Evolucao() {
  const { filters, hist, setFilter, manifest } = useNext();
  const data = hist?.data;
  const [tab, setTab] = useState('geral');
  const [view, setView] = useState('m12');

  /* ---------- série mensal (só meses completos) ---------- */
  const monthly = useMemo(() => {
    if (!data) return null;
    const all = engine.historyMonthly(data, filters);
    while (all.length && !all.at(-1).complete) all.pop();
    return all;
  }, [data, filters]);
  const empty = monthly && monthly.every(m => !m.count);

  /* ---------- por marca, sem o filtro de marca (participação precisa do total) ---------- */
  const noBrand = useMemo(() => ({ ...filters, marca: 'all' }), [filters]);
  const brandMonthly = useMemo(() => {
    if (!data || !data.dimensions.includes('marca')) return null;
    const all = engine.historyMonthly(data, noBrand, 'marca');
    while (all.length && !all.at(-1).complete) all.pop();
    return all;
  }, [data, noBrand]);
  const ignored = hist?.plan?.ignoredLabels ?? [];
  const ignoredBrand = useMemo(() => engine.historyPlan(noBrand).ignoredLabels, [noBrand]);
  const note = ign => (ign.length ? ` Esta série não aplica: ${ign.join(', ')}.` : '');
  const brandSel = (Array.isArray(filters.marca) ? filters.marca : []).filter(x => x !== 'all');

  const t = useMemo(() => (monthly && monthly.length >= 24 && !empty ? timeStats(monthly) : null), [monthly, empty]);
  const finding = t ? <>Os últimos 12 meses somam {fmt(t.last)} emplacamentos{t.change != null ? <>, {signed(t.change)} sobre os 12 anteriores</> : ''}. {t.atPeak ? 'É o maior acumulado de 12 meses da série.' : `Ainda ${pct(Math.abs(t.vsPeak), 0)} ${t.vsPeak < 0 ? 'abaixo' : 'acima'} do melhor acumulado de 12 meses (${monthLabel(t.months[t.peak])}).`}</> : hist?.error ? 'Não foi possível carregar a série histórica.' : empty ? 'Nenhum emplacamento neste recorte.' : 'Carregando dez anos de emplacamentos…';

  const state = hist?.error ? <Block title="Não foi possível carregar a série histórica."><p className="nx-note">{hist.error}</p></Block>
    : !monthly ? <Block title="Carregando dez anos de emplacamentos…"><div className="nxe-skel" /></Block>
    : empty || monthly.length < 24 ? <Block title="Nenhum emplacamento neste recorte."><p className="nx-note">A série histórica não encontrou registros com os filtros escolhidos. Tente retirar algum deles.{note(ignored)}</p></Block> : null;

  return (
    <div className="nxe">
      <AreaHead title="Evolução" finding={finding} tabs={TABS} tab={tab} onTab={setTab} />
      <div className="nx-wrap nxe-body">
        {state}
        {t && (
          <div className="nx-grid">
            {tab === 'geral' && <><Tempo t={t} view={view} setView={setView} ignored={ignored} note={note} /><Anos monthly={monthly} note={note} ignored={ignored} /></>}
            {tab === 'sazonalidade' && <Sazonal monthly={monthly} ignored={ignored} note={note} />}
            {tab === 'marcas' && brandMonthly && <Marcas brandMonthly={brandMonthly} brandSel={brandSel} setFilter={setFilter} ignored={ignoredBrand} note={note} />}
          </div>
        )}
        {(t || state == null) && (
          <>
            {['marcas', 'composicao'].includes(tab) && t && <PeriodBar filters={filters} manifest={manifest} setFilter={setFilter} />}
            <div className="nxe-leg" data-view={tab}><LegacyTab tab="history" className="nxe-legacy" /></div>
          </>
        )}
      </div>
    </div>
  );
}

/* Os gráficos do Atlas atual abaixo seguem o período do filtro global; com um único mês eles ficam vazios. */
function PeriodBar({ filters, manifest, setFilter }) {
  const months = useMemo(() => (manifest?.months ?? []).filter(m => m.cubePath).map(m => m.month).sort(), [manifest]);
  if (!months.length) return null;
  const latest = months.at(-1), first = months[0], date = String(filters.date ?? '');
  const [a, b] = date.split('..').map(s => s?.slice(0, 7));
  const span = a && b ? (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) + 1 : 0;
  const opts = [['12 meses', 12], ['24 meses', 24], ['5 anos', 60], ['Desde ' + first.slice(0, 4), months.length]];
  const val = n => (n >= months.length ? first : shiftMonth(latest, -(n - 1))) + '-01..' + monthEnd(latest);
  return (
    <div className="nxe-period">
      <span className="nxe-period-t">{span <= 6 ? <>Os gráficos detalhados abaixo seguem o período do filtro ({a && b ? (a === b ? monthLabel(a) : monthLabel(a) + ' a ' + monthLabel(b)) : 'atual'}), curto demais para mostrar uma trajetória.</> : <>Os gráficos detalhados abaixo seguem o período do filtro ({monthLabel(a)} a {monthLabel(b)}).</>}</span>
      <span className="nxe-seg" role="group" aria-label="Período dos gráficos detalhados">{opts.map(([l, n]) => <button key={l} type="button" aria-pressed={date === val(n)} onClick={() => setFilter('date', val(n))}>{l}</button>)}</span>
    </div>
  );
}

function timeStats(monthly) {
  const months = monthly.map(m => m.month), counts = monthly.map(m => m.count), r12 = roll(counts);
  const n = counts.length, last = r12[n - 1], prev = r12[n - 13];
  let peak = 11; r12.forEach((v, i) => { if (v != null && v > r12[peak]) peak = i; });
  let best = 0, worst = -1; counts.forEach((v, i) => { if (v > counts[best]) best = i; if (v > 0 && (worst < 0 || v < counts[worst])) worst = i; });
  const vsPeak = last / r12[peak] - 1;
  return { months, counts, r12, n, last, prev, change: prev > 0 ? last / prev - 1 : null, peak, best, worst, vsPeak, atPeak: last >= r12[peak] * 0.995 };
}

/* ================= 1 — dez anos ================= */
function Tempo({ t: d, view, setView, ignored, note }) {
  const ml = i => cap(FULL[+d.months[i].slice(5, 7) - 1]) + ' de ' + d.months[i].slice(0, 4);
  const monthSeries = view === 'mes';
  const values = monthSeries ? d.counts : d.r12;
  const series = [{ name: monthSeries ? 'Por mês' : '12 meses', color: 'var(--nx-accent)', values, width: monthSeries ? 2.4 : 3.6 }];
  const lo = values.findIndex(v => v != null);
  let mx = lo, mn = lo; values.forEach((v, i) => { if (v == null) return; if (v > values[mx]) mx = i; if (v < values[mn]) mn = i; });
  const marks = [{ i: mx, v: values[mx], text: 'Máx. ' + monthLabel(d.months[mx]) + ' · ' + fmt(values[mx]), pos: 'up' }, { i: mn, v: values[mn], text: 'Mín. ' + monthLabel(d.months[mn]) + ' · ' + fmt(values[mn]), pos: 'down' }];
  return (
    <Block className="nx-c7" title="12 meses" sub={<>12 meses somam <em>{fmt(d.last)}</em>{d.change != null ? <>, <em className={d.change >= 0 ? 'up' : 'down'}>{signed(d.change)}</em> sobre os 12 anteriores</> : ''}</>}
      caption={`${monthLabel(d.months[d.n - 12])} a ${monthLabel(d.months[d.n - 1])}. Melhor mês: ${ml(d.best).toLowerCase()} (${fmt(d.counts[d.best])}); pior: ${ml(d.worst).toLowerCase()} (${fmt(d.counts[d.worst])}).`}
      actions={<Seg label="Tipo de série" value={view} onChange={setView} options={[{ value: 'm12', label: '12 meses' }, { value: 'mes', label: 'Mês a mês' }]} />}>
      <TimeLines months={d.months} series={series} marks={marks} endLabels={false} height={320} label="Emplacamentos mensais desde 2016" replayKey={view}
        tipExtra={i => (monthSeries ? null : <span>No mês <b>{fmt(d.counts[i])}</b></span>)} />
      <p className="nx-note">{monthSeries ? 'Cada ponto é um mês.' : 'Cada ponto soma os 12 meses que terminam nele: tira a sazonalidade e deixa a tendência à vista.'}{note(ignored)}</p>
    </Block>
  );
}

/* ================= 1b — ano contra ano ================= */
function Anos({ monthly, ignored, note }) {
  const y = useMemo(() => {
    const last = monthly.at(-1).month, L = +last.slice(5, 7), lastYear = +last.slice(0, 4), shades = ['#d1d1d6', '#a1a1aa', '#6e6e73'];
    const years = []; for (let yr = lastYear - 3; yr <= lastYear; yr++) {
      const values = new Array(12).fill(null);
      for (const m of monthly) if (+m.month.slice(0, 4) === yr && m.count != null) values[+m.month.slice(5, 7) - 1] = m.count;
      years.push({ year: yr, values, main: yr === lastYear, color: yr === lastYear ? 'var(--nx-accent)' : shades[yr - (lastYear - 3)] });
    }
    const sum = a => a.values.slice(0, L).reduce((s, v) => s + (v ?? 0), 0), cur = years.at(-1), prev = years.at(-2), a = sum(cur), b = sum(prev);
    return { years, year: lastYear, prevYear: lastYear - 1, cur: a, change: b > 0 ? a / b - 1 : null, through: SHORT[L - 1] };
  }, [monthly]);
  return (
    <Block className="nx-c5" title="Ano contra ano" sub={<>{y.year} soma <em>{fmt(y.cur)}</em> até {y.through}{y.change != null ? <>, <em className={y.change >= 0 ? 'up' : 'down'}>{signed(y.change)}</em> sobre {y.prevYear}</> : ''}</>} caption="Um ano sobre o outro, de janeiro a dezembro: passe o mouse para comparar mês a mês.">
      <YearLines years={y.years} />
      <p className="nx-note">Meses completos.{note(ignored)}</p>
    </Block>
  );
}

/* ================= 2 — sazonalidade ================= */
function Sazonal({ monthly, ignored, note }) {
  const tip = useTip();
  const s = useMemo(() => {
    const byYear = new Map();
    for (const m of monthly) { const y = +m.month.slice(0, 4); if (!byYear.has(y)) byYear.set(y, new Array(12).fill(null)); byYear.get(y)[+m.month.slice(5, 7) - 1] = m.count; }
    const rows = [...byYear.entries()].map(([year, vals]) => {
      const have = vals.filter(v => v != null), mean = have.length ? have.reduce((a, b) => a + b, 0) / have.length : 0;
      return { year, vals, full: have.length === 12 && mean > 0, idx: vals.map(v => (v != null && mean > 0 ? v / mean : null)) };
    });
    const full = rows.filter(r => r.full);
    if (full.length < 3) return null;
    const med = SHORT.map((_, m) => median(full.map(r => r.idx[m])));
    const top = full.map(r => r.idx.indexOf(Math.max(...r.idx)));
    const best = med.indexOf(Math.max(...med)), worst = med.indexOf(Math.min(...med));
    return { rows, full, med, best, worst, wins: top.filter(x => x === best).length, above: full.filter(r => r.idx[best] > 1).length };
  }, [monthly]);
  if (!s) return null;
  const tone = v => {
    if (v == null) return { className: 'nxe-cell empty' };
    const k = Math.min(1, Math.abs(v - 1) / 0.35);
    return v >= 1 ? { className: 'nxe-cell' + (k > .55 ? ' hi' : ''), style: { background: `color-mix(in srgb, var(--nx-accent) ${Math.round(8 + k * 92)}%, transparent)` } } : { className: 'nxe-cell', style: { background: `rgba(110,110,115,${(.06 + k * .5).toFixed(2)})` } };
  };
  const txt = v => { if (v == null) return ''; const r = Math.round(Math.abs(v - 1) * 100); return r === 0 ? '0' : (v >= 1 ? '+' : '−') + r; };
  return (
    <Block className="nx-c12" title="Sazonalidade" sub={<>{cap(FULL[s.best])} é o mês mais forte: em mediana, <em className="up">{signed(s.med[s.best] - 1, 0)}</em> sobre a média mensal do ano</>}
      caption={`${cap(FULL[s.best])} liderou o ano em ${s.wins} de ${s.full.length} anos completos. O mais fraco é ${FULL[s.worst]}, com ${signed(s.med[s.worst] - 1, 0)}. Cada célula compara o mês com a média do próprio ano.`}>
      <div>
        <div className="nxe-heat" onPointerLeave={tip.hide}>
          <span />{SHORT.map(m => <span key={m} className="nxe-hcol">{m}</span>)}
          {s.rows.map(r => (
            <Row key={r.year} label={r.year + (r.full ? '' : '*')}>
              {r.idx.map((v, m) => { const t = tone(v); return <span key={m} className={t.className} style={{ ...t.style, animationDelay: (m * 14 + (r.year % 100) * 6) + 'ms' }} onPointerMove={v == null ? undefined : e => tip.show(e, <><strong>{cap(FULL[m])} de {r.year}</strong><span>{fmt(r.vals[m])} emplacamentos</span><span>{signed(v - 1, 1)} sobre a média do ano</span></>)}>{txt(v)}</span>; })}
            </Row>
          ))}
          <span className="nxe-sep" />
          <Row label="Mediana" med>
            {s.med.map((v, m) => { const t = tone(v); return <span key={m} className={t.className + ' med'} style={t.style} onPointerMove={e => tip.show(e, <><strong>{cap(FULL[m])}</strong><span>Mediana de {s.full.length} anos completos</span><span>{signed(v - 1, 1)} sobre a média do ano</span></>)}>{txt(v)}</span>; })}
          </Row>
        </div>
        <div className="nxe-key"><span>Abaixo da média</span><i /><span>Acima</span></div>
        <p className="nx-note">Números nas células: diferença, em %, para a média mensal do ano. {s.rows.some(r => !r.full) ? '* Ano em andamento: comparado só com os meses já fechados e fora da mediana. ' : ''}A mediana evita que 2020 puxe a conta.{note(ignored)}</p>
      </div>
      {tip.node}
    </Block>
  );
}
const Row = ({ label, med, children }) => <><span className={'nxe-hrow' + (med ? ' med' : '')}>{label}</span>{children}</>;

/* ================= 3 e 4 — marcas: participação e concentração ================= */
function Marcas({ brandMonthly, brandSel, setFilter, ignored, note }) {
  const b = useMemo(() => {
    const n = brandMonthly.length, months = brandMonthly.map(m => m.month), total = brandMonthly.map(m => m.count);
    if (n < 72 || total.every(v => !v)) return null;
    const names = [...new Set(brandMonthly.flatMap(m => [...m.groups.keys()]))];
    const T = roll(total), share = new Map();
    for (const nm of names) { const r = roll(brandMonthly.map(m => m.groups.get(nm) ?? 0)); share.set(nm, r.map((v, i) => (v == null || !T[i] ? null : v / T[i]))); }
    const now = n - 1, then = n - 1 - 60;
    const rows = names.map(nm => ({ name: nm, now: share.get(nm)[now] ?? 0, then: share.get(nm)[then] ?? 0 })).map(r => ({ ...r, delta: r.now - r.then }));
    const relevant = rows.filter(r => r.now >= .01 || r.then >= .01);
    const riser = [...relevant].sort((x, y) => y.delta - x.delta)[0], faller = [...relevant].sort((x, y) => x.delta - y.delta)[0];
    const top = [...rows].sort((x, y) => y.now - x.now).slice(0, 5);
    const hhi = months.map((_, i) => (T[i] ? [...share.values()].reduce((s, a) => s + (a[i] != null ? (a[i] * 100) ** 2 : 0), 0) : null));
    return { n, months, share, rows, relevant, riser, faller, top, hhi, now, then, T };
  }, [brandMonthly]);
  if (!b) return null;

  /* --- participação ao longo do tempo --- */
  const sel = brandSel.length === 1 ? brandSel[0] : null;
  const shown = [...new Map([...b.top, ...(sel ? b.rows.filter(r => r.name === sel) : []), b.riser, b.faller].filter(Boolean).map(r => [r.name, r])).values()];
  let g = 0;
  const lines = shown.map(r => {
    const hl = sel ? r.name === sel : r.name === b.riser?.name;
    const dark = !sel && r.name === b.faller?.name && r.name !== b.riser?.name;
    return { name: name(r.name), key: r.name, values: b.share.get(r.name).map(v => (v == null ? null : v * 100)), color: hl ? 'var(--nx-accent)' : dark ? 'var(--nx-ink)' : GREYS[g++ % GREYS.length], width: hl ? 4 : dark ? 3.2 : 2.2 };
  });
  const movers = b.relevant.filter(r => Math.abs(r.delta) >= .003);
  const gains = [...movers].sort((x, y) => y.delta - x.delta).filter(r => r.delta > 0).slice(0, 5), losses = [...movers].sort((x, y) => x.delta - y.delta).filter(r => r.delta < 0).slice(0, 5);
  const div = [...gains, ...losses.reverse()].map(r => ({ name: r.name, label: name(r.name), value: r.delta, text: pp(r.delta) }));
  const from = monthLabel(b.months[b.now]), since = monthLabel(b.months[b.then]);
  const ri = b.riser, fa = b.faller;
  const yFmt = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR') + '%';

  /* --- concentração (HHI) --- */
  const hNow = b.hhi[b.now], hThen = b.hhi[b.then], hVals = b.hhi;
  const level = h => (h < 1500 ? 'pouco concentrado' : h < 2500 ? 'moderadamente concentrado' : 'altamente concentrado');
  const eq = 10000 / hNow;
  const hLo = hVals.findIndex(v => v != null);
  let hMax = hLo, hMin = hLo; hVals.forEach((v, i) => { if (v == null) return; if (v > hVals[hMax]) hMax = i; if (v < hVals[hMin]) hMin = i; });
  const hhiMarks = [{ i: hMax, v: hVals[hMax], text: 'Máx. ' + fmt(hVals[hMax]) + ' · ' + monthLabel(b.months[hMax]), pos: 'up' }, { i: hMin, v: hVals[hMin], text: 'Mín. ' + fmt(hVals[hMin]) + ' · ' + monthLabel(b.months[hMin]), pos: 'down' }];
  const hDelta = hNow - hThen;

  return (
    <>
      {ri && fa && (
        <Block className="nx-c7" title="Participação das marcas" sub={<>{name(ri.name)} {ri.then < .0005 ? 'saiu de quase zero' : <>foi de {pct(ri.then)}</>} para <em className="up">{pct(ri.now)}</em> em cinco anos; {name(fa.name)}, de {pct(fa.then)} para <em className="down">{pct(fa.now)}</em></>}
          caption={`Participação no acumulado de 12 meses, de ${since} a ${from}. Linha forte: quem mais ganhou; escura: quem mais perdeu.`}>
          <TimeLines months={b.months} series={lines} fmtY={yFmt} height={320} label="Participação das principais marcas ao longo do tempo" />
          <p className="nx-note">Acumulado de 12 meses de cada marca dividido pelo mercado do recorte (todas as marcas){sel ? '; a marca filtrada aparece em destaque' : ''}.{note(ignored)}</p>
        </Block>
      )}
      {div.length > 1 && (
        <Block className="nx-c5" title="Quem subiu e quem caiu" caption={`Pontos percentuais entre ${since} e ${from}. Clique numa marca para filtrar o painel.`}>
          <Diverging rows={div} onPick={r => setFilter('marca', brandSel.length === 1 && brandSel[0] === r.name ? 'all' : [r.name])} />
        </Block>
      )}
      {hNow != null && hThen != null && (
        <>
          <Block className="nx-c7" title="Concentração do mercado" sub={<>HHI de <em>{fmt(hNow)}</em>: mercado {level(hNow)}{Math.abs(hDelta) < 25 ? ', estável' : <>, <em className={hDelta < 0 ? 'up' : 'down'}>{hDelta < 0 ? 'menos' : 'mais'} concentrado</em></>} que há cinco anos</>}
            caption="Índice Herfindahl-Hirschman: soma do quadrado da participação de cada marca. Abaixo de 1.500 é pouco concentrado; de 1.500 a 2.500, moderado; acima, muito concentrado.">
            <TimeLines months={b.months} series={[{ name: 'HHI', color: 'var(--nx-accent)', values: hVals, width: 3.6 }]} endLabels={false} height={300} yMax={Math.max(1500, Math.ceil(Math.max(...hVals.filter(v => v != null)) * 1.15 / 250) * 250)}
              bands={[{ from: 0, to: 1500, label: 'Pouco concentrado' }, { from: 1500, to: 2500, label: 'Moderado', tone: 'warn' }]} marks={hhiMarks} label="Índice de concentração de mercado ao longo do tempo" />
            <p className="nx-note">Calculado com todas as marcas no acumulado de 12 meses. Menor é mais disputado.{note(ignored)}</p>
          </Block>
          <div className="nx-c5 nxe-tiles">
            <Tile k="HHI hoje" sub={`Há cinco anos: ${fmt(hThen)}`}>{fmt(hNow)}</Tile>
            <Tile k="Equivale a" sub="marcas de mesmo tamanho dividindo o mercado">{Math.round(eq)}</Tile>
          </div>
        </>
      )}
    </>
  );
}
