#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultInput = path.resolve(scriptDirectory, '..', 'var', 'bitcoin-backfill-cointime-cftc-options.csv');
const defaultOutput = path.join(scriptDirectory, 'bitcoin-price-usd-for-bigquery.csv');
const [inputPath = defaultInput, outputPath = defaultOutput] = process.argv.slice(2);

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (quoted) {
      if (character === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      fields.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  fields.push(value);
  if (quoted) throw new Error('CSV enthält ein nicht geschlossenes Anführungszeichen.');
  return fields;
}

async function main() {
  if (!fs.existsSync(inputPath)) throw new Error(`Quelldatei fehlt: ${inputPath}`);

  const input = fs.createReadStream(inputPath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let columnIndex;
  let rowCount = 0;
  let firstDate = null;
  let lastDate = null;
  let previousDate = null;
  const outputRows = ['observed_date,price_usd'];
  const seenDates = new Set();

  for await (const line of lines) {
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (columnIndex === undefined) {
      const required = ['metric_id', 'series_key', 'observation_date', 'value', 'source_slug'];
      const indices = Object.fromEntries(required.map((name) => [name, fields.indexOf(name)]));
      const missing = required.filter((name) => indices[name] < 0);
      if (missing.length) throw new Error(`Fehlende CSV-Spalten: ${missing.join(', ')}`);
      columnIndex = indices;
      continue;
    }

    if (fields[columnIndex.metric_id] !== 'price_usd'
      || fields[columnIndex.series_key] !== 'main'
      || fields[columnIndex.source_slug] !== 'coinmetrics_community_btc') continue;

    const date = fields[columnIndex.observation_date];
    const priceText = fields[columnIndex.value];
    const price = Number(priceText);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price <= 0) {
      throw new Error(`Ungültiger Preisdatensatz am Datum ${date}.`);
    }
    if (seenDates.has(date)) throw new Error(`Doppelter Coin-Metrics-Preistag: ${date}`);
    if (previousDate && date <= previousDate) throw new Error(`Preisdaten sind nicht aufsteigend: ${date}`);

    seenDates.add(date);
    previousDate = date;
    firstDate ??= date;
    lastDate = date;
    rowCount += 1;
    outputRows.push(`${date},${priceText}`);
  }

  if (!rowCount) throw new Error('Keine Coin-Metrics-BTC-USD-Preisdaten gefunden.');
  fs.writeFileSync(outputPath, `${outputRows.join('\n')}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    status: 'research helper only; not for the website upload',
    rows: rowCount,
    firstDate,
    lastDate,
    source: 'Coin Metrics Community Data, CC BY-NC 4.0',
    outputPath
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
