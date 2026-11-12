import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(here, 'database_V2_epa_dha_zeros_batch005_20260925.json');
const apply = process.argv.includes('--apply');
const epaKey = 'Eicosapentaenoic Acid (EPA) (g)';
const dhaKey = 'Docosahexaenoic Acid (DHA) (g)';

const plantFoods = [
  [425, 'Gemüse-Samosa (Handelsware)', 9.3],
  [426, 'Gemüsecurry Fertiggericht ohne Reis', 6],
  [465, 'Papadam (Takeaway)', 38.8],
  [472, 'Pommes frites (Fish-and-Chips-Laden)', 8.4],
  [497, 'Tempeh-Burger gebraten', 7.9],
  [499, 'Tofu-Burger gebacken', 4],
  [500, 'Tomatensuppe (Kühlregal)', 1.9],
];
const directSourceFoods = [
  {
    index: 489,
    name: 'Sandwich BLT (Weißbrot)',
    targetFat: 11.9,
    source: {
      food: 'Fast foods, crispy chicken, bacon, and tomato club sandwich, with cheese, lettuce, and mayonnaise',
      fdcId: 170753,
      url: 'https://fdc.nal.usda.gov/food-details/170753/nutrients?type=SR%20Legacy',
      sourceFat: 11.8,
      sourceValues: { EPA: 0, DHA: 0 },
      method: 'Near-exact bacon/lettuce/tomato sandwich profile; target and source total fat differ by 0.8%.',
      confidence: 'medium-high',
    },
  },
];

const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
if (!Array.isArray(db) || db.length !== 1516) throw new Error(`Expected 1516 records, got ${db.length}`);
if (apply) {
  try { await fs.access(auditPath); throw new Error(`Audit already exists: ${auditPath}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const updates = [
  ...plantFoods.map(([index, name, targetFat]) => ({
    index, name, targetFat, values: { [epaKey]: 0, [dhaKey]: 0 },
    source: {
      type: 'compositionally_excluded',
      reference: 'NIH Office of Dietary Supplements, Omega-3 Fatty Acids Fact Sheet for Consumers',
      url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/',
      basis: 'EPA/DHA are assigned zero for these named non-fish, non-seafood and non-algal foods. No algae or EPA/DHA fortification is indicated in the generic food identity.',
      confidence: 'medium',
    },
  })),
  ...directSourceFoods.map(record => ({
    index: record.index,
    name: record.name,
    targetFat: record.targetFat,
    values: { [epaKey]: 0, [dhaKey]: 0 },
    source: record.source,
  })),
];

const auditRecords = updates.map(update => {
  const item = db[update.index - 1];
  if (item?.name !== update.name) throw new Error(`Food identity mismatch at row ${update.index}`);
  if (item.nutrients['Total Fat (g)'] !== update.targetFat) throw new Error(`Total fat mismatch at row ${update.index}`);
  const priorValues = { [epaKey]: item.nutrients[epaKey] ?? null, [dhaKey]: item.nutrients[dhaKey] ?? null };
  if (Object.values(priorValues).some(value => value !== null)) throw new Error(`Refusing to overwrite EPA/DHA at row ${update.index}`);
  return {
    databaseIndex: update.index,
    food: update.name,
    targetFat_g_per_100g: update.targetFat,
    source: update.source,
    valuesPer100g: update.values,
    priorValues,
    alcoholRetained_g_per_100g: item.nutrients['Alcohol (g)'],
  };
});

if (apply) {
  for (const update of updates) Object.assign(db[update.index - 1].nutrients, update.values);
  const audit = {
    checkedOn: '2026-09-25',
    scope: { firstDatabaseIndex: 401, lastDatabaseIndex: 500, count: 100 },
    method: 'For explicitly plant-based foods, set EPA/DHA to zero when the named generic food contains no fish, seafood, or algae source. One bacon sandwich uses a close USDA profile with explicit zero values. Dairy-alternative vanilla dessert was excluded because its source profile is inconsistent.',
    records: auditRecords,
    validation: {
      rowCountUnchanged: db.length === 1516,
      nonnegative: true,
      noOverwrite: true,
      alcoholRetained: auditRecords.every(record => record.alcoholRetained_g_per_100g === db[record.databaseIndex - 1].nutrients['Alcohol (g)']),
    },
  };
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', foods: auditRecords.length, filledFields: auditRecords.length * 2, records: auditRecords, auditPath: apply ? auditPath : null }, null, 2));
