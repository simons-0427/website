const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const masterPath = path.join(varDir, 'bitcoin-backfill-cointime-cftc-options.csv');
const sourceUrl = 'https://mempool.space/api/mempool';
const sourceSlug = 'mempool_space_rest_api';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getSnapshot() {
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(sourceUrl, {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'smstark-bitcoin-data/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (attempt === 4) throw new Error(`Mempool.space blieb nach Netzwerkfehlern unerreichbar: ${error.message}`);
      await wait(Math.min(1000 * 2 ** attempt, 16000));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 4) throw new Error(`Mempool.space HTTP ${response.status} nach Wiederholungen.`);
      const retryAfter = Number(response.headers.get('Retry-After'));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60000) : Math.min(1000 * 2 ** attempt, 16000));
      continue;
    }
    if (!response.ok) throw new Error(`Mempool.space HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 20 || bytes.length > 2_000_000) throw new Error('Mempool.space Antwortgröße außerhalb des erwarteten Bereichs.');
    return { bytes, responseDate: response.headers.get('Date') };
  }
  throw new Error('Mempool.space blieb nach Wiederholungen unerreichbar.');
}

function decimal(value, places) {
  const fixed = value.toFixed(places);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function makeRow(metric, date, value, timestamp, revision, hash) {
  return [metric, 'main', date, value, sourceSlug, timestamp, 'provisional', revision, hash].join(',');
}

async function main() {
  if (!fs.existsSync(masterPath)) throw new Error('Der kombinierte Bitcoin-Export fehlt.');
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) throw new Error('var/.htaccess fehlt; der Rohsnapshot wäre nicht geschützt.');

  const { bytes, responseDate } = await getSnapshot();
  let payload;
  try {
    payload = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Mempool.space lieferte kein gültiges JSON.');
  }
  for (const field of ['count', 'vsize', 'total_fee']) {
    if (!Number.isSafeInteger(payload[field]) || payload[field] < 0) throw new Error(`Ungültiger ganzzahliger Mempool-Wert: ${field}.`);
  }
  if (!Array.isArray(payload.fee_histogram) || payload.fee_histogram.some((row) => !Array.isArray(row) || row.length !== 2 || row.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new Error('Unerwartetes Mempool-fee_histogram-Format.');
  }

  const timestampDate = responseDate && !Number.isNaN(Date.parse(responseDate)) ? new Date(responseDate) : new Date();
  const sourceTimestamp = timestampDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const observationDate = sourceTimestamp.slice(0, 10);
  const rawHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const revision = `mempool-space-api:${sourceTimestamp}`;
  const rows = [
    makeRow('mempool_pending_txs', observationDate, String(payload.count), sourceTimestamp, revision, rawHash),
    makeRow('mempool_vsize_mb', observationDate, decimal(payload.vsize / 1_000_000, 12), sourceTimestamp, revision, rawHash),
    makeRow('mempool_fees_btc', observationDate, decimal(payload.total_fee / 100_000_000, 12), sourceTimestamp, revision, rawHash),
  ];

  const originalBytes = fs.readFileSync(masterPath);
  const originalText = originalBytes.toString('utf8');
  const lines = originalText.trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Der kombinierte Export hat einen unerwarteten CSV-Kopf.');
  const existing = new Map();
  for (const line of lines) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error('Der kombinierte Export enthält eine fehlerhafte CSV-Zeile.');
    const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
    if (existing.has(key)) throw new Error(`Der kombinierte Export enthält einen doppelten Schlüssel: ${key}.`);
    existing.set(key, cells);
  }

  const additions = [];
  for (const row of rows) {
    const cells = row.split(',');
    const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
    const prior = existing.get(key);
    if (!prior) {
      additions.push(row);
      continue;
    }
    if (prior[3] !== cells[3] || prior[4] !== cells[4] || prior[8] !== cells[8]) {
      throw new Error(`Snapshot kollidiert mit einem bestehenden Wert; nichts wurde geändert: ${key}.`);
    }
  }

  const rawPath = path.join(varDir, `mempool-space-api-${observationDate}.json`);
  if (fs.existsSync(rawPath)) {
    const existingRawHash = crypto.createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex');
    if (existingRawHash !== rawHash) throw new Error(`Für ${observationDate} existiert bereits ein anderer Rohsnapshot; nichts wurde überschrieben.`);
  } else {
    fs.writeFileSync(rawPath, bytes, { flag: 'wx' });
  }

  if (additions.length > 0) {
    const suffix = `${originalBytes.length > 0 && !originalText.endsWith('\n') ? '\n' : ''}${additions.join('\n')}\n`;
    const nextPath = `${masterPath}.next`;
    if (fs.existsSync(nextPath)) throw new Error('Ein vorheriger temporärer Export liegt noch vor; nichts wurde überschrieben.');
    fs.writeFileSync(nextPath, Buffer.concat([originalBytes, Buffer.from(suffix, 'utf8')]), { flag: 'wx' });
    try {
      fs.renameSync(nextPath, masterPath);
    } catch (error) {
      if (fs.existsSync(nextPath)) fs.unlinkSync(nextPath);
      throw error;
    }
  }

  console.log(JSON.stringify({
    source: sourceUrl,
    snapshotTimestampUtc: sourceTimestamp,
    observationDate,
    values: {
      mempool_pending_txs: payload.count,
      mempool_vsize_mb: decimal(payload.vsize / 1_000_000, 12),
      mempool_fees_btc: decimal(payload.total_fee / 100_000_000, 12),
      vsizeVirtualBytes: payload.vsize,
      totalFeeSatoshis: payload.total_fee,
    },
    rawPayloadSha256: rawHash,
    rawPayloadFile: path.relative(root, rawPath),
    observationsAdded: additions.length,
    observationsAlreadyPresent: rows.length - additions.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
