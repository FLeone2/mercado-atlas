import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import shell from 'virtual:shell';
import { DataAppProvider } from './kit/index.js';
import { ErrorBoundary } from './kit/boundary.jsx';
import App from './atlas/App.jsx';

// Os filtros e a base de dados vêm no próprio pacote (virtual:shell): a página abre sem esperar arquivo nenhum.
createRoot(document.getElementById('root')).render(
  <DataAppProvider snapshot={shell}>
    <ErrorBoundary><App /></ErrorBoundary>
  </DataAppProvider>,
);

// Na volta ao site, a página e os dados já lidos abrem do aparelho (public/sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
