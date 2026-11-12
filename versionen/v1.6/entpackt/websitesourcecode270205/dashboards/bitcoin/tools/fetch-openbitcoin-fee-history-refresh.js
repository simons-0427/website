const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const cutoff = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '')) {
  console.error('Usage: node tools/fetch-openbitcoin-fee-history-refresh.js YYYY-MM-DD');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const sourceUrl = 'https://openbitcoin.com/api/v1/fee-history?days=10000';
const rawPath = path.join(varDir, `openbitcoin-fee-history-source-through-${cutoff}.json`);
const importPath = path.join(varDir, `openbitcoin-fee-history-import-refresh-through-${cutoff}.csv`);
const manifestPath = path.join(varDir, `openbitcoin-fee-history-refresh-through-${cutoff}.json`);
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function utcDate(timestamp) {
  const date = new Date(timestamp * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid OpenBitcoin timestamp: ${timestamp}`);
  return date.toISOString().slice(0, 10);
}

function utcTimestamp(timestamp) {
  return new Date(timestamp * 1000).toISOString().replace(/\.000Z$/, 'Z');
}

function decimal(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid fee-history value: ${value}`);
  return value.toFixed(12).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

async function fetchHistory() {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(sourceUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-data/1.0 personal-research' },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        await new Promise((resolve) => setTimeout(resolve,
          Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`OpenBitcoin returned HTTP ${response.status}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 1_000 || bytes.length > 8_000_000) throw new Error('OpenBitcoin fee-history response size is unexpected.');
      let body;
      try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('OpenBitcoin fee-history response is not JSON.'); }
      return { bytes, body };
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw lastError || new Error('OpenBitcoin fee-history request failed after retries.');
}

async function main() {
  for (const filename of [rawPath, importPath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite ${path.basename(filename)}.`);
  }
  const { bytes, body } = await fetchHistory();
  if (!Array.isArray(body.points) || body.points.length === 0 || typeof body.asOf !== 'string' || !Number.isFinite(Date.parse(body.asOf))) {
    throw new Error('OpenBitcoin fee-history response has an unexpected structure.');
  }
  const responseHash = sha256(bytes);
  const days = new Map();
  let previousTimestamp = 0;
  let previousHeight = -1;
  let excludedAfterCutoff = 0;
  for (const point of body.points) {
    if (!Array.isArray(point) || point.length !== 6 || !Number.isSafeInteger(point[0]) || point[0] <= previousTimestamp
      || !Number.isSafeInteger(point[1]) || point[1] <= previousHeight
      || point.slice(2).some((value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))) {
      throw new Error('OpenBitcoin fee-history contains an invalid or unsorted point.');
    }
    previousTimestamp = point[0];
    previousHeight = point[1];
    const date = utcDate(point[0]);
    if (date > cutoff) {
      excludedAfterCutoff++;
      continue;
    }
    const current = days.get(date);
    if (!current || point[0] > current[0]) days.set(date, point);
  }
  const rows = [];
  for (const [date, point] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const timestamp = utcTimestamp(point[0]);
    const revision = `openbitcoin-fee-history:${point[1]}:${point[0]}`;
    if (point[2] !== null) rows.push(['fees_median_sat_vb', 'main', date, decimal(point[2]), 'openbitcoin_node_api', timestamp,
      'provisional', revision, responseHash].join(','));
    if (point[3] !== null) rows.push(['fees_average_sat_vb', 'main', date, decimal(point[3]), 'openbitcoin_node_api', timestamp,
      'provisional', revision, responseHash].join(','));
  }
  if (!rows.length) throw new Error('OpenBitcoin fee-history has no observations within the cutoff.');

  const raw = {
    fetchedAtUtc: new Date().toISOString(),
    source: 'OpenBitcoin public API, own Bitcoin node',
    sourceUrl,
    providerPermission: 'User-confirmed private personal use; no general public redistribution permission recorded.',
    cutoffInclusive: cutoff,
    responseSha256: responseHash,
    responseBytes: bytes.length,
    response: body,
  };
  const rawBytes = Buffer.from(`${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  const importBytes = Buffer.from(`${header}\n${rows.join('\n')}\n`, 'utf8');
  const metricCounts = {};
  const metricDates = {};
  for (const line of rows) {
    const cells = line.split(',');
    metricCounts[cells[0]] = (metricCounts[cells[0]] || 0) + 1;
    metricDates[cells[0]] = metricDates[cells[0]] || { first: cells[2], last: cells[2] };
    if (cells[2] < metricDates[cells[0]].first) metricDates[cells[0]].first = cells[2];
    if (cells[2] > metricDates[cells[0]].last) metricDates[cells[0]].last = cells[2];
  }
  const manifest = {
    fetchedAtUtc: raw.fetchedAtUtc,
    source: raw.source,
    sourceUrl,
    cutoffInclusive: cutoff,
    sourceAsOf: body.asOf,
    responsePoints: body.points.length,
    responseSha256: responseHash,
    responseBytes: bytes.length,
    observations: rows.length,
    metricCounts,
    metricDates,
    pointsAfterCutoffExcluded: excludedAfterCutoff,
    import: path.basename(importPath),
    importBytes: importBytes.length,
    importSha256: sha256(importBytes),
    providerPermission: raw.providerPermission,
    uploaded: false,
    publicRedistributionCleared: false,
  };
  const files = [
    [rawPath, rawBytes],
    [importPath, importBytes],
    [manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')],
  ];
  const written = [];
  try {
    for (const [filename, value] of files) {
      fs.writeFileSync(filename, value, { flag: 'wx' });
      written.push(filename);
    }
  } catch (error) {
    for (const filename of written) fs.unlinkSync(filename);
    throw error;
  }
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
