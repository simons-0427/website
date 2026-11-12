const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.resolve(root, 'var');
const outputPath = path.join(varDir, 'bitcoin-lab-tier0-research-only.csv');
const sourceSlug = 'bitcoin_lab_research_only';
const apiBase = 'https://api.researchbitcoin.net';
const apiVersion = 'v2.1';
const dailyWindowDays = 364;
const dataCutoffInclusive = '2026-09-28';

const seriesSpecs = [
  ['asopr', 'spent_output_profit_ratio', 'sopr'],
  ['sth_sopr', 'spent_output_profit_ratio', 'sopr_sth'],
  ['lth_sopr', 'spent_output_profit_ratio', 'sopr_lth'],
  ['relative_unrealized_profit_pct', 'unrealizedprofit', 'unrealized_profit_relative'],
  ['relative_unrealized_loss_pct', 'unrealizedloss', 'unrealized_loss_relative'],
  ['realized_profit_usd', 'realizedprofit', 'realized_profit'],
  ['realized_loss_usd', 'realizedloss', 'realized_loss'],
  ['net_realized_profit_loss_usd', 'net_realized_profit_loss', 'net_realized_profit_loss'],
  ['supply_in_profit_pct', 'supply_in_profitloss', 'supply_in_profit_percent'],
  ['supply_in_loss_pct', 'supply_in_profitloss', 'supply_in_loss_percent'],
  ['sth_realized_price_usd', 'realizedprice', 'realized_price_sth'],
  ['lth_realized_price_usd', 'realizedprice', 'realized_price_lth'],
  ['sth_mvrv_ratio', 'market_value_to_realized_value', 'mvrv_sth'],
  ['long_term_holder_supply_btc', 'supply_distribution', 'supply_lth'],
  ['short_term_holder_supply_btc', 'supply_distribution', 'supply_sth'],
  ['long_term_holder_supply_pct', 'supply_distribution', 'supply_lth_percent'],
  ['hodl_supply_10y_btc', 'supply_distribution', 'supply_aged_10yrs'],
  ['average_spent_output_lifespan_days', 'utxo_dormancy', 'asol'],
].map(([metricId, endpoint, field]) => ({ metricId, endpoint, field }));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function addUtcDays(date, days) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function requestWindow() {
  const toDate = addUtcDays(dataCutoffInclusive, 1);
  return { fromDate: addUtcDays(toDate, -dailyWindowDays), toDate };
}

function inside(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeDate(value, label) {
  if (typeof value !== 'string') throw new Error(label + ': fehlender Zeitstempel.');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsedDay = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== value) {
      throw new Error(label + ': ungültiges UTC-Datum.');
    }
    return { date: value, timestamp: value + 'T00:00:00Z' };
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(label + ': Zeitstempel hat keine eindeutige Zeitzone.');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(label + ': ungültiger Zeitstempel.');
  const normalized = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { date: normalized.slice(0, 10), timestamp: normalized };
}

function formatDecimal(raw, label) {
  let text;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new Error(label + ': nicht endlicher Kennzahlwert.');
    text = raw.toFixed(12);
  } else if (typeof raw === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) {
    text = raw;
  } else {
    throw new Error(label + ': Kennzahlwert ist keine Dezimalzahl.');
  }

  let negative = text.startsWith('-');
  if (negative) text = text.slice(1);
  const [wholeText, fractionText = ''] = text.split('.');
  if (wholeText.length > 24) throw new Error(label + ': Wert außerhalb des Datenbankschemas.');
  let scaled = BigInt(wholeText) * 1_000_000_000_000n
    + BigInt(fractionText.slice(0, 12).padEnd(12, '0') || '0');
  if (fractionText.length > 12 && fractionText[12] >= '5') scaled++;
  if (scaled === 0n) negative = false;
  const whole = (scaled / 1_000_000_000_000n).toString();
  const decimals = (scaled % 1_000_000_000_000n).toString().padStart(12, '0').replace(/0+$/, '');
  return (negative ? '-' : '') + whole + (decimals ? '.' + decimals : '');
}

function selectArrayPayload(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') throw new Error(label + ': unerwartetes JSON-Format.');
  for (const key of ['data', 'results', 'observations', 'items']) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      const entries = Object.entries(payload[key]);
      if (entries.length && entries.every(([keyName, value]) =>
        /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(keyName) && (typeof value === 'number' || value === null))) {
        return entries.map(([time, value]) => ({ time, value }));
      }
    }
  }
  throw new Error(label + ': Antwort enthält keine erkannte Datenreihe.');
}

