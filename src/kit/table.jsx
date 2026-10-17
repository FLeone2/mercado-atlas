// Sortable, searchable, paged table with hairline rows and tabular numbers.
import { useMemo, useState } from 'react';
import { Icon } from './controls.jsx';
import { displayValue, formatNumber, isPercentField, formatPercent, label as fieldLabel } from './format.js';

const compare = (a, b) => {
  if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
};

export function DataTable({ rows = [], columns = [], searchable = true, label, caption, onRowSelect, rowActionLabel, pageSize = 10, toolbarControls }) {
  const [query, setQuery] = useState(''), [sort, setSort] = useState({ field: '', desc: false }), [page, setPage] = useState(0);
  const cols = columns.length ? columns.map(c => ({ ...c, field: c.field ?? c.key })) : [...new Set(rows.flatMap(r => Object.keys(r ?? {})))].map(field => ({ field }));
  const percentCols = useMemo(() => new Set(cols.filter(c => isPercentField(c.field, rows.map(r => r?.[c.field]))).map(c => c.field)), [rows, cols.map(c => c.field).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    const base = q ? rows.filter(r => Object.values(r ?? {}).some(v => String(v ?? '').toLocaleLowerCase('pt-BR').includes(q))) : rows;
    return sort.field ? [...base].sort((a, b) => (sort.desc ? -1 : 1) * compare(a[sort.field], b[sort.field])) : base;
  }, [rows, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages - 1);
  const numeric = c => rows.some(r => typeof r?.[c.field] === 'number');
  const cell = (c, r) => {
    const v = r?.[c.field];
    if (typeof c.renderCell === 'function') return c.renderCell(v, r);
    if (percentCols.has(c.field)) return formatPercent(v);
    if (typeof v === 'number') return formatNumber(v, Number.isInteger(v) ? 0 : 2);
    return displayValue(v);
  };
  const title = caption ?? label ?? 'Tabela';
  return (
    <div className="ax-table-block">
      {(searchable || toolbarControls) && (
        <div className="ax-table-toolbar">
          {searchable && rows.length > pageSize && (
            <label className="ax-search"><Icon name="search" size={14} />
              <input value={query} placeholder="Buscar na tabela" aria-label={`Buscar em ${title}`} onChange={e => { setQuery(e.target.value); setPage(0); }} />
            </label>
          )}
          {toolbarControls}
        </div>
      )}
      <div className="ax-table-wrap" role="region" aria-label={title} tabIndex={0}>
        <table className="ax-table">
          <caption className="visually-hidden">{title}</caption>
          <thead><tr>{cols.map(c => (
            <th key={c.field} scope="col" className={numeric(c) ? 'num' : undefined} aria-sort={sort.field === c.field ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
              <button type="button" onClick={() => setSort(s => ({ field: c.field, desc: s.field === c.field ? !s.desc : numeric(c) }))}>
                {c.label ?? fieldLabel(c.field)}{sort.field === c.field ? (sort.desc ? ' ↓' : ' ↑') : ''}
              </button>
            </th>))}</tr></thead>
          <tbody>
            {filtered.slice(current * pageSize, current * pageSize + pageSize).map((r, i) => (
              <tr key={i} data-action={onRowSelect ? 'true' : undefined} tabIndex={onRowSelect ? 0 : undefined}
                aria-label={onRowSelect ? rowActionLabel?.(r) : undefined}
                onClick={onRowSelect ? e => { if (!e.target.closest('button, a, input')) onRowSelect(r); } : undefined}
                onKeyDown={onRowSelect ? e => { if (e.key === 'Enter') onRowSelect(r); } : undefined}>
                {cols.map(c => <td key={c.field} className={[numeric(c) ? 'num' : '', c.presentation === 'identity' ? 'identity' : ''].join(' ').trim() || undefined}>{cell(c, r)}</td>)}
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={cols.length} className="ax-table-empty">Nenhuma linha {query ? 'para esta busca' : 'neste recorte'}.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="ax-pager" aria-label={`Páginas de ${title}`}>
          <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Página anterior"><Icon name="chevronLeft" size={14} /></button>
          <span>{current + 1} de {pages} · {formatNumber(filtered.length)} linhas</span>
          <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Próxima página"><Icon name="chevronRight" size={14} /></button>
        </nav>
      )}
    </div>
  );
}
export const Table = DataTable;
