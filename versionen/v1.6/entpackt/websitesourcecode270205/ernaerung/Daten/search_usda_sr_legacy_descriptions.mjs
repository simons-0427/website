import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const foods = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).SRLegacyFoods ?? [];
const queries = process.argv.slice(2).map(value => value.toLowerCase());
const numberOf = (food, number) => {
  const row = (food.foodNutrients ?? []).find(nutrient => String(nutrient.nutrient?.number) === number);
  return row?.amount ?? null;
};
const output = {};
for (const query of queries) {
  output[query] = foods.filter(food => food.description?.toLowerCase().includes(query)).slice(0, 20).map(food => ({
    fdcId: food.fdcId,
    description: food.description,
    totalFat: numberOf(food, '204'),
    transFat: numberOf(food, '605'),
    alcohol: numberOf(food, '221'),
  }));
}
console.log(JSON.stringify(output, null, 2));
