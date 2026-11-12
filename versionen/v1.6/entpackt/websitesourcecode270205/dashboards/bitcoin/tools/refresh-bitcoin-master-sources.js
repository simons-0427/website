const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { once } = require('node:events');

const [cutoff, ...candidateArgs] = process.argv.slice(2);
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const allowedSources = new Set([
  'coinmetrics_community_btc',
  'ecb_reference_rates',
  'open_bitcoin_metrics_obm',
  'openbitcoin_node_api',
  'cftc_cot_legacy',
  'derived_bitcoin_metrics',
  'derived_bitview_research_metrics',
  'derived_bitcoin_market_comparison_research_only',
  'derived_blockchain_adjusted_transfer_usd_research_only',
  'btc_real_price_cpi',
  'bitview_api_research_only',
  'binance_usdm_public_api',
  'binance_coinm_public_api_research_only',
  'deribit_public_api',
  'mempool_space_statistics_api_research_only',
  'mempool_space_historical_research_only',
  'mempool_space_pool_hashrate_research_only',
  'mempool_space_lightning_research_only',
  'bitcoinvisuals_lightning_research_only',
  'farside_bitcoin_etf_flow_research_only',
  'btcbench_historical_research_only',
  'firsthand_bitcoin_api',
]);
const approvedSourceOverrides = new Map([
  ['supply_btc\x1fmain\x1f2026-09-28\x1fopenbitcoin_node_api\x1fcoinmetrics_community_btc', {
    rationale: 'The daily main series follows Coin Metrics SplyCur. OpenBitcoin stats24h allTime.supplySat is a UTXO-sweep snapshot plus issuance since that snapshot, so it is a distinct point-in-time measure and does not replace the daily end-of-day series.',
  }],
]);

if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '') || candidateArgs.length === 0) {
  console.error('Usage: node tools/refresh-bitcoin-master-sources.js YYYY-MM-DD <candidate.csv> [candidate.csv ...]');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const runDate = new Date().toISOString().slice(0, 10);
const runStamp = new Date().toISOString().replace(/[.:]/g, '-');
const suffix = `source-refresh-${runStamp}`;
const backupPath = path.join(varDir, `bitcoin-backfill-cointime-cftc-options-before-${suffix}.csv`);
const manifestBackupPath = path.join(varDir, `manifest-before-${suffix}.json`);
const nextMasterPath = `${masterPath}.source-refresh.next`;
const nextManifestPath = `${manifestPath}.source-refresh.next`;
const keyOf = (cells) => `${cells[0]}\x1f${cells[1]}\x1f${cells[2]}`;

function validateRow(line, filename, lineNumber, metricIds, limitCutoff = true) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error(`${filename}, row ${lineNumber}: expected 9 columns.`);
  const [metric, series, date, value, source, , quality, , hash] = cells;
  if (!/^[a-z0-9_]{1,96}$/.test(metric) || !metricIds.has(metric)
    || !/^[a-z0-9_]{1,96}$/.test(series)
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    || !/^[a-z0-9_]{1,96}$/.test(source)
    || !['provisional', 'validated'].includes(quality)
    || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`${filename}, row ${lineNumber}: invalid observation.`);
  }
  if (limitCutoff && date > cutoff) throw new Error(`${filename}, row ${lineNumber}: date ${date} is after cutoff ${cutoff}.`);
  return cells;
}

function decimalQuotient(value, divisor, precision = 12) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || !/^\d+$/.test(divisor) || BigInt(divisor) <= 0n) {
    throw new Error('Invalid decimal input for Bitcoin Visuals capacity-per-node derivation.');
  }
  const fraction = match[2] || '';
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(`${match[1]}${fraction}`) * (10n ** BigInt(precision));
  const denominator = scale * BigInt(divisor);
  const rounded = (numerator + denominator / 2n) / denominator;
  const digits = rounded.toString().padStart(precision + 1, '0');
  const whole = digits.slice(0, -precision);
  const decimal = digits.slice(-precision).replace(/0+$/, '');
  return decimal ? `${whole}.${decimal}` : whole;
}

