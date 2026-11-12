const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { importHeader } = require('./coinmetrics-format');

const [cutoff, baseMonth, baseReleaseDate, masterArg, candidateArg, rawArg] = process.argv.slice(2);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
if (!datePattern.test(cutoff || '') || !monthPattern.test(baseMonth || '')
  || !datePattern.test(baseReleaseDate || '') || !masterArg || !candidateArg || !rawArg) {
  console.error('Aufruf: node tools/fetch-bitcoin-real-price.js <Stichtag> <CPI-Basismonat> <CPI-Veröffentlichungsdatum> <Master.csv> <Kandidat.csv> <CPI-Rohdaten.json>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const varRoot = path.resolve(root, 'var');
const resolveVarFile = (filename) => {
  const absolute = path.resolve(filename);
  const relative = path.relative(varRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Datei muss innerhalb bitcoin/var liegen: ${filename}`);
  }
  return absolute;
};
const masterPath = resolveVarFile(masterArg);
const candidatePath = resolveVarFile(candidateArg);
const rawPath = resolveVarFile(rawArg);
if (new Set([masterPath, candidatePath, rawPath]).size !== 3) throw new Error('Master, Kandidat und CPI-Rohdaten müssen verschiedene Dateien sein.');

const baseEnd = new Date(Date.UTC(Number(baseMonth.slice(0, 4)), Number(baseMonth.slice(5, 7)), 0)).toISOString().slice(0, 10);
if (baseEnd > cutoff || baseReleaseDate > cutoff || baseReleaseDate <= baseEnd) {
  throw new Error('Der CPI-Basismonat und sein Veröffentlichungstag müssen vor oder am Datenstichtag liegen.');
}

const cpiSeriesId = 'CUUR0000SA0';
const cpiApiUrl = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
const retrievedAt = new Date().toISOString();
const baseYear = Number(baseMonth.slice(0, 4));
const requests = [];
const cpiByMonth = new Map();
const unavailableCpiByMonth = new Map();

async function fetchCpiRange(startYear, endYear) {
  const response = await fetch(cpiApiUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'smstark-bitcoin-data/1.0' },
    body: JSON.stringify({ seriesid: [cpiSeriesId], startyear: String(startYear), endyear: String(endYear) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`BLS API antwortete mit HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS API meldet ${payload.status}: ${(payload.message || []).join('; ')}`);
  const series = payload.Results?.series?.find((entry) => entry.seriesID === cpiSeriesId);
  if (!series) throw new Error(`BLS-Reihe ${cpiSeriesId} fehlt in der Antwort.`);
  const included = [];
  for (const item of series.data) {
    const match = /^M(0[1-9]|1[0-2])$/.exec(item.period || '');
    if (!match) continue;
    const month = `${item.year}-${match[1]}`;
    if (month > baseMonth) continue;
    if (!/^\d{4}$/.test(item.year || '')) {
      throw new Error(`Ungültiges BLS-Jahr für ${month}.`);
    }
    if (item.value === '-') {
      if (cpiByMonth.has(month) || unavailableCpiByMonth.has(month)) throw new Error(`Doppelter CPI-Monat: ${month}`);
      const missing = { month, rawValue: item.value, footnotes: item.footnotes || [] };
      unavailableCpiByMonth.set(month, missing);
      included.push({ year: item.year, period: item.period, value: item.value, footnotes: item.footnotes || [] });
      continue;
    }
    if (!/^\d+(?:\.\d+)?$/.test(item.value || '') || Number(item.value) <= 0) {
      throw new Error(`Ungültiger CPI-Wert für ${month}.`);
    }
    if (cpiByMonth.has(month) || unavailableCpiByMonth.has(month)) throw new Error(`Doppelter CPI-Monat: ${month}`);
    const hash = crypto.createHash('sha256').update(`${cpiSeriesId}\x1f${month}\x1f${item.value}`).digest('hex');
    const record = { month, value: Number(item.value), rawValue: item.value, hash, footnotes: item.footnotes || [] };
    cpiByMonth.set(month, record);
    included.push({ year: item.year, period: item.period, value: item.value, footnotes: item.footnotes || [] });
  }
  requests.push({ startYear, endYear, seriesId: cpiSeriesId, includedObservations: included });
}

async function readBitcoinPriceMonths() {
  const monthRows = new Map();
  const stream = fs.createReadStream(masterPath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let isHeader = true;
  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error('Bitcoin-Master hat einen unerwarteten CSV-Kopf.');
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Bitcoin-Master enthält eine Zeile mit falscher Spaltenzahl.');
    const [metric, series, date, value, source, , quality, , hash] = cells;
    if (metric !== 'price_usd' || series !== 'main' || source !== 'coinmetrics_community_btc' || date > cutoff) continue;
    if (!datePattern.test(date) || !/^-?(?:0|[1-9][0-9]*)(?:\.\d+)?$/.test(value) || !/^[a-f0-9]{64}$/.test(hash) || quality !== 'provisional') {
      throw new Error(`Ungültige Coin Metrics BTC-Preiszeile für ${date}.`);
    }
    const month = date.slice(0, 7);
    if (!monthRows.has(month)) monthRows.set(month, []);
    if (monthRows.get(month).some((item) => item.date === date)) throw new Error(`Doppelter BTC-Preis für ${date}.`);
    monthRows.get(month).push({ date, value: Number(value), hash });
  }
  return monthRows;
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function monthEnd(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function formatValue(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Number(value.toFixed(12));
  const text = rounded.toFixed(12).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
  const whole = text.split('.')[0];
  if (whole.length > 24) throw new Error(`Wert überschreitet DECIMAL(36,12): ${text}`);
  return text;
}

function nextMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
}

async function main() {
  for (let startYear = 2010; startYear <= baseYear;) {
    const endYear = Math.min(startYear + 9, baseYear);
    await fetchCpiRange(startYear, endYear);
    startYear = endYear + 1;
  }

  const expectedCpiMonths = [];
  for (let month = '2010-01'; month <= baseMonth; month = nextMonth(month)) expectedCpiMonths.push(month);
  const missingCpiMonths = expectedCpiMonths.filter((month) => !cpiByMonth.has(month) && !unavailableCpiByMonth.has(month));
  if (missingCpiMonths.length > 0) throw new Error(`BLS-CPI-Monate fehlen: ${missingCpiMonths.join(', ')}`);
  const baseCpi = cpiByMonth.get(baseMonth);
  if (!baseCpi) throw new Error(`CPI-Basismonat ${baseMonth} fehlt.`);

  const btcByMonth = await readBitcoinPriceMonths();
  const observations = [];
  const skippedBitcoinMonths = [];
  for (let month = '2010-08'; month <= baseMonth; month = nextMonth(month)) {
    const days = (btcByMonth.get(month) || []).sort((a, b) => a.date.localeCompare(b.date));
    const expectedDays = daysInMonth(month);
    if (days.length !== expectedDays) {
      skippedBitcoinMonths.push({ month, expectedDays, observedDays: days.length });
      continue;
    }
    const cpi = cpiByMonth.get(month);
    if (!cpi) {
      if (unavailableCpiByMonth.has(month)) {
        skippedBitcoinMonths.push({ month, reason: 'BLS hat für diesen Monat keinen CPI-Wert veröffentlicht.' });
        continue;
      }
      throw new Error(`CPI fehlt für BTC-Monat ${month}.`);
    }
    const monthlyBtcMean = days.reduce((total, item) => total + item.value, 0) / days.length;
    const realPrice = formatValue(monthlyBtcMean * baseCpi.value / cpi.value);
    if (realPrice === null) throw new Error(`BTC-Realpreis konnte nicht berechnet werden für ${month}.`);
    const observationDate = monthEnd(month);
    const inputHash = crypto.createHash('sha256').update([
      'btc-real-price-cpi-v1', cpiSeriesId, baseMonth, baseReleaseDate, month,
      baseCpi.hash, cpi.hash, ...days.map((item) => item.hash),
    ].join('\x1f')).digest('hex');
    const rawHash = crypto.createHash('sha256').update(`btc-real-price-cpi-v1\x1f${observationDate}\x1f${realPrice}\x1f${inputHash}`).digest('hex');
    const revision = `btc-real-price-cpi-v1:base-${baseMonth}:released-${baseReleaseDate}`;
    observations.push([
      'btc_real_price_usd', 'main', observationDate, realPrice, 'btc_real_price_cpi', '', 'provisional', revision, rawHash,
    ].join(','));
  }

  const rawDocument = {
    source: 'U.S. Bureau of Labor Statistics Public Data API v1',
    sourceUrl: `${cpiApiUrl}${cpiSeriesId}`,
    seriesId: cpiSeriesId,
    seriesDefinition: 'CPI-U, not seasonally adjusted, regular monthly publication, U.S. city average, all items',
    retrievedAt,
    cutoff,
    baseMonth,
    baseReleaseDate,
    requests,
    unavailableCpiMonths: [...unavailableCpiByMonth.values()],
    formula: 'monthly arithmetic mean of daily Coin Metrics PriceUSD * CPI-U(baseMonth) / CPI-U(month)',
  };
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, `${JSON.stringify(rawDocument, null, 2)}\n`, 'utf8');
  fs.writeFileSync(candidatePath, `${[importHeader, ...observations].join('\n')}\n`, 'utf8');
  const fileHash = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  console.log(JSON.stringify({
    cutoff,
    cpiSeriesId,
    cpiMonths: cpiByMonth.size,
    unavailableCpiMonths: [...unavailableCpiByMonth.keys()],
    cpiBaseMonth: baseMonth,
    cpiBaseValue: baseCpi.rawValue,
    cpiBaseReleaseDate: baseReleaseDate,
    completeBtcMonths: observations.length,
    firstObservation: observations[0]?.split(',')[2] || null,
    lastObservation: observations.at(-1)?.split(',')[2] || null,
    skippedBitcoinMonths,
    rawFile: rawPath,
    rawSha256: fileHash(rawPath),
    candidateFile: candidatePath,
    candidateSha256: fileHash(candidatePath),
  }, null, 2));
}

main().catch((error) => {
  console.error(`BTC-Realpreis-Kandidat fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
