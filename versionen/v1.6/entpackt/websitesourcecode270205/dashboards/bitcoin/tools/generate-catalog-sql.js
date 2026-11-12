const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const categoryIds = new Set(catalog.categories.map((category) => category.id));
const metricIds = new Set();
const overviewIds = new Set(catalog.overviewIds);
const coreMetricIds = new Set(catalog.coreMetricIds || []);

if (catalog.overviewIds.length !== 10 || overviewIds.size !== 10) {
  throw new Error('The overview must contain exactly ten distinct metrics.');
}
if ((catalog.coreMetricIds || []).length !== 100 || coreMetricIds.size !== 100) {
  throw new Error('The original core list must contain exactly 100 distinct metrics.');
}
for (const metric of catalog.metrics) {
  if (!/^[a-z0-9_]{1,96}$/.test(metric.id) || metricIds.has(metric.id)) {
    throw new Error(`Invalid or duplicate metric id: ${metric.id}`);
  }
  if (!categoryIds.has(metric.category)) throw new Error(`Unknown category: ${metric.category}`);
  if (!['daily', 'weekly', 'monthly', 'event'].includes(metric.frequency)) {
    throw new Error(`Invalid frequency: ${metric.id}`);
  }
  for (const key of ['label', 'unit', 'sourceHint', 'description']) {
    if (typeof metric[key] !== 'string' || metric[key].trim() === '') {
      throw new Error(`Missing ${key}: ${metric.id}`);
    }
  }
  if (metric.series !== undefined) {
    if (!Array.isArray(metric.series) || metric.series.length === 0) {
      throw new Error(`Invalid series list: ${metric.id}`);
    }
    const seriesKeys = new Set();
    for (const series of metric.series) {
      if (!series || !/^[a-z0-9_]{1,96}$/.test(series.key) || seriesKeys.has(series.key)
        || typeof series.label !== 'string' || series.label.trim() === '') {
        throw new Error(`Invalid or duplicate series definition: ${metric.id}/${series?.key || ''}`);
      }
      seriesKeys.add(series.key);
    }
  }
  metricIds.add(metric.id);
}
for (const id of overviewIds) {
  if (!metricIds.has(id)) throw new Error(`Unknown overview metric: ${id}`);
}
for (const id of coreMetricIds) {
  if (!metricIds.has(id)) throw new Error(`Unknown core metric: ${id}`);
}

const quote = (value) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
const lines = [
  '-- Generated from data/catalog.json by tools/generate-catalog-sql.js.',
  '-- Planning metadata only. No source is approved and no observations are inserted.',
  'INSERT INTO bitcoin_metrics',
  '    (metric_id, category, display_name, unit, source_hint, description, native_frequency, display_order, is_overview)',
  'VALUES',
];
catalog.metrics.forEach((metric, index) => {
  const values = [metric.id, metric.category, metric.label, metric.unit, metric.sourceHint,
    metric.description, metric.frequency].map(quote);
  values.push(String(index + 1), overviewIds.has(metric.id) ? '1' : '0');
  lines.push(`    (${values.join(', ')})${index === catalog.metrics.length - 1 ? '' : ','}`);
});
lines.push(
  'ON DUPLICATE KEY UPDATE',
  '    category = VALUES(category),',
  '    display_name = VALUES(display_name),',
  '    unit = VALUES(unit),',
  '    source_hint = VALUES(source_hint),',
  '    description = VALUES(description),',
  '    native_frequency = VALUES(native_frequency),',
  '    display_order = VALUES(display_order),',
  '    is_overview = VALUES(is_overview);',
  '',
  '-- Metrics use their configured native series when present; otherwise one main series is registered.',
  'INSERT INTO bitcoin_metric_series (metric_id, series_key, display_name, display_order)',
  'VALUES',
);
const seriesRows = [];
for (const metric of catalog.metrics) {
  const definitions = metric.series || [{ key: 'main', label: metric.label }];
  definitions.forEach((series, index) => {
    const order = metric.series ? index + 1 : 0;
    seriesRows.push(`    (${quote(metric.id)}, ${quote(series.key)}, ${quote(series.label)}, ${order})`);
  });
}
seriesRows.forEach((row, index) => lines.push(`${row}${index === seriesRows.length - 1 ? '' : ','}`));
lines.push(
  'ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);',
  '',
);
fs.writeFileSync(path.join(root, 'sql', '002_catalog.sql'), lines.join('\n'), 'utf8');
console.log(`Generated ${catalog.metrics.length} Bitcoin metric rows.`);
