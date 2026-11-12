import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.join(path.resolve('.'), 'Daten', 'run_usda_curated_batch.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
const sources = new Map([
  [701, 'Potatoes, flesh and skin, raw'],
  [702, 'Potatoes, french fried, frozen, oven-heated'],
  [703, 'Potatoes, french fried, frozen, as purchased'],
  [704, 'Snacks, potato chips, reduced fat'],
  [705, 'Snacks, potato sticks'],
  [707, 'Milk, fluid, nonfat, with added vitamin A and vitamin D (fat free or skim)'],
  [708, 'Milk, lowfat, fluid, 2% milkfat, with added vitamin A and vitamin D'],
  [710, 'Milk, whole, 3.25% milkfat, with added vitamin A and vitamin D'],
  [711, 'Milk, goat, fluid, with added vitamin D'],
  [712, 'Milk, sheep, fluid'],
  [713, 'Yogurt, plain, lowfat, 12 grams protein per 8 ounce'],
  [714, 'Milk, lowfat, fluid, 2% milkfat, with added vitamin A and vitamin D'],
  [715, 'Milk, whole, 3.25% milkfat, with added vitamin A and vitamin D'],
  [724, 'Whey, sweet, fluid'],
  [725, 'Cream, fluid, heavy whipping'],
  [726, 'Cream, half and half'],
  [730, "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)"],
  [732, "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)"],
  [733, 'Cheese, edam'],
  [734, 'Cheese, edam'],
  [737, 'Cheese, camembert'],
  [738, 'Cheese, brie'],
  [739, 'Cheese, mozzarella, whole milk'],
  [740, 'Cream, sour'],
  [741, 'Cheese, cottage, lowfat, 2% milkfat'],
  [742, 'Cheese, cottage, creamed, large or small curd'],
  [746, 'Yogurt, Greek, plain, nonfat'],
  [753, 'Beverages, carbonated, tonic water'],
  [755, 'Beverages, carbonated, ginger ale'],
  [759, 'Oil, olive, salad or cooking'],
  [760, 'Oil, peanut, salad or cooking'],
  [761, 'Oil, canola'],
  [762, 'Oil, corn, industrial and retail, all purpose salad or cooking'],
  [763, 'Oil, soybean, salad or cooking'],
  [764, 'Lard'],
  [766, 'Butter, Clarified butter (ghee)'],
  [768, 'Butter, salted'],
  [769, 'Butter, salted'],
  [780, 'Sauce, barbecue'],
  [781, 'Tomato products, canned, puree, without salt added'],
  [782, 'Salad dressing, mayonnaise, regular'],
  [783, 'Fish, salmon, king (chinook), raw (Alaska Native)'],
  [784, 'Fish, trout, rainbow, farmed, raw'],
  [785, 'Fish, herring, Atlantic, pickled'],
  [787, 'Beef, shoulder pot roast or steak, boneless, separable lean and fat, trimmed to 0" fat, choice, raw'],
  [790, 'Veal, leg, top round, cap off, cutlet, boneless, raw'],
  [792, 'Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean only, raw'],
  [793, 'Pork, fresh, loin, tenderloin, separable lean only, raw'],
  [794, 'Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean only, raw'],
  [795, 'Pork, fresh, loin, tenderloin, separable lean only, raw'],
  [796, 'Pork, fresh, loin, blade (chops or roasts), bone-in, separable lean and fat, raw'],
  [797, 'Pork, fresh, loin, top loin (roasts), boneless, separable lean only, raw'],
  [799, 'Pork, fresh, loin, top loin (chops), boneless, separable lean and fat, raw'],
  [800, 'Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean and fat, raw'],
]);
const start = script.indexOf('const sourceByDatabaseIndex = new Map([');
const end = script.indexOf(']);', start) + 3;
if (start < 0 || end < 3) throw new Error('Could not locate source map');
const map = `const sourceByDatabaseIndex = new Map([\n${[...sources].map(([index, name]) => `  [${index}, ${JSON.stringify(name)}],`).join('\n')}\n]);`;
script = script.slice(0, start) + map + script.slice(end);
script = script.replace("const batchNumber = Number(process.argv[2] ?? 2);", "const batchNumber = Number(process.argv[2] ?? 8);");
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
