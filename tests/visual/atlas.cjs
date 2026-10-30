// The Atlas in a real browser: every page on desktop and phone, failing on a page error, horizontal
// scrolling or a link to a retired interface; then the filters (a state, a size class and the brand in
// focus change the scorecard and the address bar, "Limpar" brings everything back), the map, versions,
// connections, the race, the simulator, the technical analyses and the lab tools.
// Needs a running preview:  npm run build && npm run preview   (port 8765)
// Usage: node tests/visual/atlas.cjs [baseURL]
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
    if (await page.locator('a[href*="ui="], .nxl, [data-legacy-tab]').count()) failures.push(`${p} ${width}: link ou peça da interface antiga`);
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

  // mapa: entrar num estado mostra o cartão dele; buscar e abrir um município; ‹ › passam de município
  {
    const m = await open('?a=territorios', 1440, 9000);
    await m.evaluate(() => { const e = document.querySelector('#t-mapa'); if (e) scrollTo(0, e.getBoundingClientRect().top + scrollY - 120); }); await m.waitForTimeout(800);
    await m.locator('.px-cities.scroll button', { hasText: 'Minas Gerais' }).click(); await m.waitForTimeout(2000);
    if ((await m.locator('.px-map-panel h3').first().innerText()) !== 'Minas Gerais') failures.push('mapa: clicar no estado não abriu o cartão do estado');
    if (!(await m.locator('.px-ufbrands li').count())) failures.push('mapa: o estado não mostra o ranking de marcas');
    await m.locator('.px-cityq').fill('uberl'); await m.waitForTimeout(300); await m.locator('.px-cities.scroll button').first().click(); await m.waitForTimeout(1800);
    if ((await m.locator('.px-city h3').innerText()) !== 'Uberlândia') failures.push('mapa: a busca não abriu o município');
    await m.locator('.px-city-nav button').last().click(); await m.waitForTimeout(1200);
    if ((await m.locator('.px-city h3').innerText()) === 'Uberlândia') failures.push('mapa: › não passou para o próximo município');
    if (m.errors.length) failures.push('mapa: ' + m.errors[0]);
    await m.close();
  }
  // corrida das marcas anda com o play; o simulador responde a um cenário pronto
  {
    const c = await open('?a=concorrencia', 1440, 9000);
    await c.evaluate(() => document.querySelector('#c-corrida')?.scrollIntoView()); await c.waitForTimeout(800);
    await c.locator('.px-race-ctl input[type=range]').fill('0'); const m0 = await c.locator('.px-race-m').innerText();
    await c.locator('.px-play').click(); await c.waitForTimeout(2500);
    if ((await c.locator('.px-race-m').innerText()) === m0) failures.push('corrida: o play não avançou os meses');
    if (c.errors.length) failures.push('corrida: ' + c.errors[0]);
    await c.close();
    const e = await open('?a=economia', 1440, 9000);
    await e.evaluate(() => document.querySelector('#e-simulador')?.scrollIntoView()); await e.waitForTimeout(600);
    await e.locator('.px-sim-presets .nx-chip', { hasText: 'Selic cai' }).click(); await e.waitForTimeout(400);
    const out = await e.locator('.px-sim-r b').first().innerText();
    if (!/^\+[1-9]/.test(out)) failures.push('simulador: corte de juros deveria aumentar o mercado (veio ' + out + ')');
    if (e.errors.length) failures.push('economia: ' + e.errors[0]);
    await e.close();
  }

  // versões: ranking conectado, versão × versão (tirar e pôr uma versão) e as versões da marca
  {
    const c = await open('?a=concorrencia', 1440, 9000);
    await c.evaluate(() => document.querySelector('#c-versoes')?.scrollIntoView()); await c.waitForTimeout(6000);
    const sec = c.locator('#c-versoes');
    if ((await sec.locator('svg path').count()) < 10) failures.push('versões: o ranking conectado das versões não desenhou');
    const rows = () => sec.locator('.px-cmp tbody tr').count(), n0 = await rows();
    if (n0 < 3) failures.push('versões: versão × versão com menos de 3 versões (' + n0 + ')');
    await sec.locator('.nx-chip', { hasText: '×' }).last().click(); await c.waitForTimeout(400);
    const opt = await c.locator('#px-vlist option').nth(3).getAttribute('value');
    await sec.locator('.px-vpick input').fill(opt); await c.waitForTimeout(800);
    if ((await rows()) !== n0 || !(await sec.locator('.px-cmp tbody').innerText()).includes(opt.split(' · ')[0])) failures.push('versões: adicionar uma versão pela busca não funcionou');
    if ((await sec.locator('.px-vhead ~ div svg path').count()) < 3) failures.push('versões: as linhas de 36 meses não desenharam');
    // conexões nativas
    await c.evaluate(() => document.querySelector('#c-conexoes')?.scrollIntoView()); await c.waitForTimeout(9000);
    if ((await c.locator('#c-conexoes .px-sankey path').count()) < 20) failures.push('conexões: o Sankey não desenhou');
    if ((await c.locator('#c-conexoes .px-chord path').count()) < 10) failures.push('conexões: as cordas não desenharam');
    if (c.errors.length) failures.push('versões/conexões: ' + c.errors[0]);
    await c.close();
    const f = await open('?a=foco', 1440, 9000);
    await f.evaluate(() => document.querySelector('#f-versoes')?.scrollIntoView()); await f.waitForTimeout(5000);
    if ((await f.locator('#f-versoes tbody tr').count()) < 5) failures.push('foco: a tabela de versões da marca está vazia');
    await f.evaluate(() => document.querySelector('#f-segmentos')?.scrollIntoView()); await f.waitForTimeout(5000);
    if ((await f.locator('.px-vseg .px-mbar').count()) < 5) failures.push('foco: as barras de versões do segmento não apareceram');
    await f.evaluate(() => document.querySelector('#f-mensal')?.scrollIntoView()); await f.waitForTimeout(2000);
    if ((await f.locator('#f-mensal .px-mm tbody tr').count()) < 2) failures.push('foco: a tabela mês a mês dos segmentos está vazia');
    if ((await f.locator('#f-mensal .px-line').count()) < 2) failures.push('foco: o gráfico mês a mês dos segmentos não desenhou');
    await f.locator('#f-mensal button', { hasText: 'Participação' }).click(); await f.waitForTimeout(500);
    if (!(await f.locator('#f-mensal .px-mm tbody td b').first().innerText()).includes('%')) failures.push('foco: a participação mês a mês não apareceu');
    if (f.errors.length) failures.push('foco: ' + f.errors[0]);
    await f.close();
  }
  // laboratório: pirâmide de segmentos (faixas e a parte da marca em foco)
  {
    const m = await open('?a=laboratorio', 1440, 9000);
    await m.evaluate(() => document.querySelector('#l-piramide')?.scrollIntoView()); await m.waitForTimeout(3000);
    if ((await m.locator('#l-piramide .px-pyr-b').count()) < 6) failures.push('laboratório: a pirâmide tem poucas faixas');
    if (!(await m.locator('#l-piramide .px-pyr-p').allInnerTexts()).some(t => t !== '0,0%')) failures.push('laboratório: a pirâmide não mostra a parte da marca em foco');
    await m.locator('#l-piramide button', { hasText: 'Eletrificados' }).click(); await m.waitForTimeout(500);
    if ((await m.locator('#l-piramide .px-pyr-b polygon').count()) < 8) failures.push('laboratório: a pirâmide não desenhou os eletrificados');
    if (m.errors.length) failures.push('pirâmide: ' + m.errors[0]);
    await m.close();
  }
  // territórios: concessionárias só aparecem dentro do estado e o botão desliga
  {
    const t = await open('?a=territorios', 1440, 9000);
    await t.evaluate(() => { const e = document.querySelector('#t-mapa'); if (e) scrollTo(0, e.getBoundingClientRect().top + scrollY - 120); }); await t.waitForTimeout(800);
    if (!(await t.locator('.px-map-panel').innerText()).includes('Rede Mitsubishi')) failures.push('territórios: o painel do Brasil não fala da rede Mitsubishi');
    await t.locator('.px-cities.scroll button', { hasText: 'São Paulo' }).first().click(); await t.waitForTimeout(2500);
    if (!(await t.locator('.px-dealer-box').count())) failures.push('territórios: o estado não mostra a rede de concessionárias');
    await t.locator('.px-dealer-tg').click(); await t.waitForTimeout(500);
    if (await t.locator('.px-dealer-box').count()) failures.push('territórios: desligar as concessionárias não as escondeu');
    if (t.errors.length) failures.push('territórios: ' + t.errors[0]);
    await t.close();
  }
  // economia: análises técnicas nativas
  {
    const e = await open('?a=economia', 1440, 9000);
    await e.evaluate(() => document.querySelector('#e-tecnico')?.scrollIntoView()); await e.waitForTimeout(5000);
    if ((await e.locator('#e-tecnico ~ .nx-grid table tbody tr').count()) < 2) failures.push('economia: a tabela de coeficientes não apareceu');
    if (e.errors.length) failures.push('economia técnica: ' + e.errors[0]);
    await e.close();
  }
  // laboratório: perguntas, construtor, mapa no tempo, relevo e metodologia
  {
    const l = await open('?a=laboratorio', 1440, 9000);
    if ((await l.locator('.px-qa-i').count()) < 6) failures.push('laboratório: poucas perguntas rápidas');
    await l.locator('#l-construtor select').selectOption('modelo'); await l.waitForTimeout(800);
    if ((await l.locator('#l-construtor .nx-bar').count()) < 10) failures.push('laboratório: o construtor por versão não mostrou barras');
    await l.locator('#l-construtor select').selectOption('marca'); await l.locator('#l-construtor button', { hasText: 'No tempo' }).click(); await l.waitForTimeout(4000);
    if ((await l.locator('#l-construtor svg path').count()) < 4) failures.push('laboratório: o construtor no tempo não desenhou linhas');
    await l.evaluate(() => document.querySelector('#l-mapa')?.scrollIntoView()); await l.waitForTimeout(6000);
    await l.locator('#l-mapa input[type=range]').fill('0'); const m0 = await l.locator('.px-mt-month').innerText();
    await l.locator('#l-mapa .px-play').click(); await l.waitForTimeout(1500);
    if ((await l.locator('.px-mt-month').innerText()) === m0) failures.push('laboratório: o mapa no tempo não andou com o play');
    await l.evaluate(() => document.querySelector('#l-relevo')?.scrollIntoView()); await l.waitForTimeout(6000);
    const ink = await l.evaluate(() => { const c = document.querySelector('#l-relevo canvas'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++; return n; });
    if (ink < 50) failures.push('laboratório: o relevo não desenhou');
    if ((await l.locator('.px-met-c').count()) !== 4) failures.push('laboratório: metodologia incompleta');
    await l.evaluate(() => document.querySelector('#l-calor')?.scrollIntoView()); await l.waitForTimeout(5000);
    const heat = await l.evaluate(() => { const c = document.querySelector('#l-calor canvas'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 53) if (d[i + 2] > d[i] + 40) n++; return n; });
    if (heat < 30) failures.push('laboratório: o mapa de calor não desenhou');
    await l.evaluate(() => document.querySelector('#l-top3')?.scrollIntoView()); await l.waitForTimeout(1500);
    if ((await l.locator('#l-top3 .px-t3-row').count()) < 20) failures.push('laboratório: o top 3 por estado não listou os estados');
    await l.locator('#l-top3 button', { hasText: 'Municípios' }).click(); await l.waitForTimeout(6000);
    if ((await l.locator('#l-top3 canvas').count()) !== 3) failures.push('laboratório: o top 3 por município não desenhou os três mapas');
    if (l.errors.length) failures.push('laboratório: ' + l.errors[0]);
    await l.close();
  }

  await browser.close();
  if (failures.length) { console.error('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log(`PASS Atlas: ${PAGES.length * 2} páginas sem erro, sem rolagem horizontal e sem peças antigas · filtros · mapa por estado e município · versões · mês a mês nos segmentos · conexões · corrida · simulador · pirâmide · concessionárias · análises técnicas · laboratório (calor e top 3)`);
})();
