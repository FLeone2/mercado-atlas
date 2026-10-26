import { useMemo } from 'react';
import { engine } from 'virtual:market';
import { Block } from '../base/block.jsx';
import { UfMap } from '../base/geo.jsx';
import '../base/geo.css';
import { useAtlas } from '../ctx.js';
import { PageHead, Section, Scope, Skel } from '../ui.jsx';
import { Lines, Scatter } from '../charts.jsx';
import { brandName, fmt, pct, signed, label, list, monthLabel, rangeText, UF_NAMES, historyGroup, ignoredBy, lastCompleteIndex, periodMonths } from '../lib.js';
import { FocusVersions, segmentVersionRows, useVersionHistory, useVersions } from './versoes.jsx';

const COMP = ['#1d1d1f', '#8e8e93', '#c7c7cc'];

/* Barras de modelos com destaque para os da marca em foco */
function ModelBars({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="px-mbars">{rows.map(r => (
      <div key={r.key} className={'px-mbar' + (r.hl ? ' hl' : '') + (r.gap ? ' gap' : '')}>
        <span className="px-mbar-n" title={r.title}><i>{r.rank}</i>{r.label}<small>{r.brand}</small></span>
        <span className="px-mbar-t"><span style={{ transform: `scaleX(${Math.max(.004, r.value / max)})` }} /></span>
        <span className="px-mbar-v">{r.valueText}</span>
      </div>))}
    </div>
  );
}

