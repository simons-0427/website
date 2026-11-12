const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const summaryPath = path.join(varDir, 'bykaranteli-btc-options-oi-history-source-summaries-through-2026-09-10.csv');
const existingRawPath = path.join(varDir, 'bykaranteli-btc-options-oi-research-through-2026-08-30.csv');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-btc-options-oi-history-import-through-2026-09-10.csv');
const manifestPath = path.join(varDir, 'bykaranteli-btc-options-oi-history-import-through-2026-09-10.json');
const sourceSlug = 'bykaranteli_btc_options_oi_cc0';
const metricId = 'options_open_interest_usd';
const formula = 'sum(open_interest_btc_per_instrument * underlying_usd_per_instrument) over all reported BTC option instruments on the snapshot date, rounded to cents';
const summaryHeader = 'observation_date,source_commit,schema_columns,btc_rows,unique_btc_instruments,expiry_count,call_instruments,put_instruments,zero_oi_instruments,open_interest_btc,options_open_interest_usd,btc_rows_sha256';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const rawHeader = 'date,currency,instrument,expiry,strike,type,open_interest,mark_iv,underlying_usd,source';
const summaryFile = path.basename(summaryPath);
const sourceCommitBase = 'https://github.com/bykarantelicom/crypto-datasets/blob/';

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filename) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges UTC-Datum: ' + value);
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Ungültiges UTC-Datum: ' + value);
  }
}

function nextDay(value) {
  return new Date(Date.parse(value + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}

function parseCsvRows(buffer, expectedHeader, label) {
  const lines = buffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== expectedHeader) throw new Error(label + ' hat einen unerwarteten CSV-Header.');
  return lines.map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== expectedHeader.split(',').length) {
      throw new Error(label + ' hat eine ungültige Zeile ' + (index + 2) + '.');
    }
    return cells;
  });
}

function assertDecimal(value, label) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error('Ungültiger Dezimalwert für ' + label + ': ' + value);
  }
}

