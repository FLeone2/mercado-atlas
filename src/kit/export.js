// "Baixar PNG": the chart SVG is redrawn on a canvas with its computed colours, the
// Atlas fonts embedded, the legend under it, a title and the source line.
export const EXPORT_STYLE_PROPS = ['stop-color', 'stop-opacity', 'paint-order', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-family', 'font-style', 'text-anchor', 'dominant-baseline', 'paint-order', 'visibility', 'display', 'letter-spacing'];

let fontPromise = null;
function fontFaces() {
  if (fontPromise) return fontPromise;
  const read = (href, family, weight) => fetch(href).then(r => (r.ok ? r.blob() : null)).then(blob => !blob ? '' : new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(`@font-face{font-family:"${family}";src:url(${reader.result}) format("woff2");font-weight:${weight}}`);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  })).catch(() => '');
  // The bundled @font-face rules carry the hashed URLs; pick them from the loaded style sheets.
  const urls = [];
  for (const sheet of document.styleSheets) {
    let rules = [];
    try { rules = [...sheet.cssRules]; } catch { continue; }
    for (const rule of rules) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family').replaceAll('"', '').replaceAll("'", '').trim();
      const src = /url\(["']?([^"')]+latin-[^"')]*\.woff2)["']?\)/.exec(rule.style.getPropertyValue('src'))?.[1];
      if (src && /Inter|DM Serif/.test(family) && !/ext/.test(src)) urls.push([new URL(src, sheet.href ?? document.baseURI).href, family, rule.style.getPropertyValue('font-weight') || '400']);
    }
  }
  fontPromise = Promise.all(urls.slice(0, 4).map(([href, family, weight]) => read(href, family, weight))).then(list => list.join(''));
  return fontPromise;
}

