import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const databasePath = path.join(root, 'database.json');
const foods = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const excluded = /wurst|mariniert|gepökelt|pök|speck|schinken|bacon|brät|leberkäse|frikadelle|paniert/i;
let changed = 0;
for (const food of foods) {
  if (food.category !== 'fleisch' || !/roh|raw/i.test(food.name) || excluded.test(food.name)) continue;
  if (food.tags?.includes('whole_food')) continue;
  food.tags ??= [];
  food.tags.push('whole_food');
  changed++;
}
if (changed !== 134) throw new Error(`Expected 134 unprocessed raw-meat records, found ${changed}`);
const json = JSON.stringify(foods, null, 2) + '\n';
fs.writeFileSync(databasePath, json);
fs.writeFileSync(path.join(root, 'database.js'), '// Auto-generated from database.json - do not edit by hand.\nwindow.FOOD_DATABASE = ' + json.trimEnd() + ';\n');
console.log(`Marked ${changed} unprocessed raw-meat records as whole_food.`);
