import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dbPath = path.join(root, 'database.json');
const dataDir = path.join(root, 'Daten');
const checkedOn = '2026-09-24';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
if (db.length !== 1516) throw new Error(`Unexpected database length: ${db.length}`);

const updates = [
  {
    index: 89,
    name: 'Forellenkaviar / Lachsrogen',
    unit: 'g',
    values: {
      'Omega-3 Fatty Acids (g)': 4.7,
      'Omega-6 Fatty Acids (g)': 0.27,
      'Alcohol (g)': 0,
    },
  },
  {
    index: 1397,
    nameEn: 'Mulled wine',
    unit: 'ml',
    values: {
      'Omega-3 Fatty Acids (g)': 0.005,
      'Omega-6 Fatty Acids (g)': 0.012,
      'Alcohol (g)': 8.46,
    },
  },
];

for (const update of updates) {
  const food = db[update.index - 1];
  if (!food || food.unit !== update.unit || (update.name && food.name !== update.name) || (update.nameEn && food.name_en !== update.nameEn)) {
    throw new Error(`Food identity or unit mismatch at database index ${update.index}`);
  }
  for (const [field, value] of Object.entries(update.values)) {
    const current = food.nutrients[field];
    if (current != null && current !== value) throw new Error(`Refusing to overwrite ${food.name}, ${field}: ${current}`);
    food.nutrients[field] = value;
  }
}

function auditPath(batch) {
  return path.join(dataDir, `database_V2_fatty_acids_alcohol_batch_${String(batch).padStart(3, '0')}_sources.json`);
}

function upsertRecord(audit, record) {
  const match = audit.records.findIndex(item => item.databaseIndex === record.databaseIndex && item.source === record.source);
  if (match >= 0) audit.records[match] = record;
  else audit.records.push(record);
}

const batch1Path = auditPath(1);
const batch1 = JSON.parse(fs.readFileSync(batch1Path, 'utf8'));
batch1.checkedOn = checkedOn;
batch1.sources.MEXT_Standard_Tables_2023 = {
  url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=10_10140_6&MODE=4',
  citation: 'Standard Tables of Food Composition in Japan, 2023 supplement; salted chum salmon roe (ikura), fatty acids per 100 g edible portion.',
};
upsertRecord(batch1, {
  databaseIndex: 89,
  databaseName: 'Forellenkaviar / Lachsrogen',
  source: 'MEXT_Standard_Tables_2023',
  sourceCode: '10140',
  sourceName: 'Chum salmon, ikura (salted roe)',
  sourceUrl: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=10_10140_6&MODE=4',
  matchMethod: 'same_salmon_roe_food; database label also includes trout roe',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 4.7,
    'Omega-6 Fatty Acids (g)': 0.27,
  },
  sourceTotalFatPer100g: 15.6,
  databaseTotalFatPer100g: 14,
  values: {
    'Omega-3 Fatty Acids (g)': 4.7,
    'Omega-6 Fatty Acids (g)': 0.27,
  },
  note: 'Direct salted salmon-roe comparator; its total lipid is 15.6 g/100 g versus 14 g/100 g in the database. MEXT does not report total trans fat.',
  checkedOn,
});
upsertRecord(batch1, {
  databaseIndex: 89,
  databaseName: 'Forellenkaviar / Lachsrogen',
  source: 'USDA_FoodData_Central_SR_Legacy_2018',
  sourceCode: '174188',
  sourceName: 'Fish, caviar, black and red, granular',
  sourceUrl: 'https://fdc.nal.usda.gov/food-details/174188/nutrients?type=SR%20Legacy',
  matchMethod: 'caviar family comparator; used for alcohol only',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: { 'Alcohol (g)': 0 },
  values: { 'Alcohol (g)': 0 },
  unresolvedFields: ['Trans Fat (g)'],
  note: 'USDA SR Legacy reports 0 g alcohol for granular caviar. The record does not provide a numeric total-trans-fat amount, so trans fat remains null.',
  checkedOn,
});
const roeUncovered = batch1.uncoveredRecords?.find(item => item.databaseIndex === 89);
if (roeUncovered) {
  roeUncovered.reason = 'No exact local BLS/CoFID crosswalk. MEXT supplies salmon-roe Omega-3/Omega-6 and USDA SR Legacy supplies an alcohol-zero family comparator; total trans fat remains unresolved.';
}

