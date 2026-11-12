"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "../..");
const PFAS4 = require(path.join(root, "pfas4-estimates.js"));
const source = process.env.HEAVY_SOURCE || "benchmark";
const sourcePath = process.env.HEAVY_FILE_OVERRIDE ? path.resolve(root, process.env.HEAVY_FILE_OVERRIDE)
  : source === "main" ? path.join(root, "index.html")
  : source === "en" ? path.resolve(root, "../en/nutrition/index.html")
  : path.join(root, "benchmarks", "index.html");
const html = fs.readFileSync(sourcePath, "utf8");
const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
if (!inline) throw new Error("Inline script not found");
const browserSelf = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "solver.js"), "utf8"), { self: browserSelf });
const solver = browserSelf.solver;
const solverCalls = [];
const tracedSolver = { Solve(model) {
  const start = performance.now();
  const result = solver.Solve(model);
  solverCalls.push({ ms: Math.round(performance.now() - start), integer: !!model.ints, variables: Object.keys(model.variables).length, feasible: !!result.feasible });
  return result;
} };
const element = new Proxy({}, {
  get(target, key) {
    if (key === "addEventListener" || key === "removeEventListener") return () => {};
    if (key === "querySelectorAll") return () => [];
    if (key === "querySelector") return () => element;
    if (key === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (key === "style" || key === "dataset") return {};
    return target[key];
  },
  set(target, key, value) { target[key] = value; return true; },
});
const context = {
  PFAS4,
  solver: tracedSolver,
  window: { addEventListener() {} },
  document: {
    getElementById() { return element; },
    querySelector() { return element; },
    querySelectorAll() { return []; },
    addEventListener() {},
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  console,
  performance,
  setTimeout,
  clearTimeout,
};
const hook = `
globalThis.heavyTest = {
  setProfile(nextFoods, meta, overrides, parameterText) {
    foods = nextFoods;
    reqMeta = meta;
    PARAMS = orderParams([
      ...parseParams(parameterText),
      ...PARAM_ORDER_HEAD, ...PARAM_ORDER_MINERALS, ...PARAM_ORDER_VITAMINS,
      ...PARAM_ORDER_OTHER_MICRONUTRIENTS, ...PARAM_ORDER_QUALITY,
      ...PARAM_ORDER_AMINO, ...PARAM_ORDER_CONTAMINANTS,
    ]);
    userProfile = { ...defaultUserProfile(), ...overrides };
    req = buildProfileReq(userProfile);
    return req;
  },
  buildModel,
  normalizeFood,
  solverConstraintSpecs,
  integerPlanFeasibleWith,
  foodRef,
  foodPrice,
  repairIntegerPlan,
  unitSpecNutrient,
  boundTol,
  topFoodsForNutrient,
  setAlgorithm: typeof setBenchmarkAlgorithm === "function" ? setBenchmarkAlgorithm : () => {},
  solveIntegerPlan,
};`;
vm.runInNewContext(inline.replace(/initMarketSettings\(\);\s*boot\(\);\s*$/, "") + hook, context);

const allFoods = JSON.parse(fs.readFileSync(path.join(root, "database.json"), "utf8"))
  .map(food => context.heavyTest.normalizeFood(food));
const meta = JSON.parse(fs.readFileSync(path.join(root, "requirements.json"), "utf8"));
const parameterText = fs.readFileSync(path.join(root, "parameter.md"), "utf8");
const profiles = [
  { id: "default", overrides: {} },
  { id: "normal_protein", overrides: { protein_preset: "normal", protein_g_per_kg: 1 } },
  { id: "very_active", overrides: { activity: "sehr_aktiv" } },
  { id: "female", overrides: { gender: "weiblich", weight_kg: 65, height_cm: 170 } },
  { id: "vegan", overrides: { diet: "vegan" } },
  { id: "whole_food", overrides: { tag_whole_food: true } },
  { id: "high_micro", overrides: { micronutrient_boost_enabled: true, micronutrient_boost_pct: 150 } },
  { id: "omega_ratio", overrides: { omega_6_to_3_ratio_enabled: true, omega_6_to_3_ratio_max: 5 } },
  { id: "epa_dha", overrides: { epa_dha_enabled: true } },
  { id: "gluten_free", overrides: { avoid_gluten: true } },
];

function poolFor(profile) {
  return allFoods.filter(f =>
    (!profile.overrides.diet || f.tags?.includes(profile.overrides.diet)) &&
    (!profile.overrides.tag_whole_food || f.tags?.includes("whole_food")) &&
    (!profile.overrides.avoid_gluten || !f.tags?.includes("gluten")));
}
function makeRows(pool, raw, step) {
  return pool.map((f, i) => ({ f, u: Math.round(raw[`f${i}`] || 0) * (f.unit === "g" || f.unit === "ml" ? step : 1) }))
    .filter(x => x.u > 0);
}
function cost(rows) { return rows.reduce((sum, x) => sum + x.u * context.heavyTest.foodPrice(x.f) / context.heavyTest.foodRef(x.f), 0); }
function modelWithStep(pool, req, step, timeout) {
  const model = context.heavyTest.buildModel(pool, true, req, timeout);
  if (step > 1) {
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].unit !== "g" && pool[i].unit !== "ml") continue;
      for (const key of Object.keys(model.variables[`f${i}`])) model.variables[`f${i}`][key] *= step;
    }
  }
  return model;
}
function solve(model) {
  const start = performance.now();
  const raw = solver.Solve(model);
  return { raw, ms: Math.round(performance.now() - start) };
}
function countActive(req) { return context.heavyTest.solverConstraintSpecs(req).length; }
function rowViolations(rows, req) {
  const errors = [];
  for (const spec of context.heavyTest.solverConstraintSpecs(req)) {
    const total = rows.reduce((sum, x) => sum + x.u * context.heavyTest.unitSpecNutrient(x.f, spec), 0);
    if (spec.min != null && total < spec.min - context.heavyTest.boundTol(spec.min)) errors.push(`${spec.key}: ${total.toFixed(3)} < ${spec.min}`);
    if (spec.max != null && total > spec.max + context.heavyTest.boundTol(spec.max)) errors.push(`${spec.key}: ${total.toFixed(3)} > ${spec.max}`);
  }
  return errors.slice(0, 10);
}
function fastRepair(input, pool, req) {
  const specs = context.heavyTest.solverConstraintSpecs(req);
  const columns = pool.map(f => ({
    f,
    price: context.heavyTest.foodPrice(f) / context.heavyTest.foodRef(f),
    values: specs.map(spec => context.heavyTest.unitSpecNutrient(f, spec)),
  }));
  const byName = new Map(columns.map((col, i) => [col.f.name, i]));
  const amounts = new Int32Array(columns.length);
  for (const x of input) {
    const i = byName.get(x.f.name);
    if (i != null) amounts[i] += x.u;
  }
  const totals = specs.map((_, j) => columns.reduce((sum, col, i) => sum + amounts[i] * col.values[j], 0));
  function change(i, delta) {
    amounts[i] += delta;
    for (let j = 0; j < specs.length; j++) totals[j] += delta * columns[i].values[j];
  }
  for (let step = 0; step < 250; step++) {
    let changed = false;
    for (let j = 0; j < specs.length; j++) {
      const spec = specs[j];
      if (spec.min == null || totals[j] >= spec.min - context.heavyTest.boundTol(spec.min)) continue;
      let best = -1, bestScore = -Infinity;
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i], value = col.values[j];
        if (value <= 0 || col.price <= 0) continue;
        let admissible = true;
        for (let k = 0; k < specs.length; k++) {
          if (specs[k].max != null && totals[k] + col.values[k] > specs[k].max + context.heavyTest.boundTol(specs[k].max)) { admissible = false; break; }
        }
        if (!admissible) continue;
        const score = value / col.price * (col.f.tags?.includes("supplement") ? 1.5 : 1);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) { change(best, 1); changed = true; break; }
    }
    for (let j = 0; j < specs.length; j++) {
      const spec = specs[j];
      if (spec.max == null || totals[j] <= spec.max + context.heavyTest.boundTol(spec.max)) continue;
      let worst = -1, worstValue = 0;
      for (let i = 0; i < columns.length; i++) {
        if (amounts[i] > 0 && columns[i].values[j] > worstValue) { worstValue = columns[i].values[j]; worst = i; }
      }
      if (worst >= 0) { change(worst, -1); changed = true; }
    }
    if (!changed) break;
  }
  return columns.map((col, i) => ({ f: col.f, u: amounts[i] })).filter(x => x.u > 0);
}
function enumerateRound(pool, lpRows, req) {
  const specs = context.heavyTest.solverConstraintSpecs(req);
  const inputs = lpRows.map(x => ({
    f: pool.find(f => f.name === x.name),
    floor: Math.floor(x.amount + 1e-7),
    frac: x.amount - Math.floor(x.amount + 1e-7),
  }));
  const variable = inputs.map((x, i) => ({ ...x, i })).filter(x => x.frac > 1e-5 && x.frac < 1 - 1e-5);
  if (variable.length > 20) return { feasible: false, checked: 0, rows: [] };
  const totals = specs.map(spec => inputs.reduce((sum, x) => sum + x.floor * context.heavyTest.unitSpecNutrient(x.f, spec), 0));
  const delta = variable.map(x => specs.map(spec => context.heavyTest.unitSpecNutrient(x.f, spec)));
  const baseCost = inputs.reduce((sum, x) => sum + x.floor * context.heavyTest.foodPrice(x.f) / context.heavyTest.foodRef(x.f), 0);
  const deltaCost = variable.map(x => context.heavyTest.foodPrice(x.f) / context.heavyTest.foodRef(x.f));
  let currentCost = baseCost, previous = 0, best = null, bestCost = Infinity;
  const limit = 2 ** variable.length;
  for (let iter = 0; iter < limit; iter++) {
    const gray = iter ^ (iter >> 1);
    if (iter) {
      const difference = gray ^ previous;
      const bit = 31 - Math.clz32(difference);
      const direction = gray & difference ? 1 : -1;
      currentCost += direction * deltaCost[bit];
      for (let j = 0; j < specs.length; j++) totals[j] += direction * delta[bit][j];
    }
    previous = gray;
    if (currentCost >= bestCost) continue;
    let valid = true;
    for (let j = 0; j < specs.length; j++) {
      const spec = specs[j];
      if ((spec.min != null && totals[j] < spec.min - context.heavyTest.boundTol(spec.min)) ||
          (spec.max != null && totals[j] > spec.max + context.heavyTest.boundTol(spec.max))) { valid = false; break; }
    }
    if (valid) { best = gray; bestCost = currentCost; }
  }
  if (best == null) return { feasible: false, checked: limit, rows: [] };
  const amounts = inputs.map(x => x.floor);
  variable.forEach((x, bit) => { if (best & (1 << bit)) amounts[x.i]++; });
  return { feasible: true, checked: limit, rows: inputs.map((x, i) => ({ f: x.f, u: amounts[i] })).filter(x => x.u > 0) };
}
function enumeratePieces(pool, support, lpRows, req, expanded) {
  const pieces = lpRows.map(x => ({ ...x, i: support.findIndex(f => f.name === x.name) }))
    .filter(x => (x.unit === "stk" || x.unit === "tr") && Math.abs(x.amount - Math.round(x.amount)) > 1e-5);
  if (pieces.length > 8) return { checked: 0, valid: false, cost: null };
  let bestCost = Infinity, bestRows = null, feasibleLps = 0;
  const variations = 2 ** pieces.length;
  for (let mask = 0; mask < variations; mask++) {
    const model = context.heavyTest.buildModel(support, false, req);
    pieces.forEach((item, bit) => {
      const key = `__piece${bit}`;
      model.constraints[key] = { equal: Math.floor(item.amount) + ((mask >> bit) & 1) };
      model.variables[`f${item.i}`][key] = 1;
    });
    const raw = solver.Solve(model);
    if (!raw.feasible) continue;
    feasibleLps++;
    const rounded = support.map((f, i) => ({ f, u: Math.round((raw[`f${i}`] || 0) * context.heavyTest.foodRef(f)) })).filter(x => x.u > 0);
    for (const candidates of [support, expanded]) {
      const repaired = fastRepair(rounded, candidates, req);
      if (!context.heavyTest.integerPlanFeasibleWith(repaired, req)) continue;
      const candidateCost = cost(repaired);
      if (candidateCost < bestCost) { bestCost = candidateCost; bestRows = repaired; }
    }
  }
  return { checked: variations, feasibleLps, valid: !!bestRows, cost: bestRows ? bestCost : null };
}
function violations(model, raw) {
  const errors = [];
  for (const [key, bound] of Object.entries(model.constraints)) {
    const total = Object.entries(model.variables).reduce((sum, [name, coefficients]) =>
      sum + Math.round(raw[name] || 0) * (coefficients[key] || 0), 0);
    if (bound.min != null && total < bound.min - Math.max(1e-4, Math.abs(bound.min) * 1e-4)) errors.push(`${key}: ${total.toFixed(4)} < ${bound.min}`);
    if (bound.max != null && total > bound.max + Math.max(1e-4, Math.abs(bound.max) * 1e-4)) errors.push(`${key}: ${total.toFixed(4)} > ${bound.max}`);
  }
  return errors;
}

