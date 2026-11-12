const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-lightning-capacity-per-node-2026-09-29.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-lightning-capacity-per-node-2026-09-29.json');
const candidatePath = path.join(varDir, 'lightning-capacity-per-node-private-2026-09-29.csv');
const candidateManifestPath = path.join(varDir, 'lightning-capacity-per-node-private-2026-09-29.json');
const nextMasterPath = `${masterPath}.lightning-capacity-per-node.next`;
const nextManifestPath = `${manifestPath}.lightning-capacity-per-node.next`;

const HEADER = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const EXPECTED = {
  rows: 737119,
  metricIds: 143,
  bytes: 147553623,
  sha256: 'd63dcb5438c5942f1fb75f6a7d9cb961ff8d14c833dc60ccc5bcf8456da57daf',
  capacity: '3794.5151656',
  nodes: '16237',
  date: '2026-08-30',
};
const METRIC_ID = 'lightning_capacity_per_node_btc';

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

function decimalQuotient(value, divisor, precision = 12) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || !/^\d+$/.test(divisor) || BigInt(divisor) <= 0n) {
    throw new Error('Ungültiger Dezimalwert für die Lightning-Ableitung.');
  }
  const fraction = match[2] || '';
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(`${match[1]}${fraction}`) * (10n ** BigInt(precision));
  const denominator = scale * BigInt(divisor);
  const rounded = (numerator + denominator / 2n) / denominator;
  const digits = rounded.toString().padStart(precision + 1, '0');
  const whole = digits.slice(0, -precision);
  const decimal = digits.slice(-precision).replace(/0+$/, '');
  return decimal ? `${whole}.${decimal}` : whole;
}

function emptyBitcoinMetricIds(catalog, observedMetrics) {
  const excludedCrossMarketIds = new Set([
    'btc_gold_ratio', 'btc_sp500_corr_90d', 'btc_gold_corr_90d',
    'btc_sp500_corr_1y', 'btc_gold_corr_1y', 'btc_sp500_relative_return_1y_pct',
    'btc_real_price_usd',
  ]);
  return catalog.metrics
    .filter((metric) => metric.category !== 'macro' && !observedMetrics.has(metric.id)
      && !excludedCrossMarketIds.has(metric.id))
    .map((metric) => metric.id);
}

async function summarizeMaster(filename, catalog) {
  const metrics = new Set();
  const sources = {};
  const expectedInputs = { lightning_capacity_btc: [], lightning_nodes: [] };
  let targetRows = 0;
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) {
      if (line.replace(/^\uFEFF/, '') !== HEADER) throw new Error('Der aktive Master hat einen unerwarteten CSV-Header.');
      header = false;
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
    if (cells[0] === METRIC_ID) targetRows++;
    if (Object.hasOwn(expectedInputs, cells[0]) && cells[2] === EXPECTED.date) {
      expectedInputs[cells[0]].push(cells);
    }
  }
  if (header) throw new Error('Der aktive Master ist leer.');
  const knownMetrics = new Set(catalog.metrics.map((metric) => metric.id));
  const unknownMetrics = [...metrics].filter((id) => !knownMetrics.has(id));
  if (unknownMetrics.length) throw new Error(`Kennzahlen fehlen im Katalog: ${unknownMetrics.join(', ')}`);
  const coreSet = new Set(catalog.coreMetricIds);
  const coreWithData = [...coreSet].filter((id) => metrics.has(id)).length;
  return {
    rows, metrics, sources, firstDate, lastDate, rowsAfterCutoff, coreWithData, targetRows,
    emptyBitcoinMetricIds: emptyBitcoinMetricIds(catalog, metrics), expectedInputs,
  };
}

function validateInputRow(cells, metricId, value) {
  if (cells.length !== 9 || cells[0] !== metricId || cells[1] !== 'main'
      || cells[2] !== EXPECTED.date || cells[3] !== value
      || cells[4] !== 'mempool_space_lightning_research_only'
      || cells[5] !== `${EXPECTED.date}T00:00:00Z`
      || cells[6] !== 'provisional'
      || cells[7] !== `mempool-space-lightning-${metricId === 'lightning_nodes' ? 'statistics-latest' : 'history-3y'}:${EXPECTED.date}`
      || !/^[a-f0-9]{64}$/.test(cells[8])) {
    throw new Error(`Die Eingangsbeobachtung ${metricId} am ${EXPECTED.date} weicht unerwartet ab.`);
  }
}

