import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const rows = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const update = {
  databaseIndex: 106,
  databaseName: 'Haferdrink, Barista',
  field: 'Trans Fat (g)',
  value: 0,
  checkedOn: '2026-09-24',
  sourceFood: 'So Good Barista Oat Milk',
  sourceUrl: 'https://www.sanitarium.com/nz/products/so-good/barista-milks/so-good-oat/',
  sourceValue: 0,
  sourceValueType: 'Published product label',
  match: 'barista_oat_drink_close_match',
  sourceMacrosPer100ml: { fat: 3.1, protein: 1, carbohydrate: 6 },
  targetMacrosPer100ml: { fat: 3.12, protein: 0.832, carbohydrate: 6.76 },
  note: 'Offizielle Produktangaben pro 100 ml: 3,1 g Fett, 1 g Protein, 6 g Kohlenhydrate und 0 g Transfett. Die Makros stimmen eng mit dem Datenbankeintrag überein. Nur der Transfettwert wurde übernommen.'
};
const row = rows[update.databaseIndex];
if (!row || row.name !== update.databaseName) throw new Error('Index-/Namensprüfung für Haferdrink Barista fehlgeschlagen.');
const existing = row.nutrients[update.field];
if (existing === null || existing === undefined) row.nutrients[update.field] = update.value;
else if (existing !== update.value) throw new Error(`Widersprüchlicher Wert in database.json: ${existing}`);

audit.sources.SoGoodBarista2026 = {
  url: update.sourceUrl,
  citation: 'Sanitarium, So Good Barista Oat Milk, published nutrition information per 100 mL.',
  checkedOn: update.checkedOn
};
audit.internetResearchUpdates ??= [];
const prior = audit.internetResearchUpdates.find(entry => entry.databaseIndex === update.databaseIndex && entry.field === update.field);
if (prior && prior.value !== update.value) throw new Error('Widerspruch zwischen Datenbank- und Auditwert.');
if (!prior) audit.internetResearchUpdates.push(update);

const scopedRows = rows.slice(100, 200);
audit.fieldCoverage = Object.fromEntries(audit.fields.map(field => {
  const filled = scopedRows.filter(item => item.nutrients[field] !== null && item.nutrients[field] !== undefined).length;
  return [field, { filled, missing: scopedRows.length - filled, total: scopedRows.length }];
}));
audit.remainingNulls = scopedRows.flatMap((item, offset) => {
  const missingFields = audit.fields.filter(field => item.nutrients[field] === null || item.nutrients[field] === undefined);
  return missingFields.length ? [{ databaseIndex: 100 + offset, databaseName: item.name, missingFields, reason: 'Kein passender numerischer Quellenwert belegt; null bleibt erhalten.' }] : [];
});

fs.writeFileSync(databasePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ updated: { index: update.databaseIndex, name: update.databaseName, field: update.field, value: update.value }, coverage: audit.fieldCoverage }, null, 2));
