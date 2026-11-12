const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { importHeader, mappings } = require('./coinmetrics-format');

const root = path.resolve(__dirname, '..');
const privateDir = path.join(root, 'var');
const args = process.argv.slice(2);
const option = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const end = option('end') || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const reuseDownloads = args.includes('--reuse-downloads');
const seed = option('seed');
const today = new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(Date.parse(end)) || new Date(end).toISOString().slice(0, 10) !== end || end >= today) throw new Error('Use a completed UTC end date.');
const activeIds = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data/active-metrics.json'), 'utf8')).metricIds);
if (activeIds.size !== 50) throw new Error('The reviewed catalog must contain 50 distinct IDs.');
const basePath = path.join(privateDir, 'bitcoin-core-inputs.csv');
const masterPath = path.join(privateDir, 'bitcoin-core-master.csv');
const allowedSources = new Set(['coinmetrics_community_btc', 'ecb_reference_rates', 'open_bitcoin_metrics_obm', 'cftc_cot_legacy', 'alternative_me_fng', 'derived_bitcoin_metrics']);
const rawSources = new Set([...allowedSources].filter((source) => source !== 'derived_bitcoin_metrics'));
const rawIds = new Set([...mappings.map(([,id]) => id), 'fx_usd_per_eur', 'block_weight_mwu', 'coin_days_destroyed', 'transaction_volume_btc', 'average_coin_dormancy_days', 'liveliness', 'utxo_count', 'difficulty', 'fear_greed_index', 'futures_open_interest_usd']);
const key = (cells) => `${cells[0]}/${cells[1]}/${cells[2]}`;
const normalized = (value) => value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const inputs = new Map();
const previous = new Map();
const revisions = [];
const runReports = {};

function run(script, scriptArgs, executable = process.execPath, prefix = []) {
  const result = spawnSync(executable, [...prefix, ...(executable === process.execPath ? ['--max-old-space-size=2048'] : []), path.join(__dirname, script), ...scriptArgs], {
    cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 20000000,
  });
  if (result.error || result.status !== 0) throw new Error(`${script}: ${result.error?.message || result.stderr || result.stdout}`);
  try { runReports[script] = JSON.parse(result.stdout); } catch { runReports[script] = { output: result.stdout.trim() }; }
  console.log(`${script}: completed`);
}

