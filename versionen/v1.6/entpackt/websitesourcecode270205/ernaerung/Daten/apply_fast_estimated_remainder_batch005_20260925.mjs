import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(here, 'database_V2_fast_estimated_remainder_batch005_20260925.json');
const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
if (!Array.isArray(db) || db.length !== 1516) throw new Error(`Expected 1516 foods, got ${db.length}`);
try { await fs.access(auditPath); throw new Error(`Audit already exists: ${auditPath}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const K = {
  omega3: 'Omega-3 Fatty Acids (g)', omega6: 'Omega-6 Fatty Acids (g)', trans: 'Trans Fat (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)', epa: 'Eicosapentaenoic Acid (EPA) (g)', dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const records = [
  {
    index: 402, name: 'Chicken Balti (Handelsware)', fat: 5.0,
    values: { [K.omega3]: 0.150, [K.omega6]: 1.250, [K.ala]: 0.150, [K.epa]: 0, [K.dha]: 0 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '19-449', totalPufa_g_per100g: 1.4, url: 'https://www.nutridex.org.uk/foods/59ccqjx/curry-chicken-balti-retail' },
      comparator: { dataset: 'USDA FoodData Central', fdcId: 2706437, food: 'Chicken curry', totalFat_g_per100g: 6.48, linoleic_g: 1.69, ala_g: 0.205, epa_g: 0, dha_g: 0, url: 'https://freefoodlabels.com/usda-nutrition-facts/nutrition-facts-chicken-curry.html' },
      method: 'Use exact CoFID total PUFA 1.4 g. Estimate the n-3/n-6 split from USDA chicken curry ratio; rescale only the split so Omega-3 + Omega-6 equals the exact total PUFA. ALA is used as n-3; EPA/DHA follow the comparator zeros.', confidence: 'medium-low',
    },
  },
  {
    index: 403, name: 'Chicken Korma (Hausgemacht)', fat: 5.1,
    values: { [K.omega3]: 0.118, [K.omega6]: 0.982, [K.ala]: 0.118, [K.epa]: 0, [K.dha]: 0 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '19-565', totalPufa_g_per100g: 1.1, url: 'https://everycalc.io/en/uk-nutrition/curry-chicken-korma-homemade/' },
      comparator: { dataset: 'USDA FoodData Central', fdcId: 2706437, food: 'Chicken curry', totalFat_g_per100g: 6.48, linoleic_g: 1.69, ala_g: 0.205, epa_g: 0, dha_g: 0, url: 'https://freefoodlabels.com/usda-nutrition-facts/nutrition-facts-chicken-curry.html' },
      method: 'Use exact CoFID total PUFA 1.1 g. Estimate the n-3/n-6 split from USDA chicken curry ratio and scale the split to that total. ALA is used as n-3; EPA/DHA follow the comparator zeros.', confidence: 'medium-low',
    },
  },
  {
    index: 426, name: 'Gemüsecurry Fertiggericht ohne Reis', fat: 6.0,
    values: { [K.trans]: 0.02 },
    source: { dataset: 'USDA FoodData Central, Vegetable curry, NBD ID 2710067', url: 'https://freefoodlabels.com/usda-nutrition-facts/nutrition-facts-vegetable-curry.html', method: 'Low estimate for a prepared vegetable curry without a reported numerical trans-fat value; not treated as proven absence.', confidence: 'low' },
  },
  {
    index: 427, name: 'Gemüsesuppe (Dose)', fat: 0.6,
    values: { [K.trans]: 0.03 },
    source: { dataset: 'CoFID 2021', code: '17-712', marker: 'N', url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid', method: 'CoFID marks trans fat as present but without a reliable amount. A small 0.03 g estimate is used for this low-fat canned soup; it is not zero.', confidence: 'low' },
  },
  {
    index: 482, name: 'Rinderburger mit Brötchen gegrillt (Hausgemacht)', fat: 17.4,
    values: { [K.trans]: 0.10 },
    source: { dataset: 'CoFID 2021', code: '19-556', marker: 'N', url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid', method: 'CoFID marks trans fat as present but without a reliable amount. Use a coarse 0.10 g estimate based on the beef-burger food type and target fat; not zero.', confidence: 'low' },
  },
  {
    index: 483, name: 'Rindercurry (Handelsware)', fat: 6.6,
    values: { [K.omega3]: 0.067, [K.omega6]: 0.533, [K.trans]: 0.10, [K.ala]: 0.066, [K.epa]: 0.001, [K.dha]: 0 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '19-488', totalPufa_g_per100g: 0.60, transMarker: 'N', url: 'https://everycalc.io/en/uk-nutrition/curry-beef-retail-reheated/' },
      comparator: { dataset: 'USDA FoodData Central', fdcId: 2706388, food: 'Beef curry', totalFat_g_per100g: 6.57, linoleic_g: 1.6, ala_g: 0.197, epa_g: 0.001, dha_g: 0, url: 'https://freefoodlabels.com/usda-nutrition-facts/nutrition-facts-beef-curry.html' },
      method: 'Keep exact CoFID total PUFA 0.60 g and use the beef-curry comparator ratio to split it. ALA and EPA are scaled proportionally; DHA follows the comparator zero. CoFID trans marker N means present but unquantified, so 0.10 g is a low-detail estimate, not a measured value.', confidence: 'medium-low for omegas; low for trans',
    },
  },
  {
    index: 485, name: 'Risotto mit Hähnchen', fat: 3.3,
    values: { [K.omega3]: 0.033, [K.omega6]: 0.277, [K.ala]: 0.033, [K.epa]: 0, [K.dha]: 0 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '19-566', totalPufa_g_per100g: 0.31, url: 'https://www.nutridex.org.uk/foods/4s2xj87/risotto-chicken-homemade' },
      comparator: { dataset: 'USDA FoodData Central', fdcId: 2706437, food: 'Chicken curry', totalFat_g_per100g: 6.48, linoleic_g: 1.69, ala_g: 0.205, epa_g: 0, dha_g: 0, url: 'https://freefoodlabels.com/usda-nutrition-facts/nutrition-facts-chicken-curry.html' },
      method: 'Use exact CoFID total PUFA 0.31 g and estimate the n-3/n-6 split from a chicken dish comparator. ALA is used as n-3; EPA/DHA follow comparator zeros.', confidence: 'medium-low',
    },
  },
  {
    index: 490, name: 'Sandwich Cheddar und Pickles', fat: 14.4,
    values: { [K.omega3]: 0.17, [K.omega6]: 1.69, [K.ala]: 0.17, [K.epa]: 0, [K.dha]: 0 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '11-963', totalPufa_g_per100g: 1.86, trans_g: 0.45, url: 'https://www.nutridex.org.uk/foods/4magvrv/sandwich-white-bread-cheddar-cheese-and-pickle' },
      comparator: { dataset: 'USDA FoodData Central SR Legacy', foods: 'white bread, cheddar and vegetable-oil sandwich profiles', url: 'https://fdc.nal.usda.gov/download-datasets/' },
      method: 'Keep exact CoFID total PUFA 1.86 g and exact trans fat already populated. Estimate 0.17 g n-3/ALA and assign the remainder to n-6; no marine/algal ingredient is named, so EPA/DHA remain zero.', confidence: 'low',
    },
  },
];

for (const record of records) {
  const item = db[record.index - 1];
  if (item?.name !== record.name) throw new Error(`Food identity mismatch at ${record.index}: ${item?.name}`);
  if (item.nutrients['Total Fat (g)'] !== record.fat) throw new Error(`Total-fat mismatch at ${record.index}`);
  for (const [key, value] of Object.entries(record.values)) {
    if (item.nutrients[key] !== null && item.nutrients[key] !== undefined) throw new Error(`Refusing to overwrite ${record.index} ${key}: ${item.nutrients[key]}`);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid value at ${record.index} ${key}`);
  }
  for (const [key, value] of Object.entries(record.values)) item.nutrients[key] = value;
}

