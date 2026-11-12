import fs from 'node:fs';
import path from 'node:path';

const fdcPath = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const dbPath = path.resolve('database.json');
const fdc = JSON.parse(fs.readFileSync(fdcPath, 'utf8')).SRLegacyFoods ?? [];
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const nutrientFields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const stop = new Set(['and', 'or', 'the', 'of', 'with', 'without', 'all', 'commercial', 'varieties', 'style', 'raw', 'fresh', 'dry', 'dried', 'uncooked', 'cooked', 'boiled', 'baked', 'roasted', 'grilled', 'steamed', 'flesh', 'skin', 'only', 'mature', 'seeds', 'seed', 'whole', 'plain', 'unsalted']);
const singular = token => token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token;
const words = text => new Set((text ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).map(singular).filter(x => x && !stop.has(x)));
const score = (a, b) => {
  const intersection = [...a].filter(token => b.has(token)).length;
  return a.size ? intersection / a.size : 0;
};
const nutrientsFor = food => (food.foodNutrients ?? [])
  .filter(item => /fatty acids, total trans|fatty acids, total polyunsaturated|alcohol, ethyl|linoleic|linolenic|18:|20:|22:|eicosapentaenoic|docosahexaenoic|arachidonic/i.test(item.nutrient?.name ?? ''))
  .map(item => ({
    number: item.nutrient?.number,
    name: item.nutrient?.name,
    unit: item.nutrient?.unitName,
    amount: item.amount,
  }));

const rows = db.slice(0, 100).map((food, offset) => {
  const missing = nutrientFields.filter(key => food.nutrients?.[key] == null);
  if (!missing.length) return null;
  const queryTokens = words(food.name_en || food.name);
  const candidates = fdc.map(source => ({ source, score: score(queryTokens, words(source.description)) }))
    .filter(item => item.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ source, score: matchScore }) => ({
      fdcId: source.fdcId,
      description: source.description,
      matchScore: Number(matchScore.toFixed(2)),
      nutrients: nutrientsFor(source),
    }));
  return { databaseIndex: offset + 1, name: food.name, name_en: food.name_en, unit: food.unit, missing, candidates };
}).filter(Boolean);

console.log(JSON.stringify({ source: 'USDA FoodData Central SR Legacy, April 2018', foodCount: fdc.length, batch: { first: 1, last: 100 }, itemsWithGaps: rows.length, rows }, null, 2));
