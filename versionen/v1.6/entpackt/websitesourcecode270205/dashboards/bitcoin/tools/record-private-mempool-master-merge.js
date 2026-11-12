const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const previousMasterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-private-mempool-research-2026-09-29.csv');
const candidatePath = path.join(varDir, 'mempool-private-bitcoin-dashboard-research-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'mempool-private-bitcoin-dashboard-research-through-2026-09-28.json');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');

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
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) {
      if (line.replace(/^\uFEFF/, '') !== 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash') {
        throw new Error('Der aktive Master hat einen unerwarteten CSV-Header.');
      }
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
  }
  const knownMetrics = new Set(catalog.metrics.map((metric) => metric.id));
  const unknownMetrics = [...metrics].filter((id) => !knownMetrics.has(id));
  if (unknownMetrics.length) throw new Error(`Kennzahlen fehlen im Katalog: ${unknownMetrics.join(', ')}`);
  const coreSet = new Set(catalog.coreMetricIds);
  const coreWithData = [...coreSet].filter((id) => metrics.has(id)).length;
  const emptyBitcoinMetricIds = catalog.metrics
    .filter((metric) => metric.category !== 'macro' && !metrics.has(metric.id)
      && !['btc_gold_ratio', 'btc_sp500_corr_90d', 'btc_gold_corr_90d', 'btc_sp500_corr_1y', 'btc_gold_corr_1y', 'btc_sp500_relative_return_1y_pct', 'btc_real_price_usd'].includes(metric.id))
    .map((metric) => metric.id);
  return { rows, metricIds: metrics.size, sources, firstDate, lastDate, rowsAfterCutoff, coreWithData, emptyBitcoinMetricIds };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.observations !== 698924) throw new Error('Manifest erwartet den Master vor dem Mempool-Forschungsimport mit 698.924 Zeilen.');
  if (!fs.existsSync(previousMasterPath) || !fs.existsSync(candidatePath) || !fs.existsSync(candidateManifestPath)) {
    throw new Error('Vorheriger Master, lokaler Forschungsimport oder Kandidatenmanifest fehlt.');
  }
  const candidate = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  if (candidate.observations !== 5831 || candidate.publicRedistributionCleared !== false) {
    throw new Error('Unerwartete private Mempool-Kandidatenmetadaten.');
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const current = await summarizeMaster(masterPath, catalog);
  if (current.rows !== 704755 || current.metricIds !== 138 || current.coreWithData !== 91 || current.rowsAfterCutoff !== 0) {
    throw new Error('Der aktive Master entspricht nicht den erwarteten Bitcoin-only Summen.');
  }
  if (Object.values(current.sources).reduce((sum, count) => sum + count, 0) !== current.rows) {
    throw new Error('Die Quellzeilenzahlen ergeben nicht die Masterzeilenzahl.');
  }

  const previousLatestRefresh = manifest.latestRefresh;
  manifest.masterBytes = fs.statSync(masterPath).size;
  manifest.masterSha256 = await sha256File(masterPath);
  manifest.observations = current.rows;
  manifest.metricIdsWithObservations = current.metricIds;
  manifest.catalogMetricIds = catalog.metrics.length;
  manifest.coreMetricIdsWithObservations = current.coreWithData;
  manifest.coreMetricIds = catalog.coreMetricIds.length;
  manifest.emptyMetricIds = catalog.metrics.length - current.metricIds;
  manifest.emptyCoreMetricIds = catalog.coreMetricIds.length - current.coreWithData;
  manifest.firstObservationDate = current.firstDate;
  manifest.lastObservationDate = current.lastDate;
  manifest.rowsAfterCutoff = current.rowsAfterCutoff;
  manifest.sourceCounts = current.sources;
  manifest.scope.newObservationsAfterPreviousLocalMaster = candidate.observations;
  manifest.scope.remainingEmptyBitcoinMetricIds = current.emptyBitcoinMetricIds.length;
  manifest.scope.remainingEmptyCoreMetricIds = manifest.emptyCoreMetricIds;
  manifest.scope.privateResearchCandidateRowsOutsideMaster = 2370;
  manifest.scope.privateResearchCandidateMetricIdsOutsideMaster = 2;
  previousLatestRefresh.mempoolLightningPrivateCandidate.mergedIntoMaster = true;
  previousLatestRefresh.mempoolLightningPrivateCandidate.importedRows = 3639;
  previousLatestRefresh.mempoolLightningPrivateCandidate.publicRedistributionCleared = false;
  previousLatestRefresh.mempoolLightningPrivateCandidate.reason = 'Merged into the local private Bitcoin master only; no separate data reuse license was identified and public redistribution is not cleared.';
  previousLatestRefresh.mempoolBitcoinResearchCandidates.mergedIntoMaster = false;
  previousLatestRefresh.mempoolBitcoinResearchCandidates.partiallyMergedIntoMaster = true;
  previousLatestRefresh.mempoolBitcoinResearchCandidates.mergedRows = 2192;
  previousLatestRefresh.mempoolBitcoinResearchCandidates.mergedMetricIds = ['fees_p10_sat_vb', 'fees_p90_sat_vb'];
  previousLatestRefresh.mempoolBitcoinResearchCandidates.remainingOutsideMasterRows = 2370;
  previousLatestRefresh.mempoolBitcoinResearchCandidates.remainingOutsideMasterMetricIds = ['mining_pool_share', 'pool_concentration_hhi'];
  previousLatestRefresh.mempoolBitcoinResearchCandidates.reason = 'Fee p10/p90 rows were merged for local private research only. Weekly hashrate pool shares and derived HHI remain outside the master because the active OpenBitcoin series uses monthly directly counted blocks. Public redistribution is not cleared.';
  manifest.scope.privateMempoolDashboardImport = {
    path: path.basename(candidatePath),
    manifest: path.basename(candidateManifestPath),
    observations: candidate.observations,
    metricIds: candidate.metricIds,
    metricCounts: candidate.metricCounts,
    sourceCounts: candidate.sourceCounts,
    first: candidate.firstObservationDate,
    last: candidate.lastObservationDate,
    candidateSha256: candidate.sha256,
    candidateBytes: candidate.bytes,
    previousMaster: path.basename(previousMasterPath),
    previousMasterSha256: await sha256File(previousMasterPath),
    localPrivateResearchOnly: true,
    dataReuseLicenseConfirmed: false,
    publicRedistributionCleared: false,
    uploaded: false,
    excludedMetricIds: candidate.excludedMetricIds,
    excludedReason: candidate.excludedReason,
  };

  manifest.previousLatestRefresh = previousLatestRefresh;
  manifest.latestRefresh = {
    runDate: '2026-09-29',
    cutoffInclusive: '2026-09-28',
    previousMasterRows: 698924,
    masterRows: current.rows,
    netRowIncrease: candidate.observations,
    masterSha256: manifest.masterSha256,
    masterBytes: manifest.masterBytes,
    previousMasterBackup: {
      path: path.basename(previousMasterPath),
      sha256: await sha256File(previousMasterPath),
    },
    privateMempoolResearchImport: manifest.scope.privateMempoolDashboardImport,
  };

  const qualityNotes = manifest.qualityNotes.map((note) => {
    if (note.startsWith('The refreshed master has 687,533 rows')) return `The master before OpenBitcoin and Mempool research additions had 687,533 rows and SHA-256 c2de633c922f8a45b74fdb0d958a7bfa69d70569d8483be3d5d59e6959525fe1. The general observer checker was not rerun after those additions; each merge rejected duplicate metric/series/date keys.`;
    if (note.startsWith('Mempool.space Lightning history contains')) return `Mempool.space Lightning history has 3,639 Bitcoin observations across seven metric IDs, from 2023-09-30 through 2026-08-30. Those rows now appear in the local master for private research only; the documentation does not identify a separate data reuse license and public use is not cleared.`;
    if (note.startsWith('Mempool.space produced private Bitcoin-only research candidates')) return `Mempool.space Bitcoin-only candidates originally contained 8,201 rows across eleven IDs. 5,831 Lightning and fee p10/p90 rows were merged into the local master for private research; 2,370 weekly hashrate pool-share and HHI rows remain outside because the active pool series uses monthly directly counted blocks. Public redistribution is not cleared.`;
    return note;
  });
  qualityNotes.push('The active master contains 704,755 rows from 138 Bitcoin metric IDs through 2026-09-28. Mempool additions remain local and provisional; no upload was performed.');
  manifest.qualityNotes = qualityNotes;

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    observations: manifest.observations,
    metricIdsWithObservations: manifest.metricIdsWithObservations,
    coreMetricIdsWithObservations: manifest.coreMetricIdsWithObservations,
    emptyBitcoinMetricIds: manifest.scope.remainingEmptyBitcoinMetricIds,
    sourceCounts: manifest.sourceCounts,
    masterBytes: manifest.masterBytes,
    masterSha256: manifest.masterSha256,
    privateMempoolRowsMerged: candidate.observations,
    privateMempoolRowsStillOutsideMaster: manifest.scope.privateResearchCandidateRowsOutsideMaster,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
