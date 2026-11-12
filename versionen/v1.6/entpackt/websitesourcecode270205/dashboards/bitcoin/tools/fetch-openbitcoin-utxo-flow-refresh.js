const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const [cutoff, utxoCandidateArg] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '') || !utxoCandidateArg) {
  console.error('Usage: node tools/fetch-openbitcoin-utxo-flow-refresh.js YYYY-MM-DD <utxo-count-candidate.csv>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const genesisDate = '2009-01-03';
const sourceUrl = 'https://raw.githubusercontent.com/diegorllanos/open-bitcoin-metrics/main/metrics/obm_spent_output_count_daily/obm_spent_output_count_daily.csv';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sourceHeader = 'date,series_id,value,unit,frequency,release_version';
const rawPath = path.join(varDir, `openbitcoin-obm-spent-output-count-research-through-${cutoff}.csv`);
const rawManifestPath = path.join(varDir, `openbitcoin-obm-spent-output-count-research-through-${cutoff}.json`);
const candidatePath = path.join(varDir, `openbitcoin-utxo-flow-refresh-through-${cutoff}.csv`);
const candidateManifestPath = path.join(varDir, `openbitcoin-utxo-flow-refresh-through-${cutoff}.json`);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function daysBetween(start, end) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function dateAt(offset) {
  return new Date(Date.parse(`${genesisDate}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

async function download() {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(sourceUrl, {
        headers: { Accept: 'text/csv', 'User-Agent': 'smstark-bitcoin-data/1.0' },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        await new Promise((resolve) => setTimeout(resolve,
          Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Open Bitcoin Metrics returned HTTP ${response.status}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100_000 || bytes.length > 2_000_000) throw new Error('OBM spent-output CSV has an unexpected size.');
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw lastError || new Error('Open Bitcoin Metrics download failed after retries.');
}

async function readUtxoCounts(filename) {
  const byDate = new Map();
  const reader = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let first = true;
  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber++;
    if (first) {
      first = false;
      if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error('UTXO count candidate has an unexpected header.');
      continue;
    }
    if (!line) continue;
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`UTXO candidate line ${lineNumber} has an invalid column count.`);
    if (cells[0] !== 'utxo_count') continue;
    const [, series, date, value, source, , quality, , hash] = cells;
    if (series !== 'main' || source !== 'open_bitcoin_metrics_obm' || quality !== 'provisional'
      || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < genesisDate || date > cutoff
      || !/^\d+$/.test(value) || !/^[a-f0-9]{64}$/.test(hash) || byDate.has(date)) {
      throw new Error(`Invalid UTXO count candidate at ${date}.`);
    }
    byDate.set(date, BigInt(value));
  }
  if (first || byDate.size === 0) throw new Error('UTXO count candidate contains no values.');
  return byDate;
}

async function main() {
  for (const filename of [rawPath, rawManifestPath, candidatePath, candidateManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite existing file ${path.basename(filename)}.`);
  }

  const rawBuffer = await download();
  const rawText = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd();
  const sourceLines = rawText.split(/\r?\n/);
  if (sourceLines.shift() !== sourceHeader) throw new Error('Open Bitcoin Metrics returned an unexpected header.');
  const sourceRows = sourceLines.map((line) => line.split(','));
  const spentByDate = new Map();
  const versions = new Set();
  for (const [index, cells] of sourceRows.entries()) {
    if (cells.length !== 6) throw new Error(`OBM source line ${index + 2} has an invalid column count.`);
    const [date, seriesId, value, unit, frequency, version] = cells;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seriesId !== 'obm_spent_output_count_daily'
      || !/^\d+$/.test(value) || unit !== 'outputs' || frequency !== 'daily'
      || !/^OBM v\d+\.\d+\.\d+$/.test(version) || spentByDate.has(date)) {
      throw new Error(`Invalid or duplicate OBM spent-output row at ${date}.`);
    }
    versions.add(version);
    if (date >= genesisDate && date <= cutoff) spentByDate.set(date, { value: BigInt(value), rawValue: value, version });
  }

  const sourceFirstDate = sourceRows[0]?.[0];
  const sourceLastDate = sourceRows.at(-1)?.[0];
  if (sourceFirstDate !== '2009-01-01' || sourceLastDate > cutoff
    || spentByDate.size !== daysBetween(genesisDate, sourceLastDate) + 1
    || spentByDate.has(genesisDate) !== true) {
    throw new Error('OBM spent-output source does not have complete daily coverage through its latest observation.');
  }
  for (let offset = 0; offset < spentByDate.size; offset++) {
    const date = dateAt(offset);
    if (!spentByDate.has(date)) throw new Error(`Daily OBM spent-output series is missing ${date}.`);
  }

  const utxoCounts = await readUtxoCounts(path.resolve(utxoCandidateArg));
  if (utxoCounts.keys().next().value !== genesisDate || !utxoCounts.has(sourceLastDate)) {
    throw new Error('UTXO stock observations do not span the spent-output range.');
  }

  const rows = [];
  let state = 0n;
  let spentTotal = 0n;
  let createdTotal = 0n;
  let noBlockDays = 0;
  let zeroCreatedDays = 0;
  let minCreated = null;
  let maxCreated = 0n;
  for (let offset = 0; offset < spentByDate.size; offset++) {
    const date = dateAt(offset);
    const spent = spentByDate.get(date);
    const nextState = utxoCounts.has(date) ? utxoCounts.get(date) : state;
    if (!utxoCounts.has(date)) {
      noBlockDays++;
      if (spent.value !== 0n) throw new Error(`OBM reports spent outputs on a date without UTXO stock data: ${date}.`);
    }
    const created = nextState - state + spent.value;
    if (created < 0n) throw new Error(`Derived UTXO creation is negative on ${date}.`);

    const spentHash = sha256(`open-bitcoin-metrics-v0.1.0\x1f${date}\x1fobm_spent_output_count_daily\x1f${spent.rawValue}\x1foutputs\x1fdaily\x1f${spent.version}`);
    rows.push(['utxo_spent_count', 'main', date, spent.value.toString(), 'open_bitcoin_metrics_obm', '', 'provisional', `obm-v0.1.0:obm_spent_output_count_daily:${date}`, spentHash].join(','));

    const createdHash = sha256(`obm-utxo-flow-v1\x1f${date}\x1f${state}\x1f${nextState}\x1f${spent.value}`);
    rows.push(['utxo_created_count', 'main', date, created.toString(), 'derived_bitcoin_metrics', '', 'provisional', `obm-utxo-flow-v1:${date}`, createdHash].join(','));
    if (created === 0n) zeroCreatedDays++;
    if (minCreated === null || created < minCreated) minCreated = created;
    if (created > maxCreated) maxCreated = created;
    createdTotal += created;
    spentTotal += spent.value;
    state = nextState;
  }
  if (createdTotal - spentTotal !== state || versions.size !== 1 || !versions.has('OBM v0.1.0')) {
    throw new Error('UTXO stock-flow identity or release-version check failed.');
  }

  const candidateBuffer = Buffer.from(`${importHeader}\n${rows.join('\n')}\n`, 'utf8');
  const rawManifest = {
    retrievedAt: new Date().toISOString(),
    source: 'Open Bitcoin Metrics',
    sourceUrl: `https://github.com/diegorllanos/open-bitcoin-metrics/tree/main/metrics/obm_spent_output_count_daily`,
    csvUrl: sourceUrl,
    license: 'CC BY 4.0',
    attributionRequired: true,
    metric: 'utxo_spent_count',
    sourceMetric: 'obm_spent_output_count_daily',
    sourceRows: sourceRows.length,
    sourceFirstDate,
    sourceLastDate,
    importRows: spentByDate.size,
    importFirstDate: genesisDate,
    importLastDate: sourceLastDate,
    cutoffInclusive: cutoff,
    bytes: rawBuffer.length,
    sha256: sha256(rawBuffer),
    uploaded: false,
  };
  const candidateManifest = {
    preparedAt: new Date().toISOString(),
    source: 'Open Bitcoin Metrics',
    sourceUrl: rawManifest.sourceUrl,
    license: 'CC BY 4.0',
    attributionRequired: true,
    cutoffInclusive: cutoff,
    observations: rows.length,
    metricIds: ['utxo_created_count', 'utxo_spent_count'],
    metricCounts: { utxo_created_count: spentByDate.size, utxo_spent_count: spentByDate.size },
    firstObservationDate: genesisDate,
    lastObservationDate: sourceLastDate,
    sourceCounts: { derived_bitcoin_metrics: spentByDate.size, open_bitcoin_metrics_obm: spentByDate.size },
    sourceManifest: path.basename(rawManifestPath),
    sourceSha256: rawManifest.sha256,
    utxoStateRows: utxoCounts.size,
    noBlockDaysCarriedForward: noBlockDays,
    derivedCreatedTotal: createdTotal.toString(),
    spentTotal: spentTotal.toString(),
    endUtxoCount: state.toString(),
    createdCountMin: minCreated.toString(),
    createdCountMax: maxCreated.toString(),
    createdCountZeroDays: zeroCreatedDays,
    allCreatedCountsNonNegativeIntegers: true,
    utxoStockFlowIdentityHolds: true,
    methodology: 'utxo_created_count(t) = utxo_count_eod(t) - utxo_count_eod(t-1) + utxo_spent_count(t). On dates without an end-of-day block observation, carry forward only the prior UTXO state; OBM spent count must be zero on those dates. Counts include spendable outputs and exclude provably unspendable outputs under OBM definitions.',
    candidateBytes: candidateBuffer.length,
    candidateSha256: sha256(candidateBuffer),
    uploaded: false,
  };

  const writes = [
    [rawPath, rawBuffer],
    [rawManifestPath, Buffer.from(`${JSON.stringify(rawManifest, null, 2)}\n`, 'utf8')],
    [candidatePath, candidateBuffer],
    [candidateManifestPath, Buffer.from(`${JSON.stringify(candidateManifest, null, 2)}\n`, 'utf8')],
  ];
  const written = [];
  try {
    for (const [filename, bytes] of writes) {
      fs.writeFileSync(filename, bytes, { flag: 'wx' });
      written.push(filename);
    }
  } catch (error) {
    for (const filename of written) fs.unlinkSync(filename);
    throw error;
  }
  console.log(JSON.stringify({ raw: rawManifest, candidate: candidateManifest }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
