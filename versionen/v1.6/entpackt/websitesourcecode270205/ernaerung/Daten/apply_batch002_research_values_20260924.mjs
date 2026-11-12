import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(here, '..', 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const updates = [];

const researchedRows = [
  {
    index: 114, name: 'Hähnchen, ganz (roh)', ndbNumber: '05006',
    sourceName: 'Chicken, broilers or fryers, meat and skin, raw',
    sourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg05.pdf',
    sourceValues: [
      ['18:2 undifferentiated', 2.88], ['18:3 undifferentiated', 0.14], ['20:4 undifferentiated', 0.08],
      ['20:5 n-3 (EPA)', 0.01], ['22:5 n-3 (DPA)', 0.01], ['22:6 n-3 (DHA)', 0.03], ['Fatty acids, total trans', 0.097],
    ],
    values: { 'Omega-3 Fatty Acids (g)': 0.19, 'Omega-6 Fatty Acids (g)': 2.96, 'Trans Fat (g)': 0.097, 'Alcohol (g)': 0 },
    method: 'Omega-3 = 18:3 undifferentiated + EPA + DPA + DHA. Omega-6 = 18:2 undifferentiated + 20:4 undifferentiated.',
    note: 'The USDA SR28 food profile matches the database fat and protein values. The remaining 0.08 g of total PUFA is not assigned to either omega family.',
  },
  {
    index: 115, name: 'Hähnchenbrust (roh)', ndbNumber: '05062',
    sourceName: 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw',
    sourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg05.pdf',
    sourceValues: [
      ['18:2 n-6 c,c', 0.317], ['18:2 t not further defined', 0.001], ['18:3 n-3 c,c,c (ALA)', 0.013],
      ['20:4 undifferentiated', 0.048], ['20:5 n-3 (EPA)', 0.003], ['22:4', 0.013], ['22:5 n-3 (DPA)', 0.006],
      ['22:6 n-3 (DHA)', 0.004], ['Fatty acids, total trans', 0.007],
    ],
    values: { 'Omega-3 Fatty Acids (g)': 0.026, 'Omega-6 Fatty Acids (g)': 0.378, 'Trans Fat (g)': 0.007, 'Alcohol (g)': 0 },
    method: 'Omega-3 = ALA + EPA + DPA + DHA. Omega-6 = 18:2 n-6 + 20:4 undifferentiated + 22:4.',
    note: 'The USDA SR28 food profile matches the database lean raw chicken-breast entry. The 22:4 component is classified as n-6; 18:2 trans is counted only in total trans fat.',
  },
  {
    index: 121, name: 'Heilbutt (roh)', ndbNumber: '15036',
    sourceName: 'Fish, halibut, Atlantic and Pacific, raw',
    sourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg15.pdf',
    sourceValues: [
      ['18:2 n-6 c,c', 0.019], ['18:3 n-3 c,c,c (ALA)', 0.011], ['20:5 n-3 (EPA)', 0.066],
      ['22:4', 0.001], ['22:5 n-3 (DPA)', 0.016], ['22:6 n-3 (DHA)', 0.128], ['Fatty acids, total trans-polyenoic', 0.013],
    ],
    values: { 'Omega-3 Fatty Acids (g)': 0.221, 'Omega-6 Fatty Acids (g)': 0.02, 'Alcohol (g)': 0 },
    method: 'Omega-3 = ALA + EPA + DPA + DHA. Omega-6 = 18:2 n-6 + 22:4.',
    note: 'The USDA SR28 food profile matches the database fat and protein values. The total-trans field is blank in SR28, so the separate trans-polyenoic estimate is not presented as total trans fat.',
  },
  {
    index: 122, name: 'Hering, frisch (roh)', ndbNumber: '15039',
    sourceName: 'Fish, herring, Atlantic, raw',
    sourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg15.pdf',
    sourceValues: [
      ['18:2 undifferentiated', 0.13], ['18:3 undifferentiated', 0.103], ['18:4', 0.214], ['20:4 undifferentiated', 0.06],
      ['20:5 n-3 (EPA)', 0.709], ['22:5 n-3 (DPA)', 0.055], ['22:6 n-3 (DHA)', 0.862],
    ],
    values: { 'Omega-3 Fatty Acids (g)': 1.84, 'Omega-6 Fatty Acids (g)': 0.19, 'Alcohol (g)': 0 },
    method: 'Omega-3 includes identified n-3 components 18:4 + EPA + DPA + DHA. Omega-6 includes 18:2 and 20:4 undifferentiated.',
    note: 'The USDA SR28 food profile matches the database fat and protein values. The 0.103 g of 18:3 undifferentiated is excluded because SR28 does not identify its n-series. Total trans fat is blank in SR28.',
  },
  {
    index: 183, name: 'Lachs, Atlantik (roh)', ndbNumber: '15236',
    sourceName: 'Fish, salmon, Atlantic, farmed, raw',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/175167/nutrients?type=SR%20Legacy',
    confirmationSourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg15.pdf',
    sourceValues: [
      ['18:2 undifferentiated', 0.9], ['18:3 n-3 c,c,c (ALA)', 0.148], ['18:3 n-6 c,c,c', 0.02],
      ['18:4', 0.121], ['20:2 n-6 c,c', 0.062], ['20:3 undifferentiated', 0.018], ['20:4 undifferentiated', 0.092],
      ['20:5 n-3 (EPA)', 0.862], ['22:5 n-3 (DPA)', 0.393], ['22:6 n-3 (DHA)', 1.104], ['Fatty acids, total polyunsaturated', 3.886],
    ],
    values: { 'Omega-3 Fatty Acids (g)': 2.628, 'Omega-6 Fatty Acids (g)': 1.092, 'Alcohol (g)': 0 },
    method: 'Omega-3 = ALA + 18:4 + EPA + DPA + DHA. Omega-6 = 18:2 + 18:3 n-6 + 20:2 n-6 + 20:3 + 20:4.',
    note: 'The 20:3 and 20:4 undifferentiated components are counted as n-6. The component sum is 0.166 g below total PUFA; unclassified PUFA is not assigned. Total trans fat remains unresolved because SR28 does not report a total value.',
  },
];

for (const entry of researchedRows) {
  const food = database[entry.index - 1];
  if (!food || food.name !== entry.name || food.unit !== 'g') throw new Error(`Identity/unit check failed for ${entry.index}`);

  const changed = {};
  for (const [field, value] of Object.entries(entry.values)) {
    if (food.nutrients[field] === null || food.nutrients[field] === undefined) {
      food.nutrients[field] = value;
      changed[field] = value;
      updates.push({ index: entry.index, name: entry.name, field, value, source: `USDA SR28 NDB ${entry.ndbNumber}` });
    }
  }

  const sourceCode = `USDA_SR28_${entry.ndbNumber}`;
  const record = audit.records.find((item) => item.databaseIndex === entry.index && (item.sourceCode === sourceCode || (entry.index === 183 && item.sourceName === entry.sourceName))) ?? {
    databaseIndex: entry.index,
    databaseName: entry.name,
    source: 'USDA_SR28_2015',
    sourceCode,
    ndbNumber: entry.ndbNumber,
    sourceName: entry.sourceName,
    sourceUrl: entry.sourceUrl,
    valueBasis: 'per 100 g edible portion',
    checkedOn: '2026-09-24',
  };
  record.sourceCode = sourceCode;
  record.ndbNumber = entry.ndbNumber;
  record.sourceName = entry.sourceName;
  record.sourceUrl = entry.sourceUrl;
  if (entry.confirmationSourceUrl) record.confirmationSourceUrl = entry.confirmationSourceUrl;
  record.sourceValues = entry.sourceValues.map(([component, amountPer100g]) => ({ component, amountPer100g }));
  record.derivedValues = entry.values;
  record.addedValues = { ...(record.addedValues ?? {}), ...changed };
  record.derivedOmegas = { omega3: entry.values['Omega-3 Fatty Acids (g)'], omega6: entry.values['Omega-6 Fatty Acids (g)'], method: entry.method };
  record.resolutionNote = entry.note;
  record.checkedOn = '2026-09-24';
  if (!audit.records.includes(record)) audit.records.push(record);
}

const alcoholZeros = [
  [134, 'Isotonisches Sportgetränk', 'Non-alcoholic sports drink; ethyl alcohol is excluded by the food class.'],
  [136, 'Jod 150 µg (Tablette)', 'Dry tablet dosage form; ethanol is not part of the food item.'],
  [137, 'Jodid-ratiopharm 100 µg (Tablette)', 'Dry tablet dosage form; ethanol is not part of the food item.'],
  [178, 'Kräutertee (aufgebrüht)', 'Water infusion of herbs without an alcoholic ingredient.'],
  [179, 'Kreatin-Monohydrat Creapure, Bodybuilding Depot (Pulver)', 'Dry creatine monohydrate powder; ethanol is not part of the listed food item.'],
  [180, 'Kreatin-Monohydrat ProFuel (Pulver)', 'Dry creatine monohydrate powder; ethanol is not part of the listed food item.'],
];

for (const [index, name, reason] of alcoholZeros) {
  const food = database[index - 1];
  if (!food || food.name !== name) throw new Error(`Identity check failed for alcohol zero at ${index}`);
  if (food.nutrients['Alcohol (g)'] === null || food.nutrients['Alcohol (g)'] === undefined) {
    food.nutrients['Alcohol (g)'] = 0;
    updates.push({ index, name, field: 'Alcohol (g)', value: 0, source: 'Food-class exclusion', note: reason });
  }
  const sourceCode = 'FOOD_CLASS_ALCOHOL_ZERO';
  let record = audit.records.find((item) => item.databaseIndex === index && item.sourceCode === sourceCode);
  if (!record) {
    record = { databaseIndex: index, databaseName: name, source: 'FoodClassExclusion', sourceCode, checkedOn: '2026-09-24' };
    audit.records.push(record);
  }
  record.addedValues = { 'Alcohol (g)': 0 };
  record.valueBasis = 'g per database reference portion';
  record.resolutionNote = reason;
}

const coverage = {};
for (const field of fields) {
  const filled = database.slice(100, 200).filter((food) => food.nutrients[field] !== null && food.nutrients[field] !== undefined).length;
  coverage[field] = { filled, missing: 100 - filled, total: 100 };
}
audit.fieldCoverage = coverage;
audit.databaseApplication = {
  appliedOn: '2026-09-24',
  appliedFrom: 'USDA SR28 component totals and explicit non-alcoholic food-class exclusions',
  appliedCount: updates.length,
  appliedByField: Object.fromEntries(fields.map((field) => [field, updates.filter((item) => item.field === field).length])),
  updates,
};

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ appliedCount: updates.length, appliedByField: audit.databaseApplication.appliedByField, coverage }, null, 2));
