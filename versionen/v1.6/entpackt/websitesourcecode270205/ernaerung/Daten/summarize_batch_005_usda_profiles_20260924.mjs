import fs from 'node:fs';
import path from 'node:path';

const database = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync('Daten/database_V2_fatty_acids_alcohol_batch_005_sources.json', 'utf8'));
const filePath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const foods = new Map(data.SRLegacyFoods.map(food => [food.description, food]));
const amount = (food, number) => food.foodNutrients.find(row => String(row.nutrient.number) === String(number))?.amount ?? null;
const out = [];

for (const match of sourceAudit.records.filter(Boolean)) {
  if (match.source !== 'USDA_FoodData_Central_SR_Legacy_2018' || !match.sourceName) continue;
  const food = foods.get(match.sourceName);
  if (!food) {
    out.push({ index: match.databaseIndex, name: match.databaseName, notFound: match.sourceName });
    continue;
  }
  const rows = food.foodNutrients.filter(row => /^PUFA /.test(row.nutrient.name));
  const byName = Object.fromEntries(rows.map(row => [row.nutrient.name, row.amount]));
  const n3 = rows.filter(row => /n-3|PUFA 18:4/.test(row.nutrient.name)).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const n6 = rows.filter(row => /n-6|PUFA 18:2$|PUFA 20:4$|PUFA 22:4$/.test(row.nutrient.name)).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const ala = byName['PUFA 18:3 n-3 c,c,c (ALA)'] ?? byName['PUFA 18:3'] ?? null;
  const epa = byName['PUFA 20:5 n-3 (EPA)'] ?? null;
  const dha = byName['PUFA 22:6 n-3 (DHA)'] ?? null;
  out.push({
    index: match.databaseIndex,
    name: match.databaseName,
    source: food.description,
    fdcId: food.fdcId,
    databaseFat: database[match.databaseIndex - 1].nutrients['Total Fat (g)'],
    sourceFat: amount(food, 204),
    sourceOmega3Identified: n3,
    sourceOmega6Identified: n6,
    sourceTotalPUFA: amount(food, 646),
    sourceALA: ala,
    sourceEPA: epa,
    sourceDHA: dha,
    trans: amount(food, 605),
    alcohol: amount(food, 221),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients?type=SR%20Legacy`,
  });
}
console.log(JSON.stringify(out, null, 2));
