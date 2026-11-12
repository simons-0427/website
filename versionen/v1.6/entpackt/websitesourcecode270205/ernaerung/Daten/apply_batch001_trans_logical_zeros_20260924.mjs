import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json";
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const field = "Trans Fat (g)";
const updates = [
  {
    databaseIndex: 34,
    databaseName: "Brötchen, Weizen",
    sourceName: "Rolls, white, industrially made",
    sourceUrl: "https://www.matvaretabellen.no/en/rolls-white-industrially-made/",
    value: 0,
    matchMethod: "Generic industrial white wheat roll; category match, not exact recipe.",
    sourceTotalFatPer100g: null,
    databaseTotalFatPer100g: 2.5,
  },
  {
    databaseIndex: 37,
    databaseName: "Bulgur (trocken)",
    sourceName: "Bulgur, uncooked",
    sourceUrl: "https://www.matvaretabellen.no/en/bulgur-uncooked/",
    value: 0,
    matchMethod: "Exact dry/uncooked bulgur item; the official table classifies its trans-fat value as a logical zero.",
    sourceTotalFatPer100g: null,
    databaseTotalFatPer100g: 1.3,
  },
  {
    databaseIndex: 52,
    databaseName: "Couscous (trocken)",
    sourceName: "Couscous, uncooked",
    sourceUrl: "https://www.matvaretabellen.no/en/couscous-uncooked/",
    value: 0,
    matchMethod: "Exact dry/uncooked couscous item; official table reports a naturally occurring zero.",
    sourceTotalFatPer100g: 2.1,
    databaseTotalFatPer100g: 0.6,
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
    ...(update.sourceTotalFatPer100g === null ? {} : { sourceTotalFatPer100g: update.sourceTotalFatPer100g }),
    databaseTotalFatPer100g: update.databaseTotalFatPer100g,
    matchMethod: update.matchMethod,
    note: "Official Norwegian Food Safety Authority food-composition-table value, checked 2026-09-24. For products with recipe variation, the source is recorded as a generic category match.",
    addedValues: { [field]: update.value },
    checkedOn: "2026-09-24",
  });
}

audit.sources.Matvaretabellen_2026 = {
  url: "https://www.matvaretabellen.no/en/trans-fatty-acids/",
  foodProfileUrls: updates.map((item) => item.sourceUrl),
  citation: "Official Norwegian Food Safety Authority food-composition table; values per 100 g, checked 2026-09-24.",
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
  audit.fieldCoverage[auditedField] = {
    filled,
    missing: audit.range.count - filled,
    total: audit.range.count,
  };
}

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
