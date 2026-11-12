import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_005_part5_20260925.json');
const apply = process.argv.includes('--apply');
const keys = {
  fat: 'Total Fat (g)',
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
  alcohol: 'Alcohol (g)',
};

const records = [
  {
    index: 424,
    food: 'Gammon / Schinkenscheibe gegrillt',
    targetFat: 9.9,
    values: { trans: 0 },
    source: {
      food: 'Ham, smoke-cured',
      url: 'https://www.matvaretabellen.no/en/ham-smoke-cured/',
      fat: 9.2,
      trans: 0,
      method: 'Direct close analogue: cured/smoked ham; source fat differs by 7.1%.',
      confidence: 'high',
    },
  },
  {
    index: 427,
    food: 'Gemüsesuppe (Dose)',
    targetFat: 0.6,
    values: { epa: 0, dha: 0 },
    source: {
      food: 'Soup, chunky vegetable, reduced sodium, canned, ready-to-serve',
      fdcId: 174071,
      url: 'https://fdc.nal.usda.gov/food-details/174071/nutrients?type=SR%20Legacy',
      fat: 0.51,
      nutrientValues: { epa: 0, dha: 0 },
      method: 'Close canned vegetable-soup profile; copied only EPA/DHA cells explicitly reported as zero.',
      confidence: 'medium-high',
    },
  },
  {
    index: 442,
    food: 'Hühnerleber gebraten',
    targetFat: 8.9,
    values: { trans: 0 },
    source: {
      food: 'Liver, chicken, raw',
      url: 'https://www.matvaretabellen.no/en/liver-chicken-raw/',
      fat: 4.1,
      trans: 0,
      method: 'Same food tissue; table reports zero trans. Ordinary frying oil adds no trans-fat unless hydrogenated fat is specified.',
      confidence: 'medium',
    },
  },
  {
    index: 473,
    food: 'Popcorn gesalzen (Handelsware)',
    targetFat: 23.5,
    values: { trans: 0 },
    source: {
      food: 'Popcorn, air popped, industrially made',
      url: 'https://www.matvaretabellen.no/en/popcorn-air-popped-industrially-made/',
      fat: 14.5,
      trans: 0,
      method: 'Same industrial popcorn category; source reports zero trans-fat. No positive trans value is inferred from the target’s higher fat.',
      confidence: 'medium',
    },
  },
  {
    index: 476,
    food: 'Quiche Lorraine',
    targetFat: 26,
    values: { trans: 0.2 },
    source: {
      food: 'Quiche, with cheese and ham',
      url: 'https://www.matvaretabellen.no/en/quiche-with-cheese-and-ham/',
      fat: 15.4,
      trans: 0.2,
      method: 'Closest available quiche profile; value copied as a coarse dish-family estimate, not scaled.',
      confidence: 'medium-low',
    },
  },
  {
    index: 481,
    food: 'Rinder-Patty gegrillt (ca. 98% Rind)',
    targetFat: 24.4,
    values: { omega3: 0.072, omega6: 0.375, ala: 0.049, epa: 0.003, dha: 0.001 },
    source: {
      food: 'Beef, ground, patties, frozen, cooked, broiled',
      fdcId: 169447,
      url: 'https://fdc.nal.usda.gov/food-details/169447/nutrients?type=SR%20Legacy',
      fat: 21.8,
      originalValues: { omega3: 0.064, omega6: 0.335, ala: 0.044, epa: 0.003, dha: 0.001 },
      ratio: 24.4 / 21.8,
      method: 'Close cooked beef-patty profile; values scaled by target/source total fat ratio and rounded to 0.001 g. Trans-fat was not reported by this source and remains null.',
      confidence: 'medium',
    },
  },
];

const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
if (!Array.isArray(db) || db.length !== 1516) throw new Error(`Expected 1516 records, got ${db.length}`);
if (apply) {
  try { await fs.access(auditPath); throw new Error(`Audit already exists: ${auditPath}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const round3 = value => Math.round(value * 1000) / 1000;
const auditRecords = [];
for (const record of records) {
  const item = db[record.index - 1];
  if (item?.name !== record.food) throw new Error(`Food identity mismatch at row ${record.index}`);
  const nutrient = item.nutrients;
  if (nutrient[keys.fat] !== record.targetFat) throw new Error(`Fat changed at row ${record.index}`);
  const prior = Object.fromEntries(Object.keys(record.values).map(name => [keys[name], nutrient[keys[name]] ?? null]));
  if (Object.values(prior).some(value => value !== null)) throw new Error(`Refusing to overwrite existing value at row ${record.index}`);
  const values = record.index === 481
    ? Object.fromEntries(Object.entries(record.source.originalValues).map(([name, value]) => [name, round3(value * record.source.ratio)]))
    : record.values;
  if (JSON.stringify(values) !== JSON.stringify(record.values)) throw new Error(`Scaled values changed for row ${record.index}`);
  if (Object.values(values).some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid proposed value at row ${record.index}`);
  auditRecords.push({
    databaseIndex: record.index,
    food: record.food,
    targetFat_g_per_100g: record.targetFat,
    source: record.source,
    valuesPer100g: Object.fromEntries(Object.entries(values).map(([name, value]) => [keys[name], value])),
    priorValues: prior,
    alcoholRetained_g_per_100g: nutrient[keys.alcohol],
  });
}

if (apply) {
  for (const record of auditRecords) {
    const nutrient = db[record.databaseIndex - 1].nutrients;
    for (const [key, value] of Object.entries(record.valuesPer100g)) nutrient[key] = value;
  }
  for (const record of auditRecords) {
    const nutrient = db[record.databaseIndex - 1].nutrients;
    const components = [keys.ala, keys.epa, keys.dha].map(key => nutrient[key]);
    if (components.every(value => value != null) && components.reduce((sum, value) => sum + value, 0) > nutrient[keys.omega3] + 1e-9) {
      throw new Error(`ALA/EPA/DHA exceed Omega-3 at row ${record.databaseIndex}`);
    }
  }
  const audit = {
    checkedOn: '2026-09-25',
    scope: { firstDatabaseIndex: 401, lastDatabaseIndex: 500, count: 100 },
    method: 'Grouped source matching. Direct zero values were transferred only when explicitly reported by the source. The beef-patty profile was scaled to target total fat; all source details and confidence are retained per record. No existing values or alcohol values were overwritten.',
    sourceDatasets: ['Matvaretabellen (Norwegian Food Composition Table)', 'USDA FoodData Central SR Legacy, April 2018'],
    records: auditRecords,
    validation: {
      rowCountUnchanged: db.length === 1516,
      nonnegative: auditRecords.every(record => Object.values(record.valuesPer100g).every(value => value >= 0)),
      noOverwrite: auditRecords.every(record => Object.values(record.priorValues).every(value => value === null)),
      alcoholRetained: auditRecords.every(record => record.alcoholRetained_g_per_100g === db[record.databaseIndex - 1].nutrients[keys.alcohol]),
      componentsWithinOmega3: true,
    },
  };
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', foods: auditRecords.length, fields: auditRecords.reduce((count, record) => count + Object.keys(record.valuesPer100g).length, 0), records: auditRecords, auditPath: apply ? auditPath : null }, null, 2));
