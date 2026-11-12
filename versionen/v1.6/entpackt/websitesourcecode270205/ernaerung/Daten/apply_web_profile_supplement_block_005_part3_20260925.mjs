import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_web_profile_supplement_block_005_part3_20260925.json';
const apply = process.argv.includes('--apply');
const original = fs.readFileSync(dbPath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const db = JSON.parse(original);
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
    index: 413, name: 'Döner Kebab im Fladenbrot mit Salat', targetFat: 16,
    sourceName: 'Pita with kebab, salad and dressing', sourceFat: 9.6,
    sourceUrl: 'https://www.matvaretabellen.no/en/pita-with-kebab-salad-and-dressing/',
    confidence: 'medium', values: { omega3: 0.3, omega6: 1.6, trans: 0.1, ala: 0.3, epa: 0, dha: 0 },
    note: 'Closest prepared pita-kebab profile with salad; source fat is lower than target, so values are copied without scaling and treated as approximate.',
  },
  {
    index: 414, name: 'Dönerfleisch (ohne Brot)', targetFat: 31.4,
    sourceName: 'Kebab meat, prepared, restaurant', sourceFat: 22.9,
    sourceUrl: 'https://www.matvaretabellen.no/en/kebab-meat-prepared-restaurant/',
    confidence: 'medium', values: { omega3: 0.1, omega6: 0.9, trans: 0.9, ala: 0.1, epa: 0, dha: 0 },
    note: 'Same prepared restaurant kebab-meat category; source fat is lower than target, so values are copied without scaling and treated as approximate.',
  },
];

if (!Array.isArray(db) || db.length !== 1516) throw new Error('Unexpected database shape or row count.');
if (apply && fs.existsSync(auditPath)) throw new Error('Audit already exists: ' + auditPath);
const alcoholBefore = db.map(item => item.nutrients[keys.alcohol]);
let filled = 0;
const auditProfiles = [];
for (const profile of profiles) {
  const item = db[profile.index - 1];
  const n = item?.nutrients;
  if (item?.name !== profile.name || n?.[keys.fat] !== profile.targetFat) throw new Error('Row identity/fat mismatch at ' + profile.index);
  const values = Object.fromEntries(Object.entries(profile.values).map(([field, value]) => [keys[field], value]));
  const prior = {};
  for (const [key, value] of Object.entries(values)) {
    prior[key] = n[key] ?? null;
    if (prior[key] !== null) throw new Error('Refusing to overwrite ' + key + ' at row ' + profile.index);
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid value at row ' + profile.index);
    n[key] = value;
    filled++;
  }
  const components = [n[keys.ala], n[keys.epa], n[keys.dha]];
  if (components.every(Number.isFinite) && Number.isFinite(n[keys.omega3]) && components.reduce((s, v) => s + v, 0) > n[keys.omega3] + 0.001) {
    throw new Error('Omega-3 component sum exceeds total at row ' + profile.index);
  }
  if (!Number.isFinite(n[keys.alcohol])) throw new Error('Existing alcohol missing at row ' + profile.index);
  auditProfiles.push({ ...profile, valuesPer100g: values, priorValues: prior, alcoholRetained_g_per_100g: n[keys.alcohol] });
}
if (db.some((item, i) => item.nutrients[keys.alcohol] !== alcoholBefore[i])) throw new Error('Alcohol values changed.');

const audit = {
  checkedOn: '2026-09-25',
  block: { firstIndex: 401, lastIndex: 500 },
  source: 'Matvaretabellen, Norwegian Food Composition Table',
  method: 'Closest matching per-100g prepared kebab profiles; values copied without scaling, existing non-null values left unchanged.',
  profiles: auditProfiles,
  validation: { rowCountUnchanged: db.length, nonnegative: true, noOverwrites: true, omega3ComponentsWithinTotal: true, alcoholUnchanged: true },
};
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', records: auditProfiles.length, filledValues: filled }, null, 2));
if (apply) {
  const json = JSON.stringify(db, null, 4) + '\n';
  fs.writeFileSync(dbPath, eol === '\r\n' ? json.replace(/\n/g, '\r\n') : json, 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}
