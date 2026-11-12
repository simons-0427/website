#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const cutoffInclusive = '2026-09-28';
const apiUrl = 'https://api.blockchain.info/charts/median-confirmation-time?timespan=all&format=json&sampled=false';
const chartUrl = 'https://www.blockchain.com/charts/median-confirmation-time?timespan=all';
const sourceSlug = 'blockchain_com_charts_api_research_only';
const sourceRevision = 'blockchain-com-median-confirmation-time-daily-v1';
const rawPath = path.join(root, 'var', `blockchain-com-median-confirmation-time-raw-through-${cutoffInclusive}.json`);
const csvPath = path.join(root, 'var', `blockchain-com-median-confirmation-time-candidate-through-${cutoffInclusive}.csv`);
const jsonPath = path.join(root, 'var', `blockchain-com-median-confirmation-time-candidate-through-${cutoffInclusive}.json`);
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function summarizeRuns(dates) {
  const sorted = [...dates].sort();
  const runs = [];
  let start = null;
  let previous = null;
  for (const date of sorted) {
    if (!start) {
      start = previous = date;
      continue;
    }
    if (date === nextDate(previous)) {
      previous = date;
      continue;
    }
    runs.push({ start, end: previous, days: (Date.parse(`${previous}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1 });
    start = previous = date;
  }
  if (start) runs.push({ start, end: previous, days: (Date.parse(`${previous}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1 });
  return runs;
}

async function main() {
  for (const outputPath of [rawPath, csvPath, jsonPath]) {
    assert(!fs.existsSync(outputPath), `Refusing to overwrite existing output: ${outputPath}`);
  }

  const response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
  const rawText = await response.text();
  assert(response.ok, `Blockchain.com chart request failed with HTTP ${response.status}.`);
  const data = JSON.parse(rawText);
  assert(data.status === 'ok' && data.name === 'Median Confirmation Time', 'Unexpected chart identity or status.');
  assert(data.unit === 'Minutes' && data.period === 'day', `Unexpected chart unit or period: ${data.unit}, ${data.period}`);
  assert(typeof data.description === 'string' && /only includes transactions with miner fees/i.test(data.description), 'The source definition or fee-paid caveat changed.');
  assert(Array.isArray(data.values) && data.values.length > 0, 'The chart response has no values.');

  const seenDates = new Set();
  const rows = [];
  const zeroDates = [];
  const allDates = [];
  for (const point of data.values) {
    assert(Number.isSafeInteger(point.x) && point.x % 86400 === 0, `Non-UTC-daily chart timestamp: ${point.x}`);
    assert(Number.isFinite(point.y) && point.y >= 0, `Invalid chart value at ${point.x}`);
    const date = new Date(point.x * 1000).toISOString().slice(0, 10);
    assert(!seenDates.has(date), `Duplicate daily date ${date}`);
    seenDates.add(date);
    if (date > cutoffInclusive) continue;
    allDates.push(date);
    if (point.y === 0) {
      zeroDates.push(date);
      continue;
    }
    const rowHash = sha256(JSON.stringify({ x: point.x, y: point.y }));
    rows.push([
      'median_confirmation_delay_min',
      'main',
      date,
      point.y.toFixed(12),
      sourceSlug,
      `${date} 00:00:00`,
      'provisional',
      sourceRevision,
      rowHash,
    ].map(csvCell).join(','));
  }

  assert(allDates.length > 0 && rows.length > 0, 'No candidate rows remain through the cutoff.');
  assert(allDates.at(-1) === cutoffInclusive, `Latest source date through cutoff is ${allDates.at(-1)}, expected ${cutoffInclusive}.`);

  const firstPositive = rows[0].split(',')[2];
  const zeroRuns = summarizeRuns(zeroDates);
  assert(zeroRuns.length === 1 && zeroRuns[0].end < firstPositive, 'Zero values are no longer a single leading run; review their meaning before excluding them.');

  const candidateDates = rows.map((row) => row.split(',')[2]);
  const candidateDateSet = new Set(candidateDates);
  const missingDays = [];
  for (let date = firstPositive; date <= cutoffInclusive; date = nextDate(date)) {
    if (!candidateDateSet.has(date)) missingDays.push(date);
  }

  const csv = `${header}\n${rows.join('\n')}\n`;
  const csvHash = sha256(csv);
  const metadata = {
    dashboard: 'bitcoin',
    candidateOnly: true,
    mergedIntoMaster: false,
    databaseImported: false,
    uploaded: false,
    researchOnly: true,
    publicRedistributionCleared: false,
    cutoffInclusive,
    metricId: 'median_confirmation_delay_min',
    seriesKey: 'main',
    source: 'Blockchain.com Charts API',
    chartUrl,
    apiUrl,
    sourceDefinition: data.description,
    unit: data.unit,
    nativeFrequency: data.period,
    observations: rows.length,
    firstObservation: firstPositive,
    lastObservation: cutoffInclusive,
    output: path.basename(csvPath),
    outputBytes: Buffer.byteLength(csv),
    outputSha256: csvHash,
    rawFile: path.basename(rawPath),
    rawBytes: Buffer.byteLength(rawText),
    rawSha256: sha256(rawText),
    quality: {
      sourceRowsThroughCutoff: allDates.length,
      zeroValuesExcludedAsUndefined: zeroDates.length,
      excludedZeroDateRuns: zeroRuns,
      missingCalendarDatesBetweenFirstPositiveAndCutoff: missingDays,
      duplicateDates: 0,
      invalidOrNegativeValues: 0,
      futureRowsAfterCutoff: data.values.filter((point) => new Date(point.x * 1000).toISOString().slice(0, 10) > cutoffInclusive).length,
      interpolatedValues: 0,
      caveat: 'The official API returns 0 from 2009-01-03 through 2011-12-01, before the first positive confirmation-time value. These zero rows are treated as no valid median observation, not as zero-minute confirmations.',
    },
    rightsNote: 'The official chart offers a JSON download. No separate data redistribution license was identified; keep as private local research until public display rights are confirmed.',
  };
  const json = `${JSON.stringify(metadata, null, 2)}\n`;

  fs.writeFileSync(rawPath, rawText, 'utf8');
  fs.writeFileSync(csvPath, csv, 'utf8');
  fs.writeFileSync(jsonPath, json, 'utf8');
  console.log(JSON.stringify({
    raw: path.relative(process.cwd(), rawPath),
    candidate: path.relative(process.cwd(), csvPath),
    metadata: path.relative(process.cwd(), jsonPath),
    observations: rows.length,
    firstObservation: firstPositive,
    lastObservation: cutoffInclusive,
    zeroValuesExcluded: zeroDates.length,
    missingDays: missingDays.length,
    csvSha256: csvHash,
    candidateOnly: true,
    publicRedistributionCleared: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
