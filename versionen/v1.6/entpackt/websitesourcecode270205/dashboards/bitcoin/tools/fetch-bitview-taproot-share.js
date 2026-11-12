const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const masterBackupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bitview-taproot-share-2026-09-30.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const manifestBackupPath = path.join(varDir, 'manifest-through-2026-09-28-before-bitview-taproot-share-2026-09-30.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const rawPath = path.join(varDir, 'bitview-taproot-share-research-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'bitview-taproot-share-import-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'bitview-taproot-share-import-through-2026-09-28.json');
const tempMasterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-bitview-taproot-share-merge.tmp.csv');
const expectedHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expectedRowsBefore = 810172;
const expectedBytesBefore = 161738075;
const expectedShaBefore = '790574cb97bea258294eb6927abb4085b8c38f02867c77a3f321d35ee5622252';
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
const metricId = 'taproot_share_pct';
const numeratorSeries = 'tx_count_with_p2tr_output_sum_24h';
const denominatorSeries = 'tx_count_sum_24h';

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

async function fetchSeries(name) {
  const seriesUrl = 'https://bitview.space/api/series/' + encodeURIComponent(name);
  const metadataResult = await fetchJson(seriesUrl, name + ' metadata');
  const metadata = metadataResult.payload;
  if (!metadata || !Array.isArray(metadata.indexes) || !metadata.indexes.includes(indexName)
      || typeof metadata.description !== 'string'
      || !metadata.description.includes('Uses a trailing 24-hour window.')) {
    throw new Error(name + ' does not support the reviewed trailing 24-hour daily definition.');
  }
  const params = new URLSearchParams({
    start: startDate,
    end: endDateExclusive,
    format: 'json',
  });
  const dataUrl = seriesUrl + '/' + indexName + '?' + params.toString();
  const dataResult = await fetchJson(dataUrl, name + ' data');
  const payload = dataResult.payload;
  if (!payload || payload.index !== indexName || !Array.isArray(payload.data)
      || payload.start !== requestedStartIndex || payload.end !== requestedEndIndex
      || payload.data.length !== expectedDays) {
    throw new Error(name + ' has an unexpected daily index or range: '
      + JSON.stringify({ start: payload && payload.start, end: payload && payload.end, values: payload && payload.data && payload.data.length }));
  }
  if (payload.data.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(name + ' contains a negative, fractional, or unsafe integer.');
  }
  return {
    name,
    metadata,
    metadataUrl: seriesUrl,
    dataUrl,
    payload,
    bodyText: dataResult.bodyText,
    bodySha256: sha256(dataResult.bodyText),
    metadataSha256: sha256(metadataResult.bodyText),
  };
}

function buildCandidate(numerator, denominator) {
  if (numerator.payload.start !== denominator.payload.start
      || numerator.payload.end !== denominator.payload.end
      || numerator.payload.data.length !== denominator.payload.data.length) {
    throw new Error('Taproot numerator and denominator do not cover the same indexes.');
  }
  const rows = [];
  let minimum = Infinity;
  let maximum = -Infinity;
  let zeroCount = 0;
  let firstDate = null;
  let lastDate = null;
  for (let offset = 0; offset < expectedDays; offset++) {
    const index = numerator.payload.start + offset;
    const date = dateAtIndex(index);
    if (date !== dateAtIndex(requestedStartIndex + offset) || date > cutoff) {
      throw new Error('The daily index did not map to the expected UTC date range.');
    }
    const numeratorValue = numerator.payload.data[offset];
    const denominatorValue = denominator.payload.data[offset];
    if (denominatorValue <= 0 || numeratorValue > denominatorValue) {
      throw new Error('Invalid Taproot share counts on ' + date + '.');
    }
    const value = Number(((numeratorValue / denominatorValue) * 100).toFixed(12));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error('Invalid Taproot percentage on ' + date + '.');
    }
    const revision = 'bitview-' + apiVersion + ':' + numerator.name + ':' + denominator.name
      + ':' + index + ':' + numerator.payload.version + ':' + denominator.payload.version;
    const payloadHash = sha256([
      numerator.name,
      numerator.payload.version,
      numeratorValue,
      denominator.name,
      denominator.payload.version,
      denominatorValue,
      indexName,
      index,
    ].join('\n'));
    rows.push([
      metricId,
      'main',
      date,
      value.toFixed(12),
      sourceSlug,
      '',
      'provisional',
      revision,
      payloadHash,
    ].map(csvCell).join(','));
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    if (value === 0) zeroCount++;
    if (!firstDate) firstDate = date;
    lastDate = date;
  }
  return {
    csv: expectedHeader + '\n' + rows.join('\n') + '\n',
    rows,
    summary: {
      metricId,
      numeratorSeries: numerator.name,
      denominatorSeries: denominator.name,
      numeratorDescription: numerator.metadata.description,
      denominatorDescription: denominator.metadata.description,
      numeratorVersion: numerator.payload.version,
      denominatorVersion: denominator.payload.version,
      sourceIndex: indexName,
      numeratorType: numerator.payload.type,
      denominatorType: denominator.payload.type,
      observations: rows.length,
      firstDate,
      lastDate,
      minimum,
      maximum,
      zeroValues: zeroCount,
      formula: '100 * tx_count_with_p2tr_output_sum_24h / tx_count_sum_24h',
      sourceResponseSha256: {
        numerator: numerator.bodySha256,
        denominator: denominator.bodySha256,
      },
      metadataResponseSha256: {
        numerator: numerator.metadataSha256,
        denominator: denominator.metadataSha256,
      },
    },
  };
}

