import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_web_profile_supplement_block_005_20260925.json';
const apply = process.argv.includes('--apply');
const sourceText = fs.readFileSync(dbPath, 'utf8');
const eol = sourceText.includes('\r\n') ? '\r\n' : '\n';
const db = JSON.parse(sourceText);

const keys = {
  fat: 'Total Fat (g)',
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};

const profiles = [
  {
    index: 422, name: 'Fromage frais mager natur', targetFat: 0.1,
    sourceName: 'Quark, 1 % fat', sourceFat: 1.0,
    sourceUrl: 'https://www.matvaretabellen.no/en/quark-1-fat/', confidence: 'medium',
    values: { omega3: 0, omega6: 0, trans: 0, ala: 0, epa: 0, dha: 0 },
    note: 'Close low-fat fresh-cheese analogue; all six values are reported as 0 g per 100 g at source precision.',
  },
  {
    index: 429, name: 'Guacamole', targetFat: 12.7,
    sourceName: 'Guacamole', sourceFat: 15.5,
    sourceUrl: 'https://www.matvaretabellen.no/en/guacamole/', confidence: 'medium',
    values: { omega3: 0.1, omega6: 1.8, trans: 0, ala: 0.1, epa: 0, dha: 0 },
    note: 'Exact food-name recipe profile, copied without scaling; source total fat differs by about 22%.',
  },
  {
    index: 444, name: 'Kaninchen geschmort nur Fleisch', targetFat: 3.2,
    sourceName: 'Game meat, rabbit, wild, cooked, stewed', sourceFat: 3.51,
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/174348/nutrients?type=SR%20Legacy', confidence: 'medium-high',
    secondarySourceUrl: 'https://www.matvaretabellen.no/en/rabbit-raw/',
    values: { omega3: 0.14, omega6: 0.54, trans: 0, ala: 0.14, epa: 0, dha: 0 },
    note: 'USDA preparation and fat content closely match. EPA/DHA are 0; omega-3 is ALA; omega-6 is linoleic acid. Trans 0 comes from the Matvaretabellen rabbit profile.',
  },
  {
    index: 459, name: 'Müesli Swiss-Style ohne Zuckerzusatz', targetFat: 5.9,
    sourceName: 'Muesli, with fruit, Fruktmüsli', sourceFat: 5.7,
    sourceUrl: 'https://www.matvaretabellen.no/en/muesli-with-fruit-fruktmusli/', confidence: 'medium',
    values: { omega3: 0.1, omega6: 1.3, trans: 0, ala: 0.1, epa: 0, dha: 0 },
    note: 'Close total-fat muesli analogue, copied without scaling. EPA/DHA are reported as 0 g at source precision.',
  },
  {
    index: 466, name: 'Pfannkuchen süß (Vollmilch Hausgemacht)', targetFat: 9.7,
    sourceName: 'Pancakes, plain, prepared from recipe', sourceFat: 9.7,
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/175009/nutrients?type=SR%20Legacy', confidence: 'medium-high',
    secondarySourceUrl: 'https://www.matvaretabellen.no/en/pancakes-fried-in-fat/',
    values: { omega3: 0.515, omega6: 3.928, trans: 0, ala: 0.51, epa: 0, dha: 0.005 },
    note: 'USDA source matches total fat exactly. Omega-3 and omega-6 are sums of listed components; trans 0 is from the close Matvaretabellen pancake profile.',
  },
  {
    index: 484, name: 'Rinderhack extra mager geschmort', targetFat: 4.2,
    sourceName: 'Beef, ground, 97% lean meat / 3% fat, patty, cooked, broiled', sourceFat: 4.46,
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/173112/nutrients?type=SR%20Legacy', confidence: 'high',
    values: { omega3: 0.04, omega6: 0.241, trans: 0.094, ala: 0.04, epa: 0, dha: 0 },
    note: 'Close cooked lean-beef match. Omega-6 sums linoleic (0.186), arachidonic (0.043) and gamma-linolenic (0.012) acids; no scaling.',
  },
  {
    index: 453, name: 'Lammherz roh', targetFat: 6.8,
    sourceName: 'Heart, raw', sourceFat: null,
    sourceUrl: 'https://www.matvaretabellen.no/en/trans-fatty-acids/', confidence: 'medium',
    values: { trans: 0.1 },
    note: 'Matvaretabellen lists raw heart at 0.1 g trans fat per 100 g.',
  },
  {
    index: 467, name: 'Pizza Margherita (Handelsware)', targetFat: 9.8,
    sourceName: 'Pizza, mozzarella and tomatoes, industrially made', sourceFat: 12.5,
    sourceUrl: 'https://www.matvaretabellen.no/en/pizza-mozzarella-and-tomatoes-industrially-made/', confidence: 'medium',
    values: { trans: 0 },
    note: 'Closest industrial Margherita-style profile; only trans fat is transferred, without scaling.',
  },
];

