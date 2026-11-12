import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_016_sources.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const alcohol = 'Alcohol (g)';

const transfers = [
  {
    index: 1508,
    name: 'Sardinen, Dose in Salzlake, abgetropft',
    source: 'BLS_4_0_Identity_Transfer',
    sourceCode: 'T105702',
    sourceName: 'Sardine in Öl, Konserve, abgetropft',
    sourceUrl: 'https://blsdb.de/food?foodId=46023',
    amountPer100g: 0,
    matchMethod: 'same_species_processed_food_zero_transfer',
    sourceDetails: { ALC: { valuePer100g: '0', origin: 'Logische Null', reference: '-' } },
    mappingNote: 'BLS 4.0 reports a logical zero for ethanol in the same sardine species, canned and drained. The target is the same fish canned in brine; no alcoholic ingredient is present. The exact CoFID target record has a blank alcohol marker, which was not treated as numeric evidence.',
    sourceEvidence: [
      { source: 'BLS_4_0', sourceCode: 'T105702', sourceName: 'Sardine in Öl, Konserve, abgetropft', sourceUrl: 'https://blsdb.de/food?foodId=46023', amountPer100g: 0, origin: 'Logische Null' },
      { source: 'CoFID_2021', sourceCode: '16-424', sourceName: 'Sardines, canned in brine, drained', amountPer100g: null, marker: 'blank' },
    ],
  },
  {
    index: 1513,
    name: 'Seebarsch, gebacken',
    source: 'USDA_FoodData_Central_SR_Legacy_2018_Identity_Transfer',
    sourceCode: 'FDC 175142, nutrient 221',
    sourceName: 'Fish, sea bass, mixed species, raw',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/175142/nutrients?type=SR%20Legacy',
    amountPer100g: 0,
    matchMethod: 'same_species_unseasoned_cooking_zero_transfer',
    mappingNote: 'USDA SR Legacy reports 0 g alcohol for raw sea bass (FDC 175142, nutrient 221). The target is plain baked sea bass with no alcoholic sauce or ingredient; dry-heat cooking adds no ethanol.',
    sourceEvidence: [
      { source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceCode: 'FDC 175142', sourceName: 'Fish, sea bass, mixed species, raw', nutrientNumber: '221', amountPer100g: 0 },
      { source: 'CoFID_2021', sourceCode: '16-386', sourceName: 'Sea bass, baked', amountPer100g: null, marker: 'blank' },
    ],
  },
];

for (const transfer of transfers) {
  const item = database[transfer.index - 1];
  if (item?.name !== transfer.name) throw new Error(`Unexpected food at database index ${transfer.index}`);
  if (item.unit !== 'g') throw new Error(`Unexpected reference unit for ${transfer.name}: ${item.unit}`);
  const current = item.nutrients?.[alcohol];
  if (current != null && current !== 0) throw new Error(`Refusing to replace ${transfer.name} alcohol value ${current}`);
  item.nutrients[alcohol] = 0;

  const auditRecord = {
    databaseIndex: transfer.index,
    databaseName: transfer.name,
    source: transfer.source,
    sourceCode: transfer.sourceCode,
    sourceName: transfer.sourceName,
    sourceUrl: transfer.sourceUrl,
    matchMethod: transfer.matchMethod,
    valueBasis: 'g per 100 g edible portion; database reference unit is g',
    values: { [alcohol]: 0 },
    sourceDetails: transfer.sourceDetails ?? undefined,
    sourceEvidence: transfer.sourceEvidence,
    mappingNote: transfer.mappingNote,
    checkedOn: '2026-09-24',
  };
  const existingIndex = audit.records.findIndex(record =>
    record.databaseIndex === transfer.index && record.source === transfer.source
  );
  if (existingIndex >= 0) audit.records[existingIndex] = auditRecord;
  else audit.records.push(auditRecord);
}

const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', alcohol];
const rangeRows = database.slice(audit.range.first - 1, audit.range.last);
audit.fieldCoverage = Object.fromEntries(fields.map(field => {
  const filled = rangeRows.filter(row => row.nutrients?.[field] !== null && row.nutrients?.[field] !== undefined).length;
  return [field, { filled, missing: rangeRows.length - filled, total: rangeRows.length }];
}));
audit.checkedOn = '2026-09-24';

fs.writeFileSync(databasePath, JSON.stringify(database, null, 2) + '\n', 'utf8');
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');

const databaseReadBack = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const auditReadBack = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
for (const transfer of transfers) {
  if (databaseReadBack[transfer.index - 1].nutrients[alcohol] !== 0) {
    throw new Error(`Database read-back failed at ${transfer.index}`);
  }
  if (!auditReadBack.records.some(record => record.databaseIndex === transfer.index && record.values?.[alcohol] === 0)) {
    throw new Error(`Source-audit read-back failed at ${transfer.index}`);
  }
}

console.log(JSON.stringify({ applied: transfers.map(({ index, name, source, sourceCode }) => ({ index, name, field: alcohol, value: 0, source, sourceCode })), readBackVerified: true, blockCoverage: audit.fieldCoverage }, null, 2));
