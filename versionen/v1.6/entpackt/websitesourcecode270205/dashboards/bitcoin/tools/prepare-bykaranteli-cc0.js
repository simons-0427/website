const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const sourceBase = 'https://raw.githubusercontent.com/bykarantelicom/crypto-datasets/main/data/';
const sourceSlug = 'bykaranteli_crypto_datasets_cc0';
const dvolHeader = 'date,currency,dvol,source';
const venueHeader = 'date,venue,market,symbol,quote,price_usd,volume_24h_usd,open_interest_usd,funding_rate_8h_pct,source';
const scale = 1_000_000_000_000n;

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error('CSV enthält ein nicht geschlossenes Anführungszeichen.');
  cells.push(value);
  return cells;
}

function parseDataset(text, expectedHeader, label) {
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== expectedHeader) throw new Error(label + ': CSV-Kopf weicht ab.');
  if (lines.length === 0) throw new Error(label + ': CSV enthält keine Datenzeilen.');
  return lines.map((line, index) => {
    const cells = parseCsvLine(line);
    if (cells.length !== expectedHeader.split(',').length) {
      throw new Error(label + ', Zeile ' + (index + 2) + ': Spaltenzahl weicht ab.');
    }
    return { cells, line };
  });
}

function validDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(label + ': ungültiges Datum.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(label + ': ungültiges UTC-Datum.');
  }
  return value;
}

function toScaled(raw, label) {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) throw new Error(label + ': kein Dezimalwert.');
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  if (whole.length > 24) throw new Error(label + ': Wert außerhalb des Datenbankschemas.');
  let result = BigInt(whole) * scale + BigInt(fraction.slice(0, 12).padEnd(12, '0') || '0');
  if (fraction.length > 12 && fraction[12] >= '5') result++;
  return negative && result !== 0n ? -result : result;
}

function fromScaled(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = (absolute / scale).toString();
  const fraction = (absolute % scale).toString().padStart(12, '0').replace(/0+$/, '');
  return (negative ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}

function medianScaled(values) {
  const sorted = values.slice().sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  const total = sorted[middle - 1] + sorted[middle];
  let midpoint = total / 2n;
  if (total % 2n !== 0n) midpoint += total > 0n ? 1n : -1n;
  return midpoint;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function download(filename) {
  const url = sourceBase + filename;
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/csv', 'User-Agent': 'smstark-bitcoin-data/1.0' },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (attempt === 4) throw new Error(filename + ': Netzwerkfehler: ' + error.message);
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * (2 ** attempt), 16_000)));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 60_000)
        : Math.min(1000 * (2 ** attempt), 16_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) throw new Error(filename + ': HTTP ' + response.status + '.');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length < 100 || body.length > 50_000_000) throw new Error(filename + ': Dateigröße unerwartet.');
    return { text: body.toString('utf8'), hash: sha256(body), url };
  }
  throw new Error(filename + ': nach Wiederholungen nicht abrufbar.');
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function importRow(metric, date, value, revision, hash) {
  return [metric, 'main', date, value, sourceSlug, '', 'provisional', revision, hash]
    .map(csvCell)
    .join(',');
}

async function loadInput(filename, sourceUrl) {
  if (filename) {
    const body = fs.readFileSync(path.resolve(filename));
    return { text: body.toString('utf8'), hash: sha256(body), url: sourceUrl };
  }
  return download(path.basename(sourceUrl));
}

