import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from 'virtual:market';
import ufGeometry from '../market/geo/uf-geometry.json';
import { usePopulation } from '../next/areas/territorios-charts.jsx';
import { useProto } from './ctx.js';
import { Seg } from './ui.jsx';
import { brandName, fmt, pct, list, UF_NAMES } from './lib.js';

/* Mapa do Brasil com os 5.570 municípios num só canvas: navegação contínua (arrastar, Ctrl/⌘ + rolagem ou
   pinça para aproximar, clique num estado para voar até ele, clique num município para abrir o detalhe).
   Medidas: marca líder (padrão), volume, por mil habitantes, participação e índice da marca em foco. */
const VW = 630, VH = 565;
const PALETTE = ['#2f6fdf', '#e09a2c', '#2a9d8f', '#8e6bd1', '#d2589b', '#5b8c3a', '#3fa7d6', '#9a7b4f', '#64748b', '#c0843d'];
const FOCUS_COLOR = '#e60f2d', EMPTY = '#e6e6ea', FEW = '#d4d4da';
const UF_SHAPES = ufGeometry.features.map(f => {
  const n = f.path.match(/-?\d+(?:\.\d+)?/g).map(Number); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n.length - 1; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return { uf: f.uf, d: f.path, box: [x0, y0, x1, y1] };
});

/* ---------- geometria: as 27 malhas estaduais do IBGE levadas para a projeção nacional ----------
   Cada malha estadual tem a sua projeção; o ajuste (escala + deslocamento por eixo) usa os centros dos
   municípios já publicados na projeção nacional (municipal-points.json). */
const geoCache = new Map();
function loadGeometry(base, points) {
  if (geoCache.has(base)) return geoCache.get(base);
  const centre = new Map(points.rows.map(([code, , , x, y]) => [code, [x, y]]));
  const job = Promise.all(UF_SHAPES.map(s => fetch(new URL('geography/' + s.uf + '.json', base), { credentials: 'same-origin' }).then(r => { if (!r.ok) throw Error('Malha de ' + s.uf + ' indisponível'); return r.json(); }).then(g => ({ s, g }))))
    .then(files => {
      const out = [];
      for (const { s, g } of files) {
        const feats = g.features.map(f => { const n = f.path.match(/-?\d+(?:\.\d+)?/g).map(Number); let sx = 0, sy = 0, c = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < n.length - 1; i += 2) { sx += n[i]; sy += n[i + 1]; c++; x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); } return { f, cx: sx / c, cy: sy / c, box: [x0, y0, x1, y1] }; });
        const pairs = feats.map(p => [p, centre.get(p.f.code)]).filter(([, q]) => q);
        const fit = k => { const n = pairs.length, ml = pairs.reduce((a, [p]) => a + p[k], 0) / n, mn = pairs.reduce((a, [, q]) => a + q[k === 'cx' ? 0 : 1], 0) / n; let cov = 0, v = 0; for (const [p, q] of pairs) { const d = p[k] - ml; cov += d * (q[k === 'cx' ? 0 : 1] - mn); v += d * d; } const a = v > 0 ? cov / v : 0; return [a, mn - a * ml]; };
        let ax, bx, ay, by;
        if (pairs.length >= 3) { [ax, bx] = fit('cx'); [ay, by] = fit('cy'); } else {
          const lx0 = Math.min(...feats.map(p => p.box[0])), lx1 = Math.max(...feats.map(p => p.box[2])), ly0 = Math.min(...feats.map(p => p.box[1])), ly1 = Math.max(...feats.map(p => p.box[3]));
          ax = (s.box[2] - s.box[0]) / (lx1 - lx0 || 1); bx = s.box[0] - ax * lx0; ay = (s.box[3] - s.box[1]) / (ly1 - ly0 || 1); by = s.box[1] - ay * ly0;
        }
        for (const p of feats) {
          const d = p.f.path.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => (ax * x + bx).toFixed(2) + ',' + (ay * y + by).toFixed(2));
          out.push({ code: p.f.code, name: p.f.name, uf: s.uf, path: new Path2D(d), cx: ax * p.cx + bx, cy: ay * p.cy + by, box: [ax * p.box[0] + bx, ay * p.box[1] + by, ax * p.box[2] + bx, ay * p.box[3] + by], key: engine.geoKey(p.f.name, s.uf) + '|' + s.uf });
        }
      }
      // grade simples para achar o município sob o ponteiro
      const G = 48, grid = Array.from({ length: G * G }, () => []);
      out.forEach((m, i) => { const [x0, y0, x1, y1] = m.box; for (let gx = Math.max(0, Math.floor(x0 / VW * G)); gx <= Math.min(G - 1, Math.floor(x1 / VW * G)); gx++) for (let gy = Math.max(0, Math.floor(y0 / VH * G)); gy <= Math.min(G - 1, Math.floor(y1 / VH * G)); gy++) grid[gy * G + gx].push(i); });
      return { feats: out, grid, G };
    });
  geoCache.set(base, job); job.catch(() => geoCache.delete(base));
  return job;
}

