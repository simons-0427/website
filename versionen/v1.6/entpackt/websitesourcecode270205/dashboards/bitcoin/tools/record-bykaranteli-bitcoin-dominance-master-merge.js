const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const candidatePath = path.join(varDir, 'bykaranteli-bitcoin-dominance-btc-import-through-2026-09-10.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-bitcoin-dominance-btc-import-through-2026-09-10.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-bitcoin-dominance-2026-09-29.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-bitcoin-dominance-2026-09-29.json');
const nextMasterPath = `${masterPath}.bykaranteli-bitcoin-dominance.next`;
const nextManifestPath = `${manifestPath}.bykaranteli-bitcoin-dominance.next`;
const nextCandidateManifestPath = `${candidateManifestPath}.next`;
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sourceSlug = 'bykaranteli_btc_dominance_cc0';
const expected = {
  rows: 738428,
  metricIds: 148,
  bytes: 147825865,
  sha256: 'cc84f72baed14ec3be2c7a4425121e09de797bbe79d83c9ed3e02db4c696f836',
  coreWithData: 91,
  emptyBitcoinMetrics: 36,
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
    if (candidateKeys.has(`${cells[0]}\x1f${cells[1]}\x1f${cells[2]}`)) matchedCandidateKeys.add(`${cells[0]}\x1f${cells[1]}\x1f${cells[2]}`);
  }
  if (isHeader) throw new Error('Der aktive Master ist leer.');
  const coreSet = new Set(catalog.coreMetricIds);
  return {
    rows,
    metrics,
    sources,
    firstDate,
    lastDate,
    rowsAfterCutoff,
    coreWithData: [...coreSet].filter((id) => metrics.has(id)).length,
    emptyBitcoin: emptyBitcoinMetricIds(catalog, metrics),
    matchedCandidateKeys,
  };
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
    throw new Error('Das Manifest entspricht nicht dem erwarteten Stand vor der BTC-Dominanz-Ergänzung.');
  }
  if (candidateManifest.observations !== 50 || candidateManifest.rawBitcoinOnlySnapshot.fieldsWritten.join(',') !== 'date,btc_dominance_pct'
      || candidateManifest.rawBitcoinOnlySnapshot.otherSourceFieldsWritten !== 0
      || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.uploaded !== false || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('Das Kandidatenmanifest weist nicht den gefilterten CC0-BTC-Dominanzimport aus.');
  }
  const candidateBuffer = fs.readFileSync(candidatePath);
  if (candidateBuffer.length !== candidateManifest.candidate.bytes
      || sha256Buffer(candidateBuffer) !== candidateManifest.candidate.sha256) {
    throw new Error('Kandidaten-CSV und Kandidatenmanifest stimmen nicht überein.');
  }
  const candidateLines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (candidateLines.shift() !== header || candidateLines.length !== 50) throw new Error('BTC-Dominanzkandidat hat einen falschen Header oder eine falsche Länge.');
  const keys = new Set();
  const candidateKeys = new Set();
  const candidateRows = [];
  for (const [index, line] of candidateLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9 || cells[0] !== 'btc_dominance_pct' || cells[1] !== 'main'
        || cells[4] !== sourceSlug || cells[5] !== '' || cells[6] !== 'provisional'
        || cells[2] < '2026-07-23' || cells[2] > '2026-09-10'
        || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cells[3]) || Number(cells[3]) <= 0 || Number(cells[3]) >= 100
        || !/^[a-f0-9]{64}$/.test(cells[8])) {
      throw new Error(`Ungültige oder nicht Bitcoin-only Kandidatenzeile ${index + 2}.`);
    }
    const key = `${cells[0]}\x1f${cells[1]}\x1f${cells[2]}`;
    if (keys.has(key)) throw new Error(`Doppelter BTC-Dominanztag: ${cells[2]}`);
    keys.add(key);
    candidateKeys.add(key);
    candidateRows.push(cells);
  }
  if (!catalog.metrics.some((metric) => metric.id === 'btc_dominance_pct')) throw new Error('btc_dominance_pct fehlt im Katalog.');
  const currentSha256 = await sha256File(masterPath);
  if (fs.statSync(masterPath).size !== expected.bytes || currentSha256 !== expected.sha256) {
    throw new Error('Der aktive Master weicht von der geprüften Bitcoin-only Ausgangsversion ab.');
  }
  const current = await summarizeMaster(masterPath, catalog, candidateKeys);
  if (current.rows !== expected.rows || current.metrics.size !== expected.metricIds
      || current.coreWithData !== expected.coreWithData || current.emptyBitcoin.length !== expected.emptyBitcoinMetrics
      || current.rowsAfterCutoff !== 0 || current.matchedCandidateKeys.size !== 0
      || current.metrics.has('btc_dominance_pct')) {
    throw new Error('BTC-Dominanzdaten überschneiden sich unerwartet mit dem bestehenden Master.');
  }

  const updatedCandidateManifest = { ...candidateManifest, mergedIntoMaster: true };
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
  if (updated.rows !== expected.rows + 50 || updated.metrics.size !== expected.metricIds + 1
      || updated.coreWithData !== expected.coreWithData || updated.emptyBitcoin.length !== expected.emptyBitcoinMetrics - 1
      || updated.matchedCandidateKeys.size !== candidateKeys.size || updated.rowsAfterCutoff !== 0) {
    throw new Error('Der vorbereitete Master hat nicht die erwartete BTC-Dominanzabdeckung.');
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
    previousMasterBackup: { path: path.basename(backupPath), sha256: expected.sha256, bytes: expected.bytes },
    bykaranteliBitcoinDominance: {
      candidate: path.basename(candidatePath),
      manifest: path.basename(candidateManifestPath),
      sourceSlug,
      observations: candidateRows.length,
      metricIds: ['btc_dominance_pct'],
      firstDate: '2026-07-23',
      lastDate: '2026-09-10',
      fieldsWritten: ['date', 'btc_dominance_pct'],
      otherSourceFieldsWritten: 0,
      sourceLicense: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-29',
      sourceUrl: candidateManifest.source.url,
      uploaded: false,
    },
    uploaded: false,
  };
  manifest.qualityNotes.push('Added 50 provisional Bitcoin dominance observations from the source daily-market file for 2026-07-23 through 2026-09-10. Only the date and BTC dominance field were kept; no other source columns or observations were imported. The data remained local.');
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
    metricId: 'btc_dominance_pct',
    firstDate: '2026-07-23',
    lastDate: '2026-09-10',
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
