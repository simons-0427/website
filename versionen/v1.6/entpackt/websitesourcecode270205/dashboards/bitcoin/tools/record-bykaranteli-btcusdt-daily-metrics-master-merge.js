const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-btcusdt-daily-metrics-import-through-2026-09-10.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-btcusdt-daily-metrics-import-through-2026-09-10.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-btcusdt-daily-metrics-2026-09-30.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-btcusdt-daily-metrics-2026-09-30.json');
const nextMasterPath = masterPath + '.bykaranteli-btcusdt-metrics.next';
const nextManifestPath = manifestPath + '.bykaranteli-btcusdt-metrics.next';
const nextCandidateManifestPath = candidateManifestPath + '.next';
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sourceSlug = 'bykaranteli_btcusdt_daily_symbols_cc0';
const metricIds = ['binance_perpetual_funding_rate_pct', 'perpetual_open_interest_change_24h_pct'];
const expected = {
  rows: 738641,
  metrics: 154,
  bytes: 147872074,
  sha256: 'd147e47603c6d1d5f8aef5d235b40192a080fc5ad044eda7c403f82af01d6837',
  coreWithData: 92,
  emptyBitcoinBeforeCatalogAdditions: 30,
  emptyCore: 8,
  addedRows: 98,
  rowsPerMetric: 49,
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

async function summarizeMaster(filename, catalog, candidateKeys) {
  const metricIdsSeen = new Set();
  const sourceCounts = {};
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
    sourceCounts[cells[4]] = (sourceCounts[cells[4]] || 0) + 1;
    if (!firstDate || cells[2] < firstDate) firstDate = cells[2];
    if (!lastDate || cells[2] > lastDate) lastDate = cells[2];
    if (cells[2] > '2026-09-28') rowsAfterCutoff++;
    const key = cells[0] + '|' + cells[1] + '|' + cells[2];
    if (keys.has(key)) throw new Error('Doppelter Master-Schlüssel: ' + key);
    keys.add(key);
    if (candidateKeys.has(key)) matchedCandidateKeys.add(key);
  }
  if (isHeader) throw new Error('Der Master ist leer.');
  const coreMetricIds = new Set(catalog.coreMetricIds);
  const coreWithData = [...coreMetricIds].filter((id) => metricIdsSeen.has(id)).length;
  return {
    rows, metricIdsSeen, sourceCounts, firstDate, lastDate, rowsAfterCutoff, coreWithData,
    emptyBitcoin: emptyBitcoinMetricIds(catalog, metricIdsSeen), matchedCandidateKeys,
  };
}

