const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const outputTag = process.argv[2] || '';
if (outputTag && !/^[a-z0-9-]+$/.test(outputTag)) throw new Error('Output tag darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const masterManifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const outputSuffix = outputTag ? `-${outputTag}` : '';
const candidatePath = path.join(varDir, `bitview-hodl-age-percentages-import-through-2026-09-28${outputSuffix}.csv`);
const candidateManifestPath = path.join(varDir, `bitview-hodl-age-percentages-import-through-2026-09-28${outputSuffix}.json`);
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const version = 'bitview-hodl-age-percentage-v1';
const targetInputs = {
  supply_last_active_1y_pct: 'hodl_supply_1y_btc',
  supply_last_active_5y_pct: 'hodl_supply_5y_btc',
  supply_last_active_10y_pct: 'hodl_supply_10y_btc',
};
const neededMetrics = new Set(['supply_btc', ...Object.values(targetInputs), ...Object.keys(targetInputs)]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function dayAfter(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function formatValue(value) {
  const rounded = Number(value.toFixed(12));
  if (!Number.isFinite(rounded)) throw new Error(`Nicht endlicher Prozentwert: ${value}`);
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(12).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
}

async function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function main() {
  for (const filename of [candidatePath, candidateManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Zieldatei existiert bereits: ${path.basename(filename)}`);
  }
  const priorManifest = JSON.parse(fs.readFileSync(masterManifestPath, 'utf8'));
  const masterSha256 = await hashFile(masterPath);
  if (priorManifest.cutoffInclusive !== cutoff || !Number.isSafeInteger(priorManifest.observations)
      || priorManifest.observations < 1 || !/^[a-f0-9]{64}$/.test(priorManifest.masterSha256 || '')
      || masterSha256 !== priorManifest.masterSha256) {
    throw new Error('Master und Manifest stimmen nicht überein oder verwenden einen unerwarteten Stichtag.');
  }

  const rows = new Map([...neededMetrics].map((metric) => [metric, new Map()]));
  const sourceCounts = new Map([...neededMetrics].map((metric) => [metric, new Map()]));
  let masterRows = 0;
  let headerLine = true;
  const rl = readline.createInterface({ input: fs.createReadStream(masterPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (headerLine) {
      if (line.replace(/^\uFEFF/, '') !== header) throw new Error('Unerwarteter Master-CSV-Header.');
      headerLine = false;
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Masterzeile ${masterRows + 2}.`);
    masterRows++;
    const [metric, series, date, rawValue, sourceSlug, , quality, , rawHash] = cells;
    if (Object.hasOwn(targetInputs, metric)) continue;
    if (!neededMetrics.has(metric)) continue;
    if (series !== 'main' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > cutoff
        || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(rawValue)
        || !/^[a-z0-9_]{1,96}$/.test(sourceSlug) || !/^[a-f0-9]{64}$/.test(rawHash)) {
      throw new Error(`Ungültige Eingabe ${metric}/${date}.`);
    }
    const metricRows = rows.get(metric);
    if (metricRows.has(date)) throw new Error(`Doppelter Input ${metric}/main/${date}.`);
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Ungültiger Eingabewert ${metric}/${date}.`);
    if (metric.startsWith('hodl_supply_') && sourceSlug !== 'bitview_api_research_only') {
      throw new Error(`${metric} stammt unerwartet aus ${sourceSlug}.`);
    }
    metricRows.set(date, { value, rawValue, hash: rawHash, sourceSlug, quality });
    const sources = sourceCounts.get(metric);
    sources.set(sourceSlug, (sources.get(sourceSlug) || 0) + 1);
  }
  if (masterRows !== priorManifest.observations) throw new Error('Die gelesene Masterzeilenzahl stimmt nicht mit dem Manifest überein.');

  const supplyRows = rows.get('supply_btc');
  if (supplyRows.size === 0) throw new Error('Bitcoin-Angebotsreihe fehlt.');
  const supplyDates = [...supplyRows.keys()].sort();
  if (supplyDates[0] !== '2009-01-03' || supplyDates.at(-1) !== cutoff) throw new Error('Bitcoin-Angebotsreihe hat unerwartete Abdeckung.');
  for (let index = 1; index < supplyDates.length; index++) {
    if (supplyDates[index] !== dayAfter(supplyDates[index - 1])) throw new Error(`Lücke in der Angebotsreihe vor ${supplyDates[index]}.`);
  }
  const excludedNoSupplyDates = supplyDates.filter((date) => supplyRows.get(date).value === 0);
  const dates = supplyDates.filter((date) => supplyRows.get(date).value > 0);
  if (dates[0] !== '2009-01-09' || dates.at(-1) !== cutoff) throw new Error('Bitcoin-Angebotsreihe hat unerwartete positive Abdeckung.');
  for (const hodlInput of Object.values(targetInputs)) {
    const inputRows = rows.get(hodlInput);
    const extraDates = [...inputRows.keys()].filter((date) => !supplyRows.has(date));
    if (dates.some((date) => !inputRows.has(date))
        || extraDates.some((date) => inputRows.get(date).value !== 0)) {
      throw new Error(`${hodlInput} deckt nicht dieselben täglichen Daten wie supply_btc ab.`);
    }
    if (excludedNoSupplyDates.some((date) => inputRows.has(date) && inputRows.get(date).value !== 0)) {
      throw new Error(`${hodlInput} ist vor dem ersten positiven Angebot nicht null.`);
    }
  }

  const outputRows = [];
  const metricCounts = Object.fromEntries(Object.keys(targetInputs).map((metric) => [metric, 0]));
  let minPct = 100;
  let maxPct = 0;
  for (const metric of Object.keys(targetInputs)) {
    const inputMetric = targetInputs[metric];
    for (const date of dates) {
      const supply = supplyRows.get(date);
      const hodl = rows.get(inputMetric).get(date);
      if (supply.value <= 0 || hodl.value > supply.value) throw new Error(`UTXO-Altersbestand liegt außerhalb des Bitcoin-Angebots am ${date} (${metric}).`);
      const value = hodl.value / supply.value * 100;
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Prozentwert außerhalb 0–100 am ${date} (${metric}).`);
      const formatted = formatValue(value);
      const key = `${metric}/main/${date}`;
      const inputsHash = sha256(`${hodl.hash}\x1f${supply.hash}`);
      const hash = sha256(`${version}\x1f${key}\x1f${inputsHash}\x1f${formatted}`);
      outputRows.push([metric, 'main', date, formatted, 'derived_bitcoin_metrics', '', 'provisional', `${version}:${inputMetric}_over_supply_btc`, hash].join(','));
      metricCounts[metric]++;
      minPct = Math.min(minPct, value);
      maxPct = Math.max(maxPct, value);
    }
  }
  outputRows.sort((a, b) => a.split(',')[2].localeCompare(b.split(',')[2]) || a.split(',')[0].localeCompare(b.split(',')[0]));
  const csv = `${[header, ...outputRows].join('\n')}\n`;
  fs.writeFileSync(candidatePath, csv, { flag: 'wx' });
  const candidateManifest = {
    preparedAt: new Date().toISOString(),
    cutoffInclusive: cutoff,
    source: 'Private Bitview UTXO age cohorts plus Bitcoin daily supply',
    licenseNote: 'Private local research only. No separate reuse license for hosted Bitview data was identified; public redistribution and public dashboard display are not cleared.',
    candidatePath: path.basename(candidatePath),
    observations: outputRows.length,
    metricIds: Object.keys(targetInputs),
    metricCounts,
    firstObservationDate: dates[0],
    lastObservationDate: dates.at(-1),
    sourceCounts: { derived_bitcoin_metrics: outputRows.length },
    inputMetricMap: targetInputs,
    excludedNoSupplyDates,
    inputCounts: Object.fromEntries([...neededMetrics].filter((metric) => !Object.hasOwn(targetInputs, metric)).map((metric) => [metric, rows.get(metric).size])),
    inputSourceCounts: Object.fromEntries([...sourceCounts.entries()].filter(([, counts]) => counts.size)
      .map(([metric, counts]) => [metric, Object.fromEntries(counts)])),
    minPercent: Number(minPct.toFixed(12)),
    maxPercent: Number(maxPct.toFixed(12)),
    allValuesWithinZeroAndOneHundred: true,
    methodology: 'For each UTC day and age threshold: 100 * Bitview spendable UTXO supply above the age threshold / Bitcoin total supply. Exact Bitview cohort methodology is provisional; input series and dates are retained without interpolation.',
    candidateBytes: Buffer.byteLength(csv),
    candidateSha256: sha256(csv),
    uploaded: false,
    publicRedistributionCleared: false,
  };
  fs.writeFileSync(candidateManifestPath, `${JSON.stringify(candidateManifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(candidateManifest, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
