const fs = require('node:fs');
const { importHeader, normalizeDecimal } = require('./coinmetrics-format');

const [sourceArg, importArg] = process.argv.slice(2);
if (!sourceArg || !importArg) {
  console.error('Aufruf: node tools/validate-derived-issuance.js <coinmetrics-btc.csv> <fertiger-import.csv>');
  process.exit(1);
}

function readCsv(filename, expectedHeader) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  const header = lines.shift()?.replace(/^\uFEFF/, '').split(',');
  if (!header || !header.length) {
    throw new Error(`CSV ist leer oder ungültig: ${filename}`);
  }
  if (expectedHeader && header.join(',') !== expectedHeader) {
    throw new Error(`Unerwarteter CSV-Kopf: ${filename}`);
  }
  return { header, lines };
}

const source = readCsv(sourceArg);
const sourceColumns = new Map(source.header.map((name, index) => [name, index]));
for (const column of ['time', 'BlkCnt', 'IssTotNtv']) {
  if (!sourceColumns.has(column)) throw new Error(`Coin-Metrics-Archiv: Spalte ${column} fehlt.`);
}

const reportedByDate = new Map();
let missingSourceRows = 0;
let sourceFirst = null;
let sourceLast = null;
let previousDate = '';
for (const [index, line] of source.lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== source.header.length) throw new Error(`Archivzeile ${index + 2}: Spaltenzahl weicht ab.`);
  const date = cells[sourceColumns.get('time')];
  const blockCount = cells[sourceColumns.get('BlkCnt')];
  const reported = cells[sourceColumns.get('IssTotNtv')];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= previousDate) {
    throw new Error(`Archivzeile ${index + 2}: Datum ungültig oder nicht aufsteigend.`);
  }
  previousDate = date;
  if (blockCount === '') continue;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(blockCount)) {
    throw new Error(`Archivzeile ${index + 2}: ungültige BlkCnt-Angabe.`);
  }
  if (reported === '') {
    missingSourceRows++;
    continue;
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(reported)) {
    throw new Error(`Archivzeile ${index + 2}: ungültige IssTotNtv-Angabe.`);
  }
  reportedByDate.set(date, reported);
  sourceFirst ||= date;
  sourceLast = date;
}

const prepared = readCsv(importArg, importHeader);
const preparedColumns = new Map(prepared.header.map((name, index) => [name, index]));
const derivedByDate = new Map();
for (const [index, line] of prepared.lines.entries()) {
  const cells = line.split(',');
  if (cells.length !== prepared.header.length) throw new Error(`Importzeile ${index + 2}: Spaltenzahl weicht ab.`);
  if (cells[preparedColumns.get('metric_id')] !== 'issued_btc_daily') continue;
  const date = cells[preparedColumns.get('observation_date')];
  if (derivedByDate.has(date)) throw new Error(`Doppelte abgeleitete Ausgabe am ${date}.`);
  derivedByDate.set(date, cells[preparedColumns.get('value')]);
}

let compared = 0;
let missingDerivedRows = 0;
let mismatchRows = 0;
const mismatches = [];
for (const [date, reported] of reportedByDate) {
  const derived = derivedByDate.get(date);
  if (derived === undefined) {
    missingDerivedRows++;
    if (mismatches.length < 10) mismatches.push({ date, reported, derived: null });
    continue;
  }
  compared++;
  const expected = normalizeDecimal(reported);
  const actual = normalizeDecimal(derived);
  if (expected !== actual) {
    mismatchRows++;
    if (mismatches.length < 10) mismatches.push({ date, reported: expected, derived: actual });
  }
}

const result = {
  compared,
  mismatches: mismatchRows,
  missingDerivedRows,
  sourceRowsWithoutIssuance: missingSourceRows,
  sourceCoverage: { first: sourceFirst, last: sourceLast },
  sampleMismatches: mismatches,
};
console.log(JSON.stringify(result, null, 2));
if (compared === 0 || mismatchRows > 0 || missingDerivedRows > 0) process.exitCode = 2;
