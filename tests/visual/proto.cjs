// Reorganization prototype (default UI on this branch): every page on desktop and phone, failing on a
// page error or horizontal scrolling; then the filters: a state, a size class and the brand in focus
// change the focus scorecard and the address bar, and "Limpar" brings everything back.
// Needs a running preview:  npm run build && npm run preview   (port 8765)
// Usage: node tests/visual/proto.cjs [baseURL]
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const base = process.argv[2] ?? 'http://localhost:8765/';
const PAGES = ['resumo', 'mercado', 'concorrencia', 'foco', 'territorios', 'economia', 'laboratorio'];

(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const failures = [];
  const open = async (query, width = 1440, wait = 8000) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    await page.goto(base + query, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.px-fbar'); await page.waitForTimeout(wait);
    return page;
  };
  for (const width of [1440, 390]) for (const p of PAGES) {
    const page = await open('?a=' + p, width);
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 800) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(120); }
    await page.waitForTimeout(1500);
    if (page.errors.length) failures.push(`${p} ${width}: ${page.errors[0]}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) failures.push(`${p} ${width}: rolagem horizontal`);
    if (await page.locator('.px-skel').count() && p !== 'laboratorio') failures.push(`${p} ${width}: bloco ainda carregando depois de rolar a página`);
    await page.close();
  }

  const page = await open('?a=concorrencia');
  const strip = async () => (await page.locator('.px-strip').first().innerText()).replace(/\s+/g, ' ');
  const pick = async (button, chip) => { await page.locator('.px-fbtn', { hasText: button }).click(); await page.locator('.px-pop .nx-chip', { hasText: chip }).first().click(); await page.keyboard.press('Escape'); await page.waitForTimeout(9000); };
  const s0 = await strip();
  await pick('Território', 'São Paulo');
  const s1 = await strip(), q1 = new URL(page.url()).search;
  if (s1 === s0 || !q1.includes('f.uf')) failures.push('filtro de estado não mudou o placar ou o endereço');
  if (!(await page.locator('.px-scope').first().innerText()).includes('São Paulo')) failures.push('o recorte em texto não mostra o estado escolhido');
  await pick('Porte', 'Picape média');
  if ((await strip()) === s1) failures.push('filtro de porte não mudou o placar');
  await page.locator('.px-fbtn', { hasText: 'Marca em foco' }).click(); await page.locator('.px-pop .nx-chip', { hasText: 'Toyota' }).first().click(); await page.waitForTimeout(9000);
  if (!(await strip()).startsWith('TOYOTA')) failures.push('trocar a marca em foco não trocou o placar');
  if ((await page.locator('.nx-links a.px-focus-link').innerText()) !== 'Toyota') failures.push('a página da marca em foco não mudou de nome');
  await page.locator('.px-clear').click(); await page.waitForTimeout(9000);
  if ((await strip()) !== s0 || new URL(page.url()).search !== '?a=concorrencia') failures.push('Limpar não voltou ao recorte inicial');
  if (page.errors.length) failures.push('filtros: ' + page.errors[0]);
  await page.close();

  await browser.close();
  if (failures.length) { console.error('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log(`PASS protótipo: ${PAGES.length * 2} páginas sem erro nem rolagem horizontal · filtros de estado, porte, marca em foco e Limpar`);
})();
