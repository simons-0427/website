import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_016_sources.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const index = 1511;
const field = 'Alcohol (g)';
const item = database[index - 1];

if (item?.name !== 'Sprotten, roh') throw new Error(`Unexpected food at database index ${index}`);
if (item.unit !== 'g') throw new Error(`Unexpected reference unit: ${item.unit}`);
if (item.nutrients[field] != null && item.nutrients[field] !== 0) {
  throw new Error(`Refusing to replace existing ${field} value ${item.nutrients[field]}`);
}

item.nutrients[field] = 0;

const existing = audit.records.find(record =>
  record.databaseIndex === index && record.source === 'BLS_4_0' && record.sourceCode === 'T106100'
);
const record = {
  databaseIndex: index,
  databaseName: item.name,
  source: 'BLS_4_0',
  sourceCode: 'T106100',
  sourceName: 'Sprotte roh',
  matchMethod: 'exact_food_identity',
  valueBasis: 'g per 100 g edible portion; database reference unit is g',
  sourceUrl: 'https://blsdb.de/food?foodId=38020',
  values: { [field]: 0 },
  sourceDetails: {
    ALC: { valuePer100g: '0.0', origin: 'Logische Null', reference: '-' },
  },
  mappingNote: 'Exact BLS raw-sprat record T106100 reports 0.0 g ethanol per 100 g as a logical zero.',
  checkedOn: '2026-09-24',
};
if (existing) Object.assign(existing, record);
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

const readBack = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const auditBack = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (readBack[index - 1].nutrients[field] !== 0) throw new Error('Database read-back verification failed');
if (!auditBack.records.some(row => row.databaseIndex === index && row.sourceCode === 'T106100' && row.values?.[field] === 0)) {
  throw new Error('Source audit read-back verification failed');
}

console.log(JSON.stringify({
  applied: { databaseIndex: index, food: item.name, field, value: 0, source: 'BLS 4.0 T106100' },
  readBackVerified: true,
  blockCoverage: audit.fieldCoverage,
}, null, 2));
