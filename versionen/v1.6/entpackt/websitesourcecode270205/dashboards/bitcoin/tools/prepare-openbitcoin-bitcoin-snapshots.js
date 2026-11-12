const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const snapshotDate = '2026-09-29';
const csvPath = path.join(varDir, `openbitcoin-bitcoin-snapshots-${snapshotDate}-import.csv`);
const manifestPath = path.join(varDir, `openbitcoin-bitcoin-snapshots-${snapshotDate}-manifest.json`);
const migrationPath = path.join(root, 'sql', '013_openbitcoin_bitcoin_only_snapshots.sql');

function readSnapshot(name) {
  const filename = path.join(varDir, `${name}-${snapshotDate}.json`);
  const bytes = fs.readFileSync(filename);
  return { filename, bytes, hash: sha256(bytes), data: JSON.parse(bytes.toString('utf8')) };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function decimal(value) {
  if (!Number.isFinite(value)) throw new Error(`Ungültiger Zahlenwert: ${value}`);
  return value.toFixed(12).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function utcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error(`Ungültiger UTC-Zeitstempel: ${value}`);
  }
  return value.replace(/\.\d{3}Z$/, 'Z');
}

function csvRow(metric, series, date, value, source, timestamp, revision, hash) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Ungültiges UTC-Datum: ${date}`);
  return [metric, series, date, decimal(value), source, timestamp, 'provisional', revision.slice(0, 128), hash].join(',');
}

const poolsFile = readSnapshot('pools');
const fearFile = readSnapshot('fear-greed');
const feesFile = readSnapshot('fees');
const mempoolFile = readSnapshot('mempool');
const pools = poolsFile.data;
const fearGreed = fearFile.data;
const fees = feesFile.data;
const mempool = mempoolFile.data;
const poolsAsOf = utcTimestamp(pools.asOf);
const fearAsOf = utcTimestamp(fearGreed.asOf);
const feesAsOf = utcTimestamp(fees.asOf);
const mempoolAsOf = utcTimestamp(mempool.asOf);

if (![poolsAsOf, fearAsOf, feesAsOf, mempoolAsOf].every((time) => time.slice(0, 10) === snapshotDate)) {
  throw new Error('Mindestens ein OpenBitcoin-Snapshot liegt nicht am erwarteten UTC-Tag.');
}
if (!Array.isArray(pools.pools) || pools.pools.length === 0 || !pools.unknown || !Number.isSafeInteger(pools.unknown.b7d)) {
  throw new Error('OpenBitcoin /pools hat ein unerwartetes Antwortschema.');
}
if (!Array.isArray(fearGreed.history) || fearGreed.history.length < 2 || typeof fearGreed.method !== 'string' || !fearGreed.method.includes('own price data')) {
  throw new Error('OpenBitcoin /fear-greed hat keine dokumentierte Bitcoin-Preisreihe.');
}
if (!Number.isFinite(fees.fastest) || !Number.isFinite(fees.economy) || !Number.isFinite(mempool.minFeerate)) {
  throw new Error('OpenBitcoin fee snapshot enthält keinen gültigen Empfehlungs- oder Mindestgebührensatz.');
}

const seriesKeys = new Set();
const poolRows = [];
let identifiedBlocks7d = 0;
for (const pool of pools.pools) {
  if (typeof pool.slug !== 'string' || typeof pool.name !== 'string' || !Number.isSafeInteger(pool.b7d) || pool.b7d < 0) {
    throw new Error('OpenBitcoin /pools enthält einen ungültigen Pooldatensatz.');
  }
  const seriesKey = `pool_${pool.slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
  if (!/^pool_[a-z0-9_]{1,90}$/.test(seriesKey) || seriesKeys.has(seriesKey)) throw new Error(`Ungültiger oder doppelter Pool-Schlüssel: ${seriesKey}`);
  seriesKeys.add(seriesKey);
  identifiedBlocks7d += pool.b7d;
  poolRows.push({ pool, seriesKey });
}
if (identifiedBlocks7d <= 0) throw new Error('OpenBitcoin /pools meldet keine identifizierten Blöcke im 7-Tage-Fenster.');

