const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const catalogPath = path.join(root, 'data', 'catalog.json');
const cutoff = '2026-09-28';
const overlapDate = '2026-09-10';
const startTimestamp = Date.parse(overlapDate + 'T00:00:00Z');
const endTimestamp = Date.parse('2026-09-29T00:00:00Z');
const sourceSlug = 'deribit_public_api';
const metricId = 'options_iv_30d_pct';
const endpoint = 'https://www.deribit.com/api/v2/public/get_volatility_index_data';
const termsUrl = 'https://support.deribit.com/hc/en-us/articles/25944532191645-Deribit-Exchange-Membership-Terms-Deribit-FZE';
const rawPath = path.join(varDir, 'deribit-dvol-public-api-refresh-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'deribit-dvol-public-api-import-through-2026-09-28.csv');
const manifestPath = path.join(varDir, 'deribit-dvol-public-api-refresh-through-2026-09-28.json.meta.json');
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const revision = 'deribit-public-get-volatility-index-data:1D';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatValue(value) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('DVOL value must be a positive finite number.');
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

function csvRow(values) {
  return values.map((value) => {
    const text = String(value);
    return /[,"\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }).join(',');
}

async function readOverlapValue() {
  const input = readline.createInterface({ input: fs.createReadStream(masterPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let headerSeen = false;
  let found = null;
  for await (const line of input) {
    if (!headerSeen) {
      headerSeen = true;
      if (line.replace(/^\uFEFF/, '') !== header) throw new Error('Bitcoin master has an unexpected CSV header.');
      continue;
    }
    if (!line) continue;
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Bitcoin master contains a row with an unexpected column count.');
    if (cells[0] === metricId && cells[1] === 'main' && cells[2] === overlapDate) {
      if (found) throw new Error('Bitcoin master contains a duplicate DVOL overlap date.');
      found = { value: cells[3], source: cells[4] };
    }
  }
  if (!found) throw new Error('Bitcoin master is missing the expected DVOL overlap point.');
  return found;
}

async function main() {
  for (const filename of [masterPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error('Required file is missing: ' + path.basename(filename));
  }
  for (const filename of [rawPath, candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error('Refusing to overwrite existing file: ' + path.basename(filename));
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const metric = catalog.metrics.find((item) => item.id === metricId);
  if (!metric || metric.frequency !== 'daily' || !metric.description.includes('Deribit-DVOL')) {
    throw new Error('The Bitcoin catalog does not define the expected daily Deribit DVOL series.');
  }
  const overlap = await readOverlapValue();
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set('currency', 'BTC');
  requestUrl.searchParams.set('start_timestamp', String(startTimestamp));
  requestUrl.searchParams.set('end_timestamp', String(endTimestamp));
  requestUrl.searchParams.set('resolution', '1D');
  const response = await fetch(requestUrl, {
    headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 private-research' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Deribit returned HTTP ' + response.status + '.');
  const rawBuffer = Buffer.from(await response.arrayBuffer());
  const payload = JSON.parse(rawBuffer.toString('utf8'));
  if (!Array.isArray(payload?.result?.data)) throw new Error('Deribit response is missing result.data.');

  const candles = new Map();
  for (const row of payload.result.data) {
    if (!Array.isArray(row) || row.length !== 5) throw new Error('Deribit returned a candle with an unexpected shape.');
    const [timestamp, open, high, low, close] = row;
    if (!Number.isSafeInteger(timestamp) || timestamp % 86400000 !== 0
      || ![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)
      || high < Math.max(open, close) || low > Math.min(open, close) || high < low) {
      throw new Error('Deribit returned an invalid daily BTC-DVOL candle.');
    }
    const date = new Date(timestamp).toISOString().slice(0, 10);
    if (date < overlapDate) throw new Error('Deribit returned a date before the requested overlap.');
    if (candles.has(date)) throw new Error('Deribit returned duplicate daily candles for ' + date + '.');
    candles.set(date, { row, timestamp, open, high, low, close });
  }

  const expected = [];
  for (let timestamp = startTimestamp; timestamp <= Date.parse(cutoff + 'T00:00:00Z'); timestamp += 86400000) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    if (!candles.has(date)) throw new Error('Deribit daily BTC-DVOL data is missing ' + date + '.');
    expected.push(date);
  }
  const includedDates = expected.filter((date) => date > overlapDate);
  if (includedDates.length !== 18) throw new Error('Expected 18 new daily observations through the cutoff.');

  const candidateRows = includedDates.map((date) => {
    const candle = candles.get(date);
    const sourceTimestamp = new Date(candle.timestamp).toISOString();
    return [
      metricId,
      'main',
      date,
      formatValue(candle.close),
      sourceSlug,
      sourceTimestamp,
      'provisional',
      revision,
      sha256(JSON.stringify(candle.row)),
    ];
  });
  const candidateBuffer = Buffer.from(header + '\n' + candidateRows.map(csvRow).join('\n') + '\n', 'utf8');
  const overlapCandle = candles.get(overlapDate);
  const discardedAfterCutoff = [...candles.keys()].filter((date) => date > cutoff).sort();
  const metadata = {
    runDate: new Date().toISOString().slice(0, 10),
    metricId,
    metricLabel: metric.label,
    unit: metric.unit,
    sourceSlug,
    sourceUrl: endpoint,
    sourceDocumentationUrl: 'https://docs.deribit.com/api-reference/market-data/public-get_volatility_index_data',
    sourceTermsUrl: termsUrl,
    requestUrl: requestUrl.toString(),
    currency: 'BTC',
    resolution: '1D',
    method: 'Deribit BTC DVOL daily candle close, the annualized 30-day forward implied-volatility index computed from BTC option prices.',
    cutoffInclusive: cutoff,
    rawCandleRows: payload.result.data.length,
    candidateRows: candidateRows.length,
    overlapDate,
    overlapExistingValue: overlap.value,
    overlapExistingSource: overlap.source,
    overlapApiClose: formatValue(overlapCandle.close),
    overlapAbsoluteDifference: formatValue(Math.abs(Number(overlap.value) - overlapCandle.close)),
    observationStart: includedDates[0],
    observationEnd: includedDates[includedDates.length - 1],
    discardedAfterCutoff,
    rawFile: path.basename(rawPath),
    rawBytes: rawBuffer.length,
    rawSha256: sha256(rawBuffer),
    candidateFile: path.basename(candidatePath),
    candidateBytes: candidateBuffer.length,
    candidateSha256: sha256(candidateBuffer),
    dataUse: 'Personal local use only. Do not aggregate, resell, publish, forward, or otherwise process outside personal use without Deribit approval.',
    publicRedistributionCleared: false,
    uploaded: false,
  };
  const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2) + '\n', 'utf8');

  const written = [];
  try {
    for (const [filename, buffer] of [
      [rawPath, rawBuffer],
      [candidatePath, candidateBuffer],
      [manifestPath, metadataBuffer],
    ]) {
      fs.writeFileSync(filename, buffer, { flag: 'wx' });
      written.push(filename);
    }
  } catch (error) {
    for (const filename of written) fs.unlinkSync(filename);
    throw error;
  }
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
