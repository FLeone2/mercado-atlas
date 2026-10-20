import { useEffect, useMemo, useRef } from 'react';
import { engine } from 'virtual:market';
import ufGeometry from '../market/geo/uf-geometry.json';
import { fmt, rangeText, signed } from './format.js';

const VW = 630, VH = 565;
const UF_PATHS = ufGeometry.features.map(f => ({ uf: f.uf, path: new Path2D(f.path) }));

/* The country as a field of light: one point per municipality, area proportional to its registrations in the current filter. */
export default function Hero({ model, points, ufFilter, insights, onTip, scrollRef }) {
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
      return { k: Math.min(W * .62 / VW, H * .86 / VH), cx: VW / 2, cy: VH / 2 };
    };
    const narrow = () => W < 720;
    const geo = () => {
      const v = s.view, p = s.p;
      if (narrow()) { const kk = v.k * (W * .98 / (W * .62)) * Math.min(1, (H * .5 / VH) / (W * .98 / VW)) * (1 + p * .2); return { k: kk, ox: W * .5 - v.cx * kk, oy: H * .7 - v.cy * kk }; }
      const k = v.k * (1 + p * .26), anchor = W * (.66 - p * .16);
      return { k, ox: anchor - v.cx * k, oy: H * .5 - v.cy * k + p * 10 };
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
      UF_PATHS.forEach(({ uf, path }) => { const on = !ufFilter?.length || ufFilter.includes(uf); ctx.strokeStyle = `rgba(255,255,255,${(on ? .16 : .06) + s.p * .08})`; ctx.stroke(path); });
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (const d of dots) {
        const r = radius(d.v, g) * e, x = g.ox + d.x * g.k, y = g.oy + d.y * g.k;
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const a = .36 + Math.min(.5, Math.sqrt(d.v / max) * .9);
        ctx.fillStyle = `rgba(${glow},${a * (.5 + e * .5)})`; ctx.beginPath(); ctx.arc(x, y, Math.max(.5, r), 0, 6.283); ctx.fill();
        if (d.v / max > .18) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2); gr.addColorStop(0, `rgba(${glow},.34)`); gr.addColorStop(1, `rgba(${glow},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 6.283); ctx.fill(); }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (s.hover) { const d = s.hover, r = radius(d.v, g) + 4; ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.ox + d.x * g.k, g.oy + d.y * g.k, r, 0, 6.283); ctx.stroke(); }
      wrap.current.querySelectorAll('.nx-callout').forEach((el, i) => { const d = tops[i]; if (!d) { el.style.opacity = 0; return; } el.style.transform = `translate(${g.ox + d.x * g.k + 16}px, ${g.oy + d.y * g.k - 30}px)`; el.style.opacity = ease > .9 && s.p < .6 && (!narrow() || i === 0) ? 1 : 0; });
      if (ease < 1 || moving) raf = requestAnimationFrame(() => draw());
    }
    const kick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw()); };
    const onScroll = () => {
      const r = wrap.current.getBoundingClientRect(), range = wrap.current.offsetHeight - innerHeight;
      s.p = Math.max(0, Math.min(1, -r.top / Math.max(1, range)));
      const copy = wrap.current.querySelector('.nx-hero-copy'), hint = wrap.current.querySelector('.nx-hint'), note = wrap.current.querySelector('.nx-hero-obs');
      copy.style.opacity = Math.max(0, 1 - s.p * 2.2); copy.style.transform = `translateY(calc(-50% - ${s.p * 60}px)) scale(${1 - s.p * .06})`;
      hint.style.opacity = Math.max(0, 1 - s.p * 6); if (note) { note.style.opacity = Math.max(0, 1 - s.p * 2.4); note.style.transform = `translateY(${s.p * 40}px)`; }
      scrollRef?.(r.bottom > 56 ? 'dark' : 'light'); kick();
    };
    const onMove = e => {
      const g = geo(), rc = canvas.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top; let best = null, bd = 1e9;
      for (const d of dots) { const dx = g.ox + d.x * g.k - mx, dy = g.oy + d.y * g.k - my, dd = dx * dx + dy * dy, r = radius(d.v, g) + 6; if (dd < r * r && dd < bd) { bd = dd; best = d; } }
      if (best !== s.hover) { s.hover = best; kick(); }
      onTip(best ? { e, html: <><strong>{best.name} · {best.uf}</strong><span>{fmt(best.v)} emplacamentos</span></> } : null);
    };
    const leave = () => { s.hover = null; onTip(null); kick(); };
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', leave);
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', resize);
    resize(); onScroll();
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('resize', resize); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', leave); };
  }, [dots, max, ufFilter]);

  return (
    <section className="nx-hero" ref={wrap} id="topo" data-chapter data-title="Início">
      <div className="nx-stick">
        <canvas ref={cv} aria-label="Mapa do Brasil com os emplacamentos por município" role="img" />
        <div className="nx-hero-copy">
          <div className="nx-eyebrow">Mercado automotivo · {model ? rangeText(model.range) : 'carregando'}</div>
          <h1>O mercado,<br />em um olhar.</h1>
          <p>{model ? <><b>{fmt(model.total)}</b> emplacamentos{Number.isFinite(model.yearChangeRate) ? <>, <b className={model.yearChangeRate >= 0 ? 'up' : 'down'}>{signed(model.yearChangeRate)}</b> sobre o mesmo período do ano anterior</> : ''}.</> : 'Lendo os dados…'}</p>
        </div>
        {insights?.length > 0 && (
          <aside className="nx-hero-obs" aria-label="Observações rápidas">
            <h2>Observações rápidas</h2>
            <ul>{insights.slice(0, 3).map(i => <li key={i.id} className={i.tone}>{i.text}</li>)}</ul>
          </aside>
        )}
        <div className="nx-callouts">{tops.map(d => <div key={d.code} className="nx-callout">{d.name}<small>{fmt(d.v)}</small></div>)}</div>
        <div className="nx-hint">Role para ver a história</div>
      </div>
    </section>
  );
}
