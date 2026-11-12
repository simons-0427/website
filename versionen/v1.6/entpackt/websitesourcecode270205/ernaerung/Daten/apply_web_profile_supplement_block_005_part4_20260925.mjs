import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_web_profile_supplement_block_005_part4_20260925.json';
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
    index: 469, name: 'Pizza mit Hähnchen (Handelsware)', targetFat: 8.3,
    sourceName: 'Pizza, industrially made', sourceFat: 8.5,
    sourceUrl: 'https://www.matvaretabellen.no/en/pizza-industrially-made/',
    confidence: 'medium-high', values: { omega3: 0.3, omega6: 0.9, trans: 0, ala: 0.3, epa: 0, dha: 0 },
    note: 'Prepared industrial pizza profile with nearly identical total fat; no scaling. Generic pizza includes meat, so this is a close profile rather than chicken-specific analysis.',
  },
  {
    index: 470, name: 'Pizza vegetarisch (Retail/Takeaway)', targetFat: 6.9,
    sourceName: 'Pizza, vegetarian, home-made', sourceFat: 6.3,
    sourceUrl: 'https://www.matvaretabellen.no/en/pizza-vegetarian-home-made/',
    confidence: 'medium-high', values: { omega3: 0.1, omega6: 0.4, trans: 0.1, ala: 0.1, epa: 0, dha: 0 },
    note: 'Same vegetarian pizza type and close total fat; prepared at home in the reference, retail/takeaway in the database. Values copied without scaling.',
  },
  {
    index: 472, name: 'Pommes frites (Fish-and-Chips-Laden)', targetFat: 8.4,
    sourceName: 'French fries, fast food restaurant', sourceFat: 16.2,
    sourceUrl: 'https://www.matvaretabellen.no/en/french-fries-fast-food-restaurant/',
    confidence: 'medium-low', values: { trans: 0 },
    note: 'Same restaurant-fried potato category. Source fat differs substantially, so only the directly reported trans-fat zero is transferred; omega profile is withheld.',
  },
  {
    index: 475, name: 'Quiche Käse-Ei (vegetarisch)', targetFat: 22.3,
    sourceName: 'Quiche, with cheese and ham', sourceFat: 15.4,
    sourceUrl: 'https://www.matvaretabellen.no/en/quiche-with-cheese-and-ham/',
    confidence: 'medium-low', values: { omega3: 0.4, omega6: 1.3, trans: 0.2, ala: 0.3, epa: 0, dha: 0 },
    note: 'Closest cheese-and-egg quiche profile found; reference contains ham and has lower total fat. Values copied without scaling and are approximate.',
  },
  {
    index: 493, name: 'Soja-Bohnenburger gebraten', targetFat: 10.7,
    sourceName: 'Burger, vegetarian, with beans, fried in fat', sourceFat: 10.9,
    sourceUrl: 'https://www.matvaretabellen.no/en/burger-vegetarian-with-beans-fried-in-fat/',
    confidence: 'medium-high', values: { omega3: 0.5, omega6: 1.8, trans: 0, ala: 0.4, epa: 0, dha: 0 },
    note: 'Closest fried bean-burger profile with near-identical total fat; generic bean recipe is not soy-specific. Values copied without scaling.',
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
  method: 'Closest prepared-food profiles, copied without scaling; wide-fat-mismatch cases receive only fields supported by the match. Existing non-null values left unchanged.',
  profiles: auditProfiles,
  validation: { rowCountUnchanged: db.length, nonnegative: true, noOverwrites: true, omega3ComponentsWithinTotal: true, alcoholUnchanged: true },
};
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', records: auditProfiles.length, filledValues: filled }, null, 2));
if (apply) {
  const json = JSON.stringify(db, null, 4) + '\n';
  fs.writeFileSync(dbPath, eol === '\r\n' ? json.replace(/\n/g, '\r\n') : json, 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}
