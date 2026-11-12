import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_016_sources.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const index = 1501;
const field = 'Alcohol (g)';
const item = database[index - 1];

if (item?.name !== 'Makrele, geräuchert' || item.unit !== 'g') {
  throw new Error(`Unexpected food or unit at database index ${index}`);
}
if (item.nutrients[field] != null && item.nutrients[field] !== 0) {
  throw new Error(`Refusing to replace existing alcohol value ${item.nutrients[field]}`);
}

item.nutrients[field] = 0;
const record = {
  databaseIndex: index,
  databaseName: item.name,
  source: 'USDA_FoodData_Central_SR_Legacy_2018_Identity_Transfer',
  sourceCode: 'FDC 168149, nutrient 221',
  sourceName: 'Fish, mackerel, salted',
  sourceUrl: 'https://fdc.nal.usda.gov/food-details/168149/nutrients?type=SR%20Legacy',
  matchMethod: 'same_species_processed_food_zero_transfer',
  valueBasis: 'g per 100 g edible portion; database reference unit is g',
  values: { [field]: 0 },
  sourceEvidence: [
    { source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceCode: 'FDC 168149', sourceName: 'Fish, mackerel, salted', nutrientNumber: '221', amountPer100g: 0 },
    { source: 'BLS_4_0', sourceCode: 'T107600', sourceName: 'Makrele geräuchert', marker: '<LOD', amountPer100g: null },
    { source: 'CoFID_2021', sourceCode: '16-414', sourceName: 'Smoked mackerel', marker: 'blank', amountPer100g: null },
  ],
  mappingNote: 'USDA SR Legacy reports 0 g alcohol for salted mackerel, the same species in a closely related preservation form. The exact BLS smoked-mackerel record reports alcohol below its limit of detection and CoFID is blank; neither marker was converted to zero. The numeric zero is transferred from the same-species USDA comparator and is not an exact smoked-product measurement.',
  confidence: 'medium',
  checkedOn: '2026-09-24',
};

const existingIndex = audit.records.findIndex(record =>
  record.databaseIndex === index && record.source === 'USDA_FoodData_Central_SR_Legacy_2018_Identity_Transfer'
);
if (existingIndex >= 0) audit.records[existingIndex] = record;
else audit.records.push(record);

const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', field];
const rangeRows = database.slice(audit.range.first - 1, audit.range.last);
audit.fieldCoverage = Object.fromEntries(fields.map(key => {
  const filled = rangeRows.filter(row => row.nutrients?.[key] !== null && row.nutrients?.[key] !== undefined).length;
  return [key, { filled, missing: rangeRows.length - filled, total: rangeRows.length }];
}));
audit.checkedOn = '2026-09-24';

fs.writeFileSync(databasePath, JSON.stringify(database, null, 2) + '\n', 'utf8');
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');

const databaseReadBack = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const auditReadBack = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (databaseReadBack[index - 1].nutrients[field] !== 0) throw new Error('Database read-back verification failed');
if (!auditReadBack.records.some(row => row.databaseIndex === index && row.sourceCode === record.sourceCode && row.values?.[field] === 0)) {
  throw new Error('Source audit read-back verification failed');
}

console.log(JSON.stringify({ applied: { databaseIndex: index, food: item.name, field, value: 0 }, readBackVerified: true, blockCoverage: audit.fieldCoverage }, null, 2));
