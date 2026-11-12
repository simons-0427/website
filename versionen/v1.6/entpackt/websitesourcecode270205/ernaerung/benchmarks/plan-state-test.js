"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const PFAS4 = require(path.join(root, "pfas4-estimates.js"));
const meta = JSON.parse(fs.readFileSync(path.join(root, "requirements.json"), "utf8"));
const food = JSON.parse(fs.readFileSync(path.join(root, "database.json"), "utf8"))[0];
const params = fs.readFileSync(path.join(root, "parameter.md"), "utf8");

async function check(relativePath) {
  const html = fs.readFileSync(path.join(root, relativePath), "utf8");
  const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(inline, `inline script missing: ${relativePath}`);
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) {
      const target = { hidden: true, clicks: 0 };
      const element = new Proxy(target, {
        get(value, key) {
          if (key === "addEventListener" || key === "removeEventListener") return () => {};
          if (key === "querySelectorAll") return () => [];
          if (key === "querySelector") return () => element;
          if (key === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
          if (key === "style" || key === "dataset") return {};
          if (key === "click") return () => { target.clicks++; if (element.onclick) element.onclick(); };
          return value[key];
        },
        set(value, key, next) { value[key] = next; return true; },
      });
      elements.set(id, element);
    }
    return elements.get(id);
  };
  const saved = new Map();
  const context = {
    PFAS4,
    solver: { Solve() { throw new Error("unexpected direct solver call"); } },
    window: { addEventListener() {} },
    document: {
      getElementById: getElement,
      querySelector() { return getElement("query"); },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    localStorage: {
      getItem(key) { return saved.get(key) ?? null; },
      setItem(key, value) { saved.set(key, value); },
      removeItem(key) { saved.delete(key); },
    },
    performance,
    URL,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { callback(); },
  };
  const hook = `
globalThis.solveCalls = 0;
globalThis.renderCalls = 0;
const realRenderReq = renderReq;
renderPlan = () => { globalThis.renderCalls++; };
renderProfile = () => {};
renderReq = () => {};
updatePlanPoolInfo = () => {};
solveModelAsync = async () => {
  globalThis.solveCalls++;
  return { feasible: true, result: 1, f0: 1 };
};
globalThis.planTest = {
  setup(meta, food, params) {
    reqMeta = meta;
    PARAMS = orderParams(parseParams(params));
    userProfile = defaultUserProfile();
    req = buildProfileReq(userProfile);
    foods = [normalizeFood(food)];
    integerAmounts = false;
  },
  applyProfileFromUser,
  saveReq,
  saveFoods,
  normalizeFood,
  solverConstraintSpecs,
  groupParamsForPlan,
  paramsForReqDisplay,
  renderReqReal: realRenderReq,
  getReq: () => req,
  getPlan: () => plan,
  getPending: () => planPending,
};`;
  vm.runInNewContext(inline.replace(/initMarketSettings\(\);\s*boot\(\);\s*$/, "") + hook, context);
  context.planTest.setup(meta, food, params);
  const pfasReq = context.planTest.getReq()[PFAS4.SUM];
  assert.equal(pfasReq.max, 251.4, `${relativePath}: 80 kg PFAS-4 planning limit`);
  const pfasSpec = context.planTest.solverConstraintSpecs(context.planTest.getReq())
    .find(spec => spec.key === PFAS4.SUM);
  assert.deepEqual(Array.from(pfasSpec.coeffsFrom), PFAS4.KEYS, `${relativePath}: PFAS-4 must sum four components`);
  const groups = context.planTest.groupParamsForPlan(context.planTest.paramsForReqDisplay());
  assert.deepEqual(Array.from(groups.at(-1).keys).slice(-5), [PFAS4.SUM, ...PFAS4.KEYS],
    `${relativePath}: PFAS-4 must appear at the bottom of requirements`);
  context.planTest.renderReqReal();
  const reqHtml = getElement("reqGrid").innerHTML;
  assert.match(reqHtml, /class="aa-group">PFAS-4/);
  assert.match(reqHtml, /class="aa-child">PFOS/);
  const sample = context.planTest.normalizeFood({ name: "Karpfen (roh)", unit: "g", category: "fisch", nutrients: {} });
  assert.equal(sample.nutrients[PFAS4.SUM], 1912.6, `${relativePath}: missing PFAS values must get the species estimate`);
  const calc = getElement("calc");
  const notice = getElement("planChangeNotice");
  calc.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(context.solveCalls, 1, `${relativePath}: first click did not solve once`);
  assert.ok(context.planTest.getPlan(), `${relativePath}: no first plan`);
  assert.equal(notice.hidden, true);
  const oldPlan = context.planTest.getPlan();
  context.planTest.applyProfileFromUser(true);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(context.solveCalls, 1, `${relativePath}: profile change started solver`);
  assert.equal(calc.clicks, 1, `${relativePath}: profile change clicked button`);
  assert.equal(context.planTest.getPlan(), oldPlan, `${relativePath}: old plan was removed`);
  assert.equal(notice.hidden, false, `${relativePath}: stale hint missing`);
  calc.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(context.solveCalls, 2, `${relativePath}: second click did not solve`);
  assert.notEqual(context.planTest.getPlan(), oldPlan, `${relativePath}: plan was not refreshed`);
  assert.equal(notice.hidden, true, `${relativePath}: stale hint did not clear`);
  context.planTest.saveFoods();
  assert.equal(context.solveCalls, 2, `${relativePath}: food edit started solver`);
  assert.equal(notice.hidden, false, `${relativePath}: food edit did not mark plan stale`);
  assert.equal(context.planTest.getPending(), false);
  process.stdout.write(`${relativePath}: click-only calculation and stale hint ok\n`);
}

(async () => {
  await check("index.html");
  await check(path.join("benchmarks", "index.html"));
  if (process.env.EN_INDEX_OVERRIDE) await check(process.env.EN_INDEX_OVERRIDE);
  else await check(path.join("..", "en", "nutrition", "index.html"));
})().catch(error => { console.error(error); process.exitCode = 1; });
