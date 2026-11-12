const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-etf-flows-btc-import-through-2026-09-08.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-etf-flows-btc-import-through-2026-09-08.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-etf-flows-btc-2026-09-29.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-etf-flows-btc-2026-09-29.json');
const nextMasterPath = `${masterPath}.bykaranteli-etf-flows-btc.next`;
const nextManifestPath = `${manifestPath}.bykaranteli-etf-flows-btc.next`;
const nextCandidateManifestPath = `${candidateManifestPath}.next`;
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expected = {
  rows: 737120,
  metricIds: 144,
  bytes: 147553861,
  sha256: '80acacf1620637e7d3a906660de5a5862a6a2480cbdc4d1d7b3fedc90dbfafb4',
  coreWithData: 91,
  emptyBitcoinMetrics: 40,
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
  const metrics = new Set();
  const sources = {};
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
    if (cells.length !== 9) throw new Error(`Ungültige Masterzeile ${rows + 2}.`);
    rows++;
    metrics.add(cells[0]);
    sources[cells[4]] = (sources[cells[4]] || 0) + 1;
    if (!firstDate || cells[2] < firstDate) firstDate = cells[2];
    if (!lastDate || cells[2] > lastDate) lastDate = cells[2];
    if (cells[2] > '2026-09-28') rowsAfterCutoff++;
    const key = `${cells[0]}\x1f${cells[1]}\x1f${cells[2]}`;
    if (candidateKeys.has(key)) matchedCandidateKeys.add(key);
  }
  if (isHeader) throw new Error('Der aktive Master ist leer.');
  const coreMetricIds = new Set(catalog.coreMetricIds);
  const coreWithData = [...coreMetricIds].filter((id) => metrics.has(id)).length;
  const emptyBitcoin = emptyBitcoinMetricIds(catalog, metrics);
  return { rows, metrics, sources, firstDate, lastDate, rowsAfterCutoff, coreWithData, emptyBitcoin, matchedCandidateKeys };
}

