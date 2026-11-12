import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_web_profile_supplement_block_005_part2_20260925.json';
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
    index: 416, name: 'Ente gebraten nur Fleisch', targetFat: 10.4,
    sourceName: 'Duck, without skin, roasted', sourceFat: 6.8,
    sourceUrl: 'https://www.matvaretabellen.no/en/duck-without-skin-roasted/',
    confidence: 'medium', values: { trans: 0.1 },
    note: 'Same species, no-skin edible part and roasting method; source fat is lower by about 35%, so only the reported trans value is transferred without scaling.',
  },
  {
    index: 455, name: 'Lasagne (Handelsware aufgewärmt)', targetFat: 6.1,
    sourceName: 'Lasagne, with minced meat, frozen, industrially made', sourceFat: 5.4,
    sourceUrl: 'https://www.matvaretabellen.no/en/lasagne-with-minced-meat-frozen-industrially-made/',
    confidence: 'medium-high', values: { omega3: 0.1, omega6: 0.3, trans: 0.4, ala: 0, epa: 0, dha: 0 },
    note: 'Closest industrial lasagne profile; source fat differs by about 11.5%. Values copied without scaling. Omega-3 total is the source sum; ALA/EPA/DHA are source values at displayed precision.',
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
  method: 'Close per-100g prepared-food profiles; values copied without scaling, existing non-null values left unchanged.',
  profiles: auditProfiles,
  validation: { rowCountUnchanged: db.length, nonnegative: true, noOverwrites: true, omega3ComponentsWithinTotal: true, alcoholUnchanged: true },
};
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', records: auditProfiles.length, filledValues: filled }, null, 2));
if (apply) {
  const json = JSON.stringify(db, null, 4) + '\n';
  fs.writeFileSync(dbPath, eol === '\r\n' ? json.replace(/\n/g, '\r\n') : json, 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}
