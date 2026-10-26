import { Children, isValidElement, useRef, useState } from 'react';
import { exportRootToPng, exportContextSlug } from '../../kit/index.js';

export const Tile = ({ k, children, sub, dark, red, small }) => <div className={'nx-tile' + (dark ? ' dark' : '')}><div className="nx-tile-k">{k}</div><div><div className={'nx-tile-n' + (red ? ' red' : '') + (small ? ' sm' : '')}>{children}</div>{sub && <div className="nx-tile-s">{sub}</div>}</div></div>;


/* ⓘ that opens a short explanation on hover, focus or tap. */
export function InfoTip({ children, label = 'O que este gráfico mostra' }) {
  const [open, setOpen] = useState(false);
  if (children == null || children === '' || children === false) return null;
  return (
    <span className="nx-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}>i</button>
      {open && <span className="nx-info-pop" role="note">{children}</span>}
    </span>
  );
}

/* One chart = one card: a short title, a one-line subtitle (the key fact) and an ⓘ with the explanation.
   title: short label ("Marcas"); sub: one line ("Fiat lidera com 19,9%"); info: what the chart means and how to read it.
   `caption` (older blocks) goes into the ⓘ. */
export function Block({ title, sub, info, caption, children, className = '', actions, exportScope }) {
  // Footnotes written as <p className="nx-note"> directly inside the card join the ⓘ instead of showing as text.
  const notes = [], body = [];
  Children.toArray(children).forEach(c => (isValidElement(c) && c.type === 'p' && String(c.props.className ?? '').includes('nx-note') ? notes : body).push(c));
  const base = info ?? caption;
  const tip = notes.length ? <>{base && <span style={{ display: 'block', marginBottom: 6 }}>{base}</span>}{notes.map((n, i) => <span key={i} style={{ display: 'block' }}>{n.props.children}</span>)}</> : base;
  const root = useRef(null), [busy, setBusy] = useState(false);
  const download = async () => {
    if (!root.current) return;
    setBusy(true);
    try {
      const slug = String(typeof title === 'string' ? title : 'grafico').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await exportRootToPng(root.current, { filename: 'atlas-' + slug + '_' + exportContextSlug(), title: typeof title === 'string' ? title : '' });
    } catch (error) { globalThis.alert?.(error.message); } finally { setBusy(false); }
  };
  return (
    <div className={'nx-card nx-block ' + className} ref={root} data-export-scope={exportScope}>
      {(title || actions) && (
        <div className="nx-block-head">
          <div className="nx-block-titles">
            {title && <h3 className="nx-block-t">{title}<InfoTip>{tip}</InfoTip><button type="button" className="nx-dl" onClick={download} disabled={busy} aria-label="Baixar imagem (PNG)" title="Baixar imagem (PNG)"><svg viewBox="0 0 16 16" aria-hidden><path d="M8 2v8m0 0L4.5 6.6M8 10l3.5-3.4M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></h3>}
            {sub && <p className="nx-block-sub">{sub}</p>}
          </div>
          {actions && <div className="nx-block-actions">{actions}</div>}
        </div>
      )}
      <div className="nx-block-body">{body}</div>
      {tip && <div hidden data-export-notes>{tip}</div>}
    </div>
  );
}

