import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';

const bitcoinRoot = path.resolve(import.meta.dirname, '..');
const siteRoot = path.resolve(bitcoinRoot, '..', '..');
const masterPath = path.join(bitcoinRoot, 'var', 'bitcoin-backfill-cointime-cftc-options.csv');
const catalogPath = path.join(bitcoinRoot, 'data', 'catalog.json');
const port = Number(process.argv[2] || 4173);
const host = '127.0.0.1';

if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be an integer between 1024 and 65535.');
if (!fs.existsSync(masterPath) || !fs.existsSync(catalogPath)) throw new Error('Bitcoin master or catalog is missing.');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const sourceNames = {
  coinmetrics_community_btc: 'Coin Metrics Community BTC',
  ecb_reference_rates: 'ECB USD/EUR',
  open_bitcoin_metrics_obm: 'Open Bitcoin Metrics',
  cftc_cot_legacy: 'CFTC Legacy COT',
  uwa_deribit_options_cc_by: 'UWA Deribit Options',
  bykaranteli_crypto_datasets_cc0: 'ByKaranteli Bitcoin-Datensatz',
  mempool_space_rest_api: 'Mempool.space REST API',
  openbitcoin_node_api: 'OpenBitcoin Node API',
  bitview_api_research_only: 'Bitview Bitcoin-only API, private research',
  derived_bitview_research_metrics: 'Lokal aus Bitview abgeleitet',
  derived_bitcoin_metrics: 'Lokal abgeleitete Bitcoin-Kennzahl',
  mempool_space_historical_research_only: 'Mempool.space, private Forschung',
  mempool_space_pool_hashrate_research_only: 'Mempool.space Mining-Pool-Hashrate, private Forschung',
  mempool_space_statistics_api_research_only: 'Mempool.space Statistik-API, private Forschung',
  mempool_space_lightning_research_only: 'Mempool.space Lightning, private Forschung',
  deribit_public_api: 'Deribit BTC DVOL API, private Nutzung',
  bykaranteli_etf_flows_cc0: 'ByKaranteli BTC ETF',
  bykaranteli_btc_dominance_cc0: 'ByKaranteli BTC-Dominanz',
  bykaranteli_btc_liquidations_cc0: 'ByKaranteli BTCUSDT-Liquidationen',
  bykaranteli_btc_options_oi_cc0: 'ByKaranteli BTC-Options-OI',
  bykaranteli_btc_futures_basis_cc0: 'ByKaranteli BTC-Futuresbasis',
  bykaranteli_btcusdt_daily_symbols_cc0: 'ByKaranteli BTCUSDT-Perpetual',
  bykaranteli_btc_options_flow_cc0: 'ByKaranteli BTC-Optionsfluss',
  binance_usdm_public_api: 'Binance USDⓈ-M Futures API, private lokale Forschung',
};

const sourceUrls = {
  coinmetrics_community_btc: 'https://docs.coinmetrics.io/api/v4/',
  open_bitcoin_metrics_obm: 'https://github.com/diegorllanos/open-bitcoin-metrics',
  openbitcoin_node_api: 'https://openbitcoin.com/api',
  bitview_api_research_only: 'https://bitview.space/api',
  mempool_space_rest_api: 'https://mempool.space/docs/api/rest',
  mempool_space_historical_research_only: 'https://mempool.space/docs/api/rest',
  mempool_space_pool_hashrate_research_only: 'https://mempool.space/docs/api/rest',
  mempool_space_statistics_api_research_only: 'https://mempool.space/api/v1/statistics/all',
  binance_usdm_public_api: 'https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data',
  deribit_public_api: 'https://docs.deribit.com/api-reference/market-data/public-get-volatility-index-data',
};
const sumSeriesMetricIds = new Set(['hodl_waves', 'realized_cap_hodl_waves', 'mining_pool_share', 'mining_pool_hashrate_share_pct']);