const timeout = Number(process.env.HEAVY_TIMEOUT_MS || 5000);
const selected = process.env.HEAVY_PROFILE;
const runIntegerVariants = process.env.HEAVY_MODES !== "heuristics";
const integerSteps = process.env.HEAVY_MODES === "integers-short" ? [1, 5] : [1, 2, 5, 10, 20];
const outputName = process.env.HEAVY_MODES === "integers-short" ? "heavy-direct-results.json" : "heavy-results.json";
const report = { generatedAt: new Date().toISOString(), timeout, profiles: [] };
for (const profile of profiles.filter(p => process.env.HEAVY_ONLY_APP !== "1" && (!selected || p.id === selected))) {
  const pool = poolFor(profile);
  const req = context.heavyTest.setProfile(pool, meta, profile.overrides, parameterText);
  const lp = solve(context.heavyTest.buildModel(pool, false, req));
  const record = { id: profile.id, pool: pool.length, activeConstraints: countActive(req), lp: { ms: lp.ms, feasible: lp.raw.feasible, cost: lp.raw.result }, variants: [] };
  if (lp.raw.feasible) {
    const support = pool.filter((f, i) => (lp.raw[`f${i}`] || 0) > 1e-6);
    record.support = support.length;
    record.lpSupport = pool.map((f, i) => ({ name: f.name, unit: f.unit, amount: (lp.raw[`f${i}`] || 0) * context.heavyTest.foodRef(f) }))
      .filter(x => x.amount > 1e-6);
    const rounded = pool.map((f, i) => ({ f, u: Math.round((lp.raw[`f${i}`] || 0) * context.heavyTest.foodRef(f)) })).filter(x => x.u > 0);
    const repairStart = performance.now();
    const repaired = context.heavyTest.repairIntegerPlan(rounded, support, req);
    const repairValid = context.heavyTest.integerPlanFeasibleWith(repaired, req);
    record.roundRepair = { ms: Math.round(performance.now() - repairStart), valid: repairValid, cost: repairValid ? cost(repaired) : null };
    const fastStart = performance.now();
    const fastRounded = fastRepair(rounded, support, req);
    const fastValid = context.heavyTest.integerPlanFeasibleWith(fastRounded, req);
    record.fastRepair = { ms: Math.round(performance.now() - fastStart), valid: fastValid, cost: fastValid ? cost(fastRounded) : null, violations: fastValid ? [] : rowViolations(fastRounded, req) };
    const enumerateStart = performance.now();
    const enumerated = enumerateRound(pool, record.lpSupport, req);
    const enumValid = enumerated.feasible && context.heavyTest.integerPlanFeasibleWith(enumerated.rows, req);
    record.enumerated = { ms: Math.round(performance.now() - enumerateStart), valid: enumValid, cost: enumValid ? cost(enumerated.rows) : null, checked: enumerated.checked };
    if (selected) {
      record.localMilp = [];
      for (const radius of [2, 5, 20, 100]) {
        const model = modelWithStep(support, req, 1, 2000);
        for (let i = 0; i < support.length; i++) {
          const ideal = record.lpSupport.find(x => x.name === support[i].name)?.amount || 0;
          const key = `__local${i}`;
          model.constraints[key] = { min: Math.max(0, Math.floor(ideal - radius)), max: Math.ceil(ideal + radius) };
          model.variables[`f${i}`][key] = 1;
        }
        const run = solve(model);
        const rows = makeRows(support, run.raw, 1);
        const valid = run.raw.feasible && context.heavyTest.integerPlanFeasibleWith(rows, req);
        record.localMilp.push({ radius, ms: run.ms, valid, cost: valid ? cost(rows) : null, violations: valid ? [] : rowViolations(rows, req) });
      }
    }
    const extra = [];
    for (const spec of context.heavyTest.solverConstraintSpecs(req)) {
      if (spec.min != null && spec.min > 0) extra.push(...context.heavyTest.topFoodsForNutrient(pool, spec.key, Number(process.env.HEAVY_CANDIDATE_K || 3), req));
    }
    const expanded = [...new Map([...support, ...extra].map(f => [f.name, f])).values()];
    record.expandedCount = expanded.length;
    const expandedFastStart = performance.now();
    const expandedRows = fastRepair(rounded, expanded, req);
    const expandedFastValid = context.heavyTest.integerPlanFeasibleWith(expandedRows, req);
    record.expandedFast = { ms: Math.round(performance.now() - expandedFastStart), valid: expandedFastValid, cost: expandedFastValid ? cost(expandedRows) : null, violations: expandedFastValid ? [] : rowViolations(expandedRows, req) };
    if (selected) {
      const pieceStart = performance.now();
      record.pieceEnumeration = enumeratePieces(pool, support, record.lpSupport, req, expanded);
      record.pieceEnumeration.ms = Math.round(performance.now() - pieceStart);
      const expandedPieceStart = performance.now();
      record.pieceEnumerationExpanded = enumeratePieces(pool, expanded, record.lpSupport, req, expanded);
      record.pieceEnumerationExpanded.ms = Math.round(performance.now() - expandedPieceStart);
    }
    const mixedModel = context.heavyTest.buildModel(support, false, req);
    mixedModel.ints = {};
    for (let i = 0; i < support.length; i++) if (context.heavyTest.foodRef(support[i]) === 1) mixedModel.ints[`f${i}`] = 1;
    mixedModel.options = { timeout, tolerance: 0.001 };
    const mixed = solve(mixedModel);
    const mixedRounded = support.map((f, i) => ({ f, u: Math.round((mixed.raw[`f${i}`] || 0) * context.heavyTest.foodRef(f)) })).filter(x => x.u > 0);
    const mixedRoundValid = mixed.raw.feasible && context.heavyTest.integerPlanFeasibleWith(mixedRounded, req);
    const mixedRepairStart = performance.now();
    const mixedRepaired = mixedRoundValid ? mixedRounded : context.heavyTest.repairIntegerPlan(mixedRounded, support, req);
    const mixedValid = mixed.raw.feasible && context.heavyTest.integerPlanFeasibleWith(mixedRepaired, req);
    record.mixed = { ms: mixed.ms, repairMs: Math.round(performance.now() - mixedRepairStart), solverFeasible: !!mixed.raw.feasible, valid: mixedValid, cost: mixedValid ? cost(mixedRepaired) : null, pieceVars: Object.keys(mixedModel.ints).length };
    const mixedFastStart = performance.now();
    const mixedFastRows = mixedRoundValid ? mixedRounded : fastRepair(mixedRounded, support, req);
    const mixedFastValid = mixed.raw.feasible && context.heavyTest.integerPlanFeasibleWith(mixedFastRows, req);
    record.mixedFast = { ms: mixed.ms + Math.round(performance.now() - mixedFastStart), valid: mixedFastValid, cost: mixedFastValid ? cost(mixedFastRows) : null, violations: mixedFastValid ? [] : rowViolations(mixedFastRows, req) };
    const fixedModel = context.heavyTest.buildModel(support, false, req);
    for (let i = 0; i < support.length; i++) {
      if (context.heavyTest.foodRef(support[i]) !== 1) continue;
      const initial = record.lpSupport.find(x => x.name === support[i].name)?.amount || 0;
      fixedModel.constraints[`__piece${i}`] = { equal: Math.ceil(initial) };
      fixedModel.variables[`f${i}`][`__piece${i}`] = 1;
    }
    const fixed = solve(fixedModel);
    const fixedRounded = support.map((f, i) => ({ f, u: Math.round((fixed.raw[`f${i}`] || 0) * context.heavyTest.foodRef(f)) })).filter(x => x.u > 0);
    const fixedRepairStart = performance.now();
    const fixedRepaired = fixed.raw.feasible ? context.heavyTest.repairIntegerPlan(fixedRounded, support, req) : [];
    const fixedValid = fixed.raw.feasible && context.heavyTest.integerPlanFeasibleWith(fixedRepaired, req);
    record.fixedPieces = { ms: fixed.ms, repairMs: Math.round(performance.now() - fixedRepairStart), valid: fixedValid, cost: fixedValid ? cost(fixedRepaired) : null };
    for (const step of runIntegerVariants ? integerSteps : []) {
      const model = modelWithStep(support, req, step, timeout);
      const run = solve(model);
      const rows = makeRows(support, run.raw, step);
      const valid = !!run.raw.feasible && rows.every(x => Number.isInteger(x.u)) &&
        context.heavyTest.integerPlanFeasibleWith(rows, req);
      record.variants.push({ step, ms: run.ms, solverFeasible: !!run.raw.feasible, valid, cost: valid ? cost(rows) : null, foods: rows.length, violations: valid ? [] : violations(model, run.raw).slice(0, 12) });
    }
  }
  report.profiles.push(record);
  fs.writeFileSync(path.join(__dirname, outputName), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`${profile.id}: ${record.activeConstraints} constraints, LP ${lp.ms}ms, support ${record.support || 0}, fastRepair ${record.fastRepair?.ms}/${record.fastRepair?.valid}, enum ${record.enumerated?.ms}/${record.enumerated?.valid}, expandedFast ${record.expandedFast?.ms}/${record.expandedFast?.valid}, mixedFast ${record.mixedFast?.ms}/${record.mixedFast?.valid}, ${record.variants.map(v => `${v.step}g:${v.ms}ms/${v.valid}`).join(" ")}\n`);
}
if (process.env.HEAVY_APP === "1") {
  (async () => {
    const algorithm = process.env.HEAVY_ALGORITHM || "hybrid";
    if (!["hybrid", "original", "lp-repair", "mixed-repair", "support-milp", "expanded-milp"].includes(algorithm)) {
      throw new Error("Unknown HEAVY_ALGORITHM: " + algorithm);
    }
    context.heavyTest.setAlgorithm(algorithm);
    const appOutput = source === "benchmark"
      ? (algorithm === "hybrid" ? "heavy-app-results.json" : `heavy-${algorithm}-results.json`)
      : `heavy-${source}-results.json`;
    const repeat = Math.max(1, Number(process.env.HEAVY_REPEAT || 1));
    const appReport = { generatedAt: new Date().toISOString(), source, algorithm, repeat, profiles: [] };
    for (const profile of profiles.filter(p => !selected || p.id === selected)) {
      const pool = poolFor(profile);
      const runs = [];
      for (let repetition = 0; repetition < repeat; repetition++) {
        const req = context.heavyTest.setProfile(pool, meta, profile.overrides, parameterText);
        solverCalls.length = 0;
        const start = performance.now();
        const plan = await context.heavyTest.solveIntegerPlan(pool);
        const valid = plan.feasible && plan.chosen.every(x => Number.isInteger(x.u) && x.u > 0) &&
          context.heavyTest.integerPlanFeasibleWith(plan.chosen, req);
        runs.push({
          ms: Math.round(performance.now() - start),
          feasible: !!plan.feasible,
          valid: !!valid,
          method: plan.method || null,
          approx: plan.approx ?? null,
          cost: plan.cost ?? null,
          reason: plan.reason || null,
          solverCalls: [...solverCalls],
        });
        if (plan.feasible && !valid) process.exitCode = 1;
      }
      const ordered = [...runs].sort((a, b) => a.ms - b.ms);
      const representative = ordered[Math.floor(ordered.length / 2)];
      const req = context.heavyTest.setProfile(pool, meta, profile.overrides, parameterText);
      appReport.profiles.push({
        id: profile.id,
        activeConstraints: countActive(req),
        pool: pool.length,
        ...representative,
        runs,
      });
      fs.writeFileSync(path.join(__dirname, appOutput), JSON.stringify(appReport, null, 2) + "\n");
      process.stdout.write(`APP ${profile.id}: median ${representative.ms}ms ${representative.method || representative.reason} valid=${runs.every(x => x.valid)}\n`);
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