async function main() {
  for (const filename of [masterPath, manifestPath, catalogPath, candidatePath, candidateManifestPath]) {
    if (!fs.existsSync(filename)) throw new Error(`Erforderliche Datei fehlt: ${path.basename(filename)}`);
  }
  for (const filename of [backupPath, manifestBackupPath, nextMasterPath, nextManifestPath, nextCandidateManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Zieldatei existiert bereits; zur Sicherheit wird nichts überschrieben: ${path.basename(filename)}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  if (manifest.observations !== expected.rows || manifest.metricIdsWithObservations !== expected.metricIds
      || manifest.coreMetricIdsWithObservations !== expected.coreWithData || manifest.cutoffInclusive !== '2026-09-28') {
    throw new Error('Das Manifest entspricht nicht dem erwarteten Stand vor dem BTC-ETF-Import.');
  }
  if (candidateManifest.observations !== 1308 || candidateManifest.rawBitcoinOnlySnapshot.rows !== 327
      || candidateManifest.rawBitcoinOnlySnapshot.assetFilter !== 'BTC'
      || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.uploaded !== false || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('Das ETF-Kandidatenmanifest weist nicht die erwarteten Bitcoin-only CC0-Werte aus.');
  }
  const candidateBuffer = fs.readFileSync(candidatePath);
  if (candidateBuffer.length !== candidateManifest.candidate.bytes
      || sha256Buffer(candidateBuffer) !== candidateManifest.candidate.sha256) {
    throw new Error('Kandidaten-CSV und Kandidatenmanifest stimmen nicht überein.');
  }
  const candidateLines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (candidateLines.shift() !== header || candidateLines.length !== candidateManifest.observations) {
    throw new Error('Die ByKaranteli-Kandidaten-CSV hat einen unerwarteten Header oder eine falsche Zeilenzahl.');
  }
  const metricIds = ['etf_netflow_usd', 'etf_aum_usd', 'etf_cumulative_netflow_usd', 'etf_trading_volume_usd'];
  const expectedPerMetric = Object.fromEntries(metricIds.map((id) => [id, 327]));
  const seenKeys = new Set();
  const candidateKeys = new Set();
  const candidateRows = [];
  const candidateSources = {};
  const candidateMetrics = new Set();
  let candidateFirst = null;
  let candidateLast = null;
  for (const [index, line] of candidateLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9 || !metricIds.includes(cells[0]) || cells[1] !== 'main'
        || cells[4] !== 'bykaranteli_etf_flows_cc0' || cells[5] !== ''
        || cells[6] !== 'provisional' || cells[2] < '2025-05-20' || cells[2] > '2026-09-08'
        || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cells[3])
        || !/^[a-f0-9]{64}$/.test(cells[8])) {
      throw new Error(`Ungültige oder nicht Bitcoin-only Kandidatenzeile ${index + 2}.`);
    }
    const key = `${cells[0]}\x1f${cells[1]}\x1f${cells[2]}`;
    if (seenKeys.has(key)) throw new Error(`Doppelter ETF-Metriktag: ${key}`);
    seenKeys.add(key);
    candidateKeys.add(key);
    candidateRows.push(cells);
    candidateMetrics.add(cells[0]);
    candidateSources[cells[4]] = (candidateSources[cells[4]] || 0) + 1;
    if (!candidateFirst || cells[2] < candidateFirst) candidateFirst = cells[2];
    if (!candidateLast || cells[2] > candidateLast) candidateLast = cells[2];
  }
  const actualCounts = Object.fromEntries(metricIds.map((id) => [id, candidateRows.filter((row) => row[0] === id).length]));
  if (JSON.stringify(actualCounts) !== JSON.stringify(expectedPerMetric)
      || candidateMetrics.size !== metricIds.length || candidateFirst !== '2025-05-20'
      || candidateLast !== '2026-09-08') {
    throw new Error('Die Kandidatenabdeckung stimmt nicht mit den vier 327-Tage-Reihen überein.');
  }
  const currentSha256 = await sha256File(masterPath);
  if (fs.statSync(masterPath).size !== expected.bytes || currentSha256 !== expected.sha256) {
    throw new Error('Der aktive Master weicht von der geprüften Bitcoin-only Ausgangsversion ab.');
  }
  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metrics.size !== expected.metricIds
      || current.coreWithData !== expected.coreWithData || current.emptyBitcoin.length !== expected.emptyBitcoinMetrics
      || current.rowsAfterCutoff !== 0 || current.matchedCandidateKeys.size !== 0
      || metricIds.some((id) => current.metrics.has(id))) {
    throw new Error('Die vorhandene Masterabdeckung überschneidet sich unerwartet mit den ETF-Reihen.');
  }
  for (const metricId of metricIds) {
    if (!catalog.metrics.some((metric) => metric.id === metricId)) throw new Error(`Unbekannte Bitcoin-Kennzahl: ${metricId}`);
  }

  const candidateManifestPathName = path.basename(candidateManifestPath);
  const updatedCandidateManifest = {
    ...candidateManifest,
    mergedIntoMaster: true,
  };
  const stat = fs.statSync(masterPath);
  const tail = Buffer.alloc(Math.min(2, stat.size));
  const fd = fs.openSync(masterPath, 'r');
  fs.readSync(fd, tail, 0, tail.length, stat.size - tail.length);
  fs.closeSync(fd);
  const lineEnding = tail.includes(0x0d) ? '\r\n' : '\n';
  const appendText = `${tail[tail.length - 1] === 0x0a ? '' : lineEnding}${candidateRows.map((row) => row.join(',')).join(lineEnding)}${lineEnding}`;
  fs.writeFileSync(nextCandidateManifestPath, `${JSON.stringify(updatedCandidateManifest, null, 2)}\n`, { flag: 'wx' });
  fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(manifestPath, manifestBackupPath, fs.constants.COPYFILE_EXCL);
  if (await sha256File(backupPath) !== expected.sha256 || fs.statSync(backupPath).size !== expected.bytes) {
    throw new Error('Die exakte Master-Sicherung konnte nicht bestätigt werden.');
  }
  fs.copyFileSync(masterPath, nextMasterPath, fs.constants.COPYFILE_EXCL);
  fs.appendFileSync(nextMasterPath, appendText, 'utf8');
  const updated = await summarizeMaster(nextMasterPath, catalog, candidateKeys);
  const expectedRows = expected.rows + candidateRows.length;
  if (updated.rows !== expectedRows || updated.metrics.size !== expected.metricIds + metricIds.length
      || updated.coreWithData !== expected.coreWithData || updated.emptyBitcoin.length !== expected.emptyBitcoinMetrics - metricIds.length
      || updated.matchedCandidateKeys.size !== candidateKeys.size || updated.rowsAfterCutoff !== 0) {
    throw new Error('Der vorbereitete Master hat nicht die erwartete Bitcoin-only Abdeckung.');
  }
  const newMasterSha256 = await sha256File(nextMasterPath);
  const newMasterBytes = fs.statSync(nextMasterPath).size;
  const previousLatestRefresh = manifest.latestRefresh;
  manifest.masterBytes = newMasterBytes;
  manifest.masterSha256 = newMasterSha256;
  manifest.observations = updated.rows;
  manifest.metricIdsWithObservations = updated.metrics.size;
  manifest.catalogMetricIds = catalog.metrics.length;
  manifest.coreMetricIdsWithObservations = updated.coreWithData;
  manifest.coreMetricIds = catalog.coreMetricIds.length;
  manifest.emptyMetricIds = catalog.metrics.length - updated.metrics.size;
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
    runDate: '2026-09-29',
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
    bykaranteliBitcoinEtfFlows: {
      candidate: path.basename(candidatePath),
      manifest: candidateManifestPathName,
      sourceSlug: 'bykaranteli_etf_flows_cc0',
      observations: candidateRows.length,
      metricIds,
      metricCounts: expectedPerMetric,
      firstDate: candidateFirst,
      lastDate: candidateLast,
      sourceLicense: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-29',
      sourceUrl: candidateManifest.source.url,
      assetFilter: 'BTC',
      nonBitcoinRowsImported: 0,
      uploaded: false,
    },
    uploaded: false,
  };
  manifest.qualityNotes.push(`Merged ${candidateRows.length} provisional Bitcoin-only ETF observations from ByKaranteli CC0 data for 2025-05-20 through 2026-09-08. Four metric fields were mapped directly from the BTC rows; non-Bitcoin rows, unreported dates, and dates after the source coverage end were not added. No upload was performed.`);
  fs.writeFileSync(nextManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });

  try {
    fs.renameSync(nextMasterPath, masterPath);
    fs.renameSync(nextManifestPath, manifestPath);
    const finalHash = await sha256File(masterPath);
    if (finalHash !== newMasterSha256 || fs.statSync(masterPath).size !== newMasterBytes) {
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
    addedMetricIds: metricIds,
    firstDate: candidateFirst,
    lastDate: candidateLast,
    observations: updated.rows,
    metricIdsWithObservations: updated.metrics.size,
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
