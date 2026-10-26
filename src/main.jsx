import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import { DataAppProvider } from './kit/index.js';
import { ErrorBoundary } from './kit/boundary.jsx';
import App from './atlas/App.jsx';

const root = createRoot(document.getElementById('root'));
fetch('/data/snapshot.json')
  .then(r => { if (!r.ok) throw new Error('snapshot ' + r.status); return r.json(); })
  .then(snapshot => root.render(
    <DataAppProvider snapshot={snapshot}>
      <ErrorBoundary><App /></ErrorBoundary>
    </DataAppProvider>,
  ))
  .catch(error => root.render(
    <div className="at-boot" role="alert">
      <span className="at-wordmark">ATLAS</span>
      <span>Não foi possível carregar a base ({error.message}). Recarregue a página.</span>
    </div>,
  ));
