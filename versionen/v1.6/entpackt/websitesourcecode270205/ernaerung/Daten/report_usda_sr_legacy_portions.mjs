import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const foods = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).SRLegacyFoods ?? [];
const requested = process.argv.slice(2).map(value => value.toLowerCase());
const selected = foods.filter(food => requested.some(query => food.description?.toLowerCase() === query));
console.log(JSON.stringify(selected.map(food => ({
  fdcId: food.fdcId,
  description: food.description,
  portions: (food.foodPortions ?? []).map(portion => ({
    portionDescription: portion.portionDescription,
    modifier: portion.modifier,
    amount: portion.amount,
    gramWeight: portion.gramWeight,
    measureUnit: portion.measureUnit,
  })),
})), null, 2));
