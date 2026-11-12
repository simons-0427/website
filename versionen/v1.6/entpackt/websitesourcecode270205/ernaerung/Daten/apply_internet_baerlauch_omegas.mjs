import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_009_sources.json');
const apply = process.argv.includes('--apply');
const index = 847;
const expectedName = 'Bärlauch roh';
const checkedOn = '2026-09-24';
const pageUrl = 'https://www.naehrwertrechner.de/naehrwerte/G492100/B%C3%A4rlauch+roh/';
const corroboratingUrl = 'https://www.orthomol.com/de-at/ernaehrung/lebensmittel/kraeuter/baerlauch';
const values = {
  'Omega-3 Fatty Acids (g)': 0.011,
  'Omega-6 Fatty Acids (g)': 0.12,
};

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (db.length !== 1516) throw new Error(`Unexpected database size ${db.length}`);
if (audit.batch !== 9 || audit.range?.first !== 801 || audit.range?.last !== 900) throw new Error('Audit is not batch 9');
const food = db[index - 1];
if (!food || food.name !== expectedName || food.unit !== 'g') throw new Error('Bärlauch food identity or unit mismatch');
if (food.nutrients['Omega-3 Fatty Acids (g)'] !== 0) throw new Error('Expected the documented BLS formula-zero conflict before correction');
if (food.nutrients['Omega-6 Fatty Acids (g)'] != null) throw new Error('Expected Omega-6 to be blank before correction');

const record = {
  databaseIndex: index,
  databaseName: expectedName,
  source: 'Naehrwertrechner_BLS_internet_crosscheck',
  sourceName: 'Bärlauch roh, Nährwertrechner.de; page notes BLS and manufacturer data',
  sourceCode: 'G492100',
  sourceUrl: pageUrl,
  corroboratingSourceUrl: corroboratingUrl,
  matchMethod: 'exact_food_identity_internet_crosscheck',
  confidence: 'medium',
  valueBasis: 'g per 100 g raw food',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': { value: 11, unit: 'mg' },
    'Omega-6 Fatty Acids (g)': { value: 120, unit: 'mg' },
  },
  calculation: 'Converted 11 mg Omega-3 and 120 mg Omega-6 per 100 g to grams by dividing by 1000. The exact-food web source reports the BLS food code G492100; Orthomol independently lists about 0.01 g linolenic acid and 0.12 g linoleic acid per 100 g.',
  conflicts: {
    'Omega-3 Fatty Acids (g)': { BLS_4_0: 0, reason: 'BLS source detail marks origin as Formelberechnung with no reference; exact-food internet cross-check reports 0.011 g.' },
    'Omega-6 Fatty Acids (g)': { BLS_4_0: '-', reason: 'BLS source detail marks the component missing; exact-food internet cross-check reports 0.12 g.' },
  },
  values,
  checkedOn,
};
const batch = db.slice(800, 900);
const fieldCoverage = {};
for (const name of ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)']) {
  const filled = batch.filter(item => item.nutrients[name] != null || Object.hasOwn(values, name)).length;
  fieldCoverage[name] = { filled, missing: 100 - filled, total: 100 };
}
const output = { mode: apply ? 'apply' : 'preview', databaseIndex: index, databaseName: expectedName, values, fieldCoverage, conflictResolution: record.conflicts };
if (apply) {
  Object.assign(food.nutrients, values);
  audit.records.push(record);
  audit.sources.Naehrwertrechner_BLS_internet_crosscheck = {
    url: pageUrl,
    corroboratingUrl,
    citation: 'Nährwertrechner.de, Bärlauch roh, per 100 g. The page identifies the data sources as Bundeslebensmittelschlüssel and manufacturer data; Omega-3 is 11 mg and Omega-6 is 120 mg. The second source reports about 0.01 g linolenic and 0.12 g linoleic acid.',
  };
  audit.fieldCoverage = fieldCoverage;
  audit.checkedOn = checkedOn;
  audit.status = 'partial_research';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
  const dbCheck = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const auditCheck = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  for (const [field, value] of Object.entries(values)) {
    if (dbCheck[index - 1].nutrients[field] !== value) throw new Error(`Read-back verification failed for ${field}`);
  }
  if (!auditCheck.records.some(item => item.databaseIndex === index && item.source === record.source)) throw new Error('Audit read-back verification failed');
}
console.log(JSON.stringify(output, null, 2));
