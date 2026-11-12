const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { importHeader } = require('./coinmetrics-format');

const METHOD_VERSION = 'uwa-deribit-options-activity-v2';
const MIN_DAYS_TO_EXPIRY = 20;
const MAX_DAYS_TO_EXPIRY = 40;
const MIN_ABS_DELTA = 0.20;
const MAX_ABS_DELTA = 0.30;
const TARGET_ABS_DELTA = 0.25;
const MIN_REPORTED_VOLUME_PER_SIDE = 1;

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

function normalCdf(value) {
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = 0.3989422804014327 * Math.exp(-0.5 * absolute * absolute);
  const probability = density * t * (
    0.319381530 + t * (
      -0.356563782 + t * (
        1.781477937 + t * (
          -1.821255978 + t * 1.330274429
        )
      )
    )
  );
  return value >= 0 ? 1 - probability : probability;
}

function decimal(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e24) {
    throw new Error('Optionswert liegt außerhalb des Importformats.');
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

function betterCandidate(candidate, current) {
  if (!current) return true;
  if (candidate.deltaError !== current.deltaError) return candidate.deltaError < current.deltaError;
  if (candidate.expiryError !== current.expiryError) return candidate.expiryError < current.expiryError;
  if (candidate.amount !== current.amount) return candidate.amount > current.amount;
  return candidate.instrument < current.instrument;
}

async function main() {
  const [, , sourceFile, outputFile] = process.argv;
  if (!sourceFile || !outputFile) {
    throw new Error('Aufruf: node tools/derive-deribit-options-activity.js <Deribit_w_IV.csv> <ausgabe.csv>');
  }
  const root = path.resolve(__dirname, '..');
  const varDir = path.join(root, 'var');
  const sourcePath = path.resolve(sourceFile);
  const outputPath = path.resolve(outputFile);
  const relativeOutput = path.relative(varDir, outputPath);
  if (sourcePath === outputPath) throw new Error('Die Ausgabe darf die Quelldatei nicht überschreiben.');
  if (relativeOutput === '' || relativeOutput === '..' || relativeOutput.startsWith('..' + path.sep) || path.isAbsolute(relativeOutput)) {
    throw new Error('Die Ausgabe muss im geschützten var-Ordner liegen.');
  }
  if (fs.existsSync(outputPath)) throw new Error('Die Ausgabe existiert bereits; wähle einen neuen Dateinamen.');

  const sourceHash = await fileSha256(sourcePath);
  const input = readline.createInterface({
    input: fs.createReadStream(sourcePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let header = null;
  let indexes = null;
  let inputRows = 0;
  let invalidRows = 0;
  let firstSourceDate = null;
  let lastSourceDate = null;
  const latestByContractDay = new Map();
  const volumeByDay = new Map();

  for await (const rawLine of input) {
    if (header === null) {
      header = parseCsvLine(rawLine.replace(/^\uFEFF/, ''));
      indexes = new Map(header.map((name, index) => [name, index]));
      for (const required of ['timestamp', 'instrument_name', 'index_price', 'strike', 'time_expire', 'date', 'iv_Tbill', 'amount', 'type']) {
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
    const type = get('type').toLowerCase();
    const amount = Number(get('amount'));
    if (Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(amount) && amount > 0 && (type === 'put' || type === 'call')) {
      const dailyVolume = volumeByDay.get(date) || { put: 0, call: 0, putTrades: 0, callTrades: 0, latestTimestamp: 0 };
      dailyVolume[type] += amount;
      dailyVolume[type + 'Trades']++;
      dailyVolume.latestTimestamp = Math.max(dailyVolume.latestTimestamp, timestamp);
      volumeByDay.set(date, dailyVolume);
    }

    const indexPrice = Number(get('index_price'));
    const strike = Number(get('strike'));
    const impliedVolatility = Number(get('iv_Tbill'));
    const expiryTimestamp = parseUtcTimestamp(get('time_expire'));
    const instrument = get('instrument_name');
    if (!Number.isFinite(timestamp) || !Number.isFinite(indexPrice) || !Number.isFinite(strike)
      || !Number.isFinite(impliedVolatility) || !Number.isFinite(expiryTimestamp)
      || timestamp <= 0 || indexPrice <= 0 || strike <= 0 || impliedVolatility <= 0
      || !instrument || (type !== 'put' && type !== 'call')) {
      invalidRows++;
      continue;
    }
    const daysToExpiry = (expiryTimestamp - timestamp) / 86_400_000;
    if (daysToExpiry <= 0) {
      invalidRows++;
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
        amount,
        type,
      });
    }
  }
  if (!header || inputRows === 0) throw new Error('Die UWA-Datei ist leer.');

  const bestByDay = new Map();
  for (const contract of latestByContractDay.values()) {
    if (contract.daysToExpiry < MIN_DAYS_TO_EXPIRY || contract.daysToExpiry > MAX_DAYS_TO_EXPIRY) continue;
    if ((contract.type === 'call' && contract.strike <= contract.indexPrice)
      || (contract.type === 'put' && contract.strike >= contract.indexPrice)) continue;
    const time = contract.daysToExpiry / 365;
    const sigma = contract.impliedVolatility / 100;
    const d1 = (Math.log(contract.indexPrice / contract.strike) + 0.5 * sigma * sigma * time)
      / (sigma * Math.sqrt(time));
    const absDelta = contract.type === 'call' ? normalCdf(d1) : normalCdf(-d1);
    if (absDelta < MIN_ABS_DELTA || absDelta > MAX_ABS_DELTA) continue;
    const candidate = {
      contract,
      deltaError: Math.abs(absDelta - TARGET_ABS_DELTA),
      expiryError: Math.abs(contract.daysToExpiry - 30),
      amount: contract.amount,
      instrument: contract.instrument,
    };
    const day = bestByDay.get(contract.date) || {};
    if (betterCandidate(candidate, day[contract.type])) day[contract.type] = candidate;
    bestByDay.set(contract.date, day);
  }

  const outputRows = [];
  const counts = { options_put_call_ratio: 0, options_25d_skew_pct: 0 };
  const dateKeys = new Set([...volumeByDay.keys(), ...bestByDay.keys()]);
  for (const date of [...dateKeys].sort()) {
    const volumes = volumeByDay.get(date);
    if (volumes && volumes.call >= MIN_REPORTED_VOLUME_PER_SIDE && volumes.put >= MIN_REPORTED_VOLUME_PER_SIDE) {
      const ratio = volumes.put / volumes.call;
      const timestamp = new Date(volumes.latestTimestamp).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify([METHOD_VERSION, sourceHash, 'put-call-volume', MIN_REPORTED_VOLUME_PER_SIDE, date, volumes.put, volumes.call, volumes.putTrades, volumes.callTrades]))
        .digest('hex');
      outputRows.push(csvRow([
        'options_put_call_ratio',
        'main',
        date,
        decimal(ratio),
        'uwa_deribit_options_cc_by',
        timestamp,
        'provisional',
        METHOD_VERSION + ':put-call-volume-min-1-each-side',
        hash,
      ]));
      counts.options_put_call_ratio++;
    }

    const candidates = bestByDay.get(date);
    if (candidates && candidates.put && candidates.call) {
      const put = candidates.put.contract;
      const call = candidates.call.contract;
      const skew = put.impliedVolatility - call.impliedVolatility;
      const timestamp = new Date(Math.max(put.timestamp, call.timestamp)).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const selections = [candidates.put, candidates.call].map(({ contract, deltaError }) => [
        contract.instrument,
        contract.timestamp,
        decimal(contract.strike),
        decimal(contract.indexPrice),
        decimal(contract.daysToExpiry),
        decimal(contract.impliedVolatility),
        decimal(deltaError),
      ]);
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify([METHOD_VERSION, sourceHash, '25d-put-minus-call-v1', date, selections]))
        .digest('hex');
      outputRows.push(csvRow([
        'options_25d_skew_pct',
        'main',
        date,
        decimal(skew),
        'uwa_deribit_options_cc_by',
        timestamp,
        'provisional',
        METHOD_VERSION + ':25d-put-minus-call',
        hash,
      ]));
      counts.options_25d_skew_pct++;
    }
  }

  if (outputRows.length === 0) throw new Error('Keine gültigen Optionsdaten für die beiden Kennzahlen gefunden.');
  outputRows.sort((left, right) => left.split(',')[2].localeCompare(right.split(',')[2]) || left.split(',')[0].localeCompare(right.split(',')[0]));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, importHeader + '\n' + outputRows.join('\n') + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({
    status: 'private provisional Bitcoin options research import',
    source: 'Hoang and Baur, UWA Deribit Options Data, CC BY, DOI 10.26182/5eabbcb4fbf28',
    sourceSha256: sourceHash,
    inputRows,
    invalidRows,
    sourceFirstDate: firstSourceDate,
    sourceLastDate: lastSourceDate,
    method: {
      options_put_call_ratio: 'sum of recorded put trade amounts divided by recorded call trade amounts per UTC trade date; each side must have at least one reported amount unit; traded volume proxy, not open interest',
      options_25d_skew_pct: 'nearest available out-of-the-money put and call to 25 absolute spot delta within 20-30 delta, last daily trade per contract, 20-40 days to expiry, Black-Scholes delta at zero rate, no interpolation; put iv_Tbill minus call iv_Tbill in volatility points',
      eligibleDeltaRange: [MIN_ABS_DELTA, MAX_ABS_DELTA],
      minDaysToExpiry: MIN_DAYS_TO_EXPIRY,
      maxDaysToExpiry: MAX_DAYS_TO_EXPIRY,
    },
    observations: counts,
    output: outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error('Deribit-Optionsaufbereitung fehlgeschlagen: ' + error.message);
  process.exitCode = 1;
});