const lines = [];
const poolRowHashes = [];
for (const { pool, seriesKey } of poolRows) {
  const sharePct = pool.b7d / identifiedBlocks7d * 100;
  const rowHash = sha256(`openbitcoin-pool-share-v1\x1f${poolsFile.hash}\x1f${seriesKey}\x1f${pool.b7d}\x1f${identifiedBlocks7d}`);
  poolRowHashes.push(rowHash);
  lines.push(csvRow(
    'mining_pool_share', seriesKey, snapshotDate, sharePct, 'openbitcoin_node_api', poolsAsOf,
    `openbitcoin-pools-b7d:${pool.slug}:${poolsAsOf}`, rowHash,
  ));
}
const poolShareHhi = poolRows.reduce((sum, { pool }) => sum + (pool.b7d / identifiedBlocks7d * 100) ** 2, 0);
const hhiInputs = poolRowHashes.join('\x1f');
lines.push(csvRow(
  'pool_concentration_hhi', 'main', snapshotDate, poolShareHhi, 'derived_bitcoin_metrics', poolsAsOf,
  'derived-v3:openbitcoin-pool-concentration-hhi-7d',
  sha256(`openbitcoin-pool-concentration-hhi-v1\x1f${hhiInputs}\x1f${decimal(poolShareHhi)}`),
));

const fearHistory = [...fearGreed.history];
for (let i = 0; i < fearHistory.length; i++) {
  const item = fearHistory[i];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.d) || !Number.isInteger(item.v) || item.v < 0 || item.v > 100) {
    throw new Error(`Ungültiger Fear-and-Greed-Tageswert bei Index ${i}.`);
  }
  if (i > 0 && Date.parse(`${item.d}T00:00:00Z`) - Date.parse(`${fearHistory[i - 1].d}T00:00:00Z`) !== 86_400_000) {
    throw new Error(`Lücke oder Sortierfehler in der Fear-and-Greed-Historie bei ${item.d}.`);
  }
  lines.push(csvRow(
    'fear_greed_index', 'main', item.d, item.v, 'openbitcoin_node_api', fearAsOf,
    `openbitcoin-fear-greed-history:${item.d}`,
    sha256(`openbitcoin-fear-greed-history-v1\x1f${fearFile.hash}\x1f${item.d}\x1f${item.v}`),
  ));
}
if (fearHistory.at(-1).d !== snapshotDate || fearHistory.at(-1).v !== fearGreed.value) {
  throw new Error('Der aktuelle Fear-and-Greed-Wert passt nicht zum letzten Historienpunkt.');
}

lines.push(csvRow(
  'fee_recommendation_fast_sat_vb', 'main', snapshotDate, fees.fastest, 'openbitcoin_node_api', feesAsOf,
  `openbitcoin-fees-fastest:${feesAsOf}`,
  sha256(`openbitcoin-fees-fastest-v1\x1f${feesFile.hash}\x1f${fees.fastest}`),
));
lines.push(csvRow(
  'fee_recommendation_economy_sat_vb', 'main', snapshotDate, fees.economy, 'openbitcoin_node_api', feesAsOf,
  `openbitcoin-fees-economy:${feesAsOf}`,
  sha256(`openbitcoin-fees-economy-v1\x1f${feesFile.hash}\x1f${fees.economy}`),
));
lines.push(csvRow(
  'mempool_min_fee_sat_vb', 'main', snapshotDate, mempool.minFeerate, 'openbitcoin_node_api', mempoolAsOf,
  `openbitcoin-mempool-min-feerate:${mempoolAsOf}`,
  sha256(`openbitcoin-mempool-min-feerate-v1\x1f${mempoolFile.hash}\x1f${mempool.minFeerate}`),
));

const uniqueKeys = new Set();
for (const line of lines) {
  const cells = line.split(',');
  if (cells.length !== 9) throw new Error('Der vorbereitete Bitcoin-Snapshot hat eine falsche CSV-Spaltenzahl.');
  const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
  if (uniqueKeys.has(key)) throw new Error(`Doppelter Snapshot-Schlüssel: ${key}`);
  uniqueKeys.add(key);
}
if (fs.existsSync(csvPath) || fs.existsSync(manifestPath) || fs.existsSync(migrationPath)) {
  throw new Error('Mindestens eine vorbereitete Snapshot-Ausgabe existiert bereits; bestehende Dateien werden nicht überschrieben.');
}

