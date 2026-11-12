const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader, normalizeDecimal } = require('./coinmetrics-format');

const cutoff = '2026-09-28';
const varDirectory = path.join(__dirname, '..', 'var');
const poolFile = path.join(varDirectory, 'mempool-mining-pool-hashrate-3y-through-2026-09-28.json');
const feeFile = path.join(varDirectory, 'mempool-block-fee-rates-3y-through-2026-09-28.json');
const outputFile = path.join(varDirectory, 'mempool-bitcoin-history-research-candidates-through-2026-09-28.csv');
const manifestFile = path.join(varDirectory, 'mempool-bitcoin-history-research-candidates-through-2026-09-28.json');

function readArray(filename, label) {
  const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label}: erwartete nichtleere JSON-Liste.`);
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function decimal(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Ungültiger nichtnegativer Messwert: ${value}`);
  return normalizeDecimal(value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0');
}

function csvRow(metric, series, date, value, source, timestamp, revision, hash) {
  return [metric, series, date, decimal(value), source, timestamp, 'provisional', revision, hash].join(',');
}

function poolSlug(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const rows = [];
const coverage = {};

const poolPayload = fs.readFileSync(poolFile);
const poolData = readArray(poolFile, 'Mempool-Pool-Hashrate');
const poolWeeks = new Map();
const poolNamesBySlug = new Map();
for (const record of poolData) {
  if (!Number.isSafeInteger(record.timestamp) || typeof record.poolName !== 'string'
      || typeof record.share !== 'number' || !Number.isFinite(record.share) || record.share < 0 || record.share > 1
      || typeof record.avgHashrate !== 'number' || !Number.isFinite(record.avgHashrate) || record.avgHashrate < 0) {
    throw new Error('Mempool-Pool-Hashrate: ungültiger Datensatz.');
  }
  const date = new Date(record.timestamp * 1000).toISOString().slice(0, 10);
  if (date > cutoff || record.poolName.toLowerCase() === 'unknown') continue;
  const slug = poolSlug(record.poolName);
  if (!slug || (poolNamesBySlug.has(slug) && poolNamesBySlug.get(slug) !== record.poolName)) {
    throw new Error(`Mempool-Pool-Hashrate: ungültige oder kollidierende Pool-ID ${record.poolName}.`);
  }
  poolNamesBySlug.set(slug, record.poolName);
  if (!poolWeeks.has(date)) poolWeeks.set(date, new Map());
  const week = poolWeeks.get(date);
  if (week.has(slug)) throw new Error(`Doppelter Poolwert für ${date}/${slug}.`);
  week.set(slug, record);
}

for (const [date, week] of [...poolWeeks].sort(([a], [b]) => a.localeCompare(b))) {
  const identifiedShare = [...week.values()].reduce((sum, record) => sum + record.share, 0);
  if (!(identifiedShare > 0 && identifiedShare <= 1.000001)) throw new Error(`Unplausible Summe identifizierter Poolanteile am ${date}.`);
  let hhi = 0;
  for (const [slug, record] of [...week].sort(([a], [b]) => a.localeCompare(b))) {
    const normalizedSharePct = record.share / identifiedShare * 100;
    hhi += normalizedSharePct ** 2;
    const sourceRecord = JSON.stringify(record);
    rows.push(csvRow(
      'mining_pool_hashrate_share_pct',
      slug,
      date,
      normalizedSharePct,
      'mempool_space_pool_hashrate_research_only',
      new Date(record.timestamp * 1000).toISOString(),
      `mempool-pool-hashrate-3y:${date}:${slug}`,
      sha256(sourceRecord),
    ));
  }
  const hhiHash = sha256([...week.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slug, record]) => `${slug}:${record.share}`).join('\n'));
  rows.push(csvRow('pool_hashrate_concentration_hhi', 'main', date, hhi, 'derived_bitcoin_metrics', '', `mempool-identified-pools-hhi-v1:${date}`, hhiHash));
}
coverage.mining_pool_hashrate_share_pct = { rows: rows.filter((line) => line.startsWith('mining_pool_hashrate_share_pct,')).length, series: poolNamesBySlug.size, first: [...poolWeeks.keys()].sort()[0], last: [...poolWeeks.keys()].sort().at(-1) };
coverage.pool_hashrate_concentration_hhi = { rows: poolWeeks.size, first: [...poolWeeks.keys()].sort()[0], last: [...poolWeeks.keys()].sort().at(-1) };

