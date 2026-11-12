const fs = require('node:fs');
const path = require('node:path');

const catalogPath = path.join(__dirname, '..', 'data', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const coreMetricIds = [
  'price_usd', 'price_eur', 'market_cap_usd', 'supply_btc', 'return_1d', 'return_7d', 'return_30d', 'return_90d', 'return_ytd_pct', 'return_1y',
  'price_ath_usd', 'drawdown_ath', 'price_sma_200d_usd', 'price_sma_200w_usd', 'realized_volatility_1y', 'realized_cap_usd', 'realized_price_usd', 'mvrv_ratio', 'mvrv_zscore', 'nvt_ratio',
  'nvt_signal', 'nvt_price_usd', 'nvt_premium_pct', 'thermocap_usd', 'market_cap_thermocap_ratio', 'delta_cap_usd', 'investor_cap_usd', 'active_mvrv_ratio', 'vaulted_mvrv_ratio', 'rvt_ratio',
  'sopr', 'asopr', 'sth_sopr', 'lth_sopr', 'nupl_pct', 'relative_unrealized_profit_pct', 'relative_unrealized_loss_pct', 'realized_profit_usd', 'realized_loss_usd', 'net_realized_profit_loss_usd',
  'supply_in_profit_pct', 'supply_in_loss_pct', 'sth_realized_price_usd', 'lth_realized_price_usd', 'sth_mvrv_ratio', 'long_term_holder_supply_btc', 'short_term_holder_supply_btc', 'long_term_holder_supply_pct', 'hodl_supply_1y_btc', 'hodl_supply_2y_btc',
  'hodl_supply_3y_btc', 'hodl_supply_5y_btc', 'hodl_supply_10y_btc', 'hodl_waves', 'realized_cap_hodl_waves', 'coin_days_destroyed', 'binary_coin_days_destroyed', 'average_coin_dormancy_days', 'liveliness', 'average_spent_output_lifespan_days',
  'transactions_count', 'transaction_volume_btc', 'transaction_volume_usd', 'entity_adjusted_transfer_volume_btc', 'active_addresses', 'new_addresses', 'addresses_nonzero_balance', 'mean_transaction_size_btc', 'median_transaction_size_btc', 'utxo_count',
  'utxo_set_size', 'blockchain_size_bytes', 'block_weight_mwu', 'hashrate_eh_s', 'difficulty', 'block_interval_min', 'block_height', 'block_reward_btc', 'issued_btc_daily', 'inflation_rate_pct',
  'miner_revenue_usd', 'miner_fee_revenue_usd', 'fee_share_miner_revenue_pct', 'hashprice_usd_ph_day', 'puell_multiple', 'mempool_pending_txs', 'mempool_vsize_mb', 'mempool_fees_btc', 'fees_median_sat_vb', 'fees_average_usd',
  'fees_total_btc', 'blockspace_utilization_pct', 'exchange_balance_btc', 'exchange_netflow_btc', 'exchange_inflow_btc', 'exchange_outflow_btc', 'futures_open_interest_usd', 'perpetual_funding_rate_pct', 'futures_basis_pct', 'options_iv_30d_pct',
];

const missingMetrics = [
  ['nvt_signal', 'NVT Signal', 'ratio', 'market'],
  ['nvt_price_usd', 'NVT Price', 'USD/BTC', 'market'],
  ['nvt_premium_pct', 'NVT Premium', '%', 'market'],
  ['active_mvrv_ratio', 'Active MVRV', 'ratio', 'market'],
  ['vaulted_mvrv_ratio', 'Vaulted MVRV', 'ratio', 'market'],
  ['rvt_ratio', 'RVT Ratio', 'ratio', 'market'],
  ['asopr', 'aSOPR', 'ratio', 'market'],
  ['sth_sopr', 'STH-SOPR', 'ratio', 'market'],
  ['lth_sopr', 'LTH-SOPR', 'ratio', 'market'],
  ['relative_unrealized_profit_pct', 'Relative Unrealized Profit', '%', 'market'],
  ['relative_unrealized_loss_pct', 'Relative Unrealized Loss', '%', 'market'],
  ['realized_profit_usd', 'Realized Profit', 'USD/day', 'market'],
  ['realized_loss_usd', 'Realized Loss', 'USD/day', 'market'],
  ['net_realized_profit_loss_usd', 'Net Realized Profit/Loss', 'USD/day', 'market'],
  ['supply_in_profit_pct', 'Percent Supply in Profit', '%', 'supply'],
  ['supply_in_loss_pct', 'Percent Supply in Loss', '%', 'supply'],
  ['sth_realized_price_usd', 'STH Realized Price', 'USD/BTC', 'market'],
  ['lth_realized_price_usd', 'LTH Realized Price', 'USD/BTC', 'market'],
  ['sth_mvrv_ratio', 'STH-MVRV', 'ratio', 'market'],
  ['long_term_holder_supply_pct', 'LTH Supply %', '%', 'supply'],
  ['hodl_supply_1y_btc', '1+ Year HODL Supply', 'BTC', 'supply'],
  ['hodl_supply_2y_btc', '2+ Year HODL Supply', 'BTC', 'supply'],
  ['hodl_supply_3y_btc', '3+ Year HODL Supply', 'BTC', 'supply'],
  ['hodl_supply_5y_btc', '5+ Year HODL Supply', 'BTC', 'supply'],
  ['hodl_supply_10y_btc', '10+ Year HODL Supply', 'BTC', 'supply'],
  ['realized_cap_hodl_waves', 'Realized Cap HODL Waves', 'USD by age band', 'supply'],
  ['binary_coin_days_destroyed', 'Binary Coin Days Destroyed', 'index', 'network'],
  ['liveliness', 'Liveliness', 'ratio', 'network'],
  ['average_spent_output_lifespan_days', 'Average Spent Output Lifespan', 'days', 'network'],
  ['transaction_volume_btc', 'Transaction Volume BTC', 'BTC/day', 'network'],
  ['transaction_volume_usd', 'Transaction Volume USD', 'USD/day', 'network'],
  ['entity_adjusted_transfer_volume_btc', 'Entity-Adjusted Transfer Volume', 'BTC/day', 'network'],
  ['new_addresses', 'New Addresses', 'addresses/day', 'network'],
  ['mean_transaction_size_btc', 'Mean Transaction Size', 'BTC/transaction', 'network'],
  ['median_transaction_size_btc', 'Median Transaction Size', 'BTC/transaction', 'network'],
  ['utxo_set_size', 'UTXO Set Size', 'bytes', 'network'],
  ['blockchain_size_bytes', 'Blockchain Size', 'bytes', 'network'],
  ['mempool_fees_btc', 'Mempool Fees', 'BTC', 'fees'],
  ['blockspace_utilization_pct', 'Blockspace Utilization', '%', 'fees'],
  ['fx_usd_per_eur', 'ECB USD per EUR', 'USD/EUR', 'macro'],
  ['transfer_count', 'Transfer Count', 'transfers/day', 'network'],
];

const existingIds = new Set(catalog.metrics.map((metric) => metric.id));
const coreSet = new Set(coreMetricIds);
if (coreMetricIds.length !== 100 || coreSet.size !== 100) throw new Error('The core list must contain exactly 100 distinct metrics.');

for (const id of coreMetricIds) {
  if (existingIds.has(id)) continue;
  const spec = missingMetrics.find(([metricId]) => metricId === id);
  if (!spec) throw new Error(`Missing metadata for core metric ${id}.`);
  const [metricId, label, unit, category] = spec;
  catalog.metrics.push({
    id: metricId,
    label,
    unit,
    category,
    frequency: 'daily',
    sourceHint: 'Quelle und Methodik zu prüfen',
    description: 'Kernkennzahl. Historische Quelle und genaue Definition müssen vor einer Datenfreigabe geprüft werden.',
  });
  existingIds.add(metricId);
}

for (const [metricId, label, unit, category] of missingMetrics) {
  if (existingIds.has(metricId)) continue;
  catalog.metrics.push({
    id: metricId,
    label,
    unit,
    category,
    frequency: 'daily',
    sourceHint: metricId === 'fx_usd_per_eur' ? 'Europäische Zentralbank' : 'Quelle und Methodik zu prüfen',
    description: metricId === 'fx_usd_per_eur'
      ? 'Täglicher Referenzkurs der EZB, angegeben als US-Dollar je Euro; dient zur Umrechnung des BTC/USD-Preises.'
      : 'Unterstützende Reihe. Historische Quelle und genaue Definition müssen vor einer Datenfreigabe geprüft werden.',
  });
  existingIds.add(metricId);
}

catalog.coreMetricIds = coreMetricIds;
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ coreMetrics: coreMetricIds.length, catalogMetrics: catalog.metrics.length, addedMetrics: missingMetrics.length }, null, 2));
