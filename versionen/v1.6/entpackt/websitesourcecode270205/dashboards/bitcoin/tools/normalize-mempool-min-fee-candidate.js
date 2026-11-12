const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const cutoff = process.argv[2] || '2026-09-28';
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || process.argv[3] !== '--round-12') {
  throw new Error('Usage: node tools/normalize-mempool-min-fee-candidate.js YYYY-MM-DD --round-12');
}

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const rawPath = path.join(varDir, `mempool-space-min-fee-history-raw-through-${cutoff}.json`);
const candidatePath = path.join(varDir, `mempool-space-min-fee-daily-candidate-through-${cutoff}.csv`);
const manifestPath = path.join(varDir, `mempool-space-min-fee-daily-candidate-through-${cutoff}.json`);
const backupSuffix = `before-12dp-${new Date().toISOString().replace(/[.:]/g, '-')}`;
const tempCandidate = `${candidatePath}.next`;
const tempManifest = `${manifestPath}.next`;
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function hashRows(rows) {
  return sha256(JSON.stringify(rows));
}

function meanToDatabasePrecision(first, second) {
  return Number(((first + second) / 2).toFixed(12)).toString();
}

function replaceFile(tempPath, finalPath) {
  try {
    fs.renameSync(tempPath, finalPath);
  } catch (error) {
    if (!fs.existsSync(finalPath)) throw error;
    fs.unlinkSync(finalPath);
    fs.renameSync(tempPath, finalPath);
  }
}

function main() {
  for (const filename of [rawPath, candidatePath, manifestPath]) {
    if (!fs.existsSync(filename)) throw new Error(`Required Mempool research file is missing: ${filename}`);
  }
  for (const filename of [tempCandidate, tempManifest]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite ${filename}`);
  }

  const rawBuffer = fs.readFileSync(rawPath);
  const raw = JSON.parse(rawBuffer.toString('utf8'));
  const currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (raw.dashboard !== 'bitcoin' || raw.cutoffInclusiveUtc !== cutoff
    || currentManifest.metricId !== 'mempool_min_fee_sat_vb'
    || currentManifest.rawSha256 !== sha256(rawBuffer)) {
    throw new Error('Raw Mempool data, cutoff, and current candidate manifest do not reconcile.');
  }

  const grouped = new Map();
  const seenBuckets = new Set();
  for (const observation of raw.observations) {
    const bucketStart = Date.parse(observation.bucketStartUtc);
    const apiTimestamp = Date.parse(observation.apiTimestampUtc);
    const record = observation.record;
    if (!Number.isFinite(bucketStart) || !Number.isFinite(apiTimestamp)
      || !record || !Number.isFinite(Number(record.min_fee))) {
      throw new Error('Raw evidence contains an invalid Mempool observation.');
    }
    const bucketId = Math.floor(bucketStart / 1000 / 43200);
    if (bucketStart !== bucketId * 43200 * 1000) throw new Error('Raw bucket start is not UTC-aligned to 12 hours.');
    if (seenBuckets.has(bucketId)) throw new Error(`Duplicate raw 12-hour bucket ${observation.bucketStartUtc}.`);
    seenBuckets.add(bucketId);
    const date = observation.bucketStartUtc.slice(0, 10);
    const rows = grouped.get(date) || [];
    rows.push(observation);
    grouped.set(date, rows);
  }

  const expectedDates = [];
  const start = Date.parse(`${currentManifest.firstObservation}T00:00:00Z`);
  const end = Date.parse(`${currentManifest.lastObservation}T00:00:00Z`);
  for (let time = start; time <= end; time += 86400000) expectedDates.push(new Date(time).toISOString().slice(0, 10));
  const rows = [header];
  for (const date of expectedDates) {
    const observations = (grouped.get(date) || []).sort((a, b) => a.bucketStartUtc.localeCompare(b.bucketStartUtc));
    if (observations.length === 0) continue;
    if (observations.length !== 2) continue;
    const expectedBucketStarts = [`${date}T00:00:00.000Z`, `${date}T12:00:00.000Z`];
    if (observations.some((observation, index) => observation.bucketStartUtc !== expectedBucketStarts[index])) {
      throw new Error(`${date}: expected two UTC-aligned half-day buckets.`);
    }
    const value = meanToDatabasePrecision(Number(observations[0].record.min_fee), Number(observations[1].record.min_fee));
    const payloadHash = hashRows(observations);
    rows.push([
      'mempool_min_fee_sat_vb',
      'main',
      date,
      value,
      currentManifest.sourceSlug,
      '',
      'provisional',
      'daily-mean-of-two-utc-aligned-12h-statistics-averages-round-12dp',
      payloadHash,
    ].join(','));
  }

  const originalCandidate = fs.readFileSync(candidatePath, 'utf8').trimEnd().split(/\r?\n/);
  if (originalCandidate[0] !== header || rows.length !== currentManifest.observations + 1
    || originalCandidate.length !== rows.length) {
    throw new Error('Regenerated daily candidate row count does not match the existing candidate.');
  }
  const csvText = `${rows.join('\n')}\n`;
  const numericValues = rows.slice(1).map((line) => Number(line.split(',')[3])).sort((a, b) => a - b);
  if (numericValues.some((value) => !Number.isFinite(value))) throw new Error('Candidate has an invalid numeric value.');
  const median = (numericValues[(numericValues.length - 1) >> 1] + numericValues[numericValues.length >> 1]) / 2;
  const rawSha256 = sha256(rawBuffer);
  const candidateSha256 = sha256(csvText);
  const manifest = {
    ...currentManifest,
    observations: rows.length - 1,
    dailyAggregation: 'Arithmetic mean of the two Unix-aligned Mempool.space 12-hour statistics bucket averages within each UTC calendar day, rounded to 12 decimal places to match the dashboard DECIMAL(36,12) importer; days without exactly two usable buckets are omitted without interpolation.',
    valueRounding: { decimalPlaces: 12, method: 'JavaScript Number.toFixed(12) before CSV export.' },
    rawBytes: rawBuffer.length,
    rawSha256,
    candidateBytes: Buffer.byteLength(csvText),
    candidateSha256,
    minimum: numericValues[0],
    median,
    maximum: numericValues.at(-1),
    normalizedAtUtc: new Date().toISOString(),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.copyFileSync(candidatePath, `${candidatePath}.${backupSuffix}`, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(manifestPath, `${manifestPath}.${backupSuffix}`, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(tempCandidate, csvText, { flag: 'wx', encoding: 'utf8' });
  fs.writeFileSync(tempManifest, manifestText, { flag: 'wx', encoding: 'utf8' });
  replaceFile(tempCandidate, candidatePath);
  replaceFile(tempManifest, manifestPath);

  console.log(JSON.stringify({
    cutoffInclusiveUtc: cutoff,
    observations: rows.length - 1,
    maximumFractionDigits: 12,
    minimum: manifest.minimum,
    median: manifest.median,
    maximum: manifest.maximum,
    candidateSha256,
    rawSha256,
    candidateFile: candidatePath,
    manifestFile: manifestPath,
    backups: [`${path.basename(candidatePath)}.${backupSuffix}`, `${path.basename(manifestPath)}.${backupSuffix}`],
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
