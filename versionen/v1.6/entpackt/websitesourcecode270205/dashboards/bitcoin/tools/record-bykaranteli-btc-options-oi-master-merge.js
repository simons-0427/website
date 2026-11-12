const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-btc-options-oi-import-through-2026-08-30.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-btc-options-oi-import-through-2026-08-30.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-btc-options-oi-2026-09-30.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-btc-options-oi-2026-09-30.json');
const nextMasterPath = masterPath + '.bykaranteli-btc-options-oi.next';
const nextManifestPath = manifestPath + '.bykaranteli-btc-options-oi.next';
const nextCandidateManifestPath = candidateManifestPath + '.next';
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const rawHeader = 'date,currency,instrument,expiry,strike,type,open_interest,mark_iv,underlying_usd,source';
const metricId = 'options_open_interest_usd';
const sourceSlug = 'bykaranteli_btc_options_oi_cc0';
const expected = {
  rows: 738604,
  metricIdsWithObservations: 152,
  bytes: 147864042,
  sha256: 'ec209daaba61c944dd56c600b035fc281821a021ee1e6d883acfd249da63e7f8',
  coreWithData: 91,
  emptyBitcoinMetrics: 32,
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
    throw new Error('Der Master weicht vom erwarteten Stand vor dem Options-OI-Import ab.');
  }
  if (manifest.scope.remainingEmptyBitcoinMetricIds !== expected.emptyBitcoinMetrics
      || manifest.scope.remainingEmptyCoreMetricIds !== expected.emptyCoreMetrics) {
    throw new Error('Die Kennzahlenabdeckung stimmt nicht mit dem erwarteten Vorimportstand überein.');
  }
  if (candidateManifest.observations !== 1
      || candidateManifest.rawBitcoinOnlySnapshot.rows !== 1026
      || candidateManifest.rawBitcoinOnlySnapshot.currency !== 'BTC'
      || candidateManifest.rawBitcoinOnlySnapshot.otherCurrenciesWritten !== 0
      || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.sourceValuesProvisional !== true
      || candidateManifest.uploaded !== false
      || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('Der Options-OI-Kandidatenmanifest bestätigt die Bitcoin-only CC0-Abdeckung nicht.');
  }

  const rawPath = path.join(varDir, candidateManifest.rawBitcoinOnlySnapshot.path);
  const rawBuffer = fs.readFileSync(rawPath);
  if (rawBuffer.length !== candidateManifest.rawBitcoinOnlySnapshot.bytes
      || sha256Buffer(rawBuffer) !== candidateManifest.rawBitcoinOnlySnapshot.sha256) {
    throw new Error('Bitcoin-Optionsrohdatei und Manifest stimmen nicht überein.');
  }
  const rawLines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (rawLines.shift() !== rawHeader || rawLines.length !== 1026) throw new Error('BTC-Optionsrohdatei hat unerwarteten Header oder Zeilenzahl.');
  for (const [index, line] of rawLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 10 || cells[0] !== '2026-08-30' || cells[1] !== 'BTC'
        || !cells[2].startsWith('BTC-') || cells[9] !== 'bykaranteli.com') {
      throw new Error('Nicht-Bitcoin- oder ungültige Optionsrohzeile ' + (index + 2));
    }
  }

  const candidateBuffer = fs.readFileSync(candidatePath);
  if (candidateBuffer.length !== candidateManifest.candidate.bytes
      || sha256Buffer(candidateBuffer) !== candidateManifest.candidate.sha256) {
    throw new Error('Options-OI-Kandidaten-CSV und Manifest stimmen nicht überein.');
  }
  const candidateLines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (candidateLines.shift() !== header || candidateLines.length !== 1) throw new Error('Options-OI-Kandidaten-CSV hat unerwarteten Header oder Zeilenzahl.');
  const cells = candidateLines[0].split(',');
  if (cells.length !== 9 || cells[0] !== metricId || cells[1] !== 'main'
      || cells[2] !== '2026-08-30' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cells[3])
      || cells[4] !== sourceSlug || cells[5] !== '' || cells[6] !== 'provisional'
      || !cells[7].endsWith(':2026-08-30') || !/^[0-9a-f]{64}$/.test(cells[8])) {
    throw new Error('Options-OI-Kandidatenzeile passt nicht zum Bitcoin-Snapshot.');
  }
  if (!catalog.metrics.some((metric) => metric.id === metricId)) throw new Error('Kennzahl fehlt im Katalog: ' + metricId);

  const candidateKey = metricId + '\x1fmain\x1f2026-08-30';
  const candidateKeys = new Set([candidateKey]);
  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metricIdsSeen.size !== expected.metricIdsWithObservations
      || current.coreWithData !== expected.coreWithData || current.emptyBitcoin.length !== expected.emptyBitcoinMetrics
      || current.rowsAfterCutoff !== 0 || current.matchedCandidateKeys.size !== 0) {
    throw new Error('Der Masterinhalt entspricht nicht dem erwarteten Reihen- und Schlüsselstand.');
  }
  if (current.metricIdsSeen.has(metricId)) throw new Error('Options-OI-Kennzahl ist entgegen der Erwartung bereits befüllt.');

  const tail = Buffer.alloc(Math.min(4096, masterBytes));
  const fd = fs.openSync(masterPath, 'r');
  fs.readSync(fd, tail, 0, tail.length, masterBytes - tail.length);
  fs.closeSync(fd);
  const lineEnding = tail.includes(0x0d) ? '\r\n' : '\n';
  const appendText = (tail[tail.length - 1] === 0x0a ? '' : lineEnding)
    + cells.join(',') + lineEnding;

  const updatedCandidateManifest = {
    ...candidateManifest,
    mergedIntoMaster: true,
    mergedAt: new Date().toISOString(),
    master: {
      path: path.basename(masterPath),
      previousRows: expected.rows,
      addedRows: 1,
      expectedRows: expected.rows + 1,
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
  if (updated.rows !== expected.rows + 1
      || updated.metricIdsSeen.size !== expected.metricIdsWithObservations + 1
      || updated.coreWithData !== expected.coreWithData
      || updated.emptyBitcoin.length !== expected.emptyBitcoinMetrics - 1
      || updated.matchedCandidateKeys.size !== 1
      || updated.rowsAfterCutoff !== 0) {
    throw new Error('Der vorbereitete Master hat nicht die erwartete Bitcoin-Options-OI-Abdeckung.');
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
  manifest.scope.newObservationsAfterPreviousLocalMaster += 1;
  manifest.scope.remainingEmptyBitcoinMetricIds = updated.emptyBitcoin.length;
  manifest.scope.remainingEmptyCoreMetricIds = manifest.emptyCoreMetricIds;
  manifest.previousLatestRefresh = previousLatestRefresh;
  manifest.latestRefresh = {
    runDate: '2026-09-30',
    cutoffInclusive: '2026-09-28',
    previousMasterRows: expected.rows,
    masterRows: updated.rows,
    netRowIncrease: 1,
    masterSha256: newMasterSha256,
    masterBytes: newMasterBytes,
    previousMasterBackup: {
      path: path.basename(backupPath),
      sha256: expected.sha256,
      bytes: expected.bytes,
    },
    bykaranteliBitcoinOptionsOpenInterest: {
      candidate: path.basename(candidatePath),
      manifest: path.basename(candidateManifestPath),
      sourceSlug,
      observations: 1,
      metricId,
      snapshotDate: '2026-08-30',
      rawBitcoinOnlyInstruments: candidateManifest.rawBitcoinOnlySnapshot.instruments,
      expiries: candidateManifest.rawBitcoinOnlySnapshot.expiries,
      method: candidateManifest.method,
      valueUsd: cells[3],
      sourceLicense: candidateManifest.source.license,
      sourceUrl: candidateManifest.source.url,
      uploaded: false,
    },
    uploaded: false,
  };
  manifest.qualityNotes.push('Added one provisional Bitcoin-only options open-interest snapshot from ByKaranteli CC0 data for 2026-08-30. The USD notional multiplies Deribit BTC open interest by the source-row underlying USD price for each of 1,026 reported BTC option instruments. ETH instruments were excluded. It is a single Deribit snapshot, not an all-exchange historical series. The data remained local.');
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
    addedObservations: 1,
    metricId,
    date: '2026-08-30',
    valueUsd: cells[3],
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