export function resolveColor(token, fallback) {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`; probe.style.display = 'none';
  (document.querySelector('.am-app') ?? document.body).appendChild(probe);
  const value = getComputedStyle(probe).color; probe.remove();
  return value || fallback;
}

function inlineStyles(source, clone) {
  const a = [source, ...source.querySelectorAll('*')], b = [clone, ...clone.querySelectorAll('*')];
  for (let i = 0; i < a.length && i < b.length; i++) {
    const cs = getComputedStyle(a[i]);
    b[i].setAttribute('style', EXPORT_STYLE_PROPS.map(p => p + ':' + cs.getPropertyValue(p)).join(';'));
    b[i].removeAttribute('class');
  }
}

export function exportLegend(root) {
  return [...(root?.querySelectorAll('.ax-legend span,.cc-legend span,.tbm-legend span,.ac-legend span,[data-export-legend] span') ?? [])]
    .map(item => ({ label: item.textContent.trim(), color: getComputedStyle(item.querySelector('i,b,em') ?? item).backgroundColor }))
    .filter(item => item.label);
}

// Filters in the address bar (f.*), so a saved image says which cut it shows.
function contextLine() {
  const names = { date: 'Período', population: 'Universo', uf: 'UF', regiao: 'Região', municipio: 'Município', marca: 'Marca', grupo_modelo: 'Modelo', modelo: 'Versão', tipo_venda: 'Canal', segmento: 'Segmento', propulsao: 'Propulsão' };
  const parts = [];
  for (const [key, value] of new URLSearchParams(globalThis.location?.search ?? '')) {
    if (!key.startsWith('f.')) continue;
    const id = key.slice(2), text = value.replace(/^\[|\]$/g, '').replace(/"/g, '').replace(/,/g, ', ');
    if (!text || text === 'all') continue;
    parts.push((names[id] ?? id) + ': ' + (id === 'population' ? (text === 'light' ? 'automóveis e comerciais leves' : 'todo o conteúdo dos arquivos') : text));
  }
  return parts.length ? parts.join(' · ') : 'Sem filtros (período padrão)';
}

// Short file-name suffix with the cut: period and the active filters (period_UF_MARCA…).
export function exportContextSlug() {
  const bits = [];
  for (const [key, value] of new URLSearchParams(globalThis.location?.search ?? '')) {
    if (!key.startsWith('f.')) continue;
    const text = value.replace(/^\[|\]$/g, '').replace(/"/g, '');
    if (!text || text === 'all' || text === 'light') continue;
    bits.push(key === 'f.date' ? text.replace('..', '_a_') : text.split(',').slice(0, 2).join('+'));
  }
  return bits.join('_').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w+.-]+/g, '-').slice(0, 80) || 'padrao';
}

// One drawable per chart: an <svg> (styles inlined, fonts embedded) or a <canvas> as is.
async function drawable(node) {
  const rect = node.getBoundingClientRect();
  if (node.tagName.toLowerCase() === 'canvas') return { img: node, w: Math.round(rect.width), h: Math.round(rect.height) };
  const box = node.viewBox?.baseVal?.width ? node.viewBox.baseVal : rect;
  const w = Math.round(rect.width || box.width), h = Math.round(rect.width ? rect.width * box.height / box.width : box.height);
  const clone = node.cloneNode(true); inlineStyles(node, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', w); clone.setAttribute('height', h);
  const font = await fontFaces();
  if (font) { const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = font; clone.insertBefore(style, clone.firstChild); }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('Não foi possível desenhar o gráfico.')); i.src = url; });
    return { img, w, h };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

// Exports every visual passed (svg and canvas alike) side by side in one PNG, with title,
// legend and a footer naming the filters and the generation date.
export async function exportVisualsToPng(nodes, { filename = 'grafico', title = '', legend = [] } = {}) {
  if (!nodes?.length) throw Error('Nada para exportar nesta visualização.');
  const parts = [];
  for (const node of nodes) parts.push(await drawable(node));
  const gap = 20, cols = parts.length === 1 ? 1 : parts.length === 2 || parts.length === 4 ? 2 : Math.min(3, parts.length);
  const cellW = Math.max(...parts.map(p => p.w)), rowsN = Math.ceil(parts.length / cols);
  const rowH = r => Math.max(...parts.slice(r * cols, r * cols + cols).map(p => p.h));
  const w = cols * cellW + (cols - 1) * gap, h = Array.from({ length: rowsN }, (_, r) => rowH(r)).reduce((a, b) => a + b, 0) + (rowsN - 1) * gap;
  const paper = '#f5f5f7', ink = '#1d1d1f', muted = '#6e6e73';
  const scale = 2, pad = 28, titleH = title ? 40 : 0, rows = [], probe = document.createElement('canvas').getContext('2d');
  probe.font = '13px "Inter Variable", Inter, system-ui, sans-serif';
  let row = [], x = 0;
  for (const item of legend) { const iw = 22 + probe.measureText(item.label).width + 18; if (x + iw > w && row.length) { rows.push(row); row = []; x = 0; } row.push({ ...item, x }); x += iw; }
  if (row.length) rows.push(row);
  const legendH = rows.length * 22, footH = 40, W = w + pad * 2, H = pad + titleH + h + (legendH ? legendH + 10 : 0) + footH + pad;
  const canvas = document.createElement('canvas'); canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
  if (title) { ctx.fillStyle = ink; ctx.font = '700 24px "Inter Variable", Inter, -apple-system, system-ui, sans-serif'; ctx.fillText(title, pad, pad + 22); }
  let top = pad + titleH;
  for (let r = 0; r < rowsN; r++) {
    parts.slice(r * cols, r * cols + cols).forEach((p, c) => ctx.drawImage(p.img, pad + c * (cellW + gap), top, p.w, p.h));
    top += rowH(r) + gap;
  }
  let y = pad + titleH + h + 10; ctx.font = '13px "Inter Variable", Inter, system-ui, sans-serif';
  for (const r of rows) { for (const item of r) { ctx.fillStyle = item.color; ctx.beginPath(); ctx.arc(pad + item.x + 6, y + 9, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink; ctx.fillText(item.label, pad + item.x + 18, y + 13); } y += 22; }
  ctx.fillStyle = muted; ctx.font = '11px "Inter Variable", Inter, system-ui, sans-serif';
  ctx.fillText(contextLine(), pad, H - pad - 10);
  ctx.fillText('Atlas · Mercado Automotivo · emplacamentos (registros) · gerado em ' + new Date().toLocaleDateString('pt-BR'), pad, H - pad + 4);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename.replace(/[^\w.-]+/g, '-') + '.png';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

export function exportSvgToPng(svg, options) { return exportVisualsToPng([svg], options); }

/* ---------- snapshot of a whole card: what is on screen, with its context ---------- */
// Controls and helpers that mean nothing in a picture.
const EXPORT_SKIP = '.export-image-button,.ax-card-tools,.nx-info,.nx-dl,.nx-tip,.nx-info-pop,.ax-popover,.ax-tooltip,.nx-block-actions,.nx-seg,.nxe-seg,.nxx-seg,.tbm-seg,.ax-segmented,.lm-zoom,[data-nxnote],[data-export-skip],.nx-found,[data-export-notes],input,textarea,script,style';

function roundPath(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = r.map(v => Math.max(0, Math.min(v, w / 2, h / 2)));
  ctx.beginPath(); ctx.moveTo(x + tl, y); ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br); ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl); ctx.closePath();
}
const clear = color => !color || color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color);

/* Paints the card on a canvas element by element (backgrounds, borders, words, SVG charts, canvas maps).
   It does not go through an SVG foreignObject, which makes the canvas unexportable in Chrome and Safari. */
async function paintCard(ctx, root, ox, oy) {
  const box = root.getBoundingClientRect(), opacities = new Map();
  const alphaOf = el => { let a = 1; for (let n = el; n && n !== root.parentElement; n = n.parentElement) { if (!opacities.has(n)) opacities.set(n, parseFloat(getComputedStyle(n).opacity)); a *= opacities.get(n); } return a; };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === 3) return node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      if (node !== root && node.matches(EXPORT_SKIP)) return NodeFilter.FILTER_REJECT;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'contents' && false) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  // What an ancestor with overflow hidden/auto/scroll cuts off on screen is cut off in the picture too.
  const clips = new Map();
  const clipOf = el => {
    if (clips.has(el)) return clips.get(el);
    let rect = null;
    for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (n !== root && ['hidden', 'auto', 'scroll', 'clip'].some(v => cs.overflowX === v || cs.overflowY === v)) {
        const r = n.getBoundingClientRect();
        rect = rect ? { l: Math.max(rect.l, r.left), t: Math.max(rect.t, r.top), r: Math.min(rect.r, r.right), b: Math.min(rect.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
    }
    clips.set(el, rect); return rect;
  };
  const clipTo = (el) => {
    const c = clipOf(el); if (!c) return true;
    if (c.r <= c.l || c.b <= c.t) return false;
    ctx.beginPath(); ctx.rect(c.l - box.left + ox, c.t - box.top + oy, c.r - c.l, c.b - c.t); ctx.clip(); return true;
  };
  const pending = [];
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === 3) {
      const el = node.parentElement, cs = getComputedStyle(el);
      if (el.closest('svg')) continue;
      ctx.save(); if (!clipTo(el)) { ctx.restore(); continue; } ctx.globalAlpha = alphaOf(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; ctx.fillStyle = cs.color; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      const upper = cs.textTransform === 'uppercase', range = document.createRange(), re = /\S+/g;
      let m;
      while ((m = re.exec(node.data))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0]; if (!r || !r.width) continue;
        ctx.fillText(upper ? m[0].toUpperCase() : m[0], r.left - box.left + ox, r.top - box.top + oy + r.height / 2 + 0.5);
      }
      ctx.restore(); continue;
    }
    const el = node, cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (el.tagName.toLowerCase() === 'select') {
      // the chosen option is the pill's text (brand A, brand B, measure…): paint it where the select sits
      const text = el.selectedOptions?.[0]?.text?.trim();
      if (text && r.width > 1) {
        ctx.save(); if (clipTo(el.parentElement ?? el)) {
          ctx.globalAlpha = alphaOf(el); ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; ctx.fillStyle = cs.color; ctx.textBaseline = 'middle';
          ctx.fillText(text, r.left - box.left + ox + (parseFloat(cs.paddingLeft) || 0), r.top - box.top + oy + r.height / 2 + 0.5);
        } ctx.restore();
      }
      let last = el; while (last.lastChild) last = last.lastChild; walker.currentNode = last; continue;
    }
    if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') continue;
    if (r.width < 1 || r.height < 1) continue;
    const x = r.left - box.left + ox, y = r.top - box.top + oy, radii = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(c => parseFloat(cs['border' + c + 'Radius']) || 0);
    ctx.save(); if (!clipTo(el.parentElement ?? el)) { ctx.restore(); continue; } ctx.globalAlpha = alphaOf(el);
    if (!clear(cs.backgroundColor)) { ctx.fillStyle = cs.backgroundColor; roundPath(ctx, x, y, r.width, r.height, radii); ctx.fill(); }
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map(sd => (cs['border' + sd + 'Style'] === 'none' ? 0 : parseFloat(cs['border' + sd + 'Width']) || 0));
    if (bw.some(v => v > 0)) {
      const same = bw.every(v => v === bw[0]) && ['Top', 'Right', 'Bottom', 'Left'].every(sd => cs['border' + sd + 'Color'] === cs.borderTopColor);
      if (same && !clear(cs.borderTopColor)) { ctx.strokeStyle = cs.borderTopColor; ctx.lineWidth = bw[0]; roundPath(ctx, x + bw[0] / 2, y + bw[0] / 2, r.width - bw[0], r.height - bw[0], radii.map(v => Math.max(0, v - bw[0] / 2))); ctx.stroke(); }
      else ['Top', 'Right', 'Bottom', 'Left'].forEach((sd, i) => { const col = cs['border' + sd + 'Color']; if (!bw[i] || clear(col)) return; ctx.fillStyle = col; if (i === 0) ctx.fillRect(x, y, r.width, bw[0]); if (i === 1) ctx.fillRect(x + r.width - bw[1], y, bw[1], r.height); if (i === 2) ctx.fillRect(x, y + r.height - bw[2], r.width, bw[2]); if (i === 3) ctx.fillRect(x, y, bw[3], r.height); });
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'canvas') { try { ctx.drawImage(el, x, y, r.width, r.height); } catch { /* unreadable canvas */ } }
    if (tag === 'svg') { pending.push({ el, x, y, w: r.width, h: r.height, a: alphaOf(el), clip: clipOf(el.parentElement ?? el) }); walker.currentNode = el; let last = el; while (last.lastChild) last = last.lastChild; walker.currentNode = last; }
    ctx.restore();
  }
  for (const item of pending) {
    try { const d = await drawable(item.el); ctx.save(); if (item.clip) { ctx.beginPath(); ctx.rect(item.clip.l - box.left + ox, item.clip.t - box.top + oy, item.clip.r - item.clip.l, item.clip.b - item.clip.t); ctx.clip(); } ctx.globalAlpha = item.a; ctx.drawImage(d.img, item.x, item.y, item.w, item.h); ctx.restore(); } catch { /* chart left blank rather than failing the whole image */ }
  }
}

// What the reader chose on the card (measure, window, brands) and how to read it: both are lost when the
// controls and the ⓘ are left out of the picture, so they go into the footer.
function cardSelections(root) {
  const out = [];
  for (const group of root.querySelectorAll('[role="group"][aria-label]')) {
    const on = [...group.querySelectorAll('[aria-pressed="true"],[aria-selected="true"]')].map(b => b.textContent.trim()).filter(Boolean);
    if (on.length && group.getAttribute('aria-label') !== 'Marcas consideradas chinesas') out.push(group.getAttribute('aria-label') + ': ' + on.join(', '));
  }
  for (const sel of root.querySelectorAll('select')) { const t = sel.selectedOptions?.[0]?.text?.trim(), l = sel.getAttribute('aria-label'); if (t && l) out.push(l + ': ' + t); }
  return [...new Set(out)];
}
function cardNotes(root) {
  const holder = root.querySelector('[data-export-notes]');
  const notes = holder ? [...holder.childNodes].map(n => n.textContent.trim()).filter(Boolean) : [];
  for (const el of root.querySelectorAll('[data-nxnote]')) { const t = (el.getAttribute('data-nxnote') || '').trim(); if (t) notes.push(t); }
  return [...new Set(notes)];
}
function recortLine() {
  const lens = document.querySelector('.nx-lens span')?.textContent?.trim();
  return [lens && 'Recorte: ' + lens, 'Filtros: ' + contextLine()].filter(Boolean);
}

function wrapLines(ctx, text, width) {
  const words = String(text).split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}

/* The card exactly as it looks on the page (HTML bars, SVG charts and canvas maps alike) on the Atlas grey,
   then a footer with the cut (period, territory, brand, filters), the source and the date. */
export async function exportCardToPng(root, { filename = 'atlas', scope = '' } = {}) {
  if (!root) throw Error('Nada para exportar nesta visualização.');
  await (document.fonts?.ready ?? Promise.resolve());
  const box = root.getBoundingClientRect(), w = Math.ceil(box.width), h = Math.ceil(box.height);
  const grey = '#f5f5f7', ink = '#1d1d1f', muted = '#6e6e73', stack = '"Inter Variable", Inter, -apple-system, system-ui, sans-serif';
  const scale = 2, pad = 28, inner = Math.max(w, 640), probe = document.createElement('canvas').getContext('2d');
  probe.font = `500 12.5px ${stack}`;
  const picked = cardSelections(root), notes = cardNotes(root);
  const fixed = root.getAttribute('data-export-scope');
  const lines = [...(fixed ? ['Escopo: ' + fixed] : recortLine()), picked.length && 'Visão: ' + picked.join(' · '), scope && 'Escopo: ' + scope, ...notes.map((n, i) => (i === 0 ? 'Como ler: ' : 'Nota: ') + n), 'Fonte: emplacamentos mensais, registros (não veículos únicos), automóveis e comerciais leves, salvo indicação no gráfico.'].filter(Boolean).flatMap(t => wrapLines(probe, t, inner));
  const footH = 22 + lines.length * 19 + 26, W = inner + pad * 2, H = pad + h + footH + pad - 8;
  const canvas = document.createElement('canvas'); canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  ctx.fillStyle = grey; ctx.fillRect(0, 0, W, H);
  await paintCard(ctx, root, pad + (inner - w) / 2, pad);
  let y = pad + h + 30;
  ctx.fillStyle = ink; ctx.font = `800 12px ${stack}`; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px'; ctx.fillText('ATLAS', pad + 4, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = muted; ctx.font = `500 12.5px ${stack}`;
  const date = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }), dw = ctx.measureText(date).width;
  ctx.fillText(date, W - pad - 4 - dw, y); y += 12;
  for (const line of lines) { y += 19; ctx.fillText(line, pad + 4, y); }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('O navegador não conseguiu gerar a imagem.');
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename.replace(/[^\w.+-]+/g, '-') + '.png';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

/* The card as it looks on screen; if the browser refuses (canvas tainted by foreignObject), the charts alone on the same template. */
export async function exportRootToPng(root, { filename = 'atlas', title = '', legend = [], scope = '' } = {}) {
  try { await exportCardToPng(root, { filename, scope }); return; } catch { /* fall back below */ }
  const nodes = [...root.querySelectorAll('svg:not(.ax-icon), canvas')].filter(n => !n.parentElement?.closest('svg') && n.getBoundingClientRect().width >= 120);
  if (!nodes.length) throw Error('Este cartão não tem um gráfico exportável como imagem.');
  await exportVisualsToPng(nodes, { filename, title: title || root.getAttribute('data-export-title') || '', legend });
}