async function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function collectCandidates(metricIds) {
  const byKey = new Map();
  const files = [];
  const candidateMetricCounts = {};
  let candidateRows = 0;
  let discardedAfterCutoff = 0;

  for (const arg of candidateArgs) {
    const filename = path.resolve(arg);
    const reader = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
    let first = true;
    let lineNumber = 0;
    let includedRows = 0;
    let afterCutoff = 0;
    const sourceCounts = {};
    const metricCounts = {};
    for await (const line of reader) {
      lineNumber++;
      if (first) {
        first = false;
        if (line.replace(/^\uFEFF/, '') !== header) throw new Error(`${filename}: unexpected CSV header.`);
        continue;
      }
      if (!line) continue;
      const rawCells = line.split(',');
      if (rawCells.length !== 9) throw new Error(`${filename}, row ${lineNumber}: expected 9 columns.`);
      if (rawCells[2] > cutoff) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawCells[2])) throw new Error(`${filename}, row ${lineNumber}: invalid date.`);
        afterCutoff++;
        continue;
      }
      const cells = validateRow(line, filename, lineNumber, metricIds);
      if (!allowedSources.has(cells[4])) throw new Error(`${filename}, row ${lineNumber}: source ${cells[4]} is outside the Bitcoin refresh scope.`);
      if (cells[4] === 'ecb_reference_rates' && cells[0] !== 'fx_usd_per_eur') {
        throw new Error(`${filename}, row ${lineNumber}: ECB may only supply the BTC/EUR helper rate.`);
      }
      if (cells[4] === 'derived_bitview_research_metrics'
        && !(cells[0] === 'long_term_holder_supply_pct' && cells[1] === 'main')) {
        throw new Error(`${filename}, row ${lineNumber}: Bitview-derived refreshes may only update long_term_holder_supply_pct in its main series.`);
      }
      if (cells[4] === 'binance_usdm_public_api'
        && !(
          (cells[0] === 'binance_perpetual_funding_rate_pct' && cells[1] === 'main')
          || (cells[0] === 'perpetual_open_interest_change_24h_pct' && cells[1] === 'binance_usdm_btcusdt')
        )) {
        throw new Error('Binance USD-M may only supply the Bitcoin funding main series and the separate BTCUSDT open-interest series.');
      }
      if (cells[4] === 'binance_coinm_public_api_research_only'
        && !(cells[0] === 'futures_basis_pct' && cells[1] === 'binance_coinm_current_quarter')) {
        throw new Error(`${filename}, row ${lineNumber}: Binance COIN-M research may only supply the separate Bitcoin quarterly-futures-basis series.`);
      }
      if (cells[4] === 'derived_bitcoin_market_comparison_research_only'
        && !(
          [
            'btc_gold_ratio',
            'btc_gold_corr_90d',
            'btc_gold_corr_1y',
            'btc_sp500_corr_90d',
            'btc_sp500_corr_1y',
            'btc_sp500_relative_return_1y_pct',
          ].includes(cells[0])
          && cells[1] === 'main'
        )) {
        throw new Error('Yahoo-derived comparison input may only create the six Bitcoin comparison metrics in their main series.');
      }
      if (cells[4] === 'derived_blockchain_adjusted_transfer_usd_research_only'
        && (cells[0] !== 'adjusted_transfer_value_usd' || cells[1] !== 'main')) {
        throw new Error('Blockchain.com-derived transfer value may only create adjusted_transfer_value_usd in its main series.');
      }
      if (cells[4] === 'deribit_public_api'
        && (cells[0] !== 'options_iv_30d_pct' || cells[1] !== 'main')) {
        throw new Error('Deribit public API data may only refresh the Bitcoin DVOL main series.');
      }
      if (cells[4] === 'farside_bitcoin_etf_flow_research_only'
        && (cells[0] !== 'etf_netflow_usd' || cells[1] !== 'main')) {
        throw new Error(`${filename}, row ${lineNumber}: Farside may only supply the Bitcoin ETF net-flow main series.`);
      }
      if (cells[4] === 'btcbench_historical_research_only'
        && !(
          (cells[0] === 'fee_recommendation_fast_sat_vb' && cells[1] === 'main')
          || (cells[0] === 'fee_recommendation_economy_sat_vb' && cells[1] === 'main')
        )) {
        throw new Error(`${filename}, row ${lineNumber}: BTCBench may only supply the separate historical Bitcoin fast- and economy-fee series.`);
      }
      if (cells[4] === 'firsthand_bitcoin_api'
        && !new Set([
          'blockchain_size_bytes/firsthand_daily',
          'etf_netflow_usd/firsthand_daily',
          'etf_cumulative_netflow_usd/firsthand_daily',
          'liquidations_long_usd/firsthand_daily',
          'liquidations_short_usd/firsthand_daily',
          'liquidations_usd/firsthand_daily',
          'utxo_count/firsthand_daily',
          'mempool_pending_txs/main',
          'median_confirmation_delay_min/main',
        ]).has(`${cells[0]}/${cells[1]}`)) {
        throw new Error(`${filename}, row ${lineNumber}: Firsthand may only supply the listed separate Bitcoin series.`);
      }
      if (cells[4] === 'bitcoinvisuals_lightning_research_only'
        && (cells[1] !== 'bitcoinvisuals_node'
          || !new Set([
            'lightning_capacity_btc',
            'lightning_channels',
            'lightning_nodes',
            'lightning_median_channel_btc',
            'lightning_avg_channel_btc',
            'lightning_capacity_change_30d_pct',
            'lightning_channels_change_30d_pct',
            'lightning_capacity_per_node_btc',
          ]).has(cells[0]))) {
        throw new Error(`${filename}, row ${lineNumber}: Bitcoin Visuals research is restricted to its Bitcoin node Lightning series.`);
      }
      if (cells[4] === 'mempool_space_statistics_api_research_only'
        && !(
          (cells[0] === 'mempool_min_fee_sat_vb' && cells[1] === 'main')
          || (['mempool_pending_txs', 'mempool_vsize_mb'].includes(cells[0])
            && cells[1] === 'mempool_statistics_12h_daily_mean')
        )) {
        throw new Error(`${filename}, row ${lineNumber}: Mempool historical statistics are outside the approved Bitcoin minimum-fee, pending-transaction, and vsize series.`);
      }
      if (cells[4] === 'mempool_space_historical_research_only'
        && !['fees_p10_sat_vb', 'fees_p90_sat_vb'].includes(cells[0])) {
        throw new Error(`${filename}, row ${lineNumber}: Mempool historical research is outside the approved Bitcoin metric scope.`);
      }
      if (cells[4] === 'mempool_space_pool_hashrate_research_only'
        && cells[0] !== 'mining_pool_hashrate_share_pct') {
        throw new Error(`${filename}, row ${lineNumber}: Mempool pool-hashrate research may only supply the Bitcoin weekly pool-share metric.`);
      }
      if (cells[0] === 'mining_pool_hashrate_share_pct'
        && (cells[4] !== 'mempool_space_pool_hashrate_research_only' || cells[1] === 'main')) {
        throw new Error(`${filename}, row ${lineNumber}: weekly mining-pool hashrate shares require a named Mempool pool series.`);
      }
      if (cells[0] === 'pool_hashrate_concentration_hhi'
        && (cells[4] !== 'derived_bitcoin_metrics' || cells[1] !== 'main')) {
        throw new Error(`${filename}, row ${lineNumber}: weekly hashrate-pool concentration must be the main derived Bitcoin series.`);
      }
      const key = keyOf(cells);
      if (byKey.has(key)) throw new Error(`Candidate files overlap at ${cells[0]}/${cells[1]}/${cells[2]}.`);
      byKey.set(key, line);
      includedRows++;
      candidateRows++;
      sourceCounts[cells[4]] = (sourceCounts[cells[4]] || 0) + 1;
      metricCounts[cells[0]] = (metricCounts[cells[0]] || 0) + 1;
      candidateMetricCounts[cells[0]] = (candidateMetricCounts[cells[0]] || 0) + 1;
    }
    if (first) throw new Error(`${filename}: CSV is empty.`);
    discardedAfterCutoff += afterCutoff;
    files.push({
      path: path.relative(varDir, filename).replaceAll('\\', '/'),
      sha256: await hashFile(filename),
      includedRows,
      rowsAfterCutoff: afterCutoff,
      sourceCounts,
      metricCounts,
    });
  }
  let derivedBitcoinVisualsLightning = null;
  const bitcoinVisualsRows = [...byKey.values()]
    .filter((line) => line.split(',')[4] === 'bitcoinvisuals_lightning_research_only')
    .map((line) => line.split(','));
  if (bitcoinVisualsRows.length) {
    const capacities = new Map();
    const nodes = new Map();
    for (const cells of bitcoinVisualsRows) {
      if (cells[1] !== 'bitcoinvisuals_node') throw new Error('Bitcoin Visuals Lightning input has an unexpected series key.');
      if (cells[0] === 'lightning_capacity_btc') capacities.set(cells[2], cells);
      if (cells[0] === 'lightning_nodes') nodes.set(cells[2], cells);
    }
    const dates = [...nodes.keys()].sort();
    const derivedDates = [];
    let missingCapacityDays = 0;
    let inputDateGapDays = 0;
    for (let index = 1; index < dates.length; index++) {
      const previous = Date.parse(`${dates[index - 1]}T00:00:00Z`);
      const current = Date.parse(`${dates[index]}T00:00:00Z`);
      inputDateGapDays += Math.max(0, Math.round((current - previous) / 86400000) - 1);
    }
    for (const date of dates) {
      const capacity = capacities.get(date);
      const nodeCount = nodes.get(date);
      if (!capacity) {
        missingCapacityDays++;
        continue;
      }
      if (!/^\d+$/.test(nodeCount[3]) || BigInt(nodeCount[3]) <= 0n) {
        throw new Error(`Bitcoin Visuals has a zero or invalid node count on ${date}.`);
      }
      if (capacity[5] !== nodeCount[5]) throw new Error(`Bitcoin Visuals input timestamps differ on ${date}.`);
      const formula = 'lightning_capacity_btc / lightning_nodes';
      const identity = JSON.stringify({ formula, date, inputRows: [capacity, nodeCount] });
      const row = [
        'lightning_capacity_per_node_btc',
        'bitcoinvisuals_node',
        date,
        decimalQuotient(capacity[3], nodeCount[3]),
        'bitcoinvisuals_lightning_research_only',
        capacity[5],
        'provisional',
        `bitcoinvisuals-derived-v2:capacity-per-node:${date}`,
        crypto.createHash('sha256').update(identity, 'utf8').digest('hex'),
      ].join(',');
      const cells = row.split(',');
      const key = keyOf(cells);
      if (byKey.has(key)) throw new Error(`Bitcoin Visuals capacity-per-node candidate overlaps an input at ${key}.`);
      byKey.set(key, row);
      candidateRows++;
      candidateMetricCounts[cells[0]] = (candidateMetricCounts[cells[0]] || 0) + 1;
      derivedDates.push(date);
    }
    derivedBitcoinVisualsLightning = {
      metricId: 'lightning_capacity_per_node_btc',
      seriesKey: 'bitcoinvisuals_node',
      sourceSlug: 'bitcoinvisuals_lightning_research_only',
      formula: 'lightning_capacity_btc / lightning_nodes',
      observations: derivedDates.length,
      firstObservationDate: derivedDates[0] || null,
      lastObservationDate: derivedDates.at(-1) || null,
      inputRows: { capacity: capacities.size, nodes: nodes.size },
      inputDateGapDays,
      missingCapacityDays,
      interpolatedDays: 0,
      qualityStatus: 'provisional',
      publicRedistributionCleared: false,
      uploaded: false,
    };
  }
  return { byKey, files, candidateRows, candidateMetricCounts, discardedAfterCutoff, derivedBitcoinVisualsLightning };
}

