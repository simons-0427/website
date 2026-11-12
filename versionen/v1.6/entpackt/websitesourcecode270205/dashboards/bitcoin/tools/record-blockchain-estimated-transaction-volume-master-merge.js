#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const metricId = 'estimated_transaction_volume_btc';
const sourceSlug = 'blockchain_com_charts_api_research_only';
const sourceRevision = 'blockchain-com-estimated-transaction-volume-daily-v1';
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const manifestPath = path.join(varDir, `manifest-through-${cutoff}.json`);
const candidatePath = path.join(varDir, `blockchain-com-estimated-transaction-volume-btc-candidate-through-${cutoff}.csv`);
const candidateManifestPath = path.join(varDir, `blockchain-com-estimated-transaction-volume-btc-candidate-through-${cutoff}.json`);
const rawPath = path.join(varDir, `blockchain-com-estimated-transaction-volume-raw-through-${cutoff}.json`);
const nextMasterPath = `${masterPath}.next`;
const nextManifestPath = `${manifestPath}.next`;
const nextCandidateManifestPath = `${candidateManifestPath}.next`;
const mergeManifestPath = path.join(varDir, `blockchain-com-estimated-transaction-volume-btc-master-merge-through-${cutoff}.json`);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function inspectMaster(filename, catalog) {
  const reader = readline.createInterface({ input: fs.createReadStream(filename, { encoding: 'utf8' }), crlfDelay: Infinity });
  const metricIds = new Set();
  const coreIds = new Set();
  const sourceCounts = {};
  let rows = 0;
  let firstDate = null;
  let lastDate = null;
  let rowsAfterCutoff = 0;
  let firstLine = true;
  for await (const line of reader) {
    if (firstLine) {
      firstLine = false;
      if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error('Unerwarteter Master-CSV-Kopf.');
      continue;
    }
    if (!line) continue;
    rows++;
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Master-Zeile ${rows + 1}.`);
    const [id, , date, , source] = cells;
    metricIds.add(id);
    if (catalog.coreMetricIds.includes(id)) coreIds.add(id);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;
    if (date > cutoff) rowsAfterCutoff++;
  }
  const emptyMetricIds = catalog.metrics.map((metric) => metric.id).filter((id) => !metricIds.has(id)).sort();
  const emptyCoreMetricIds = catalog.coreMetricIds.filter((id) => !coreIds.has(id)).sort();
  return { rows, metricIds: metricIds.size, metricIdSet: metricIds, coreMetricIds: coreIds.size, emptyMetricIds, emptyCoreMetricIds, firstDate, lastDate, rowsAfterCutoff, sourceCounts };
}

async function main() {
  for (const filename of [masterPath, manifestPath, candidatePath, candidateManifestPath, rawPath]) {
    if (!fs.existsSync(filename)) throw new Error(`Datei fehlt: ${path.relative(root, filename)}`);
  }
  for (const filename of [nextMasterPath, nextManifestPath, nextCandidateManifestPath, mergeManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Merge-Ausgabe existiert bereits: ${path.relative(root, filename)}`);
  }

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
  const rootManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const candidateBytes = fs.readFileSync(candidatePath);
  const rawBytes = fs.readFileSync(rawPath);
  const candidateHash = sha256(candidateBytes);
  if (candidateHash !== candidateManifest.outputSha256 || candidateHash !== '6a790c252188bfa76d03d18c1b61c58035d0da195226d7927a12cc36215ebb07') {
    throw new Error('Kandidaten-CSV-Hash stimmt nicht mit dem geprüften Kandidatenstand überein.');
  }
  if (sha256(rawBytes) !== candidateManifest.rawSha256) throw new Error('Rohantwort-Hash passt nicht zum Kandidatenmanifest.');
  if (candidateManifest.cutoffInclusive !== cutoff || candidateManifest.metricId !== metricId
    || candidateManifest.sourceSlug !== sourceSlug || candidateManifest.uploaded !== false
    || candidateManifest.databaseImported !== false || candidateManifest.publicRedistributionCleared !== false) {
    throw new Error('Stichtag, Kennzahl, Quelle oder private Nutzungsgrenze im Kandidatenmanifest weicht ab.');
  }

  const raw = JSON.parse(rawBytes.toString('utf8'));
  if (raw.status !== 'ok' || raw.name !== 'Estimated Transaction Value' || raw.unit !== 'BTC' || raw.period !== 'day'
    || !/does not include coins returned to sender as change/i.test(raw.description || '')) {
    throw new Error('Die Rohantwort enthält nicht die zuvor geprüfte Chartdefinition.');
  }
  const rawByDate = new Map();
  for (const point of raw.values) {
    const date = new Date(point.x * 1000).toISOString().slice(0, 10);
    if (!Number.isSafeInteger(point.x) || point.x % 86400 !== 0 || !Number.isFinite(point.y) || point.y < 0 || rawByDate.has(date)) {
      throw new Error(`Ungültiger Rohdatenpunkt: ${date}`);
    }
    rawByDate.set(date, point);
  }

  const candidateLines = candidateBytes.toString('utf8').trimEnd().split(/\r?\n/);
  if (candidateLines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Der Kandidaten-CSV-Kopf weicht ab.');
  const rows = [];
  const candidateDates = new Set();
  for (const [index, line] of candidateLines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Kandidatenzeile ${index + 2}.`);
    const [id, series, date, value, source, timestamp, quality, revision, hash] = cells;
    const point = rawByDate.get(date);
    if (id !== metricId || series !== 'main' || source !== sourceSlug || quality !== 'provisional'
      || revision !== sourceRevision || date > cutoff || timestamp !== `${date} 00:00:00`
      || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(value)
      || !/^[a-f0-9]{64}$/.test(hash) || !point || value !== point.y.toFixed(12)
      || hash !== sha256(JSON.stringify({ x: point.x, y: point.y })) || candidateDates.has(date)) {
      throw new Error(`Kandidatenzeile ${index + 2} passt nicht zum Bitcoin.com Rohdatensatz.`);
    }
    candidateDates.add(date);
    rows.push(line);
  }
  if (rows.length !== candidateManifest.observations) throw new Error('Kandidatenzeilenzahl passt nicht zum Manifest.');
  const calculatedMissingDates = [];
  for (let date = candidateManifest.firstObservation; date <= cutoff; date = nextDate(date)) {
    if (!candidateDates.has(date)) calculatedMissingDates.push(date);
  }
  if (JSON.stringify(calculatedMissingDates) !== JSON.stringify(candidateManifest.missingSourceDates)) {
    throw new Error('Die protokollierten Quelllücken passen nicht zum Kandidaten.');
  }
  if (!catalog.metrics.some((metric) => metric.id === metricId) || catalog.coreMetricIds.includes(metricId)) {
    throw new Error('Die neue Reihe fehlt im Katalog oder ist unerwartet eine Kernkennzahl.');
  }

  const priorHash = await sha256File(masterPath);
  if (priorHash !== rootManifest.masterSha256) throw new Error(`Master-Hash passt nicht zum Manifest: ${priorHash}`);
  const before = await inspectMaster(masterPath, catalog);
  if (before.metricIdSet.has(metricId)) throw new Error('Die Zielkennzahl ist bereits im Master enthalten.');
  if (before.rows !== rootManifest.observations || before.metricIds !== rootManifest.metricIdsWithObservations
    || before.coreMetricIds !== rootManifest.coreMetricIdsWithObservations) {
    throw new Error('Master-Zeilen oder Kennzahlzahlen weichen vom bisherigen Manifest ab.');
  }

  const backupToken = new Date().toISOString().replace(/[:.]/g, '-');
  const masterBackup = path.join(varDir, `bitcoin-backfill-cointime-cftc-options-before-blockchain-com-estimated-volume-${backupToken}.csv`);
  const manifestBackup = path.join(varDir, `manifest-before-blockchain-com-estimated-volume-${backupToken}.json`);
  const candidateManifestBackup = `${candidateManifestPath}.before-merge-${backupToken}`;
  for (const filename of [masterBackup, manifestBackup, candidateManifestBackup]) {
    if (fs.existsSync(filename)) throw new Error(`Sicherungsdatei existiert bereits: ${path.basename(filename)}`);
  }

  fs.copyFileSync(masterPath, nextMasterPath, fs.constants.COPYFILE_EXCL);
  const masterSize = fs.statSync(masterPath).size;
  const lastByte = Buffer.alloc(1);
  const masterFd = fs.openSync(masterPath, 'r');
  try { fs.readSync(masterFd, lastByte, 0, 1, masterSize - 1); } finally { fs.closeSync(masterFd); }
  const separator = lastByte[0] === 10 ? '' : '\n';
  fs.appendFileSync(nextMasterPath, `${separator}${rows.join('\n')}\n`, 'utf8');
  const afterBytes = fs.statSync(nextMasterPath).size;
  const after = await inspectMaster(nextMasterPath, catalog);
  if (after.rows !== before.rows + rows.length || after.metricIds !== before.metricIds + 1
    || after.rowsAfterCutoff !== 0 || after.coreMetricIds !== before.coreMetricIds) {
    throw new Error('Die neue Masterdatei hat unerwartete Zeilen, IDs, Kernabdeckung oder Stichtage.');
  }
  const mergedHash = await sha256File(nextMasterPath);
  const runDate = new Date().toISOString().slice(0, 10);
  const localAddition = {
    runDate,
    cutoffInclusive: cutoff,
    observationsAdded: rows.length,
    metricIdsAdded: [metricId],
    firstDate: candidateManifest.firstObservation,
    lastDate: candidateManifest.lastObservation,
    sourceLastObservation: candidateManifest.sourceLastObservation,
    missingSourceDates: candidateManifest.missingSourceDates,
    candidate: path.basename(candidatePath),
    candidateManifest: path.basename(candidateManifestPath),
    candidateSha256: candidateHash,
    rawResearchFile: path.basename(rawPath),
    rawResearchSha256: candidateManifest.rawSha256,
    masterBackup: path.basename(masterBackup),
    manifestBackup: path.basename(manifestBackup),
    previousMasterSha256: priorHash,
    mergedMasterSha256: mergedHash,
    mergedMasterBytes: afterBytes,
    source: candidateManifest.source,
    sourceSlug,
    qualityStatus: 'provisional',
    privatePersonalUseOnly: true,
    publicRedistributionCleared: false,
    uploaded: false,
    databaseImported: false,
    bitcoinOnly: true,
  };

  const nextManifest = { ...rootManifest };
  nextManifest.generatedAt = runDate;
  nextManifest.masterBytes = afterBytes;
  nextManifest.masterSha256 = mergedHash;
  nextManifest.observations = after.rows;
  nextManifest.metricIdsWithObservations = after.metricIds;
  nextManifest.catalogMetricIds = catalog.metrics.length;
  nextManifest.coreMetricIdsWithObservations = after.coreMetricIds;
  nextManifest.coreMetricIds = catalog.coreMetricIds.length;
  nextManifest.emptyMetricIds = after.emptyMetricIds.length;
  nextManifest.emptyMetricIdList = after.emptyMetricIds;
  nextManifest.emptyCoreMetricIds = after.emptyCoreMetricIds.length;
  nextManifest.emptyCoreMetricIdList = after.emptyCoreMetricIds;
  nextManifest.firstObservationDate = after.firstDate;
  nextManifest.lastObservationDate = after.lastDate;
  nextManifest.rowsAfterCutoff = after.rowsAfterCutoff;
  nextManifest.sourceCounts = after.sourceCounts;
  nextManifest.latestLocalAddition = localAddition;
  nextManifest.localAdditionHistory ||= [];
  nextManifest.localAdditionHistory.push(localAddition);
  nextManifest.qualityNotes ||= [];
  nextManifest.qualityNotes.push(`${runDate}: locally added ${rows.length} Blockchain.com estimated transaction value BTC observations from ${candidateManifest.firstObservation} through ${candidateManifest.lastObservation}; 22 source gaps within the observed span, 2026-09-28 was not served; private research only, no public redistribution clearance, database import, or upload.`);
  nextManifest.scope ||= {};
  const standaloneMacroIds = new Set(['usd_index_dxy', 'gold_usd_oz', 'sp500_index', 'nasdaq100_index', 'us_10y_yield_pct', 'fed_funds_rate_pct']);
  const remainingBitcoinMetricIds = after.emptyMetricIds.filter((id) => !standaloneMacroIds.has(id));
  nextManifest.scope.remainingEmptyBitcoinMetricIds = remainingBitcoinMetricIds.length;
  nextManifest.scope.remainingEmptyBitcoinMetricIdList = remainingBitcoinMetricIds;
  nextManifest.scope.remainingEmptyCoreMetricIds = after.emptyCoreMetricIds;
  nextManifest.scope.latestBlockchainComEstimatedTransactionVolume = {
    candidate: path.basename(candidatePath),
    metricId,
    observations: rows.length,
    firstObservation: candidateManifest.firstObservation,
    lastObservation: candidateManifest.lastObservation,
    missingSourceDates: candidateManifest.missingSourceDates,
    privatePersonalUseOnly: true,
    uploaded: false,
    databaseImported: false,
  };

  const nextCandidateManifest = {
    ...candidateManifest,
    candidateOnly: false,
    mergedIntoMaster: true,
    mergedAt: new Date().toISOString(),
    masterBackup: path.basename(masterBackup),
    manifestBackup: path.basename(manifestBackup),
    candidateManifestBackup: path.basename(candidateManifestBackup),
    previousMasterSha256: priorHash,
    mergedMasterSha256: mergedHash,
    mergedMasterBytes: afterBytes,
  };
  const mergeSummary = {
    master: path.relative(root, masterPath),
    masterRowsBefore: before.rows,
    masterRowsAfter: after.rows,
    priorMasterSha256: priorHash,
    masterSha256: mergedHash,
    masterBytes: afterBytes,
    backup: path.relative(root, masterBackup),
    candidate: path.relative(root, candidatePath),
    candidateSha256: candidateHash,
    addedRows: rows.length,
    source: candidateManifest.source,
    sourceSlug,
    metricId,
    firstObservation: candidateManifest.firstObservation,
    lastObservation: candidateManifest.lastObservation,
    sourceGapCountWithinObservedSpan: 22,
    missingSourceDates: candidateManifest.missingSourceDates,
    metricIdsWithObservations: after.metricIds,
    catalogMetricIds: catalog.metrics.length,
    coreMetricIdsWithObservations: after.coreMetricIds,
    emptyMetricIds: after.emptyMetricIds.length,
    remainingEmptyBitcoinMetricIds: remainingBitcoinMetricIds.length,
    remainingEmptyCoreMetricIds: after.emptyCoreMetricIds,
    uploaded: false,
    databaseImported: false,
    publicRedistributionCleared: false,
  };

  const nextManifestBytes = Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
  const nextCandidateBytes = Buffer.from(`${JSON.stringify(nextCandidateManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(nextManifestPath, nextManifestBytes, { flag: 'wx' });
  fs.writeFileSync(nextCandidateManifestPath, nextCandidateBytes, { flag: 'wx' });
  fs.writeFileSync(mergeManifestPath, `${JSON.stringify(mergeSummary, null, 2)}\n`, { flag: 'wx' });

  fs.copyFileSync(masterPath, masterBackup, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(manifestPath, manifestBackup, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(candidateManifestPath, candidateManifestBackup, fs.constants.COPYFILE_EXCL);
  const committed = { master: false, manifest: false, candidate: false };
  try {
    fs.renameSync(nextMasterPath, masterPath);
    committed.master = true;
    fs.renameSync(nextManifestPath, manifestPath);
    committed.manifest = true;
    fs.renameSync(nextCandidateManifestPath, candidateManifestPath);
    committed.candidate = true;
  } catch (error) {
    if (committed.candidate) fs.copyFileSync(candidateManifestBackup, candidateManifestPath);
    if (committed.manifest) fs.copyFileSync(manifestBackup, manifestPath);
    if (committed.master) fs.copyFileSync(masterBackup, masterPath);
    throw error;
  }

  console.log(JSON.stringify(mergeSummary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
