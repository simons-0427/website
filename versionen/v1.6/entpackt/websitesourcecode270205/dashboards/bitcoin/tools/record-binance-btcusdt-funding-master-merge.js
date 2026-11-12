const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { once } = require('node:events');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const rawPath = path.join(varDir, 'binance-btcusdt-funding-history-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'binance-btcusdt-funding-daily-mean-import-through-2026-09-28.csv');
const cutoff = '2026-09-28';
const metricId = 'binance_perpetual_funding_rate_pct';
const binanceSource = 'binance_usdm_public_api';
const bykaranteliSource = 'bykaranteli_btcusdt_daily_symbols_cc0';
const newSeriesKey = 'main';
const oldSeriesKey = 'bykaranteli_daily_snapshot';
const expectedCandidateRows = 2576;
const expectedRekeyedRows = 49;
const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const backupPath = path.join(varDir, `bitcoin-backfill-cointime-cftc-options-before-binance-funding-${stamp}.csv`);
const manifestBackupPath = path.join(varDir, `manifest-before-binance-funding-${stamp}.json`);
const nextMasterPath = `${masterPath}.binance-funding.next`;
const nextManifestPath = `${manifestPath}.binance-funding.next`;

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') { value += '"'; index++; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { cells.push(value); value = ''; }
    else value += character;
  }
  if (quoted) throw new Error('Nicht geschlossenes Anführungszeichen in CSV.');
  cells.push(value);
  return cells;
}

function csvRow(cells) {
  return cells.map((value) => {
    const text = String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',');
}

function keyOf(cells) {
  return `${cells[0]}\x1f${cells[1]}\x1f${cells[2]}`;
}

function fileHash(filename) {
  const digest = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(digest.digest('hex')));
  });
}

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatValue(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e24) throw new Error('Fundingwert liegt außerhalb des Importformats.');
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function isoSecond(milliseconds) {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function validateRawAndCandidate(raw, candidateBuffer) {
  if (raw.symbol !== 'BTCUSDT' || raw.sourceUrl !== 'https://fapi.binance.com/fapi/v1/fundingRate'
      || !Array.isArray(raw.records) || raw.recordCount !== raw.records.length
      || raw.redistributionRights !== 'Not independently confirmed; retain as private local research until verified.') {
    throw new Error('Binance-Rohdatei hat unerwartete Quelle, Lizenznotiz oder Zeilenzahl.');
  }
  const daily = new Map();
  const seenTimes = new Set();
  for (const row of raw.records) {
    const time = Number(row?.fundingTime);
    if (row?.symbol !== 'BTCUSDT' || !Number.isSafeInteger(time) || time > Date.parse(`${cutoff}T23:59:59.999Z`)
      || !Number.isFinite(Number(row.fundingRate)) || (row.rateType && row.rateType !== 'Regular')) {
      throw new Error('Binance-Rohdatei enthält einen ungültigen oder fremden BTC-Datensatz.');
    }
    if (seenTimes.has(time)) throw new Error('Doppelter Binance-Fundingzeitpunkt in der Rohdatei.');
    seenTimes.add(time);
    const date = new Date(time).toISOString().slice(0, 10);
    if (!daily.has(date)) daily.set(date, []);
    daily.get(date).push(row);
  }

  const lines = candidateBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== importHeader || lines.length !== daily.size || lines.length !== expectedCandidateRows) {
    throw new Error('Binance-Kandidaten-CSV hat einen falschen Kopf oder eine unerwartete Zeilenzahl.');
  }
  const candidates = [];
  const seenCandidateKeys = new Set();
  for (const [index, line] of lines.entries()) {
    const cells = parseCsvLine(line);
    if (cells.length !== 9 || cells[0] !== metricId || cells[1] !== newSeriesKey || cells[4] !== binanceSource
        || cells[6] !== 'provisional' || cells[7] !== 'binance-fapi-v1-fundingRate-utc-daily-mean-regular-rate-x100-v1'
        || !/^\d{4}-\d{2}-\d{2}$/.test(cells[2]) || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cells[3])
        || !/^[a-f0-9]{64}$/.test(cells[8])) {
      throw new Error(`Ungültige Binance-Kandidatenzeile ${index + 2}.`);
    }
    const key = keyOf(cells);
    if (seenCandidateKeys.has(key)) throw new Error(`Doppelter Kandidatenschlüssel ${key}.`);
    seenCandidateKeys.add(key);
    const events = daily.get(cells[2]);
    if (!events) throw new Error(`Kandidat ohne Rohereignisse für ${cells[2]}.`);
    const meanPct = events.reduce((sum, row) => sum + Number(row.fundingRate) * 100, 0) / events.length;
    const maxTime = Math.max(...events.map((row) => Number(row.fundingTime)));
    const expectedHash = hashText(JSON.stringify(events.map((row) => [Number(row.fundingTime), row.fundingRate, row.rateType || null])));
    if (cells[3] !== formatValue(meanPct) || cells[5] !== isoSecond(maxTime) || cells[8] !== expectedHash) {
      throw new Error(`Binance-Wert, UTC-Zeit oder Rohhash stimmt am ${cells[2]} nicht überein.`);
    }
    candidates.push(cells);
  }

  candidates.sort((left, right) => left[2].localeCompare(right[2]));
  const dates = candidates.map((cells) => cells[2]);
  if (dates[0] !== '2019-09-10' || dates.at(-1) !== cutoff) throw new Error('Unerwartete Binance-Abdeckungsgrenzen.');
  for (let index = 1; index < dates.length; index++) {
    const prior = Date.parse(`${dates[index - 1]}T00:00:00Z`);
    if (Date.parse(`${dates[index]}T00:00:00Z`) - prior !== 86_400_000) throw new Error(`Lücke in der UTC-Tagesreihe vor ${dates[index]}.`);
  }
  if (raw.records[0].fundingTime && new Date(Number(raw.records[0].fundingTime)).toISOString() !== raw.firstFundingTime) {
    throw new Error('Erster Fundingzeitpunkt weicht vom Rohmanifest ab.');
  }
  return { candidates, daily };
}

