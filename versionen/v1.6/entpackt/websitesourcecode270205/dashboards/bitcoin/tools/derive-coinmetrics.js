const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const [inputArg, outputArg, ...supplementalArgs] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Aufruf: node tools/derive-coinmetrics.js <eingabe.csv> <fertiger-import.csv> [zusatzquelle.csv ...]');
  process.exit(1);
}
const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
if (inputPath === outputPath) throw new Error('Eingabe und Ausgabe müssen verschieden sein.');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
const knownMetrics = new Set(catalog.metrics.map((metric) => metric.id));
const version = 'coinmetrics-local-derivations-v3';
const lines = fs.readFileSync(inputPath, 'utf8').trimEnd().split(/\r?\n/);
if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Ungültiger Import-CSV-Kopf.');

const columnNames = importHeader.split(',');
const column = new Map(columnNames.map((name, index) => [name, index]));
const baseSeries = new Map();
const baseRows = [];
const seen = new Set();
for (const [index, line] of lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== columnNames.length) throw new Error(`CSV-Zeile ${index + 2}: falsche Spaltenzahl.`);
  const metricId = cells[column.get('metric_id')];
  const date = cells[column.get('observation_date')];
  const value = cells[column.get('value')];
  const hash = cells[column.get('raw_payload_hash')];
  if (!/^[a-z0-9_]{1,96}$/.test(metricId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`CSV-Zeile ${index + 2}: ungültige Beobachtung.`);
  }
  const key = `${metricId}/${cells[column.get('series_key')]}/${date}`;
  if (seen.has(key)) throw new Error(`Doppelte Eingabebeobachtung: ${key}`);
  seen.add(key);
  if (metricId !== 'market_cap_usd') baseRows.push(line);
  if (!baseSeries.has(metricId)) baseSeries.set(metricId, new Map());
  baseSeries.get(metricId).set(date, { value: Number(value), hash });
}