const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const seriesValues = poolRows.map(({ pool, seriesKey }, index) => `    (${quoteSql('mining_pool_share')}, ${quoteSql(seriesKey)}, ${quoteSql(pool.name)}, ${index + 1}, 'weekly', 'native_periods', '${snapshotDate}')`).join(',\n');
const migration = `-- Bitcoin-only OpenBitcoin snapshots retrieved on ${snapshotDate} under the user's confirmed private personal use.\n-- The pool shares are a single trailing 7-day snapshot, not a historical weekly backfill.\n\nUPDATE bitcoin_metrics\nSET source_id = (SELECT id FROM bitcoin_data_sources WHERE slug = 'openbitcoin_node_api'),\n    source_hint = 'OpenBitcoin Bitcoin-Node API',\n    source_series = '/api/v1/pools: pools[].b7d / sum(pools[].b7d)',\n    methodology_note = 'One trailing 7-day snapshot. Each pool share is its block count divided by the sum of identified pools'' b7d counts. The unattributed unknown pool count is excluded from the denominator. All pool names and counts come from OpenBitcoin.com /api/v1/pools. Private personal use only per user confirmation; no general redistribution license.',\n    native_frequency = 'weekly', observation_kind = 'period_end', calendar_type = 'native_periods',\n    expected_start = '${snapshotDate}', availability_status = 'partial'\nWHERE metric_id = 'mining_pool_share';\n\nUPDATE bitcoin_metrics\nSET source_id = (SELECT id FROM bitcoin_data_sources WHERE slug = 'derived_bitcoin_metrics'),\n    source_hint = 'Aus OpenBitcoin-Blockanteilen lokal berechnet',\n    source_series = 'local:mining_pool_share/openbitcoin-b7d',\n    methodology_note = 'Herfindahl-Hirschman-Index aus den OpenBitcoin-b7d-Anteilen der identifizierten Mining-Pools: Summe der quadrierten Prozentanteile. Nicht zugeordnete Blöcke werden ausgeschlossen. Ein 7-Tage-Snapshot zum 2026-09-29, keine historische Reihe. Quelle nur für private persönliche Nutzung laut Nutzerbestätigung.',\n    native_frequency = 'weekly', observation_kind = 'derived', calendar_type = 'native_periods',\n    expected_start = '${snapshotDate}', availability_status = 'partial'\nWHERE metric_id = 'pool_concentration_hhi';\n\nUPDATE bitcoin_metrics\nSET source_id = (SELECT id FROM bitcoin_data_sources WHERE slug = 'openbitcoin_node_api'),\n    source_hint = 'OpenBitcoin BTC-Preisindex',\n    source_series = '/api/v1/fear-greed: history[].v',\n    methodology_note = 'OpenBitcoin-Hausindex aus den eigenen BTC-Preisdaten. Die dokumentierte Gewichtung ist Momentum gegen 30-Tage-SMA 25 Prozent, Trend gegen 200-Tage-SMA 30 Prozent, Abstand zum 365-Tage-Hoch 30 Prozent sowie 7-Tage- gegen 90-Tage-Volatilität 15 Prozent. Die lokale Historie umfasst nur tatsächlich gelieferte tägliche Werte. Private persönliche Nutzung laut Nutzerbestätigung.',\n    native_frequency = 'daily', observation_kind = 'derived', calendar_type = 'calendar_daily',\n    expected_start = '${fearHistory[0].d}', availability_status = 'partial'\nWHERE metric_id = 'fear_greed_index';\n\nUPDATE bitcoin_metrics\nSET source_id = (SELECT id FROM bitcoin_data_sources WHERE slug = 'openbitcoin_node_api'),\n    source_hint = 'OpenBitcoin Bitcoin-Node / Mempool-Schätzung',\n    source_series = '/api/v1/fees: fastest',\n    methodology_note = 'Momentaufnahme des vom OpenBitcoin-Node gemeldeten fastest-Feeratetiers in sat/vB. Es ist eine Empfehlung aus der Mempool-Schätzung, keine Bestätigungsgarantie. Private persönliche Nutzung laut Nutzerbestätigung.',\n    native_frequency = 'daily', observation_kind = 'point_in_time', calendar_type = 'native_periods',\n    expected_start = '${snapshotDate}', availability_status = 'partial'\nWHERE metric_id = 'fee_recommendation_fast_sat_vb';\n\nUPDATE bitcoin_metrics\nSET source_id = (SELECT id FROM bitcoin_data_sources WHERE slug = 'openbitcoin_node_api'),\n    source_hint = 'OpenBitcoin Bitcoin-Node / Mempool-Schätzung',\n    source_series = '/api/v1/fees: economy',\n    methodology_note = 'Momentaufnahme des vom OpenBitcoin-Node gemeldeten economy-Feeratetiers in sat/vB. Es ist eine Empfehlung aus der Mempool-Schätzung, keine Bestätigungsgarantie. Private persönliche Nutzung laut Nutzerbestätigung.',\n    native_frequency = 'daily', observation_kind = 'point_in_time', calendar_type = 'native_periods',\n    expected_start = '${snapshotDate}', availability_status = 'partial'\nWHERE metric_id = 'fee_recommendation_economy_sat_vb';\n\nUPDATE bitcoin_metrics\nSET source_id = (SELECT id FROM bitcoin_data_sources WHERE slug = 'openbitcoin_node_api'),\n    source_hint = 'OpenBitcoin Bitcoin-Node / Mempool',\n    source_series = '/api/v1/mempool: minFeerate',\n    methodology_note = 'Momentaufnahme der vom eigenen OpenBitcoin-Knoten gemeldeten Mindest-Feerate im Mempool in sat/vB. Getrennt von Fee-Empfehlungen. Private persönliche Nutzung laut Nutzerbestätigung.',\n    native_frequency = 'daily', observation_kind = 'point_in_time', calendar_type = 'native_periods',\n    expected_start = '${snapshotDate}', availability_status = 'partial'\nWHERE metric_id = 'mempool_min_fee_sat_vb';\n\nINSERT INTO bitcoin_metric_series\n    (metric_id, series_key, display_name, display_order, native_frequency, calendar_type, expected_start)\nVALUES\n${seriesValues}\nON DUPLICATE KEY UPDATE\n    display_name = VALUES(display_name), display_order = VALUES(display_order),\n    native_frequency = VALUES(native_frequency), calendar_type = VALUES(calendar_type),\n    expected_start = VALUES(expected_start);\n\nUPDATE bitcoin_metric_series\nSET native_frequency = 'weekly', calendar_type = 'native_periods', expected_start = '${snapshotDate}'\nWHERE metric_id = 'pool_concentration_hhi' AND series_key = 'main';\n\nUPDATE bitcoin_metric_series\nSET native_frequency = 'daily', calendar_type = 'calendar_daily', expected_start = '${fearHistory[0].d}'\nWHERE metric_id = 'fear_greed_index' AND series_key = 'main';\n\nUPDATE bitcoin_metric_series\nSET native_frequency = 'daily', calendar_type = 'native_periods', expected_start = '${snapshotDate}'\nWHERE metric_id IN ('fee_recommendation_fast_sat_vb','fee_recommendation_economy_sat_vb','mempool_min_fee_sat_vb')\n  AND series_key = 'main';\n\nINSERT INTO bitcoin_metric_dependencies (metric_id, input_metric_id, calculation_note) VALUES\n    ('pool_concentration_hhi','mining_pool_share','HHI is the sum of squared percentage shares across identified pools within the trailing 7-day snapshot; unattributed blocks are excluded.')\nON DUPLICATE KEY UPDATE calculation_note = VALUES(calculation_note);\n`;