const batch14Path = auditPath(14);
const batch14 = JSON.parse(fs.readFileSync(batch14Path, 'utf8'));
batch14.checkedOn = checkedOn;
batch14.sources.BLS_4_0_volume_conversion_proxy = {
  itemUrl: 'https://blsdb.de/food?foodId=40388',
  itemCode: 'P281000',
  densitySourceUrl: 'https://doi.org/10.5219/1070',
  method: 'BLS values per 100 g multiplied by 0.995 g/ml to estimate values per 100 ml. A mulled-wine study measured relative densities from 0.99 to 1.00 g/cm3; 0.995 is their midpoint, not a measured density for the BLS item.',
};
upsertRecord(batch14, {
  databaseIndex: 1397,
  databaseName: 'Glühwein',
  source: 'BLS_4_0_volume_conversion_proxy',
  sourceCode: 'P281000',
  sourceName: 'Glühwein',
  sourceUrl: 'https://blsdb.de/food?foodId=40388',
  matchMethod: 'exact BLS food-code match; estimated volume conversion',
  valueBasis: 'g per 100 ml database reference unit',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.005,
    'Omega-6 Fatty Acids (g)': 0.012,
    'Alcohol (g)': 8.5,
  },
  density: {
    value: 0.995,
    unit: 'g/ml',
    sourceUrl: 'https://doi.org/10.5219/1070',
    note: 'Midpoint of published relative densities 0.99-1.00 g/cm3 for experimental mulled wines; proxy, not exact BLS-product measurement.',
  },
  calculation: 'BLS g/100 g × 0.995 g/ml ≈ g/100 ml; rounded to the source precision.',
  values: {
    'Omega-3 Fatty Acids (g)': 0.005,
    'Omega-6 Fatty Acids (g)': 0.012,
    'Alcohol (g)': 8.46,
  },
  note: 'BLS reports 8.5 g ethanol, 0.005 g Omega-3 and 0.012 g Omega-6 per 100 g. Per-100-ml values use the stated density proxy. BLS displays total fat rounded to 0.0 g while also reporting nonzero detailed fatty acids; no total-fat field was changed.',
  confidence: 'medium; conversion uses a published mulled-wine density comparator',
  checkedOn,
});

for (let batchNumber = 1; batchNumber <= 16; batchNumber++) {
  const file = auditPath(batchNumber);
  if (!fs.existsSync(file)) continue;
  const audit = batchNumber === 1 ? batch1 : batchNumber === 14 ? batch14 : JSON.parse(fs.readFileSync(file, 'utf8'));
  const { first, last } = audit.range;
  audit.fieldCoverage = Object.fromEntries(
    ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'].map(field => {
      const filled = db.slice(first - 1, last).filter(food => food.nutrients[field] != null).length;
      return [field, { filled, missing: last - first + 1 - filled, total: last - first + 1 }];
    }),
  );
  audit.checkedOn = checkedOn;
  fs.writeFileSync(file, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');

const dbCheck = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
for (const update of updates) {
  for (const [field, value] of Object.entries(update.values)) {
    if (dbCheck[update.index - 1].nutrients[field] !== value) throw new Error(`Read-back failed: ${update.index} ${field}`);
  }
}
for (const batchNumber of [1, 14]) {
  const audit = JSON.parse(fs.readFileSync(auditPath(batchNumber), 'utf8'));
  if (!audit.fieldCoverage || audit.fieldCoverage['Omega-3 Fatty Acids (g)'].total !== audit.range.count) throw new Error(`Audit read-back failed for batch ${batchNumber}`);
}

console.log(JSON.stringify({
  updated: updates.map(({ index, values }) => ({ index, name: dbCheck[index - 1].name, values })),
  coverageAuditsUpdated: 16,
}, null, 2));
