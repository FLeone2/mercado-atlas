// Editorial containers: a section is a chapter (serif title over a hairline), a data
// component is one figure with its title, controls, CSV/PNG tools and a footnote.
import { Children, useRef, useState } from 'react';
import { Icon } from './controls.jsx';
import { downloadCsv } from './format.js';
import { exportLegend, exportSvgToPng } from './export.js';

export function Section({ id, title, children, columns, spacing, filters, description, actions }) {
  return (
    <section className="ax-section" id={id} data-spacing={spacing}>
      {(title || filters || actions) && (
        <header className="ax-section-head">
          {title && <h2 className="ax-section-title">{title}</h2>}
          {description && <p className="ax-section-lede">{description}</p>}
          {(filters || actions) && <div className="ax-section-tools">{filters}{actions}</div>}
        </header>
      )}
      <div className="ax-section-body" data-columns={columns ?? 1}>{children}</div>
    </section>
  );
}
export const SectionHeader = ({ title, children }) => <header className="ax-section-head"><h2 className="ax-section-title">{title}</h2>{children}</header>;
export const ReportSection = Section;

function ToolMenu({ id, title, rows }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), ref = useRef(null);
  const png = async () => {
    const root = ref.current?.closest('[data-export-root]'), svg = root?.querySelector('.ax-card-body svg:not(.ax-icon)');
    setOpen(false);
    if (!svg) return;
    setBusy(true);
    try { await exportSvgToPng(svg, { filename: id || 'grafico', title, legend: exportLegend(root) }); }
    catch (error) { globalThis.alert?.(error.message); }
    finally { setBusy(false); }
  };
  const hasRows = Array.isArray(rows) && rows.length > 0;
  return (
    <div className="ax-card-tools" ref={ref} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" className="ax-icon-button" aria-label={`Ações de ${title ?? 'gráfico'}`} aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={busy}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="ax-popover ax-menu" role="menu">
          {hasRows && <button type="button" role="menuitem" onClick={() => { downloadCsv(id || 'dados', rows); setOpen(false); }}><Icon name="download" size={14} />Baixar dados (CSV)</button>}
          <button type="button" role="menuitem" onClick={png}><Icon name="image" size={14} />Baixar imagem (PNG)</button>
        </div>
      )}
    </div>
  );
}

export function DataComponent({ id, title, kind, variant, className = '', sourceRows, displayRows, description, children, headerControls, footer }) {
  const rows = sourceRows ?? displayRows;
  return (
    <article className={`ax-card ax-card-${kind ?? 'block'} ${className}`} id={id} data-export-root data-export-title={typeof title === 'string' ? title : undefined} data-variant={variant}>
      {(title || headerControls) && (
        <header className="ax-card-head">
          {title && <h3 className="ax-card-title">{title}</h3>}
          <div className="ax-card-controls">{headerControls}<ToolMenu id={id} title={typeof title === 'string' ? title : ''} rows={rows} /></div>
        </header>
      )}
      <div className="ax-card-body">{children}</div>
      {description && (typeof description === 'string' ? <p className="ax-card-note">{description}</p> : <div className="ax-card-note">{description}</div>)}
      {footer}
    </article>
  );
}
export const QueryDataBoundary = ({ children }) => children;

export function MetricCard({ id, title, value, className = '', children, detail }) {
  return (
    <article className={'ax-metric ' + className} id={id}>
      <span className="ax-metric-label">{title}</span>
      <strong className="ax-metric-value">{value}</strong>
      {(children || detail) && <div className="ax-metric-detail">{children ?? detail}</div>}
    </article>
  );
}

export const SortableRegion = ({ id, children, columns = 12 }) => <div className="ax-metric-row" id={id} data-columns={columns}>{children}</div>;
export const SortableItem = ({ id, children, span }) => <div className="ax-metric-cell" data-id={id} data-span={span}>{Children.only(children)}</div>;

export function ChartTooltip({ active, label, details = [] }) {
  if (!active) return null;
  return (
    <div className="ax-tooltip" role="tooltip">
      {label != null && <strong>{label}</strong>}
      {details.map((d, i) => <div key={i} className="ax-tooltip-row"><span>{d.label}</span><b>{d.value}</b></div>)}
    </div>
  );
}
export const Tooltip = ({ children, id, className = '' }) => <span role="tooltip" id={id} className={'ax-hint ' + className}>{children}</span>;
export const InfoTooltip = ({ content, label = 'Mais informações' }) => <span className="ax-info" title={typeof content === 'string' ? content : undefined} aria-label={label}>i</span>;
export const TruncatedText = ({ children, className = '' }) => <span className={'ax-truncate ' + className}>{children}</span>;
export const RichNarrative = ({ children }) => <div className="ax-narrative">{children}</div>;
export const EditableText = ({ as: Tag = 'p', children, ...props }) => <Tag {...props}>{children}</Tag>;
export const ExecutiveSummary = ({ children }) => <div className="ax-narrative">{children}</div>;
export const MetricCardTabs = ({ children }) => <div className="ax-metric-row">{children}</div>;
export const MetricSparkline = () => null;
export const SectionNavigator = () => null;
export const SourceInspector = () => null;
export const SourceSidebar = () => null;
