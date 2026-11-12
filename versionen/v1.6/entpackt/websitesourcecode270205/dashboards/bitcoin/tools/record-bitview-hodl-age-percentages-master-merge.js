const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const previousMasterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bitview-hodl-age-percentages-2026-09-29.csv');
const candidatePath = path.join(varDir, 'bitview-hodl-age-percentages-import-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'bitview-hodl-age-percentages-import-through-2026-09-28.json');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const expectedHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const targets = ['supply_last_active_1y_pct', 'supply_last_active_5y_pct', 'supply_last_active_10y_pct'];
const expectedOldRows = 717703;
const expectedOldSha256 = 'ca78e09e946361a37898738c7dd164a5f49b030d3b774bb0d48fff13a55c766b';

async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function summarizeMaster(filename, catalog) {
  const metrics = new Set();
  const sources = {};
  const addedMetricCounts = Object.fromEntries(targets.map((id) => [id, 0]));
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) {
      if (line.replace(/^\uFEFF/, '') !== expectedHeader) throw new Error('Unerwarteter Master-CSV-Header.');
      first = false;
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
    if (!fs.existsSync(filename)) throw new Error(`Erforderliche Datei fehlt: ${path.basename(filename)}.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const previousMasterSha256 = await sha256File(previousMasterPath);
  if (manifest.observations !== expectedOldRows || manifest.masterSha256 !== expectedOldSha256
      || previousMasterSha256 !== expectedOldSha256) {
    throw new Error('Das Manifest oder die Sicherung vor dem Import weicht vom erwarteten Master ab.');
  }
  if (candidate.observations !== 19416 || candidate.uploaded !== false || candidate.publicRedistributionCleared !== false
      || await sha256File(candidatePath) !== candidate.candidateSha256) {
    throw new Error('Bitview-Ableitung oder Kandidatenhash stimmt nicht.');
  }
  const activeMasterSha256 = await sha256File(masterPath);
  const current = await summarizeMaster(masterPath, catalog);
  if (current.rows !== expectedOldRows + candidate.observations || current.metricIds !== 143
      || current.coreMetricIdsWithObservations !== 91 || current.rowsAfterCutoff !== 0
      || current.firstDate !== '2009-01-03' || current.lastDate !== '2026-09-28'
      || targets.some((id) => current.addedMetricCounts[id] !== 6472)) {
    throw new Error('Der aktive Master entspricht nicht den erwarteten Bitview-Altersreihen-Zahlen.');
  }

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
    licenseNote: candidate.licenseNote,
    formula: candidate.methodology,
    uploaded: false,
    publicRedistributionCleared: false,
  };

  const previousRefresh = manifest.latestRefresh;
  manifest.masterBytes = fs.statSync(masterPath).size;
  manifest.masterSha256 = activeMasterSha256;
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
  manifest.scope.bitviewHodlAgePercentageImport = {
    ...importRecord,
    previousMaster: path.basename(previousMasterPath),
    previousMasterSha256,
    excludedNoSupplyDates: candidate.excludedNoSupplyDates,
    allValuesWithinZeroAndOneHundred: candidate.allValuesWithinZeroAndOneHundred,
  };
  manifest.latestRefresh = {
    runDate: '2026-09-29',
    cutoffInclusive: '2026-09-28',
    previousMasterRows: expectedOldRows,
    masterRows: current.rows,
    netRowIncrease: candidate.observations,
    masterSha256: activeMasterSha256,
    masterBytes: manifest.masterBytes,
    previousMasterBackup: {
      path: path.basename(previousMasterPath),
      sha256: previousMasterSha256,
      bytes: fs.statSync(previousMasterPath).size,
    },
    bitviewHodlAgePercentageImport: importRecord,
    previousRefresh,
  };
  manifest.qualityNotes = manifest.qualityNotes.filter((note) => !note.startsWith('The active master contains 717,703 observations'));
  manifest.qualityNotes.push('The active master contains 737,119 observations from 143 Bitcoin metric IDs through 2026-09-28. Three provisional Bitcoin supply-age percentages add 19,416 private Bitview-derived observations from 2009-01-09 through 2026-09-28. Public redistribution is not cleared. No upload was performed.');

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    observations: manifest.observations,
    metricIdsWithObservations: manifest.metricIdsWithObservations,
    coreMetricIdsWithObservations: manifest.coreMetricIdsWithObservations,
    emptyBitcoinMetricIds: current.emptyBitcoinMetricIds.length,
    sourceCounts: manifest.sourceCounts,
    masterSha256: activeMasterSha256,
    masterBytes: manifest.masterBytes,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
