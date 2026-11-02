// Generates server/engine.js: the same market worker the browser runs, as an ES module for the
// Cloudflare Pages Function (functions/api/market.js). The worker source is not copied by hand: this
// script wraps src/market/workers/evolution-market-worker.js and the two request modules, so the
// server and the browser always compute with the same code. Runs in `npm run build`; not versioned.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), src = p => fs.readFileSync(path.join(root, 'src/market', p), 'utf8');
const strip = text => text.replace(/^if\(typeof module!=='undefined'&&module\.exports\).*$/m, '');

const worker = src('workers/evolution-market-worker.js');
if (!/\}\)\(\);\s*$/.test(worker)) throw Error('evolution-market-worker.js: fim inesperado (esperava "})();")');
const engine = worker.replace(/\}\)\(\);\s*$/, '  return { installMarketWorker, createMarketCubeLoader, createMonthlyAggregateCache, createResultCache, canonicalFilterKey };\n})();\n');

const out = `// GERADO por scripts/build-server.cjs a partir de src/market (não edite: rode npm run build).
// O mesmo cálculo do navegador, para o servidor (functions/api/market.js).
/* eslint-disable */
const self = undefined; // o worker não se instala sozinho aqui
const __engine = ${engine.trim().replace(/^\(function \(\) \{/, '(function () {')}
${strip(src('modules/market-request.js'))}
${strip(src('modules/precomputed.js'))}
export const { installMarketWorker, createMarketCubeLoader, createMonthlyAggregateCache, createResultCache, canonicalFilterKey } = __engine;
export { marketRequestOptions, marketFocusBrand, marketRequestKey, precomputedIdentity, precomputedCanonical };
`;
fs.mkdirSync(path.join(root, 'server'), { recursive: true });
fs.writeFileSync(path.join(root, 'server/engine.js'), out);
console.log('build-server: server/engine.js (' + (out.length / 1024).toFixed(0) + ' KB)');