const seriesDefinitions = {
  mempool_pending_txs: [
    ['main', 'Mempool-Momentaufnahme'],
    ['mempool_statistics_12h_daily_mean', 'Mempool.space 12-Stunden-Statistik, Tagesmittel'],
  ],
  mempool_vsize_mb: [
    ['main', 'Mempool-Momentaufnahme'],
    ['openbitcoin_daily_mean', 'OpenBitcoin-Tagesmittel'],
    ['mempool_statistics_12h_daily_mean', 'Mempool.space 12-Stunden-Statistik, Tagesmittel'],
  ],
  hodl_waves: [
    ['under_1y', '0 bis 1 Jahr'], ['1_to_2y', '1 bis 2 Jahre'], ['2_to_3y', '2 bis 3 Jahre'],
    ['3_to_5y', '3 bis 5 Jahre'], ['5_to_10y', '5 bis 10 Jahre'], ['10y_plus', '10 Jahre und älter'],
  ],
  realized_cap_hodl_waves: [
    ['under_1h', 'Unter 1 Stunde'], ['_1h_to_1d', '1 Stunde bis 1 Tag'], ['_1d_to_1w', '1 Tag bis 1 Woche'],
    ['_1w_to_1m', '1 Woche bis 1 Monat'], ['_1m_to_2m', '1 bis 2 Monate'], ['_2m_to_3m', '2 bis 3 Monate'],
    ['_3m_to_4m', '3 bis 4 Monate'], ['_4m_to_5m', '4 bis 5 Monate'], ['_5m_to_6m', '5 bis 6 Monate'],
    ['_6m_to_9m', '6 bis 9 Monate'], ['_9m_to_1y', '9 Monate bis 1 Jahr'], ['_1y_to_18m', '1 bis 1,5 Jahre'],
    ['_18m_to_2y', '1,5 bis 2 Jahre'], ['_2y_to_3y', '2 bis 3 Jahre'], ['_3y_to_4y', '3 bis 4 Jahre'],
    ['_4y_to_5y', '4 bis 5 Jahre'], ['_5y_to_6y', '5 bis 6 Jahre'], ['_6y_to_7y', '6 bis 7 Jahre'],
    ['_7y_to_8y', '7 bis 8 Jahre'], ['_8y_to_10y', '8 bis 10 Jahre'], ['_10y_to_12y', '10 bis 12 Jahre'],
    ['_12y_to_15y', '12 bis 15 Jahre'], ['over_15y', '15 Jahre und älter'],
  ],
};
seriesDefinitions.binance_perpetual_funding_rate_pct = [
  ['main', 'Binance USDT-M Tagesmittel je Fundingzahlung (%)'],
  ['bykaranteli_daily_snapshot', 'ByKaranteli CC0 Tages-Snapshot'],
];

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else value += character;
  }
  cells.push(value);
  return cells;
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function failure(response, status, code, message) {
  json(response, status, { success: false, error: { code, message } });
}