const supplementalMetrics = new Set(['difficulty_retarget']);
const supplementalCounts = {};
for (const supplementalArg of supplementalArgs) {
  const supplementalPath = path.resolve(supplementalArg);
  const supplementalLines = fs.readFileSync(supplementalPath, 'utf8').trimEnd().split(/\r?\n/);
  if (supplementalLines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Ungültiger Zusatzimport-Kopf: ${supplementalPath}`);
  for (const [index, line] of supplementalLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== columnNames.length) throw new Error(`CSV-Zeile ${index + 2} in ${supplementalPath}: falsche Spaltenzahl.`);
    const metricId = cells[column.get('metric_id')];
    if (!supplementalMetrics.has(metricId)) continue;
    const date = cells[column.get('observation_date')];
    const value = cells[column.get('value')];
    const hash = cells[column.get('raw_payload_hash')];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`CSV-Zeile ${index + 2} in ${supplementalPath}: ungültige Zusatzbeobachtung.`);
    }
    const key = `${metricId}/${cells[column.get('series_key')]}/${date}`;
    if (seen.has(key)) throw new Error(`Doppelte Zusatzbeobachtung: ${key}`);
    seen.add(key);
    if (!baseSeries.has(metricId)) baseSeries.set(metricId, new Map());
    baseSeries.get(metricId).set(date, { value: Number(value), hash });
    supplementalCounts[metricId] = (supplementalCounts[metricId] || 0) + 1;
  }
}

const derivedSeries = new Map();
const outputRows = [];
const derivedSeen = new Set();
const dateMillis = (date) => Date.parse(`${date}T00:00:00Z`);
const shiftDate = (date, days) => new Date(dateMillis(date) + days * 86_400_000).toISOString().slice(0, 10);
const shiftCalendarYears = (date, years) => {
  const source = new Date(dateMillis(date));
  const year = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
};
const getBase = (metric, date) => baseSeries.get(metric)?.get(date) || null;
const getDerived = (metric, date) => derivedSeries.get(metric)?.get(date) || null;

function formatValue(number) {
  if (!Number.isFinite(number)) return null;
  const rounded = Number(number.toFixed(12));
  if (Object.is(rounded, -0)) return '0';
  const value = rounded.toFixed(12).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
  const whole = value.replace(/^-/, '').split('.')[0];
  if (whole.length > 24) throw new Error(`Wert überschreitet DECIMAL(36,12): ${value}`);
  return value;
}

function emit(metricId, date, number, inputs, formula = version) {
  if (!knownMetrics.has(metricId)) throw new Error(`Kennzahl fehlt im Katalog: ${metricId}`);
  const value = formatValue(number);
  if (value === null) return null;
  const key = `${metricId}/main/${date}`;
  if (derivedSeen.has(key)) throw new Error(`Doppelte abgeleitete Beobachtung: ${key}`);
  derivedSeen.add(key);
  const inputHash = crypto.createHash('sha256').update(inputs.join('\x1f')).digest('hex');
  const hash = crypto.createHash('sha256').update(`${version}\x1f${formula}\x1f${metricId}\x1f${date}\x1f${inputHash}\x1f${value}`).digest('hex');
  const revisionPrefix = version.replace(/^coinmetrics-local-derivations-/, 'derived-');
  const revision = `${revisionPrefix}:${formula}`.slice(0, 128);
  outputRows.push([metricId, 'main', date, value, 'derived_bitcoin_metrics', '', 'provisional', revision, hash].join(','));
  if (!derivedSeries.has(metricId)) derivedSeries.set(metricId, new Map());
  const item = { value: Number(value), hash };
  derivedSeries.get(metricId).set(date, item);
  return item;
}

function contiguousStart(dates) {
  const starts = [];
  for (let i = 0; i < dates.length; i++) {
    starts[i] = i === 0 || dateMillis(dates[i]) - dateMillis(dates[i - 1]) !== 86_400_000 ? i : starts[i - 1];
  }
  return starts;
}

function windowHash(series, start, end) {
  return series.slice(start, end + 1).map((item) => item.hash);
}

const priceMap = baseSeries.get('price_usd') || new Map();
const supplyMap = baseSeries.get('supply_btc') || new Map();
const mvrvMap = baseSeries.get('mvrv_ratio') || new Map();
const priceDates = [...priceMap.keys()].sort();
const priceRun = contiguousStart(priceDates);
const priceSeries = priceDates.map((date) => ({ date, ...priceMap.get(date) }));
let runningAth = 0;
let athChain = '';
let activeYear = '';
let ytdReference = null;

for (let i = 0; i < priceSeries.length; i++) {
  const item = priceSeries[i];
  const year = item.date.slice(0, 4);
  if (year !== activeYear) {
    activeYear = year;
    ytdReference = i > 0 ? priceSeries[i - 1] : null;
  }
  runningAth = Math.max(runningAth, item.value);
  athChain = crypto.createHash('sha256').update(`${athChain}\x1f${item.date}\x1f${item.hash}`).digest('hex');
  emit('price_ath_usd', item.date, runningAth, [athChain], 'running-ath');
  emit('drawdown_ath', item.date, (item.value / runningAth - 1) * 100, [item.hash, athChain], 'distance-from-running-ath');
  emit('sats_per_usd', item.date, 100_000_000 / item.value, [item.hash], 'satoshis-per-usd');

  for (const [days, metricId] of [[1, 'return_1d'], [7, 'return_7d'], [30, 'return_30d'], [90, 'return_90d'], [365, 'return_1y']]) {
    const prior = getBase('price_usd', shiftDate(item.date, -days));
    if (prior && prior.value > 0) emit(metricId, item.date, (item.value / prior.value - 1) * 100, [item.hash, prior.hash], `return-${days}d`);
  }
  const priorThreeYears = getBase('price_usd', shiftCalendarYears(item.date, -3));
  if (priorThreeYears && priorThreeYears.value > 0) {
    const threeYearReturn = item.value / priorThreeYears.value;
    emit('return_3y', item.date, (threeYearReturn - 1) * 100, [item.hash, priorThreeYears.hash], 'return-exact-three-calendar-years');
    emit('cagr_3y_pct', item.date, (threeYearReturn ** (1 / 3) - 1) * 100, [item.hash, priorThreeYears.hash], 'geometric-annualized-return-exact-three-calendar-years');
  }
  if (ytdReference && ytdReference.value > 0) emit('return_ytd_pct', item.date, (item.value / ytdReference.value - 1) * 100, [item.hash, ytdReference.hash], 'year-to-date');

  if (i - priceRun[i] + 1 >= 200) {
    const start = i - 199;
    const average = priceSeries.slice(start, i + 1).reduce((sum, row) => sum + row.value, 0) / 200;
    const sma = emit('price_sma_200d_usd', item.date, average, windowHash(priceSeries, start, i), 'sma-200-calendar-days');
    if (sma && sma.value > 0) emit('mayer_multiple', item.date, item.value / sma.value, [item.hash, sma.hash], 'price-divided-by-200-day-sma');
  }
  for (const [days, metricId] of [[30, 'volatility_30d'], [90, 'volatility_90d'], [365, 'realized_volatility_1y']]) {
    if (i - priceRun[i] < days) continue;
    const start = i - days;
    const returns = [];
    for (let j = start + 1; j <= i; j++) returns.push(Math.log(priceSeries[j].value / priceSeries[j - 1].value));
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
    const inputs = windowHash(priceSeries, start, i);
    emit(metricId, item.date, Math.sqrt(variance) * Math.sqrt(365) * 100, inputs, `annualized-log-return-volatility-${days}d`);
  }
}

for (let i = 0; i < priceSeries.length; i++) {
  const item = priceSeries[i];
  const runLength = i - priceRun[i] + 1;
  if (runLength >= 365) {
    const start = i - 364;
    const window = priceSeries.slice(start, i + 1);
    let high = 0;
    let maxDrawdown = 0;
    for (const row of window) {
      high = Math.max(high, row.value);
      maxDrawdown = Math.min(maxDrawdown, (row.value / high - 1) * 100);
    }
    emit('max_drawdown_1y_pct', item.date, maxDrawdown, window.map((row) => row.hash), 'maximum-peak-to-trough-drawdown-over-trailing-365-prices');
  }
  if (runLength < 366) continue;
  const returnStart = i - 364;
  const returns = [];
  for (let j = returnStart; j <= i; j++) {
    const previous = priceSeries[j - 1];
    const current = priceSeries[j];
    returns.push({ value: current.value / previous.value - 1, hashes: [previous.hash, current.hash] });
  }
  const windowHashes = windowHash(priceSeries, i - 365, i);
  const best = Math.max(...returns.map((row) => row.value));
  const worst = Math.min(...returns.map((row) => row.value));
  emit('best_day_return_1y_pct', item.date, best * 100, windowHashes, 'maximum-simple-daily-return-over-365-consecutive-returns');
  emit('worst_day_return_1y_pct', item.date, worst * 100, windowHashes, 'minimum-simple-daily-return-over-365-consecutive-returns');

  const mean = returns.reduce((sum, row) => sum + row.value, 0) / returns.length;
  const variance = returns.reduce((sum, row) => sum + (row.value - mean) ** 2, 0) / returns.length;
  const standardDeviation = Math.sqrt(variance);
  if (standardDeviation > 0) emit('sharpe_1y', item.date, mean / standardDeviation * Math.sqrt(365), windowHashes, 'annualized-sharpe-zero-risk-free-rate-365-daily-returns');
  const downsideVariance = returns.reduce((sum, row) => sum + Math.min(row.value, 0) ** 2, 0) / returns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  if (downsideDeviation > 0) emit('sortino_1y', item.date, mean / downsideDeviation * Math.sqrt(365), windowHashes, 'annualized-sortino-zero-target-rate-365-daily-returns');
}

const weeklyCloses = priceSeries.filter((item) => new Date(`${item.date}T00:00:00Z`).getUTCDay() === 0);
for (let i = 199; i < weeklyCloses.length; i++) {
  if (dateMillis(weeklyCloses[i].date) - dateMillis(weeklyCloses[i - 1].date) !== 7 * 86_400_000) continue;
  const window = weeklyCloses.slice(i - 199, i + 1);
  if (window.some((item, index) => index > 0 && dateMillis(item.date) - dateMillis(window[index - 1].date) !== 7 * 86_400_000)) continue;
  const average = window.reduce((sum, row) => sum + row.value, 0) / 200;
  emit('price_sma_200w_usd', weeklyCloses[i].date, average, window.map((row) => row.hash), 'sma-200-weekly-sunday-closes');
}

const marketCapSeries = [];
for (const date of [...new Set([...priceMap.keys(), ...supplyMap.keys()])].sort()) {
  const price = getBase('price_usd', date);
  const supply = getBase('supply_btc', date);
  if (!price || !supply) continue;
  const marketCap = emit('market_cap_usd', date, price.value * supply.value, [price.hash, supply.hash], 'price-times-circulating-supply');
  marketCapSeries.push({ date, ...marketCap });
}

const realizedByDate = new Map();
let count = 0;
let meanCap = 0;
let m2Cap = 0;
let cumulativeCapHash = '';
for (const cap of marketCapSeries) {
  count++;
  const delta = cap.value - meanCap;
  meanCap += delta / count;
  m2Cap += delta * (cap.value - meanCap);
  cumulativeCapHash = crypto.createHash('sha256').update(`${cumulativeCapHash}\x1f${cap.date}\x1f${cap.hash}`).digest('hex');
  const std = count > 1 ? Math.sqrt(m2Cap / count) : 0;
  const mvrv = getBase('mvrv_ratio', cap.date);
  if (mvrv && mvrv.value > 0) {
    const realized = emit('realized_cap_usd', cap.date, cap.value / mvrv.value, [cap.hash, mvrv.hash], 'market-cap-divided-by-mvrv');
    const supply = getBase('supply_btc', cap.date);
    if (realized) {
      realizedByDate.set(cap.date, realized);
      if (supply && supply.value > 0) emit('realized_price_usd', cap.date, realized.value / supply.value, [realized.hash, supply.hash], 'realized-cap-divided-by-supply');
      emit('nupl_pct', cap.date, (cap.value - realized.value) / cap.value * 100, [cap.hash, realized.hash], 'net-unrealized-profit-loss');
      if (std > 0) emit('mvrv_zscore', cap.date, (cap.value - realized.value) / std, [cumulativeCapHash, realized.hash], 'cumulative-population-standard-deviation-of-market-cap');
      emit('delta_cap_usd', cap.date, realized.value - meanCap, [cumulativeCapHash, realized.hash], 'realized-cap-minus-cumulative-average-cap');
    }
  }
}

const fxMap = baseSeries.get('fx_usd_per_eur') || new Map();
const fxDates = [...fxMap.keys()].sort();
let fxCursor = 0;
for (const date of priceDates) {
  while (fxCursor + 1 < fxDates.length && fxDates[fxCursor + 1] <= date) fxCursor++;
  const price = getBase('price_usd', date);
  const fxDate = fxDates[fxCursor];
  const fx = fxDate && fxDate <= date && dateMillis(date) - dateMillis(fxDate) <= 7 * 86_400_000 ? getBase('fx_usd_per_eur', fxDate) : null;
  if (price && fx && fx.value > 0) emit('price_eur', date, price.value / fx.value, [price.hash, fx.hash, fxDate], 'usd-price-divided-by-ecb-usd-per-eur');
}

const blockDates = [...(baseSeries.get('blocks_count') || new Map()).keys()].sort();
let cumulativeHeight = 0;
let heightAvailable = blockDates.length > 0;
let previousBlockDate = null;
const satoshisPerBitcoin = 100_000_000n;
const subsidyAtHeight = (height) => Number((50n * satoshisPerBitcoin) >> BigInt(Math.floor(height / 210_000))) / 100_000_000;
const issuanceSatoshis = (firstHeight, lastHeight) => {
  let total = 0n;
  let start = firstHeight;
  while (start <= lastHeight) {
    const era = Math.floor(start / 210_000);
    const end = Math.min(lastHeight, (era + 1) * 210_000 - 1);
    const rewardSatoshis = (50n * satoshisPerBitcoin) >> BigInt(era);
    total += BigInt(end - start + 1) * rewardSatoshis;
    start = end + 1;
  }
  return Number(total) / 100_000_000;
};
for (const date of blockDates) {
  const blocks = getBase('blocks_count', date);
  if (previousBlockDate && dateMillis(date) - dateMillis(previousBlockDate) !== 86_400_000) heightAvailable = false;
  previousBlockDate = date;
  if (!blocks || !Number.isInteger(blocks.value) || blocks.value < 0) {
    heightAvailable = false;
    continue;
  }
  if (!heightAvailable) continue;
  const firstHeight = cumulativeHeight + 1;
  cumulativeHeight += blocks.value;
  const heightInput = [blocks.hash, firstHeight === 1 ? 'coinmetrics-block-counts-from-genesis-offset-0' : getDerived('block_height', shiftDate(date, -1))?.hash || 'previous-height-unavailable'];
  if (blocks.value > 0) {
    const height = emit('block_height', date, cumulativeHeight, heightInput, 'cumulative-coinmetrics-block-count-from-genesis-offset-0');
    const issuance = issuanceSatoshis(firstHeight, cumulativeHeight);
    emit('issued_btc_daily', date, issuance, [blocks.hash, height?.hash || heightInput[1]], 'bitcoin-consensus-subsidy-sum-by-block-height');
    emit('block_reward_btc', date, subsidyAtHeight(cumulativeHeight), [height?.hash || heightInput[1]], 'bitcoin-consensus-subsidy-at-daily-final-height');
    const currentHeight = height?.value;
    if (Number.isInteger(currentHeight) && currentHeight > 0) {
      const adjustmentEpoch = Math.floor((currentHeight - 1) / 2016);
      const halvingEpoch = Math.floor(currentHeight / 210_000);
      emit('blocks_until_adjustment', date, (adjustmentEpoch + 1) * 2016 - currentHeight + 1, [height.hash], 'blocks-until-next-2016-block-boundary');
      emit('blocks_until_halving', date, (halvingEpoch + 1) * 210_000 - currentHeight, [height.hash], 'bitcoin-protocol-blocks-until-next-halving-v2');
    }
  }
  // Difficulty main is supplied by OBM; the former mean estimate remains archived.
}

let cycleEpoch = null;
let cycleHigh = 0;
let cycleHighChain = '';
for (const date of priceDates) {
  const price = getBase('price_usd', date);
  const height = getDerived('block_height', date);
  if (!price || !height || !Number.isInteger(height.value) || height.value < 1) continue;
  const epoch = Math.floor((height.value - 1) / 210_000);
  if (epoch !== cycleEpoch) {
    cycleEpoch = epoch;
    cycleHigh = 0;
    cycleHighChain = '';
  }
  if (price.value >= cycleHigh) cycleHigh = price.value;
  cycleHighChain = crypto.createHash('sha256').update(`${cycleHighChain}\x1f${date}\x1f${price.hash}`).digest('hex');
  emit('drawdown_cycle_pct', date, (price.value / cycleHigh - 1) * 100, [height.hash, cycleHighChain], 'drawdown-since-maximum-price-in-current-210000-block-subsidy-epoch');
}

let thermocap = 0;
let thermocapChain = '';
let thermocapValid = true;
let thermocapStarted = false;
const dailyIssuanceUsd = [];
const allDates = [...new Set([
  ...priceMap.keys(),
  ...(baseSeries.get('supply_btc') || new Map()).keys(),
  ...(baseSeries.get('fees_total_btc') || new Map()).keys(),
  ...(baseSeries.get('blocks_count') || new Map()).keys(),
  ...(baseSeries.get('transactions_count') || new Map()).keys(),
  ...(baseSeries.get('hashrate_eh_s') || new Map()).keys(),
])].sort();
for (const date of allDates) {
  const price = getBase('price_usd', date);
  const issuance = getDerived('issued_btc_daily', date);
  const fees = getBase('fees_total_btc', date);
  const supply = getBase('supply_btc', date);
  if (issuance && supply && supply.value > 0) emit('inflation_rate_pct', date, issuance.value / supply.value * 365 * 100, [issuance.hash, supply.hash], 'annualized-daily-issuance-over-circulating-supply');
  if (issuance && fees) {
    const minerRevenueBtc = emit('miner_revenue_btc', date, issuance.value + fees.value, [issuance.hash, fees.hash], 'issuance-plus-transaction-fees');
    if (minerRevenueBtc) {
      const feeShare = minerRevenueBtc.value > 0 ? fees.value / minerRevenueBtc.value * 100 : 0;
      emit('fee_share_miner_revenue_pct', date, feeShare, [fees.hash, issuance.hash], 'fees-divided-by-total-miner-revenue');
      emit('fee_revenue_share_pct', date, feeShare, [fees.hash, issuance.hash], 'same-formula-as-fee-share-miner-revenue');
    }
    const blockCount = getBase('blocks_count', date);
    if (blockCount && blockCount.value > 0) emit('block_interval_min', date, 1440 / blockCount.value, [blockCount.hash], 'utc-day-minutes-divided-by-block-count-estimate');
    if (minerRevenueBtc && price && getBase('transactions_count', date)?.value > 0) {
      const totalFeeUsd = emit('fees_total_usd', date, fees.value * price.value, [fees.hash, price.hash], 'btc-fees-times-daily-usd-price');
      emit('miner_fee_revenue_usd', date, fees.value * price.value, [fees.hash, price.hash], 'btc-fees-times-daily-usd-price');
      const minerRevenueUsd = emit('miner_revenue_usd', date, minerRevenueBtc.value * price.value, [minerRevenueBtc.hash, price.hash], 'btc-miner-revenue-times-daily-usd-price');
      if (totalFeeUsd) emit('fees_average_usd', date, totalFeeUsd.value / getBase('transactions_count', date).value, [totalFeeUsd.hash, getBase('transactions_count', date).hash], 'daily-usd-fees-divided-by-transactions');
      const hashrate = getBase('hashrate_eh_s', date);
      if (hashrate && hashrate.value > 0 && minerRevenueUsd) emit('hashprice_usd_ph_day', date, minerRevenueUsd.value / (hashrate.value * 1000), [minerRevenueUsd.hash, hashrate.hash], 'usd-revenue-per-ph-s-per-day');
    }
  }
  if (price && issuance) {
    const issuanceUsd = issuance.value * price.value;
    dailyIssuanceUsd.push({ date, value: issuanceUsd, hash: crypto.createHash('sha256').update(`${issuance.hash}\x1f${price.hash}`).digest('hex') });
    if (!thermocapStarted) thermocapStarted = true;
    if (thermocapValid) {
      thermocap += issuanceUsd;
      thermocapChain = crypto.createHash('sha256').update(`${thermocapChain}\x1f${date}\x1f${issuance.hash}\x1f${price.hash}`).digest('hex');
      const cap = getDerived('market_cap_usd', date);
      const realized = realizedByDate.get(date);
      const thermo = emit('thermocap_usd', date, thermocap, [thermocapChain], 'coinbase-issuance-times-daily-usd-price-since-first-price');
      if (cap && thermo && thermo.value > 0) emit('market_cap_thermocap_ratio', date, cap.value / thermo.value, [cap.hash, thermo.hash], 'market-cap-divided-by-thermocap');
      if (realized && thermo) emit('investor_cap_usd', date, realized.value - thermo.value, [realized.hash, thermo.hash], 'realized-cap-minus-thermocap');
    }
  } else if (thermocapStarted) {
      thermocapValid = false;
}
}

for (const date of [...(baseSeries.get('transactions_count') || new Map()).keys()].sort()) {
  const txs = getBase('transactions_count', date);
  const blocks = getBase('blocks_count', date);
  if (txs && blocks && blocks.value > 0) emit('transactions_per_block', date, txs.value / blocks.value, [txs.hash, blocks.hash], 'daily-transactions-divided-by-daily-blocks');
}

const issuanceRun = contiguousStart(dailyIssuanceUsd.map((row) => row.date));
for (let i = 0; i < dailyIssuanceUsd.length; i++) {
  if (i - issuanceRun[i] + 1 < 365) continue;
  const start = i - 364;
  const window = dailyIssuanceUsd.slice(start, i + 1);
  const average = window.reduce((sum, row) => sum + row.value, 0) / window.length;
  if (average > 0) emit('puell_multiple', dailyIssuanceUsd[i].date, dailyIssuanceUsd[i].value / average, window.map((row) => row.hash), 'daily-issuance-usd-over-365-day-average');
}

for (let i = 6; i < blockDates.length; i++) {
  if (dateMillis(blockDates[i]) - dateMillis(blockDates[i - 6]) !== 6 * 86_400_000) continue;
  const window = blockDates.slice(i - 6, i + 1).map((date) => getBase('blocks_count', date));
  if (window.some((item) => !item)) continue;
  const total = window.reduce((sum, item) => sum + item.value, 0);
  if (total > 0) emit('block_interval_7d_min', blockDates[i], 10080 / total, window.map((item) => item.hash), 'seven-day-minutes-divided-by-block-count-estimate');
}

const inflowMap = baseSeries.get('exchange_inflow_btc') || new Map();
const outflowMap = baseSeries.get('exchange_outflow_btc') || new Map();
for (const date of [...inflowMap.keys()].filter((date) => outflowMap.has(date)).sort()) {
  const inflow = getBase('exchange_inflow_btc', date);
  const outflow = getBase('exchange_outflow_btc', date);
  emit('exchange_netflow_btc', date, inflow.value - outflow.value, [inflow.hash, outflow.hash], 'exchange-inflow-minus-outflow');
}

const retargetMap = baseSeries.get('difficulty_retarget') || new Map();
const retargetDates = [...retargetMap.keys()].sort();
for (let i = 1; i < retargetDates.length; i++) {
  const prior = getBase('difficulty_retarget', retargetDates[i - 1]);
  const current = getBase('difficulty_retarget', retargetDates[i]);
  if (!prior || !current || prior.value <= 0) continue;
  emit('difficulty_change_pct', current.date || retargetDates[i], (current.value / prior.value - 1) * 100,
    [prior.hash, current.hash], 'openbitcoin-difficulty-retarget-percent-change');
}

const out = [importHeader, ...baseRows, ...outputRows].join('\n') + '\n';
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, out, 'utf8');
console.log(JSON.stringify({
  inputRows: lines.length,
  copiedRawRows: baseRows.length,
  derivedRows: outputRows.length,
  derivedMetrics: [...derivedSeries.keys()].sort(),
  supplementalRows: supplementalCounts,
  firstPriceDate: priceDates[0] || null,
  lastPriceDate: priceDates.at(-1) || null,
  output: outputPath,
}, null, 2));
