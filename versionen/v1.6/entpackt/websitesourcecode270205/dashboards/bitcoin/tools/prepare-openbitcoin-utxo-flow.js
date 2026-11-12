const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const genesisDate = '2009-01-03';
const sourcePath = path.join(varDir, 'openbitcoin-obm-spent-output-count-research-2026-09-29.csv');
const sourceManifestPath = path.join(varDir, 'openbitcoin-obm-spent-output-count-research-2026-09-29.json');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const masterManifestPath = path.join(varDir, 'manifest-through-2026-09-28.json');
const candidatePath = path.join(varDir, 'openbitcoin-utxo-flow-import-through-2026-09-28.csv');
const candidateManifestPath = path.join(varDir, 'openbitcoin-utxo-flow-import-through-2026-09-28.json');
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sourceHeader = 'date,series_id,value,unit,frequency,release_version';

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readRows(filename, expectedHeader) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filename), crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) {
      if (line.replace(/^\uFEFF/, '') !== expectedHeader) throw new Error(`Unerwarteter CSV-Header in ${path.basename(filename)}.`);
      header = false;
      continue;
    }
    if (line) rows.push(line.split(','));
  }
  return rows;
}

function dayAfter(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  for (const filename of [candidatePath, candidateManifestPath]) {
    if (fs.existsSync(filename)) throw new Error(`Zieldatei existiert bereits: ${path.basename(filename)}`);
  }

  const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  const storedMasterManifest = JSON.parse(fs.readFileSync(masterManifestPath, 'utf8'));
  if (sourceManifest.sourceMetric !== 'obm_spent_output_count_daily'
      || sourceManifest.metric !== 'utxo_spent_count'
      || sourceManifest.license !== 'CC BY 4.0'
      || sourceManifest.cutoffInclusive !== cutoff
      || await hashFile(sourcePath) !== sourceManifest.sha256) {
    throw new Error('OBM-Quellmanifest oder Quellhash stimmt nicht.');
  }
  if (storedMasterManifest.observations !== 704755
      || storedMasterManifest.masterSha256 !== 'f66e8e9eec8c82c6bf544803c9be1f3d935aea85cdc7d79f2373b4a963fcae05') {
    throw new Error('Der lokale Master weicht vom erwarteten Ausgangsstand ab.');
  }

  const sourceRows = await readRows(sourcePath, sourceHeader);
  const spentByDate = new Map();
  const releaseVersions = new Set();
  for (const row of sourceRows) {
    if (row.length !== 6) throw new Error('OBM-Zeile hat nicht sechs Felder.');
    const [date, seriesId, value, unit, frequency, releaseVersion] = row;
    if (seriesId !== 'obm_spent_output_count_daily' || unit !== 'outputs' || frequency !== 'daily'
        || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d+$/.test(value)
        || spentByDate.has(date)) {
      throw new Error(`Ungültige oder doppelte OBM-Zeile am ${date}.`);
    }
    if (date >= genesisDate && date <= cutoff) spentByDate.set(date, { value: BigInt(value), releaseVersion, rawValue: value });
    releaseVersions.add(releaseVersion);
  }

  const importedDates = [...spentByDate.keys()].sort();
  if (!importedDates.length || importedDates[0] !== genesisDate || importedDates.at(-1) !== sourceManifest.sourceLastDate
      || sourceManifest.sourceRows !== sourceRows.length) {
    throw new Error('Die OBM-Reihe hat eine unerwartete Abdeckung.');
  }
  for (let i = 1; i < importedDates.length; i++) {
    if (importedDates[i] !== dayAfter(importedDates[i - 1])) throw new Error(`Lücke in der täglichen OBM-Reihe vor ${importedDates[i]}.`);
  }
  if (sourceRows.some((row) => row[0] > cutoff)) throw new Error('Die heruntergeladene OBM-Datei enthält Werte nach dem Stichtag.');

  const utxoByDate = new Map();
  const existingNewMetricRows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(masterPath), crlfDelay: Infinity });
  let header = true;
  let masterRows = 0;
  for await (const line of rl) {
    if (header) {
      if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error('Unerwarteter Master-CSV-Header.');
      header = false;
      continue;
    }
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Masterzeile ${masterRows + 2}.`);
    masterRows++;
    if (cells[0] === 'utxo_count') {
      if (cells[1] !== 'main' || cells[4] !== 'open_bitcoin_metrics_obm' || !/^\d+$/.test(cells[3]) || utxoByDate.has(cells[2])) {
        throw new Error(`Unerwartete UTXO-Bestandszeile am ${cells[2]}.`);
      }
      utxoByDate.set(cells[2], BigInt(cells[3]));
    }
    if (cells[0] === 'utxo_created_count' || cells[0] === 'utxo_spent_count') existingNewMetricRows.push(`${cells[0]}/${cells[1]}/${cells[2]}`);
  }
  if (masterRows !== storedMasterManifest.observations || existingNewMetricRows.length) {
    throw new Error('Masterzeilenzahl oder leerer Kennzahlstatus weicht ab.');
  }
  const utxoDates = [...utxoByDate.keys()].sort();
  if (utxoDates[0] !== genesisDate || utxoDates.at(-1) !== importedDates.at(-1)) throw new Error('UTXO-Bestandsreihe deckt den Importzeitraum nicht ab.');

  const output = [importHeader];
  let previousState = 0n;
  let createdTotal = 0n;
  let spentTotal = 0n;
  let zeroCreatedDays = 0;
  let noBlockDays = 0;
  let minCreated = null;
  let maxCreated = 0n;
  for (const date of importedDates) {
    const spent = spentByDate.get(date);
    const nextState = utxoByDate.has(date) ? utxoByDate.get(date) : previousState;
    if (!utxoByDate.has(date)) {
      noBlockDays++;
      if (spent.value !== 0n) throw new Error(`OBM meldet Ausgaben am Tag ohne UTXO-Bestandsbeobachtung: ${date}.`);
    }
    const created = nextState - previousState + spent.value;
    if (created < 0n) throw new Error(`Abgeleitete UTXO-Erzeugung wäre negativ am ${date}.`);

    const spentHash = hashText(`open-bitcoin-metrics-v0.1.0\x1f${date}\x1fobm_spent_output_count_daily\x1f${spent.rawValue}\x1foutputs\x1fdaily\x1f${spent.releaseVersion}`);
    output.push(['utxo_spent_count', 'main', date, spent.value.toString(), 'open_bitcoin_metrics_obm', '', 'provisional', `obm-v0.1.0:obm_spent_output_count_daily:${date}`, spentHash].join(','));

    const derivedHash = hashText(`obm-utxo-flow-v1\x1f${date}\x1f${previousState}\x1f${nextState}\x1f${spent.value}`);
    output.push(['utxo_created_count', 'main', date, created.toString(), 'derived_bitcoin_metrics', '', 'provisional', `obm-utxo-flow-v1:${date}`, derivedHash].join(','));
    if (created === 0n) zeroCreatedDays++;
    if (minCreated === null || created < minCreated) minCreated = created;
    if (created > maxCreated) maxCreated = created;
    createdTotal += created;
    spentTotal += spent.value;
    previousState = nextState;
  }
  if (createdTotal - spentTotal !== previousState) throw new Error('Abgeleitete UTXO-Flüsse schließen nicht auf den Endbestand.');

  const csv = `${output.join('\n')}\n`;
  fs.writeFileSync(candidatePath, csv, { flag: 'wx' });
  const candidateManifest = {
    retrievedAt: sourceManifest.retrievedAt,
    preparedAt: new Date().toISOString(),
    source: 'Open Bitcoin Metrics v0.1.0',
    sourceUrl: sourceManifest.sourceUrl,
    license: 'CC BY 4.0',
    cutoffInclusive: cutoff,
    excludedBeforeGenesis: 2,
    candidatePath: path.basename(candidatePath),
    observations: output.length - 1,
    metricIds: ['utxo_created_count', 'utxo_spent_count'],
    metricCounts: { utxo_spent_count: importedDates.length, utxo_created_count: importedDates.length },
    firstObservationDate: importedDates[0],
    lastObservationDate: importedDates.at(-1),
    sourceCounts: { open_bitcoin_metrics_obm: importedDates.length, derived_bitcoin_metrics: importedDates.length },
    sourceRows: sourceRows.length,
    sourceMetric: 'obm_spent_output_count_daily',
    sourceFirstDate: sourceRows[0][0],
    sourceLastDate: sourceRows.at(-1)[0],
    sourceSha256: sourceManifest.sha256,
    utxoStateRows: utxoByDate.size,
    noBlockDaysCarriedForward: noBlockDays,
    derivedCreatedTotal: createdTotal.toString(),
    spentTotal: spentTotal.toString(),
    endUtxoCount: previousState.toString(),
    createdCountMin: minCreated.toString(),
    createdCountMax: maxCreated.toString(),
    createdCountZeroDays: zeroCreatedDays,
    allCreatedCountsNonNegativeIntegers: true,
    utxoStockFlowIdentityHolds: true,
    methodology: 'utxo_created_count(t) = utxo_count_eod(t) - utxo_count_eod(t-1) + utxo_spent_count(t). On dates without an end-of-day block observation, carry forward only the prior UTXO state; OBM spent count must be zero on those dates. Counts include spendable outputs and exclude provably unspendable outputs under OBM definitions.',
    candidateBytes: Buffer.byteLength(csv),
    candidateSha256: hashText(csv),
    uploaded: false,
  };
  fs.writeFileSync(candidateManifestPath, `${JSON.stringify(candidateManifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(candidateManifest, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
