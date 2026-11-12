#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const cutoffInclusive = '2026-09-28';
const apiUrl = 'https://api.blockchain.info/charts/estimated-transaction-volume?timespan=all&format=json&sampled=false';
const chartUrl = 'https://www.blockchain.com/explorer/charts/estimated-transaction-volume';
const sourceSlug = 'blockchain_com_charts_api_research_only';
const sourceRevision = 'blockchain-com-estimated-transaction-volume-daily-v1';
const metricId = 'estimated_transaction_volume_btc';
const rawPath = path.join(root, 'var', `blockchain-com-estimated-transaction-volume-raw-through-${cutoffInclusive}.json`);
const csvPath = path.join(root, 'var', `blockchain-com-estimated-transaction-volume-btc-candidate-through-${cutoffInclusive}.csv`);
const jsonPath = path.join(root, 'var', `blockchain-com-estimated-transaction-volume-btc-candidate-through-${cutoffInclusive}.json`);
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

async function main() {
  for (const outputPath of [rawPath, csvPath, jsonPath]) {
    assert(!fs.existsSync(outputPath), `Refusing to overwrite existing output: ${outputPath}`);
  }

  const response = await fetch(apiUrl, {
    headers: { accept: 'application/json', 'user-agent': 'smstark-bitcoin-data/1.0' },
    signal: AbortSignal.timeout(45000),
  });
  const rawText = await response.text();
  assert(response.ok, `Blockchain.com chart request failed with HTTP ${response.status}.`);
  const data = JSON.parse(rawText);
  assert(data.status === 'ok' && data.name === 'Estimated Transaction Value', 'Unexpected chart identity or status.');
  assert(data.unit === 'BTC' && data.period === 'day', `Unexpected chart unit or period: ${data.unit}, ${data.period}`);
  assert(typeof data.description === 'string' && /does not include coins returned to sender as change/i.test(data.description), 'The source definition or change-output caveat changed.');
  assert(Array.isArray(data.values) && data.values.length > 0, 'The chart response has no values.');

  const rows = [];
  const allDates = [];
  let previousDate = '';
  for (const point of data.values) {
    assert(Number.isSafeInteger(point.x) && point.x % 86400 === 0, `Non-UTC-daily chart timestamp: ${point.x}`);
    assert(Number.isFinite(point.y) && point.y >= 0, `Invalid chart value at ${point.x}`);
    const date = new Date(point.x * 1000).toISOString().slice(0, 10);
    assert(date > previousDate, `Chart dates are duplicate or not ascending at ${date}.`);
    previousDate = date;
    if (date > cutoffInclusive) continue;
    allDates.push(date);
    const rowHash = sha256(JSON.stringify({ x: point.x, y: point.y }));
    rows.push([
      metricId,
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

  assert(rows.length > 0, 'No candidate rows remain through the cutoff.');
  assert(allDates.at(-1) <= cutoffInclusive, 'A source observation is after the requested cutoff.');
  const candidateDates = new Set(allDates);
  const missingSourceDates = [];
  for (let date = allDates[0]; date <= cutoffInclusive; date = nextDate(date)) {
    if (!candidateDates.has(date)) missingSourceDates.push(date);
  }

  const csv = `${header}\n${rows.join('\n')}\n`;
  const csvHash = sha256(csv);
  const rawHash = sha256(rawText);
  const metadata = {
    dashboard: 'bitcoin',
    candidateOnly: true,
    mergedIntoMaster: false,
    databaseImported: false,
    uploaded: false,
    researchOnly: true,
    privatePersonalUseOnly: true,
    publicRedistributionCleared: false,
    cutoffInclusive,
    metricId,
    seriesKey: 'main',
    source: 'Blockchain.com Charts API',
    sourceSlug,
    chartUrl,
    apiUrl,
    sourceDefinition: data.description,
    unit: data.unit,
    nativeFrequency: data.period,
    observations: rows.length,
    firstObservation: allDates[0],
    lastObservation: allDates.at(-1),
    sourceRowsThroughCutoff: allDates.length,
    sourceLastObservation: new Date(data.values.at(-1).x * 1000).toISOString().slice(0, 10),
    missingSourceDates,
    output: path.basename(csvPath),
    outputBytes: Buffer.byteLength(csv),
    outputSha256: csvHash,
    rawFile: path.basename(rawPath),
    rawBytes: Buffer.byteLength(rawText),
    rawSha256: rawHash,
  };

  fs.writeFileSync(rawPath, rawText, { flag: 'wx' });
  fs.writeFileSync(csvPath, csv, { flag: 'wx' });
  fs.writeFileSync(jsonPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
