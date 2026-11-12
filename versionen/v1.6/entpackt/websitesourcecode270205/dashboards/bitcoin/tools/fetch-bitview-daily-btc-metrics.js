const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const masterBackupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bitview-daily-metrics-2026-09-30.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const manifestBackupPath = path.join(varDir, 'manifest-through-2026-09-28-before-bitview-daily-metrics-2026-09-30.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const rawPath = path.join(varDir, 'bitview-daily-btc-series-research-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'bitview-daily-btc-series-import-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'bitview-daily-btc-series-import-through-2026-09-28.json');
const tempMasterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-bitview-daily-metrics-merge.tmp.csv');
const expectedHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expectedRowsBefore = 777812;
const expectedBytesBefore = 155316936;
const expectedShaBefore = '656961a7acbe60d519ed55216e88c367150129c2944377f994827b96824710cd';
const startDate = '2009-01-09';
const endDateExclusive = '2026-09-29';
const cutoff = '2026-09-28';
const sourceSlug = 'bitview_api_research_only';
const sourceVersion = 'v0.12.2';
const indexName = 'day1';
const dayMs = 86400000;
const utcIndexEpoch = Date.UTC(2009, 0, 1);
const requestedStartIndex = (Date.parse(startDate + 'T00:00:00Z') - utcIndexEpoch) / dayMs;
const requestedEndIndex = (Date.parse(endDateExclusive + 'T00:00:00Z') - utcIndexEpoch) / dayMs;
const expectedDays = requestedEndIndex - requestedStartIndex;
const targets = [
  {
    sourceSeries: 'new_addr_count_sum_24h',
    metricId: 'new_addresses',
    convert: (value) => value,
    unit: 'addresses per rolling 24 hours',
  },
  {
    sourceSeries: 'block_size_sum_24h',
    metricId: 'block_size_mb',
    convert: (value) => value / 1000000,
    unit: 'decimal megabytes per rolling 24 hours',
  },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

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

function csvCell(value) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) throw new Error('CSV-Feld enthält unerwartete Sonderzeichen.');
  return text;
}

function dateAtIndex(index) {
  return new Date(utcIndexEpoch + index * dayMs).toISOString().slice(0, 10);
}

async function fetchSeries(target) {
  const params = new URLSearchParams({
    start: startDate,
    end: endDateExclusive,
    format: 'json',
  });
  const url = 'https://bitview.space/api/series/' + encodeURIComponent(target.sourceSeries)
    + '/' + indexName + '?' + params.toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(target.sourceSeries + ' returned HTTP ' + response.status + '.');
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error(target.sourceSeries + ' response was not valid JSON.');
  }
  if (!payload || payload.index !== indexName || !Array.isArray(payload.data)) {
    throw new Error(target.sourceSeries + ' did not return the requested daily index.');
  }
  if (payload.start !== requestedStartIndex || payload.end !== requestedEndIndex
      || payload.data.length !== expectedDays) {
    throw new Error(target.sourceSeries + ' has an unexpected daily index range: '
      + JSON.stringify({ start: payload.start, end: payload.end, values: payload.data.length, expectedDays }));
  }
  if (payload.data.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(target.sourceSeries + ' contains a negative, fractional, or unsafe integer value.');
  }
  return {
    target,
    url,
    payload,
    bodyText,
    bodySha256: sha256(bodyText),
  };
}

function buildCandidate(seriesResults) {
  const rows = [];
  const summaries = {};
  for (const result of seriesResults) {
    const { target, payload } = result;
    let minimum = Infinity;
    let maximum = -Infinity;
    let zeroCount = 0;
    for (let offset = 0; offset < expectedDays; offset++) {
      const index = payload.start + offset;
      const date = dateAtIndex(index);
      if (date !== dateAtIndex(requestedStartIndex + offset) || date > cutoff) {
        throw new Error('The returned index did not map to the expected UTC date range.');
      }
      const rawValue = payload.data[offset];
      const value = target.convert(rawValue);
      if (!Number.isFinite(value) || value < 0) throw new Error('Invalid converted value for ' + target.metricId + '.');
      const valueText = target.metricId === 'block_size_mb' ? value.toFixed(12) : String(value);
      const revision = 'bitview-' + sourceVersion + ':' + target.sourceSeries + ':' + index + ':' + payload.version;
      const payloadHash = sha256([
        target.sourceSeries,
        sourceVersion,
        indexName,
        index,
        rawValue,
        payload.version,
      ].join('\n'));
      rows.push([
        target.metricId,
        'main',
        date,
        valueText,
        sourceSlug,
        '',
        'provisional',
        revision,
        payloadHash,
      ].map(csvCell).join(','));
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      if (rawValue === 0) zeroCount++;
    }
    summaries[target.metricId] = {
      sourceSeries: target.sourceSeries,
      sourceVersion: payload.version,
      sourceIndex: payload.index,
      sourceStamp: payload.stamp,
      sourceType: payload.type,
      observations: payload.data.length,
      firstDate: startDate,
      lastDate: cutoff,
      minimum,
      maximum,
      zeroValues: zeroCount,
      unit: target.unit,
      sourceResponseSha256: result.bodySha256,
    };
  }
  const csv = expectedHeader + '\n' + rows.join('\n') + '\n';
  return {
    csv,
    rows,
    summaries,
    firstDate: startDate,
    lastDate: cutoff,
    noMissingDates: true,
    noInterpolation: true,
  };
}

