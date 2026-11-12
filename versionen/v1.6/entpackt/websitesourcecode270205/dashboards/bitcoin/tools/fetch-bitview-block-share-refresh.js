const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const sourceSlug = 'bitview_api_research_only';
const derivedSlug = 'derived_bitcoin_metrics';
const baseUrl = 'https://bitview.space';
const rawDataStartUtc = '2009-01-01';
const chunkSizes = { timestamp: 30000, tx_count: 30000, segwit_txs: 60000 };
const targetFileStem = 'bitview-block-share';
const rawPath = path.join(varDir, `${targetFileStem}-research-through-${cutoff}.json`);
const candidatePath = path.join(varDir, `${targetFileStem}-import-through-${cutoff}.csv`);
const manifestPath = path.join(varDir, `${targetFileStem}-import-through-${cutoff}.json`);
const metadataTargets = [
  {
    series: 'timestamp',
    type: 'Timestamp',
    descriptionIncludes: ['unix timestamp in seconds', 'not guaranteed to increase'],
  },
  {
    series: 'tx_count',
    type: 'StoredU64',
    descriptionIncludes: ['including the coinbase transaction'],
  },
  {
    series: 'segwit_txs',
    type: 'StoredU32',
    descriptionIncludes: ['non-coinbase transactions using segwit serialization'],
  },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatValue(value) {
  if (!Number.isFinite(value)) throw new Error(`Non-finite value: ${value}`);
  if (Object.is(value, -0)) return '0';
  return value.toFixed(12).replace(/(?:\.0+|(\.\d*?)0+)$/, '$1');
}

function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index], index);
    }
  });
  return Promise.all(workers).then(() => results);
}

async function fetchText(url, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 research-only' },
        signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      if (attempt === 3) throw new Error(`${label}: network error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    const text = await response.text();
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 3) throw new Error(`${label}: HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : 1000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}: ${text.slice(0, 400)}`);
    return text;
  }
  throw new Error(`${label}: unavailable after retries.`);
}

async function fetchJson(url, label) {
  const text = await fetchText(url, label);
  try { return { data: JSON.parse(text), text }; } catch { throw new Error(`${label}: response is not valid JSON.`); }
}

async function fetchSeriesThroughHeight(series, type, tipHeight) {
  const chunkSize = chunkSizes[series];
  const requests = [];
  for (let start = 0; start <= tipHeight; start += chunkSize) {
    const end = Math.min(tipHeight + 1, start + chunkSize);
    requests.push({ start, end });
  }
  const values = new Float64Array(tipHeight + 1);
  const chunks = await mapLimit(requests, 3, async ({ start, end }) => {
    const params = new URLSearchParams({ start: String(start), end: String(end), limit: String(end - start), format: 'json' });
    const url = `${baseUrl}/api/series/${encodeURIComponent(series)}/height?${params}`;
    const response = await fetchJson(url, `${series} heights ${start}-${end - 1}`);
    const payload = response.data;
    if (payload.index !== 'height' || payload.type !== type || payload.start !== start || payload.end !== end
      || !Array.isArray(payload.data) || payload.data.length !== end - start) {
      throw new Error(`${series}: incomplete response for heights ${start}-${end - 1}.`);
    }
    for (let offset = 0; offset < payload.data.length; offset++) {
      const value = payload.data[offset];
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${series}: invalid integer at height ${start + offset}.`);
      values[start + offset] = value;
    }
    return {
      start,
      end,
      version: payload.version,
      stampedAtUtc: payload.stamp,
      responseBytes: Buffer.byteLength(response.text),
      responseSha256: sha256(response.text),
    };
  });
  return { values, chunks };
}

