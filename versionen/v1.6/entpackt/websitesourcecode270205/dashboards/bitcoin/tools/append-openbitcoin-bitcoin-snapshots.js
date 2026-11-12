const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const snapshotDate = '2026-09-29';
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const inputPath = path.join(varDir, `openbitcoin-bitcoin-snapshots-${snapshotDate}-import.csv`);
const backupPath = path.join(varDir, `bitcoin-backfill-cointime-cftc-options-before-openbitcoin-snapshots-${snapshotDate}.csv`);
const manifestPath = path.join(varDir, `openbitcoin-bitcoin-snapshots-${snapshotDate}-append-manifest.json`);
const nextPath = `${masterPath}.openbitcoin-next`;

const expectedCounts = new Map([
  ['fear_greed_index', 366],
  ['mining_pool_share', 91],
  ['pool_concentration_hhi', 1],
  ['fee_recommendation_fast_sat_vb', 1],
  ['fee_recommendation_economy_sat_vb', 1],
  ['mempool_min_fee_sat_vb', 1],
]);
const expectedSources = new Map([
  ['fear_greed_index', 'openbitcoin_node_api'],
  ['mining_pool_share', 'openbitcoin_node_api'],
  ['pool_concentration_hhi', 'derived_bitcoin_metrics'],
  ['fee_recommendation_fast_sat_vb', 'openbitcoin_node_api'],
  ['fee_recommendation_economy_sat_vb', 'openbitcoin_node_api'],
  ['mempool_min_fee_sat_vb', 'openbitcoin_node_api'],
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readCsv(filename) {
  const bytes = fs.readFileSync(filename);
  const lines = bytes.toString('utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Unerwarteter CSV-Kopf: ${filename}`);
  return { bytes, lines };
}

function isUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

const current = readCsv(masterPath);
const input = readCsv(inputPath);
const existingKeys = new Set();
const metricIds = new Set();
for (const [index, line] of current.lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`Ungültige Master-Zeile ${index + 2}.`);
  const [metricId, seriesKey, date] = cells;
  const key = `${metricId}/${seriesKey}/${date}`;
  if (existingKeys.has(key)) throw new Error(`Doppelter Schlüssel im Master: ${key}`);
  existingKeys.add(key);
  metricIds.add(metricId);
}

const additions = [];
const additionKeys = new Set();
const coverage = new Map();
for (const [index, line] of input.lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`Ungültige Snapshot-Zeile ${index + 2}.`);
  const [metricId, seriesKey, date, value, sourceSlug, sourceTimestamp, quality, revision, hash] = cells;
  if (!expectedCounts.has(metricId) || expectedSources.get(metricId) !== sourceSlug) {
    throw new Error(`Nicht freigegebene Kennzahl oder Quelle: ${metricId}/${sourceSlug}`);
  }
  const expectedRevisionPrefix = metricId === 'pool_concentration_hhi'
    ? 'derived-v3:openbitcoin-pool-concentration-hhi-7d'
    : metricId === 'mining_pool_share'
      ? 'openbitcoin-pools-b7d:'
      : metricId === 'fear_greed_index'
        ? 'openbitcoin-fear-greed-history:'
        : metricId === 'fee_recommendation_fast_sat_vb'
          ? 'openbitcoin-fees-fastest:'
          : metricId === 'fee_recommendation_economy_sat_vb'
            ? 'openbitcoin-fees-economy:'
            : 'openbitcoin-mempool-min-feerate:';
  if (!/^([a-z0-9_]{1,96})$/.test(seriesKey) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !isUtcTimestamp(sourceTimestamp)
    || quality !== 'provisional' || !revision.startsWith(expectedRevisionPrefix)
    || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`Ungültige Bitcoin-Beobachtung in Zeile ${index + 2}: ${metricId}/${seriesKey}/${date}`);
  }
  if (metricId !== 'fear_greed_index' && date !== snapshotDate) {
    throw new Error(`Unerwartetes Snapshot-Datum für ${metricId}: ${date}`);
  }
  const key = `${metricId}/${seriesKey}/${date}`;
  if (existingKeys.has(key)) throw new Error(`Beobachtung existiert bereits im Master: ${key}`);
  if (additionKeys.has(key)) throw new Error(`Doppelter Snapshot-Schlüssel: ${key}`);
  additionKeys.add(key);
  additions.push(line);
  if (!coverage.has(metricId)) coverage.set(metricId, 0);
  coverage.set(metricId, coverage.get(metricId) + 1);
}

if (coverage.size !== expectedCounts.size || input.lines.length !== [...expectedCounts.values()].reduce((sum, count) => sum + count, 0)) {
  throw new Error(`Erwartet werden exakt 461 Bitcoin-Snapshot-Zeilen für sechs Kennzahlen; gefunden: ${input.lines.length}.`);
}
for (const [metricId, count] of expectedCounts) {
  if (coverage.get(metricId) !== count) throw new Error(`Unerwartete Abdeckung für ${metricId}: ${coverage.get(metricId) ?? 0} statt ${count}.`);
}
if (fs.existsSync(nextPath)) throw new Error(`Temporäre Masterdatei existiert bereits: ${nextPath}`);
if (fs.existsSync(manifestPath)) throw new Error(`Append-Manifest existiert bereits: ${manifestPath}`);
if (fs.existsSync(backupPath) && !fs.readFileSync(backupPath).equals(current.bytes)) {
  throw new Error(`Die vorhandene Sicherung passt nicht bytegenau zum Eingabe-Master: ${backupPath}`);
}

const separator = current.bytes.length > 0 && !current.bytes.toString('utf8').endsWith('\n') ? '\n' : '';
const suffix = Buffer.from(`${separator}${additions.join('\n')}\n`, 'utf8');
const nextBytes = Buffer.concat([current.bytes, suffix]);
if (!nextBytes.subarray(0, current.bytes.length).equals(current.bytes)) throw new Error('Der bisherige Master blieb nicht als Bytepräfix erhalten.');

if (!fs.existsSync(backupPath)) fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
fs.writeFileSync(nextPath, nextBytes, { flag: 'wx' });
const written = fs.readFileSync(nextPath);
if (!written.equals(nextBytes) || !written.subarray(0, current.bytes.length).equals(current.bytes)) {
  throw new Error('Die temporäre Masterdatei stimmt nicht mit dem geprüften Kandidaten überein.');
}
fs.renameSync(nextPath, masterPath);

for (const metricId of coverage.keys()) metricIds.add(metricId);
const summary = {
  master: path.relative(root, masterPath),
  masterRowsBefore: current.lines.length,
  masterRowsAfter: current.lines.length + additions.length,
  priorMasterSha256: sha256(current.bytes),
  priorMasterPreservedAsBytePrefix: true,
  backup: path.relative(root, backupPath),
  input: path.relative(root, inputPath),
  addedRows: additions.length,
  addedMetricCount: coverage.size,
  totalMetricIdsAfter: metricIds.size,
  metrics: Object.fromEntries([...coverage].sort(([left], [right]) => left.localeCompare(right)).map(([metricId, count]) => [metricId, { observations: count }])),
  masterSha256: sha256(written),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
