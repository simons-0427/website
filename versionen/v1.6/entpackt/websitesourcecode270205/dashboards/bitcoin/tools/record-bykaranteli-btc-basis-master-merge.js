const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-btc-basis-import-through-2026-09-10.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-btc-basis-import-through-2026-09-10.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-btc-futures-basis-2026-09-30.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-btc-futures-basis-2026-09-30.json');
const nextMasterPath = masterPath + '.bykaranteli-btc-futures-basis.next';
const nextManifestPath = manifestPath + '.bykaranteli-btc-futures-basis.next';
const nextCandidateManifestPath = candidateManifestPath + '.next';
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const rawHeader = 'date,symbol,tenor,expiry,spot_usd,future_usd,annualized_pct,source';
const metricId = 'futures_basis_pct';
const sourceSlug = 'bykaranteli_btc_futures_basis_cc0';
const firstDate = '2026-08-06';
const lastDate = '2026-09-10';
const expected = {
  rows: 738605,
  metricIdsWithObservations: 153,
  bytes: 147864269,
  sha256: '42362e71d274fe82af70528ff67218e0ddab781a1ce95313c2c48e8b6891fbbc',
  coreWithData: 91,
  emptyBitcoinMetrics: 31,
  emptyCoreMetrics: 9,
  addedRows: 36,
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
    throw new Error('Der Master weicht vom erwarteten Stand vor dem BTC-Basisimport ab.');
  }
  if (manifest.scope.remainingEmptyBitcoinMetricIds !== expected.emptyBitcoinMetrics
      || manifest.scope.remainingEmptyCoreMetricIds !== expected.emptyCoreMetrics) {
    throw new Error('Die Kennzahlenabdeckung stimmt nicht mit dem erwarteten Vorimportstand überein.');
  }
  const rawMetadata = candidateManifest.rawBitcoinOnlySnapshot;
  if (candidateManifest.observations !== expected.addedRows || rawMetadata.rows !== expected.addedRows
      || rawMetadata.symbol !== 'BTC' || rawMetadata.tenor !== 'current_quarter'
      || rawMetadata.expiry !== '2026-09-25' || rawMetadata.otherSymbolsWritten !== 0
      || rawMetadata.otherTenorsWritten !== 0 || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.sourceValuesProvisional !== true || candidateManifest.uploaded !== false
      || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('Das BTC-Basis-Kandidatenmanifest bestätigt nicht die erwartete Lizenz, Asset- und Tenorabdeckung.');
  }

  const rawPath = path.join(varDir, rawMetadata.path);
  const rawBuffer = fs.readFileSync(rawPath);
  if (rawBuffer.length !== rawMetadata.bytes || sha256Buffer(rawBuffer) !== rawMetadata.sha256) {
    throw new Error('BTC-Basisrohdatei und Manifest stimmen nicht überein.');
  }
  const rawLines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (rawLines.shift() !== rawHeader || rawLines.length !== expected.addedRows) throw new Error('BTC-Basisrohdatei hat unerwarteten Header oder Zeilenzahl.');
  const rawByDate = new Map();
  for (const [index, line] of rawLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 8 || cells[1] !== 'BTC' || cells[2] !== 'current_quarter'
        || cells[3] !== '2026-09-25' || cells[7] !== 'bykaranteli.com') {
      throw new Error('Nicht-Bitcoin-, Nicht-current-quarter- oder ungültige Rohzeile ' + (index + 2));
    }
    if (rawByDate.has(cells[0])) throw new Error('Doppelter UTC-Tag in der BTC-Basisrohdatei: ' + cells[0]);
    rawByDate.set(cells[0], cells[6]);
  }

  const candidateBuffer = fs.readFileSync(candidatePath);
  if (candidateBuffer.length !== candidateManifest.candidate.bytes
      || sha256Buffer(candidateBuffer) !== candidateManifest.candidate.sha256) {
    throw new Error('BTC-Basis-Kandidaten-CSV und Manifest stimmen nicht überein.');
  }
  const candidateLines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (candidateLines.shift() !== header || candidateLines.length !== expected.addedRows) {
    throw new Error('BTC-Basis-Kandidaten-CSV hat unerwarteten Header oder Zeilenzahl.');
  }
  const candidateKeys = new Set();
  const candidateCells = [];
  for (const [index, line] of candidateLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9 || cells[0] !== metricId || cells[1] !== 'main'
        || cells[4] !== sourceSlug || cells[5] !== '' || cells[6] !== 'provisional'
        || cells[2] < firstDate || cells[2] > lastDate || cells[3] !== rawByDate.get(cells[2])
        || !/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(cells[3])
        || !cells[7].endsWith(':' + cells[2]) || !/^[0-9a-f]{64}$/.test(cells[8])) {
      throw new Error('BTC-Basis-Kandidatenzeile passt nicht zur Bitcoin-Rohdatei, Zeile ' + (index + 2) + '.');
    }
    const key = cells[0] + '\x1f' + cells[1] + '\x1f' + cells[2];
    if (candidateKeys.has(key)) throw new Error('Doppelter BTC-Basis-Kandidatenschlüssel: ' + key);
    candidateKeys.add(key);
    candidateCells.push(cells);
  }
  if (!catalog.coreMetricIds.includes(metricId)) throw new Error('Futures-Basis ist nicht in der Kernliste.');
  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metricIdsSeen.size !== expected.metricIdsWithObservations
      || current.coreWithData !== expected.coreWithData || current.emptyBitcoin.length !== expected.emptyBitcoinMetrics
      || current.rowsAfterCutoff !== 0 || current.matchedCandidateKeys.size !== 0
      || current.metricIdsSeen.has(metricId)) {
    throw new Error('Der aktive Masterinhalt entspricht nicht dem erwarteten Vorimportstand.');
  }

  const tail = Buffer.alloc(Math.min(4096, masterBytes));
  const fd = fs.openSync(masterPath, 'r');
  fs.readSync(fd, tail, 0, tail.length, masterBytes - tail.length);
  fs.closeSync(fd);
  const lineEnding = tail.includes(0x0d) ? '\r\n' : '\n';
  const appendText = (tail[tail.length - 1] === 0x0a ? '' : lineEnding)
    + candidateCells.map((cells) => cells.join(',')).join(lineEnding) + lineEnding;

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
      || updated.metricIdsSeen.size !== expected.metricIdsWithObservations + 1
      || updated.coreWithData !== expected.coreWithData + 1
      || updated.emptyBitcoin.length !== expected.emptyBitcoinMetrics - 1
      || updated.matchedCandidateKeys.size !== expected.addedRows
      || updated.rowsAfterCutoff !== 0) {
    throw new Error('Der vorbereitete Master hat nicht die erwartete BTC-Futures-Basis-Abdeckung.');
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
  manifest.scope.newObservationsAfterPreviousLocalMaster += expected.addedRows;
  manifest.scope.remainingEmptyBitcoinMetricIds = updated.emptyBitcoin.length;
  manifest.scope.remainingEmptyCoreMetricIds = manifest.emptyCoreMetricIds;
  manifest.previousLatestRefresh = previousLatestRefresh;
  manifest.latestRefresh = {
    runDate: '2026-09-30',
    cutoffInclusive: '2026-09-28',
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
    bykaranteliBitcoinCurrentQuarterBasis: {
      candidate: path.basename(candidatePath),
      manifest: path.basename(candidateManifestPath),
      sourceSlug,
      observations: expected.addedRows,
      metricId,
      firstDate,
      lastDate,
      tenor: 'current_quarter',
      expiry: '2026-09-25',
      sourceField: 'annualized_pct',
      minimumAnnualizedPct: candidateManifest.rawBitcoinOnlySnapshot.minimumAnnualizedPct,
      maximumAnnualizedPct: candidateManifest.rawBitcoinOnlySnapshot.maximumAnnualizedPct,
      sourceLicense: candidateManifest.source.license,
      sourceUrl: candidateManifest.source.url,
      otherSymbolsImported: 0,
      otherTenorsImported: 0,
      uploaded: false,
    },
    uploaded: false,
  };
  manifest.qualityNotes.push('Added 36 provisional Bitcoin-only current-quarter futures basis observations from ByKaranteli CC0 data for 2026-08-06 through 2026-09-10. The source annualized_pct field is used directly for the BTC contract with expiry 2026-09-25. ETH and the next_quarter BTC tenor were excluded. No dates were interpolated; the data remained local.');
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
    dateRange: [firstDate, lastDate],
    rows: updated.rows,
    metricIdsWithObservations: updated.metricIdsSeen.size,
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