function newSummary(catalog) {
  return {
    rows: 0,
    bytes: 0,
    metricIds: new Set(),
    coreMetricIds: new Set(),
    sourceCounts: {},
    firstDate: null,
    lastDate: null,
    rowsAfterCutoff: 0,
    keys: new Set(),
    metricIdsList: new Set(catalog.metrics.map((metric) => metric.id)),
  };
}

function addToSummary(line, filename, rowNumber, catalog, summary) {
  const cells = validateRow(line, filename, rowNumber, summary.metricIdsList, false);
  const key = keyOf(cells);
  if (summary.keys.has(key)) throw new Error(`Duplicate master observation ${cells[0]}/${cells[1]}/${cells[2]}.`);
  summary.keys.add(key);
  summary.rows++;
  summary.metricIds.add(cells[0]);
  if (catalog.coreMetricIds.includes(cells[0])) summary.coreMetricIds.add(cells[0]);
  summary.sourceCounts[cells[4]] = (summary.sourceCounts[cells[4]] || 0) + 1;
  if (!summary.firstDate || cells[2] < summary.firstDate) summary.firstDate = cells[2];
  if (!summary.lastDate || cells[2] > summary.lastDate) summary.lastDate = cells[2];
  if (cells[2] > cutoff) summary.rowsAfterCutoff++;
}