function pointFields(point, expectedField) {
  if (Array.isArray(point) && point.length >= 2) return { time: point[0], value: point[1] };
  if (!point || typeof point !== 'object') throw new Error('Datenpunkt hat ein unerwartetes Format.');
  const entries = Object.entries(point);
  const byKey = new Map(entries.map(([key, value]) => [normalizeKey(key), value]));
  const timeKeys = ['timestamp', 'time', 'date', 'datetime', 'utctime', 'blocktime', 'sampletime'];
  const valueKeys = ['value', 'metricvalue', 'result', 'y'];
  let time;
  for (const key of timeKeys) {
    if (byKey.has(key)) { time = byKey.get(key); break; }
  }
  let value;
  for (const key of valueKeys) {
    if (byKey.has(key)) { value = byKey.get(key); break; }
  }
  if (value === undefined && byKey.has(normalizeKey(expectedField))) value = byKey.get(normalizeKey(expectedField));
  if (value === undefined && byKey.has('data') && typeof byKey.get('data') !== 'object') value = byKey.get('data');
  return { time, value };
}

function parseSeriesPayload(payload, spec, window) {
  const label = spec.metricId + '/' + spec.field;
  const points = selectArrayPayload(payload, label);
  const byDate = new Map();
  const seenDates = new Set();
  for (const point of points) {
    const { time, value: rawValue } = pointFields(point, spec.field);
    const { date, timestamp } = normalizeDate(time, label);
    if (date < window.fromDate || date >= window.toDate) {
      throw new Error(label + ': Antwort enthält einen Wert außerhalb des angefragten Zeitraums.');
    }
    if (seenDates.has(date)) throw new Error(label + ': doppelter UTC-Tageswert am ' + date + '.');
    seenDates.add(date);
    if (rawValue === null) continue;
    const value = formatDecimal(rawValue, label + ' am ' + date);
    byDate.set(date, {
      metricId: spec.metricId,
      date,
      timestamp,
      value,
      hash: sha256(JSON.stringify([sourceSlug, apiVersion, spec.endpoint, spec.field, point])),
    });
  }
  const observations = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length === 0) throw new Error(label + ': Antwort enthält keine gültigen Werte.');
  return observations;
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function toImportRow(observation, spec) {
  const cells = [
    observation.metricId,
    'main',
    observation.date,
    observation.value,
    sourceSlug,
    observation.timestamp,
    'provisional',
    'bitcoin-lab-' + apiVersion + ':d1:' + spec.field,
    observation.hash,
  ];
  return cells.map(csvCell).join(',');
}

function loadCoreIds() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const known = new Set(catalog.metrics.map((metric) => metric.id));
  const core = new Set(catalog.coreMetricIds);
  for (const spec of seriesSpecs) {
    if (!known.has(spec.metricId) || !core.has(spec.metricId)) {
      throw new Error('Kennzahl fehlt im Katalog oder in der 100er-Kernliste: ' + spec.metricId);
    }
  }
}

