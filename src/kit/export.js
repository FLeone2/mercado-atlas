// "Baixar PNG": the chart SVG is redrawn on a canvas with its computed colours, the
// Atlas fonts embedded, the legend under it, a title and the source line.
export const EXPORT_STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-family', 'font-style', 'text-anchor', 'dominant-baseline', 'paint-order', 'visibility', 'display', 'letter-spacing'];

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
  const paper = resolveColor('--paper', '#f4f1e8'), ink = resolveColor('--ink', '#173e35'), muted = resolveColor('--ink-soft', '#5b6b63');
  const scale = 2, pad = 28, titleH = title ? 40 : 0, rows = [], probe = document.createElement('canvas').getContext('2d');
  probe.font = '13px Inter, sans-serif';
  let row = [], x = 0;
  for (const item of legend) { const iw = 22 + probe.measureText(item.label).width + 18; if (x + iw > w && row.length) { rows.push(row); row = []; x = 0; } row.push({ ...item, x }); x += iw; }
  if (row.length) rows.push(row);
  const legendH = rows.length * 22, footH = 40, W = w + pad * 2, H = pad + titleH + h + (legendH ? legendH + 10 : 0) + footH + pad;
  const canvas = document.createElement('canvas'); canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
  if (title) { ctx.fillStyle = ink; ctx.font = '24px "DM Serif Display", Georgia, serif'; ctx.fillText(title, pad, pad + 22); }
  let top = pad + titleH;
  for (let r = 0; r < rowsN; r++) {
    parts.slice(r * cols, r * cols + cols).forEach((p, c) => ctx.drawImage(p.img, pad + c * (cellW + gap), top, p.w, p.h));
    top += rowH(r) + gap;
  }
  let y = pad + titleH + h + 10; ctx.font = '13px Inter, sans-serif';
  for (const r of rows) { for (const item of r) { ctx.fillStyle = item.color; ctx.beginPath(); ctx.arc(pad + item.x + 6, y + 9, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink; ctx.fillText(item.label, pad + item.x + 18, y + 13); } y += 22; }
  ctx.fillStyle = muted; ctx.font = '11px Inter, sans-serif';
  ctx.fillText(contextLine(), pad, H - pad - 10);
  ctx.fillText('Atlas · Mercado Automotivo · emplacamentos (registros) · gerado em ' + new Date().toLocaleDateString('pt-BR'), pad, H - pad + 4);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename.replace(/[^\w.-]+/g, '-') + '.png';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

export function exportSvgToPng(svg, options) { return exportVisualsToPng([svg], options); }
