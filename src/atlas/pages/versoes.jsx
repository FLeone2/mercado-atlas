import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { Block } from '../base/block.jsx';
import { useAtlas } from '../ctx.js';
import { Scope, Seg, Skel } from '../ui.jsx';
import { Slope, Lines } from '../charts.jsx';
import { active, brandName, fmt, pct, signed, label, rangeText, versionLabel, periodMonths, lastCompleteIndex } from '../lib.js';

/* Versões (o campo modelo do Renavam). O ranking usa a consulta principal (todos os filtros);
   a comparação no tempo, o canal e o peso no segmento usam data/history/versions.json.gz. */

const FOCUS_COLORS = ['var(--nx-accent)', '#f0889a', '#9e0b22'];
const OTHER_COLORS = ['#1d1d1f', '#2f6fdf', '#2a9d8f', '#e09a2c', '#8e6bd1'];
const GEO = ['uf', 'regiao', 'municipio'];
const ok = r => r.count > 0 && !/classific|informado/i.test(r.name);
/* A marca em foco é calculada sem os filtros de modelo e versão; com um deles ativo, ela mostra
   só as versões que existem no recorte (market.groups.modelo já tem esses filtros). */
const inScope = (market, filters) => { if (!active(filters.modelo) && !active(filters.grupo_modelo)) return () => true; const set = new Set((market?.groups?.modelo ?? []).filter(r => r.count > 0).map(r => r.name)); return v => set.has(v); };

export function useVersions() {
  const { market } = useAtlas();
  return useMemo(() => {
    const info = new Map((market?.versionInfo ?? []).map(r => [r.modelo, r]));
    return { info, name: v => versionLabel(v, info.get(v)?.grupo_modelo), brand: v => info.get(v)?.marca ?? null, seg: v => info.get(v)?.bd_segmento ?? null };
  }, [market]);
}

/* Segmento principal da marca em foco (porte BD com mais emplacamentos dela no recorte). */
const mainSegOf = market => (market?.focus?.groups?.bd_segmento ?? []).find(r => ok(r))?.name ?? null;

/* ---------- ranking conectado das versões ---------- */
export function VersionRanking() {
  const { market, focusName, mFilters } = useAtlas(), V = useVersions();
  const [cmp, setCmp] = useState('ano'), [measure, setMeasure] = useState('volume'), [topN, setTopN] = useState(15);
  const segFiltered = active(mFilters.bd_segmento), mainSeg = mainSegOf(market);
  const [where, setWhere] = useState('seg');
  const inSeg = where === 'seg' && mainSeg && !segFiltered;
  const d = useMemo(() => {
    if (!market?.groups?.modelo) return null;
    const keep = r => ok(r) && (!inSeg || V.seg(r.name) === mainSeg);
    const cur = market.groups.modelo.filter(keep);
    const yearOk = Boolean(market.yearGroups?.modelo), mode = cmp === 'ano' && yearOk ? 'ano' : 'anterior';
    const prev = mode === 'ano' ? market.yearGroups.modelo.filter(keep) : cur.map(r => ({ name: r.name, count: r.previous ?? 0 }));
    const lab = r => ({ name: r.name, count: r.count, label: V.name(r.name) });
    const focusSet = new Set((market.focus?.groups?.modelo ?? []).filter(keep).slice(0, 3).map(r => r.name));
    const sum = rows => rows.reduce((s, r) => s + r.count, 0);
    const mv = (() => {
      const ra = new Map([...prev].sort((x, y) => y.count - x.count).map((r, i) => [r.name, i + 1])), rb = [...cur].sort((x, y) => y.count - x.count).slice(0, 30);
      const m = rb.map((r, i) => ({ r, d: (ra.get(r.name) ?? 999) - (i + 1) })).filter(x => ra.has(x.r.name));
      return { up: [...m].sort((x, y) => y.d - x.d)[0], top: rb[0] };
    })();
    return { a: prev.map(lab), b: cur.map(lab), focusSet, mode, labelA: rangeText(mode === 'ano' ? market.yearRange : market.previousRange), labelB: rangeText(market.range), totalA: sum(prev), totalB: sum(cur), mv };
  }, [market, V, cmp, inSeg, mainSeg]);
  if (!d) return <div className="nx-c12"><Skel h={520} /></div>;
  const segName = mainSeg ? label('bd_segmento', mainSeg).toLowerCase() : '';
  return (
    <Block className="nx-c12" title="Versões: quem ganhou e perdeu posições"
      sub={<>{d.labelA} → {d.labelB}{inSeg ? ' · em ' + segName : ''} · <em>vermelho</em> são as três versões mais vendidas da {focusName}{d.mv.top ? <> · mais vendida: {V.name(d.mv.top.name)} ({brandName(V.brand(d.mv.top.name))})</> : ''}</>}
      info="As versões são o campo modelo do registro (Renavam), com o nome do modelo no começo. Use os filtros de Modelo, Versão, Porte e Canal para focar; a posição escrita é a real entre as versões do recorte. Passe o mouse para ver a marca e o registro original."
      actions={<div className="px-ctl">
        {mainSeg && !segFiltered && <Seg label="Onde" value={where} onChange={setWhere} options={[['seg', 'Em ' + segName], ['all', 'Todo o recorte']]} />}
        <Seg label="Comparar com" value={cmp} onChange={setCmp} options={[['ano', 'Mesmo período, ano anterior'], ['anterior', 'Período anterior']]} />
        <Seg label="Medida" value={measure} onChange={setMeasure} options={[['volume', 'Volume'], ['share', 'Participação']]} />
        <Seg label="Quantas" value={topN} onChange={setTopN} options={[[10, 'Top 10'], [15, 'Top 15'], [25, 'Top 25']]} />
      </div>}>
      {d.mode !== cmp && <p className="px-scopenote">Sem o mesmo período do ano anterior para este recorte; comparando com o período anterior.</p>}
      <Slope a={d.a} b={d.b} focus={d.focusSet} measure={measure} topN={topN} labelA={d.labelA} labelB={d.labelB} totalA={d.totalA} totalB={d.totalB} />
    </Block>
  );
}

