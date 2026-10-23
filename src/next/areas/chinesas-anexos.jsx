import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { useTip } from '../charts.jsx';
import { fmt, monthLabel, pct, signed } from '../format.js';
import { Block } from '../ui.jsx';
import { brandTitle } from './chinesas.jsx';

const RED = '#e60f2d', GREY = '#aeaeb2', INK = '#1d1d1f';
const PLACEHOLDER = /^(N[AÃ]O\b|SEM\b|DESCONHECIDO|---)/i;
const THRESHOLDS = [[1, '≥ 1'], [100, '≥ 100'], [1000, '≥ 1.000']];

/* ---------- barras verticais, empilhadas ou agrupadas, no padrão visual do site ---------- */
function VBars({ groups, series, stacked = false, fmtValue = fmt, fmtAxis = fmtValue, label, signedAxis = false }) {
  const W = 1000, H = 440, pad = { l: 64, r: 16, t: 30, b: 44 }, tip = useTip();
  const tops = groups.map(g => (stacked ? g.values.reduce((s, v) => s + Math.max(0, v ?? 0), 0) : Math.max(...g.values.map(v => v ?? 0))));
  const lows = groups.map(g => Math.min(0, ...g.values.map(v => v ?? 0)));
  const hi = Math.max(1e-9, ...tops) * 1.1, lo = signedAxis ? Math.min(0, ...lows) * 1.2 : 0, rng = hi - lo, pow = 10 ** Math.floor(Math.log10(rng / 5));
  const step = [1, 2, 2.5, 5, 10].map(k => k * pow).find(v => rng / v <= 5.01);
  const max = Math.ceil(hi / step) * step, min = Math.floor(lo / step) * step, span = max - min;
  const Y = v => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b), zero = Y(0);
  const gw = (W - pad.l - pad.r) / groups.length, inner = gw * 0.64;
  const bw = stacked ? inner : inner / series.length;
  const ticks = Array.from({ length: Math.round(span / step) + 1 }, (_, i) => min + i * step);
  return (
    <>
      <svg className="nx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={tip.hide}>
        <g className="nx-axis">
          {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} /><text x={0} y={Y(t) + 4}>{fmtAxis(t)}</text></g>)}
          {groups.map((g, i) => <text key={g.label} x={pad.l + gw * i + gw / 2} y={H - 10} textAnchor="middle">{g.label}</text>)}
        </g>
        {groups.map((g, gi) => {
          const x0 = pad.l + gw * gi + (gw - inner) / 2;
          let acc = 0;
          return (
            <g key={g.label} onPointerMove={e => tip.show(e, <><strong>{g.label}</strong>{g.values.map((v, k) => v != null && <span key={k}><i style={{ background: series[k].color }} />{series[k].name} <b>{fmtValue(v)}</b></span>)}{g.note && <span>{g.note}</span>}</>)}>
              {g.values.map((v, k) => {
                if (v == null) return null;
                const x = stacked ? x0 : x0 + bw * k, a = stacked ? acc : 0, b = a + v;
                if (stacked) acc += Math.max(0, v);
                const y1 = Y(Math.max(a, b)), y2 = Y(Math.min(a, b));
                return <rect key={k} x={x + (stacked ? 0 : 2)} y={y1} width={bw - (stacked ? 0 : 4)} height={Math.max(1, y2 - y1)} rx={stacked ? 0 : 6} fill={g.colors?.[k] ?? series[k].color} className="nx-bar" />;
              })}
              {!stacked && g.values.map((v, k) => v != null && <text key={'t' + k} className="nx-endlabel" x={x0 + bw * k + bw / 2} y={(v >= 0 ? Y(v) - 8 : Y(v) + 24)} textAnchor="middle" fill={(g.colors?.[k] ?? series[k].color) === GREY ? INK : (g.colors?.[k] ?? series[k].color)}>{fmtValue(v)}</text>)}
              {stacked && <text className="nx-endlabel" x={x0 + inner / 2} y={Y(acc) - 8} textAnchor="middle" fill={INK}>{fmtValue(acc)}</text>}
            </g>
          );
        })}
        {signedAxis && <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} stroke="var(--nx-ink)" strokeOpacity=".35" />}
      </svg>
      {series.length > 1 || stacked ? <div className="nx-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div> : null}
      {tip.node}
    </>
  );
}