export default function Foco() {
  const { market, focus, focusName, hist, mFilters, tip, setFilter, base } = useAtlas();
  // o histórico por UF (para cruzar estado × segmento × marca), com os mesmos filtros
  const ufScope = useMemo(() => ({ ...mFilters, uf: Array.isArray(mFilters.uf) && mFilters.uf.length ? mFilters.uf : Object.keys(UF_NAMES) }), [mFilters]);
  const histUF = engine.useHistory(ufScope, base, true);
  const ignored = ignoredBy(mFilters), end = market?.range?.end?.slice(0, 7);
  const vh = useVersionHistory(), V = useVersions();
  const months = useMemo(() => periodMonths(market?.range), [market?.range]);

  /* ---------- modelos da marca ---------- */
  const models = useMemo(() => {
    const f = market?.focus; if (!f?.groups?.grupo_modelo) return null;
    const y = new Map((f.yearGroups?.grupo_modelo ?? []).map(r => [r.name, r.count]));
    // a marca em foco vem sem os filtros de modelo/versão; com um deles ativo, só os modelos do recorte
    const narrowed = list(mFilters.grupo_modelo).length || list(mFilters.modelo).length, there = new Set((market.groups?.grupo_modelo ?? []).filter(r => r.count > 0).map(r => r.name));
    return f.groups.grupo_modelo.filter(r => r.count > 0 && (!narrowed || there.has(r.name))).map(r => ({ name: r.name, count: r.count, share: f.total > 0 ? r.count / f.total : 0, change: y.get(r.name) > 0 ? r.count / y.get(r.name) - 1 : null, before: y.get(r.name) ?? 0 }));
  }, [market, mFilters]);

  /* ---------- os segmentos onde a marca compete ---------- */
  const segs = useMemo(() => {
    const f = market?.focus; if (!f?.groups?.bd_segmento || !hist.data) return null;
    const main = f.groups.bd_segmento.filter(r => r.count > 0 && r.count / f.total >= .05 && !/classific|correspond/i.test(r.name)).slice(0, 3);
    return main.map(sg => {
      const g = historyGroup(hist.data, { ...mFilters, bd_segmento: [sg.name] }, ['marca']), gm = historyGroup(hist.data, { ...mFilters, bd_segmento: [sg.name] }, ['grupo_modelo', 'marca']);
      if (!g) return { seg: sg.name, missing: true };
      const i1 = lastCompleteIndex(g, end), i0 = Math.max(0, i1 - 35), ms = g.months.slice(i0, i1 + 1);
      const idx = months.map(m => g.months.indexOf(m)).filter(i => i >= 0 && i <= i1);
      const sum = a => idx.reduce((s, i) => s + (a?.[i] ?? 0), 0), segTotal = idx.reduce((s, i) => s + g.total[i], 0);
      const brands = [...g.by].map(([n, a]) => [n, sum(a)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      const fr = brands.findIndex(([n]) => n === focus), rivals = brands.filter(([n]) => n !== focus).slice(0, 2).map(([n]) => n);
      const sh = n => ms.map((_, k) => (g.total[i0 + k] > 0 ? (g.by.get(n)?.[i0 + k] ?? 0) / g.total[i0 + k] : null));
      let rows = null;
      if (gm) {
        const all = [...gm.by].map(([k, a]) => { const [model, brand] = k.split('|'); return { model, brand, v: sum(a) }; }).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
        const top = all.slice(0, 10), extra = all.map((r, i) => ({ r, i })).filter(({ r, i }) => r.brand === focus && i >= 10).slice(0, 2);
        const row = (r, i) => ({ key: r.model + r.brand, label: label('grupo_modelo', r.model), brand: brandName(r.brand), value: r.v, rank: i + 1, valueText: pct(r.v / segTotal, 1), hl: r.brand === focus });
        rows = [...top.map(row), ...(extra.length ? [{ key: 'gap', label: '···', brand: '', value: 0, rank: '', valueText: '', gap: true }, ...extra.map(({ r, i }) => row(r, i))] : [])];
      }
      return { seg: sg.name, ofBrand: sg.count / f.total, segTotal, share: segTotal > 0 ? (brands[fr]?.[1] ?? 0) / segTotal : 0, rank: fr >= 0 ? fr + 1 : null, n: brands.length, ms, series: [{ name: focusName, values: sh(focus), color: 'var(--nx-accent)', width: 3.5 }, ...rivals.map((n, k) => ({ name: brandName(n), values: sh(n), color: COMP[k] }))], rows };
    });
  }, [market, hist.data, mFilters, end, months, focus, focusName]);

  /* ---------- canal: participação da venda direta ---------- */
  const channel = useMemo(() => {
    const g = historyGroup(hist.data, mFilters, ['tipo_venda', 'marca']); if (!g) return null;
    const i1 = lastCompleteIndex(g, end), i0 = Math.max(0, i1 - 35), ms = g.months.slice(i0, i1 + 1);
    const pick = (ch, brand) => ms.map((_, k) => { let s = 0; for (const [key, a] of g.by) { const [c, b] = key.split('|'); if (c === ch && (!brand || b === brand)) s += a[i0 + k]; } return s; });
    const vdF = pick('VD', focus), vaF = pick('VAREJO', focus), vdM = pick('VD'), vaM = pick('VAREJO');
    const r = (a, b) => a.map((v, k) => (v + b[k] > 0 ? v / (v + b[k]) : null));
    return { ms, f: r(vdF, vaF), m: r(vdM, vaM) };
  }, [hist.data, mFilters, end, focus]);

  /* ---------- força por estado e onde crescer ---------- */
  const ufs = useMemo(() => {
    if (!market?.focus?.groups?.uf) return null;
    const f = new Map(market.focus.groups.uf.map(r => [r.name, r.count])), nat = market.total > 0 ? market.focus.total / market.total : 0;
    return (market.groups?.uf ?? []).filter(r => UF_NAMES[r.name] && r.count > 0).map(r => { const s = (f.get(r.name) ?? 0) / r.count; return { uf: r.name, total: r.count, focus: f.get(r.name) ?? 0, share: s, index: nat > 0 ? s / nat : 0 }; });
  }, [market]);
  const grow = useMemo(() => {
    const seg = segs?.[0]?.seg; if (!seg || !histUF.data) return null;
    const g = historyGroup(histUF.data, { ...ufScope, bd_segmento: [seg] }, ['uf', 'marca']); if (!g) return null;
    const idx = months.map(m => g.months.indexOf(m)).filter(i => i >= 0 && g.complete[i]);
    const tot = new Map(), foc = new Map();
    for (const [key, a] of g.by) { const [u, b] = key.split('|'), v = idx.reduce((s, i) => s + a[i], 0); tot.set(u, (tot.get(u) ?? 0) + v); if (b === focus) foc.set(u, (foc.get(u) ?? 0) + v); }
    const rows = [...tot].filter(([u, v]) => UF_NAMES[u] && v >= 20).map(([u, v]) => ({ key: u, x: v, y: (foc.get(u) ?? 0) / v, hot: false }));
    const med = a => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] ?? 0; };
    const mx = med(rows.map(r => r.x)), my = med(rows.map(r => r.y));
    rows.forEach(r => { r.hot = r.x >= mx && r.y < my; r.tip = <><strong>{UF_NAMES[r.key]}</strong><span>{label('bd_segmento', seg)}: <b>{fmt(r.x)}</b> emplacamentos</span><span>{focusName}: <b>{pct(r.y, 1)}</b></span></>; });
    const opp = rows.filter(r => r.hot).sort((a, b) => b.x * (my - b.y) - a.x * (my - a.y)).slice(0, 3);
    return { seg, rows, mx, my, opp };
  }, [segs, histUF.data, ufScope, months, focus, focusName]);

  const strong = ufs ? [...ufs].filter(r => r.total >= 300).sort((a, b) => b.index - a.index) : [];
  const maxIdx = Math.max(2, ...strong.map(r => r.index));
  return (
    <div className="px-page">
      <PageHead title={focusName} toc={[['f-modelos', 'Modelos'], ['f-versoes', 'Versões'], ['f-segmentos', 'Segmentos'], ['f-canal', 'Canal'], ['f-estados', 'Estados'], ['f-crescer', 'Onde crescer']]} />

      <Section id="f-modelos" title={'Modelos da ' + focusName} sub={models?.[0] ? <>{label('grupo_modelo', models[0].name)} responde por {pct(models[0].share, 0)} das vendas da marca no período.</> : null}>
        {!models ? <div className="nx-c12"><Skel h={160} /></div> : (
          <Block className="nx-c12" title="Emplacamentos por modelo" sub={'Variação contra ' + (market?.yearRange ? rangeText(market.yearRange) : 'o ano anterior')}>
            <div className="px-models">{models.slice(0, 8).map(m => (
              <div key={m.name} className="px-model">
                <span className="px-model-n">{label('grupo_modelo', m.name)}</span>
                <b>{fmt(m.count)}</b>
                <span className={m.change > 0 ? 'up' : m.change < 0 ? 'down' : ''}>{m.change == null ? (m.before ? '—' : 'novo') : signed(m.change, 0)}</span>
                <span className="px-model-s"><span style={{ width: m.share * 100 + '%' }} /></span>
                <small>{pct(m.share, 0)} da marca</small>
              </div>))}
            </div>
          </Block>
        )}
      </Section>

      <Section id="f-versoes" title={'Versões da ' + focusName} sub="Cada versão como aparece no registro, com o nome do modelo na frente. Escolha um modelo em Mais filtros para ver só as versões dele.">
        <FocusVersions />
      </Section>

      <Section id="f-segmentos" title="Onde a marca compete" sub="Os segmentos (porte BD) que somam ao menos 5% das vendas da marca: participação no tempo e o ranking dos modelos e das versões no período.">
        {!segs ? <div className="nx-c12"><Skel h={420} /></div> : segs.map(s => s.missing ? <Block key={s.seg} className="nx-c12" title={label('bd_segmento', s.seg)}><Scope ignored={ignored} /></Block> : (
          <Block key={s.seg} className="nx-c12" title={<>{label('bd_segmento', s.seg)} <span className="px-pill">{pct(s.ofBrand, 0)} das vendas da marca</span></>} sub={<>{focusName} é a {s.rank ? s.rank + 'ª' : '—'} de {s.n} marcas, com <em>{pct(s.share, 1)}</em> de {fmt(s.segTotal)} emplacamentos no período</>}>
            <div className="px-split">
              <div><h4 className="px-h4">Participação no segmento, 36 meses</h4><Lines months={s.ms} series={s.series} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} height={280} label={'Participação em ' + label('bd_segmento', s.seg)} /></div>
              <div><h4 className="px-h4">Modelos no período</h4>{s.rows ? <ModelBars rows={s.rows} /> : <p className="px-scopenote">O ranking de modelos usa o histórico nacional; com filtro de estado ele fica indisponível.</p>}</div>
            </div>
            {(() => { const vr = segmentVersionRows(vh.table, s.seg, months, focus, V); return <div className="px-vseg"><h4 className="px-h4">Versões no período</h4>{vr ? (vr.length ? <ModelBars rows={vr} /> : <p className="px-scopenote">Sem versões neste recorte.</p>) : vh.error ? <p className="px-scopenote">Histórico por versão indisponível ({vh.error}).</p> : <Skel h={300} />}</div>; })()}
            <Scope ignored={[...new Set([...ignored, ...vh.ignored])]} />
          </Block>
        ))}
      </Section>

      <Section id="f-canal" title="Varejo e venda direta" sub={channel ? <>No último mês completo, {pct(channel.f.at(-1), 0)} das vendas de {focusName} foram venda direta, contra {pct(channel.m.at(-1), 0)} no mercado.</> : null}>
        {!channel ? <div className="nx-c12"><Skel h={280} /></div> : (
          <Block className="nx-c12" title="Participação da venda direta nas vendas" sub="Venda direta: locadoras, frotistas, produtor rural, PcD e governo">
            <Lines months={channel.ms} series={[{ name: focusName, values: channel.f, color: 'var(--nx-accent)', width: 3.5 }, { name: 'Mercado', values: channel.m, color: 'var(--nx-ink)' }]} fmtY={v => pct(v, 0)} fmtTip={v => pct(v, 1)} height={280} label="Participação da venda direta" />
            <Scope ignored={ignored} />
          </Block>
        )}
      </Section>

      <Section id="f-estados" title="Onde a marca é forte" sub={strong[0] ? <>Índice = participação no estado ÷ participação no país. Mais forte em {UF_NAMES[strong[0].uf]} ({strong[0].index.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×).</> : null}>
        {!ufs ? <div className="nx-c12"><Skel h={360} /></div> : <>
          <Block className="nx-c6" title="Índice por estado" sub="Vermelho mais forte: a marca vende mais ali do que na média do país">
            <UfMap label={'Índice de ' + focusName + ' por estado'} tip={tip} onPick={u => setFilter('uf', [u])} paint={u => { const r = ufs.find(x => x.uf === u); return { fill: r && r.index >= 1 ? 'var(--nx-accent)' : '#8e8e93', opacity: r ? (r.index >= 1 ? .25 + .75 * Math.min(1, (r.index - 1) / (maxIdx - 1)) : .15 + .5 * (1 - r.index)) : .05, tip: <><strong>{UF_NAMES[u]}</strong>{r ? <><span>{focusName}: <b>{pct(r.share, 2)}</b> do mercado</span><span>Índice <b>{r.index.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×</b></span><span>{fmt(r.focus)} de {fmt(r.total)}</span></> : <span>Sem dados</span>}</> }; }} />
          </Block>
          <Block className="nx-c6" title="Mais forte e mais fraca" sub="Estados com 300 emplacamentos ou mais no período">
            <div className="px-strength">
              {[...strong.slice(0, 6), null, ...strong.slice(-4)].map((r, i) => r ? (
                <div key={r.uf} className={'px-str' + (r.index >= 1 ? ' hi' : '')}><span>{UF_NAMES[r.uf]}</span><span className="px-str-t"><span style={{ width: Math.min(100, r.index / maxIdx * 100) + '%' }} /></span><b>{r.index.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}×</b><small>{pct(r.share, 2)}</small></div>
              ) : <div key={'gap' + i} className="px-str gap">···</div>)}
            </div>
          </Block>
        </>}
      </Section>

      <Section id="f-crescer" title="Onde crescer" sub={grow?.opp?.length ? <>Em {label('bd_segmento', grow.seg).toLowerCase()}, os maiores mercados onde a marca está abaixo da mediana: {grow.opp.map(r => UF_NAMES[r.key]).join(', ')}.</> : null}>
        {!grow ? <div className="nx-c12"><Skel h={360} /></div> : (
          <Block className="nx-c12" title={'Tamanho de ' + label('bd_segmento', grow.seg).toLowerCase() + ' × participação de ' + focusName + ', por estado'} sub="Linhas tracejadas: medianas · em vermelho, mercado acima da mediana e participação abaixo dela">
            <Scatter rows={grow.rows} xLabel="Emplacamentos do segmento no estado" yLabel="Participação" medX={grow.mx} medY={grow.my} />
            <Scope ignored={ignored} extra={'Meses completos de ' + (months.length ? monthLabel(months[0]) + (months.length > 1 ? ' a ' + monthLabel(months.at(-1)) : '') : 'período') + '.'} />
          </Block>
        )}
      </Section>
    </div>
  );
}

