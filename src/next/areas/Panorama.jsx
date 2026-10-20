import { useEffect, useMemo } from 'react';
import { engine } from 'virtual:market';
import ufGeometry from '../../market/geo/uf-geometry.json';
import { BarList, Diverging, ShareArea, YearLines, useTip } from '../charts.jsx';
import { useNext } from '../ctx.js';
import { MONTHS, UF_NAMES, fmt, monthLabel, pct, pp, signed } from '../format.js';
import LegacyTab from '../LegacyTab.jsx';
import { AreaHead, Block, CountUp, Tile } from '../ui.jsx';
import PanoramaHero from './panorama-hero.jsx';
import './panorama.css';
import './panorama-skin.css';

const name = n => engine.insightName(n);
const TECH = { ICE: ['Combustão', '#d4d4d8'], MHEV: ['Microhíbrido', '#a1a1aa'], HEV: ['Híbrido', '#71717a'], PHEV: ['Híbrido plug-in', '#3f3f46'], BEV: ['Elétrico', 'var(--nx-accent)'], FCEL: ['Célula de combustível', '#c4b5fd'] };
const ELECTRIFIED = ['MHEV', 'HEV', 'PHEV', 'BEV', 'FCEL'];
// "Perguntas rápidas" of the current Atlas: each card opens the area that answers it.
const QUICK_GO = ['concorrencia', 'territorios', 'segmentos', 'segmentos'];

