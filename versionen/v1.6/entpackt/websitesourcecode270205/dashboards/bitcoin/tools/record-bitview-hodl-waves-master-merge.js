const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const backupPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options-before-bitview-hodl-waves-2026-09-30.csv');
const candidatePath = path.join(varDir, 'bitview-hodl-waves-import-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'bitview-hodl-waves-import-through-2026-09-28.json');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const expectedHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expectedRows = 738980;
const expectedBytes = 147952515;
const expectedSha256 = 'b6c7a911dac8cc0e9d7256af9b1155e08d20aff748ee57c064ddf9a9e7040b87';
const cutoff = '2026-09-28';
const outputMetric = 'hodl_waves';
const derivedSource = 'derived_bitcoin_metrics';
const inputSource = 'bitview_api_research_only';
const inputs = [
  'supply_btc',
  'hodl_supply_1y_btc',
  'hodl_supply_2y_btc',
  'hodl_supply_3y_btc',
  'hodl_supply_5y_btc',
  'hodl_supply_10y_btc',
];
const bands = [
  { key: 'under_1y', label: '0 bis 1 Jahr', lower: 'supply_btc', upper: 'hodl_supply_1y_btc' },
  { key: '1_to_2y', label: '1 bis 2 Jahre', lower: 'hodl_supply_1y_btc', upper: 'hodl_supply_2y_btc' },
  { key: '2_to_3y', label: '2 bis 3 Jahre', lower: 'hodl_supply_2y_btc', upper: 'hodl_supply_3y_btc' },
  { key: '3_to_5y', label: '3 bis 5 Jahre', lower: 'hodl_supply_3y_btc', upper: 'hodl_supply_5y_btc' },
  { key: '5_to_10y', label: '5 bis 10 Jahre', lower: 'hodl_supply_5y_btc', upper: 'hodl_supply_10y_btc' },
  { key: '10y_plus', label: '10 Jahre und älter', lower: null, upper: 'hodl_supply_10y_btc' },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function utcDayNumber(date) {
  return Date.parse(date + 'T00:00:00Z') / 86400000;
}

function csvCell(value) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) throw new Error('CSV-Feld enthält ein nicht erwartetes Sonderzeichen.');
  return text;
}

