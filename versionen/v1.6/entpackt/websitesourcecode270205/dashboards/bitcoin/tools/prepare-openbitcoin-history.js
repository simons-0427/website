const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const rawPath = path.join(varDir, 'openbitcoin-history-2026-09-28.json');
const supplementalPath = path.join(varDir, 'openbitcoin-supplemental-2026-09-28.json');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const importPath = path.join(varDir, 'openbitcoin-history-import.csv');
const sourceSlug = 'openbitcoin_node_api';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function utcTimestamp(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().replace(/\.000Z$/, 'Z');
}

function decimal(value) {
  if (!Number.isFinite(value)) throw new Error(`Ungültiger Dezimalwert: ${value}`);
  return value.toFixed(12).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function csvRow(metric, series, date, value, timestamp, revision, hash) {
  return [metric, series, date, decimal(value), sourceSlug, timestamp, 'provisional', revision, hash].join(',');
}

function parsePayload(payload, key) {
  if (typeof payload[key] !== 'string') throw new Error(`Rohdatei enthält kein unverändertes ${key}-Payload.`);
  try {
    return JSON.parse(payload[key]);
  } catch {
    throw new Error(`${key}-Payload in der Rohdatei ist kein gültiges JSON.`);
  }
}

function buildFeeRows(history, payloadHash) {
  if (!Array.isArray(history.points) || history.points.length === 0) throw new Error('OpenBitcoin fee-history enthält keine Datenpunkte.');
  const byUtcDate = new Map();
  for (const point of history.points) {
    if (!Array.isArray(point) || point.length !== 6 || !Number.isSafeInteger(point[0]) || !Number.isSafeInteger(point[1])) {
      throw new Error('OpenBitcoin fee-history hat ein unerwartetes Punktformat.');
    }
    for (const value of point.slice(2)) {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        throw new Error('OpenBitcoin fee-history enthält einen ungültigen Messwert.');
      }
    }
    const date = new Date(point[0] * 1000).toISOString().slice(0, 10);
    const previous = byUtcDate.get(date);
    if (!previous || point[0] > previous[0]) byUtcDate.set(date, point);
  }

  const rows = [];
  for (const [date, point] of [...byUtcDate].sort(([left], [right]) => left.localeCompare(right))) {
    const timestamp = utcTimestamp(point[0]);
    const revision = `openbitcoin-fee-history:${point[1]}:${point[0]}`;
    if (point[2] !== null) rows.push(csvRow('fees_median_sat_vb', 'main', date, point[2], timestamp, revision, payloadHash));
    if (point[3] !== null) rows.push(csvRow('fees_average_sat_vb', 'main', date, point[3], timestamp, revision, payloadHash));
  }
  return { rows, sourcePoints: history.points.length, utcDays: byUtcDate.size };
}

function buildMempoolRows(history, payloadHash) {
  if (history.bucketSeconds !== 43_200 || !Array.isArray(history.edges) || history.edges.length !== 13 || !Array.isArray(history.points)) {
    throw new Error('OpenBitcoin mempool-history hat unerwartete Bandgrenzen oder Bucket-Größe.');
  }
  const byUtcDate = new Map();
  for (const point of history.points) {
    if (!Array.isArray(point) || point.length !== 14 || !Number.isSafeInteger(point[0])) {
      throw new Error('OpenBitcoin mempool-history hat ein unerwartetes Punktformat.');
    }
    if (point.slice(1).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error('OpenBitcoin mempool-history enthält einen ungültigen VSize-Wert.');
    }
    const date = new Date(point[0] * 1000).toISOString().slice(0, 10);
    if (!byUtcDate.has(date)) byUtcDate.set(date, []);
    byUtcDate.get(date).push(point);
  }

  const rows = [];
  for (const [date, points] of [...byUtcDate].sort(([left], [right]) => left.localeCompare(right))) {
    const start = Date.parse(`${date}T00:00:00Z`) / 1000;
    points.sort((left, right) => left[0] - right[0]);
    if (points.length !== 2 || points[0][0] !== start || points[1][0] !== start + 43_200) {
      throw new Error(`OpenBitcoin mempool-history enthält für ${date} keine zwei vollständigen UTC-Halbtage.`);
    }
    const totalVsizeMean = (points[0].slice(1).reduce((sum, value) => sum + value, 0)
      + points[1].slice(1).reduce((sum, value) => sum + value, 0)) / 2;
    const valueMb = totalVsizeMean / 1_000_000;
    rows.push(csvRow(
      'mempool_vsize_mb',
      'openbitcoin_daily_mean',
      date,
      valueMb,
      '',
      `openbitcoin-mempool-history:2x12h:${date}`,
      payloadHash,
    ));
  }
  return { rows, utcDays: byUtcDate.size };
}

