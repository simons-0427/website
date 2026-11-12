import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_001_sources.json');
const checkedOn = '2026-09-24';
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (db.length !== 1516 || audit.batch !== 1 || audit.range.count !== 100) throw new Error('Unexpected scope.');

const updates = [
  { index: 70, name: 'Erbsen, gelb (trocken, getrocknet)', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.16,
    'Omega-6 Fatty Acids (g)': 0.64,
    'Trans Fat (g)': 0,
    'Alcohol (g)': 0,
  } },
  { index: 95, name: 'Gerstenflocken (trocken)', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.11,
    'Omega-6 Fatty Acids (g)': 1.15,
  } },
  { index: 60, name: 'Dunkle Schokolade 70%', unit: 'g', values: { 'Alcohol (g)': 0 } },
  { index: 67, name: 'Ente, Brust (roh, ohne Haut)', unit: 'g', values: { 'Alcohol (g)': 0 } },
  { index: 91, name: 'Frischkäse, light', unit: 'g', values: { 'Alcohol (g)': 0 } },
];
for (const update of updates) {
  const food = db[update.index - 1];
  if (!food || food.name !== update.name || food.unit !== update.unit) throw new Error(`Identity mismatch at ${update.index}.`);
  for (const [field, value] of Object.entries(update.values)) {
    const current = food.nutrients[field];
    if (current != null && current !== value) throw new Error(`Refusing overwrite at ${update.index} ${field}: ${current}`);
    food.nutrients[field] = value;
  }
}

function upsert(record) {
  const i = audit.records.findIndex(item => item.databaseIndex === record.databaseIndex && item.source === record.source);
  if (i >= 0) audit.records[i] = record;
  else audit.records.push(record);
}

upsert({
  databaseIndex: 70,
  databaseName: 'Erbsen, gelb (trocken, getrocknet)',
  source: 'BLS_4_0',
  sourceCode: 'G760400',
  sourceName: 'Erbse reif',
  sourceUrl: 'https://blsdb.de/food?foodId=38576',
  matchMethod: 'mature dry pea class; color not specified in BLS',
  valueBasis: 'g per 100 g edible portion',
  sourceTotalFatPer100g: 1.44,
  databaseTotalFatPer100g: 1.2,
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.16,
    'Omega-6 Fatty Acids (g)': 0.64,
    'Alcohol (g)': 0,
  },
  values: {
    'Omega-3 Fatty Acids (g)': 0.16,
    'Omega-6 Fatty Acids (g)': 0.64,
    'Alcohol (g)': 0,
  },
  confidence: 'medium; mature dry peas are a close class match, but BLS does not specify yellow peas',
  note: 'BLS dry mature peas have 1.44 g total fat/100 g versus 1.2 g in the database. BLS reports total Omega-3 0.16 g, total Omega-6 0.64 g, and numeric alcohol zero. Color-specific yellow-pea data were not found.',
  checkedOn,
});
upsert({
  databaseIndex: 70,
  databaseName: 'Erbsen, gelb (trocken, getrocknet)',
  source: 'LogicalFoodComposition',
  sourceCode: 'PLAIN_DRY_MATURE_PEA',
  sourceName: 'Plain dry mature peas',
  sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
  matchMethod: 'plain dry plant food; no animal fat or added hydrogenated oil',
  valueBasis: 'g per 100 g database reference portion',
  values: { 'Trans Fat (g)': 0 },
  logicalEvidence: {
    'Trans Fat (g)': {
      basis: 'Plain dried peas contain no animal-derived fat or added hydrogenated oil. This is a composition-based zero, not a conversion of an absent or trace source value.',
      sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
    },
  },
  checkedOn,
});
upsert({
  databaseIndex: 95,
  databaseName: 'Gerstenflocken (trocken)',
  source: 'BLS_4_0',
  sourceCode: 'C143000',
  sourceName: 'Gerste Flocken',
  sourceUrl: 'https://blsdb.de/food?foodId=37978',
  matchMethod: 'exact cereal and flake form',
  valueBasis: 'g per 100 g edible portion',
  sourceTotalFatPer100g: 2.1,
  databaseTotalFatPer100g: 2.3,
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.11,
    'Omega-6 Fatty Acids (g)': 1.15,
    'Alcohol (g)': 0,
  },
  values: {
    'Omega-3 Fatty Acids (g)': 0.11,
    'Omega-6 Fatty Acids (g)': 1.15,
  },
  confidence: 'high; exact barley-flake food class, close total-fat match',
  note: 'Exact BLS barley-flake entry; total fat 2.1 g/100 g versus 2.3 g in the database. BLS reports Omega-3 0.11 g and Omega-6 1.15 g per 100 g.',
  checkedOn,
});

