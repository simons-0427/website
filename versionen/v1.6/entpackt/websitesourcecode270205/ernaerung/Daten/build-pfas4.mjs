// Rebuild PFAS-4 estimates and the file:// database mirror from database.json.
// Run from ernaehrung: node Daten/build-pfas4.mjs --write
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const PFAS4 = require(path.join(root, 'pfas4-estimates.js'));
const dbPath = path.join(root, 'database.json');
const foods = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
if (!Array.isArray(foods) || foods.length < 1500) throw new Error('Unexpected database size');
const groups = new Map();
for (const food of foods) {
  if (!food || typeof food.name !== 'string' || !food.nutrients || !food.unit) {
    throw new Error('Invalid food row');
  }
  const group = PFAS4.category(food);
  groups.set(group, (groups.get(group) || 0) + 1);
  if (process.argv.includes('--refresh-estimates')) {
    for (const key of PFAS4.KEYS) delete food.nutrients[key];
  }
  PFAS4.sync(food.nutrients, food);
  const values = [...PFAS4.KEYS, PFAS4.SUM].map(key => food.nutrients[key]);
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid PFAS-4: ${food.name}`);
  const sum = values.slice(0, 4).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - values[4]) > 0.00001) throw new Error(`PFAS-4 mismatch: ${food.name}`);
}
console.log(`Validated ${foods.length} foods and ${groups.size} estimation groups`);
console.log(Object.fromEntries([...groups].sort((a, b) => a[0].localeCompare(b[0]))));
if (process.argv.includes('--write')) {
  const json = JSON.stringify(foods, null, 2) + '\n';
  fs.writeFileSync(dbPath, json, 'utf8');
  fs.writeFileSync(path.join(root, 'database.js'),
    '// Auto-generated from database.json - do not edit by hand.\nwindow.FOOD_DATABASE = ' + json.trimEnd() + ';\n', 'utf8');
  console.log('Updated database.json and database.js');
}
