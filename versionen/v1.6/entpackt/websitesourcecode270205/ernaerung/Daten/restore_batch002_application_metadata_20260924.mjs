import fs from "node:fs";

const database = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_002_sources.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const fieldNames = [
  "Omega-3 Fatty Acids (g)",
  "Omega-6 Fatty Acids (g)",
  "Trans Fat (g)",
  "Alcohol (g)",
];

const appliedRows = [
  [101, [fieldNames[0], fieldNames[1], fieldNames[3]], "USDA SR28 NDB 20466"],
  [104, [fieldNames[3]], "USDA SR28 NDB 01077"],
  [114, fieldNames, "USDA SR28 NDB 05006"],
  [115, fieldNames, "USDA SR28 NDB 05062"],
  [121, [fieldNames[0], fieldNames[1], fieldNames[3]], "USDA SR28 NDB 15036"],
  [122, [fieldNames[0], fieldNames[1], fieldNames[3]], "USDA SR28 NDB 15039"],
  [132, [fieldNames[0], fieldNames[1], fieldNames[3]], "USDA SR28 NDB 01012"],
  [134, [fieldNames[3]], "Food-class exclusion"],
  [136, [fieldNames[3]], "Food-class exclusion"],
  [137, [fieldNames[3]], "Food-class exclusion"],
  [178, [fieldNames[3]], "Food-class exclusion"],
  [179, [fieldNames[3]], "Food-class exclusion"],
  [180, [fieldNames[3]], "Food-class exclusion"],
  [183, [fieldNames[0], fieldNames[1]], "USDA SR28 NDB 15236"],
];

const updates = [];
const appliedByField = Object.fromEntries(fieldNames.map((field) => [field, 0]));
for (const [index, fields, source] of appliedRows) {
  const food = database[index - 1];
  for (const field of fields) {
    const value = food?.nutrients?.[field];
    if (typeof value !== "number") throw new Error(`Missing applied value at ${index}: ${field}`);
    updates.push({ index, name: food.name, field, value, source });
    appliedByField[field] += 1;
  }
}

const blsRecords = audit.records.filter((record) => record.source === "BLS_4_0");
audit.databaseApplication = {
  appliedOn: "2026-09-24",
  appliedFrom: "USDA SR28 fatty-acid component totals and verified alcohol zeros; BLS 4.0 batch cross-check completed with no additional newly populated cells.",
  appliedCount: updates.length,
  appliedByField,
  updates,
  blsCrossCheck: {
    exactMatchesAudited: blsRecords.length,
    newlyPopulatedValues: 0,
    conflictsPreserved: blsRecords.reduce((sum, record) => sum + (record.conflicts?.length ?? 0), 0),
  },
};

for (const field of fieldNames) {
  const filled = database
    .slice(audit.range.first - 1, audit.range.last)
    .filter((food) => typeof food.nutrients[field] === "number").length;
  audit.fieldCoverage[field] = { filled, missing: audit.range.count - filled, total: audit.range.count };
}
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

const check = JSON.parse(fs.readFileSync(auditPath, "utf8"));
if (check.databaseApplication.appliedCount !== 29) throw new Error("Unexpected application count after metadata recovery");
console.log(JSON.stringify({
  applicationCount: check.databaseApplication.appliedCount,
  appliedByField: check.databaseApplication.appliedByField,
  fieldCoverage: check.fieldCoverage,
  blsCrossCheck: check.databaseApplication.blsCrossCheck,
}, null, 2));
