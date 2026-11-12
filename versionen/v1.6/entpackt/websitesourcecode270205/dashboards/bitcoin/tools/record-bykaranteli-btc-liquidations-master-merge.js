const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-btc-liquidations-import-through-2026-09-09.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-btc-liquidations-import-through-2026-09-09.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-btc-liquidations-2026-09-30.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-btc-liquidations-2026-09-30.json');
const nextMasterPath = masterPath + '.bykaranteli-btc-liquidations.next';
const nextManifestPath = manifestPath + '.bykaranteli-btc-liquidations.next';
const nextCandidateManifestPath = candidateManifestPath + '.next';
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const metricIds = ['liquidations_usd', 'liquidations_long_usd', 'liquidations_short_usd'];
const sourceSlug = 'bykaranteli_btc_liquidations_cc0';
const expected = {
  rows: 738478,
  metricIdsWithObservations: 149,
  bytes: 147836909,
  sha256: '8fe23a0dfc7e04a77cb599925ae760afd7892e749a29a7e302b0e0597d266867',
  coreWithData: 91,
  emptyBitcoinMetrics: 35,
  emptyCoreMetrics: 9,
};

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function emptyBitcoinMetricIds(catalog, observed) {
  const excludedCrossMarketIds = new Set([
    'btc_gold_ratio', 'btc_sp500_corr_90d', 'btc_gold_corr_90d',
    'btc_sp500_corr_1y', 'btc_gold_corr_1y', 'btc_sp500_relative_return_1y_pct',
    'btc_real_price_usd',
  ]);
  return catalog.metrics.filter((metric) => metric.category !== 'macro' && !observed.has(metric.id)
    && !excludedCrossMarketIds.has(metric.id)).map((metric) => metric.id);
}

function scaled(value, scale) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(scale, '0'));
}

