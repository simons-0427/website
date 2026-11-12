const fs = require('node:fs');
const path = require('node:path');
const { importHeader } = require('./coinmetrics-format');

const argumentsList = process.argv.slice(2);
if (argumentsList.length < 3) {
  console.error('Aufruf: node tools/merge-observations.js <eingabe1.csv> <eingabe2.csv> [weitere-eingaben.csv ...] <ausgabe.csv>');
  process.exit(1);
}
const outputFile = argumentsList.pop();
const inputFiles = argumentsList;
const outputPath = path.resolve(outputFile);
if (inputFiles.some((input) => path.resolve(input) === outputPath)) throw new Error('Ausgabe darf keine Eingabedatei überschreiben.');
const result = [importHeader];
const keys = new Set();
const counts = [];
for (const filename of inputFiles) {
  const lines = fs.readFileSync(filename, 'utf8').trimEnd().split(/\r?\n/);
  if (lines.shift().replace(/^\uFEFF/, '') !== importHeader) throw new Error(`Ungültiger Header: ${filename}`);
  counts.push(lines.length);
  for (const line of lines) {
    const cells = line.split(',');
    if (cells.length !== 9) throw new Error(`Ungültige Zeile in ${filename}`);
    const key = `${cells[0]}/${cells[1]}/${cells[2]}`;
    if (keys.has(key)) throw new Error(`Überlappende Beobachtung: ${key}`);
    keys.add(key);
    result.push(line);
  }
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, result.join('\n') + '\n');
console.log(JSON.stringify({ inputRows: counts, total: result.length - 1 }));