async function summarizeMaster(filename, catalog, requireTargets) {
  const metricIds = new Set();
  const sourceCounts = {};
  const targetCounts = { new_addresses: 0, block_size_mb: 0 };
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  let first = true;
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  for await (const line of rl) {
    if (first) {
      if (line.replace(/^\uFEFF/, '') !== expectedHeader) throw new Error('Unexpected master CSV header.');
      first = false;
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Invalid master CSV row.');
    rows++;
    metricIds.add(cells[0]);
    sourceCounts[cells[4]] = (sourceCounts[cells[4]] || 0) + 1;
    if (cells[0] in targetCounts) targetCounts[cells[0]]++;
    if (!firstDate || cells[2] < firstDate) firstDate = cells[2];
    if (!lastDate || cells[2] > lastDate) lastDate = cells[2];
    if (cells[2] > cutoff) rowsAfterCutoff++;
  }
  const knownMetricIds = new Set(catalog.metrics.map((metric) => metric.id));
  const unknownMetricIds = [...metricIds].filter((id) => !knownMetricIds.has(id));
  if (unknownMetricIds.length) throw new Error('Metric IDs missing from catalog: ' + unknownMetricIds.join(', '));
  const emptyMetricIds = catalog.metrics.filter((metric) => !metricIds.has(metric.id)).map((metric) => metric.id);
  const emptyCoreMetricIds = catalog.coreMetricIds.filter((id) => !metricIds.has(id));
  const emptyBitcoinMetricIds = catalog.metrics
    .filter((metric) => metric.category !== 'macro' && !metricIds.has(metric.id))
    .map((metric) => metric.id);
  const coreMetricIdsWithObservations = catalog.coreMetricIds.length - emptyCoreMetricIds.length;
  if (requireTargets && (targetCounts.new_addresses !== expectedDays || targetCounts.block_size_mb !== expectedDays)) {
    throw new Error('The two new Bitcoin metrics do not have the expected daily row counts: ' + JSON.stringify(targetCounts));
  }
  if (rowsAfterCutoff !== 0 || lastDate !== cutoff) throw new Error('Unexpected observations after the BTC cutoff.');
  if (Object.values(sourceCounts).reduce((sum, count) => sum + count, 0) !== rows) {
    throw new Error('Source counts do not add up to master row count.');
  }
  return {
    rows,
    metricIds,
    sourceCounts,
    targetCounts,
    firstDate,
    lastDate,
    rowsAfterCutoff,
    emptyMetricIds,
    emptyCoreMetricIds,
    emptyBitcoinMetricIds,
    coreMetricIdsWithObservations,
  };
}

async function main() {
  const requiredFiles = [masterPath, manifestPath, catalogPath];
  for (const filename of requiredFiles) {
    if (!fs.existsSync(filename)) throw new Error('Required file missing: ' + path.basename(filename));
  }
  const outputFiles = [masterBackupPath, manifestBackupPath, rawPath, candidatePath, candidateManifestPath, tempMasterPath];
  if (outputFiles.some((filename) => fs.existsSync(filename))) {
    throw new Error('A backup, candidate, raw-data, or temporary file already exists. Nothing will be overwritten.');
  }
  if (expectedDays !== 6472) throw new Error('Unexpected requested UTC range length: ' + expectedDays);
  const masterShaBefore = await sha256File(masterPath);
  if (masterShaBefore !== expectedShaBefore || fs.statSync(masterPath).size !== expectedBytesBefore) {
    throw new Error('The active master is not the expected Bitcoin-only base version.');
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const masterManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (masterManifest.masterSha256 !== expectedShaBefore || masterManifest.observations !== expectedRowsBefore) {
    throw new Error('The master manifest does not match the expected Bitcoin-only base version.');
  }
  for (const target of targets) {
    if (!catalog.metrics.some((metric) => metric.id === target.metricId)) {
      throw new Error('Catalog is missing target metric ' + target.metricId + '.');
    }
  }
  const before = await summarizeMaster(masterPath, catalog, false);
  if (before.rows !== expectedRowsBefore || before.metricIds.size !== 163
      || before.coreMetricIdsWithObservations !== 93 || before.emptyMetricIds.length !== 41
      || before.metricIds.has('new_addresses') || before.metricIds.has('block_size_mb')) {
    throw new Error('The active master coverage changed since the source review.');
  }

  const results = await Promise.all(targets.map(fetchSeries));
  const prepared = buildCandidate(results);
  const candidateBytes = Buffer.byteLength(prepared.csv, 'utf8');
  const candidateSha256 = sha256(prepared.csv);
  const rawData = {
    dashboard: 'bitcoin',
    source: 'Bitcoin Research Kit / Bitview API',
    apiVersion: sourceVersion,
    retrievedAtUtc: new Date().toISOString(),
    queryRange: { startInclusive: startDate, endExclusive: endDateExclusive, lastIncludedDate: cutoff },
    index: indexName,
    bitcoinOnly: true,
    publicRedistributionCleared: false,
    responses: Object.fromEntries(results.map((result) => [result.target.sourceSeries, {
      url: result.url,
      status: 200,
      bodySha256: result.bodySha256,
      body: result.bodyText,
      summary: prepared.summaries[result.target.metricId],
    }])),
  };
  const rawText = JSON.stringify(rawData, null, 2) + '\n';
  const rawSha256 = sha256(rawText);
  const candidateManifest = {
    dashboard: 'bitcoin',
    candidateOnly: true,
    mergedIntoMaster: false,
    uploaded: false,
    publicRedistributionCleared: false,
    privatePersonalUseOnly: true,
    cutoffInclusive: cutoff,
    output: path.basename(candidatePath),
    observations: prepared.rows.length,
    outputBytes: candidateBytes,
    candidateSha256,
    rawResearchFile: path.basename(rawPath),
    rawResearchSha256: rawSha256,
    metricIds: targets.map((target) => target.metricId),
    metricCounts: {
      new_addresses: prepared.summaries.new_addresses.observations,
      block_size_mb: prepared.summaries.block_size_mb.observations,
    },
    sourceSlug,
    source: 'https://bitview.space/api',
    sourceSeries: prepared.summaries,
    firstObservationDate: prepared.firstDate,
    lastObservationDate: prepared.lastDate,
    noMissingDates: prepared.noMissingDates,
    noInterpolation: prepared.noInterpolation,
    limitations: [
      'Both source series are rolling 24-hour values sampled at the final block represented by each day1 UTC index.',
      'new_addr_count_sum_24h counts addresses first observed across all address types; it is not a count of people.',
      'block_size_sum_24h includes serialized block headers, transaction-count CompactSize fields, and witness data.',
      'The hosted Bitview measurements have no separately verified reuse license. These rows remain private and local.',
    ],
  };

  fs.writeFileSync(rawPath, rawText, 'utf8');
  fs.writeFileSync(candidatePath, prepared.csv, 'utf8');
  fs.writeFileSync(candidateManifestPath, JSON.stringify(candidateManifest, null, 2) + '\n', 'utf8');

  const masterBytesBefore = fs.readFileSync(masterPath);
  if (sha256(masterBytesBefore) !== expectedShaBefore) throw new Error('The master changed before merge.');
  const addition = Buffer.from((masterBytesBefore.length && masterBytesBefore[masterBytesBefore.length - 1] === 10 ? '' : '\n')
    + prepared.rows.join('\n') + '\n', 'utf8');
  fs.writeFileSync(tempMasterPath, Buffer.concat([masterBytesBefore, addition]));
  const after = await summarizeMaster(tempMasterPath, catalog, true);
  if (after.rows !== expectedRowsBefore + prepared.rows.length || after.metricIds.size !== 165
      || after.coreMetricIdsWithObservations !== 94 || after.emptyMetricIds.length !== 39
      || after.emptyCoreMetricIds.length !== 6 || after.emptyBitcoinMetricIds.length !== 26) {
    throw new Error('The staged master did not meet the expected Bitcoin-only coverage counts.');
  }
  const stagedSha256 = await sha256File(tempMasterPath);
  const stagedBytes = fs.statSync(tempMasterPath).size;

  fs.copyFileSync(masterPath, masterBackupPath);
  fs.copyFileSync(manifestPath, manifestBackupPath);
  fs.copyFileSync(tempMasterPath, masterPath);
  fs.unlinkSync(tempMasterPath);
  const finalSha256 = await sha256File(masterPath);
  if (finalSha256 !== stagedSha256 || fs.statSync(masterPath).size !== stagedBytes) {
    throw new Error('The installed master does not match its validated staged copy.');
  }

  const mergeRecord = {
    runDate: '2026-09-30',
    cutoffInclusive: cutoff,
    observationsAdded: prepared.rows.length,
    metricIdsAdded: targets.map((target) => target.metricId),
    firstDate: prepared.firstDate,
    lastDate: prepared.lastDate,
    candidate: path.basename(candidatePath),
    candidateManifest: path.basename(candidateManifestPath),
    candidateSha256,
    rawResearchFile: path.basename(rawPath),
    rawResearchSha256: rawSha256,
    backup: path.basename(masterBackupPath),
    previousMasterSha256: expectedShaBefore,
    mergedMasterSha256: finalSha256,
    mergedMasterBytes: stagedBytes,
    uploaded: false,
    publicRedistributionCleared: false,
    privatePersonalUseOnly: true,
    bitcoinOnly: true,
    metrics: prepared.summaries,
  };
  candidateManifest.candidateOnly = false;
  candidateManifest.mergedIntoMaster = true;
  candidateManifest.merge = mergeRecord;
  fs.writeFileSync(candidateManifestPath, JSON.stringify(candidateManifest, null, 2) + '\n', 'utf8');

  masterManifest.generatedAt = '2026-09-30';
  masterManifest.masterBytes = stagedBytes;
  masterManifest.masterSha256 = finalSha256;
  masterManifest.observations = after.rows;
  masterManifest.metricIdsWithObservations = after.metricIds.size;
  masterManifest.coreMetricIdsWithObservations = after.coreMetricIdsWithObservations;
  masterManifest.emptyMetricIds = after.emptyMetricIds.length;
  masterManifest.emptyCoreMetricIds = after.emptyCoreMetricIds.length;
  masterManifest.firstObservationDate = after.firstDate;
  masterManifest.lastObservationDate = after.lastDate;
  masterManifest.rowsAfterCutoff = after.rowsAfterCutoff;
  masterManifest.sourceCounts = after.sourceCounts;
  masterManifest.localAdditionHistory = [
    ...(masterManifest.localAdditionHistory || (masterManifest.latestLocalAddition ? [masterManifest.latestLocalAddition] : [])),
    mergeRecord,
  ];
  masterManifest.latestLocalAddition = mergeRecord;
  masterManifest.scope.remainingEmptyBitcoinMetricIds = after.emptyBitcoinMetricIds;
  masterManifest.scope.remainingEmptyCoreMetricIds = after.emptyCoreMetricIds;
  masterManifest.scope.bitviewDailyBitcoinMetrics = {
    observations: prepared.rows.length,
    metricIds: targets.map((target) => target.metricId),
    metrics: prepared.summaries,
    sourceVersion,
    sourceIndex: indexName,
    rawResearchFile: path.basename(rawPath),
    rawResearchSha256: rawSha256,
    candidate: path.basename(candidatePath),
    candidateSha256,
    publicRedistributionCleared: false,
    uploaded: false,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(masterManifest, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    dashboard: 'bitcoin',
    observationsAdded: prepared.rows.length,
    metrics: prepared.summaries,
    firstDate: prepared.firstDate,
    lastDate: prepared.lastDate,
    masterRows: after.rows,
    metricIdsWithObservations: after.metricIds.size,
    coreMetricIdsWithObservations: after.coreMetricIdsWithObservations,
    emptyMetricIds: after.emptyMetricIds.length,
    emptyBitcoinMetricIds: after.emptyBitcoinMetricIds.length,
    emptyCoreMetricIds: after.emptyCoreMetricIds.length,
    masterBytes: stagedBytes,
    masterSha256: finalSha256,
    backup: path.basename(masterBackupPath),
    manifestBackup: path.basename(manifestBackupPath),
    rawResearchFile: path.basename(rawPath),
    candidate: path.basename(candidatePath),
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
