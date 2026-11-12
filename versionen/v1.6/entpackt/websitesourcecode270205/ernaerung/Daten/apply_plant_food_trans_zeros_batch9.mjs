import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_009_sources.json');
const apply = process.argv.includes('--apply');
const field = 'Trans Fat (g)';
const checkedOn = '2026-09-24';
const fdaUrl = 'https://www.fda.gov/food/food-additives-petitions/trans-fat';
const targets = [
  [813, 'Weizen Vollkornschrot'],
  [814, 'Weizen Flocken'],
  [815, 'Hartweizen Vollkorngrieß'],
  [816, 'Hartweizen ganzes Korn, roh'],
  [817, 'Bulgur (Hartweizen) roh'],
  [818, 'Couscous (Hartweizen) roh'],
  [819, 'Weizen Grütze'],
  [820, 'Roggen ganzes Korn, roh'],
  [821, 'Dinkel Flocken'],
  [822, 'Reis Kleie'],
  [823, 'Emmer ganzes Korn, roh'],
  [824, 'Emmer Flocken'],
  [825, 'Einkorn Flocken'],
  [826, 'Einkorn ganzes Korn, roh'],
  [827, 'Grünkern Vollkornmehl'],
  [828, 'Grünkern Vollkornschrot'],
  [829, 'Grünkern Grütze'],
  [830, 'Buchweizen Grieß'],
  [831, 'Braunhirse Mehl'],
  [840, 'Lulo/Naranjilla, roh'],
  [847, 'Bärlauch roh'],
  [853, 'Linse rot reif'],
];

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (db.length !== 1516) throw new Error(`Unexpected database size ${db.length}; expected 1516`);
if (audit.batch !== 9 || audit.range?.first !== 801 || audit.range?.last !== 900) throw new Error('Audit is not batch 9 (801-900)');
const records = [];
for (const [index, expectedName] of targets) {
  const food = db[index - 1];
  if (!food || food.name !== expectedName) throw new Error(`Name mismatch at database index ${index}`);
  if (food.unit !== 'g') throw new Error(`Unexpected unit ${food.unit} at index ${index}`);
  if (food.nutrients[field] != null && food.nutrients[field] !== 0) throw new Error(`Refusing to replace existing trans-fat value at index ${index}`);
  records.push({
    databaseIndex: index,
    databaseName: expectedName,
    source: 'FDA_food_identity_inference',
    sourceName: 'FDA Trans Fat overview',
    sourceUrl: fdaUrl,
    matchMethod: 'single_ingredient_nonruminant_plant_food',
    confidence: 'high',
    valueBasis: 'g per 100 g edible food',
    sourceValuesPer100g: {},
    targetTotalFatPer100g: food.nutrients['Total Fat (g)'] ?? null,
    calculation: 'Assigned 0 g because the database item denotes an unseasoned single-ingredient plant food, with no ruminant ingredient or refined edible oil. FDA describes naturally occurring trans fat in ruminant foods and artificial trans fat from partially hydrogenated oils; that source pathway is excluded for these items.',
    values: { [field]: 0 },
    checkedOn,
  });
}

const batch = db.slice(800, 900);
const fieldCoverage = {};
for (const name of ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', field, 'Alcohol (g)']) {
  const filled = batch.filter(food => food.nutrients[name] != null).length;
  fieldCoverage[name] = { filled, missing: 100 - filled, total: 100 };
}
const output = { mode: apply ? 'apply' : 'preview', proposed: records.length, fieldCoverage, records: records.map(({ databaseIndex, databaseName, values }) => ({ databaseIndex, databaseName, values })) };
if (apply) {
  audit.sources.FDA_trans_fat_food_identity_rule = {
    url: fdaUrl,
    citation: 'U.S. Food and Drug Administration, Trans Fat overview. Natural trans fat occurs in foods from ruminant animals; artificial trans fat came primarily from partially hydrogenated oils. This source rule is used only for the listed single-ingredient plant foods, not dairy, meat, refined oils, or mixed/processed products.',
  };
  audit.records.push(...records);
  for (const [index] of targets) db[index - 1].nutrients[field] = 0;
  audit.fieldCoverage = fieldCoverage;
  audit.checkedOn = checkedOn;
  audit.status = 'partial_research';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
  const dbCheck = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const auditCheck = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  for (const [index] of targets) {
    if (dbCheck[index - 1].nutrients[field] !== 0) throw new Error(`Read-back verification failed at index ${index}`);
  }
  const audited = new Set(auditCheck.records.filter(record => record.source === 'FDA_food_identity_inference').map(record => record.databaseIndex));
  if (targets.some(([index]) => !audited.has(index))) throw new Error('Read-back audit verification failed');
}
console.log(JSON.stringify(output, null, 2));
