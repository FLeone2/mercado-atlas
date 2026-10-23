// The component kit the market views are written against (the same names the old
// Data app runtime exposed), implemented here in the Atlas style.
export { DataAppProvider, useDataApp, useDashboardTabs, useSectionFilters } from './context.jsx';
export { Info, Icon, Button, SegmentedControl, Switch, Dropdown, NativeSelect, DateRangePicker, Filters, InlineFilters, Dialog, ContainedDialog, filterChoices, periodPresets, rangeLabel, normalizePeriod } from './controls.jsx';
export {
  Section, SectionHeader, ReportSection, DataComponent, QueryDataBoundary, MetricCard, SortableRegion, SortableItem, ChartTooltip,
  Tooltip, InfoTooltip, TruncatedText, RichNarrative, EditableText, ExecutiveSummary, MetricCardTabs, MetricSparkline,
  SectionNavigator, SourceInspector, SourceSidebar,
} from './cards.jsx';
export { DataTable, Table } from './table.jsx';
export { EvidenceChart, Chart, ChartRenderer, barChartSpec, chartModel, PALETTE } from './chart.jsx';
export { compact, percentage, displayValue, label, shortDate, csvText, downloadCsv, formatNumber, formatPercent } from './format.js';
export { exportSvgToPng, exportVisualsToPng, exportCardToPng, exportRootToPng, exportLegend, exportContextSlug, EXPORT_STYLE_PROPS } from './export.js';
