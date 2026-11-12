const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const [coinMetricsArg, obmArg, outputArg] = process.argv.slice(2);
if (!coinMetricsArg || !obmArg || !outputArg) {
  console.error('Aufruf: node tools/derive-obm-metrics.js <coinmetrics-enriched.csv> <obm-import.csv> <ausgabe.csv>');
  process.exit(1);
}

const coinMetricsPath = path.resolve(coinMetricsArg);
const obmPath = path.resolve(obmArg);
const outputPath = path.resolve(outputArg);
if (outputPath === coinMetricsPath || outputPath === obmPath) throw new Error('Ausgabe darf keine Eingabedatei überschreiben.');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const knownMetrics = new Set(catalog.metrics.map((metric) => metric.id));
const sourceSlug = 'derived_bitcoin_metrics';
const version = 'obm-derived-metrics-v1';
const metricVersions = new Map([
  ['mean_transaction_size_btc', 'obm-derived-metrics-v2'],
]);
const inputKey = (metric, date) => `${metric}/main/${date}`;

function readImport(filename) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Ungültiger Import-CSV-Kopf: ${filename}`);
  const rows = new Map();
  const keys = new Set();
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`${filename}, Zeile ${index + 2}: falsche Spaltenzahl.`);
    const [metric, seriesKey, date, rawValue, slug, , quality, , hash] = cells;
    if (!/^[a-z0-9_]{1,96}$/.test(metric) || seriesKey !== 'main' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rawValue) || !/^[a-z0-9_]{1,96}$/.test(slug) || quality !== 'provisional' || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`${filename}, Zeile ${index + 2}: ungültige Beobachtung.`);
    }
    const key = inputKey(metric, date);
    if (keys.has(key)) throw new Error(`${filename}: doppelte Beobachtung ${key}`);
    keys.add(key);
    if (!rows.has(metric)) rows.set(metric, new Map());
    rows.get(metric).set(date, { value: Number(rawValue), hash });
  }
  return { rows, keys, count: lines.length };
}

const coinMetrics = readImport(coinMetricsPath);
const obm = readImport(obmPath);
const get = (dataset, metric, date) => dataset.rows.get(metric)?.get(date) || null;
const outputRows = [];
const outputKeys = new Set();
const producedCounts = new Map();

function formatValue(value) {
  if (!Number.isFinite(value)) throw new Error(`Abgeleiteter Wert ist nicht endlich: ${value}`);
  const rounded = Number(value.toFixed(12));
  if (Object.is(rounded, -0)) return '0';
  return rounded.toFixed(12).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function emit(metric, date, value, inputHashes, formula) {
  if (!knownMetrics.has(metric)) throw new Error(`Kennzahl fehlt im Katalog: ${metric}`);
  const key = inputKey(metric, date);
  if (coinMetrics.keys.has(key) || obm.keys.has(key) || outputKeys.has(key)) throw new Error(`Abgeleitete Beobachtung kollidiert mit einer Eingabe: ${key}`);
  const formatted = formatValue(value);
  const metricVersion = metricVersions.get(metric) || version;
  const inputsHash = crypto.createHash('sha256').update(inputHashes.join('\x1f')).digest('hex');
  const hash = crypto.createHash('sha256').update(`${metricVersion}\x1f${formula}\x1f${key}\x1f${inputsHash}\x1f${formatted}`).digest('hex');
  const revision = `${metricVersion}:${formula}`;
  if (revision.length > 128) throw new Error(`Quellrevision ist zu lang: ${revision}`);
  outputRows.push([metric, 'main', date, formatted, sourceSlug, '', 'provisional', revision, hash].join(','));
  outputKeys.add(key);
  producedCounts.set(metric, (producedCounts.get(metric) || 0) + 1);
  return { value: Number(formatted), hash };
}

const volumeDates = [...(obm.rows.get('transaction_volume_btc') || new Map()).keys()].sort();
if (volumeDates.length === 0) throw new Error('OBM-Eingabe enthält kein transaction_volume_btc.');
const usdVolumeByDate = new Map();
const nvtRatioByDate = new Map();
for (const date of volumeDates) {
  const volume = get(obm, 'transaction_volume_btc', date);
  const price = get(coinMetrics, 'price_usd', date);
  const transactions = get(coinMetrics, 'transactions_count', date);
  const blocks = get(coinMetrics, 'blocks_count', date);
  const marketCap = get(coinMetrics, 'market_cap_usd', date);
  if (price && price.value > 0) {
    const usdVolume = emit('transaction_volume_usd', date, volume.value * price.value, [volume.hash, price.hash], 'obm-output-volume-times-coinmetrics-usd-close');
    usdVolumeByDate.set(date, usdVolume);
    if (marketCap && usdVolume.value > 0) {
      const ratio = emit('nvt_ratio', date, marketCap.value / usdVolume.value, [marketCap.hash, usdVolume.hash], 'market-cap-over-obm-gross-output-volume-usd');
      nvtRatioByDate.set(date, ratio);
    }
  }
  // Coin Metrics TxCnt already excludes coinbase transactions on UTXO chains.
  if (transactions && transactions.value > 0) {
    emit('mean_transaction_size_btc', date, volume.value / transactions.value, [volume.hash, transactions.hash], 'obm-output-volume-divided-by-coinmetrics-non-coinbase-tx-count');
  }
}

const binaryCddDates = [...(obm.rows.get('coin_days_destroyed') || new Map()).keys()].sort();
let adjustedCddSum = 0;
let adjustedCddCount = 0;
let adjustedCddHistoryHash = '';
for (const date of binaryCddDates) {
  const cdd = get(obm, 'coin_days_destroyed', date);
  const supply = get(coinMetrics, 'supply_btc', date);
  if (!cdd || !supply || supply.value <= 0) continue;
  const adjustedCdd = cdd.value / supply.value;
  adjustedCddSum += adjustedCdd;
  adjustedCddCount++;
  adjustedCddHistoryHash = crypto.createHash('sha256')
    .update([adjustedCddHistoryHash, date, cdd.hash, supply.hash].join('\x1f'))
    .digest('hex');
  const expandingMean = adjustedCddSum / adjustedCddCount;
  emit(
    'binary_coin_days_destroyed',
    date,
    adjustedCdd > expandingMean ? 1 : 0,
    [adjustedCddHistoryHash],
    'obm-cdd-over-circulating-supply-above-expanding-mean-including-current',
  );
}

const valuationDates = [...usdVolumeByDate.keys()].sort();
const consecutive = (dates, start, end) => end - start + 1 > 0
  && dateMillis(dates[end]) - dateMillis(dates[start]) === (end - start) * 86_400_000;
const dateMillis = (date) => Date.parse(`${date}T00:00:00Z`);

for (let i = 89; i < valuationDates.length; i++) {
  if (!consecutive(valuationDates, i - 89, i)) continue;
  const date = valuationDates[i];
  const windowDates = valuationDates.slice(i - 89, i + 1);
  const volumes = windowDates.map((item) => usdVolumeByDate.get(item));
  const meanVolume = volumes.reduce((sum, item) => sum + item.value, 0) / 90;
  const marketCap = get(coinMetrics, 'market_cap_usd', date);
  if (marketCap && meanVolume > 0) {
    emit('nvt_signal', date, marketCap.value / meanVolume, [marketCap.hash, ...volumes.map((item) => item.hash)], 'market-cap-over-90d-sma-obm-gross-output-volume-usd');
  }
}

for (let i = 729; i < valuationDates.length; i++) {
  if (!consecutive(valuationDates, i - 729, i)) continue;
  const date = valuationDates[i];
  const volumeWindow = valuationDates.slice(i - 89, i + 1).map((item) => usdVolumeByDate.get(item));
  if (volumeWindow.length !== 90) continue;
  const twoYearStart = valuationDates[i - 729];
  const nvtWindow = [...nvtRatioByDate.entries()]
    .filter(([itemDate]) => itemDate >= twoYearStart && itemDate <= date)
    .map(([, item]) => item);
  if (nvtWindow.length < Math.ceil(730 * 0.9)) continue;
  const medianRatio = median(nvtWindow.map((item) => item.value));
  const medianVolume = median(volumeWindow.map((item) => item.value));
  const supply = get(coinMetrics, 'supply_btc', date);
  const price = get(coinMetrics, 'price_usd', date);
  if (!supply || supply.value <= 0 || medianRatio === null || medianVolume === null || medianVolume <= 0) continue;
  const nvtPrice = emit('nvt_price_usd', date, medianRatio * medianVolume / supply.value, [
    ...nvtWindow.map((item) => item.hash),
    ...volumeWindow.map((item) => item.hash),
    supply.hash,
  ], '2y-median-nvt-ratio-times-90d-median-obm-gross-output-volume-over-supply');
  if (price && nvtPrice && nvtPrice.value > 0) {
    emit('nvt_premium_pct', date, (price.value / nvtPrice.value - 1) * 100, [price.hash, nvtPrice.hash], 'price-over-slow-90d-nvt-price-minus-one');
  }
}

const rvtDaily = valuationDates.map((date) => {
  const volume = usdVolumeByDate.get(date);
  const realizedCap = get(coinMetrics, 'realized_cap_usd', date);
  return volume && volume.value > 0 && realizedCap
    ? { date, value: realizedCap.value / volume.value, inputHashes: [realizedCap.hash, volume.hash] }
    : null;
});
for (let i = 27; i < valuationDates.length; i++) {
  if (!consecutive(valuationDates, i - 27, i)) continue;
  const window = rvtDaily.slice(i - 27, i + 1);
  if (window.some((item) => !item)) continue;
  const average = window.reduce((sum, item) => sum + item.value, 0) / 28;
  emit('rvt_ratio', valuationDates[i], average, window.flatMap((item) => item.inputHashes), '28d-sma-realized-cap-over-obm-gross-output-volume-usd');
}

const weightDates = [...(obm.rows.get('block_weight_mwu') || new Map()).keys()].sort();
if (weightDates.length === 0) throw new Error('OBM-Eingabe enthält kein block_weight_mwu.');
for (const date of weightDates) {
  const weight = get(obm, 'block_weight_mwu', date);
  const blocks = get(coinMetrics, 'blocks_count', date);
  if (!blocks || blocks.value <= 0) continue;
  const capacityMwu = blocks.value * 4;
  const utilizationPct = weight.value / capacityMwu * 100;
  if (utilizationPct > 100.0000001) throw new Error(`${date}: Blockauslastung über 100 %, OBM- und Coin-Metrics-Tagesgrenzen prüfen.`);
  emit('blockspace_utilization_pct', date, utilizationPct, [weight.hash, blocks.hash, 'bitcoin-consensus-max-block-weight-4000000-wu'], 'obm-daily-block-weight-over-coinmetrics-daily-consensus-capacity');
}

outputRows.sort((a, b) => a.split(',')[2].localeCompare(b.split(',')[2]) || a.split(',')[0].localeCompare(b.split(',')[0]));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, [importHeader, ...outputRows].join('\n') + '\n', 'utf8');

const summary = {};
for (const [metric, count] of [...producedCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const metricDates = outputRows.filter((line) => line.startsWith(`${metric},`)).map((line) => line.split(',')[2]);
  summary[metric] = { rows: count, first: metricDates[0], last: metricDates.at(-1) };
}
console.log(JSON.stringify({
  source: 'Open Bitcoin Metrics CC BY 4.0 plus Coin Metrics Community CC BY-NC 4.0 inputs',
  coinMetricsRows: coinMetrics.count,
  obmRows: obm.count,
  derivedRows: outputRows.length,
  derivedMetrics: summary,
  output: outputPath,
}, null, 2));
