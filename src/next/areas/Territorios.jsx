import { useMemo, useState, useEffect } from 'react';
import { engine } from 'virtual:market';
import { useNext } from '../ctx.js';
import { BarList } from '../charts.jsx';
import LegacyTab from '../LegacyTab.jsx';
import { UF_NAMES, fmt, pct, rangeText, signed } from '../format.js';
import { AreaHead, Block } from '../ui.jsx';
import { REGIOES, dec, regionOf, usePopulation } from './territorios-charts.jsx';
import './territorios.css';
import './territorios-skin.css';

const TABS = [['mapa', 'Mapa'], ['marcas', 'Marcas por estado'], ['habitante', 'Por habitante e regiões'], ['3d', 'Brasil em 3D']];
const list = v => (v == null || v === 'all' ? [] : (Array.isArray(v) ? v : [v]).filter(x => x !== 'all'));
const setSelect = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const Seg = ({ value, options, onChange, label }) => (
  <div className="nxt-seg" role="group" aria-label={label}>
    {options.map(([k, text]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{text}</button>)}
  </div>
);

export default function Territorios() {
  const { filters, setFilter, model, geoless, points, cityName, base } = useNext();
  const [tab, setTab] = useState('mapa'), [metric, setMetric] = useState('vol'), [allUF, setAllUF] = useState(false), [more, setMore] = useState(false);
  const geo = geoless ?? model;
  const pop = usePopulation(base);
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
  const val = r => (useRate ? r.per1000 : r.count);
  const vmax = ranked.length ? val(ranked[0]) : 1;
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
  const kTop = selected.length ? 5 : 10;
  const topShare = cities.length ? cities.slice(0, kTop).reduce((s, c) => s + c.v, 0) / cityTotal : 0;
  const half = useMemo(() => { let a = 0; for (let i = 0; i < cities.length; i++) { a += cities[i].v; if (a >= cityTotal / 2) return i + 1; } return 0; }, [cities, cityTotal]);
  const scopeName = selected.length === 1 ? 'de ' + (UF_NAMES[selected[0]] ?? selected[0]) : selected.length ? 'dos estados escolhidos' : 'do país';
  const ufChips = useMemo(() => ufRows.filter(r => r.count > 0).sort((a, b) => b.count - a.count).map(r => r.name), [ufRows]);
  const tableRows = cities.slice(0, more ? 25 : 10);

  /* o mapa do Atlas atual (LeaderMap) escolhe o estado sozinho; aqui ele acompanha o estado do filtro global */
  const oneUF = selected.length === 1 ? selected[0] : null;
  useEffect(() => {
    if (!oneUF || tab === '3d') return undefined;
    let tries = 0;
    const t = setInterval(() => {
      const sel = document.querySelector('.nxl[data-legacy-tab="geography"] #leader-map .lm-controls select');
      if (sel && sel.options.length) { clearInterval(t); if (sel.value !== oneUF && [...sel.options].some(o => o.value === oneUF)) setSelect(sel, oneUF); }
      else if (++tries > 100) clearInterval(t);
    }, 150);
    return () => clearInterval(t);
  }, [oneUF, tab]);

  const finding = !model ? 'Carregando…' : ranked.length && total > 0
    ? (() => { const a = ufRows.filter(r => r.count > 0).sort((x, y) => y.count - x.count); const s = a[0]; const sh = s.count / total;
        return `${UF_NAMES[s.name]} concentra ${pct(sh, sh < .1 ? 1 : 0)} dos emplacamentos${a[1] ? `; com ${UF_NAMES[a[1].name]}, chega a ${pct((s.count + a[1].count) / total, 0)}` : ''}${regTop ? `. ${regTop.name} reúne ${pct(regTop.share, 0)} do mercado${regGrow ? ` e ${regGrow.name} é a região que mais cresce (${signed(regGrow.change)})` : ''}` : ''}. ${rangeText(model.range)}.`; })()
    : 'Sem emplacamentos para este recorte.';

  const estados = (
    <Block title={useRate ? (top && bottom && top !== bottom ? `${UF_NAMES[top.name]} emplaca ${dec(top.per1000, 1)} por mil habitantes, ${dec(top.per1000 / bottom.per1000, 1)}x a taxa de ${UF_NAMES[bottom.name]}` : 'Emplacamentos por mil habitantes') : (top ? `${UF_NAMES[top.name]} concentra ${pct(top.count / total, top.count / total < .1 ? 1 : 0)} dos emplacamentos` : 'Estados')}
      caption="Ranking dos estados; clique para filtrar o painel inteiro."
      actions={<Seg label="Medida" value={useRate ? 'pc' : 'vol'} onChange={setMetric} options={[['vol', 'Volume'], ['pc', 'Por mil hab.']]} />}>
      {metric === 'pc' && !canRate && <p className="nxt-warn">{pop.error ? 'População indisponível.' : geo?.complete === false ? 'Taxa indisponível: o período está incompleto.' : 'Carregando população…'}</p>}
      {ranked.length > 0 ? <>
        <BarList rows={listRows} max={vmax} onPick={r => pickUF(r.name)} focus={selected[0]} />
        <button type="button" className="nxt-link" onClick={() => setAllUF(v => !v)}>{allUF ? 'Mostrar só os 8 primeiros' : `Mostrar os ${ranked.length} estados`}</button>
      </> : <p className="nxt-empty">Nenhum estado tem emplacamentos neste recorte.</p>}
      <p className="nx-note">{useRate ? `Emplacamentos do período por mil habitantes (população estimada ${pop.year ?? 2026}, IBGE/SIDRA 6579). Não é taxa anual com menos de 12 meses; frotas e locadoras emplacam na sede.` : 'O ranking ignora o filtro de estado, para mostrar todos de uma vez.'}</p>
    </Block>
  );

  const municipios = (
    <Block title={cities.length ? `${cityName(cities[0].raw)} responde por ${pct(cities[0].v / cityTotal, cities[0].v / cityTotal < .1 ? 1 : 0)} dos emplacamentos ${scopeName}; ${kTop === 5 ? 'as cinco' : 'as dez'} maiores cidades, ${pct(topShare, 0)}` : 'Sem municípios neste recorte'}
      caption={cities.length ? `${half} ${half === 1 ? 'município reúne' : 'municípios reúnem'} metade do mercado${selected.length ? '' : ' do país'}.` : 'Ajuste os filtros para ver os municípios.'}>
      <div className="nxt-chips" role="group" aria-label="Estado">
        <button type="button" className="nxt-chip" aria-pressed={selected.length === 0} onClick={() => setFilter('uf', 'all')}>Brasil</button>
        {ufChips.map(u => <button key={u} type="button" className="nxt-chip" aria-pressed={selected.includes(u)} title={UF_NAMES[u]} onClick={() => setFilter('uf', [u])}>{u}</button>)}
      </div>
      {cities.length > 0 ? (
        <>
          <table className="nxt-table">
            <thead><tr><th>#</th><th>Município</th><th>Emplac.</th><th>Por mil hab.</th><th>Var.</th></tr></thead>
            <tbody>
              {tableRows.map((c, i) => (
                <tr key={c.raw}>
                  <td className="rk">{i + 1}</td><td className="nm">{cityName(c.raw)}{!selected.length && <small> {c.uf}</small>}</td><td className="n">{fmt(c.v)}</td>
                  <td className="n soft">{c.per1000 != null ? dec(c.per1000, 1) : '—'}</td>
                  <td className={'n ' + (c.change > 0 ? 'up' : c.change < 0 ? 'down' : '')}>{Number.isFinite(c.change) ? signed(c.change, Math.abs(c.change) < .1 ? 1 : 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cities.length > 10 && <button type="button" className="nxt-link" onClick={() => setMore(v => !v)}>{more ? 'Mostrar menos' : 'Mostrar 25 maiores'}</button>}
        </>
      ) : <p className="nxt-empty">Nenhum município com emplacamentos neste recorte.</p>}
      <p className="nx-note">Por mil habitantes usa a população estimada de {pop.year ?? 2026}; municípios com limite territorial em revisão ficam sem taxa. Frotas na sede podem inflar capitais e polos.</p>
    </Block>
  );

  const regioes = regions.length > 0 && regTop && regTop.count > 0 && (
    <Block title={`${regTop.name} reúne ${pct(regTop.share, 0)} dos emplacamentos${regTop.popShare != null ? ` e ${pct(regTop.popShare, 0)} dos habitantes` : ''}`}
      caption={regGrow ? `${regGrow.name} é a região que mais cresce sobre o período anterior (${signed(regGrow.change)}). Clique numa região para filtrar.` : 'Clique numa região para filtrar o painel.'}>
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
    </Block>
  );

  return (
    <>
      <AreaHead title="Territórios" finding={finding} tabs={TABS} tab={tab} onTab={setTab} />
      <div className="nx-wrap nxt-page">
        {tab === '3d' ? (
          <div className="nxt-3d"><LegacyTab tab="geography3d" /></div>
        ) : (
          <div className="nx-grid nxt-geo" data-sub={tab}>
            <LegacyTab tab="geography" />
            {tab === 'mapa' && <><div className="nx-c6 nxt-o3">{estados}</div><div className="nx-c6 nxt-o4">{municipios}</div></>}
            {tab === 'habitante' && regioes && <div className="nx-c12 nxt-o3">{regioes}</div>}
          </div>
        )}
      </div>
    </>
  );
}
