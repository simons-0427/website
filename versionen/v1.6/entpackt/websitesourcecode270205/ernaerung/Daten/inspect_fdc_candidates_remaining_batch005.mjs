import fs from 'node:fs';
import path from 'node:path';

const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(fdcPath, 'utf8'));
const queries = [
  { index: 402, groups: [['chicken'], ['curry']] },
  { index: 403, groups: [['chicken'], ['curry']] },
  { index: 404, groups: [['chicken'], ['curry']] },
  { index: 420, groups: [['samosa']] },
  { index: 421, groups: [['pie'], ['meat', 'beef', 'pork', 'chicken']] },
  { index: 423, groups: [['spring roll']] },
  { index: 425, groups: [['samosa']] },
  { index: 426, groups: [['curry'], ['vegetable', 'vegetarian']] },
  { index: 427, groups: [['soup'], ['vegetable']] },
  { index: 454, groups: [['kidney'], ['lamb']] },
  { index: 465, groups: [['papad', 'papadam']] },
  { index: 472, groups: [['french fries', 'potato fries']] },
  { index: 481, groups: [['beef'], ['patty', 'hamburger', 'ground']] },
  { index: 482, groups: [['hamburger', 'burger'], ['beef', 'ground']] },
  { index: 483, groups: [['beef'], ['curry']] },
  { index: 485, groups: [['risotto'], ['chicken']] },
  { index: 489, groups: [['bacon'], ['lettuce'], ['tomato'], ['sandwich']] },
  { index: 490, groups: [['cheddar'], ['pickle'], ['sandwich']] },
  { index: 492, groups: [['frozen dessert', 'ice dessert', 'ice pop', 'sherbet']] },
  { index: 495, groups: [['pork'], ['sparerib', 'rib'], ['barbecue', 'bbq']] },
  { index: 497, groups: [['tempeh']] },
  { index: 499, groups: [['tofu'], ['burger', 'patty']] },
  { index: 500, groups: [['tomato'], ['soup']] },
];

const amount = (food, id) => food.foodNutrients.find(row => String(row.nutrient?.number) === String(id))?.amount ?? null;
const byName = (food, regex) => food.foodNutrients.find(row => regex.test(row.nutrient?.name ?? ''))?.amount ?? null;
const normalized = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const groupHit = (text, group) => group.some(term => text.includes(normalized(term)));
const fattySum = (food, re) => food.foodNutrients.filter(row => re.test(row.nutrient?.name ?? '') && Number.isFinite(row.amount)).reduce((sum, row) => sum + row.amount, 0);

const output = queries.map(query => {
  const target = db[query.index - 1];
  const targetFat = target.nutrients['Total Fat (g)'];
  const rows = SRLegacyFoods.map(food => {
    const text = normalized(food.description);
    const hits = query.groups.filter(group => groupHit(text, group)).length;
    if (hits !== query.groups.length) return null;
    const fat = amount(food, 204);
    return {
      fdcId: Number(food.fdcId),
      description: food.description,
      sourceFat: fat,
      fatDiffPct: fat == null ? null : Math.round(Math.abs(fat - targetFat) / Math.max(targetFat, 0.01) * 1000) / 10,
      omega3: fattySum(food, /PUFA .*n-3/i),
      omega6: fattySum(food, /PUFA .*n-6/i),
      trans: amount(food, 605),
      ala: byName(food, /PUFA 18:3 n-3.*ALA/i),
      epa: byName(food, /PUFA 20:5 n-3.*EPA/i),
      dha: byName(food, /PUFA 22:6 n-3.*DHA/i),
    };
  }).filter(Boolean).sort((a, b) => (a.fatDiffPct ?? 9999) - (b.fatDiffPct ?? 9999)).slice(0, 6);
  return { index: query.index, food: target.name, targetFat, groupCount: query.groups.length, candidates: rows };
});
console.log(JSON.stringify(output, null, 2));
