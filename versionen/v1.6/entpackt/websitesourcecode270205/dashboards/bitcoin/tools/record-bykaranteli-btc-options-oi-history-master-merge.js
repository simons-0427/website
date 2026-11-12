const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const summaryPath = path.join(varDir, 'bykaranteli-btc-options-oi-history-source-summaries-through-2026-09-10.csv');
const candidatePath = path.join(varDir, 'bykaranteli-btc-options-oi-history-import-through-2026-09-10.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-btc-options-oi-history-import-through-2026-09-10.json');
const sourceSlug = 'bykaranteli_btc_options_oi_cc0';
const metricId = 'options_open_interest_usd';
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expected = {
  rows: 738924,
  metricIdsWithObservations: 161,
  coreMetricIdsWithObservations: 92,
  emptyBitcoinMetrics: 30,
  emptyCoreMetrics: 8,
  bytes: 147938941,
  sha256: 'b46a72af3b5a0568e3c5c77012b9d1561bb998da11c2a6e5340473334ab31e33',
  addedRows: 35,
  catalogMetrics: 204,
  cutoff: '2026-09-28',
};
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-btc-options-oi-history-2026-09-30.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-btc-options-oi-history-2026-09-30.json');
const nextMasterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.options-oi-history.next.csv');
const nextManifestPath = path.join(varDir, 'manifest-through-2026-09-28.options-oi-history.next.json');
const nextCandidateManifestPath = path.join(varDir, 'bykaranteli-btc-options-oi-history-import-through-2026-09-10.next.json');

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

function emptyBitcoinMetricIds(catalog, observed) {
  const excludedCrossMarketIds = new Set([
    'btc_gold_ratio', 'btc_sp500_corr_90d', 'btc_gold_corr_90d',
    'btc_sp500_corr_1y', 'btc_gold_corr_1y', 'btc_sp500_relative_return_1y_pct',
    'btc_real_price_usd',
  ]);
  return catalog.metrics.filter((metric) => metric.category !== 'macro' && !observed.has(metric.id)
    && !excludedCrossMarketIds.has(metric.id)).map((metric) => metric.id);
}

function parseLines(buffer, expectedHeader, label, columns) {
  const lines = buffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== expectedHeader) throw new Error(label + ' hat einen unerwarteten Header.');
  return lines.map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== columns) throw new Error('Ungültige Zeile ' + (index + 2) + ' in ' + label + '.');
    return cells;
  });
}

async function summarizeMaster(filename, catalog, candidateKeys) {
  const metricIdsSeen = new Set();
  const sourceCounts = {};
  const keys = new Set();
  const matchedCandidateKeys = new Set();
  const oiRows = [];
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
    sourceCounts[cells[4]] = (sourceCounts[cells[4]] || 0) + 1;
    if (!firstDate || cells[2] < firstDate) firstDate = cells[2];
    if (!lastDate || cells[2] > lastDate) lastDate = cells[2];
    if (cells[2] > expected.cutoff) rowsAfterCutoff++;
    const key = cells[0] + '\x1f' + cells[1] + '\x1f' + cells[2];
    if (keys.has(key)) throw new Error('Doppelter Master-Schlüssel: ' + key);
    keys.add(key);
    if (candidateKeys.has(key)) matchedCandidateKeys.add(key);
    if (cells[0] === metricId) oiRows.push(cells);
  }
  if (isHeader) throw new Error('Der Master ist leer.');
  const coreWithData = catalog.coreMetricIds.filter((id) => metricIdsSeen.has(id)).length;
  return {
    rows, metricIdsSeen, sourceCounts, firstDate, lastDate, rowsAfterCutoff, coreWithData, oiRows,
    emptyBitcoin: emptyBitcoinMetricIds(catalog, metricIdsSeen), matchedCandidateKeys,
  };
}