async function summarizeMaster(filename, catalog, requireTarget) {
  const metricIds = new Set();
  const sourceCounts = {};
  let targetRows = 0;
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
    if (cells[0] === metricId) targetRows++;
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
  if (requireTarget && targetRows !== expectedDays) {
    throw new Error('Taproot share does not have the expected daily row count: ' + targetRows);
  }
  if (rowsAfterCutoff !== 0 || lastDate !== cutoff) throw new Error('Unexpected observations after the Bitcoin cutoff.');
  if (Object.values(sourceCounts).reduce((sum, count) => sum + count, 0) !== rows) {
    throw new Error('Source counts do not add up to the master row count.');
  }
  return {
    rows,
    metricIds,
    sourceCounts,
    targetRows,
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
  if (!catalog.metrics.some((metric) => metric.id === metricId)) {
    throw new Error('Catalog is missing target metric ' + metricId + '.');
  }
  const before = await summarizeMaster(masterPath, catalog, false);
  if (before.rows !== expectedRowsBefore || before.metricIds.size !== 168
      || before.coreMetricIdsWithObservations !== 94 || before.emptyMetricIds.length !== 36
      || before.emptyBitcoinMetricIds.length !== 23 || before.metricIds.has(metricId)) {
    throw new Error('The active master coverage changed since the source review.');
  }

  const [numerator, denominator] = await Promise.all([
    fetchSeries(numeratorSeries),
    fetchSeries(denominatorSeries),
  ]);
  if (!numerator.metadata.description.includes('Uses pay-to-Taproot outputs.')
      || !numerator.metadata.description.includes('Each transaction is counted once per type;')
      || !numerator.metadata.description.includes('aggregate counts every transaction, including coinbase.')
      || !denominator.metadata.description.includes('including the coinbase transaction.')) {
    throw new Error('Taproot numerator and denominator definitions do not match the reviewed transaction share.');
  }
  const prepared = buildCandidate(numerator, denominator);
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
    responses: {
      [numeratorSeries]: {
        metadataUrl: numerator.metadataUrl,
        metadataSha256: numerator.metadataSha256,
        description: numerator.metadata.description,
        dataUrl: numerator.dataUrl,
        status: 200,
        bodySha256: numerator.bodySha256,
        body: numerator.bodyText,
      },
      [denominatorSeries]: {
        metadataUrl: denominator.metadataUrl,
        metadataSha256: denominator.metadataSha256,
        description: denominator.metadata.description,
        dataUrl: denominator.dataUrl,
        status: 200,
        bodySha256: denominator.bodySha256,
        body: denominator.bodyText,
      },
    },
    calculation: prepared.summary,
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
    metricIds: [metricId],
    metricCounts: { [metricId]: prepared.rows.length },
    sourceSlug,
    source: 'https://bitview.space/api',
    sourceSeries: prepared.summary,
    firstObservationDate: prepared.summary.firstDate,
    lastObservationDate: prepared.summary.lastDate,
    noMissingDates: true,
    noInterpolation: true,
    limitations: [
      'Taproot share means the percentage of transactions creating at least one P2TR output, with each transaction counted once.',
      'The source all-aggregate and the denominator both include coinbase transactions.',
      'This is not the share of transactions that spend a P2TR output.',
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
  if (after.rows !== expectedRowsBefore + prepared.rows.length || after.metricIds.size !== 169
      || after.coreMetricIdsWithObservations !== 94 || after.emptyMetricIds.length !== 35
      || after.emptyCoreMetricIds.length !== 6 || after.emptyBitcoinMetricIds.length !== 22) {
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
    metricIdsAdded: [metricId],
    firstDate: prepared.summary.firstDate,
    lastDate: prepared.summary.lastDate,
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
    metrics: { [metricId]: prepared.summary },
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
  masterManifest.scope.bitviewTaprootShare = {
    observations: prepared.rows.length,
    metricIds: [metricId],
    metric: prepared.summary,
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
    metric: prepared.summary,
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
