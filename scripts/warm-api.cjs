// Aquecimento: depois que um mês novo é publicado, pede ao servidor (/api/market) as combinações mais usadas,
// para que já estejam guardadas no primeiro acesso: cada estado (consulta principal e mapa no varejo) e os
// principais portes, nos quatro períodos rápidos. Usa exatamente o pedido que o navegador faz.
//   node scripts/warm-api.cjs https://mercado-atlas.pages.dev
// Espera o site publicar o manifesto deste repositório (até 25 min). Com o servidor desligado (404), sai sem erro.
const fs = require('fs'), path = require('path');
const { loadCore } = require('./lib/market-core.cjs');
const site = (process.argv[2] || 'https://mercado-atlas.pages.dev').replace(/\/$/, '');
const core = loadCore(), local = fs.readFileSync(path.join(__dirname, '../data/manifest.json'), 'utf8');
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const PORTES = ['SUB-SMALL', 'SMALL', 'COMPACT', 'MID', 'UPPER-MID', 'LARGE', 'PICK-UP SMALL', 'PICK-UP COMPACT', 'PICK-UP MID', 'PICK-UP LARGE'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. o site já está com os dados deste repositório?
  let manifest = null;
  for (let i = 0; i < 50; i++) {
    const text = await fetch(site + '/data/manifest.json', { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).catch(() => '');
    if (text && JSON.stringify(JSON.parse(text)) === JSON.stringify(JSON.parse(local))) { manifest = JSON.parse(text); break; }
    console.log('aguardando a publicação do manifesto…'); await sleep(30000);
  }
  if (!manifest) throw Error('o site não publicou o manifesto deste repositório a tempo');
  const v = core.precomputedIdentity(manifest);

  // 2. os pedidos: períodos rápidos × (estados × [principal, mapa no varejo] + portes × principal)
  const presets = core.latestPeriodPresets(manifest).presets.map(p => p.value);
  const latest = presets.at(-1).slice(0, 7), end = m => { const [y, mo] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0'); };
  const back = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(Date.UTC(y, mo - 1 - n, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
  const lastYear = String(+latest.slice(0, 4) - 1);
  const periods = [...new Set([...presets, back(latest, 11) + '-01..' + end(latest), lastYear + '-01-01..' + lastYear + '-12-31'])];
  const jobs = [];
  for (const date of periods) {
    for (const uf of UFS) { jobs.push(['atlas', { date, population: 'light', uf: [uf] }]); jobs.push(['leaders-br', { date, population: 'light', uf: [uf], tipo_venda: ['VAREJO'] }]); }
    for (const p of PORTES) jobs.push(['atlas', { date, population: 'light', bd_segmento: [p] }]);
  }

  // 3. quatro de cada vez
  const started = Date.now(), tally = {};
  let next = 0, off = false;
  async function lane() {
    while (!off && next < jobs.length) {
      const [m, filters] = jobs[next++], q = new URLSearchParams({ v, m, b: 'MITSUBISHI', f: core.canonicalFilterKey(filters) });
      const r = await fetch(site + '/api/market?' + q).catch(e => ({ status: 'rede: ' + e.message, headers: new Map() }));
      if (r.status === 404) { off = true; break; }
      const k = r.status === 200 ? r.headers.get('x-atlas-source') ?? 'ok' : 'HTTP ' + r.status;
      tally[k] = (tally[k] ?? 0) + 1;
      await r.arrayBuffer?.();
    }
  }
  await Promise.all([lane(), lane(), lane(), lane()]);
  if (off) { console.log('Cálculo no servidor desligado (404): nada a aquecer.'); return; }
  console.log(`aquecimento: ${jobs.length} pedidos em ${((Date.now() - started) / 1000).toFixed(0)} s`, tally);
  if (Object.keys(tally).some(k => k.startsWith('HTTP') || k.startsWith('rede'))) process.exitCode = 1;
})().catch(e => { console.error('aquecimento falhou:', e.message); process.exit(1); });
