const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const rawPath = path.join(varDir, 'bykaranteli-bitcoin-dominance-btc-research-through-2026-09-10.csv');
const candidatePath = path.join(varDir, 'bykaranteli-bitcoin-dominance-btc-import-through-2026-09-10.csv');
const manifestPath = path.join(varDir, 'bykaranteli-bitcoin-dominance-btc-import-through-2026-09-10.json');
const catalogPath = path.join(root, 'data', 'catalog.json');
const sourceUrl = 'https://raw.githubusercontent.com/bykarantelicom/crypto-datasets/main/data/daily-market.csv';
const sourceSlug = 'bykaranteli_btc_dominance_cc0';
const rawHeader = 'date,btc_dominance_pct';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function main() {
  if (!fs.existsSync(rawPath) || !fs.existsSync(catalogPath)) throw new Error('Bitcoin-Dominanzdatei oder Kennzahlenkatalog fehlt.');
  if (fs.existsSync(candidatePath) || fs.existsSync(manifestPath)) throw new Error('Der BTC-Dominanzkandidat existiert bereits; er wird nicht überschrieben.');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!catalog.metrics.some((metric) => metric.id === 'btc_dominance_pct')) throw new Error('btc_dominance_pct fehlt im Katalog.');
  const rawBuffer = fs.readFileSync(rawPath);
  const lines = rawBuffer.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== rawHeader || lines.length !== 50) throw new Error('BTC-Dominanzsnapshot hat einen unerwarteten Header oder eine falsche Zeilenzahl.');
  const seen = new Set();
  const observations = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])
        || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cells[1])) {
      throw new Error(`Ungültige BTC-Dominanzzeile ${index + 2}.`);
    }
    const date = new Date(`${cells[0]}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== cells[0]
        || cells[0] < '2026-07-23' || cells[0] > '2026-09-10' || cells[0] > '2026-09-28') {
      throw new Error(`BTC-Dominanzdatum liegt außerhalb der belegten Abdeckung: ${cells[0]}`);
    }
    if (seen.has(cells[0])) throw new Error(`Doppeltes BTC-Dominanzdatum: ${cells[0]}`);
    const dominance = Number(cells[1]);
    if (!(dominance > 0 && dominance < 100)) throw new Error(`BTC-Dominanzwert außerhalb 0–100 Prozent: ${cells[0]}`);
    seen.add(cells[0]);
    observations.push({ date: cells[0], value: cells[1] });
  }
  observations.sort((a, b) => a.date.localeCompare(b.date));
  if (observations[0].date !== '2026-07-23' || observations.at(-1).date !== '2026-09-10') {
    throw new Error('Unerwartete BTC-Dominanzabdeckung.');
  }
  for (let index = 1; index < observations.length; index++) {
    const previous = Date.parse(`${observations[index - 1].date}T00:00:00Z`);
    const current = Date.parse(`${observations[index].date}T00:00:00Z`);
    if (current - previous !== 86400000) throw new Error(`Lücke in der ausgewiesenen täglichen BTC-Dominanzreihe vor ${observations[index].date}.`);
  }

  const outputLines = observations.map(({ date, value }) => {
    const rowHash = sha256(`${sourceUrl}\x1f${date},${value}`);
    return ['btc_dominance_pct', 'main', date, value, sourceSlug, '', 'provisional',
      `bykaranteli-daily-market-btc-dominance-cc0-2026-09-29:${date}`, rowHash].join(',');
  });
  const candidateBuffer = Buffer.from(`${importHeader}\n${outputLines.join('\n')}\n`, 'utf8');
  const candidateManifest = {
    createdAt: new Date().toISOString(),
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      repository: 'https://github.com/bykarantelicom/crypto-datasets',
      file: 'data/daily-market.csv',
      license: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-29',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    rawBitcoinOnlySnapshot: {
      path: path.basename(rawPath),
      bytes: rawBuffer.length,
      sha256: sha256(rawBuffer),
      fieldsWritten: ['date', 'btc_dominance_pct'],
      rows: observations.length,
      firstDate: observations[0].date,
      lastDate: observations.at(-1).date,
      otherSourceFieldsWritten: 0,
    },
    observations: outputLines.length,
    metricIds: ['btc_dominance_pct'],
    metricCounts: { btc_dominance_pct: outputLines.length },
    sourceCounts: { [sourceSlug]: outputLines.length },
    firstObservationDate: observations[0].date,
    lastObservationDate: observations.at(-1).date,
    nativeCalendar: 'Daily UTC observations; the source snapshot has one value for every calendar date in this interval.',
    mapping: { btc_dominance_pct: 'btc_dominance_pct' },
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
    observations: outputLines.length,
    metricId: 'btc_dominance_pct',
    firstDate: observations[0].date,
    lastDate: observations.at(-1).date,
    rawBitcoinOnlySha256: candidateManifest.rawBitcoinOnlySnapshot.sha256,
    candidateSha256: candidateManifest.candidate.sha256,
    uploaded: false,
  }, null, 2));
}

main();
