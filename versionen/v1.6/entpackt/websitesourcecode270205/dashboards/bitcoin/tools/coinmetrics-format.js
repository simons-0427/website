const crypto = require('node:crypto');

const mappings = [
  ['AdrActCnt', 'active_addresses'],
  ['TxCnt', 'transactions_count'],
  ['TxTfrCnt', 'transfer_count'],
  ['BlkCnt', 'blocks_count'],
  ['SplyCur', 'supply_btc'],
  ['FeeTotNtv', 'fees_total_btc'],
  ['PriceUSD', 'price_usd'],
  ['CapMrktEstUSD', 'market_cap_estimated_usd'],
  ['CapMVRVCur', 'mvrv_ratio'],
  ['AdrBalCnt', 'addresses_nonzero_balance'],
  ['FlowInExNtv', 'exchange_inflow_btc'],
  ['FlowOutExNtv', 'exchange_outflow_btc'],
  ['FlowInExUSD', 'exchange_inflow_usd'],
  ['FlowOutExUSD', 'exchange_outflow_usd'],
  ['SplyExUSD', 'exchange_balance_usd'],
  ['HashRate', 'hashrate_eh_s', '0.000001'],
  ['SplyExNtv', 'exchange_balance_btc'],
  ['IssTotUSD', 'issued_usd_daily'],
  ['SplyExpFut10yr', 'projected_supply_10y_btc'],
  ['volume_reported_spot_usd_1d', 'spot_volume_usd'],
];

const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';

function normalizeDecimal(raw, multiplier = '1') {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(raw)) throw new Error(`Ungültiger Dezimalwert: ${raw}`);
  const [integer, fraction = ''] = raw.split('.');
  const scale = 1_000_000_000_000n;
  let scaled = BigInt(integer) * scale + BigInt(fraction.slice(0, 12).padEnd(12, '0'));
  if (fraction.length > 12 && fraction[12] >= '5') scaled++;
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(multiplier)) throw new Error(`Ungültiger Skalierungsfaktor: ${multiplier}`);
  if (multiplier !== '1') {
    const [factorWhole, factorFraction = ''] = multiplier.split('.');
    const factorDigits = BigInt(factorWhole + factorFraction);
    const divisor = 10n ** BigInt(factorFraction.length);
    scaled = (scaled * factorDigits + divisor / 2n) / divisor;
  }
  const whole = scaled / scale;
  if (whole.toString().length > 24) throw new Error(`Wert außerhalb von DECIMAL(36,12): ${raw}`);
  const decimals = (scaled % scale).toString().padStart(12, '0').replace(/0+$/, '');
  return decimals ? `${whole}.${decimals}` : whole.toString();
}

function observationRow(date, field, metric, raw, channel = 'csv', multiplier = '1', sourceSlug = 'coinmetrics_community_btc') {
  const value = normalizeDecimal(raw, multiplier);
  const hashSource = sourceSlug === 'coinmetrics_community_btc' ? `coinmetrics-btc-${channel}` : `${sourceSlug}-${channel}`;
  const hash = crypto.createHash('sha256').update(`${hashSource}\x1f${date}\x1f${field}\x1f${raw}`).digest('hex');
  const revisionPrefix = sourceSlug === 'ecb_reference_rates' ? 'ecb' : 'btc';
  return [metric, 'main', date, value, sourceSlug, '', 'provisional', `${revisionPrefix}-${channel}:${date}`, hash].join(',');
}

module.exports = { mappings, importHeader, normalizeDecimal, observationRow };
