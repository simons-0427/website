const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const varDir = path.join(root, 'var');
const inputPath = path.join(varDir, 'bykaranteli-options-flow-daily-btc-only-research-through-2026-09-10.csv');
const candidatePath = path.join(varDir, 'bykaranteli-options-flow-btc-import-through-2026-09-10.csv');
const manifestPath = path.join(varDir, 'bykaranteli-options-flow-btc-import-through-2026-09-10.json');
const sourceUrl = 'https://github.com/bykarantelicom/crypto-datasets/blob/66d8542392067be14e2eb8ca962ffbdafcbc51ef/data/options-flow-daily.csv';
const sourceSlug = 'bykaranteli_btc_options_flow_cc0';
const sourceCommit = '66d8542392067be14e2eb8ca962ffbdafcbc51ef';
const sourceCommitDate = '2026-09-10';
const sourceHeader = 'date,currency,trades,notional_usd,premium_usd,put_share_pct,block_trades,source';
const importHeader = 'metric_id,series_key,observation_date,value,source_slug,source_timestamp,quality_status,source_revision,raw_payload_hash';
const expectedFirst = '2026-08-05';
const expectedLast = '2026-09-10';
const expectedRows = 37;
const metrics = [
  { id: 'options_trade_count', field: 'trades', integer: true },
  { id: 'options_notional_volume_usd', field: 'notional_usd', integer: true },
  { id: 'options_premium_volume_usd', field: 'premium_usd', integer: true },
  { id: 'options_put_share_pct', field: 'put_share_pct', integer: false },
  { id: 'options_block_trades_count', field: 'block_trades', integer: true },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges UTC-Datum: ' + value);
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Ungültiges UTC-Datum: ' + value);
  }
}

