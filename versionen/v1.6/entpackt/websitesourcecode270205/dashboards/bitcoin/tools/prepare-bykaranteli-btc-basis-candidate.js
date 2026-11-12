const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const rawPath = path.join(varDir, 'bykaranteli-btc-basis-current-quarter-research-through-2026-09-10.csv');
const candidatePath = path.join(varDir, 'bykaranteli-btc-basis-import-through-2026-09-10.csv');
const manifestPath = path.join(varDir, 'bykaranteli-btc-basis-import-through-2026-09-10.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const sourceUrl = 'https://github.com/bykarantelicom/crypto-datasets/blob/main/data/basis-daily.csv';
const sourceSlug = 'bykaranteli_btc_futures_basis_cc0';
const rawHeader = 'date,symbol,tenor,expiry,spot_usd,future_usd,annualized_pct,source';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const metricId = 'futures_basis_pct';
const firstDate = '2026-08-06';
const lastDate = '2026-09-10';
const expiry = '2026-09-25';
const formula = 'Use the source annualized_pct field for symbol BTC and tenor current_quarter; retain the reported daily current-quarter contract yield without averaging or interpolation.';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges UTC-Datum: ' + value);
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Ungültiges UTC-Datum: ' + value);
  }
}

function main() {
  for (const filename of [rawPath, catalogPath]) {
    if (!fs.existsSync(filename)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(filename));
  }
  for (const filename of [candidatePath, manifestPath]) {
    if (fs.existsSync(filename)) throw new Error('Zieldatei existiert bereits und wird nicht überschrieben: ' + path.basename(filename));
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!catalog.metrics.some((metric) => metric.id === metricId)) throw new Error('Kennzahl fehlt im Katalog: ' + metricId);

  const rawBuffer = fs.readFileSync(rawPath);
  const lines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== rawHeader || lines.length !== 36) throw new Error('BTC-Basisrohdatei hat unerwarteten Header oder falsche Zeilenzahl.');
  const seen = new Set();
  const parsed = [];
  const values = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 8) throw new Error('Ungültige BTC-Basiszeile ' + (index + 2) + '.');
    const [date, symbol, tenor, contractExpiry, spot, future, annualized, source] = cells;
    validDate(date);
    if (symbol !== 'BTC' || tenor !== 'current_quarter' || contractExpiry !== expiry || source !== 'bykaranteli.com') {
      throw new Error('Die Rohdatei enthält eine andere Asset-/Tenor-/Quellenzeile: ' + (index + 2));
    }
    for (const value of [spot, future, annualized]) {
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(value) || !Number.isFinite(Number(value))) {
        throw new Error('Ungültiger numerischer BTC-Basiswert in Zeile ' + (index + 2));
      }
    }
    if (Number(spot) <= 0 || Number(future) <= 0 || Number(annualized) <= 0) {
      throw new Error('Nichtpositiver Kurs oder annualisierter BTC-Basiswert in Zeile ' + (index + 2));
    }
    if (seen.has(date)) throw new Error('Doppelter UTC-Tag in der BTC-current-quarter-Reihe: ' + date);
    seen.add(date);
    values.push(Number(annualized));
    parsed.push({ date, annualized, line });
  }

  const expectedDays = (Date.parse(lastDate + 'T00:00:00Z') - Date.parse(firstDate + 'T00:00:00Z')) / 86400000 + 1;
  if (parsed.length !== expectedDays || parsed[0].date !== firstDate || parsed.at(-1).date !== lastDate) {
    throw new Error('BTC-current-quarter-Zeitraum stimmt nicht mit der gelieferten Tagesabdeckung überein.');
  }
  for (let index = 0; index < parsed.length; index++) {
    const expectedDate = new Date(Date.parse(firstDate + 'T00:00:00Z') + index * 86400000).toISOString().slice(0, 10);
    if (parsed[index].date !== expectedDate) throw new Error('Fehlender UTC-Tag in BTC-Basisdaten vor ' + parsed[index].date);
  }

  const output = parsed.map(({ date, annualized, line }) => {
    const payloadHash = sha256(sourceUrl + '\x1f' + formula + '\x1f' + line);
    return [metricId, 'main', date, annualized, sourceSlug, '', 'provisional',
      'bykaranteli-btc-current-quarter-basis-cc0-2026-09-30:' + date, payloadHash].join(',');
  });
  const candidateBuffer = Buffer.from(importHeader + '\n' + output.join('\n') + '\n', 'utf8');
  const candidateManifest = {
    createdAt: new Date().toISOString(),
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      repository: 'https://github.com/bykarantelicom/crypto-datasets',
      file: 'data/basis-daily.csv',
      license: 'CC0 1.0 Universal, as stated in the repository README and Hugging Face dataset card accessed 2026-09-30',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'The source CSV identifies bykaranteli.com; the dataset card describes first-party quarterly futures basis snapshots.',
    },
    rawBitcoinOnlySnapshot: {
      path: path.basename(rawPath),
      bytes: rawBuffer.length,
      sha256: sha256(rawBuffer),
      rows: parsed.length,
      symbol: 'BTC',
      tenor: 'current_quarter',
      expiry,
      firstDate,
      lastDate,
      minimumAnnualizedPct: Math.min(...values),
      maximumAnnualizedPct: Math.max(...values),
      fieldsWritten: rawHeader.split(','),
      otherSymbolsWritten: 0,
      otherTenorsWritten: 0,
    },
    observations: output.length,
    metricIds: [metricId],
    metricCounts: { [metricId]: output.length },
    sourceCounts: { [sourceSlug]: output.length },
    firstObservationDate: firstDate,
    lastObservationDate: lastDate,
    nativeCalendar: '36 consecutive UTC daily snapshots from 2026-08-06 through 2026-09-10 for the source current_quarter BTC future expiring 2026-09-25. No dates or values were interpolated.',
    mapping: {
      [metricId]: formula,
    },
    methodology: 'The source supplies spot_usd, future_usd, expiry and annualized_pct. The imported metric uses the supplied annualized_pct field directly for the BTC current-quarter tenor; next-quarter values and all non-BTC rows are excluded.',
    candidate: {
      path: path.basename(candidatePath),
      bytes: candidateBuffer.length,
      sha256: sha256(candidateBuffer),
    },
    dataReuseLicenseConfirmedFromRepository: true,
    sourceValuesProvisional: true,
    uploaded: false,
    mergedIntoMaster: false,
  };
  fs.writeFileSync(candidatePath, candidateBuffer, { flag: 'wx' });
  fs.writeFileSync(manifestPath, JSON.stringify(candidateManifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({
    observations: output.length,
    metricId,
    dateRange: [firstDate, lastDate],
    tenor: 'current_quarter',
    expiry,
    minAnnualizedPct: Math.min(...values),
    maxAnnualizedPct: Math.max(...values),
    uploaded: false,
  }, null, 2));
}

main();