async function main() {
  for (const filename of [masterPath, manifestPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error(`Required file is missing: ${filename}`);
  }
  for (const filename of [backupPath, manifestBackupPath, nextMasterPath, nextManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite an existing file: ${filename}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const metricIds = new Set(catalog.metrics.map((metric) => metric.id));
  const currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (currentManifest.cutoffInclusive !== cutoff) throw new Error(`Manifest cutoff is ${currentManifest.cutoffInclusive}, not ${cutoff}.`);
  const candidates = await collectCandidates(metricIds);
  if (candidates.candidateRows === 0) throw new Error('No candidate observations are within the cutoff.');

  const beforeRows = currentManifest.observations;
  const beforeHash = await hashFile(masterPath);
  const beforeBytes = fs.statSync(masterPath).size;
  const summary = newSummary(catalog);
  const updatedRows = { total: 0, rowsRefreshed: 0, valuesChanged: 0, valuesAlreadyIdentical: 0, metrics: {} };
  const sourceConflicts = {};
  const resolvedSourceOverrides = [];
  let additions = [];
  const output = fs.createWriteStream(nextMasterPath, { flags: 'wx', encoding: 'utf8' });
  const write = async (line) => {
    addToSummary(line, nextMasterPath, summary.rows + 1, catalog, summary);
    if (!output.write(`${line}\n`)) await once(output, 'drain');
  };

  try {
    const reader = readline.createInterface({ input: fs.createReadStream(masterPath), crlfDelay: Infinity });
    let first = true;
    let lineNumber = 0;
    for await (const line of reader) {
      lineNumber++;
      if (first) {
        first = false;
        if (line.replace(/^\uFEFF/, '') !== header) throw new Error('Active master has an unexpected CSV header.');
        if (!output.write(`${header}\n`)) await once(output, 'drain');
        continue;
      }
      if (!line) continue;
      const oldCells = validateRow(line, masterPath, lineNumber, metricIds, false);
      const key = keyOf(oldCells);
      const candidate = candidates.byKey.get(key);
      if (candidate) {
        const candidateCells = candidate.split(',');
        candidates.byKey.delete(key);
        if (oldCells[4] === candidateCells[4]) {
          updatedRows.total++;
          if (line !== candidate) updatedRows.rowsRefreshed++;
          if (oldCells[3] !== candidateCells[3]) updatedRows.valuesChanged++;
          else updatedRows.valuesAlreadyIdentical++;
          updatedRows.metrics[oldCells[0]] = (updatedRows.metrics[oldCells[0]] || 0) + 1;
          await write(candidate);
          continue;
        }
        const overrideKey = `${oldCells[0]}\x1f${oldCells[1]}\x1f${oldCells[2]}\x1f${oldCells[4]}\x1f${candidateCells[4]}`;
        const override = approvedSourceOverrides.get(overrideKey);
        if (override) {
          updatedRows.total++;
          if (line !== candidate) updatedRows.rowsRefreshed++;
          if (oldCells[3] !== candidateCells[3]) updatedRows.valuesChanged++;
          else updatedRows.valuesAlreadyIdentical++;
          updatedRows.metrics[oldCells[0]] = (updatedRows.metrics[oldCells[0]] || 0) + 1;
          resolvedSourceOverrides.push({
            metricId: oldCells[0],
            seriesKey: oldCells[1],
            observationDate: oldCells[2],
            previousSource: oldCells[4],
            selectedSource: candidateCells[4],
            previousValue: oldCells[3],
            selectedValue: candidateCells[3],
            rationale: override.rationale,
          });
          await write(candidate);
          continue;
        }
        sourceConflicts[oldCells[0]] = (sourceConflicts[oldCells[0]] || 0) + 1;
      }
      await write(line);
    }
    if (first) throw new Error('Active master is empty.');

    additions = [...candidates.byKey.values()].sort((left, right) => {
      const a = left.split(',');
      const b = right.split(',');
      return a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]);
    });
    for (const line of additions) await write(line);
    output.end();
    await once(output, 'close');
  } catch (error) {
    output.destroy();
    if (fs.existsSync(nextMasterPath)) fs.unlinkSync(nextMasterPath);
    throw error;
  }

  summary.bytes = fs.statSync(nextMasterPath).size;
  if (summary.rowsAfterCutoff !== 0 || summary.lastDate > cutoff) {
    fs.unlinkSync(nextMasterPath);
    throw new Error(`Prepared master includes ${summary.rowsAfterCutoff} rows after cutoff.`);
  }
  const newHash = await hashFile(nextMasterPath);
  const populated = [...summary.metricIds].sort();
  const corePopulated = [...summary.coreMetricIds].sort();
  const empty = [...metricIds].filter((id) => !summary.metricIds.has(id)).sort();
  const emptyCore = catalog.coreMetricIds.filter((id) => !summary.coreMetricIds.has(id)).sort();
  const refreshRecord = {
    runDate,
    cutoffInclusive: cutoff,
    previousMasterRows: beforeRows,
    previousMasterBytes: beforeBytes,
    previousMasterSha256: beforeHash,
    candidateRowsThroughCutoff: candidates.candidateRows,
    observationsUpdated: updatedRows.total,
    rowsRefreshed: updatedRows.rowsRefreshed,
    valuesChanged: updatedRows.valuesChanged,
    valuesAlreadyIdentical: updatedRows.valuesAlreadyIdentical,
    observationsAdded: additions.length,
    candidatesSkippedForDifferentSource: Object.values(sourceConflicts).reduce((sum, count) => sum + count, 0),
    skippedDifferentSourceByMetric: sourceConflicts,
    resolvedSourceOverrides,
    metricsUpdated: updatedRows.metrics,
    discardedCandidateRowsAfterCutoff: candidates.discardedAfterCutoff,
    candidateFiles: candidates.files,
    masterRows: summary.rows,
    masterBytes: summary.bytes,
    masterSha256: newHash,
    metricIdsWithObservations: populated.length,
    coreMetricIdsWithObservations: corePopulated.length,
    emptyMetricIds: empty.length,
    emptyMetricIdList: empty,
    emptyCoreMetricIds: emptyCore.length,
    emptyCoreMetricIdList: emptyCore,
    firstObservationDate: summary.firstDate,
    lastObservationDate: summary.lastDate,
    rowsAfterCutoff: summary.rowsAfterCutoff,
    sourceCounts: summary.sourceCounts,
    generatedDerivedRows: candidates.derivedBitcoinVisualsLightning,
    bitcoinOnly: true,
    ecbUsdPerEurUsedOnlyAsBitcoinEurHelper: true,
    uploaded: false,
    publicRedistributionCleared: false,
  };

  const manifest = {
    ...currentManifest,
    generatedAt: runDate,
    masterBytes: summary.bytes,
    masterSha256: newHash,
    observations: summary.rows,
    metricIdsWithObservations: populated.length,
    catalogMetricIds: catalog.metrics.length,
    coreMetricIdsWithObservations: corePopulated.length,
    emptyMetricIds: empty.length,
    emptyMetricIdList: empty,
    emptyCoreMetricIds: emptyCore.length,
    emptyCoreMetricIdList: emptyCore,
    firstObservationDate: summary.firstDate,
    lastObservationDate: summary.lastDate,
    rowsAfterCutoff: summary.rowsAfterCutoff,
    sourceCounts: summary.sourceCounts,
    latestSourceRefresh: refreshRecord,
    sourceRefreshHistory: [...(currentManifest.sourceRefreshHistory || []), refreshRecord],
  };
  if (manifest.scope) {
    manifest.scope.remainingEmptyCoreMetricIds = emptyCore;
    const standaloneMacroMetricIds = new Set([
      'usd_index_dxy',
      'gold_usd_oz',
      'sp500_index',
      'nasdaq100_index',
      'us_10y_yield_pct',
      'fed_funds_rate_pct',
    ]);
    const emptyBitcoin = catalog.metrics
      .filter((metric) => !standaloneMacroMetricIds.has(metric.id) && !summary.metricIds.has(metric.id))
      .map((metric) => metric.id)
      .sort();
    manifest.scope.remainingEmptyBitcoinMetricIds = emptyBitcoin.length;
    manifest.scope.remainingEmptyBitcoinMetricIdList = emptyBitcoin;
    manifest.scope.emptyBitcoinMetricScope = 'Catalog metrics with no observations, excluding standalone macro-only metrics; Bitcoin comparison metrics remain in scope. Recalculated from the current master and catalog.';
    manifest.scope.sourceRefresh = {
      candidateRowsThroughCutoff: candidates.candidateRows,
      observationsUpdated: updatedRows.total,
      observationsAdded: additions.length,
      skippedForDifferentSource: refreshRecord.candidatesSkippedForDifferentSource,
      candidateFiles: candidates.files.map((file) => file.path),
      generatedDerivedRows: candidates.derivedBitcoinVisualsLightning,
    };
    const weeklyPoolMetricIds = ['mining_pool_hashrate_share_pct', 'pool_hashrate_concentration_hhi'];
    const weeklyPoolCandidateCounts = Object.fromEntries(weeklyPoolMetricIds
      .filter((id) => candidates.candidateMetricCounts[id])
      .map((id) => [id, candidates.candidateMetricCounts[id]]));
    if (Object.keys(weeklyPoolCandidateCounts).length) {
      const weeklyPoolAddedCounts = {};
      for (const line of additions) {
        const metricId = line.split(',')[0];
        if (weeklyPoolMetricIds.includes(metricId)) {
          weeklyPoolAddedCounts[metricId] = (weeklyPoolAddedCounts[metricId] || 0) + 1;
        }
      }
      const mergedCounts = Object.fromEntries(weeklyPoolMetricIds.map((id) => [
        id,
        (updatedRows.metrics[id] || 0) + (weeklyPoolAddedCounts[id] || 0),
      ]));
      const remainingByMetric = Object.fromEntries(weeklyPoolMetricIds.map((id) => [
        id,
        Math.max(0, (weeklyPoolCandidateCounts[id] || 0) - mergedCounts[id]),
      ]));
      const remainingIds = weeklyPoolMetricIds.filter((id) => remainingByMetric[id] > 0);
      manifest.scope.privateResearchCandidateRowsOutsideMaster = Object.values(remainingByMetric)
        .reduce((sum, count) => sum + count, 0);
      manifest.scope.privateResearchCandidateMetricIdsOutsideMaster = remainingIds.length;
      manifest.scope.privateResearchCandidateMetricIdListOutsideMaster = remainingIds;
      manifest.scope.privateResearchCandidatePoolHashrateMerge = {
        runDate,
        cutoffInclusive: cutoff,
        candidateRowsByMetric: weeklyPoolCandidateCounts,
        mergedRowsByMetric: mergedCounts,
        rowsOutsideMasterByMetric: remainingByMetric,
        source: 'Mempool.space public Bitcoin mining-pool hashrate endpoint and local HHI calculation',
        researchOnly: true,
        dataReuseLicenseConfirmed: false,
        publicRedistributionCleared: false,
        uploaded: false,
      };
    }
    const privateImportManifestPath = path.join(varDir, 'mempool-private-bitcoin-dashboard-research-through-2026-09-28.json');
    if (fs.existsSync(privateImportManifestPath)) {
      manifest.scope.privateMempoolDashboardImport = JSON.parse(fs.readFileSync(privateImportManifestPath, 'utf8'));
    }
  }
  if (candidates.derivedBitcoinVisualsLightning && manifest.bitcoinVisualsLightningResearch) {
    manifest.bitcoinVisualsLightningResearch.derivedSeries = candidates.derivedBitcoinVisualsLightning;
    const note = 'Derived Bitcoin Visuals Lightning capacity per node as a separate research-only series from same-day public capacity and node counts. Missing input days were not interpolated; public redistribution remains uncleared and no database or STRATO import was performed.';
    if (!manifest.qualityNotes.includes(note)) manifest.qualityNotes.push(note);
  }
  fs.writeFileSync(nextManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });

  try {
    fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(manifestPath, manifestBackupPath, fs.constants.COPYFILE_EXCL);
    fs.renameSync(nextMasterPath, masterPath);
    fs.renameSync(nextManifestPath, manifestPath);
    if (await hashFile(masterPath) !== newHash || fs.statSync(masterPath).size !== summary.bytes) {
      throw new Error('Promoted master does not match the prepared hash and size.');
    }
  } catch (error) {
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, masterPath);
    if (fs.existsSync(manifestBackupPath)) fs.copyFileSync(manifestBackupPath, manifestPath);
    for (const filename of [nextMasterPath, nextManifestPath]) {
      if (fs.existsSync(filename)) fs.unlinkSync(filename);
    }
    throw error;
  }

  console.log(JSON.stringify({
    dashboard: 'bitcoin',
    cutoffInclusive: cutoff,
    candidateRowsThroughCutoff: candidates.candidateRows,
    observationsUpdated: updatedRows.total,
    rowsRefreshed: updatedRows.rowsRefreshed,
    valuesChanged: updatedRows.valuesChanged,
    valuesAlreadyIdentical: updatedRows.valuesAlreadyIdentical,
    observationsAdded: additions.length,
    candidatesSkippedForDifferentSource: refreshRecord.candidatesSkippedForDifferentSource,
    skippedDifferentSourceByMetric: sourceConflicts,
    resolvedSourceOverrides,
    discardedCandidateRowsAfterCutoff: candidates.discardedAfterCutoff,
    rows: summary.rows,
    metricIdsWithObservations: populated.length,
    coreMetricIdsWithObservations: corePopulated.length,
    emptyMetricIds: empty.length,
    emptyCoreMetricIds: empty.length ? emptyCore : [],
    firstObservationDate: summary.firstDate,
    lastObservationDate: summary.lastDate,
    rowsAfterCutoff: summary.rowsAfterCutoff,
    sourceCounts: summary.sourceCounts,
    masterBytes: summary.bytes,
    masterSha256: newHash,
    backup: path.basename(backupPath),
    manifestBackup: path.basename(manifestBackupPath),
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
