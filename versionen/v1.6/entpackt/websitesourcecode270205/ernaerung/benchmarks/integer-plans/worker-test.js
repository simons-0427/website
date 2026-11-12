"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const messages = [];
const context = vm.createContext({
  self: { postMessage(message) { messages.push(message); } },
  importScripts(file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  },
});
vm.runInContext(fs.readFileSync(path.join(root, "plan-worker.js"), "utf8"), context, { filename: "plan-worker.js" });
const model = {
  optimize: "cost",
  opType: "min",
  constraints: { protein: { min: 20 } },
  variables: { A: { cost: 1, protein: 10 }, B: { cost: 3, protein: 20 } },
};
context.self.onmessage({ data: model });
assert.equal(messages[0].ok, true);
assert.equal(messages[0].result.feasible, true);
assert.equal(messages[0].result.result, 2);
context.self.onmessage({ data: { batchModels: [model, model] } });
assert.equal(messages[1].ok, true);
assert.equal(messages[1].results.length, 2);
assert.ok(messages[1].results.every(result => result.feasible && result.result === 2));
process.stdout.write("single and batch worker protocol: ok\n");
