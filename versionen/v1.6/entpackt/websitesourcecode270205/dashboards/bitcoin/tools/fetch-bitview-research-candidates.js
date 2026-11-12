const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.resolve(root, 'var');
const baseUrl = 'https://bitview.space';
const sourceSlug = 'bitview_api_research_only';
const derivedSlug = 'derived_bitcoin_metrics';
const requestedStart = '2009-01-01';
const outputPath = path.resolve(process.argv[2] || path.join(varDir, 'bitview-research-candidates.csv'));
const existingPath = path.join(varDir, 'bitcoin-backfill-with-obm.csv');

const definitions = [
  ['sopr_24h', 'sopr'],
  ['sth_sopr_24h', 'sth_sopr'],
  ['lth_sopr_24h', 'lth_sopr'],
  ['unrealized_profit_to_mcap', 'relative_unrealized_profit_pct'],
  ['unrealized_loss_to_mcap', 'relative_unrealized_loss_pct'],
  ['realized_profit_sum_24h', 'realized_profit_usd'],
  ['realized_loss_sum_24h', 'realized_loss_usd'],
  ['supply_in_profit_share', 'supply_in_profit_pct'],
  ['supply_in_loss_share', 'supply_in_loss_pct'],
  ['sth_realized_price', 'sth_realized_price_usd'],
  ['lth_realized_price', 'lth_realized_price_usd'],
  ['sth_mvrv', 'sth_mvrv_ratio'],
  ['lth_supply', 'long_term_holder_supply_btc'],
  ['sth_supply', 'short_term_holder_supply_btc'],
  ['utxos_over_1y_old_supply', 'hodl_supply_1y_btc'],
  ['utxos_over_2y_old_supply', 'hodl_supply_2y_btc'],
  ['utxos_over_3y_old_supply', 'hodl_supply_3y_btc'],
  ['utxos_over_5y_old_supply', 'hodl_supply_5y_btc'],
  ['utxos_over_10y_old_supply', 'hodl_supply_10y_btc'],
];

const expectedCoreIds = [
  'sopr', 'sth_sopr', 'lth_sopr',
  'relative_unrealized_profit_pct', 'relative_unrealized_loss_pct',
  'realized_profit_usd', 'realized_loss_usd', 'net_realized_profit_loss_usd',
  'supply_in_profit_pct', 'supply_in_loss_pct',
  'sth_realized_price_usd', 'lth_realized_price_usd', 'sth_mvrv_ratio',
  'long_term_holder_supply_btc', 'short_term_holder_supply_btc', 'long_term_holder_supply_pct',
  'hodl_supply_1y_btc', 'hodl_supply_2y_btc', 'hodl_supply_3y_btc', 'hodl_supply_5y_btc', 'hodl_supply_10y_btc',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatValue(value) {
  if (!Number.isFinite(value)) throw new Error(`Nicht endlicher Kennzahlwert: ${value}`);
  if (Object.is(value, -0)) return '0';
  const fixed = value.toFixed(12);
  if (/[eE]/.test(fixed)) throw new Error(`Wert kann nicht als Dezimalzahl formatiert werden: ${value}`);
  return fixed.replace(/(?:\.0+|(\.\d*?)0+)$/, '$1');
}

function addUtcDays(date, count) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function tomorrowUtc() {
  return addUtcDays(new Date().toISOString().slice(0, 10), 1);
}

function inside(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function fetchText(url, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 research-only' },
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      if (attempt === 3) throw new Error(`${label}: Netzwerkfehler: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    const text = await response.text();
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 3) throw new Error(`${label}: HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}: ${text.slice(0, 500)}`);
    return text;
  }
  throw new Error(`${label}: nach Wiederholungen nicht abrufbar.`);
}

async function fetchJson(url, label) {
  const text = await fetchText(url, label);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: Antwort ist kein gültiges JSON.`);
  }
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function loadCatalog() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const known = new Set(catalog.metrics.map((metric) => metric.id));
  const core = new Set(catalog.coreMetricIds);
  for (const metric of expectedCoreIds) {
    if (!known.has(metric) || !core.has(metric)) throw new Error(`Kernkennzahl fehlt im Katalog: ${metric}`);
  }
  if (new Set(expectedCoreIds).size !== expectedCoreIds.length) throw new Error('Die Kandidatenliste enthält doppelte Kern-IDs.');
  return { catalog, core };
}

