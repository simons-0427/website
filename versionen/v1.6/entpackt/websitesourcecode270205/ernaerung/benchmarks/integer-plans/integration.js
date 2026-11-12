"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const PFAS4 = require(path.join(root, "pfas4-estimates.js"));
const html = fs.readFileSync(path.join(root, "benchmarks", "index.html"), "utf8");
const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
if (!inline) throw new Error("Inline script not found");
const browserSelf = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "solver.js"), "utf8"), { self: browserSelf });
const calls = [];
const tracedSolver = { Solve(model) {
  const start = Date.now();
  const result = browserSelf.solver.Solve(model);
  const violations = [];
  if (model.ints && result.feasible) {
    for (const [key, bound] of Object.entries(model.constraints)) {
      const total = Object.entries(model.variables).reduce((sum, [name, variable]) => sum + (Math.round(result[name] || 0) * (variable[key] || 0)), 0);
      if (bound.min != null && total < bound.min - Math.max(1e-4, Math.abs(bound.min) * 1e-4)) violations.push(`${key} min ${total}`);
      if (bound.max != null && total > bound.max + Math.max(1e-4, Math.abs(bound.max) * 1e-4)) violations.push(`${key} max ${total}`);
    }
  }
  calls.push({ integer: !!model.ints, variables: Object.keys(model.variables).length, ms: Date.now() - start, feasible: result.feasible, cost: result.result, violations });
  return result;
} };

const fakeElement = new Proxy({}, {
  get(target, key) {
    if (key === "addEventListener" || key === "removeEventListener") return () => {};
    if (key === "querySelectorAll") return () => [];
    if (key === "querySelector") return () => fakeElement;
    if (key === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (key === "style") return {};
    if (key === "dataset") return {};
    return target[key];
  },
  set(target, key, value) { target[key] = value; return true; },
});
const context = {
  PFAS4,
  solver: tracedSolver,
  window: { addEventListener() {} },
  document: {
    getElementById() { return fakeElement; },
    querySelector() { return fakeElement; },
    querySelectorAll() { return []; },
    addEventListener() {},
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  console,
  setTimeout,
  clearTimeout,
};
const testHook = `
globalThis.appTest = {
  setCase(nextFoods, nextReq, aasTarget = 50) {
    foods = nextFoods;
    req = nextReq;
    PARAMS = Object.keys(nextReq);
    userProfile = defaultUserProfile();
    userProfile.aas_target_custom = true;
    userProfile.aas_target_pct = aasTarget;
  },
  solveIntegerPlan: solveIntegerPlanHybrid,
  integerPlanFeasibleWith,
  normalizeFood,
};`;
const script = inline.replace(/initMarketSettings\(\);\s*boot\(\);\s*$/, "") + testHook;
vm.runInNewContext(script, context, { filename: "index-inline.js" });

const inputPath = process.argv[2] || path.join(root, "database.json");
const outputPath = process.argv[3] || path.join(__dirname, "integration-results.json");
const allFoods = JSON.parse(fs.readFileSync(inputPath, "utf8"))
  .map(food => context.appTest.normalizeFood(food));
const baseReq = {
  "Energy (cal)": { min: 1900, max: 2100 },
  "Protein (g)": { min: 80, max: null },
  "Dietary Fibre (g)": { min: 25, max: null },
  "Total Fat (g)": { min: 40, max: 110 },
  "Total Carbohydrate (g)": { min: 180, max: null },
  "Sodium (mg)": { min: null, max: 3000 },
  "Calcium (mg)": { min: 800, max: null },
  "Iron (mg)": { min: 10, max: null },
  "Vitamin C (mg)": { min: 75, max: null },
  "Cadmium (µg)": { min: null, max: 40 },
};
const cases = [
  { id: "balanced_2000", kcal: [1900, 2100], protein: 80, fiber: 25 },
  { id: "balanced_2800", kcal: [2700, 2900], protein: 120, fiber: 30 },
  { id: "high_protein", kcal: [2400, 2600], protein: 180, fiber: 25 },
  { id: "vegan_2200", diet: "vegan", kcal: [2100, 2300], protein: 90, fiber: 30 },
  { id: "vegetarian_2200", diet: "vegetarisch", kcal: [2100, 2300], protein: 100, fiber: 30 },
  { id: "pescetarian_2600", diet: "pescetarisch", kcal: [2500, 2700], protein: 130, fiber: 30 },
  { id: "whole_food_2200", wholeFood: true, kcal: [2100, 2300], protein: 90, fiber: 30 },
  { id: "gluten_free_2200", noGluten: true, kcal: [2100, 2300], protein: 90, fiber: 25 },
  { id: "low_sodium_2000", sodiumMax: 1800, kcal: [1900, 2100], protein: 80, fiber: 25 },
  { id: "tight_energy_2000", kcal: [1990, 2010], protein: 110, fiber: 30 },
];
const report = { generatedAt: new Date().toISOString(), cases: [] };
(async () => {
  for (const item of cases) {
    const pool = allFoods.filter(food =>
      (!item.diet || food.tags?.includes(item.diet)) &&
      (!item.wholeFood || food.tags?.includes("whole_food")) &&
      (!item.noGluten || !food.tags?.includes("gluten")));
    const req = JSON.parse(JSON.stringify(baseReq));
    req["Energy (cal)"] = { min: item.kcal[0], max: item.kcal[1] };
    req["Protein (g)"].min = item.protein;
    req["Dietary Fibre (g)"].min = item.fiber;
    if (item.sodiumMax) req["Sodium (mg)"].max = item.sodiumMax;
    context.appTest.setCase(pool, req);
    calls.length = 0;
    const start = Date.now();
    const plan = await context.appTest.solveIntegerPlan(pool);
    const valid = plan.feasible && plan.chosen.every(x => Number.isInteger(x.u) && x.u > 0) &&
      context.appTest.integerPlanFeasibleWith(plan.chosen, req);
    report.cases.push({ id: item.id, pool: pool.length, valid, feasible: plan.feasible, method: plan.method || null, cost: plan.cost ?? null, approx: plan.approx ?? null, ms: Date.now() - start, calls: [...calls], reason: plan.reason || null });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(`${item.id}: ${report.cases.at(-1).ms}ms ${plan.method || plan.reason} valid=${valid}\n`);
    if (!valid) process.exitCode = 1;
  }
  const impossible = JSON.parse(JSON.stringify(baseReq));
  impossible["Energy (cal)"] = { min: 2200, max: 1000 };
  context.appTest.setCase(allFoods, impossible);
  const impossiblePlan = await context.appTest.solveIntegerPlan(allFoods);
  report.invalidCaseRejected = impossiblePlan.feasible === false;
  context.appTest.setCase(allFoods, baseReq, 100);
  const stressStart = Date.now();
  const stressPlan = await context.appTest.solveIntegerPlan(allFoods);
  report.aas100Stress = {
    feasible: stressPlan.feasible,
    valid: stressPlan.feasible && stressPlan.chosen.every(x => Number.isInteger(x.u)) &&
      context.appTest.integerPlanFeasibleWith(stressPlan.chosen, baseReq),
    method: stressPlan.method || null,
    reason: stressPlan.reason || null,
    ms: Date.now() - stressStart,
  };
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  if (!report.invalidCaseRejected || (report.aas100Stress.feasible && !report.aas100Stress.valid)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
