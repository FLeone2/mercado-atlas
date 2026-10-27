import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import { Block } from '../base/block.jsx';
import { useWidth } from '../base/model-charts.jsx';
import { useAtlas } from '../ctx.js';
import { Seg, Skel } from '../ui.jsx';
import { brandName, fmt, pct, list, UF_NAMES } from '../lib.js';
import { FOCUS_COLOR, PALETTE, UF_SHAPES, VH, VW, loadGeometry } from '../MapaBrasil.jsx';

/* Mapas do Laboratório: mapa de calor dos emplacamentos e as três primeiras marcas por estado e por município.
   Visão nacional: território e canal do topo não se aplicam (canal próprio, varejo por padrão, porque
   locadoras e frotas emplacam na cidade da sede); os demais filtros valem. */

const GEO_KEYS = ['uf', 'regiao', 'municipio'];
function useNational(chan) {
  const { mFilters, focus, filters } = useAtlas(), globalChannel = list(filters.tipo_venda).length > 0;
  const f = useMemo(() => { const x = { ...mFilters }; for (const k of GEO_KEYS) delete x[k]; if (!globalChannel && chan === 'VAREJO') x.tipo_venda = ['VAREJO']; return x; }, [mFilters, chan, globalChannel]);
  const q = engine.useMarketData(f, true, 'leaders-br', false, focus);
  return { q, globalChannel };
}
const ChannelSeg = ({ chan, setChan, globalChannel }) => (!globalChannel ? <Seg label="Canal" value={chan} onChange={setChan} options={[['VAREJO', 'Varejo'], ['all', 'Todos os canais']]} /> : <span className="px-map-note">Canal: o do filtro global</span>);
const UF_P2D = new Map();
const ufPath = u => { if (!UF_P2D.has(u.uf)) UF_P2D.set(u.uf, new Path2D(u.d)); return UF_P2D.get(u.uf); };

/* cores fixas para as marcas que mais aparecem; a marca em foco sempre em vermelho */
function brandColors(counts, focus) {
  const order = [...counts].sort((a, b) => b[1] - a[1]).map(([b]) => b).filter(b => b !== focus), color = new Map(order.slice(0, PALETTE.length).map((b, i) => [b, PALETTE[i]]));
  color.set(focus, FOCUS_COLOR);
  return b => color.get(b) ?? '#b8b8bf';
}

