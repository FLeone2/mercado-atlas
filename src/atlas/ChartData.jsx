import { useId, useMemo, useState } from 'react';

/* A mesma consulta do gráfico, em uma tabela operável por teclado. Só monta as
   linhas quando solicitada e pagina conjuntos grandes, inclusive municípios. */
export default function ChartData({ caption, columns, rows }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const id = useId(), size = 25;
  const filtered = useMemo(() => {
    const fold = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = fold(query.trim());
    return q ? rows.filter(row => row.some(cell => fold(cell).includes(q))) : rows;
  }, [rows, query]);
  const last = Math.max(0, Math.ceil(filtered.length / size) - 1), current = Math.min(page, last), start = current * size;
  return (
    <details className="px-data" data-export-skip onToggle={e => setOpen(e.currentTarget.open)}>
      <summary aria-label={caption + ': ver dados em tabela'}>Ver dados em tabela</summary>
      {open && <div className="px-data-body">
        {rows.length > size && <label className="px-data-search" htmlFor={id}>Buscar na tabela
          <input id={id} type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Nome, período ou valor" />
        </label>}
        <div className="px-data-scroll" tabIndex={0} role="region" aria-label={'Tabela: ' + caption}>
          <table><caption>{caption}</caption><thead><tr>{columns.map((column, i) => <th key={i} scope="col" className={column.numeric ? 'num' : undefined}>{column.label ?? column}</th>)}</tr></thead>
            <tbody>{filtered.slice(start, start + size).map((row, i) => <tr key={start + i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j} className={columns[j].numeric ? 'num' : undefined}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {!filtered.length && <p>Nenhum resultado para esta busca.</p>}
        {filtered.length > size && <div className="px-data-pages">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button>
          <span role="status">{start + 1}–{Math.min(start + size, filtered.length)} de {filtered.length}</span>
          <button type="button" disabled={current === last} onClick={() => setPage(current + 1)}>Próxima</button>
        </div>}
      </div>}
    </details>
  );
}
