import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json";
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const field = "Trans Fat (g)";
const updates = [
  {
    databaseIndex: 20,
    databaseName: "Bergkäse / Hartkäse",
    value: 0.6,
    sourceName: "Cheese, gruyere",
    sourceUrl: "https://www.matvaretabellen.no/en/cheese-gruyere/",
    fattyAcidListUrl: "https://www.matvaretabellen.no/en/trans-fatty-acids/",
    sourceTotalFatPer100g: 32.3,
    sourceProteinPer100g: 29.8,
    databaseTotalFatPer100g: 32,
    databaseProteinPer100g: 28,
    matchMethod: "Closest hard-cheese profile by total fat and protein; Gruyere has 32.3 g fat and 29.8 g protein per 100 g versus 32 g and 28 g in the database.",
  },
  {
    databaseIndex: 85,
    databaseName: "Feta / Schafskäse",
    value: 0.7,
    sourceName: "Cheese, goat milk, Feta",
    sourceUrl: "https://www.matvaretabellen.no/en/cheese-goat-milk-feta/",
    fattyAcidListUrl: "https://www.matvaretabellen.no/en/trans-fatty-acids/",
    sourceTotalFatPer100g: 20.8,
    sourceProteinPer100g: 18.1,
    databaseTotalFatPer100g: 21.3,
    databaseProteinPer100g: 14.2,
    matchMethod: "Same feta cheese category; total fat is close, while protein differs, so this is a category-level proxy rather than an exact product match.",
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
    fattyAcidListUrl: update.fattyAcidListUrl,
    valueBasis: "g per 100 g edible portion",
    sourceValuesPer100g: { [field]: update.value },
    sourceTotalFatPer100g: update.sourceTotalFatPer100g,
    sourceProteinPer100g: update.sourceProteinPer100g,
    databaseTotalFatPer100g: update.databaseTotalFatPer100g,
    databaseProteinPer100g: update.databaseProteinPer100g,
    matchMethod: update.matchMethod,
    note: "Trans-fat value is from the official Norwegian Food Safety Authority food-composition table. The source's trans-fat list and linked food profile agree; value is transferred as a generic category match, not represented as an exact laboratory match.",
    addedValues: { [field]: update.value },
    checkedOn: "2026-09-24",
  });
}

audit.sources.Matvaretabellen_2026 = {
  url: "https://www.matvaretabellen.no/en/trans-fatty-acids/",
  foodProfileUrls: updates.map((item) => item.sourceUrl),
  citation: "Official Norwegian Food Safety Authority food-composition table; trans-fat values per 100 g, checked 2026-09-24.",
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
