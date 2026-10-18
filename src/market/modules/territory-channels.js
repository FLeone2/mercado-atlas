// Both channels come from the same accepted source rows. Only tipo_venda is
// removed by channelReference; date, population and every other filter remain.
const TERRITORY_CHANNEL_DESCRIPTION = 'Participação = emplacamentos do canal ÷ total de todos os canais na mesma UF. O total inclui canais não informados ou outros códigos. Período, universo e demais filtros de Territórios são mantidos; somente Canal é retirado para comparar Varejo e Venda Direta. As cores dividem a área desenhada da UF conforme a composição, sem indicar a localização das vendas dentro do estado.';

function territoryChannelAnalysis(model, filters = {}, features = []) {
  const reference = model?.channelReference;
  const sourceAvailable = Boolean(reference && Array.isArray(reference.stateChannelsByMonth));
  const months = reference?.monthly ?? [];
  const coverage = new Map((reference?.channelCoverage ?? []).map(row => [row.month, row.available]));
  const monthName = row => row.month ?? row.date.slice(0, 7);
  const missingChannelMonths = months.filter(row => coverage.get(monthName(row)) !== true).map(monthName);
  const missingSourceMonths = [...new Set([...(reference?.missingMonths ?? []), ...(reference?.incompleteMonths ?? []), ...months.filter(row => row.count === null).map(monthName)])].sort();
  const channelAvailable = months.some(row => coverage.get(monthName(row)) === true);
  const complete = sourceAvailable && reference.complete !== false && months.length > 0 && !missingChannelMonths.length && !missingSourceMonths.length;
  const selectedUFs = (Array.isArray(filters.uf) ? filters.uf : [filters.uf]).filter(value => value && value !== 'all');
  const totals = new Map((reference?.groups?.uf ?? []).map(row => [row.name, row.count]));
  const stateChannels = new Map();
  for (const row of reference?.stateChannelsByMonth ?? []) {
    if (!stateChannels.has(row.name)) stateChannels.set(row.name, new Map());
    const channels = stateChannels.get(row.name);
    channels.set(row.channel, (channels.get(row.channel) ?? 0) + row.count);
  }
  const names = [...new Set([...features.map(feature => feature.uf), ...totals.keys(), ...stateChannels.keys()])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const makeRow = (name, channels, total, inScope = true) => {
    const observedRetailCount = channels.get('VAREJO') ?? 0, observedDirectCount = channels.get('VD') ?? 0;
    const unknownEntries = [...channels].filter(([channel]) => !['VAREJO', 'VD'].includes(channel));
    const unknownCount = unknownEntries.reduce((sum, [, count]) => sum + count, 0);
    const reconciled = sourceAvailable && observedRetailCount + observedDirectCount + unknownCount === total;
    const hasShare = complete && reconciled && inScope && total > 0;
    const status = !inScope ? 'Fora do recorte geográfico' : !sourceAvailable ? 'Agregado indisponível' : !reconciled ? 'Totais não reconciliados' : !complete ? 'Cobertura de canal ou período incompleta' : total === 0 ? 'Sem registros no recorte' : 'Cobertura completa';
    return {
      name, total: sourceAvailable && inScope ? total : null,
      retailCount: sourceAvailable && inScope && channelAvailable ? observedRetailCount : null,
      directCount: sourceAvailable && inScope && channelAvailable ? observedDirectCount : null,
      unknownCount: sourceAvailable && inScope ? unknownCount : null,
      retailShare: hasShare ? observedRetailCount / total : null,
      directShare: hasShare ? observedDirectCount / total : null,
      unknownShare: hasShare ? unknownCount / total : null,
      observedRetailCount, observedDirectCount,
      denominator: sourceAvailable && inScope ? total : null,
      unknownChannels: unknownEntries.map(([channel, count]) => `${channel}: ${count}`).join('; '),
      status, inScope, complete: complete && reconciled,
      missingChannelMonths: missingChannelMonths.join(', '), missingSourceMonths: missingSourceMonths.join(', '),
    };
  };
  const rows = names.map(name => makeRow(name, stateChannels.get(name) ?? new Map(), totals.get(name) ?? 0, !selectedUFs.length || selectedUFs.includes(name)));
  const summaryChannels = new Map();
  for (const channels of stateChannels.values()) for (const [channel, count] of channels) summaryChannels.set(channel, (summaryChannels.get(channel) ?? 0) + count);
  const summary = makeRow('Recorte observado', summaryChannels, reference?.total ?? 0);
  return { rows, summary, complete, sourceAvailable, channelAvailable, missingChannelMonths, missingSourceMonths, selectedUFs };
}

// The reviewed IBGE geometry contains polygonal M/L/Z paths. A straight cutoff
// at x = share * width would distort the colored area for irregular states.
// Integrate the clipped polygon area and solve for the true share instead.
const territoryGeometryCache = new Map();
function territoryPolygonArea(points) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) area += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  return area / 2;
}
function territoryChannelGeometry(path) {
  if (territoryGeometryCache.has(path)) return territoryGeometryCache.get(path);
  if (/[A-KN-Y]/i.test(path)) return null;
  const rings = [...path.matchAll(/M([^M]*)/g)].map(match => {
    const values = match[1].match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    return Array.from({ length: Math.floor(values.length / 2) }, (_, i) => [values[i * 2], values[i * 2 + 1]]);
  }).filter(points => points.length >= 3);
  const xs = rings.flatMap(points => points.map(point => point[0]));
  const geometry = { rings, minX: Math.min(...xs), maxX: Math.max(...xs), area: Math.abs(rings.reduce((sum, points) => sum + territoryPolygonArea(points), 0)) };
  const result = geometry.area > 0 && Number.isFinite(geometry.minX) ? geometry : null;
  territoryGeometryCache.set(path, result);
  return result;
}
function territoryAreaBefore(geometry, x) {
  let area = 0;
  for (const points of geometry.rings) {
    const clipped = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i], aInside = a[0] <= x, bInside = b[0] <= x;
      if (aInside !== bInside) clipped.push([x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]);
      if (bInside) clipped.push(b);
    }
    area += territoryPolygonArea(clipped);
  }
  return Math.abs(area);
}
function territoryAreaCut(geometry, share) {
  if (!geometry || !Number.isFinite(share)) return null;
  if (share <= 0) return 0;
  if (share >= 1) return 1;
  let low = geometry.minX, high = geometry.maxX;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (territoryAreaBefore(geometry, middle) < geometry.area * share) low = middle; else high = middle;
  }
  return ((low + high) / 2 - geometry.minX) / (geometry.maxX - geometry.minX);
}
function territoryChannelLabel(row) {
  if (!row) return '';
  return `${row.name}. Varejo: ${number(row.retailCount)} (${percent(row.retailShare)}). Venda Direta: ${number(row.directCount)} (${percent(row.directShare)}). Não informado ou outros: ${number(row.unknownCount)} (${percent(row.unknownShare)}). Total: ${number(row.total)}. ${row.status}.`;
}
function TerritoryChannelDetails({ row, transient = false }) {
  return jsxRuntime.jsxs('div', { className: 'tc-detail', role: transient ? 'tooltip' : undefined, id: transient ? 'territory-channel-tooltip' : undefined, children: [
    jsxRuntime.jsx('span', { className: 'tc-eyebrow', children: transient ? 'Consulta rápida por UF' : row.name === 'Recorte observado' ? 'Todos os canais do recorte' : 'UF selecionada' }),
    jsxRuntime.jsx('strong', { className: 'tc-state-name', children: row.name }),
    jsxRuntime.jsxs('span', { className: 'tc-total', children: [number(row.total), jsxRuntime.jsx('small', { children: ' emplacamentos' })] }),
    jsxRuntime.jsx('dl', { className: 'tc-values', children: [
      ['retail', 'Varejo', row.retailCount, row.retailShare], ['direct', 'Venda Direta', row.directCount, row.directShare], ['unknown', 'Não informado / outros', row.unknownCount, row.unknownShare],
    ].map(([kind, label, count, share]) => jsxRuntime.jsxs('div', { children: [jsxRuntime.jsxs('dt', { children: [jsxRuntime.jsx('i', { className: 'tc-dot tc-' + kind, 'aria-hidden': true }), label] }), jsxRuntime.jsxs('dd', { children: [jsxRuntime.jsx('strong', { children: percent(share) }), jsxRuntime.jsx('span', { children: number(count) })] })] }, kind)) }),
    jsxRuntime.jsx('span', { className: 'tc-status', children: row.status }),
    row.unknownChannels && jsxRuntime.jsx('small', { className: 'tc-unknown-codes', children: 'Códigos sem classificação: ' + row.unknownChannels }),
  ] });
}
function TerritoryChannelMap({ model, filters = {}, scope = [], onSelect }) {
  const data = React.useMemo(() => territoryChannelAnalysis(model, filters, value$3.features), [model, filters.uf]);
  const [hover, setHover] = React.useState(null), [selected, setSelected] = React.useState(null);
  const rowsByUF = new Map(data.rows.map(row => [row.name, row]));
  const active = rowsByUF.get(hover) ?? rowsByUF.get(selected) ?? data.summary;
  const channelsScope = [...scope.filter(item => item.field !== 'tipo_venda'), { field: 'tipo_venda', label: 'Canal', value: 'Todos os canais · comparação Varejo × Venda Direta' }];
  const selectedChannels = (Array.isArray(filters.tipo_venda) ? filters.tipo_venda : [filters.tipo_venda]).filter(value => value && value !== 'all');
  const fills = React.useMemo(() => value$3.features.map(feature => {
    const row = data.rows.find(item => item.name === feature.uf), geometry = territoryChannelGeometry(feature.path);
    return { uf: feature.uf, retail: row?.retailShare == null ? null : territoryAreaCut(geometry, row.retailShare), direct: row?.directShare == null ? null : territoryAreaCut(geometry, row.retailShare + row.directShare) };
  }), [data]);
  const fillByUF = new Map(fills.map(fill => [fill.uf, fill]));
  const columns = [
    { field: 'name', label: 'UF', presentation: 'identity' },
    { field: 'retailCount', label: 'Varejo · volume', renderCell: number }, { field: 'retailShare', label: 'Varejo · %', renderCell: percent },
    { field: 'directCount', label: 'Venda Direta · volume', renderCell: number }, { field: 'directShare', label: 'Venda Direta · %', renderCell: percent },
    { field: 'unknownCount', label: 'Não informado / outros', renderCell: number }, { field: 'unknownShare', label: 'Não informado / outros · %', renderCell: percent },
    { field: 'total', label: 'Total da UF', renderCell: number }, { field: 'status', label: 'Cobertura' },
  ];
  return jsxRuntime.jsxs(dataApp.Section, { id: 'geo-channel-composition-heading', title: 'Varejo × Venda Direta', children: [
    jsxRuntime.jsxs(dataApp.DataComponent, { id: 'territory-channel-map', queryId: 'registrations', kind: 'chart', title: 'Composição dos canais por UF', variant: 'card', className: 'am-glass tc-card', sourceRows: data.rows, displayRows: data.rows, scopeFilters: channelsScope, description: TERRITORY_CHANNEL_DESCRIPTION, children: [
      jsxRuntime.jsx(PageNote, {originalTag:'p', className: 'tc-intro', children: 'Duas cores, uma composição por estado.' }),
      jsxRuntime.jsxs('p', { className: 'tc-scope', children: [jsxRuntime.jsx('strong', { children: 'Todos os canais · demais filtros mantidos. ' }), selectedChannels.length > 0 ? `Canal selecionado acima: ${selectedChannels.map(value => value === 'VD' ? 'Venda Direta' : value === 'VAREJO' ? 'Varejo' : value).join(', ')}. Somente este comparativo e sua lista retiram o filtro de Canal para mostrar a composição completa.` : 'Este mapa e a lista abaixo comparam Varejo, Venda Direta e canais não identificados no mesmo recorte.'] }),
      jsxRuntime.jsxs('div', { className: 'tc-legend', 'aria-label': 'Legenda dos canais', children: [
        jsxRuntime.jsxs('span', { children: [jsxRuntime.jsx('i', { className: 'tc-dot tc-retail', 'aria-hidden': true }), 'Varejo'] }),
        jsxRuntime.jsxs('span', { children: [jsxRuntime.jsx('i', { className: 'tc-dot tc-direct', 'aria-hidden': true }), 'Venda Direta'] }),
        jsxRuntime.jsxs('span', { children: [jsxRuntime.jsx('i', { className: 'tc-dot tc-unknown', 'aria-hidden': true }), 'Não informado / outros'] }),
        jsxRuntime.jsxs('span', { children: [jsxRuntime.jsx('i', { className: 'tc-dot tc-unavailable', 'aria-hidden': true }), 'Participação indisponível'] }),
      ] }),
      !data.complete && jsxRuntime.jsxs('div', { className: 'tc-notice', role: 'status', children: [
        jsxRuntime.jsx('strong', { children: 'Participações indisponíveis neste período. ' }),
        !data.sourceAvailable ? 'O agregado por UF e canal não está disponível.' : 'Volumes conhecidos são observados e podem ser parciais; meses sem informação não viram zero. ',
        data.missingChannelMonths.length > 0 && `${data.missingChannelMonths.length} mês(es) sem canal: ${data.missingChannelMonths.join(', ')}. `,
        data.missingSourceMonths.length > 0 && `Cobertura mensal ausente ou incompleta: ${data.missingSourceMonths.join(', ')}.`,
      ] }),
      jsxRuntime.jsxs('div', { className: 'tc-map-layout', onMouseLeave: () => setHover(null), 'data-reviewed-rows': true, children: [
        jsxRuntime.jsxs('svg', { viewBox: value$3.viewBox, className: 'am-brazil-map tc-map', role: 'group', 'aria-label': 'Composição de Varejo e Venda Direta por UF. As áreas coloridas representam a participação de cada canal.', children: [
          jsxRuntime.jsxs('defs', { children: [
            jsxRuntime.jsxs('pattern', { id: 'territory-channel-unavailable', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)', children: [jsxRuntime.jsx('rect', { width: 7, height: 7, fill: 'var(--muted)' }), jsxRuntime.jsx('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: 'var(--tc-unknown)', strokeWidth: 2 })] }),
            fills.filter(fill => fill.retail !== null && fill.direct !== null).map(fill => jsxRuntime.jsxs('linearGradient', { id: 'territory-channel-' + fill.uf, x1: '0%', x2: '100%', y1: '0%', y2: '0%', children: [
              jsxRuntime.jsx('stop', { offset: 0, stopColor: 'var(--tc-retail)' }), jsxRuntime.jsx('stop', { offset: fill.retail, stopColor: 'var(--tc-retail)' }),
              jsxRuntime.jsx('stop', { offset: fill.retail, stopColor: 'var(--tc-direct)' }), jsxRuntime.jsx('stop', { offset: fill.direct, stopColor: 'var(--tc-direct)' }),
              jsxRuntime.jsx('stop', { offset: fill.direct, stopColor: 'var(--tc-unknown)' }), jsxRuntime.jsx('stop', { offset: 1, stopColor: 'var(--tc-unknown)' }),
            ] }, fill.uf)),
          ] }),
          value$3.features.map(feature => {
            const row = rowsByUF.get(feature.uf), fill = fillByUF.get(feature.uf);
            const color = !row?.inScope ? 'var(--muted)' : fill?.retail != null && fill?.direct != null ? `url(#territory-channel-${feature.uf})` : row?.complete && row?.total === 0 ? 'var(--muted)' : 'url(#territory-channel-unavailable)';
            return jsxRuntime.jsx('path', { d: feature.path, fill: color, className: 'am-state tc-state' + (selected === feature.uf ? ' am-state-active' : '') + (!row?.inScope ? ' tc-outside' : ''), 'data-uf': feature.uf, tabIndex: 0, role: 'button', 'aria-label': territoryChannelLabel(row) + ' Mostrar detalhes.', 'aria-pressed': selected === feature.uf, 'aria-describedby': hover === feature.uf ? 'territory-channel-tooltip' : undefined, onMouseEnter: () => setHover(feature.uf), onMouseLeave: () => setHover(null), onFocus: () => setHover(feature.uf), onBlur: () => setHover(null), onClick: () => setSelected(feature.uf), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(feature.uf); } else if (event.key === 'Escape') { setSelected(null); setHover(null); } }, children: jsxRuntime.jsx('title', { children: territoryChannelLabel(row) }) }, feature.uf);
          }),
        ] }),
        jsxRuntime.jsxs('aside', { className: 'tc-panel', 'aria-live': 'polite', children: [
          jsxRuntime.jsx(TerritoryChannelDetails, { row: active, transient: Boolean(hover) }),
          selected && jsxRuntime.jsxs('div', { className: 'tc-selection-actions', children: [
            jsxRuntime.jsx('span', { className: 'tc-pinned', children: 'Fixado: ' + selected }),
            onSelect && rowsByUF.get(selected)?.inScope && jsxRuntime.jsx('button', { type: 'button', className: 'am-link-button', onClick: () => onSelect(selected), children: 'Explorar ' + selected + ' ↗' }),
            jsxRuntime.jsx('button', { type: 'button', className: 'am-link-button', onClick: () => { setSelected(null); setHover(null); }, children: 'Limpar seleção' }),
          ] }),
          jsxRuntime.jsx(PageNote, {originalTag:'p', className: 'tc-panel-note', children: 'As participações usam o total da própria UF. O canal selecionado acima não restringe esta comparação; todos os outros filtros continuam aplicados.' }),
        ] }),
      ] }),
      jsxRuntime.jsx('p', { className: 'tc-method', children: TERRITORY_CHANNEL_DESCRIPTION }),
      jsxRuntime.jsx('a', { className: 'tc-source', href: value$3.source, target: '_blank', rel: 'noreferrer', children: 'Contornos oficiais · IBGE' }),
    ] }),
    jsxRuntime.jsx(MarketTable, { id: 'territory-channel-table', title: 'Varejo e Venda Direta · lista por UF', rows: data.rows, scope: channelsScope, columns, description: TERRITORY_CHANNEL_DESCRIPTION + ' “—” significa participação indisponível ou UF fora do recorte; não equivale a zero. Volumes de canais conhecidos são parciais quando há meses sem informação.', onSelect: onSelect ? row => { if (row.inScope) onSelect(row.name); } : undefined }),
  ] });
}