async function fetchSeries(spec, window, token) {
  const url = new URL('/v2/' + spec.endpoint + '/' + encodeURIComponent(spec.field), apiBase);
  url.search = new URLSearchParams({
    from_time: window.fromDate,
    to_time: window.toDate,
    resolution: 'd1',
    output_format: 'json',
  }).toString();
  const response = await fetch(url, {
    headers: { 'X-API-Token': token, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const hint = response.status === 401
      ? ' API-Token fehlt, ist ungültig oder abgelaufen.'
      : response.status === 403
        ? ' Diese Kennzahl oder dieser Zeitraum ist für den API-Tarif nicht freigegeben.'
        : response.status === 429
          ? ' Das Rate-Limit wurde erreicht. Das Skript wiederholt Anfragen nicht automatisch.'
          : '';
    throw new Error(spec.metricId + ': Bitcoin Lab API HTTP ' + response.status + '.' + hint);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(spec.metricId + ': Antwort ist kein gültiges JSON.');
  }
  return parseSeriesPayload(payload, spec, window);
}

function runSelfTests() {
  const window = { fromDate: '2025-01-01', toDate: '2025-01-04' };
  const spec = { metricId: 'asopr', endpoint: 'spent_output_profit_ratio', field: 'sopr' };
  const parsed = parseSeriesPayload({
    data: [
      { timestamp: '2025-01-01T00:00:00.000Z', value: '1.250000000000' },
      { timestamp: '2025-01-02T00:00:00Z', value: null },
      ['2025-01-03T00:00:00Z', -0.125],
    ],
  }, spec, window);
  if (parsed.length !== 2 || parsed[0].value !== '1.25' || parsed[0].timestamp !== '2025-01-01T00:00:00Z' || parsed[1].value !== '-0.125') {
    throw new Error('Selbsttest für JSON-Reihen oder Dezimalwerte fehlgeschlagen.');
  }
  const fieldNamedValue = parseSeriesPayload({
    data: [{ time: '2025-01-01', sopr: 1.5 }],
  }, spec, window);
  if (fieldNamedValue.length !== 1 || fieldNamedValue[0].value !== '1.5') {
    throw new Error('Selbsttest für feldbenannte JSON-Werte fehlgeschlagen.');
  }
  let duplicateRejected = false;
  try {
    parseSeriesPayload({ data: [
      { date: '2025-01-01', value: null },
      { date: '2025-01-01', value: 2 },
    ] }, spec, window);
  } catch (error) {
    duplicateRejected = /doppelter UTC-Tageswert/.test(error.message);
  }
  if (!duplicateRejected) throw new Error('Selbsttest für doppelte Tageswerte fehlgeschlagen.');
  let rangeRejected = false;
  try {
    parseSeriesPayload({ data: [{ date: '2024-12-31', value: 1 }] }, spec, window);
  } catch (error) {
    rangeRejected = /außerhalb des angefragten Zeitraums/.test(error.message);
  }
  if (!rangeRejected) throw new Error('Selbsttest für Zeitraumsgrenzen fehlgeschlagen.');
  loadCoreIds();
  console.log('Selbsttest erfolgreich: Kennzahlen-Zuordnung, UTC-Zeitstempel, Feldnamen, Zeitfenster, Duplikate, Nullwerte und signierte Dezimalwerte.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    runSelfTests();
    return;
  }
  const overwrite = args.includes('--overwrite');
  const unknown = args.filter((arg) => arg !== '--overwrite');
  if (unknown.length) throw new Error('Unbekanntes Argument: ' + unknown[0]);
  if (!inside(varDir, outputPath)) throw new Error('Die Forschungsausgabe muss im geschützten var-Ordner bleiben.');
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) throw new Error('var/.htaccess fehlt; es wird keine private Datei geschrieben.');
  if (fs.existsSync(outputPath) && !overwrite) {
    throw new Error('Die Zieldatei existiert bereits. Zum bewussten Ersetzen --overwrite angeben.');
  }
  const token = process.env.BITLAB_API_TOKEN;
  if (!token || !token.trim()) throw new Error('BITLAB_API_TOKEN fehlt. Token lokal setzen und niemals in Chat oder Datei eintragen.');
  loadCoreIds();

  const window = requestWindow();
  const results = [];
  for (let index = 0; index < seriesSpecs.length; index++) {
    const spec = seriesSpecs[index];
    const observations = await fetchSeries(spec, window, token);
    results.push({ spec, observations });
    console.log('Bitcoin Lab: ' + spec.metricId + ', ' + observations.length + ' Tageswerte.');
    if (index + 1 < seriesSpecs.length) await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const rows = results.flatMap(({ spec, observations }) =>
    observations.map((observation) => toImportRow(observation, spec)));
  rows.sort((a, b) => {
    const left = a.split(',');
    const right = b.split(',');
    return left[2].localeCompare(right[2]) || left[0].localeCompare(right[0]);
  });
  fs.writeFileSync(outputPath, importHeader + '\n' + rows.join('\n') + '\n', 'utf8');

  console.log(JSON.stringify({
    source: 'Bitcoin Lab API v2, research only, attribution required',
    sourceSlug,
    cutoffInclusive: dataCutoffInclusive,
    from: window.fromDate,
    toExclusive: window.toDate,
    resolution: 'd1',
    metricCount: results.length,
    observationCount: rows.length,
    maxExpectedPoints: results.length * dailyWindowDays,
    output: outputPath,
    sha256: sha256(fs.readFileSync(outputPath)),
    metrics: Object.fromEntries(results.map(({ spec, observations }) => [spec.metricId, {
      rows: observations.length,
      first: observations[0].date,
      last: observations.at(-1).date,
    }])),
  }, null, 2));
}

main().catch((error) => {
  console.error('Bitcoin-Lab-Rechercheabruf fehlgeschlagen: ' + error.message);
  process.exitCode = 1;
});