function loadSupplyRows(filename) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Die vorhandene Importdatei hat einen unerwarteten CSV-Kopf.');
  const supply = new Map();
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Importdatei, Zeile ${index + 2}: falsche Spaltenzahl.`);
    const [metric, series, date, raw, , , quality, , hash] = cells;
    if (metric !== 'supply_btc') continue;
    if (series !== 'main' || quality !== 'provisional' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw) || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Ungültige Supply-Eingabe in Zeile ${index + 2}.`);
    }
    if (supply.has(date)) throw new Error(`Doppelte Supply-Eingabe am ${date}.`);
    supply.set(date, { value: Number(raw), hash });
  }
  if (supply.size === 0) throw new Error('Die bestehende Importdatei enthält keine Umlaufmenge.');
  return supply;
}

async function downloadSeries(definition, endDate, apiVersion) {
  const [series, metric] = definition;
  const params = new URLSearchParams({ start: requestedStart, end: endDate, limit: '10000', format: 'json' });
  const payload = await fetchJson(`${baseUrl}/api/series/${encodeURIComponent(series)}/day1?${params}`, series);
  if (payload.index !== 'day1' || !Number.isInteger(payload.start) || !Number.isInteger(payload.end) || !Array.isArray(payload.data)) {
    throw new Error(`${series}: unerwartetes Tagesreihenformat.`);
  }
  if (payload.start !== 0 || payload.end - payload.start !== payload.data.length) {
    throw new Error(`${series}: Tagesindex unvollständig oder nicht auf 2009-01-01 ausgerichtet.`);
  }
  const items = [];
  let nullCount = 0;
  for (const [offset, raw] of payload.data.entries()) {
    if (raw === null) {
      nullCount++;
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`${series}: ungültiger Wert am Index ${payload.start + offset}.`);
    const date = addUtcDays(requestedStart, payload.start + offset);
    const value = formatValue(raw);
    const hash = sha256([sourceSlug, apiVersion, series, String(payload.version), date, value].join('\x1f'));
    items.push({ metric, series, date, value, numeric: Number(value), hash, revision: `bitview-research-only:${apiVersion}:${series}:${payload.version}` });
  }
  return {
    series,
    metric,
    version: payload.version,
    stamp: payload.stamp,
    points: payload.data.length,
    nullCount,
    items,
  };
}

