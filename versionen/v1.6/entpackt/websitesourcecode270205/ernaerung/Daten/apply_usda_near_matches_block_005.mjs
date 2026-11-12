import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_usda_near_matches_block_005.json';
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

const records = [
  {
    index: 409,
    food: 'Coleslaw / Krautsalat (Handelsware)',
    targetFat: 16.3,
    sourceId: 169023,
    sourceName: "DENNY'S, coleslaw",
    sourceFat: 15.0,
    values: { omega3: 1.103, omega6: 7.285, trans: 0.046, ala: 1.1, epa: 0, dha: 0.003 },
  },
  {
    index: 432,
    food: 'Hamburger (Takeaway)',
    targetFat: 8.3,
    sourceId: 170323,
    sourceName: "WENDY'S, Jr. Hamburger, without cheese",
    sourceFat: 8.75,
    values: { omega3: 0.123, omega6: 0.955, trans: 0.269, ala: 0.103, epa: 0, dha: 0 },
  },
  {
    index: 471,
    food: 'Pommes frites (Fast Food)',
    targetFat: 14.2,
    sourceId: 170726,
    sourceName: "WENDY'S, french fries",
    sourceFat: 14.1,
    values: { omega3: 0.641, omega6: 6.754, trans: 0.062, ala: 0.639, epa: 0.001, dha: 0 },
  },
];

if (!Array.isArray(db) || db.length !== 1516) throw new Error('Unexpected database shape or row count.');
if (apply && fs.existsSync(auditPath)) throw new Error(`Audit already exists: ${auditPath}`);

const auditRecords = records.map(record => {
  const item = db[record.index - 1];
  const nutrient = item?.nutrients;
  if (item?.name !== record.food || !nutrient) throw new Error(`Unexpected database row ${record.index}.`);
  if (nutrient[keys.totalFat] !== record.targetFat || nutrient[keys.alcohol] !== 0) {
    throw new Error(`Target fat or existing alcohol value changed for ${record.food}.`);
  }
  const values = Object.fromEntries(Object.entries(record.values).map(([name, value]) => [keys[name], value]));
  const prior = Object.fromEntries(Object.keys(values).map(key => [key, nutrient[key] ?? null]));
  if (Object.values(prior).some(value => value !== null)) throw new Error(`Refusing to overwrite existing values for ${record.food}.`);
  const componentSum = record.values.ala + record.values.epa + record.values.dha;
  if (componentSum > record.values.omega3 + 1e-9) throw new Error(`Omega-3 components exceed total for ${record.food}.`);
  if (Object.values(record.values).some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid value for ${record.food}.`);
  const fatDifferencePct = Math.round(Math.abs(record.sourceFat - record.targetFat) / record.targetFat * 1000) / 10;
  if (fatDifferencePct > 10) throw new Error(`USDA comparator exceeds 10% fat difference for ${record.food}.`);
  return {
    databaseIndex: record.index,
    food: record.food,
    targetFat_g_per_100g: record.targetFat,
    sourceName: record.sourceName,
    sourceId: record.sourceId,
    sourceFat_g_per_100g: record.sourceFat,
    fatDifferencePct,
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${record.sourceId}/nutrients?type=SR%20Legacy`,
    valuesPer100g: values,
    priorValues: prior,
    componentsDoNotExceedOmega3: true,
    alcoholRetained_g_per_100g: nutrient[keys.alcohol],
    confidence: 'medium: USDA prepared-food comparator with under 10% total-fat difference; published values copied without scaling',
  };
});

if (apply) {
  for (const record of records) {
    const nutrient = db[record.index - 1].nutrients;
    for (const [name, value] of Object.entries(record.values)) nutrient[keys[name]] = value;
  }
  const audit = {
    checkedOn: '2026-09-25',
    sourceDataset: 'USDA FoodData Central, SR Legacy, April 2018',
    sourceDatasetUrl: 'https://fdc.nal.usda.gov/download-datasets/',
    sourceBasis: 'Per 100 g edible portion. Comparator values transferred without scaling.',
    method: 'Only close prepared-food profiles with target total-fat difference at or below 10% were accepted. Source identity and target fat are preserved per record; existing alcohol values were not changed.',
    records: auditRecords,
    validation: { rowCountUnchanged: true, nonnegativeValues: true, componentSumWithinTotalOmega3: true, sourceFatDifferenceAtMostPct: 10 },
  };
  fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', records: auditRecords, auditPath: apply ? auditPath : null }, null, 2));
