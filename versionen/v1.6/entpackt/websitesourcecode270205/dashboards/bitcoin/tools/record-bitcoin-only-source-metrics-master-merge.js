const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const rootManifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'bitcoin-only-source-metrics-candidate-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'bitcoin-only-source-metrics-candidate-through-2026-09-28.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bitcoin-only-source-metrics-2026-09-30.csv');
const nextMasterPath = `${masterPath}.next`;
const nextManifestPath = `${rootManifestPath}.next`;
const mergeManifestPath = path.join(varDir, 'bitcoin-only-source-metrics-master-merge-through-2026-09-28.json');
const cutoff = '2026-09-28';
const targetMetrics = new Set(['price_gold_oz', 'etf_holdings_btc']);
const expectedSourceByMetric = {
  price_gold_oz: 'bitcoin_gold_ratio_private',
  etf_holdings_btc: 'bitcoin_etf_holdings_private',
};

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(filename);
  for await (const chunk of input) hash.update(chunk);
  return hash.digest('hex');
}

function csvHeader(line) {
  return line.replace(/^\uFEFF/, '');
}

async function inspectMaster(filename, catalog) {
  const input = fs.createReadStream(filename, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const metricIds = new Set();
  const coreIds = new Set();
  const sourceCounts = {};
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  let firstLine = true;
  for await (const line of lines) {
    if (firstLine) {
      firstLine = false;
      if (csvHeader(line) !== importHeader) throw new Error('Unerwarteter Master-CSV-Kopf.');
      continue;
    }
    if (!line) continue;
    rows += 1;
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Master-Zeile ${rows + 1}.`);
    const [metricId, , date, , sourceSlug] = cells;
    metricIds.add(metricId);
    if (catalog.coreMetricIds.includes(metricId)) coreIds.add(metricId);
    sourceCounts[sourceSlug] = (sourceCounts[sourceSlug] || 0) + 1;
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;
    if (date > cutoff) rowsAfterCutoff += 1;
  }
  const emptyMetricIds = catalog.metrics.map((metric) => metric.id).filter((metricId) => !metricIds.has(metricId)).sort();
  const emptyCoreMetricIds = catalog.coreMetricIds.filter((metricId) => !coreIds.has(metricId)).sort();
  return {
    rows,
    metricIds: metricIds.size,
    coreMetricIds: coreIds.size,
    emptyMetricIds,
    emptyCoreMetricIds,
    firstDate,
    lastDate,
    rowsAfterCutoff,
    sourceCounts,
  };
}

async function main() {
  for (const filename of [masterPath, rootManifestPath, candidatePath, candidateManifestPath]) {
    if (!fs.existsSync(filename)) throw new Error(`Datei fehlt: ${path.relative(root, filename)}`);
  }
  if (fs.existsSync(nextMasterPath) || fs.existsSync(nextManifestPath)) {
    throw new Error('Eine temporäre Merge-Datei existiert bereits.');
  }

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8'));
  const candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const candidateBytes = fs.readFileSync(candidatePath);
  const candidateHash = sha256(candidateBytes);
  if (candidateHash !== candidateManifest.candidateSha256) throw new Error('Der Kandidaten-Hash passt nicht zum Kandidatenmanifest.');
  if (candidateManifest.cutoffInclusive !== cutoff || candidateManifest.uploaded !== false || candidateManifest.publicRedistributionCleared !== false) {
    throw new Error('Stichtag oder private Verwendungsgrenze im Kandidatenmanifest weicht ab.');
  }

  const masterHash = await sha256File(masterPath);
  if (masterHash !== rootManifest.masterSha256) throw new Error(`Der Master-Hash passt nicht zum bisherigen Manifest: ${masterHash}`);
  const before = await inspectMaster(masterPath, catalog);
  if (before.rows !== rootManifest.observations || before.metricIds !== rootManifest.metricIdsWithObservations) {
    throw new Error('Master-Zeilen oder Kennzahlzahl weichen vom bisherigen Manifest ab.');
  }

  const existingTargetIds = new Set();
  const currentReader = readline.createInterface({ input: fs.createReadStream(masterPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let skipHeader = true;
  for await (const line of currentReader) {
    if (skipHeader) { skipHeader = false; continue; }
    if (!line) continue;
    const cells = line.split(',');
    if (targetMetrics.has(cells[0])) existingTargetIds.add(cells[0]);
  }
  if (existingTargetIds.size) throw new Error(`Zielkennzahlen sind im Master nicht mehr leer: ${[...existingTargetIds].join(', ')}`);

  const candidateLines = candidateBytes.toString('utf8').trimEnd().split(/\r?\n/);
  if (csvHeader(candidateLines.shift()) !== importHeader) throw new Error('Der Kandidaten-CSV-Kopf weicht ab.');
  const candidateKeys = new Set();
  const metricCounts = {};
  const metricDates = {};
  const sourceCounts = {};
  const additions = [];
  for (const [index, line] of candidateLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Kandidatenzeile ${index + 2}.`);
    const [metricId, seriesKey, date, value, sourceSlug, sourceTimestamp, quality, revision, hash] = cells;
    if (!targetMetrics.has(metricId) || expectedSourceByMetric[metricId] !== sourceSlug) throw new Error(`Nicht zugelassene Quelle oder Kennzahl: ${metricId}/${sourceSlug}`);
    if (seriesKey !== 'main' || date > cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(value)
      || sourceTimestamp !== `${date}T00:00:00Z` || quality !== 'provisional'
      || !revision || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Ungültiger Kandidat: ${metricId}/${date}`);
    }
    const key = `${metricId}/${seriesKey}/${date}`;
    if (candidateKeys.has(key)) throw new Error(`Doppelter Kandidat: ${key}`);
    candidateKeys.add(key);
    additions.push(line);
    metricCounts[metricId] = (metricCounts[metricId] || 0) + 1;
    metricDates[metricId] ||= [];
    metricDates[metricId].push(date);
    sourceCounts[sourceSlug] = (sourceCounts[sourceSlug] || 0) + 1;
  }
  if (additions.length !== candidateManifest.candidateRows
    || metricCounts.price_gold_oz !== candidateManifest.metrics.price_gold_oz.observations
    || metricCounts.etf_holdings_btc !== candidateManifest.metrics.etf_holdings_btc.observations) {
    throw new Error('Die Kandidatenzeilen stimmen nicht mit dem Kandidatenmanifest überein.');
  }

  if (fs.existsSync(backupPath)) {
    if ((await sha256File(backupPath)) !== masterHash || fs.statSync(backupPath).size !== fs.statSync(masterPath).size) {
      throw new Error('Die bestehende Sicherung passt nicht zum Eingabe-Master.');
    }
  } else {
    fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
  }

  fs.copyFileSync(masterPath, nextMasterPath, fs.constants.COPYFILE_EXCL);
  const masterBytes = fs.statSync(masterPath).size;
  const lastByte = Buffer.alloc(1);
  const masterFd = fs.openSync(masterPath, 'r');
  try { fs.readSync(masterFd, lastByte, 0, 1, masterBytes - 1); } finally { fs.closeSync(masterFd); }
  const separator = lastByte[0] === 10 ? '' : '\n';
  fs.appendFileSync(nextMasterPath, `${separator}${additions.join('\n')}\n`, 'utf8');
  const afterBytes = fs.statSync(nextMasterPath).size;
  if (afterBytes <= masterBytes) throw new Error('Der Kandidat wurde nicht an den Master angehängt.');
  const after = await inspectMaster(nextMasterPath, catalog);
  if (after.rows !== before.rows + additions.length || after.rowsAfterCutoff !== 0) {
    throw new Error('Die neue Masterdatei hat unerwartete Zeilen oder Daten nach dem Stichtag.');
  }

  const nextHash = await sha256File(nextMasterPath);
  const candidateFileRecord = {
    path: path.basename(candidatePath),
    sha256: candidateHash,
    includedRows: additions.length,
    rowsAfterCutoff: 0,
    sourceCounts,
    metricCounts,
  };
  const refreshRecord = {
    runDate: '2026-09-30',
    cutoffInclusive: cutoff,
    previousMasterRows: before.rows,
    previousMasterBytes: masterBytes,
    previousMasterSha256: masterHash,
    candidateRowsThroughCutoff: additions.length,
    observationsUpdated: 0,
    rowsRefreshed: 0,
    valuesChanged: 0,
    valuesAlreadyIdentical: 0,
    observationsAdded: additions.length,
    candidatesSkippedForDifferentSource: 0,
    skippedDifferentSourceByMetric: {},
    metricsUpdated: {},
    discardedCandidateRowsAfterCutoff: 0,
    candidateFiles: [candidateFileRecord],
    masterRows: after.rows,
    masterBytes: afterBytes,
    masterSha256: nextHash,
    metricIdsWithObservations: after.metricIds,
    coreMetricIdsWithObservations: after.coreMetricIds,
    emptyMetricIds: after.emptyMetricIds.length,
    emptyMetricIdList: after.emptyMetricIds,
    emptyCoreMetricIds: after.emptyCoreMetricIds.length,
    emptyCoreMetricIdList: after.emptyCoreMetricIds,
    firstObservationDate: after.firstDate,
    lastObservationDate: after.lastDate,
    rowsAfterCutoff: after.rowsAfterCutoff,
    sourceCounts: after.sourceCounts,
    bitcoinOnly: true,
    privateLocalResearchOnly: true,
    uploaded: false,
    publicRedistributionCleared: false,
    metrics: Object.fromEntries(Object.entries(metricDates).map(([metricId, dates]) => [metricId, {
      observations: dates.length,
      firstDate: dates.sort()[0],
      lastDate: dates.at(-1),
    }])),
  };

  rootManifest.generatedAt = '2026-09-30';
  rootManifest.masterBytes = afterBytes;
  rootManifest.masterSha256 = nextHash;
  rootManifest.observations = after.rows;
  rootManifest.metricIdsWithObservations = after.metricIds;
  rootManifest.catalogMetricIds = catalog.metrics.length;
  rootManifest.coreMetricIdsWithObservations = after.coreMetricIds;
  rootManifest.coreMetricIds = catalog.coreMetricIds.length;
  rootManifest.emptyMetricIds = after.emptyMetricIds.length;
  rootManifest.emptyMetricIdList = after.emptyMetricIds;
  rootManifest.emptyCoreMetricIds = after.emptyCoreMetricIds.length;
  rootManifest.emptyCoreMetricIdList = after.emptyCoreMetricIds;
  rootManifest.firstObservationDate = after.firstDate;
  rootManifest.lastObservationDate = after.lastDate;
  rootManifest.rowsAfterCutoff = after.rowsAfterCutoff;
  rootManifest.sourceCounts = after.sourceCounts;
  rootManifest.latestSourceRefresh = refreshRecord;
  rootManifest.sourceRefreshHistory ||= [];
  if (rootManifest.sourceRefreshHistory.some((record) => record.candidateFiles?.some((file) => file.sha256 === candidateHash))) {
    throw new Error('Dieses Kandidatenset steht bereits in der Quellenhistorie.');
  }
  rootManifest.sourceRefreshHistory.push(refreshRecord);
  rootManifest.scope ||= {};
  const metricCategoryById = new Map(catalog.metrics.map((metric) => [metric.id, metric.category]));
  const remainingEmptyBitcoinMetricIds = after.emptyMetricIds
    .filter((metricId) => metricCategoryById.get(metricId) !== 'macro')
    .sort();
  rootManifest.scope.remainingEmptyBitcoinMetricIds = remainingEmptyBitcoinMetricIds;
  rootManifest.scope.remainingEmptyCoreMetricIds = after.emptyCoreMetricIds;
  rootManifest.scope.sourceRefresh = {
    candidateRowsThroughCutoff: additions.length,
    observationsUpdated: 0,
    observationsAdded: additions.length,
    skippedForDifferentSource: 0,
    candidateFiles: [path.basename(candidatePath)],
  };
  rootManifest.scope.latestPrivateBitcoinOnlyMetrics = {
    candidate: path.basename(candidatePath),
    observations: additions.length,
    metrics: refreshRecord.metrics,
    uploaded: false,
    publicRedistributionCleared: false,
  };
  rootManifest.qualityNotes ||= [];
  rootManifest.qualityNotes.push('2026-09-30: added 193 private monthly BTC/Gold ratio observations using Coin Metrics BTC PriceUSD and World Bank Pink Sheet gold monthly averages; the gold series is used only as a denominator and no standalone gold metric was imported.');
  rootManifest.qualityNotes.push('2026-09-30: added 17 private exact-common-date US spot ETF holdings sums for five products only; this is not total US spot ETF holdings, missing dates were not filled, and public redistribution was not cleared.');

  const nextManifestBytes = Buffer.from(`${JSON.stringify(rootManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(nextManifestPath, nextManifestBytes, { flag: 'wx' });
  const mergeSummary = {
    master: path.relative(root, masterPath),
    masterRowsBefore: before.rows,
    masterRowsAfter: after.rows,
    priorMasterSha256: masterHash,
    masterSha256: nextHash,
    masterBytes: afterBytes,
    priorMasterPreservedAsBytePrefix: true,
    backup: path.relative(root, backupPath),
    candidate: path.relative(root, candidatePath),
    candidateSha256: candidateHash,
    addedRows: additions.length,
    sourceCounts,
    metrics: refreshRecord.metrics,
    metricIdsWithObservations: after.metricIds,
    coreMetricIdsWithObservations: after.coreMetricIds,
    emptyMetricIds: after.emptyMetricIds.length,
    emptyMetricIdsRemainingForBitcoin: remainingEmptyBitcoinMetricIds.length,
    remainingEmptyBitcoinMetricIds,
    emptyCoreMetricIds: after.emptyCoreMetricIds,
    firstObservationDate: after.firstDate,
    lastObservationDate: after.lastDate,
    rowsAfterCutoff: after.rowsAfterCutoff,
    uploaded: false,
    publicRedistributionCleared: false,
  };
  fs.writeFileSync(mergeManifestPath, `${JSON.stringify(mergeSummary, null, 2)}\n`, 'utf8');

  fs.renameSync(nextMasterPath, masterPath);
  fs.renameSync(nextManifestPath, rootManifestPath);
  console.log(JSON.stringify(mergeSummary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