async function rows(filename, visitor) {
  const reader = readline.createInterface({ input: fs.createReadStream(filename, { encoding: 'utf8' }), crlfDelay: Infinity });
  let first = true;
  for await (const line of reader) {
    if (first) {
      first = false;
      if (line.replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Invalid CSV header: ${filename}`);
      continue;
    }
    if (!line) continue;
    const cells = line.split(',');
    if (cells.length !== 9 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[2]) || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(cells[3]) || !/^[a-f0-9]{64}$/.test(cells[8])) {
      throw new Error(`Invalid observation in ${filename}`);
    }
    if (cells[1] === 'main' && cells[2] <= end) visitor(cells, line);
  }
}

function atomicWrite(filename, content) {
  const temporary = `${filename}.next`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

function writeRows(filename, values) {
  const sorted = [...values].sort((a, b) => a.split(',').slice(0, 3).join('/').localeCompare(b.split(',').slice(0, 3).join('/')));
  atomicWrite(filename, `${importHeader}\n${sorted.join('\n')}\n`);
}

async function mergeRaw(filename) {
  await rows(filename, (cells, line) => {
    if (!rawSources.has(cells[4])) throw new Error(`Unapproved raw source: ${cells[4]}`);
    const old = inputs.get(key(cells));
    if (old) {
      const before = old.split(',');
      if (before[4] !== cells[4]) throw new Error(`Source change needs explicit review: ${key(cells)}`);
      if (normalized(before[3]) === normalized(cells[3])) return;
      revisions.push({ scope: 'input', key: key(cells), before: old, after: line });
    }
    inputs.set(key(cells), line);
  });
}

async function main() {
  fs.mkdirSync(privateDir, { recursive: true });
  if (fs.existsSync(basePath)) {
    await rows(basePath, (cells, line) => { if (rawIds.has(cells[0])) inputs.set(key(cells), line); });
    if (fs.existsSync(masterPath)) await rows(masterPath, (cells, line) => previous.set(key(cells), line));
  } else {
    if (!seed || !fs.existsSync(seed)) throw new Error('First build needs --seed=/path/to/the/preserved/legacy/master.csv');
    await rows(seed, (cells, line) => {
      if (activeIds.has(cells[0])) previous.set(key(cells), line);
      if (rawSources.has(cells[4]) && rawIds.has(cells[0])) inputs.set(key(cells), line);
    });
  }
  if (!reuseDownloads) {
    const latestCm = [...inputs.values()].filter((line) => line.startsWith('price_usd,main,')).map((line) => line.split(',')[2]).sort().at(-1);
    const from = latestCm ? new Date(Date.parse(`${latestCm}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10) : '2010-01-01';
    run('fetch-coinmetrics.js', [from, end, path.join(privateDir, 'coinmetrics-core-latest.csv')]);
    run('fetch-ecb-fx.js', [from, end, path.join(privateDir, 'ecb-core-latest.csv')]);
    run('fetch-open-bitcoin-metrics.js', [path.join(privateDir, 'obm-core-latest.csv')]);
    const php = process.env.BITCOIN_PHP_BIN || 'php';
    const phpOptions = process.env.BITCOIN_PHP_INI ? ['-c', process.env.BITCOIN_PHP_INI] : [];
    run('../cron/fetch-core-series.php', ['all', path.join(privateDir, 'core-series-latest.csv'), `--end=${end}`], php, phpOptions);
  }
  for (const name of ['coinmetrics-core-latest.csv', 'ecb-core-latest.csv', 'obm-core-latest.csv', 'core-series-latest.csv']) {
    await mergeRaw(path.join(privateDir, name));
  }
  const nextInputs = path.join(privateDir, 'core-inputs-build.csv');
  writeRows(nextInputs, inputs.values());
  run('fetch-cftc-futures-open-interest.js', [nextInputs, path.join(privateDir, 'cftc-core-latest.csv')]);
  await mergeRaw(path.join(privateDir, 'cftc-core-latest.csv'));
  writeRows(nextInputs, inputs.values());
  const cacheDir = path.join(privateDir, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const derivedPath = path.join(cacheDir, 'core-derived-build.csv');
  const obmDerivedPath = path.join(cacheDir, 'core-obm-derived-build.csv');
  run('derive-coinmetrics.js', [nextInputs, derivedPath]);
  run('derive-obm-metrics.js', [derivedPath, path.join(privateDir, 'obm-core-latest.csv'), obmDerivedPath]);
  const selected = new Map();
  for (const filename of [derivedPath, obmDerivedPath]) {
    await rows(filename, (cells, line) => {
      if (!activeIds.has(cells[0])) return;
      if (!allowedSources.has(cells[4])) throw new Error(`Unapproved public source: ${cells[4]}`);
      if (selected.has(key(cells))) throw new Error(`Duplicate output: ${key(cells)}`);
      const old = previous.get(key(cells));
      if (old) {
        const before = old.split(',');
        if (before[4] === cells[4] && normalized(before[3]) === normalized(cells[3])) line = old;
        else revisions.push({ scope: 'output', key: key(cells), before: old, after: line });
      }
      selected.set(key(cells), line);
    });
  }
  const profile = {};
  for (const line of selected.values()) {
    const [id, , date, , source] = line.split(',');
    const entry = profile[id] ||= { count: 0, first: date, last: date, sources: {} };
    entry.count++;
    if (date < entry.first) entry.first = date;
    if (date > entry.last) entry.last = date;
    entry.sources[source] = (entry.sources[source] || 0) + 1;
  }
  for (const id of activeIds) if (!profile[id]?.count) throw new Error(`Missing active metric: ${id}`);
  const revisionDir = path.join(privateDir, 'archive', 'revisions');
  if (revisions.length) {
    fs.mkdirSync(revisionDir, { recursive: true });
    atomicWrite(path.join(revisionDir, `core-revisions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ seed, end, revisions }, null, 2));
  }
  const candidateMaster = path.join(privateDir, 'core-master-candidate.csv');
  writeRows(candidateMaster, selected.values());
  run('check-observations.js', [candidateMaster]);
  fs.renameSync(candidateMaster, masterPath);
  fs.renameSync(nextInputs, basePath);
  const metadata = {
    generatedAt: new Date().toISOString(), cutoffInclusive: end, activeMetricIds: [...activeIds],
    observations: selected.size, metricCount: Object.keys(profile).length,
    master: path.basename(masterPath), masterSha256: sha256(fs.readFileSync(masterPath)),
    inputRows: inputs.size, revisionsArchived: revisions.length, metrics: profile,
    notes: ['UTC completed days only; no interpolation.', 'OBM and CFTC retain actual publication lag.', 'Coin Metrics inputs require non-commercial use and attribution.'],
  };
  atomicWrite(path.join(privateDir, 'bitcoin-core-manifest.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify({ master: masterPath, observations: selected.size, metricCount: Object.keys(profile).length, revisionsArchived: revisions.length, sourcesThrough: Object.fromEntries([...allowedSources].map((source) => [source, [...selected.values()].filter((line) => line.split(',')[4] === source).map((line) => line.split(',')[2]).sort().at(-1) || null])) }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
