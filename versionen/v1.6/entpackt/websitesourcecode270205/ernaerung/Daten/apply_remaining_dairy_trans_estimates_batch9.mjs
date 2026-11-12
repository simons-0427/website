import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_009_sources.json');
const apply = process.argv.includes('--apply');
const field = 'Trans Fat (g)';
const checkedOn = '2026-09-24';
const targets = [
  [859, 'Milch entrahmt, höchstens 0,1 % Fett, laktosefrei, pasteurisiert'],
  [860, 'H-Milch entrahmt, höchstens 0,5 % Fett, ultrahocherhitzt'],
  [871, 'Sauermolke'],
];
const source = { dataset: 'CoFID_2021', code: '12-332', name: 'Cream, fresh, single', fatPer100g: 19.1, transPer100g: 0.68 };
const sourceUrl = 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid';

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (db.length !== 1516) throw new Error(`Unexpected database size ${db.length}`);
if (audit.batch !== 9 || audit.range?.first !== 801 || audit.range?.last !== 900) throw new Error('Audit is not batch 9');
const records = [];
for (const [index, expectedName] of targets) {
  const food = db[index - 1];
  if (!food || food.name !== expectedName || food.unit !== 'g') throw new Error(`Food identity or unit mismatch at ${index}`);
  if (food.nutrients[field] != null) throw new Error(`Refusing to replace existing trans value at ${index}`);
  const targetFat = Number(food.nutrients['Total Fat (g)']);
  if (!Number.isFinite(targetFat) || targetFat < 0) throw new Error(`Missing target fat at ${index}`);
  const value = Number((source.transPer100g * targetFat / source.fatPer100g).toFixed(6));
  records.push({
    databaseIndex: index,
    databaseName: expectedName,
    source: 'CoFID_2021_internet_crosswalk',
    sourceCode: source.code,
    sourceName: source.name,
    sourceUrl,
    matchMethod: 'fat_scaled_dairy_analogue',
    confidence: 'medium',
    valueBasis: 'g per 100 g edible food',
    sourceValuesPer100g: { [field]: source.transPer100g, 'Total Fat (g)': source.fatPer100g },
    targetTotalFatPer100g: targetFat,
    calculation: `Estimated from CoFID single cream: ${source.transPer100g} g trans fat / 100 g divided by ${source.fatPer100g} g total fat / 100 g, then multiplied by target total fat ${targetFat} g / 100 g. This is an analogue estimate; milk and whey sources report trans fat only as trace or do not quantify it, so the value is not represented as an item-specific assay.`,
    values: { [field]: value },
    checkedOn,
  });
}
const batch = db.slice(800, 900);
const targetIndexes = new Set(targets.map(([index]) => index));
const fieldCoverage = {};
for (const name of ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', field, 'Alcohol (g)']) {
  const filled = batch.filter((food, offset) => food.nutrients[name] != null || (name === field && targetIndexes.has(801 + offset))).length;
  fieldCoverage[name] = { filled, missing: 100 - filled, total: 100 };
}
const output = { mode: apply ? 'apply' : 'preview', proposed: records.map(({ databaseIndex, databaseName, targetTotalFatPer100g, values, calculation }) => ({ databaseIndex, databaseName, targetTotalFatPer100g, values, calculation })), fieldCoverage };
if (apply) {
  audit.records.push(...records);
  audit.fieldCoverage = fieldCoverage;
  audit.checkedOn = checkedOn;
  audit.status = 'partial_research';
  for (const record of records) db[record.databaseIndex - 1].nutrients[field] = record.values[field];
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
  const dbCheck = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const auditCheck = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  for (const record of records) {
    if (dbCheck[record.databaseIndex - 1].nutrients[field] !== record.values[field]) throw new Error(`Read-back mismatch at ${record.databaseIndex}`);
  }
  const auditIndexes = new Set(auditCheck.records.filter(record => record.source === 'CoFID_2021_internet_crosswalk' && record.matchMethod === 'fat_scaled_dairy_analogue').map(record => record.databaseIndex));
  if (records.some(record => !auditIndexes.has(record.databaseIndex))) throw new Error('Read-back source audit mismatch');
}
console.log(JSON.stringify(output, null, 2));
