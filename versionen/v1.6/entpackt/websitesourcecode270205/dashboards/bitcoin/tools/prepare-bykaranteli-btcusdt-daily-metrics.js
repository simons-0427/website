const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const inputPath = path.join(varDir, 'bykaranteli-daily-symbols-cc0.csv');
const rawPath = path.join(varDir, 'bykaranteli-btcusdt-daily-symbols-research-through-2026-09-10.csv');
const candidatePath = path.join(varDir, 'bykaranteli-btcusdt-daily-metrics-import-through-2026-09-10.csv');
const manifestPath = path.join(varDir, 'bykaranteli-btcusdt-daily-metrics-import-through-2026-09-10.json');
const sourceUrl = 'https://github.com/bykarantelicom/crypto-datasets/blob/66d8542392067be14e2eb8ca962ffbdafcbc51ef/data/daily-symbols.csv';
const sourceSlug = 'bykaranteli_btcusdt_daily_symbols_cc0';
const inputSha256 = 'e274ee6d18642067149ca66346469d8649e108884f0d39f784ac0637a889e01e';
const sourceCommit = '66d8542392067be14e2eb8ca962ffbdafcbc51ef';
const sourceCommitDate = '2026-09-10';
const sourceHeader = 'date,symbol,funding_rate_pct,oi_24h_pct,price_change_24h_pct,source';
const rawHeader = 'date,symbol,funding_rate_pct,oi_24h_pct,source';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expectedFirst = '2026-07-23';
const expectedLast = '2026-09-10';
const expectedGapDates = ['2026-07-26'];
const metrics = [
  { id: 'binance_perpetual_funding_rate_pct', field: 'funding_rate_pct', repeatedCount: 2 },
  { id: 'perpetual_open_interest_change_24h_pct', field: 'oi_24h_pct', repeatedCount: 11 },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges UTC-Datum: ' + value);
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Ungültiges UTC-Datum: ' + value);
  }
}

