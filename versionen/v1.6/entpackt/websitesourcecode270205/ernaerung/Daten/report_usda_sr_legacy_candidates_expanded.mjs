import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const foods = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).SRLegacyFoods ?? [];
const db = JSON.parse(fs.readFileSync(path.resolve('database.json'), 'utf8'));
const first = Number(process.argv[2] ?? 1);
const last = Number(process.argv[3] ?? 100);
const excluded = new Set(['and', 'or', 'the', 'of', 'with', 'without', 'all', 'commercial', 'variety', 'varieties', 'type', 'types', 'fresh', 'raw', 'dry', 'dried', 'uncooked', 'cooked', 'boiled', 'baked', 'grilled', 'steamed', 'roasted', 'frozen', 'canned', 'drained', 'flesh', 'skin', 'only', 'mature', 'seed', 'seeds', 'plain', 'unsalted', 'salted', 'added', 'ascorbic', 'acid', 'prepared', 'unprepared', 'solids', 'liquids', 'regular', 'pack']);
const normToken = word => {
  let value = word.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%]+/g, '');
  if (value.length > 4 && value.endsWith('s')) value = value.slice(0, -1);
  return value;
};
const tokens = text => new Set((text ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%]+/g, ' ').split(/\s+/).map(normToken).filter(word => word && !excluded.has(word)));
const dice = (left, right) => {
  const overlap = [...left].filter(word => right.has(word)).length;
  return left.size + right.size ? 2 * overlap / (left.size + right.size) : 0;
};
const nutrientsOf = food => (food.foodNutrients ?? [])
  .filter(row => new Set(['221', '605', '618', '619', '620', '621', '627', '629', '631', '646', '672', '675', '685', '689', '851', '852']).has(String(row.nutrient?.number)))
  .map(row => ({ number: String(row.nutrient.number), amount: row.amount, name: row.nutrient.name }));
const states = ['raw', 'dry', 'dried', 'fresh', 'frozen', 'canned', 'drained', 'roasted', 'unsalted', 'sweetened', 'unsweetened'];
const rows = [];
for (let index = first; index <= Math.min(last, db.length); index++) {
  const item = db[index - 1];
  const missing = Object.entries(item.nutrients ?? {}).filter(([key, value]) => /^(Omega-3 Fatty Acids|Omega-6 Fatty Acids|Trans Fat|Alcohol) \(g\)$/.test(key) && value == null).map(([key]) => key);
  if (!missing.length) continue;
  const query = tokens(item.name_en || item.name);
  const expectedStates = states.filter(state => new RegExp(`\\b${state}\\b`, 'i').test(item.name_en || item.name));
  const candidates = foods.map(food => {
    const description = food.description ?? '';
    const source = tokens(description);
    let score = dice(query, source);
    for (const state of expectedStates) if (new RegExp(`\\b${state}\\b`, 'i').test(description)) score += 0.06;
    return { fdcId: food.fdcId, description, score: Number(Math.min(score, 1).toFixed(2)), nutrients: nutrientsOf(food) };
  }).filter(candidate => candidate.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, 5);
  rows.push({ databaseIndex: index, name: item.name, name_en: item.name_en, unit: item.unit, missing, candidates });
}
console.log(JSON.stringify({ source: 'USDA FoodData Central SR Legacy 2018', first, last, rows }, null, 2));
