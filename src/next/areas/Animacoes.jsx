import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { useNext } from '../ctx.js';
import { YearLines, useTip } from '../charts.jsx';
import { MONTHS, UF_NAMES, fmt, monthLabel, signed } from '../format.js';
import { Chapter } from '../ui.jsx';
import { Race } from './animacoes-charts.jsx';
import './animacoes.css';

const SPEEDS = { lento: 1400, normal: 800, rapido: 100 };
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const Seg = ({ value, options, onChange, label }) => (
  <div className="nxa-seg" role="group" aria-label={label}>
    {options.map(([k, text]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{text}</button>)}
  </div>
);
const useNarrow = () => {
  const [n, set] = useState(() => matchMedia('(max-width:560px)').matches);
  useEffect(() => { const m = matchMedia('(max-width:560px)'), f = () => set(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return n;
};
const Icon = ({ d }) => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d={d} fill="currentColor" /></svg>;

export default function Animacoes() {
  const { filters, hist, base, focus } = useNext();
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const narrow = useNarrow(), tip = useTip();
  const [entity, setEntity] = useState('marca'), [mode, setMode] = useState('cum'), [topN, setTopN] = useState(10), [yearSel, setYearSel] = useState(null), [speed, setSpeed] = useState('normal');
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [scrub, setScrub] = useState(false), [allEv, setAllEv] = useState(false);
  const stageRef = useRef(null), started = useRef(false);

  /* ---------- data: monthly history grouped by brand (or by state, from the file by UF) ---------- */
  const ufHist = engine.useHistory({ uf: ['SP'] }, base, entity === 'uf');
  const src = entity === 'marca' ? (hist.pending ? null : hist.data) : ufHist.data;
  const monthly = useMemo(() => (src ? engine.historyMonthly(src, filters, entity) : null), [src, filters, entity]);
  const latest = useMemo(() => monthly?.filter(m => m.count > 0).at(-1)?.month ?? null, [monthly]);
  const years = useMemo(() => (monthly && latest ? [...new Set(monthly.filter(m => m.month <= latest && m.count > 0).map(m => +m.month.slice(0, 4)))] : []), [monthly, latest]);
  const year = yearSel && years.includes(yearSel) ? yearSel : years.at(-1) ?? null;
  const label = useCallback(k => (entity === 'uf' ? UF_NAMES[k] ?? k : engine.insightName(k)), [entity]);
  const focusKey = entity === 'marca' ? focus : list(filters.uf)[0] ?? null;
  const planFilters = entity === 'uf' ? { ...filters, uf: list(filters.uf).length ? filters.uf : ['__'] } : filters;
  const ignored = engine.historyPlan(planFilters).ignoredLabels;

  const race = useMemo(() => {
    if (!monthly || !latest || !year) return null;
    const ms = monthly.filter(m => m.month.startsWith(year + '-') && m.month <= latest);
    if (!ms.length) return null;
    const names = new Set(); ms.forEach(m => m.groups.forEach((v, k) => { if (v > 0 && (entity === 'marca' || UF_NAMES[k])) names.add(k); }));
    const series = [...names].map(k => { const raw = ms.map(m => m.groups.get(k) ?? 0); let a = 0; return { key: k, raw, cum: raw.map(v => (a += v)) }; });
    return series.length ? { ms, series, months: ms.map(m => m.month), complete: ms.at(-1).complete !== false } : null;
  }, [monthly, latest, year, entity]);
  const N = Math.max(1, Math.min(topN, race?.series.length ?? topN));
  const M = race?.months.length ?? 0, f = Math.min(frame, Math.max(0, M - 1));

  /* the order of every item in every month, for the chosen reading */
  const ranks = useMemo(() => {
    if (!race) return null;
    return race.months.map((_, i) => {
      const sorted = race.series.map(s => [s.key, (mode === 'cum' ? s.cum : s.raw)[i]]).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
      return { sorted, rk: new Map(sorted.map(([k], j) => [k, j])), val: new Map(sorted) };
    });
  }, [race, mode]);
  const view = useMemo(() => {
    if (!ranks) return null;
    const set = new Set(); ranks.forEach(r => r.sorted.slice(0, N).forEach(([k]) => set.add(k)));
    const hasFocus = focusKey && race.series.some(s => s.key === focusKey);
    if (hasFocus) set.add(focusKey);
    return { keys: [...set].sort(), extra: Boolean(hasFocus && ranks.some(r => r.rk.get(focusKey) >= N)) };
  }, [ranks, race, N, focusKey]);

  /* overtakes: someone moves up past someone who was ahead, landing inside the top N */
  const events = useMemo(() => {
    if (!ranks) return [];
    const out = [];
    for (let i = 1; i < ranks.length; i++) {
      const p = ranks[i - 1], c = ranks[i];
      for (const [a, ra] of c.rk) {
        if (ra >= N || !(c.val.get(a) > 0)) continue;
        const pa = p.rk.get(a); if (!(pa > ra)) continue;
        for (const [b, rb] of c.rk) if (rb > ra && p.rk.get(b) < pa && c.val.get(b) > 0) out.push({ f: i, a, b, rank: ra + 1 });
      }
    }
    return out.sort((x, y) => x.f - y.f || x.rank - y.rank);
  }, [ranks, N]);

  /* ---------- time ---------- */
  const step = SPEEDS[speed];
  useEffect(() => {
    if (!playing || !M) return undefined;
    if (f >= M - 1) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setFrame(x => Math.min(M - 1, x + 1)), step);
    return () => clearTimeout(t);
  }, [playing, f, step, M]);
  const begin = useCallback((play = true) => { setFrame(0); setPlaying(play && !reduced); }, [reduced]);
  // a new year or a new kind of race starts over
  useEffect(() => { if (!started.current) return; setFrame(0); setPlaying(!reduced); }, [year, entity]); // eslint-disable-line react-hooks/exhaustive-deps
  // reduced motion: show the end of the year, no playing; otherwise start when the chart comes into view, once
  const ready = Boolean(race);
  useEffect(() => {
    if (!ready) return undefined;
    if (reduced) { setFrame(M - 1); started.current = true; return undefined; }
    const el = stageRef.current; if (!el) return undefined;
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting && !started.current) { started.current = true; begin(); io.disconnect(); } }, { threshold: .5 });
    io.observe(el); return () => io.disconnect();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => { started.current = true; if (playing) setPlaying(false); else { if (f >= M - 1) setFrame(0); setPlaying(true); } };
  const jump = i => { started.current = true; setPlaying(false); setFrame(i); };
  const dur = reduced ? 0 : playing ? Math.round(Math.min(step * .92, 800)) : scrub ? 120 : 420;

  /* ---------- what to draw now ---------- */
  const rowH = narrow ? 36 : 40;
  const frameData = useMemo(() => {
    if (!ranks || !view) return null;
    const r = ranks[f], top = r.sorted[0], series = new Map(race.series.map(s => [s.key, s]));
    let total = 0; r.sorted.forEach(([, v]) => { total += v; });
    const items = view.keys.map(k => {
      const rank = r.rk.get(k), value = r.val.get(k), isFocus = k === focusKey, s = series.get(k);
      const hidden = rank >= N && !(isFocus && value > 0);
      return { key: k, label: label(k), value, rank: rank + 1, focus: isFocus, hidden, slot: rank < N ? rank : isFocus && value > 0 ? N + .3 : N + .3, extra: mode === 'cum' ? `${fmt(s.raw[f])} só em ${monthLabel(race.months[f])}` : `${fmt(s.cum[f])} acumulados no ano` };
    });
    return { items, max: top && top[1] > 0 ? top[1] : 1, top, total };
  }, [ranks, view, race, f, N, focusKey, label, mode]);
  const height = (N + (view?.extra ? 1.3 : 0)) * rowH;

  /* ---------- headline and live caption ---------- */
  const thing = entity === 'marca' ? 'marcas' : 'estados';
  const lastTop = ranks?.at(-1).sorted[0];
  const best = useMemo(() => events.reduce((m, e) => (!m || e.rank < m.rank || (e.rank === m.rank && e.f > m.f) ? e : m), null), [events]);
  const leaders = useMemo(() => (ranks ? new Set(ranks.map(r => r.sorted[0][0])) : new Set()), [ranks]);
  const mname = i => MONTHS[+race.months[i].slice(5, 7) - 1];
  const partial = race && year === +latest.slice(0, 4) && race.months.at(-1).slice(5, 7) !== '12';
  const title = !race ? null : mode === 'cum'
    ? <>{label(lastTop[0])} lidera {year}{partial ? ` até ${mname(M - 1)}` : ''} com <em>{fmt(lastTop[1])}</em>{best ? <>; {label(best.a)} passou {label(best.b)} em {mname(best.f)}</> : ', sem ultrapassagens no topo'}.</>
    : leaders.size > 1 ? <><em>{leaders.size}</em> {thing} lideram ao menos um mês de {year}{partial ? ` (até ${mname(M - 1)})` : ''}.</> : <>{label(lastTop[0])} lidera todos os meses de {year}.</>;
  const evNow = events.filter(e => e.f === f);
  const caption = !race ? '' : evNow.length ? <>Em {monthLabel(race.months[f])}, <b>{label(evNow[0].a)}</b> ultrapassou <b>{label(evNow[0].b)}</b>{evNow.length > 1 ? ` e mais ${evNow.length - 1} ${evNow.length > 2 ? 'ultrapassagens' : 'ultrapassagem'}` : ''}.</>
    : <>{mode === 'cum' ? 'Acumulado' : 'No mês'} em {monthLabel(race.months[f])}: <b>{label(frameData.top[0])}</b> lidera com {fmt(frameData.top[1])}.</>;

  /* ---------- the cumulative curve of the year against earlier years ---------- */
  const curve = useMemo(() => {
    if (!monthly || !race) return null;
    const shades = ['#d1d1d6', '#a1a1aa', '#6e6e73'], out = [];
    for (let y = year - 3; y <= year; y++) {
      const ms = monthly.filter(m => +m.month.slice(0, 4) === y && m.month <= latest);
      if (!ms.length || ms.every(m => !(m.count > 0))) continue;
      const values = new Array(12).fill(null); let a = 0;
      ms.forEach(m => { a += m.count; values[+m.month.slice(5, 7) - 1] = a; });
      out.push({ year: y, values, main: y === year, color: y === year ? 'var(--nx-accent)' : shades[Math.max(0, 2 - (year - y - 1))] });
    }
    const cur = out.find(o => o.main), prev = out.find(o => o.year === year - 1), L = M;
    return { years: out, cur: cur?.values[L - 1], prev: prev?.values[L - 1], prevYear: year - 1 };
  }, [monthly, race, year, latest, M]);
  const curveChange = curve?.cur != null && curve.prev > 0 ? curve.cur / curve.prev - 1 : null;

  const loading = !monthly && !hist.error && !ufHist.error;
  const empty = monthly && !race;
  const shownEv = allEv ? events : events.slice(0, 12);

  return (
    <>
      {/* 1 — a corrida */}
      <Chapter id="corrida" kicker="O mercado em movimento" wide
        title={loading ? 'Carregando…' : hist.error || (entity === 'uf' && ufHist.error) ? 'Histórico indisponível.' : empty ? 'Sem emplacamentos neste recorte.' : title}
        lede={race ? (mode === 'cum' ? `Cada barra soma os emplacamentos desde janeiro; a ordem muda conforme as somas crescem, mês após mês. ${year}, de ${mname(0)} a ${mname(M - 1)}.` : `Cada barra mostra só o mês corrente: a ordem é refeita todo mês. ${year}, de ${mname(0)} a ${mname(M - 1)}.`) : undefined}>
        <div className="nx-card nxa-card">
          <div className="nxa-opts">
            <label className="nxa-sel">Ano
              <select value={year ?? ''} onChange={e => { started.current = true; setYearSel(+e.target.value); }} disabled={!years.length}>
                {[...years].reverse().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <Seg label="O que corre" value={entity} onChange={v => { started.current = true; setEntity(v); }} options={[['marca', 'Marcas'], ['uf', 'Estados']]} />
            <Seg label="Quantas barras" value={String(topN)} onChange={v => setTopN(+v)} options={[['5', 'Top 5'], ['10', 'Top 10'], ['15', 'Top 15']]} />
            <Seg label="Leitura" value={mode} onChange={setMode} options={[['cum', 'Acumulado no ano'], ['mes', 'Mês a mês']]} />
          </div>

          {frameData ? (
            <div ref={stageRef}>
              <div className="nxa-head">
                <p className="nxa-caption" key={f + mode}>{caption}</p>
                <div className="nxa-total"><span>{mode === 'cum' ? 'Total do recorte, acumulado' : 'Total do recorte no mês'}</span><strong>{fmt(frameData.total)}</strong></div>
              </div>
              <Race items={frameData.items} max={frameData.max} rowH={rowH} height={height} dur={dur} month={monthLabel(race.months[f])} tip={tip} total={frameData.total} />
              <div className="nxa-transport">
                <button type="button" className="nxa-play" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
                  {playing ? <Icon d="M3 2h4v12H3zM9 2h4v12H9z" /> : <Icon d="M3 1.5v13l11-6.5z" />}<span>{playing ? 'Pausar' : f >= M - 1 ? 'Rever' : 'Reproduzir'}</span>
                </button>
                <button type="button" className="nxa-ghost" onClick={() => { started.current = true; begin(); }} aria-label="Reiniciar"><Icon d="M8 2a6 6 0 1 0 5.7 4.2l-1.9.6A4 4 0 1 1 8 4v2.5l4-3.2L8 .2z" /><span>Reiniciar</span></button>
                <Seg label="Velocidade" value={speed} onChange={setSpeed} options={[['lento', 'Lento'], ['normal', 'Normal'], ['rapido', 'Rápido']]} />
                <div className="nxa-scrub">
                  <input type="range" min={0} max={Math.max(0, M - 1)} step={1} value={f} aria-label="Mês" aria-valuetext={monthLabel(race.months[f])}
                    onPointerDown={() => setScrub(true)} onPointerUp={() => setScrub(false)} onBlur={() => setScrub(false)}
                    onChange={e => jump(+e.target.value)} style={{ '--p': M > 1 ? f / (M - 1) * 100 + '%' : '0%' }} />
                  <div className="nxa-ticks" aria-hidden>{race.months.map((m, i) => <span key={m} className={i === f ? 'on' : ''}>{MONTHS[+m.slice(5, 7) - 1]}</span>)}</div>
                </div>
              </div>
            </div>
          ) : <div className="nxa-skel" aria-hidden>{loading ? 'Lendo o histórico…' : 'Nenhum emplacamento neste ano e recorte. Ajuste os filtros ou escolha outro ano.'}</div>}
          <p className="nx-note">Histórico mensal pré-calculado, aplicado aos filtros de marca, segmento, propulsão e território{ignored.length ? `, exceto ${ignored.join(', ')}` : ''}.{race && !race.complete ? ' O último mês ainda está incompleto.' : ''}{focusKey ? ` Em destaque: ${label(focusKey)}${view?.extra ? ' (fixada abaixo quando fica fora do top ' + N + ')' : ''}.` : ''}</p>
        </div>
        {tip.node}
      </Chapter>

      {/* 2 — ultrapassagens */}
      {race && ranks && (
        <Chapter id="ultrapassagens" kicker="Quem passou quem" title={events.length ? <>O top {N} troca de ordem <em>{events.length}</em> {events.length === 1 ? 'vez' : 'vezes'} em {year}.</> : <>O top {N} não troca de ordem em {year}.</>}
          lede={events.length ? 'Cada linha é uma ultrapassagem, no mês em que a soma de uma barra superou a de outra. Clique para ver a corrida naquele mês.' : mode === 'cum' ? 'No acumulado, quem sai na frente tende a ficar na frente. Experimente a leitura mês a mês.' : 'A ordem mensal se repete em todos os meses.'}>
          <div className="nx-card">
            {events.length > 0 ? (
              <>
                <ul className="nxa-events">
                  {shownEv.map((e, i) => (
                    <li key={i}><button type="button" onClick={() => { jump(e.f); stageRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }}>
                      <span className="mo">{mname(e.f)}</span>
                      <span className="tx"><b>{label(e.a)}</b> ultrapassou <b>{label(e.b)}</b></span>
                      <span className="rk">{e.rank}º lugar</span>
                    </button></li>
                  ))}
                </ul>
                {events.length > 12 && <button type="button" className="nxa-link" onClick={() => setAllEv(v => !v)}>{allEv ? 'Mostrar menos' : `Mostrar as ${events.length}`}</button>}
              </>
            ) : <p className="nxa-skel">Nenhuma ultrapassagem entre as {N} primeiras posições.</p>}
            <p className="nx-note">Conta quando uma barra passa à frente de outra e termina no top {N}. Vale para a leitura escolhida acima ({mode === 'cum' ? 'acumulado no ano' : 'mês a mês'}).</p>
          </div>
        </Chapter>
      )}

      {/* 3 — o ritmo do ano */}
      {curve && curve.years.length > 1 && curve.cur != null && (
        <Chapter id="ritmo" kicker="O ritmo do ano" title={<>{year} soma <em>{fmt(curve.cur)}</em> até {mname(M - 1)}{curveChange != null ? <>, <em className={curveChange >= 0 ? 'up' : 'down'}>{signed(curveChange)}</em> sobre {curve.prevYear}</> : ''}.</>}
          lede="O acumulado do mercado inteiro, mês a mês, contra os três anos anteriores. É o mesmo raciocínio da corrida: a linha só sobe, e o que importa é a inclinação.">
          <div className="nx-card"><YearLines years={curve.years} /><p className="nx-note">Soma dos emplacamentos desde janeiro, já com os filtros do painel. {ignored.length ? `Esta série não aplica: ${ignored.join(', ')}.` : ''}</p></div>
        </Chapter>
      )}
    </>
  );
}
