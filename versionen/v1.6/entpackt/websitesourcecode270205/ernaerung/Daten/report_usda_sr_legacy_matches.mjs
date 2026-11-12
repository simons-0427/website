import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const foods = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).SRLegacyFoods ?? [];
const db = JSON.parse(fs.readFileSync(path.resolve('database.json'), 'utf8'));
const first = Number(process.argv[2] ?? 1);
const last = Number(process.argv[3] ?? 100);
const excluded = new Set(['and', 'or', 'the', 'of', 'with', 'without', 'all', 'commercial', 'variety', 'varieties', 'type', 'types', 'fresh', 'raw', 'dry', 'dried', 'uncooked', 'cooked', 'boiled', 'baked', 'grilled', 'steamed', 'roasted', 'frozen', 'canned', 'drained', 'flesh', 'skin', 'only', 'mature', 'seed', 'seeds', 'plain', 'unsalted', 'salted', 'added', 'ascorbic', 'acid', 'prepared', 'unprepared', 'solids', 'liquids', 'regular', 'pack']);
const normToken = word => {
  let x = word.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  x = x.replace(/[^a-z0-9%]+/g, '');
  if (x.length > 4 && x.endsWith('s')) x = x.slice(0, -1);
  return x;
};
const tokens = text => new Set((text ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%]+/g, ' ').split(/\s+/).map(normToken).filter(word => word && !excluded.has(word)));
const dice = (a, b) => {
  const n = [...a].filter(word => b.has(word)).length;
  return a.size + b.size ? 2 * n / (a.size + b.size) : 0;
};
const relevant = new Set(['221', '605', '618', '619', '620', '621', '627', '629', '631', '646', '672', '675', '685', '689', '833', '851', '852', '853', '855']);
const stateWords = ['raw', 'dry', 'dried', 'fresh', 'frozen', 'canned', 'drained', 'roasted', 'unsalted', 'sweetened', 'unsweetened'];
const records = [];
for (let i = first - 1; i < Math.min(last, db.length); i++) {
  const item = db[i];
  const missing = Object.entries(item.nutrients ?? {}).filter(([key, value]) => /^(Omega-3 Fatty Acids|Omega-6 Fatty Acids|Trans Fat|Alcohol) \(g\)$/.test(key) && value == null).map(([key]) => key);
  if (!missing.length) continue;
  const query = tokens(item.name_en || item.name);
  const expectedState = stateWords.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(item.name_en || item.name));
  const candidates = foods.map(food => {
    const description = food.description ?? '';
    const sourceTokens = tokens(description);
    let matchScore = dice(query, sourceTokens);
    for (const state of expectedState) {
      if (new RegExp(`\\b${state}\\b`, 'i').test(description)) matchScore += 0.06;
    }
    const nutrients = (food.foodNutrients ?? []).filter(n => relevant.has(String(n.nutrient?.number))).map(n => ({number:n.nutrient.number,name:n.nutrient.name,amount:n.amount}));
    return {fdcId:food.fdcId,description,score:Number(Math.min(matchScore,1).toFixed(2)),nutrients};
  }).filter(food => food.score >= 0.55).sort((a,b) => b.score-a.score).slice(0,2);
  records.push({databaseIndex:i+1,name:item.name,name_en:item.name_en,unit:item.unit,missing,candidates});
}
console.log(JSON.stringify({source:'USDA FoodData Central SR Legacy 2018',first,last,rows:records.length,records},null,2));
