const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const [archivePath, apiPath, outputPath] = process.argv.slice(2).map((file) => file && path.resolve(file));
if (!archivePath || !apiPath || !outputPath || archivePath === outputPath || apiPath === outputPath) {
  console.error('Aufruf: node tools/prepare-coinmetrics-btc-exchange-usd.js <archiv.csv> <api.csv> <ausgabe.csv>');
  process.exit(1);
}

const metricIds = ['exchange_inflow_usd', 'exchange_outflow_usd', 'exchange_balance_usd'];
const selectedIds = new Set(metricIds);
const rowsByMetric = new Map(metricIds.map((id) => [id, []]));
const seen = new Set();

for (const filename of [archivePath, apiPath]) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Ungültiger CSV-Header: ${filename}`);
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`${filename}, Zeile ${index + 2}: Spaltenzahl weicht ab.`);
    const [metricId, seriesKey, date, value, source, , quality, , hash] = cells;
    if (!selectedIds.has(metricId)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`${filename}, Zeile ${index + 2}: ungültige Beobachtung.`);
    }
    if (seriesKey !== 'main' || source !== 'coinmetrics_community_btc' || quality !== 'provisional') {
      throw new Error(`${filename}, Zeile ${index + 2}: Quelle, Teilreihe oder Qualität weicht ab.`);
    }
    const key = `${metricId}/${seriesKey}/${date}`;
    if (seen.has(key)) throw new Error(`Doppelte Beobachtung: ${key}`);
    seen.add(key);
    rowsByMetric.get(metricId).push({ date, line });
  }
}

let commonStart = null;
let commonEnd = null;
let commonCount = null;
const report = {};
for (const metricId of metricIds) {
  const observations = rowsByMetric.get(metricId).sort((a, b) => a.date.localeCompare(b.date));
  if (!observations.length) throw new Error(`Keine Werte für ${metricId}.`);
  const first = observations[0].date;
  const last = observations.at(-1).date;
  const firstMs = Date.parse(`${first}T00:00:00Z`);
  for (let index = 0; index < observations.length; index++) {
    const expected = new Date(firstMs + index * 86_400_000).toISOString().slice(0, 10);
    if (observations[index].date !== expected) throw new Error(`${metricId}: Lücke oder doppelter Tag vor ${observations[index].date}.`);
  }
  if (first !== '2011-04-24') throw new Error(`${metricId}: unerwarteter Start ${first}.`);
  if (commonStart && (first !== commonStart || last !== commonEnd || observations.length !== commonCount)) {
    throw new Error('Die drei Metriken haben keine identische, vollständige Tagesabdeckung.');
  }
  commonStart = first;
  commonEnd = last;
  commonCount = observations.length;
  report[metricId] = { count: observations.length, first, last };
}

const output = [importHeader, ...metricIds
  .flatMap((metricId) => rowsByMetric.get(metricId))
  .sort((a, b) => a.date.localeCompare(b.date) || a.line.localeCompare(b.line))
  .map(({ line }) => line)];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${output.join('\n')}\n`);
console.log(JSON.stringify({ records: output.length - 1, metrics: report }, null, 2));