async function writeLine(stream, line) {
  if (!stream.write(`${line}\n`)) await once(stream, 'drain');
}

async function summarize(filename, catalog) {
  const summary = {
    rows: 0, bytes: fs.statSync(filename).size, metricIds: new Set(), coreMetricIds: new Set(), sourceCounts: {},
    firstDate: null, lastDate: null, rowsAfterCutoff: 0, keys: new Set(),
  };
  const core = new Set(catalog.coreMetricIds);
  const metricSet = new Set(catalog.metrics.map((metric) => metric.id));
  const reader = readline.createInterface({ input: fs.createReadStream(filename, { encoding: 'utf8' }), crlfDelay: Infinity });
  let header = true;
  for await (const line of reader) {
    if (header) {
      if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error('Prepared master has an unexpected CSV header.');
      header = false;
      continue;
    }
    const cells = parseCsvLine(line);
    if (cells.length !== 9 || !metricSet.has(cells[0]) || !/^\d{4}-\d{2}-\d{2}$/.test(cells[2])) throw new Error(`Invalid row ${summary.rows + 2} in prepared master.`);
    const key = keyOf(cells);
    if (summary.keys.has(key)) throw new Error(`Duplicate prepared master key ${key}.`);
    summary.keys.add(key);
    summary.rows++;
    summary.metricIds.add(cells[0]);
    if (core.has(cells[0])) summary.coreMetricIds.add(cells[0]);
    summary.sourceCounts[cells[4]] = (summary.sourceCounts[cells[4]] || 0) + 1;
    if (!summary.firstDate || cells[2] < summary.firstDate) summary.firstDate = cells[2];
    if (!summary.lastDate || cells[2] > summary.lastDate) summary.lastDate = cells[2];
    if (cells[2] > cutoff) summary.rowsAfterCutoff++;
  }
  return summary;
}

