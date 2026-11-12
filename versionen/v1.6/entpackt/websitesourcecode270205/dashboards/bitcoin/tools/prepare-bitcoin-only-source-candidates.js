const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const masterManifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const goldCsvPath = path.join(varDir, 'world-bank-gold-monthly-source-through-2026-08.csv');
const etfJsonPath = path.join(varDir, 'btc-data-etf-holdings-source-snapshot-2026-09-30.json');
const outputPath = path.join(varDir, 'bitcoin-only-source-metrics-candidate-through-2026-09-28.csv');
const manifestPath = path.join(varDir, 'bitcoin-only-source-metrics-candidate-through-2026-09-28.json');
const sourceSlugs = {
  goldRatio: 'bitcoin_gold_ratio_private',
  etfHoldings: 'bitcoin_etf_holdings_private',
};
const etfTickers = ['ARKB', 'BITB', 'HODL', 'IBIT', 'OBTC'];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(filename);
  for await (const chunk of input) hash.update(chunk);
  return hash.digest('hex');
}

function parseMonth(period) {
  const match = /^(\d{4})M(\d{2})$/.exec(period);
  if (!match) throw new Error(`Ungültige Monatsperiode: ${period}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const end = new Date(Date.UTC(year, month, 0));
  return {
    year,
    month,
    date: end.toISOString().slice(0, 10),
    days: end.getUTCDate(),
  };
}

function formatDecimal(value, decimals = 12) {
  if (!Number.isFinite(value)) throw new Error(`Nicht endlicher Wert: ${value}`);
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

function csvRow(metricId, date, value, sourceSlug, revision, rawHash) {
  return [
    metricId,
    'main',
    date,
    value,
    sourceSlug,
    `${date}T00:00:00Z`,
    'provisional',
    revision,
    rawHash,
  ].join(',');
}

async function main() {
for (const filename of [masterPath, masterManifestPath, goldCsvPath, etfJsonPath]) {
  if (!fs.existsSync(filename)) throw new Error(`Quelldatei fehlt: ${path.relative(root, filename)}`);
}

const recordedMaster = JSON.parse(fs.readFileSync(masterManifestPath, 'utf8'));
const expectedMasterHash = recordedMaster.masterSha256;
const masterBytesHash = await sha256File(masterPath);
if (masterBytesHash !== expectedMasterHash) {
  throw new Error(`Der Master-Hash passt nicht zum Manifest: ${masterBytesHash}`);
}

const priceByDate = new Map();
const existingTargets = new Map([
  ['price_gold_oz', 0],
  ['etf_holdings_btc', 0],
]);
let masterRowCount = 0;
const masterInput = fs.createReadStream(masterPath, { encoding: 'utf8' });
const masterLines = readline.createInterface({ input: masterInput, crlfDelay: Infinity });
let firstLine = true;
for await (const line of masterLines) {
  if (firstLine) {
    firstLine = false;
    if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error('Unerwarteter Master-CSV-Kopf.');
    continue;
  }
  if (!line) continue;
  masterRowCount += 1;
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`Ungültige Master-Zeile ${masterRowCount + 1}.`);
  const [metricId, seriesKey, date, rawValue] = cells;
  if (existingTargets.has(metricId)) existingTargets.set(metricId, existingTargets.get(metricId) + 1);
  if (metricId !== 'price_usd' || seriesKey !== 'main' || date > cutoff) continue;
  const value = Number(rawValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Ungültiger BTC-USD-Preis im Master: ${date}/${rawValue}`);
  }
  if (priceByDate.has(date)) throw new Error(`Doppelter BTC-USD-Tageswert: ${date}`);
  priceByDate.set(date, value);
}
for (const [metricId, rows] of existingTargets) {
  if (rows !== 0) throw new Error(`${metricId} ist nicht mehr leer: ${rows} Master-Zeilen.`);
}
if (masterRowCount !== recordedMaster.observations) {
  throw new Error(`Master-Zeilen ${masterRowCount} weichen vom Manifest ${recordedMaster.observations} ab.`);
}
if (priceByDate.size < 5000) throw new Error(`BTC-USD-Abdeckung unerwartet: ${priceByDate.size} Tage.`);

const btcMonths = new Map();
for (const [date, value] of priceByDate) {
  const month = date.slice(0, 7);
  const bucket = btcMonths.get(month) || { sum: 0, count: 0 };
  bucket.sum += value;
  bucket.count += 1;
  btcMonths.set(month, bucket);
}

