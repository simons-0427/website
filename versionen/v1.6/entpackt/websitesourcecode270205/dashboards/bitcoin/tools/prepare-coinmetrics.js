const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { mappings, importHeader, observationRow } = require('./coinmetrics-format');

const args = process.argv.slice(2);
const incremental = args[0] === '--incremental';
if (incremental) args.shift();
if (args.length !== 2 || args.some((arg) => arg.startsWith('-'))) {
  console.error('Aufruf: node tools/prepare-coinmetrics.js [--incremental] <btc.csv> <ausgabe.csv>');
  process.exit(1);
}
const [inputPath, outputPath] = args.map((arg) => path.resolve(arg));
if (inputPath === outputPath) throw new Error('Eingabe und Ausgabe müssen verschieden sein.');
const source = fs.readFileSync(inputPath);
const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
const rows = source.toString('utf8').trimEnd().split(/\r?\n/);
const header = rows.shift().replace(/^\uFEFF/, '').split(',');
if (header[0] !== 'time') throw new Error('Coin-Metrics-CSV: Spalte time fehlt.');
const fields = new Map(header.map((name, index) => [name, index]));
for (const [field] of mappings) {
  if (!fields.has(field)) throw new Error(`Coin-Metrics-CSV: Spalte ${field} fehlt.`);
}
const fullDates = new Set();
const counts = new Map(mappings.map(([, metric]) => [metric, { count: 0, first: null, last: null }]));
const output = [importHeader];
let lastDate = '';

for (const [rowNumber, line] of rows.entries()) {
  const cells = line.split(',');
  if (cells.length !== header.length) throw new Error(`CSV-Zeile ${rowNumber + 2}: Spaltenzahl weicht ab.`);
  const date = cells[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date <= lastDate) {
    throw new Error(`CSV-Zeile ${rowNumber + 2}: Datum ungültig oder nicht streng aufsteigend.`);
  }
  lastDate = date;
  if (date < '2009-01-09') continue;
  const blockCount = cells[fields.get('BlkCnt')];
  if (blockCount === '') continue;
  fullDates.add(date);
  for (const [field, metric, multiplier] of mappings) {
    const raw = cells[fields.get(field)];
    if (raw === '') continue;
    output.push(observationRow(date, field, metric, raw, 'csv', multiplier));
    const count = counts.get(metric);
    count.count++;
    count.first ||= date;
    count.last = date;
  }
}

if (!incremental && fullDates.size < 6000) throw new Error(`Unerwartet kurze BTC-Historie: ${fullDates.size} Tage.`);
if (!incremental && (!counts.get('price_usd').first || counts.get('price_usd').first < '2010-01-01')) {
  throw new Error('Unerwarteter Start der Preisreihe.');
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output.join('\n') + '\n', { flag: 'w' });
console.log(JSON.stringify({ sourceSha256: sourceHash, sourceLastDate: lastDate, records: output.length - 1, metrics: Object.fromEntries(counts) }, null, 2));
