const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const cutoff = process.argv[2];
const outputTag = process.argv[3] || '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '')) {
  console.error('Usage: node tools/derive-bitcoin-market-comparison-candidate.js YYYY-MM-DD [output-tag]');
  process.exit(1);
}
if (outputTag && !/^[a-z0-9-]+$/.test(outputTag)) throw new Error('Output tag may contain only lowercase letters, digits, and hyphens.');

const dashboardRoot = path.resolve(__dirname, '..');
const varDir = path.join(dashboardRoot, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const outputSuffix = outputTag ? '-' + outputTag : '';
const candidatePath = path.join(varDir, 'bitcoin-market-comparison-derived-through-' + cutoff + outputSuffix + '.csv');
const manifestPath = path.join(varDir, 'bitcoin-market-comparison-derived-through-' + cutoff + outputSuffix + '.json');
const sourceSlug = 'derived_bitcoin_market_comparison_research_only';
const start = '2010-01-04';

for (const target of [candidatePath, manifestPath]) {
  if (fs.existsSync(target)) throw new Error('Refusing to overwrite ' + path.basename(target));
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function decimalText(value) {
  if (!Number.isFinite(value)) throw new Error('A derived value is not finite.');
  const rounded = Number(value.toFixed(12));
  let text = rounded.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  if (text === '-0' || text === '') text = '0';
  return text;
}

function parsePositiveNumber(value, context) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Invalid positive price in ' + context);
  return parsed;
}

async function readBitcoinPrices() {
  const prices = new Map();
  const rowHashes = new Map();
  const sourceSlugs = new Set();
  const reader = readline.createInterface({
    input: fs.createReadStream(masterPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let headerSeen = false;
  let futureRows = 0;
  for await (const line of reader) {
    if (!headerSeen) {
      headerSeen = true;
      if (line.replace(/^\uFEFF/, '') !== 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash') {
        throw new Error('Unexpected master header.');
      }
      continue;
    }
    if (!line.startsWith('price_usd,main,')) continue;
    const cells = line.split(',');
    if (cells.length !== 9 || !datePattern.test(cells[2])) throw new Error('Malformed price_usd row.');
    if (cells[2] > cutoff) {
      futureRows++;
      continue;
    }
    if (prices.has(cells[2])) throw new Error('Duplicate BTC price date: ' + cells[2]);
    prices.set(cells[2], parsePositiveNumber(cells[3], cells[2]));
    rowHashes.set(cells[2], sha256(line));
    sourceSlugs.add(cells[4]);
  }
  if (futureRows !== 0) throw new Error('The Bitcoin price master contains rows beyond the requested cutoff.');
  const dates = [...prices.keys()].sort();
  if (dates.length < 5000 || dates.at(-1) !== cutoff) {
    throw new Error('BTC price coverage does not reach the requested cutoff.');
  }
  return { prices, rowHashes, dates, sourceSlugs };
}

async function fetchMarketSeries(metricId) {
  const url = new URL('https://smstark-projekt.de/dashboards/weltmarkt/api/weltmarkt/series.php');
  url.searchParams.set('metric', metricId);
  url.searchParams.set('start', start);
  url.searchParams.set('end', cutoff);
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Market helper API returned HTTP ' + response.status + ' for ' + metricId);
  const payload = await response.json();
  if (!payload.success || payload.metric?.id !== metricId || !Array.isArray(payload.points)) {
    throw new Error('Market helper API returned an invalid ' + metricId + ' response.');
  }
  const values = new Map();
  const revisions = new Map();
  for (const point of payload.points) {
    if (!datePattern.test(point.date) || point.date > cutoff) {
      if (point.date > cutoff) throw new Error(metricId + ' contains a point after the requested cutoff.');
      throw new Error('Invalid date in ' + metricId + ' response.');
    }
    if (values.has(point.date)) throw new Error('Duplicate ' + metricId + ' date: ' + point.date);
    values.set(point.date, parsePositiveNumber(point.value, metricId + ':' + point.date));
    revisions.set(point.date, String(point.revision || 'unknown'));
  }
  if (!values.has(start) || !values.has(cutoff)) {
    throw new Error(metricId + ' source does not cover both ' + start + ' and ' + cutoff + '.');
  }
  return { metricId, url: url.toString(), values, revisions, payload };
}

function seriesHash(values, revisions) {
  const body = [...values.keys()].sort()
    .map((date) => [date, values.get(date), revisions.get(date)].join('|'))
    .join('\n');
  return sha256(body);
}

function correlation(pairs, startIndex, endIndex) {
  const count = endIndex - startIndex + 1;
  let sumBtc = 0;
  let sumMarket = 0;
  let sumBtcSquared = 0;
  let sumMarketSquared = 0;
  let sumProducts = 0;
  for (let index = startIndex; index <= endIndex; index++) {
    const btcReturn = pairs[index].btcReturn;
    const marketReturn = pairs[index].marketReturn;
    sumBtc += btcReturn;
    sumMarket += marketReturn;
    sumBtcSquared += btcReturn * btcReturn;
    sumMarketSquared += marketReturn * marketReturn;
    sumProducts += btcReturn * marketReturn;
  }
  const btcVariance = count * sumBtcSquared - sumBtc * sumBtc;
  const marketVariance = count * sumMarketSquared - sumMarket * sumMarket;
  const denominator = Math.sqrt(btcVariance * marketVariance);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Math.max(-1, Math.min(1, (count * sumProducts - sumBtc * sumMarket) / denominator));
}

function makeReturnPairs(btc, market) {
  const commonDates = btc.dates.filter((date) => market.values.has(date));
  const pairs = [];
  for (let index = 1; index < commonDates.length; index++) {
    const previousDate = commonDates[index - 1];
    const date = commonDates[index];
    const previousBtc = btc.prices.get(previousDate);
    const currentBtc = btc.prices.get(date);
    const previousMarket = market.values.get(previousDate);
    const currentMarket = market.values.get(date);
    pairs.push({
      date,
      previousDate,
      btcReturn: currentBtc / previousBtc - 1,
      marketReturn: currentMarket / previousMarket - 1,
      btcPrevious: previousBtc,
      btcCurrent: currentBtc,
      marketPrevious: previousMarket,
      marketCurrent: currentMarket,
      btcPreviousHash: btc.rowHashes.get(previousDate),
      btcCurrentHash: btc.rowHashes.get(date),
      marketPreviousRevision: market.revisions.get(previousDate),
      marketCurrentRevision: market.revisions.get(date),
    });
  }
  return { commonDates, pairs };
}

function formatSourceRevision(text) {
  return text.replace(/[,\r\n]/g, ';');
}

function buildCandidate(btc, gold, sp500) {
  const output = [];
  const metricDates = new Map();
  const add = (metricId, date, value, revision, rawInput) => {
    const valueString = decimalText(value);
    const sourceRevision = formatSourceRevision(revision);
    const payloadHash = sha256([
      metricId, 'main', date, valueString, sourceSlug, sourceRevision, rawInput,
    ].join('|'));
    output.push([
      metricId, 'main', date, valueString, sourceSlug, '',
      'provisional', sourceRevision, payloadHash,
    ].join(','));
    if (!metricDates.has(metricId)) metricDates.set(metricId, []);
    metricDates.get(metricId).push(date);
  };

  const goldDates = [...gold.values.keys()].sort();
  let goldIndex = 0;
  let lastGold = null;
  for (const date of btc.dates) {
    while (goldIndex < goldDates.length && goldDates[goldIndex] <= date) {
      const goldDate = goldDates[goldIndex++];
      lastGold = {
        date: goldDate,
        value: gold.values.get(goldDate),
        revision: gold.revisions.get(goldDate),
      };
    }
    if (!lastGold) continue;
    const btcPrice = btc.prices.get(date);
    add(
      'btc_gold_ratio',
      date,
      btcPrice / lastGold.value,
      'method:btc-usd-divided-by-gc-f-v1;btc:coinmetrics:' + date + ';gold:' + lastGold.date + ':' + lastGold.revision,
      [btc.rowHashes.get(date), lastGold.date, lastGold.value, lastGold.revision].join('|'),
    );
  }

  const comparisonDefinitions = [
    { market: gold, prefix: 'btc_gold', marketSource: 'Yahoo-GC=F', inputHash: seriesHash(gold.values, gold.revisions) },
    { market: sp500, prefix: 'btc_sp500', marketSource: 'Yahoo-^GSPC', inputHash: seriesHash(sp500.values, sp500.revisions) },
  ];
  const bitcoinInputHash = sha256(btc.dates.map((date) => [
    date, btc.prices.get(date), btc.rowHashes.get(date),
  ].join('|')).join('\n'));

  for (const definition of comparisonDefinitions) {
    const { commonDates, pairs } = makeReturnPairs(btc, definition.market);
    const marketInputHash = definition.inputHash;
    const windows = [
      { suffix: '_corr_90d', days: 90, minimum: 55 },
      { suffix: '_corr_1y', days: 365, minimum: 220 },
    ];
    for (const window of windows) {
      let startIndex = 0;
      for (let endIndex = 0; endIndex < pairs.length; endIndex++) {
        const endDate = pairs[endIndex].date;
        const thresholdDate = new Date(Date.parse(endDate + 'T00:00:00Z') - window.days * 86400000)
          .toISOString().slice(0, 10);
        while (startIndex < endIndex && pairs[startIndex].date <= thresholdDate) startIndex++;
        const count = endIndex - startIndex + 1;
        if (count < window.minimum) continue;
        const value = correlation(pairs, startIndex, endIndex);
        if (value === null) continue;
        const firstDate = pairs[startIndex].date;
        const metricId = definition.prefix + window.suffix;
        add(
          metricId,
          endDate,
          value,
          'method:pearson-simple-returns-' + window.days + '-calendar-days-min' + window.minimum
            + ';market:' + definition.marketSource + ';window:' + firstDate + ':' + endDate,
          [bitcoinInputHash, marketInputHash, firstDate, endDate, count].join('|'),
        );
      }
    }

    if (definition.market.metricId === 'sp500') {
      let baseIndex = -1;
      for (const date of commonDates) {
        const thresholdDate = new Date(Date.parse(date + 'T00:00:00Z') - 365 * 86400000)
          .toISOString().slice(0, 10);
        while (baseIndex + 1 < commonDates.length && commonDates[baseIndex + 1] <= thresholdDate) baseIndex++;
        if (baseIndex < 0) continue;
        const baseDate = commonDates[baseIndex];
        const btcReturn = btc.prices.get(date) / btc.prices.get(baseDate) - 1;
        const sp500Return = sp500.values.get(date) / sp500.values.get(baseDate) - 1;
        const value = (btcReturn - sp500Return) * 100;
        add(
          'btc_sp500_relative_return_1y_pct',
          date,
          value,
          'method:365-calendar-day-simple-return-difference-v1;market:Yahoo-^GSPC;base-common-date:' + baseDate,
          [
            btc.rowHashes.get(baseDate), btc.rowHashes.get(date),
            sp500.values.get(baseDate), sp500.revisions.get(baseDate),
            sp500.values.get(date), sp500.revisions.get(date),
          ].join('|'),
        );
      }
    }
  }

  output.sort((left, right) => {
    const [leftMetric, , leftDate] = left.split(',');
    const [rightMetric, , rightDate] = right.split(',');
    return leftMetric.localeCompare(rightMetric) || leftDate.localeCompare(rightDate);
  });
  const uniqueKeys = new Set();
  for (const line of output) {
    const cells = line.split(',');
    if (cells.length !== 9 || cells[2] > cutoff) throw new Error('Invalid or post-cutoff candidate row.');
    const key = cells[0] + '|' + cells[1] + '|' + cells[2];
    if (uniqueKeys.has(key)) throw new Error('Duplicate candidate point: ' + key);
    uniqueKeys.add(key);
  }

  const metricSummary = {};
  for (const [metricId, dates] of metricDates) {
    dates.sort();
    metricSummary[metricId] = { count: dates.length, first: dates[0], last: dates.at(-1) };
  }
  const expectedMetrics = [
    'btc_gold_ratio',
    'btc_gold_corr_90d',
    'btc_gold_corr_1y',
    'btc_sp500_corr_90d',
    'btc_sp500_corr_1y',
    'btc_sp500_relative_return_1y_pct',
  ];
  for (const metricId of expectedMetrics) {
    if (!metricSummary[metricId] || metricSummary[metricId].last !== cutoff) {
      throw new Error(metricId + ' does not produce a complete candidate through ' + cutoff + '.');
    }
  }
  if (Object.keys(metricSummary).length !== expectedMetrics.length) {
    throw new Error('Candidate contains a metric outside the six Bitcoin comparison metrics.');
  }

  return { output, metricSummary, expectedMetrics, bitcoinInputHash };
}

async function main() {
  const btc = await readBitcoinPrices();
  const [gold, sp500] = await Promise.all([
    fetchMarketSeries('gold'),
    fetchMarketSeries('sp500'),
  ]);
  const { output, metricSummary, expectedMetrics, bitcoinInputHash } = buildCandidate(btc, gold, sp500);
  const csvText = [
    'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash',
    ...output,
    '',
  ].join('\n');
  const csvBuffer = Buffer.from(csvText, 'utf8');
  const candidateSha256 = sha256(csvBuffer);
  const manifest = {
    dashboard: 'bitcoin',
    generatedAt: new Date().toISOString(),
    cutoffInclusive: cutoff,
    candidate: path.basename(candidatePath),
    candidateRows: output.length,
    candidateSha256,
    metricIds: expectedMetrics,
    metrics: metricSummary,
    bitcoinPriceInput: {
      metricId: 'price_usd',
      first: btc.dates[0],
      last: btc.dates.at(-1),
      observations: btc.dates.length,
      sourceSlugs: [...btc.sourceSlugs].sort(),
      seriesSha256: bitcoinInputHash,
    },
    helperInputs: [
      {
        metricId: gold.metricId,
        marketSeries: 'GC=F close',
        first: [...gold.values.keys()].sort()[0],
        last: [...gold.values.keys()].sort().at(-1),
        observations: gold.values.size,
        seriesSha256: seriesHash(gold.values, gold.revisions),
        source: gold.payload.metric.source,
        valuesStoredInBitcoinMaster: false,
      },
      {
        metricId: sp500.metricId,
        marketSeries: '^GSPC close',
        first: [...sp500.values.keys()].sort()[0],
        last: [...sp500.values.keys()].sort().at(-1),
        observations: sp500.values.size,
        seriesSha256: seriesHash(sp500.values, sp500.revisions),
        source: sp500.payload.metric.source,
        valuesStoredInBitcoinMaster: false,
      },
    ],
    methods: {
      btcGoldRatio: 'Daily BTC PriceUSD divided by the latest available GC=F close at or before the Bitcoin date; Gold close carries forward on weekends and market holidays.',
      correlations: 'Pearson correlation of simple daily returns on common market dates; rolling 90 or 365 calendar days, minimum 55 or 220 return pairs; no weekend filling.',
      sp500RelativeReturn: 'BTC simple return minus S&P 500 simple return over 365 calendar days; both use the latest common market date on or before the one-year base date.',
    },
    bitcoinOnlyOutputs: true,
    rawHelperRowsPersisted: false,
    uploaded: false,
    databaseImported: false,
    publicRedistributionCleared: false,
  };
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(candidatePath, csvBuffer, { flag: 'wx' });
  fs.writeFileSync(manifestPath, manifestText, { flag: 'wx' });
  console.log(JSON.stringify({
    candidate: path.relative(dashboardRoot, candidatePath),
    manifest: path.relative(dashboardRoot, manifestPath),
    rows: output.length,
    metrics: metricSummary,
    helperInputs: manifest.helperInputs.map((source) => ({
      metricId: source.metricId,
      first: source.first,
      last: source.last,
      observations: source.observations,
      seriesSha256: source.seriesSha256,
    })),
    candidateSha256,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