async function main() {
  if (!inside(varDir, outputPath)) throw new Error('Die Forschungsausgabe muss innerhalb des geschützten var-Ordners bleiben.');
  if (outputPath === existingPath) throw new Error('Die Forschungsausgabe darf die bestehende Gesamtexportdatei nicht überschreiben.');
  if (!fs.existsSync(existingPath)) throw new Error(`Vorhandene Importdatei fehlt: ${existingPath}`);
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) throw new Error('var/.htaccess fehlt; die private Ausgabe wird nicht geschrieben.');

  const { catalog, core } = loadCatalog();
  const known = new Set(catalog.metrics.map((metric) => metric.id));
  const supplyRows = loadSupplyRows(existingPath);
  const versionText = await fetchText(`${baseUrl}/version`, 'Bitview API-Version');
  let apiVersion;
  try { apiVersion = JSON.parse(versionText); } catch { apiVersion = versionText.trim(); }
  apiVersion = String(apiVersion).replace(/^"|"$/g, '').trim();
  if (!apiVersion || apiVersion.length > 32) throw new Error('Die Bitview API-Version ist leer oder unerwartet lang.');

  const results = await mapLimit(definitions, 3, (definition) => downloadSeries(definition, tomorrowUtc(), apiVersion));
  const directByMetric = new Map();
  const rows = [];
  const rowKeys = new Set();
  const addRow = (metric, date, value, slug, revision, hash) => {
    if (!known.has(metric) || !core.has(metric)) throw new Error(`Unbekannte oder nicht zur Kernliste gehörende ID: ${metric}`);
    const formatted = typeof value === 'string' ? value : formatValue(value);
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(formatted) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z0-9_]{1,96}$/.test(slug) || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Ungültige Kandidatenbeobachtung: ${metric} ${date}.`);
    }
    const key = `${metric}/main/${date}`;
    if (rowKeys.has(key)) throw new Error(`Doppelte Kandidatenbeobachtung: ${key}`);
    rowKeys.add(key);
    rows.push([metric, 'main', date, formatted, slug, '', 'provisional', revision, hash].join(','));
    return { value: Number(formatted), hash };
  };

  for (const result of results) {
    const values = new Map();
    for (const item of result.items) {
      const value = addRow(item.metric, item.date, item.value, sourceSlug, item.revision, item.hash);
      values.set(item.date, value);
    }
    directByMetric.set(result.metric, values);
  }

  const profitRows = directByMetric.get('realized_profit_usd');
  const lossRows = directByMetric.get('realized_loss_usd');
  for (const [date, profit] of profitRows) {
    const loss = lossRows.get(date);
    if (!loss) continue;
    const value = profit.value - loss.value;
    const formula = 'realized-profit-minus-realized-loss-24h';
    const hash = sha256([formula, date, profit.hash, loss.hash, formatValue(value)].join('\x1f'));
    addRow('net_realized_profit_loss_usd', date, value, derivedSlug, `bitview-research-only-v1:${formula}`, hash);
  }

  const lthRows = directByMetric.get('long_term_holder_supply_btc');
  let missingSupplyDays = 0;
  for (const [date, lth] of lthRows) {
    const supply = supplyRows.get(date);
    if (!supply || supply.value <= 0) {
      missingSupplyDays++;
      continue;
    }
    const value = lth.value / supply.value * 100;
    if (value < 0 || value > 100.0000001) throw new Error(`${date}: LTH-Anteil liegt außerhalb 0 bis 100 Prozent.`);
    const formula = 'lth-supply-over-coinmetrics-circulating-supply-times-100';
    const hash = sha256([formula, date, lth.hash, supply.hash, formatValue(value)].join('\x1f'));
    addRow('long_term_holder_supply_pct', date, value, derivedSlug, `bitview-research-only-v1:${formula}`, hash);
  }

  const actualCoreIds = new Set(rows.map((line) => line.split(',')[0]));
  const missingCoreIds = expectedCoreIds.filter((metric) => !actualCoreIds.has(metric));
  if (missingCoreIds.length) throw new Error(`Kandidatenreihen ohne gültige Werte: ${missingCoreIds.join(', ')}`);
  if (actualCoreIds.size !== expectedCoreIds.length) throw new Error('Die Forschungsausgabe enthält unerwartete Kernkennzahlen.');

  rows.sort((a, b) => a.split(',')[2].localeCompare(b.split(',')[2]) || a.split(',')[0].localeCompare(b.split(',')[0]));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, importHeader + '\n' + rows.join('\n') + '\n', 'utf8');

  const metricReport = {};
  for (const metric of expectedCoreIds) {
    const dates = rows.filter((line) => line.startsWith(`${metric},`)).map((line) => line.split(',')[2]);
    metricReport[metric] = { rows: dates.length, first: dates[0], last: dates.at(-1) };
  }
  console.log(JSON.stringify({
    source: 'Bitview public API, research-only, license for public data redistribution unconfirmed',
    apiVersion,
    indexedThrough: tomorrowUtc(),
    dailySeries: results.length,
    dailyIndexPointsPerSeries: Math.min(...results.map((item) => item.points)),
    nullPoints: Object.fromEntries(results.map((item) => [item.series, item.nullCount])),
    derived: {
      netRealizedProfitLoss: 'realized_profit_sum_24h minus realized_loss_sum_24h',
      longTermHolderSupplyPercent: 'LTH supply divided by Coin Metrics circulating supply times 100',
      missingSupplyDays,
    },
    candidateRows: rows.length,
    candidateCoreIds: actualCoreIds.size,
    output: outputPath,
    sha256: sha256(fs.readFileSync(outputPath)),
    metrics: metricReport,
  }, null, 2));
}

main().catch((error) => {
  console.error('Bitview-Kandidatenabruf fehlgeschlagen: ' + error.message);
  process.exitCode = 1;
});
