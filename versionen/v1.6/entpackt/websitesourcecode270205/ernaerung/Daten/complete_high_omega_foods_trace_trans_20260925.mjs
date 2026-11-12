import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const databasePath = path.join(rootDir, "database.json");
const sourceAuditPath = path.join(scriptDir, "database_V2_fatty_acids_alcohol_batch_016_sources.json");
const auditPath = path.join(scriptDir, "database_V2_high_omega_foods_trace_trans_20260925.json");
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, "utf8"));
const foodIndex = 1503;
const food = database[foodIndex - 1];

if (database.length !== 1516 || food?.name !== "Lachs, Zucht, gedämpft") {
  throw new Error("Unexpected database size or food at index 1503.");
}
if (food.nutrients["Trans Fat (g)"] !== null) {
  throw new Error("Expected the farmed steamed salmon trans-fat value to be unresolved.");
}

const sourceRecord = sourceAudit.records.find(record =>
  record.databaseIndex === foodIndex && record.source === "CoFID_2021",
);
const comparison = sourceRecord?.internetCrossChecks?.find(record =>
  record.field === "Trans Fat (g)" && record.valuePer100g === 0,
);
if (sourceRecord?.sourceValuesPer100g?.["Trans Fat (g)"] !== "Tr" || !comparison) {
  throw new Error("The exact CoFID trace marker and zero-valued official comparator were not found.");
}

food.nutrients["Trans Fat (g)"] = 0;
const fields = [
  "Omega-3 Fatty Acids (g)",
  "Omega-6 Fatty Acids (g)",
  "Trans Fat (g)",
  "Alcohol (g)",
  "Alpha-Linolenic Acid (ALA) (g)",
  "Eicosapentaenoic Acid (EPA) (g)",
  "Docosahexaenoic Acid (DHA) (g)",
];
const additions = database.slice(1500, 1516);
const missing = [];
const invalid = [];
for (let offset = 0; offset < additions.length; offset += 1) {
  const item = additions[offset];
  const databaseIndex = 1501 + offset;
  if (Number(item.nutrients["Omega-3 Fatty Acids (g)"]) < 1) {
    invalid.push({ databaseIndex, food: item.name, issue: "not_high_omega3" });
  }
  for (const field of fields) {
    const value = item.nutrients[field];
    if (value === null || value === undefined) missing.push({ databaseIndex, food: item.name, field });
    else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      invalid.push({ databaseIndex, food: item.name, field, value });
    }
  }
}
if (missing.length || invalid.length) {
  throw new Error(JSON.stringify({ missing, invalid }, null, 2));
}

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
const reread = JSON.parse(fs.readFileSync(databasePath, "utf8"));
if (reread[foodIndex - 1]?.nutrients?.["Trans Fat (g)"] !== 0) {
  throw new Error("Read-back check failed for the trace-level zero.");
}

const audit = {
  checkedOn: "2026-09-25",
  scope: { firstDatabaseIndex: 1501, lastDatabaseIndex: 1516, count: 16 },
  update: {
    databaseIndex: foodIndex,
    databaseName: food.name,
    field: "Trans Fat (g)",
    previous: null,
    value: 0,
    method: "trace_to_zero_at_database_precision",
    note: "Exact CoFID 2021 profile reports Tr (trace, not numeric zero). A same-species farmed-salmon comparator from Matvaretabellen reports 0 g/100 g. Stored as 0 for this planner's numeric field at database precision; this is an approximation, not an analytical zero for the exact steamed item.",
    sources: [
      {
        label: "CoFID 2021, Salmon, farmed, flesh only, steamed",
        sourceCode: "16-358",
        sourceUrl: "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid",
        reportedMarker: "Tr",
      },
      {
        label: "Matvaretabellen, farmed salmon, simmered",
        sourceFoodId: "04.225",
        sourceUrl: "https://www.matvaretabellen.no/en/salmon-farmed-slices-simmered/",
        valuePer100g: 0,
      },
    ],
  },
  verification: {
    highOmega3FoodCount: additions.length,
    allHaveOmega3AtLeast1gPer100g: true,
    missingTargetFields: 0,
    negativeTargetValues: 0,
    readBackVerified: true,
  },
};
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify(audit, null, 2));
