// Form controls in the Atlas style: hairline fields, small caps labels, brass focus.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { longDate, monthLabel } from './format.js';
import { monthEnd, monthsBetween, periodPresets, rangeLabel } from './period.js';

export { periodPresets, rangeLabel };

const PATHS = {
  close: 'M6 6l12 12M18 6 6 18',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14',
  check: 'm5 12.5 4.5 4.5L19 7',
  chevronDown: 'm6 9 6 6 6-6',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronRight: 'm9 6 6 6-6 6',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M8 14h8v6H8z',
  star: 'm12 4 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0-.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  calendar: 'M5 6h14v14H5zM5 10h14M9 4v4m6-4v4',
};
export function Icon({ name, size = 16, className = '' }) {
  return (
    <svg className={'ax-icon ' + className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? PATHS.more} />
    </svg>
  );
}

export function Button({ children, variant = 'quiet', className = '', type = 'button', ...props }) {
  return <button type={type} className={`ax-button ax-button-${variant} ${className}`} {...props}>{children}</button>;
}

const optionOf = o => (o && typeof o === 'object') ? o : { value: o, label: String(o) };
export function SegmentedControl({ options = [], value, onChange, ariaLabel, className = '', disabled = false, selectionMode = 'single', compact }) {
  const multiple = selectionMode === 'multiple', selected = multiple && Array.isArray(value) ? value : [];
  return (
    <div className={`ax-segmented ${compact ? 'ax-segmented-compact' : ''} ${className}`} role="group" aria-label={ariaLabel}>
      {options.map(raw => {
        const o = optionOf(raw), on = multiple ? selected.includes(o.value) : Object.is(o.value, value);
        return (
          <button key={String(o.value)} type="button" aria-pressed={on} disabled={disabled || o.disabled} title={o.tooltip ?? o.title}
            onClick={() => onChange?.(multiple ? (on ? selected.filter(v => v !== o.value) : [...selected, o.value]) : o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ label, checked = false, onChange, disabled = false, className = '' }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={'ax-switch ' + className} onClick={() => onChange?.(!checked)}>
      <span className="ax-switch-track" aria-hidden="true" /><span>{label}</span>
    </button>
  );
}

// Closes a popover on outside pointer or Escape.
function usePopover(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const down = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open, setOpen, ref]);
}

// Notes and method live behind an ⓘ: the chart stays in front, the text is one click away.
export function Info({ children, label, className = '' }) {
  const [open, setOpen] = useState(false), ref = useRef(null), id = useId();
  usePopover(open, setOpen, ref);
  if (children == null || children === '') return null;
  return (
    <span className={'ax-info-wrap ' + className} ref={ref}>
      <button type="button" className="ax-info" aria-expanded={open} aria-controls={id} aria-label={label ? undefined : 'Como ler'} onClick={() => setOpen(o => !o)}>
        <span aria-hidden="true">i</span>{label && <em>{label}</em>}
      </button>
      {open && <div className="ax-popover ax-info-pop" id={id} role="note">{children}</div>}
    </span>
  );
}

export function Dropdown({ label, value = 'all', choices = [], onChange, allLabel = 'Todos', multiple = false, searchable = false,
  showLabel = false, formatChoice, choiceLabels, placeholder, disabled = false, className = '' }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const ref = useRef(null), listId = useId(), labelId = useId(), valueId = useId();
  usePopover(open, setOpen, ref);
  const selected = useMemo(() => new Set((multiple ? (Array.isArray(value) ? value : [value]) : []).filter(v => v != null && v !== '' && v !== 'all')), [value, multiple]);
  const show = v => v === 'all' ? allLabel : (formatChoice?.(v) ?? choiceLabels?.[v] ?? String(v ?? '—'));
  const shown = multiple ? (selected.size === 0 ? allLabel : selected.size === 1 ? show([...selected][0]) : `${selected.size} selecionados`) : show(value);
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return q ? choices.filter(c => String(show(c)).toLocaleLowerCase('pt-BR').includes(q)) : choices;
  }, [choices, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const isOn = c => multiple ? (c === 'all' ? selected.size === 0 : selected.has(c)) : c === value;
  const pick = c => {
    if (!multiple) { onChange?.(c); setOpen(false); setQuery(''); return; }
    if (c === 'all') { onChange?.([]); return; }
    const next = new Set(selected); next.has(c) ? next.delete(c) : next.add(c); onChange?.([...next]);
  };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(list.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && list[active] != null) { e.preventDefault(); pick(list[active]); }
  };
  return (
    <div className={`ax-field ax-dropdown ${className}`} ref={ref} data-open={open || undefined}>
      {showLabel !== false && <span className="ax-field-label" id={labelId}>{label}</span>}
      <button type="button" className="ax-field-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-label={showLabel === false ? `${label}: ${shown}` : undefined} aria-labelledby={showLabel === false ? undefined : `${labelId} ${valueId}`} disabled={disabled} onClick={() => { setOpen(o => !o); setActive(0); }} onKeyDown={onKey}>
        <span className="ax-field-value" id={valueId} title={typeof shown === 'string' ? shown : undefined}>{shown}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="ax-popover ax-options" id={listId}>
          {(searchable || choices.length > 12) && (
            <label className="ax-search">
              <Icon name="search" size={14} />
              <input autoFocus value={query} placeholder={placeholder ?? 'Buscar'} aria-label={`Buscar ${label ?? ''}`.trim()}
                onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
            </label>
          )}
          <div role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} className="ax-options-list">
            {list.map((c, i) => (
              <button key={String(c)} type="button" role="option" aria-selected={isOn(c)} data-active={i === active || undefined}
                onPointerMove={() => setActive(i)} onClick={() => pick(c)}>
                <span>{show(c)}</span>{isOn(c) && <Icon name="check" size={14} />}
              </button>
            ))}
            {!list.length && <span className="ax-empty-option">Nada encontrado</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export const NativeSelect = ({ label, value, options = [], onChange }) => (
  <label className="ax-field"><span className="ax-field-label">{label}</span>
    <select className="ax-select" value={value} onChange={e => onChange?.(e.target.value)}>
      {options.map(o => { const x = optionOf(o); return <option key={x.value} value={x.value}>{x.label}</option>; })}
    </select>
  </label>
);

// ---------- Period ----------
// Same reading as the market worker: a lone day is that day; a lone month (or a month at either
// end of a range) spans its first to last day. The picker label must declare the computed window.
const monthLast = m => { const [y, mm] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, '0'); };
export function normalizePeriod(value) {
  const [a, b = a] = String(value).split('..');
  return (a.length === 7 ? a + '-01' : a) + '..' + (b.length === 7 ? monthLast(b) : b);
}
export function DateRangePicker({ label = 'Período', value, choices = [], onChange, allValue, disabled = false, className = '' }) {
  const days = useMemo(() => [...new Set(choices.filter(c => typeof c === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c)))].sort(), [choices]);
  const first = days[0], last = days.at(-1);
  const [open, setOpen] = useState(false), ref = useRef(null);
  usePopover(open, setOpen, ref);
  const current = !value || value === 'all' || value === allValue ? `${first}..${last}` : normalizePeriod(value);
  const [start, end] = current.split('..');
  const [draft, setDraft] = useState({ start, end });
  useEffect(() => { if (open) setDraft({ start, end }); }, [open, start, end]);
  const presets = periodPresets(first, last);
  const valid = draft.start && draft.end && draft.start <= draft.end && draft.start >= first && draft.end <= last;
  const apply = v => { onChange?.(allValue && v === `${first}..${last}` ? allValue : v); setOpen(false); };
  if (!days.length) return null;
  return (
    <div className={`ax-field ax-period ${className}`} ref={ref} data-open={open || undefined}>
      <span className="ax-field-label">{label}</span>
      <button type="button" className="ax-field-trigger" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen(o => !o)}>
        <Icon name="calendar" size={14} /><span className="ax-field-value">{rangeLabel(current)}</span><Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="ax-popover ax-period-popover" role="dialog" aria-label={label}>
          <div className="ax-period-presets">
            {presets.map(p => <button key={p.id} type="button" aria-pressed={p.value === current} onClick={() => apply(p.value)}>
              <span>{p.label}</span><small>{rangeLabel(p.value)}</small></button>)}
          </div>
          <form className="ax-period-custom" onSubmit={e => { e.preventDefault(); if (valid) apply(`${draft.start}..${draft.end}`); }}>
            <strong>Personalizado</strong>
            <div className="ax-period-months">
              <label>De<select value={draft.start.slice(0, 7)} onChange={e => setDraft(d => ({ ...d, start: e.target.value + '-01' < first ? first : e.target.value + '-01' }))}>
                {monthsBetween(first, last).map(m => <option key={m} value={m}>{monthLabel(m + '-01')}</option>)}</select></label>
              <label>Até<select value={draft.end.slice(0, 7)} onChange={e => { const me = monthEnd(e.target.value); setDraft(d => ({ ...d, end: me > last ? last : me })); }}>
                {monthsBetween(first, last).map(m => <option key={m} value={m}>{monthLabel(m + '-01')}</option>)}</select></label>
            </div>
            <div className="ax-period-days">
              <label>Dia inicial<input type="date" min={first} max={last} value={draft.start} onChange={e => setDraft(d => ({ ...d, start: e.target.value }))} /></label>
              <label>Dia final<input type="date" min={first} max={last} value={draft.end} onChange={e => setDraft(d => ({ ...d, end: e.target.value }))} /></label>
            </div>
            {!valid && <p className="ax-period-error">Escolha datas entre {longDate(first)} e {longDate(last)}, com o início antes do fim.</p>}
            <button type="submit" className="ax-button ax-button-primary" disabled={!valid}>Aplicar período</button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------- Filters ----------
const distinctCache = new WeakMap();
function distinct(rows, field) {
  let byField = distinctCache.get(rows);
  if (!byField) { byField = new Map(); distinctCache.set(rows, byField); }
  if (!byField.has(field)) byField.set(field, [...new Set(rows.map(r => r?.[field]).filter(v => v != null && v !== '' && String(v).toLowerCase() !== 'all').map(String))]);
  return byField.get(field);
}
export function filterChoices(def, queries = {}) {
  if (Array.isArray(def.choices)) return def.choices;
  const sources = Array.isArray(def.queryIds) ? def.queryIds.map(id => queries[id]).filter(Boolean) : Object.values(queries);
  const all = [...new Set(sources.flatMap(q => distinct(q.rows ?? [], def.field)))];
  return all.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export function Filters({ filters = [], queries = {}, values = {}, onChange, ariaLabel = 'Filtros', children, trailingControls, className = '' }) {
  if (!filters.length && !children && !trailingControls) return null;
  return (
    <section className={'ax-filters ' + className} aria-label={ariaLabel}>
      {children}
      {filters.map(def => {
        const choices = filterChoices(def, queries);
        if (def.id === 'date' || def.mode === 'through') {
          return <DateRangePicker key={def.id} label={def.label} value={values[def.id]} choices={choices} onChange={v => onChange?.(def.id, v)} />;
        }
        if (!choices.length) return null;
        return (
          <Dropdown key={def.id} label={def.label} showLabel value={values[def.id] ?? def.defaultValue ?? (def.multiple ? [] : 'all')}
            choices={def.defaultValue && def.defaultValue !== 'all' && !def.multiple ? choices : ['all', ...choices]}
            multiple={def.multiple} searchable={def.searchable} allLabel={def.allLabel ?? 'Todos'} choiceLabels={def.choiceLabels}
            formatChoice={def.formatChoice} onChange={v => onChange?.(def.id, v)} />
        );
      })}
      {trailingControls}
    </section>
  );
}
export const InlineFilters = ({ label, field, rows = [], value = 'all', onChange }) => {
  const choices = [...new Set(rows.map(r => r?.[field]).filter(v => typeof v === 'string' && v))];
  return choices.length < 2 ? null : <Dropdown label={label} showLabel value={value} choices={['all', ...choices]} onChange={onChange} />;
};

// ---------- Dialog ----------
export function Dialog({ open, onClose, title, children, initialFocusSelector, expanded = false }) {
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    // An empty or invalid selector must never throw: it would unmount the whole app (audit AT-01).
    let target = null;
    try { target = initialFocusSelector ? node?.querySelector(initialFocusSelector) : null; } catch { target = null; }
    (target ?? node?.querySelector('button, input, select, textarea'))?.focus?.();
    const key = e => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', key);
    document.body.dataset.dialogOpen = 'true';
    return () => { document.removeEventListener('keydown', key); delete document.body.dataset.dialogOpen; previous?.focus?.(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return createPortal(
    <div className="ax-dialog-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={'ax-dialog' + (expanded ? ' ax-dialog-wide' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header className="dialog-header ax-dialog-header" tabIndex={-1}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ax-icon-button" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="ax-dialog-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
export const ContainedDialog = Dialog;
