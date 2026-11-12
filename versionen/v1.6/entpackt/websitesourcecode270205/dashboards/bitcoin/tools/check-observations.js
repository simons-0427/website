const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const filename = process.argv[2];
if (!filename) {
  console.error('Aufruf: node tools/check-observations.js <importdatei.csv>');
  process.exit(1);
}
const catalogPath = path.join(__dirname, '..', 'data', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
// Bitcoin's main chain had no blocks on these UTC dates after genesis; on-chain daily values are undefined.
const genesisNoBlockDates = new Set(['2009-01-04', '2009-01-05', '2009-01-06', '2009-01-07', '2009-01-08']);
const metricMetadata = new Map(catalog.metrics.map((metric) => [metric.id, metric]));
const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Import-Header weicht ab.');
const byMetric = new Map();
const bySeries = new Map();
const keys = new Set();
const sourceCounts = new Map();
for (const [index, line] of lines.entries()) {
  const cells = line.split(',');
  const [metric, series, date, value, source, , quality, , hash] = cells;
  if (cells.length !== 9 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/.test(value) || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`Zeile ${index + 2}: Importformat ungültig.`);
  }
  if (!['alternative_me_fng', 'coinmetrics_community_btc', 'ecb_reference_rates', 'derived_bitcoin_metrics', 'derived_bitcoin_market_comparison_research_only', 'derived_blockchain_adjusted_transfer_usd_research_only', 'btc_real_price_cpi', 'derived_bitview_research_metrics', 'open_bitcoin_metrics_obm', 'cftc_cot_legacy', 'uwa_deribit_options_cc_by', 'bykaranteli_crypto_datasets_cc0', 'bykaranteli_etf_flows_cc0', 'bykaranteli_btc_dominance_cc0', 'bykaranteli_btc_liquidations_cc0', 'bykaranteli_btc_options_oi_cc0', 'bykaranteli_btc_futures_basis_cc0', 'bykaranteli_btcusdt_daily_symbols_cc0', 'bykaranteli_btc_options_flow_cc0', 'mempool_space_rest_api', 'mempool_space_statistics_api_research_only', 'mempool_space_historical_research_only', 'mempool_space_pool_hashrate_research_only', 'mempool_space_lightning_research_only', 'openbitcoin_node_api', 'bitview_api_research_only', 'bitcoin_gold_ratio_private', 'bitcoin_etf_holdings_private', 'binance_usdm_public_api', 'binance_coinm_public_api_research_only', 'deribit_public_api', 'blockchain_com_charts_api_research_only', 'farside_bitcoin_etf_flow_research_only', 'btcbench_historical_research_only', 'firsthand_bitcoin_api', 'bitcoinvisuals_lightning_research_only'].includes(source) || quality !== 'provisional') throw new Error('Zeile ' + (index + 2) + ': unerwartete Quelle oder Qualität.');
  const firsthandSeries = new Set([
    'blockchain_size_bytes/firsthand_daily',
    'etf_netflow_usd/firsthand_daily',
    'etf_cumulative_netflow_usd/firsthand_daily',
    'liquidations_long_usd/firsthand_daily',
    'liquidations_short_usd/firsthand_daily',
    'liquidations_usd/firsthand_daily',
    'utxo_count/firsthand_daily',
    'mempool_pending_txs/main',
    'median_confirmation_delay_min/main',
  ]);
  if (source === 'firsthand_bitcoin_api' && !firsthandSeries.has(`${metric}/${series}`)) {
    throw new Error(`Zeile ${index + 2}: Firsthand darf hier nur die freigegebenen Bitcoin-Quellreihen liefern.`);
  }
  sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  const key = `${metric}/${series}/${date}`;
  if (keys.has(key)) throw new Error(`Doppelte Beobachtung: ${key}`);
  keys.add(key);
  if (!byMetric.has(metric)) byMetric.set(metric, []);
  byMetric.get(metric).push(date);
  const seriesKey = `${metric}/${series}`;
  if (!bySeries.has(seriesKey)) bySeries.set(seriesKey, { metric, series, dates: [] });
  bySeries.get(seriesKey).dates.push(date);
}
const report = {};
let hasUnacceptedGap = false;
for (const [metric, dates] of byMetric) {
  dates.sort();
  const spanDays = (Date.parse(`${dates.at(-1)}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`)) / 86_400_000;
  const metadata = metricMetadata.get(metric);
  const metricFrequency = metadata?.frequency || 'unknown';
  const seriesReports = [...bySeries.values()]
    .filter((group) => group.metric === metric)
    .map((group) => {
      const seriesDates = group.dates.sort();
      const seriesSpanDays = (Date.parse(`${seriesDates.at(-1)}T00:00:00Z`) - Date.parse(`${seriesDates[0]}T00:00:00Z`)) / 86_400_000;
      let missingPeriods = 0;
      if (metricFrequency === 'event' || metadata?.calendarType === 'native_periods') {
        missingPeriods = 0;
      } else if (metricFrequency === 'weekly') {
        for (let index = 1; index < seriesDates.length; index++) {
          const gapDays = (Date.parse(seriesDates[index] + 'T00:00:00Z') - Date.parse(seriesDates[index - 1] + 'T00:00:00Z')) / 86_400_000;
          if (gapDays > 10) missingPeriods += Math.max(1, Math.round(gapDays / 7) - 1);
        }
      } else if (metadata?.calendarType === 'business_daily') {
        missingPeriods = seriesDates.some((date, index) => index > 0 && (Date.parse(date + 'T00:00:00Z') - Date.parse(seriesDates[index - 1] + 'T00:00:00Z')) / 86_400_000 > 7) ? 1 : 0;
      } else {
        missingPeriods = seriesSpanDays - seriesDates.length + 1;
        for (const date of genesisNoBlockDates) {
          if (seriesDates[0] <= date && date <= seriesDates.at(-1) && !seriesDates.includes(date)) missingPeriods--;
        }
      }
      if (missingPeriods !== 0 && metadata?.acceptsSourceGaps !== true) hasUnacceptedGap = true;
      return {
        series: group.series,
        count: seriesDates.length,
        first: seriesDates[0],
        last: seriesDates.at(-1),
        missingPeriods,
      };
    });
  const missingPeriods = seriesReports.reduce((total, series) => total + series.missingPeriods, 0);
  report[metric] = {
    count: dates.length, first: dates[0], last: dates.at(-1),
    frequency: metricFrequency,
    calendarType: metadata?.calendarType || 'calendar_daily',
    acceptsSourceGaps: metadata?.acceptsSourceGaps === true,
    seriesCount: seriesReports.length,
    missingPeriods,
    series: seriesReports,
  };
}
const coveredCore = catalog.coreMetricIds.filter((metric) => byMetric.has(metric));
const missingCore = catalog.coreMetricIds.filter((metric) => !byMetric.has(metric));
console.log(JSON.stringify({
  records: lines.length,
  coreCoverage: {
    total: catalog.coreMetricIds.length,
    covered: coveredCore.length,
    missing: missingCore.length,
    missingIds: missingCore,
  },
  sources: Object.fromEntries(sourceCounts),
  metrics: report,
}, null, 2));
if (hasUnacceptedGap) process.exitCode = 2;
