#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const rawPath = path.join(root, 'var', 'mempool-space-min-fee-history-raw-through-2026-09-28.json');
const masterPath = path.join(root, 'var', 'bitcoin-backfill-cointime-cftc-options.csv');
const cutoffInclusive = '2026-09-28';
const seriesKey = 'mempool_statistics_12h_daily_mean';
const sourceSlug = 'mempool_space_statistics_api_research_only';
const sourceRevision = 'mempool-statistics-12h-daily-mean-v1';
const csvPath = path.join(root, 'var', `mempool-space-statistics-daily-candidates-through-${cutoffInclusive}.csv`);
const jsonPath = path.join(root, 'var', `mempool-space-statistics-daily-candidates-through-${cutoffInclusive}.json`);
const importHeader = [
  'metric_id', 'series_key', 'observation_date', 'value', 'source_slug',
  'source_timestamp', 'quality_status', 'source_revision', 'raw_payload_hash',
].join(',');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mysqlUtcTimestamp(iso) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/.exec(iso || '');
  return match ? `${match[1]} ${match[2]}` : '';
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pearson(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let i = 0; i < left.length; i++) {
    const dx = left[i] - meanLeft;
    const dy = right[i] - meanRight;
    covariance += dx * dy;
    varianceLeft += dx * dx;
    varianceRight += dy * dy;
  }
  return varianceLeft && varianceRight ? covariance / Math.sqrt(varianceLeft * varianceRight) : null;
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function readOpenBitcoinVsizeRows() {
  const input = fs.createReadStream(masterPath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const header = importHeader.split(',');
  const metricIndex = header.indexOf('metric_id');
  const seriesIndex = header.indexOf('series_key');
  const dateIndex = header.indexOf('observation_date');
  const valueIndex = header.indexOf('value');
  const sourceIndex = header.indexOf('source_slug');
  const rows = new Map();
  let first = true;

  for await (const line of lines) {
    if (first) {
      first = false;
      assert(line === importHeader, 'Unexpected master CSV header.');
      continue;
    }
    if (!line) continue;
    const cells = line.split(',');
    if (cells[metricIndex] !== 'mempool_vsize_mb' || cells[seriesIndex] !== 'openbitcoin_daily_mean') continue;
    if (cells[sourceIndex] !== 'openbitcoin_node_api') continue;
    const value = Number(cells[valueIndex]);
    assert(Number.isFinite(value) && value >= 0, `Invalid OpenBitcoin vsize value on ${cells[dateIndex]}.`);
    assert(!rows.has(cells[dateIndex]), `Duplicate OpenBitcoin vsize date ${cells[dateIndex]}.`);
    rows.set(cells[dateIndex], value);
  }
  return rows;
}

async function main() {
  assert(fs.existsSync(rawPath), `Raw input not found: ${rawPath}`);
  assert(fs.existsSync(masterPath), `Master not found: ${masterPath}`);
  assert(!fs.existsSync(csvPath) && !fs.existsSync(jsonPath), 'Candidate output already exists; refusing to overwrite it.');

  const rawBytes = fs.readFileSync(rawPath);
  const raw = JSON.parse(rawBytes.toString('utf8'));
  assert(raw.dashboard === 'bitcoin', 'Raw input is not scoped to the Bitcoin dashboard.');
  assert(raw.cutoffInclusiveUtc === cutoffInclusive, `Unexpected raw cutoff: ${raw.cutoffInclusiveUtc}`);
  assert(Array.isArray(raw.observations) && raw.observations.length > 0, 'Raw statistics observations are missing.');

  const byDate = new Map();
  const bucketStarts = new Set();
  for (const item of raw.observations) {
    assert(typeof item.bucketStartUtc === 'string' && /^\d{4}-\d{2}-\d{2}T(?:00|12):00:00\.000Z$/.test(item.bucketStartUtc), `Invalid 12-hour bucket start: ${item.bucketStartUtc}`);
    assert(item.bucketStartUtc.slice(0, 10) <= cutoffInclusive, `Observation after cutoff: ${item.bucketStartUtc}`);
    assert(!bucketStarts.has(item.bucketStartUtc), `Duplicate raw bucket: ${item.bucketStartUtc}`);
    bucketStarts.add(item.bucketStartUtc);

    const record = item.record;
    assert(record && Number.isFinite(record.count) && record.count >= 0, `Invalid unconfirmed transaction count at ${item.bucketStartUtc}`);
    assert(Array.isArray(record.vsizes) && record.vsizes.length === 39, `Unexpected vsize bucket count at ${item.bucketStartUtc}`);
    assert(record.vsizes.every((value) => Number.isFinite(value) && value >= 0), `Invalid vsize bucket at ${item.bucketStartUtc}`);
    const totalVsize = record.vsizes.reduce((sum, value) => sum + value, 0);
    assert(totalVsize > 0 || record.count === 0, `Empty vsize total with nonempty mempool at ${item.bucketStartUtc}`);

    const date = item.bucketStartUtc.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      bucketStartUtc: item.bucketStartUtc,
      apiTimestampUtc: item.apiTimestampUtc,
      unconfirmedTransactions: record.count,
      totalVsize,
    });
  }

  const completeDays = [];
  const incompleteDays = [];
  const invalidDays = [];
  for (const [date, buckets] of byDate) {
    buckets.sort((a, b) => a.bucketStartUtc.localeCompare(b.bucketStartUtc));
    const slots = buckets.map((bucket) => bucket.bucketStartUtc.slice(11, 16));
    if (buckets.length === 2 && slots[0] === '00:00' && slots[1] === '12:00') {
      completeDays.push({ date, buckets });
    } else if (buckets.length < 2) {
      incompleteDays.push({ date, availableBuckets: slots });
    } else {
      invalidDays.push({ date, availableBuckets: slots });
    }
  }
  assert(invalidDays.length === 0, `Unexpected duplicate or misaligned 12-hour records: ${JSON.stringify(invalidDays)}`);
  completeDays.sort((a, b) => a.date.localeCompare(b.date));
  incompleteDays.sort((a, b) => a.date.localeCompare(b.date));
  assert(completeDays.length > 0, 'No complete daily observations are available.');

  const missingDays = [];
  for (let date = completeDays[0].date; date <= cutoffInclusive; date = nextDate(date)) {
    if (!byDate.has(date)) missingDays.push(date);
  }

  const rows = [];
  for (const { date, buckets } of completeDays) {
    const txMean = (buckets[0].unconfirmedTransactions + buckets[1].unconfirmedTransactions) / 2;
    const vsizeMeanMb = (buckets[0].totalVsize + buckets[1].totalVsize) / 2 / 1_000_000;
    const sourceTimestamp = mysqlUtcTimestamp(buckets[1].apiTimestampUtc);

    for (const [metricId, value] of [
      ['mempool_pending_txs', txMean],
      ['mempool_vsize_mb', vsizeMeanMb],
    ]) {
      const payload = JSON.stringify({
        metricId,
        date,
        buckets: buckets.map((bucket) => ({
          bucketStartUtc: bucket.bucketStartUtc,
          apiTimestampUtc: bucket.apiTimestampUtc,
          count: bucket.unconfirmedTransactions,
          totalVsize: bucket.totalVsize,
        })),
      });
      const cells = [
        metricId,
        seriesKey,
        date,
        value.toFixed(12),
        sourceSlug,
        sourceTimestamp,
        'provisional',
        sourceRevision,
        sha256(payload),
      ];
      rows.push(cells.map(csvCell).join(','));
    }
  }

  const openBitcoinValues = await readOpenBitcoinVsizeRows();
  const overlap = completeDays
    .filter(({ date }) => openBitcoinValues.has(date))
    .map(({ date, buckets }) => {
      const derived = (buckets[0].totalVsize + buckets[1].totalVsize) / 2 / 1_000_000;
      const reference = openBitcoinValues.get(date);
      return { date, derived, reference, pctDifference: (derived - reference) / reference * 100 };
    });
  const absolutePctDifferences = overlap.map((row) => Math.abs(row.pctDifference));
  const meanAbsolutePctDifference = absolutePctDifferences.length
    ? absolutePctDifferences.reduce((sum, value) => sum + value, 0) / absolutePctDifferences.length
    : null;
  const largestAbsolutePctDifference = overlap.reduce((largest, row) => {
    const candidate = {
      date: row.date,
      mempoolSpaceMb: row.derived,
      openBitcoinMb: row.reference,
      absolutePercentDifference: Math.abs(row.pctDifference),
    };
    return !largest || candidate.absolutePercentDifference > largest.absolutePercentDifference ? candidate : largest;
  }, null);
  const overlapCorrelation = pearson(overlap.map((row) => row.derived), overlap.map((row) => row.reference));

  const firstDate = completeDays[0].date;
  const lastDate = completeDays.at(-1).date;
  const observationsPerMetric = completeDays.length;
  const output = `${importHeader}\n${rows.join('\n')}\n`;

  const metadata = {
    dashboard: 'bitcoin',
    candidateOnly: true,
    mergedIntoMaster: false,
    uploaded: false,
    databaseImported: false,
    researchOnly: true,
    publicRedistributionCleared: false,
    cutoffInclusive,
    output: path.basename(csvPath),
    outputBytes: Buffer.byteLength(output),
    outputSha256: sha256(output),
    observations: rows.length,
    seriesKey,
    proposedSeriesDisplayName: 'Mempool.space 12-Stunden-Statistik, Tagesmittel',
    metrics: {
      mempool_pending_txs: {
        observations: observationsPerMetric,
        first: firstDate,
        last: lastDate,
        unit: 'transactions',
        method: 'Arithmetic mean of the two UTC-aligned 12-hour averages of unconfirmed transaction count per day.',
      },
      mempool_vsize_mb: {
        observations: observationsPerMetric,
        first: firstDate,
        last: lastDate,
        unit: 'decimal MB (1,000,000 vbytes)',
        method: 'Sum the 39 disjoint vsize fee buckets per 12-hour aggregate, convert to decimal MB, then average the two UTC-aligned 12-hour values per day.',
      },
    },
    rawSource: {
      endpoint: raw.sourceUrl,
      documentationUrl: raw.apiDocumentationUrl,
      sourceCodeUrl: raw.sourceCodeUrl,
      attribution: 'Mempool.space historical Bitcoin statistics API.',
      licenseConfirmed: false,
      dataReuseLicenseConfirmed: false,
      rawFile: path.basename(rawPath),
      rawBytes: rawBytes.length,
      rawSha256: sha256(rawBytes),
      rawObservationCount: raw.observations.length,
      bucketsAreUtcAligned12HourMeans: true,
    },
    quality: {
      completeDays: completeDays.length,
      incompleteDays,
      missingDays,
      duplicateBucketStarts: 0,
      duplicateDailyKeys: 0,
      futureRowsAfterCutoff: 0,
      interpolatedValues: 0,
    },
    comparison: {
      referenceMetric: 'mempool_vsize_mb',
      referenceSeriesKey: 'openbitcoin_daily_mean',
      overlappingDays: overlap.length,
      medianAbsolutePercentDifference: median(absolutePctDifferences),
      meanAbsolutePercentDifference: meanAbsolutePctDifference,
      largestAbsolutePercentDifference,
      pearsonCorrelation: overlapCorrelation,
      interpretation: 'Keep the Mempool.space history as a separately labeled source series. Do not splice it into or overwrite the OpenBitcoin series; daily level and timing differences are material.',
    },
    rightsNote: 'Private local research candidate. Public redistribution and website import are not cleared.',
  };
  const json = `${JSON.stringify(metadata, null, 2)}\n`;

  const summary = {
    csv: path.relative(process.cwd(), csvPath),
    metadata: path.relative(process.cwd(), jsonPath),
    rows: rows.length,
    observationsPerMetric,
    firstDate,
    lastDate,
    incompleteDays: incompleteDays.length,
    missingDays: missingDays.length,
    overlapDaysWithOpenBitcoinVsize: overlap.length,
    medianAbsolutePercentDifference: metadata.comparison.medianAbsolutePercentDifference,
    meanAbsolutePercentDifference: meanAbsolutePctDifference,
    largestAbsolutePercentDifference,
    pearsonCorrelation: overlapCorrelation,
    outputSha256: metadata.outputSha256,
    candidateOnly: true,
    publicRedistributionCleared: false,
  };

  fs.writeFileSync(csvPath, output, 'utf8');
  fs.writeFileSync(jsonPath, json, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
