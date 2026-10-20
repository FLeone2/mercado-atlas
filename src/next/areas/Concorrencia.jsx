import { useEffect, useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import ufGeometry from '../../market/geo/uf-geometry.json';
import { BarList, useTip } from '../charts.jsx';
import { useNext } from '../ctx.js';
import { UF_NAMES, fmt, monthLabel, pct, pp, signed, titleCase } from '../format.js';
import { AreaHead, Block } from '../ui.jsx';
import LegacyTab from '../LegacyTab.jsx';
import { Seg, TimeLines } from './evolucao-charts.jsx';
import { Bump } from './concorrencia-charts.jsx';
import './concorrencia.css';
import './concorrencia-skin.css';

const brandName = n => { const s = engine.insightName(n); return s === n.charAt(0) + n.slice(1).toLowerCase() ? titleCase(n) : s; };
const roll = (arr, k = 12) => arr.map((_, i) => (i < k - 1 ? null : arr.slice(i - k + 1, i + 1).reduce((s, v) => s + v, 0)));
const list = v => (Array.isArray(v) ? v : []).filter(x => x !== 'all');
const fixAcr = s => s.replace(/\bSuvs\b/g, 'SUVs').replace(/\bSuv\b/g, 'SUV');
const NO = new Set(['AC', 'AP', 'AM', 'CE', 'DF', 'ES', 'MA', 'MT', 'MS', 'PA', 'PR', 'PI', 'RJ', 'RN', 'RS', 'TO']);
const inUF = u => (NO.has(u) ? 'no ' : u === 'BA' || u === 'PB' ? 'na ' : 'em ') + UF_NAMES[u];
const TECH = { ICE: 'Combustão', MHEV: 'Microhíbrido', HEV: 'Híbrido', PHEV: 'Híbrido plug-in', BEV: 'Elétrico', FCEL: 'Célula de combustível' };
const BODY = { 'DOUBLE CAB': 'Cabine dupla', 'SINGLE CAB': 'Cabine simples', SEDAN: 'Sedã', CARGO: 'Carga' };
const DIMS = [
  { id: 'subsegmento', label: 'Segmento', fmt: n => fixAcr(titleCase(n.replace(/^(AU|CL)\s*-\s*/, ''))) },
  { id: 'bd_carroceria', label: 'Carroceria', fmt: n => BODY[n] ?? fixAcr(titleCase(n)) },
  { id: 'propulsao', label: 'Propulsão', fmt: n => TECH[n] ?? n },
];

export default function Concorrencia() {
  const { filters, setFilter, model, market, hasBrand, hasGeo, hist, focus } = useNext();
  const ranking = market ?? model;
  const brands = useMemo(() => (ranking?.groups?.marca ?? []).filter(r => r.count > 0), [ranking]);
  const [pickA, setPickA] = useState(null), [pickB, setPickB] = useState(null);
  useEffect(() => { setPickA(null); setPickB(null); }, [focus]);
  const a = pickA ?? focus;
  const b = pickB && pickB !== a ? pickB : brands.find(r => r.name !== a)?.name ?? null;

  /* consultas próprias: a marca do duelo em todos os estados, o mercado inteiro, e a marca no recorte geográfico da página */
  const scope = useMemo(() => ({ ...filters, modelo: 'all', grupo_modelo: 'all' }), [filters]);
  const allGeo = useMemo(() => ({ ...scope, uf: 'all', regiao: 'all', municipio: 'all' }), [scope]);
  const brandAll = engine.useMarketData(useMemo(() => ({ ...allGeo, marca: [a] }), [allGeo, a]), !!a, 'dashboard', false).result;
  const marketAll = engine.useMarketData(useMemo(() => ({ ...allGeo, marca: 'all' }), [allGeo]), hasBrand || hasGeo, 'dashboard', false).result ?? (!hasBrand && !hasGeo ? model : null);
  const brandGeo = engine.useMarketData(useMemo(() => ({ ...scope, marca: [a] }), [scope, a]), hasGeo && !!a, 'dashboard', false).result;

  const options = useMemo(() => {
    const top = brands.slice(0, 40).map(r => r.name);
    return [...new Set([...top, a, b].filter(Boolean))];
  }, [brands, a, b]);
  const setA = v => { setPickA(v); if (v === b) setPickB(null); };

  const [view, setView] = useState('geral');
  const single = !!model?.range && String(model.range.start).slice(0, 7) === String(model.range.end).slice(0, 7);
  const total = model?.total > 0 && brands.length > 0;
  const finding = useMemo(() => {
    if (!total || !ranking) return null;
    const T = ranking.total, top = brands[0], idx = brands.findIndex(r => r.name === focus);
    const prevT = brands.reduce((s, r) => s + (r.previous ?? 0), 0), me = brands[idx];
    let t = `${brandName(top.name)} lidera com ${pct(top.count / T)} dos emplacamentos`;
    if (me && idx > 0) {
      const d = prevT > 0 && me.previous > 0 ? me.count / T - me.previous / prevT : null;
      t += `; ${brandName(me.name)} é a ${idx + 1}ª, com ${pct(me.count / T)}${d != null && Math.abs(d) >= .0005 ? ` (${pp(d)} sobre o período anterior)` : ''}`;
    }
    return t + '.';
  }, [total, ranking, brands, focus]);
  const TABS = [['geral', 'Visão geral'], ['comparar', 'Comparar'], ['ranking', 'Ranking'], ['conexoes', 'Conexões']];
  const head = <AreaHead title="Concorrência" finding={finding ?? (model ? 'Nenhum emplacamento neste recorte: retire algum filtro.' : 'Carregando o mercado…')} tabs={TABS} tab={view} onTab={setView} />;
  if (!model) return <>{head}<div className="nx-wrap nxc-body"><div className="nx-card"><div className="nxc-skel" /></div></div></>;
  if (!total) return <>{head}<div className="nx-wrap nxc-body"><div className="nx-card"><p className="nx-note">Não há registros com os filtros escolhidos. Tente retirar algum deles.</p></div></div></>;

  return (
    <>
      {head}
      <div className="nx-wrap nxc-body">
        <div className="nx-grid nxc-grid" data-v={view} data-single={single ? '1' : '0'}>
          {view === 'geral' && <>
            <Modelos model={model} filters={filters} setFilter={setFilter} hasBrand={hasBrand} />
            <Estados a={a} brandAll={brandAll} marketAll={marketAll} setFilter={setFilter} filters={filters} hasGeo={hasGeo} />
            <Mix a={a} brandGeo={hasGeo ? brandGeo : brandAll} marketGeo={market ?? model} hasGeo={hasGeo} />
          </>}
          {view === 'comparar' && <Duelo a={a} b={b} options={options} setA={setA} setB={setPickB} hist={hist} filters={filters} />}
          {view === 'ranking' && <BumpNativo hist={hist} filters={filters} focus={focus} setFilter={setFilter} single={single} />}
          <LegacyTab tab="competition" />
        </div>
      </div>
    </>
  );
}

/* ================= 1 — o duelo ================= */
function Pick({ value, options, onChange, tone }) {
  return (
    <label className={'nxc-pick ' + tone}>
      <i />
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label={tone === 'a' ? 'Marca em foco' : 'Marca adversária'}>
        {options.map(o => <option key={o} value={o}>{brandName(o)}</option>)}
      </select>
      <svg viewBox="0 0 12 8" aria-hidden><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </label>
  );
}

function Duelo({ a, b, options, setA, setB, hist, filters }) {
  const duelFilters = useMemo(() => ({ ...filters, marca: 'all', modelo: 'all', grupo_modelo: 'all' }), [filters]);
  const monthly = useMemo(() => {
    if (!hist?.data || !hist.data.dimensions.includes('marca')) return null;
    const all = engine.historyMonthly(hist.data, duelFilters, 'marca');
    while (all.length && !all.at(-1).complete) all.pop();
    return all.length >= 48 ? all : null;
  }, [hist?.data, duelFilters]);
  const ignored = useMemo(() => engine.historyPlan(duelFilters).ignoredLabels, [duelFilters]);
  const d = useMemo(() => {
    if (!monthly || !a || !b) return null;
    const n = monthly.length, total = monthly.map(m => m.count), T = roll(total);
    const mk = nm => { const cnt = monthly.map(m => m.groups.get(nm) ?? 0), r = roll(cnt); return { cnt, r, share: r.map((v, i) => (v == null || !T[i] ? null : v / T[i])) }; };
    const A = mk(a), B = mk(b), s0 = n - 36;
    if (!T[n - 1] || !T[n - 13]) return null;
    return { n, months: monthly.slice(s0).map(m => m.month), A, B, s0, nowA: A.share[n - 1], nowB: B.share[n - 1], prevA: A.share[n - 13], prevB: B.share[n - 13] };
  }, [monthly, a, b]);
  const ratio = d ? Math.min(d.nowA, d.nowB) / Math.max(d.nowA, d.nowB, 1e-9) : 1;
  const [view, setView] = useState(null);
  const v = view ?? (ratio < .25 ? 'index' : 'share');

  let title = 'Duelo entre marcas', lede, chart = null, empty = null;
  if (!hist?.data && !hist?.error) empty = <div className="nxc-skel" />;
  else if (!d) empty = <p className="nx-note">{hist?.error ?? 'Não há série histórica suficiente para comparar estas marcas no recorte escolhido.'}</p>;
  else {
    const lead = d.nowA >= d.nowB ? 'a' : 'b', L = lead === 'a' ? a : b, O = lead === 'a' ? b : a, sL = Math.max(d.nowA, d.nowB), sO = Math.min(d.nowA, d.nowB);
    const gapNow = sL - sO, gapPrev = (lead === 'a' ? d.prevA - d.prevB : d.prevB - d.prevA), dg = gapNow - gapPrev;
    title = sL + sO === 0 ? <>Nenhuma das duas marcas emplacou neste recorte.</> : <>{brandName(L)} lidera o duelo com <em>{pct(sL)}</em> do mercado, contra {pct(sO)} de {brandName(O)}.</>;
    const dA = d.nowA - d.prevA, dB = d.nowB - d.prevB;
    lede = `Acumulado de 12 meses até ${monthLabel(monthly.at(-1).month)}. A distância ${Math.abs(dg) < .0005 ? 'ficou estável' : (dg < 0 ? 'encurtou ' : 'aumentou ') + pp(Math.abs(dg)).replace('+', '')} em um ano: ${brandName(a)} ${dA >= 0 ? 'ganhou' : 'perdeu'} ${pp(Math.abs(dA)).replace('+', '')} e ${brandName(b)} ${dB >= 0 ? 'ganhou' : 'perdeu'} ${pp(Math.abs(dB)).replace('+', '')}`.replace(/\.$/, '') + '.';
    const cut = x => x.slice(d.s0);
    const baseOf = x => cut(x.r).find(q => q != null && q > 0);
    const mkv = (x, nm, color, width) => {
      let values, fmtT;
      if (v === 'share') { values = cut(x.share).map(q => (q == null ? null : q * 100)); }
      else if (v === 'volume') { values = cut(x.cnt); }
      else { const base = baseOf(x); values = cut(x.r).map(q => (q == null || !base ? null : q / base * 100)); }
      return { name: brandName(nm), values, color, width };
    };
    const series = [mkv(d.A, a, 'var(--nx-accent)', 4), mkv(d.B, b, 'var(--nx-ink)', 3)];
    const fmtY = v === 'share' ? q => (Math.round(q * 10) / 10).toLocaleString('pt-BR') + '%' : fmt;
    const fmtTip = v === 'share' ? q => q.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%' : v === 'index' ? q => Math.round(q).toString() : fmt;
    chart = (
      <>
        <div className="nxc-scroll"><TimeLines months={d.months} series={series} fmtY={fmtY} fmtTip={fmtTip} replayKey={v + a + b} label={`${brandName(a)} e ${brandName(b)} nos últimos 36 meses`} /></div>
        <p className="nx-note">
          {v === 'share' ? 'Participação de cada marca no acumulado de 12 meses do mercado do recorte.' : v === 'volume' ? 'Emplacamentos de cada marca em cada mês; o mês tem sazonalidade, então compare picos com picos.' : 'Acumulado de 12 meses de cada marca, com o primeiro ponto igual a 100: mostra quem cresceu mais, mesmo quando uma é muito menor que a outra.'}
          {ignored.length ? ` Esta série não aplica: ${ignored.join(', ')}.` : ''}
        </p>
      </>
    );
  }
  return (
    <Block className="nx-c12 nxc-o1" title={title} caption={lede}>
      <>
        <div className="nxc-head">
          <div className="nxc-vs"><Pick tone="a" value={a} options={options} onChange={setA} /><span>contra</span><Pick tone="b" value={b} options={options} onChange={setB} /></div>
          <Seg label="Medida" value={v} onChange={setView} options={[{ value: 'share', label: 'Participação' }, { value: 'index', label: 'Ritmo (base 100)' }, { value: 'volume', label: 'Volume mensal' }]} />
        </div>
        {empty}{chart}
      </>
    </Block>
  );
}

/* ================= 2 — ranking de modelos ================= */
function Modelos({ model, filters, setFilter, hasBrand }) {
  const dim = (model.groups?.grupo_modelo ?? []).length ? 'grupo_modelo' : 'modelo';
  const rows = useMemo(() => (model.groups?.[dim] ?? []).filter(r => r.count > 0 && !/^(N[AÃ]O|SEM)\b/i.test(r.name)).slice(0, 12).filter((r, i) => i < 5 || r.count >= 5), [model, dim]);
  const sel = list(filters[dim])[0];
  if (!rows.length) return null;
  const total = model.total, top = rows[0], second = rows[1];
  const grow = [...rows].filter(r => Number.isFinite(r.changeRate) && r.previous > 0).sort((x, y) => y.changeRate - x.changeRate)[0];
  const label = n => titleCase(n);
  const bars = rows.map((r, i) => ({ key: r.name, name: r.name, label: label(r.name), value: r.count, rank: i + 1, delta: r.changeRate, deltaText: Number.isFinite(r.changeRate) && r.previous > 0 ? signed(r.changeRate) : '', title: pct(r.count / total, 1) + ' do mercado' }));
  return (
    <Block className="nx-c5 nxc-o1" title={<>{label(top.name)} é o mais emplacado: <em>{fmt(top.count)}</em> unidades, {pct(top.count / total)} {hasBrand ? 'do recorte' : 'do mercado'}.</>}
      caption={`${second ? `${label(second.name)} vem a seguir, ${fmt(top.count - second.count)} unidades atrás. ` : ''}${grow && grow.changeRate > 0 ? `Quem mais cresce entre eles: ${label(grow.name)} (${signed(grow.changeRate, 0)}). ` : ''}Clique num modelo para filtrar todo o painel.`}>
      <>
        <BarList rows={bars} focus={sel} onPick={r => setFilter(dim, sel === r.name ? 'all' : [r.name])} />
        <p className="nx-note">Os {rows.length} modelos com mais emplacamentos {hasBrand ? 'dentro dos filtros' : 'no período'}. A variação compara com o período anterior de mesma duração; modelos agrupam todas as versões.</p>
      </>
    </Block>
  );
}

/* ================= 3 — onde a marca é mais forte ================= */
function Estados({ a, brandAll, marketAll, setFilter, filters, hasGeo }) {
  const tip = useTip();
  const s = useMemo(() => {
    if (!brandAll || !marketAll || !(marketAll.total > 0)) return null;
    const mk = new Map((marketAll.groups?.uf ?? []).map(r => [r.name, r.count]));
    const nat = brandAll.total / marketAll.total;
    const rows = (brandAll.groups?.uf ?? []).filter(r => UF_NAMES[r.name] && mk.get(r.name) > 0).map(r => ({ uf: r.name, count: r.count, all: mk.get(r.name), share: r.count / mk.get(r.name) }));
    const big = rows.filter(r => r.all / marketAll.total >= .01).sort((x, y) => y.share - x.share);
    return { nat, rows, big, byUf: new Map(rows.map(r => [r.uf, r])), max: Math.max(1e-9, ...rows.map(r => r.share)) };
  }, [brandAll, marketAll]);
  const sel = list(filters.uf);
  const name = brandName(a);
  if (!s || !brandAll || !(brandAll.total > 0) || s.big.length < 4) {
    return (
      <Block className="nx-c7 nxc-o2" title={brandAll && brandAll.total === 0 ? <>{name} não emplacou neste período.</> : <>Onde {name} é mais forte</>}>
        {!brandAll || !marketAll ? <div className="nxc-skel" /> : <p className="nx-note">Sem volume suficiente para comparar estados neste recorte.</p>}
      </Block>
    );
  }
  const best = s.big[0], worst = s.big.at(-1), idx = best.share / s.nat;
  const strong = s.big.slice(0, 5), weak = s.big.slice(-4).reverse().filter(r => !strong.includes(r));
  const toRow = (r, i, rank) => ({ key: r.uf, name: r.uf, label: UF_NAMES[r.uf], value: r.share, rank, valueText: pct(r.share, 1), deltaText: (r.share / s.nat).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '×', title: fmt(r.count) + ' de ' + fmt(r.all) + ' emplacamentos' });
  const bars = [...strong.map((r, i) => toRow(r, i, i + 1)), ...(weak.length ? [{ key: 'gap', name: 'gap', label: '', value: 0, gap: true, valueText: '···', deltaText: '' }] : []), ...weak.map((r, i) => toRow(r, i, s.big.length - weak.length + i + 1))];
  return (
    <Block className="nx-c7 nxc-o2" title={<>{name} é mais forte {inUF(best.uf)}: <em>{pct(best.share)}</em> dos emplacamentos{idx >= 1.15 ? <>, {idx.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a média do país</> : ''}.</>}
      caption={`No Brasil, ${name} tem ${pct(s.nat)} do mercado do período. O ponto mais fraco entre os estados com ao menos 1% do mercado é ${UF_NAMES[worst.uf]}, com ${pct(worst.share)}.${hasGeo ? ' O mapa ignora o filtro de território para mostrar o país inteiro.' : ''}`}>
      <div className="nxc-geo">
        <svg className="nx-uf" viewBox="0 0 630 565" role="img" aria-label={`Participação de ${name} em cada estado`} onPointerLeave={tip.hide}>
          {ufGeometry.features.map(f => {
            const r = s.byUf.get(f.uf);
            return <path key={f.uf} d={f.path} className={'nxc-ufp' + (sel.includes(f.uf) ? ' on' : '')} style={{ fillOpacity: r ? .08 + Math.sqrt(r.share / s.max) * .92 : .04 }} onClick={() => setFilter('uf', sel.length === 1 && sel[0] === f.uf ? 'all' : [f.uf])}
              onPointerMove={e => tip.show(e, <><strong>{UF_NAMES[f.uf]}</strong>{r ? <><span>{pct(r.share, 1)} dos emplacamentos</span><span>{fmt(r.count)} de {fmt(r.all)}</span><span>{(r.share / s.nat).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a média do país</span></> : <span>Sem dados</span>}</>)} />;
          })}
        </svg>
        <div>
          <h4 className="nxc-sub">Participação de {name} por estado</h4>
          <BarList rows={bars} max={s.max} focus={sel[0]} onPick={r => r.name !== 'gap' && setFilter('uf', sel.length === 1 && sel[0] === r.name ? 'all' : [r.name])} />
          <p className="nx-note">A cor do mapa e o tamanho da barra mostram a fatia da marca nos emplacamentos do estado; o número à direita é quanto isso vale frente à média do país ({pct(s.nat)}). Estados com menos de 1% do mercado ficam de fora do ranking. Clique para filtrar.</p>
        </div>
      </div>
      {tip.node}
    </Block>
  );
}

/* ================= 4 — o que a marca vende ================= */
function Mix({ a, brandGeo, marketGeo, hasGeo }) {
  const name = brandName(a);
  const mixes = useMemo(() => {
    if (!brandGeo || !marketGeo || !(brandGeo.total > 0) || !(marketGeo.total > 0)) return null;
    return DIMS.map(dm => {
      const bg = (brandGeo.groups?.[dm.id] ?? []).filter(r => r.count > 0), mg = new Map((marketGeo.groups?.[dm.id] ?? []).map(r => [r.name, r.count]));
      const bt = bg.reduce((x, r) => x + r.count, 0), mt = [...mg.values()].reduce((x, c) => x + c, 0);
      if (!bt || !mt) return null;
      const rows = bg.map(r => ({ name: r.name, label: dm.fmt(r.name), brand: r.count / bt, market: (mg.get(r.name) ?? 0) / mt })).sort((x, y) => y.brand - x.brand);
      return { ...dm, rows };
    }).filter(Boolean);
  }, [brandGeo, marketGeo]);
  const [pick, setPick] = useState(null);
  if (!mixes || !mixes.length) {
    return <Block className="nx-c6 nxc-o3" title={brandGeo && brandGeo.total === 0 ? <>{name} não emplacou neste recorte.</> : <>O que {name} vende</>}>{brandGeo && marketGeo ? <p className="nx-note">Sem dados para montar o perfil de vendas.</p> : <div className="nxc-skel" />}</Block>;
  }
  /* o destaque: a categoria em que a marca mais se distancia do mercado, entre as que pesam ao menos 8% das suas vendas */
  let hl = null;
  for (const m of mixes) for (const r of m.rows) if (r.brand >= .08 && (!hl || r.brand - r.market > hl.r.brand - hl.r.market)) hl = { m, r };
  if (!hl) hl = { m: mixes[0], r: mixes[0].rows[0] };
  const cur = mixes.find(m => m.id === (pick ?? hl.m.id)) ?? mixes[0];
  const top = cur.rows.slice(0, 7), max = Math.max(...top.flatMap(r => [r.brand, r.market]), .01);
  const diff = hl.r.brand - hl.r.market;
  return (
    <Block className="nx-c6 nxc-o3" title={<>Entre as vendas de {name}, <em>{hl.r.label}</em> fica com {pct(hl.r.brand, 0)}{Math.abs(diff) >= .01 ? <>, contra {pct(hl.r.market, 0)} do mercado.</> : '.'}</>}
      caption={`Perfil de vendas de ${name}${hasGeo ? ' no território filtrado' : ''} ao lado do mercado. Maior distância da média: ${diff >= 0 ? 'acima' : 'abaixo'} em ${pp(Math.abs(diff)).replace('+', '')}.`}>
      <>
        <div className="nxc-head"><Seg label="Dimensão" value={cur.id} onChange={setPick} options={mixes.map(m => ({ value: m.id, label: m.label }))} /></div>
        <div className="nxc-mix" key={cur.id}>
          {top.map((r, i) => (
            <div className="nxc-mixrow" key={r.name} style={{ '--i': i }}>
              <span className="nxc-mixname">{r.label}</span>
              <span className="nxc-mixbars">
                <span className="nxc-mixbar a" style={{ width: Math.max(.5, r.brand / max * 100) + '%' }} />
                <span className="nxc-mixbar b" style={{ width: Math.max(.5, r.market / max * 100) + '%' }} />
              </span>
              <span className="nxc-mixval"><b>{pct(r.brand, 1)}</b><small>mercado {pct(r.market, 1)}</small></span>
            </div>
          ))}
        </div>
        <div className="nx-legend"><span><i style={{ background: 'var(--nx-accent)' }} />{name}</span><span><i style={{ background: '#c6c6cb' }} />Mercado</span></div>
        <p className="nx-note">Participação de cada categoria nas vendas da marca e nas do mercado, no período escolhido. Mostra as sete maiores categorias da marca.</p>
      </>
    </Block>
  );
}

/* ================= Ranking mês a mês (nativo, sobre a série histórica) ================= */
function BumpNativo({ hist, filters, focus, setFilter, single }) {
  const duelFilters = useMemo(() => ({ ...filters, marca: 'all', modelo: 'all', grupo_modelo: 'all' }), [filters]);
  const [mode, setMode] = useState('mes'), [topN, setTopN] = useState(10);
  const monthly = useMemo(() => {
    if (!hist?.data || !hist.data.dimensions.includes('marca')) return null;
    const all = engine.historyMonthly(hist.data, duelFilters, 'marca');
    while (all.length && !all.at(-1).complete) all.pop();
    return all.length >= 36 ? all : null;
  }, [hist?.data, duelFilters]);
  const ignored = useMemo(() => engine.historyPlan(duelFilters).ignoredLabels, [duelFilters]);
  const sel = list(filters.marca)[0];
  const d = useMemo(() => {
    if (!monthly) return null;
    const n = monthly.length, K = 24, s0 = n - K, names = new Set();
    monthly.slice(s0 - 12).forEach(m => m.groups.forEach((c, k) => { if (c > 0) names.add(k); }));
    const val = new Map();
    names.forEach(nm => { const cnt = monthly.map(m => m.groups.get(nm) ?? 0); val.set(nm, mode === 'mes' ? cnt : roll(cnt)); });
    const rankAt = i => { const arr = [...names].map(nm => [nm, val.get(nm)[i]]).filter(([, v]) => v != null && v > 0).sort((x, y) => y[1] - x[1]); return new Map(arr.map(([nm], k) => [nm, k + 1])); };
    const R = Array.from({ length: K }, (_, k) => rankAt(s0 + k));
    const last = R[K - 1];
    const pick = [...last.entries()].filter(([, r]) => r <= topN).map(([nm]) => nm);
    const extra = [focus, sel].filter(nm => nm && last.has(nm) && last.get(nm) <= 20 && !pick.includes(nm));
    const chosen = [...pick, ...extra];
    const rows = chosen.map(nm => ({ name: nm, label: brandName(nm), focus: nm === focus, ranks: R.map(m => m.get(nm) ?? null), values: val.get(nm).slice(s0).map(v => (v == null ? null : v)) }));
    const maxRank = Math.max(topN, ...rows.flatMap(r => r.ranks.filter(Boolean)));
    const climb = rows.filter(r => r.ranks[0] != null && r.ranks[K - 1] != null).map(r => ({ r, up: r.ranks[0] - r.ranks[K - 1] })).sort((x, y) => y.up - x.up)[0];
    const fall = rows.filter(r => r.ranks[0] != null && r.ranks[K - 1] != null).map(r => ({ r, up: r.ranks[0] - r.ranks[K - 1] })).sort((x, y) => x.up - y.up)[0];
    return { months: monthly.slice(s0).map(m => m.month), rows, maxRank, climb, fall, last };
  }, [monthly, mode, topN, focus, sel]);
  let title = 'Ranking mês a mês', body;
  if (!hist?.data && !hist?.error) body = <div className="nxc-skel" />;
  else if (!d) body = <p className="nx-note">{hist?.error ?? 'Não há série histórica suficiente para montar o ranking no recorte escolhido.'}</p>;
  else {
    if (d.climb && d.climb.up >= 2) title = <>{brandName(d.climb.r.name)} é quem mais subiu: do <em>{d.climb.r.ranks[0]}º ao {d.climb.r.ranks.at(-1)}º</em> lugar em 24 meses.</>;
    else title = 'As posições do ranking quase não mudaram em 24 meses.';
    body = <div className="nxc-scroll"><Bump months={d.months} rows={d.rows} maxRank={d.maxRank} picked={sel} onPick={r => setFilter('marca', sel === r.name ? 'all' : [r.name])} measure={mode === 'mes' ? 'Emplacamentos no mês' : 'Acumulado de 12 meses'} label="Posição de cada marca no ranking, mês a mês, nos últimos 24 meses" /></div>;
  }
  return (
    <Block className="nx-c12 nxc-o1" title={title}
      caption={`Posição de cada marca nos últimos 24 meses${mode === 'mes' ? ', mês a mês' : ', pelo acumulado de 12 meses (mais estável)'}.${d?.fall && d.fall.up <= -2 ? ` Quem mais caiu: ${brandName(d.fall.r.name)} (${d.fall.r.ranks[0]}º → ${d.fall.r.ranks.at(-1)}º).` : ''} Passe o mouse para destacar uma marca; clique para filtrar o painel.`}
      actions={<div className="nxc-ctl"><Seg label="Medida" value={mode} onChange={setMode} options={[{ value: 'mes', label: 'Mês a mês' }, { value: '12m', label: 'Acumulado 12 meses' }]} /><Seg label="Quantas marcas" value={topN} onChange={setTopN} options={[{ value: 8, label: 'Top 8' }, { value: 10, label: 'Top 10' }, { value: 15, label: 'Top 15' }]} /></div>}>
      <>
        {body}
        <p className="nx-note">{ignored.length ? `Esta série ignora: ${ignored.join(', ')}. ` : ''}Mostra as marcas do topo no último mês, mais a marca em foco. O ranking do painel, com outras dimensões (modelo, estado) e o período escolhido, vem logo abaixo{single ? ' e aparece quando o período tem dois meses ou mais' : ''}.</p>
      </>
    </Block>
  );
}