/* ---------- dados anuais a partir do histórico mensal (automóveis e comerciais leves, Brasil) ---------- */
export function useAnnual(hist, chosen) {
  const key = chosen.join('|');
  return useMemo(() => {
    const data = hist?.data;
    if (!data) return null;
    const { rows, countIndex } = engine.historyRows(data, { population: 'light' });
    const mi = 0, bi = data.dimensions.indexOf('marca') + 1, gi = data.dimensions.indexOf('grupo_modelo') + 1;
    const months = data.months, set = new Set(chosen);
    let lastComplete = months.length - 1; while (lastComplete > 0 && !months[lastComplete].complete) lastComplete--;
    const last = months[lastComplete].month, lastYear = +last.slice(0, 4), lastM = +last.slice(5, 7);
    const brandName = i => engine.chineseBase(data.dictionaries.marca[i]), modelName = i => String(data.dictionaries.grupo_modelo[i]).trim();
    const years = new Map(), ytd = new Map();   // ytd: Jan..lastM of each year, for the same-period comparison
    const slot = (map, y) => { if (!map.has(y)) map.set(y, { total: 0, brands: new Map(), models: new Map(), modelBrand: new Map() }); return map.get(y); };
    for (const r of rows) {
      const m = months[r[mi]]; if (!m || r[mi] > lastComplete) continue;
      const y = +m.month.slice(0, 4), n = r[countIndex], b = brandName(r[bi]), md = modelName(r[gi]);
      if (!b || PLACEHOLDER.test(b)) { slot(years, y).total += n; if (+m.month.slice(5, 7) <= lastM) slot(ytd, y).total += n; continue; }
      for (const [map, ok] of [[years, true], [ytd, +m.month.slice(5, 7) <= lastM]]) {
        if (!ok) continue;
        const s = slot(map, y); s.total += n;
        s.brands.set(b, (s.brands.get(b) ?? 0) + n);
        if (md && !PLACEHOLDER.test(md)) {
          s.models.set(md, (s.models.get(md) ?? 0) + n);
          if (!s.modelBrand.has(md)) s.modelBrand.set(md, new Map());
          s.modelBrand.get(md).set(b, (s.modelBrand.get(md).get(b) ?? 0) + n);
        }
      }
    }
    return { years, ytd, last, lastYear, lastM, set };
  }, [hist?.data, key]);
}

const chinese = (annual, name) => annual.set.has(name);
const ownerOf = byBrand => [...byBrand].sort((a, b) => b[1] - a[1])[0]?.[0];

