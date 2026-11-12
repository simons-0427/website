import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_001_sources.json');
const sourcePath = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const apply = process.argv.includes('--apply');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const foods = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).SRLegacyFoods ?? [];
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

// Curated exact descriptions from the USDA SR Legacy item list.
const sourceByDatabaseIndex = new Map([
  [1, 'Beans, adzuki, mature seeds, raw'],
  [3, 'Sweetener, syrup, agave'],
  [4, 'Syrups, maple'],
  [5, 'Amaranth grain, uncooked'],
  [6, 'Pineapple, raw, all varieties'],
  [7, 'Pineapple, canned, juice pack, drained'],
  [9, 'Applesauce, canned, unsweetened, without added ascorbic acid'],
  [11, 'Apricots, raw'],
  [12, 'Apricots, dried, sulfured, uncooked'],
  [15, 'Avocados, raw, all commercial varieties'],
  [18, 'Bananas, raw'],
  [19, 'Basil, fresh'],
  [22, 'Pears, raw'],
  [23, 'Blueberries, raw'],
  [24, 'Cauliflower, raw'],
  [26, 'Beans, snap, green, raw'],
  [27, 'Beans, snap, green, frozen, unprepared'],
  [28, 'Beans, snap, green, canned, drained solids'],
  [29, 'Beans, white, mature seeds, raw'],
  [30, 'Beans, white, mature seeds, canned, drained solids'],
  [32, 'Broccoli, raw'],
  [33, 'Blackberries, raw'],
  [35, 'Buckwheat'],
  [37, 'Bulgur, dry'],
  [43, 'Nuts, cashew nuts, raw'],
  [45, 'Mushrooms, canned, drained solids'],
  [46, 'Seeds, chia seeds, dried'],
  [47, 'Chicory greens, raw'],
  [48, 'Cabbage, Chinese (pak-choi), raw'],
  [51, 'Cheese, cottage, lowfat, 2% milkfat'],
  [52, 'Couscous, dry'],
  [55, 'Dill weed, fresh'],
  [61, 'Edamame, frozen, unprepared'],
  [62, 'Egg, whole, raw, fresh'],
  [63, 'Egg, yolk, raw, fresh'],
  [64, 'Egg, white, raw, fresh'],
  [65, 'Lettuce, iceberg (includes crisphead types), raw'],
  [68, 'Peas and carrots, canned, regular pack, solids and liquids'],
  [69, 'Peas, green, canned, drained solids, unprepared'],
  [71, 'Peas, green, frozen, unprepared'],
  [74, 'Strawberries, raw'],
  [76, 'Peanuts, all types, dry-roasted, without salt'],
  [77, 'Peanuts, all types, raw'],
  [81, 'Figs, raw'],
  [82, 'Figs, dried'],
  [84, 'Fennel, bulb, raw'],
  [85, 'Cheese, feta'],
  [92, 'Onions, spring or scallions (includes tops and bulb), raw'],
  [94, 'Vegetable juice cocktail, canned'],
  [96, 'Pomegranates, raw'],
  [97, 'Grapefruit, raw, pink and red and white, all areas'],
]);

const fieldKeys = {
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
};
const numberValues = food => {
  const result = new Map();
  for (const item of food.foodNutrients ?? []) {
    const number = String(item.nutrient?.number ?? '');
    if (!number || !Number.isFinite(item.amount)) continue;
    if (!result.has(number)) result.set(number, item.amount);
  }
  return result;
};
const calculateOmegas = food => {
  const values = numberValues(food);
  const has = number => values.has(String(number));
  const get = number => values.get(String(number));
  const totalPufa = get(646);
  if (totalPufa === 0) return { omega3: 0, omega6: 0, totalPufa, reconciled: true, method: 'USDA total polyunsaturated fatty acids is zero' };
  if (totalPufa == null) return { totalPufa: null, reconciled: false, method: 'USDA total polyunsaturated fatty acids not reported' };

  // Use isomer-specific n-3/n-6 components where present, with the corresponding
  // undifferentiated C18 components as fallbacks. Never add a total and its isomer subset twice.
  let omega3C18 = has(851) ? get(851) : (has(685) && has(619) ? Math.max(0, get(619) - get(685)) : get(619));
  let omega6C18 = has(675) ? get(675) : get(618);
  if (omega3C18 == null) omega3C18 = 0;
  if (omega6C18 == null) omega6C18 = 0;
  let omega3 = omega3C18 + (get(627) ?? 0) + (get(852) ?? 0) + (get(629) ?? 0) + (get(631) ?? 0) + (get(621) ?? 0);
  let omega6 = omega6C18 + (get(685) ?? 0) + (get(672) ?? 0);

  const specific20x3 = [...(food.foodNutrients ?? [])].filter(item => /20:3.*n-6/i.test(item.nutrient?.name ?? '')).reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const specific20x3n3 = [...(food.foodNutrients ?? [])].filter(item => /20:3.*n-3/i.test(item.nutrient?.name ?? '')).reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  if (specific20x3 || specific20x3n3) {
    omega6 += specific20x3;
    omega3 += specific20x3n3;
  } else if (has(689)) {
    omega6 += get(689);
  }
  omega6 += (get(855) ?? get(620) ?? 0) + (get(858) ?? 0);

  const difference = Math.abs(totalPufa - omega3 - omega6);
  const tolerance = Math.max(0.01, totalPufa * 0.01);
  return {
    omega3: Number(omega3.toFixed(6)),
    omega6: Number(omega6.toFixed(6)),
    totalPufa,
    difference: Number(difference.toFixed(6)),
    tolerance: Number(tolerance.toFixed(6)),
    reconciled: difference <= tolerance,
    method: 'Sum of USDA C18 and longer-chain n-3/n-6 components, checked against total PUFA',
  };
};
const relevantSourceValues = food => (food.foodNutrients ?? [])
  .filter(item => new Set(['221', '605', '618', '619', '620', '621', '627', '629', '631', '646', '672', '675', '685', '689', '851', '852', '855', '858']).has(String(item.nutrient?.number)))
  .map(item => ({ number: String(item.nutrient.number), component: item.nutrient.name, amountPer100g: item.amount }));