async function readMasterStats() {
  const stats = new Map();
  let rows = 0;
  const input = readline.createInterface({ input: fs.createReadStream(masterPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let header = true;
  for await (const line of input) {
    if (header) { header = false; continue; }
    if (!line) continue;
    const [id, series, date, value, source, sourceTimestamp, quality] = parseCsvLine(line);
    rows++;
    let metric = stats.get(id);
    if (!metric) {
      metric = { count: 0, first: date, last: date, sources: new Map(), latestMain: null, previousMain: null, dailySums: new Map() };
      stats.set(id, metric);
    }
    metric.count++;
    if (date < metric.first) metric.first = date;
    if (date > metric.last) metric.last = date;
    metric.sources.set(source, (metric.sources.get(source) || 0) + 1);
    if (sumSeriesMetricIds.has(id)) {
      const current = metric.dailySums.get(date) || { value: 0, source };
      current.value += Number(value);
      metric.dailySums.set(date, current);
    }
    if (series === 'main') {
      const point = { date, value, sourceTimestamp, quality, source };
      if (!metric.latestMain || date > metric.latestMain.date) {
        metric.previousMain = metric.latestMain;
        metric.latestMain = point;
      } else if (date < metric.latestMain.date && (!metric.previousMain || date > metric.previousMain.date)) {
        metric.previousMain = point;
      }
    }
  }
  for (const [id, metric] of stats) {
    if (!sumSeriesMetricIds.has(id) || metric.latestMain || metric.dailySums.size === 0) continue;
    const dates = [...metric.dailySums.keys()].sort().reverse();
    const latest = metric.dailySums.get(dates[0]);
    metric.latestMain = { date: dates[0], value: String(latest.value), quality: 'provisional', source: latest.source };
    if (dates[1]) {
      const previous = metric.dailySums.get(dates[1]);
      metric.previousMain = { date: dates[1], value: String(previous.value), quality: 'provisional', source: previous.source };
    }
    delete metric.dailySums;
  }
  return { stats, rows };
}

function makeMetricsPayload(stats) {
  return {
    success: true,
    preview: 'local-master',
    metrics: catalog.metrics.map((metric) => {
      const current = stats.get(metric.id);
      const latest = current?.latestMain || null;
      const previous = current?.previousMain || null;
      const latestSource = latest?.source || current?.sources.keys().next().value || '';
      return {
        id: metric.id,
        category: metric.category,
        label: metric.label,
        unit: metric.unit,
        description: metric.description,
        frequency: metric.frequency,
        status: current?.count ? 'partial' : 'open',
        coverageStart: current?.first || null,
        coverageEnd: current?.last || null,
        observationCount: current?.count || 0,
        methodology: metric.description,
        sourceName: sourceNames[latestSource] || latestSource || metric.sourceHint,
        sourceSlug: latestSource || null,
        sourceUrl: sourceUrls[latestSource] || null,
        attribution: metric.sourceHint || null,
        latestValue: latest?.value ?? null,
        latestDate: latest?.date ?? null,
        latestQuality: latest?.quality ?? null,
        previousValue: previous?.value ?? null,
        previousDate: previous?.date ?? null,
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

async function readSeries(metricId, start, end, stats) {
  const points = [];
  const seriesKeys = new Set();
  const input = readline.createInterface({ input: fs.createReadStream(masterPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let header = true;
  for await (const line of input) {
    if (header) { header = false; continue; }
    if (!line) continue;
    const [id, series, date, value, source, sourceTimestamp, quality] = parseCsvLine(line);
    if (id !== metricId || date < start || date > end) continue;
    seriesKeys.add(series);
    points.push({
      series,
      date,
      value,
      quality,
      sourceTimestamp: sourceTimestamp || null,
      sourceName: sourceNames[source] || source,
      sourceSlug: source,
      sourceUrl: sourceUrls[source] || null,
      attribution: null,
    });
  }
  points.sort((a, b) => a.date.localeCompare(b.date) || a.series.localeCompare(b.series));
  const catalogDefinitions = catalog.metrics.find((metric) => metric.id === metricId)?.series;
  const definitions = catalogDefinitions?.map((series) => [series.key, series.label]) || seriesDefinitions[metricId] || [];
  stats.set(metricId, { ...(stats.get(metricId) || {}), seriesKeys });
  return {
    points,
    series: definitions.length
      ? definitions.map(([series_key, display_name], index) => ({ series_key, display_name, display_order: index + 1 }))
      : [...seriesKeys].sort().map((series_key, index) => ({ series_key, display_name: series_key, display_order: index + 1 })),
  };
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
]);
const staticFiles = new Map([
  ['/dashboards/bitcoin/', path.join(bitcoinRoot, 'index.html')],
  ['/dashboards/bitcoin/index.html', path.join(bitcoinRoot, 'index.html')],
  ['/dashboards/bitcoin/data/catalog.json', catalogPath],
  ['/dashboards/bitcoin/assets/css/bitcoin.css', path.join(bitcoinRoot, 'assets', 'css', 'bitcoin.css')],
  ['/dashboards/bitcoin/assets/js/bitcoin.js', path.join(bitcoinRoot, 'assets', 'js', 'bitcoin.js')],
  ['/dashboards/weltmarkt/assets/vendor/chart.umd.min.js', path.join(siteRoot, 'dashboards', 'weltmarkt', 'assets', 'vendor', 'chart.umd.min.js')],
  ['/assets/site-header.css', path.join(siteRoot, 'assets', 'site-header.css')],
  ['/assets/site-header.js', path.join(siteRoot, 'assets', 'site-header.js')],
]);

const { stats, rows } = await readMasterStats();
const metricsPayload = makeMetricsPayload(stats);

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  if (url.pathname === '/dashboards/bitcoin/api/bitcoin/metrics.php') {
    json(response, 200, metricsPayload);
    return;
  }
  if (url.pathname === '/dashboards/bitcoin/api/bitcoin/series.php') {
    const metricId = String(url.searchParams.get('metric') || '').toLowerCase();
    const metric = catalog.metrics.find((item) => item.id === metricId);
    if (!/^[a-z0-9_]{1,96}$/.test(metricId) || !metric) {
      failure(response, 404, 'METRIC_NOT_FOUND', 'Die Kennzahl ist nicht im lokalen Katalog.');
      return;
    }
    const start = String(url.searchParams.get('start') || stats.get(metricId)?.first || '2009-01-03');
    const end = String(url.searchParams.get('end') || stats.get(metricId)?.last || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      failure(response, 422, 'INVALID_RANGE', 'Start und Ende müssen gültige UTC-Daten sein.');
      return;
    }
    if ((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 > 8000) {
      failure(response, 422, 'RANGE_TOO_LARGE', 'Der angeforderte Zeitraum ist zu groß.');
      return;
    }
    try {
      const { points, series } = await readSeries(metricId, start, end, stats);
      const limit = metricId === 'realized_cap_hodl_waves' ? 200000 : 50000;
      if (points.length > limit) {
        failure(response, 422, 'TOO_MANY_POINTS', 'Bitte einen kürzeren Zeitraum wählen.');
        return;
      }
      json(response, 200, {
        success: true,
        preview: 'local-master',
        metric: { id: metricId, label: metric.label, unit: metric.unit, frequency: metric.frequency },
        range: { start, end },
        series,
        points,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      failure(response, 500, 'PREVIEW_READ_FAILED', error.message);
    }
    return;
  }
  const file = staticFiles.get(url.pathname);
  if (!file || !fs.existsSync(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const stat = fs.statSync(file);
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(path.extname(file)) || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Private Bitcoin master preview: http://${host}:${port}/dashboards/bitcoin/index.html?metric=realized_cap_hodl_waves`);
  console.log(`Loaded ${rows} observations from ${stats.size} metric IDs. Local master file paths are not served.`);
});