async function main() {
  for (const filename of [masterPath, manifestPath, catalogPath, summaryPath, candidatePath, candidateManifestPath]) {
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
      || manifest.coreMetricIdsWithObservations !== expected.coreMetricIdsWithObservations
      || manifest.cutoffInclusive !== expected.cutoff
      || masterBytes !== expected.bytes || masterSha256 !== expected.sha256
      || manifest.masterBytes !== expected.bytes || manifest.masterSha256 !== expected.sha256) {
    throw new Error('Der aktive Master weicht vom erwarteten Stand vor der BTC-OI-Historienergänzung ab.');
  }
  if (manifest.scope.remainingEmptyBitcoinMetricIds !== expected.emptyBitcoinMetrics
      || manifest.scope.remainingEmptyCoreMetricIds !== expected.emptyCoreMetrics
      || catalog.metrics.length !== expected.catalogMetrics) {
    throw new Error('Die Katalog- oder Kennzahlenabdeckung stimmt nicht mit dem Vorimportstand überein.');
  }

  const summaryBuffer = fs.readFileSync(summaryPath);
  const candidateBuffer = fs.readFileSync(candidatePath);
  const summaryRows = parseLines(summaryBuffer,
    'observation_date,source_commit,schema_columns,btc_rows,unique_btc_instruments,expiry_count,call_instruments,put_instruments,zero_oi_instruments,open_interest_btc,options_open_interest_usd,btc_rows_sha256',
    'BTC-only OI-Historienzusammenfassung', 12);
  const candidateRows = parseLines(candidateBuffer, header, 'BTC-OI-Kandidaten-CSV', 9);
  if (candidateManifest.observations !== expected.addedRows
      || candidateManifest.metricId !== metricId
      || candidateManifest.scope.snapshotCount !== 36
      || candidateManifest.scope.newObservations !== expected.addedRows
      || candidateManifest.scope.nonBitcoinRowsWritten !== 0
      || candidateManifest.scope.ethRowsWritten !== 0
      || candidateManifest.quality.existing2026_08_30SnapshotMatchesPinnedCommit !== true
      || candidateManifest.sourceSummary.sha256 !== sha256Buffer(summaryBuffer)
      || candidateManifest.candidate.bytes !== candidateBuffer.length
      || candidateManifest.candidate.sha256 !== sha256Buffer(candidateBuffer)
      || candidateManifest.uploaded !== false
      || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('Der BTC-only Options-OI-Kandidatenmanifest bestätigt die Quell- und Qualitätsprüfung nicht.');
  }
  if (summaryRows.length !== 36 || candidateRows.length !== expected.addedRows) {
    throw new Error('Die OI-Historie enthält eine unerwartete Zahl an Tageswerten.');
  }
  const august30 = summaryRows.find((cells) => cells[0] === '2026-08-30');
  if (!august30 || august30[10] !== '31159286071.55' || august30[11] !== '1c05890b90062d6af81d21fd468f6489bba344e4abbe2c82f52ffa7dba545b88') {
    throw new Error('Der überlappende BTC-OI-Snapshot vom 30.08.2026 passt nicht.');
  }

  const candidateKeys = new Set();
  const summaryByDate = new Map(summaryRows.map((cells) => [cells[0], cells]));
  const importedDates = new Set();
  for (const [index, cells] of candidateRows.entries()) {
    const [candidateMetric, seriesKey, date, value, slug, sourceTimestamp, quality, sourceRevision, rawHash] = cells;
    const source = summaryByDate.get(date);
    if (!source || date === '2026-08-30'
        || candidateMetric !== metricId || seriesKey !== 'main' || value !== source[10]
        || slug !== sourceSlug || sourceTimestamp !== '' || quality !== 'provisional'
        || sourceRevision !== 'bykaranteli-deribit-btc-options-oi-cc0-' + source[1] + ':' + date
        || rawHash !== source[11] || !/^[0-9a-f]{64}$/.test(rawHash)
        || importedDates.has(date)) {
      throw new Error('Ungültige oder doppelte Kandidatenzeile ' + (index + 2) + '.');
    }
    importedDates.add(date);
    candidateKeys.add(metricId + '\x1fmain\x1f' + date);
  }
  if (candidateKeys.size !== expected.addedRows) throw new Error('Doppelte Kandidatenschlüssel.');

  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metricIdsSeen.size !== expected.metricIdsWithObservations
      || current.coreWithData !== expected.coreMetricIdsWithObservations
      || current.emptyBitcoin.length !== expected.emptyBitcoinMetrics
      || current.rowsAfterCutoff !== 0 || current.matchedCandidateKeys.size !== 0
      || current.oiRows.length !== 1 || current.oiRows[0][2] !== '2026-08-30'
      || current.oiRows[0][3] !== august30[10]) {
    throw new Error('Der Master entspricht nicht dem bestätigten Vorimportstand oder enthält unerwartete OI-Schlüssel.');
  }
  if (!catalog.metrics.some((metric) => metric.id === metricId)) throw new Error('OI-Kennzahl fehlt im Katalog.');

  const tail = Buffer.alloc(Math.min(4096, masterBytes));
  const fd = fs.openSync(masterPath, 'r');
  fs.readSync(fd, tail, 0, tail.length, masterBytes - tail.length);
  fs.closeSync(fd);
  const lineEnding = tail.includes(0x0d) ? '\r\n' : '\n';
  const appendText = (tail[tail.length - 1] === 0x0a ? '' : lineEnding)
    + candidateRows.map((cells) => cells.join(',')).join(lineEnding) + lineEnding;

  const updatedCandidateManifest = {
    ...candidateManifest,
    mergedIntoMaster: true,
    mergedAt: new Date().toISOString(),
    master: {
      path: path.basename(masterPath),
      previousRows: expected.rows,
      addedRows: expected.addedRows,
      expectedRows: expected.rows + expected.addedRows,
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
  if (updated.rows !== expected.rows + expected.addedRows
      || updated.metricIdsSeen.size !== expected.metricIdsWithObservations
      || updated.coreWithData !== expected.coreMetricIdsWithObservations
      || updated.emptyBitcoin.length !== expected.emptyBitcoinMetrics
      || updated.rowsAfterCutoff !== 0 || updated.matchedCandidateKeys.size !== expected.addedRows
      || updated.oiRows.length !== 36) {
    throw new Error('Der vorbereitete Master enthält nicht die erwarteten BTC-OI-Tageswerte.');
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
  manifest.sourceCounts = updated.sourceCounts;
  manifest.scope.newObservationsAfterPreviousLocalMaster += expected.addedRows;
  manifest.scope.remainingEmptyBitcoinMetricIds = updated.emptyBitcoin.length;
  manifest.scope.remainingEmptyCoreMetricIds = manifest.emptyCoreMetricIds;
  manifest.scope.newBitcoinOptionsOiHistoryObservations = expected.addedRows;
  manifest.scope.newBitcoinOptionsOiHistoryMetricIds = [metricId];
  manifest.previousLatestRefresh = previousLatestRefresh;
  manifest.latestRefresh = {
    runDate: '2026-09-30',
    cutoffInclusive: expected.cutoff,
    previousMasterRows: expected.rows,
    masterRows: updated.rows,
    netRowIncrease: expected.addedRows,
    masterSha256: newMasterSha256,
    masterBytes: newMasterBytes,
    previousMasterBackup: {
      path: path.basename(backupPath),
      sha256: expected.sha256,
      bytes: expected.bytes,
    },
    bykaranteliBitcoinOptionsOiHistory: {
      candidate: path.basename(candidatePath),
      manifest: path.basename(candidateManifestPath),
      sourceSummary: path.basename(summaryPath),
      sourceSummarySha256: sha256Buffer(summaryBuffer),
      sourceSlug,
      metricId,
      totalContinuousSnapshots: 36,
      existingOverlap: 1,
      observationsAdded: expected.addedRows,
      firstDate: '2026-08-06',
      lastDate: '2026-09-10',
      minUsd: candidateManifest.quality.btcOpenInterestUsd.min,
      maxUsd: candidateManifest.quality.btcOpenInterestUsd.max,
      sourceLicense: candidateManifest.source.license,
      nonBitcoinRowsWritten: 0,
      uploaded: false,
    },
    uploaded: false,
  };
  manifest.qualityNotes.push('Added 35 provisional BTC-only Deribit options open-interest observations from pinned ByKaranteli CC0 daily revisions, 2026-08-06 through 2026-09-10. The existing 2026-08-30 value was independently matched to the pinned commit. The source history has 36 consecutive daily snapshots; only BTC rows were summarized and imported. No ETH rows were written. This is one-exchange open interest, not a global options-market total.');
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
    addedObservations: expected.addedRows,
    metricId,
    historySnapshots: 36,
    observationsForMetric: updated.oiRows.length,
    firstDate: '2026-08-06',
    lastDate: '2026-09-10',
    rows: updated.rows,
    metricIdsWithObservations: updated.metricIdsSeen.size,
    catalogMetricIds: catalog.metrics.length,
    coreMetricIdsWithObservations: updated.coreWithData,
    emptyBitcoinMetricIds: updated.emptyBitcoin.length,
    emptyCoreMetricIds: catalog.coreMetricIds.length - updated.coreWithData,
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
