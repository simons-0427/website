import fs from 'node:fs';
import path from 'node:path';

const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const src = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(src, 'utf8'));
const stop = new Set('a an and as baked boiled cooked commercial deep fast food for from grilled homemade hot in low no of on other plain product ready roasted the to takeaway with without retail'.split(' '));
const aliases = new Map(Object.entries({ balti:'curry', korma:'curry', tikka:'curry', masala:'curry', doner:'gyro', kebab:'gyro', fries:'potatoes', french:'potatoes', chips:'potatoes', muesli:'cereal', quiche:'pie', burger:'hamburger', pattie:'hamburger', patty:'hamburger', lasagne:'lasagna', pils:'beer', lager:'beer', shandy:'beer', radler:'beer', schnitzel:'cutlet', nugget:'chicken', gammon:'ham', cornflakes:'cereals', papadam:'papad', pancake:'pancakes', naan:'bread', halloumi:'cheese', raita:'yogurt', chorizo:'sausage', spaghetti:'pasta', noodles:'pasta' }));
const tokenize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').split(' ').filter(w => w.length > 2 && !stop.has(w)).map(w => aliases.get(w) ?? w);
const val = (food, id) => food.foodNutrients.find(n => String(n.nutrient.number) === String(id))?.amount ?? null;
const named = (food, name) => food.foodNutrients.find(n => n.nutrient.name === name)?.amount ?? null;
const results = db.slice(400,500).map((item,j) => {
  const q = [...new Set(tokenize(item.name_en ?? item.name))];
  const cs = SRLegacyFoods.map(food => {
    const ts = tokenize(food.description);
    const hit = q.filter(w => ts.includes(w));
    if (!hit.length) return null;
    const score = hit.reduce((n,w) => n + (w.length > 5 ? 2 : 1),0) / Math.sqrt(Math.max(1,q.length));
    return { food, score, hit };
  }).filter(Boolean).sort((a,b) => b.score-a.score).slice(0,3).map(x => ({
    fdcId:x.food.fdcId, description:x.food.description, score:Number(x.score.toFixed(2)), hit:x.hit,
    fat:val(x.food,204), pufa:val(x.food,646), ala:named(x.food,'PUFA 18:3 n-3 c,c,c (ALA)') ?? named(x.food,'PUFA 18:3 n-3') ?? named(x.food,'PUFA 18:3'),
    epa:named(x.food,'PUFA 20:5 n-3 (EPA)'), dha:named(x.food,'PUFA 22:6 n-3 (DHA)'), trans:val(x.food,605), alcohol:val(x.food,221)
  }));
  return { index:j+401, food:item.name, en:item.name_en, query:q, candidates:cs };
});
console.log(JSON.stringify(results,null,2));
