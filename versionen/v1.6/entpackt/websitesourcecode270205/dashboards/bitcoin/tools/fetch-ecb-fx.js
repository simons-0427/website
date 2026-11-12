const fs = require('node:fs');
const path = require('node:path');
const { observationRow, importHeader } = require('./coinmetrics-format');

const [start, end, destination] = process.argv.slice(2);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const today = new Date().toISOString().slice(0, 10);
const requestedDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
if (!datePattern.test(start || '') || !datePattern.test(end || '') || !destination || start > end || end >= today || requestedDays > 7301) {
  console.error('Aufruf: node tools/fetch-ecb-fx.js JJJJ-MM-TT JJJJ-MM-TT <ausgabe.csv>');
  process.exit(1);
}

function retryDelay(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60_000) : Math.min(1000 * 2 ** attempt, 16_000);
}

function parseCsvRow(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else value += char;
  }
  if (quoted) throw new Error('ECB-CSV enthält ein nicht geschlossenes Anführungszeichen.');
  cells.push(value);
  return cells;
}

async function fetchCsv() {
  const url = new URL('https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A');
  url.searchParams.set('startPeriod', start);
  url.searchParams.set('endPeriod', end);
  url.searchParams.set('format', 'csvdata');
  url.searchParams.set('detail', 'dataonly');
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'text/csv', 'User-Agent': 'smstark-bitcoin-data/1.0' },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (attempt === 4) throw new Error(`ECB-Referenzkurs nach Netzwerkfehlern nicht erreichbar: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, '')));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, response.headers.get('Retry-After'))));
      continue;
    }
    if (!response.ok) throw new Error(`ECB-Datenportal antwortete mit HTTP ${response.status}.`);
    return response.text();
  }
  throw new Error('ECB-Datenportal blieb nach Wiederholungen unerreichbar.');
}

async function main() {
  const text = await fetchCsv();
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvRow(lines.shift() || '');
  const dateIndex = header.indexOf('TIME_PERIOD');
  const valueIndex = header.indexOf('OBS_VALUE');
  const keyIndex = header.indexOf('KEY');
  if (dateIndex < 0 || valueIndex < 0 || keyIndex < 0) throw new Error('ECB-Antwort hat nicht das erwartete CSV-Format.');

  const output = [importHeader];
  const seen = new Set();
  for (const line of lines) {
    if (!line) continue;
    const cells = parseCsvRow(line);
    const date = cells[dateIndex];
    const raw = cells[valueIndex];
    if (cells[keyIndex] !== 'EXR.D.USD.EUR.SP00.A' || !datePattern.test(date) || date < start || date > end || seen.has(date)) {
      throw new Error('ECB-Antwort enthält eine fremde, doppelte oder ungültige Beobachtung.');
    }
    if (raw === '') continue;
    seen.add(date);
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(raw) || Number(raw) <= 0) throw new Error(`Ungültiger ECB-Kurs am ${date}.`);
    output.push(observationRow(date, 'EXR.D.USD.EUR.SP00.A', 'fx_usd_per_eur', raw, 'api', '1', 'ecb_reference_rates'));
  }
  if (seen.size === 0) throw new Error('ECB-Antwort enthält keine Beobachtungen im angeforderten Zeitraum.');
  const outputPath = path.resolve(destination);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${output.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({ source: 'ECB EXR.D.USD.EUR.SP00.A', observations: seen.size, first: [...seen].sort()[0], last: [...seen].sort().at(-1), output: outputPath }, null, 2));
}

main().catch((error) => { console.error(`ECB-Abruf fehlgeschlagen: ${error.message}`); process.exitCode = 1; });
