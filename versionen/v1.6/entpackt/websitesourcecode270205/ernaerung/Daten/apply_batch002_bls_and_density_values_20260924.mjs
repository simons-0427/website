import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(here, '..', 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const milkDensity = 3.612 / 3.49;
const condensedMilkDensity = 8.1 / 7.57;
const sources = [
  {
    name: 'H-Milch 3,5%',
    source: 'BLS 4.0',
    sourceName: 'H-Vollmilch 3,5 % Fett, ultrahocherhitzt (M113300)',
    sourceUrl: 'https://blsdb.de/food?foodId=38266&token=DWHT-0YAU-X7YK-4FP4-BQKQ-PA6K-ETK6-K25G',
    matchMethod: 'same_food_density_scaled_from_per100g_to_per100ml',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.0117, 'Omega-6 Fatty Acids (g)': 0.107 },
    values: {
      'Omega-3 Fatty Acids (g)': Number((0.0117 * milkDensity).toFixed(6)),
      'Omega-6 Fatty Acids (g)': Number((0.107 * milkDensity).toFixed(6))
    },
    density: { value: milkDensity, unit: 'g/ml', derivation: 'target total fat 3.612 g/100 ml divided by BLS total fat 3.49 g/100 g' },
    calculation: 'BLS provides fatty-acid family totals per 100 g. Converted to the database per-100-ml unit using a density proxy derived from the matching total-fat values. This is an estimate; trans fat remains unresolved.'
  },
  {
    name: 'Hähnchenflügel (roh, mit Haut)',
    source: 'USDA FoodData Central SR Legacy',
    sourceName: 'Chicken, broilers or fryers, wing, meat and skin, raw (FDC 172390)',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/172390/nutrients?type=SR%20Legacy',
    matchMethod: 'exact_food_profile_component_sum',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.135, 'Omega-6 Fatty Acids (g)': 2.339, 'Total PUFA (g)': 2.5 },
    values: { 'Omega-3 Fatty Acids (g)': 0.135, 'Omega-6 Fatty Acids (g)': 2.339 },
    calculation: 'Uses the already-audited USDA component sum for n-3 and n-6 fatty acids. The classified omega totals sum to 2.474 g versus 2.5 g total PUFA; the remaining 0.026 g is left unassigned.'
  },
  {
    name: 'Joghurt, mager 0,1%',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Joghurt aus entrahmter Milch, max. 0,5 % Fett (M141100)',
    sourceUrl: 'https://blsdb.de/food?foodId=38975&token=DWHT-0YAU-X7YK-4FP4-BQKQ-PA6K-ETK6-K25G',
    matchMethod: 'same_plain_low_fat_yogurt_class',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.00014, 'Omega-6 Fatty Acids (g)': 0.00029, 'Alcohol (g)': 0 },
    values: { 'Omega-3 Fatty Acids (g)': 0.00014, 'Omega-6 Fatty Acids (g)': 0.00029, 'Alcohol (g)': 0 },
    calculation: 'BLS provides omega totals for plain yogurt with at most 0.5% fat and marks ethanol as a logical zero. Only these three fields are transferred; total trans fat is not inferred.'
  },
  {
    name: 'Joghurt, Natur 3,5%',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Joghurt mind. 3,5 % Fett, laktosefrei (M1E3300)',
    sourceUrl: 'https://blsdb.de/food?foodId=38606&token=DWHT-0YAU-X7YK-4FP4-BQKQ-PA6K-ETK6-K25G',
    matchMethod: 'same_plain_yogurt_fat_class_lactose_free_analogue',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.02, 'Omega-6 Fatty Acids (g)': 0.09, 'Alcohol (g)': 0 },
    values: { 'Omega-3 Fatty Acids (g)': 0.02, 'Omega-6 Fatty Acids (g)': 0.09, 'Alcohol (g)': 0 },
    calculation: 'BLS gives omega-3 and omega-6 family totals for plain yogurt with at least 3.5% fat and reports ethanol as a logical zero. The omega components are pattern-estimated in BLS; total trans fat remains unresolved.'
  },
  {
    name: 'Kaffee mit Milch (80/20)',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Kaffee (Getränk) halb und halb, mit Milch 3,5 % Fett (N491000)',
    sourceUrl: 'https://blsdb.de/food?foodId=40004&token=VNK9-B4WA-JUKY-AJFZ-9T8L-C1AW-DULV-9COD',
    matchMethod: 'non_alcoholic_coffee_with_milk_analogue',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports 0 g ethanol for brewed coffee with milk. The target milk-to-coffee ratio differs, but dilution does not change an explicit zero when both components are non-alcoholic.'
  },
  {
    name: 'Knäckebrot, Vollkorn',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Mehrkornvollkornknäckebrot (B6A4000)',
    sourceUrl: 'https://blsdb.de/food?foodId=40723&token=R6M8-7K03-EZH1-SLT4-28M7-3241-WUL5-ZDOL',
    matchMethod: 'wholegrain_crispbread_analogue',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.09, 'Omega-6 Fatty Acids (g)': 1.0 },
    values: { 'Omega-3 Fatty Acids (g)': 0.09, 'Omega-6 Fatty Acids (g)': 1.0 },
    calculation: 'BLS provides totals for a multigrain wholegrain crispbread analogue. Its omega-3 and omega-6 components are pattern-estimated; no trans-fat value is inferred.'
  },
  {
    name: 'Kondensmilch 7,5% Fett',
    source: 'BLS 4.0',
    sourceName: 'Kondensmilch mind. 7,5 % Fett (M182400)',
    sourceUrl: 'https://blsdb.prod.se.ble.de/food?foodId=38613&token=2YL6-1GP4-98UN-06T1-FSL7-0H7M-3Z37-4SPD',
    matchMethod: 'same_food_density_scaled_from_per100g_to_per100ml',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.043, 'Omega-6 Fatty Acids (g)': 0.162 },
    values: {
      'Omega-3 Fatty Acids (g)': Number((0.043 * condensedMilkDensity).toFixed(6)),
      'Omega-6 Fatty Acids (g)': Number((0.162 * condensedMilkDensity).toFixed(6))
    },
    density: { value: condensedMilkDensity, unit: 'g/ml', derivation: 'target total fat 8.1 g/100 ml divided by BLS total fat 7.57 g/100 g' },
    calculation: 'BLS provides family totals per 100 g for condensed milk in the same fat class. Converted to the database per-100-ml unit using a density proxy derived from total fat. This is an estimate; trans fat remains unresolved.'
  }
];

