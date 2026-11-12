import fs from 'node:fs';
import path from 'node:path';

const firstIndex = 401;
const lastIndex = 500;
const field = 'Trans Fat (g)';
const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(fdcPath, 'utf8'));
const amount = (food, id) => food.foodNutrients.find(row => String(row.nutrient?.number) === String(id))?.amount ?? null;
const stop = new Set(['the','and','or','of','with','without','only','raw','fresh','frozen','canned','dried','dry','cooked','prepared','roasted','grilled','baked','boiled','fried','stewed','braised','heated','commercial','retail','takeaway','homemade','food','product','plain','ready','made','in','on','a','an','per','percent','about','fat','low','high','reduced','salt','added','regular','enriched','includes','skinless','boneless']);
const tokens = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g,'ss').match(/[a-z0-9]+/g)?.filter(word => word.length > 1 && !stop.has(word)) ?? [];
const score = (left, right) => {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter(word => b.has(word)).length;
  return Number((2 * overlap / (a.size + b.size)).toFixed(3));
};
const numericTrans = SRLegacyFoods.filter(food => Number.isFinite(amount(food, 605)));
const output = [];
for (let index = firstIndex; index <= lastIndex; index++) {
  const item = db[index - 1];
  if (item.nutrients?.[field] != null) continue;
  const candidates = numericTrans.map(food => ({
    fdcId: Number(food.fdcId),
    description: food.description,
    trans: amount(food, 605),
    totalFat: amount(food, 204),
    score: score(item.name_en || item.name, food.description),
  })).filter(candidate => candidate.score >= 0.25).sort((a, b) => b.score - a.score || a.fdcId - b.fdcId).slice(0, 5);
  output.push({ databaseIndex: index, food: item.name, nameEn: item.name_en, totalFat: item.nutrients?.['Total Fat (g)'] ?? null, candidates });
}
console.log(JSON.stringify({
  range: [firstIndex, lastIndex],
  missingTransRows: output.length,
  USDAProfilesWithNumericTrans: numericTrans.length,
  candidates: output.filter(row => row.candidates.length),
  noCandidateRows: output.filter(row => !row.candidates.length).map(row => ({ databaseIndex: row.databaseIndex, food: row.food, nameEn: row.nameEn })),
}, null, 2));
