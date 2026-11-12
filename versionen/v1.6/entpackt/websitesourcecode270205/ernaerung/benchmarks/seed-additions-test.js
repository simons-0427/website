"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const PFAS4 = require(path.join(root, "pfas4-estimates.js"));
const seed = JSON.parse(fs.readFileSync(path.join(root, "database.json"), "utf8"));

function check(relativePath) {
  const html = fs.readFileSync(path.join(root, relativePath), "utf8");
  const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(inline, `inline script missing: ${relativePath}`);
  const storage = new Map();
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
    window: { addEventListener() {} },
    document: {
      getElementById() { return element; },
      querySelector() { return element; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
    console,
    performance,
    setTimeout,
    clearTimeout,
  };
  const hook = `
saveFoods = () => {
  const target = typeof benchmarkStorage === "undefined" ? localStorage : benchmarkStorage;
  target.setItem(LS_FOODS, JSON.stringify(foods));
};
globalThis.seedMigrationTest = {
  initFoods,
  getFoods: () => foods,
  savedKey: LS_FOODS,
  migrationDone: () => (typeof benchmarkStorage === "undefined" ? localStorage : benchmarkStorage).getItem(LS_FOOD_ADDITIONS_20261021),
  deleteFood(name) { foods = foods.filter(food => food.name !== name); saveFoods(); },
};`;
  vm.runInNewContext(inline.replace(/initMarketSettings\(\);\s*boot\(\);\s*$/, "") + hook, context);
  const api = context.seedMigrationTest;

  const oldFoods = structuredClone(seed.slice(0, 1516));
  oldFoods[0].price_per_100 = 123.456;
  const custom = structuredClone(oldFoods[0]);
  custom.name = "Benutzerdefinierter Testeintrag";
  custom.name_en = "Custom test food";
  oldFoods.push(custom);
  storage.set(api.savedKey, JSON.stringify(oldFoods));
  api.initFoods(seed);
  assert.equal(api.getFoods().length, seed.length + 1, `${relativePath}: new seed foods missing`);
  assert.equal(api.getFoods()[0].price_per_100, 123.456, `${relativePath}: user price overwritten`);
  assert.ok(api.getFoods().some(food => food.name === (relativePath.startsWith("..") ? custom.name_en : custom.name)), `${relativePath}: custom food lost`);
  assert.equal(api.migrationDone(), "done", `${relativePath}: migration flag missing`);

  const newName = api.getFoods().at(-1).name;
  api.deleteFood(newName);
  api.initFoods(seed);
  assert.equal(api.getFoods().length, seed.length, `${relativePath}: intentionally deleted food restored`);
  assert.ok(!api.getFoods().some(food => food.name === newName));
  storage.clear();
  api.initFoods(seed.slice(0, 1516));
  assert.equal(api.migrationDone(), null, `${relativePath}: old seed marked as migrated`);
  api.initFoods(seed);
  assert.equal(api.getFoods().length, seed.length, `${relativePath}: later seed update not imported`);
  storage.clear();
  api.initFoods(seed);
  assert.equal(api.getFoods().length, seed.length, `${relativePath}: fresh database count`);
  console.log(`${relativePath}: saved edits and new foods preserved`);
}

for (const page of ["index.html", "benchmarks/index.html", "../en/nutrition/index.html"]) check(page);