function buildDifficultyRows(history, payloadHash) {
  if (!Array.isArray(history.points) || history.points.length === 0) throw new Error('OpenBitcoin difficulty-history enthält keine Datenpunkte.');
  const rows = [];
  let previousTimestamp = 0;
  let previousHeight = -1;
  for (const point of history.points) {
    if (!Array.isArray(point) || point.length !== 3 || !Number.isSafeInteger(point[0])
      || !Number.isSafeInteger(point[1]) || typeof point[2] !== 'number'
      || !Number.isFinite(point[2]) || point[2] <= 0
      || point[0] <= previousTimestamp || point[1] <= previousHeight) {
      throw new Error('OpenBitcoin difficulty-history enthält ein ungültiges oder unsortiertes Retarget.');
    }
    const [timestamp, height, difficulty] = point;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const sourceTimestamp = utcTimestamp(timestamp);
    const revision = `openbitcoin-difficulty-history:${height}:${timestamp}`;
    const impliedHashrateEh = difficulty * 4_294_967_296 / 600 / 1_000_000_000_000_000_000;
    rows.push(csvRow('difficulty_retarget', 'main', date, difficulty, sourceTimestamp, revision, payloadHash));
    rows.push(csvRow('hashrate_retarget_eh_s', 'main', date, impliedHashrateEh, sourceTimestamp, revision, payloadHash));
    previousTimestamp = timestamp;
    previousHeight = height;
  }
  return { rows, sourcePoints: history.points.length };
}

function buildStatsRows(stats, payloadHash) {
  if (!stats.day || !stats.allTime || !stats.day.asOf || !stats.allTime.asOf || !stats.allTime.sweptAt) {
    throw new Error('OpenBitcoin stats24h enthält keine vollständigen Messzeitpunkte.');
  }
  const dayTimestamp = stats.day.asOf;
  const allTimeTimestamp = stats.allTime.asOf;
  const sweptTimestamp = stats.allTime.sweptAt;
  for (const timestamp of [dayTimestamp, allTimeTimestamp, sweptTimestamp]) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
      throw new Error('OpenBitcoin stats24h enthält einen ungültigen UTC-Zeitstempel.');
    }
  }
  const dayDate = dayTimestamp.slice(0, 10);
  const allTimeDate = allTimeTimestamp.slice(0, 10);
  const sweptDate = sweptTimestamp.slice(0, 10);
  const values = [
    stats.day.txs,
    stats.day.feeSat,
    stats.day.medianFeerate,
    stats.day.hashrateEhs,
    stats.allTime.height,
    stats.allTime.rawSizeBytes,
    stats.allTime.supplySat,
    stats.allTime.fundedAddresses,
  ];
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('OpenBitcoin stats24h enthält fehlende oder ungültige Kennzahlen.');
  }
  const row = (metric, series, date, value, timestamp, revision) => csvRow(
    metric,
    series,
    date,
    value,
    timestamp.replace(/\.\d{3}Z$/, 'Z'),
    revision,
    payloadHash,
  );
  return [
    row('transactions_count', 'openbitcoin_rolling_24h', dayDate, stats.day.txs, dayTimestamp, 'openbitcoin-stats24h:rolling-24h'),
    row('fees_total_btc', 'openbitcoin_rolling_24h', dayDate, stats.day.feeSat / 100_000_000, dayTimestamp, 'openbitcoin-stats24h:rolling-24h-fees'),
    row('fees_median_sat_vb', 'openbitcoin_rolling_24h', dayDate, stats.day.medianFeerate, dayTimestamp, 'openbitcoin-stats24h:rolling-24h-median-feerate'),
    row('hashrate_eh_s', 'openbitcoin_rolling_24h', dayDate, stats.day.hashrateEhs, dayTimestamp, 'openbitcoin-stats24h:rolling-24h-hashrate'),
    row('block_height', 'openbitcoin_chain_tip', allTimeDate, stats.allTime.height, allTimeTimestamp, 'openbitcoin-stats24h:chain-tip'),
    row('blockchain_size_bytes', 'main', allTimeDate, stats.allTime.rawSizeBytes, allTimeTimestamp, 'openbitcoin-stats24h:raw-chain-size'),
    row('supply_btc', 'main', allTimeDate, stats.allTime.supplySat / 100_000_000, allTimeTimestamp, 'openbitcoin-stats24h:supply'),
    row('addresses_nonzero_balance', 'openbitcoin_funded_snapshot', sweptDate, stats.allTime.fundedAddresses, sweptTimestamp, 'openbitcoin-stats24h:funded-addresses'),
  ];
}