/* ---------- uma passada no histórico de versões: série mensal, canal, porte e modelo ---------- */
function versionTable(data, filters) {
  const { rows, countIndex } = engine.historyRows(data, filters), D = data.dimensions, dict = data.dictionaries, n = data.months.length;
  const col = d => D.indexOf(d) + 1, iv = col('modelo'), ib = col('marca'), ig = col('grupo_modelo'), is = col('bd_segmento'), ic = col('tipo_venda');
  const versions = new Map(), seg = new Map(), model = new Map();
  const arr = (map, k) => { let a = map.get(k); if (!a) { a = new Float64Array(n); map.set(k, a); } return a; };
  for (const r of rows) {
    const m = r[0], c = r[countIndex], v = dict.modelo[r[iv]], s = dict.bd_segmento[r[is]], g = dict.grupo_modelo[r[ig]];
    let x = versions.get(v);
    if (!x) { x = { series: new Float64Array(n), vd: new Float64Array(n), segs: new Map(), brand: dict.marca[r[ib]], model: g }; versions.set(v, x); }
    x.series[m] += c; if (dict.tipo_venda[r[ic]] === 'VD') x.vd[m] += c; x.segs.set(s, (x.segs.get(s) ?? 0) + c);
    arr(seg, s)[m] += c; arr(model, g)[m] += c;
  }
  for (const x of versions.values()) x.seg = [...x.segs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { months: data.months.map(m => m.month), complete: data.months.map(m => m.complete), versions, seg, model };
}
export function useVersionHistory() {
  const { mFilters, base } = useAtlas();
  const geo = GEO.some(k => active(mFilters[k]));
  const scope = useMemo(() => { const f = { ...mFilters }; for (const k of GEO) delete f[k]; return f; }, [mFilters]);
  const h = engine.useHistory(scope, base, true, 'versions');
  const table = useMemo(() => (h.data && h.file === 'versions' ? versionTable(h.data, scope) : null), [h.data, h.file, scope]);
  const ignored = [...(geo ? ['estado e município'] : []), ...engine.historyPlan(scope, 'versions').ignoredLabels];
  return { table, ignored, error: h.error };
}
const sumAt = (a, idx) => idx.reduce((s, i) => s + (a?.[i] ?? 0), 0);

/* ---------- versão × versão, de marcas diferentes ---------- */
export function VersionCompare() {
  const { market, focus, focusName, mFilters } = useAtlas(), V = useVersions(), { table: T, ignored, error } = useVersionHistory();
  const [picked, setPicked] = useState(null), [measure, setMeasure] = useState('vol'), [q, setQ] = useState('');
  const months = useMemo(() => periodMonths(market?.range), [market?.range]);
  const defaults = useMemo(() => {
    const scope = inScope(market, mFilters), fv = (market?.focus?.groups?.modelo ?? []).find(r => ok(r) && scope(r.name))?.name, seg = fv ? V.seg(fv) : null, out = fv ? [fv] : [], brands = new Set([focus]);
    for (const r of (market?.groups?.modelo ?? []).filter(ok)) {
      const b = V.brand(r.name); if (!b || brands.has(b) || (seg && V.seg(r.name) !== seg)) continue;
      brands.add(b); out.push(r.name); if (out.length >= 5) break;
    }
    return out;
  }, [market, V, focus, mFilters]);
  const chosen = (picked ?? defaults).slice(0, 5);
  const counts = useMemo(() => {
    const cur = new Map((market?.groups?.modelo ?? []).map(r => [r.name, r.count])), yr = new Map((market?.yearGroups?.modelo ?? []).map(r => [r.name, r.count]));
    // posição entre as versões do mesmo porte (picape média contra picape média)
    const bySeg = new Map(), rank = new Map();
    for (const r of [...(market?.groups?.modelo ?? [])].filter(ok).sort((a, b) => b.count - a.count)) { const k = V.seg(r.name); bySeg.set(k, (bySeg.get(k) ?? 0) + 1); rank.set(r.name, bySeg.get(k)); }
    return { cur, yr, rank, bySeg };
  }, [market, V]);
  const options = useMemo(() => (market?.groups?.modelo ?? []).filter(ok).slice(0, 600).map(r => ({ v: r.name, text: V.name(r.name) + ' · ' + brandName(V.brand(r.name)) })), [market, V]);
  const add = v => { if (!v || chosen.includes(v)) return; setPicked([...chosen, v].slice(-5)); setQ(''); };
  const remove = v => setPicked(chosen.filter(x => x !== v));
  const scoped = inScope(market, mFilters);
  const moreFocus = (market?.focus?.groups?.modelo ?? []).filter(ok).map(r => r.name).filter(v => scoped(v) && !chosen.includes(v)).slice(0, 4);

  const data = useMemo(() => {
    if (!market) return null;
    let fi = 0, oi = 0;
    const rows = chosen.map(v => {
      const b = V.brand(v), isF = b === focus, color = isF ? FOCUS_COLORS[fi++ % 3] : OTHER_COLORS[oi++ % 5];
      const c = counts.cur.get(v) ?? 0, y = counts.yr.get(v), x = T?.versions.get(v);
      let segShare = null, vd = null, inModel = null;
      if (T && x) {
        const idx = months.map(m => T.months.indexOf(m)).filter(i => i >= 0 && T.complete[i]), own = sumAt(x.series, idx);
        const segT = sumAt(T.seg.get(x.seg), idx), modT = sumAt(T.model.get(x.model), idx);
        segShare = segT > 0 ? own / segT : null; vd = own > 0 ? sumAt(x.vd, idx) / own : null; inModel = modT > 0 ? own / modT : null;
      }
      return { v, name: V.name(v), brand: b, isF, color, count: c, change: y > 0 ? c / y - 1 : null, isNew: !(y > 0) && c > 0, rank: counts.rank.get(v), seg: x?.seg ?? V.seg(v), segShare, vd, inModel, x };
    });
    let lines = null;
    if (T) {
      const ref = { complete: T.complete, months: T.months }, i1 = lastCompleteIndex(ref, market.range?.end?.slice(0, 7)), i0 = Math.max(0, i1 - 35);
      lines = { months: T.months.slice(i0, i1 + 1), series: rows.map(r => ({ name: r.name, color: r.color, width: r.isF ? 3.2 : 2.2, values: T.months.slice(i0, i1 + 1).map((_, k) => { const i = i0 + k, own = r.x?.series[i] ?? 0; if (measure === 'vol') return own; const st = T.seg.get(r.seg)?.[i] ?? 0; return st > 0 ? own / st : null; }) })) };
    }
    return { rows, lines };
  }, [market, chosen.join('|'), counts, T, months, measure, V, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Block className="nx-c12" title="Versão × versão" sub={<>{focusName} contra as versões mais vendidas de outras marcas no mesmo segmento · escolha até cinco versões de qualquer marca; para um duelo de modelos, marque vários em Mais filtros › Modelo (ex.: Triton, Hilux e Ranger)</>}
      info="Emplacamentos, variação e posição vêm da consulta com todos os filtros. Peso no segmento, peso no modelo, venda direta e as linhas mensais usam o histórico mensal por versão (meses completos do período)."
      actions={<div className="px-ctl">
        <div className="nx-chips">{chosen.map(v => <button key={v} type="button" className="nx-chip" onClick={() => remove(v)} title={'Tirar ' + v}>{V.name(v)}<span aria-hidden> ×</span></button>)}</div>
        {chosen.length < 5 && <label className="px-select px-vpick">Adicionar versão<input list="px-vlist" value={q} placeholder="digite modelo ou versão…" onChange={e => { const t = e.target.value, hit = options.find(o => o.text === t || o.v === t); if (hit) add(hit.v); else setQ(t); }} /><datalist id="px-vlist">{options.filter(o => !chosen.includes(o.v)).map(o => <option key={o.v} value={o.text} />)}</datalist></label>}
        {picked && <button type="button" className="px-btn-link" onClick={() => setPicked(null)}>Voltar ao padrão</button>}
      </div>}>
      {!data ? <Skel h={360} /> : !chosen.length ? <p className="px-scopenote">Nenhuma versão escolhida. Adicione uma versão acima.</p> : <>
        <div className="px-table-wrap"><table className="px-table px-cmp">
          <thead><tr><th>Versão</th><th>Marca</th><th>Emplacamentos</th><th>Var. a/a</th><th>Posição no segmento</th><th>Participação no segmento</th><th>No modelo</th><th>Venda direta</th></tr></thead>
          <tbody>{data.rows.map(r => <tr key={r.v} className={r.isF ? 'f' : ''}><th title={r.v}><i style={{ background: r.color }} />{r.name}</th><td>{brandName(r.brand)}</td><td>{fmt(r.count)}</td><td className={r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}>{r.isNew ? 'nova' : signed(r.change, 1)}</td><td>{r.rank ? r.rank + 'ª de ' + fmt(counts.bySeg.get(r.seg)) : '—'}</td><td>{r.segShare != null ? pct(r.segShare, 1) + ' · ' + label('bd_segmento', r.seg).toLowerCase() : '—'}</td><td>{r.inModel != null ? pct(r.inModel, 0) : '—'}</td><td>{pct(r.vd, 0)}</td></tr>)}</tbody>
        </table></div>
        {moreFocus.length > 0 && chosen.length < 5 && <div className="nx-chips px-vmore"><span>Outras versões da {focusName}:</span>{moreFocus.map(v => <button key={v} type="button" className="nx-chip" onClick={() => add(v)}>+ {V.name(v)}</button>)}</div>}
        <div className="px-vhead"><h4 className="px-h4">{measure === 'vol' ? 'Emplacamentos por mês' : 'Participação no segmento'}, 36 meses</h4><Seg label="Medida" value={measure} onChange={setMeasure} options={[['vol', 'Emplacamentos'], ['seg', 'Participação no segmento']]} /></div>
        {data.lines ? <Lines months={data.lines.months} series={data.lines.series} fmtY={measure === 'vol' ? fmt : v => pct(v, 0)} fmtTip={measure === 'vol' ? fmt : v => pct(v, 1)} height={300} label="Versões comparadas mês a mês" /> : error ? <p className="px-scopenote">Não foi possível carregar o histórico por versão ({error}).</p> : <Skel h={300} />}
        <Scope ignored={ignored} />
      </>}
    </Block>
  );
}

/* ---------- barras de versões dentro de um segmento (página da marca em foco) ---------- */
export function segmentVersionRows(T, seg, months, focus, V, top = 10) {
  if (!T) return null;
  const idx = months.map(m => T.months.indexOf(m)).filter(i => i >= 0 && T.complete[i]), segTotal = sumAt(T.seg.get(seg), idx);
  if (!(segTotal > 0)) return [];
  // cada versão conta no seu porte principal (quase sempre o único)
  const all = [...T.versions].filter(([, x]) => x.seg === seg).map(([v, x]) => ({ v, brand: x.brand, model: x.model, n: sumAt(x.series, idx) })).filter(r => r.n > 0).sort((a, b) => b.n - a.n);
  const row = (r, i) => ({ key: r.v, label: versionLabel(r.v, r.model), brand: brandName(r.brand), value: r.n, rank: i + 1, valueText: pct(r.n / segTotal, 1), hl: r.brand === focus, title: r.v });
  const extra = all.map((r, i) => ({ r, i })).filter(({ r, i }) => r.brand === focus && i >= top).slice(0, 3);
  return [...all.slice(0, top).map(row), ...(extra.length ? [{ key: 'gap', label: '···', brand: '', value: 0, rank: '', valueText: '', gap: true }, ...extra.map(({ r, i }) => row(r, i))] : [])];
}

/* ---------- versões da marca em foco ---------- */
export function FocusVersions() {
  const { market, focusName, mFilters } = useAtlas(), V = useVersions(), [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const f = market?.focus; if (!f?.groups?.modelo) return null;
    const y = new Map((f.yearGroups?.modelo ?? []).map(r => [r.name, r.count])), byModel = new Map(), scope = inScope(market, mFilters), mine = f.groups.modelo.filter(r => scope(r.name)), total = mine.reduce((a, r) => a + r.count, 0);
    for (const r of mine) { const g = V.info.get(r.name)?.grupo_modelo; byModel.set(g, (byModel.get(g) ?? 0) + r.count); }
    return mine.filter(ok).map(r => { const g = V.info.get(r.name)?.grupo_modelo, y0 = y.get(r.name); return { v: r.name, name: V.name(r.name), model: g, count: r.count, ofBrand: total > 0 ? r.count / total : 0, ofModel: byModel.get(g) > 0 ? r.count / byModel.get(g) : null, change: y0 > 0 ? r.count / y0 - 1 : null, isNew: !(y0 > 0) }; });
  }, [market, V, mFilters]);
  if (!rows) return <div className="nx-c12"><Skel h={260} /></div>;
  const shown = all ? rows : rows.slice(0, 12), max = Math.max(...rows.map(r => r.ofBrand), 1e-9);
  return (
    <Block className="nx-c12" title="Emplacamentos por versão" sub={<>{rows.length} versões com emplacamento no recorte · a mais vendida é <em>{rows[0] ? rows[0].name : '—'}</em>{rows[0] ? ' (' + pct(rows[0].ofBrand, 0) + ' da marca)' : ''}</>}
      info="Para ver só as versões de um modelo, use Mais filtros › Modelo. Peso no modelo = emplacamentos da versão ÷ emplacamentos do modelo dela no recorte.">
      <div className="px-table-wrap"><table className="px-table">
        <thead><tr><th>Versão</th><th>Modelo</th><th>Emplacamentos</th><th>Var. a/a</th><th>Da marca</th><th>No modelo</th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.v}><th title={r.v}>{r.name}</th><td>{label('grupo_modelo', r.model ?? '—')}</td><td>{fmt(r.count)}</td><td className={r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}>{r.isNew ? 'nova' : signed(r.change, 0)}</td><td className="f">{pct(r.ofBrand, 1)}<span className="px-tbar"><span style={{ width: r.ofBrand / max * 100 + '%' }} /></span></td><td>{pct(r.ofModel, 0)}</td></tr>)}</tbody>
      </table></div>
      {rows.length > 12 && <button type="button" className="px-btn-link" onClick={() => setAll(!all)}>{all ? 'Mostrar só as 12 maiores' : 'Mostrar as ' + rows.length + ' versões'}</button>}
    </Block>
  );
}

