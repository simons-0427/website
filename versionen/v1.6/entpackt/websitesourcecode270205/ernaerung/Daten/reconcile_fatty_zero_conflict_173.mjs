import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const apply = process.argv.includes('--apply');
const databaseIndex = 173;
const field = 'Omega-3 Fatty Acids (g)';

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const item = db[databaseIndex - 1];
if (!item || !/^Kokos/i.test(item.name) || item.unit !== 'ml') {
  throw new Error(`Unexpected target at database index ${databaseIndex}`);
}

const evidenceRows = audit.records.filter(record => record.databaseIndex === databaseIndex);
const bls = evidenceRows.find(record => record.source === 'BLS_4_0');
const usda = evidenceRows.find(record => record.source === 'USDA_FoodData_Central_SR_Legacy_2018');
const blsValue = Number(bls?.sourceValuesPer100g?.[field]);
const usdaValue = Number(usda?.derivedOmegas?.omega3);
if (blsValue !== 0 || !(usdaValue > 0) || item.nutrients?.[field] !== 0) {
  throw new Error('The expected BLS zero, positive USDA value, or transferred database zero has changed');
}

const transferRows = audit.records.filter(record =>
  record.databaseIndex === databaseIndex &&
  record.source === 'ExplicitSourceZeroTransfer' &&
  record.values?.[field] === 0,
);
if (transferRows.length !== 1) throw new Error(`Expected exactly one transferred zero, found ${transferRows.length}`);

const change = {
  databaseIndex,
  databaseName: item.name,
  field,
  previousValue: 0,
  newValue: null,
  sourceConflict: {
    BLS_4_0_per100g: blsValue,
    USDA_SR_Legacy_per100g: usdaValue,
  },
  reason: 'The two exact food-source records disagree. The database unit is ml, while both fatty-acid values are per 100 g and no verified density conversion is available. Do not assert absence or convert either source value; leave the per-ml field unresolved.',
  checkedOn: '2026-09-23',
};

if (apply) {
  item.nutrients[field] = null;
  audit.records = audit.records.filter(record => !transferRows.includes(record));
  audit.zeroTransferReconciliations ??= [];
  audit.zeroTransferReconciliations.push(change);
  const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
  audit.fieldCoverage = Object.fromEntries(fields.map(name => {
    const filled = db.slice(100, 200).filter(food => food.nutrients?.[name] != null).length;
    return [name, { filled, missing: 100 - filled, total: 100 }];
  }));
  audit.checkedOn = '2026-09-23';
  audit.status = 'partial_research';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', change }, null, 2));
