import fs from 'node:fs';
import path from 'node:path';

const input = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const foods = data.SRLegacyFoods ?? [];
const queries = ['Beans, adzuki', 'Agar', 'Amaranth', 'Apples, raw', 'Avocados, raw'];
const result = queries.map(query => ({
  query,
  matches: foods
    .filter(food => food.description?.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)
    .map(food => ({
      fdcId: food.fdcId,
      description: food.description,
      nutrients: (food.foodNutrients ?? [])
        .filter(item => /omega|fatty acid|alcohol/i.test(item.nutrient?.name ?? ''))
        .map(item => ({
          id: item.nutrient?.id,
          number: item.nutrient?.number,
          name: item.nutrient?.name,
          unit: item.nutrient?.unitName,
          amount: item.amount,
        })),
    })),
}));
console.log(JSON.stringify({ foodCount: foods.length, result }, null, 2));
