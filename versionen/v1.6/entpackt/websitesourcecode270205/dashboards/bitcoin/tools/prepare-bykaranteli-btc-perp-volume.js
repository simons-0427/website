const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Readable } = require('node:stream');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const cutoff = '2026-09-28';
const sourceCommit = '66d8542392067be14e2eb8ca962ffbdafcbc51ef';
const sourceUrl = `https://github.com/bykarantelicom/crypto-datasets/blob/${sourceCommit}/data/venue-markets-daily.csv`;
const downloadUrl = `https://raw.githubusercontent.com/bykarantelicom/crypto-datasets/${sourceCommit}/data/venue-markets-daily.csv`;
const sourceHeader = 'date,venue,market,symbol,quote,price_usd,volume_24h_usd,open_interest_usd,funding_rate_8h_pct,source';
const rawHeader = 'date,venue,market,symbol,quote,volume_24h_usd';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const sourceSlug = 'bykaranteli_crypto_datasets_cc0';
const rawPath = path.join(varDir, 'bykaranteli-btc-perp-volume-research-through-2026-09-10.csv');
const candidatePath = path.join(varDir, 'bykaranteli-btc-perp-volume-import-through-2026-09-10.csv');
const manifestPath = path.join(varDir, 'bykaranteli-btc-perp-volume-import-through-2026-09-10.json');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid UTC date: ${value}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid UTC date: ${value}`);
  }
}

function usdToCents(value, date, venue) {
  if (value === '') return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`Missing or invalid BTC perp volume for ${venue} on ${date}.`);
  const whole = BigInt(match[1]);
  const fraction = (match[2] || '').padEnd(3, '0');
  let cents = whole * 100n + BigInt(fraction.slice(0, 2));
  if (fraction[2] >= '5') cents++;
  return cents;
}

function centsToUsd(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function datesBetween(first, last) {
  const dates = [];
  for (let at = Date.parse(`${first}T00:00:00Z`); at <= Date.parse(`${last}T00:00:00Z`); at += 86_400_000) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  return dates;
}

async function main() {
  for (const file of [rawPath, candidatePath, manifestPath]) {
    if (fs.existsSync(file)) throw new Error(`Refusing to overwrite ${path.basename(file)}.`);
  }

  const response = await fetch(downloadUrl, { headers: { 'user-agent': 'Bitcoin-dashboard-local-research/1.0' } });
  if (!response.ok || !response.body) throw new Error(`Source download failed with HTTP ${response.status}.`);

  const reader = readline.createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
  const btcPerpRows = [];
  const seen = new Set();
  let header = true;
  for await (const line of reader) {
    if (!line) continue;
    if (header) {
      if (line.replace(/^\uFEFF/, '') !== sourceHeader) throw new Error('Unexpected venue-markets CSV header.');
      header = false;
      continue;
    }

    const cells = line.split(',');
    if (cells.length < 4) throw new Error('Malformed CSV row before symbol filter.');
    if (cells[3] !== 'BTC') continue;
    if (cells.length !== 10) throw new Error('Malformed BTC CSV row.');

    const [date, venue, market, symbol, quote, , volume24hUsd, , , source] = cells;
    validDate(date);
    if (date > cutoff) throw new Error(`BTC source contains a row past the authorized cutoff: ${date}.`);
    if (source !== 'bykaranteli.com' || !venue || !quote) throw new Error(`Unexpected BTC source row for ${date}.`);
    if (market !== 'perp') continue;

    const key = `${date}|${venue}|${quote}`;
    if (seen.has(key)) throw new Error(`Duplicate BTC perp feed row: ${key}.`);
    seen.add(key);
    const cents = usdToCents(volume24hUsd, date, venue);
    btcPerpRows.push({ date, venue, market, symbol, quote, volume24hUsd, cents, key: `${venue}|${market}|${quote}` });
  }
  if (header || btcPerpRows.length === 0) throw new Error('No BTC perp rows were found in the pinned source.');

  btcPerpRows.sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue) || a.quote.localeCompare(b.quote));
  const firstDate = btcPerpRows[0].date;
  const lastDate = btcPerpRows.at(-1).date;
  const dates = datesBetween(firstDate, lastDate);
  if (firstDate !== '2026-08-21' || lastDate !== '2026-09-10' || dates.length !== 21) {
    throw new Error(`Unexpected BTC perp date range: ${firstDate} through ${lastDate}.`);
  }

  const rowsByFeed = new Map();
  for (const row of btcPerpRows) {
    if (!rowsByFeed.has(row.key)) rowsByFeed.set(row.key, new Map());
    rowsByFeed.get(row.key).set(row.date, row);
  }
  const completeFeeds = new Set([...rowsByFeed]
    .filter(([, byDate]) => dates.every((date) => byDate.has(date) && byDate.get(date).cents !== null))
    .map(([feed]) => feed));
  if (completeFeeds.size < 3) throw new Error(`Only ${completeFeeds.size} BTC perp feeds cover every day.`);

  const selectedRows = btcPerpRows.filter((row) => completeFeeds.has(row.key));
  const rowsByDate = new Map(dates.map((date) => [date, []]));
  for (const row of selectedRows) rowsByDate.get(row.date).push(row);
  if (dates.some((date) => rowsByDate.get(date).length !== completeFeeds.size)) {
    throw new Error('The fixed BTC perp panel has inconsistent daily coverage.');
  }

  const sourceRows = selectedRows.map((row) => [row.date, row.venue, row.market, row.symbol, row.quote, row.volume24hUsd].join(','));
  const rawCsv = `${rawHeader}\n${sourceRows.join('\n')}\n`;
  const candidateRows = [];
  const dailySummary = [];
  for (const date of dates) {
    const rows = rowsByDate.get(date);
    const totalCents = rows.reduce((sum, row) => sum + row.cents, 0n);
    const value = centsToUsd(totalCents);
    const method = 'sum(volume_24h_usd) for the fixed complete-panel rows where symbol=BTC and market=perp';
    const payloadHash = sha256(`${sourceUrl}\x1f${date}\x1f${method}\x1f${rows.map((row) => `${row.venue}|${row.quote}|${row.volume24hUsd}`).join(';')}`);
    candidateRows.push([
      'futures_volume_usd', 'main', date, value, sourceSlug, '', 'provisional',
      `bykaranteli-venue-markets-btc-perp-cc0-${sourceCommit.slice(0, 7)}:${date}`,
      payloadHash,
    ].join(','));
    dailySummary.push({ date, value, selectedFeeds: rows.length });
  }
  const candidateCsv = `${importHeader}\n${candidateRows.join('\n')}\n`;
  const rawMetadata = {
    path: path.basename(rawPath),
    bytes: Buffer.byteLength(rawCsv),
    sha256: sha256(rawCsv),
    rows: sourceRows.length,
    symbol: 'BTC',
    market: 'perp',
    firstDate,
    lastDate,
    selectedFeedCount: completeFeeds.size,
    observedFeedCount: rowsByFeed.size,
    excludedIncompleteFeedCount: rowsByFeed.size - completeFeeds.size,
    selectedFeeds: [...completeFeeds].sort(),
    sourceRowsForOtherAssetsWritten: 0,
  };
  const manifest = {
    createdAt: new Date().toISOString(),
    dashboard: 'bitcoin',
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      file: 'data/venue-markets-daily.csv',
      commit: sourceCommit,
      commitDate: '2026-09-10',
      license: 'CC0 1.0 Universal, stated in the pinned repository README',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'ByKaranteli Crypto Datasets, BTC perpetual feed rows only.',
    },
    rawBitcoinOnlySnapshot: rawMetadata,
    observations: candidateRows.length,
    metricIds: ['futures_volume_usd'],
    metricCounts: { futures_volume_usd: candidateRows.length },
    firstObservationDate: firstDate,
    lastObservationDate: lastDate,
    missingDates: [],
    method: {
      futures_volume_usd: 'For each UTC date, sum the source-reported rolling 24-hour USD volumes only for symbol=BTC, market=perp, across the fixed intersection of venue/quote feeds that have a non-missing observation on all 21 dates. Values are daily snapshots of rolling 24-hour volume, not disjoint calendar-day totals. Spot rows and other symbols are excluded.',
    },
    sourceSnapshot: {
      commitPinned: true,
      queriedSourceRowsWritten: 'BTC perp rows in the fixed complete panel only',
      nonBitcoinObservationsStored: 0,
      incompleteOrChangingFeedsExcluded: rowsByFeed.size - completeFeeds.size,
      dailySummary,
    },
    candidate: {
      path: path.basename(candidatePath),
      bytes: Buffer.byteLength(candidateCsv),
      sha256: sha256(candidateCsv),
    },
    dataReuseLicenseConfirmedFromRepository: true,
    sourceValuesProvisional: true,
    cutoffInclusive: cutoff,
    uploaded: false,
    mergedIntoMaster: false,
  };

  fs.writeFileSync(rawPath, rawCsv, { flag: 'wx' });
  fs.writeFileSync(candidatePath, candidateCsv, { flag: 'wx' });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    observations: candidateRows.length,
    metricIds: manifest.metricIds,
    rowsPerDay: completeFeeds.size,
    dateRange: [firstDate, lastDate],
    selectedFeeds: rawMetadata.selectedFeeds,
    excludedIncompleteFeeds: rawMetadata.excludedIncompleteFeedCount,
    nonBitcoinObservationsStored: 0,
    uploaded: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
