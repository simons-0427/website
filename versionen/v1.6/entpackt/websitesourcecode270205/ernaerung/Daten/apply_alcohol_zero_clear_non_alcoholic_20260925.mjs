import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(here, 'database_alcohol_zero_clear_non_alcoholic_20260925.json');
const apply = process.argv.includes('--apply');
const alcoholKey = 'Alcohol (g)';

// These entries are ordinary non-alcoholic foods as consumed; 0 is the
// practical nutrition-table value where ethanol is not an ingredient.
const expected = [
  [503, 'Vanilleeis (Milchspeiseeis)'],
  [504, 'Veggie-Burger gegrillt (Handelsware)'],
  [505, 'Vollkornreis gekocht'],
  [507, 'Waffeln (Hausgemacht)'],
  [508, 'Weizenkekse-Frühstückscereal (Weetabix-Typ fortifiziert)'],
  [511, 'Whopper (Takeaway)'],
  [512, 'Wurst im Blätterteig (Handelsware)'],
  [535, 'Tortillachips / Nachos'],
  [552, 'Sojajoghurtalternative, ungesüßt'],
  [556, 'Sojadrink, ungesüßt'],
  [588, 'Weintrauben, roh'],
  [589, 'Weintrauben, rot, roh'],
  [590, 'Weintrauben, weiß, roh'],
  [611, 'Papaya, getrocknet'],
  [628, 'Mangosaft, 100%'],
  [687, 'Nori-Blatt, geröstet'],
  [709, 'Sahneersatz (Mischung aus pflanzlichen Fetten und Milch)'],
  [740, 'Sauerrahm/Creme fraiche, 30 % Fett'],
  [798, 'Kasseler, Rohpökelware, geräuchert'],
  [1335, 'Aprikosensaft'],
  [1374, 'Kiwisaft'],
  [1500, 'Weizentortilla'],
];

const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
if (db.length !== 1516) throw new Error(`Expected 1516 records, got ${db.length}`);

const changes = [];
for (const [number, name] of expected) {
  const record = db[number - 1];
  if (!record || record.name !== name) throw new Error(`Food identity mismatch at ${number}`);
  const oldValue = record.nutrients?.[alcoholKey];
  if (oldValue !== null && oldValue !== undefined && oldValue !== '') {
    throw new Error(`Refusing to overwrite ${number} ${name}: ${oldValue}`);
  }
  changes.push({ number, name, oldValue: oldValue ?? null, value: 0 });
  if (apply) record.nutrients[alcoholKey] = 0;
}

const audit = {
  date: '2026-09-25',
  method: 'Grouped composition check; zero for ordinary foods with no alcohol ingredient or alcoholic preparation, using nutrition-table zero at practical reporting precision.',
  scope: 'Alcohol (g) only. No fatty-acid values changed.',
  source: 'Food identity and preparation in database.json; explicit alcohol-containing drinks were not included.',
  count: changes.length,
  changes,
  applied: apply,
};

console.log(JSON.stringify({ applied: apply, count: changes.length, foods: changes.map(x => `${x.number}: ${x.name}`) }, null, 2));
if (apply) {
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(root, dbPath)} and ${path.relative(root, auditPath)}`);
}