const violations = records.filter(record => {
  const n = db[record.index - 1].nutrients;
  return n[K.ala] + n[K.epa] + n[K.dha] > n[K.omega3] + 0.02 || n[K.omega3] + n[K.omega6] > n['Total Fat (g)'] + 0.001;
});
if (violations.length) throw new Error(`Fatty-acid consistency failed at ${violations.map(r => r.index).join(', ')}`);

await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
const audit = {
  checkedOn: '2026-09-25',
  scope: { batch: '005', databaseIndices: [401, 500], unit: 'g per 100 g food' },
  method: 'Fast grouped completion: preserve exact CoFID total PUFA and numerical trans values; estimate only missing splits and unquantified trans cells from close food profiles. Low-confidence values are labeled. No existing non-null value was overwritten.',
  records: records.map(record => ({ databaseIndex: record.index, food: record.name, targetFat_g_per100g: record.fat, valuesPer100g: record.values, source: record.source, priorValues: Object.fromEntries(Object.keys(record.values).map(key => [key, null])) })),
  validation: { rowCountUnchanged: db.length === 1516, nonnegative: true, noExistingValuesOverwritten: true, omega3ComponentsWithinTotal: true, omega3PlusOmega6WithinTotalFat: true },
};
await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ changedFoods: records.length, changedFields: records.reduce((sum, row) => sum + Object.keys(row.values).length, 0), auditPath }, null, 2));
