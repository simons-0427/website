const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const baseUrl = 'https://bitview.space';
const sourceSlug = 'bitview_api_research_only';
const cutoff = '2026-09-28';
const startDate = '2009-01-03';
const endExclusive = '2026-09-29';
const epochUtc = Date.UTC(2009, 0, 1);
const dayMs = 86400000;
const startIndex = (Date.parse(`${startDate}T00:00:00Z`) - epochUtc) / dayMs;
const endIndex = (Date.parse(`${endExclusive}T00:00:00Z`) - epochUtc) / dayMs;
const expectedDays = endIndex - startIndex;
const rawPath = path.join(varDir, 'bitview-liquid-illiquid-supply-research-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'bitview-liquid-illiquid-supply-import-through-2026-09-28.csv');
const manifestPath = path.join(varDir, 'bitview-liquid-illiquid-supply-import-through-2026-09-28.json');

const targets = [
  {
    sourceSeries: 'mobile_supply',
    metricId: 'liquid_supply_btc',
    unit: 'BTC',
    descriptionIncludes: ['supply multiplied by the estimated remaining-lifetime probability of spending'],
    mappingNote: 'Provisional semantic mapping from Bitview mobile supply to the catalog liquid-supply ID. The source uses age-range spending probabilities, not entity labels.',
  },
  {
    sourceSeries: 'immobile_supply',
    metricId: 'illiquid_supply_btc',
    unit: 'BTC',
    descriptionIncludes: ['supply multiplied by one minus the estimated remaining-lifetime probability of spending'],
    mappingNote: 'Provisional semantic mapping from Bitview immobile supply to the catalog illiquid-supply ID. The source uses age-range spending probabilities, not entity labels.',
  },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatValue(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid non-negative supply value: ${value}`);
  if (Object.is(value, -0)) return '0';
  return value.toFixed(12).replace(/(?:\.0+|(\.\d*?)0+)$/, '$1');
}

function dateAtIndex(index) {
  const date = new Date(epochUtc + index * dayMs);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid UTC day index: ${index}`);
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 research-only' },
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}: ${text.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${label}: response is not valid JSON.`); }
  return { data, text };
}

async function main() {
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || expectedDays <= 0) {
    throw new Error('Invalid UTC request range.');
  }
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) {
    throw new Error('var/.htaccess is missing; private research output will not be written.');
  }
  for (const filename of [rawPath, candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite existing file: ${filename}`);
  }

  const versionResponse = await fetchJson(`${baseUrl}/version`, 'Bitview API version');
  const rawVersion = String(versionResponse.data).replace(/^"|"$/g, '').trim();
  const apiVersion = rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`;
  if (!/^v\d+\.\d+\.\d+$/.test(apiVersion)) throw new Error(`Unexpected Bitview API version: ${rawVersion}`);

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const catalogById = new Map(catalog.metrics.map((metric) => [metric.id, metric]));
  for (const target of targets) {
    if (!catalogById.has(target.metricId)) throw new Error(`Unknown local catalog metric: ${target.metricId}`);
    if (catalogById.get(target.metricId).unit !== target.unit) {
      throw new Error(`${target.metricId}: local catalog unit does not match the candidate.`);
    }
  }

  const candidateRows = [importHeader];
  const seriesRecords = [];
  const uniqueKeys = new Set();

  for (const target of targets) {
    const metadataResponse = await fetchJson(
      `${baseUrl}/api/series/${encodeURIComponent(target.sourceSeries)}`,
      `${target.sourceSeries} metadata`,
    );
    const metadata = metadataResponse.data;
    if (!Array.isArray(metadata.indexes) || !metadata.indexes.includes('day1') || metadata.type !== 'Bitcoin') {
      throw new Error(`${target.sourceSeries}: unexpected indexes or source type.`);
    }
    const normalizedDescription = String(metadata.description || '').toLowerCase();
    if (target.descriptionIncludes.some((fragment) => !normalizedDescription.includes(fragment))) {
      throw new Error(`${target.sourceSeries}: source definition changed from the reviewed mapping.`);
    }

    const params = new URLSearchParams({ start: startDate, end: endExclusive, format: 'json' });
    const sourceUrl = `${baseUrl}/api/series/${encodeURIComponent(target.sourceSeries)}/day1?${params}`;
    const response = await fetchJson(sourceUrl, target.sourceSeries);
    const payload = response.data;
    if (payload.index !== 'day1' || payload.type !== 'Bitcoin'
      || payload.start !== startIndex || payload.end !== endIndex
      || !Array.isArray(payload.data) || payload.data.length !== expectedDays) {
      throw new Error(`${target.sourceSeries}: unexpected daily index range or response type.`);
    }

    let nullCount = 0;
    let firstDate = null;
    let lastDate = null;
    let minValue = null;
    let maxValue = null;
    let observations = 0;

    for (let offset = 0; offset < payload.data.length; offset++) {
      const date = dateAtIndex(payload.start + offset);
      if (date < startDate || date > cutoff) throw new Error(`${target.sourceSeries}: date outside the requested cutoff.`);
      const rawValue = payload.data[offset];
      if (rawValue === null) {
        nullCount++;
        continue;
      }
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue < 0) {
        throw new Error(`${target.sourceSeries}: invalid value on ${date}.`);
      }

      const value = formatValue(rawValue);
      const key = `${target.metricId}/main/${date}`;
      if (uniqueKeys.has(key)) throw new Error(`Duplicate candidate observation: ${key}`);
      uniqueKeys.add(key);
      const sourceRevision = `bitview-${apiVersion}:${target.sourceSeries}:day1:${payload.version}`;
      const payloadHash = sha256([sourceSlug, apiVersion, target.sourceSeries, payload.version, date, value].join('\x1f'));
      candidateRows.push([
        target.metricId,
        'main',
        date,
        value,
        sourceSlug,
        payload.stamp || '',
        'provisional',
        sourceRevision,
        payloadHash,
      ].join(','));

      const numericValue = Number(value);
      firstDate ??= date;
      lastDate = date;
      minValue = minValue === null ? numericValue : Math.min(minValue, numericValue);
      maxValue = maxValue === null ? numericValue : Math.max(maxValue, numericValue);
      observations++;
    }

    if (observations < 6000 || firstDate !== startDate || lastDate !== cutoff) {
      throw new Error(`${target.sourceSeries}: incomplete daily coverage (${observations} rows, ${firstDate} to ${lastDate}).`);
    }

    seriesRecords.push({
      sourceSeries: target.sourceSeries,
      metricId: target.metricId,
      unit: target.unit,
      mappingNote: target.mappingNote,
      sourceDefinition: metadata.description,
      metadataUrl: `${baseUrl}/api/series/${encodeURIComponent(target.sourceSeries)}`,
      dataUrl: sourceUrl,
      metadataSha256: sha256(metadataResponse.text),
      responseSha256: sha256(response.text),
      responseBytes: Buffer.byteLength(response.text),
      responseVersion: payload.version,
      stampedAtUtc: payload.stamp || null,
      index: payload.index,
      sourceType: payload.type,
      startIndex: payload.start,
      endIndexExclusive: payload.end,
      pointsThroughCutoff: payload.data.length,
      nullValues: nullCount,
      observations,
      firstDate,
      lastDate,
      minimum: minValue,
      maximum: maxValue,
      response: payload,
    });
  }

  const csv = `${candidateRows.join('\n')}\n`;
  const fetchedAtUtc = new Date().toISOString();
  const candidateSha256 = sha256(csv);
  const raw = {
    fetchedAtUtc,
    dashboard: 'bitcoin',
    source: 'Bitview / Bitcoin Research Kit public series API',
    sourceSlug,
    apiVersion,
    cutoffInclusive: cutoff,
    permissionNote: 'Private local research candidate only. The API docs list an MIT license for the API project, but a separate license covering redistribution of these metric values was not confirmed.',
    uploaded: false,
    databaseImported: false,
    publicRedistributionCleared: false,
    series: seriesRecords,
  };
  const manifest = {
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
    metricCounts: Object.fromEntries(seriesRecords.map((record) => [record.metricId, record.observations])),
    series: seriesRecords.map(({ sourceSeries, metricId, unit, mappingNote, responseVersion, stampedAtUtc, responseSha256, responseBytes, firstDate, lastDate, observations, nullValues, minimum, maximum }) => ({ sourceSeries, metricId, unit, mappingNote, responseVersion, stampedAtUtc, responseSha256, responseBytes, firstDate, lastDate, observations, nullValues, minimum, maximum })),
    uploaded: false,
    databaseImported: false,
    publicRedistributionCleared: false,
  };

  const createdFiles = [];
  try {
    fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
    createdFiles.push(rawPath);
    fs.writeFileSync(candidatePath, csv, { flag: 'wx', encoding: 'utf8' });
    createdFiles.push(candidatePath);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
    createdFiles.push(manifestPath);
  } catch (error) {
    for (const filename of createdFiles) fs.unlinkSync(filename);
    throw error;
  }

  console.log(JSON.stringify({
    dashboard: 'bitcoin',
    cutoffInclusive: cutoff,
    apiVersion,
    observations: candidateRows.length - 1,
    metricCounts: manifest.metricCounts,
    series: manifest.series,
    candidate: path.relative(root, candidatePath).replaceAll('\\', '/'),
    candidateSha256,
    rawResearch: path.relative(root, rawPath).replaceAll('\\', '/'),
    privateOnly: true,
    databaseImported: false,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
