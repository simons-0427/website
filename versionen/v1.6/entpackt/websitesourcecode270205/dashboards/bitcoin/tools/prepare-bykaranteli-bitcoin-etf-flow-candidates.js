const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const rawPath = path.join(varDir, 'bykaranteli-etf-flows-btc-research-through-2026-09-08.csv');
const candidatePath = path.join(varDir, 'bykaranteli-etf-flows-btc-import-through-2026-09-08.csv');
const manifestPath = path.join(varDir, 'bykaranteli-etf-flows-btc-import-through-2026-09-08.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const sourceUrl = 'https://raw.githubusercontent.com/bykarantelicom/crypto-datasets/main/data/etf-flows.csv';
const sourceSlug = 'bykaranteli_etf_flows_cc0';
const header = 'date,asset,net_inflow_usd,net_assets_usd,cumulative_inflow_usd,value_traded_usd,source';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const mapping = [
  ['etf_netflow_usd', 2],
  ['etf_aum_usd', 3],
  ['etf_cumulative_netflow_usd', 4],
  ['etf_trading_volume_usd', 5],
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges UTC-Datum: ' + value);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Ungültiges UTC-Datum: ' + value);
  }
  return value;
}

function csvRow(cells) {
  return cells.join(',');
}

function main() {
  if (!fs.existsSync(rawPath) || !fs.existsSync(catalogPath)) throw new Error('BTC-Rohdatei oder Kennzahlenkatalog fehlt.');
  if (fs.existsSync(candidatePath) || fs.existsSync(manifestPath)) {
    throw new Error('Der vorbereitete ByKaranteli-ETF-Kandidat existiert bereits; er wird nicht überschrieben.');
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const catalogMetrics = new Set(catalog.metrics.map((metric) => metric.id));
  for (const [metricId] of mapping) {
    if (!catalogMetrics.has(metricId)) throw new Error(`Bitcoin-Kennzahl fehlt im Katalog: ${metricId}`);
  }

  const rawBuffer = fs.readFileSync(rawPath);
  const rawText = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd();
  const lines = rawText.split(/\r?\n/);
  if (lines.shift() !== header) throw new Error('Die ByKaranteli-ETF-CSV-Kopfzeile weicht ab.');
  if (lines.length !== 327) throw new Error(`Erwartet waren 327 reine BTC-Quellzeilen, gefunden: ${lines.length}.`);

  const byDate = new Map();
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 7 || cells[1] !== 'BTC' || cells[6] !== 'bykaranteli.com') {
      throw new Error(`Rohzeile ${index + 2} enthält Nicht-Bitcoin-Daten oder unerwartete Felder.`);
    }
    const date = validDate(cells[0]);
    if (date > '2026-09-28') throw new Error(`ETF-Beobachtung liegt nach dem lokalen Stichtag: ${date}`);
    if (byDate.has(date)) throw new Error(`Doppelter BTC-ETF-Tag: ${date}`);
    if (cells.slice(2, 6).some((value) => !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))) {
      throw new Error(`Ungültiger USD-Wert am ${date}.`);
    }
    if (BigInt(cells[3]) <= 0n || BigInt(cells[5]) < 0n) throw new Error(`Nichtplausible ETF-Vermögens- oder Volumenwerte am ${date}.`);
    byDate.set(date, { cells, line });
  }
  const dates = [...byDate.keys()].sort();
  if (dates[0] !== '2025-05-20' || dates.at(-1) !== '2026-09-08') {
    throw new Error(`Unerwartete Bitcoin-ETF-Abdeckung: ${dates[0]} bis ${dates.at(-1)}.`);
  }

  const outputRows = [];
  for (const date of dates) {
    const { cells, line } = byDate.get(date);
    const rawHash = sha256(`${sourceUrl}\x1f${line}`);
    for (const [metricId, fieldIndex] of mapping) {
      outputRows.push(csvRow([
        metricId,
        'main',
        date,
        cells[fieldIndex],
        sourceSlug,
        '',
        'provisional',
        `bykaranteli-etf-flows-cc0-snapshot-2026-09-29:${date}`,
        rawHash,
      ]));
    }
  }
  outputRows.sort((left, right) => {
    const a = left.split(',');
    const b = right.split(',');
    return a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]);
  });
  const candidateText = `${importHeader}\n${outputRows.join('\n')}\n`;
  const candidateBuffer = Buffer.from(candidateText, 'utf8');
  const rawSha256 = sha256(rawBuffer);
  const candidateManifest = {
    createdAt: new Date().toISOString(),
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      repository: 'https://github.com/bykarantelicom/crypto-datasets',
      file: 'data/etf-flows.csv',
      license: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-29',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      upstreamDataAttribution: 'SoSoValue public data, attributed by the repository.',
    },
    rawBitcoinOnlySnapshot: {
      path: path.basename(rawPath),
      bytes: rawBuffer.length,
      sha256: rawSha256,
      assetFilter: 'BTC',
      rows: lines.length,
      firstDate: dates[0],
      lastDate: dates.at(-1),
      nonBitcoinRowsWritten: 0,
    },
    cutoffInclusive: '2026-09-28',
    observations: outputRows.length,
    metricIds: mapping.map(([metricId]) => metricId),
    metricCounts: Object.fromEntries(mapping.map(([metricId]) => [metricId, dates.length])),
    sourceCounts: { [sourceSlug]: outputRows.length },
    firstObservationDate: dates[0],
    lastObservationDate: dates.at(-1),
    nativeCalendar: 'ETF market dates from the source; weekends and missing source dates were not filled.',
    mapping: Object.fromEntries(mapping.map(([metricId, fieldIndex]) => [metricId, header.split(',')[fieldIndex]])),
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
  fs.writeFileSync(manifestPath, `${JSON.stringify(candidateManifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    bitcoinSourceRows: dates.length,
    outputObservations: outputRows.length,
    metricIds: candidateManifest.metricIds,
    firstDate: dates[0],
    lastDate: dates.at(-1),
    rawBitcoinOnlySha256: rawSha256,
    candidateSha256: candidateManifest.candidate.sha256,
    uploaded: false,
  }, null, 2));
}

main();
