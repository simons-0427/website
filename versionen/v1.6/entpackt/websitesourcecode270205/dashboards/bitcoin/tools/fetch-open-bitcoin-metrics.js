const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { importHeader, normalizeDecimal } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const rawDir = path.join(root, 'var', 'open-bitcoin-metrics-obm');
const outputPath = path.resolve(process.argv[2] || path.join(root, 'var', 'open-bitcoin-metrics-import.csv'));
const sourceSlug = 'open_bitcoin_metrics_obm';
const csvHeader = 'date,series_id,value,unit,frequency,release_version';
const baseUrl = 'https://raw.githubusercontent.com/diegorllanos/open-bitcoin-metrics/main/metrics';
const definitions = [
  {
    series: 'obm_block_weight_wu_daily',
    metric: 'block_weight_mwu',
    unit: 'WU',
    factor: '0.000001',
    allowUndefined: false,
  },
  {
    series: 'obm_cdd_btcxdays_daily',
    metric: 'coin_days_destroyed',
    unit: 'BTC-days',
    factor: '1',
    allowUndefined: false,
  },
  {
    series: 'obm_raw_output_value_btc_daily',
    metric: 'transaction_volume_btc',
    unit: 'BTC',
    factor: '1',
    allowUndefined: false,
  },
  {
    series: 'obm_dormancy_days_daily',
    metric: 'average_coin_dormancy_days',
    unit: 'days',
    factor: '1',
    allowUndefined: true,
  },
  {
    series: 'obm_liveliness_ratio_daily',
    metric: 'liveliness',
    unit: 'ratio',
    factor: '1',
    allowUndefined: false,
  },
  {
    series: 'obm_utxo_eod_count_daily',
    metric: 'utxo_count',
    unit: 'outputs',
    factor: '1',
    allowUndefined: true,
  },
];

function retryDelay(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 60_000);
  return Math.min(1000 * (2 ** attempt), 16_000);
}

async function download(definition) {
  const url = baseUrl + '/' + definition.series + '/' + definition.series + '.csv';
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/csv', 'User-Agent': 'smstark-bitcoin-dashboard/1.0' },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      if (attempt === 4) throw new Error(definition.series + ': Netzwerkfehler: ' + error.message);
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, '')));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, response.headers.get('Retry-After'))));
      continue;
    }
    if (!response.ok) throw new Error(definition.series + ': HTTP ' + response.status);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length < 100 || body.length > 20_000_000) {
      throw new Error(definition.series + ': unerwartete Dateigröße (' + body.length + ' Bytes).');
    }
    return body;
  }
  throw new Error(definition.series + ': nach Wiederholungen nicht abrufbar.');
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function convertCsv(definition, body) {
  const text = body.toString('utf8').replace(/^\uFEFF/, '').trimEnd();
  const lines = text.split(/\r?\n/);
  if (lines.shift() !== csvHeader) throw new Error(definition.series + ': unerwarteter CSV-Kopf.');
  if (lines.length === 0) throw new Error(definition.series + ': keine Datenzeilen.');

  const rows = [];
  let firstSourceDate = '';
  let lastSourceDate = '';
  let previousDate = '';
  let release = '';
  let undefinedCount = 0;
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 6) throw new Error(definition.series + ', Zeile ' + (index + 2) + ': falsche Spaltenzahl.');
    const [date, series, rawValue, unit, frequency, rowRelease] = cells;
    if (series !== definition.series || unit !== definition.unit || frequency !== 'daily') {
      throw new Error(definition.series + ', Zeile ' + (index + 2) + ': Serie, Einheit oder Frequenz weicht ab.');
    }
    if (!isIsoDate(date) || (previousDate && date <= previousDate)) {
      throw new Error(definition.series + ', Zeile ' + (index + 2) + ': Datum ungültig, doppelt oder nicht aufsteigend.');
    }
    if (!/^OBM v\d+\.\d+\.\d+$/.test(rowRelease)) {
      throw new Error(definition.series + ', Zeile ' + (index + 2) + ': unbekannte Release-Kennung.');
    }
    if (release && release !== rowRelease) throw new Error(definition.series + ': mehrere OBM-Releases in einer Datei.');
    if (rawValue === 'NaN') {
      if (!definition.allowUndefined) throw new Error(definition.series + ', Zeile ' + (index + 2) + ': undefinierter Wert ist nicht erlaubt.');
      undefinedCount++;
      previousDate = date;
      lastSourceDate = date;
      if (!firstSourceDate) firstSourceDate = date;
      release = rowRelease;
      continue;
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rawValue)) {
      throw new Error(definition.series + ', Zeile ' + (index + 2) + ': ungültiger Dezimalwert.');
    }
    const value = normalizeDecimal(rawValue, definition.factor);
    const hash = crypto.createHash('sha256').update('open-bitcoin-metrics-obm\u001f' + line).digest('hex');
    const revision = rowRelease.toLowerCase().replaceAll(' ', '-') + ':' + definition.series;
    rows.push([
      definition.metric,
      'main',
      date,
      value,
      sourceSlug,
      '',
      'provisional',
      revision,
      hash,
    ].join(','));
    previousDate = date;
    lastSourceDate = date;
    if (!firstSourceDate) firstSourceDate = date;
    release = rowRelease;
  }
  return {
    rows,
    release,
    sourceFirst: firstSourceDate,
    sourceLast: lastSourceDate,
    coverageFirst: rows.length ? rows[0].split(',')[2] : null,
    coverageLast: rows.length ? rows[rows.length - 1].split(',')[2] : null,
    undefinedCount,
  };
}

async function main() {
  const rawPaths = definitions.map((item) => path.resolve(rawDir, item.series + '.csv'));
  if (rawPaths.includes(outputPath)) throw new Error('Die Ausgabedatei darf keine Rohdatei überschreiben.');
  fs.mkdirSync(rawDir, { recursive: true });

  const outputRows = [];
  const summaries = [];
  let commonRelease = '';
  for (const definition of definitions) {
    const body = await download(definition);
    const result = convertCsv(definition, body);
    if (commonRelease && commonRelease !== result.release) {
      throw new Error('Die OBM-Dateien enthalten unterschiedliche Release-Versionen.');
    }
    commonRelease = result.release;
    const rawPath = path.join(rawDir, definition.series + '.csv');
    fs.writeFileSync(rawPath, body);
    outputRows.push(...result.rows);
    summaries.push({
      series: definition.series,
      metric: definition.metric,
      rows: result.rows.length,
      first: result.coverageFirst,
      last: result.coverageLast,
      sourceFirst: result.sourceFirst,
      sourceLast: result.sourceLast,
      undefinedValuesSkipped: result.undefinedCount,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
    });
  }

  const foundMetrics = new Set(summaries.map((item) => item.metric));
  if (foundMetrics.size !== definitions.length) throw new Error('Mindestens eine OBM-Reihe fehlt oder wurde doppelt verarbeitet.');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, importHeader + '\n' + outputRows.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({
    output: outputPath,
    source: 'Open Bitcoin Metrics, CC BY 4.0',
    release: commonRelease,
    records: outputRows.length,
    metrics: summaries,
  }, null, 2));
}

main().catch((error) => {
  console.error('OBM-Importvorbereitung fehlgeschlagen: ' + error.message);
  process.exitCode = 1;
});
