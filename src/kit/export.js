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

export async function exportSvgToPng(svg, { filename = 'grafico', title = '', legend = [] } = {}) {
  const rect = svg.getBoundingClientRect();
  const box = svg.viewBox?.baseVal?.width ? svg.viewBox.baseVal : rect, w = Math.round(box.width), h = Math.round(box.height);
  const clone = svg.cloneNode(true); inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', w); clone.setAttribute('height', h);
  const font = await fontFaces();
  if (font) { const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = font; clone.insertBefore(style, clone.firstChild); }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('Não foi possível desenhar o gráfico.')); img.src = url; });
    const paper = resolveColor('--paper', '#f4f1e8'), ink = resolveColor('--ink', '#173e35'), muted = resolveColor('--muted', '#65726a');
    const scale = 2, pad = 28, titleH = title ? 40 : 0, rows = [], probe = document.createElement('canvas').getContext('2d');
    probe.font = '13px Inter, sans-serif';
    let row = [], x = 0;
    for (const item of legend) { const iw = 22 + probe.measureText(item.label).width + 18; if (x + iw > w && row.length) { rows.push(row); row = []; x = 0; } row.push({ ...item, x }); x += iw; }
    if (row.length) rows.push(row);
    const legendH = rows.length * 22, footH = 26, W = w + pad * 2, H = pad + titleH + h + (legendH ? legendH + 10 : 0) + footH + pad;
    const canvas = document.createElement('canvas'); canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
    ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
    if (title) { ctx.fillStyle = ink; ctx.font = '24px "DM Serif Display", Georgia, serif'; ctx.fillText(title, pad, pad + 22); }
    ctx.drawImage(image, pad, pad + titleH, w, h);
    let y = pad + titleH + h + 10; ctx.font = '13px Inter, sans-serif';
    for (const r of rows) { for (const item of r) { ctx.fillStyle = item.color; ctx.beginPath(); ctx.arc(pad + item.x + 6, y + 9, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink; ctx.fillText(item.label, pad + item.x + 18, y + 13); } y += 22; }
    ctx.fillStyle = muted; ctx.font = '11px Inter, sans-serif';
    ctx.fillText('Atlas · Mercado Automotivo · emplacamentos de automóveis e comerciais leves · gerado em ' + new Date().toLocaleDateString('pt-BR'), pad, H - pad + 4);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename.replace(/[^\w.-]+/g, '-') + '.png';
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } finally { URL.revokeObjectURL(url); }
}
