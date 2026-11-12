const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const mergePath = path.join(varDir, 'bitcoin-only-source-metrics-master-merge-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const merge = JSON.parse(fs.readFileSync(mergePath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const categories = new Map(catalog.metrics.map((metric) => [metric.id, metric.category]));
const emptyIds = manifest.emptyMetricIdList || [];
const emptyCoreIds = manifest.emptyCoreMetricIdList || [];
const remainingBitcoinIds = emptyIds.filter((metricId) => categories.get(metricId) !== 'macro').sort();

manifest.scope ||= {};
manifest.scope.remainingEmptyBitcoinMetricIds = remainingBitcoinIds;
manifest.scope.remainingEmptyCoreMetricIds = [...emptyCoreIds].sort();
manifest.scope.emptyBitcoinMetricScope = 'Catalog metrics with observations still missing after excluding the macro category; recalculated from the current master manifest.';
manifest.latestSourceRefresh.bitcoinMetricIdsStillEmpty = remainingBitcoinIds;
merge.emptyMetricIdsRemainingForBitcoin = remainingBitcoinIds.length;
merge.remainingEmptyBitcoinMetricIds = remainingBitcoinIds;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
fs.writeFileSync(mergePath, `${JSON.stringify(merge, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  observations: manifest.observations,
  metricIdsWithObservations: manifest.metricIdsWithObservations,
  emptyMetricIds: manifest.emptyMetricIds,
  emptyMetricIdsRemainingForBitcoin: remainingBitcoinIds.length,
  remainingEmptyBitcoinMetricIds: remainingBitcoinIds,
  emptyCoreMetricIds: emptyCoreIds,
}, null, 2));
