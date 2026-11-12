const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const cutoff = '2026-09-28';
const varDirectory = path.join(__dirname, '..', 'var');
const inputs = [
  path.join(varDirectory, 'lightning-history-research-through-2026-09-28.csv'),
  path.join(varDirectory, 'mempool-bitcoin-history-research-candidates-through-2026-09-28.csv'),
];
const output = path.join(varDirectory, 'mempool-private-bitcoin-dashboard-research-through-2026-09-28.csv');
const manifestPath = path.join(varDirectory, 'mempool-private-bitcoin-dashboard-research-through-2026-09-28.json');
const allowedMetrics = new Set([
  'lightning_capacity_btc',
  'lightning_channels',
  'lightning_nodes',
  'lightning_avg_channel_btc',
  'lightning_capacity_change_30d_pct',
  'lightning_channels_change_30d_pct',
  'lightning_median_channel_btc',
  'fees_p10_sat_vb',
  'fees_p90_sat_vb',
  'mining_pool_hashrate_share_pct',
  'pool_hashrate_concentration_hhi',
]);
const expectedRows = 8201;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const rows = [];
const keys = new Set();
const sourceCounts = {};
const metricCounts = {};
for (const filename of inputs) {
  const content = fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '').trimEnd();
  const lines = content.split(/\r?\n/);
  if (lines.shift() !== importHeader) throw new Error(`Ungültiger CSV-Header in ${path.basename(filename)}.`);
  for (const line of lines) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige CSV-Zeile in ${path.basename(filename)}.`);
    const [metric, series, date, value, source, sourceTimestamp, quality] = cells;
    if (!allowedMetrics.has(metric)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > cutoff) throw new Error(`Datum außerhalb des Stichtags: ${metric}/${date}.`);
    if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error(`Ungültiger Dezimalwert: ${metric}/${date}.`);
    if (quality !== 'provisional') throw new Error(`Forschungsreihe ohne provisional-Status: ${metric}/${date}.`);
    if (!series || !source || (sourceTimestamp && !/^\d{4}-\d{2}-\d{2}T/.test(sourceTimestamp))) {
      throw new Error(`Fehlende Quellen- oder Reihenmetadaten: ${metric}/${date}.`);
    }
    if (!source.startsWith('mempool_space_') && source !== 'derived_bitcoin_metrics') {
      throw new Error(`Unerwartete Quelle ${source} für ${metric}.`);
    }
    const key = `${metric}/${series}/${date}`;
    if (keys.has(key)) throw new Error(`Doppelter Kandidatenschlüssel: ${key}.`);
    keys.add(key);
    rows.push(line);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    metricCounts[metric] = (metricCounts[metric] || 0) + 1;
  }
}

rows.sort((a, b) => {
  const left = a.split(',');
  const right = b.split(',');
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]) || left[2].localeCompare(right[2]);
});
if (rows.length !== expectedRows) throw new Error(`Erwartet waren ${expectedRows} private BTC-Kandidaten, gefunden wurden ${rows.length}.`);
if (Object.keys(metricCounts).length !== allowedMetrics.size) throw new Error('Mindestens eine der elf erwarteten Bitcoin-Kennzahlen fehlt.');

const csv = `${importHeader}\n${rows.join('\n')}\n`;
fs.writeFileSync(output, csv);
const manifest = {
  dashboard: 'bitcoin',
  researchOnly: true,
  publicRedistributionCleared: false,
  cutoffInclusive: cutoff,
  inputFiles: inputs.map((filename) => ({ path: path.basename(filename), sha256: sha256(fs.readFileSync(filename)) })),
  observations: rows.length,
  metricIds: Object.keys(metricCounts).sort(),
  metricCounts,
  sourceCounts,
  firstObservationDate: rows.map((row) => row.split(',')[2]).sort()[0],
  lastObservationDate: rows.map((row) => row.split(',')[2]).sort().at(-1),
  excludedMetricIds: ['mining_pool_share', 'pool_concentration_hhi'],
  excludedReason: 'OpenBitcoin monthly block-count shares remain separate from the Mempool weekly estimated-hashrate series; only the distinct weekly metric IDs are included.',
  bytes: Buffer.byteLength(csv),
  sha256: sha256(Buffer.from(csv)),
  uploaded: false,
  databaseImported: false,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