/* ---------- Anexo 2 ---------- */
export function Anexo2({ annual }) {
  const [min, setMin] = useState(100);
  const view = useMemo(() => {
    if (!annual) return null;
    const ys = [...annual.years.keys()].filter(y => y >= 2022).sort();
    const out = ys.map(y => {
      const s = annual.years.get(y);
      const brands = [...s.brands].filter(([, n]) => n >= min).map(([b]) => b);
      const models = [...s.models].filter(([, n]) => n >= min).map(([m]) => m);
      const modelsCn = models.filter(m => chinese(annual, ownerOf(s.modelBrand.get(m))));
      return { y, brands, models, brandsCn: brands.filter(b => chinese(annual, b)), modelsCn };
    });
    const entered = out.map((o, i) => {
      const before = new Set(); for (const [y, s] of annual.years) if (y < o.y) for (const [b, n] of s.brands) if (n >= min) before.add(b);
      const prev = new Set(); for (const [y, s] of annual.years) if (y < o.y) for (const [b, n] of s.brands) if (n >= 1) prev.add(b);
      return { y: o.y, new: o.brands.filter(b => !before.has(b) && !(min === 1 && prev.has(b))).sort((a, b) => (annual.years.get(o.y).brands.get(b) ?? 0) - (annual.years.get(o.y).brands.get(a) ?? 0)).reverse() };
    }).filter(e => e.y > out[0].y);
    return { out, entered };
  }, [annual, min]);
  if (!view) return <Block exportScope="Brasil, automóveis e comerciais leves, meses completos desde 2016. Os filtros do topo não se aplicam; vale a seleção de marcas chinesas." className="nx-c12" title="Anexo 2 · Marcas e modelos no mercado brasileiro" sub="Carregando…"><div className="nxch-skel" /></Block>;
  const { out, entered } = view, a = out[0], z = out.at(-1), part = annual.lastYear === z.y && annual.lastM < 12;
  const yl = o => (o.y === annual.lastYear && annual.lastM < 12 ? `${o.y} (até ${monthLabel(annual.last).slice(0, 3)})` : String(o.y));
  const controls = <div className="nxch-ctl"><span className="nxch-lbl">Emplacamentos no ano</span><div className="nx-seg" role="group" aria-label="Mínimo de emplacamentos no ano">{THRESHOLDS.map(([k, l]) => <button key={k} type="button" aria-pressed={min === k} onClick={() => setMin(k)}>{l}</button>)}</div></div>;
  const brandsGroups = out.map(o => ({ label: yl(o), values: [o.brandsCn.length, o.brands.length - o.brandsCn.length] }));
  const modelsGroups = out.map(o => ({ label: yl(o), values: [o.modelsCn.length, o.models.length - o.modelsCn.length] }));
  const series = [{ name: 'Marcas chinesas', color: RED }, { name: 'Demais marcas', color: GREY }];
  const mseries = [{ name: 'Modelos de marcas chinesas', color: RED }, { name: 'Demais modelos', color: GREY }];
  const minText = min === 1 ? 'pelo menos 1 emplacamento no ano' : `pelo menos ${fmt(min)} emplacamentos no ano`;
  return (
    <>
      <Block exportScope="Brasil, automóveis e comerciais leves, meses completos desde 2016. Os filtros do topo não se aplicam; vale a seleção de marcas chinesas." className="nx-c6" title="Anexo 2 · Marcas no mercado" actions={controls}
        sub={<>De <em>{a.brands.length}</em> marcas em {a.y} para <em>{z.brands.length}</em> em {z.y}{part ? ` (até ${monthLabel(annual.last)})` : ''}; as chinesas passaram de {a.brandsCn.length} para <em>{z.brandsCn.length}</em>.</>}
        info={`Marcas com ${minText}, automóveis e comerciais leves, Brasil. Variantes (B)/(T) e grafias com hífen contam como uma só marca. ${part ? `${z.y} vai até ${monthLabel(annual.last)}, então o número final do ano pode ser maior. ` : ''}Muda o corte de volume nos botões ao lado.`}>
        <VBars groups={brandsGroups} series={series} stacked label="Número de marcas por ano" />
      </Block>
      <Block exportScope="Brasil, automóveis e comerciais leves, meses completos desde 2016. Os filtros do topo não se aplicam; vale a seleção de marcas chinesas." className="nx-c6" title="Anexo 2 · Modelos à venda" actions={controls}
        sub={<>De <em>{fmt(a.models.length)}</em> modelos em {a.y} para <em>{fmt(z.models.length)}</em> em {z.y}; os de marcas chinesas: de {fmt(a.modelsCn.length)} para <em>{fmt(z.modelsCn.length)}</em>.</>}
        info={`Modelos (grupo de modelos, que reúne as versões) com ${minText}. Cada modelo é atribuído à marca que mais o emplacou no ano. Automóveis e comerciais leves, Brasil. É o modelo com registro de emplacamento, não o catálogo oficial de cada montadora.`}>
        <VBars groups={modelsGroups} series={mseries} stacked label="Número de modelos por ano" />
      </Block>
      <Block exportScope="Brasil, automóveis e comerciais leves, meses completos desde 2016. Os filtros do topo não se aplicam; vale a seleção de marcas chinesas." className="nx-c12" title="Anexo 2 · Marcas que passaram a emplacar" sub="Marcas que atingiram o corte pela primeira vez a cada ano, desde 2022."
        info={`Marcas com ${minText} que não tinham atingido esse corte em nenhum ano anterior da base (2016 em diante). Em vermelho, as marcas chinesas da seleção.`}>
        <div className="nxch-entrants">
          {entered.map(e => (
            <div key={e.y} className="nxch-year"><h4>{e.y === annual.lastYear && annual.lastM < 12 ? `${e.y} · até ${monthLabel(annual.last).slice(0, 3)}` : e.y}<small>{e.new.length} {e.new.length === 1 ? 'marca' : 'marcas'}</small></h4>
              <div className="nx-chips">{e.new.length ? e.new.map(b => <span key={b} className={'nx-chip static' + (chinese(annual, b) ? ' on cn' : '')}>{brandTitle(b)}</span>) : <span className="nxch-empty">Nenhuma nova marca</span>}</div></div>
          ))}
        </div>
      </Block>
    </>
  );
}

