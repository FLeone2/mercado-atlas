import { createRoot } from 'react-dom/client';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/dm-serif-display/latin-400-italic.css';
import '@fontsource-variable/inter/wght.css';
import './styles/legacy/app.css';
import.meta.glob('./styles/legacy/*.css', { eager: true });
import './styles/atlas.css';
import { DataAppProvider } from './kit/index.js';
import { DashboardContent } from 'virtual:market';

const root = createRoot(document.getElementById('root'));
fetch('/data/snapshot.json')
  .then(r => { if (!r.ok) throw new Error('snapshot ' + r.status); return r.json(); })
  .then(snapshot => root.render(
    <DataAppProvider snapshot={snapshot}>
      <DashboardContent />
    </DataAppProvider>,
  ))
  .catch(error => root.render(
    <div className="at-boot" role="alert">
      <span className="at-wordmark">ATLAS</span>
      <span>Não foi possível carregar a base ({error.message}). Recarregue a página.</span>
    </div>,
  ));
