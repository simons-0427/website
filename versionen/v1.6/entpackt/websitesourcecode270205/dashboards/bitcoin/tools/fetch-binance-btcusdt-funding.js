const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = process.argv[2] || '2026-09-28';
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || new Date(`${cutoff}T00:00:00Z`).toISOString().slice(0, 10) !== cutoff) {
  throw new Error('Aufruf: node tools/fetch-binance-btcusdt-funding.js JJJJ-MM-TT');
}
const today = new Date().toISOString().slice(0, 10);
if (cutoff >= today) throw new Error('Der Stichtag muss ein abgeschlossener UTC-Tag sein.');

const startTime = Date.parse('2019-09-01T00:00:00Z');
const endTime = Date.parse(`${cutoff}T23:59:59.999Z`);
const endpoint = 'https://fapi.binance.com/fapi/v1/fundingRate';
const rawPath = path.join(varDir, `binance-btcusdt-funding-history-through-${cutoff}.json`);
const candidatePath = path.join(varDir, `binance-btcusdt-funding-daily-mean-import-through-${cutoff}.csv`);
const sourceSlug = 'binance_usdm_public_api';
const seriesKey = 'main';
const revision = 'binance-fapi-v1-fundingRate-utc-daily-mean-regular-rate-x100-v1';
const byFundingTime = new Map();
let pages = 0;

function csvRow(values) {
  return values.map((value) => {
    const text = String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',');
}

function decimal(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e24) throw new Error('Ungültiger aggregierter Fundingwert.');
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fetchPage(cursor) {
  const url = new URL(endpoint);
  url.searchParams.set('symbol', 'BTCUSDT');
  url.searchParams.set('startTime', String(cursor));
  url.searchParams.set('endTime', String(endTime));
  url.searchParams.set('limit', '1000');
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (attempt === 4) throw new Error(`Binance-Netzwerkfehler: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * (2 ** attempt), 16_000)));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : Math.min(1000 * (2 ** attempt), 16_000);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page) || page.length > 1000) throw new Error('Unerwartete Funding-API-Antwort.');
    return page;
  }
  throw new Error('Binance-Fundinghistorie nach mehreren Versuchen nicht abrufbar.');
}

async function main() {
  if (fs.existsSync(rawPath) || fs.existsSync(candidatePath)) throw new Error('Ausgabedatei existiert bereits; nichts wird überschrieben.');
  let cursor = startTime;
  while (cursor <= endTime) {
    const page = await fetchPage(cursor);
    pages++;
    if (pages > 50) throw new Error('Unerwartet viele Funding-API-Seiten.');
    if (page.length === 0) break;
    let maxTime = -1;
    for (const row of page) {
      const timestamp = Number(row?.fundingTime);
      const rate = Number(row?.fundingRate);
      if (row?.symbol !== 'BTCUSDT' || !Number.isSafeInteger(timestamp) || timestamp < cursor || timestamp > endTime || !Number.isFinite(rate)) {
        throw new Error('Unerwarteter oder ungültiger Binance-BTCUSDT-Fundingdatensatz.');
      }
      if (row.rateType && row.rateType !== 'Regular') throw new Error(`Unerwarteter Fundingtyp ${row.rateType}; Tagesreihe nicht berechnet.`);
      const previous = byFundingTime.get(timestamp);
      if (previous && previous.fundingRate !== row.fundingRate) throw new Error('Widersprüchliche Binance-Werte mit demselben Fundingzeitpunkt.');
      byFundingTime.set(timestamp, row);
      maxTime = Math.max(maxTime, timestamp);
    }
    if (maxTime < cursor) throw new Error('Die Binance-Fundinguhr ist beim Abruf nicht vorangekommen.');
    cursor = maxTime + 1;
    if (page.length < 1000) break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (byFundingTime.size === 0) throw new Error('Binance lieferte keine BTCUSDT-Fundingwerte.');

  const events = [...byFundingTime.values()].sort((a, b) => Number(a.fundingTime) - Number(b.fundingTime));
  const daily = new Map();
  for (const row of events) {
    const timestamp = Number(row.fundingTime);
    const date = new Date(timestamp).toISOString().slice(0, 10);
    if (!daily.has(date)) daily.set(date, []);
    daily.get(date).push(row);
  }

  const importRows = [importHeader];
  const dailyCounts = [];
  for (const [date, rows] of [...daily.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const pctValues = rows.map((row) => Number(row.fundingRate) * 100);
    const value = pctValues.reduce((sum, item) => sum + item, 0) / pctValues.length;
    const lastTimestamp = Math.max(...rows.map((row) => Number(row.fundingTime)));
    const sourceTimestamp = new Date(lastTimestamp).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const rawHash = hash(JSON.stringify(rows.map((row) => [Number(row.fundingTime), row.fundingRate, row.rateType || null])));
    importRows.push(csvRow([
      'binance_perpetual_funding_rate_pct',
      seriesKey,
      date,
      decimal(value),
      sourceSlug,
      sourceTimestamp,
      'provisional',
      revision,
      rawHash,
    ]));
    dailyCounts.push(rows.length);
  }

  const rawDocument = {
    retrievedAt: new Date().toISOString(),
    source: 'Binance USDⓈ-M Futures public REST API',
    sourceUrl: endpoint,
    documentationUrl: 'https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data',
    symbol: 'BTCUSDT',
    queriedFromUtc: new Date(startTime).toISOString(),
    queriedThroughUtc: new Date(endTime).toISOString(),
    recordCount: events.length,
    firstFundingTime: new Date(Number(events[0].fundingTime)).toISOString(),
    lastFundingTime: new Date(Number(events.at(-1).fundingTime)).toISOString(),
    dailyAggregation: 'Arithmetic mean of regular BTCUSDT settlement funding rates within each UTC calendar day, multiplied by 100 to percent; no rescaling to an 8-hour interval and no interpolation.',
    pointsPerDay: { minimum: Math.min(...dailyCounts), median: dailyCounts.slice().sort((a, b) => a - b)[Math.floor(dailyCounts.length / 2)], maximum: Math.max(...dailyCounts) },
    redistributionRights: 'Not independently confirmed; retain as private local research until verified.',
    pages,
    records: events,
  };
  fs.writeFileSync(rawPath, JSON.stringify(rawDocument) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  fs.writeFileSync(candidatePath, importRows.join('\n') + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({
    status: 'private provisional import candidate',
    source: rawDocument.source,
    symbol: 'BTCUSDT',
    observations: importRows.length - 1,
    firstObservation: [...daily.keys()].sort()[0],
    lastObservation: [...daily.keys()].sort().at(-1),
    eventRows: events.length,
    pages,
    pointsPerDay: rawDocument.pointsPerDay,
    rawSha256: hash(fs.readFileSync(rawPath)),
    candidateSha256: hash(fs.readFileSync(candidatePath)),
    raw: path.relative(varDir, rawPath),
    candidate: path.relative(varDir, candidatePath),
    uploaded: false,
  }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
