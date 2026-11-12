import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(import.meta.dirname, '../../en/nutrition/index.html');
let html = fs.readFileSync(target, 'utf8');
const newline = html.includes('\r\n') ? '\r\n' : '\n';
const replaceOnce = (from, to) => {
  const oldText = from.replaceAll('\n', newline);
  const newText = to.replaceAll('\n', newline);
  const first = html.indexOf(oldText);
  if (first < 0 || html.indexOf(oldText, first + oldText.length) >= 0) throw Error(`Missing or repeated insertion point: ${from.slice(0, 70)}`);
  html = html.slice(0, first) + newText + html.slice(first + oldText.length);
};

const marker = 'const LS_FOODS = "ie_en_foods_database_v1", LS_REQ = "ie_en_req_v1", LS_PROFILE = "ie_en_profile_v1", LS_MARKET = "ie_en_market_v1";';
if (html.includes('LS_FOOD_ADDITIONS_20261021')) {
  const oldGuard = 'function markNewSeedFoodsImported() {\n  try { localStorage.setItem(LS_FOOD_ADDITIONS_20261021, "done"); }';
  if (html.includes(oldGuard.replaceAll('\n', newline))) {
    replaceOnce(oldGuard, 'function markNewSeedFoodsImported() {\n  if (SEED.length <= FOOD_ADDITIONS_20261021_START) return;\n  try { localStorage.setItem(LS_FOOD_ADDITIONS_20261021, "done"); }');
    fs.writeFileSync(target, html, 'utf8');
  }
  console.log('English food migration present.');
  process.exit(0);
}
replaceOnce(marker, marker + '\nconst LS_FOOD_ADDITIONS_20261021 = LS_FOODS + "_seed_additions_20261021";\nconst FOOD_ADDITIONS_20261021_START = 1516;');
replaceOnce('function initFoods(seed) {', `function appendNewSeedFoodsOnce() {
  if (localStorage.getItem(LS_FOOD_ADDITIONS_20261021) === "done") return;
  const known = new Set(foods.map(f => f.name));
  for (const seedFood of SEED.slice(FOOD_ADDITIONS_20261021_START)) {
    if (known.has(seedFood.name)) continue;
    foods.push(JSON.parse(JSON.stringify(seedFood)));
    known.add(seedFood.name);
  }
}
function markNewSeedFoodsImported() {
  try { localStorage.setItem(LS_FOOD_ADDITIONS_20261021, "done"); } catch (_) { /* local storage unavailable */ }
}

function initFoods(seed) {`);
replaceOnce('          mergeMissingNutrientsFromSeed(foods, SEED);\n          // fehlende AAS', '          mergeMissingNutrientsFromSeed(foods, SEED);\n          appendNewSeedFoodsOnce();\n          // fehlende AAS');
replaceOnce('          saveFoods();\n          return;', '          saveFoods();\n          markNewSeedFoodsImported();\n          return;');
replaceOnce('  foods = JSON.parse(JSON.stringify(SEED));\n  saveFoods();\n}', '  foods = JSON.parse(JSON.stringify(SEED));\n  saveFoods();\n  markNewSeedFoodsImported();\n}');
fs.writeFileSync(target, html, 'utf8');
console.log(target);