async function main() {
  const [outputArg, dvolArg, venueArg] = process.argv.slice(2);
  if (dvolArg && !venueArg) {
    throw new Error('Beide optionalen Quelldateien angeben: <ausgabe.csv> [dvol-daily.csv venue-markets-daily.csv].');
  }
  const outputPath = path.resolve(outputArg || path.join(root, 'var', 'bykaranteli-cc0-snapshots-import.csv'));
  const dvolSource = await loadInput(dvolArg, sourceBase + 'dvol-daily.csv');
  const venueSource = await loadInput(venueArg, sourceBase + 'venue-markets-daily.csv');
  const dvolRecords = parseDataset(dvolSource.text, dvolHeader, 'dvol-daily.csv');
  const venueRecords = parseDataset(venueSource.text, venueHeader, 'venue-markets-daily.csv');
  const output = [importHeader];
  const seenDvolDates = new Set();
  const dvolCoverage = [];

  for (const { cells, line } of dvolRecords) {
    const [dateText, currency, rawValue, source] = cells;
    if (currency !== 'BTC') continue;
    const date = validDate(dateText, 'DVOL ' + dateText);
    if (source !== 'bykaranteli.com' || seenDvolDates.has(date)) {
      throw new Error('DVOL enthält unerwartete Quelle oder doppelte BTC-Tageswerte am ' + date + '.');
    }
    const scaled = toScaled(rawValue, 'DVOL ' + date);
    if (scaled <= 0n) throw new Error('DVOL muss positiv sein: ' + date);
    const hash = sha256([dvolSource.url, line].join('\x1f'));
    output.push(importRow(
      'options_iv_30d_pct', date, fromScaled(scaled), 'bykaranteli-cc0-dvol-daily-v1', hash,
    ));
    seenDvolDates.add(date);
    dvolCoverage.push(date);
  }

  const seenFeeds = new Set();
  const fundingByDate = new Map();
  let fundingFeedCount = 0;
  const venues = new Set();
  for (const { cells, line } of venueRecords) {
    const [dateText, venue, market, symbol, quote, , , , rawFunding, source] = cells;
    if (market !== 'perp' || symbol !== 'BTC') continue;
    const date = validDate(dateText, 'Funding ' + dateText);
    if (!venue || !quote || source !== 'bykaranteli.com') {
      throw new Error('Fundingfeed enthält einen unerwarteten BTC-Perpetual-Datensatz.');
    }
    const feedKey = [date, venue, market, symbol, quote].join('\x1f');
    if (seenFeeds.has(feedKey)) throw new Error('Doppelter BTC-Perpetual-Feed: ' + feedKey);
    seenFeeds.add(feedKey);
    if (rawFunding === '') continue;
    const value = toScaled(rawFunding, 'Funding ' + feedKey);
    if (value < -100n * scale || value > 100n * scale) {
      throw new Error('Fundingwert außerhalb des akzeptierten Prozentbereichs: ' + feedKey);
    }
    const rowHash = sha256([venueSource.url, line].join('\x1f'));
    if (!fundingByDate.has(date)) fundingByDate.set(date, []);
    fundingByDate.get(date).push({ value, rowHash });
    fundingFeedCount++;
    venues.add(venue);
  }

  for (const date of [...fundingByDate.keys()].sort()) {
    const feeds = fundingByDate.get(date).sort((left, right) => left.rowHash.localeCompare(right.rowHash));
    const value = medianScaled(feeds.map((feed) => feed.value));
    const hash = sha256(JSON.stringify({
      formula: 'median-of-available-btc-perpetual-funding-rate-8h-pct-v1',
      date,
      inputHashes: feeds.map((feed) => feed.rowHash),
    }));
    output.push(importRow(
      'perpetual_funding_rate_pct', date, fromScaled(value),
      'bykaranteli-cc0-venue-median-8h-v1', hash,
    ));
  }

  if (dvolCoverage.length === 0 || fundingByDate.size === 0) {
    throw new Error('Die ByKaranteli-Dateien enthielten keine passenden BTC-Reihen.');
  }
  const lines = output.slice(1);
  lines.sort((left, right) => {
    const a = left.split(',');
    const b = right.split(',');
    return a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]);
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, [importHeader, ...lines].join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });

  const dvolDates = dvolCoverage.sort();
  const fundingDates = [...fundingByDate.keys()].sort();
  console.log(JSON.stringify({
    source: 'ByKaranteli frozen repository, CC0 1.0',
    rawFiles: {
      dvol: { url: dvolSource.url, sha256: dvolSource.hash, bytes: Buffer.byteLength(dvolSource.text) },
      venues: { url: venueSource.url, sha256: venueSource.hash, bytes: Buffer.byteLength(venueSource.text) },
    },
    optionsIv: { rows: dvolDates.length, first: dvolDates[0], last: dvolDates.at(-1) },
    funding: {
      dailyMedianRows: fundingDates.length,
      first: fundingDates[0],
      last: fundingDates.at(-1),
      rawRows: seenFeeds.size,
      rawRowsWithFunding: fundingFeedCount,
      sourceVenues: venues.size,
      aggregation: 'daily median of available 8-hour-equivalent BTC perpetual feed snapshots',
    },
    records: lines.length,
    output: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error('ByKaranteli-CC0-Aufbereitung fehlgeschlagen: ' + error.message);
  process.exitCode = 1;
});