fs.writeFileSync(csvPath, `${importHeader}\n${lines.join('\n')}\n`, 'utf8');
fs.writeFileSync(migrationPath, migration.replace('The unattributed unknown pool count is excluded from the denominator.', `This snapshot contains ${identifiedBlocks7d} identified blocks and ${pools.unknown.b7d} unattributed blocks; the unattributed blocks are excluded from the percentage denominator.`), 'utf8');
const sourceAttributionSql = `UPDATE bitcoin_data_sources\nSET attribution_text = 'OpenBitcoin.com API, eigener Bitcoin-Node und eigener Index, abgerufen am 2026-09-28 und ${snapshotDate}. API-Dokumentation: https://openbitcoin.com/api. Private persönliche Nutzung laut Bestätigung des Dashboard-Inhabers freigegeben.'\nWHERE slug = 'openbitcoin_node_api';`;
const writtenMigration = fs.readFileSync(migrationPath, 'utf8');
fs.writeFileSync(migrationPath, writtenMigration.replace('-- The pool shares are a single trailing 7-day snapshot, not a historical weekly backfill.', `${sourceAttributionSql}\n\n-- The pool shares are a single trailing 7-day snapshot, not a historical weekly backfill.`), 'utf8');
const manifest = {
  date: snapshotDate,
  rows: lines.length,
  metrics: {
    fear_greed_index: { observations: fearHistory.length, firstDate: fearHistory[0].d, lastDate: fearHistory.at(-1).d, sourceSha256: fearFile.hash },
    mining_pool_share: { series: poolRows.length, observations: poolRows.length, identifiedBlocks7d, unknownBlocks7d: pools.unknown.b7d, sharesTotalPct: 100, sourceSha256: poolsFile.hash },
    pool_concentration_hhi: { observations: 1, value: decimal(poolShareHhi), sourceSha256: poolsFile.hash },
    fee_recommendation_fast_sat_vb: { observations: 1, value: fees.fastest, sourceSha256: feesFile.hash },
    fee_recommendation_economy_sat_vb: { observations: 1, value: fees.economy, sourceSha256: feesFile.hash },
    mempool_min_fee_sat_vb: { observations: 1, value: mempool.minFeerate, sourceSha256: mempoolFile.hash },
  },
  inputs: Object.fromEntries([poolsFile, fearFile, feesFile, mempoolFile].map((file) => [path.basename(file.filename), file.hash])),
  output: path.relative(root, csvPath),
  migration: path.relative(root, migrationPath),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
