const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { once } = require('node:events');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const masterManifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const rawPath = path.join(varDir, 'bykaranteli-btc-perp-volume-research-through-2026-09-10.csv');
const candidatePath = path.join(varDir, 'bykaranteli-btc-perp-volume-import-through-2026-09-10.csv');
const candidateManifestPath = path.join(varDir, 'bykaranteli-btc-perp-volume-import-through-2026-09-10.json');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bykaranteli-btc-perp-volume-2026-09-30.csv');
const manifestBackupPath = path.join(varDir, 'manifest-before-bykaranteli-btc-perp-volume-2026-09-30.json');
const nextMasterPath = `${masterPath}.bykaranteli-btc-perp-volume.next`;
const nextManifestPath = `${masterManifestPath}.bykaranteli-btc-perp-volume.next`;
const nextCandidateManifestPath = `${candidateManifestPath}.next`;
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const rawHeader = 'date,venue,market,symbol,quote,volume_24h_usd';
const sourceSlug = 'bykaranteli_crypto_datasets_cc0';
const metricId = 'futures_volume_usd';
const cutoff = '2026-09-28';
const sourceCommit = '66d8542392067be14e2eb8ca962ffbdafcbc51ef';

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

async function readCsv(filename, expectedHeader, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let isHeader = true;
  let rowCount = 0;
  for await (const line of rl) {
    if (isHeader) {
      if (line.replace(/^\uFEFF/, '') !== expectedHeader) throw new Error(`Unexpected CSV header in ${path.basename(filename)}.`);
      isHeader = false;
      continue;
    }
    if (!line) continue;
    rowCount++;
    await onRow(line.split(','), rowCount);
  }
  if (isHeader) throw new Error(`CSV is empty: ${path.basename(filename)}.`);
  return rowCount;
}

function usdToCents(value, date) {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`Invalid volume value on ${date}.`);
  const fraction = (match[2] || '').padEnd(3, '0');
  let cents = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2));
  if (fraction[2] >= '5') cents++;
  return cents;
}