async function summarizeMaster(filename, catalog, candidateKeys = new Set()) {
  const metricIdsSeen = new Set();
  const sources = {};
  const keys = new Set();
  const matchedCandidateKeys = new Set();
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  const reader = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let isHeader = true;
  for await (const line of reader) {
    if (isHeader) {
      if (line.replace(/^\uFEFF/, '') !== header) throw new Error('Der aktive Master hat einen unerwarteten CSV-Header.');
      isHeader = false;
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Ungültige Masterzeile ' + (rows + 2) + '.');
    rows++;
    metricIdsSeen.add(cells[0]);
    sources[cells[4]] = (sources[cells[4]] || 0) + 1;
    if (!firstDate || cells[2] < firstDate) firstDate = cells[2];
    if (!lastDate || cells[2] > lastDate) lastDate = cells[2];
    if (cells[2] > '2026-09-28') rowsAfterCutoff++;
    const key = cells[0] + '\x1f' + cells[1] + '\x1f' + cells[2];
    if (keys.has(key)) throw new Error('Doppelter Master-Schlüssel: ' + key);
    keys.add(key);
    if (candidateKeys.has(key)) matchedCandidateKeys.add(key);
  }
  if (isHeader) throw new Error('Der Master ist leer.');
  const coreMetricIds = new Set(catalog.coreMetricIds);
  const coreWithData = [...coreMetricIds].filter((id) => metricIdsSeen.has(id)).length;
  const emptyBitcoin = emptyBitcoinMetricIds(catalog, metricIdsSeen);
  return {
    rows, metricIdsSeen, sources, firstDate, lastDate, rowsAfterCutoff, coreWithData,
    emptyBitcoin, matchedCandidateKeys,
  };
}

async function main() {
  for (const filename of [masterPath, manifestPath, catalogPath, candidatePath, candidateManifestPath]) {
    if (!fs.existsSync(filename)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(filename));
  }
  for (const filename of [backupPath, manifestBackupPath, nextMasterPath, nextManifestPath, nextCandidateManifestPath]) {
    if (fs.existsSync(filename)) throw new Error('Zieldatei existiert bereits; es wird nichts überschrieben: ' + path.basename(filename));
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const masterBytes = fs.statSync(masterPath).size;
  const masterSha256 = await sha256File(masterPath);
  if (manifest.observations !== expected.rows
      || manifest.metricIdsWithObservations !== expected.metricIdsWithObservations
      || manifest.coreMetricIdsWithObservations !== expected.coreWithData
      || manifest.cutoffInclusive !== '2026-09-28'
      || masterBytes !== expected.bytes || masterSha256 !== expected.sha256
      || manifest.masterBytes !== expected.bytes || manifest.masterSha256 !== expected.sha256) {
    throw new Error('Der Master weicht vom erwarteten Stand vor dem BTCUSDT-Liquidationsimport ab.');
  }
  if (manifest.scope.remainingEmptyBitcoinMetricIds !== expected.emptyBitcoinMetrics
      || manifest.scope.remainingEmptyCoreMetricIds !== expected.emptyCoreMetrics) {
    throw new Error('Die Kennzahlenabdeckung stimmt nicht mit dem erwarteten Vorimportstand überein.');
  }
  if (candidateManifest.observations !== 126
      || candidateManifest.rawBitcoinOnlySnapshot.rows !== 210
      || candidateManifest.rawBitcoinOnlySnapshot.symbols.length !== 1
      || candidateManifest.rawBitcoinOnlySnapshot.symbols[0] !== 'BTCUSDT'
      || candidateManifest.rawBitcoinOnlySnapshot.nonBitcoinRowsWritten !== 0
      || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.sourceValuesProvisional !== true
      || candidateManifest.uploaded !== false
      || candidateManifest.mergedIntoMaster !== false
      || candidateManifest.coverageNote.indexOf('lower-bound') === -1) {
    throw new Error('Der Kandidatenmanifest bestätigt die erforderliche Bitcoin-only CC0-Abdeckung nicht.');
  }

  const rawPath = path.join(varDir, candidateManifest.rawBitcoinOnlySnapshot.path);
  const rawBuffer = fs.readFileSync(rawPath);
  if (rawBuffer.length !== candidateManifest.rawBitcoinOnlySnapshot.bytes
      || sha256Buffer(rawBuffer) !== candidateManifest.rawBitcoinOnlySnapshot.sha256) {
    throw new Error('BTCUSDT-Rohdatei und Kandidatenmanifest stimmen nicht überein.');
  }
  const candidateBuffer = fs.readFileSync(candidatePath);
  if (candidateBuffer.length !== candidateManifest.candidate.bytes
      || sha256Buffer(candidateBuffer) !== candidateManifest.candidate.sha256) {
    throw new Error('Kandidaten-CSV und Kandidatenmanifest stimmen nicht überein.');
  }
  const lines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== header || lines.length !== 126) throw new Error('Kandidaten-CSV hat unerwarteten Header oder falsche Zeilenzahl.');

  const candidateRows = [];
  const candidateKeys = new Set();
  const metricCounts = Object.fromEntries(metricIds.map((id) => [id, 0]));
  const perDate = new Map();
  const exchanges = new Set(candidateManifest.rawBitcoinOnlySnapshot.exchanges);
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Ungültige Kandidatenzeile ' + (index + 2) + '.');
    const [metricId, series, date, value, source, timestamp, quality, revision, hash] = cells;
    if (!metricIds.includes(metricId) || series !== 'main'
        || !/^2026-\d\d-\d\d$/.test(date) || date < '2026-07-30' || date > '2026-09-09'
        || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
        || source !== sourceSlug || timestamp !== '' || quality !== 'provisional'
        || !revision.endsWith(':' + date) || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error('Kandidatenzeile passt nicht zur BTCUSDT-Abbildung: ' + (index + 2));
    }
    const key = metricId + '\x1f' + series + '\x1f' + date;
    if (candidateKeys.has(key)) throw new Error('Doppelter Kandidatenschlüssel: ' + key);
    candidateKeys.add(key);
    const values = perDate.get(date) || {};
    values[metricId] = value;
    perDate.set(date, values);
    metricCounts[metricId]++;
    candidateRows.push(cells);
  }
  if (Object.values(metricCounts).some((count) => count !== 42)
      || perDate.size !== 42
      || Object.keys(metricCounts).length !== metricIds.length) {
    throw new Error('Die drei Kennzahlen müssen je 42 tägliche Werte enthalten.');
  }
  const dates = [...perDate.keys()].sort();
  if (dates[0] !== '2026-07-30' || dates.at(-1) !== '2026-09-09') throw new Error('Unerwarteter BTCUSDT-Zeitraum.');
  for (const date of dates) {
    const values = perDate.get(date);
    if (Object.keys(values).length !== 3) throw new Error('Unvollständige Liquidationskennzahlen am ' + date);
    const valueStrings = Object.values(values);
    const scale = Math.max(...valueStrings.map((value) => (value.split('.')[1] || '').length));
    if (scaled(values.liquidations_long_usd, scale) + scaled(values.liquidations_short_usd, scale)
        !== scaled(values.liquidations_usd, scale)) {
      throw new Error('Long- und Short-Summen stimmen nicht mit der Gesamtsumme überein am ' + date);
    }
  }

  for (const metricId of metricIds) {
    if (!catalog.metrics.some((metric) => metric.id === metricId)) throw new Error('Kennzahl fehlt im Katalog: ' + metricId);
  }
  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metricIdsSeen.size !== expected.metricIdsWithObservations
      || current.coreWithData !== expected.coreWithData || current.emptyBitcoin.length !== expected.emptyBitcoinMetrics
      || current.rowsAfterCutoff !== 0 || current.matchedCandidateKeys.size !== 0) {
    throw new Error('Der Masterinhalt entspricht nicht den erwarteten Reihen- und Schlüsselwerten.');
  }

  const tail = Buffer.alloc(Math.min(4096, masterBytes));
  const fd = fs.openSync(masterPath, 'r');
  fs.readSync(fd, tail, 0, tail.length, masterBytes - tail.length);
  fs.closeSync(fd);
  const lineEnding = tail.includes(0x0d) ? '\r\n' : '\n';
  const appendText = (tail[tail.length - 1] === 0x0a ? '' : lineEnding)
    + candidateRows.map((row) => row.join(',')).join(lineEnding) + lineEnding;

  const updatedCandidateManifest = {
    ...candidateManifest,
    mergedIntoMaster: true,
    mergedAt: new Date().toISOString(),
    master: {
      path: path.basename(masterPath),
      previousRows: expected.rows,
      addedRows: candidateRows.length,
      expectedRows: expected.rows + candidateRows.length,
    },
  };
  fs.writeFileSync(nextCandidateManifestPath, JSON.stringify(updatedCandidateManifest, null, 2) + '\n', { flag: 'wx' });

  fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(manifestPath, manifestBackupPath, fs.constants.COPYFILE_EXCL);
  if (await sha256File(backupPath) !== expected.sha256 || fs.statSync(backupPath).size !== expected.bytes) {
    throw new Error('Die exakte Master-Sicherung konnte nicht bestätigt werden.');
  }
  fs.copyFileSync(masterPath, nextMasterPath, fs.constants.COPYFILE_EXCL);
  fs.appendFileSync(nextMasterPath, appendText, 'utf8');

  const updated = await summarizeMaster(nextMasterPath, catalog, candidateKeys);
  if (updated.rows !== expected.rows + 126
      || updated.metricIdsSeen.size !== expected.metricIdsWithObservations + 3
      || updated.coreWithData !== expected.coreWithData
      || updated.emptyBitcoin.length !== expected.emptyBitcoinMetrics - 3
      || updated.matchedCandidateKeys.size !== candidateKeys.size
      || updated.rowsAfterCutoff !== 0) {
    throw new Error('Der vorbereitete Master hat nicht die erwartete BTCUSDT-Liquidationsabdeckung.');
  }

  const newMasterSha256 = await sha256File(nextMasterPath);
  const newMasterBytes = fs.statSync(nextMasterPath).size;
  const previousLatestRefresh = manifest.latestRefresh;
  manifest.masterBytes = newMasterBytes;
  manifest.masterSha256 = newMasterSha256;
  manifest.observations = updated.rows;
  manifest.metricIdsWithObservations = updated.metricIdsSeen.size;
  manifest.catalogMetricIds = catalog.metrics.length;
  manifest.coreMetricIdsWithObservations = updated.coreWithData;
  manifest.coreMetricIds = catalog.coreMetricIds.length;
  manifest.emptyMetricIds = catalog.metrics.length - updated.metricIdsSeen.size;
  manifest.emptyCoreMetricIds = catalog.coreMetricIds.length - updated.coreWithData;
  manifest.firstObservationDate = updated.firstDate;
  manifest.lastObservationDate = updated.lastDate;
  manifest.rowsAfterCutoff = updated.rowsAfterCutoff;
  manifest.sourceCounts = updated.sources;
  manifest.scope.newObservationsAfterPreviousLocalMaster += candidateRows.length;
  manifest.scope.remainingEmptyBitcoinMetricIds = updated.emptyBitcoin.length;
  manifest.scope.remainingEmptyCoreMetricIds = manifest.emptyCoreMetricIds;
  manifest.previousLatestRefresh = previousLatestRefresh;
  manifest.latestRefresh = {
    runDate: '2026-09-30',
    cutoffInclusive: '2026-09-28',
    previousMasterRows: expected.rows,
    masterRows: updated.rows,
    netRowIncrease: candidateRows.length,
    masterSha256: newMasterSha256,
    masterBytes: newMasterBytes,
    previousMasterBackup: {
      path: path.basename(backupPath),
      sha256: expected.sha256,
      bytes: expected.bytes,
    },
    bykaranteliBitcoinLiquidations: {
      candidate: path.basename(candidatePath),
      manifest: path.basename(candidateManifestPath),
      sourceSlug,
      observations: candidateRows.length,
      metricIds,
      metricCounts,
      firstDate: dates[0],
      lastDate: dates.at(-1),
      rawBitcoinOnlyRows: candidateManifest.rawBitcoinOnlySnapshot.rows,
      symbol: 'BTCUSDT',
      exchanges: [...exchanges].sort(),
      venueCoverageVaries: true,
      sourceLicense: candidateManifest.source.license,
      sourceUrl: candidateManifest.source.url,
      partialLowerBound: true,
      uploaded: false,
    },
    uploaded: false,
  };
  manifest.qualityNotes.push('Added 126 provisional Bitcoin-only BTCUSDT liquidation observations from ByKaranteli CC0 data for 2026-07-30 through 2026-09-09. Daily values sum reported long and short liquidations across the venue rows available on each day; coverage varies and the source describes the recorded events as a floor. Non-Bitcoin symbols were excluded. The data remained local.');
  fs.writeFileSync(nextManifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });

  try {
    fs.renameSync(nextMasterPath, masterPath);
    fs.renameSync(nextManifestPath, manifestPath);
    if (await sha256File(masterPath) !== newMasterSha256 || fs.statSync(masterPath).size !== newMasterBytes) {
      throw new Error('Der abgeschlossene Master stimmt nicht mit der vorbereiteten Datei überein.');
    }
    fs.renameSync(nextCandidateManifestPath, candidateManifestPath);
  } catch (error) {
    fs.copyFileSync(backupPath, masterPath);
    fs.copyFileSync(manifestBackupPath, manifestPath);
    throw error;
  }

  console.log(JSON.stringify({
    addedObservations: candidateRows.length,
    metricIds,
    dateRange: [dates[0], dates.at(-1)],
    rows: updated.rows,
    metricIdsWithObservations: updated.metricIdsSeen.size,
    coreMetricIdsWithObservations: updated.coreWithData,
    emptyBitcoinMetricIds: updated.emptyBitcoin.length,
    masterBytes: newMasterBytes,
    masterSha256: newMasterSha256,
    backup: path.basename(backupPath),
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
