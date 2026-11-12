const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const previousMasterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-openbitcoin-utxo-flow-2026-09-29.csv');
const candidatePath = path.join(varDir, 'openbitcoin-utxo-flow-import-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'openbitcoin-utxo-flow-import-through-2026-09-28.json');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const headerValue = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';

function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function summarizeMaster(filename, catalog) {
  const metrics = new Set();
  const sources = {};
  const addedMetricCounts = { utxo_created_count: 0, utxo_spent_count: 0 };
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) {
      if (line.replace(/^\uFEFF/, '') !== headerValue) throw new Error('Unerwarteter Master-CSV-Header.');
      header = false;
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Masterzeile ${rows + 2}.`);
    rows++;
    metrics.add(cells[0]);
    sources[cells[4]] = (sources[cells[4]] || 0) + 1;
    if (cells[0] in addedMetricCounts) addedMetricCounts[cells[0]]++;
    if (!firstDate || cells[2] < firstDate) firstDate = cells[2];
    if (!lastDate || cells[2] > lastDate) lastDate = cells[2];
    if (cells[2] > '2026-09-28') rowsAfterCutoff++;
  }
  const knownMetrics = new Set(catalog.metrics.map((metric) => metric.id));
  const unknownMetrics = [...metrics].filter((id) => !knownMetrics.has(id));
  if (unknownMetrics.length) throw new Error(`Kennzahlen fehlen im Katalog: ${unknownMetrics.join(', ')}.`);
  const coreMetricIdsWithObservations = catalog.coreMetricIds.filter((id) => metrics.has(id)).length;
  const outOfScopeMetricIds = new Set([
    'btc_gold_ratio', 'btc_sp500_corr_90d', 'btc_gold_corr_90d', 'btc_sp500_corr_1y',
    'btc_gold_corr_1y', 'btc_sp500_relative_return_1y_pct', 'btc_real_price_usd',
  ]);
  const emptyBitcoinMetricIds = catalog.metrics.filter((metric) => metric.category !== 'macro'
    && !outOfScopeMetricIds.has(metric.id) && !metrics.has(metric.id)).map((metric) => metric.id);
  if (Object.values(sources).reduce((sum, count) => sum + count, 0) !== rows) throw new Error('Quellzeilenzahlen ergeben nicht die Masterzeilenzahl.');
  return { rows, metricIds: metrics.size, sources, firstDate, lastDate, rowsAfterCutoff, coreMetricIdsWithObservations, emptyBitcoinMetricIds, addedMetricCounts };
}

async function main() {
  for (const filename of [previousMasterPath, candidatePath, candidateManifestPath]) {
    if (!fs.existsSync(filename)) throw new Error(`Erforderliche Importdatei fehlt: ${path.basename(filename)}.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (manifest.observations !== 704755 || manifest.masterSha256 !== 'f66e8e9eec8c82c6bf544803c9be1f3d935aea85cdc7d79f2373b4a963fcae05') {
    throw new Error('Der Manifest-Ausgangsstand vor diesem Import stimmt nicht.');
  }
  if (candidate.observations !== 12948 || candidate.license !== 'CC BY 4.0'
      || candidate.uploaded !== false || candidate.cutoffInclusive !== '2026-09-28'
      || await sha256File(candidatePath) !== candidate.candidateSha256) {
    throw new Error('OBM-Kandidat oder Quellhash stimmt nicht.');
  }
  const current = await summarizeMaster(masterPath, catalog);
  const masterSha256 = await sha256File(masterPath);
  const previousMasterSha256 = await sha256File(previousMasterPath);
  if (current.rows !== 717703 || current.metricIds !== 140 || current.coreMetricIdsWithObservations !== 91
      || current.rowsAfterCutoff !== 0 || current.firstDate !== '2009-01-03' || current.lastDate !== '2026-09-28'
      || current.addedMetricCounts.utxo_created_count !== 6474 || current.addedMetricCounts.utxo_spent_count !== 6474
      || masterSha256 !== 'ca78e09e946361a37898738c7dd164a5f49b030d3b774bb0d48fff13a55c766b') {
    throw new Error('Der aktive Master entspricht nicht den erwarteten UTXO-Importzahlen.');
  }

  const previousStep = manifest.latestRefresh;
  const importRecord = {
    path: path.basename(candidatePath),
    manifest: path.basename(candidateManifestPath),
    observations: candidate.observations,
    metricIds: candidate.metricIds,
    metricCounts: candidate.metricCounts,
    sourceCounts: candidate.sourceCounts,
    first: candidate.firstObservationDate,
    last: candidate.lastObservationDate,
    candidateSha256: candidate.candidateSha256,
    candidateBytes: candidate.candidateBytes,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
    license: candidate.license,
    attributionRequired: true,
    formula: candidate.methodology,
    allCreatedCountsNonNegativeIntegers: candidate.allCreatedCountsNonNegativeIntegers,
    utxoStockFlowIdentityHolds: candidate.utxoStockFlowIdentityHolds,
    noBlockDaysCarriedForward: candidate.noBlockDaysCarriedForward,
    uploaded: false,
  };

  manifest.masterBytes = fs.statSync(masterPath).size;
  manifest.masterSha256 = masterSha256;
  manifest.observations = current.rows;
  manifest.metricIdsWithObservations = current.metricIds;
  manifest.catalogMetricIds = catalog.metrics.length;
  manifest.coreMetricIdsWithObservations = current.coreMetricIdsWithObservations;
  manifest.coreMetricIds = catalog.coreMetricIds.length;
  manifest.emptyMetricIds = catalog.metrics.length - current.metricIds;
  manifest.emptyCoreMetricIds = catalog.coreMetricIds.length - current.coreMetricIdsWithObservations;
  manifest.firstObservationDate = current.firstDate;
  manifest.lastObservationDate = current.lastDate;
  manifest.rowsAfterCutoff = current.rowsAfterCutoff;
  manifest.sourceCounts = current.sources;
  manifest.scope.newObservationsAfterPreviousLocalMaster += candidate.observations;
  manifest.scope.remainingEmptyBitcoinMetricIds = current.emptyBitcoinMetricIds.length;
  manifest.scope.remainingEmptyCoreMetricIds = manifest.emptyCoreMetricIds;
  manifest.scope.openBitcoinUtxoFlowImport = {
    ...importRecord,
    previousMaster: path.basename(previousMasterPath),
    previousMasterSha256,
    utxoStateRows: candidate.utxoStateRows,
    derivedCreatedTotal: candidate.derivedCreatedTotal,
    spentTotal: candidate.spentTotal,
    endUtxoCount: candidate.endUtxoCount,
  };
  manifest.latestRefresh = {
    runDate: '2026-09-29',
    cutoffInclusive: '2026-09-28',
    previousMasterRows: 704755,
    masterRows: current.rows,
    netRowIncrease: candidate.observations,
    masterSha256,
    masterBytes: manifest.masterBytes,
    previousMasterBackup: { path: path.basename(previousMasterPath), sha256: previousMasterSha256 },
    openBitcoinUtxoFlowImport: importRecord,
    previousRefresh: previousStep,
  };
  manifest.qualityNotes = manifest.qualityNotes.filter((note) => !note.startsWith('The active master contains 704,755 rows'));
  manifest.qualityNotes.push('The active master contains 717,703 observations from 140 Bitcoin metric IDs through 2026-09-28. Open Bitcoin Metrics spent-output counts and locally derived spendable-output creation counts add two Bitcoin-only metrics through 2026-09-24 under CC BY 4.0. No upload was performed.');

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    observations: manifest.observations,
    metricIdsWithObservations: manifest.metricIdsWithObservations,
    coreMetricIdsWithObservations: manifest.coreMetricIdsWithObservations,
    emptyBitcoinMetricIds: current.emptyBitcoinMetricIds.length,
    sourceCounts: manifest.sourceCounts,
    masterSha256,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