async function readMasterForInputs(filename) {
  const values = Object.fromEntries(inputs.map((id) => [id, new Map()]));
  const summary = { rows: 0, bytes: fs.statSync(filename).size, metrics: new Set(), sources: {}, supplySources: {}, firstDate: null, lastDate: null, rowsAfterCutoff: 0 };
  let first = true;
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  for await (const line of rl) {
    if (first) {
      if (line.replace(/^\uFEFF/, '') !== expectedHeader) throw new Error('Unerwarteter Master-CSV-Header.');
      first = false;
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Ungültige CSV-Zeile im Master.');
    const metricId = cells[0];
    const date = cells[2];
    summary.rows++;
    summary.metrics.add(metricId);
    summary.sources[cells[4]] = (summary.sources[cells[4]] || 0) + 1;
    if (!summary.firstDate || date < summary.firstDate) summary.firstDate = date;
    if (!summary.lastDate || date > summary.lastDate) summary.lastDate = date;
    if (date > cutoff) summary.rowsAfterCutoff++;
    if (!values[metricId] || date > cutoff) continue;
    if (cells[1] !== 'main') throw new Error('Unerwarteter Input-Serienschlüssel für ' + metricId + '.');
    const validSupplySources = ['coinmetrics_community_btc', 'openbitcoin_node_api'];
    if (metricId === 'supply_btc' && !validSupplySources.includes(cells[4])) {
      throw new Error('Unerwartete Eingangsquelle für supply_btc: ' + cells[4]);
    }
    if (metricId !== 'supply_btc' && cells[4] !== inputSource) {
      throw new Error('Unerwartete Eingangsquelle für ' + metricId + ': ' + cells[4]);
    }
    if (metricId === 'supply_btc') summary.supplySources[cells[4]] = (summary.supplySources[cells[4]] || 0) + 1;
    if (values[metricId].has(date)) throw new Error('Doppelter Eingabewert für ' + metricId + ' am ' + date + '.');
    const value = Number(cells[3]);
    if (!Number.isFinite(value) || value < 0) throw new Error('Ungültiger Eingabewert für ' + metricId + ' am ' + date + '.');
    values[metricId].set(date, { value, row: line });
  }
  return { values, summary };
}

function deriveCandidate(values, inputSha256) {
  const dates = [...values.supply_btc.keys()].sort();
  if (!dates.length) throw new Error('Keine BTC-Umlaufmengenwerte im Master.');
  let firstDate = null;
  let lastDate = null;
  const counts = Object.fromEntries(bands.map((band) => [band.key, 0]));
  const ranges = Object.fromEntries(bands.map((band) => [band.key, { min: Infinity, max: -Infinity }]));
  const rows = [];

  for (const date of dates) {
    const records = Object.fromEntries(inputs.map((id) => [id, values[id].get(date)]));
    if (inputs.some((id) => !records[id])) continue;
    const supply = records.supply_btc.value;
    if (supply <= 0) throw new Error('Umlaufmenge ist nicht positiv am ' + date + '.');
    const balances = bands.map((band) => {
      const high = records[band.upper].value;
      const low = band.lower ? records[band.lower].value : 0;
      const btc = band.key === 'under_1y' ? supply - high : band.key === '10y_plus' ? high : low - high;
      return { band, btc };
    });
    const sumBtc = balances.reduce((sum, entry) => sum + entry.btc, 0);
    if (balances.some((entry) => entry.btc < -0.000001)) throw new Error('Negative Alterskohorte am ' + date + '.');
    if (Math.abs(sumBtc - supply) > 0.00001) throw new Error('Altersbänder summieren sich nicht zum BTC-Angebot am ' + date + '.');

    for (const entry of balances) {
      const value = entry.btc / supply * 100;
      if (!Number.isFinite(value) || value < -0.00000001 || value > 100.00000001) {
        throw new Error('Prozentwert außerhalb des gültigen Bereichs am ' + date + ', Band ' + entry.band.key + '.');
      }
      const rounded = Number(value.toFixed(12));
      const rawInputs = inputs.map((id) => records[id].row).join('\n');
      const payloadHash = sha256(date + '\n' + entry.band.key + '\n' + rawInputs);
      const revision = 'bitview-hodl-waves-v1:' + date + ':' + entry.band.key;
      rows.push([
        outputMetric,
        entry.band.key,
        date,
        rounded.toFixed(12),
        derivedSource,
        '',
        'provisional',
        revision,
        payloadHash,
      ].map(csvCell).join(','));
      counts[entry.band.key]++;
      ranges[entry.band.key].min = Math.min(ranges[entry.band.key].min, rounded);
      ranges[entry.band.key].max = Math.max(ranges[entry.band.key].max, rounded);
    }
    if (!firstDate) firstDate = date;
    lastDate = date;
  }

  if (dates.some((date) => date <= cutoff && !inputs.every((id) => values[id].has(date)))) {
    throw new Error('Die Eingangsreihen haben unterbrochene Tagesabdeckung; es wird nicht interpoliert.');
  }
  const expectedDays = utcDayNumber(lastDate) - utcDayNumber(firstDate) + 1;
  if (expectedDays !== 6472 || Object.values(counts).some((count) => count !== expectedDays)) {
    throw new Error('Unerwartete gemeinsame UTC-Tagesabdeckung: ' + JSON.stringify(counts));
  }

  const csv = expectedHeader + '\n' + rows.join('\n') + '\n';
  return {
    csv,
    rows,
    summary: {
      metricId: outputMetric,
      observations: rows.length,
      seriesCount: bands.length,
      series: bands.map((band) => ({
        seriesKey: band.key,
        displayName: band.label,
        observations: counts[band.key],
        minimumPct: ranges[band.key].min,
        maximumPct: ranges[band.key].max,
      })),
      firstObservationDate: firstDate,
      lastObservationDate: lastDate,
      noMissingDates: true,
      inputMasterSha256: inputSha256,
      formula: '100 * (untere kumulative BTC-Alterskohorte minus obere kumulative BTC-Alterskohorte) / supply_btc; 0 bis 1 Jahr = supply_btc minus hodl_supply_1y_btc; ab 10 Jahren = hodl_supply_10y_btc.',
      sourceMethodology: 'Bitview cumulative UTXO supply thresholds at 1, 2, 3, 5, and 10 years, divided by the dashboard BTC circulating supply metric supply_btc on the same UTC date.',
      validations: {
        allValuesBetweenZeroAnd100: true,
        noNegativeCohorts: true,
        sixBandsSumToSupplyEachDay: true,
        noInterpolation: true,
      },
    },
  };
}

async function summarizeMaster(filename, catalog) {
  const metricIds = new Set();
  const sourceCounts = {};
  const seriesCounts = Object.fromEntries(bands.map((band) => [band.key, 0]));
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  let first = true;
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  for await (const line of rl) {
    if (first) {
      if (line.replace(/^\uFEFF/, '') !== expectedHeader) throw new Error('Unerwarteter Master-CSV-Header nach dem Merge.');
      first = false;
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Ungültige CSV-Zeile nach dem Merge.');
    rows++;
    metricIds.add(cells[0]);
    sourceCounts[cells[4]] = (sourceCounts[cells[4]] || 0) + 1;
    if (cells[0] === outputMetric && cells[4] === derivedSource && cells[2] <= cutoff) {
      if (!(cells[1] in seriesCounts)) throw new Error('Unerwartete HODL-Waves-Reihe ' + cells[1] + '.');
      seriesCounts[cells[1]]++;
    }
    if (!firstDate || cells[2] < firstDate) firstDate = cells[2];
    if (!lastDate || cells[2] > lastDate) lastDate = cells[2];
    if (cells[2] > cutoff) rowsAfterCutoff++;
  }
  const known = new Set(catalog.metrics.map((metric) => metric.id));
  const unknownMetricIds = [...metricIds].filter((id) => !known.has(id));
  if (unknownMetricIds.length) throw new Error('Kennzahlen fehlen im Katalog: ' + unknownMetricIds.join(', ') + '.');
  const emptyMetricIds = catalog.metrics.filter((metric) => !metricIds.has(metric.id)).map((metric) => metric.id);
  const emptyCoreMetricIds = catalog.coreMetricIds.filter((id) => !metricIds.has(id));
  const nonBitcoinCategories = new Set(['macro']);
  const emptyBitcoinMetricIds = catalog.metrics.filter((metric) => metric.category !== 'macro' && !metricIds.has(metric.id)).map((metric) => metric.id);
  if (metricIds.has(outputMetric) && Object.values(seriesCounts).some((count) => count !== 6472)) {
    throw new Error('HODL-Waves-Reihenanzahl im Master ist unerwartet.');
  }
  if (rowsAfterCutoff !== 0 || lastDate !== cutoff) throw new Error('Der Master enthält Werte nach dem vorgesehenen Stichtag.');
  if (Object.values(sourceCounts).reduce((sum, count) => sum + count, 0) !== rows) throw new Error('Quellenanzahl entspricht nicht der Masterzeilenzahl.');
  return {
    rows,
    metricIds,
    sourceCounts,
    firstDate,
    lastDate,
    rowsAfterCutoff,
    emptyMetricIds,
    emptyCoreMetricIds,
    emptyBitcoinMetricIds,
    seriesCounts,
    coreMetricIdsWithObservations: catalog.coreMetricIds.length - emptyCoreMetricIds.length,
  };
}

async function main() {
  for (const filename of [masterPath, manifestPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(filename) + '.');
  }
  if (fs.existsSync(backupPath) || fs.existsSync(candidatePath) || fs.existsSync(candidateManifestPath)) {
    throw new Error('Backup oder Kandidat mit diesem Namen existiert bereits. Es wird nichts überschrieben.');
  }
  const masterSha256 = await sha256File(masterPath);
  const masterBefore = await readMasterForInputs(masterPath);
  if (masterSha256 !== expectedSha256 || masterBefore.summary.rows !== expectedRows
      || masterBefore.summary.bytes !== expectedBytes || masterBefore.summary.rowsAfterCutoff !== 0
      || masterBefore.summary.lastDate !== cutoff || masterBefore.summary.metrics.has(outputMetric)) {
    throw new Error('Aktiver Master weicht vom geprüften Bitcoin-Stichtagsstand ab.');
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!catalog.metrics.some((metric) => metric.id === outputMetric) || !catalog.coreMetricIds.includes(outputMetric)) {
    throw new Error('HODL Waves muss als Bitcoin-Kernkennzahl im Katalog eingetragen sein.');
  }
  const { csv, rows, summary: candidateSummary } = deriveCandidate(masterBefore.values, masterSha256);
  const candidateBytes = Buffer.byteLength(csv, 'utf8');
  const candidateSha256 = sha256(csv);
  const candidateManifest = {
    dashboard: 'bitcoin',
    candidateOnly: true,
    mergedIntoMaster: false,
    uploaded: false,
    publicRedistributionCleared: false,
    privatePersonalUseOnly: true,
    cutoffInclusive: cutoff,
    output: path.basename(candidatePath),
    rows: rows.length,
    outputBytes: candidateBytes,
    candidateSha256,
    metricId: outputMetric,
    sourceSlug: derivedSource,
    ...candidateSummary,
    sourceInputs: {
      bitviewSeries: inputs.filter((id) => id !== 'supply_btc'),
      supplyMetric: 'supply_btc',
      bitviewSourceSlug: inputSource,
      supplySourceCounts: masterBefore.summary.supplySources,
      bitviewApiDocumentation: 'https://bitview.space/api',
    },
    licenseNote: 'The hosted Bitview metric data have no separate reuse license identified. These rows are for private local research only; public dashboard display and redistribution are not cleared.',
    sourceAttribution: 'Bitcoin Research Kit / Bitview age cohorts and the dashboard supply_btc series, calculated locally; see bitcoin/sql/031_bitview_hodl_waves_private.sql.',
  };
  const catalogNow = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const activeSummary = await summarizeMaster(masterPath, catalogNow);
  if (activeSummary.rows !== expectedRows || activeSummary.metricIds.size !== 162
      || activeSummary.coreMetricIdsWithObservations !== 92 || activeSummary.emptyMetricIds.length !== 42) {
    throw new Error('Der aktive Master-Abdeckungsstand hat sich während des Vorgangs geändert.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.masterSha256 !== expectedSha256 || manifest.observations !== expectedRows) {
    throw new Error('Das bisherige Mastermanifest stimmt nicht mit der Merge-Basis überein.');
  }
  fs.writeFileSync(candidatePath, csv, 'utf8');
  fs.writeFileSync(candidateManifestPath, JSON.stringify(candidateManifest, null, 2) + '\n', 'utf8');

  const originalMaster = fs.readFileSync(masterPath);
  if (sha256(originalMaster) !== expectedSha256) throw new Error('Master-SHA-256 änderte sich während des Vorgangs.');
  fs.copyFileSync(masterPath, backupPath);
  const append = Buffer.from((originalMaster.length && originalMaster[originalMaster.length - 1] === 10 ? '' : '\n') + rows.join('\n') + '\n', 'utf8');
  fs.writeFileSync(masterPath, Buffer.concat([originalMaster, append]));

  const after = await summarizeMaster(masterPath, catalogNow);
  if (after.rows !== expectedRows + rows.length || after.metricIds.size !== 163
      || after.coreMetricIdsWithObservations !== 93 || after.emptyMetricIds.length !== 41
      || after.emptyCoreMetricIds.length !== 7 || after.emptyBitcoinMetricIds.length !== 28) {
    throw new Error('Der zusammengeführte Bitcoin-Master erfüllt die erwarteten Abdeckungszahlen nicht.');
  }
  const masterBytes = fs.statSync(masterPath).size;
  const mergedSha256 = await sha256File(masterPath);
  const mergeRecord = {
    runDate: '2026-09-30',
    cutoffInclusive: cutoff,
    metricId: outputMetric,
    observationsAdded: rows.length,
    seriesCount: bands.length,
    firstDate: candidateSummary.firstObservationDate,
    lastDate: candidateSummary.lastObservationDate,
    candidate: path.basename(candidatePath),
    candidateManifest: path.basename(candidateManifestPath),
    candidateSha256,
    backup: path.basename(backupPath),
    previousMasterSha256: expectedSha256,
    previousMasterBytes: expectedBytes,
    mergedMasterSha256: mergedSha256,
    mergedMasterBytes: masterBytes,
    uploaded: false,
    publicRedistributionCleared: false,
    privatePersonalUseOnly: true,
    noNonBitcoinObservations: true,
    series: candidateSummary.series,
    methodology: candidateSummary.formula,
  };
  candidateManifest.candidateOnly = false;
  candidateManifest.mergedIntoMaster = true;
  candidateManifest.merge = mergeRecord;
  fs.writeFileSync(candidateManifestPath, JSON.stringify(candidateManifest, null, 2) + '\n', 'utf8');

  manifest.generatedAt = '2026-09-30';
  manifest.masterBytes = masterBytes;
  manifest.masterSha256 = mergedSha256;
  manifest.observations = after.rows;
  manifest.metricIdsWithObservations = after.metricIds.size;
  manifest.coreMetricIdsWithObservations = after.coreMetricIdsWithObservations;
  manifest.emptyMetricIds = after.emptyMetricIds.length;
  manifest.emptyCoreMetricIds = after.emptyCoreMetricIds.length;
  manifest.firstObservationDate = after.firstDate;
  manifest.lastObservationDate = after.lastDate;
  manifest.rowsAfterCutoff = after.rowsAfterCutoff;
  manifest.sourceCounts = after.sourceCounts;
  manifest.latestLocalAddition = mergeRecord;
  manifest.scope.remainingEmptyBitcoinMetricIds = after.emptyBitcoinMetricIds;
  manifest.scope.remainingEmptyCoreMetricIds = after.emptyCoreMetricIds;
  manifest.scope.bitviewHodlWaves = {
    candidate: path.basename(candidatePath),
    candidateManifest: path.basename(candidateManifestPath),
    metricId: outputMetric,
    observations: rows.length,
    seriesCount: bands.length,
    rowsPerSeries: 6472,
    firstDate: candidateSummary.firstObservationDate,
    lastDate: candidateSummary.lastObservationDate,
    bitviewInputMetrics: inputs.filter((id) => id !== 'supply_btc'),
    denominatorMetric: 'supply_btc',
    series: candidateSummary.series,
    inputMasterSha256: masterSha256,
    candidateSha256,
    sourceLicense: 'Private local research only; separate hosted-data reuse license not identified.',
    publicRedistributionCleared: false,
    uploaded: false,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    dashboard: 'bitcoin',
    metricId: outputMetric,
    observationsAdded: rows.length,
    series: candidateSummary.series,
    firstDate: candidateSummary.firstObservationDate,
    lastDate: candidateSummary.lastObservationDate,
    masterRows: after.rows,
    metricIdsWithObservations: after.metricIds.size,
    coreMetricIdsWithObservations: after.coreMetricIdsWithObservations,
    emptyMetricIds: after.emptyMetricIds.length,
    emptyBitcoinMetricIds: after.emptyBitcoinMetricIds.length,
    emptyCoreMetricIds: after.emptyCoreMetricIds.length,
    masterBytes,
    masterSha256: mergedSha256,
    backup: path.basename(backupPath),
    candidate: path.basename(candidatePath),
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
