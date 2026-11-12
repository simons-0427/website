import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve('.');
const json = JSON.parse(fs.readFileSync(path.join(root, 'database.json'), 'utf8'));
const jsText = fs.readFileSync(path.join(root, 'database.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(jsText, context);
const generated = context.window.FOOD_DATABASE;
if (!Array.isArray(generated)) throw new Error('database.js did not assign window.FOOD_DATABASE');
const same = JSON.stringify(json) === JSON.stringify(generated);
const firstMismatch = same ? null : json.findIndex((record, index) => JSON.stringify(record) !== JSON.stringify(generated[index]));
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const coverage = Object.fromEntries(fields.map(field => [field, {
  json: json.filter(item => item.nutrients?.[field] != null).length,
  generated: generated.filter(item => item.nutrients?.[field] != null).length,
}]));
console.log(JSON.stringify({ same, jsonRecords: json.length, generatedRecords: generated.length, firstMismatch, coverage }, null, 2));
if (!same) process.exitCode = 1;
