import fs from 'node:fs';
import path from 'node:path';

const database = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync('Daten/database_V2_fatty_acids_alcohol_batch_005_sources.json', 'utf8'));
const usdaPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const source = JSON.parse(fs.readFileSync(usdaPath, 'utf8'));
const byDescription = new Map(source.SRLegacyFoods.map(food => [food.description, food]));
const nutrientNames = new Set([
  'Total lipid (fat)', 'Fatty acids, total polyunsaturated', 'Fatty acids, total trans', 'Alcohol, ethyl',
  'PUFA 18:2 n-6 c,c', 'PUFA 18:3 n-3 c,c,c (ALA)', 'PUFA 18:3 n-3', 'PUFA 18:3',
  'PUFA 20:2 n-6 c,c', 'PUFA 20:3 n-6', 'PUFA 20:4 n-6', 'PUFA 22:4', 'PUFA 22:5 n-6',
  'PUFA 18:3 n-6 c,c,c', 'PUFA 18:4', 'PUFA 20:3 n-3', 'PUFA 20:4 n-3', 'PUFA 18:4 n-3',
  'PUFA 20:5 n-3 (EPA)', 'PUFA 22:5 n-3 (DPA)', 'PUFA 22:6 n-3 (DHA)',
]);
const output = [];
for (const record of sourceAudit.records.filter(Boolean)) {
  if (record.source !== 'USDA_FoodData_Central_SR_Legacy_2018' || !record.sourceName) continue;
  const food = byDescription.get(record.sourceName);
  if (!food) {
    output.push({ databaseIndex: record.databaseIndex, databaseName: record.databaseName, sourceName: record.sourceName, notFound: true });
    continue;
  }
  const values = {};
  for (const item of food.foodNutrients) {
    if (nutrientNames.has(item.nutrient.name) && item.amount != null) values[item.nutrient.name] = item.amount;
  }
  output.push({ databaseIndex: record.databaseIndex, databaseName: record.databaseName, fdcId: food.fdcId, sourceName: food.description, values });
}
console.log(JSON.stringify(output, null, 2));