async function readExistingOiRows(filename) {
  const result = [];
  const reader = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let header = null;
  let index = null;
  for await (const line of reader) {
    if (!header) {
      header = line.replace(/^\uFEFF/, '');
      const cells = header.split(',');
      if (cells.length !== 9 || cells[0] !== 'metric_id' || cells[2] !== 'observation_date') {
        throw new Error('Der aktive Beobachtungsmaster hat einen unerwarteten Header.');
      }
      index = Object.fromEntries(cells.map((name, i) => [name, i]));
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Ungültige Zeile im aktiven Beobachtungsmaster.');
    if (cells[index.metric_id] === metricId) result.push(cells);
  }
  if (!header) throw new Error('Der aktive Beobachtungsmaster ist leer.');
  return result;
}

async function main() {
  for (const filename of [summaryPath, existingRawPath, masterPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(filename));
  }
  for (const filename of [candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error('Zieldatei existiert bereits und wird nicht überschrieben: ' + path.basename(filename));
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!catalog.metrics.some((metric) => metric.id === metricId)) {
    throw new Error('Kennzahl fehlt im Bitcoin-Katalog: ' + metricId);
  }

  const summaryBuffer = fs.readFileSync(summaryPath);
  const summaryRows = parseCsvRows(summaryBuffer, summaryHeader, 'BTC-only OI-Historienzusammenfassung');
  if (summaryRows.length !== 36) throw new Error('Es werden genau 36 tägliche BTC-Snapshots erwartet.');

  const records = summaryRows.map((cells, index) => {
    const [date, commit, schemaColumns, btcRows, uniqueInstruments, expiryCount, calls, puts,
      zeroOi, openInterestBtc, valueUsd, btcRowsSha256] = cells;
    validDate(date);
    if (date !== (index === 0 ? '2026-08-06' : nextDay(summaryRows[index - 1][0]))) {
      throw new Error('Die archivierte BTC-OI-Historie enthält eine Lücke oder falsche Sortierung bei ' + date + '.');
    }
    if (!/^[0-9a-f]{40}$/.test(commit) || ![9, 10].includes(Number(schemaColumns))) {
      throw new Error('Unerwartete gepinnte Quellrevision oder Quellspaltenzahl bei ' + date + '.');
    }
    for (const [value, label] of [
      [btcRows, 'BTC-Zeilen'], [uniqueInstruments, 'eindeutige BTC-Instrumente'],
      [expiryCount, 'Verfallstermine'], [calls, 'Calls'], [puts, 'Puts'], [zeroOi, 'Null-OI-Instrumente'],
    ]) {
      if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new Error('Ungültiger Zählwert für ' + label + ' am ' + date + '.');
    }
    assertDecimal(openInterestBtc, 'open_interest BTC am ' + date);
    assertDecimal(valueUsd, 'open_interest USD am ' + date);
    if (Number(btcRows) !== Number(uniqueInstruments) || Number(btcRows) !== Number(calls) + Number(puts)
        || Number(calls) !== Number(puts) || Number(zeroOi) > Number(btcRows)
        || Number(expiryCount) < 1 || Number(openInterestBtc) <= 0 || Number(valueUsd) <= 0
        || !/^[0-9a-f]{64}$/.test(btcRowsSha256)) {
      throw new Error('BTC-OI-Zeilenprüfung fehlgeschlagen am ' + date + '.');
    }
    return {
      date, commit, schemaColumns: Number(schemaColumns), btcRows: Number(btcRows),
      uniqueInstruments: Number(uniqueInstruments), expiryCount: Number(expiryCount),
      calls: Number(calls), puts: Number(puts), zeroOi: Number(zeroOi),
      openInterestBtc, valueUsd, btcRowsSha256,
    };
  });
  if (records[records.length - 1].date !== '2026-09-10') {
    throw new Error('Die letzte archivierte BTC-OI-Beobachtung weicht vom erwarteten 2026-09-10 ab.');
  }

  const sourceSnapshotBuffer = fs.readFileSync(existingRawPath);
  const sourceLines = sourceSnapshotBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (sourceLines.shift() !== rawHeader || sourceLines.length !== 1026) {
    throw new Error('Der lokal gespeicherte BTC-Snapshot vom 30.08.2026 hat eine unerwartete Form.');
  }
  for (const line of sourceLines) {
    const cells = line.split(',');
    if (cells.length !== 10 || cells[0] !== '2026-08-30' || cells[1] !== 'BTC'
        || !cells[2].startsWith('BTC-') || cells[9] !== 'bykaranteli.com') {
      throw new Error('Der gespeicherte 30.-August-Snapshot enthält eine Fremd- oder ungültige Zeile.');
    }
  }
  const august30 = records.find((record) => record.date === '2026-08-30');
  if (!august30
      || sha256Buffer(Buffer.from(sourceLines.join('\n'), 'utf8')) !== august30.btcRowsSha256
      || sourceLines.length !== august30.btcRows
      || august30.valueUsd !== '31159286071.55'
      || august30.openInterestBtc !== '394737.3') {
    throw new Error('Der vorhandene BTC-Snapshot vom 30.08.2026 stimmt nicht mit dem gepinnten Commit überein.');
  }

  const existingOiRows = await readExistingOiRows(masterPath);
  if (existingOiRows.length !== 1 || existingOiRows[0][2] !== '2026-08-30'
      || existingOiRows[0][3] !== august30.valueUsd || existingOiRows[0][4] !== sourceSlug) {
    throw new Error('Der aktive Master enthält nicht genau die bereits geprüfte 30.-August-OI-Beobachtung.');
  }

  const importRows = records.filter((record) => record.date !== '2026-08-30').map((record) => [
    metricId,
    'main',
    record.date,
    record.valueUsd,
    sourceSlug,
    '',
    'provisional',
    'bykaranteli-deribit-btc-options-oi-cc0-' + record.commit + ':' + record.date,
    record.btcRowsSha256,
  ].join(','));
  if (importRows.length !== 35) throw new Error('Es wurden nicht genau 35 neue BTC-OI-Beobachtungen erzeugt.');

  const candidateBuffer = Buffer.from(importHeader + '\n' + importRows.join('\n') + '\n', 'utf8');
  const summarySha256 = sha256Buffer(summaryBuffer);
  const candidateSha256 = sha256Buffer(candidateBuffer);
  const usdValues = records.map((record) => Number(record.valueUsd));
  const candidateManifest = {
    createdAt: new Date().toISOString(),
    source: {
      slug: sourceSlug,
      repository: 'https://github.com/bykarantelicom/crypto-datasets',
      file: 'data/options-oi-daily.csv',
      historyUrl: 'https://github.com/bykarantelicom/crypto-datasets/commits/main/data/options-oi-daily.csv',
      license: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-30',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'ByKaranteli Crypto Datasets, pinned daily Git revisions. BTC rows only.',
    },
    metricId,
    formula,
    unitBasis: 'Deribit documents options open_interest in the underlying base-currency coin. BTC open interest per instrument is multiplied by that row underlying_usd price; no extra contract-size factor is applied.',
    scope: {
      currency: 'BTC',
      exchangeCoverage: 'Deribit only; not total BTC options open interest across exchanges.',
      snapshotGrain: 'One source-dated daily BTC options-chain snapshot.',
      snapshotCount: records.length,
      firstDate: records[0].date,
      lastDate: records[records.length - 1].date,
      calendarIsContinuous: true,
      existingMasterOverlap: ['2026-08-30'],
      newObservations: importRows.length,
      nonBitcoinRowsWritten: 0,
      ethRowsWritten: 0,
      rawInstrumentSnapshotsStored: false,
      historicalEvidenceStored: 'Pinned source commit, BTC-only raw-row SHA-256, row counts and aggregate values per date.',
      schemaColumnsByPeriod: { 9: 15, 10: 21 },
    },
    quality: {
      sourceDatesMatchPinnedDailyCommitDates: true,
      uniqueInstrumentsMatchBtcRowCount: true,
      callAndPutRowsBalanced: true,
      everyBtcRowHasPositiveUnderlyingUsd: true,
      roundedToCentsAfterExactDecimalAggregation: true,
      existing2026_08_30SnapshotMatchesPinnedCommit: true,
      btcInstrumentCount: {
        min: Math.min(...records.map((record) => record.btcRows)),
        max: Math.max(...records.map((record) => record.btcRows)),
      },
      btcOpenInterestUsd: {
        min: Math.min(...usdValues),
        max: Math.max(...usdValues),
      },
    },
    sourceSnapshots: records.map((record) => ({
      date: record.date,
      commit: record.commit,
      url: sourceCommitBase + record.commit + '/data/options-oi-daily.csv',
      btcRows: record.btcRows,
      uniqueInstruments: record.uniqueInstruments,
      expiries: record.expiryCount,
      callInstruments: record.calls,
      putInstruments: record.puts,
      zeroOiInstruments: record.zeroOi,
      openInterestBtc: record.openInterestBtc,
      optionsOpenInterestUsd: record.valueUsd,
      btcRowsSha256: record.btcRowsSha256,
    })),
    sourceSummary: {
      path: path.basename(summaryPath),
      bytes: summaryBuffer.length,
      sha256: summarySha256,
      rows: records.length,
      btcCurrencyRowsOnly: true,
    },
    existing2026_08_30Snapshot: {
      path: path.basename(existingRawPath),
      sha256: sha256Buffer(sourceSnapshotBuffer),
      btcRows: sourceLines.length,
      valueUsd: august30.valueUsd,
      sourceRevision: august30.commit,
    },
    observations: importRows.length,
    metricIds: [metricId],
    metricCounts: { [metricId]: importRows.length },
    sourceCounts: { [sourceSlug]: importRows.length },
    firstObservationDate: importRows[0].split(',')[2],
    lastObservationDate: importRows[importRows.length - 1].split(',')[2],
    nativeCalendar: '35 new calendar days in the continuous 2026-08-06 through 2026-09-10 snapshot history; 2026-08-30 already exists in the master.',
    candidate: {
      path: path.basename(candidatePath),
      bytes: candidateBuffer.length,
      sha256: candidateSha256,
    },
    sourceValuesProvisional: true,
    uploaded: false,
    mergedIntoMaster: false,
  };

  fs.writeFileSync(candidatePath, candidateBuffer, { flag: 'wx' });
  fs.writeFileSync(manifestPath, JSON.stringify(candidateManifest, null, 2) + '\n', { flag: 'wx' });

  console.log(JSON.stringify({
    addedCandidates: importRows.length,
    metricId,
    firstDate: candidateManifest.firstObservationDate,
    lastDate: candidateManifest.lastObservationDate,
    continuousSourceHistory: records.length,
    valueUsdMin: candidateManifest.quality.btcOpenInterestUsd.min,
    valueUsdMax: candidateManifest.quality.btcOpenInterestUsd.max,
    candidateBytes: candidateBuffer.length,
    candidateSha256,
    summarySha256,
    august30ValueMatchesExistingMaster: true,
    nonBitcoinRowsWritten: 0,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
