// Visual sweep: every area in light and dark, desktop and phone. Fails on a page error
// or horizontal scrolling. Screenshots go to tests/visual/output/.
// Needs a running preview:  npm run build && npm run preview   (port 8765)
// Usage: node tests/visual/run.cjs [baseURL]
const path = require('path'), fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const base = process.argv[2] ?? 'http://localhost:8765/';
const tabs = ['dashboard', 'history', 'competition', 'ranking', 'segments', 'structure', 'technology', 'origin', 'geography', 'explore', 'models', 'animations', 'quality'];
const out = path.join(__dirname, 'output'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const failures = [];
  for (const [device, width] of [['desktop', 1440], ['phone', 390]]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
    for (const tab of tabs) {
      const errors = [];
      const onError = e => errors.push(e.message);
      page.on('pageerror', onError);
      await page.goto(base + '?tab=' + tab, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.at-masthead', { timeout: 30000 });
      await page.waitForTimeout(6000);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      await page.screenshot({ path: path.join(out, `${tab}-${device}-${theme}.png`), fullPage: false });
      page.off('pageerror', onError);
      if (errors.length) failures.push(`${tab} ${device} ${theme}: ${errors[0]}`);
      if (overflow > 1) failures.push(`${tab} ${device} ${theme}: rolagem horizontal de ${overflow}px`);
    }
    await page.close();
  }
  // Exportar recorte opens and closes in every area that has it, twice, without unmounting the app (audit AT-01).
  const dialogTabs = ['dashboard', 'history', 'segments', 'technology', 'origin', 'geography'];
  const dpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const tab of dialogTabs) {
    const errors = []; const onError = e => errors.push(e.message); dpage.on('pageerror', onError);
    await dpage.goto(base + '?tab=' + tab, { waitUntil: 'domcontentloaded' });
    await dpage.waitForSelector('.at-masthead', { timeout: 30000 });
    await dpage.waitForTimeout(6000);
    const button = dpage.getByRole('button', { name: /Exportar recorte/ }).first();
    for (let round = 1; round <= 2; round++) {
      await button.scrollIntoViewIfNeeded(); await button.click(); await dpage.waitForTimeout(700);
      const open = await dpage.locator('[role=dialog]').count(), alive = await dpage.evaluate(() => document.querySelector('#root')?.children.length > 0);
      if (!open || !alive) failures.push(`${tab}: Exportar recorte ${round}ª vez — diálogo ${open ? 'aberto' : 'não abriu'}, app ${alive ? 'ok' : 'apagado'}`);
      await dpage.keyboard.press('Escape'); await dpage.waitForTimeout(400);
      if (await dpage.locator('[role=dialog]').count()) failures.push(`${tab}: Escape não fechou o diálogo`);
    }
    dpage.off('pageerror', onError);
    if (errors.length) failures.push(`${tab}: erro ao exportar recorte: ${errors[0]}`);
  }
  await dpage.close();
  await browser.close();
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log(`PASS ${tabs.length * 4} vistas sem erro nem rolagem horizontal · Exportar recorte abre e fecha em ${dialogTabs.length} áreas`);
})();