function main() {
  if (!fs.existsSync(inputPath)) throw new Error('Erforderliche Datei fehlt: ' + path.basename(inputPath));
  for (const file of [candidatePath, manifestPath]) {
    if (fs.existsSync(file)) throw new Error('Zieldatei existiert bereits und wird nicht überschrieben: ' + path.basename(file));
  }

  const input = fs.readFileSync(inputPath);
  const lines = input.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== sourceHeader) throw new Error('Unerwarteter Header in options-flow-daily.csv.');

  const selected = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',');
    if (cells.length !== 8) throw new Error('Unerwartete Spaltenzahl in Quellenzeile ' + (index + 2) + '.');
    const [date, currency, trades, notional, premium, putShare, blockTrades, source] = cells;
    validDate(date);
    if (currency !== 'BTC' || source !== 'bykaranteli.com') {
      throw new Error('Der Bitcoin-only Rohsnapshot enthält eine Fremdwährungs- oder Fremdquellenzeile.');
    }
    for (const [field, value] of [['trades', trades], ['notional_usd', notional], ['premium_usd', premium], ['block_trades', blockTrades]]) {
      if (!/^(?:0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('Ungültiger Ganzzahlwert für ' + field + ' am ' + date + '.');
      }
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(putShare) || Number(putShare) < 0 || Number(putShare) > 100) {
      throw new Error('Ungültiger Prozentwert für put_share_pct am ' + date + '.');
    }
    if (Number(trades) < Number(blockTrades) || Number(notional) <= 0 || Number(premium) <= 0) {
      throw new Error('Unplausible Handels-, Nominal- oder Prämienwerte am ' + date + '.');
    }
    selected.push({ date, line, trades, notional, premium, putShare, blockTrades });
  }

  if (selected.length !== expectedRows || selected[0].date !== expectedFirst || selected.at(-1).date !== expectedLast) {
    throw new Error('BTC-Optionsabdeckung stimmt nicht mit dem geprüften Quellstand überein.');
  }
  const seenDates = new Set();
  for (const row of selected) {
    if (seenDates.has(row.date)) throw new Error('Doppelter Bitcoin-Options-UTC-Tag: ' + row.date);
    seenDates.add(row.date);
  }
  const allDates = [];
  for (let epoch = Date.parse(expectedFirst + 'T00:00:00Z'); epoch <= Date.parse(expectedLast + 'T00:00:00Z'); epoch += 86400000) {
    allDates.push(new Date(epoch).toISOString().slice(0, 10));
  }
  const missingDates = allDates.filter((date) => !seenDates.has(date));
  if (missingDates.length !== 0) throw new Error('Die Optionsquelle hat unerwartete Lücken: ' + missingDates.join(', '));

  const importRows = [];
  const stats = {};
  for (const metric of metrics) {
    const values = selected.map((row) => Number(row[metric.field === 'notional_usd' ? 'notional' : metric.field === 'premium_usd' ? 'premium' : metric.field === 'put_share_pct' ? 'putShare' : metric.field === 'block_trades' ? 'blockTrades' : 'trades']));
    stats[metric.id] = {
      rows: values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      mean: Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(6)),
    };
    for (const row of selected) {
      const value = metric.field === 'notional_usd' ? row.notional
        : metric.field === 'premium_usd' ? row.premium
          : metric.field === 'put_share_pct' ? row.putShare
            : metric.field === 'block_trades' ? row.blockTrades : row.trades;
      const payloadHash = sha256(sourceUrl + '\x1f' + metric.field + '\x1f' + row.line);
      importRows.push([
        metric.id,
        'main',
        row.date,
        value,
        sourceSlug,
        '',
        'provisional',
        'bykaranteli-options-flow-daily-btc-cc0-' + sourceCommit.slice(0, 7) + ':' + metric.field + ':' + row.date,
        payloadHash,
      ].join(','));
    }
  }

  const candidateBuffer = Buffer.from(importHeader + '\n' + importRows.join('\n') + '\n', 'utf8');
  const inputHash = sha256(input);
  const manifest = {
    createdAt: new Date().toISOString(),
    dashboard: 'bitcoin',
    source: {
      slug: sourceSlug,
      url: sourceUrl,
      file: 'data/options-flow-daily.csv',
      commit: sourceCommit,
      commitDate: sourceCommitDate,
      license: 'CC0 1.0 Universal, as stated in the repository README accessed 2026-09-30',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'ByKaranteli Crypto Datasets, BTC rows only.',
      documentation: 'https://github.com/bykarantelicom/crypto-datasets/blob/main/README.md',
    },
    sourceSnapshot: {
      inputFile: path.basename(inputPath),
      inputBytes: input.length,
      inputSha256: inputHash,
      selectedRows: selected.length,
      selectedCurrency: 'BTC',
      omittedSourceFileRows: 'ETH rows are excluded; source table showed 75 lines including its header.',
      nonBitcoinRowsWritten: 0,
    },
    rawBitcoinOnlySnapshot: {
      path: path.basename(inputPath),
      bytes: input.length,
      sha256: inputHash,
      rows: selected.length,
      currency: 'BTC',
      firstDate: expectedFirst,
      lastDate: expectedLast,
      missingDates,
      nonBitcoinRowsWritten: 0,
    },
    observations: importRows.length,
    metricIds: metrics.map((metric) => metric.id),
    metricCounts: Object.fromEntries(metrics.map((metric) => [metric.id, selected.length])),
    metricQuality: stats,
    firstObservationDate: expectedFirst,
    lastObservationDate: expectedLast,
    missingDates,
    method: {
      options_trade_count: 'Directly use the provider field trades for the daily BTC aggregate of the recorded Deribit and OKX options tape.',
      options_notional_volume_usd: 'Directly use notional_usd as reported; the CSV description does not publish its aggregation formula.',
      options_premium_volume_usd: 'Directly use premium_usd as reported; the CSV description does not publish its aggregation formula.',
      options_put_share_pct: 'Directly use put_share_pct. Its denominator is not defined in the CSV description, so it is not transformed into options_put_call_ratio.',
      options_block_trades_count: 'Directly use block_trades as reported; the CSV description does not publish the block threshold.',
    },
    sourceFreshness: 'The pinned CSV file revision is dated 2026-09-10. No newer file revision was visible at review time 2026-09-30.',
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
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({
    observations: importRows.length,
    metricIds: manifest.metricIds,
    rowsPerMetric: selected.length,
    dateRange: [expectedFirst, expectedLast],
    missingDates,
    metricQuality: stats,
    nonBitcoinRowsWritten: 0,
    uploaded: false,
  }, null, 2));
}

main();
