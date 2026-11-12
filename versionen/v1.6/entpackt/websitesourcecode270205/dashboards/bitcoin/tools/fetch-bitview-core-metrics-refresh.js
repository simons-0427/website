const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const endExclusive = '2026-09-29';
const epochUtc = Date.UTC(2009, 0, 1);
const dayMs = 86400000;
const sourceSlug = 'bitview_api_research_only';
const baseUrl = 'https://bitview.space';
const rawPath = path.join(varDir, 'bitview-core-metrics-research-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'bitview-core-metrics-import-through-2026-09-28.csv');
const manifestPath = path.join(varDir, 'bitview-core-metrics-import-through-2026-09-28.json');
const targets = [
  {
    sourceSeries: 'asopr_24h',
    metricId: 'asopr',
    unit: 'ratio',
    expectedType: 'StoredF32',
    descriptionIncludes: ['excluding outputs younger than one hour', 'trailing 24-hour window'],
  },
  {
    sourceSeries: 'transfer_volume_sum_24h',
    metricId: 'transfer_value_btc',
    unit: 'BTC over trailing 24 hours',
    expectedType: 'Bitcoin',
    descriptionIncludes: ['value of outputs spent', 'trailing 24-hour window', 'Uses all UTXOs'],
  },
  {
    sourceSeries: 'transfer_volume_sum_24h_usd',
    metricId: 'transfer_value_usd',
    unit: 'USD over trailing 24 hours',
    expectedType: 'Dollars',
    descriptionIncludes: ['value of outputs spent', 'trailing 24-hour window', 'spending block\'s spot price'],
  },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatValue(value) {
  if (!Number.isFinite(value)) throw new Error(`Non-finite metric value: ${value}`);
  if (Object.is(value, -0)) return '0';
  return value.toFixed(12).replace(/(?:\.0+|(\.\d*?)0+)$/, '$1');
}

function dateAtIndex(index) {
  const date = new Date(epochUtc + index * dayMs);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid UTC day index: ${index}`);
  return date.toISOString().slice(0, 10);
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

async function main() {
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) throw new Error('var/.htaccess is missing; private output will not be written.');
  for (const filename of [rawPath, candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite existing file: ${filename}`);
  }

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const catalogById = new Map(catalog.metrics.map((metric) => [metric.id, metric]));
  for (const target of targets) {
    if (!catalogById.has(target.metricId)) throw new Error(`Unknown local catalog metric: ${target.metricId}`);
  }

  const versionResponse = await fetchJson(`${baseUrl}/version`, 'Bitview API version');
  const rawApiVersion = String(versionResponse.data).replace(/^"|"$/g, '').trim();
  const apiVersion = rawApiVersion.startsWith('v') ? rawApiVersion : `v${rawApiVersion}`;
  if (!/^v\d+\.\d+\.\d+$/.test(apiVersion)) throw new Error(`Unexpected Bitview API version: ${rawApiVersion}`);

  const seriesRecords = [];
  const candidateRows = [importHeader];
  const uniqueKeys = new Set();
  for (const target of targets) {
    const metadataResponse = await fetchJson(`${baseUrl}/api/series/${encodeURIComponent(target.sourceSeries)}`, `${target.sourceSeries} metadata`);
    const metadata = metadataResponse.data;
    if (!Array.isArray(metadata.indexes) || !metadata.indexes.includes('day1') || metadata.type !== target.expectedType) {
      throw new Error(`${target.sourceSeries}: unexpected indexes or type.`);
    }
    const normalizedDescription = String(metadata.description || '').toLowerCase();
    if (target.descriptionIncludes.some((fragment) => !normalizedDescription.includes(fragment.toLowerCase()))) {
      throw new Error(`${target.sourceSeries}: source definition no longer matches the mapped metric.`);
    }

    const params = new URLSearchParams({ start: '2009-01-01', end: endExclusive, limit: '10000', format: 'json' });
    const sourceUrl = `${baseUrl}/api/series/${encodeURIComponent(target.sourceSeries)}/day1?${params}`;
    const response = await fetchJson(sourceUrl, target.sourceSeries);
    const payload = response.data;
    if (payload.index !== 'day1' || payload.type !== target.expectedType
      || !Number.isInteger(payload.start) || !Number.isInteger(payload.end) || !Array.isArray(payload.data)
      || payload.start !== 0 || payload.end - payload.start !== payload.data.length) {
      throw new Error(`${target.sourceSeries}: incomplete or unexpected day1 response.`);
    }

    let nullCount = 0;
    let firstDate = null;
    let lastDate = null;
    let minValue = null;
    let maxValue = null;
    let pointCount = 0;
    for (const [offset, raw] of payload.data.entries()) {
      const date = dateAtIndex(payload.start + offset);
      if (date > cutoff) continue;
      if (raw === null) {
        nullCount++;
        continue;
      }
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        throw new Error(`${target.sourceSeries}: invalid non-negative value at ${date}.`);
      }
      const value = formatValue(raw);
      const key = `${target.metricId}/main/${date}`;
      if (uniqueKeys.has(key)) throw new Error(`Duplicate candidate observation: ${key}`);
      uniqueKeys.add(key);
      const hash = sha256([sourceSlug, apiVersion, target.sourceSeries, String(payload.version), date, value].join('\x1f'));
      const revision = `bitview-brk-${apiVersion}:${target.sourceSeries}:${payload.version}`;
      candidateRows.push([target.metricId, 'main', date, value, sourceSlug, payload.stamp || '', 'provisional', revision, hash].join(','));
      firstDate ??= date;
      lastDate = date;
      const numeric = Number(value);
      minValue = minValue === null ? numeric : Math.min(minValue, numeric);
      maxValue = maxValue === null ? numeric : Math.max(maxValue, numeric);
      pointCount++;
    }
    if (pointCount < 6000 || lastDate !== cutoff) throw new Error(`${target.sourceSeries}: insufficient daily coverage through cutoff (${pointCount} rows, last ${lastDate}).`);
    seriesRecords.push({
      sourceSeries: target.sourceSeries,
      metricId: target.metricId,
      unit: target.unit,
      description: metadata.description,
      sourceUrl,
      responseSha256: sha256(response.text),
      responseBytes: Buffer.byteLength(response.text),
      version: payload.version,
      stampedAtUtc: payload.stamp,
      index: payload.index,
      type: payload.type,
      startIndex: payload.start,
      endIndexExclusive: payload.end,
      pointsThroughCutoff: pointCount + nullCount,
      nullValuesThroughCutoff: nullCount,
      observations: pointCount,
      firstDate,
      lastDate,
      minimum: minValue,
      maximum: maxValue,
      response: payload,
    });
  }

  const csv = `${candidateRows.join('\n')}\n`;
  const candidateSha256 = sha256(csv);
  const fetchedAtUtc = new Date().toISOString();
  const raw = {
    fetchedAtUtc,
    dashboard: 'bitcoin',
    source: 'Bitview / Bitcoin Research Kit public series API',
    sourceSlug,
    apiVersion,
    cutoffInclusive: cutoff,
    permissionNote: 'No separate data redistribution license was confirmed. Candidate remains provisional and local for personal research only; not cleared for public display or redistribution.',
    uploaded: false,
    publicRedistributionCleared: false,
    series: seriesRecords,
  };
  const importManifest = {
    fetchedAtUtc,
    dashboard: 'bitcoin',
    cutoffInclusive: cutoff,
    source: 'Bitview / Bitcoin Research Kit public series API',
    sourceSlug,
    apiVersion,
    candidatePath: path.relative(varDir, candidatePath).replaceAll('\\', '/'),
    candidateSha256,
    candidateBytes: Buffer.byteLength(csv),
    observations: candidateRows.length - 1,
    metricCounts: Object.fromEntries(seriesRecords.map((series) => [series.metricId, series.observations])),
    series: seriesRecords.map(({ sourceSeries, metricId, version, stampedAtUtc, responseSha256, responseBytes, firstDate, lastDate, observations, nullValuesThroughCutoff, minimum, maximum }) => ({ sourceSeries, metricId, version, stampedAtUtc, responseSha256, responseBytes, firstDate, lastDate, observations, nullValuesThroughCutoff, minimum, maximum })),
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
    observations: candidateRows.length - 1,
    metricCounts: importManifest.metricCounts,
    series: importManifest.series,
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
