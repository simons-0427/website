import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_002_sources.json";
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const field = "Trans Fat (g)";
const sourceUrl = "https://www.fda.gov/food/food-additives-petitions/trans-fat";
const targets = [
  [101, "Grieß, Weichweizen"],
  [109, "Haferflocken (trocken)"],
  [111, "Haferflocken, kernig (Discounter)"],
  [112, "Haferkleie"],
  [113, "Haferkleie, fein"],
  [118, "Haselnüsse"],
  [126, "Hirse (trocken)"],
  [127, "Hirseflocken (trocken)"],
  [135, "Jackfruit, Dose (in Wasser, abgetropft)"],
  [144, "Kakao, stark entölt (Pulver)"],
  [154, "Kartoffelstärke"],
  [174, "Kokosraspeln, ungesüßt"],
  [191, "Leinsamen"],
  [200, "Macadamianüsse"],
];

const records = [];
for (const [index, expectedName] of targets) {
  const food = database[index - 1];
  if (!food || food.name !== expectedName || food.unit !== "g") {
    throw new Error(`Unexpected food identity or unit at database index ${index}`);
  }
  if (food.nutrients[field] !== null && food.nutrients[field] !== 0) {
    throw new Error(`Refusing to overwrite ${food.name}: ${field}=${food.nutrients[field]}`);
  }
  food.nutrients[field] = 0;
  records.push({
    databaseIndex: index,
    databaseName: expectedName,
    source: "FDA_food_identity_inference",
    sourceName: "FDA Trans Fat overview",
    sourceUrl,
    matchMethod: "single_ingredient_nonruminant_food_without_hydrogenated_oil",
    confidence: "high",
    valueBasis: "g per 100 g edible food",
    sourceValuesPer100g: {},
    targetTotalFatPer100g: food.nutrients["Total Fat (g)"] ?? null,
    calculation: "Assigned 0 g for an unseasoned, single-ingredient cereal, plant food, or starch with no ruminant ingredient or partially hydrogenated oil. FDA identifies ruminant foods and partially hydrogenated oils as the recognized dietary sources. The rule is not applied to dairy, meat, fish, mixed products, or unspecified/refined edible oils.",
    values: { [field]: 0 },
    checkedOn: "2026-09-24",
  });
}

audit.sources.FDA_trans_fat_food_identity_rule = {
  url: sourceUrl,
  citation: "U.S. Food and Drug Administration, Trans Fat overview. It describes partially hydrogenated oils as the major former artificial source and natural trans fat in products from ruminant animals. Applied here only to listed single-ingredient foods without either source pathway.",
};
const existingIndexes = new Set(audit.records.filter((item) => item.source === "FDA_food_identity_inference").map((item) => item.databaseIndex));
for (const record of records) {
  if (existingIndexes.has(record.databaseIndex)) throw new Error(`Duplicate FDA inference record for ${record.databaseIndex}`);
}
audit.records.push(...records);
audit.databaseApplication.appliedCount += records.length;
audit.databaseApplication.appliedByField[field] += records.length;
for (const record of records) {
  audit.databaseApplication.updates.push({
    index: record.databaseIndex,
    name: record.databaseName,
    field,
    value: 0,
    source: "FDA food-identity inference",
    note: record.calculation,
  });
}
const batch = database.slice(audit.range.first - 1, audit.range.last);
for (const name of audit.fields) {
  const filled = batch.filter((food) => typeof food.nutrients[name] === "number").length;
  audit.fieldCoverage[name] = { filled, missing: audit.range.count - filled, total: audit.range.count };
}
audit.checkedOn = "2026-09-24";

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
const databaseCheck = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const auditCheck = JSON.parse(fs.readFileSync(auditPath, "utf8"));
for (const record of records) {
  if (databaseCheck[record.databaseIndex - 1].nutrients[field] !== 0) throw new Error(`Read-back mismatch at ${record.databaseIndex}`);
}
console.log(JSON.stringify({ applied: records.length, fieldCoverage: auditCheck.fieldCoverage, applicationCount: auditCheck.databaseApplication.appliedCount }, null, 2));
