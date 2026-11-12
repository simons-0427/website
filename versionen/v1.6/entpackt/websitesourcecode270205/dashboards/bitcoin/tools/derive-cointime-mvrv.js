const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Aufruf: node tools/derive-cointime-mvrv.js <import.csv> <ausgabe.csv>');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
if (inputPath === outputPath) throw new Error('Ausgabe darf die Eingabedatei nicht überschreiben.');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const knownMetrics = new Set(catalog.metrics.map((metric) => metric.id));
const inputs = ['price_usd', 'realized_price_usd', 'liveliness', 'mvrv_ratio'];
const outputs = ['active_mvrv_ratio', 'vaulted_mvrv_ratio'];
for (const metric of outputs) {
  if (!knownMetrics.has(metric)) throw new Error(`Kennzahl fehlt im Katalog: ${metric}`);
}

const sourceSlug = 'derived_bitcoin_metrics';
const version = 'cointime-mvrv-v1';
const inputKey = (metric, date) => `${metric}/main/${date}`;
const lines = fs.readFileSync(inputPath, 'utf8').trimEnd().split(/\r?\n/);
if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Ungültiger Import-CSV-Kopf: ${inputPath}`);

const rows = new Map(inputs.map((metric) => [metric, new Map()]));
const inputKeys = new Set();
for (const [index, line] of lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`${inputPath}, Zeile ${index + 2}: falsche Spaltenzahl.`);
  const [metric, series, date, raw, source, , quality, , hash] = cells;
  if (!rows.has(metric)) continue;
  if (series !== 'main' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(raw)
    || !/^[a-z0-9_]{1,96}$/.test(source) || quality !== 'provisional'
    || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`${inputPath}, Zeile ${index + 2}: ungültige Eingabe für ${metric}.`);
  }
  const key = inputKey(metric, date);
  if (inputKeys.has(key)) throw new Error(`${inputPath}: doppelte Eingabe ${key}`);
  inputKeys.add(key);
  rows.get(metric).set(date, { value: Number(raw), hash });
}

const outputRows = [];
const outputKeys = new Set();
const counts = Object.fromEntries(outputs.map((metric) => [metric, 0]));
const dates = [...rows.get('price_usd').keys()].sort();
const formatValue = (value) => {
  if (!Number.isFinite(value)) throw new Error(`Abgeleiteter Wert ist nicht endlich: ${value}`);
  const rounded = Number(value.toFixed(12));
  if (Object.is(rounded, -0)) return '0';
  return rounded.toFixed(12).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
};

let skipped = 0;
let maxMvrvCheckError = 0;
let maxDecompositionError = 0;
let firstDate = '';
let lastDate = '';
for (const date of dates) {
  const price = rows.get('price_usd').get(date);
  const realizedPrice = rows.get('realized_price_usd').get(date);
  const liveliness = rows.get('liveliness').get(date);
  const suppliedMvrv = rows.get('mvrv_ratio').get(date);
  if (!price || !realizedPrice || !liveliness || !suppliedMvrv) continue;
  if (price.value <= 0 || realizedPrice.value <= 0 || liveliness.value <= 0 || liveliness.value >= 1) {
    skipped++;
    continue;
  }

  const baseMvrv = price.value / realizedPrice.value;
  const mvrvError = Math.abs(baseMvrv - suppliedMvrv.value);
  maxMvrvCheckError = Math.max(maxMvrvCheckError, mvrvError);
  if (mvrvError > 0.000001) throw new Error(`${date}: Preis / Realized Price weicht unerwartet vom gespeicherten MVRV ab.`);

  const activeMvrv = price.value / (realizedPrice.value / liveliness.value);
  const vaultedness = 1 - liveliness.value;
  const vaultedMvrv = price.value / (realizedPrice.value / vaultedness);
  maxDecompositionError = Math.max(maxDecompositionError, Math.abs(activeMvrv + vaultedMvrv - baseMvrv));
  const keyHashes = [price.hash, realizedPrice.hash, liveliness.hash, suppliedMvrv.hash];

  for (const [metric, value, formula] of [
    ['active_mvrv_ratio', activeMvrv, 'spot-price-over-realized-price-divided-by-liveliness'],
    ['vaulted_mvrv_ratio', vaultedMvrv, 'spot-price-over-realized-price-divided-by-one-minus-liveliness'],
  ]) {
    const key = inputKey(metric, date);
    if (inputKeys.has(key) || outputKeys.has(key)) throw new Error(`Kollidierende Kennzahl: ${key}`);
    const formatted = formatValue(value);
    const inputsHash = crypto.createHash('sha256').update(keyHashes.join('\x1f')).digest('hex');
    const hash = crypto.createHash('sha256').update(`${version}\x1f${formula}\x1f${key}\x1f${inputsHash}\x1f${formatted}`).digest('hex');
    const revision = `${version}:${formula}`;
    outputRows.push([metric, 'main', date, formatted, sourceSlug, '', 'provisional', revision, hash].join(','));
    outputKeys.add(key);
    counts[metric]++;
  }
  if (!firstDate) firstDate = date;
  lastDate = date;
}

if (outputRows.length === 0 || counts.active_mvrv_ratio !== counts.vaulted_mvrv_ratio) {
  throw new Error('Keine vollständigen Active/Vaulted-MVRV-Paare erzeugt.');
}
outputRows.sort((a, b) => a.split(',')[2].localeCompare(b.split(',')[2]) || a.split(',')[0].localeCompare(b.split(',')[0]));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, [importHeader, ...outputRows].join('\n') + '\n', 'utf8');
console.log(JSON.stringify({
  source: sourceSlug,
  status: 'provisional derived observations; private import only',
  input: inputPath,
  output: outputPath,
  metricCounts: counts,
  completeDays: counts.active_mvrv_ratio,
  skippedInvalidDays: skipped,
  firstDate,
  lastDate,
  maxBaseMvrvDifference: maxMvrvCheckError,
  maxActivePlusVaultedDifference: maxDecompositionError,
}, null, 2));
