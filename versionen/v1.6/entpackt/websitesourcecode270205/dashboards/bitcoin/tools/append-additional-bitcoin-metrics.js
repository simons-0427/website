const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const [derivedArg] = process.argv.slice(2);
if (!derivedArg) {
  console.error('Aufruf: node tools/append-additional-bitcoin-metrics.js <vollständiger-abgeleiteter-import.csv>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const derivedPath = path.resolve(derivedArg);
const additionsPath = path.join(varDir, 'additional-bitcoin-derived-import.csv');
const manifestPath = path.join(varDir, 'additional-bitcoin-derived-manifest.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-additional-bitcoin-metrics-2026-09-29.csv');
const nextPath = `${masterPath}.next`;
const targetMetrics = new Set([
  'mayer_multiple',
  'return_3y',
  'cagr_3y_pct',
  'best_day_return_1y_pct',
  'worst_day_return_1y_pct',
  'max_drawdown_1y_pct',
  'drawdown_cycle_pct',
  'sharpe_1y',
  'sortino_1y',
  'blocks_until_adjustment',
  'blocks_until_halving',
  'difficulty_change_pct',
  'fee_revenue_share_pct',
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

const current = readCsv(masterPath);
const derived = readCsv(derivedPath);
const existingKeys = new Set();
const metricIds = new Set();
for (const [index, line] of current.lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`Ungültige Master-Zeile ${index + 2}.`);
  const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
  if (existingKeys.has(key)) throw new Error(`Doppelter Schlüssel im Master: ${key}`);
  existingKeys.add(key);
  metricIds.add(cells[0]);
}

const additions = [];
const additionKeys = new Set();
const coverage = new Map();
for (const [index, line] of derived.lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`Ungültige Zeile ${index + 2} im abgeleiteten Import.`);
  const [metricId, seriesKey, date, value, sourceSlug, , quality, revision, hash] = cells;
  if (!targetMetrics.has(metricId)) continue;
  if (sourceSlug !== 'derived_bitcoin_metrics' || quality !== 'provisional') throw new Error(`Unerwartete Herkunft oder Qualität: ${metricId}/${date}`);
  if (seriesKey !== 'main' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !revision || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`Ungültige abgeleitete Beobachtung: ${metricId}/${date}`);
  }
  const key = `${metricId}/${seriesKey}/${date}`;
  if (existingKeys.has(key)) continue;
  if (additionKeys.has(key)) throw new Error(`Doppelter neuer Schlüssel: ${key}`);
  additionKeys.add(key);
  additions.push(line);
  if (!coverage.has(metricId)) coverage.set(metricId, []);
  coverage.get(metricId).push(date);
}

if (additions.length === 0) throw new Error('Keine neuen Beobachtungen für die fehlenden Bitcoin-Kennzahlen gefunden.');
const backupExists = fs.existsSync(backupPath);
if (backupExists && !fs.readFileSync(backupPath).equals(current.bytes)) {
  throw new Error(`Die vorhandene Sicherung passt nicht exakt zum Eingabe-Master: ${backupPath}`);
}
if (fs.existsSync(nextPath)) throw new Error(`Temporäre Masterdatei existiert bereits: ${nextPath}`);

const additionsCsv = `${importHeader}\n${additions.join('\n')}\n`;
const separator = current.bytes.length > 0 && !current.bytes.toString('utf8').endsWith('\n') ? '\n' : '';
const suffix = Buffer.from(`${separator}${additions.join('\n')}\n`, 'utf8');
const nextBytes = Buffer.concat([current.bytes, suffix]);
if (!nextBytes.subarray(0, current.bytes.length).equals(current.bytes)) throw new Error('Der bisherige Master blieb nicht als exaktes Bytepräfix erhalten.');

fs.writeFileSync(additionsPath, additionsCsv, 'utf8');
if (!backupExists) fs.writeFileSync(backupPath, current.bytes);
fs.writeFileSync(nextPath, nextBytes);
const written = fs.readFileSync(nextPath);
if (!written.equals(nextBytes) || !written.subarray(0, current.bytes.length).equals(current.bytes)) throw new Error('Die geschriebene Masterdatei stimmt nicht mit dem geprüften Kandidaten überein.');
fs.renameSync(nextPath, masterPath);

for (const metricId of targetMetrics) if (coverage.has(metricId)) metricIds.add(metricId);
const summary = {
  master: path.relative(root, masterPath),
  masterRowsBefore: current.lines.length,
  masterRowsAfter: current.lines.length + additions.length,
  priorMasterSha256: sha256(current.bytes),
  priorMasterPreservedAsBytePrefix: true,
  backup: path.relative(root, backupPath),
  additions: path.relative(root, additionsPath),
  addedRows: additions.length,
  addedMetricCount: coverage.size,
  totalMetricIdsAfter: metricIds.size,
  metrics: Object.fromEntries([...coverage].sort(([left], [right]) => left.localeCompare(right)).map(([metricId, dates]) => [metricId, {
    observations: dates.length,
    firstDate: dates.sort()[0],
    lastDate: dates.at(-1),
  }])),
  masterSha256: sha256(written),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
