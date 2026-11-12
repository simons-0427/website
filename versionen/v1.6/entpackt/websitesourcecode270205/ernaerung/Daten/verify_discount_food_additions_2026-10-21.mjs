import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(here, file), 'utf8'));
const base = read('database_before_120_2026-10-21.json');
const preview = read('discount_food_additions_preview_2026-10-21.json');
const selections = read('discount_food_selections_2026-10-21.json');
const audit = read('discount_food_addition_audit_2026-10-21.json');
const actual = JSON.parse(fs.readFileSync(path.join(root, 'database.json'), 'utf8'));

assert.equal(selections.length, 120);
assert.equal(audit.baseFoodCount, base.length);
assert.equal(audit.addedCount, selections.length);
assert.equal(actual.length, base.length + selections.length);
assert.deepEqual(actual.slice(0, base.length), base, 'original foods changed');
assert.deepEqual(actual.slice(base.length), preview, 'new foods differ from reproducible import preview');
assert.equal(new Set(actual.map(food => food.name)).size, actual.length, 'duplicate food names');
const oldEnglishNames = new Set(base.map(food => food.name_en || food.name));
const newEnglishNames = preview.map(food => food.name_en || food.name);
assert.equal(new Set(newEnglishNames).size, preview.length, 'duplicate English names among additions');
assert.ok(newEnglishNames.every(name => !oldEnglishNames.has(name)), 'new English name duplicates an old food');

for (let i = 0; i < selections.length; i++) {
  const food = preview[i];
  const selection = selections[i];
  const record = audit.records[i];
  assert.equal(food.name, selection.name);
  assert.equal(record.name, food.name);
  const prices = record.price.sourceOptions.map(source => {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.rawPer100 > 0);
    return source.rawPer100;
  });
  assert.ok(prices.length > 0);
  assert.ok(Math.abs(record.price.cheapest.rawPer100 - Math.min(...prices)) < 1e-9);
  const exact = record.price.cheapest.rawPer100 * 1.1;
  assert.ok(food.price_per_100 + 1e-9 >= exact, `${food.name}: 10% margin missing`);
  assert.ok(food.price_per_100 - exact < 0.00100001, `${food.name}: price rounded too high`);
  assert.ok(food.name.includes(record.price.cheapest.retailer));
  for (const [key, value] of Object.entries(selection.nutrientOverrides || {})) {
    assert.equal(food.nutrients[key], value, `${food.name}: product label mismatch for ${key}`);
  }
}

const quality = read('database_quality_after_120_2026-10-21.json');
assert.equal(quality.recordCount, actual.length);
assert.deepEqual(quality.entries.filter(entry => entry.index > base.length && entry.issues.length), [], 'new quality issues');
console.log(`${selections.length} food additions, sources, 10% margin, label values and original database: ok`);
