import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const MARKET = resolve(root, 'src/market');
const MARKET_ID = 'virtual:market';

// The market views share one scope (they were written as one script). This plugin
// assembles src/market/core.js into a module: `/*@include file*/` pastes a file,
// `/*@string a + b*/` pastes the files joined as a JS string (worker sources).
export function assembleMarket(watch = () => {}) {
  const read = file => { const path = resolve(MARKET, file); watch(path); return readFileSync(path, 'utf8'); };
  const expand = text => text
    .replace(/\/\*@include ([^*\s]+)\*\//g, (_, file) => expand(read(file)))
    .replace(/\/\*@string ([^*]+)\*\//g, (_, list) => JSON.stringify(list.split('+').map(f => read(f.trim())).join('\n')));
  const body = expand(read('core.js'));
  return `import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as dataApp from '/src/kit/index.js';
const __modules = { react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM, '@openai/data-app': dataApp };
const __module = { exports: {} };
(function (module, exports, require) {
${body}
})(__module, __module.exports, id => { if (id in __modules) return __modules[id]; throw new Error('Módulo ausente: ' + id); });
export const DashboardContent = __module.exports.DashboardContent;
`;
}

function marketPlugin() {
  return {
    name: 'atlas-market',
    resolveId: id => (id === MARKET_ID ? '\0' + MARKET_ID : null),
    load(id) { return id === '\0' + MARKET_ID ? assembleMarket(file => this.addWatchFile(file)) : null; },
  };
}

// data/ stays at the repository root (scripts and tests read it there); it is served
// in dev and copied next to the bundle on build. Scenario sources (*.csv etc.) stay private.
function dataPlugin() {
  const dataDir = resolve(root, 'data');
  return {
    name: 'atlas-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const file = join(dataDir, decodeURIComponent(req.url.split('?')[0]));
        if (!file.startsWith(dataDir) || !existsSync(file) || statSync(file).isDirectory()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const out = resolve(root, 'dist/data');
      rmSync(out, { recursive: true, force: true });
      for (const name of ['manifest.json', 'snapshot.json', 'cubes', 'origin-cubes', 'geography', 'history', 'reference']) cpSync(join(dataDir, name), join(out, name), { recursive: true });
      for (const name of readdirSync(join(dataDir, 'scenarios'))) if (name.endsWith('.json')) cpSync(join(dataDir, 'scenarios', name), join(out, 'scenarios', name));
      rmSync(join(out, 'geography/.gitkeep'), { force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), marketPlugin(), dataPlugin()],
  build: { chunkSizeWarningLimit: 4000, sourcemap: false, assetsDir: 'assets/app' },
  server: { port: 5173 },
});
