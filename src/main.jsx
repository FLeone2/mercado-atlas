import { createRoot } from 'react-dom/client';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/dm-serif-display/latin-400-italic.css';
import '@fontsource-variable/inter/wght.css';
import './styles/legacy/app.css';
import.meta.glob('./styles/legacy/*.css', { eager: true });
import './styles/atlas.css';
import './styles/liquid-aurora.css';
import { DataAppProvider } from './kit/index.js';
import { ErrorBoundary } from './kit/boundary.jsx';
import { DashboardContent } from 'virtual:market';
import NextApp from './next/NextApp.jsx';
import ProtoApp from './proto/ProtoApp.jsx';

// O Atlas reorganizado (src/proto) é o padrão; a interface anterior fica em ?ui=atual e a antiga em ?ui=antigo.
const ui = new URLSearchParams(location.search).get('ui');

const root = createRoot(document.getElementById('root'));
fetch('/data/snapshot.json')
  .then(r => { if (!r.ok) throw new Error('snapshot ' + r.status); return r.json(); })
  .then(snapshot => root.render(
    <DataAppProvider snapshot={snapshot}>
      <ErrorBoundary>
        {ui === 'antigo' ? <DashboardContent /> : ui === 'atual' ? <NextApp /> : <ProtoApp />}
      </ErrorBoundary>
    </DataAppProvider>,
  ))
  .catch(error => root.render(
    <div className="at-boot" role="alert">
      <span className="at-wordmark">ATLAS</span>
      <span>Não foi possível carregar a base ({error.message}). Recarregue a página.</span>
    </div>,
  ));