const goldRows = fs.readFileSync(goldCsvPath, 'utf8').trimEnd().split(/\r?\n/);
if (goldRows.shift() !== 'period,observation_date,gold_usd_troy_oz') throw new Error('Unerwarteter Gold-CSV-Kopf.');
const goldByMonth = new Map();
for (const line of goldRows) {
  const [period, date, rawGold] = line.split(',');
  const parsed = parseMonth(period);
  const gold = Number(rawGold);
  if (date !== parsed.date || !Number.isFinite(gold) || gold <= 0) throw new Error(`Ungültiger Pink-Sheet-Wert: ${line}`);
  if (goldByMonth.has(`${parsed.year}-${String(parsed.month).padStart(2, '0')}`)) throw new Error(`Doppelte Gold-Monatsperiode: ${period}`);
  goldByMonth.set(`${parsed.year}-${String(parsed.month).padStart(2, '0')}`, { ...parsed, gold });
}

const btcSourceMonths = [];
const goldRatioRows = [];
for (const [month, gold] of goldByMonth) {
  if (gold.date > cutoff) continue;
  const btc = btcMonths.get(month);
  if (!btc) continue;
  const coveragePct = (btc.count / gold.days) * 100;
  if (coveragePct < 95) continue;
  const btcMonthlyMeanUsd = btc.sum / btc.count;
  const ouncesPerBtc = btcMonthlyMeanUsd / gold.gold;
  const row = csvRow(
    'price_gold_oz',
    gold.date,
    formatDecimal(ouncesPerBtc),
    sourceSlugs.goldRatio,
    'World-Bank-Pink-Sheet-2026-09-02+Coin-Metrics-PriceUSD-through-2026-09-28',
    '0'.repeat(64),
  );
  goldRatioRows.push(row);
  btcSourceMonths.push({
    period: month,
    date: gold.date,
    btcDays: btc.count,
    calendarDays: gold.days,
    btcCoveragePct: Number(coveragePct.toFixed(4)),
    btcMeanUsd: Number(btcMonthlyMeanUsd.toFixed(8)),
    goldMonthlyMeanUsdPerTroyOz: gold.gold,
    goldOuncesPerBtc: Number(ouncesPerBtc.toFixed(12)),
  });
}
if (goldRatioRows.length < 150) throw new Error(`BTC/Gold-Monatsabdeckung unerwartet: ${goldRatioRows.length} Werte.`);

