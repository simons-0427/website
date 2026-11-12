"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const browserSelf = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "solver.js"), "utf8"), { self: browserSelf }, { filename: "solver.js" });
const solver = browserSelf.solver;
const foods = JSON.parse(fs.readFileSync(path.join(root, "database.json"), "utf8"));
const output = path.join(__dirname, "results.json");
const LIMIT_MS = Number(process.env.BENCH_TIMEOUT_MS || 2500);

const profiles = [
  { id: "balanced_2000", diet: "all", kcal: [1900, 2100], protein: 80, fiber: 25 },
  { id: "balanced_2800", diet: "all", kcal: [2700, 2900], protein: 120, fiber: 30 },
  { id: "high_protein", diet: "all", kcal: [2400, 2600], protein: 180, fiber: 25 },
  { id: "vegan_2200", diet: "vegan", kcal: [2100, 2300], protein: 90, fiber: 30 },
  { id: "vegetarian_2200", diet: "vegetarisch", kcal: [2100, 2300], protein: 100, fiber: 30 },
  { id: "pescetarian_2600", diet: "pescetarisch", kcal: [2500, 2700], protein: 130, fiber: 30 },
  { id: "whole_food_2200", diet: "all", wholeFood: true, kcal: [2100, 2300], protein: 90, fiber: 30 },
  { id: "gluten_free_2200", diet: "all", noGluten: true, kcal: [2100, 2300], protein: 90, fiber: 25 },
  { id: "low_sodium_2000", diet: "all", kcal: [1900, 2100], protein: 80, fiber: 25, sodiumMax: 1800 },
  { id: "tight_energy_2000", diet: "all", kcal: [1990, 2010], protein: 110, fiber: 30 },
];

function ref(food) { return food.unit === "stk" || food.unit === "tr" ? 1 : 100; }
function price(food) { return Number(food.price_per_100) || 0; }
function coeff(food, nutrient) { return (Number(food.nutrients?.[nutrient]) || 0) / ref(food); }
function poolFor(p) {
  return foods.filter(f =>
    (p.diet === "all" || f.tags?.includes(p.diet)) &&
    (!p.wholeFood || f.tags?.includes("whole_food")) &&
    (!p.noGluten || !f.tags?.includes("gluten")) &&
    price(f) > 0
  );
}
function boundsFor(p) {
  return {
    "Energy (cal)": { min: p.kcal[0], max: p.kcal[1] },
    "Protein (g)": { min: p.protein },
    "Dietary Fibre (g)": { min: p.fiber },
    "Total Fat (g)": { min: 40, max: 110 },
    "Total Carbohydrate (g)": { min: 180 },
    "Sodium (mg)": { max: p.sodiumMax || 3000 },
    "Calcium (mg)": { min: 800 },
    "Iron (mg)": { min: 10 },
    "Vitamin C (mg)": { min: 75 },
    "Cadmium (µg)": { max: 40 },
  };
}
function buildModel(pool, bounds, integer) {
  const variables = {};
  const ints = {};
  pool.forEach((food, i) => {
    const v = { cost: price(food) / ref(food) };
    for (const key of Object.keys(bounds)) {
      const n = coeff(food, key);
      if (n) v[key] = n;
    }
    variables[`f${i}`] = v;
    if (integer) ints[`f${i}`] = 1;
  });
  const model = { optimize: "cost", opType: "min", constraints: bounds, variables };
  if (integer) {
    model.ints = ints;
    model.options = { timeout: LIMIT_MS, tolerance: 0.001 };
  }
  return model;
}
function solve(pool, bounds, integer) {
  const start = performance.now();
  const raw = solver.Solve(buildModel(pool, bounds, integer));
  return { raw, ms: performance.now() - start };
}
function rowsFrom(pool, raw, rounded = false) {
  return pool.map((food, i) => ({ food, amount: rounded ? Math.round(raw[`f${i}`] || 0) : raw[`f${i}`] || 0 }))
    .filter(row => row.amount > 0);
}
function validate(rows, bounds) {
  const violations = [];
  for (const [key, b] of Object.entries(bounds)) {
    const total = rows.reduce((s, row) => s + row.amount * coeff(row.food, key), 0);
    if (b.min != null && total < b.min - Math.max(1e-4, Math.abs(b.min) * 1e-4)) violations.push(`${key}: min ${total.toFixed(4)} < ${b.min}`);
    if (b.max != null && total > b.max + Math.max(1e-4, Math.abs(b.max) * 1e-4)) violations.push(`${key}: max ${total.toFixed(4)} > ${b.max}`);
  }
  if (rows.some(row => !Number.isInteger(row.amount))) violations.push("noninteger amount");
  return violations;
}
function summarize(pool, result, bounds, extra = {}) {
  const rows = rowsFrom(pool, result.raw, true);
  const violations = result.raw.feasible ? validate(rows, bounds) : ["solver infeasible or timeout without incumbent"];
  return {
    ms: Math.round(result.ms),
    feasible: !!result.raw.feasible && violations.length === 0,
    cost: Number(rows.reduce((s, row) => s + row.amount * price(row.food) / ref(row.food), 0).toFixed(4)),
    foods: rows.length,
    candidates: pool.length,
    violations,
    ...extra,
  };
}
function extend(pool, support, bounds) {
  const seen = new Set(support);
  const out = [...support];
  for (const [key, b] of Object.entries(bounds)) {
    if (b.min == null) continue;
    const ranked = pool.filter(f => coeff(f, key) > 0)
      .sort((a, z) => coeff(z, key) / (price(z) / ref(z)) - coeff(a, key) / (price(a) / ref(a)));
    for (const food of ranked.slice(0, 3)) if (!seen.has(food)) { seen.add(food); out.push(food); }
  }
  return out;
}
function pieceBranchBound(pool, bounds, lp, supportCost) {
  if (supportCost <= lp.raw.result * 1.003 + 1e-6) return { lowerBound: lp.raw.result, ms: 0 };
  const candidates = pool.map((food, i) => ({ food, i, amount: lp.raw[`f${i}`] || 0 }))
    .filter(x => ref(x.food) === 1 && Math.abs(x.amount - Math.round(x.amount)) > 1e-5)
    .sort((a, b) => price(b.food) * Math.min(b.amount % 1, 1 - b.amount % 1) -
      price(a.food) * Math.min(a.amount % 1, 1 - a.amount % 1));
  if (!candidates.length) return { lowerBound: lp.raw.result, ms: 0 };
  const chosen = candidates[0];
  const results = [];
  let ms = 0;
  for (const branch of [{ max: Math.floor(chosen.amount) }, { min: Math.ceil(chosen.amount) }]) {
    const model = buildModel(pool, bounds, false);
    model.constraints.__integerUnitBranch = branch;
    model.variables[`f${chosen.i}`].__integerUnitBranch = 1;
    const start = performance.now();
    const result = solver.Solve(model);
    ms += performance.now() - start;
    if (result.feasible) results.push(result.result);
  }
  return { lowerBound: results.length ? Math.max(lp.raw.result, Math.min(...results)) : lp.raw.result, ms };
}