function centsToUsd(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function datesBetween(first, last) {
  const dates = [];
  for (let at = Date.parse(`${first}T00:00:00Z`); at <= Date.parse(`${last}T00:00:00Z`); at += 86_400_000) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  return dates;
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

async function waitForFinish(stream) {
  await once(stream, 'finish');
}

async function writeHashed(stream, hash, text) {
  const buffer = Buffer.from(text, 'utf8');
  hash.update(buffer);
  if (!stream.write(buffer)) await once(stream, 'drain');
}

async function main() {
  const requiredFiles = [masterPath, masterManifestPath, catalogPath, rawPath, candidatePath, candidateManifestPath];
  for (const filename of requiredFiles) {
    if (!fs.existsSync(filename)) throw new Error(`Required file missing: ${path.basename(filename)}.`);
  }
  for (const filename of [backupPath, manifestBackupPath, nextMasterPath, nextManifestPath, nextCandidateManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite ${path.basename(filename)}.`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const masterManifest = JSON.parse(fs.readFileSync(masterManifestPath, 'utf8'));
  const candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const metric = catalog.metrics.find((entry) => entry.id === metricId);
  if (!metric || catalog.metrics.length !== masterManifest.catalogMetricIds || catalog.coreMetricIds.includes(metricId)) {
    throw new Error('Catalog metric, catalog size, or core metric assignment is unexpected.');
  }
  if (masterManifest.dashboard !== 'bitcoin' || masterManifest.cutoffInclusive !== cutoff
      || masterManifest.observations !== 738959 || masterManifest.metricIdsWithObservations !== 161
      || masterManifest.catalogMetricIds !== 204 || masterManifest.coreMetricIdsWithObservations !== 92
      || masterManifest.scope.remainingEmptyBitcoinMetricIds !== 30 || masterManifest.scope.remainingEmptyCoreMetricIds !== 8
      || masterManifest.rowsAfterCutoff !== 0 || masterManifest.emptyMetricIds !== 43) {
    throw new Error('The current Bitcoin master manifest differs from the expected pre-merge state.');
  }
  const currentBytes = fs.statSync(masterPath).size;
  const currentSha256 = await sha256File(masterPath);
  if (currentBytes !== masterManifest.masterBytes || currentSha256 !== masterManifest.masterSha256) {
    throw new Error('The Bitcoin master file does not match its manifest.');
  }
  if (candidateManifest.source?.slug !== sourceSlug || candidateManifest.source?.commit !== sourceCommit
      || candidateManifest.source?.commitDate !== '2026-09-10' || candidateManifest.dataReuseLicenseConfirmedFromRepository !== true
      || candidateManifest.rawBitcoinOnlySnapshot?.symbol !== 'BTC' || candidateManifest.rawBitcoinOnlySnapshot?.market !== 'perp'
      || candidateManifest.rawBitcoinOnlySnapshot?.sourceRowsForOtherAssetsWritten !== 0
      || candidateManifest.rawBitcoinOnlySnapshot?.selectedFeedCount !== 24
      || candidateManifest.rawBitcoinOnlySnapshot?.excludedIncompleteFeedCount !== 9
      || candidateManifest.firstObservationDate !== '2026-08-21' || candidateManifest.lastObservationDate !== '2026-09-10'
      || candidateManifest.observations !== 21 || candidateManifest.cutoffInclusive !== cutoff
      || candidateManifest.uploaded !== false || candidateManifest.mergedIntoMaster !== false) {
    throw new Error('The BTC-only candidate manifest does not match the reviewed source and coverage.');
  }

  const rawFilePath = path.join(varDir, candidateManifest.rawBitcoinOnlySnapshot.path);
  const rawBytes = fs.statSync(rawFilePath).size;
  const rawSha256 = await sha256File(rawFilePath);
  if (rawBytes !== candidateManifest.rawBitcoinOnlySnapshot.bytes || rawSha256 !== candidateManifest.rawBitcoinOnlySnapshot.sha256) {
    throw new Error('BTC-only source snapshot and manifest hash do not match.');
  }
  const selectedFeeds = new Set(candidateManifest.rawBitcoinOnlySnapshot.selectedFeeds);
  if (selectedFeeds.size !== 24) throw new Error('The fixed BTC perp panel does not contain exactly 24 feeds.');
  const dates = datesBetween('2026-08-21', '2026-09-10');
  const rawKeys = new Set();
  const sums = new Map(dates.map((date) => [date, 0n]));
  const counts = new Map(dates.map((date) => [date, 0]));
  const rawRows = await readCsv(rawFilePath, rawHeader, (cells, rowNumber) => {
    if (cells.length !== 6) throw new Error(`Malformed BTC-only source row ${rowNumber + 1}.`);
    const [date, venue, market, symbol, quote, volume] = cells;
    const feed = `${venue}|${market}|${quote}`;
    const key = `${date}|${feed}`;
    if (symbol !== 'BTC' || market !== 'perp' || !selectedFeeds.has(feed) || !sums.has(date) || rawKeys.has(key)) {
      throw new Error(`Non-BTC, out-of-panel, or duplicate row in the research snapshot: ${key}.`);
    }
    rawKeys.add(key);
    sums.set(date, sums.get(date) + usdToCents(volume, date));
    counts.set(date, counts.get(date) + 1);
  });
  if (rawRows !== 504 || rawRows !== selectedFeeds.size * dates.length
      || dates.some((date) => counts.get(date) !== selectedFeeds.size)) {
    throw new Error('BTC-only source snapshot does not form a complete 24-feed, 21-day panel.');
  }

  const candidateBytes = fs.statSync(candidatePath).size;
  const candidateSha256 = await sha256File(candidatePath);
  if (candidateBytes !== candidateManifest.candidate.bytes || candidateSha256 !== candidateManifest.candidate.sha256) {
    throw new Error('Candidate CSV and manifest hash do not match.');
  }
  const candidates = new Map();
  const candidateRows = await readCsv(candidatePath, header, (cells, rowNumber) => {
    if (cells.length !== 9 || cells[0] !== metricId || cells[1] !== 'main' || cells[4] !== sourceSlug
        || cells[5] !== '' || cells[6] !== 'provisional' || cells[7] !== `bykaranteli-venue-markets-btc-perp-cc0-${sourceCommit.slice(0, 7)}:${cells[2]}`
        || !/^[0-9a-f]{64}$/.test(cells[8]) || candidates.has(cells[2])) {
      throw new Error(`Invalid or duplicate import candidate row ${rowNumber + 1}.`);
    }
    if (!sums.has(cells[2]) || cells[3] !== centsToUsd(sums.get(cells[2]))) {
      throw new Error(`Candidate total does not reconcile to BTC-only feed rows on ${cells[2]}.`);
    }
    candidates.set(cells[2], cells.join(','));
  });
  if (candidateRows !== 21 || dates.some((date) => !candidates.has(date))) {
    throw new Error('Import candidate does not contain exactly one row for all 21 UTC dates.');
  }

  const observed = new Set();
  let masterRows = 0;
  let futureRows = 0;
  let targetMetricRows = 0;
  await readCsv(masterPath, header, (cells, rowNumber) => {
    if (cells.length !== 9) throw new Error(`Malformed master row ${rowNumber + 1}.`);
    masterRows++;
    observed.add(cells[0]);
    if (cells[2] > cutoff) futureRows++;
    if (cells[0] === metricId) targetMetricRows++;
  });
  if (masterRows !== masterManifest.observations || observed.size !== masterManifest.metricIdsWithObservations
      || futureRows !== 0 || targetMetricRows !== 0) {
    throw new Error('Master row count, date cutoff, metric coverage, or target metric state is unexpected.');
  }

  const nextMaster = fs.createWriteStream(nextMasterPath, { flags: 'wx' });
  const nextHash = crypto.createHash('sha256');
  const sourceReader = readline.createInterface({ input: fs.createReadStream(masterPath), crlfDelay: Infinity });
  let firstLine = true;
  for await (const line of sourceReader) {
    if (firstLine && line.replace(/^\uFEFF/, '') !== header) throw new Error('Unexpected active master header.');
    firstLine = false;
    await writeHashed(nextMaster, nextHash, `${line}\n`);
  }
  for (const date of dates) await writeHashed(nextMaster, nextHash, `${candidates.get(date)}\n`);
  nextMaster.end();
  await waitForFinish(nextMaster);

  const nextManifest = { ...masterManifest };
  nextManifest.generatedAt = '2026-09-30';
  nextManifest.master = path.basename(masterPath);
  nextManifest.masterBytes = fs.statSync(nextMasterPath).size;
  nextManifest.masterSha256 = nextHash.digest('hex');
  nextManifest.observations = masterRows + candidateRows;
  nextManifest.metricIdsWithObservations = observed.size + 1;
  nextManifest.emptyMetricIds = masterManifest.emptyMetricIds - 1;
  nextManifest.rowsAfterCutoff = 0;
  nextManifest.scope = { ...masterManifest.scope };
  nextManifest.scope.newObservationsAfterPreviousLocalMaster = (masterManifest.scope.newObservationsAfterPreviousLocalMaster || 0) + candidateRows;
  nextManifest.scope.remainingEmptyBitcoinMetricIds = emptyBitcoinMetricIds(catalog, new Set([...observed, metricId])).length;
  nextManifest.scope.remainingEmptyCoreMetricIds = catalog.coreMetricIds.filter((id) => !observed.has(id)).length;
  nextManifest.scope.byKaranteliBitcoinPerpVolume = {
    path: path.basename(candidatePath),
    manifest: path.basename(candidateManifestPath),
    rawBitcoinOnlySnapshot: path.basename(rawFilePath),
    observations: candidateRows,
    metricId,
    first: dates[0],
    last: dates.at(-1),
    selectedFeedCount: selectedFeeds.size,
    selectedFeeds: [...selectedFeeds].sort(),
    excludedIncompleteFeedCount: candidateManifest.rawBitcoinOnlySnapshot.excludedIncompleteFeedCount,
    candidateSha256,
    candidateBytes,
    rawSha256,
    rawBytes,
    sourceCommit,
    license: 'CC0 1.0 Universal',
    methodology: candidateManifest.method[metricId],
    uploaded: false,
  };
  nextManifest.sourceCounts = { ...masterManifest.sourceCounts };
  nextManifest.sourceCounts[sourceSlug] = (nextManifest.sourceCounts[sourceSlug] || 0) + candidateRows;
  nextManifest.scope.remainingEmptyBitcoinMetricIds = emptyBitcoinMetricIds(catalog, new Set([...observed, metricId])).length;
  if (nextManifest.scope.remainingEmptyBitcoinMetricIds !== 29 || nextManifest.scope.remainingEmptyCoreMetricIds !== 8
      || nextManifest.metricIdsWithObservations !== 162 || nextManifest.emptyMetricIds !== 42
      || nextManifest.observations !== 738980 || nextManifest.sourceCounts[sourceSlug] !== 2039) {
    throw new Error('Computed post-merge coverage differs from expected counts.');
  }
  const nextManifestCsv = `${JSON.stringify(nextManifest, null, 2)}\n`;
  fs.writeFileSync(nextManifestPath, nextManifestCsv, { flag: 'wx' });
  fs.writeFileSync(nextCandidateManifestPath, `${JSON.stringify({
    ...candidateManifest,
    mergedIntoMaster: true,
    masterPath: path.basename(masterPath),
    masterSha256: nextManifest.masterSha256,
    masterBytes: nextManifest.masterBytes,
    uploaded: false,
  }, null, 2)}\n`, { flag: 'wx' });

  fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(masterManifestPath, manifestBackupPath, fs.constants.COPYFILE_EXCL);
  if (await sha256File(backupPath) !== masterManifest.masterSha256 || fs.statSync(backupPath).size !== masterManifest.masterBytes) {
    throw new Error('The byte-identical master backup could not be verified.');
  }
  fs.renameSync(nextMasterPath, masterPath);
  fs.renameSync(nextManifestPath, masterManifestPath);
  fs.renameSync(nextCandidateManifestPath, candidateManifestPath);

  console.log(JSON.stringify({
    observations: nextManifest.observations,
    metricIdsWithObservations: nextManifest.metricIdsWithObservations,
    catalogMetricIds: nextManifest.catalogMetricIds,
    coreMetricIdsWithObservations: nextManifest.coreMetricIdsWithObservations,
    emptyBitcoinMetricIds: nextManifest.scope.remainingEmptyBitcoinMetricIds,
    emptyCoreMetricIds: nextManifest.scope.remainingEmptyCoreMetricIds,
    addedRows: candidateRows,
    source: sourceSlug,
    sourceRows: rawRows,
    selectedFeeds: selectedFeeds.size,
    first: dates[0],
    last: dates.at(-1),
    masterBytes: nextManifest.masterBytes,
    masterSha256: nextManifest.masterSha256,
    backup: path.basename(backupPath),
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