const etfJsonBytes = fs.readFileSync(etfJsonPath);
const etfSourceHash = sha256(etfJsonBytes);
const etfRaw = JSON.parse(etfJsonBytes.toString('utf8'));
const actualTickers = Object.keys(etfRaw).sort();
if (actualTickers.join(',') !== [...etfTickers].sort().join(',')) {
  throw new Error(`ETF-Quellreihen weichen ab: ${actualTickers.join(',')}`);
}
const holdingsByDate = new Map();
let etfSourceRows = 0;
for (const ticker of etfTickers) {
  const observations = etfRaw[ticker];
  if (!Array.isArray(observations) || observations.length < 10) throw new Error(`Zu wenige ETF-Werte: ${ticker}`);
  let previousDate = '';
  for (const item of observations) {
    if (!Array.isArray(item) || item.length !== 2) throw new Error(`Ungültige ETF-Beobachtung: ${ticker}`);
    const [date, value] = item;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= previousDate || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Ungültiger oder unsortierter ETF-Wert: ${ticker}/${date}/${value}`);
    }
    previousDate = date;
    if (date > cutoff) continue;
    etfSourceRows += 1;
    const bucket = holdingsByDate.get(date) || new Map();
    bucket.set(ticker, value);
    holdingsByDate.set(date, bucket);
  }
}

const etfAggregateDetails = [];
const etfRows = [];
for (const [date, holdings] of [...holdingsByDate].sort(([left], [right]) => left.localeCompare(right))) {
  if (holdings.size !== etfTickers.length) continue;
  let sumScaled = 0n;
  for (const ticker of etfTickers) {
    const textValue = String(holdings.get(ticker));
    const [whole, fraction = ''] = textValue.split('.');
    if (fraction.length > 4) throw new Error(`ETF-Wert mit mehr als vier Dezimalstellen: ${ticker}/${textValue}`);
    const scaled = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0') || '0');
    sumScaled += scaled;
  }
  const sumText = `${sumScaled / 10000n}.${String(sumScaled % 10000n).padStart(4, '0')}`.replace(/\.?0+$/, '');
  etfRows.push(csvRow(
    'etf_holdings_btc',
    date,
    sumText,
    sourceSlugs.etfHoldings,
    'Crypto-Exponentials-ETF-holdings-snapshot-fetched-2026-09-30',
    etfSourceHash,
  ));
  etfAggregateDetails.push({ date, trackedFunds: etfTickers, sumBtc: Number(sumText) });
}
if (etfRows.length < 10) throw new Error(`Zu wenige gemeinsame ETF-Stichtage: ${etfRows.length}`);

const goldWorkbookManifestPath = path.join(varDir, 'world-bank-gold-monthly-source-through-2026-08.json');
const goldWorkbookManifest = JSON.parse(fs.readFileSync(goldWorkbookManifestPath, 'utf8'));
const goldPayloadHash = sha256(`${masterBytesHash}:${goldWorkbookManifest.sourceWorkbookSha256}`);
const rowsWithGoldHash = goldRatioRows.map((line) => line.replace(new RegExp(`,0{64}$`), `,${goldPayloadHash}`));
const candidateRows = [...rowsWithGoldHash, ...etfRows].sort((left, right) => {
  const a = left.split(',');
  const b = right.split(',');
  return a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]);
});
const candidateKeys = new Set();
for (const [index, line] of candidateRows.entries()) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`Ungültiger Kandidat in Zeile ${index + 2}.`);
  const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
  if (candidateKeys.has(key)) throw new Error(`Doppelter Kandidat: ${key}`);
  candidateKeys.add(key);
  if (cells[2] > cutoff || !/^[a-f0-9]{64}$/.test(cells[8])) throw new Error(`Datum oder Prüfsumme ungültig: ${key}`);
}

const candidateBytes = Buffer.from(`${importHeader}\n${candidateRows.join('\n')}\n`, 'utf8');
fs.writeFileSync(outputPath, candidateBytes);
const latestEtfDate = etfAggregateDetails.at(-1).date;
const summary = {
  scope: 'Bitcoin-only private local research; no public redistribution cleared; not uploaded.',
  cutoffInclusive: cutoff,
  master: path.relative(root, masterPath),
  masterRowsChecked: masterRowCount,
  masterSha256Checked: masterBytesHash,
  existingTargetRows: Object.fromEntries(existingTargets),
  candidate: path.relative(root, outputPath),
  candidateRows: candidateRows.length,
  candidateSha256: sha256(candidateBytes),
  metrics: {
    price_gold_oz: {
      observations: rowsWithGoldHash.length,
      firstDate: btcSourceMonths[0].date,
      lastDate: btcSourceMonths.at(-1).date,
      frequency: 'monthly',
      valueDefinition: 'Mean of available daily Coin Metrics PriceUSD closes in the calendar month divided by the World Bank Pink Sheet monthly average gold price in USD per troy ounce.',
      minBtcDailyCoveragePct: Math.min(...btcSourceMonths.map((row) => row.btcCoveragePct)),
      maxBtcDailyCoveragePct: Math.max(...btcSourceMonths.map((row) => row.btcCoveragePct)),
      sourceWorkbookSha256: goldWorkbookManifest.sourceWorkbookSha256,
      ratioInputHash: goldPayloadHash,
      noSeptemberPointBecausePinkSheetStopsAtAugust: true,
      monthlyInputs: btcSourceMonths,
    },
    etf_holdings_btc: {
      observations: etfRows.length,
      firstDate: etfAggregateDetails[0].date,
      lastDate: latestEtfDate,
      frequency: 'reported common dates only',
      funds: etfTickers,
      sourceFundObservationRowsThroughCutoff: etfSourceRows,
      sourceJsonSha256: etfSourceHash,
      aggregation: 'Sum the five reported fund balances only on dates when all five exact-date values are present. No forward fill or missing-date imputation.',
      knownCoverageLimit: 'Five issuer series from a third-party repository; the repository documents seven US spot ETF products without machine-readable daily holdings. This is not total US spot ETF holdings.',
      commonDateTotals: etfAggregateDetails,
    },
  },
  rights: {
    worldBankPinkSheet: 'World Bank-produced open dataset, attribution required under CC BY 4.0 default; only the ratio is in the candidate.',
    bitcoinPrice: 'Uses existing Coin Metrics Community PriceUSD rows. Keep private/non-commercial pending any public redistribution review.',
    etfHoldings: 'Repository code has MIT license but its README says data files remain subject to original source terms. The extracted issuer data remain private/local pending source-rights review.',
  },
  uploaded: false,
  publicRedistributionCleared: false,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  masterRowsChecked: masterRowCount,
  masterSha256Checked: masterBytesHash,
  btcPriceDays: priceByDate.size,
  goldRatioRows: rowsWithGoldHash.length,
  goldRatioFirstDate: btcSourceMonths[0].date,
  goldRatioLastDate: btcSourceMonths.at(-1).date,
  goldRatioMinCoveragePct: Math.min(...btcSourceMonths.map((row) => row.btcCoveragePct)),
  etfSourceRowsThroughCutoff: etfSourceRows,
  etfCommonDateRows: etfRows.length,
  etfFirstDate: etfAggregateDetails[0].date,
  etfLastDate: latestEtfDate,
  candidateRows: candidateRows.length,
  candidateSha256: summary.candidateSha256,
}, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
