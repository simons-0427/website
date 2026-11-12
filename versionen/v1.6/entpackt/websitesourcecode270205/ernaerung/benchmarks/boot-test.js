"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const PFAS4 = require(path.join(root, "pfas4-estimates.js"));
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
assert.ok(inline, "inline script missing");
const foodSample = JSON.parse(fs.readFileSync(path.join(root, "database.json"), "utf8")).slice(0, 3);
const requirements = JSON.parse(fs.readFileSync(path.join(root, "requirements.json"), "utf8"));

async function check(pageUrl, expectedPrefix) {
  const requested = [];
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
    window: { location: { href: pageUrl }, addEventListener() {} },
    document: {
      getElementById() { return element; },
      querySelector() { return element; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    localStorage: {
      getItem() { return null; },
      setItem() { throw new Error("QuotaExceededError"); },
      removeItem() {},
    },
    URL,
    fetch: async input => {
      const pathname = new URL(input).pathname;
      requested.push(pathname);
      if (pathname === expectedPrefix + "database.json") return { ok: true, json: async () => foodSample };
      if (pathname === expectedPrefix + "requirements.json") return { ok: true, json: async () => requirements };
      return { ok: false, status: 404 };
    },
    console,
    setTimeout,
    clearTimeout,
  };
  const hook = `
initProfile = () => {};
initReq = () => {};
render = () => {};
globalThis.bootTest = { boot, count: () => foods.length };
`;
  vm.runInNewContext(inline.replace(/initMarketSettings\(\);\s*boot\(\);\s*$/, "") + hook, context);
  await context.bootTest.boot();
  assert.equal(context.bootTest.count(), foodSample.length, "database did not initialize");
  assert.ok(requested.includes(expectedPrefix + "database.json"));
  assert.ok(requested.includes(expectedPrefix + "parameter.md"));
  assert.ok(requested.includes(expectedPrefix + "requirements.json"));
}

(async () => {
  await check("http://localhost:8000/benchmarks/index.html", "/");
  await check("http://localhost:8000/ernaerung/benchmarks/index.html", "/ernaerung/");
  process.stdout.write("benchmark database paths and storage quota fallback: ok\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