async function main() {
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) throw new Error('var/.htaccess is missing; private output will not be written.');
  for (const filename of [rawPath, candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite existing file: ${filename}`);
  }

  const versionResponse = await fetchJson(`${baseUrl}/version`, 'Bitview API version');
  const rawApiVersion = String(versionResponse.data).replace(/^"|"$/g, '').trim();
  const apiVersion = rawApiVersion.startsWith('v') ? rawApiVersion : `v${rawApiVersion}`;
  if (!/^v\d+\.\d+\.\d+$/.test(apiVersion)) throw new Error(`Unexpected Bitview API version: ${rawApiVersion}`);

  const metadata = {};
  for (const target of metadataTargets) {
    const response = await fetchJson(`${baseUrl}/api/series/${target.series}`, `${target.series} metadata`);
    const normalizedDescription = String(response.data.description || '').toLowerCase();
    if (!Array.isArray(response.data.indexes) || !response.data.indexes.includes('height') || response.data.type !== target.type
      || target.descriptionIncludes.some((fragment) => !normalizedDescription.includes(fragment))) {
      throw new Error(`${target.series}: unexpected index, type, or definition.`);
    }
    metadata[target.series] = response.data;
  }

  const tipText = (await fetchText(`${baseUrl}/api/blocks/tip/height`, 'Bitview chain tip')).trim();
  const tipHeight = Number(tipText);
  if (!Number.isSafeInteger(tipHeight) || tipHeight < 100000) throw new Error(`Unexpected Bitcoin tip height: ${tipText}`);

  const [timestampResult, txCountResult, segwitResult] = await Promise.all([
    fetchSeriesThroughHeight('timestamp', 'Timestamp', tipHeight),
    fetchSeriesThroughHeight('tx_count', 'StoredU64', tipHeight),
    fetchSeriesThroughHeight('segwit_txs', 'StoredU32', tipHeight),
  ]);

  const daily = new Map();
  const blockHashes = new Map();
  const cutoffMs = Date.parse(`${cutoff}T23:59:59.999Z`);
  for (let height = 0; height <= tipHeight; height++) {
    const timestamp = timestampResult.values[height];
    const txCount = txCountResult.values[height];
    const segwitCount = segwitResult.values[height];
    if (timestamp <= 0 || txCount < 1 || segwitCount > txCount - 1) {
      throw new Error(`Block values violate Bitcoin transaction bounds at height ${height}.`);
    }
    const timestampMs = timestamp * 1000;
    if (timestampMs > cutoffMs) continue;
    const date = new Date(timestampMs).toISOString().slice(0, 10);
    let day = daily.get(date);
    if (!day) {
      day = { blocks: 0, emptyBlocks: 0, transactions: 0, segwitTransactions: 0 };
      daily.set(date, day);
      blockHashes.set(date, crypto.createHash('sha256'));
    }
    day.blocks++;
    if (txCount === 1) day.emptyBlocks++;
    day.transactions += txCount - 1;
    day.segwitTransactions += segwitCount;
    blockHashes.get(date).update(`${height}\x1f${timestamp}\x1f${txCount}\x1f${segwitCount}\n`);
  }

  const fetchedAtUtc = new Date().toISOString();
  const candidateRows = [importHeader];
  const metricCounts = { empty_blocks_pct: 0, segwit_share_pct: 0 };
  const metricRanges = {};
  const sortedDates = [...daily.keys()].sort();
  for (const date of sortedDates) {
    if (date > cutoff) throw new Error(`Derived date ${date} exceeds cutoff.`);
    const day = daily.get(date);
    if (day.blocks <= 0 || day.emptyBlocks > day.blocks || day.segwitTransactions > day.transactions) {
      throw new Error(`Invalid daily block totals for ${date}.`);
    }
    const inputHash = blockHashes.get(date).digest('hex');
    const metrics = [
      ['empty_blocks_pct', day.emptyBlocks / day.blocks * 100, '100 * blocks with tx_count=1 / all blocks with header timestamp in UTC day'],
    ];
    if (day.transactions > 0) {
      metrics.push(['segwit_share_pct', day.segwitTransactions / day.transactions * 100, '100 * non-coinbase segwit transactions / all non-coinbase transactions with block header timestamp in UTC day']);
    }
    for (const [metric, numeric, formula] of metrics) {
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) throw new Error(`Invalid percentage for ${metric} on ${date}.`);
      const value = formatValue(numeric);
      const hash = sha256([derivedSlug, apiVersion, metric, formula, date, inputHash, value].join('\x1f'));
      const revision = `bitview-brk-${apiVersion}:${metric}:${formula}`;
      candidateRows.push([metric, 'main', date, value, derivedSlug, fetchedAtUtc, 'provisional', revision, hash].join(','));
      metricCounts[metric]++;
      const range = metricRanges[metric] || (metricRanges[metric] = { firstDate: date, lastDate: date, min: numeric, max: numeric });
      range.lastDate = date;
      range.min = Math.min(range.min, numeric);
      range.max = Math.max(range.max, numeric);
    }
  }
  if (metricCounts.empty_blocks_pct < 6000 || metricCounts.segwit_share_pct < 5000
    || metricRanges.empty_blocks_pct.lastDate !== cutoff || metricRanges.segwit_share_pct.lastDate !== cutoff) {
    throw new Error('Insufficient daily block-metric coverage through cutoff.');
  }

  const csv = `${candidateRows.join('\n')}\n`;
  const candidateSha256 = sha256(csv);
  const raw = {
    fetchedAtUtc,
    dashboard: 'bitcoin',
    source: 'Bitview / Bitcoin Research Kit public per-block series API',
    sourceSlug,
    derivedSource: derivedSlug,
    apiVersion,
    tipHeight,
    rawDataStartUtc,
    cutoffInclusive: cutoff,
    method: 'Each block is assigned by its own UTC header timestamp because Bitcoin block-header timestamps can move backward between consecutive heights. Empty block means exactly one transaction in the block (coinbase only). SegWit share excludes coinbase from numerator and denominator.',
    seriesMetadata: Object.fromEntries(Object.entries(metadata).map(([name, value]) => [name, { type: value.type, indexes: value.indexes, description: value.description }])),
    chunks: {
      timestamp: timestampResult.chunks,
      tx_count: txCountResult.chunks,
      segwit_txs: segwitResult.chunks,
    },
    metricCounts,
    metricRanges,
    licenseNote: 'No separate data redistribution license was confirmed. Values remain provisional and local for private research only; not cleared for public display or redistribution.',
    uploaded: false,
    publicRedistributionCleared: false,
  };
  const importManifest = {
    fetchedAtUtc,
    dashboard: 'bitcoin',
    cutoffInclusive: cutoff,
    source: raw.source,
    apiVersion,
    tipHeight,
    candidatePath: path.relative(varDir, candidatePath).replaceAll('\\', '/'),
    candidateSha256,
    candidateBytes: Buffer.byteLength(csv),
    observations: candidateRows.length - 1,
    sourceCounts: { [derivedSlug]: candidateRows.length - 1 },
    metricCounts,
    metricRanges,
    rawResearchPath: path.relative(varDir, rawPath).replaceAll('\\', '/'),
    uploaded: false,
    publicRedistributionCleared: false,
  };

  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
  try {
    fs.writeFileSync(candidatePath, csv, { flag: 'wx', encoding: 'utf8' });
    fs.writeFileSync(manifestPath, `${JSON.stringify(importManifest, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
  } catch (error) {
    for (const filename of [rawPath, candidatePath, manifestPath]) if (fs.existsSync(filename)) fs.unlinkSync(filename);
    throw error;
  }

  console.log(JSON.stringify({
    dashboard: 'bitcoin',
    cutoffInclusive: cutoff,
    apiVersion,
    tipHeight,
    observations: candidateRows.length - 1,
    metricCounts,
    metricRanges,
    chunkCounts: Object.fromEntries(Object.entries(raw.chunks).map(([name, chunks]) => [name, chunks.length])),
    candidate: path.relative(root, candidatePath).replaceAll('\\', '/'),
    candidateSha256,
    rawResearch: path.relative(root, rawPath).replaceAll('\\', '/'),
    privateOnly: true,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
