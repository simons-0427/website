const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const cutoff = process.argv[2] || '2026-09-28';
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error('Expected cutoff as YYYY-MM-DD.');
const endpoint = 'https://mempool.space/api/v1/statistics/all';
const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const suffix = `through-${cutoff}`;
const rawPath = path.join(varDir, `mempool-space-min-fee-history-raw-${suffix}.json`);
const candidatePath = path.join(varDir, `mempool-space-min-fee-daily-candidate-${suffix}.csv`);
const manifestPath = path.join(varDir, `mempool-space-min-fee-daily-candidate-${suffix}.json`);
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sourceSlug = 'mempool_space_statistics_api_research_only';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function writeNew(filename, value) {
  fs.writeFileSync(filename, value, { flag: 'wx', encoding: 'utf8' });
}

async function main() {
  fs.mkdirSync(varDir, { recursive: true });
  for (const filename of [rawPath, candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite ${filename}`);
  }

  const response = await fetch(endpoint, {
    headers: { 'user-agent': 'Bitcoin-Dashboard-private-research/1.0' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Mempool API returned HTTP ${response.status}.`);
  const responseText = await response.text();
  const payload = JSON.parse(responseText);
  if (!Array.isArray(payload)) throw new Error('Mempool statistics response is not an array.');

  const cutoffEpoch = Date.parse(`${cutoff}T23:59:59.999Z`) / 1000;
  const bucketSeconds = 43200;
  const groups = new Map();
  let afterCutoffWithMinFee = 0;
  let rowsWithMinFee = 0;
  for (const row of payload) {
    const timestamp = Number(row.added ?? row.time ?? row.timestamp);
    const fee = Number(row.min_fee ?? row.minFee);
    if (!Number.isFinite(timestamp) || !Number.isFinite(fee)) continue;
    rowsWithMinFee++;
    if (timestamp < 0 || fee < 0) throw new Error('Found a negative timestamp or minimum-fee value.');
    const bucketId = Math.floor(timestamp / bucketSeconds);
    const bucketStart = bucketId * bucketSeconds;
    if (bucketStart > cutoffEpoch) {
      afterCutoffWithMinFee++;
      continue;
    }
    const date = new Date(bucketStart * 1000).toISOString().slice(0, 10);
    const observations = groups.get(date) || [];
    observations.push({ timestamp, fee, bucketId, bucketStart, sourceRecord: row });
    groups.set(date, observations);
  }

  const dates = [...groups.keys()].sort();
  if (dates.length === 0) throw new Error('No historical min_fee values were returned.');
  const expectedStart = '2023-11-21';
  if (dates[0] !== expectedStart || dates.at(-1) !== cutoff) {
    throw new Error(`Unexpected history range ${dates[0]} through ${dates.at(-1)}; expected ${expectedStart} through ${cutoff}.`);
  }
  const expectedDays = (Date.parse(`${cutoff}T00:00:00Z`) - Date.parse(`${expectedStart}T00:00:00Z`)) / 86400000 + 1;
  const expectedDates = Array.from({ length: expectedDays }, (_, index) =>
    new Date(Date.parse(`${expectedStart}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
  const missingDates = expectedDates.filter((date) => !groups.has(date));
  if (process.argv[3] === '--inspect') {
    const histogram = {};
    const anomalies = [];
    const allBucketIds = [];
    for (const date of dates) {
      const observations = groups.get(date).sort((a, b) => a.bucketId - b.bucketId);
      histogram[observations.length] = (histogram[observations.length] || 0) + 1;
      allBucketIds.push(...observations.map((observation) => observation.bucketId));
      if (observations.length !== 2) {
        anomalies.push({
          date,
          count: observations.length,
          bucketStartsUtc: observations.map((observation) => new Date(observation.bucketStart * 1000).toISOString()),
          timestampsUtc: observations.map((observation) => new Date(observation.timestamp * 1000).toISOString()),
          valuesSatVb: observations.map((observation) => observation.fee),
        });
      }
    }
    const duplicateBucketIds = allBucketIds.filter((bucketId, index) => allBucketIds.indexOf(bucketId) !== index);
    console.log(JSON.stringify({
      apiRows: payload.length,
      minFeeRowsInApiResponse: rowsWithMinFee,
      minFeeRowsAfterCutoffExcluded: afterCutoffWithMinFee,
      firstDate: dates[0],
      lastDate: dates.at(-1),
      days: dates.length,
      expectedDateCount: expectedDays,
      missingDates,
      utcBucketCountHistogramByDay: histogram,
      duplicateBucketIds: [...new Set(duplicateBucketIds)],
      anomalousDays: anomalies,
    }, null, 2));
    return;
  }
  const rows = [];
  const skippedIncompleteDays = [];
  for (const date of dates) {
    const observations = groups.get(date).sort((a, b) => a.bucketId - b.bucketId);
    if (observations.length !== 2) {
      if (observations.length === 1) {
        skippedIncompleteDays.push({
          date,
          count: 1,
          bucketStartsUtc: observations.map((observation) => new Date(observation.bucketStart * 1000).toISOString()),
          timestampsUtc: observations.map((observation) => new Date(observation.timestamp * 1000).toISOString()),
          valuesSatVb: observations.map((observation) => observation.fee),
        });
        continue;
      }
      throw new Error(`${date}: expected two 12-hour values, got ${observations.length}.`);
    }
    const dayStart = Date.parse(`${date}T00:00:00Z`) / 1000;
    const expectedBucketIds = [dayStart / bucketSeconds, dayStart / bucketSeconds + 1];
    if (observations.some((observation, index) => observation.bucketId !== expectedBucketIds[index])) {
      throw new Error(`${date}: returned values do not represent that UTC day's two 12-hour buckets.`);
    }
    const mean = Number(((observations[0].fee + observations[1].fee) / 2).toFixed(12));
    const value = mean.toString();
    const sourceRows = observations.map((observation) => ({
      bucketStartUtc: new Date(observation.bucketStart * 1000).toISOString(),
      apiTimestampUtc: new Date(observation.timestamp * 1000).toISOString(),
      record: observation.sourceRecord,
    }));
    const payloadHash = sha256(JSON.stringify(sourceRows));
    rows.push([
      'mempool_min_fee_sat_vb',
      'main',
      date,
      value,
      sourceSlug,
      '',
      'provisional',
      'daily-mean-of-two-utc-aligned-12h-statistics-averages-round-12dp',
      payloadHash,
    ]);
  }

  const expectedCandidateDays = expectedDays - missingDates.length - skippedIncompleteDays.length;
  if (rows.length !== expectedCandidateDays) {
    throw new Error(`Expected ${expectedCandidateDays} complete daily values, got ${rows.length}.`);
  }
  const rawRecords = dates.flatMap((date) =>
    groups.get(date).sort((a, b) => a.bucketId - b.bucketId).map((observation) => ({
      bucketStartUtc: new Date(observation.bucketStart * 1000).toISOString(),
      apiTimestampUtc: new Date(observation.timestamp * 1000).toISOString(),
      record: observation.sourceRecord,
    })));
  if (rawRecords.length !== rowsWithMinFee - afterCutoffWithMinFee) {
    throw new Error('Cutoff-filtered raw record count does not match the API min_fee row count.');
  }

  const fetchedAtUtc = new Date().toISOString();
  const rawDocument = {
    dashboard: 'bitcoin',
    source: 'Mempool.space Bitcoin historical statistics API',
    sourceUrl: endpoint,
    apiDocumentationUrl: 'https://mempool.space/docs/api/rest',
    sourceCodeUrl: 'https://github.com/mempool/mempool/blob/master/backend/src/api/statistics/statistics-api.ts',
    fetchedAtUtc,
    cutoffInclusiveUtc: cutoff,
    field: 'min_fee',
    fieldUnit: 'sat/vB, as reported in the API statistics object',
    bucketAlignment: 'The API query groups by UNIX_TIMESTAMP(added) DIV 43200 and averages min_fee within each bucket. Its returned added timestamp is not treated as the bucket start; the 12-hour bucket is inferred using floor(timestamp / 43200).',
    rawApiResponseSha256: sha256(responseText),
    rawApiResponseBytes: Buffer.byteLength(responseText),
    minFeeRowsInApiResponse: rowsWithMinFee,
    minFeeRowsAfterCutoffExcluded: afterCutoffWithMinFee,
    retainedObservationCount: rawRecords.length,
    incompleteDatesExcludedFromCandidate: skippedIncompleteDays,
    datesWithNoMinFeeObservation: missingDates,
    incompleteDailyValuesInterpolated: false,
    observations: rawRecords,
  };
  const rawText = `${JSON.stringify(rawDocument, null, 2)}\n`;
  const csvText = `${header}\n${rows.map((row) => row.join(',')).join('\n')}\n`;
  const rawSha256 = sha256(rawText);
  const candidateSha256 = sha256(csvText);
  const values = rows.map((row) => Number(row[3]));
  const sortedValues = [...values].sort((a, b) => a - b);
  const median = (sortedValues[(sortedValues.length - 1) >> 1] + sortedValues[sortedValues.length >> 1]) / 2;
  const manifest = {
    dashboard: 'bitcoin',
    metricId: 'mempool_min_fee_sat_vb',
    sourceSlug,
    source: rawDocument.source,
    sourceUrl: endpoint,
    sourceCodeUrl: rawDocument.sourceCodeUrl,
    cutoffInclusiveUtc: cutoff,
    firstObservation: dates[0],
    lastObservation: dates.at(-1),
    observations: rows.length,
    raw12HourRecords: rawRecords.length,
    dailyAggregation: 'Arithmetic mean of the two Unix-aligned Mempool.space 12-hour statistics bucket averages within each UTC calendar day, rounded to 12 decimal places to match the dashboard DECIMAL(36,12) importer; days without exactly two usable buckets are omitted without interpolation.',
    valueRounding: { decimalPlaces: 12, method: 'JavaScript Number.toFixed(12) before CSV export.' },
    unit: 'sat/vB',
    qualityStatus: 'provisional',
    rightsNote: 'Public API data retained for private local research; public redistribution rights were not independently confirmed.',
    rawFile: path.basename(rawPath),
    rawBytes: Buffer.byteLength(rawText),
    rawSha256,
    apiResponseSha256: rawDocument.rawApiResponseSha256,
    candidateFile: path.basename(candidatePath),
    candidateBytes: Buffer.byteLength(csvText),
    candidateSha256,
    excludedAfterCutoff: afterCutoffWithMinFee,
    incompleteDaysExcluded: skippedIncompleteDays,
    missingDays: missingDates,
    noInterpolation: true,
    minimum: Math.min(...values),
    median,
    maximum: Math.max(...values),
    fetchedAtUtc,
    uploaded: false,
  };

  writeNew(rawPath, rawText);
  writeNew(candidatePath, csvText);
  writeNew(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    dashboard: 'bitcoin',
    cutoffInclusiveUtc: cutoff,
    apiRows: payload.length,
    minFeeRowsInApiResponse: rowsWithMinFee,
    minFeeRowsAfterCutoffExcluded: afterCutoffWithMinFee,
    retainedHalfDayRows: rawRecords.length,
    dailyObservations: rows.length,
    incompleteDaysExcluded: skippedIncompleteDays,
    missingDays: missingDates,
    firstObservation: dates[0],
    lastObservation: dates.at(-1),
    minimum: manifest.minimum,
    median: manifest.median,
    maximum: manifest.maximum,
    rawFile: rawPath,
    candidateFile: candidatePath,
    manifestFile: manifestPath,
    candidateSha256,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
