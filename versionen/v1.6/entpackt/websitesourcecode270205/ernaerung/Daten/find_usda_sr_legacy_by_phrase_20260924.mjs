import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(file, 'utf8'));
const queries = process.argv.slice(2).map(value => value.toLowerCase().trim()).filter(Boolean);
const amount = (food, id) => food.foodNutrients.find(row => String(row.nutrient.number) === String(id))?.amount ?? null;
const named = (food, pattern) => food.foodNutrients.find(row => pattern.test(row.nutrient.name))?.amount ?? null;
const norm = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const out = queries.map(query => {
  const terms = query.split(/\s+/).filter(Boolean);
  const hits = SRLegacyFoods.filter(food => {
    const text = norm(food.description);
    return terms.every(term => text.includes(norm(term)));
  }).slice(0, 30).map(food => ({
    fdcId: food.fdcId,
    description: food.description,
    fat: amount(food, 204),
    totalPUFA: amount(food, 646),
    ALA: named(food, /18:3.*n-3.*ALA/i) ?? named(food, /18:3.*n-3/i) ?? named(food, /^PUFA 18:3$/i),
    EPA: named(food, /20:5.*EPA/i),
    DHA: named(food, /22:6.*DHA/i),
    trans: amount(food, 605),
    alcohol: amount(food, 221),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients?type=SR%20Legacy`,
  }));
  return { query, count: hits.length, hits };
});
console.log(JSON.stringify(out, null, 2));
