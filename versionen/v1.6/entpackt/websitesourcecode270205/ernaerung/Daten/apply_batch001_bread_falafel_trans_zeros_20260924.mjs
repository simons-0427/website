import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json";
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const field = "Trans Fat (g)";
const updates = [
  {
    databaseIndex: 56,
    databaseName: "Dinkelbrot",
    sourceName: "Bread, wholemeal flour, wheat and rye, home-made",
    sourceUrl: "https://www.matvaretabellen.no/en/bread-wholemeal-flour-wheat-and-rye-home-made/",
    value: 0,
    sourceMacros: { fat: 2.4, protein: 8.4, carbohydrate: 44.4 },
    databaseMacros: { fat: 2.5, protein: 9, carbohydrate: 45 },
    matchMethod: "Close bread-profile match: wholemeal wheat/rye bread versus spelt bread; fat, protein, and carbohydrate are nearly identical. Source calculates zero trans fat as a recipe value.",
  },
  {
    databaseIndex: 80,
    databaseName: "Falafel, fertig (gefroren, roh)",
    sourceName: "Falafel, chickpeas balls, industrially made",
    sourceUrl: "https://www.matvaretabellen.no/en/falafel-chickpeas-balls-industrially-made/",
    value: 0,
    sourceMacros: { fat: 9.4, protein: 7.8, carbohydrate: 17.9 },
    databaseMacros: { fat: 12, protein: 8, carbohydrate: 28 },
    matchMethod: "Same industrial chickpea-falafel product category, but source is prepared/cooked and the recipe macros differ. Only the official logical-zero trans-fat value is transferred; omega values are not transferred.",
  },
];

for (const update of updates) {
  const food = database[update.databaseIndex - 1];
  if (!food || food.name !== update.databaseName) {
    throw new Error(`Unexpected record at database index ${update.databaseIndex}: ${food?.name}`);
  }
  const current = food.nutrients[field];
  if (current !== null && current !== update.value) {
    throw new Error(`Refusing to overwrite ${food.name}: found ${current}`);
  }
  food.nutrients[field] = update.value;
  audit.records.push({
    databaseIndex: update.databaseIndex,
    databaseName: update.databaseName,
    source: "Matvaretabellen_2026",
    sourceName: update.sourceName,
    sourceUrl: update.sourceUrl,
    valueBasis: "g per 100 g edible portion",
    sourceValuesPer100g: { [field]: update.value },
    sourceMacrosPer100g: update.sourceMacros,
    databaseMacrosPer100g: update.databaseMacros,
    matchMethod: update.matchMethod,
    note: "Official Norwegian Food Safety Authority food-composition table. Its item pages classify trans fat as a logical zero; proxy limitations are recorded above.",
    addedValues: { [field]: update.value },
    checkedOn: "2026-09-24",
  });
}

audit.sources.Matvaretabellen_2026 = {
  ...(audit.sources.Matvaretabellen_2026 ?? {}),
  url: "https://www.matvaretabellen.no/en/trans-fatty-acids/",
  foodProfileUrls: [
    ...new Set([...(audit.sources.Matvaretabellen_2026?.foodProfileUrls ?? []), ...updates.map((item) => item.sourceUrl)]),
  ],
  citation: "Official Norwegian Food Safety Authority food-composition table; item-level values and source details checked 2026-09-24.",
};
for (const update of updates) {
  const nullRecord = audit.remainingNulls.find((item) => item.databaseIndex === update.databaseIndex);
  if (nullRecord) {
    nullRecord.missingFields = nullRecord.missingFields.filter((item) => item !== field);
    if (nullRecord.missingFields.length === 0) {
      audit.remainingNulls = audit.remainingNulls.filter((item) => item !== nullRecord);
    }
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
