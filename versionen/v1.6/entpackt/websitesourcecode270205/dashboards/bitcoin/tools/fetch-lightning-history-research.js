const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const source = 'mempool_space_lightning_research_only';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const cutoffDate = process.argv[2] || new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) throw new Error('Aufruf: node tools/fetch-lightning-history-research.js JJJJ-MM-TT');

const rawPath = path.join(varDir, `lightning-history-research-through-${cutoffDate}.json`);
const importPath = path.join(varDir, `lightning-history-research-through-${cutoffDate}.csv`);
const historyUrl = 'https://mempool.space/api/v1/lightning/statistics/3y';
const latestUrl = 'https://mempool.space/api/v1/lightning/statistics/latest';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function formatValue(value) {
  if (!Number.isFinite(value)) throw new Error(`Nicht endlicher Wert: ${value}`);
  const rounded = Number(value.toFixed(12));
  if (Object.is(rounded, -0)) return '0';
  return rounded.toFixed(12).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
}

function utcDate(epochSeconds) {
  if (typeof epochSeconds === 'string') {
    const milliseconds = Date.parse(epochSeconds);
    if (!Number.isFinite(milliseconds)) throw new Error(`Ungueltiger Lightning-Zeitstempel: ${epochSeconds}`);
    const date = new Date(milliseconds);
    if (date.toISOString().slice(11, 19) !== '00:00:00') {
      throw new Error(`Lightning-Zeitstempel liegt nicht auf UTC-Mitternacht: ${epochSeconds}`);
    }
    return date.toISOString().slice(0, 10);
  }
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 0) throw new Error('Ungueltiger Lightning-Zeitstempel.');
  const date = new Date(epochSeconds * 1000);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(11, 19) !== '00:00:00') {
    throw new Error(`Lightning-Zeitstempel liegt nicht auf UTC-Mitternacht: ${epochSeconds}`);
  }
  return date.toISOString().slice(0, 10);
}

function safeInteger(row, field, minimum = 0) {
  if (!Number.isSafeInteger(row[field]) || row[field] < minimum) {
    throw new Error(`Ungueltiger Lightning-Wert ${field}: ${row[field]}`);
  }
  return row[field];
}

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 research-only' },
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      if (attempt === 3) throw new Error(`Mempool.space nicht erreichbar: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 3) throw new Error(`Mempool.space HTTP ${response.status} nach Wiederholungen.`);
      const retryAfter = Number(response.headers.get('Retry-After'));
      await new Promise((resolve) => setTimeout(resolve,
        Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`Mempool.space HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 20 || bytes.length > 8_000_000) throw new Error('Lightning-Antwortgroesse unerwartet.');
    let data;
    try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Lightning-Antwort ist kein gueltiges JSON.'); }
    return { data, bytes };
  }
  throw new Error('Mempool.space blieb nach Wiederholungen unerreichbar.');
}

function makeRow(metric, date, value, timestamp, revision, hash, sourceSlug = 'derived_bitcoin_metrics') {
  return [metric, 'main', date, formatValue(value), sourceSlug, timestamp, 'provisional', revision, hash].join(',');
}

