import { useEffect, useMemo, useRef } from 'react';
import { engine } from 'virtual:market';
import ufGeometry from '../../market/geo/uf-geometry.json';
import { fmt, rangeText, signed } from './format.js';
import { Num } from './motion.js';

const VW = 630, VH = 565;
const UF_PATHS = ufGeometry.features.map(f => ({ uf: f.uf, path: new Path2D(f.path) }));

/* The country as a field of light: one point per municipality, area proportional to its registrations in the current filter. */
export default function PanoramaHero({ model, points, ufFilter, insights, onTip }) {
  const wrap = useRef(null), cv = useRef(null), state = useRef({ p: 0, hover: null, view: null, target: null, t0: performance.now() });
  const dots = useMemo(() => {
    if (!model || !points?.rows) return [];
    const totals = new Map();
    for (const r of model.groups?.municipio ?? []) {
      const i = r.name.lastIndexOf(' · '); if (i < 0 || !(r.count > 0)) continue;
      const uf = r.name.slice(i + 3).trim(), key = engine.geoKey(r.name.slice(0, i), uf) + '|' + uf;
      totals.set(key, (totals.get(key) ?? 0) + r.count);
    }
    const out = [];
    for (const [code, name, uf, x, y] of points.rows) { const v = totals.get(engine.geoKey(name, uf) + '|' + uf); if (v > 0) out.push({ code, name, uf, x, y, v }); }
    return out.sort((a, b) => a.v - b.v);
  }, [model, points]);
  const max = dots.length ? dots[dots.length - 1].v : 1, tops = dots.slice(-3).reverse();

  useEffect(() => {
    const s = state.current, canvas = cv.current, ctx = canvas.getContext('2d'); let W, H, dpr, raf = 0;
    const colors = () => { const cs = getComputedStyle(wrap.current); return { glow: cs.getPropertyValue('--nx-glow').trim() || '255,255,255', accent: cs.getPropertyValue('--nx-accent').trim() || '#e60f2d' }; };
    const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; draw(true); };
    // View = scale and centre in map units. Filtering to one UF zooms to its points.
    const fit = () => {
      if (ufFilter?.length && dots.length) {
        const xs = dots.map(d => d.x), ys = dots.map(d => d.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const w = Math.max(40, x1 - x0) * 1.25, h = Math.max(40, y1 - y0) * 1.25;
        return { k: Math.min(W * .56 / w, H * .78 / h), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
      }
      return { k: Math.min(W * .62 / VW, H * .9 / VH), cx: VW / 2, cy: VH / 2 };
    };
    const narrow = () => W < 720;
    const geo = () => {
      const v = s.view, p = s.p;
      if (narrow()) { const kk = v.k * (W * .98 / (W * .62)) * Math.min(1, (H * .5 / VH) / (W * .98 / VW)) * 1; return { k: kk, ox: W * .5 - v.cx * kk, oy: H * .7 - v.cy * kk }; }
      const k = v.k, anchor = W * .68;
      return { k, ox: anchor - v.cx * k, oy: H * .5 - v.cy * k };
    };
    // Pixel radius: area follows volume; when zoomed in, points grow with the square root of the zoom so they never swallow the map.
    const radius = (val, g) => (.7 + Math.sqrt(val / max) * 15) * Math.sqrt(g.k * Math.min(W * .62 / VW, H * .86 / VH)) * (ufFilter?.length ? .85 : 1);
    function draw(force) {
      const { glow, accent } = colors();
      s.target = fit(); if (!s.view || force && !s.view) s.view = { ...s.target };
      const v = s.view, t = s.target; let moving = false;
      for (const key of ['k', 'cx', 'cy']) { const d = t[key] - v[key]; if (Math.abs(d) > Math.abs(t[key]) * 1e-3 + 1e-4) { v[key] += d * .14; moving = true; } else v[key] = t[key]; }
      const g = geo(), ease = Math.min(1, (performance.now() - s.t0) / 1700), e = 1 - Math.pow(1 - ease, 3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.save(); ctx.translate(g.ox, g.oy); ctx.scale(g.k, g.k); ctx.lineWidth = 1.1 / g.k;
      UF_PATHS.forEach(({ uf, path }) => { const on = !ufFilter?.length || ufFilter.includes(uf); ctx.strokeStyle = `rgba(255,255,255,${on ? .2 : .07})`; ctx.stroke(path); });
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (const d of dots) {
        const r = radius(d.v, g) * e, x = g.ox + d.x * g.k, y = g.oy + d.y * g.k;
        if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r)) || x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const a = .36 + Math.min(.5, Math.sqrt(d.v / max) * .9);
        ctx.fillStyle = `rgba(${glow},${a * (.5 + e * .5)})`; ctx.beginPath(); ctx.arc(x, y, Math.max(.5, r), 0, 6.283); ctx.fill();
        if (d.v / max > .18) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2); gr.addColorStop(0, `rgba(${glow},.34)`); gr.addColorStop(1, `rgba(${glow},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 6.283); ctx.fill(); }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (s.hover) { const d = s.hover, r = radius(d.v, g) + 4; ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.ox + d.x * g.k, g.oy + d.y * g.k, r, 0, 6.283); ctx.stroke(); }
      // Rótulos das três maiores cidades: um rótulo que cairia sobre outro já posto fica escondido.
      const placed = [];
      wrap.current.querySelectorAll('.nx-callout').forEach((el, i) => {
        const d = tops[i]; if (!d) { el.style.opacity = 0; return; }
        const x = g.ox + d.x * g.k + 16, y = g.oy + d.y * g.k - 30, w = el.offsetWidth || 120, h = el.offsetHeight || 32;
        const clash = placed.some(b => x < b.x + b.w + 6 && x + w + 6 > b.x && y < b.y + b.h + 4 && y + h + 4 > b.y);
        if (!clash) placed.push({ x, y, w, h });
        el.style.transform = `translate(${x}px, ${y}px)`; el.style.opacity = ease > .9 && !clash && (!narrow() || i === 0) ? 1 : 0;
      });
      if (ease < 1 || moving) raf = requestAnimationFrame(() => draw());
    }
    const kick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw()); };
    const onMove = e => {
      const g = geo(), rc = canvas.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top; let best = null, bd = 1e9;
      for (const d of dots) { const dx = g.ox + d.x * g.k - mx, dy = g.oy + d.y * g.k - my, dd = dx * dx + dy * dy, r = radius(d.v, g) + 6; if (dd < r * r && dd < bd) { bd = dd; best = d; } }
      if (best !== s.hover) { s.hover = best; kick(); }
      onTip(best ? { e, html: <><strong>{best.name} · {best.uf}</strong><span>{fmt(best.v)} emplacamentos</span></> } : null);
    };
    const leave = () => { s.hover = null; onTip(null); kick(); };
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', leave);
    addEventListener('resize', resize);
    resize();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', leave); };
  }, [dots, max, ufFilter]);

  return (
    <section className="nxp-hero" ref={wrap} id="topo">
      <div className="nxp-stick">
        <canvas ref={cv} aria-label="Mapa do Brasil com os emplacamentos por município" role="img" />
        <div className="nxp-copy">
          <div className="nxp-eyebrow">Mercado automotivo · {model ? rangeText(model.range) : 'carregando'}</div>
          <div className="nxp-big">{model ? <Num value={model.total} format={fmt} duration={1300} /> : '…'}</div>
          <p>emplacamentos{model && Number.isFinite(model.yearChangeRate) ? <>, <b className={model.yearChangeRate >= 0 ? 'up' : 'down'}>{signed(model.yearChangeRate)}</b> sobre o mesmo período do ano anterior</> : ''}.</p>
        </div>
        {insights?.length > 0 && (
          <aside className="nxp-obs" aria-label="Observações rápidas">
            <h2>Observações rápidas</h2>
            <ul>{insights.slice(0, 3).map(i => <li key={i.id} className={i.tone}>{i.text}</li>)}</ul>
          </aside>
        )}
        <div className="nx-callouts">{tops.map(d => <div key={d.code} className="nx-callout">{d.name}<small>{fmt(d.v)}</small></div>)}</div>
        <div className="nxp-hint">Cada ponto é um município; passe o mouse para ver os valores</div>
      </div>
    </section>
  );
}
