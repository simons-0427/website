import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '..');
const target = path.resolve(root, '../en/nutrition/index.html');
const backup = path.join(here, 'en_nutrition_before_advanced_filters_2026-10-22.html');
const preview = path.join(here, 'en_nutrition_advanced_filters_preview_2026-10-22.html');
const current = fs.readFileSync(target, 'utf8');
const baseline = fs.existsSync(backup) ? fs.readFileSync(backup, 'utf8') : current;
const newline = baseline.includes('\r\n') ? '\r\n' : '\n';
const de = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replaceAll('\r\n', '\n');
let en = baseline.replaceAll('\r\n', '\n');
if (en.includes('function advancedDbParams()')) throw Error('Baseline already contains advanced filters');
const section = (start, end) => {
  const first = de.indexOf(start);
  const last = de.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw Error(`Missing German source section: ${start}`);
  return de.slice(first, last);
};
const replaceOnce = (from, to) => {
  const first = en.indexOf(from);
  if (first < 0 || en.indexOf(from, first + from.length) >= 0) throw Error(`Missing or repeated English insertion point: ${from.slice(0, 80)}`);
  en = en.slice(0, first) + to + en.slice(first + from.length);
};
const translations = [
  ['Zeige Lebensmittel, die alle Bedingungen erfüllen. Die Werte gelten je 100 g / 100 ml bzw. je Stück oder Tropfen, unabhängig von der Tabellenanzeige. Prozentwerte bleiben unverändert. Leere Nährwertfelder zählen als 0; eine unbekannte Eiweißqualität wird ausgeschlossen.', 'Show foods that meet every condition. Values refer to 100 g / 100 ml or one piece or drop, regardless of the table display. Percentages stay unchanged. Empty nutrient fields count as 0; foods with unknown protein quality are excluded from protein quality filters.'],
  ['Erweiterte Filter öffnen', 'Open advanced filters'],
  ['Erweiterte Filter', 'Advanced filters'],
  ['Aktive erweiterte Filter', 'Active advanced filters'],
  ['Filter zurücksetzen', 'Reset filters'],
  ['Filter anwenden', 'Apply filters'],
  ['Filter schließen', 'Close filters'],
  ['Bedingung hinzufügen', 'Add condition'],
  ['Bedingung entfernen', 'Remove condition'],
  ['Parameterauswahl schließen', 'Close parameter selection'],
  ['Bedingungsauswahl schließen', 'Close condition selection'],
  ['Parameter auswählen', 'Choose parameter'],
  ['Bedingung auswählen', 'Choose condition'],
  ['Parameter suchen', 'Search parameters'],
  ['Bedingung suchen', 'Search conditions'],
  ['Eiweißqualität / AAS (%)', 'Protein quality / AAS (%)'],
  ['Eiweiß (g)', 'Protein (g)'],
  ['Keine passenden Einträge gefunden.', 'No matching options found.'],
  ['Alle entfernen', 'Remove all'],
  ['Abbrechen', 'Cancel'],
  ['Bedingungen', 'Conditions'],
  ['Bedingung', 'Condition'],
  ['mindestens (≥)', 'at least (≥)'],
  ['mehr als (>)', 'more than (>)'],
  ['höchstens (≤)', 'at most (≤)'],
  ['weniger als (<)', 'less than (<)'],
  ['gleich (=)', 'equal to (=)'],
  ['Preis (', 'Price ('],
  [' aktiv', ' active'],
  ['z. B. 20', 'e.g. 20'],
  ['>Wert<', '>Value<'],
  ['${esc(text)} entfernen', 'Remove ${esc(text)}'],
  ['toLocaleLowerCase("de")', 'toLocaleLowerCase("en")'],
  ['toLocaleString("de-DE",', 'toLocaleString("en",'],
];
const english = input => translations.reduce((text, [from, to]) => text.replaceAll(from, to), input);

replaceOnce('  .mobile-table-hint { display: none; }', english(section('  #dbNote { margin-bottom: 0; }', '  .mobile-table-hint { display: none; }')) + '  .mobile-table-hint { display: none; }');
const noteStart = en.indexOf('      <p class="db-note" id="dbNote">');
const noteEnd = en.indexOf('      <p class="mobile-table-hint">', noteStart);
if (noteStart < 0 || noteEnd < 0) throw Error('English note block missing');
const note = en.slice(noteStart, noteEnd).trimEnd();
const button = english(section('        <button type="button" class="db-filter-trigger"', '      <p class="mobile-table-hint">'));
replaceOnce(en.slice(noteStart, noteEnd), '      <div class="db-note-row">\n        <div class="db-note-copy">\n' + note + '\n        </div>\n' + button);
replaceOnce('<dialog id="foodModal">', english(section('<dialog id="dbAdvancedModal"', '<dialog id="foodModal">')) + '<dialog id="foodModal">');
replaceOnce('let groupByCategory = false;', english(section('let dbAdvancedFilters = [];', 'let groupByCategory = false;')) + 'let groupByCategory = false;');
replaceOnce('function foodPassesDbFilters(f) {', english(section('function advancedDbParamLabel(key) {', 'function foodPassesDbFilters(f) {')) + 'function foodPassesDbFilters(f) {');
replaceOnce('  return matchesTagFilters(f, dbTags);', '  return matchesTagFilters(f, dbTags) && foodPassesAdvancedDbFilters(f);');
replaceOnce('function renderDb() {\n  const t = document.getElementById("dbTable");', 'function renderDb() {\n  const t = document.getElementById("dbTable");\n  updateAdvancedDbFilterSummary();');
replaceOnce('// ---------- add / export ----------\n', english(section('// ---------- add / export ----------\n', 'document.getElementById("dbSearch").oninput')));

const result = en.replaceAll('\n', newline);
fs.writeFileSync(preview, result, 'utf8');
console.log(`English preview: ${preview}`);
if (process.argv.includes('--apply')) {
  if (current !== baseline && current !== result) throw Error('English page changed after baseline; refusing to overwrite');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, baseline, 'utf8');
  fs.writeFileSync(target, result, 'utf8');
  console.log(`Applied: ${target}`);
}