function main() {
  if (!fs.existsSync(inputPath)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(inputPath));
  for (const file of [rawPath, candidatePath, manifestPath]) {
    if (fs.existsSync(file)) throw new Error('Zieldatei existiert bereits und wird nicht überschrieben: ' + path.basename(file));
  }

  const input = fs.readFileSync(inputPath);
  if (sha256(input) !== inputSha256) throw new Error('Die eingefrorene ByKaranteli-Quelldatei stimmt nicht mit dem geprüften Snapshot überein.');
  const lines = input.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== sourceHeader) throw new Error('Unerwarteter Header in daily-symbols.csv.');

  const selected = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 6) throw new Error('Unerwartete Spaltenzahl in Quellenzeile ' + (index + 2) + '.');
    if (cells[1] !== 'BTCUSDT') continue;
    const [date, symbol, funding, oiChange, , source] = cells;
    validDate(date);
    if (symbol !== 'BTCUSDT' || source !== 'bykaranteli.com') throw new Error('Nicht-BTCUSDT- oder Fremdquellenzeile erkannt.');
    for (const [field, value] of [['funding_rate_pct', funding], ['oi_24h_pct', oiChange]]) {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
        throw new Error('Ungültiger Dezimalwert für ' + field + ' am ' + date + '.');
      }
    }
    if (Number(oiChange) < -100) throw new Error('24h-OI-Änderung liegt unter -100 Prozent am ' + date + '.');
    selected.push({ date, funding, oiChange, source, line: [date, symbol, funding, oiChange, source].join(',') });
  }

  if (selected.length !== 49 || selected[0].date !== expectedFirst || selected.at(-1).date !== expectedLast) {
    throw new Error('BTCUSDT-Tagesabdeckung stimmt nicht mit dem geprüften Snapshot überein.');
  }
  const seenDates = new Set();
  for (const row of selected) {
    if (seenDates.has(row.date)) throw new Error('Doppelter BTCUSDT-Tageswert: ' + row.date);
    seenDates.add(row.date);
  }
  const allDates = [];
  for (let epoch = Date.parse(expectedFirst + 'T00:00:00Z'); epoch <= Date.parse(expectedLast + 'T00:00:00Z'); epoch += 86400000) {
    allDates.push(new Date(epoch).toISOString().slice(0, 10));
  }
  const missingDates = allDates.filter((date) => !seenDates.has(date));
  if (JSON.stringify(missingDates) !== JSON.stringify(expectedGapDates)) {
    throw new Error('Die fehlenden UTC-Tage weichen vom geprüften Quellenstand ab.');
  }

  const rawBuffer = Buffer.from(rawHeader + '\n' + selected.map((row) => row.line).join('\n') + '\n', 'utf8');
  const importRows = [];
  const stats = {};
  for (const metric of metrics) {
    const values = selected.map((row) => Number(metric.field === 'funding_rate_pct' ? row.funding : row.oiChange));
    let repeated = 0;
    for (let index = 1; index < values.length; index++) if (values[index] === values[index - 1]) repeated++;
    if (repeated !== metric.repeatedCount) throw new Error('Die Wiederholungszahl für ' + metric.id + ' hat sich geändert.');
    stats[metric.id] = {
      rows: selected.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      adjacentRepeatedValuePairs: repeated,
      adjacentPairsChecked: values.length - 1,
    };
    for (const row of selected) {
      const value = metric.field === 'funding_rate_pct' ? row.funding : row.oiChange;
      const payloadHash = sha256(sourceUrl + '\x1f' + metric.field + '\x1f' + row.line);
      importRows.push([
        metric.id,
        'main',
        row.date,
        value,
        sourceSlug,
        '',
        'provisional',
        'bykaranteli-daily-symbols-btcusdt-cc0-' + sourceCommit.slice(0, 7) + ':' + metric.field + ':' + row.date,
        payloadHash,
      ].join(','));
    }
  }

  const candidateBuffer = Buffer.from(importHeader + '\n' + importRows.join('\n') + '\n', 'utf8');
  const rawMetadata = {
    path: path.basename(rawPath),
    bytes: rawBuffer.length,
    sha256: sha256(rawBuffer),
    rows: selected.length,
    symbol: 'BTCUSDT',
    firstDate: expectedFirst,
    lastDate: expectedLast,
    missingDates,
    fieldsWritten: ['date', 'symbol', 'funding_rate_pct', 'oi_24h_pct', 'source'],
    nonBitcoinRowsWritten: 0,
  };
  const manifest = {
    createdAt: new Date().toISOString(),
    dashboard: 'bitcoin',
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      file: 'data/daily-symbols.csv',
      commit: sourceCommit,
      commitDate: sourceCommitDate,
      license: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-30',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'ByKaranteli Crypto Datasets, BTCUSDT rows only.',
    },
    sourceSnapshot: {
      inputFile: path.basename(inputPath),
      inputBytes: input.length,
      inputSha256: inputSha256,
      selectedRows: selected.length,
      selectedSymbol: 'BTCUSDT',
      otherSymbolsWritten: 0,
    },
    rawBitcoinOnlySnapshot: rawMetadata,
    observations: importRows.length,
    metricIds: metrics.map((metric) => metric.id),
    metricCounts: Object.fromEntries(metrics.map((metric) => [metric.id, selected.length])),
    metricQuality: stats,
    firstObservationDate: expectedFirst,
    lastObservationDate: expectedLast,
    missingDates,
    method: {
      binance_perpetual_funding_rate_pct: 'Use daily_symbols.csv funding_rate_pct unchanged for BTCUSDT; retain the source percentage unit, with no interval normalization or interpolation.',
      perpetual_open_interest_change_24h_pct: 'Use daily_symbols.csv oi_24h_pct unchanged for BTCUSDT; retain the provider-reported 24-hour percentage change, with no interpolation.',
    },
    sourceFreshness: 'The pinned source file commit is dated 2026-09-10 and no newer update was visible in the repository at review time 2026-09-30.',
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

  fs.writeFileSync(rawPath, rawBuffer, { flag: 'wx' });
  fs.writeFileSync(candidatePath, candidateBuffer, { flag: 'wx' });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({
    observations: importRows.length,
    metricIds: manifest.metricIds,
    rowsPerMetric: selected.length,
    dateRange: [expectedFirst, expectedLast],
    missingDates,
    metricQuality: stats,
    nonBitcoinRowsWritten: 0,
    uploaded: false,
  }, null, 2));
}

main();
