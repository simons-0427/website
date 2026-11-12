const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const rawPath = path.join(varDir, 'bykaranteli-btc-options-oi-research-through-2026-08-30.csv');
const candidatePath = path.join(varDir, 'bykaranteli-btc-options-oi-import-through-2026-08-30.csv');
const manifestPath = path.join(varDir, 'bykaranteli-btc-options-oi-import-through-2026-08-30.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const sourceUrl = 'https://raw.githubusercontent.com/bykarantelicom/crypto-datasets/main/data/options-oi-daily.csv';
const sourceSlug = 'bykaranteli_btc_options_oi_cc0';
const rawHeader = 'date,currency,instrument,expiry,strike,type,open_interest,mark_iv,underlying_usd,source';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const metricId = 'options_open_interest_usd';
const formula = 'sum(open_interest_btc_per_instrument * underlying_usd_per_instrument) over all reported BTC option instruments on the snapshot date, rounded to cents';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges UTC-Datum: ' + value);
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Ungültiges UTC-Datum: ' + value);
  }
}

function scaleOf(value) {
  return (value.split('.')[1] || '').length;
}

function toScaled(value, scale) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(scale, '0'));
}

function formatScaled(value, scale) {
  if (scale === 0) return value.toString();
  const divisor = 10n ** BigInt(scale);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(scale, '0').replace(/0+$/, '');
  return fraction ? whole.toString() + '.' + fraction : whole.toString();
}

function formatUsdCents(total, scale) {
  if (scale > 2) {
    const divisor = 10n ** BigInt(scale - 2);
    total = (total + divisor / 2n) / divisor;
  } else if (scale < 2) {
    total *= 10n ** BigInt(2 - scale);
  }
  return (total / 100n).toString() + '.' + (total % 100n).toString().padStart(2, '0');
}

function main() {
  for (const filename of [rawPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(filename));
  }
  for (const filename of [candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error('Zieldatei existiert bereits und wird nicht überschrieben: ' + path.basename(filename));
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!catalog.metrics.some((metric) => metric.id === metricId)) throw new Error('Kennzahl fehlt im Katalog: ' + metricId);

  const rawBuffer = fs.readFileSync(rawPath);
  const lines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== rawHeader || lines.length !== 1026) throw new Error('BTC-Optionssnapshot hat unerwarteten Header oder falsche Zeilenzahl.');

  const instruments = new Set();
  const expiries = new Set();
  const types = { call: 0, put: 0 };
  const parsed = [];
  let oiScale = 0;
  let underlyingScale = 0;
  let zeroOiRows = 0;
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 10) throw new Error('Ungültige BTC-Optionszeile ' + (index + 2) + '.');
    const [date, currency, instrument, expiry, strike, type, openInterest, markIv, underlyingUsd, source] = cells;
    validDate(date);
    if (date !== '2026-08-30' || currency !== 'BTC' || !instrument.startsWith('BTC-')
        || source !== 'bykaranteli.com' || !/^\d{1,2}[A-Z]{3}\d{2}$/.test(expiry)
        || !/^(?:0|[1-9]\d*)$/.test(strike) || !['call', 'put'].includes(type)) {
      throw new Error('Die Rohdatei enthält eine andere Asset-/Quellenzeile oder unerwartete Kontraktdaten: ' + (index + 2));
    }
    for (const value of [openInterest, markIv, underlyingUsd]) {
      if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error('Ungültiger numerischer Optionswert in Zeile ' + (index + 2));
    }
    if (Number(underlyingUsd) <= 0) throw new Error('BTC-Optionszeile ohne positiven USD-Basiswert: ' + instrument);
    if (instruments.has(instrument)) throw new Error('Doppeltes BTC-Optionsinstrument: ' + instrument);
    instruments.add(instrument);
    expiries.add(expiry);
    types[type]++;
    oiScale = Math.max(oiScale, scaleOf(openInterest));
    underlyingScale = Math.max(underlyingScale, scaleOf(underlyingUsd));
    if (Number(openInterest) === 0) zeroOiRows++;
    parsed.push({ line, openInterest, underlyingUsd });
  }

  const productScale = oiScale + underlyingScale;
  let totalNotionalScaled = 0n;
  let totalOiScaled = 0n;
  for (const row of parsed) {
    const oi = toScaled(row.openInterest, oiScale);
    const underlying = toScaled(row.underlyingUsd, underlyingScale);
    totalOiScaled += oi;
    totalNotionalScaled += oi * underlying;
  }
  const totalOiBtc = formatScaled(totalOiScaled, oiScale);
  const value = formatUsdCents(totalNotionalScaled, productScale);
  const rawRowsHash = sha256(sourceUrl + '\x1f' + formula + '\x1f' + lines.join('\n'));
  const candidateRow = [
    metricId, 'main', '2026-08-30', value, sourceSlug, '', 'provisional',
    'bykaranteli-deribit-btc-options-oi-cc0-2026-09-30:2026-08-30', rawRowsHash,
  ].join(',');
  const candidateBuffer = Buffer.from(importHeader + '\n' + candidateRow + '\n', 'utf8');
  const candidateManifest = {
    createdAt: new Date().toISOString(),
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      repository: 'https://github.com/bykarantelicom/crypto-datasets',
      file: 'data/options-oi-daily.csv',
      license: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-30',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'The source CSV labels upstream data bykaranteli.com; the repository README describes the chain as Deribit BTC and ETH options open interest.',
    },
    rawBitcoinOnlySnapshot: {
      path: path.basename(rawPath),
      bytes: rawBuffer.length,
      sha256: sha256(rawBuffer),
      rows: parsed.length,
      currency: 'BTC',
      instruments: instruments.size,
      expiries: expiries.size,
      optionTypes: types,
      zeroOpenInterestInstruments: zeroOiRows,
      date: '2026-08-30',
      fieldsWritten: ['date', 'currency', 'instrument', 'expiry', 'strike', 'type', 'open_interest', 'mark_iv', 'underlying_usd', 'source'],
      otherCurrenciesWritten: 0,
    },
    observations: 1,
    metricIds: [metricId],
    metricCounts: { [metricId]: 1 },
    sourceCounts: { [sourceSlug]: 1 },
    firstObservationDate: '2026-08-30',
    lastObservationDate: '2026-08-30',
    nativeCalendar: 'Single daily snapshot dated 2026-08-30; no prior dates or gaps were filled.',
    mapping: {
      [metricId]: formula,
    },
    method: {
      openInterestUnit: 'BTC per instrument, as specified for options by Deribit public API documentation.',
      usdConversion: 'Multiply each instrument open_interest value by that row underlying_usd price, sum BTC instruments, and round the total to cents.',
      coverage: 'Deribit BTC options only; not total options open interest across all exchanges.',
    },
    candidate: {
      path: path.basename(candidatePath),
      bytes: candidateBuffer.length,
      sha256: sha256(candidateBuffer),
    },
    dataReuseLicenseConfirmedFromRepository: true,
    sourceValuesProvisional: true,
    uploaded: false,
    mergedIntoMaster: false,
  };
  fs.writeFileSync(candidatePath, candidateBuffer, { flag: 'wx' });
  fs.writeFileSync(manifestPath, JSON.stringify(candidateManifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({
    observations: 1,
    metricId,
    date: '2026-08-30',
    valueUsd: value,
    btcOptionsInstruments: parsed.length,
    expiries: expiries.size,
    zeroOiRows,
    uploaded: false,
  }, null, 2));
}

main();

