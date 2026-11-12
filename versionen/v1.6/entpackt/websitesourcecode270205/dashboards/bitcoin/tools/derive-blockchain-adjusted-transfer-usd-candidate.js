const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const cutoff = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '')) {
  console.error('Usage: node tools/derive-blockchain-adjusted-transfer-usd-candidate.js YYYY-MM-DD');
  process.exit(1);
}

const dashboardRoot = path.resolve(__dirname, '..');
const varDir = path.join(dashboardRoot, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const candidatePath = path.join(varDir, 'blockchain-adjusted-transfer-value-usd-through-' + cutoff + '.csv');
const manifestPath = path.join(varDir, 'blockchain-adjusted-transfer-value-usd-through-' + cutoff + '.json');
const sourceSlug = 'derived_blockchain_adjusted_transfer_usd_research_only';
const header = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

for (const target of [candidatePath, manifestPath]) {
  if (fs.existsSync(target)) throw new Error('Refusing to overwrite ' + path.basename(target));
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function positive(value, context) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('Invalid positive input in ' + context);
  return number;
}

function decimalText(value) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('A derived value is invalid.');
  return Number(value.toFixed(12)).toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

async function readInputs() {
  const volume = new Map();
  const price = new Map();
  let headerSeen = false;
  let rowsAfterCutoff = 0;
  const reader = readline.createInterface({
    input: fs.createReadStream(masterPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of reader) {
    if (!headerSeen) {
      headerSeen = true;
      if (line.replace(/^\uFEFF/, '') !== header) throw new Error('Unexpected master header.');
      continue;
    }
    if (!line.startsWith('estimated_transaction_volume_btc,main,') && !line.startsWith('price_usd,main,')) continue;
    const cells = line.split(',');
    if (cells.length !== 9 || !datePattern.test(cells[2])) throw new Error('Malformed Bitcoin input row.');
    if (cells[2] > cutoff) {
      rowsAfterCutoff++;
      continue;
    }
    const target = cells[0] === 'price_usd' ? price : volume;
    if (target.has(cells[2])) throw new Error('Duplicate input date: ' + cells[0] + ':' + cells[2]);
    target.set(cells[2], {
      value: positive(cells[3], cells[0] + ':' + cells[2]),
      sourceSlug: cells[4],
      rowHash: sha256(line),
    });
  }
  if (rowsAfterCutoff !== 0) throw new Error('An input series contains rows beyond the requested cutoff.');
  if (volume.size === 0 || price.size === 0) throw new Error('Required Bitcoin input series are empty.');
  return { volume, price };
}

async function main() {
  const { volume, price } = await readInputs();
  const dates = [...volume.keys()].filter((date) => price.has(date)).sort();
  if (dates.length === 0) throw new Error('The Bitcoin input series have no common dates.');

  const rows = [];
  for (const date of dates) {
    const volumeInput = volume.get(date);
    const priceInput = price.get(date);
    const value = decimalText(volumeInput.value * priceInput.value);
    const sourceRevision = [
      'method:estimated-btc-transfer-volume-x-price-usd-v1',
      'blockchain:' + date + ':' + volumeInput.sourceSlug + ':' + volumeInput.rowHash,
      'price:' + date + ':' + priceInput.sourceSlug + ':' + priceInput.rowHash,
    ].join(';');
    const payloadHash = sha256([
      'adjusted_transfer_value_usd', 'main', date, value, sourceSlug, sourceRevision,
    ].join('|'));
    rows.push([
      'adjusted_transfer_value_usd', 'main', date, value, sourceSlug, '',
      'provisional', sourceRevision, payloadHash,
    ].join(','));
  }

  const csvText = [header, ...rows, ''].join('\n');
  const csvBuffer = Buffer.from(csvText, 'utf8');
  const candidateSha256 = sha256(csvBuffer);
  const manifest = {
    dashboard: 'bitcoin',
    generatedAt: new Date().toISOString(),
    cutoffInclusive: cutoff,
    candidate: path.basename(candidatePath),
    candidateRows: rows.length,
    firstObservationDate: dates[0],
    lastObservationDate: dates.at(-1),
    candidateSha256,
    metricId: 'adjusted_transfer_value_usd',
    seriesKey: 'main',
    formula: 'Blockchain.com estimated_transaction_volume_btc multiplied by Coin Metrics price_usd on the same UTC date.',
    limitations: [
      'The Blockchain.com source estimates payment value and excludes coins returned as change.',
      'The source is marked research-only and private-personal-use-only in the upstream candidate record.',
      'Days absent from either input remain absent; no missing values are interpolated.',
    ],
    inputSeries: [
      { metricId: 'estimated_transaction_volume_btc', observations: volume.size, commonDateCount: dates.length, firstCommonDate: dates[0], lastCommonDate: dates.at(-1) },
      { metricId: 'price_usd', observations: price.size, commonDateCount: dates.length, firstCommonDate: dates[0], lastCommonDate: dates.at(-1) },
    ],
    bitcoinOnlyInputs: true,
    bitcoinOnlyOutputs: true,
    rawMacroRowsPersisted: false,
    uploaded: false,
    databaseImported: false,
    publicRedistributionCleared: false,
  };

  fs.writeFileSync(candidatePath, csvBuffer, { flag: 'wx' });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({
    candidate: path.relative(dashboardRoot, candidatePath),
    manifest: path.relative(dashboardRoot, manifestPath),
    rows: rows.length,
    first: dates[0],
    last: dates.at(-1),
    candidateSha256,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