const batchFoods = db.slice(0, 100);
const preview = [];
const appliedRecords = [];
const fieldChanges = { [fieldKeys.omega3]: 0, [fieldKeys.omega6]: 0, [fieldKeys.trans]: 0, [fieldKeys.alcohol]: 0 };

for (const [index, expectedDescription] of sourceByDatabaseIndex) {
  const item = db[index - 1];
  const source = foods.find(food => food.description?.toLowerCase() === expectedDescription.toLowerCase());
  if (!source) {
    preview.push({ databaseIndex: index, databaseName: item.name, expectedDescription, status: 'exact source description not found' });
    continue;
  }
  const values = numberValues(source);
  const omega = calculateOmegas(source);
  const derived = {
    [fieldKeys.omega3]: omega.reconciled ? omega.omega3 : null,
    [fieldKeys.omega6]: omega.reconciled ? omega.omega6 : null,
    [fieldKeys.trans]: values.get('605') ?? null,
    [fieldKeys.alcohol]: values.get('221') ?? null,
  };
  const added = {};
  const skippedByUnit = {};
  const conflicts = {};
  for (const [key, value] of Object.entries(derived)) {
    const current = item.nutrients?.[key];
    if (value == null) continue;
    if (current != null) {
      if (Math.abs(Number(current) - value) > 0.000001) conflicts[key] = { existing: current, USDA_SR_Legacy: value };
      continue;
    }
    if (item.unit !== 'g' && value !== 0) {
      skippedByUnit[key] = { valuePer100g: value, unit: item.unit, reason: 'No verified g/ml conversion applied' };
      continue;
    }
    added[key] = value;
    fieldChanges[key]++;
    if (apply) item.nutrients[key] = value;
  }
  const record = {
    databaseIndex: index,
    databaseName: item.name,
    source: 'USDA_FoodData_Central_SR_Legacy_2018',
    fdcId: source.fdcId,
    sourceName: source.description,
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${source.fdcId}/nutrients?type=SR%20Legacy`,
    valueBasis: 'per 100 g edible portion',
    sourceValues: relevantSourceValues(source),
    derivedOmegas: omega,
    addedValues: added,
    skippedByUnit,
    conflicts,
    checkedOn: '2026-09-23',
  };
  preview.push({ databaseIndex: index, databaseName: item.name, sourceName: source.description, fdcId: source.fdcId, added, skippedByUnit, conflicts, omega: { omega3: omega.omega3, omega6: omega.omega6, totalPufa: omega.totalPufa, reconciled: omega.reconciled } });
  appliedRecords.push(record);
}

const coverage = {};
for (const key of Object.values(fieldKeys)) {
  const filled = batchFoods.filter(food => food.nutrients?.[key] != null).length;
  coverage[key] = { filled, missing: 100 - filled, total: 100 };
}
const output = { mode: apply ? 'apply' : 'preview', matchedSources: appliedRecords.length, unmatched: preview.filter(row => row.status).length, fieldChanges, coverage, rows: preview };
if (apply) {
  audit.sources.USDA_FoodData_Central_SR_Legacy_2018 = {
    url: 'https://fdc.nal.usda.gov/download-datasets/',
    release: 'SR Legacy, 2018-04',
    citation: 'USDA Agricultural Research Service, FoodData Central, SR Legacy, April 2018. Direct records and nutrient amounts per 100 g edible portion.',
    directItemUrlPattern: 'https://fdc.nal.usda.gov/food-details/{fdcId}/nutrients?type=SR%20Legacy',
    nutrientInterpretationUrl: 'https://fdc.nal.usda.gov/docs/Foundation_Foods_Documentation_Apr2024.pdf',
    totalPUFAComponent: 'Nutrient 646',
    totalTransComponent: 'Nutrient 605',
    alcoholComponent: 'Nutrient 221',
    omegaMethod: 'Sum reported n-3/n-6 components without double-counting undifferentiated totals; accept Omega-3/Omega-6 sums only when they reconcile to total polyunsaturated fatty acids within 0.01 g or 1 percent. Foods using ml or other units receive only source zeros until an approved conversion is available.',
  };
  audit.records.push(...appliedRecords);
  audit.fieldCoverage = coverage;
  audit.checkedOn = '2026-09-23';
  audit.status = 'partial_research';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}
console.log(JSON.stringify(output, null, 2));