if (!Array.isArray(db) || db.length !== 1516) throw new Error('Unexpected database shape or row count.');
if (apply && fs.existsSync(auditPath)) throw new Error('Audit already exists: ' + auditPath);

const originalAlcohol = db.map(item => item.nutrients[keys.alcohol]);
const schemaKeysAdded = { ala: 0, epa: 0, dha: 0 };
for (const item of db) {
  for (const field of ['ala', 'epa', 'dha']) {
    if (!Object.hasOwn(item.nutrients, keys[field])) {
      item.nutrients[keys[field]] = null;
      schemaKeysAdded[field]++;
    }
  }
}

let filledValues = 0;
const auditRecords = [];
for (const profile of profiles) {
  const item = db[profile.index - 1];
  const n = item?.nutrients;
  if (item?.name !== profile.name || !n) throw new Error('Unexpected row ' + profile.index);
  if (n[keys.fat] !== profile.targetFat) throw new Error('Fat mismatch at row ' + profile.index);
  if (!Number.isFinite(n[keys.alcohol])) throw new Error('Existing alcohol value missing at row ' + profile.index);

  const before = {};
  const valuesByKey = Object.fromEntries(Object.entries(profile.values).map(([field, value]) => [keys[field], value]));
  for (const key of Object.keys(valuesByKey)) {
    before[key] = n[key] ?? null;
    if (before[key] !== null) throw new Error('Refusing to overwrite ' + key + ' at row ' + profile.index);
  }
  for (const [key, value] of Object.entries(valuesByKey)) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid value ' + key + ' at row ' + profile.index);
    n[key] = value;
    filledValues++;
  }
  const components = [n[keys.ala], n[keys.epa], n[keys.dha]];
  if (components.every(Number.isFinite) && Number.isFinite(n[keys.omega3]) && components.reduce((sum, value) => sum + value, 0) > n[keys.omega3] + 0.001) {
    throw new Error('ALA + EPA + DHA exceed total omega-3 at row ' + profile.index);
  }
  auditRecords.push({ ...profile, valuesPer100g: valuesByKey, priorValues: before, alcoholRetained_g_per_100g: n[keys.alcohol] });
}

for (let i = 0; i < db.length; i++) {
  if (db[i].nutrients[keys.alcohol] !== originalAlcohol[i]) throw new Error('Alcohol changed at row ' + (i + 1));
  for (const field of Object.keys(keys)) {
    if (['fat', 'alcohol'].includes(field)) continue;
    const value = db[i].nutrients[keys[field]];
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('Invalid nutrient at row ' + (i + 1));
  }
}

const audit = {
  checkedOn: '2026-09-25',
  block: { firstIndex: 401, lastIndex: 500 },
  sources: ['USDA FoodData Central SR Legacy', 'Matvaretabellen, Norwegian Food Composition Table'],
  method: 'Exact or close per-100g food profiles; copied without scaling. Existing non-null values are not overwritten. Missing ALA/EPA/DHA keys are normalized to null across the database; unknown values remain null.',
  profiles: auditRecords,
  schemaKeysAdded,
  validation: { rowCount: db.length, nonnegative: true, noExistingValuesOverwritten: true, omega3ComponentsWithinTotal: true, alcoholUnchanged: true },
};

const currentCoverage = {};
for (const [field, key] of Object.entries(keys)) {
  if (['fat', 'alcohol'].includes(field)) continue;
  currentCoverage[key] = db.slice(400, 500).filter(item => Number.isFinite(item.nutrients[key])).length;
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', block: [401, 500], profiles: profiles.length, filledValues, schemaKeysAdded, currentCoverage }, null, 2));

if (apply) {
  const json = JSON.stringify(db, null, 4) + '\n';
  fs.writeFileSync(dbPath, eol === '\r\n' ? json.replace(/\n/g, '\r\n') : json, 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}