function readExistingKeys(filename) {
  const bytes = fs.readFileSync(filename);
  const lines = bytes.toString('utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Der kombinierte Export hat einen unerwarteten CSV-Kopf.');
  const rowsByKey = new Map();
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Fehlerhafte CSV-Zeile ${index + 2} im kombinierten Export.`);
    const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
    if (rowsByKey.has(key)) throw new Error(`Der kombinierte Export enthält bereits einen doppelten Schlüssel: ${key}.`);
    rowsByKey.set(key, line);
  }
  return { bytes, rowsByKey, rows: lines.length };
}

function readExistingImport(filename) {
  if (!fs.existsSync(filename)) return { bytes: Buffer.alloc(0), rowsByKey: new Map(), rows: 0 };
  const bytes = fs.readFileSync(filename);
  const lines = bytes.toString('utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Die vorhandene OpenBitcoin-Importdatei hat einen unerwarteten CSV-Kopf.');
  const rowsByKey = new Map();
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Fehlerhafte CSV-Zeile ${index + 2} in der OpenBitcoin-Importdatei.`);
    const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
    if (rowsByKey.has(key)) throw new Error(`Die OpenBitcoin-Importdatei enthält einen doppelten Schlüssel: ${key}.`);
    rowsByKey.set(key, line);
  }
  return { bytes, rowsByKey, rows: lines.length };
}

function appendCsvRows(filename, originalBytes, rows) {
  if (rows.length === 0) return false;
  const separator = originalBytes.length > 0 && !originalBytes.toString('utf8').endsWith('\n') ? '\n' : '';
  const content = originalBytes.length === 0
    ? `${importHeader}\n${rows.join('\n')}\n`
    : `${separator}${rows.join('\n')}\n`;
  const nextPath = `${filename}.next`;
  if (fs.existsSync(nextPath)) throw new Error(`Ein temporärer Import liegt bereits vor: ${path.basename(nextPath)}.`);
  fs.writeFileSync(nextPath, Buffer.concat([originalBytes, Buffer.from(content, 'utf8')]), { flag: 'wx' });
  try {
    fs.renameSync(nextPath, filename);
  } catch (error) {
    if (fs.existsSync(nextPath)) fs.unlinkSync(nextPath);
    throw error;
  }
  return true;
}

