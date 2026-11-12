import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(file, 'utf8'));
const ids = new Set(process.argv.slice(2).map(Number).filter(Number.isFinite));
const number = (food, nutrientId) => food.foodNutrients.find(row => String(row.nutrient.number) === String(nutrientId))?.amount ?? null;
const n3Name = name => /n-3/.test(name) || /^PUFA 18:4\b/.test(name);
const n6Name = name => /n-6/.test(name);
const chain = name => name.match(/\b(\d{2}:\d)\b/)?.[1] ?? name;
const bestByFamily = (rows, predicate) => {
  const chosen = new Map();
  for (const row of rows) {
    if (!predicate(row.nutrient.name) || row.amount == null) continue;
    const key = chain(row.nutrient.name);
    const old = chosen.get(key);
    const specific = row.nutrient.name.length;
    if (!old || specific > old.specific) chosen.set(key, { amount: row.amount, specific, name: row.nutrient.name });
  }
  return [...chosen.values()].reduce((sum, row) => sum + row.amount, 0);
};
const rows = SRLegacyFoods.filter(food => ids.has(food.fdcId)).map(food => {
  const n3Rows = food.foodNutrients.filter(row => /^PUFA /.test(row.nutrient.name));
  const ala = n3Rows.find(row => /18:3.*n-3.*ALA/.test(row.nutrient.name))
    ?? n3Rows.find(row => /18:3.*n-3/.test(row.nutrient.name))
    ?? n3Rows.find(row => row.nutrient.name === 'PUFA 18:3');
  return {
    fdcId: food.fdcId,
    description: food.description,
    sourceFat: number(food, 204),
    totalPUFA: number(food, 646),
    identifiedOmega3: bestByFamily(n3Rows, n3Name),
    identifiedOmega6: bestByFamily(n3Rows, n6Name),
    ALA: ala?.amount ?? null,
    EPA: n3Rows.find(row => /20:5.*EPA/.test(row.nutrient.name))?.amount ?? null,
    DHA: n3Rows.find(row => /22:6.*DHA/.test(row.nutrient.name))?.amount ?? null,
    trans: number(food, 605),
    alcohol: number(food, 221),
    components: n3Rows.filter(row => row.amount != null).map(row => ({ name: row.nutrient.name, amount: row.amount })),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients?type=SR%20Legacy`,
  };
});
console.log(JSON.stringify(rows, null, 2));