const MODES = [['lider', 'Marca líder'], ['volume', 'Volume'], ['habitante', 'Por mil habitantes'], ['share', 'Participação'], ['indice', 'Índice vs Brasil']];
const ramp = (hex, t) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = (c, w) => Math.round(w + (c - w) * t); return `rgb(${m(r, 244)},${m(g, 244)},${m(b, 246)})`; };

export default function MapaBrasil() {
  const { mFilters, focus, focusName, base, points, tip, setFilter, filters, market } = useProto();
  const pop = usePopulation(base);
  const [mode, setMode] = useState('lider'), [chan, setChan] = useState('VAREJO'), [geo, setGeo] = useState(null), [geoErr, setGeoErr] = useState(null);
  const [place, setPlace] = useState({ uf: null, code: null }), [hiBrand, setHiBrand] = useState(null), [hint, setHint] = useState(false);
  const globalChannel = list(filters.tipo_venda).length > 0;
  // mínimo para colorir: 5 emplacamentos num mês só, 10 em períodos maiores
  const MIN = market?.range && market.range.start.slice(0, 7) === market.range.end.slice(0, 7) ? 5 : 10;
  const lf = useMemo(() => (globalChannel || chan === 'all' ? mFilters : { ...mFilters, tipo_venda: ['VAREJO'] }), [mFilters, chan, globalChannel]);
  const q = engine.useMarketData(lf, true, 'leaders-br', false, focus);
  const lastData = useRef(null); if (q.result) lastData.current = q.result;
  const data = q.result ?? lastData.current;

  useEffect(() => { if (!points) return; let alive = true; loadGeometry(base, points).then(g => { if (alive) setGeo(g); }).catch(e => { if (alive) setGeoErr(e.message); }); return () => { alive = false; }; }, [base, points]);

  /* liga cada contorno ao seu município do recorte */
  const joined = useMemo(() => {
    if (!geo || !data?.municipalLeaders) return null;
    const by = new Map();
    for (const m of data.municipalLeaders) { const k = engine.geoKey(m.municipio, m.uf) + '|' + m.uf, prev = by.get(k); if (!prev) by.set(k, m); else { const brands = new Map(); for (const [b, c] of [...prev.top, ...m.top]) brands.set(b, (brands.get(b) ?? 0) + c); const top = [...brands].sort((x, y) => y[1] - x[1]).slice(0, 3); by.set(k, { ...prev, total: prev.total + m.total, focus: prev.focus + m.focus, top, tie: top.length > 1 && top[0][1] === top[1][1] }); } }
    const rows = geo.feats.map(f => ({ f, m: by.get(f.key) ?? null, pop: pop.city.get(f.code) ?? null }));
    const total = data.municipalLeaders.reduce((s, m) => s + m.total, 0), focusTotal = data.municipalLeaders.reduce((s, m) => s + m.focus, 0);
    // cores: as marcas que lideram mais municípios no país, em ordem fixa; a marca em foco sempre em vermelho
    const led = new Map(); for (const r of rows) if (r.m && r.m.total >= MIN && !r.m.tie) led.set(r.m.top[0][0], (led.get(r.m.top[0][0]) ?? 0) + 1);
    const order = [...led].sort((a, b) => b[1] - a[1]).map(([b]) => b).filter(b => b !== focus), color = new Map(order.slice(0, PALETTE.length).map((b, i) => [b, PALETTE[i]]));
    color.set(focus, FOCUS_COLOR);
    return { rows, total, focusTotal, natShare: total > 0 ? focusTotal / total : 0, color };
  }, [geo, data, pop.city, focus, MIN]);
  const colorOf = b => joined?.color.get(b) ?? '#a8a29e';

  /* cor de cada município na medida escolhida */
  const fills = useMemo(() => {
    if (!joined) return null;
    const vals = joined.rows.map(({ m, pop: p }) => {
      if (!m || m.total < (mode === 'volume' ? 1 : MIN)) return null;
      if (mode === 'volume') return m.total;
      if (mode === 'habitante') return p > 0 ? m.total / p * 1000 : null;
      if (mode === 'share') return m.focus / m.total;
      if (mode === 'indice') return joined.natShare > 0 ? m.focus / m.total / joined.natShare : null;
      return null;
    });
    const sorted = vals.filter(v => v != null).sort((a, b) => a - b), qv = t => sorted[Math.min(sorted.length - 1, Math.floor(t * sorted.length))] ?? 0;
    const cut = mode === 'indice' ? [0, .5, 1, 1.5, 2.5] : [qv(.2), qv(.4), qv(.6), qv(.8), qv(.95)];
    const step = v => { let k = 0; while (k < cut.length && v >= cut[k]) k++; return k; };
    const out = joined.rows.map(({ m }, i) => {
      if (mode === 'lider') {
        if (!m) return EMPTY; if (m.total < MIN || m.tie) return FEW;
        const b = m.top[0][0], share = m.top[0][1] / m.total, t = .45 + .55 * Math.min(1, Math.max(0, (share - .2) / .4));
        if (hiBrand && b !== hiBrand) return '#ececef';
        return ramp(colorOf(b), Math.round(t * 4) / 4);
      }
      const v = vals[i]; if (v == null) return m ? FEW : EMPTY;
      if (mode === 'share' && v === 0) return '#f1eeee';
      if (mode === 'indice') return v < 1 ? ramp('#64748b', [.85, .55, .3][Math.min(2, step(v) - 1)] ?? .85) : ramp(FOCUS_COLOR, [.35, .6, .85, 1][Math.min(3, step(v) - 3)] ?? .35);
      return ramp(mode === 'share' ? FOCUS_COLOR : '#1d1d1f', [.12, .28, .46, .64, .82, 1][step(v)]);
    });
    return { out, cut };
  }, [joined, mode, hiBrand, MIN]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- desenho e navegação ---------- */
  const wrap = useRef(null), cv = useRef(null), S = useRef({ view: null, target: null, hover: -1, sel: -1, raf: 0, W: 0, H: 0, dpr: 1, drag: null, pts: new Map(), live: false });
  const fitBox = (box, pad = .86) => { const s = S.current, w = Math.max(4, box[2] - box[0]), h = Math.max(4, box[3] - box[1]); return { k: Math.min(s.W * pad / w, s.H * pad / h), cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2 }; };
  const home = () => (S.current.W < 560 ? fitBox([0, 0, VW, VH], .98) : fitBox([0, -8, VW, VH + 64], .98)); // no desktop, espaço embaixo para a legenda
  const kick = useCallback(() => { const s = S.current; cancelAnimationFrame(s.raf); s.raf = requestAnimationFrame(() => drawRef.current?.()); }, []);
  const fly = useCallback(t => { S.current.target = t; kick(); }, [kick]);
  const drawRef = useRef(null);
  drawRef.current = () => {
    const s = S.current, canvas = cv.current; if (!canvas || !s.W) return;
    const ctx = canvas.getContext('2d'); if (!s.view) s.view = home(); if (!s.target) s.target = { ...s.view };
    let moving = false; const v = s.view, t = s.target;
    const lk = Math.log(v.k), tk = Math.log(t.k), e = .2;
    if (Math.abs(tk - lk) > 1e-3 || Math.abs(t.cx - v.cx) > .02 || Math.abs(t.cy - v.cy) > .02) { v.k = Math.exp(lk + (tk - lk) * e); v.cx += (t.cx - v.cx) * e; v.cy += (t.cy - v.cy) * e; moving = true; } else Object.assign(v, t);
    const ox = s.W / 2 - v.cx * v.k, oy = s.H / 2 - v.cy * v.k;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.clearRect(0, 0, s.W, s.H);
    ctx.setTransform(s.dpr * v.k, 0, 0, s.dpr * v.k, s.dpr * ox, s.dpr * oy);
    const x0 = -ox / v.k, y0 = -oy / v.k, x1 = (s.W - ox) / v.k, y1 = (s.H - oy) / v.k;
    const feats = geo?.feats ?? [], fl = fills?.out;
    if (feats.length && fl) {
      const groups = new Map();
      feats.forEach((m, i) => { if (m.box[2] < x0 || m.box[0] > x1 || m.box[3] < y0 || m.box[1] > y1) return; const c = fl[i]; let a = groups.get(c); if (!a) { a = []; groups.set(c, a); } a.push(m.path); });
      for (const [c, paths] of groups) { ctx.fillStyle = c; for (const p of paths) ctx.fill(p); }
      const zoomed = v.k / home().k;
      if (zoomed > 2.2) { ctx.lineWidth = .7 / v.k; ctx.strokeStyle = 'rgba(255,255,255,.75)'; for (const [, paths] of groups) for (const p of paths) ctx.stroke(p); }
    } else { ctx.fillStyle = EMPTY; for (const u of UF_SHAPES) ctx.fill(u.path ?? (u.path = new Path2D(u.d))); }
    ctx.lineWidth = 1.3 / v.k; ctx.strokeStyle = '#ffffff'; for (const u of UF_SHAPES) ctx.stroke(u.path ?? (u.path = new Path2D(u.d)));
    if (place.uf && place.code == null) { const u = UF_SHAPES.find(x => x.uf === place.uf); if (u) { ctx.lineWidth = 2.4 / v.k; ctx.strokeStyle = '#1d1d1f'; ctx.stroke(u.path); } }
    if (s.sel >= 0 && feats[s.sel]) { ctx.lineWidth = 3 / v.k; ctx.strokeStyle = '#1d1d1f'; ctx.stroke(feats[s.sel].path); }
    if (s.hover >= 0 && feats[s.hover]) { ctx.lineWidth = 2 / v.k; ctx.strokeStyle = '#1d1d1f'; ctx.stroke(feats[s.hover].path); }
    // nomes dos maiores municípios à vista, sem sobreposição
    if (joined && v.k / home().k > 2.6) {
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.font = '600 12px Inter Variable, Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      const boxes = []; let n = 0;
      for (const r of labelOrder) { if (n >= 14) break; const m = r.f, sx = ox + m.cx * v.k, sy = oy + m.cy * v.k; if (sx < 30 || sy < 20 || sx > s.W - 30 || sy > s.H - 10) continue;
        const w = ctx.measureText(m.name).width + 8, b = [sx - w / 2, sy - 9, sx + w / 2, sy + 7]; if (boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue; boxes.push(b); n++;
        ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(m.name, sx, sy + 4); ctx.fillStyle = '#1d1d1f'; ctx.fillText(m.name, sx, sy + 4); }
    }
    if (moving) s.raf = requestAnimationFrame(() => drawRef.current?.());
  };
  const labelOrder = useMemo(() => (joined ? joined.rows.filter(r => r.m).sort((a, b) => b.m.total - a.m.total).slice(0, 400) : []), [joined]);

  useEffect(() => {
    const s = S.current, el = wrap.current, canvas = cv.current; if (!el) return undefined;
    const resize = () => { const r = el.getBoundingClientRect(); s.W = r.width; s.H = r.height; s.dpr = Math.min(2, devicePixelRatio || 1); canvas.width = s.W * s.dpr; canvas.height = s.H * s.dpr; const h = home(); if (!s.view || !s.live) { s.view = { ...h }; s.target = { ...h }; } kick(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    return () => { ro.disconnect(); cancelAnimationFrame(s.raf); };
  }, [kick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { kick(); }, [fills, geo, place, kick]);

  /* ponteiro: mapa → índice do município */
  const toMap = (cx, cy) => { const s = S.current, r = cv.current.getBoundingClientRect(), v = s.view; return [(cx - r.left - s.W / 2) / v.k + v.cx, (cy - r.top - s.H / 2) / v.k + v.cy]; };
  const hit = useMemo(() => { const c = document.createElement('canvas').getContext('2d'); return (mx, my) => { if (!geo) return -1; const gx = Math.floor(mx / VW * geo.G), gy = Math.floor(my / VH * geo.G); if (gx < 0 || gy < 0 || gx >= geo.G || gy >= geo.G) return -1; for (const i of geo.grid[gy * geo.G + gx]) { const m = geo.feats[i]; if (mx >= m.box[0] && mx <= m.box[2] && my >= m.box[1] && my <= m.box[3] && c.isPointInPath(m.path, mx, my)) return i; } return -1; }; }, [geo]);
  const zoomAt = (factor, cx, cy) => {
    const s = S.current, h = home(), t = s.target ?? s.view, k = Math.min(h.k * 60, Math.max(h.k, t.k * factor));
    if (cx == null) { fly({ ...t, k }); return; }
    const [mx, my] = toMap(cx, cy), r = cv.current.getBoundingClientRect(), px = cx - r.left - s.W / 2, py = cy - r.top - s.H / 2;
    fly({ k, cx: mx - px / k, cy: my - py / k }); s.live = true;
  };
  const rowsByIndex = joined?.rows;
  const showTip = (e, i) => {
    const r = rowsByIndex?.[i]; if (!r) { tip.hide(); return; }
    const m = r.m, f = r.f;
    tip.show(e, <><strong>{f.name} · {f.uf}</strong>{m ? <>{m.top.map(([b, c], k) => <span key={b}><i style={{ background: colorOf(b) }} />{k + 1}º {brandName(b)} <b>{pct(c / m.total, 0)}</b></span>)}
      <span>{fmt(m.total)} emplacamentos{r.pop ? ' · ' + (m.total / r.pop * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' por mil hab.' : ''}</span>
      <span>{focusName}: <b>{m.focusRank ? m.focusRank + 'º · ' + pct(m.focus / m.total, 1) : 'sem emplacamentos'}</b></span></> : <span>Sem emplacamentos neste recorte</span>}</>);
  };
  const onDown = e => { const s = S.current; s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); s.drag = { x: e.clientX, y: e.clientY, view: { ...s.view }, moved: false, dist: null }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onMove = e => {
    const s = S.current;
    if (s.pts.has(e.pointerId)) s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pts.size === 2) { const [a, b] = [...s.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (s.drag.dist) zoomAt(d / s.drag.dist, (a.x + b.x) / 2, (a.y + b.y) / 2); s.drag.dist = d; s.drag.moved = true; return; }
    if (s.drag && s.pts.size === 1) {
      const dx = e.clientX - s.drag.x, dy = e.clientY - s.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) s.drag.moved = true;
      if (s.drag.moved) { const v = { k: s.view.k, cx: s.drag.view.cx - dx / s.view.k, cy: s.drag.view.cy - dy / s.view.k }; s.view = { ...v }; s.target = { ...v }; s.live = true; tip.hide(); kick(); return; }
    }
    const [mx, my] = toMap(e.clientX, e.clientY), i = hit(mx, my);
    if (i !== s.hover) { s.hover = i; kick(); }
    if (i >= 0) showTip(e, i); else tip.hide();
  };
  const onUp = e => {
    const s = S.current, d = s.drag; s.pts.delete(e.pointerId); if (s.pts.size) return; s.drag = null;
    if (d && !d.moved) { const [mx, my] = toMap(e.clientX, e.clientY), i = hit(mx, my); if (i >= 0) pick(i); }
  };
  const pick = i => {
    const s = S.current, f = geo.feats[i], h = home(), zoomed = s.view.k / h.k;
    if (zoomed < 1.8 && place.uf !== f.uf) { goUF(f.uf); return; }
    s.sel = i; setPlace({ uf: f.uf, code: f.code });
    const t = fitBox(f.box, .3); fly({ k: Math.max(s.view.k, Math.min(t.k, h.k * 40)), cx: f.cx, cy: f.cy }); s.live = true;
  };
  const goUF = uf => { const u = UF_SHAPES.find(x => x.uf === uf); if (!u) return; S.current.sel = -1; setPlace({ uf, code: null }); fly(fitBox(u.box, .88)); S.current.live = true; };
  const goHome = () => { S.current.sel = -1; setPlace({ uf: null, code: null }); fly(home()); S.current.live = false; };
  const back = () => { if (place.code) { S.current.sel = -1; setPlace({ uf: place.uf, code: null }); goUF(place.uf); } else goHome(); };
  useEffect(() => { const c = cv.current; const wheel = e => { if (!(e.ctrlKey || e.metaKey)) { setHint(true); clearTimeout(S.current.hintT); S.current.hintT = setTimeout(() => setHint(false), 1400); return; } e.preventDefault(); zoomAt(Math.exp(-e.deltaY * .0045), e.clientX, e.clientY); }; c.addEventListener('wheel', wheel, { passive: false }); return () => c.removeEventListener('wheel', wheel); });
  // um estado escolhido nos filtros globais: o mapa abre nele
  const ufFilter = list(filters.uf);
  useEffect(() => { if (geo && ufFilter.length === 1) goUF(ufFilter[0]); }, [geo, ufFilter.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- painel: o lugar escolhido (Brasil, estado ou município) ---------- */
  const panel = useMemo(() => {
    if (!joined) return null;
    const inPlace = joined.rows.filter(r => !place.uf || r.f.uf === place.uf);
    const withData = inPlace.filter(r => r.m), total = withData.reduce((s, r) => s + r.m.total, 0), focusTotal = withData.reduce((s, r) => s + r.m.focus, 0);
    const led = new Map(); let colored = 0;
    for (const r of withData) if (r.m.total >= MIN && !r.m.tie) { colored++; const b = r.m.top[0][0]; led.set(b, (led.get(b) ?? 0) + 1); }
    const leaders = [...led].sort((a, b) => b[1] - a[1]);
    const top = [...withData].sort((a, b) => b.m.total - a.m.total).slice(0, 8);
    const city = place.code ? joined.rows.find(r => r.f.code === place.code) : null;
    return { total, focusTotal, share: total > 0 ? focusTotal / total : 0, leaders, colored, n: inPlace.length, focusLed: led.get(focus) ?? 0, present: withData.filter(r => r.m.focus > 0).length, top, city };
  }, [joined, place, focus, MIN]);

  const legend = mode === 'lider' ? (panel?.leaders ?? []).slice(0, 9).map(([b, n]) => ({ b, n })) : null;
  const pending = q.pending || !geo;
  const fmtCut = v => (mode === 'volume' ? fmt(v) : mode === 'habitante' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : mode === 'share' ? pct(v, 1) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '×');
  const city = panel?.city;
  return (
    <div className="px-map">
      <div className="px-map-bar">
        <Seg label="Medida" value={mode} onChange={v => { setMode(v); setHiBrand(null); }} options={MODES.map(([k, l]) => [k, k === 'share' ? 'Participação ' + focusName : k === 'indice' ? 'Índice ' + focusName : l])} />
        {!globalChannel ? <Seg label="Canal" value={chan} onChange={setChan} options={[['VAREJO', 'Varejo'], ['all', 'Todos os canais']]} /> : <span className="px-map-note">Canal: o do filtro global</span>}
      </div>
      <div className="px-map-grid">
        <div className="px-map-col">
        <div className="px-map-stage" ref={wrap}>
          <canvas ref={cv} className={'px-map-cv' + (place.uf ? ' zoomed' : '')} role="img" aria-label={'Mapa dos municípios do Brasil: ' + (MODES.find(m => m[0] === mode)?.[1] ?? '')}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { S.current.hover = -1; tip.hide(); kick(); }} onDoubleClick={e => zoomAt(2, e.clientX, e.clientY)} />
          <div className="px-map-zoom">
            <button type="button" aria-label="Aproximar" onClick={() => zoomAt(1.8)}>+</button>
            <button type="button" aria-label="Afastar" onClick={() => zoomAt(1 / 1.8)}>−</button>
            <button type="button" aria-label="Brasil inteiro" onClick={goHome} className="br">BR</button>
          </div>
          {(pending || geoErr || q.error) && <div className="px-map-status" role="status">{geoErr || q.error || 'Calculando a líder de cada município…'}</div>}
          <div className={'px-map-hint' + (hint ? ' on' : '')}>Use Ctrl + rolagem (⌘ no Mac), pinça ou os botões para aproximar</div>
          </div>
          <div className="px-map-legend">
            {legend ? <>{legend.map(({ b, n }) => <button key={b} type="button" aria-pressed={hiBrand === b} onClick={() => setHiBrand(h => (h === b ? null : b))}><i style={{ background: colorOf(b) }} />{brandName(b)}<small>{fmt(n)}</small></button>)}<span><i style={{ background: FEW }} />menos de {MIN} ou empate</span></>
              : fills && <span className="px-map-ramp">{fills.cut.map((c, k) => <span key={k}><i style={{ background: mode === 'indice' ? (k < 2 ? ramp('#64748b', [.85, .55][k]) : ramp(FOCUS_COLOR, [.35, .6, .85][k - 2])) : ramp(mode === 'share' ? FOCUS_COLOR : '#1d1d1f', [.28, .46, .64, .82, 1][k]) }} />{mode === 'indice' ? ['até 0,5×', '0,5–1×', '1–1,5×', '1,5–2,5×', 'acima de 2,5×'][k] : 'a partir de ' + fmtCut(c)}</span>)}</span>}
          </div>
        </div>
        <aside className="px-map-panel" aria-label="Detalhe do lugar escolhido">
          <nav className="px-crumbs" aria-label="Onde você está">
            <button type="button" onClick={goHome} aria-current={!place.uf || undefined}>Brasil</button>
            {place.uf && <><span>›</span><button type="button" onClick={() => goUF(place.uf)} aria-current={!place.code || undefined}>{UF_NAMES[place.uf]}</button></>}
            {city && <><span>›</span><b>{city.f.name}</b></>}
            {place.uf && <button type="button" className="px-back" onClick={back}>Voltar</button>}
          </nav>
          {!panel ? <div className="px-skel" style={{ height: 320 }} /> : city ? (
            <div className="px-city">
              <h3>{city.f.name}</h3>
              {city.m ? <>
                <div className="px-kv"><div><small>Emplacamentos</small><b>{fmt(city.m.total)}</b></div>{city.pop ? <div><small>Por mil habitantes</small><b>{(city.m.total / city.pop * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b></div> : null}<div><small>{focusName}</small><b className="red">{city.m.focusRank ? city.m.focusRank + 'ª' : '—'}</b></div></div>
                <ol className="px-top3">{city.m.top.map(([b, c]) => <li key={b}><i style={{ background: colorOf(b) }} /><span>{brandName(b)}</span><b>{pct(c / city.m.total, 1)}</b><small>{fmt(c)}</small></li>)}
                  {city.m.focusRank > 3 && <li className="focus"><i style={{ background: FOCUS_COLOR }} /><span>{city.m.focusRank}º {focusName}</span><b>{pct(city.m.focus / city.m.total, 1)}</b><small>{fmt(city.m.focus)}</small></li>}</ol>
                <p className="px-pnote">{city.m.brandCount} marcas emplacaram aqui no período{chan === 'VAREJO' && !globalChannel ? ', só no varejo' : ''}.</p>
              </> : <p className="px-pnote">Sem emplacamentos neste recorte.</p>}
              <button type="button" className="px-apply" onClick={() => { setFilter('uf', [city.f.uf]); const raw = data?.municipalLeaders?.find(m => engine.geoKey(m.municipio, m.uf) + '|' + m.uf === city.f.key); if (raw) setFilter('municipio', [raw.municipio]); }}>Filtrar o site por {city.f.name}</button>
            </div>
          ) : (
            <>
              <div className="px-kv"><div><small>Emplacamentos{chan === 'VAREJO' && !globalChannel ? ' no varejo' : ''}</small><b>{fmt(panel.total)}</b></div><div><small>{focusName}</small><b className="red">{pct(panel.share, 2)}</b></div><div><small>Lidera em</small><b>{fmt(panel.focusLed)}</b></div></div>
              <p className="px-pnote">{focusName} emplacou em {fmt(panel.present)} dos {fmt(panel.n)} municípios{place.uf ? ' de ' + UF_NAMES[place.uf] : ' do país'}.</p>
              <h4>Quem lidera mais municípios</h4>
              <ol className="px-leaders">{panel.leaders.slice(0, 6).map(([b, n]) => <li key={b} className={b === focus ? 'focus' : ''}><button type="button" aria-pressed={hiBrand === b} onClick={() => { setMode('lider'); setHiBrand(h => (h === b ? null : b)); }}><i style={{ background: colorOf(b) }} /><span>{brandName(b)}</span><b>{fmt(n)}</b><small>{pct(n / Math.max(1, panel.colored), 0)}</small></button></li>)}</ol>
              <h4>Maiores municípios</h4>
              <ol className="px-cities">{panel.top.map(r => <li key={r.f.code}><button type="button" onClick={() => pick(geo.feats.indexOf(r.f))}><span>{r.f.name}{!place.uf && <small> · {r.f.uf}</small>}</span><b>{fmt(r.m.total)}</b><i style={{ background: colorOf(r.m.top[0][0]) }} title={brandName(r.m.top[0][0])} /></button></li>)}</ol>
              {place.uf && <button type="button" className="px-apply" onClick={() => setFilter('uf', [place.uf])}>Filtrar o site por {UF_NAMES[place.uf]}</button>}
            </>
          )}
        </aside>
      </div>
      <p className="px-scopenote">{chan === 'VAREJO' && !globalChannel ? 'Varejo: locadoras e frotas emplacam na cidade da sede e “elegeriam” a líder de muitas cidades. ' : ''}Cinza: menos de {MIN} emplacamentos ou empate. Malhas municipais do IBGE; {market ? 'mesmo período e filtros do site' : ''}.</p>
    </div>
  );
}
