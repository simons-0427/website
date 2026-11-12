const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const masterBackupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bitview-address-counts-2026-09-30.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const manifestBackupPath = path.join(varDir, 'manifest-through-2026-09-28-before-bitview-address-counts-2026-09-30.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const rawPath = path.join(varDir, 'bitview-address-counts-research-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'bitview-address-counts-import-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'bitview-address-counts-import-through-2026-09-28.json');
const tempMasterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-bitview-address-counts-merge.tmp.csv');
const expectedHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expectedRowsBefore = 790756;
const expectedBytesBefore = 157811519;
const expectedShaBefore = '8d08b0d0a042de9fb4e46e16eb804a6a92c98b244efd621a68d709652ee44fcc';
const startDate = '2009-01-09';
const endDateExclusive = '2026-09-29';
const cutoff = '2026-09-28';
const sourceSlug = 'bitview_api_research_only';
const apiVersion = 'v0.12.2';
const indexName = 'day1';
const dayMs = 86400000;
const utcIndexEpoch = Date.UTC(2009, 0, 1);
const requestedStartIndex = (Date.parse(startDate + 'T00:00:00Z') - utcIndexEpoch) / dayMs;
const requestedEndIndex = (Date.parse(endDateExclusive + 'T00:00:00Z') - utcIndexEpoch) / dayMs;
const expectedDays = requestedEndIndex - requestedStartIndex;
const targets = [
  { sourceSeries: 'addrs_over_1btc_addr_count', metricId: 'addresses_1btc', threshold: 1 },
  { sourceSeries: 'addrs_over_100btc_addr_count', metricId: 'addresses_100btc', threshold: 100 },
  { sourceSeries: 'addrs_over_1k_btc_addr_count', metricId: 'addresses_1000btc', threshold: 1000, thresholdLabel: '1,000' },
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
  if (/[",\r\n]/.test(text)) throw new Error('Unerwartetes CSV-Sonderzeichen.');
  return text;
}

function dateAtIndex(index) {
  return new Date(utcIndexEpoch + index * dayMs).toISOString().slice(0, 10);
}

async function fetchJson(url, description) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(description + ' antwortete mit HTTP ' + response.status + '.');
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error(description + ' lieferte kein gültiges JSON.');
  }
  return { payload, bodyText };
}

async function fetchSeries(target) {
  const seriesUrl = 'https://bitview.space/api/series/' + encodeURIComponent(target.sourceSeries);
  const metadataResult = await fetchJson(seriesUrl, target.sourceSeries + ' metadata');
  const metadata = metadataResult.payload;
  const requiredPhrase = 'Uses values of at least ' + (target.thresholdLabel || target.threshold) + ' BTC.';
  if (!metadata || !Array.isArray(metadata.indexes) || !metadata.indexes.includes(indexName)
      || typeof metadata.description !== 'string'
      || !metadata.description.includes('Number of funded addresses grouped by balance')
      || !metadata.description.includes(requiredPhrase)) {
    throw new Error(target.sourceSeries + ' does not match the reviewed funded-address definition.');
  }

  const params = new URLSearchParams({
    start: startDate,
    end: endDateExclusive,
    format: 'json',
  });
  const dataUrl = seriesUrl + '/' + indexName + '?' + params.toString();
  const dataResult = await fetchJson(dataUrl, target.sourceSeries + ' data');
  const payload = dataResult.payload;
  if (!payload || payload.index !== indexName || !Array.isArray(payload.data)) {
    throw new Error(target.sourceSeries + ' did not return the requested daily index.');
  }
  if (payload.start !== requestedStartIndex || payload.end !== requestedEndIndex
      || payload.data.length !== expectedDays) {
    throw new Error(target.sourceSeries + ' has an unexpected daily range: '
      + JSON.stringify({ start: payload.start, end: payload.end, values: payload.data.length, expectedDays }));
  }
  if (payload.data.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(target.sourceSeries + ' contains a negative, fractional, or unsafe integer.');
  }
  return {
    target,
    metadata,
    metadataUrl: seriesUrl,
    dataUrl,
    payload,
    bodyText: dataResult.bodyText,
    bodySha256: sha256(dataResult.bodyText),
    metadataSha256: sha256(metadataResult.bodyText),
  };
}

function buildCandidate(seriesResults) {
  const rows = [];
  const summaries = {};
  for (const result of seriesResults) {
    const { target, payload, metadata } = result;
    let minimum = Infinity;
    let maximum = -Infinity;
    let zeroCount = 0;
    for (let offset = 0; offset < expectedDays; offset++) {
      const index = payload.start + offset;
      const date = dateAtIndex(index);
      if (date !== dateAtIndex(requestedStartIndex + offset) || date > cutoff) {
        throw new Error('The daily index did not map to the expected UTC date range.');
      }
      const value = payload.data[offset];
      const revision = 'bitview-' + apiVersion + ':' + target.sourceSeries + ':' + index + ':' + payload.version;
      const payloadHash = sha256([
        target.sourceSeries,
        apiVersion,
        indexName,
        index,
        value,
        payload.version,
      ].join('\n'));
      rows.push([
        target.metricId,
        'main',
        date,
        String(value),
        sourceSlug,
        '',
        'provisional',
        revision,
        payloadHash,
      ].map(csvCell).join(','));
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      if (value === 0) zeroCount++;
    }
    summaries[target.metricId] = {
      sourceSeries: target.sourceSeries,
      description: metadata.description,
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
      thresholdBtc: target.threshold,
      sourceResponseSha256: result.bodySha256,
      metadataResponseSha256: result.metadataSha256,
    };
  }
  return {
    csv: expectedHeader + '\n' + rows.join('\n') + '\n',
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
  const targetCounts = Object.fromEntries(targets.map((target) => [target.metricId, 0]));
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
  if (requireTargets && targets.some((target) => targetCounts[target.metricId] !== expectedDays)) {
    throw new Error('The new address metrics do not have the expected daily row counts: ' + JSON.stringify(targetCounts));
  }
  if (rowsAfterCutoff !== 0 || lastDate !== cutoff) throw new Error('Unexpected observations after the Bitcoin cutoff.');
  if (Object.values(sourceCounts).reduce((sum, count) => sum + count, 0) !== rows) {
    throw new Error('Source counts do not add up to the master row count.');
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
  if (before.rows !== expectedRowsBefore || before.metricIds.size !== 165
      || before.coreMetricIdsWithObservations !== 94 || before.emptyMetricIds.length !== 39
      || before.emptyBitcoinMetricIds.length !== 26
      || targets.some((target) => before.metricIds.has(target.metricId))) {
    throw new Error('The active master coverage changed since the source review.');
  }

  const results = await Promise.all(targets.map(fetchSeries));
  const prepared = buildCandidate(results);
  const candidateBytes = Buffer.byteLength(prepared.csv, 'utf8');
  const candidateSha256 = sha256(prepared.csv);
  const rawData = {
    dashboard: 'bitcoin',
    source: 'Bitcoin Research Kit / Bitview API',
    apiVersion,
    retrievedAtUtc: new Date().toISOString(),
    queryRange: { startInclusive: startDate, endExclusive: endDateExclusive, lastIncludedDate: cutoff },
    index: indexName,
    bitcoinOnly: true,
    publicRedistributionCleared: false,
    responses: Object.fromEntries(results.map((result) => [result.target.sourceSeries, {
      metadataUrl: result.metadataUrl,
      metadataSha256: result.metadataSha256,
      description: result.metadata.description,
      dataUrl: result.dataUrl,
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
    metricCounts: Object.fromEntries(targets.map((target) => [target.metricId, prepared.summaries[target.metricId].observations])),
    sourceSlug,
    source: 'https://bitview.space/api',
    sourceSeries: prepared.summaries,
    firstObservationDate: prepared.firstDate,
    lastObservationDate: prepared.lastDate,
    noMissingDates: prepared.noMissingDates,
    noInterpolation: prepared.noInterpolation,
    limitations: [
      'Each daily value counts funded Bitcoin addresses whose balance meets the stated BTC threshold at the final block of that day1 index.',
      'An address is not a person, organization, custodian, or wallet owner.',
      'Hosted Bitview metric data do not have a separately verified reuse license. These rows remain private and local.',
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
  if (after.rows !== expectedRowsBefore + prepared.rows.length || after.metricIds.size !== 168
      || after.coreMetricIdsWithObservations !== 94 || after.emptyMetricIds.length !== 36
      || after.emptyCoreMetricIds.length !== 6 || after.emptyBitcoinMetricIds.length !== 23) {
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
  masterManifest.scope.bitviewAddressCounts = {
    observations: prepared.rows.length,
    metricIds: targets.map((target) => target.metricId),
    metrics: prepared.summaries,
    sourceVersion: apiVersion,
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
