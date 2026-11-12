const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
if (catalog.coreMetricIds.length !== 100) throw new Error('Der Katalog muss genau 100 Kernkennzahlen enthalten.');
const candidatePath = path.resolve(process.argv[2] || path.join(root, 'var', 'bitview-research-candidates.csv'));
const primaryPath = path.resolve(process.argv[3] || path.join(root, 'var', 'bitcoin-backfill-cointime-cftc-options.csv'));
const privateImportPath = process.argv[4] ? path.resolve(process.argv[4]) : null;
const candidateSource = 'bitview_api_research_only';
const generatedDerivedSource = 'derived_bitcoin_metrics';
const derivedSource = 'derived_bitview_research_metrics';
const expectedMetrics = [
  'sopr', 'sth_sopr', 'lth_sopr',
  'relative_unrealized_profit_pct', 'relative_unrealized_loss_pct',
  'realized_profit_usd', 'realized_loss_usd', 'net_realized_profit_loss_usd',
  'supply_in_profit_pct', 'supply_in_loss_pct',
  'sth_realized_price_usd', 'lth_realized_price_usd', 'sth_mvrv_ratio',
  'long_term_holder_supply_btc', 'short_term_holder_supply_btc', 'long_term_holder_supply_pct',
  'hodl_supply_1y_btc', 'hodl_supply_2y_btc', 'hodl_supply_3y_btc', 'hodl_supply_5y_btc', 'hodl_supply_10y_btc',
];
const derivedMetrics = new Set(['net_realized_profit_loss_usd', 'long_term_holder_supply_pct']);

function readCsv(filename, expectedSource) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Ungültiger Import-CSV-Kopf: ${filename}`);
  const rows = new Map();
  const metrics = new Map();
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`${filename}, Zeile ${index + 2}: falsche Spaltenzahl.`);
    const [metric, series, date, raw, source, , quality, revision, hash] = cells;
    if (!/^[a-z0-9_]{1,96}$/.test(metric) || !/^[a-z0-9_]{1,96}$/.test(series)
      || (expectedSource && series !== 'main')
      || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(raw)
      || quality !== 'provisional' || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`${filename}, Zeile ${index + 2}: ungültige Beobachtung.`);
    }
    if (expectedSource && source !== expectedSource
      && !((source === generatedDerivedSource || source === derivedSource) && derivedMetrics.has(metric))) {
      throw new Error(`${filename}, Zeile ${index + 2}: unerwartete Quelle ${source}.`);
    }
    if (expectedSource && derivedMetrics.has(metric) && (!revision || !revision.startsWith('bitview-research-only-v1:'))) {
      throw new Error(`${filename}, Zeile ${index + 2}: lokale Ableitung ohne Bitview-Forschungsrevision.`);
    }
    const key = `${metric}/${series}/${date}`;
    if (rows.has(key)) throw new Error(`${filename}: doppelte Beobachtung ${key}`);
    const row = { metric, date, value: Number(raw), raw, source, revision, hash, line };
    rows.set(key, row);
    if (!metrics.has(metric)) metrics.set(metric, []);
    metrics.get(metric).push(row);
  }
  return { rows, metrics, count: lines.length };
}

const candidate = readCsv(candidatePath, candidateSource);
const primary = readCsv(primaryPath, null);
if (privateImportPath) {
  const varDir = path.resolve(root, 'var');
  const relative = path.relative(varDir, privateImportPath);
  if (relative === '' || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)
    || privateImportPath === candidatePath || privateImportPath === primaryPath) {
    throw new Error('Die private Kandidaten-Ausgabe muss eine neue Datei innerhalb von bitcoin/var/ sein.');
  }
}
const actualMetrics = new Set(candidate.metrics.keys());
const missingMetrics = expectedMetrics.filter((metric) => !actualMetrics.has(metric));
const extraMetrics = [...actualMetrics].filter((metric) => !expectedMetrics.includes(metric));
if (missingMetrics.length || extraMetrics.length) {
  throw new Error(`Kernabdeckung weicht ab. Fehlend: ${missingMetrics.join(', ') || 'keine'}. Unerwartet: ${extraMetrics.join(', ') || 'keine'}.`);
}

let alreadyMergedRows = 0;
for (const [key, row] of candidate.rows) {
  const existing = primary.rows.get(key);
  if (!existing) continue;
  const sameObservation = existing.raw === row.raw && existing.hash === row.hash && existing.revision === row.revision
    && (derivedMetrics.has(row.metric) || existing.source === row.source);
  if (!sameObservation) throw new Error(`Kollidiert mit einer abweichenden Beobachtung im Gesamtexport: ${key}`);
  alreadyMergedRows++;
}

const getCandidate = (metric, date) => candidate.rows.get(`${metric}/main/${date}`) || null;
const getPrimary = (metric, date) => primary.rows.get(`${metric}/main/${date}`) || null;
let checkedNet = 0;
for (const row of candidate.metrics.get('net_realized_profit_loss_usd')) {
  const profit = getCandidate('realized_profit_usd', row.date);
  const loss = getCandidate('realized_loss_usd', row.date);
  if (!profit || !loss || Math.abs(row.value - (profit.value - loss.value)) > 1e-10) {
    throw new Error(`${row.date}: Netto Realized P/L stimmt nicht mit Profit minus Loss überein.`);
  }
  checkedNet++;
}

let checkedLthShare = 0;
for (const row of candidate.metrics.get('long_term_holder_supply_pct')) {
  const lth = getCandidate('long_term_holder_supply_btc', row.date);
  const supply = getPrimary('supply_btc', row.date);
  if (!lth || !supply || supply.value <= 0 || Math.abs(row.value - (lth.value / supply.value * 100)) > 1e-9) {
    throw new Error(`${row.date}: LTH Supply % stimmt nicht mit LTH-Supply / Umlaufmenge überein.`);
  }
  checkedLthShare++;
}

let checkedSupplyShares = 0;
for (const row of candidate.metrics.get('supply_in_profit_pct')) {
  const loss = getCandidate('supply_in_loss_pct', row.date);
  const supply = getPrimary('supply_btc', row.date);
  if (loss && supply && supply.value > 0 && Math.abs(row.value + loss.value - 100) > 0.05) {
    throw new Error(`${row.date}: Supply in Profit und Loss addieren sich nicht zu 100 Prozent.`);
  }
  if (loss && supply && supply.value > 0) checkedSupplyShares++;
}

const metricReport = {};
const missingDateCounts = new Map();
for (const metric of expectedMetrics) {
  const rows = candidate.metrics.get(metric).slice().sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = (Date.parse(`${rows.at(-1).date}T00:00:00Z`) - Date.parse(`${rows[0].date}T00:00:00Z`)) / 86_400_000;
  const observedDates = new Set(rows.map((row) => row.date));
  const missingDates = [];
  for (let offset = 0; offset <= spanDays; offset++) {
    const date = new Date(Date.parse(`${rows[0].date}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    if (!observedDates.has(date)) missingDates.push(date);
  }
  for (const date of missingDates) missingDateCounts.set(date, (missingDateCounts.get(date) || 0) + 1);
  metricReport[metric] = {
    rows: rows.length,
    first: rows[0].date,
    last: rows.at(-1).date,
    missingCalendarDays: missingDates.length,
    source: rows[0].source,
  };
}

