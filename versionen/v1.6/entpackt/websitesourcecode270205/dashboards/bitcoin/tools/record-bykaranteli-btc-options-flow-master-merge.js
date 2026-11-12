const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-options-flow-btc-import-through-2026-09-10.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-options-flow-btc-import-through-2026-09-10.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-btc-options-flow-2026-09-30.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-btc-options-flow-2026-09-30.json');
const nextMasterPath = masterPath + '.bykaranteli-btc-options-flow.next';
const nextManifestPath = manifestPath + '.bykaranteli-btc-options-flow.next';
const nextCandidateManifestPath = candidateManifestPath + '.next';
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sourceSlug = 'bykaranteli_btc_options_flow_cc0';
const metricIds = [
  'options_trade_count',
  'options_notional_volume_usd',
  'options_premium_volume_usd',
  'options_put_share_pct',
  'options_block_trades_count',
];
const sourceFields = {
  options_trade_count: 'trades',
  options_notional_volume_usd: 'notional_usd',
  options_premium_volume_usd: 'premium_usd',
  options_put_share_pct: 'put_share_pct',
  options_block_trades_count: 'block_trades',
};
const expected = {
  rows: 738739,
  metrics: 156,
  bytes: 147896732,
  sha256: 'fa3e584a0f2c1b47c411351679a35c9db343d3f50a5ed76e9afdffe0d8f538ac',
  coreWithData: 92,
  emptyBitcoin: 30,
  emptyCore: 8,
  addedRows: 185,
  rowsPerMetric: 37,
  catalogMetricIds: 204,
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
  const coreWithData = catalog.coreMetricIds.filter((id) => metricIdsSeen.has(id)).length;
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
  if (catalog.metrics.length !== expected.catalogMetricIds || manifest.catalogMetricIds !== expected.catalogMetricIds - metricIds.length
      || !metricIds.every((id) => catalog.metrics.some((metric) => metric.id === id))) {
    throw new Error('Der Bitcoin-Katalog hat nicht genau die fünf erwarteten Optionsmetriken.');
  }
  const masterBytes = fs.statSync(masterPath).size;
  const masterSha256 = await sha256File(masterPath);
  if (manifest.observations !== expected.rows || manifest.metricIdsWithObservations !== expected.metrics
      || manifest.coreMetricIdsWithObservations !== expected.coreWithData || manifest.cutoffInclusive !== '2026-09-28'
      || masterBytes !== expected.bytes || masterSha256 !== expected.sha256
      || manifest.masterBytes !== expected.bytes || manifest.masterSha256 !== expected.sha256
      || manifest.scope.remainingEmptyBitcoinMetricIds !== expected.emptyBitcoin
      || manifest.scope.remainingEmptyCoreMetricIds !== expected.emptyCore) {
    throw new Error('Der aktive Master weicht vom erwarteten geprüften Vorimportstand ab.');
  }
  const rawMeta = candidateManifest.rawBitcoinOnlySnapshot;
  if (candidateManifest.observations !== expected.addedRows || rawMeta.rows !== expected.rowsPerMetric
      || rawMeta.currency !== 'BTC' || rawMeta.nonBitcoinRowsWritten !== 0
      || rawMeta.firstDate !== '2026-08-05' || rawMeta.lastDate !== '2026-09-10'
      || candidateManifest.source.slug !== sourceSlug || candidateManifest.source.commitDate !== '2026-09-10'
      || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.sourceValuesProvisional !== true || candidateManifest.uploaded !== false
      || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('Das Optionskandidatenmanifest bestätigt nicht die erwartete Quelle, Lizenz und Bitcoin-only-Abdeckung.');
  }

  const rawPath = path.join(varDir, rawMeta.path);
  const rawBuffer = fs.readFileSync(rawPath);
  if (rawBuffer.length !== rawMeta.bytes || sha256(rawBuffer) !== rawMeta.sha256) {
    throw new Error('BTC-Options-Rohsnapshot und Manifest stimmen nicht überein.');
  }
  const rawLines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (rawLines.shift() !== 'date,currency,trades,notional_usd,premium_usd,put_share_pct,block_trades,source'
      || rawLines.length !== expected.rowsPerMetric) {
    throw new Error('BTC-Options-Rohsnapshot hat unerwarteten Header oder Zeilenzahl.');
  }
  const rawByDate = new Map();
  for (const [index, line] of rawLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 8 || cells[1] !== 'BTC' || cells[7] !== 'bykaranteli.com') {
      throw new Error('Nicht-Bitcoin- oder ungültige BTC-Optionsrohzeile ' + (index + 2) + '.');
    }
    if (rawByDate.has(cells[0])) throw new Error('Doppelter BTC-Options-UTC-Tag: ' + cells[0]);
    rawByDate.set(cells[0], Object.fromEntries(['trades', 'notional_usd', 'premium_usd', 'put_share_pct', 'block_trades']
      .map((field, offset) => [field, cells[offset + 2]])));
  }

  const candidateBuffer = fs.readFileSync(candidatePath);
  if (candidateBuffer.length !== candidateManifest.candidate.bytes
      || sha256(candidateBuffer) !== candidateManifest.candidate.sha256) {
    throw new Error('BTC-Options-Kandidaten-CSV und Manifest stimmen nicht überein.');
  }
  const candidateLines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (candidateLines.shift() !== header || candidateLines.length !== expected.addedRows) {
    throw new Error('BTC-Options-Kandidaten-CSV hat unerwarteten Header oder Zeilenzahl.');
  }
  const candidateKeys = new Set();
  const candidateCells = [];
  const candidateCounts = Object.fromEntries(metricIds.map((id) => [id, 0]));
  for (const [index, line] of candidateLines.entries()) {
    const cells = line.split(',');
    const sourceValues = rawByDate.get(cells[2]);
    const field = sourceFields[cells[0]];
    if (cells.length !== 9 || !metricIds.includes(cells[0]) || cells[1] !== 'main'
        || cells[4] !== sourceSlug || cells[5] !== '' || cells[6] !== 'provisional'
        || !field || !sourceValues || cells[3] !== sourceValues[field]
        || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(cells[3]) || !/^[0-9a-f]{64}$/.test(cells[8])) {
      throw new Error('Ungültige BTC-Options-Kandidatenzeile ' + (index + 2) + '.');
    }
    const key = cells[0] + '|' + cells[1] + '|' + cells[2];
    if (candidateKeys.has(key)) throw new Error('Doppelter BTC-Options-Kandidatenschlüssel: ' + key);
    candidateKeys.add(key);
    candidateCounts[cells[0]]++;
    candidateCells.push(cells);
  }
  if (metricIds.some((id) => candidateCounts[id] !== expected.rowsPerMetric)) {
    throw new Error('Eine BTC-Optionskennzahl hat nicht 37 Kandidatenwerte.');
  }

  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metricIdsSeen.size !== expected.metrics
      || current.coreWithData !== expected.coreWithData || current.emptyBitcoin.length !== expected.emptyBitcoin + metricIds.length
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
      || updated.metricIdsSeen.size !== expected.metrics + metricIds.length || updated.coreWithData !== expected.coreWithData
      || updated.emptyBitcoin.length !== expected.emptyBitcoin || updated.matchedCandidateKeys.size !== expected.addedRows
      || updated.rowsAfterCutoff !== 0) {
    throw new Error('Der vorbereitete Master erfüllt BTC-Optionsabdeckung und Schlüsselregeln nicht.');
  }

  const nextHash = await sha256File(nextMasterPath);
  const nextBytes = fs.statSync(nextMasterPath).size;
  const previousLatestRefresh = manifest.latestRefresh;
  manifest.generatedAt = '2026-09-30';
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
  manifest.scope.newBitcoinOptionsFlowObservations = expected.addedRows;
  manifest.scope.newBitcoinOptionsFlowMetricIds = metricIds;
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
    bykaranteliBitcoinOptionsFlow: {
      candidate: path.basename(candidatePath),
      manifest: path.basename(candidateManifestPath),
      sourceSlug,
      observations: expected.addedRows,
      metrics: metricIds,
      firstDate: '2026-08-05',
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
  manifest.qualityNotes.push('Added 37 daily BTC-only options-flow observations for five direct provider fields from the ByKaranteli CC0 Deribit + OKX archive. The pinned file ends 2026-09-10. Field formulas, put-share denominator and block threshold are not fully documented; no field was converted into options_put_call_ratio. Values remain provisional and local.');

  fs.writeFileSync(nextManifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(nextMasterPath, masterPath);
  fs.renameSync(nextManifestPath, manifestPath);
  fs.writeFileSync(nextCandidateManifestPath, JSON.stringify({
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
  }, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(nextCandidateManifestPath, candidateManifestPath);

  console.log(JSON.stringify({
    addedObservations: expected.addedRows,
    metricIds,
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
  console.error(error.message);
  process.exitCode = 1;
});
