import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(here, 'database_V2_cofid_exact_and_estimated_batch005_20260925.json');
const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
if (!Array.isArray(db) || db.length !== 1516) throw new Error(`Expected 1516 foods, got ${db.length}`);
try { await fs.access(auditPath); throw new Error(`Audit already exists: ${auditPath}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const keys = {
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const profiles = [
  {
    index: 492,
    name: 'Softeis im Hörnchen (non-dairy Vanille)',
    fat: 7.5,
    values: { [keys.omega3]: 0.02, [keys.omega6]: 0.44, [keys.trans]: 0.04, [keys.ala]: 0.02, [keys.epa]: 0, [keys.dha]: 0 },
    exact: { [keys.trans]: 0.04 },
    source: {
      dataset: 'CoFID 2021', code: '12-581', url: 'https://www.nutridex.org.uk/foods/407qh7h/ice-cream-with-cone-non-dairy-vanilla',
      exactTotalPufa_g_per_100g: 0.46,
      method: 'Exact total PUFA and trans-fat from CoFID. Omega split is a low-detail estimate: 0.02 g n-3/ALA and 0.44 g n-6, summing to the measured 0.46 g PUFA. EPA/DHA are set to zero because the generic non-dairy vanilla food has no named fish, seafood, or algal ingredient; this assumes no fortification.',
      confidence: 'medium for total PUFA/trans; low for the estimated split and EPA/DHA exclusion',
    },
  },
  {
    index: 500,
    name: 'Tomatensuppe (Kühlregal)',
    fat: 1.9,
    values: { [keys.omega3]: 0.03, [keys.omega6]: 0.10, [keys.trans]: 0.07, [keys.ala]: 0.03 },
    exact: { [keys.omega3]: 0.03, [keys.omega6]: 0.10, [keys.trans]: 0.07, [keys.ala]: 0.03 },
    replacements: {
      [keys.omega3]: { prior: 0.11, value: 0.03 },
      [keys.omega6]: { prior: 0.75, value: 0.10 },
      [keys.ala]: { prior: 0.11, value: 0.03 },
    },
    source: {
      dataset: 'CoFID 2021', code: '17-636', url: 'https://www.nutridex.org.uk/foods/34fxr2c/soup-tomato-carton-chilled',
      exactTotalPufa_g_per_100g: 0.14,
      method: 'Exact matching chilled tomato soup with equal total fat. Replaces the earlier higher-fat tomato-bisque comparator values; CoFID omega-3 + omega-6 sum to 0.13 g, within 0.01 g of total PUFA due to rounding.',
      confidence: 'high',
    },
  },
];

const records = [];
for (const profile of profiles) {
  const food = db[profile.index - 1];
  if (food?.name !== profile.name) throw new Error(`Food identity mismatch at ${profile.index}: ${food?.name}`);
  if (food.nutrients['Total Fat (g)'] !== profile.fat) throw new Error(`Total-fat mismatch at ${profile.index}`);
  const priorValues = {};
  for (const [key, value] of Object.entries(profile.values)) {
    const current = food.nutrients[key] ?? null;
    const replacement = profile.replacements?.[key];
    if (replacement) {
      if (current !== replacement.prior) throw new Error(`Unexpected value at ${profile.index} ${key}: ${current}`);
      priorValues[key] = current;
    } else if (current !== null) {
      throw new Error(`Refusing to overwrite ${profile.index} ${key}: ${current}`);
    }
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid value at ${profile.index} ${key}`);
  }
  for (const [key, value] of Object.entries(profile.values)) food.nutrients[key] = value;
  records.push({
    databaseIndex: profile.index,
    food: profile.name,
    targetFat_g_per_100g: profile.fat,
    source: profile.source,
    valuesPer100g: profile.values,
    exactFields: Object.keys(profile.exact),
    estimatedFields: Object.keys(profile.values).filter(key => !profile.exact[key] && !Object.values(profile.replacements ?? {}).some(item => item.value === profile.values[key] && key in profile.replacements)),
    priorValues,
  });
}

const componentViolations = records.filter(record => {
  const n = db[record.databaseIndex - 1].nutrients;
  return n[keys.ala] + n[keys.epa] + n[keys.dha] > n[keys.omega3] + 0.02;
});
if (componentViolations.length) throw new Error(`Omega-3 component check failed: ${componentViolations.map(row => row.databaseIndex).join(', ')}`);

await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
const audit = {
  checkedOn: '2026-09-25',
  scope: { batch: '005', databaseIndices: [401, 500], unit: 'g per 100 g food' },
  method: 'Prefer an exact matching CoFID entry. Where only total PUFA is published, split into estimated fatty acids and label the estimate. Preserve no prior values except the three documented tomato-soup replacements.',
  records,
  validation: { rowCountUnchanged: db.length === 1516, nonnegative: true, replacementValuesVerifiedBeforeWrite: true, omega3ComponentsWithinTotal: true },
};
await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ changedFoods: records.length, changedFields: records.reduce((sum, row) => sum + Object.keys(row.valuesPer100g).length, 0), auditPath }, null, 2));