const logicalAlcohol = [
  { index: 60, name: 'Dunkle Schokolade 70%', code: 'PLAIN_DARK_CHOCOLATE', sourceName: 'Plain dark chocolate, 70% cacao', supportingSourceUrl: 'https://fdc.nal.usda.gov/food-details/170273/nutrients?type=SR%20Legacy', basis: 'The exact generic plain dark-chocolate food has no alcoholic ingredient; ethanol is not a normal constituent of finished chocolate.' },
  { index: 67, name: 'Ente, Brust (roh, ohne Haut)', code: 'PLAIN_RAW_DUCK_BREAST', sourceName: 'Raw skinless duck breast', supportingSourceUrl: 'https://fdc.nal.usda.gov/food-details/172410/nutrients?type=SR%20Legacy', basis: 'Plain raw skinless duck breast is unfermented and has no alcoholic ingredient or marinade in the database food identity.' },
  { index: 91, name: 'Frischkäse, light', code: 'PLAIN_LIGHT_CREAM_CHEESE', sourceName: 'Plain light cream cheese', basis: 'Plain light cream cheese is not an alcoholic or ethanol-containing food; fermentation of dairy cultures produces lactic acid, not an alcoholic beverage.' },
];
for (const item of logicalAlcohol) {
  upsert({
    databaseIndex: item.index,
    databaseName: item.name,
    source: 'LogicalFoodComposition',
    sourceCode: item.code,
    sourceName: item.sourceName,
    ...(item.supportingSourceUrl ? { supportingSourceUrl: item.supportingSourceUrl } : {}),
    matchMethod: 'food identity excludes an alcoholic ingredient',
    valueBasis: 'g per 100 g database reference portion',
    values: { 'Alcohol (g)': 0 },
    logicalEvidence: { 'Alcohol (g)': { basis: item.basis, ...(item.supportingSourceUrl ? { sourceUrl: item.supportingSourceUrl } : {}) } },
    checkedOn,
  });
}

audit.uncoveredRecords = audit.uncoveredRecords.filter(item => item.databaseIndex !== 70);
for (const item of audit.uncoveredRecords) {
  if (item.databaseIndex === 67) item.reason = 'No exact raw skinless duck-breast fatty-acid profile found. Alcohol is composition-based zero; Omega values and total trans fat remain unresolved because close USDA comparator has materially different total fat.';
  if (item.databaseIndex === 91) item.reason = 'No exact low-fat cream-cheese profile found; available generic source has unresolved PUFA mismatch. Alcohol is composition-based zero; Omegas and total trans fat remain unresolved.';
}
audit.checkedOn = checkedOn;
audit.fieldCoverage = Object.fromEntries(fields.map(field => {
  const filled = db.slice(0, 100).filter(food => food.nutrients[field] != null).length;
  return [field, { filled, missing: 100 - filled, total: 100 }];
}));
audit.coverageNotes.Researched_updates_2026_09_24 += ' Added close-class BLS values for mature dry peas and exact-class BLS values for barley flakes; filled non-alcoholic zero values for plain chocolate, raw duck, and light cream cheese. Color-specific yellow pea values and other recipe-dependent values remain null.';

fs.writeFileSync(databasePath, JSON.stringify(db, null, 2) + '\n', 'utf8');
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
const readDb = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const readAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
for (const update of updates) {
  for (const [field, value] of Object.entries(update.values)) {
    if (readDb[update.index - 1].nutrients[field] !== value) throw new Error(`Read-back failure at ${update.index} ${field}`);
  }
}
for (const field of fields) {
  const filled = readDb.slice(0, 100).filter(food => food.nutrients[field] != null).length;
  if (readAudit.fieldCoverage[field].filled !== filled) throw new Error(`Coverage mismatch for ${field}`);
}
console.log(JSON.stringify({
  updated: updates.map(item => ({ index: item.index, name: item.name, values: item.values })),
  fieldCoverage: readAudit.fieldCoverage,
  unresolved: readAudit.uncoveredRecords.length,
}, null, 2));
