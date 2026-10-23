// New interface (default UI): every area and sub-tab on desktop and phone, failing on a page
// error or horizontal scrolling; then the audit reproductions of 22/10/2026 as assertions on
// the published numbers and labels (they must show the CORRECT result).
// Needs a running preview:  npm run build && npm run preview   (port 8765)
// Usage: node tests/visual/novo.cjs [baseURL]
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const base = process.argv[2] ?? 'http://localhost:8765/';
const AREAS = ['panorama', 'evolucao', 'concorrencia', 'segmentos', 'territorios', 'explorar', 'economia', 'animacoes'];

(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const failures = [], views = { n: 0 };
  const open = async (query, width = 1440, wait = 9000) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    await page.goto(base + query, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.nx-nav'); await page.waitForTimeout(wait);
    return page;
  };
  const check = async (page, label) => {
    views.n++;
    if (page.errors.length) failures.push(`${label}: ${page.errors[0]}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) failures.push(`${label}: rolagem horizontal`);
  };

  // 1) sweep
  for (const width of [1440, 390]) for (const area of AREAS) {
    const page = await open('?a=' + area, width, 7000);
    await check(page, `${area} ${width}`);
    const tabs = await page.$$eval('.nx-tabs button', b => b.map(x => x.textContent));
    for (let i = 1; i < tabs.length; i++) {
      await page.locator('.nx-tabs button').nth(i).click(); await page.waitForTimeout(3500);
      await check(page, `${area}/${tabs[i]} ${width}`);
    }
    await page.close();
  }

  // 2) audit reproductions
  const text = async page => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const expect = (id, ok, detail) => { if (!ok) failures.push(`${id}: ${detail}`); };
  const tab = async (page, name) => { await page.locator('.nx-tabs button', { hasText: name }).first().click(); await page.waitForTimeout(7000); };
  let page, t;

  page = await open('?a=panorama&f.uf=["SP"]&f.regiao=["Sul"]'); t = await text(page);
  expect('CODE-H01', !t.includes('2.156.654'), 'SP ∩ Sul ainda mostra histórico nacional'); await page.close();

  page = await open('?a=segmentos&f.date=2026-09-01..2026-09-15'); await tab(page, 'Carroceria');
  t = (await page.locator('.nxs-b-leaders').innerText()).replace(/\s+/g, ' ');
  expect('LEG-01', /Hatch .*?BYD .*?6\.442/.test(t), 'Hatch 1–15/set deveria ter BYD 6.442'); await page.close();

  // decisão do dono: "Não classificado" é ruído e fica fora de mapas e gráficos
  page = await open('?a=concorrencia&f.marca=["IVECO"]'); await tab(page, 'Conexões'); t = await text(page);
  expect('LEG-02', !/Não classificado|Sem correspondência/.test(t), '"Não classificado" apareceu em Conexões'); await page.close();

  page = await open('?a=explorar&f.grupo_modelo=["STRADA"]&q.d=marca&q.mode=compare&q.c=["FIAT","VW"]&q.cm=share', 1440, 12000); t = await text(page);
  expect('UI-03', /Fiat 53\.586 19,94%/.test(t) && t.includes('retiram o filtro de modelo'), 'tabela e série devem usar o mesmo universo, com aviso'); await page.close();

  page = await open('?a=explorar&f.municipio=["SAO PAULO"]&q.d=marca&q.mode=compare&q.c=["FIAT","VW"]', 1440, 12000); t = await text(page);
  expect('UI-04', t.includes('A série mensal não aplica Município'), 'aviso de Município ausente no modo Comparar'); await page.close();

  page = await open('?a=territorios&t.tab=3d', 1440, 12000); t = await text(page);
  expect('GEO-01', t.includes('Base fixa'), 'atlas 3D sem aviso de base fixa');
  expect('GEO-07', (await page.locator('.nx-tabs [aria-selected=true]').innerText()) === 'Brasil em 3D', 'link não restaurou a sub-aba'); await page.close();

  page = await open('?a=segmentos&f.propulsao=["BEV"]'); await tab(page, 'Propulsão'); t = await text(page);
  expect('LEG-03', t.includes('O filtro de propulsão não se aplica aqui'), 'ressalva de propulsão não renderizada'); await page.close();

  page = await open('?a=concorrencia'); t = await text(page);
  const ranks = [...(t.match(/··· (.{0,160})/)?.[1] ?? '').matchAll(/(\d+) [A-ZÁ-Ú][^\d]+ ([\d,]+)%/g)].map(m => [+m[1], parseFloat(m[2].replace(',', '.'))]);
  expect('UI-01', ranks.length >= 2 && ranks.every((r, i) => !i || (r[0] > ranks[i - 1][0] && r[1] <= ranks[i - 1][1])), 'posições do fim do ranking fora de ordem'); await page.close();

  for (const [d, label] of [['2026-09-15', '15 set/2026'], ['2026-09', 'set/2026']]) {
    page = await open('?a=panorama&f.date=' + d, 1440, 7000);
    expect('TST-01', (await page.$eval('.nx-lens span', e => e.textContent)).startsWith(label), `f.date=${d} deveria declarar ${label}`); await page.close();
  }

  page = await open('?a=panorama&f.propulsao=["BEV"]&f.marca=["MITSUBISHI"]', 1440, 7000); await page.click('.nx-lens'); await page.waitForTimeout(600);
  const chips = await page.$$eval('#nx-sheet [aria-label="Propulsão"] button', b => b.map(x => x.textContent));
  expect('UI-02', chips.includes('BEV') && chips.includes('HEV'), 'propulsão deve manter BEV visível e permitir somar HEV'); await page.close();

  // origem chinesa: números conferidos contra os cubos mensais (set/2026) e seleção de marcas
  page = await open('?a=segmentos', 1440, 7000); await tab(page, 'Origem'); t = await text(page);
  expect('ORIGEM-1', t.includes('48.984') && t.includes('9.224'), 'origem chinesa deveria somar 48.984 e parcerias 9.224 em set/2026');
  expect('ORIGEM-2', !t.includes('Origem BD incompleta'), 'aviso de origem incompleta voltou (lacunas por ocultação)'); await page.close();

  page = await open('?a=economia&e=chinesas', 1440, 12000); t = await text(page);
  expect('CHN-1', /Marcas chinesas/.test(t) && t.includes('Mercado × marcas chinesas') && t.includes('Participação das chinesas no mercado'), 'aba Marcas chinesas sem os dois gráficos');
  await page.locator('.nxch-extras .nx-chip', { hasText: 'Parcerias' }).click(); await page.waitForTimeout(1500);
  expect('CHN-2', decodeURIComponent(page.url()).replace(/\+/g, ' ').includes('CAOA CHERY') && /3[0-9]\.[0-9]{3} emplacamentos|[4-9][0-9]\.[0-9]{3} emplacamentos/.test(await text(page)), 'incluir CAOA deveria entrar no link e aumentar a soma'); await page.close();

  page = await open('?a=segmentos&f.date=2026-01-01..2026-09-30', 1440, 12000);
  const slices = await page.locator('g.am-pyramid-slice').all(); let compact = '';
  for (const e of slices) { await e.hover({ force: true }).catch(() => {}); const d = (await page.locator('.am-rank-detail').first().innerText().catch(() => '')).replace(/\s+/g, ' '); if (/^Compact ·/.test(d)) compact = d; }
  expect('PIRAMIDE', /24,2%/.test(compact) && compact.includes('27.080'), 'pirâmide Compact jan–set/2026 deveria ter 24,2% chinesa e 27.080 parceria (recálculo independente)'); await page.close();

  await browser.close();
  if (failures.length) { console.error('FAIL\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log(`PASS novo: ${views.n} vistas sem erro nem rolagem horizontal · 16 conferências (auditoria, origem chinesa e pirâmide) com o resultado correto`);
})();
