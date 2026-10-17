// Shell state shared by every view: the data snapshot, global filters, the active
// area and per-section view state. Filters, area and section state live in the
// address bar, so a copied link reopens the same view.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DataAppContext = createContext(null);
const FILTER_PREFIX = 'f.';

function readUrl(snapshot) {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const filters = {};
  for (const def of snapshot.filters ?? []) {
    const raw = params.get(FILTER_PREFIX + def.id);
    if (raw == null) continue;
    if (raw.startsWith('[')) { try { filters[def.id] = JSON.parse(raw); } catch { /* ignore a broken link */ } }
    else filters[def.id] = raw;
  }
  // Dimensions the snapshot does not declare still round-trip (they are added from the manifest).
  for (const [key, raw] of params) {
    if (!key.startsWith(FILTER_PREFIX) || key.slice(2) in filters) continue;
    try { filters[key.slice(2)] = raw.startsWith('[') ? JSON.parse(raw) : raw; } catch { /* ignore */ }
  }
  let sections = {};
  try { sections = JSON.parse(params.get('s') ?? '{}') ?? {}; } catch { sections = {}; }
  return { tab: params.get('tab'), filters, sections };
}

const isDefault = (value, fallback) => {
  const norm = v => Array.isArray(v) ? JSON.stringify([...new Set(v)].sort()) : String(v ?? 'all');
  return norm(value) === norm(fallback) || (Array.isArray(value) && value.length === 0 && (fallback ?? 'all') === 'all');
};

function writeUrl(snapshot, { tab, filters, sections }) {
  const url = new URL(globalThis.location.href);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith(FILTER_PREFIX) || key === 'tab' || key === 's' || key === 'view') url.searchParams.delete(key);
  if (tab && tab !== 'dashboard') url.searchParams.set('tab', tab);
  const defaults = Object.fromEntries((snapshot.filters ?? []).map(f => [f.id, f.defaultValue ?? 'all']));
  for (const [id, value] of Object.entries(filters)) {
    if (isDefault(value, defaults[id])) continue;
    url.searchParams.set(FILTER_PREFIX + id, Array.isArray(value) ? JSON.stringify([...new Set(value)].sort()) : String(value));
  }
  const kept = Object.fromEntries(Object.entries(sections).filter(([, v]) => v && Object.keys(v).length));
  if (Object.keys(kept).length) url.searchParams.set('s', JSON.stringify(kept));
  if (url.href !== globalThis.location.href) globalThis.history.replaceState(globalThis.history.state, '', url);
}

export function DataAppProvider({ snapshot, children }) {
  const initial = useMemo(() => readUrl(snapshot), [snapshot]);
  const defaults = useMemo(() => Object.fromEntries((snapshot.filters ?? []).map(f => [f.id, f.defaultValue ?? 'all'])), [snapshot]);
  const [filters, setFilters] = useState(() => ({ ...defaults, ...initial.filters }));
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(initial.tab ?? 'dashboard');
  const [sectionViews, setSectionViews] = useState(initial.sections);
  const [busy, setBusy] = useState(false);

  useEffect(() => { writeUrl(snapshot, { tab: activeTabId, filters, sections: sectionViews }); }, [snapshot, activeTabId, filters, sectionViews]);
  useEffect(() => {
    const onPop = () => { const next = readUrl(snapshot); setActiveTabId(next.tab ?? 'dashboard'); setFilters({ ...defaults, ...next.filters }); setSectionViews(next.sections); };
    globalThis.addEventListener('popstate', onPop);
    return () => globalThis.removeEventListener('popstate', onPop);
  }, [snapshot, defaults]);

  const setFilter = useCallback((id, value) => setFilters(current => ({ ...current, [id]: value })), []);
  const replaceFilters = useCallback(next => setFilters({ ...defaults, ...next }), [defaults]);
  const setSectionView = useCallback((key, value) => setSectionViews(current => ({ ...current, [key]: value })), []);
  const exploreDashboard = useCallback((tabId, options = {}) => {
    if (options.filters) setFilters({ ...defaults, ...options.filters });
    if (tabId) {
      // A real navigation entry, so the browser's back button returns to the previous area.
      const url = new URL(globalThis.location.href);
      if (tabId === 'dashboard') url.searchParams.delete('tab'); else url.searchParams.set('tab', tabId);
      globalThis.history.pushState(null, '', url);
      setActiveTabId(tabId);
      globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
    }
  }, [defaults]);

  const value = useMemo(() => ({
    snapshot, queries: snapshot.queries ?? {}, filters, setFilter, replaceFilters,
    sectionViews, setSectionView, activeTabId, setActiveTabId: exploreDashboard,
    registerDashboardTabs: setTabs, dashboardTabs: tabs,
    exploreDashboard, setDashboardBusy: setBusy, dashboardBusy: busy,
    activeFilters: (snapshot.filters ?? []).filter(f => !isDefault(filters[f.id], f.defaultValue)).map(f => ({ field: f.field, label: f.label, value: filters[f.id] })),
  }), [snapshot, filters, setFilter, replaceFilters, sectionViews, setSectionView, activeTabId, exploreDashboard, tabs, busy]);
  return <DataAppContext.Provider value={value}>{children}</DataAppContext.Provider>;
}

export function useDataApp() {
  const shell = useContext(DataAppContext);
  if (!shell) throw new Error('useDataApp precisa de DataAppProvider');
  return shell;
}

export function useDashboardTabs(tabs = []) {
  const shell = useDataApp();
  useEffect(() => { shell.registerDashboardTabs(tabs); }, [tabs]); // eslint-disable-line react-hooks/exhaustive-deps
  return { activeTabId: shell.activeTabId, setActiveTabId: shell.setActiveTabId };
}

// Section-local filters. With an id they persist in the address bar under the active area.
export function useSectionFilters(definitions = [], initial = {}, options) {
  const shell = useDataApp();
  const [local, setLocal] = useState(initial);
  const id = options?.id ?? options?.rowId;
  const key = typeof id === 'string' && id.trim() ? `${shell.activeTabId ?? 'dashboard'}:${id}` : null;
  const saved = key ? shell.sectionViews?.[key] : null;
  const source = key ? initial : local;
  const values = Object.fromEntries(definitions.map(def => {
    const fallback = source[def.id] ?? def.defaultValue ?? 'all';
    return [def.id, saved && Object.hasOwn(saved, def.id) ? saved[def.id] : fallback];
  }));
  const setFilter = (fieldId, value) => {
    if (!definitions.some(def => def.id === fieldId)) return;
    if (key) shell.setSectionView(key, { ...values, [fieldId]: value });
    else setLocal(current => ({ ...current, [fieldId]: value }));
  };
  const filterProps = { filters: definitions, queries: shell.queries, values, onChange: setFilter, ariaLabel: options?.label ?? 'Filtros da seção', showClear: false };
  return {
    values, setFilter, filterProps,
    reviewedRows: queryId => shell.queries[queryId]?.rows ?? [],
    componentProps: queryId => {
      const rows = shell.queries[queryId]?.rows ?? [];
      return { displayRows: rows, sourceRows: rows, scopeFilters: definitions.filter(d => !isDefault(values[d.id], 'all')).map(d => ({ field: d.field, label: d.label, value: values[d.id] })) };
    },
  };
}
