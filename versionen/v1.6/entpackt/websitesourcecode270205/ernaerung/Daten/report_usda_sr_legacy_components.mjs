import fs from 'node:fs';
import path from 'node:path';

const input = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const foods = JSON.parse(fs.readFileSync(input, 'utf8')).SRLegacyFoods ?? [];
const queries = [
  'Beans, adzuki, mature seeds, raw',
  'Sweetener, syrup, agave',
  'Syrups, maple',
  'Amaranth grain, uncooked',
  'Pineapple, raw, all varieties',
  'Pineapple, canned, juice pack, drained',
  'Apples, raw, with skin',
  'Applesauce, canned, unsweetened, with added ascorbic acid',
  'Apple juice, canned or bottled, unsweetened, without added ascorbic acid',
  'Apricots, raw',
  'Apricots, dried, sulfured, uncooked',
  'Artichokes, canned, drained solids',
  'Arugula, raw',
  'Avocados, raw, all commercial varieties',
  'Bananas, raw',
  'Basil, fresh',
  'Lettuce, iceberg (includes crisphead types), raw',
  'Peas and carrots, canned, regular pack, solids and liquids',
  'Strawberries, raw',
  'Figs, raw',
  'Fennel, bulb, raw',
  'Onions, spring or scallions (includes tops and bulb), raw',
  'Pomegranates, raw',
  'Grapefruit, raw, pink and red and white, all areas',
];
const includeNumbers = new Set(['221', '605', '618', '619', '620', '621', '624', '627', '628', '629', '630', '631', '646', '672', '675', '685', '689', '833', '851', '852', '853', '855']);
const result = queries.map(query => {
  const food = foods.find(item => item.description?.toLowerCase() === query.toLowerCase());
  if (!food) return { query, found: false };
  return {
    query,
    found: true,
    fdcId: food.fdcId,
    nutrients: (food.foodNutrients ?? [])
      .filter(item => includeNumbers.has(String(item.nutrient?.number)))
      .map(item => ({ number: item.nutrient.number, name: item.nutrient.name, amount: item.amount })),
  };
});
console.log(JSON.stringify(result, null, 2));
