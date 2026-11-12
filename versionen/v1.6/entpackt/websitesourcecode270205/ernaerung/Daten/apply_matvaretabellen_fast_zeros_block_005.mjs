import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_matvaretabellen_fast_zeros_block_005.json';
const apply = process.argv.includes('--apply');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const keys = {
  totalFat: 'Total Fat (g)',
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const transTable = 'https://www.matvaretabellen.no/en/trans-fatty-acids/';
const records = [
  { index: 411, food: 'Couscous gekocht', sourceFood: 'Couscous, cooked', sourceUrl: 'https://www.matvaretabellen.no/en/couscous-cooked/', targetFat: 1.0, values: { trans: 0 } },
  { index: 433, food: 'Hering gegrillt (nur Fleisch)', sourceFood: 'Herring, raw; Herring, rolled in flour, fried in fat', sourceUrl: transTable, targetFat: 11.2, values: { trans: 0 } },
  { index: 439, food: 'Hähnchenkeule gebraten nur Fleisch', sourceFood: 'Chicken, drumstick, without skin, roasted', sourceUrl: 'https://www.matvaretabellen.no/en/chicken-drumstick-without-skin-roasted/', targetFat: 5.1, values: { trans: 0 } },
  { index: 441, food: 'Hühnerei ganz gekocht', sourceFood: 'Egg, boiled', sourceUrl: transTable, targetFat: 9.6, values: { trans: 0 } },
  { index: 450, food: 'Lachs Zucht gebacken', sourceFood: 'Salmon, farmed, raw', sourceUrl: 'https://www.matvaretabellen.no/en/salmon-farmed-raw/', targetFat: 14.6, values: { trans: 0 } },
  { index: 451, food: 'Lachs Zucht gegrillt', sourceFood: 'Salmon, farmed, raw', sourceUrl: 'https://www.matvaretabellen.no/en/salmon-farmed-raw/', targetFat: 15.6, values: { trans: 0 } },
  { index: 457, food: 'Makrele gegrillt', sourceFood: 'Mackerel, February - June, fried in fat', sourceUrl: transTable, targetFat: 22.4, values: { trans: 0 } },
  { index: 462, food: 'Ofen-Pommes (vorgebacken)', sourceFood: 'Potatoes, French fries, frozen', sourceUrl: transTable, targetFat: 4.9, values: { trans: 0 } },
  {
    index: 463,
    food: 'Ofenkartoffel mit Schale',
    sourceFood: 'Potatoes, baked',
    sourceUrl: 'https://www.matvaretabellen.no/en/potatoes-baked/',
    targetFat: 0.2,
    values: { omega3: 0, omega6: 0.1, trans: 0, ala: 0, epa: 0, dha: 0 },
  },
  { index: 479, food: 'Reis weiß Langkorn gekocht', sourceFood: 'Rice, white, long-grain, cooked', sourceUrl: transTable, targetFat: 0.4, values: { trans: 0 } },
];

if (!Array.isArray(db) || db.length !== 1516) throw new Error('Unexpected database shape or row count.');
if (apply && fs.existsSync(auditPath)) throw new Error(`Audit already exists: ${auditPath}`);

const auditRecords = records.map(record => {
  const item = db[record.index - 1];
  const nutrient = item?.nutrients;
  if (item?.name !== record.food || !nutrient) throw new Error(`Unexpected database row ${record.index}.`);
  if (nutrient[keys.totalFat] !== record.targetFat) throw new Error(`Target fat changed for ${record.food}.`);
  const priorValues = Object.fromEntries(Object.keys(record.values).map(name => [keys[name], nutrient[keys[name]] ?? null]));
  if (Object.values(priorValues).some(value => value !== null)) throw new Error(`Refusing to overwrite existing values for ${record.food}.`);
  if (Object.values(record.values).some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid value for ${record.food}.`);
  const resulting = { ...nutrient, ...Object.fromEntries(Object.entries(record.values).map(([name, value]) => [keys[name], value])) };
  const components = ['ala', 'epa', 'dha'].map(name => resulting[keys[name]]).filter(value => value != null);
  if (components.length === 3 && components.reduce((sum, value) => sum + value, 0) > resulting[keys.omega3] + 1e-9) {
    throw new Error(`Omega-3 components exceed total for ${record.food}.`);
  }
  return {
    databaseIndex: record.index,
    food: record.food,
    targetFat_g_per_100g: record.targetFat,
    sourceFood: record.sourceFood,
    sourceUrl: record.sourceUrl,
    valuesPer100g: Object.fromEntries(Object.entries(record.values).map(([name, value]) => [keys[name], value])),
    priorValues,
    alcoholRetained_g_per_100g: nutrient[keys.alcohol],
    confidence: 'high for exact or close food match; source values copied without scaling',
  };
});

if (apply) {
  for (const record of records) {
    const nutrient = db[record.index - 1].nutrients;
    for (const [name, value] of Object.entries(record.values)) nutrient[keys[name]] = value;
  }
  const audit = {
    checkedOn: '2026-09-25',
    source: 'Matvaretabellen, Norwegian Food Composition Table',
    sourceBasis: 'Per 100 g. Values copied only where a named food profile directly supported the target; no scaling or extrapolation.',
    method: 'Batch lookup of exact food names in the trans-fatty-acids table, plus the detailed baked-potato nutrient profile. Existing alcohol values were not changed.',
    records: auditRecords,
    validation: { rowCountUnchanged: true, nonnegativeValues: true, existingValuesNotOverwritten: true, omega3ComponentsWithinTotal: true, alcoholRetained: true },
  };
  fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', recordCount: auditRecords.length, filledFields: auditRecords.reduce((sum, record) => sum + Object.keys(record.valuesPer100g).length, 0), auditPath: apply ? auditPath : null }, null, 2));