async function main() {
  for (const file of [masterPath, manifestPath, catalogPath, candidatePath, candidateManifestPath]) {
    if (!fs.existsSync(file)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(file));
  }
  for (const file of [backupPath, manifestBackupPath, nextMasterPath, nextManifestPath, nextCandidateManifestPath]) {
    if (fs.existsSync(file)) throw new Error('Zieldatei existiert bereits und wird nicht überschrieben: ' + path.basename(file));
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  if (catalog.metrics.length !== manifest.catalogMetricIds + 2
      || !metricIds.every((id) => catalog.metrics.some((metric) => metric.id === id))) {
    throw new Error('Der Bitcoin-Katalog hat nicht genau die zwei erwarteten neuen Metriken.');
  }
  const masterBytes = fs.statSync(masterPath).size;
  const masterSha256 = await sha256File(masterPath);
  if (manifest.observations !== expected.rows || manifest.metricIdsWithObservations !== expected.metrics
      || manifest.coreMetricIdsWithObservations !== expected.coreWithData || manifest.cutoffInclusive !== '2026-09-28'
      || masterBytes !== expected.bytes || masterSha256 !== expected.sha256
      || manifest.masterBytes !== expected.bytes || manifest.masterSha256 !== expected.sha256) {
    throw new Error('Der aktive Master weicht vom erwarteten Stand vor dem BTCUSDT-Import ab.');
  }
  if (manifest.scope.remainingEmptyBitcoinMetricIds !== expected.emptyBitcoinBeforeCatalogAdditions
      || manifest.scope.remainingEmptyCoreMetricIds !== expected.emptyCore) {
    throw new Error('Die Abdeckung im Vorimportmanifest entspricht nicht dem erwarteten Stand.');
  }
  const rawMeta = candidateManifest.rawBitcoinOnlySnapshot;
  if (candidateManifest.observations !== expected.addedRows || rawMeta.rows !== expected.rowsPerMetric
      || rawMeta.symbol !== 'BTCUSDT' || rawMeta.nonBitcoinRowsWritten !== 0
      || rawMeta.firstDate !== '2026-07-23' || rawMeta.lastDate !== '2026-09-10'
      || candidateManifest.source.slug !== sourceSlug || candidateManifest.source.commitDate !== '2026-09-10'
      || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.sourceValuesProvisional !== true || candidateManifest.uploaded !== false
      || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('Das BTCUSDT-Kandidatenmanifest bestätigt nicht die geprüfte Quelle, Lizenz und Bitcoin-only-Abdeckung.');
  }

  const rawPath = path.join(varDir, rawMeta.path);
  const rawBuffer = fs.readFileSync(rawPath);
  if (rawBuffer.length !== rawMeta.bytes || sha256(rawBuffer) !== rawMeta.sha256) {
    throw new Error('BTCUSDT-Rohsnapshot und Manifest stimmen nicht überein.');
  }
  const rawLines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (rawLines.shift() !== 'date,symbol,funding_rate_pct,oi_24h_pct,source' || rawLines.length !== expected.rowsPerMetric) {
    throw new Error('BTCUSDT-Rohsnapshot hat unerwarteten Header oder Zeilenzahl.');
  }
  const rawByDate = new Map();
  for (const [index, line] of rawLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 5 || cells[1] !== 'BTCUSDT' || cells[4] !== 'bykaranteli.com') {
      throw new Error('Nicht-Bitcoin- oder ungültige Rohzeile ' + (index + 2) + '.');
    }
    if (rawByDate.has(cells[0])) throw new Error('Doppelter BTCUSDT-UTC-Tag: ' + cells[0]);
    rawByDate.set(cells[0], { funding: cells[2], oiChange: cells[3] });
  }

  const candidateBuffer = fs.readFileSync(candidatePath);
  if (candidateBuffer.length !== candidateManifest.candidate.bytes
      || sha256(candidateBuffer) !== candidateManifest.candidate.sha256) {
    throw new Error('BTCUSDT-Kandidaten-CSV und Manifest stimmen nicht überein.');
  }
  const candidateLines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (candidateLines.shift() !== header || candidateLines.length !== expected.addedRows) {
    throw new Error('BTCUSDT-Kandidaten-CSV hat unerwarteten Header oder Zeilenzahl.');
  }
  const candidateKeys = new Set();
  const candidateCells = [];
  const candidateCounts = Object.fromEntries(metricIds.map((id) => [id, 0]));
  for (const [index, line] of candidateLines.entries()) {
    const cells = line.split(',');
    const expectedValue = rawByDate.get(cells[2]);
    const valueMatches = expectedValue && (
      (cells[0] === 'binance_perpetual_funding_rate_pct' && cells[3] === expectedValue.funding)
      || (cells[0] === 'perpetual_open_interest_change_24h_pct' && cells[3] === expectedValue.oiChange)
    );
    if (cells.length !== 9 || !metricIds.includes(cells[0]) || cells[1] !== 'main'
        || cells[4] !== sourceSlug || cells[5] !== '' || cells[6] !== 'provisional'
        || !valueMatches || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(cells[3])
        || !/^[0-9a-f]{64}$/.test(cells[8])) {
      throw new Error('Ungültige BTCUSDT-Kandidatenzeile ' + (index + 2) + '.');
    }
    const key = cells[0] + '|' + cells[1] + '|' + cells[2];
    if (candidateKeys.has(key)) throw new Error('Doppelter BTCUSDT-Kandidatenschlüssel: ' + key);
    candidateKeys.add(key);
    candidateCounts[cells[0]]++;
    candidateCells.push(cells);
  }
  if (metricIds.some((id) => candidateCounts[id] !== expected.rowsPerMetric)) {
    throw new Error('Eine BTCUSDT-Kennzahl hat nicht 49 Kandidatenwerte.');
  }

  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metricIdsSeen.size !== expected.metrics
      || current.coreWithData !== expected.coreWithData || current.emptyBitcoin.length !== expected.emptyBitcoinBeforeCatalogAdditions + 2
      || current.rowsAfterCutoff !== 0 || current.matchedCandidateKeys.size !== 0
      || metricIds.some((id) => current.metricIdsSeen.has(id))) {
    throw new Error('Der aktuelle Master passt nicht zum geprüften Vorimportstand.');
  }

  fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(manifestPath, manifestBackupPath, fs.constants.COPYFILE_EXCL);
  if (await sha256File(backupPath) !== expected.sha256 || fs.statSync(backupPath).size !== expected.bytes) {
    throw new Error('Die bytegenaue Master-Sicherung konnte nicht bestätigt werden.');
  }
  const tail = Buffer.alloc(Math.min(4096, masterBytes));
  const fd = fs.openSync(masterPath, 'r');
  fs.readSync(fd, tail, 0, tail.length, masterBytes - tail.length);
  fs.closeSync(fd);
  const eol = tail.includes(0x0d) ? '\r\n' : '\n';
  const appendText = (tail[tail.length - 1] === 0x0a ? '' : eol)
    + candidateCells.map((cells) => cells.join(',')).join(eol) + eol;
  fs.copyFileSync(masterPath, nextMasterPath, fs.constants.COPYFILE_EXCL);
  fs.appendFileSync(nextMasterPath, appendText, 'utf8');

  const updated = await summarizeMaster(nextMasterPath, catalog, candidateKeys);
  if (updated.rows !== expected.rows + expected.addedRows
      || updated.metricIdsSeen.size !== expected.metrics + 2 || updated.coreWithData !== expected.coreWithData
      || updated.emptyBitcoin.length !== expected.emptyBitcoinBeforeCatalogAdditions
      || updated.matchedCandidateKeys.size !== expected.addedRows || updated.rowsAfterCutoff !== 0) {
    throw new Error('Der vorbereitete Master erfüllt die BTCUSDT-Abdeckungs- und Schlüsselregeln nicht.');
  }

  const nextHash = await sha256File(nextMasterPath);
  const nextBytes = fs.statSync(nextMasterPath).size;
  const previousLatestRefresh = manifest.latestRefresh;
  manifest.masterBytes = nextBytes;
  manifest.masterSha256 = nextHash;
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
  manifest.previousLatestRefresh = previousLatestRefresh;
  manifest.latestRefresh = {
    runDate: '2026-09-30',
    cutoffInclusive: '2026-09-28',
    previousMasterRows: expected.rows,
    masterRows: updated.rows,
    netRowIncrease: expected.addedRows,
    masterSha256: nextHash,
    masterBytes: nextBytes,
    previousMasterBackup: { path: path.basename(backupPath), sha256: expected.sha256, bytes: expected.bytes },
    bykaranteliBitcoinPerpetualDailyMetrics: {
      candidate: path.basename(candidatePath),
      manifest: path.basename(candidateManifestPath),
      sourceSlug,
      observations: expected.addedRows,
      metrics: metricIds,
      firstDate: '2026-07-23',
      lastDate: '2026-09-10',
      missingDates: candidateManifest.missingDates,
      quality: candidateManifest.metricQuality,
      sourceCommit: candidateManifest.source.commit,
      sourceCommitDate: candidateManifest.source.commitDate,
      sourceUrl: candidateManifest.source.url,
      nonBitcoinRowsImported: 0,
      uploaded: false,
    },
    uploaded: false,
  };
  manifest.qualityNotes.push('Added 49 BTCUSDT-only Binance USDT-M funding values and 49 24-hour open-interest percentage changes from the ByKaranteli CC0 daily-symbols snapshot. The snapshot ends 2026-09-10, omits 2026-07-26, and 11 of 48 adjacent open-interest values repeat; both metrics remain provisional and local.');
  fs.writeFileSync(nextManifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const updatedCandidateManifest = {
    ...candidateManifest,
    mergedIntoMaster: true,
    mergedAt: new Date().toISOString(),
    master: {
      path: path.basename(masterPath),
      previousRows: expected.rows,
      addedRows: expected.addedRows,
      expectedRows: updated.rows,
      sha256: nextHash,
      bytes: nextBytes,
    },
  };
  fs.writeFileSync(nextCandidateManifestPath, JSON.stringify(updatedCandidateManifest, null, 2) + '\n', { flag: 'wx' });

  try {
    fs.renameSync(nextMasterPath, masterPath);
    fs.renameSync(nextManifestPath, manifestPath);
    if (await sha256File(masterPath) !== nextHash || fs.statSync(masterPath).size !== nextBytes) {
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
    metricIds: metricIds,
    rows: updated.rows,
    metricIdsWithObservations: updated.metricIdsSeen.size,
    catalogMetricIds: catalog.metrics.length,
    coreMetricIdsWithObservations: updated.coreWithData,
    emptyBitcoinMetricIds: updated.emptyBitcoin.length,
    emptyCoreMetricIds: catalog.coreMetricIds.length - updated.coreWithData,
    masterBytes: nextBytes,
    masterSha256: nextHash,
    backup: path.basename(backupPath),
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
