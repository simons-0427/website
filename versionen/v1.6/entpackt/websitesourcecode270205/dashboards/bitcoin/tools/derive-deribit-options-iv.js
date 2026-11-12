const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const METHOD_VERSION = 'deribit-iv-30d-nearatm-v1';
const MIN_DAYS_TO_EXPIRY = 20;
const MAX_DAYS_TO_EXPIRY = 40;
const MAX_ABS_LOG_MONEYNESS = Math.log(1.05);
const MIN_CONTRACTS_PER_DAY = 3;

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('CSV enthält ein nicht geschlossenes Anführungszeichen.');
  values.push(value);
  return values;
}

function parseUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return NaN;
  return Date.parse(value.replace(' ', 'T') + 'Z');
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function decimal(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 1e24) {
    throw new Error('Abgeleiteter Options-IV-Wert liegt außerhalb des Importformats.');
  }
  let text = value.toFixed(12);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text;
}

function csvRow(values) {
  return values.map((value) => {
    const text = String(value);
    return /[,"\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }).join(',');
}

async function fileSha256(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const [, , sourceFile, outputFile] = process.argv;
  if (!sourceFile || !outputFile) {
    throw new Error('Aufruf: node tools/derive-deribit-options-iv.js <Deribit_w_IV.csv> <ausgabe.csv>');
  }
  const sourcePath = path.resolve(sourceFile);
  const outputPath = path.resolve(outputFile);
  if (sourcePath === outputPath) throw new Error('Die Ausgabe darf die Quelldatei nicht überschreiben.');
  if (fs.existsSync(outputPath)) throw new Error('Die Ausgabe existiert bereits; wähle einen neuen Dateinamen.');

  const input = readline.createInterface({
    input: fs.createReadStream(sourcePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let header = null;
  let indexes = null;
  let inputRows = 0;
  let invalidNumericRows = 0;
  let firstSourceDate = null;
  let lastSourceDate = null;
  const latestByContractDay = new Map();

  for await (const rawLine of input) {
    if (header === null) {
      header = parseCsvLine(rawLine.replace(/^\uFEFF/, ''));
      indexes = new Map(header.map((name, index) => [name, index]));
      for (const required of ['timestamp', 'instrument_name', 'index_price', 'strike', 'time_expire', 'date', 'iv_Tbill']) {
        if (!indexes.has(required)) throw new Error('UWA-CSV fehlt die benötigte Spalte: ' + required);
      }
      continue;
    }
    if (!rawLine) continue;
    inputRows++;
    const cells = parseCsvLine(rawLine);
    if (cells.length !== header.length) throw new Error('UWA-CSV-Zeile ' + (inputRows + 1) + ' hat eine falsche Spaltenzahl.');
    const get = (name) => cells[indexes.get(name)];
    const date = get('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ungültiges UWA-Handelsdatum in Zeile ' + (inputRows + 1) + '.');
    if (firstSourceDate === null || date < firstSourceDate) firstSourceDate = date;
    if (lastSourceDate === null || date > lastSourceDate) lastSourceDate = date;

    const timestamp = Number(get('timestamp'));
    const indexPrice = Number(get('index_price'));
    const strike = Number(get('strike'));
    const impliedVolatility = Number(get('iv_Tbill'));
    const expiryTimestamp = parseUtcTimestamp(get('time_expire'));
    if (!Number.isFinite(timestamp) || !Number.isFinite(indexPrice) || !Number.isFinite(strike)
      || !Number.isFinite(impliedVolatility) || !Number.isFinite(expiryTimestamp)) {
      invalidNumericRows++;
      continue;
    }
    if (timestamp <= 0 || indexPrice <= 0 || strike <= 0 || impliedVolatility <= 0) {
      invalidNumericRows++;
      continue;
    }
    const daysToExpiry = (expiryTimestamp - timestamp) / 86_400_000;
    if (daysToExpiry <= 0) {
      invalidNumericRows++;
      continue;
    }
    const instrument = get('instrument_name');
    if (!instrument) {
      invalidNumericRows++;
      continue;
    }
    const key = date + '\u001f' + instrument;
    const existing = latestByContractDay.get(key);
    if (!existing || timestamp > existing.timestamp) {
      latestByContractDay.set(key, {
        date,
        instrument,
        timestamp,
        indexPrice,
        strike,
        daysToExpiry,
        impliedVolatility,
      });
    }
  }
  if (!header || inputRows === 0) throw new Error('Die UWA-Datei ist leer.');

  const eligibleByDate = new Map();
  for (const contract of latestByContractDay.values()) {
    const logMoneyness = Math.log(contract.strike / contract.indexPrice);
    if (contract.daysToExpiry < MIN_DAYS_TO_EXPIRY || contract.daysToExpiry > MAX_DAYS_TO_EXPIRY
      || Math.abs(logMoneyness) > MAX_ABS_LOG_MONEYNESS) continue;
    if (!eligibleByDate.has(contract.date)) eligibleByDate.set(contract.date, []);
    eligibleByDate.get(contract.date).push(contract);
  }

  const sourceHash = await fileSha256(sourcePath);
  const dates = Array.from(eligibleByDate.keys()).sort();
  const output = [importHeader];
  const qualifyingCounts = [];
  const includedHashInputs = [];
  for (const date of dates) {
    const contracts = eligibleByDate.get(date).sort((left, right) => (left.instrument < right.instrument ? -1 : left.instrument > right.instrument ? 1 : 0));
    if (contracts.length < MIN_CONTRACTS_PER_DAY) continue;
    const iv = median(contracts.map((contract) => contract.impliedVolatility));
    const maxTimestamp = Math.max(...contracts.map((contract) => contract.timestamp));
    const sourceTimestamp = new Date(Math.floor(maxTimestamp / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    const payload = {
      source_sha256: sourceHash,
      method: METHOD_VERSION,
      observation_date: date,
      contracts: contracts.map((contract) => [
        contract.instrument,
        String(contract.timestamp),
        decimal(contract.strike),
        decimal(contract.indexPrice),
        decimal(contract.daysToExpiry),
        decimal(contract.impliedVolatility),
      ]),
    };
    const rawHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const revision = 'uwa-deribit-iv:' + sourceHash.slice(0, 12) + ':' + METHOD_VERSION;
    output.push(csvRow([
      'options_iv_30d_pct',
      'main',
      date,
      decimal(iv),
      'uwa_deribit_options_cc_by',
      sourceTimestamp,
      'provisional',
      revision,
      rawHash,
    ]));
    qualifyingCounts.push(contracts.length);
    includedHashInputs.push(date);
  }
  if (output.length === 1) throw new Error('Keine Tage erfüllen die dokumentierte 30-Tage-ATM-Basket-Regel.');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output.join('\n') + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({
    status: 'private provisional import candidate',
    source: 'UWA Deribit_w_IV.csv, CC BY',
    sourceSha256: sourceHash,
    sourceRows: inputRows,
    distinctContractDays: latestByContractDay.size,
    skippedInvalidRows: invalidNumericRows,
    sourceFirstDate: firstSourceDate,
    sourceLastDate: lastSourceDate,
    method: {
      impliedVolatilityColumn: 'iv_Tbill (annualized percent)',
      daysToExpiry: [MIN_DAYS_TO_EXPIRY, MAX_DAYS_TO_EXPIRY],
      maximumAbsoluteLogMoneyness: MAX_ABS_LOG_MONEYNESS,
      minDistinctContracts: MIN_CONTRACTS_PER_DAY,
      aggregation: 'median of each contract’s last trade of the date',
      interpolation: 'none',
    },
    observations: output.length - 1,
    firstObservation: includedHashInputs[0],
    lastObservation: includedHashInputs.at(-1),
    contractCountPerDate: {
      minimum: Math.min(...qualifyingCounts),
      median: median(qualifyingCounts),
      maximum: Math.max(...qualifyingCounts),
    },
    output: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