function main() {
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) throw new Error('var/.htaccess fehlt; die Rohdaten wären nicht geschützt.');
  if (!fs.existsSync(masterPath)) throw new Error('Der kombinierte Bitcoin-Export fehlt.');
  const payload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  if (!payload.fetchedAtUtc) throw new Error('Die Rohdatei enthält keinen Abrufzeitpunkt.');
  const supplemental = JSON.parse(fs.readFileSync(supplementalPath, 'utf8'));
  if (!supplemental.fetchedAtUtc) throw new Error('Die ergänzende OpenBitcoin-Rohdatei enthält keinen Abrufzeitpunkt.');

  const feePayload = payload.feeHistory;
  const mempoolPayload = payload.mempoolHistory;
  const difficultyPayload = supplemental.difficultyHistory;
  const statsPayload = supplemental.stats24h;
  const feeHistory = parsePayload(payload, 'feeHistory');
  const mempoolHistory = parsePayload(payload, 'mempoolHistory');
  const difficultyHistory = parsePayload(supplemental, 'difficultyHistory');
  const stats24h = parsePayload(supplemental, 'stats24h');
  const fees = buildFeeRows(feeHistory, sha256(feePayload));
  const mempool = buildMempoolRows(mempoolHistory, sha256(mempoolPayload));
  const difficulty = buildDifficultyRows(difficultyHistory, sha256(difficultyPayload));
  const statsRows = buildStatsRows(stats24h, sha256(statsPayload));
  const generatedRows = [...fees.rows, ...mempool.rows, ...difficulty.rows, ...statsRows].sort((left, right) => {
    const a = left.split(',');
    const b = right.split(',');
    return a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]);
  });
  if (generatedRows.length === 0) throw new Error('Die OpenBitcoin-Rohdaten ergaben keine importierbaren Beobachtungen.');

  const existingImport = readExistingImport(importPath);
  const importRowsToAppend = [];
  const expectedImportKeys = new Set();
  for (const row of generatedRows) {
    const cells = row.split(',');
    if (cells.length !== 9) throw new Error('Eine generierte OpenBitcoin-Zeile hat ein ungültiges CSV-Format.');
    const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
    expectedImportKeys.add(key);
    const previous = existingImport.rowsByKey.get(key);
    if (previous !== undefined) {
      if (previous !== row) throw new Error(`OpenBitcoin-Importzeile weicht vom Rohbeleg ab: ${key}.`);
      continue;
    }
    importRowsToAppend.push(row);
  }
  for (const key of existingImport.rowsByKey.keys()) {
    if (!expectedImportKeys.has(key)) throw new Error(`Die vorhandene OpenBitcoin-Importdatei enthält eine nicht mehr belegte Zeile: ${key}.`);
  }

  const { bytes: originalBytes, rowsByKey, rows: originalRows } = readExistingKeys(masterPath);
  const rowsToAppend = [];
  let rowsAlreadyPresent = 0;
  for (const row of generatedRows) {
    const cells = row.split(',');
    if (cells.length !== 9) throw new Error('Eine generierte OpenBitcoin-Zeile hat ein ungültiges CSV-Format.');
    const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
    const previous = rowsByKey.get(key);
    if (previous !== undefined) {
      if (previous !== row) throw new Error(`OpenBitcoin-Beobachtung weicht von einer bestehenden Reihe ab: ${key}.`);
      rowsAlreadyPresent++;
      continue;
    }
    rowsByKey.set(key, row);
    rowsToAppend.push(row);
  }

  const importCreated = appendCsvRows(importPath, existingImport.bytes, importRowsToAppend);
  const masterChanged = appendCsvRows(masterPath, originalBytes, rowsToAppend);

  console.log(JSON.stringify({
    source: 'https://openbitcoin.com/api',
    providerPermission: 'Per Nutzerbestätigung: private persönliche Nutzung freigegeben.',
    fetchedAtUtc: payload.fetchedAtUtc,
    feeHistory: {
      sourcePoints: fees.sourcePoints,
      uniqueUtcDays: fees.utcDays,
      medianFeeRows: fees.rows.filter((row) => row.startsWith('fees_median_sat_vb,')).length,
      averageFeeRows: fees.rows.filter((row) => row.startsWith('fees_average_sat_vb,')).length,
      payloadSha256: sha256(feePayload),
    },
    mempoolHistory: {
      sourcePoints: mempoolHistory.points.length,
      bucketSeconds: mempoolHistory.bucketSeconds,
      completeUtcDays: mempool.utcDays,
      vsizeRows: mempool.rows.length,
      series: 'openbitcoin_daily_mean',
      payloadSha256: sha256(mempoolPayload),
    },
    difficultyHistory: {
      sourcePoints: difficulty.sourcePoints,
      difficultyRows: difficulty.rows.filter((row) => row.startsWith('difficulty_retarget,')).length,
      impliedHashrateRows: difficulty.rows.filter((row) => row.startsWith('hashrate_retarget_eh_s,')).length,
      payloadSha256: sha256(difficultyPayload),
    },
    stats24h: {
      pointInTimeRows: statsRows.length,
      series: ['openbitcoin_rolling_24h', 'openbitcoin_chain_tip', 'openbitcoin_funded_snapshot', 'main'],
      payloadSha256: sha256(statsPayload),
    },
    importFile: path.relative(root, importPath),
    importRowsBefore: existingImport.rows,
    importRowsAdded: importRowsToAppend.length,
    importFileChanged: importCreated,
    masterChanged,
    rowsBefore: originalRows,
    rowsAdded: rowsToAppend.length,
    rowsAlreadyPresent,
    rowsAfter: originalRows + rowsToAppend.length,
    masterSha256Before: sha256(originalBytes),
    masterSha256After: sha256(fs.readFileSync(masterPath)),
  }, null, 2));
}

main();