let privateImport = null;
if (privateImportPath) {
  const undefinedRealizedPriceMetrics = new Set(['sth_realized_price_usd', 'lth_realized_price_usd']);
  const importRows = [...candidate.rows.values()].filter((row) => !(undefinedRealizedPriceMetrics.has(row.metric) && row.value === 0));
  const excludedZeroRealizedPriceRows = candidate.rows.size - importRows.length;
  const privateLines = importRows.map((row) => {
    if (!derivedMetrics.has(row.metric)) return row.line;
    const cells = row.line.split(',');
    cells[4] = derivedSource;
    return cells.join(',');
  });
  fs.writeFileSync(privateImportPath, `${importHeader}\n${privateLines.join('\n')}\n`, 'utf8');
  privateImport = {
    output: path.relative(root, privateImportPath),
    rows: importRows.length,
    excludedZeroRealizedPriceRows,
    reason: 'Realized Price ist bei fehlender belastbarer USD-Bewertung nicht 0 USD; diese Platzhalter bleiben fehlend.',
  };
}

console.log(JSON.stringify({
  status: privateImport ? 'private research import candidate; public redistribution not cleared' : 'private research candidate; not merged with the import or cleared for public redistribution',
  candidateRows: candidate.count,
  candidateMetrics: candidate.metrics.size,
  existingCoreCoverage: catalog.coreMetricIds.filter((metric) => primary.metrics.has(metric)).length,
  potentialCoreCoverage: catalog.coreMetricIds.filter((metric) => primary.metrics.has(metric) || candidate.metrics.has(metric)).length,
  collisionsWithExistingExport: 0,
  alreadyMergedRows,
  independentlyChecked: {
    netRealizedProfitLossRows: checkedNet,
    longTermHolderSupplyPercentRows: checkedLthShare,
    supplyInProfitLossPairs: checkedSupplyShares,
  },
  privateImport,
  unobservedCalendarDates: Object.fromEntries([...missingDateCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
  metrics: metricReport,
}, null, 2));
