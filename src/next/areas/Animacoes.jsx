import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { useNext } from '../ctx.js';
import { YearLines, useTip } from '../charts.jsx';
import LegacyTab from '../LegacyTab.jsx';
import { MONTHS, UF_NAMES, fmt, monthLabel, signed } from '../format.js';
import { AreaHead, Block } from '../ui.jsx';
import { Race } from './animacoes-charts.jsx';
import './animacoes.css';
import './animacoes-skin.css';

/* Velocidades: as mesmas do Atlas atual, de 2 s até 0,1 s por quadro. */
const SPEEDS = [['2000', 'Lenta · 2 s'], ['1000', 'Normal · 1 s'], ['500', 'Rápida · 0,5 s'], ['250', 'Muito rápida · 0,25 s'], ['100', 'Ultra rápida · 0,1 s']];
/* Abas: as cinco visões do painel do Atlas atual (na ordem dele) + a corrida de estados, que só existe aqui. */
const TABS = [['races', 'Corridas'], ['estados', 'Corrida de estados'], ['bubbles', 'Bolhas em movimento'], ['mix', 'Transformação do mercado'], ['maps', 'Brasil no tempo'], ['heat', 'Calor por marca']];
const LEGACY_INDEX = { races: 0, bubbles: 1, mix: 2, maps: 3, heat: 4 };
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const Icon = ({ d }) => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d={d} fill="currentColor" /></svg>;
const useNarrow = () => {
  const [n, set] = useState(() => matchMedia('(max-width:560px)').matches);
  useEffect(() => { const m = matchMedia('(max-width:560px)'), f = () => set(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return n;
};
const setSelect = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

/* ---------- dados da corrida: histórico mensal por marca (ou por estado), acumulado de janeiro até o último mês ---------- */
function useRaceModel({ entity, enabled, yearSel, topN }) {
  const { filters, hist, base, focus } = useNext();
  const ufHist = engine.useHistory({ uf: ['SP'] }, base, enabled && entity === 'uf');
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
  // a ordem de cada item em cada mês (sempre o acumulado: a animação nunca mostra o mês isolado)
  const ranks = useMemo(() => {
    if (!race) return null;
    return race.months.map((_, i) => {
      const sorted = race.series.map(s => [s.key, s.cum[i]]).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
      return { sorted, rk: new Map(sorted.map(([k], j) => [k, j])), val: new Map(sorted) };
    });
  }, [race]);
  // ultrapassagens: alguém passa quem estava à frente e termina dentro do top N
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
  const error = entity === 'marca' ? hist.error : ufHist.error;
  return { entity, monthly, latest, years, year, race, ranks, N, events, label, focusKey, ignored, error, loading: !monthly && !error, empty: Boolean(monthly) && !race, M: race?.months.length ?? 0 };
}
const mname = (m, i) => MONTHS[+m.race.months[i].slice(5, 7) - 1];

/* ---------- a corrida de estados (nativa: o Atlas atual só corre estados pelo volume da Mitsubishi) ---------- */
function RaceCard({ m, topN, setTopN, setYear, frame, setFrame, tip, anchorRef }) {
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const narrow = useNarrow();
  const [speed, setSpeed] = useState('1000'), [playing, setPlaying] = useState(false), [scrub, setScrub] = useState(false);
  const { race, ranks, N, M, label, focusKey, year } = m;
  const f = Math.min(frame, Math.max(0, M - 1)), step = +speed, started = useRef(false), stageRef = useRef(null);
  useEffect(() => {
    if (!playing || !M) return undefined;
    if (f >= M - 1) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setFrame(x => Math.min(M - 1, x + 1)), step);
    return () => clearTimeout(t);
  }, [playing, f, step, M, setFrame]);
  // um ano novo recomeça; a corrida só começa sozinha uma vez, quando aparece na tela
  useEffect(() => { if (!started.current) return; setFrame(0); setPlaying(!reduced); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = Boolean(race);
  useEffect(() => {
    if (!ready) return undefined;
    if (reduced) { setFrame(M - 1); started.current = true; return undefined; }
    const el = stageRef.current; if (!el) return undefined;
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting && !started.current) { started.current = true; setFrame(0); setPlaying(true); io.disconnect(); } }, { threshold: .4 });
    io.observe(el); return () => io.disconnect();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => { started.current = true; if (playing) setPlaying(false); else { if (f >= M - 1) setFrame(0); setPlaying(true); } };
  const jump = i => { started.current = true; setPlaying(false); setFrame(i); };
  if (anchorRef) anchorRef.current = { jump, el: stageRef };
  const dur = reduced ? 0 : playing ? Math.round(Math.min(step * .92, 800)) : scrub ? 120 : 420;
  const rowH = narrow ? 36 : 40;
  const view = useMemo(() => {
    if (!ranks) return null;
    const set = new Set(); ranks.forEach(r => r.sorted.slice(0, N).forEach(([k]) => set.add(k)));
    const hasFocus = focusKey && race.series.some(s => s.key === focusKey);
    if (hasFocus) set.add(focusKey);
    return { keys: [...set].sort(), extra: Boolean(hasFocus && ranks.some(r => r.rk.get(focusKey) >= N)) };
  }, [ranks, race, N, focusKey]);
  const frameData = useMemo(() => {
    if (!ranks || !view) return null;
    const r = ranks[f], top = r.sorted[0], series = new Map(race.series.map(s => [s.key, s]));
    let total = 0; r.sorted.forEach(([, v]) => { total += v; });
    const items = view.keys.map(k => {
      const rank = r.rk.get(k), value = r.val.get(k), isFocus = k === focusKey, s = series.get(k);
      const hidden = rank >= N && !(isFocus && value > 0);
      return { key: k, label: label(k), value, rank: rank + 1, focus: isFocus, hidden, slot: rank < N ? rank : N + .3, extra: `${fmt(s.raw[f])} só em ${monthLabel(race.months[f])}` };
    });
    return { items, max: top && top[1] > 0 ? top[1] : 1, top, total };
  }, [ranks, view, race, f, N, focusKey, label]);
  if (!race || !frameData) return <div className="nxa-skel" aria-hidden>{m.loading ? 'Lendo o histórico…' : 'Nenhum emplacamento neste ano e recorte. Ajuste os filtros ou escolha outro ano.'}</div>;
  const evNow = m.events.filter(e => e.f === f);
  const caption = evNow.length ? <>Em {monthLabel(race.months[f])}, <b>{label(evNow[0].a)}</b> ultrapassou <b>{label(evNow[0].b)}</b>{evNow.length > 1 ? ` e mais ${evNow.length - 1} ${evNow.length > 2 ? 'ultrapassagens' : 'ultrapassagem'}` : ''}.</>
    : <>Acumulado até {monthLabel(race.months[f])}: <b>{label(frameData.top[0])}</b> lidera com {fmt(frameData.top[1])}.</>;
  const height = (N + (view?.extra ? 1.3 : 0)) * rowH;
  return (
    <div ref={stageRef}>
      <div className="nxa-opts">
        <label className="nxa-sel">Ano
          <select value={year ?? ''} onChange={e => { started.current = true; setYear(+e.target.value); }} disabled={!m.years.length}>
            {[...m.years].reverse().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="nxa-sel">Barras
          <select value={topN} onChange={e => setTopN(+e.target.value)}>{[5, 10, 15, 20].map(n => <option key={n} value={n}>Top {n}</option>)}</select>
        </label>
      </div>
      <div className="nxa-head">
        <p className="nxa-caption" key={f}>{caption}</p>
        <div className="nxa-total"><span>Total do recorte, acumulado</span><strong>{fmt(frameData.total)}</strong></div>
      </div>
      <Race items={frameData.items} max={frameData.max} rowH={rowH} height={height} dur={dur} month={monthLabel(race.months[f])} tip={tip} total={frameData.total} />
      <div className="nxa-transport">
        <button type="button" className="nxa-play" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
          {playing ? <Icon d="M3 2h4v12H3zM9 2h4v12H9z" /> : <Icon d="M3 1.5v13l11-6.5z" />}<span>{playing ? 'Pausar' : f >= M - 1 ? 'Rever' : 'Reproduzir'}</span>
        </button>
        <button type="button" className="nxa-ghost" onClick={() => { started.current = true; setFrame(0); setPlaying(!reduced); }} aria-label="Reiniciar"><Icon d="M8 2a6 6 0 1 0 5.7 4.2l-1.9.6A4 4 0 1 1 8 4v2.5l4-3.2L8 .2z" /><span>Reiniciar</span></button>
        <label className="nxa-sel">Velocidade
          <select value={speed} onChange={e => setSpeed(e.target.value)}>{SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <div className="nxa-scrub">
          <input type="range" min={0} max={Math.max(0, M - 1)} step={1} value={f} aria-label="Mês" aria-valuetext={monthLabel(race.months[f])}
            onPointerDown={() => setScrub(true)} onPointerUp={() => setScrub(false)} onBlur={() => setScrub(false)}
            onChange={e => jump(+e.target.value)} style={{ '--p': M > 1 ? f / (M - 1) * 100 + '%' : '0%' }} />
          <div className="nxa-ticks" aria-hidden>{race.months.map((mo, i) => <span key={mo} className={i === f ? 'on' : ''}>{MONTHS[+mo.slice(5, 7) - 1]}</span>)}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- ultrapassagens ---------- */
function Overtakes({ m, topN, setTopN, setYear, onJump, hint }) {
  const [all, setAll] = useState(false);
  const { events, N, year, label } = m;
  const shown = all ? events : events.slice(0, 10);
  const actions = (
    <div className="nxa-acts">
      <label className="nxa-sel">Ano<select value={year ?? ''} onChange={e => setYear(+e.target.value)} disabled={!m.years.length}>{[...m.years].reverse().map(y => <option key={y} value={y}>{y}</option>)}</select></label>
      <label className="nxa-sel">Top<select value={topN} onChange={e => setTopN(+e.target.value)}>{[5, 10, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    </div>
  );
  if (!m.race) return <Block title="Quem passou quem" actions={actions}><p className="nxa-skel">{m.loading ? 'Lendo o histórico…' : 'Sem emplacamentos neste recorte.'}</p></Block>;
  return (
    <Block title="Ultrapassagens" sub={events.length ? <>O top {N} troca de ordem {events.length} {events.length === 1 ? 'vez' : 'vezes'} em {year}</> : <>O top {N} não troca de ordem em {year}</>}
      caption={events.length ? hint : 'No acumulado, quem sai na frente tende a ficar na frente.'} actions={actions}>
      {events.length > 0 ? (
        <>
          <ul className="nxa-events">
            {shown.map((e, i) => (
              <li key={i}><button type="button" onClick={() => onJump(e.f)}>
                <span className="mo">{mname(m, e.f)}</span>
                <span className="tx"><b>{label(e.a)}</b> ultrapassou <b>{label(e.b)}</b></span>
                <span className="rk">{e.rank}º lugar</span>
              </button></li>
            ))}
          </ul>
          {events.length > 10 && <button type="button" className="nxa-link" onClick={() => setAll(v => !v)}>{all ? 'Mostrar menos' : `Mostrar as ${events.length}`}</button>}
        </>
      ) : <p className="nxa-skel">Nenhuma ultrapassagem entre as {N} primeiras posições.</p>}
      <p className="nx-note">Conta quando uma barra passa à frente de outra e termina no top {N}, sempre pelo acumulado desde janeiro. Histórico mensal pré-calculado{m.ignored.length ? `, sem aplicar ${m.ignored.join(', ')}` : ''}.{m.race.complete ? '' : ' O último mês ainda está incompleto.'}</p>
    </Block>
  );
}

/* ---------- o ritmo do ano: acumulado do mercado contra os três anos anteriores ---------- */
function usePace(m) {
  const { monthly, race, year, latest, M } = m;
  return useMemo(() => {
    if (!monthly || !race) return null;
    const shades = ['#d1d1d6', '#a1a1aa', '#6e6e73'], out = [];
    for (let y = year - 3; y <= year; y++) {
      const ms = monthly.filter(r => +r.month.slice(0, 4) === y && r.month <= latest);
      if (!ms.length || ms.every(r => !(r.count > 0))) continue;
      const values = new Array(12).fill(null); let a = 0;
      ms.forEach(r => { a += r.count; values[+r.month.slice(5, 7) - 1] = a; });
      out.push({ year: y, values, main: y === year, color: y === year ? 'var(--nx-accent)' : shades[Math.max(0, 2 - (year - y - 1))] });
    }
    const cur = out.find(o => o.main), prev = out.find(o => o.year === year - 1);
    return { years: out, cur: cur?.values[M - 1], prev: prev?.values[M - 1], prevYear: year - 1 };
  }, [monthly, race, year, latest, M]);
}
function Pace({ m, pace }) {
  if (!pace || pace.years.length < 2 || pace.cur == null) return <Block title="O ritmo do ano"><p className="nxa-skel">{m.loading ? 'Lendo o histórico…' : 'Sem anos anteriores para comparar neste recorte.'}</p></Block>;
  const ch = pace.prev > 0 ? pace.cur / pace.prev - 1 : null;
  return (
    <Block title="Ritmo do ano" sub={<>{m.year} soma {fmt(pace.cur)} até {mname(m, m.M - 1)}{ch != null ? <>, <em className={'nxa-ch ' + (ch >= 0 ? 'up' : 'down')}>{signed(ch)}</em> sobre {pace.prevYear}</> : ''}</>}
      caption="Acumulado do mercado inteiro, mês a mês, contra os três anos anteriores: a linha só sobe e o que importa é a inclinação.">
      <YearLines years={pace.years} />
      <p className="nx-note">Soma desde janeiro, com os filtros do painel{m.ignored.length ? `; não aplica ${m.ignored.join(', ')}` : ''}.</p>
    </Block>
  );
}

export default function Animacoes() {
  const [tab, setTab] = useState('races'), [yearSel, setYearSel] = useState(null), [topN, setTopN] = useState(10), [ufYear, setUfYear] = useState(null), [ufTop, setUfTop] = useState(10), [frame, setFrame] = useState(0);
  const brand = useRaceModel({ entity: 'marca', enabled: true, yearSel, topN });
  const uf = useRaceModel({ entity: 'uf', enabled: tab === 'estados', yearSel: ufYear, topN: ufTop });
  const tip = useTip(), raceRef = useRef(null);
  const pace = usePace(brand);
  const legacy = tab !== 'estados';

  /* a visão do painel do Atlas atual segue a aba daqui: o menu dele fica escondido e o clique é repassado */
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!legacy) { setSynced(false); return undefined; }
    let tries = 0;
    const t = setInterval(() => {
      const btns = document.querySelectorAll('.nxl[data-legacy-tab="animations"] .animations-views button'), b = btns[LEGACY_INDEX[tab]];
      if (b) { if (b.getAttribute('aria-pressed') !== 'true') b.click(); setSynced(true); clearInterval(t); } else if (++tries > 80) { setSynced(true); clearInterval(t); }
    }, 80);
    return () => clearInterval(t);
  }, [tab, legacy]);

  /* clicar numa ultrapassagem leva a animação do Atlas atual para aquele mês, quando ele está na janela dela */
  const jumpLegacy = useCallback(i => {
    const ym = brand.race?.months[i]; if (!ym) return;
    const root = document.querySelector('.nxl[data-legacy-tab="animations"]'); if (!root) return;
    const sel = [...root.querySelectorAll('.animations-player select')].find(s => /^Ir ao/.test(s.closest('label')?.textContent ?? ''));
    const opt = sel && [...sel.options].find(o => o.textContent.includes(ym) || o.textContent.includes(ym.slice(5) + '/' + ym.slice(0, 4)));
    if (opt) { setSelect(sel, opt.value); root.querySelector('.animations-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, [brand.race]);
  const jumpNative = useCallback(i => { raceRef.current?.jump(i); raceRef.current?.el.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, []);

  const b = brand;
  const lastTop = b.ranks?.at(-1).sorted[0];
  const ch = pace?.cur != null && pace.prev > 0 ? pace.cur / pace.prev - 1 : null;
  const finding = b.error ? 'Histórico indisponível.' : !b.race ? (b.loading ? 'Lendo o histórico mensal…' : 'Sem emplacamentos neste recorte.')
    : `${b.label(lastTop[0])} lidera o acumulado de ${b.year}${b.race.months.at(-1).slice(5, 7) !== '12' ? ' até ' + mname(b, b.M - 1) : ''} com ${fmt(lastTop[1])} emplacamentos; o top ${b.N} troca de ordem ${b.events.length} ${b.events.length === 1 ? 'vez' : 'vezes'}${ch != null ? ` e o ano está ${signed(ch)} sobre ${pace.prevYear}` : ''}. Toda animação mostra o acumulado desde janeiro.`;
  const u = uf;
  const ufTitle = u.error ? 'Histórico por estado indisponível.' : !u.race ? (u.loading ? 'Calculando…' : 'Sem emplacamentos neste recorte.')
    : `${u.label(u.ranks.at(-1).sorted[0][0])} lidera ${u.year}${u.race.months.at(-1).slice(5, 7) !== '12' ? ' até ' + mname(u, u.M - 1) : ''} com ${fmt(u.ranks.at(-1).sorted[0][1])}`;

  return (
    <>
      <AreaHead title="Animações" finding={finding} tabs={TABS} tab={tab} onTab={t => { setTab(t); setFrame(0); }} />
      <div className="nx-wrap nxa-page" data-tab={tab}>
        <div className="nx-grid">
          {legacy && (
            <div className={'nx-c12 nxa-legacy' + (synced ? '' : ' nxa-wait')}>
              <LegacyTab tab="animations" />
            </div>
          )}
          {tab === 'races' && (
            <>
              <div className="nx-c7"><Overtakes m={brand} topN={topN} setTopN={setTopN} setYear={setYearSel} onJump={jumpLegacy} hint="Cada linha é uma ultrapassagem no acumulado. Clique para levar a animação acima ao mês dela (quando estiver na janela)." /></div>
              <div className="nx-c5"><Pace m={brand} pace={pace} /></div>
            </>
          )}
          {tab === 'estados' && (
            <>
              <div className="nx-c12">
                <Block title="Corrida de estados" sub={ufTitle} caption="Cada barra soma os emplacamentos do estado desde janeiro; a ordem muda conforme as somas crescem, mês após mês. O Atlas atual só corre estados pelo volume da Mitsubishi.">
                  <RaceCard m={uf} topN={ufTop} setTopN={setUfTop} setYear={setUfYear} frame={frame} setFrame={setFrame} tip={tip} anchorRef={raceRef} />
                  <p className="nx-note">Histórico mensal por estado, com os filtros de marca, segmento e propulsão{u.ignored.length ? `, exceto ${u.ignored.join(', ')}` : ''}.{u.race && !u.race.complete ? ' O último mês ainda está incompleto.' : ''}{u.focusKey ? ` Em destaque: ${u.label(u.focusKey)}.` : ''}</p>
                </Block>
              </div>
              <div className="nx-c12"><Overtakes m={uf} topN={ufTop} setTopN={setUfTop} setYear={setUfYear} onJump={jumpNative} hint="Cada linha é uma ultrapassagem entre estados. Clique para ver a corrida naquele mês." /></div>
            </>
          )}
        </div>
      </div>
      {tip.node}
    </>
  );
}
