const CATEGORIES = [
  ['BEV', 'Elétrico', '#e60f2d'],
  ['PHEV', 'Híbrido plug-in', '#1d1d1f'],
  ['HEV', 'Híbrido', '#6e6e73'],
  ['MHEV', 'Microhíbrido', '#b4b4ba'],
];

// The selected definition is constant across the whole range. A category hidden
// by the chart's display threshold still contributes to the aggregate.
export function electrificationSeries({ months, total, by, start = 0, includeMhev = false }) {
  const categories = CATEGORIES.filter(([key]) => includeMhev || key !== 'MHEV');
  const all = categories.map(([key, name, color]) => ({
    name,
    color,
    values: months.map((_, j) => total[start + j] > 0 ? (by.get(key)?.[start + j] ?? 0) / total[start + j] : null),
  }));
  const values = months.map((_, j) => total[start + j] > 0 ? all.reduce((sum, row) => sum + row.values[j], 0) : null);
  const name = includeMhev ? 'BEV + PHEV + HEV + MHEV' : 'BEV + PHEV + HEV';
  return {
    series: [{ name, color: 'var(--nx-up)', width: 3.5, values }, ...all.filter(row => row.values.some(value => value > .001))],
    now: values.at(-1),
    yearAgo: values.at(-13),
  };
}