async function main() {
  for (const filename of [masterPath, manifestPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error(`Erforderliche Datei fehlt: ${path.basename(filename)}`);
  }
  for (const filename of [backupPath, manifestBackupPath, candidatePath, candidateManifestPath, nextMasterPath, nextManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Zieldatei existiert bereits; zur Sicherheit wird nichts überschrieben: ${path.basename(filename)}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!catalog.metrics.some((metric) => metric.id === METRIC_ID)) throw new Error(`${METRIC_ID} fehlt im Katalog.`);
  if (manifest.observations !== EXPECTED.rows || manifest.metricIdsWithObservations !== EXPECTED.metricIds
      || manifest.coreMetricIdsWithObservations !== 91 || manifest.cutoffInclusive !== '2026-09-28') {
    throw new Error('Das Manifest entspricht nicht dem erwarteten Bitcoin-only Stand vor diesem Ein-Zeilen-Import.');
  }
  const originalMasterBytes = fs.statSync(masterPath).size;
  const originalMasterSha256 = await sha256File(masterPath);
  if (originalMasterBytes !== EXPECTED.bytes || originalMasterSha256 !== EXPECTED.sha256) {
    throw new Error('Der aktive Master weicht von der geprüften Ausgangsversion ab.');
  }

  const current = await summarizeMaster(masterPath, catalog);
  if (current.rows !== EXPECTED.rows || current.metrics.size !== EXPECTED.metricIds
      || current.coreWithData !== 91 || current.rowsAfterCutoff !== 0
      || current.targetRows !== 0 || current.emptyBitcoinMetricIds.length !== 41) {
    throw new Error('Die Beobachtungszahlen oder die bisherige Abdeckung weichen unerwartet ab.');
  }
  if (current.expectedInputs.lightning_capacity_btc.length !== 1 || current.expectedInputs.lightning_nodes.length !== 1) {
    throw new Error('Für den Snapshot müssen genau eine Kapazitäts- und eine Node-Beobachtung vorliegen.');
  }
  const capacity = current.expectedInputs.lightning_capacity_btc[0];
  const nodes = current.expectedInputs.lightning_nodes[0];
  validateInputRow(capacity, 'lightning_capacity_btc', EXPECTED.capacity);
  validateInputRow(nodes, 'lightning_nodes', EXPECTED.nodes);
  if (capacity[5] !== nodes[5]) throw new Error('Kapazität und Node-Anzahl haben keinen identischen UTC-Zeitpunkt.');

  const value = decimalQuotient(capacity[3], nodes[3]);
  const inputIdentity = {
    formula: 'lightning_capacity_btc / lightning_nodes',
    date: EXPECTED.date,
    inputRows: [capacity, nodes],
  };
  const row = [
    METRIC_ID, 'main', EXPECTED.date, value, 'derived_bitcoin_metrics', capacity[5], 'provisional',
    `mempool-space-lightning-capacity-per-node:${EXPECTED.date}`,
    sha256Buffer(Buffer.from(JSON.stringify(inputIdentity), 'utf8')),
  ].join(',');
  const masterStat = fs.statSync(masterPath);
  const tail = Buffer.alloc(Math.min(2, masterStat.size));
  const masterFd = fs.openSync(masterPath, 'r');
  fs.readSync(masterFd, tail, 0, tail.length, masterStat.size - tail.length);
  fs.closeSync(masterFd);
  const lineEnding = tail.includes(0x0d) ? '\r\n' : '\n';
  const masterEndsWithLineEnding = tail[tail.length - 1] === 0x0a;
  const appendText = `${masterEndsWithLineEnding ? '' : lineEnding}${row}${lineEnding}`;
  const candidateBuffer = Buffer.from(`${HEADER}${lineEnding}${row}${lineEnding}`, 'utf8');
  const candidateManifest = {
    createdAt: new Date().toISOString(),
    cutoffInclusive: '2026-09-28',
    observations: 1,
    metricIds: [METRIC_ID],
    metricCounts: { [METRIC_ID]: 1 },
    sourceCounts: { derived_bitcoin_metrics: 1 },
    firstObservationDate: EXPECTED.date,
    lastObservationDate: EXPECTED.date,
    formula: inputIdentity.formula,
    inputs: {
      lightning_capacity_btc: { value: capacity[3], source: capacity[4], sourceRevision: capacity[7], rawPayloadHash: capacity[8] },
      lightning_nodes: { value: nodes[3], source: nodes[4], sourceRevision: nodes[7], rawPayloadHash: nodes[8] },
    },
    output: { metricId: METRIC_ID, value, source: 'derived_bitcoin_metrics', sourceTimestamp: capacity[5], quality: 'provisional', rawPayloadHash: row.split(',')[8] },
    csv: { path: path.basename(candidatePath), bytes: candidateBuffer.length, sha256: sha256Buffer(candidateBuffer) },
    mergedIntoMaster: true,
    localPrivateResearchOnly: true,
    dataReuseLicenseConfirmed: false,
    publicRedistributionCleared: false,
    uploaded: false,
  };

  fs.writeFileSync(candidatePath, candidateBuffer, { flag: 'wx' });
  fs.writeFileSync(candidateManifestPath, `${JSON.stringify(candidateManifest, null, 2)}\n`, { flag: 'wx' });
  fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(manifestPath, manifestBackupPath, fs.constants.COPYFILE_EXCL);
  if (await sha256File(backupPath) !== EXPECTED.sha256 || fs.statSync(backupPath).size !== EXPECTED.bytes) {
    throw new Error('Die exakte Master-Sicherung konnte nicht bestätigt werden.');
  }

  fs.copyFileSync(masterPath, nextMasterPath, fs.constants.COPYFILE_EXCL);
  fs.appendFileSync(nextMasterPath, appendText, 'utf8');
  const updated = await summarizeMaster(nextMasterPath, catalog);
  if (updated.rows !== EXPECTED.rows + 1 || updated.metrics.size !== EXPECTED.metricIds + 1
      || updated.coreWithData !== 91 || updated.emptyBitcoinMetricIds.length !== 40
      || updated.targetRows !== 1 || updated.rowsAfterCutoff !== 0
      || updated.sources.derived_bitcoin_metrics !== current.sources.derived_bitcoin_metrics + 1) {
    throw new Error('Der vorbereitete Master hat nach dem Anhängen nicht die erwarteten Ein-Zeilen-Summen.');
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
  manifest.scope.newObservationsAfterPreviousLocalMaster += 1;
  manifest.scope.remainingEmptyBitcoinMetricIds = updated.emptyBitcoinMetricIds.length;
  manifest.scope.remainingEmptyCoreMetricIds = manifest.emptyCoreMetricIds;
  manifest.previousLatestRefresh = previousLatestRefresh;
  manifest.latestRefresh = {
    runDate: '2026-09-29',
    cutoffInclusive: '2026-09-28',
    previousMasterRows: updated.rows - 1,
    masterRows: updated.rows,
    netRowIncrease: 1,
    masterSha256: newMasterSha256,
    masterBytes: newMasterBytes,
    previousMasterBackup: {
      path: path.basename(backupPath),
      sha256: EXPECTED.sha256,
      bytes: EXPECTED.bytes,
    },
    lightningCapacityPerNodeSnapshot: candidateManifest,
    uploaded: false,
  };
  manifest.qualityNotes.push(`One provisional private Bitcoin Lightning observation was derived for ${EXPECTED.date}: total public channel capacity divided by same-time public node count. It is one snapshot only; no gaps were filled and public redistribution is not cleared. The master was not uploaded.`);
  fs.writeFileSync(nextManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });

  try {
    fs.renameSync(nextMasterPath, masterPath);
    fs.renameSync(nextManifestPath, manifestPath);
  } catch (error) {
    fs.copyFileSync(backupPath, masterPath);
    fs.copyFileSync(manifestBackupPath, manifestPath);
    throw error;
  }

  const finalMasterSha256 = await sha256File(masterPath);
  if (finalMasterSha256 !== newMasterSha256 || fs.statSync(masterPath).size !== newMasterBytes) {
    fs.copyFileSync(backupPath, masterPath);
    fs.copyFileSync(manifestBackupPath, manifestPath);
    throw new Error('Der abgeschlossene Master stimmt nicht mit der vorbereiteten Datei überein; die Sicherung wurde wiederhergestellt.');
  }
  console.log(JSON.stringify({
    metricId: METRIC_ID,
    date: EXPECTED.date,
    formula: inputIdentity.formula,
    value,
    observations: updated.rows,
    metricIdsWithObservations: updated.metrics.size,
    coreMetricIdsWithObservations: updated.coreWithData,
    emptyBitcoinMetricIds: updated.emptyBitcoinMetricIds.length,
    candidate: path.basename(candidatePath),
    backup: path.basename(backupPath),
    masterBytes: newMasterBytes,
    masterSha256: newMasterSha256,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
