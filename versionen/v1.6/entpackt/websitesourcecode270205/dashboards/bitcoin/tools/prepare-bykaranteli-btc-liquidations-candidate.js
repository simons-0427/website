const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const rawPath = path.join(varDir, 'bykaranteli-btc-liquidations-btcusdt-research-through-2026-09-09.csv');
const candidatePath = path.join(varDir, 'bykaranteli-btc-liquidations-import-through-2026-09-09.csv');
const manifestPath = path.join(varDir, 'bykaranteli-btc-liquidations-import-through-2026-09-09.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const sourceUrl = 'https://raw.githubusercontent.com/bykarantelicom/crypto-datasets/main/data/liquidations-daily.csv';
const sourceSlug = 'bykaranteli_btc_liquidations_cc0';
const rawHeader = 'date,symbol,exchange,long_liquidations_usd,short_liquidations_usd,events,max_single_liquidation_usd,source';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const metricIds = ['liquidations_usd', 'liquidations_long_usd', 'liquidations_short_usd'];

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

function decimalScale(value) {
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

function main() {
  for (const filename of [rawPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(filename));
  }
  for (const filename of [candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error('Zieldatei existiert bereits und wird nicht überschrieben: ' + path.basename(filename));
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const metricId of metricIds) {
    if (!catalog.metrics.some((metric) => metric.id === metricId)) throw new Error('Kennzahl fehlt im Katalog: ' + metricId);
  }

  const rawBuffer = fs.readFileSync(rawPath);
  const lines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== rawHeader || lines.length !== 210) throw new Error('BTCUSDT-Rohsnapshot hat unerwarteten Header oder falsche Zeilenzahl.');
  const seen = new Set();
  const byDate = new Map();
  const parsed = [];
  let scale = 0;
  const exchanges = new Set();

  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 8) throw new Error('Ungültige BTCUSDT-Rohzeile ' + (index + 2) + '.');
    const [date, symbol, exchange, longValue, shortValue, events, maximum, source] = cells;
    validDate(date);
    if (symbol !== 'BTCUSDT' || !exchange || source !== 'bykaranteli.com') {
      throw new Error('Die Rohdatei enthält eine andere Asset-/Quellenzeile: ' + (index + 2));
    }
    for (const value of [longValue, shortValue, events, maximum]) {
      if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error('Ungültiger numerischer BTCUSDT-Wert in Zeile ' + (index + 2));
    }
    if (!/^(?:0|[1-9]\d*)$/.test(events)) throw new Error('Liquidationsereignisse müssen ganzzahlig sein in Zeile ' + (index + 2));
    const previousScale = scale;
    scale = Math.max(scale, decimalScale(longValue), decimalScale(shortValue));
    if (scale > previousScale) {
      const factor = 10n ** BigInt(scale - previousScale);
      for (const daily of byDate.values()) {
        daily.long *= factor;
        daily.short *= factor;
      }
    }
    const key = date + '\x1f' + exchange;
    if (seen.has(key)) throw new Error('Doppelte BTCUSDT-Börsenzeile: ' + date + ' / ' + exchange);
    seen.add(key);
    exchanges.add(exchange);
    parsed.push({ date, exchange, longValue, shortValue, line });
    const daily = byDate.get(date) || { long: 0n, short: 0n, venues: new Set(), rows: [] };
    daily.long += toScaled(longValue, scale);
    daily.short += toScaled(shortValue, scale);
    daily.venues.add(exchange);
    daily.rows.push(line);
    byDate.set(date, daily);
  }

  const dates = [...byDate.keys()].sort();
  const firstDate = '2026-07-30';
  const lastDate = '2026-09-09';
  const expectedDays = (Date.parse(lastDate + 'T00:00:00Z') - Date.parse(firstDate + 'T00:00:00Z')) / 86400000 + 1;
  if (dates.length !== expectedDays || dates[0] !== firstDate || dates.at(-1) !== lastDate) {
    throw new Error('BTCUSDT-Zeitraum stimmt nicht mit der vollständigen gefundenen täglichen Abdeckung überein.');
  }
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] !== new Date(Date.parse(firstDate + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10)) {
      throw new Error('Fehlender UTC-Tag in BTCUSDT-Liquidationsdaten vor ' + dates[i]);
    }
    const daily = byDate.get(dates[i]);
    if (daily.venues.size < 2 || daily.venues.size > 9) throw new Error('Unerwartete Venueabdeckung am ' + dates[i]);
    daily.rows.sort();
  }

  const output = [];
  for (const date of dates) {
    const daily = byDate.get(date);
    const values = [
      ['liquidations_usd', daily.long + daily.short],
      ['liquidations_long_usd', daily.long],
      ['liquidations_short_usd', daily.short],
    ];
    for (const [metricId, scaledValue] of values) {
      const value = formatScaled(scaledValue, scale);
      const inputHash = sha256(sourceUrl + '\x1f' + metricId + '\x1f' + date + '\x1f' + daily.rows.join('\n'));
      output.push([
        metricId, 'main', date, value, sourceSlug, '', 'provisional',
        'bykaranteli-btcusdt-liquidations-cc0-2026-09-29:' + date, inputHash,
      ].join(','));
    }
  }

  const candidateBuffer = Buffer.from(importHeader + '\n' + output.join('\n') + '\n', 'utf8');
  const metricCounts = Object.fromEntries(metricIds.map((id) => [id, dates.length]));
  const candidateManifest = {
    createdAt: new Date().toISOString(),
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      repository: 'https://github.com/bykarantelicom/crypto-datasets',
      file: 'data/liquidations-daily.csv',
      license: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-29',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'The source CSV labels the upstream source as bykaranteli.com.',
    },
    rawBitcoinOnlySnapshot: {
      path: path.basename(rawPath),
      bytes: rawBuffer.length,
      sha256: sha256(rawBuffer),
      rows: parsed.length,
      symbols: ['BTCUSDT'],
      exchanges: [...exchanges].sort(),
      firstDate,
      lastDate,
      venueCountsByDate: Object.fromEntries(dates.map((date) => [date, byDate.get(date).venues.size])),
      fieldsWritten: ['date', 'symbol', 'exchange', 'long_liquidations_usd', 'short_liquidations_usd', 'events', 'max_single_liquidation_usd', 'source'],
      nonBitcoinRowsWritten: 0,
    },
    observations: output.length,
    metricIds,
    metricCounts,
    sourceCounts: { [sourceSlug]: output.length },
    firstObservationDate: firstDate,
    lastObservationDate: lastDate,
    nativeCalendar: 'Reported daily UTC totals; all 42 UTC calendar dates from 2026-07-30 through 2026-09-09 are present. No dates were interpolated.',
    mapping: {
      liquidations_usd: 'sum(long_liquidations_usd + short_liquidations_usd) for symbol BTCUSDT across the exchange rows available for each date',
      liquidations_long_usd: 'sum(long_liquidations_usd) for symbol BTCUSDT across the exchange rows available for each date',
      liquidations_short_usd: 'sum(short_liquidations_usd) for symbol BTCUSDT across the exchange rows available for each date',
    },
    coverageNote: 'Only the public BTCUSDT exchange rows present in the source were aggregated. Venue coverage varies by date. The source describes its recorded events as a floor, so these sums are a partial lower-bound sample, not total Bitcoin market liquidations.',
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
    observations: output.length,
    metricCounts,
    dateRange: [firstDate, lastDate],
    rawRows: parsed.length,
    venues: [...exchanges].sort(),
    uploaded: false,
  }, null, 2));
}

main();
