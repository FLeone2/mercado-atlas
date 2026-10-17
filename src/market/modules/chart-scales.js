/* Shared chart scale helpers (authored scope): round ticks, an outlier-robust
   vertical range and greedy label placement. Used by the catalog bubbles and the
   Animações bubbles so launches (6 → 5,835 units) cannot flatten every other mark. */
function chartNiceTicks(lo, hi, count = 4) {
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return [lo];
  const raw = span / count, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow, out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}
// Range for growth-like values (percent): the bottom follows the data (never below -100),
// the top follows the bulk of the data; anything above `hi` is reported as `over` so the
// chart can pin it to the edge with an arrow and its true value.
function chartRobustRange(values, {floor = -100, minHi = 50, spread = 3} = {}) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return {lo: -10, hi: 10, step: 10, over: 0};
  const q = f => v[Math.min(v.length - 1, Math.floor(f * (v.length - 1)))];
  const cap = Math.max(minHi, q(.75) + spread * Math.max(10, q(.75) - q(.25)));
  let lo = Math.max(floor, Math.min(0, v[0])), hi = Math.min(v[v.length - 1], cap);
  if (!(hi > lo)) hi = lo + 10;
  const ticks = chartNiceTicks(lo, hi), step = ticks.length > 1 ? ticks[1] - ticks[0] : (hi - lo) || 10;
  lo = Math.max(floor, Math.floor(lo / step - 1e-9) * step);
  hi = Math.ceil(hi / step - 1e-9) * step;
  return {lo, hi, step, over: v.filter(x => x > hi).length};
}
// Greedy label placement: each candidate tries its preferred spots in order and is
// dropped when every spot would overlap an accepted label (the legend still names it).
// candidates: [{x, y, r, text, force}] sorted by priority; returns [{...c, lx, ly, anchor}].
function chartPlaceLabels(candidates, {charWidth = 6.3, height = 12, bounds = {x0: 0, y0: 0, x1: 1e9, y1: 1e9}} = {}) {
  const taken = [], out = [];
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  for (const c of candidates) {
    const w = String(c.text).length * charWidth;
    const spots = [
      {lx: c.x, ly: c.y - c.r - 5, anchor: 'middle', x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y - c.r - 5 - height, y1: c.y - c.r - 5},
      {lx: c.x, ly: c.y + c.r + height + 2, anchor: 'middle', x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y + c.r + 2, y1: c.y + c.r + height + 2},
      {lx: c.x + c.r + 5, ly: c.y + 4, anchor: 'start', x0: c.x + c.r + 5, x1: c.x + c.r + 5 + w, y0: c.y - height / 2, y1: c.y + height / 2},
      {lx: c.x - c.r - 5, ly: c.y + 4, anchor: 'end', x0: c.x - c.r - 5 - w, x1: c.x - c.r - 5, y0: c.y - height / 2, y1: c.y + height / 2}
    ].filter(s => s.x0 >= bounds.x0 && s.x1 <= bounds.x1 && s.y0 >= bounds.y0 && s.y1 <= bounds.y1);
    const spot = spots.find(s => !taken.some(t => overlap(s, t)));
    if (spot) { taken.push(spot); out.push({...c, lx: spot.lx, ly: spot.ly, anchor: spot.anchor}); }
    else if (c.force && spots[0]) { out.push({...c, lx: spots[0].lx, ly: spots[0].ly, anchor: spots[0].anchor}); }
  }
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = {chartNiceTicks, chartRobustRange, chartPlaceLabels};
