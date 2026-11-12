const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
const ids = JSON.parse(fs.readFileSync(path.join(root, 'data/active-metrics.json'), 'utf8')).metricIds;
const profile = JSON.parse(fs.readFileSync(path.join(root, 'var/bitcoin-core-manifest.json'), 'utf8')).metrics;
const q = (value) => value === null ? 'NULL' : `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
const source = (id) => `(SELECT id FROM bitcoin_data_sources WHERE slug = ${q(id)})`;
const lines = [
  '-- Reviewed active Bitcoin core. Run after migration 045 and before the full core import.',
  '-- This migration changes metadata only; observations are preserved by the importer.',
  'START TRANSACTION;',
  'INSERT INTO bitcoin_data_sources (slug,display_name,provider_type,base_url,license_note,attribution_text,is_active) VALUES',
  `('coinmetrics_community_btc','Coin Metrics Community BTC','public_api','https://docs.coinmetrics.io/api/v4/','CC BY-NC 4.0: non-commercial use, attribution and license notice required.','Coin Metrics Community Data, CC BY-NC 4.0, https://creativecommons.org/licenses/by-nc/4.0/.',1),`,
  `('derived_bitcoin_metrics','Lokal berechnete Bitcoin-Kennzahlen','derived','https://docs.coinmetrics.io/packages/coin-metrics-community-data','Calculations use documented Coin Metrics Community and OBM inputs. Coin Metrics inputs require CC BY-NC 4.0 non-commercial attribution; OBM inputs CC BY 4.0.','Calculated from Coin Metrics Community (CC BY-NC 4.0), Open Bitcoin Metrics by Diego R. Llanos (CC BY 4.0), and ECB reference rates as applicable.',1),`,
  `('ecb_reference_rates','EZB EUR/USD-Referenzkurs','public_api','https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html','ECB public reference rates; preserve attribution and the applicable ECB reuse conditions.','Source: European Central Bank, euro foreign exchange reference rates.',1),`,
  `('cftc_cot_legacy','CFTC Legacy COT, Bitcoin-Futures','public_api','https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm','CFTC government information is public domain under CFTC Web Policy. USD conversion uses Coin Metrics Community under CC BY-NC 4.0.','CFTC Legacy Futures-Only COT; estimated USD notional calculated with Coin Metrics Community daily prices, CC BY-NC 4.0.',1)`,
  'ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),provider_type=VALUES(provider_type),base_url=VALUES(base_url),license_note=VALUES(license_note),attribution_text=VALUES(attribution_text),is_active=VALUES(is_active);',
  '',
  'INSERT INTO bitcoin_metrics (metric_id,source_id,category,display_name,unit,source_hint,source_series,description,methodology_note,native_frequency,observation_kind,calendar_type,expected_start,display_order,is_overview) VALUES',
];
const metrics = ids.map((id) => {
  const metric = catalog.metrics.find((item) => item.id === id);
  const providers = Object.keys(profile[id].sources);
  if (providers.length !== 1) throw new Error(`Ambiguous canonical source for ${id}`);
  const provider = providers[0];
  const hint = provider === 'derived_bitcoin_metrics' ? 'Aus dokumentierten kostenlosen Eingangsreihen berechnet' : metric.sourceHint;
  const series = id === 'difficulty' ? 'obm_difficulty_eod_daily' : id === 'fear_greed_index' ? 'alternative-me-fng-v1' : provider === 'derived_bitcoin_metrics' ? `local:${id}` : id;
  const kind = provider === 'derived_bitcoin_metrics' ? 'derived' : id === 'difficulty' ? 'period_end' : 'point_in_time';
  return { ...metric, provider, hint, sourceSeries: series, kind };
});
metrics.forEach((metric,index) => {
  const values = [q(metric.id), source(metric.provider), q(metric.category), q(metric.label), q(metric.unit), q(metric.hint), q(metric.sourceSeries), q(metric.description), q(metric.description), q(metric.frequency), q(metric.kind), q(metric.frequency === 'weekly' ? 'native_periods' : 'calendar_daily'), q(profile[metric.id].first), String(index+1), catalog.overviewIds.includes(metric.id)?'1':'0'];
  lines.push(`(${values.join(',')})${index===metrics.length-1?'':','}`);
});
lines.push('ON DUPLICATE KEY UPDATE source_id=VALUES(source_id),category=VALUES(category),display_name=VALUES(display_name),unit=VALUES(unit),source_hint=VALUES(source_hint),source_series=VALUES(source_series),description=VALUES(description),methodology_note=VALUES(methodology_note),native_frequency=VALUES(native_frequency),observation_kind=VALUES(observation_kind),calendar_type=VALUES(calendar_type),expected_start=VALUES(expected_start),display_order=VALUES(display_order),is_overview=VALUES(is_overview);');
lines.push('INSERT INTO bitcoin_metric_series (metric_id,series_key,display_name,display_order,native_frequency,calendar_type,expected_start) VALUES');
metrics.forEach((metric,index) => {
  lines.push(`(${q(metric.id)},'main',${q(metric.label)},0,${q(metric.frequency)},${q(metric.frequency==='weekly'?'native_periods':'calendar_daily')},${q(profile[metric.id].first)})${index===metrics.length-1?'':','}`);
});
lines.push('ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),display_order=VALUES(display_order),native_frequency=VALUES(native_frequency),calendar_type=VALUES(calendar_type),expected_start=VALUES(expected_start);');
const rawDefinitions = require('./coinmetrics-format').mappings.map(([field,id]) => ({ id,field,provider:'coinmetrics_community_btc' }));
rawDefinitions.push({id:'fx_usd_per_eur',field:'EXR.D.USD.EUR.SP00.A',provider:'ecb_reference_rates'},
  {id:'transaction_volume_btc',field:'obm_raw_output_value_btc_daily',provider:'open_bitcoin_metrics_obm'},
  {id:'average_coin_dormancy_days',field:'obm_dormancy_days_daily',provider:'open_bitcoin_metrics_obm'});
const internal=rawDefinitions.filter((definition) => !ids.includes(definition.id));
for (const definition of internal) {
  const metric=catalog.metrics.find((item) => item.id===definition.id);
  if (!metric) throw new Error(`Missing internal dependency ${definition.id}`);
  const calendar=definition.id==='fx_usd_per_eur'?'market_weekdays':'calendar_daily';
  lines.push(`INSERT INTO bitcoin_metrics (metric_id,source_id,category,display_name,unit,source_hint,source_series,description,native_frequency,observation_kind,calendar_type,display_order,is_overview) VALUES (${q(metric.id)},${source(definition.provider)},${q(metric.category)},${q(metric.label)},${q(metric.unit)},${q(metric.sourceHint)},${q(definition.field)},${q(metric.description)},'daily','point_in_time',${q(calendar)},500,0) ON DUPLICATE KEY UPDATE source_id=VALUES(source_id),source_series=VALUES(source_series),native_frequency=VALUES(native_frequency),calendar_type=VALUES(calendar_type);`);
  lines.push(`INSERT INTO bitcoin_metric_series (metric_id,series_key,display_name,display_order,native_frequency,calendar_type) VALUES (${q(metric.id)},'main',${q(metric.label)},0,'daily',${q(calendar)}) ON DUPLICATE KEY UPDATE native_frequency=VALUES(native_frequency),calendar_type=VALUES(calendar_type);`);
}
lines.push(`UPDATE bitcoin_metrics SET is_overview=0 WHERE metric_id NOT IN (${ids.map(q).join(',')});`,'COMMIT;','');
fs.writeFileSync(path.join(root, 'sql/046_active_core50.sql'), lines.join('\n'), 'utf8');
console.log(`Generated metadata for 50 active metrics and ${internal.length} internal raw dependencies; no observations changed.`);
