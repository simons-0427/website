import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { importHeader } from './coinmetrics-format.js';

const root = path.resolve(import.meta.dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const sourceSlug = 'bitview_api_research_only';
const baseUrl = 'https://bitview.space';
const seriesName = 'utxos_realized_cap_cents_by_age_range';
const timestampChunkSize = 30000;
// The API weights this 23-column matrix at about 184 units per height and
// rejects requests above 320,000 units, so keep each range below that ceiling.
const ageRangeChunkSize = 1600;
const timestampConcurrency = 3;
const ageRangeConcurrency = 2;
const stem = 'bitview-realized-cap-hodl-waves';
const rawPath = path.join(varDir, `${stem}-research-through-${cutoff}.json`);
const candidatePath = path.join(varDir, `${stem}-import-through-${cutoff}.csv`);
const manifestPath = path.join(varDir, `${stem}-import-through-${cutoff}.json`);

const expectedAgeRangeKeys = [
  'under_1h', '_1h_to_1d', '_1d_to_1w', '_1w_to_1m', '_1m_to_2m', '_2m_to_3m',
  '_3m_to_4m', '_4m_to_5m', '_5m_to_6m', '_6m_to_9m', '_9m_to_1y', '_1y_to_18m',
  '_18m_to_2y', '_2y_to_3y', '_3y_to_4y', '_4y_to_5y', '_5y_to_6y', '_6y_to_7y',
  '_7y_to_8y', '_8y_to_10y', '_10y_to_12y', '_12y_to_15y', 'over_15y',
];

const ageRangeLabels = {
  under_1h: 'Unter 1 Stunde',
  _1h_to_1d: '1 Stunde bis 1 Tag',
  _1d_to_1w: '1 Tag bis 1 Woche',
  _1w_to_1m: '1 Woche bis 1 Monat',
  _1m_to_2m: '1 bis 2 Monate',
  _2m_to_3m: '2 bis 3 Monate',
  _3m_to_4m: '3 bis 4 Monate',
  _4m_to_5m: '4 bis 5 Monate',
  _5m_to_6m: '5 bis 6 Monate',
  _6m_to_9m: '6 bis 9 Monate',
  _9m_to_1y: '9 Monate bis 1 Jahr',
  _1y_to_18m: '1 bis 1,5 Jahre',
  _18m_to_2y: '1,5 bis 2 Jahre',
  _2y_to_3y: '2 bis 3 Jahre',
  _3y_to_4y: '3 bis 4 Jahre',
  _4y_to_5y: '4 bis 5 Jahre',
  _5y_to_6y: '5 bis 6 Jahre',
  _6y_to_7y: '6 bis 7 Jahre',
  _7y_to_8y: '7 bis 8 Jahre',
  _8y_to_10y: '8 bis 10 Jahre',
  _10y_to_12y: '10 bis 12 Jahre',
  _12y_to_15y: '12 bis 15 Jahre',
  over_15y: '15 Jahre und älter',
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function csv(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatUsdFromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Invalid realized-cap cents value: ${cents}`);
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
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
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 research-only' },
        signal: AbortSignal.timeout(90000),
      });
    } catch (error) {
      if (attempt === 4) throw new Error(`${label}: network error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    const text = await response.text();
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 4) throw new Error(`${label}: HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30000)
        : 1000 * (attempt + 1);
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

async function fetchTimestampSeries(tipHeight, chunkAudit) {
  const requests = [];
  for (let start = 0; start <= tipHeight; start += timestampChunkSize) {
    const end = Math.min(tipHeight + 1, start + timestampChunkSize);
    requests.push({ start, end });
  }
  const values = new Float64Array(tipHeight + 1);
  let complete = 0;
  await mapLimit(requests, timestampConcurrency, async ({ start, end }) => {
    const params = new URLSearchParams({ start: String(start), end: String(end), limit: String(end - start), format: 'json' });
    const url = `${baseUrl}/api/series/timestamp/height?${params}`;
    const response = await fetchJson(url, `timestamp heights ${start}-${end - 1}`);
    const payload = response.data;
    if (payload.index !== 'height' || payload.type !== 'Timestamp' || payload.start !== start || payload.end !== end
      || !Array.isArray(payload.data) || payload.data.length !== end - start) {
      throw new Error(`timestamp: incomplete response for heights ${start}-${end - 1}.`);
    }
    for (let offset = 0; offset < payload.data.length; offset++) {
      const timestamp = payload.data[offset];
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error(`Invalid timestamp at height ${start + offset}.`);
      values[start + offset] = timestamp;
    }
    chunkAudit.push({
      series: 'timestamp', start, end, version: payload.version, stamp: payload.stamp,
      responseBytes: Buffer.byteLength(response.text), responseSha256: sha256(response.text),
    });
    complete++;
    if (complete % 10 === 0 || complete === requests.length) console.error(`timestamp chunks ${complete}/${requests.length}`);
  });
  return values;
}

async function fetchDailyAgeRangeSelections(timestamps, tipHeight, chunkAudit, seriesVersionAudit) {
  const requests = [];
  for (let start = 0; start <= tipHeight; start += ageRangeChunkSize) {
    const end = Math.min(tipHeight + 1, start + ageRangeChunkSize);
    requests.push({ start, end });
  }
  const daily = new Map();
  const cutoffMs = Date.parse(`${cutoff}T23:59:59.999Z`);
  let complete = 0;
  await mapLimit(requests, ageRangeConcurrency, async ({ start, end }) => {
    const params = new URLSearchParams({ start: String(start), end: String(end), limit: String(end - start), format: 'json' });
    const url = `${baseUrl}/api/series/${encodeURIComponent(seriesName)}/height?${params}`;
    const response = await fetchJson(url, `realized-cap age ranges ${start}-${end - 1}`);
    const payload = response.data;
    if (payload.index !== 'height' || payload.type !== 'AgeRange<Cents>' || payload.start !== start || payload.end !== end
      || !Array.isArray(payload.data) || payload.data.length !== end - start) {
      throw new Error(`Age-range series: incomplete response for heights ${start}-${end - 1}.`);
    }
    for (let offset = 0; offset < payload.data.length; offset++) {
      const height = start + offset;
      const timestamp = timestamps[height];
      if (timestamp * 1000 > cutoffMs) continue;
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
      const ranges = payload.data[offset];
      if (!ranges || typeof ranges !== 'object' || Array.isArray(ranges)) throw new Error(`Invalid age-range matrix at height ${height}.`);
      const keys = Object.keys(ranges);
      if (keys.length !== expectedAgeRangeKeys.length || expectedAgeRangeKeys.some((key) => !Object.hasOwn(ranges, key))) {
        throw new Error(`Unexpected age ranges at height ${height}: ${keys.join(', ')}`);
      }
      for (const key of expectedAgeRangeKeys) {
        if (!Number.isSafeInteger(ranges[key]) || ranges[key] < 0) throw new Error(`Invalid ${key} cents at height ${height}.`);
      }
      const current = daily.get(date);
      if (!current || height > current.height) {
        daily.set(date, { height, timestamp, ranges, sourceHash: sha256(JSON.stringify(ranges)) });
      }
    }
    const version = String(payload.version);
    seriesVersionAudit.add(version);
    chunkAudit.push({
      series: seriesName, start, end, version, stamp: payload.stamp,
      responseBytes: Buffer.byteLength(response.text), responseSha256: sha256(response.text),
    });
    complete++;
    if (complete % 25 === 0 || complete === requests.length) console.error(`age-range chunks ${complete}/${requests.length}; UTC days selected ${daily.size}`);
  });
  return daily;
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

  const [metadataResponse, timestampMetadataResponse, tipResponse, lengthResponse] = await Promise.all([
    fetchJson(`${baseUrl}/api/series/${encodeURIComponent(seriesName)}`, `${seriesName} metadata`),
    fetchJson(`${baseUrl}/api/series/timestamp`, 'timestamp metadata'),
    fetchText(`${baseUrl}/api/blocks/tip/height`, 'Bitcoin chain tip'),
    fetchJson(`${baseUrl}/api/series/${encodeURIComponent(seriesName)}/height/len`, `${seriesName} height length`),
  ]);
  const metadata = metadataResponse.data;
  const description = String(metadata.description || '');
  if (!Array.isArray(metadata.indexes) || !metadata.indexes.includes('height') || metadata.type !== 'AgeRange<Cents>'
    || !description.toLowerCase().includes('creation-date value') || !description.toLowerCase().includes('unspent outputs')
    || !description.toLowerCase().includes('age range')) {
    throw new Error(`${seriesName}: unexpected definition, index, or type.`);
  }
  if (!timestampMetadataResponse.data.indexes?.includes('height') || timestampMetadataResponse.data.type !== 'Timestamp') {
    throw new Error('timestamp: unexpected definition, index, or type.');
  }
  const tipHeight = Number(tipResponse.trim());
  const heightLength = Number(lengthResponse.data);
  if (!Number.isSafeInteger(tipHeight) || tipHeight < 100000 || heightLength !== tipHeight + 1) {
    throw new Error(`Unexpected Bitcoin tip/series height length: tip=${tipResponse.trim()} length=${heightLength}.`);
  }

  const chunks = [];
  const timestampValues = await fetchTimestampSeries(tipHeight, chunks);
  const seriesVersions = new Set();
  const daily = await fetchDailyAgeRangeSelections(timestampValues, tipHeight, chunks, seriesVersions);
  if (daily.size < 6000 || seriesVersions.size === 0) throw new Error(`Insufficient daily coverage: ${daily.size} UTC days.`);

  const fetchedAtUtc = new Date().toISOString();
  const candidateRows = [importHeader];
  const dailySelections = [];
  const dates = [...daily.keys()].sort();
  let observations = 0;
  const metricRanges = Object.fromEntries(expectedAgeRangeKeys.map((key) => [key, { count: 0, min: Infinity, max: -Infinity }]));
  for (const date of dates) {
    if (date > cutoff) throw new Error(`Selected UTC date exceeds cutoff: ${date}.`);
    const selected = daily.get(date);
    dailySelections.push({ date, height: selected.height, timestamp: selected.timestamp, sourceHash: selected.sourceHash });
    for (const key of expectedAgeRangeKeys) {
      const value = formatUsdFromCents(selected.ranges[key]);
      const rawPayloadHash = sha256([
        sourceSlug, apiVersion, seriesName, date, selected.height, selected.timestamp, key, selected.ranges[key],
      ].join('\x1f'));
      const revision = `bitview-brk-${apiVersion}:${seriesName}:cents_to_usd:last_height_in_utc_day`;
      candidateRows.push([
        'realized_cap_hodl_waves', key, date, value, sourceSlug, fetchedAtUtc, 'provisional', revision, rawPayloadHash,
      ].map(csv).join(','));
      const numeric = selected.ranges[key] / 100;
      const range = metricRanges[key];
      range.count++;
      range.min = Math.min(range.min, numeric);
      range.max = Math.max(range.max, numeric);
      observations++;
    }
  }

  const csvText = `${candidateRows.join('\n')}\n`;
  const candidateSha256 = sha256(csvText);
  const raw = {
    fetchedAtUtc,
    dashboard: 'bitcoin',
    source: 'Bitview / Bitcoin Research Kit Bitcoin-only on-chain API',
    sourceSlug,
    apiVersion,
    tipHeight,
    heightLength,
    cutoffInclusiveUtc: cutoff,
    seriesName,
    seriesMetadata: { description: metadata.description, type: metadata.type, indexes: metadata.indexes },
    timestampMetadata: timestampMetadataResponse.data,
    method: 'The height-indexed matrix contains the creation-date USD value (stored in cents) of currently unspent UTXOs grouped into 23 exact age ranges. Each UTC day uses the row at the greatest block height whose block-header timestamp falls on that day. Values are converted from cents to USD without interpolation. Header timestamps can be non-monotonic, so daily grouping uses each block timestamp rather than assuming height order is date order.',
    selectedDays: dates.length,
    observations,
    firstUtcDate: dates[0],
    lastUtcDate: dates.at(-1),
    ageRanges: expectedAgeRangeKeys.map((key, displayOrder) => ({ key, label: ageRangeLabels[key], displayOrder: displayOrder + 1, ...metricRanges[key] })),
    seriesVersions: [...seriesVersions],
    chunkAudit: chunks,
    dailySelections,
    candidatePath: path.basename(candidatePath),
    candidateSha256,
    licenseNote: 'The hosted API provides public Bitcoin-only observations, but a separate data reuse license was not confirmed. This candidate is provisional, private and local for research; it is not cleared for public display or redistribution.',
    uploaded: false,
    sqlExecuted: false,
  };
  const manifest = {
    ...raw,
    fields: importHeader.split(','),
    metricId: 'realized_cap_hodl_waves',
    seriesKeys: expectedAgeRangeKeys,
    rows: observations,
    duplicateKeyCount: 0,
    rowsAfterCutoff: 0,
  };

  fs.writeFileSync(candidatePath, csvText, 'utf8');
  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    candidatePath, rawPath, manifestPath, apiVersion, tipHeight, heightLength,
    selectedDays: dates.length, observations, firstUtcDate: dates[0], lastUtcDate: dates.at(-1),
    seriesVersionCount: seriesVersions.size, candidateSha256,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
