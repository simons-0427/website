import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json";
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const databaseIndex = 51;
const row = database[databaseIndex - 1];
const values = {
  "Omega-3 Fatty Acids (g)": 0.009,
  "Omega-6 Fatty Acids (g)": 0.049,
};

if (row?.name !== "Cottage Cheese 2%") {
  throw new Error(`Unexpected record at database index ${databaseIndex}: ${row?.name}`);
}

for (const [field, value] of Object.entries(values)) {
  const current = row.nutrients[field];
  if (current !== null && current !== value) {
    throw new Error(`Refusing to overwrite ${field}: found ${current}, expected null or ${value}`);
  }
  row.nutrients[field] = value;
}

const record = audit.records.find(
  (item) => item.databaseIndex === databaseIndex && item.source === "USDA_FoodData_Central_SR_Legacy_2018",
);
if (!record) throw new Error("Expected USDA SR Legacy source audit record was not found");

record.confirmationSource = {
  source: "USDA_SR28_2015",
  sourceCode: "NDB 01015",
  sourceName: "Cheese, cottage, lowfat, 2% milkfat",
  url: "https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg01.pdf",
  valueBasis: "per 100 g edible portion",
  components: {
    omega3: [
      { component: "18:3 n-3 (ALA)", amountPer100g: 0.007 },
      { component: "20:3 n-3", amountPer100g: 0 },
      { component: "20:5 n-3 (EPA)", amountPer100g: 0.001 },
      { component: "22:5 n-3 (DPA)", amountPer100g: 0.001 },
      { component: "22:6 n-3 (DHA)", amountPer100g: 0 },
    ],
    omega6: [
      { component: "18:2 n-6", amountPer100g: 0.047 },
      { component: "18:3 n-6", amountPer100g: 0 },
      { component: "20:2 n-6", amountPer100g: 0 },
      { component: "20:3 n-6", amountPer100g: 0.002 },
      { component: "20:4 n-6", amountPer100g: null, sourceMarker: "blank" },
    ],
    excludedOrUnassigned: [
      { component: "18:2 CLAs", amountPer100g: 0.009 },
      { component: "18:2 trans, not further defined", amountPer100g: 0.013 },
      { component: "20:4 undifferentiated", amountPer100g: 0.003 },
    ],
    totalPolyunsaturatedFattyAcids: 0.083,
  },
  derivedOmegas: {
    omega3: 0.009,
    omega6: 0.049,
    sumOmegaFamilies: 0.058,
    excludedOrUnassignedRemainder: 0.025,
    partitionCheck: 0.083,
    method: "Sum only explicitly n-labelled component rows; do not assign the blank 20:4 n-6 row or the undifferentiated 20:4 value to Omega-6. The Omega-family sum plus separately itemized CLA, trans-18:2, and unassigned 20:4 equals the reported total PUFA.",
  },
};
record.derivedOmegas = {
  omega3: 0.009,
  omega6: 0.049,
  totalPufa: 0.083,
  nonOmegaOrUnassignedRemainder: 0.025,
  reconciled: true,
  method: "Sum explicitly n-labelled USDA SR28 rows. The remaining 0.025 g is separately reported as 0.009 g CLA, 0.013 g trans-18:2 not further defined, and 0.003 g undifferentiated 20:4; do not count these as a named n-family.",
};
record.addedValues = {
  ...(record.addedValues ?? {}),
  ...values,
};
record.note = "The exact USDA 2% cottage-cheese record matches the database fat and protein. Omega families are summed only from explicitly n-labelled SR28 components; ambiguous 20:4 is excluded. The official SR28 component table explains the difference from total PUFA, and the existing USDA trans-fat and alcohol values are retained.";
record.checkedOn = "2026-09-24";

audit.remainingNulls = audit.remainingNulls.filter((item) => item.databaseIndex !== databaseIndex);
for (const field of audit.fields) {
  const filled = database
    .slice(audit.range.first - 1, audit.range.last)
    .filter((item) => item.nutrients[field] !== null && item.nutrients[field] !== undefined).length;
  audit.fieldCoverage[field] = {
    filled,
    missing: audit.range.count - filled,
    total: audit.range.count,
  };
}
audit.checkedOn = "2026-09-24";

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
