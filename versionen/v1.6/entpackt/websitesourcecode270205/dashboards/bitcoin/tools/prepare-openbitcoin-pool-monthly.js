const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const apiBase = 'https://openbitcoin.com/api/v1';
const cutoffInclusive = '2026-09-28';
const rawPath = path.join(varDir, 'openbitcoin-pools-monthly-research-2026-09-29.json');
const candidatePath = path.join(varDir, 'openbitcoin-pools-monthly-research-through-2026-09-28.csv');
const sourceSlug = 'openbitcoin_node_api';
const derivedSlug = 'derived_bitcoin_metrics';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decimal(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Ungültiger Monatswert: ${value}`);
  return value.toFixed(12).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function csvRow(metric, series, date, value, source, timestamp, revision, hash) {
  return [metric, series, date, decimal(value), source, timestamp, 'provisional', revision, hash].join(',');
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Bitcoin-Dashboard-private-research/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenBitcoin HTTP ${response.status} für ${url}`);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenBitcoin lieferte ungültiges JSON für ${url}`);
  }
  return { raw, parsed, sha256: sha256(Buffer.from(raw, 'utf8')) };
}

function saveRaw(payload) {
  fs.writeFileSync(rawPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' });
}

async function fetchAll() {
  let payload;
  if (fs.existsSync(rawPath)) {
    payload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    if (payload.complete === true) return payload;
    if (payload.source !== 'OpenBitcoin Bitcoin mainnet API' || !payload.poolResponses) {
      throw new Error('Unvollständige Rohdatei hat ein unerwartetes Format.');
    }
  } else {
    const catalog = await getJson(`${apiBase}/pools`);
    if (!Array.isArray(catalog.parsed.pools) || catalog.parsed.pools.length === 0
      || !catalog.parsed.unknown || !Number.isSafeInteger(catalog.parsed.totalBlocks)) {
      throw new Error('OpenBitcoin-Poolkatalog hat ein unerwartetes Format.');
    }
    payload = {
      source: 'OpenBitcoin Bitcoin mainnet API',
      api: 'GET /api/v1/pools and GET /api/v1/pool/{slug}?page=1',
      cutoffInclusive,
      retrievedAt: new Date().toISOString(),
      catalogRaw: catalog.raw,
      catalogSha256: catalog.sha256,
      catalogPoolCount: catalog.parsed.pools.length,
      poolResponses: {},
      complete: false,
    };
    saveRaw(payload);
  }

  const catalog = JSON.parse(payload.catalogRaw);
  if (!Array.isArray(catalog.pools) || catalog.pools.length !== payload.catalogPoolCount) {
    throw new Error('Der gespeicherte OpenBitcoin-Poolkatalog ist inkonsistent.');
  }
  const seenSlugs = new Set();
  for (let index = 0; index < catalog.pools.length; index++) {
    const pool = catalog.pools[index];
    if (typeof pool.slug !== 'string' || !/^[a-z0-9-]+$/.test(pool.slug) || seenSlugs.has(pool.slug)) {
      throw new Error('OpenBitcoin-Poolkatalog enthält einen ungültigen oder doppelten Slug.');
    }
    seenSlugs.add(pool.slug);
    if (payload.poolResponses[pool.slug]) continue;

    await delay(1_000);
    const result = await getJson(`${apiBase}/pool/${encodeURIComponent(pool.slug)}?page=1`);
    const details = result.parsed;
    if (details.slug !== pool.slug || !Array.isArray(details.monthly) || !Number.isSafeInteger(details.blocks)
      || details.blocks < 0 || typeof details.asOf !== 'string' || !Number.isFinite(Date.parse(details.asOf))) {
      throw new Error(`OpenBitcoin-Pooldaten für ${pool.slug} haben ein unerwartetes Format.`);
    }
    let totalMonthlyBlocks = 0;
    let previousMonth = '';
    const months = new Set();
    for (const point of details.monthly) {
      if (!Array.isArray(point) || point.length !== 2 || !Number.isSafeInteger(point[0])
        || !Number.isSafeInteger(point[1]) || point[1] <= 0) {
        throw new Error(`Ungültiger Monatseintrag für OpenBitcoin-Pool ${pool.slug}.`);
      }
      const date = new Date(point[0] * 1000);
      if (date.toISOString().slice(8, 19) !== '01T00:00:00'
        || date.toISOString().slice(0, 10) !== date.toISOString().slice(0, 7) + '-01') {
        throw new Error(`Monatsstempel ist nicht UTC-Monatsbeginn für ${pool.slug}.`);
      }
      const month = date.toISOString().slice(0, 10);
      if (month <= previousMonth || months.has(month)) {
        throw new Error(`Monate sind unsortiert oder doppelt für OpenBitcoin-Pool ${pool.slug}.`);
      }
      months.add(month);
      previousMonth = month;
      totalMonthlyBlocks += point[1];
    }
    if (totalMonthlyBlocks !== details.blocks) {
      throw new Error(`Monatssumme für ${pool.slug} (${totalMonthlyBlocks}) stimmt nicht mit Gesamtblöcken (${details.blocks}) überein.`);
    }
    payload.poolResponses[pool.slug] = {
      raw: result.raw,
      sha256: result.sha256,
      monthlyCount: details.monthly.length,
      monthlyBlockTotal: totalMonthlyBlocks,
      asOf: details.asOf,
    };
    if ((index + 1) % 5 === 0 || index + 1 === catalog.pools.length) {
      payload.fetchedPoolCount = Object.keys(payload.poolResponses).length;
      payload.lastProgressAt = new Date().toISOString();
      saveRaw(payload);
      console.log(`OpenBitcoin Poolhistorie: ${payload.fetchedPoolCount}/${catalog.pools.length}`);
    }
  }
  payload.complete = true;
  payload.fetchedPoolCount = Object.keys(payload.poolResponses).length;
  payload.completedAt = new Date().toISOString();
  saveRaw(payload);
  return payload;
}

function firstDayOfPreviousMonth(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
}

function prepare(payload) {
  if (payload.complete !== true || payload.cutoffInclusive !== cutoffInclusive) {
    throw new Error('Die Rohdatei ist unvollständig oder hat einen anderen Stichtag.');
  }
  const catalog = JSON.parse(payload.catalogRaw);
  const allPools = catalog.pools.map((pool) => {
    const response = payload.poolResponses[pool.slug];
    if (!response?.raw || response.sha256 !== sha256(Buffer.from(response.raw, 'utf8'))) {
      throw new Error(`Rohdaten-Hash stimmt nicht für ${pool.slug}.`);
    }
    const details = JSON.parse(response.raw);
    const monthly = new Map(details.monthly.map(([timestamp, blocks]) => [
      new Date(timestamp * 1000).toISOString().slice(0, 10),
      blocks,
    ]));
    return {
      slug: pool.slug,
      series: `pool_${pool.slug.replace(/-/g, '_')}`,
      firstMonth: [...monthly.keys()].sort()[0],
      monthly,
      asOf: details.asOf,
      responseHash: response.sha256,
    };
  });
  const seriesKeys = new Set();
  for (const pool of allPools) {
    if (!/^[a-z0-9_]+$/.test(pool.series) || seriesKeys.has(pool.series)) {
      throw new Error(`Pool-Serienschlüssel ist ungültig oder doppelt: ${pool.series}`);
    }
    seriesKeys.add(pool.series);
  }

  const lastCompleteMonth = firstDayOfPreviousMonth(cutoffInclusive);
  const firstMonth = allPools.map((pool) => pool.firstMonth).sort()[0];
  const monthlyCounts = new Map();
  for (let date = firstMonth; date <= lastCompleteMonth;) {
    const counts = [];
    let denominator = 0;
    for (const pool of allPools) {
      if (date < pool.firstMonth) continue;
      const count = pool.monthly.get(date) || 0;
      counts.push([pool.slug, count, pool.responseHash]);
      denominator += count;
    }
    if (denominator > 0) {
      const inputHash = sha256(JSON.stringify({ method: 'openbitcoin-monthly-attributed-block-shares-v1', date, counts, denominator }));
      monthlyCounts.set(date, { counts, denominator, inputHash });
    }
    const [year, month] = date.slice(0, 7).split('-').map(Number);
    date = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  }

  const rows = [];
  const maxSourceTimestamp = allPools.map((pool) => pool.asOf).sort().at(-1).replace(/.d{3}Z$/, 'Z');
  for (const [date, data] of monthlyCounts) {
    let hhi = 0;
    for (const [slug, count] of data.counts) {
      const pool = allPools.find((item) => item.slug === slug);
      const share = count / data.denominator * 100;
      hhi += share * share;
      rows.push(csvRow(
        'mining_pool_share',
        pool.series,
        date,
        share,
        sourceSlug,
        maxSourceTimestamp,
        `openbitcoin-monthly-pool-share-v1:${slug}:${date}`,
        data.inputHash,
      ));
    }
    rows.push(csvRow(
      'pool_concentration_hhi',
      'main',
      date,
      hhi,
      derivedSlug,
      '',
      `derived-openbitcoin-monthly-pool-hhi-v1:${date}`,
      sha256(`hhi:${data.inputHash}`),
    ));
  }
  rows.sort((left, right) => {
    const a = left.split(',');
    const b = right.split(',');
    return a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]);
  });
  fs.writeFileSync(candidatePath, `${importHeader}\n${rows.join('\n')}\n`, { encoding: 'utf8' });
  return {
    fetchedPools: allPools.length,
    firstMonth,
    lastCompleteMonth,
    months: monthlyCounts.size,
    poolSeries: allPools.length,
    poolShareRows: rows.filter((row) => row.startsWith('mining_pool_share,')).length,
    hhiRows: rows.filter((row) => row.startsWith('pool_concentration_hhi,')).length,
    candidatePath: path.basename(candidatePath),
    sourceAsOf: maxSourceTimestamp,
  };
}

async function main() {
  const mode = process.argv[2] || '--prepare';
  if (mode !== '--fetch' && mode !== '--prepare') {
    throw new Error('Aufruf: node tools/prepare-openbitcoin-pool-monthly.js [--fetch|--prepare]');
  }
  const payload = mode === '--fetch' ? await fetchAll() : JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  console.log(JSON.stringify(prepare(payload), null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
