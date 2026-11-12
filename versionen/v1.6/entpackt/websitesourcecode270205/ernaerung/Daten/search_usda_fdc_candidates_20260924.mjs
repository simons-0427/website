import fs from 'node:fs';
import path from 'node:path';

const database = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const sourcePath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const stop = new Set(`a an and as baked basic beef boiled bread breakfast canned cheese chicken cooked cream deep dish drink dried egg eggs fast fatty fish food for fried frozen from fruit grilled homemade hot in juice low meat milk mixed no of oil on only or other plain product ready rice roast roasted roll salad sauce seasoned seed serving skinless smoked soup sweet the to takeaway with without`.split(' '));
const synonyms = new Map([
  ['balti', 'curry'], ['korma', 'curry'], ['tikka', 'curry'], ['masala', 'curry'], ['doner', 'gyro'], ['kebab', 'gyro'],
  ['fries', 'potatoes'], ['french', 'potatoes'], ['chips', 'potatoes'], ['samosa', 'samosa'], ['muesli', 'cereal'], ['muesli', 'cereal'],
  ['quiche', 'pie'], ['burger', 'hamburger'], ['pattie', 'hamburger'], ['patty', 'hamburger'], ['lasagne', 'lasagna'], ['pils', 'beer'],
  ['lager', 'beer'], ['cider', 'cider'], ['shandy', 'beer'], ['radler', 'beer'], ['schnitzel', 'cutlet'], ['nugget', 'chicken'],
  ['gammon', 'ham'], ['cornflakes', 'cereals'], ['couscous', 'couscous'], ['papadam', 'papad'], ['pancake', 'pancakes'],
  ['naan', 'bread'], ['halloumi', 'cheese'], ['tempeh', 'tempeh'], ['tofu', 'tofu'], ['raita', 'yogurt'], ['coleslaw', 'coleslaw'],
  ['chorizo', 'sausage'], ['macaroni', 'pasta'], ['spaghetti', 'pasta'], ['linguine', 'pasta'], ['pasta', 'pasta']
]);
const tokens = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ')
  .filter(word => word.length >= 3 && !stop.has(word)).map(word => synonyms.get(word) ?? word);
const getNutrient = (food, number) => food.foodNutrients.find(row => String(row.nutrient.number) === String(number))?.amount ?? null;
const getNamed = (food, name) => food.foodNutrients.find(row => row.nutrient.name === name)?.amount ?? null;
const batch = database.slice(400, 500).map((item, offset) => {
  const dbIndex = 401 + offset;
  const queryTokens = [...new Set(tokens(item.name_en ?? item.name))];
  const ranked = SRLegacyFoods.map(food => {
    const description = tokens(food.description);
    const overlap = queryTokens.filter(token => description.includes(token));
    if (!overlap.length) return null;
    const score = overlap.reduce((sum, token) => sum + (token.length >= 6 ? 2 : 1), 0) / Math.max(1, Math.sqrt(queryTokens.length));
    return { food, score, overlap };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 3).map(({ food, score, overlap }) => ({
    fdcId: food.fdcId,
    description: food.description,
    score: Number(score.toFixed(2)),
    matchedTerms: overlap,
    fat: getNutrient(food, 204),
    totalPUFA: getNutrient(food, 646),
    alaSpecific: getNamed(food, 'PUFA 18:3 n-3 c,c,c (ALA)'),
    ala18_3: getNamed(food, 'PUFA 18:3 n-3'),
    alaGeneric: getNamed(food, 'PUFA 18:3'),
    epa: getNamed(food, 'PUFA 20:5 n-3 (EPA)'),
    dha: getNamed(food, 'PUFA 22:6 n-3 (DHA)'),
    trans: getNutrient(food, 605),
    alcohol: getNutrient(food, 221),
  }));
  return { databaseIndex: dbIndex, food: item.name, searchName: item.name_en, queryTokens, candidates: ranked };
});
console.log(JSON.stringify(batch, null, 2));