export default function Panorama() {
  const c = useNext();
  const { model, market, geoless, hasBrand, hasGeo, hist, filters, setFilter, focus, insights, cityName, points, ufFilter, setTone, onTip, go } = c;
  const ranking = hasBrand ? market ?? model : model, geoModel = hasGeo ? geoless ?? model : model;
  const brandFilter = (Array.isArray(filters.marca) ? filters.marca : []).filter(x => x !== 'all');

  // The page now opens on a light surface: tell the nav (runs after the shell's own tone effect).
  useEffect(() => { const t = setTimeout(() => setTone?.('light'), 0); return () => clearTimeout(t); }, [setTone]);

  /* ---------- ranking and share movement ---------- */
  const brands = useMemo(() => (ranking?.groups?.marca ?? []).filter(r => r.count > 0), [ranking]);
  const total = ranking?.total ?? 0;
  const focusIndex = brands.findIndex(b => b.name === focus);
  const row = (b, i) => ({ key: b.name, name: b.name, label: name(b.name), value: b.count, rank: i + 1, valueText: fmt(b.count), delta: b.shareChange, deltaText: Number.isFinite(b.shareChange) ? pp(b.shareChange) : '', title: pct(b.count / total, 1) + ' do mercado' });
  const rankRows = useMemo(() => {
    const rows = brands.slice(0, 10).map(row);
    if (focusIndex >= 10) { rows.push({ key: 'gap', name: 'gap', label: '', value: 0, gap: true, valueText: '···', deltaText: '' }); rows.push(row(brands[focusIndex], focusIndex)); }
    return rows;
  }, [brands, focusIndex, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const movers = useMemo(() => brands.filter(r => Number.isFinite(r.shareChange) && r.count / total >= .005), [brands, total]);
  const gains = [...movers].sort((a, b) => b.shareChange - a.shareChange).slice(0, 5).filter(r => r.shareChange > 0.0003);
  const losses = [...movers].sort((a, b) => a.shareChange - b.shareChange).slice(0, 5).filter(r => r.shareChange < -0.0003);
  const diverging = [...gains, ...losses.reverse()].map(r => ({ name: r.name, label: name(r.name), value: r.shareChange, text: pp(r.shareChange) }));

  /* ---------- years laid over each other ---------- */
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
    const cur = years.at(-1), prev = years.at(-2), a = sum(cur), b = sum(prev);
    return { year: cur.year, prevYear: prev.year, cur: a, prev: b, change: b > 0 ? a / b - 1 : null, through: MONTHS[L - 1] };
  }, [years, latestMonth]);

  /* ---------- technology mix ---------- */
  const techData = useMemo(() => {
    if (!hist.data || !hist.data.dimensions.includes('propulsao')) return null;
    const ms = engine.historyMonthly(hist.data, filters, 'propulsao'), upto = ms.filter(m => latestMonth && m.month <= latestMonth).slice(-60);
    if (upto.length < 6) return null;
    const names = [...new Set(upto.flatMap(m => [...m.groups.keys()]))].filter(n => TECH[n]);
    const series = Object.keys(TECH).filter(n => names.includes(n) && ELECTRIFIED.includes(n)).map(n => ({ name: TECH[n][0], key: n, color: TECH[n][1], values: upto.map(m => { const t = [...m.groups.values()].reduce((s, v) => s + v, 0); return t > 0 ? (m.groups.get(n) ?? 0) / t : 0; }) }));
    const share = i => series.reduce((s, x) => s + x.values[i], 0);
    const top = Math.max(...upto.map((_, i) => share(i))), axis = Math.max(.05, Math.ceil(top * 1.15 / .05) * .05);
    return { months: upto.map(m => ({ label: monthLabel(m.month), short: monthLabel(m.month) })), series, axis, now: share(upto.length - 1), before: upto.length > 12 ? share(upto.length - 13) : null };
  }, [hist.data, filters, latestMonth]);

  /* ---------- territory ---------- */
  const ufs = useMemo(() => (geoModel?.groups?.uf ?? []).filter(r => UF_NAMES[r.name]), [geoModel]);
  const ufMax = ufs[0]?.count ?? 1, ufTotal = geoModel?.total ?? 0, ufMap = useMemo(() => new Map(ufs.map(r => [r.name, r])), [ufs]);
  const selectedUF = (Array.isArray(filters.uf) ? filters.uf : []).filter(x => x !== 'all');
  const cities = useMemo(() => (model?.groups?.municipio ?? []).slice(0, 10), [model]);
  const tip = useTip();
  const pickUF = u => setFilter('uf', selectedUF.length === 1 && selectedUF[0] === u ? 'all' : [u]);
  const pickBrand = r => { if (r.name === 'gap') return; setFilter('marca', brandFilter.length === 1 && brandFilter[0] === r.name ? 'all' : [r.name]); };
  const cityRow = (r, i) => { const u = r.name.split(' · ')[1]; return { key: r.name, name: r.name, label: cityName(r.name) + ' · ' + u, value: r.count, rank: i + 1, delta: r.changeRate, deltaText: Number.isFinite(r.changeRate) ? signed(r.changeRate) : '' }; };

  const lead = brands[0], second = brands[1];
  const ignored = hist.plan?.ignoredLabels ?? [];
  const noteIgnored = ignored.length ? ` Esta série não aplica: ${ignored.join(', ')}.` : '';
  const finding = model ? <>{lead ? <>{name(lead.name)} lidera com {pct(lead.count / total)} do mercado{second ? <>, {pp((lead.count - second.count) / total).replace('+', '')} à frente de {name(second.name)}</> : ''}. </> : ''}{ufs[1] ? <>{UF_NAMES[ufs[0].name]} e {UF_NAMES[ufs[1].name]} reúnem {pct((ufs[0].count + ufs[1].count) / ufTotal, 0)} dos emplacamentos.</> : ''}</> : 'Lendo os dados…';

  // Clicking a "pergunta rápida" opens the area that answers it (the current Atlas did the same with its tabs).
  const quick = e => {
    const b = e.target.closest?.('.mp-highlight'); if (!b) return;
    const i = [...b.parentElement.querySelectorAll('.mp-highlight')].indexOf(b);
    if (QUICK_GO[i]) { e.stopPropagation(); e.preventDefault(); go(QUICK_GO[i]); }
  };

  return (
    <div className="nxp">
      <AreaHead title="Panorama" finding={finding} />
      <div className="nx-wrap">
        <div className="nxp-heroframe">
          <PanoramaHero model={model} points={points} ufFilter={ufFilter} insights={insights} onTip={onTip} />
        </div>
        {insights?.length > 0 && (
          <Block className="nxp-obs-m" title="Observações rápidas">
            <ul className="nxp-obs-list">{insights.map(i => <li key={i.id} className={i.tone}><span aria-hidden>{i.tone === 'up' ? '▲' : i.tone === 'down' ? '▼' : '●'}</span>{i.text}</li>)}</ul>
          </Block>
        )}

        <div className="nxp-kpis">
          {model && <Tile k="Emplacamentos" sub={Number.isFinite(model.changeRate) ? signed(model.changeRate) + ' sobre o período anterior' : undefined}><CountUp value={model.total} /></Tile>}
          {model && <Tile k="Sobre o ano anterior" sub={Number.isFinite(model.year) && model.year > 0 ? fmt(model.year) + ' no mesmo período' : undefined}><span className={model.yearChangeRate >= 0 ? 'nxp-up' : 'nxp-down'}>{signed(model.yearChangeRate)}</span></Tile>}
          {lead && <Tile dark k={focusIndex >= 0 ? name(focus) : 'Líder do recorte'} sub={focusIndex >= 0 ? `${focusIndex + 1}º entre ${brands.length} marcas · ${pct(brands[focusIndex].count / total, 2)} do mercado` : fmt(lead.count) + ' · ' + pct(lead.count / total)}>{focusIndex >= 0 ? <CountUp value={brands[focusIndex].count} /> : name(lead.name)}</Tile>}
          {cities[0] && <Tile small k="Município que mais emplaca" sub={fmt(cities[0].count) + ' emplacamentos'}>{cityName(cities[0].name)}</Tile>}
        </div>

        {/* peças do Atlas atual: perguntas rápidas, evolução diária/mensal/anual, combustíveis e canais (marcas: no bloco nativo abaixo) */}
        <div onClickCapture={quick}><LegacyTab tab="dashboard" className="nxp-legacy" /></div>

        <div className="nx-grid nxp-grid">
          {years && ytd && (
            <Block className="nx-c7" title={<>{ytd.year} soma <em>{fmt(ytd.cur)}</em> até {ytd.through}{ytd.change != null ? <>, <em className={ytd.change >= 0 ? 'up' : 'down'}>{signed(ytd.change)}</em> sobre {ytd.prevYear}</> : ''}</>} caption="Cada linha é um ano, de janeiro a dezembro; passe o mouse para comparar mês a mês.">
              <YearLines years={years} />
              <p className="nx-note">Série mensal completa, sem depender do período escolhido.{noteIgnored}</p>
            </Block>
          )}
          {lead && (
            <Block className="nx-c5" title={<>{name(lead.name)} lidera com <em>{pct(lead.count / total)}</em>{focusIndex > 0 ? <>; {name(focus)} é a {focusIndex + 1}ª</> : ''}</>} caption="Top 10 do período; a seta é a variação da participação sobre o período anterior. Clique para filtrar.">
              <BarList rows={rankRows} focus={brandFilter[0] ?? focus} onPick={pickBrand} />
            </Block>
          )}
          {diverging.length > 1 && (
            <Block className="nx-c6" title={<>{gains[0] ? <>{name(gains[0].name)} ganhou mais (<em className="up">{pp(gains[0].shareChange)}</em>)</> : 'Sem ganhos relevantes'}{losses.length ? <>; {name(losses[losses.length - 1].name)} perdeu mais (<em className="down">{pp(losses[losses.length - 1].shareChange)}</em>)</> : ''}</>} caption="Variação da participação sobre o período anterior, entre marcas com ao menos 0,5% do mercado.">
              <Diverging rows={diverging} onPick={r => pickBrand({ name: r.name })} />
            </Block>
          )}
          {techData && (
            <Block className="nx-c6" title={<>Eletrificados já são <em>{pct(techData.now)}</em> do mercado{techData.before != null ? <>, contra {pct(techData.before)} um ano antes</> : ''}</>} caption="Fatia que já não é só combustão, mês a mês, nos últimos cinco anos; o elétrico em destaque.">
              <ShareArea months={techData.months} series={techData.series} max={techData.axis} />
              <p className="nx-note">Microhíbridos, híbridos, plug-in, elétricos e célula de combustível.{noteIgnored}</p>
            </Block>
          )}
          {ufs.length > 0 && (
            <Block className="nx-c7" title={<>{UF_NAMES[ufs[0].name]}{ufs[1] ? <> e {UF_NAMES[ufs[1].name]}</> : ''} reúnem <em>{pct((ufs[0].count + (ufs[1]?.count ?? 0)) / ufTotal, 0)}</em> dos emplacamentos</>} caption="Cada estado é colorido pelo volume. Clique num estado para filtrar o painel; o mapa do topo se aproxima.">
              <div className="nxp-uf">
                <svg className="nx-uf" viewBox="0 0 630 565" role="img" aria-label="Mapa dos estados por volume de emplacamentos" onPointerLeave={tip.hide}>
                  {ufGeometry.features.map(f => { const r = ufMap.get(f.uf), a = r ? .12 + Math.sqrt(r.count / ufMax) * .88 : .05, on = selectedUF.includes(f.uf); return <path key={f.uf} d={f.path} className={'nx-ufp' + (on ? ' on' : '')} style={{ fillOpacity: a }} onClick={() => pickUF(f.uf)} onPointerMove={e => tip.show(e, <><strong>{UF_NAMES[f.uf]}</strong><span>{fmt(r?.count ?? 0)} emplacamentos{r ? ' · ' + pct(r.count / ufTotal) : ''}</span></>)} />; })}
                </svg>
                <BarList rows={ufs.slice(0, 8).map((r, i) => ({ key: r.name, name: r.name, label: UF_NAMES[r.name], value: r.count, rank: i + 1, delta: r.changeRate, deltaText: Number.isFinite(r.changeRate) ? signed(r.changeRate) : '' }))} onPick={r => pickUF(r.name)} focus={selectedUF[0]} />
              </div>
              {tip.node}
            </Block>
          )}
          {cities.length > 0 && (
            <Block className="nx-c5" title={<>{cityName(cities[0].name)} é o município que mais emplaca</>} caption="Dez maiores municípios no recorte e a variação sobre o período anterior.">
              <BarList rows={cities.map(cityRow)} max={cities[0]?.count} />
            </Block>
          )}
        </div>
      </div>
    </div>
  );
}