/* ---------- mapa de calor ---------- */
function drawHeat(cv, W, { pts, values, scale, radius, color }) {
  const dpr = Math.min(2, devicePixelRatio || 1), H = Math.round(W * VH / VW), k = W / VW;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0); ctx.clearRect(0, 0, VW, VH);
  ctx.fillStyle = '#ececf0'; for (const u of UF_SHAPES) ctx.fill(ufPath(u));
  // 1. calor acumulado: uma mancha suave por município, as manchas somam onde as cidades estão perto
  const layer = document.createElement('canvas'); layer.width = cv.width; layer.height = cv.height; const lc = layer.getContext('2d', { willReadFrequently: true });
  const max = Math.max(1, ...values), weight = v => (scale === 'log' ? Math.log1p(v) / Math.log1p(max) : Math.sqrt(v / max)), r0 = radius * dpr * (W / 900);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]; if (!(v > 0)) continue;
    const x = pts[i][0] * k * dpr, y = pts[i][1] * k * dpr, wt = weight(v), rad = r0 * (.55 + .9 * wt), a = Math.min(.9, .05 + .55 * wt);
    const g = lc.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = g; lc.beginPath(); lc.arc(x, y, rad, 0, Math.PI * 2); lc.fill();
  }
  // 2. a densidade vira cor (uma tonalidade, do claro ao escuro)
  const [cr, cg, cb] = color, lut = new Uint8ClampedArray(256 * 4);
  for (let t = 0; t < 256; t++) { const u = t / 255, dark = u > .55 ? 1 - (u - .55) * .9 : 1; lut[t * 4] = cr * dark; lut[t * 4 + 1] = cg * dark; lut[t * 4 + 2] = cb * dark; lut[t * 4 + 3] = Math.min(255, 255 * Math.pow(u, .75) * 1.1); }
  const img = lc.getImageData(0, 0, layer.width, layer.height), d = img.data;
  for (let p = 0; p < d.length; p += 4) { const q = d[p + 3] * 4; d[p] = lut[q]; d[p + 1] = lut[q + 1]; d[p + 2] = lut[q + 2]; d[p + 3] = lut[q + 3]; }
  lc.putImageData(img, 0, 0);
  // 3. o calor fica dentro do Brasil
  const country = new Path2D(); for (const u of UF_SHAPES) country.addPath(ufPath(u));
  ctx.save(); ctx.clip(country); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0); ctx.restore();
  ctx.lineWidth = 1.1 / k; ctx.strokeStyle = '#fff'; for (const u of UF_SHAPES) ctx.stroke(ufPath(u));
  return { k };
}
export function MapaCalor() {
  const { focus, focusName, points, tip } = useAtlas(), [chan, setChan] = useState('VAREJO'), { q, globalChannel } = useNational(chan);
  const [what, setWhat] = useState('total'), [scale, setScale] = useState('sqrt'), [radius, setRadius] = useState(18), [ref, w] = useWidth(), cv = useRef(null), frame = useRef(null);
  const data = useMemo(() => {
    if (!points || !q.result?.municipalLeaders) return null;
    const by = new Map(); for (const m of q.result.municipalLeaders) { const k = engine.geoKey(m.municipio, m.uf) + '|' + m.uf, o = by.get(k); by.set(k, o ? { total: o.total + m.total, focus: o.focus + m.focus } : { total: m.total, focus: m.focus }); }
    const rows = points.rows, pts = rows.map(r => [r[3], r[4]]), names = rows.map(r => r[1] + ' · ' + r[2]), get = r => by.get(engine.geoKey(r[1], r[2]) + '|' + r[2]);
    return { pts, names, total: rows.map(r => get(r)?.total ?? 0), focus: rows.map(r => get(r)?.focus ?? 0) };
  }, [points, q.result]);
  const values = data ? (what === 'foco' ? data.focus : data.total) : null, W = Math.max(300, Math.min(w || 900, 900));
  useEffect(() => { if (!cv.current || !values) return; frame.current = drawHeat(cv.current, W, { pts: data.pts, values, scale, radius, color: what === 'foco' ? [230, 15, 45] : [47, 111, 223] }); }, [values, W, scale, radius, what, data]);
  const move = e => {
    if (!frame.current || !data) return; const r = cv.current.getBoundingClientRect(), k = frame.current.k, px = (e.clientX - r.left) / k, py = (e.clientY - r.top) / k;
    let best = -1, bd = (14 / k) ** 2; for (let i = 0; i < data.pts.length; i++) { if (!(values[i] > 0)) continue; const dd = (data.pts[i][0] - px) ** 2 + (data.pts[i][1] - py) ** 2; if (dd < bd || (dd <= bd * 1.2 && best >= 0 && values[i] > values[best])) { bd = Math.min(bd, dd); best = i; } }
    if (best < 0) { tip.hide(); return; }
    tip.show(e, <><strong>{data.names[best]}</strong><span>{fmt(data.total[best])} emplacamentos{chan === 'VAREJO' && !globalChannel ? ' no varejo' : ''}</span><span>{focusName}: <b>{fmt(data.focus[best])}</b>{data.total[best] > 0 ? ' · ' + pct(data.focus[best] / data.total[best], 1) : ''}</span></>);
  };
  const top = values ? values.map((v, i) => ({ i, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5) : [], sum = values ? values.reduce((a, b) => a + b, 0) : 0;
  return (
    <Block className="nx-c12" title={'Mapa de calor · ' + (what === 'foco' ? focusName : 'mercado')} sub={<>Onde se concentram os emplacamentos{chan === 'VAREJO' && !globalChannel ? ' no varejo' : ''}: as manchas de municípios próximos se somam · escala relativa ao maior ponto</>}
      info="Cada município é uma mancha suave na sua posição; manchas vizinhas se somam. A escala Suave (raiz quadrada) mostra as metrópoles sem apagar o resto; Realça o interior (logarítmica) dá mais peso às cidades pequenas. Visão nacional: o território do topo não se aplica."
      actions={<div className="px-ctl">
        <Seg label="Medida" value={what} onChange={setWhat} options={[['total', 'Mercado'], ['foco', focusName]]} />
        <Seg label="Escala" value={scale} onChange={setScale} options={[['sqrt', 'Suave'], ['log', 'Realça o interior']]} />
        <ChannelSeg chan={chan} setChan={setChan} globalChannel={globalChannel} />
        <label className="px-select">Raio<input type="range" min={8} max={40} value={radius} onChange={e => setRadius(+e.target.value)} aria-label="Raio das manchas" /></label>
      </div>}>
      <div ref={ref} className="px-heat">{!values ? <Skel h={Math.round(W * VH / VW)} /> : <canvas ref={cv} onMouseMove={move} onMouseLeave={tip.hide} role="img" aria-label="Mapa de calor dos emplacamentos por município" />}</div>
      {values && <div className={'px-heat-ramp' + (what === 'foco' ? ' f' : '')}><span>Menos</span><i aria-hidden /><span>Mais concentrado</span></div>}
      {top.length > 0 && <p className="px-scopenote">Maiores pontos: {top.map(t => data.names[t.i].split(' · ')[0] + ' (' + fmt(t.v) + ')').join(', ')}; juntos, {pct(sum > 0 ? top.reduce((a, t) => a + t.v, 0) / sum : 0, 0)} do total{what === 'foco' ? ' da ' + focusName : ''}.</p>}
    </Block>
  );
}

/* ---------- as três primeiras marcas ---------- */
function StateBands({ tops, colorOf, pos, label: aria, onTip, onLeave, hot, setHot }) {
  const id = useRef('t3' + Math.random().toString(36).slice(2, 8)).current;
  return (
    <svg className="px-t3-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={aria}>
      {pos == null && <defs>{UF_SHAPES.map(u => { const e = tops.get(u.uf); if (!e) return null; const sum = e.top.reduce((a, x) => a + x.v, 0), gap = .012; let acc = 0; const stops = [];
        e.top.forEach((x, i) => { const w = x.v / sum, a = acc + (i ? gap / 2 : 0), z = acc + w - (i < e.top.length - 1 ? gap / 2 : 0); if (i) stops.push(<stop key={'s' + i} offset={acc - gap / 2} stopColor="#fff" />, <stop key={'t' + i} offset={a} stopColor="#fff" />); stops.push(<stop key={'a' + i} offset={a} stopColor={colorOf(x.b)} />, <stop key={'z' + i} offset={z} stopColor={colorOf(x.b)} />); acc += w; });
        return <linearGradient key={u.uf} id={id + u.uf}>{stops}</linearGradient>; })}</defs>}
      {UF_SHAPES.map(u => { const e = tops.get(u.uf), fill = !e ? '#ececf0' : pos == null ? 'url(#' + id + u.uf + ')' : e.top[pos] ? colorOf(e.top[pos].b) : '#ececf0';
        return <path key={u.uf} d={u.d} fill={fill} stroke="#fff" strokeWidth="1.2" opacity={hot && hot !== u.uf ? .45 : 1} onMouseMove={ev => { setHot(u.uf); onTip(ev, u.uf); }} onMouseLeave={() => { setHot(null); onLeave(); }} />; })}
    </svg>
  );
}
function CityPlaces({ geo, rows, pos, colorOf, onTip, onLeave }) {
  const [ref, w] = useWidth(), cv = useRef(null), W = Math.max(200, w || 300), H = Math.round(W * VH / VW);
  useEffect(() => {
    const c = cv.current; if (!c || !geo) return;
    const dpr = Math.min(2, devicePixelRatio || 1), k = W / VW; c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d'); ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0); ctx.clearRect(0, 0, VW, VH);
    const groups = new Map(); geo.feats.forEach((f, i) => { const m = rows[i], b = m?.top?.[pos]?.[0], col = !m ? '#ececf0' : b ? colorOf(b) : '#dcdce1'; if (!groups.has(col)) groups.set(col, []); groups.get(col).push(f.path); });
    for (const [col, paths] of groups) { ctx.fillStyle = col; for (const p of paths) ctx.fill(p); }
    ctx.lineWidth = 1 / k; ctx.strokeStyle = '#fff'; for (const u of UF_SHAPES) ctx.stroke(ufPath(u));
  }, [geo, rows, pos, colorOf, W, H]);
  const hitCtx = useMemo(() => document.createElement('canvas').getContext('2d'), []);
  const move = e => {
    if (!geo) return; const r = cv.current.getBoundingClientRect(), k = W / VW, mx = (e.clientX - r.left) / k, my = (e.clientY - r.top) / k;
    const gx = Math.floor(mx / VW * geo.G), gy = Math.floor(my / VH * geo.G); if (gx < 0 || gy < 0 || gx >= geo.G || gy >= geo.G) { onLeave(); return; }
    for (const i of geo.grid[gy * geo.G + gx]) { const f = geo.feats[i], [x0, y0, x1, y1] = f.box; if (mx >= x0 && mx <= x1 && my >= y0 && my <= y1 && hitCtx.isPointInPath(f.path, mx, my)) { onTip(e, i); return; } }
    onLeave();
  };
  return <div ref={ref}><canvas ref={cv} onMouseMove={move} onMouseLeave={onLeave} role="img" aria-label={(pos + 1) + 'º lugar em cada município'} /></div>;
}
export function Top3() {
  const { market, focus, focusName, base, points, tip } = useAtlas(), [level, setLevel] = useState('estados'), [form, setForm] = useState('faixas'), [hot, setHot] = useState(null);
  const [chan, setChan] = useState('VAREJO'), { q, globalChannel } = useNational(chan), [geo, setGeo] = useState(null);
  useEffect(() => { if (level !== 'municipios' || !points || geo) return undefined; let alive = true; loadGeometry(base, points).then(g => { if (alive) setGeo(g); }).catch(() => {}); return () => { alive = false; }; }, [level, points, base, geo]);
  // estados: marca × UF da consulta principal (com todos os filtros do site)
  const tops = useMemo(() => {
    if (!market?.ufBrands) return null; const tot = new Map((market.groups?.uf ?? []).map(r => [r.name, r.count])), by = new Map();
    for (const r of market.ufBrands) { if (!UF_NAMES[r.uf]) continue; if (!by.has(r.uf)) by.set(r.uf, []); by.get(r.uf).push({ b: r.marca, v: r.count }); }
    const out = new Map(); for (const [uf, l] of by) { l.sort((a, b) => b.v - a.v); const t = tot.get(uf) ?? l.reduce((a, x) => a + x.v, 0); out.set(uf, { total: t, top: l.slice(0, 3).map(x => ({ ...x, s: x.v / t })), rank: l.findIndex(x => x.b === focus) + 1 }); }
    return out;
  }, [market, focus]);
  // municípios: as três primeiras marcas de cada município (consulta do mapa nacional)
  const cityRows = useMemo(() => {
    if (!geo || !q.result?.municipalLeaders) return null; const by = new Map();
    for (const m of q.result.municipalLeaders) by.set(engine.geoKey(m.municipio, m.uf) + '|' + m.uf, m);
    return geo.feats.map(f => { const m = by.get(f.key); return m && m.total >= 10 ? m : m ? { ...m, top: [] } : null; });
  }, [geo, q.result]);
  const colorOf = useMemo(() => {
    // a ordem das cores vem dos estados (a mesma nos dois níveis); marcas só municipais entram depois
    const c = new Map();
    if (tops) for (const e of tops.values()) e.top.forEach((x, i) => c.set(x.b, (c.get(x.b) ?? 0) + (3 - i) * 1e6));
    if (cityRows) for (const m of cityRows) if (m) m.top.forEach(([b], i) => c.set(b, (c.get(b) ?? 0) + (3 - i)));
    return brandColors(c, focus);
  }, [tops, cityRows, focus]);
  const legend = useMemo(() => {
    const c = new Map(); if (level === 'estados' && tops) for (const e of tops.values()) for (const x of e.top) c.set(x.b, (c.get(x.b) ?? 0) + 1);
    if (level === 'municipios' && cityRows) for (const m of cityRows) if (m) for (const [b] of m.top) c.set(b, (c.get(b) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [tops, cityRows, level]);
  const stateTip = (e, uf) => { const x = tops?.get(uf); if (!x) return; tip.show(e, <><strong>{UF_NAMES[uf]}</strong>{x.top.map((t, i) => <span key={t.b}><i style={{ background: colorOf(t.b) }} />{i + 1}º {brandName(t.b)} <b>{pct(t.s, 1)}</b></span>)}<span>{focusName}: {x.rank ? x.rank + 'ª' : 'sem emplacamentos'}</span><span>{fmt(x.total)} emplacamentos</span></>); };
  const cityTip = (e, i) => { const f = geo.feats[i], m = cityRows?.[i]; tip.show(e, <><strong>{f.name} · {f.uf}</strong>{m ? (m.top.length ? m.top.map(([b, c], k) => <span key={b}><i style={{ background: colorOf(b) }} />{k + 1}º {brandName(b)} <b>{pct(c / m.total, 0)}</b></span>) : <span>Menos de 10 emplacamentos</span>) : <span>Sem emplacamentos</span>}{m?.focusRank > 3 && <span>{focusName}: {m.focusRank}ª</span>}</>); };
  const ranked = tops ? [...tops].sort((a, b) => b[1].total - a[1].total) : [];
  const ready = level === 'estados' ? tops : cityRows;
  return (
    <Block className="nx-c12" title={'Três primeiras marcas por ' + (level === 'estados' ? 'estado' : 'município')}
      sub={level === 'estados' ? (form === 'faixas' ? 'Cada estado dividido em faixas: 1ª, 2ª e 3ª marca, com largura proporcional às vendas' : 'O mapa do 1º, do 2º e do 3º lugar lado a lado') : <>O mapa do 1º, do 2º e do 3º lugar em cada município{chan === 'VAREJO' && !globalChannel ? ' (varejo)' : ''} · cinza claro: menos de 10 emplacamentos</>}
      info="Estados: marca × estado da consulta principal, com todos os filtros do site. Municípios: a consulta do mapa nacional, com canal próprio (varejo por padrão, porque locadoras emplacam na cidade da sede) e sem os filtros de território."
      actions={<div className="px-ctl">
        <Seg label="Nível" value={level} onChange={setLevel} options={[['estados', 'Estados'], ['municipios', 'Municípios']]} />
        {level === 'estados' ? <Seg label="Forma" value={form} onChange={setForm} options={[['faixas', 'Faixas'], ['lugares', '1º · 2º · 3º lugar']]} /> : <ChannelSeg chan={chan} setChan={setChan} globalChannel={globalChannel} />}
      </div>}>
      {!ready ? <Skel h={460} /> : <>
        <div className="nx-legend px-t3-legend">{legend.map(([b]) => <span key={b}><i style={{ background: colorOf(b) }} />{brandName(b)}</span>)}</div>
        {level === 'estados' && form === 'faixas' ? (
          <div className="px-t3">
            <div className="px-t3-map"><StateBands tops={tops} colorOf={colorOf} label="Três primeiras marcas por estado" onTip={stateTip} onLeave={tip.hide} hot={hot} setHot={setHot} /></div>
            <div className="px-t3-list scroll">{ranked.map(([uf, e]) => <div key={uf} className={'px-t3-row' + (hot === uf ? ' on' : '')} onMouseEnter={() => setHot(uf)} onMouseLeave={() => setHot(null)}><b>{uf}</b><span className="px-t3-stack">{e.top.map(x => <span key={x.b} style={{ width: x.s * 100 + '%', background: colorOf(x.b) }} title={brandName(x.b) + ' ' + pct(x.s, 1)} />)}</span><span className="px-t3-names">{e.top.map(x => brandName(x.b)).join(' · ')}</span></div>)}</div>
          </div>
        ) : (
          <div className="px-t3-multi">{[0, 1, 2].map(p => <figure key={p}><figcaption>{p + 1}º lugar</figcaption>{level === 'estados' ? <StateBands tops={tops} colorOf={colorOf} pos={p} label={(p + 1) + 'º lugar por estado'} onTip={stateTip} onLeave={tip.hide} hot={hot} setHot={setHot} /> : <CityPlaces geo={geo} rows={cityRows} pos={p} colorOf={colorOf} onTip={cityTip} onLeave={tip.hide} />}</figure>)}</div>
        )}
      </>}
    </Block>
  );
}
