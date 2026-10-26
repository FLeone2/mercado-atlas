import { useMemo, useState } from 'react';
import { engine } from 'virtual:market';
import { Block } from '../base/block.jsx';
import { useWidth } from '../base/model-charts.jsx';
import { useAtlas } from '../ctx.js';
import { Seg, Skel } from '../ui.jsx';
import { brandName, fmt, pct } from '../lib.js';

/* Conexões: o caminho de cada emplacamento (origem → canal → combustível → tipo de veículo, Sankey)
   e quem vende o quê em cada região (cordas). Dados: flowPaths e connections da consulta 'conexoes'. */

const COLS = [['origem', 'Origem'], ['canal', 'Canal'], ['combustivel', 'Combustível'], ['segmento', 'Tipo de veículo']];
const ORDER = { origem: ['Nacional', 'Importado'], canal: ['Varejo', 'Venda direta', 'Canal não informado'], combustivel: ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Híbrido leve', 'Híbrido', 'Híbrido plug-in', 'Elétrico'] };
const ORIGIN = { Nacional: '#1d1d1f', Importado: '#2f6fdf' };
const FUEL = { Flex: '#3d7a6b', Diesel: '#a0957a', Gasolina: '#8fb3a0', Etanol: '#6f9c8c', Elétrico: '#2f6fdf', 'Híbrido plug-in': '#7d84b8', Híbrido: '#c9a257', 'Híbrido leve': '#b3b58f' };
const BRAND = ['#1d1d1f', '#2f6fdf', '#2a9d8f', '#e09a2c', '#8e6bd1', '#5b8c3a'];
const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const share = (a, b) => (b > 0 ? pct(a / b, a / b < .1 ? 1 : 0) : '—');

/* ---------- Sankey ---------- */
function flowModel(paths, topSegments = 8) {
  const rows0 = (paths ?? []).filter(p => p.origem !== 'Não classificado' && p.combustivel !== 'Não classificado' && p.segmento !== 'Não classificado');
  const dropped = (paths ?? []).reduce((s, p) => s + p.count, 0) - rows0.reduce((s, p) => s + p.count, 0);
  const bySeg = new Map(); for (const p of rows0) bySeg.set(p.segmento, (bySeg.get(p.segmento) ?? 0) + p.count);
  const keep = new Set([...bySeg].filter(([k]) => k !== 'Outros').sort((a, b) => b[1] - a[1]).slice(0, topSegments).map(([k]) => k));
  const rows = rows0.map(p => ({ ...p, segmento: keep.has(p.segmento) ? p.segmento : 'Outros' }));
  const total = rows.reduce((s, p) => s + p.count, 0);
  const columns = COLS.map(([key, title]) => {
    const t = new Map(); for (const p of rows) t.set(p[key], (t.get(p[key]) ?? 0) + p.count);
    const fixed = ORDER[key], pos = n => (fixed ? (fixed.indexOf(n) < 0 ? 99 : fixed.indexOf(n)) : 0);
    const names = [...t.keys()].sort((a, b) => (fixed ? pos(a) - pos(b) : (a === 'Outros') - (b === 'Outros') || t.get(b) - t.get(a)));
    return { key, title, nodes: names.map(name => ({ name, value: t.get(name) })) };
  });
  return { rows, total, dropped, columns };
}

function Sankey({ model }) {
  const [ref, w] = useWidth(), { tip } = useAtlas(), [hot, setHot] = useState(null);
  // no celular o desenho mantém 640 px e o cartão rola para o lado (quatro colunas não cabem em 340 px)
  const W = Math.max(640, w || 1000), H = 460, top = 30;
  const left = 120, right = 160, nodeW = 12;
  const L = useMemo(() => {
    const cols = model.columns, maxN = Math.max(...cols.map(c => c.nodes.length)), minGap = 10, scale = (H - top - (maxN - 1) * minGap) / model.total;
    const step = (W - left - right - nodeW) / (cols.length - 1);
    const nodes = cols.map((c, ci) => { const gap = c.nodes.length > 1 ? (H - top - model.total * scale) / (c.nodes.length - 1) : 0; let y = top; return c.nodes.map((n, i) => { const o = { ...n, ci, i, x: left + ci * step, y, h: n.value * scale }; y += o.h + gap; return o; }); });
    const at = (ci, name) => nodes[ci].find(n => n.name === name);
    const links = [];
    for (let c = 0; c < cols.length - 1; c++) {
      const a = COLS[c][0], b = COLS[c + 1][0], map = new Map();
      for (const p of model.rows) { const k = p[a] + '\u0001' + p[b] + '\u0001' + p.origem; map.set(k, (map.get(k) ?? 0) + p.count); }
      for (const [k, value] of map) { const [from, to, origin] = k.split('\u0001'); links.push({ c, from, to, origin, value, s: at(c, from), t: at(c + 1, to) }); }
    }
    const orank = o => ORDER.origem.indexOf(o);
    for (const n of nodes.flat()) {
      let y = n.y; for (const l of links.filter(l => l.s === n).sort((p, q) => p.t.i - q.t.i || orank(p.origin) - orank(q.origin))) { l.y0 = y; y += l.value * scale; }
      y = n.y; for (const l of links.filter(l => l.t === n).sort((p, q) => p.s.i - q.s.i || orank(p.origin) - orank(q.origin))) { l.y1 = y; y += l.value * scale; }
    }
    return { nodes, links, scale };
  }, [model, W, H, left, right]);
  const band = (l, h) => { const x0 = l.s.x + nodeW, x1 = l.t.x, xm = (x0 + x1) / 2; return `M${x0},${l.y0}C${xm},${l.y0} ${xm},${l.y1} ${x1},${l.y1}L${x1},${l.y1 + h}C${xm},${l.y1 + h} ${xm},${l.y0 + h} ${x0},${l.y0 + h}Z`; };
  // nó em destaque: os caminhos inteiros que passam por ele, desenhados por cima de cada faixa
  const lit = useMemo(() => {
    if (!hot) return null;
    const key = COLS[hot.ci][0], through = model.rows.filter(p => p[key] === hot.name), m = new Map();
    for (let c = 0; c < COLS.length - 1; c++) { const a = COLS[c][0], b = COLS[c + 1][0]; for (const p of through) { const k = c + '\u0001' + p[a] + '\u0001' + p[b] + '\u0001' + p.origem; m.set(k, (m.get(k) ?? 0) + p.count); } }
    return { m, total: through.reduce((s, p) => s + p.count, 0) };
  }, [hot, model]);
  const showNode = (e, n) => { setHot(n); tip.show(e, <><strong>{n.name}</strong><span><b>{fmt(n.value)}</b> · {share(n.value, model.total)} do total</span><span>Os caminhos que passam por aqui ficam em destaque.</span></>); };
  const showLink = (e, l) => tip.show(e, <><strong>{l.from} → {l.to}</strong><span>{l.origin}: <b>{fmt(l.value)}</b></span><span>{share(l.value, l.s.value)} de {l.from.toLowerCase()}</span></>);
  return (
    <div ref={ref} className="px-sankey" onMouseLeave={() => { setHot(null); tip.hide(); }}>
      <svg width={W} height={H + 4} role="img" aria-label="Sankey: origem, canal, combustível e tipo de veículo">
        {model.columns.map((c, ci) => <text key={c.key} x={L.nodes[ci][0].x + (ci === 0 ? 0 : ci === COLS.length - 1 ? nodeW : nodeW / 2)} y={14} className="px-sk-col" textAnchor={ci === 0 ? 'start' : ci === COLS.length - 1 ? 'end' : 'middle'}>{c.title}</text>)}
        <g>{L.links.map((l, i) => <path key={i} d={band(l, l.value * L.scale)} fill={ORIGIN[l.origin] ?? '#8e8e93'} opacity={lit ? .06 : .16} onMouseMove={e => showLink(e, l)} onMouseLeave={tip.hide} />)}</g>
        {lit && <g pointerEvents="none">{L.links.map((l, i) => { const v = lit.m.get(l.c + '\u0001' + l.from + '\u0001' + l.to + '\u0001' + l.origin); return v ? <path key={i} d={band(l, v * L.scale)} fill={ORIGIN[l.origin] ?? '#8e8e93'} opacity={.5} /> : null; })}</g>}
        {L.nodes.flat().map(n => {
          const last = n.ci === COLS.length - 1, first = n.ci === 0, on = hot && hot.ci === n.ci && hot.name === n.name;
          const lx = first ? n.x - 6 : n.x + nodeW + 6, anchor = first ? 'end' : 'start', showLabel = n.h >= 11 || first || last;
          return (
            <g key={n.ci + n.name} onMouseMove={e => showNode(e, n)} onMouseLeave={() => { setHot(null); tip.hide(); }} style={{ cursor: 'default' }}>
              <rect x={n.x} y={n.y} width={nodeW} height={Math.max(1.5, n.h)} rx={3} fill={n.ci === 0 ? ORIGIN[n.name] : n.ci === 2 ? FUEL[n.name] ?? '#8e8e93' : '#6e6e73'} opacity={on || !hot ? 1 : .5} />
              {showLabel && <text x={lx} y={n.y + Math.max(n.h, 1) / 2} dy=".35em" textAnchor={anchor} className={'px-sk-l' + (on ? ' on' : '')}>{n.name}<tspan className="px-sk-v"> {share(n.value, model.total)}</tspan></text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- cordas ---------- */
function chordModel(conn, focus) {
  if (!conn) return null;
  const rb = conn.regionBrand ?? [], bf = conn.brandFuel ?? [], bt = new Map(); for (const r of bf) bt.set(r.marca, (bt.get(r.marca) ?? 0) + r.count);
  const ranked = [...bt].sort((a, b) => b[1] - a[1]).map(([b]) => b), brands = ranked.slice(0, 6);
  if (bt.has(focus) && !brands.includes(focus)) brands.push(focus);
  if (ranked.some(b => !brands.includes(b))) brands.push('OUTRAS');
  const grp = b => (brands.includes(b) ? b : 'OUTRAS');
  const ft = new Map(); for (const r of bf) ft.set(r.combustivel, (ft.get(r.combustivel) ?? 0) + r.count);
  // combustíveis com menos de 2% viram "Outros combustíveis" (arcos finos demais para ler)
  const fsum = [...ft.values()].reduce((a, b) => a + b, 0), big = new Set([...ft].filter(([f, v]) => f !== 'Não classificado' && v / fsum >= .02).map(([f]) => f));
  const fuelOf = f => (big.has(f) ? f : f === 'Não classificado' ? null : 'Outros combustíveis');
  const fuels = [...new Set([...ft].sort((a, b) => b[1] - a[1]).map(([f]) => fuelOf(f)).filter(Boolean))], regions = REGIONS.filter(r => rb.some(x => x.regiao === r));
  let k = 0;
  // regiões no quarto de cima à direita, combustíveis no de baixo, marcas na metade esquerda
  const nodes = [...regions.map(name => ({ name, type: 'region', label: name, color: '#aeaeb2' })),
    ...fuels.map(name => ({ name, type: 'fuel', label: name, color: FUEL[name] ?? '#c7c7cc' })),
    ...brands.map(name => ({ name, type: 'brand', label: name === 'OUTRAS' ? 'Outras' : brandName(name), color: name === focus ? 'var(--nx-accent)' : name === 'OUTRAS' ? '#d1d1d6' : BRAND[k++ % BRAND.length] }))];
  const at = new Map(nodes.map((n, i) => [n.type + '|' + n.name, i])), M = nodes.map(() => nodes.map(() => 0));
  const link = (a, b, n) => { if (a == null || b == null || !(n > 0)) return; M[a][b] += n; M[b][a] += n; };
  for (const r of rb) link(at.get('region|' + r.regiao), at.get('brand|' + grp(r.marca)), r.count);
  for (const r of bf) link(at.get('brand|' + grp(r.marca)), at.get('fuel|' + fuelOf(r.combustivel)), r.count);
  return { nodes, M, total: [...bt.values()].reduce((s, v) => s + v, 0) };
}

function Chord({ model, focus }) {
  const [ref, w] = useWidth(), { tip } = useAtlas(), [hot, setHot] = useState(null), [pin, setPin] = useState(null);
  const W = Math.max(300, w || 900), side = W >= 820, size = side ? Math.min(W * .56, 600) : Math.min(Math.max(W, 440), 600), R = size / 2 - (side ? 110 : 88), r0 = R - 12;
  const L = useMemo(() => {
    const { nodes, M } = model, n = nodes.length, vals = M.map(row => row.reduce((a, b) => a + b, 0)), pad = .045, k = (2 * Math.PI - pad * n) / vals.reduce((a, b) => a + b, 0);
    let a = -Math.PI / 2; const arcs = [], sub = nodes.map(() => new Map());
    nodes.forEach((nd, i) => { const a0 = a; for (let j = 0; j < n; j++) { const v = M[i][j]; if (v > 0) { sub[i].set(j, [a, a + v * k]); a += v * k; } } arcs.push({ ...nd, i, a0, a1: a, value: vals[i] }); a += pad; });
    const ribbons = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (M[i][j] > 0) ribbons.push({ i, j, s: sub[i].get(j), t: sub[j].get(i), value: M[i][j] });
    return { arcs, ribbons };
  }, [model]);
  const c = size / 2, P = (ang, rr) => [c + rr * Math.cos(ang), c + rr * Math.sin(ang)];
  const arcPath = (a0, a1, ro, ri) => { const [x0, y0] = P(a0, ro), [x1, y1] = P(a1, ro), [x2, y2] = P(a1, ri), [x3, y3] = P(a0, ri), big = a1 - a0 > Math.PI ? 1 : 0; return `M${x0},${y0}A${ro},${ro} 0 ${big} 1 ${x1},${y1}L${x2},${y2}A${ri},${ri} 0 ${big} 0 ${x3},${y3}Z`; };
  const ribbon = rb => { const [s0, s1] = rb.s, [t0, t1] = rb.t, p = (a) => P(a, r0); const [a, b] = p(s0), [cx, cy] = p(s1), [d, e] = p(t0), [f, g] = p(t1); return `M${a},${b}A${r0},${r0} 0 0 1 ${cx},${cy}Q${c},${c} ${d},${e}A${r0},${r0} 0 0 1 ${f},${g}Q${c},${c} ${a},${b}Z`; };
  const sel = pin ?? hot ?? -1, shown = sel >= 0 ? sel : model.nodes.findIndex(n => n.name === focus && n.type === 'brand');
  // rótulos: um de cada lado do círculo, empurrados para não se sobreporem
  const labels = useMemo(() => {
    const out = new Map();
    for (const right of [true, false]) {
      const side = L.arcs.filter(a => a.a1 - a.a0 > .012 && (Math.cos((a.a0 + a.a1) / 2) >= 0) === right).map(a => { const mid = (a.a0 + a.a1) / 2, [x, y] = P(mid, R + 10); return { i: a.i, x, y, right }; }).sort((p, q) => p.y - q.y);
      for (let k = 1; k < side.length; k++) if (side[k].y < side[k - 1].y + 14) side[k].y = side[k - 1].y + 14;
      for (const t of side) out.set(t.i, t);
    }
    return out;
  }, [L, size]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = rb => { const A = model.nodes[rb.i], B = model.nodes[rb.j]; return (A.type === 'brand' ? A : B).color; };
  const nd = shown >= 0 ? L.arcs[shown] : null;
  const readout = nd ? (() => {
    const parts = model.M[nd.i].map((v, j) => ({ j, v })).filter(x => x.v > 0), brandSide = nd.type === 'brand';
    const groups = brandSide ? [['Regiões', parts.filter(x => model.nodes[x.j].type === 'region')], ['Combustíveis', parts.filter(x => model.nodes[x.j].type === 'fuel')]] : [['Marcas', parts]];
    return { groups: groups.map(([t, xs]) => { const tot = xs.reduce((s, x) => s + x.v, 0); return { t, rows: xs.sort((p, q) => q.v - p.v).map(x => ({ label: model.nodes[x.j].label, color: model.nodes[x.j].color, v: x.v, s: tot > 0 ? x.v / tot : 0 })) }; }), total: brandSide ? nd.value / 2 : nd.value };
  })() : null;
  return (
    <div ref={ref} className={'px-chord' + (side ? ' side' : '')}>
      <div className="px-chord-svg"><svg width={size} height={size} role="img" aria-label="Cordas: regiões, marcas e combustíveis" onMouseLeave={() => { setHot(null); tip.hide(); }}>
        <g>{L.ribbons.map((rb, k) => { const on = sel < 0 || rb.i === sel || rb.j === sel; return <path key={k} d={ribbon(rb)} fill={colorOf(rb)} opacity={sel < 0 ? .38 : on ? .62 : .05} stroke="#fff" strokeWidth=".4" onMouseMove={e => tip.show(e, <><strong>{model.nodes[rb.i].label} · {model.nodes[rb.j].label}</strong><span><b>{fmt(rb.value)}</b> emplacamentos</span></>)} onMouseLeave={tip.hide} />; })}</g>
        {L.arcs.map(a => {
          const on = a.i === sel, lab = labels.get(a.i);
          return (
            <g key={a.i} onMouseEnter={() => setHot(a.i)} onClick={() => setPin(pin === a.i ? null : a.i)} style={{ cursor: 'pointer' }}>
              <path d={arcPath(a.a0, a.a1, R, r0)} fill={a.color} opacity={sel < 0 || on ? 1 : .55} />
              {lab && <text x={lab.x} y={lab.y} dy=".35em" textAnchor={lab.right ? 'start' : 'end'} className={'px-ch-l' + (on ? ' on' : '') + (a.type === 'brand' ? ' b' : '')}>{a.label}</text>}
            </g>
          );
        })}
      </svg></div>
      {readout && <div className="px-ch-read">
        <span className="px-ch-k" style={{ color: nd.color === '#aeaeb2' || nd.color === '#d1d1d6' ? 'var(--nx-ink)' : nd.color }}>{nd.label}</span>
        <b>{fmt(readout.total)}</b><small>emplacamentos · {share(readout.total, model.total)} do recorte</small>
        {readout.groups.map(g => <div key={g.t} className="px-ch-g"><h5>{g.t}</h5>{g.rows.slice(0, 7).map(r => <div key={r.label} className="px-ch-r"><i style={{ background: r.color }} /><span>{r.label}</span><span className="px-ch-bar"><span style={{ width: r.s * 100 + '%', background: r.color }} /></span><b>{pct(r.s, 0)}</b></div>)}</div>)}
        <p className="px-scopenote">{pin != null ? 'Fixado: clique de novo para soltar.' : 'Passe o mouse num arco; clique para fixar.'}</p>
      </div>}
    </div>
  );
}

export default function Conexoes() {
  const { mFilters, focus, focusName } = useAtlas(), [who, setWho] = useState('mercado');
  const q = engine.useMarketData(mFilters, true, 'conexoes', false, focus);
  const ff = useMemo(() => ({ ...mFilters, marca: [focus] }), [mFilters, focus]);
  const qf = engine.useMarketData(ff, who === 'foco', 'conexoes', false, focus);
  const src = who === 'foco' ? qf.result : q.result;
  const flow = useMemo(() => (src?.flowPaths ? flowModel(src.flowPaths) : null), [src]);
  const chord = useMemo(() => chordModel(q.result?.connections, focus), [q.result, focus]);
  const err = q.error || (who === 'foco' && qf.error);
  if (err) return <div className="nx-c12"><p className="px-scopenote">Não foi possível calcular as conexões ({err}).</p></div>;
  const nat = flow ? flow.columns[0].nodes.find(n => n.name === 'Importado') : null;
  return <>
    <Block className="nx-c12" title="Do veículo ao segmento" sub={flow ? <>{who === 'foco' ? focusName : 'Mercado'}: {nat ? share(nat.value, flow.total) + ' importados' : 'sem importados'} · cada faixa mantém a cor da origem de ponta a ponta</> : 'Calculando…'}
      info="Origem (nacional ou importado) → canal de venda → combustível → tipo de veículo. As faixas são caminhos inteiros: passe o mouse num nó para ver só os caminhos que passam por ele. Veículos sem classificação de origem, combustível ou tipo ficam de fora (o número aparece abaixo)."
      actions={<Seg label="De quem" value={who} onChange={setWho} options={[['mercado', 'Mercado'], ['foco', focusName]]} />}>
      {!flow ? <Skel h={460} /> : flow.total > 0 ? <><Sankey model={flow} /><p className="px-swipe">Arraste o desenho para o lado para ver todas as colunas ›</p></> : <p className="px-scopenote">Sem emplacamentos classificados neste recorte.</p>}
      {flow?.dropped > 0 && <p className="px-scopenote">{fmt(flow.dropped)} emplacamentos sem classificação de origem, combustível ou tipo ficam fora do desenho. <span className="px-legend-i"><i style={{ background: ORIGIN.Nacional }} />Nacional <i style={{ background: ORIGIN.Importado }} />Importado</span></p>}
    </Block>
    <Block className="nx-c12" title="Quem vende o quê, e onde" sub={chord ? <>Regiões, as seis maiores marcas{chord.nodes.some(n => n.name === focus) ? ' e ' + focusName : ''}, e os combustíveis · as cordas ligam região → marca → combustível</> : 'Calculando…'}
      info="Cada corda liga uma região a uma marca ou uma marca a um combustível, com espessura proporcional aos emplacamentos. O arco de cada marca soma as duas ligações (região e combustível), por isso o total escrito divide por dois.">
      {!chord ? <Skel h={520} /> : <><Chord model={chord} focus={focus} /><p className="px-swipe">Arraste o círculo para o lado para ver os combustíveis ›</p></>}
    </Block>
  </>;
}