const applied = [];
const alreadyPresent = [];
const missingTargets = [];
const sourceRecords = [];
for (const item of sources) {
  const index = database.findIndex((food) => food.name === item.name);
  if (index < 0) {
    missingTargets.push(item.name);
    continue;
  }
  const food = database[index];
  const addedValues = {};
  for (const [field, value] of Object.entries(item.values)) {
    if (food.nutrients[field] === null || food.nutrients[field] === undefined) {
      food.nutrients[field] = value;
      addedValues[field] = value;
      applied.push({ index: index + 1, name: item.name, field, value, source: item.sourceName });
    } else {
      alreadyPresent.push({ index: index + 1, name: item.name, field, existingValue: food.nutrients[field] });
    }
  }
  if (Object.keys(addedValues).length) {
    sourceRecords.push({
      databaseIndex: index + 1,
      databaseName: item.name,
      source: item.source,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      matchMethod: item.matchMethod,
      confidence: item.confidence,
      valueBasis: item.density ? 'per 100 ml, density-scaled from source per 100 g' : 'per 100 g edible portion',
      sourceValuesPer100g: item.sourceValuesPer100g,
      ...(item.density ? { density: item.density } : {}),
      targetTotalFatPer100g: food.nutrients['Total Fat (g)'],
      calculation: item.calculation,
      values: addedValues,
      checkedOn: '2026-09-24'
    });
  }
}

const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const coverage = {};
for (const field of fields) {
  const filled = database.slice(100, 200).filter((food) => food.nutrients[field] !== null && food.nutrients[field] !== undefined).length;
  coverage[field] = { filled, missing: 100 - filled, total: 100 };
}
audit.records ??= [];
audit.records.push(...sourceRecords);
audit.fieldCoverage = coverage;

const previous = audit.databaseApplication ?? {};
const previousUpdates = previous.updates ?? [];
const previousCounts = previous.appliedByField ?? {};
const thisBatchCounts = Object.fromEntries(fields.map((field) => [field, applied.filter((item) => item.field === field).length]));
audit.databaseApplication = {
  ...previous,
  appliedOn: '2026-09-24',
  appliedFrom: `${previous.appliedFrom ?? ''}; additional BLS 4.0 food analogues, USDA fatty-acid component sums, and density-scaled ml conversions`,
  appliedCount: (previous.appliedCount ?? previousUpdates.length) + applied.length,
  appliedByField: Object.fromEntries(fields.map((field) => [field, (previousCounts[field] ?? 0) + thisBatchCounts[field]])),
  updates: [...previousUpdates, ...applied],
  lastBatch: { appliedCount: applied.length, appliedByField: thisBatchCounts, alreadyPresent, missingTargets }
};

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ appliedCount: applied.length, appliedByField: thisBatchCounts, coverage, alreadyPresent, missingTargets }, null, 2));
