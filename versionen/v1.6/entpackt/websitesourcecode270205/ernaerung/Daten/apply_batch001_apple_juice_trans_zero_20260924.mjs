import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json";
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const databaseIndex = 10;
const food = database[databaseIndex - 1];
const field = "Trans Fat (g)";
if (!food || food.name !== "Apfelsaft, 100%" || food.unit !== "ml") {
  throw new Error(`Unexpected record at database index ${databaseIndex}: ${food?.name} (${food?.unit})`);
}
if (food.nutrients[field] !== null && food.nutrients[field] !== 0) {
  throw new Error(`Refusing to overwrite trans fat: found ${food.nutrients[field]}`);
}
food.nutrients[field] = 0;

audit.records.push({
  databaseIndex,
  databaseName: food.name,
  source: "Matvaretabellen_2026",
  sourceName: "Apple juice",
  sourceUrl: "https://www.matvaretabellen.no/en/apple-juice/",
  valueBasis: "g per 100 ml database portion; source logical zero per 100 g",
  sourceValuesPer100g: { [field]: 0 },
  addedValues: { [field]: 0 },
  matchMethod: "Exact apple-juice item; official source explicitly classifies trans fat as a logical zero.",
  sourceConflict: "CoFID 2021 reports Tr (trace), a nonnumeric marker. It remains documented and was not itself converted to zero. The official Matvaretabellen apple-juice entry explicitly marks this nutrient as a logical zero.",
  note: "The source food is apple juice, matching the database item. The official table describes the zero as a logical zero derived by deduction, not as an analytical non-detect.",
  checkedOn: "2026-09-24",
});
audit.sources.Matvaretabellen_2026 = {
  ...(audit.sources.Matvaretabellen_2026 ?? {}),
  url: "https://www.matvaretabellen.no/en/trans-fatty-acids/",
  foodProfileUrls: [
    ...new Set([...(audit.sources.Matvaretabellen_2026?.foodProfileUrls ?? []), "https://www.matvaretabellen.no/en/apple-juice/"]),
  ],
  citation: "Official Norwegian Food Safety Authority food-composition table; item-level logical-zero metadata checked 2026-09-24.",
};
const nullRecord = audit.remainingNulls.find((item) => item.databaseIndex === databaseIndex);
if (nullRecord) {
  nullRecord.missingFields = nullRecord.missingFields.filter((item) => item !== field);
  if (nullRecord.missingFields.length === 0) {
    audit.remainingNulls = audit.remainingNulls.filter((item) => item !== nullRecord);
  }
}
for (const auditedField of audit.fields) {
  const filled = database
    .slice(audit.range.first - 1, audit.range.last)
    .filter((item) => item.nutrients[auditedField] !== null && item.nutrients[auditedField] !== undefined).length;
  audit.fieldCoverage[auditedField] = { filled, missing: audit.range.count - filled, total: audit.range.count };
}

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