const all = { generatedAt: new Date().toISOString(), timeoutMs: LIMIT_MS, datasetCount: foods.length, profiles: [] };
for (const p of profiles) {
  const pool = poolFor(p);
  const bounds = boundsFor(p);
  const lp = solve(pool, bounds, false);
  if (!lp.raw.feasible) {
    all.profiles.push({ id: p.id, pool: pool.length, lpFeasible: false });
    process.stdout.write(`${p.id}: continuous infeasible\n`);
    continue;
  }
  const support = rowsFrom(pool, lp.raw).map(row => row.food);
  const extended = extend(pool, support, bounds);
  const roundedRows = rowsFrom(pool, lp.raw, true);
  const roundedViolations = validate(roundedRows, bounds);
  const legacy = solve(support, bounds, true);
  const supportSummary = summarize(support, legacy, bounds);
  const branch = supportSummary.feasible ? pieceBranchBound(pool, bounds, lp, supportSummary.cost) : { lowerBound: lp.raw.result, ms: 0 };
  const earlyStop = supportSummary.feasible && supportSummary.cost <= branch.lowerBound * 1.003 + 1e-6;
  const adaptive = solve(extended, bounds, true);
  const expandedSummary = summarize(extended, adaptive, bounds);
  const best = [supportSummary, earlyStop ? null : expandedSummary].filter(x => x?.feasible).sort((a, b) => a.cost - b.cost)[0];
  const needFull = !best;
  const global = solve(pool, bounds, true);
  const fullSummary = summarize(pool, global, bounds);
  const record = {
    id: p.id,
    settings: p,
    pool: pool.length,
    constraints: Object.keys(bounds).length,
    lp: { ms: Math.round(lp.ms), cost: Number(lp.raw.result.toFixed(4)), support: support.length },
    rounded: { feasible: roundedViolations.length === 0, violations: roundedViolations },
    supportMilp: supportSummary,
    expandedMilp: expandedSummary,
    fullMilp: fullSummary,
    staged: {
      ms: Math.round(lp.ms + legacy.ms + branch.ms + (earlyStop ? 0 : adaptive.ms) + (needFull ? global.ms : 0)),
      stage: needFull ? "full" : earlyStop ? "support" : "expanded",
      feasible: !!best || !!fullSummary?.feasible,
      cost: Math.min(...[best, needFull ? fullSummary : null].filter(x => x?.feasible).map(x => x.cost)),
      lowerBoundGapPct: best ? Number(((best.cost / branch.lowerBound - 1) * 100).toFixed(4)) : null,
      branchBound: Number(branch.lowerBound.toFixed(6)),
    },
  };
  all.profiles.push(record);
  fs.writeFileSync(output, JSON.stringify(all, null, 2) + "\n");
  process.stdout.write(`${p.id}: staged ${record.staged.ms}ms/${record.staged.stage}/${record.staged.feasible}\n`);
}
fs.writeFileSync(output, JSON.stringify(all, null, 2) + "\n");
