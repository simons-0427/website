// Reproducible continuous-LP sensitivity screen for the active nutrition page.
// A removed constraint measures a possible saving, not a causal price for it.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const PFAS4 = require(path.join(root, 'pfas4-estimates.js'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
if (!inline) throw Error('Main inline script missing');
const browserSelf = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'solver.js'), 'utf8'), { self: browserSelf });
const element = new Proxy({}, { get(target, key) {
  if (key === 'addEventListener' || key === 'removeEventListener') return () => {};
  if (key === 'querySelectorAll') return () => [];
  if (key === 'querySelector') return () => element;
  if (key === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  if (key === 'style' || key === 'dataset') return {};
  return target[key];
}, set(target, key, value) { target[key] = value; return true; } });
const context = {
  PFAS4,
  solver: browserSelf.solver,
  window: { addEventListener() {} },
  document: { getElementById() { return element; }, querySelector() { return element; }, querySelectorAll() { return []; }, addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  console, performance, setTimeout, clearTimeout,
};
const hook = `globalThis.audit = {
  setCase(nextFoods, nextMeta, nextParams, overrides) {
    foods = nextFoods; reqMeta = nextMeta;
    PARAMS = orderParams([...parseParams(nextParams), ...PARAM_ORDER_HEAD, ...PARAM_ORDER_MINERALS,
      ...PARAM_ORDER_VITAMINS, ...PARAM_ORDER_OTHER_MICRONUTRIENTS, ...PARAM_ORDER_QUALITY,
      ...PARAM_ORDER_AMINO, ...PARAM_ORDER_CONTAMINANTS]);
    userProfile = { ...defaultUserProfile(), ...overrides };
    req = buildProfileReq(userProfile);
    return { req, specs: solverConstraintSpecs(req) };
  }, buildModel, normalizeFood, foodRef, foodPrice,
};`;
vm.runInNewContext(inline.replace(/initMarketSettings\(\);\s*boot\(\);\s*$/, '') + hook, context);
const inputPath = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, 'database.json');
const foods = JSON.parse(fs.readFileSync(inputPath, 'utf8')).map(context.audit.normalizeFood);
const meta = JSON.parse(fs.readFileSync(path.join(root, 'requirements.json'), 'utf8'));
const params = fs.readFileSync(path.join(root, 'parameter.md'), 'utf8');
const cases = [
  { id: 'default', overrides: {} },
  { id: 'female', overrides: { gender: 'weiblich', weight_kg: 65, height_cm: 170 } },
  { id: 'vegan', overrides: { diet: 'vegan' } },
  { id: 'whole_food', overrides: { tag_whole_food: true } },
  { id: 'high_micro', overrides: { micronutrient_boost_enabled: true, micronutrient_boost_pct: 150 } },
];
const results = [];
for (const item of cases) {
  const pool = foods.filter(food =>
    (!item.overrides.diet || food.tags?.includes(item.overrides.diet)) &&
    (!item.overrides.tag_whole_food || food.tags?.includes('whole_food')));
  const { specs } = context.audit.setCase(pool, meta, params, item.overrides);
  const model = context.audit.buildModel(pool, false);
  const baseline = browserSelf.solver.Solve(model);
  if (!baseline.feasible) throw Error(`${item.id}: LP infeasible`);
  const baselineCost = baseline.result;
  const drivers = [];
  for (const spec of specs) {
    if (!(spec.key in model.constraints)) continue;
    const without = { ...model, constraints: { ...model.constraints } };
    delete without.constraints[spec.key];
    const relaxed = browserSelf.solver.Solve(without);
    if (!relaxed.feasible) continue;
    const total = pool.reduce((s, food, i) => s + (baseline[`f${i}`] || 0) * (model.variables[`f${i}`][spec.key] || 0), 0);
    drivers.push({ key: spec.key, saving: +(baselineCost - relaxed.result).toFixed(5), total: +total.toFixed(5), ...model.constraints[spec.key] });
  }
  drivers.sort((a, b) => b.saving - a.saving);
  const support = pool.map((food, i) => ({ food: food.name, amount: +(baseline[`f${i}`] || 0).toFixed(4), cost: +((baseline[`f${i}`] || 0) * context.audit.foodPrice(food)).toFixed(4) }))
    .filter(row => row.amount > 1e-5).sort((a, b) => b.cost - a.cost);
  results.push({ id: item.id, pool: pool.length, baselineCost: +baselineCost.toFixed(5), drivers, support });
  console.log(item.id, baselineCost.toFixed(3), drivers.filter(x => x.saving > 0.001).slice(0, 12).map(x => `${x.key}:${x.saving.toFixed(3)}`).join(' | '));
}
const output = process.argv[3] ? path.resolve(root, process.argv[3]) : path.join(root, 'Daten', 'cost_driver_audit_2026-10-10.json');
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), method: 'continuous LP, remove one constraint at a time', results }, null, 2) + '\n');
console.log(output);
