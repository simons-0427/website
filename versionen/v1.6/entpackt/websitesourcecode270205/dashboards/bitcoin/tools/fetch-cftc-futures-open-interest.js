const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const DATASET_ID = '6dca-aqww';
const SCALE = 1_000_000_000_000n;
const MARKETS = new Map([
  ['BITCOIN-USD - CBOE FUTURES EXCHANGE', { multiplierTenths: 10, contractBtc: '1' }],
  ['BITCOIN - CHICAGO MERCANTILE EXCHANGE', { multiplierTenths: 50, contractBtc: '5' }],
  ['MICRO BITCOIN - CHICAGO MERCANTILE EXCHANGE', { multiplierTenths: 1, contractBtc: '0.1' }],
]);

function canonicalDecimal(value) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    throw new Error('Ungültiger Dezimalwert: ' + value);
  }
  const [whole, fraction = ''] = value.split('.');
  const rounded = fraction.slice(0, 12).padEnd(12, '0');
  let scaled = BigInt(whole) * SCALE + BigInt(rounded);
  if (fraction.length > 12 && fraction[12] >= '5') scaled++;
  return formatScaled(scaled);
}

function formatScaled(value) {
  const whole = (value / SCALE).toString();
  const fraction = (value % SCALE).toString().padStart(12, '0').replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : whole;
}

function scaledValue(value) {
  const canonical = canonicalDecimal(value);
  const [whole, fraction = ''] = canonical.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, '0'));
}

function loadPrices(filename) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) {
    throw new Error('Der Preisimport hat einen ungültigen CSV-Kopf.');
  }
  const prices = new Map();
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Ungültige CSV-Zeile ' + (index + 2) + '.');
    if (cells[0] !== 'price_usd' || cells[1] !== 'main') continue;
    if (cells[4] !== 'coinmetrics_community_btc' || !/^\d{4}-\d{2}-\d{2}$/.test(cells[2])) {
      throw new Error('Die USD-Preisreihe stammt nicht aus dem erwarteten Coin-Metrics-Import.');
    }
    if (prices.has(cells[2])) throw new Error('Doppelter Coin-Metrics-Preis für ' + cells[2] + '.');
    prices.set(cells[2], {
      value: canonicalDecimal(cells[3]),
      revision: cells[7],
      hash: cells[8],
    });
  }
  return prices;
}

async function fetchRows() {
  const names = Array.from(MARKETS.keys());
  const where = 'market_and_exchange_names IN (' + names.map((name) => "'" + name.replaceAll("'", "''") + "'").join(',') + ')';
  const query = new URLSearchParams({
    '$select': 'report_date_as_yyyy_mm_dd,market_and_exchange_names,open_interest_all',
    '$where': where,
    '$order': 'report_date_as_yyyy_mm_dd ASC',
    '$limit': '10000',
  });
  const response = await fetch('https://publicreporting.cftc.gov/resource/' + DATASET_ID + '.json?' + query.toString(), {
    headers: { accept: 'application/json', 'user-agent': 'smstark-bitcoin-dashboard/1.0' },
  });
  if (!response.ok) throw new Error('CFTC antwortete mit HTTP ' + response.status + '.');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('CFTC lieferte keine Futures-Daten.');
  return rows;
}

async function main() {
  const [, , priceFile, outputFile] = process.argv;
  if (!priceFile || !outputFile) {
    throw new Error('Aufruf: node tools/fetch-cftc-futures-open-interest.js <preis-import.csv> <ausgabe.csv>');
  }
  if (path.resolve(priceFile) === path.resolve(outputFile)) {
    throw new Error('Die Ausgabe darf die Preiseingabe nicht überschreiben.');
  }
  const prices = loadPrices(priceFile);
  const sourceRows = await fetchRows();
  const grouped = new Map();
  const seen = new Set();

  for (const row of sourceRows) {
    const market = row.market_and_exchange_names;
    const spec = MARKETS.get(market);
    if (!spec) throw new Error('Unerwarteter CFTC-Markt: ' + market);
    const date = String(row.report_date_as_yyyy_mm_dd || '').slice(0, 10);
    const openInterest = String(row.open_interest_all ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:0|[1-9][0-9]*)$/.test(openInterest)) {
      throw new Error('CFTC lieferte ein ungültiges Datum oder Open-Interest-Feld.');
    }
    const key = date + '\u001f' + market;
    if (seen.has(key)) throw new Error('Doppelter CFTC-Marktbericht für ' + date + ': ' + market);
    seen.add(key);
    if (!grouped.has(date)) grouped.set(date, { btcTenths: 0n, positions: [] });
    const group = grouped.get(date);
    group.btcTenths += BigInt(openInterest) * BigInt(spec.multiplierTenths);
    group.positions.push({
      market,
      open_interest_all: openInterest,
      contract_btc: spec.contractBtc,
    });
  }

  const rows = [importHeader];
  const dates = Array.from(grouped.keys()).sort();
  for (const date of dates) {
    const price = prices.get(date);
    if (!price) throw new Error('Für CFTC-Berichtstag ' + date + ' fehlt ein Coin-Metrics-USD-Preis.');
    const group = grouped.get(date);
    group.positions.sort((a, b) => (a.market < b.market ? -1 : a.market > b.market ? 1 : 0));
    const valueScaled = (scaledValue(price.value) * group.btcTenths + 5n) / 10n;
    const value = formatScaled(valueScaled);
    const payload = {
      version: 'cftc-legacy-v1',
      report_date: date,
      positions: group.positions,
      price_usd: price.value,
      price_source_revision: price.revision,
      price_raw_payload_hash: price.hash,
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const revision = 'cftc-legacy-v1:' + date + ':cm:' + price.hash.slice(0, 12);
    rows.push([
      'futures_open_interest_usd', 'main', date, value, 'cftc_cot_legacy',
      '', 'provisional', revision, hash,
    ].join(','));
  }

  const output = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, rows.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({
    status: 'private import candidate',
    datasetId: DATASET_ID,
    sourceRows: sourceRows.length,
    observations: dates.length,
    first: dates[0],
    last: dates.at(-1),
    missingPrices: 0,
    output: output,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
