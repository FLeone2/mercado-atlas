import { DashboardContent } from 'virtual:market';
import { ErrorBoundary } from '../kit/boundary.jsx';

/* One area of the current Atlas (its maps, rankings, flows, pyramid…) hosted inside the new interface.
   The filters are the page's global filters; the header, filter bar and footer of the current Atlas are not shown.
   The look comes from next.css (.nx .nxl-host), which maps the current Atlas' colour tokens to the new palette. */
export default function LegacyTab({ tab, className = '', hide = [] }) {
  // `hide` lists ids of sections of the current Atlas to leave out (what the new blocks already cover).
  const css = hide.map(id => `.nxl[data-legacy-tab="${tab}"] #${id}{display:none}`).join('');
  return (
    <div className={'nxl ' + className} data-legacy-tab={tab}>
      {css && <style>{css}</style>}
      <ErrorBoundary><DashboardContent embedded tab={tab} /></ErrorBoundary>
    </div>
  );
}
