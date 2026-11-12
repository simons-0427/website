const fs = require('node:fs');
const path = require('node:path');
const { mappings, importHeader, observationRow } = require('./coinmetrics-format');

const [start, end, destination] = process.argv.slice(2);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
if (!datePattern.test(start || '') || !datePattern.test(end || '') || !destination) {
  console.error('Aufruf: node tools/fetch-coinmetrics.js JJJJ-MM-TT JJJJ-MM-TT <ausgabe.csv>');
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const requestedDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
if (start > end || end >= today || requestedDays > 7301) {
  throw new Error('Zeitraum ungültig, nicht abgeschlossen oder länger als 7.301 Tage.');
}

function retryDelay(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60000) : Math.min(1000 * 2 ** attempt, 16000);
}

async function request(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-data/1.0' }, signal: AbortSignal.timeout(30000) });
    } catch (error) {
      if (attempt === 4) throw new Error(`Coin Metrics blieb nach Netzwerkfehlern unerreichbar: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, '')));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, response.headers.get('Retry-After'))));
      continue;
    }
    if (!response.ok) throw new Error(`Coin Metrics HTTP ${response.status}`);
    return response.json();
  }
  throw new Error('Coin Metrics blieb nach Wiederholungen nicht erreichbar.');
}

async function main() {
  const url = new URL('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics');
  url.searchParams.set('assets', 'btc');
  url.searchParams.set('metrics', mappings.map(([field]) => field).join(','));
  url.searchParams.set('frequency', '1d');
  url.searchParams.set('start_time', start);
  url.searchParams.set('end_time', end);
  url.searchParams.set('page_size', '1000');
  const records = [];
  let nextPageUrl = null;
  const visitedPageUrls = new Set();
  let pages = 0;
  do {
    const pageUrl = nextPageUrl ? new URL(nextPageUrl) : url;
    if (pageUrl.origin !== url.origin || pageUrl.pathname !== url.pathname) {
      throw new Error('Coin Metrics lieferte eine unerwartete Zieladresse für die nächste Seite.');
    }
    const canonicalPageUrl = pageUrl.toString();
    if (visitedPageUrls.has(canonicalPageUrl)) throw new Error('Coin Metrics wiederholt eine bereits geladene Seite.');
    visitedPageUrls.add(canonicalPageUrl);
    const page = await request(pageUrl);
    if (!Array.isArray(page.data)) throw new Error('Coin-Metrics-Antwort ohne Datenliste.');
    records.push(...page.data);
    nextPageUrl = page.next_page_url || null;
    if (page.next_page_token && !nextPageUrl) throw new Error('Coin Metrics lieferte ein Seitentoken ohne nächste Seitenadresse.');
    pages++;
    if (pages > Math.ceil(requestedDays / 1000) + 2 || records.length > requestedDays) {
      throw new Error('Coin-Metrics-Antwort überschreitet die erwartete Seitengrenze.');
    }
  } while (nextPageUrl);

  const output = [importHeader];
  const seen = new Set();
  const counts = Object.fromEntries(mappings.map(([, metric]) => [metric, 0]));
  records.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  for (const record of records) {
    const date = String(record.time || '').slice(0, 10);
    if (record.asset !== 'btc' || !datePattern.test(date) || date < start || date > end || date >= today || seen.has(date)) {
      throw new Error('Coin-Metrics-Antwort enthält fremde, doppelte oder ungültige Tage.');
    }
    seen.add(date);
    for (const [field, metric, multiplier] of mappings) {
      const raw = record[field];
      if (raw === undefined || raw === null || raw === '') continue;
      if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`Ungültiger API-Wert für ${field} am ${date}.`);
      output.push(observationRow(date, field, metric, String(raw), 'api', multiplier));
      counts[metric]++;
    }
  }
  if (output.length === 1) throw new Error('Keine abgeschlossenen Beobachtungen im Zeitraum.');
  const outputPath = path.resolve(destination);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output.join('\n') + '\n');
  console.log(JSON.stringify({ days: seen.size, observations: output.length - 1, first: records[0].time, last: records.at(-1).time, metrics: counts }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
