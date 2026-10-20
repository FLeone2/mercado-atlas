import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import ufGeometry from '../market/geo/uf-geometry.json';
import { BarList, Diverging, ShareArea, YearLines, useTip } from './charts.jsx';
import { UF_NAMES, fmt, monthLabel, pct, pp, signed, MONTHS } from './format.js';
import { Chapter, CountUp, Tile } from './ui.jsx';

const name = n => engine.insightName(n);
const TECH = { ICE: ['Combustão', '#d4d4d8'], MHEV: ['Microhíbrido', '#a1a1aa'], HEV: ['Híbrido', '#71717a'], PHEV: ['Híbrido plug-in', '#3f3f46'], BEV: ['Elétrico', 'var(--nx-accent)'], FCEL: ['Célula de combustível', '#c4b5fd'] };
const ELECTRIFIED = ['MHEV', 'HEV', 'PHEV', 'BEV', 'FCEL'];

export default function Story({ model, market, geoMarket, hist, filters, setFilter, insights, focus, cityName }) {
  const ranking = market ?? model, geoModel = geoMarket ?? model;
  const brandFilter = (Array.isArray(filters.marca) ? filters.marca : []).filter(x => x !== 'all');

  /* ---------- ranking and share movement ---------- */
  const brands = useMemo(() => (ranking?.groups?.marca ?? []).filter(r => r.count > 0), [ranking]);
  const total = ranking?.total ?? 0;
  const focusIndex = brands.findIndex(b => b.name === focus);
  const rankRows = useMemo(() => {
    const rows = brands.slice(0, 10).map((b, i) => ({ key: b.name, name: b.name, label: name(b.name), value: b.count, rank: i + 1, valueText: fmt(b.count), delta: b.shareChange, deltaText: Number.isFinite(b.shareChange) ? pp(b.shareChange) : '', title: pct(b.count / total, 1) + ' do mercado' }));
    if (focusIndex >= 10) { rows.push({ key: 'gap', name: 'gap', label: '', value: 0, gap: true, valueText: '···', deltaText: '' }); const b = brands[focusIndex]; rows.push({ key: b.name, name: b.name, label: name(b.name), value: b.count, rank: focusIndex + 1, valueText: fmt(b.count), delta: b.shareChange, deltaText: Number.isFinite(b.shareChange) ? pp(b.shareChange) : '', title: pct(b.count / total, 1) + ' do mercado' }); }
    return rows;
  }, [brands, focusIndex, total]);
  const movers = useMemo(() => brands.filter(r => Number.isFinite(r.shareChange) && r.count / total >= .005), [brands, total]);
  const gains = [...movers].sort((a, b) => b.shareChange - a.shareChange).slice(0, 5).filter(r => r.shareChange > 0.0003);
  const losses = [...movers].sort((a, b) => a.shareChange - b.shareChange).slice(0, 5).filter(r => r.shareChange < -0.0003);
  const diverging = [...gains, ...losses.reverse()].map(r => ({ name: r.name, label: name(r.name), value: r.shareChange, text: pp(r.shareChange) }));

  /* ---------- time: years laid over each other ---------- */
  const monthly = useMemo(() => (hist.data ? engine.historyMonthly(hist.data, filters) : null), [hist.data, filters]);
  const latestMonth = useMemo(() => { if (!monthly) return null; const m = [...monthly].reverse().find(x => x.count > 0); return m?.month ?? null; }, [monthly]);
  const years = useMemo(() => {
    if (!monthly || !latestMonth) return null;
    const lastYear = +latestMonth.slice(0, 4), shades = ['#d1d1d6', '#a1a1aa', '#6e6e73'];
    const out = []; for (let y = lastYear - 3; y <= lastYear; y++) {
      const values = new Array(12).fill(null);
      for (const m of monthly) if (+m.month.slice(0, 4) === y && m.month <= latestMonth && m.count != null) values[+m.month.slice(5, 7) - 1] = m.count;
      out.push({ year: y, values, main: y === lastYear, color: y === lastYear ? 'var(--nx-accent)' : shades[y - (lastYear - 3)] });
    }
    return out;
  }, [monthly, latestMonth]);
  const ytd = useMemo(() => {
    if (!years) return null; const L = +latestMonth.slice(5, 7), sum = y => y.values.slice(0, L).reduce((s, v) => s + (v ?? 0), 0);
    const cur = years.at(-1), prev = years.at(-2); const a = sum(cur), b = sum(prev);
    return { year: cur.year, prevYear: prev.year, cur: a, prev: b, change: b > 0 ? a / b - 1 : null, through: MONTHS[L - 1] };
  }, [years, latestMonth]);

  /* ---------- technology mix ---------- */
  const techData = useMemo(() => {
    if (!hist.data || !hist.data.dimensions.includes('propulsao')) return null;
    const months = engine.historyMonthly(hist.data, filters, 'propulsao'), upto = months.filter(m => latestMonth && m.month <= latestMonth).slice(-60);
    if (upto.length < 6) return null;
    const names = [...new Set(upto.flatMap(m => [...m.groups.keys()]))].filter(n => TECH[n]);
    const order = Object.keys(TECH).filter(n => names.includes(n));
    const series = order.filter(n => ELECTRIFIED.includes(n)).map(n => ({ name: TECH[n][0], key: n, color: TECH[n][1], values: upto.map(m => { const t = [...m.groups.values()].reduce((s, v) => s + v, 0); return t > 0 ? (m.groups.get(n) ?? 0) / t : 0; }) }));
    const share = i => series.filter(s => ELECTRIFIED.includes(s.key)).reduce((s, x) => s + x.values[i], 0);
    const top = Math.max(...upto.map((_, i) => share(i))), axis = Math.max(.05, Math.ceil(top * 1.15 / .05) * .05);
    return { months: upto.map(m => ({ label: monthLabel(m.month), short: monthLabel(m.month) })), series, axis, now: share(upto.length - 1), before: upto.length > 12 ? share(upto.length - 13) : null };
  }, [hist.data, filters, latestMonth]);

  /* ---------- territory ---------- */
  const ufs = useMemo(() => (geoModel?.groups?.uf ?? []).filter(r => UF_NAMES[r.name]), [geoModel]);
  const ufMax = ufs[0]?.count ?? 1, ufTotal = geoModel?.total ?? 0, ufMap = useMemo(() => new Map(ufs.map(r => [r.name, r])), [ufs]);
  const selectedUF = (Array.isArray(filters.uf) ? filters.uf : []).filter(x => x !== 'all');
  const cities = useMemo(() => (model?.groups?.municipio ?? []).slice(0, 8), [model]);
  const tip = useTip();
  const pickUF = u => setFilter('uf', selectedUF.length === 1 && selectedUF[0] === u ? 'all' : [u]);
  const pickBrand = r => { if (r.name === 'gap') return; setFilter('marca', brandFilter.length === 1 && brandFilter[0] === r.name ? 'all' : [r.name]); };

  const lead = brands[0], second = brands[1];
  const ignored = hist.plan?.ignoredLabels ?? [];
  const noteIgnored = ignored.length ? `Esta série não aplica: ${ignored.join(', ')}.` : '';

  return (
    <>
      {/* 1 — resumo */}
      <Chapter id="resumo" kicker="Em resumo" title={model ? <>{fmt(model.total)} emplacamentos{Number.isFinite(model.yearChangeRate) ? <>, <em className={model.yearChangeRate >= 0 ? 'up' : 'down'}>{signed(model.yearChangeRate)}</em> sobre o ano anterior.</> : '.'}</> : 'Carregando…'}>
        <div className="nx-resumo">
          <div className="nx-obs-card">
            <h3>Observações rápidas</h3>
            <ul>{(insights ?? []).map(i => <li key={i.id} className={i.tone}><span aria-hidden>{i.tone === 'up' ? '▲' : i.tone === 'down' ? '▼' : '●'}</span>{i.text}</li>)}</ul>
          </div>
          <div className="nx-tiles">
            {model && <Tile k="Emplacamentos" sub={Number.isFinite(model.changeRate) ? signed(model.changeRate) + ' sobre o período anterior' : undefined}><CountUp value={model.total} /></Tile>}
            {lead && <Tile dark k="Líder do recorte" sub={fmt(lead.count) + ' · ' + pct(lead.count / total)}>{name(lead.name)}</Tile>}
            {focusIndex >= 0 && <Tile red k={name(focus)} sub={`${focusIndex + 1}º entre ${brands.length} marcas · ${pct(brands[focusIndex].count / total, 2)} do mercado`}><CountUp value={brands[focusIndex].count} /></Tile>}
            {cities[0] && <Tile small k="Município que mais emplaca" sub={fmt(cities[0].count) + ' emplacamentos'}>{cityName(cities[0].name)}</Tile>}
          </div>
        </div>
      </Chapter>

      {/* 2 — tempo */}
      {years && ytd && (
        <Chapter id="tempo" kicker="Ao longo do tempo" title={<>{ytd.year} soma <em>{fmt(ytd.cur)}</em> até {ytd.through}{ytd.change != null ? <>, {signed(ytd.change)} sobre {ytd.prevYear}</> : ''}.</>} lede="Cada linha é um ano, de janeiro a dezembro. A mais forte é o ano atual; passe o mouse para comparar mês a mês.">
          <div className="nx-card"><YearLines years={years} /><p className="nx-note">Série mensal completa, sem depender do período escolhido. {noteIgnored}</p></div>
        </Chapter>
      )}

      {/* 3 — marcas */}
      {lead && (
        <Chapter id="marcas" kicker="Quem disputa" title={<>{name(lead.name)} lidera com <em>{pct(lead.count / total)}</em>{focusIndex > 0 ? <>; {name(focus)} é a {focusIndex + 1}ª.</> : '.'}</>} lede={second ? `${name(lead.name)} abre ${pp((lead.count - second.count) / total).replace('+', '')} sobre ${name(second.name)}. Clique numa marca para filtrar todo o painel.` : undefined}>
          <div className="nx-card"><BarList rows={rankRows} focus={brandFilter[0] ?? focus} onPick={pickBrand} /><p className="nx-note">Participação no mercado do período. A seta mostra quanto cada marca ganhou ou perdeu desde o período anterior.</p></div>
        </Chapter>
      )}

      {/* 4 — ganhos e perdas */}
      {diverging.length > 1 && (
        <Chapter id="ganhos" kicker="Quem está mudando" title={<>{gains[0] ? <>{name(gains[0].name)} ganhou mais espaço (<em className="up">{pp(gains[0].shareChange)}</em>)</> : 'Sem ganhos relevantes'}{losses.length ? <>; {name(losses[losses.length - 1].name)} perdeu mais (<em className="down">{pp(losses[losses.length - 1].shareChange)}</em>)</> : ''}.</>} lede="Variação da participação de mercado sobre o período anterior, entre marcas com ao menos 0,5% do mercado.">
          <div className="nx-card"><Diverging rows={diverging} onPick={r => pickBrand({ name: r.name })} /></div>
        </Chapter>
      )}

      {/* 5 — tecnologia */}
      {techData && (
        <Chapter id="tecnologia" kicker="Para onde vai" title={<>Eletrificados já são <em>{pct(techData.now)}</em> do mercado{techData.before != null ? <>, contra {pct(techData.before)} um ano antes</> : ''}.</>} lede="Fatia do mercado que já não é só combustão, mês a mês, nos últimos cinco anos. Cada faixa é um tipo de eletrificação; o elétrico em destaque.">
          <div className="nx-card"><ShareArea months={techData.months} series={techData.series} max={techData.axis} /><p className="nx-note">A altura total é a fatia de eletrificados: microhíbridos, híbridos, plug-in, elétricos e célula de combustível. {noteIgnored}</p></div>
        </Chapter>
      )}

      {/* 6 — território */}
      {ufs.length > 0 && (
        <Chapter id="territorio" kicker="Onde" title={<>{UF_NAMES[ufs[0].name]}{ufs[1] ? <> e {UF_NAMES[ufs[1].name]}</> : ''} reúnem <em>{pct((ufs[0].count + (ufs[1]?.count ?? 0)) / ufTotal, 0)}</em> dos emplacamentos.</>} lede="Cada estado é colorido pelo volume. Clique num estado para filtrar o painel e ver o mapa de cima se aproximar.">
          <div className="nx-card nx-geo">
            <svg className="nx-uf" viewBox="0 0 630 565" role="img" aria-label="Mapa dos estados por volume de emplacamentos" onPointerLeave={tip.hide}>
              {ufGeometry.features.map(f => { const r = ufMap.get(f.uf), a = r ? .12 + Math.sqrt(r.count / ufMax) * .88 : .05, on = selectedUF.includes(f.uf); return <path key={f.uf} d={f.path} className={'nx-ufp' + (on ? ' on' : '')} style={{ fillOpacity: a }} onClick={() => pickUF(f.uf)} onPointerMove={e => tip.show(e, <><strong>{UF_NAMES[f.uf]}</strong><span>{fmt(r?.count ?? 0)} emplacamentos{r ? ' · ' + pct(r.count / ufTotal) : ''}</span></>)} />; })}
            </svg>
            <div>
              <h3 className="nx-h3">Estados</h3>
              <BarList rows={ufs.slice(0, 7).map((r, i) => ({ key: r.name, name: r.name, label: UF_NAMES[r.name], value: r.count, rank: i + 1, delta: r.changeRate, deltaText: Number.isFinite(r.changeRate) ? signed(r.changeRate) : '' }))} onPick={r => pickUF(r.name)} focus={selectedUF[0]} />
              <h3 className="nx-h3 sp">Municípios</h3>
              <BarList rows={cities.slice(0, 5).map((r, i) => { const [m, u] = r.name.split(' · '); return { key: r.name, name: r.name, label: cityName(r.name) + ' · ' + u, value: r.count, rank: i + 1, delta: r.changeRate, deltaText: Number.isFinite(r.changeRate) ? signed(r.changeRate) : '' }; })} max={cities[0]?.count} />
            </div>
          </div>
          {tip.node}
        </Chapter>
      )}
    </>
  );
}