const feePayload = fs.readFileSync(feeFile);
const feeData = readArray(feeFile, 'Mempool-Block-Feerates');
const feeDays = new Map();
for (const record of feeData) {
  if (!Number.isSafeInteger(record.timestamp) || !Number.isSafeInteger(record.avgHeight)
      || !Number.isFinite(record.avgFee_10) || record.avgFee_10 < 0
      || !Number.isFinite(record.avgFee_90) || record.avgFee_90 < record.avgFee_10) {
    throw new Error('Mempool-Block-Feerates: ungültiger Datensatz.');
  }
  const date = new Date(record.timestamp * 1000).toISOString().slice(0, 10);
  if (date > cutoff) continue;
  if (!feeDays.has(date)) feeDays.set(date, []);
  feeDays.get(date).push(record);
}

for (const [date, points] of [...feeDays].sort(([a], [b]) => a.localeCompare(b))) {
  const latestTimestamp = Math.max(...points.map((point) => point.timestamp));
  const sourceHash = sha256(points.map((point) => JSON.stringify(point)).sort().join('\n'));
  for (const [field, metric] of [['avgFee_10', 'fees_p10_sat_vb'], ['avgFee_90', 'fees_p90_sat_vb']]) {
    const dailyMean = points.reduce((sum, point) => sum + point[field], 0) / points.length;
    rows.push(csvRow(
      metric,
      'main',
      date,
      dailyMean,
      'mempool_space_historical_research_only',
      new Date(latestTimestamp * 1000).toISOString(),
      `mempool-block-fee-rates-daily-mean-v1:${date}:samples-${points.length}`,
      sourceHash,
    ));
  }
}
const feeDates = [...feeDays.keys()].sort();
coverage.fees_p10_sat_vb = { rows: feeDates.length, first: feeDates[0], last: feeDates.at(-1), sampleCounts: Object.fromEntries([...new Set([...feeDays.values()].map((points) => points.length))].map((count) => [count, [...feeDays.values()].filter((points) => points.length === count).length])) };
coverage.fees_p90_sat_vb = { ...coverage.fees_p10_sat_vb };

rows.sort((a, b) => {
  const left = a.split(',');
  const right = b.split(',');
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]) || left[2].localeCompare(right[2]);
});
const uniqueKeys = new Set();
for (const row of rows) {
  const [metric, series, date] = row.split(',');
  const key = `${metric}/${series}/${date}`;
  if (uniqueKeys.has(key)) throw new Error(`Doppelter Beobachtungsschlüssel: ${key}`);
  uniqueKeys.add(key);
}
fs.writeFileSync(outputFile, `${importHeader}\n${rows.join('\n')}\n`);

const manifest = {
  dashboard: 'bitcoin',
  candidateOnly: true,
  mergedIntoMaster: false,
  cutoffInclusive: cutoff,
  output: path.basename(outputFile),
  rows: rows.length,
  outputBytes: fs.statSync(outputFile).size,
  outputSha256: sha256(fs.readFileSync(outputFile)),
  sources: {
    mempool_space_historical_research_only: {
      endpoints: ['/api/v1/mining/blocks/fee-rates/3y'],
      attribution: 'Mempool.space REST API',
      dataReuseLicenseConfirmed: false,
      rawFiles: [
        { path: path.basename(feeFile), bytes: feePayload.length, sha256: sha256(feePayload) },
      ],
    },
    mempool_space_pool_hashrate_research_only: {
      endpoints: [
        '/api/v1/mining/hashrate/pools/3y',
      ],
      attribution: 'Mempool.space REST API',
      dataReuseLicenseConfirmed: false,
      rawFiles: [
        { path: path.basename(poolFile), bytes: poolPayload.length, sha256: sha256(poolPayload) },
      ],
    },
    derived_bitcoin_metrics: {
    methodology: 'Weekly pool hashrate shares are renormalized over the identified pools to 100 percent. Pool concentration is the sum of the squared normalized percentage shares. The input is estimated weekly average hashrate, a proxy for block share rather than a direct count of blocks.',
    },
  },
  metricCoverage: coverage,
  limitations: [
    'Only Bitcoin mainnet endpoints were queried.',
    'Unknown mining-pool attribution is excluded, matching the dashboard metric definition.',
    'Pool shares are renormalized among identified pools before local HHI calculation.',
    'Pool shares come from weekly average hashrate and are a proxy, not a direct block count.',
    'Fee-rate daily values are the mean of the endpoint 12-hour percentile aggregates available on that UTC date.',
    'The API documents endpoints and rate limits but no separate data reuse license; keep this file private and do not upload it.',
  ],
};
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output: outputFile, rows: rows.length, metrics: coverage, sha256: manifest.outputSha256 }, null, 2));
