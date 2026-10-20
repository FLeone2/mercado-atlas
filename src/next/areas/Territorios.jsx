import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { useNext } from '../ctx.js';
import { BarList, useTip } from '../charts.jsx';
import { UF_NAMES, fmt, pct, rangeText, signed } from '../format.js';
import { Chapter } from '../ui.jsx';
import { DotMap, REGIOES, UfMap, dec, regionOf, ufBrandTable, usePopulation } from './territorios-charts.jsx';
import './territorios.css';

const LEADER_COLORS = ['#2f6fed', '#0f9d8a', '#e8a317', '#8e5cf0', '#d9558f', '#5b6770'];
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const bName = n => engine.insightName(n);
const Seg = ({ value, options, onChange, label }) => (
  <div className="nxt-seg" role="group" aria-label={label}>
    {options.map(([k, text]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{text}</button>)}
  </div>
);

export default function Territorios() {
  const { filters, setFilter, model, geoless, points, focus, cityName, base, hist } = useNext();
  const geo = geoless ?? model;
  const pop = usePopulation(base);
  const ufTip = useTip(), ufTip2 = useTip(), dotTip = useTip();
  const [metric, setMetric] = useState('vol'), [allUF, setAllUF] = useState(false), [more, setMore] = useState(false);
  const [hoverDot, setHoverDot] = useState(null), [leadMode, setLeadMode] = useState('leader'), [hotBrand, setHotBrand] = useState(null);
  const selected = list(filters.uf);

  /* ---------- 1. states ---------- */
  const total = geo?.total ?? 0;
  const canRate = pop.uf.size > 0 && geo?.complete !== false;
  const useRate = metric === 'pc' && canRate;
  const ufRows = useMemo(() => (geo?.groups?.uf ?? []).filter(r => UF_NAMES[r.name]).map(r => {
    const p = pop.uf.get(r.name);
    return { ...r, pop: p ?? null, per1000: p > 0 ? r.count / p * 1000 : null };
  }), [geo, pop]);
  const ranked = useMemo(() => [...ufRows].filter(r => useRate ? r.per1000 != null : r.count > 0).sort((a, b) => useRate ? b.per1000 - a.per1000 : b.count - a.count), [ufRows, useRate]);
  const ufMap = useMemo(() => new Map(ufRows.map(r => [r.name, r])), [ufRows]);
  const val = r => (useRate ? r.per1000 : r.count);
  const vmax = ranked.length ? val(ranked[0]) : 1, vmin = ranked.length ? val(ranked[ranked.length - 1]) : 0;
  const paintUF = uf => {
    const r = ufMap.get(uf), v = r ? val(r) : null;
    if (v == null || !(v > 0)) return { opacity: .05, tip: <><strong>{UF_NAMES[uf]}</strong><span>Sem dados no recorte</span></> };
    const k = useRate ? (v - vmin) / Math.max(1e-9, vmax - vmin) : Math.sqrt(v / vmax);
    return { opacity: .14 + k * .86, tip: <><strong>{UF_NAMES[uf]}</strong><span>{fmt(r.count)} emplacamentos · {pct(r.count / total)}</span>{r.per1000 != null && <span>{dec(r.per1000, 1)} por mil habitantes</span>}{Number.isFinite(r.changeRate) && <span>{signed(r.changeRate)} sobre o período anterior</span>}</> };
  };
  const pickUF = u => setFilter('uf', selected.length === 1 && selected[0] === u ? 'all' : [u]);
  const top = ranked[0], bottom = ranked[ranked.length - 1];
  const t1 = useRate ? (top && bottom && top !== bottom ? <>{UF_NAMES[top.name]} emplaca <em>{dec(top.per1000, 1)}</em> veículos por mil habitantes, {dec(top.per1000 / bottom.per1000, 1)} vezes a taxa de {UF_NAMES[bottom.name]}.</> : null)
    : (top ? <>{UF_NAMES[top.name]} concentra <em>{pct(top.count / total, top.count / total < .1 ? 1 : 0)}</em> dos emplacamentos{ranked[1] ? <>; com {UF_NAMES[ranked[1].name]}, chega a {pct((top.count + ranked[1].count) / total, 0)}</> : ''}.</> : null);
  const shown = allUF ? ranked : ranked.slice(0, 8);
  const listRows = shown.map((r, i) => ({ key: r.name, name: r.name, label: UF_NAMES[r.name], value: val(r), rank: i + 1, valueText: useRate ? dec(r.per1000, 1) : fmt(r.count), delta: r.changeRate, deltaText: Number.isFinite(r.changeRate) ? signed(r.changeRate) : '', title: pct(r.count / total) + ' do total' }));

  /* ---------- 2. regions ---------- */
  const regions = useMemo(() => {
    if (!ufRows.length) return [];
    const totalPop = [...pop.uf.values()].reduce((s, v) => s + v, 0);
    const rows = Object.keys(REGIOES).map(name => {
      const us = ufRows.filter(r => regionOf(r.name) === name), count = us.reduce((s, r) => s + r.count, 0), prev = us.reduce((s, r) => s + (Number.isFinite(r.previous) ? r.previous : 0), 0);
      const p = REGIOES[name].reduce((s, u) => s + (pop.uf.get(u) ?? 0), 0);
      return { name, count, share: total > 0 ? count / total : 0, popShare: totalPop > 0 ? p / totalPop : null, change: prev > 0 ? count / prev - 1 : null, per1000: p > 0 ? count / p * 1000 : null };
    });
    return rows.sort((a, b) => b.count - a.count);
  }, [ufRows, pop, total]);
  const regTop = regions[0], regGrow = [...regions].filter(r => r.change != null).sort((a, b) => b.change - a.change)[0];
  const regPick = name => { const on = list(filters.regiao); setFilter('regiao', on.length === 1 && on[0] === name ? 'all' : [name]); };

  /* ---------- 3. municipalities ---------- */
  const pointIdx = useMemo(() => { const m = new Map(); for (const [code, name, uf, x, y] of points?.rows ?? []) m.set(engine.geoKey(name, uf) + '|' + uf, { code, uf, x, y }); return m; }, [points]);
  const cities = useMemo(() => {
    const out = [];
    for (const r of model?.groups?.municipio ?? []) {
      if (!(r.count > 0)) continue;
      const i = r.name.lastIndexOf(' · '); if (i < 0) continue;
      const uf = r.name.slice(i + 3).trim(), pt = pointIdx.get(engine.geoKey(r.name.slice(0, i), uf) + '|' + uf), p = pt ? pop.city.get(pt.code) : null;
      out.push({ raw: r.name, uf, v: r.count, change: r.changeRate, code: pt?.code ?? r.name, x: pt?.x, y: pt?.y, located: Boolean(pt), per1000: p > 0 ? r.count / p * 1000 : null });
    }
    return out.sort((a, b) => b.v - a.v);
  }, [model, pointIdx, pop]);
  const cityTotal = model?.total ?? cities.reduce((s, c) => s + c.v, 0);
  const dots = useMemo(() => cities.filter(c => c.located), [cities]);
  const kTop = selected.length ? 5 : 10;
  const topShare = cities.length ? cities.slice(0, kTop).reduce((s, c) => s + c.v, 0) / cityTotal : 0;
  const half = useMemo(() => { let a = 0; for (let i = 0; i < cities.length; i++) { a += cities[i].v; if (a >= cityTotal / 2) return i + 1; } return 0; }, [cities, cityTotal]);
  const scopeName = selected.length === 1 ? 'de ' + (UF_NAMES[selected[0]] ?? selected[0]) : selected.length ? 'dos estados escolhidos' : 'do país';
  const ufChips = useMemo(() => ufRows.filter(r => r.count > 0).sort((a, b) => b.count - a.count).map(r => r.name), [ufRows]);
  const tableRows = cities.slice(0, more ? 25 : 10);

  /* ---------- 4. who leads each state ---------- */
  const ufHist = engine.useHistory({ uf: ['SP'] }, base, true);
  const table = useMemo(() => ufBrandTable(ufHist.data, filters, model?.range), [ufHist.data, filters, model?.range]);
  const ignoredLead = useMemo(() => engine.historyPlan({ ...filters, uf: ['SP'], regiao: 'all', municipio: 'all', marca: 'all', modelo: 'all', grupo_modelo: 'all' }).ignoredLabels, [filters]);
  const leaders = useMemo(() => {
    if (!table?.size) return null;
    const led = new Map();
    for (const e of table.values()) { const l = e.list[0]; if (!l) continue; const x = led.get(l.b) ?? { b: l.b, ufs: [], vol: 0 }; x.ufs.push(e.uf); x.vol += e.total; led.set(l.b, x); }
    const rows = [...led.values()].sort((a, b) => b.ufs.length - a.ufs.length || b.vol - a.vol);
    rows.forEach((x, i) => { x.color = x.b === focus ? 'var(--nx-accent)' : i < LEADER_COLORS.length - 1 ? LEADER_COLORS[i] : LEADER_COLORS.at(-1); });
    return rows;
  }, [table, focus]);
  const leaderOf = useMemo(() => { const m = new Map(); leaders?.forEach(l => l.ufs.forEach(u => m.set(u, l))); return m; }, [leaders]);
  const focusRows = useMemo(() => {
    if (!table || !focus) return [];
    return [...table.values()].map(e => { const i = e.list.findIndex(x => x.b === focus), n = i >= 0 ? e.list[i].n : 0; return { uf: e.uf, share: n / e.total, n, rank: i >= 0 ? i + 1 : null, of: e.list.length, total: e.total }; }).sort((a, b) => b.share - a.share);
  }, [table, focus]);
  const fMax = focusRows[0]?.share ?? 0;
  const focusMap = useMemo(() => new Map(focusRows.map(r => [r.uf, r])), [focusRows]);
  const paintLead = uf => {
    const e = table?.get(uf);
    if (!e) return { opacity: .05, tip: <><strong>{UF_NAMES[uf]}</strong><span>Sem dados</span></> };
    if (leadMode === 'focus') {
      const f = focusMap.get(uf);
      return { opacity: .1 + (fMax > 0 ? Math.sqrt(f.share / fMax) : 0) * .9, tip: <><strong>{UF_NAMES[uf]}</strong><span>{bName(focus)}: {pct(f.share, 1)} do estado{f.rank ? ' · ' + f.rank + 'º lugar' : ' · sem emplacamentos'}</span><span>Líder: {bName(e.list[0].b)} ({pct(e.list[0].n / e.total, 1)})</span></> };
    }
    const l = leaderOf.get(uf), hot = hotBrand && hotBrand !== l?.b;
    return { fill: l?.color, opacity: hot ? .16 : .92, tip: <><strong>{UF_NAMES[uf]}</strong>{e.list.slice(0, 3).map((x, i) => <span key={x.b}>{i + 1}º {bName(x.b)} · {pct(x.n / e.total, 1)}</span>)}</> };
  };
  const leadTitle = leadMode === 'leader'
    ? (leaders?.length ? <>{bName(leaders[0].b)} lidera em <em>{leaders[0].ufs.length}</em> dos {table.size} estados{leaders[1] ? <>; {bName(leaders[1].b)} em {leaders[1].ufs.length}</> : ''}.</> : null)
    : (focusRows.length && focus ? <>{bName(focus)} tem a maior fatia em {UF_NAMES[focusRows[0].uf]}: <em>{pct(focusRows[0].share, 1)}</em> dos emplacamentos.</> : null);
  const leadList = leadMode === 'leader'
    ? (leaders ?? []).slice(0, 8).map((l, i) => ({ key: l.b, name: l.b, label: bName(l.b), value: l.ufs.length, rank: i + 1, valueText: String(l.ufs.length), deltaText: '', title: l.ufs.map(u => UF_NAMES[u]).join(', ') }))
    : focusRows.slice(0, 9).map((r, i) => ({ key: r.uf, name: r.uf, label: UF_NAMES[r.uf], value: r.share, rank: i + 1, valueText: pct(r.share, 1), deltaText: r.rank ? r.rank + 'º lugar' : '—', title: fmt(r.n) + ' emplacamentos' }));

  const loading = !model;
  return (
    <>
      {/* 1 — o mapa */}
      <Chapter id="mapa" kicker="Onde o mercado acontece" title={loading ? 'Carregando…' : ranked.length ? t1 : 'Sem emplacamentos para este recorte.'}
        lede={model ? `${rangeText(model.range)}. Cada estado é pintado pela ${useRate ? 'taxa de emplacamentos por mil habitantes' : 'quantidade de emplacamentos'}; clique para filtrar o painel.` : undefined}>
        <div className="nx-card">
          <div className="nxt-bar-top">
            <Seg label="Medida" value={useRate ? 'pc' : 'vol'} onChange={setMetric} options={[['vol', 'Volume'], ['pc', 'Por mil habitantes']]} />
            {metric === 'pc' && !canRate && <span className="nxt-warn">{pop.error ? 'População indisponível.' : geo?.complete === false ? 'Taxa indisponível: o período está incompleto.' : 'Carregando população…'}</span>}
          </div>
          {ranked.length > 0 ? (
            <div className="nxt-split">
              <div className="nxt-mapbox">
                <UfMap paint={paintUF} selected={selected} onPick={pickUF} tip={ufTip} label="Mapa dos estados" />
                <div className="nxt-scale" aria-hidden><span>{useRate ? dec(vmin, 1) : 'menos'}</span><i /><span>{useRate ? dec(vmax, 1) : 'mais'}</span></div>
              </div>
              <div>
                <BarList rows={listRows} max={vmax} onPick={r => pickUF(r.name)} focus={selected[0]} />
                <button type="button" className="nxt-link" onClick={() => setAllUF(v => !v)}>{allUF ? 'Mostrar só os 8 primeiros' : `Mostrar os ${ranked.length} estados`}</button>
              </div>
            </div>
          ) : <p className="nxt-empty">Nenhum estado tem emplacamentos neste recorte. Ajuste os filtros para voltar a ver o mapa.</p>}
          <p className="nx-note">{useRate ? `Emplacamentos do período dividido pela população estimada de ${pop.year ?? 2026} (IBGE/SIDRA 6579), por mil habitantes. Não é uma taxa anual quando o período tem menos de 12 meses. Frotas e locadoras emplacam na sede, o que eleva a taxa de alguns estados.` : 'O mapa ignora o filtro de estado, para mostrar todos de uma vez.'}</p>
        </div>
        {ufTip.node}
      </Chapter>

      {/* 2 — regiões */}
      {regions.length > 0 && regTop && regTop.count > 0 && (
        <Chapter id="regioes" kicker="Cinco regiões" title={<>{regTop.name} reúne <em>{pct(regTop.share, 0)}</em> dos emplacamentos{regTop.popShare != null ? <> e {pct(regTop.popShare, 0)} dos habitantes</> : ''}.</>}
          lede={regGrow ? `${regGrow.name} é a região que mais cresce sobre o período anterior (${signed(regGrow.change)}). Clique numa região para filtrar.` : 'Clique numa região para filtrar o painel.'}>
          <div className="nx-card">
            <div className="nxt-stack" role="img" aria-label="Participação de cada região nos emplacamentos">
              {regions.map(r => <span key={r.name} style={{ flexGrow: r.count }} title={r.name + ' ' + pct(r.share)}><b>{r.share > .07 ? r.name : ''}</b></span>)}
            </div>
            <div className="nxt-regions">
              {regions.map((r, i) => (
                <button key={r.name} type="button" className={'nxt-reg' + (list(filters.regiao).includes(r.name) ? ' on' : '')} onClick={() => regPick(r.name)}>
                  <span className="nxt-reg-name">{r.name}</span>
                  <span className="nxt-reg-bars">
                    <span className="nxt-reg-row"><span className="nxt-reg-fill" style={{ width: `calc((100% - 64px) * ${Math.max(.005, r.share / (regTop.share || 1))})`, animationDelay: i * 60 + 'ms' }} /><em>{pct(r.share, 1)}</em></span>
                    {r.popShare != null && <span className="nxt-reg-row pop"><span className="nxt-reg-fill" style={{ width: `calc((100% - 64px) * ${Math.max(.005, r.popShare / (regTop.share || 1))})`, animationDelay: i * 60 + 80 + 'ms' }} /><em>{pct(r.popShare, 1)}</em></span>}
                  </span>
                  <span className="nxt-reg-n">{fmt(r.count)}{r.per1000 != null && <small>{dec(r.per1000, 1)} por mil hab.</small>}</span>
                  <span className={'nxt-reg-d ' + (r.change > 0 ? 'up' : r.change < 0 ? 'down' : '')}>{r.change != null ? signed(r.change) : '—'}</span>
                </button>
              ))}
            </div>
            <p className="nx-note">Barra escura: parcela dos emplacamentos do país; barra cinza: parcela dos habitantes ({pop.year ?? 2026}). A variação compara com o período anterior equivalente.</p>
          </div>
        </Chapter>
      )}

      {/* 3 — municípios */}
      <Chapter id="municipios" kicker="Dentro do estado" wide
        title={cities.length ? <>{cityName(cities[0].raw)} responde por <em>{pct(cities[0].v / cityTotal, cities[0].v / cityTotal < .1 ? 1 : 0)}</em> dos emplacamentos {scopeName}; {kTop === 5 ? 'as cinco' : 'as dez'} maiores cidades, {pct(topShare, 0)}.</> : 'Sem municípios neste recorte.'}
        lede={cities.length ? `${half} ${half === 1 ? 'município reúne' : 'municípios reúnem'} metade do mercado${selected.length ? '' : ' do país'}. Escolha um estado para aproximar o mapa.` : 'Ajuste os filtros para ver os municípios.'}>
        <div className="nx-card">
          <div className="nxt-chips" role="group" aria-label="Estado">
            <button type="button" className="nxt-chip" aria-pressed={selected.length === 0} onClick={() => setFilter('uf', 'all')}>Brasil</button>
            {ufChips.map(u => <button key={u} type="button" className="nxt-chip" aria-pressed={selected.includes(u)} title={UF_NAMES[u]} onClick={() => setFilter('uf', [u])}>{u}</button>)}
          </div>
          {cities.length > 0 ? (
            <div className="nxt-drill">
              <div className="nxt-dotbox"><DotMap dots={dots} ufs={selected} points={points} hover={hoverDot} setHover={setHoverDot} tip={dotTip} nameOf={cityName} onPick={d => { const u = d.uf; if (!selected.length) setFilter('uf', [u]); }} /></div>
              <div className="nxt-tablebox">
                <table className="nxt-table">
                  <thead><tr><th>#</th><th>Município</th><th>Emplac.</th><th>Por mil hab.</th><th>Var.</th></tr></thead>
                  <tbody>
                    {tableRows.map((c, i) => (
                      <tr key={c.raw} className={hoverDot === c.code ? 'hot' : ''} onPointerEnter={() => setHoverDot(c.code)} onPointerLeave={() => setHoverDot(null)}>
                        <td className="rk">{i + 1}</td><td className="nm">{cityName(c.raw)}{!selected.length && <small> {c.uf}</small>}</td><td className="n">{fmt(c.v)}</td>
                        <td className="n soft">{c.per1000 != null ? dec(c.per1000, 1) : '—'}</td>
                        <td className={'n ' + (c.change > 0 ? 'up' : c.change < 0 ? 'down' : '')}>{Number.isFinite(c.change) ? signed(c.change, Math.abs(c.change) < .1 ? 1 : 0) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cities.length > 10 && <button type="button" className="nxt-link" onClick={() => setMore(v => !v)}>{more ? 'Mostrar menos' : 'Mostrar 25 maiores'}</button>}
              </div>
            </div>
          ) : <p className="nxt-empty">Nenhum município com emplacamentos neste recorte.</p>}
          <p className="nx-note">Cada ponto é um município e a área é proporcional aos emplacamentos; a posição é aproximada (centro da malha do IBGE). Por mil habitantes usa a população estimada de {pop.year ?? 2026}; municípios com limite territorial em revisão ficam sem taxa. Emplacamentos de frotas na sede podem inflar capitais e polos.</p>
        </div>
        {dotTip.node}
      </Chapter>

      {/* 4 — quem lidera */}
      <Chapter id="lideres" kicker="Marcas por estado" title={ufHist.error ? 'Histórico por estado indisponível.' : !table ? 'Calculando…' : leadTitle ?? 'Sem dados por estado neste recorte.'}
        lede={table ? (leadMode === 'leader' ? `Cada estado leva a cor da marca com mais emplacamentos em ${rangeText(model.range)}. Passe o mouse numa marca para ver onde ela lidera.` : `Quanto de cada estado é ${bName(focus)}: quanto mais escuro, maior a fatia. A marca em foco é a do filtro, ou Mitsubishi.`) : undefined}>
        <div className="nx-card">
          <div className="nxt-bar-top"><Seg label="Leitura" value={leadMode} onChange={setLeadMode} options={[['leader', 'Quem lidera'], ['focus', focus ? `Força da ${bName(focus)}` : 'Marca em foco']]} /></div>
          {table?.size ? (
            <div className="nxt-split">
              <div className="nxt-mapbox"><UfMap paint={paintLead} selected={selected} onPick={pickUF} tip={ufTip2} label="Mapa da marca líder por estado" /></div>
              <div onPointerLeave={() => setHotBrand(null)}>
                <h3 className="nx-h3">{leadMode === 'leader' ? 'Estados em que cada marca lidera' : `Fatia da ${bName(focus)} em cada estado`}</h3>
                <BarList rows={leadList} onPick={r => leadMode === 'focus' ? pickUF(r.name) : setHotBrand(h => (h === r.name ? null : r.name))} focus={leadMode === 'leader' ? hotBrand : selected[0]} />
                {leadMode === 'leader' && <div className="nx-legend">{leaders.slice(0, 6).map(l => <span key={l.b}><i style={{ background: l.color }} />{bName(l.b)}</span>)}{leaders.length > 6 && <span>e outras {leaders.length - 6}</span>}</div>}
              </div>
            </div>
          ) : table ? <p className="nxt-empty">Nenhum emplacamento por estado neste recorte.</p> : <p className="nxt-empty">Lendo o histórico por estado…</p>}
          <p className="nx-note">Soma do período selecionado no histórico mensal por estado, todas as marcas e todos os estados.{ignoredLead.length ? ` Esta leitura não aplica: ${ignoredLead.join(', ')}.` : ''}</p>
        </div>
        {ufTip2.node}
      </Chapter>
    </>
  );
}
