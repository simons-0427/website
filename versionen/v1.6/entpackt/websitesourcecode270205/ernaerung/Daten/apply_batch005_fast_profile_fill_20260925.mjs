import fs from 'node:fs';

const databasePath = 'database.json';
const auditPath = 'Daten/database_V2_fast_profile_batch005_20260925.json';
const apply = process.argv.includes('--apply');
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

const entries = [
  {
    databaseIndex: 421,
    expectedName: 'Fleischpastete (Handelsware)',
    values: {
      'Eicosapentaenoic Acid (EPA) (g)': 0,
      'Docosahexaenoic Acid (DHA) (g)': 0,
    },
    source: {
      dataset: 'CoFID 2021',
      code: '18-506',
      url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
      markers: { 'Eicosapentaenoic Acid (EPA) (g)': 'Tr', 'Docosahexaenoic Acid (DHA) (g)': 'Tr' },
      method: 'CoFID marks both components as trace. Stored as 0 at the database precision; this is a rounded trace, not proof of absolute absence.',
      confidence: 'medium',
    },
  },
  {
    databaseIndex: 426,
    expectedName: 'Gemüsecurry Fertiggericht ohne Reis',
    values: {
      'Omega-3 Fatty Acids (g)': 0.197,
      'Omega-6 Fatty Acids (g)': 1.53,
      'Alpha-Linolenic Acid (ALA) (g)': 0.197,
    },
    source: {
      dataset: 'USDA FoodData Central, Vegetable curry, NBD ID 2710067',
      url: 'https://freefoodlabels.com/usda-nutrition-facts/nutrition-facts-vegetable-curry.html',
      sourceFat_g_per_100g: 5.27,
      targetFat_g_per_100g: 6,
      sourceValues_g_per_100g: { 'PUFA 18:2': 1.53, 'PUFA 18:3': 0.197, 'EPA': 0, 'DHA': 0, 'DPA': 0, 'Total PUFA': 1.73 },
      method: 'Same generic vegetable-curry dish; copied without scaling. Omega-3/ALA use 18:3, Omega-6 uses 18:2. Sum 1.727 g is consistent with reported total PUFA 1.73 g within rounding.',
      confidence: 'medium',
    },
  },
  {
    databaseIndex: 434,
    expectedName: 'Hirschfleisch / Wildbraten',
    values: {
      'Eicosapentaenoic Acid (EPA) (g)': 0,
      'Docosahexaenoic Acid (DHA) (g)': 0,
    },
    source: {
      dataset: 'USDA FoodData Central SR Legacy',
      fdcId: 172604,
      sourceName: 'Game meat, deer, loin, separable lean only, 1 inch steak, cooked, broiled',
      url: 'https://fdc.nal.usda.gov/food-details/172604/nutrients?type=SR%20Legacy',
      sourceFat_g_per_100g: 2.38,
      targetFat_g_per_100g: 2.5,
      method: 'Close same-species roasted deer profile; USDA reports EPA and DHA as 0. Total-fat difference is 4.8%.',
      confidence: 'medium-high',
    },
  },
  {
    databaseIndex: 454,
    expectedName: 'Lammniere gebraten',
    values: {
      'Omega-3 Fatty Acids (g)': 0.432,
      'Omega-6 Fatty Acids (g)': 4.04,
      'Alpha-Linolenic Acid (ALA) (g)': 0.156,
      'Eicosapentaenoic Acid (EPA) (g)': 0.152,
      'Docosahexaenoic Acid (DHA) (g)': 0.058,
    },
    source: {
      datasets: ['USDA FoodData Central SR Legacy', 'CoFID 2021'],
      kidney: { fdcId: 174439, sourceName: 'Lamb, New Zealand, imported, kidney, cooked, soaked and fried', fat_g_per_100g: 3.56, omega3_g: 0.354, omega6_g: 0.454, ala_g: 0.078, epa_g: 0.152, dha_g: 0.058, url: 'https://fdc.nal.usda.gov/food-details/174439/nutrients?type=SR%20Legacy' },
      cornOil: { fdcId: 171029, linoleic_g_per_100g: 53.2, ala_g_per_100g: 1.16, url: 'https://fdc.nal.usda.gov/food-details/171029/nutrients?type=SR%20Legacy' },
      exactTarget: { cofIdCode: '18-493', name: 'Kidney, lamb, fried in corn oil', fat_g_per_100g: 10.3, url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid' },
      calculation: { targetMinusSourceFat_g: 6.74, omega3_g: '0.354 + 6.74 * 0.0116 = 0.432', omega6_g: '0.454 + 6.74 * 0.532 = 4.040', ala_g: '0.078 + 6.74 * 0.0116 = 0.156' },
      method: 'Estimate added absorbed corn oil as the fat difference between the exact CoFID target and the close cooked-kidney USDA profile. Keep source EPA and DHA unchanged. Medium-confidence recipe estimate, not a direct CoFID measurement.',
      confidence: 'medium',
    },
  },
  {
    databaseIndex: 478,
    expectedName: 'Raita (Hausgemacht)',
    values: {
      'Omega-3 Fatty Acids (g)': 0.013,
      'Omega-6 Fatty Acids (g)': 0.097,
      'Alpha-Linolenic Acid (ALA) (g)': 0.013,
      'Eicosapentaenoic Acid (EPA) (g)': 0,
      'Docosahexaenoic Acid (DHA) (g)': 0,
    },
    source: {
      datasets: ['CoFID 2021', 'USDA FoodData Central SR Legacy'],
      exactTarget: { cofIdCode: '17-832', totalPufa_g_per_100g: 0.11, fat_g_per_100g: 2.4, url: 'https://everycalc.io/en/uk-nutrition/raita-homemade/' },
      comparator: { fdcId: 170903, sourceName: 'Yogurt, Greek, plain, lowfat', fat_g_per_100g: 1.92, omega3_g: 0.007, omega6_g: 0.052, ala_g: 0.007, epa_g: 0, dha_g: 0, url: 'https://fdc.nal.usda.gov/food-details/170903/nutrients?type=SR%20Legacy' },
      method: 'Split exact CoFID total PUFA 0.11 g using the n-3:n-6 distribution of a close plain-yogurt comparator. Values rounded to 0.001 g. EPA/DHA follow the comparator zeros.',
      confidence: 'medium-low',
    },
  },
  {
    databaseIndex: 482,
    expectedName: 'Rinderburger mit Brötchen gegrillt (Hausgemacht)',
    values: {
      'Omega-3 Fatty Acids (g)': 0.399,
      'Omega-6 Fatty Acids (g)': 2.645,
      'Alpha-Linolenic Acid (ALA) (g)': 0.399,
      'Eicosapentaenoic Acid (EPA) (g)': 0,
      'Docosahexaenoic Acid (DHA) (g)': 0,
    },
    source: {
      dataset: 'USDA FoodData Central SR Legacy',
      fdcId: 170730,
      sourceName: 'BURGER KING, DOUBLE WHOPPER, with cheese',
      url: 'https://fdc.nal.usda.gov/food-details/170730/nutrients?type=SR%20Legacy',
      sourceFat_g_per_100g: 17.1,
      targetFat_g_per_100g: 17.4,
      sourceValues_g_per_100g: { omega3: 0.392, omega6: 2.6, ala: 0.392, epa: 0, dha: 0 },
      method: 'Closest fat-matched beef burger profile available in SR Legacy; scaled by target/source fat ratio 1.018. Source includes cheese, so this is an approximate comparator.',
      confidence: 'medium-low',
    },
  },
  {
    databaseIndex: 489,
    expectedName: 'Sandwich BLT (Weißbrot)',
    values: {
      'Omega-3 Fatty Acids (g)': 0.202,
      'Omega-6 Fatty Acids (g)': 2.706,
      'Alpha-Linolenic Acid (ALA) (g)': 0.187,
      'Eicosapentaenoic Acid (EPA) (g)': 0,
      'Docosahexaenoic Acid (DHA) (g)': 0.004,
    },
    source: {
      dataset: 'USDA FoodData Central SR Legacy',
      fdcId: 170313,
      sourceName: 'Fast foods, submarine sandwich, bacon, lettuce, and tomato on white bread',
      url: 'https://fdc.nal.usda.gov/food-details/170313/nutrients?type=SR%20Legacy',
      sourceFat_g_per_100g: 6.41,
      targetFat_g_per_100g: 11.9,
      sourceValues_g_per_100g: { omega3: 0.109, omega6: 1.458, ala: 0.101, epa: 0, dha: 0.002 },
      fatRatio: 1.8565,
      method: 'Same BLT-on-white-bread ingredient profile; scaled to the exact CoFID target fat. This assumes the higher fat amount is mainly a portion or dressing difference.',
      confidence: 'medium',
    },
  },
  {
    databaseIndex: 497,
    expectedName: 'Tempeh-Burger gebraten',
    values: {
      'Omega-3 Fatty Acids (g)': 0.083,
      'Omega-6 Fatty Acids (g)': 1.746,
      'Alpha-Linolenic Acid (ALA) (g)': 0.083,
    },
    source: {
      dataset: 'USDA FoodData Central SR Legacy',
      fdcId: 172467,
      sourceName: 'Tempeh, cooked',
      url: 'https://fdc.nal.usda.gov/food-details/172467/nutrients?type=SR%20Legacy',
      sourceFat_g_per_100g: 11.4,
      targetFat_g_per_100g: 7.9,
      sourceValues_g_per_100g: { omega3: 0.12, omega6: 2.52, ala: 0.12 },
      fatRatio: 0.693,
      method: 'Same base food, scaled to target fat; EPA/DHA were already zero from the vegan-food pass. CoFID has the exact burger fat but no omega breakdown.',
      confidence: 'medium',
    },
  },
  {
    databaseIndex: 499,
    expectedName: 'Tofu-Burger gebacken',
    values: {
      'Omega-3 Fatty Acids (g)': 0.16,
      'Omega-6 Fatty Acids (g)': 1.41,
      'Alpha-Linolenic Acid (ALA) (g)': 0.16,
    },
    source: {
      dataset: 'USDA FoodData Central SR Legacy',
      fdcId: 172448,
      sourceName: 'Tofu, firm, prepared with calcium sulfate and magnesium chloride',
      url: 'https://fdc.nal.usda.gov/food-details/172448/nutrients?type=SR%20Legacy',
      sourceFat_g_per_100g: 4.17,
      targetFat_g_per_100g: 4,
      fatRatio: 0.959,
      sourceValues_g_per_100g: { omega3: 0.167, omega6: 1.47, ala: 0.167 },
      method: 'Close fat-matched tofu profile, scaled by target/source fat ratio. EPA/DHA and trans were already zero from the vegan-food pass.',
      confidence: 'medium',
    },
  },
];

const changes = [];
const preserved = [];
for (const entry of entries) {
  const item = db[entry.databaseIndex - 1];
  if (!item || item.name !== entry.expectedName) throw new Error(`Food/index mismatch at ${entry.databaseIndex}: ${item?.name}`);
  const values = {};
  for (const [key, value] of Object.entries(entry.values)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid value for ${entry.databaseIndex} ${key}`);
    const current = item.nutrients?.[key];
    if (current === null || current === undefined || current === '') values[key] = value;
    else preserved.push({ databaseIndex: entry.databaseIndex, food: entry.expectedName, key, current });
  }
  if (Object.keys(values).length) changes.push({ ...entry, values });
}

const audit = {
  checkedOn: '2026-09-25',
  scope: { batch: '005', databaseIndices: [401, 500], unit: 'g per 100 g food' },
  method: 'Fast source pass. Exact source data is used where present; otherwise a close same-food comparator or an explicitly documented food-composition estimate is used. Existing non-null values are never overwritten.',
  fields: ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alpha-Linolenic Acid (ALA) (g)', 'Eicosapentaenoic Acid (EPA) (g)', 'Docosahexaenoic Acid (DHA) (g)'],
  changes,
  preserved,
  validation: {
    allProposedValuesNumericNonnegative: true,
    noExistingValuesOverwritten: preserved.every(row => row.current === null || row.current === undefined || row.current === ''),
    traceValuesRoundedToZeroAreAnnotated: true,
    estimatesHaveSourceAndConfidence: true,
  },
};

if (apply) {
  if (fs.existsSync(auditPath)) throw new Error(`Audit already exists: ${auditPath}`);
  for (const change of changes) Object.assign(db[change.databaseIndex - 1].nutrients, change.values);
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', foodsChanged: changes.length, cellsChanged: changes.reduce((sum, row) => sum + Object.keys(row.values).length, 0), preserved: preserved.length, auditPath: apply ? auditPath : null, changes: changes.map(({ databaseIndex, expectedName, values, source }) => ({ databaseIndex, food: expectedName, values, confidence: source.confidence || source.method })) }, null, 2));
