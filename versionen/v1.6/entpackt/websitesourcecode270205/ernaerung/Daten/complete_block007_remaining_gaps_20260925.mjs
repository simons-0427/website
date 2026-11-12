import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const databasePath = path.join(rootDir, "database.json");
const auditPath = path.join(scriptDir, "database_V2_block_007_remaining_gaps_20260925.json");
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));

const fattyAcidFields = [
  "Omega-3 Fatty Acids (g)",
  "Omega-6 Fatty Acids (g)",
  "Trans Fat (g)",
  "Alcohol (g)",
  "Alpha-Linolenic Acid (ALA) (g)",
  "Eicosapentaenoic Acid (EPA) (g)",
  "Docosahexaenoic Acid (DHA) (g)",
];

const transZeroFoods = [
  [603, "Äpfel, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [605, "Pfirsiche, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [606, "Erdbeeren, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [607, "Himbeeren, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [608, "Brombeeren, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [609, "Bananen, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [611, "Papaya, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [612, "Korinthen, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [613, "Ananas, getrocknet", "Dried fruit without added fat; composition-based zero."],
  [614, "Trockenfrucht-Mix", "Fruit mix without named added fat; composition-based zero."],
  [623, "Mehrfruchtsaft, vitaminangereichert", "Fruit juice with no fat ingredient; composition-based zero."],
  [624, "Roter Mehrfruchtsaft", "Fruit juice with no fat ingredient; composition-based zero."],
  [625, "Smoothie purpur", "Fruit smoothie with no fat ingredient; composition-based zero."],
  [626, "Himbeersaft, 100%", "100% fruit juice; composition-based zero."],
  [628, "Mangosaft, 100%", "100% fruit juice; composition-based zero."],
  [638, "Knollensellerie, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [643, "Feldsalat, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [648, "Brennnessel, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [650, "Sauerampfer, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [651, "Gartenkresse, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [656, "Fenchelblatt, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [666, "Dicke Bohne unreif, roh", "Raw legume; no animal or hydrogenated fat source."],
  [678, "Spitzkohl, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [686, "Wurzelpetersilie, roh", "Raw plant food; no animal or hydrogenated fat source."],
  [687, "Nori-Blatt, geröstet", "Seaweed without animal or hydrogenated fat source."],
  [693, "Hefe Flocken/Nährhefe", "Yeast flakes without animal or hydrogenated fat source."],
  [695, "Erbse reif", "Plain plant food; no animal or hydrogenated fat source."],
  [698, "Mandeldrink ungesüßt, angereichert mit Vitaminen und Calcium", "Estimated zero for generic plant drink; brand-specific trace amounts are not available."],
  [699, "Dessert/Puddingalternative, pflanzlich, angereichert mit Vitaminen und Calcium", "Estimated zero for generic plant-based dessert; recipe-specific oils are not available."],
  [700, "Pommes frites tiefgefroren, frittiert", "Estimated zero for generic fried potato with vegetable oil; the exact frying-oil profile is unavailable."],
];

const updates = [];
for (const [databaseIndex, expectedName, note] of transZeroFoods) {
  const food = database[databaseIndex - 1];
  if (!food || food.name !== expectedName) {
    throw new Error(`Unexpected food at database index ${databaseIndex}: ${food?.name ?? "missing"}`);
  }
  if (food.nutrients["Trans Fat (g)"] !== null) {
    throw new Error(`Trans fat is not null at ${databaseIndex}: ${expectedName}`);
  }
  food.nutrients["Trans Fat (g)"] = 0;
  updates.push({
    databaseIndex,
    databaseName: expectedName,
    field: "Trans Fat (g)",
    previous: null,
    value: 0,
    method: databaseIndex >= 698 ? "estimated_zero" : "composition_based_zero",
    confidence: databaseIndex >= 698 ? "medium-low" : "medium-high",
    note,
    checkedOn: "2026-09-25",
  });
}

const cabbageIndex = 678;
const cabbage = database[cabbageIndex - 1];
if (cabbage?.name !== "Spitzkohl, roh" || cabbage.nutrients["Omega-6 Fatty Acids (g)"] !== null) {
  throw new Error("Spitzkohl row does not match the expected unresolved Omega-6 field.");
}
cabbage.nutrients["Omega-6 Fatty Acids (g)"] = 0.0265;
updates.push({
  databaseIndex: cabbageIndex,
  databaseName: cabbage.name,
  field: "Omega-6 Fatty Acids (g)",
  previous: null,
  value: 0.0265,
  method: "near_match_estimate",
  confidence: "medium",
  source: "BLS 4.0, code G342100, Weißkohl roh, Omega-6 = 0.0265 g/100 g",
  sourceUrl: "https://blsdb.de/download",
  sourceNote: "The exact BLS Spitzkohl profile (G344100) has a dash for Omega-6, not a numeric zero. Used the closest raw cabbage profile, Weißkohl, because it is a closely related raw cabbage and its recorded total fat (0.19 g/100 g) is close to the Spitzkohl profile (0.18 g/100 g).",
  checkedOn: "2026-09-25",
});

const block = database.slice(600, 700);
const remaining = [];
for (let offset = 0; offset < block.length; offset += 1) {
  const food = block[offset];
  for (const field of fattyAcidFields) {
    if (food.nutrients[field] === null || food.nutrients[field] === undefined) {
      remaining.push({ databaseIndex: 601 + offset, databaseName: food.name, field });
    }
  }
}
if (remaining.length) throw new Error(`Block still has ${remaining.length} missing target values.`);

for (const [offset, food] of block.entries()) {
  const fat = Number(food.nutrients["Total Fat (g)"]);
  const omegaSum = Number(food.nutrients["Omega-3 Fatty Acids (g)"]) + Number(food.nutrients["Omega-6 Fatty Acids (g)"]);
  if ([fat, omegaSum].every(Number.isFinite) && omegaSum > fat + 0.05) {
    throw new Error(`Omega sum exceeds total fat by >0.05 g at database index ${601 + offset}: ${food.name}`);
  }
  for (const field of fattyAcidFields) {
    const value = food.nutrients[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid ${field} at database index ${601 + offset}: ${food.name} = ${value}`);
    }
  }
}

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
const reread = JSON.parse(fs.readFileSync(databasePath, "utf8"));
for (const update of updates) {
  const value = reread[update.databaseIndex - 1]?.nutrients?.[update.field];
  if (value !== update.value) throw new Error(`Read-back mismatch at ${update.databaseIndex}: ${update.field}`);
}

const audit = {
  batch: 7,
  range: { first: 601, last: 700, count: 100 },
  checkedOn: "2026-09-25",
  method: "Fast completion using composition-based zeros for clear plant-only foods and one close-match profile for Spitzkohl. Packaged plant-based foods and generic fried fries are marked as estimates.",
  updates,
  verification: {
    databaseFoodCount: reread.length,
    targetFields: fattyAcidFields,
    missingTargetFieldsInBlock: 0,
    negativeTargetValuesInBlock: 0,
    omega3PlusOmega6ExceedsFatByMoreThan0_05g: 0,
    readBackVerified: true,
  },
};
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  batch: audit.batch,
  range: audit.range,
  transFatZeros: transZeroFoods.length,
  omega6NearMatchEstimates: 1,
  missingTargetFieldsInBlock: 0,
  auditPath,
}, null, 2));
