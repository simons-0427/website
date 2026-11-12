"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const PFAS4 = require(path.join(root, "pfas4-estimates.js"));
const foods = JSON.parse(fs.readFileSync(path.join(root, "database.json"), "utf8"));
const req = JSON.parse(fs.readFileSync(path.join(root, "requirements.json"), "utf8"));
const params = fs.readFileSync(path.join(root, "parameter.md"), "utf8").split(/\r?\n/).filter(Boolean);
const dbMirror = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "database.js"), "utf8"), dbMirror);
assert.equal(JSON.stringify(dbMirror.window.FOOD_DATABASE), JSON.stringify(foods), "database.js differs from JSON");
const reqMirror = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "requirements.js"), "utf8"), reqMirror);
assert.equal(JSON.stringify(reqMirror.window.REQUIREMENTS), JSON.stringify(req), "requirements.js differs from JSON");
assert.ok(foods.length > 0, "database has no foods");
for (const key of [...PFAS4.KEYS, PFAS4.SUM]) {
  assert.equal(params.filter(p => p === key).length, 1, `${key} missing or repeated in parameter.md`);
  assert.ok(req.common[key], `${key} missing from requirements.json`);
}
for (const food of foods) {
  const n = food.nutrients;
  const parts = PFAS4.KEYS.map(key => n[key]);
  assert.ok(parts.every(value => Number.isFinite(value) && value >= 0), `${food.name}: invalid component`);
  assert.ok(Number.isFinite(n[PFAS4.SUM]) && n[PFAS4.SUM] >= 0, `${food.name}: invalid sum`);
  assert.ok(Math.abs(n[PFAS4.SUM] - parts.reduce((a, b) => a + b, 0)) < 1e-6, `${food.name}: sum differs`);
}
for (const [name, sum] of [
  ["Karpfen (roh)", 1912.6], ["Lachs, Atlantik (roh)", 44.3],
  ["Seelachsfilet, gefroren", 49.8],
  ["Ei, ganz (roh)", 37.6], ["Leitungswasser", 0.31],
  ["Adzukibohnen (trocken)", 1],
]) {
  assert.equal(foods.find(food => food.name === name)?.nutrients[PFAS4.SUM], sum, name);
}
assert.equal(PFAS4.category(foods.find(food => food.name === "Seelachsfilet, gefroren")), "cod");
process.stdout.write(`${foods.length} PFAS-4 rows, sums, source examples and JS mirrors: ok\n`);