async function main() {
  if (!fs.existsSync(path.join(varDir, '.htaccess'))) throw new Error('var/.htaccess fehlt; der Forschungsexport waere nicht geschuetzt.');
  if (fs.existsSync(rawPath) || fs.existsSync(importPath)) throw new Error('Die Forschungsausgabe existiert bereits; nichts wurde ueberschrieben.');

  const [historyResponse, latestResponse] = await Promise.all([getJson(historyUrl), getJson(latestUrl)]);
  if (!Array.isArray(historyResponse.data) || historyResponse.data.length === 0 || !latestResponse.data?.latest) {
    throw new Error('Unerwartetes Mempool.space-Lightning-Antwortformat.');
  }

  const history = historyResponse.data.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('Ungueltiger Lightning-Tagespunkt.');
    const date = utcDate(row.added);
    const item = {
      added: row.added,
      date,
      channel_count: safeInteger(row, 'channel_count', 1),
      total_capacity: safeInteger(row, 'total_capacity', 1),
    };
    return item;
  }).filter((row) => row.date <= cutoffDate).sort((a, b) => a.added - b.added);
  if (history.length < 30) throw new Error('Weniger als 30 gueltige Lightning-Historienpunkte.');

  const dates = new Set();
  for (const row of history) {
    if (dates.has(row.date)) throw new Error(`Doppelter Lightning-UTC-Tag: ${row.date}`);
    dates.add(row.date);
  }

  const latest = latestResponse.data.latest;
  const latestDate = utcDate(latest.added);
  const latestEpochSeconds = typeof latest.added === 'number' ? latest.added : Date.parse(latest.added) / 1000;
  const latestForCutoff = latestDate <= cutoffDate ? {
    added: latestEpochSeconds,
    date: latestDate,
    node_count: safeInteger(latest, 'node_count', 1),
    med_capacity: safeInteger(latest, 'med_capacity', 1),
    avg_capacity: safeInteger(latest, 'avg_capacity', 1),
    channel_count: safeInteger(latest, 'channel_count', 1),
    total_capacity: safeInteger(latest, 'total_capacity', 1),
  } : null;
  if (latestForCutoff && Math.abs(latestForCutoff.avg_capacity
    - latestForCutoff.total_capacity / latestForCutoff.channel_count) > 1.1) {
    throw new Error('Lightning-Durchschnittskapazitaet passt nicht zum Aggregat.');
  }

  const rows = [];
  const indexes = new Map();
  for (const item of history) {
    const timestamp = new Date(item.added * 1000).toISOString().replace('.000Z', 'Z');
    const sourceHash = sha256(`mempool-space-lightning-history-v1\x1f${JSON.stringify(item)}`);
    const revision = `mempool-space-lightning-history-3y:${item.date}`;
    const capacity = item.total_capacity / 100_000_000;
    const average = capacity / item.channel_count;
    const capacityHash = sha256(`${sourceHash}\x1f${item.total_capacity}`);
    const channelHash = sha256(`${sourceHash}\x1f${item.channel_count}`);
    rows.push(makeRow('lightning_capacity_btc', item.date, capacity, timestamp, revision, capacityHash, source));
    rows.push(makeRow('lightning_channels', item.date, item.channel_count, timestamp, revision, channelHash, source));
    const averageValue = formatValue(average);
    rows.push(makeRow('lightning_avg_channel_btc', item.date, average, timestamp,
      'derived-mempool-lightning-v1:capacity-divided-by-channel-count',
      sha256(['capacity-divided-by-channel-count', item.date, capacityHash, channelHash, averageValue].join('\x1f'))));
    indexes.set(item.date, { capacity, channelCount: item.channel_count, capacityHash, channelHash, timestamp });
  }

  for (const [date, current] of indexes) {
    const priorDate = new Date(Date.parse(`${date}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    const prior = indexes.get(priorDate);
    if (!prior) continue;
    const capacityChange = (current.capacity / prior.capacity - 1) * 100;
    const channelChange = (current.channelCount / prior.channelCount - 1) * 100;
    rows.push(makeRow('lightning_capacity_change_30d_pct', date, capacityChange, current.timestamp,
      'derived-mempool-lightning-v1:capacity-change-over-30-calendar-days',
      sha256(['capacity-change-over-30-calendar-days', date, current.capacityHash, prior.capacityHash, formatValue(capacityChange)].join('\x1f'))));
    rows.push(makeRow('lightning_channels_change_30d_pct', date, channelChange, current.timestamp,
      'derived-mempool-lightning-v1:channels-change-over-30-calendar-days',
      sha256(['channels-change-over-30-calendar-days', date, current.channelHash, prior.channelHash, formatValue(channelChange)].join('\x1f'))));
  }

  if (latestForCutoff) {
    const timestamp = new Date(latestForCutoff.added * 1000).toISOString().replace('.000Z', 'Z');
    const hash = sha256(`mempool-space-lightning-latest-v1\x1f${JSON.stringify(latestForCutoff)}`);
    const revision = `mempool-space-lightning-statistics-latest:${latestForCutoff.date}`;
    rows.push(makeRow('lightning_nodes', latestForCutoff.date, latestForCutoff.node_count, timestamp, revision,
      sha256(`${hash}\x1f${latestForCutoff.node_count}`), source));
    rows.push(makeRow('lightning_median_channel_btc', latestForCutoff.date, latestForCutoff.med_capacity / 100_000_000, timestamp, revision,
      sha256(`${hash}\x1f${latestForCutoff.med_capacity}`), source));
  }

  const ordered = rows.sort((a, b) => a.split(',')[2].localeCompare(b.split(',')[2]) || a.split(',')[0].localeCompare(b.split(',')[0]));
  const raw = {
    source: 'Mempool.space REST API, Bitcoin Lightning Network',
    sourceLicense: 'No separate API-data license confirmed; research candidate only, not cleared for public redistribution.',
    fetchedAtUtc: new Date().toISOString(),
    cutoffDate,
    historyInterval: '3y',
    historyUrl,
    latestUrl,
    history,
    latest: latestForCutoff,
  };
  const rawBytes = Buffer.from(`${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  const csvBytes = Buffer.from(`${importHeader}\n${ordered.join('\n')}\n`, 'utf8');
  fs.writeFileSync(rawPath, rawBytes, { flag: 'wx' });
  try {
    fs.writeFileSync(importPath, csvBytes, { flag: 'wx' });
  } catch (error) {
    fs.unlinkSync(rawPath);
    throw error;
  }

  console.log(JSON.stringify({
    status: 'private Bitcoin Lightning research candidate; public redistribution not cleared',
    cutoffDate,
    historyFirst: history[0].date,
    historyLast: history.at(-1).date,
    historyDays: history.length,
    dataLagDays: (Date.parse(`${cutoffDate}T00:00:00Z`) - Date.parse(`${history.at(-1).date}T00:00:00Z`)) / 86_400_000,
    latestSnapshotDate: latestForCutoff?.date || null,
    records: ordered.length,
    metrics: [...new Set(ordered.map((line) => line.split(',')[0]))].sort(),
    importPath,
    rawPath,
    rawSha256: sha256(rawBytes),
    importSha256: sha256(csvBytes),
  }, null, 2));
}

main().catch((error) => {
  console.error(`Lightning-Forschungsexport fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
