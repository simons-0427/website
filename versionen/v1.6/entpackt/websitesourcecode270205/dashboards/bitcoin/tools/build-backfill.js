const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { importHeader } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const privateDir = path.join(root, 'var');
const rawPath = path.join(privateDir, 'coinmetrics-btc-source.csv');
const historyPath = path.join(privateDir, 'coinmetrics-btc-history-import.csv');
const recentPath = path.join(privateDir, 'coinmetrics-btc-recent-import.csv');
const fxPath = path.join(privateDir, 'ecb-usd-eur-import.csv');
const mergedPath = path.join(privateDir, 'coinmetrics-btc-merged-import.csv');
const outputPath = path.resolve(process.argv[2] || path.join(__dirname, 'coinmetrics-backfill-enriched.csv'));
const archiveUrl = 'https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv';

if ([rawPath, historyPath, recentPath, fxPath, mergedPath].some((filename) => filename === outputPath)) {
  throw new Error('Die Zieldatei darf keine temporäre Eingabedatei überschreiben.');
}

function retryDelay(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60_000) : Math.min(1000 * 2 ** attempt, 16_000);
}

async function download(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/csv', 'User-Agent': 'smstark-bitcoin-data/1.0' },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      if (attempt === 4) throw new Error(`Coin-Metrics-Archiv blieb nach Netzwerkfehlern unerreichbar: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, '')));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, response.headers.get('Retry-After'))));
      continue;
    }
    if (!response.ok) throw new Error(`Coin-Metrics-Archiv: HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length < 100_000 || !body.subarray(0, 5).toString('utf8').startsWith('time,')) {
      throw new Error('Die Antwort sieht nicht wie das vollständige BTC-CSV-Archiv aus.');
    }
    fs.mkdirSync(privateDir, { recursive: true });
    fs.writeFileSync(rawPath, body);
    return body;
  }
  throw new Error('Coin-Metrics-Archiv blieb nach Wiederholungen nicht erreichbar.');
}

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} wurde mit Status ${result.status} beendet.`);
}

function latestCompleteDate(filename) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error('Der historische Import hat einen unerwarteten CSV-Kopf.');
  let latest = '';
  for (const line of lines) {
    const cells = line.split(',');
    if (cells[0] === 'blocks_count') latest = cells[2];
  }
  if (!latest) throw new Error('Im Archiv wurde kein vollständiger Blocktag gefunden.');
  return latest;
}

async function main() {
  const body = await download(archiveUrl);
  const archiveSha256 = require('node:crypto').createHash('sha256').update(body).digest('hex');
  run('prepare-coinmetrics.js', [rawPath, historyPath]);

  const lastArchiveDay = latestCompleteDate(historyPath);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (lastArchiveDay < yesterday) {
    const from = new Date(Date.parse(`${lastArchiveDay}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    run('fetch-coinmetrics.js', [from, yesterday, recentPath]);
  } else {
    fs.writeFileSync(recentPath, `${importHeader}\n`, 'utf8');
  }

  run('fetch-ecb-fx.js', ['2010-01-01', yesterday, fxPath]);
  run('merge-observations.js', [historyPath, recentPath, fxPath, mergedPath]);
  run('derive-coinmetrics.js', [mergedPath, outputPath]);
  run('validate-derived-issuance.js', [rawPath, outputPath]);
  run('check-observations.js', [outputPath]);
  console.log(JSON.stringify({ archiveUrl, archiveSha256, lastCompleteArchiveDay: lastArchiveDay, apiThrough: yesterday, output: outputPath }, null, 2));
}

main().catch((error) => {
  console.error(`Historischer Coin-Metrics-Aufbau fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