async function main() {
  const required = [masterPath, manifestPath, catalogPath, rawPath, candidatePath];
  if (required.some((filename) => !fs.existsSync(filename))) throw new Error('Master, manifest, Katalog, Rohdatei oder Kandidat fehlt.');
  const reservedOutputs = [backupPath, manifestBackupPath, nextMasterPath, nextManifestPath];
  if (reservedOutputs.some((filename) => fs.existsSync(filename))) throw new Error('Zieldatei existiert bereits; nichts wird überschrieben.');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const masterBytes = fs.statSync(masterPath).size;
  const masterSha256 = await fileHash(masterPath);
  if (manifest.master !== path.basename(masterPath) || manifest.cutoffInclusive !== cutoff
      || manifest.masterBytes !== masterBytes || manifest.masterSha256 !== masterSha256
      || manifest.observations !== 997863 || manifest.metricIdsWithObservations !== 177
      || manifest.coreMetricIdsWithObservations !== 96) {
    throw new Error('Aktiver Master oder Manifest weicht vom geprüften Bitcoin-Ausgangsstand ab.');
  }

  const rawBuffer = fs.readFileSync(rawPath);
  const raw = JSON.parse(rawBuffer.toString('utf8'));
  const candidateBuffer = fs.readFileSync(candidatePath);
  const { candidates, daily } = validateRawAndCandidate(raw, candidateBuffer);
  const candidateKeys = new Set(candidates.map(keyOf));
  const oldKeys = new Set();
  const rekeyedDates = new Set();
  const bykValues = new Map();
  let baseRows = 0;
  let masterHeader = true;
  const output = fs.createWriteStream(nextMasterPath, { encoding: 'utf8', flags: 'wx', mode: 0o600 });
  const reader = readline.createInterface({ input: fs.createReadStream(masterPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (masterHeader) {
        if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error('Active master has an unexpected CSV header.');
        masterHeader = false;
        await writeLine(output, importHeader);
        continue;
      }
      const cells = parseCsvLine(line);
      if (cells.length !== 9) throw new Error(`Invalid active master row ${baseRows + 2}.`);
      baseRows++;
      if (cells[0] === metricId && cells[1] === 'main') {
        if (cells[4] !== bykaranteliSource) throw new Error('The existing main series contains an unexpected source; rekey is unsafe.');
        const fundingTime = Date.parse(`${cells[2]}T00:00:00Z`);
        if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cells[3])) throw new Error('Invalid existing ByKaranteli funding value.');
        rekeyedDates.add(cells[2]);
        bykValues.set(cells[2], Number(cells[3]));
        cells[1] = oldSeriesKey;
      }
      const key = keyOf(cells);
      if (oldKeys.has(key)) throw new Error(`Duplicate current master key ${key}.`);
      oldKeys.add(key);
      if (candidateKeys.has(key)) throw new Error(`Binance candidate overlaps an existing key after rekey: ${key}.`);
      await writeLine(output, csvRow(cells));
    }
    if (masterHeader || baseRows !== manifest.observations || rekeyedDates.size !== expectedRekeyedRows) {
      throw new Error('Active master row count or ByKaranteli series size differs from the checked expectation.');
    }
    for (const cells of candidates) {
      const key = keyOf(cells);
      if (oldKeys.has(key)) throw new Error(`Binance candidate collides with transformed master key ${key}.`);
      oldKeys.add(key);
      await writeLine(output, csvRow(cells));
    }
    output.end();
    await once(output, 'close');
  } catch (error) {
    output.destroy();
    if (fs.existsSync(nextMasterPath)) fs.unlinkSync(nextMasterPath);
    throw error;
  }

  for (const date of rekeyedDates) {
    if (!daily.has(date)) throw new Error(`Binance-Tagesreihe hat keinen Überlappungswert für ${date}.`);
  }
  let roundedMatches = 0;
  for (const date of rekeyedDates) {
    const dailyMean = daily.get(date).reduce((sum, row) => sum + Number(row.fundingRate) * 100, 0) / daily.get(date).length;
    if (Math.abs(dailyMean - bykValues.get(date)) < 0.0000005) roundedMatches++;
  }

  const summary = await summarize(nextMasterPath, catalog);
  const summaryCheck = {
    expectedRows: manifest.observations + expectedCandidateRows,
    actualRows: summary.rows,
    expectedMetricIds: manifest.metricIdsWithObservations,
    actualMetricIds: summary.metricIds.size,
    expectedCoreMetricIds: manifest.coreMetricIdsWithObservations,
    actualCoreMetricIds: summary.coreMetricIds.size,
    expectedLastDate: cutoff,
    actualLastDate: summary.lastDate,
    rowsAfterCutoff: summary.rowsAfterCutoff,
    expectedByKaranteliRows: manifest.sourceCounts[bykaranteliSource] || 0,
    actualByKaranteliRows: summary.sourceCounts[bykaranteliSource],
    expectedBinanceRows: expectedCandidateRows,
    actualBinanceRows: summary.sourceCounts[binanceSource],
  };
  if (summary.rows !== manifest.observations + expectedCandidateRows
      || summary.metricIds.size !== manifest.metricIdsWithObservations || summary.coreMetricIds.size !== manifest.coreMetricIdsWithObservations
      || summary.lastDate !== cutoff || summary.rowsAfterCutoff !== 0
      || summary.sourceCounts[bykaranteliSource] !== (manifest.sourceCounts[bykaranteliSource] || 0)
      || summary.sourceCounts[binanceSource] !== expectedCandidateRows) {
    throw new Error(`Prepared master summary did not reconcile: ${JSON.stringify(summaryCheck)}.`);
  }
  const newHash = await fileHash(nextMasterPath);
  const newBytes = fs.statSync(nextMasterPath).size;
  const emptyMetricIds = catalog.metrics.filter((metric) => !summary.metricIds.has(metric.id)).map((metric) => metric.id).sort();
  const emptyCoreMetricIds = catalog.coreMetricIds.filter((id) => !summary.coreMetricIds.has(id));
  const excludedCrossMarketIds = new Set([
    'btc_gold_ratio', 'btc_sp500_corr_90d', 'btc_gold_corr_90d', 'btc_sp500_corr_1y',
    'btc_gold_corr_1y', 'btc_sp500_relative_return_1y_pct', 'btc_real_price_usd',
  ]);
  const emptyBitcoinMetricIds = catalog.metrics.filter((metric) => metric.category !== 'macro'
    && !excludedCrossMarketIds.has(metric.id) && emptyMetricIds.includes(metric.id)).map((metric) => metric.id).sort();

  const record = {
    runDate: new Date().toISOString().slice(0, 10),
    cutoffInclusive: cutoff,
    source: 'Binance USDⓈ-M Futures public REST API',
    sourceUrl: raw.sourceUrl,
    documentationUrl: raw.documentationUrl,
    symbol: 'BTCUSDT',
    metricId,
    primarySeries: 'main',
    previousByKaranteliSeries: oldSeriesKey,
    candidateRows: candidates.length,
    rekeyedExistingRows: rekeyedDates.size,
    sourceEventRows: raw.recordCount,
    firstObservation: '2019-09-10',
    lastObservation: cutoff,
    eventAggregation: raw.dailyAggregation,
    firstDaySettlementCount: daily.get('2019-09-10').length,
    latestDaySettlementCount: daily.get(cutoff).length,
    overlapDays: rekeyedDates.size,
    overlapRoundedMatches: roundedMatches,
    sourceMethodBoundary: `The ByKaranteli BTCUSDT daily snapshot remains as ${oldSeriesKey}; Binance settlement means are the main series. Only ${roundedMatches} of ${rekeyedDates.size} overlapping dates round to the same value at the imported precision.`,
    rawFile: path.basename(rawPath),
    rawSha256: hashText(rawBuffer),
    candidateFile: path.basename(candidatePath),
    candidateBytes: candidateBuffer.length,
    candidateSha256: hashText(candidateBuffer),
    masterRowsBefore: manifest.observations,
    masterRowsAfter: summary.rows,
    masterBytesAfter: newBytes,
    masterSha256After: newHash,
    previousMasterBackup: { path: path.basename(backupPath), bytes: masterBytes, sha256: masterSha256 },
    uploaded: false,
    publicRedistributionCleared: false,
  };

  const updatedManifest = {
    ...manifest,
    generatedAt: new Date().toISOString().slice(0, 10),
    masterBytes: newBytes,
    masterSha256: newHash,
    observations: summary.rows,
    metricIdsWithObservations: summary.metricIds.size,
    catalogMetricIds: catalog.metrics.length,
    coreMetricIdsWithObservations: summary.coreMetricIds.size,
    coreMetricIds: catalog.coreMetricIds.length,
    emptyMetricIds: emptyMetricIds.length,
    emptyMetricIdList: emptyMetricIds,
    emptyCoreMetricIds: emptyCoreMetricIds.length,
    emptyCoreMetricIdList: emptyCoreMetricIds,
    firstObservationDate: summary.firstDate,
    lastObservationDate: summary.lastDate,
    rowsAfterCutoff: summary.rowsAfterCutoff,
    sourceCounts: summary.sourceCounts,
    latestBitcoinDataRefresh: record,
    sourceRefreshHistory: [...(manifest.sourceRefreshHistory || []), record],
    qualityNotes: [...(manifest.qualityNotes || []), `Added ${candidates.length} daily Binance BTCUSDT settlement-rate means (${raw.recordCount} payments) from ${record.firstObservation} through ${cutoff}. Kept ${rekeyedDates.size} overlapping ByKaranteli snapshots as series ${oldSeriesKey}; only ${roundedMatches} overlap values match at imported precision. Binance data remain local provisional research; public redistribution rights are not cleared.`],
  };
  if (updatedManifest.scope) {
    updatedManifest.scope.newObservationsAfterPreviousLocalMaster = (updatedManifest.scope.newObservationsAfterPreviousLocalMaster || 0) + candidates.length;
    updatedManifest.scope.remainingEmptyBitcoinMetricIds = emptyBitcoinMetricIds.length;
    updatedManifest.scope.remainingEmptyCoreMetricIds = emptyCoreMetricIds.length;
    updatedManifest.scope.binanceFundingDailyMean = record;
  }
  fs.writeFileSync(nextManifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

  try {
    fs.copyFileSync(masterPath, backupPath, fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(manifestPath, manifestBackupPath, fs.constants.COPYFILE_EXCL);
    if (await fileHash(backupPath) !== masterSha256 || fs.statSync(backupPath).size !== masterBytes) throw new Error('Master backup did not verify.');
    fs.renameSync(nextMasterPath, masterPath);
    fs.renameSync(nextManifestPath, manifestPath);
    if (await fileHash(masterPath) !== newHash || fs.statSync(masterPath).size !== newBytes) throw new Error('Promoted master did not verify.');
  } catch (error) {
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, masterPath);
    if (fs.existsSync(manifestBackupPath)) fs.copyFileSync(manifestBackupPath, manifestPath);
    for (const filename of [nextMasterPath, nextManifestPath]) if (fs.existsSync(filename)) fs.unlinkSync(filename);
    throw error;
  }

  console.log(JSON.stringify({
    addedObservations: candidates.length,
    rekeyedExistingRows: rekeyedDates.size,
    overlapRoundedMatches: roundedMatches,
    rows: summary.rows,
    metricIdsWithObservations: summary.metricIds.size,
    coreMetricIdsWithObservations: summary.coreMetricIds.size,
    emptyBitcoinMetricIds: emptyBitcoinMetricIds.length,
    emptyCoreMetricIds: emptyCoreMetricIds.length,
    sourceCounts: summary.sourceCounts,
    masterBytes: newBytes,
    masterSha256: newHash,
    backup: path.basename(backupPath),
    manifestBackup: path.basename(manifestBackupPath),
    uploaded: false,
    publicRedistributionCleared: false,
  }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