/* ---------- Anexo 3 ---------- */
export function Anexo3({ annual }) {
  const [cut, setCut] = useState('year');
  const view = useMemo(() => {
    if (!annual) return null;
    const year = annual.lastM === 12 ? annual.lastYear : annual.lastYear - 1;
    const periods = {
      year: { label: `${year} vs ${year - 1}`, cur: annual.years.get(year), prev: annual.years.get(year - 1), a: year, b: year - 1, text: 'ano completo' },
      ytd: { label: `Jan–${monthLabel(annual.last).slice(0, 3)} ${annual.lastYear} vs ${annual.lastYear - 1}`, cur: annual.ytd.get(annual.lastYear), prev: annual.ytd.get(annual.lastYear - 1), a: annual.lastYear, b: annual.lastYear - 1, text: `janeiro a ${monthLabel(annual.last)}` },
    };
    const p = periods[cut]; if (!p.cur || !p.prev) return null;
    const split = s => { let cn = 0; for (const [b, n] of s.brands) if (chinese(annual, b)) cn += n; return { cn, other: s.total - cn, total: s.total }; };
    const cur = split(p.cur), prev = split(p.prev);
    const row = (name, c, q, color) => ({ name, color, cur: c, prev: q, growth: q > 0 ? c / q - 1 : null, delta: c - q });
    const rows = [row('Marcas chinesas', cur.cn, prev.cn, RED), row('Marcas tradicionais', cur.other, prev.other, '#2f6fed'), row('Mercado de leves', cur.total, prev.total, GREY)];
    const marketDelta = rows[2].delta;
    rows.forEach(r => { r.points = marketDelta ? r.delta / prev.total : null; r.shareNow = r.cur / cur.total; r.sharePrev = r.prev / prev.total; });
    return { p, rows, periods, marketDelta, prevTotal: prev.total };
  }, [annual, cut]);
  if (!view) return <Block exportScope="Brasil, automóveis e comerciais leves, meses completos desde 2016. Os filtros do topo não se aplicam; vale a seleção de marcas chinesas." className="nx-c12" title="Anexo 3 · Crescimento das chinesas" sub="Carregando…"><div className="nxch-skel" /></Block>;
  const { p, rows } = view, [cn, tr, mk] = rows;
  const groups = [{ label: 'Marcas chinesas', values: [cn.growth], note: `${fmt(cn.prev)} → ${fmt(cn.cur)}` }, { label: 'Marcas tradicionais', values: [tr.growth], note: `${fmt(tr.prev)} → ${fmt(tr.cur)}` }, { label: 'Mercado de leves', values: [mk.growth], note: `${fmt(mk.prev)} → ${fmt(mk.cur)}` }];
  const colored = groups.map((g, i) => ({ ...g, colors: [rows[i].color], values: [g.values[0] == null ? null : g.values[0] * 100] }));
  const series = [{ name: 'Crescimento sobre o período anterior (%)', color: RED }];
  const pctFmt = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const ptsFmt = v => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' p.p.');
  const controls = <div className="nxch-ctl"><div className="nx-seg" role="group" aria-label="Período">{Object.entries(view.periods).map(([k, v]) => <button key={k} type="button" aria-pressed={cut === k} onClick={() => setCut(k)}>{v.label}</button>)}</div></div>;
  const lead = cn.growth != null && mk.growth != null ? <>{cut === 'year' ? <>Em {p.a}</> : <>De janeiro a {monthLabel(annual.last).slice(0, 3)}/{p.a}, contra o mesmo período de {p.b}</>}, as marcas chinesas cresceram <em>{pctFmt(cn.growth * 100)}</em> contra {pctFmt(tr.growth * 100)} das tradicionais e {pctFmt(mk.growth * 100)} do mercado de leves.</> : 'Sem base de comparação.';
  return (
    <Block exportScope="Brasil, automóveis e comerciais leves, meses completos desde 2016. Os filtros do topo não se aplicam; vale a seleção de marcas chinesas." className="nx-c12" title="Anexo 3 · Crescimento: chinesas × tradicionais × mercado" sub={lead} actions={controls}
      info={`Emplacamentos (registros) de automóveis e comerciais leves no Brasil, ${p.text}: ${p.a} contra ${p.b}. "Marcas chinesas" é a seleção da página; "tradicionais" são todas as demais marcas. "Tradicionais" inclui CAOA Chery, CAOA Changan, MG e Volvo enquanto não estiverem na seleção. A contribuição diz quantos pontos do crescimento do mercado vieram de cada grupo.`}>
      <VBars groups={colored} series={series} signedAxis fmtValue={pctFmt} fmtAxis={v => Math.round(v) + '%'} label="Crescimento por grupo de marcas" />
      <div className="nxch-tablewrap"><table className="nxch-table">
        <thead><tr><th>Grupo</th><th>{p.b}</th><th>{p.a}</th><th>Variação</th><th>Unidades a mais</th><th>Contribuição ao mercado</th><th>Participação</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.name}><th><i style={{ background: r.color }} />{r.name}</th><td>{fmt(r.prev)}</td><td>{fmt(r.cur)}</td><td className={r.growth > 0 ? 'up' : r.growth < 0 ? 'down' : ''}>{r.growth == null ? '—' : pctFmt(r.growth * 100)}</td><td className={r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}>{(r.delta > 0 ? '+' : r.delta < 0 ? '−' : '') + fmt(Math.abs(r.delta))}</td><td>{r.name === 'Mercado de leves' ? '100%' : ptsFmt(r.points)}</td><td>{pct(r.sharePrev, 1)} → {pct(r.shareNow, 1)}</td></tr>)}</tbody>
      </table></div>
    </Block>
  );
}
