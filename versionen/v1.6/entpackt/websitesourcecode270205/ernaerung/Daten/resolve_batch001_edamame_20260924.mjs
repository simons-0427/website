import fs from "node:fs";

const database = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const databaseIndex = 61;
const row = database[databaseIndex - 1];
if (row?.name !== "Edamame, gefroren") throw new Error(`Unexpected record: ${row?.name}`);

const values = {
  "Omega-3 Fatty Acids (g)": 0.361,
  "Omega-6 Fatty Acids (g)": 1.791,
  "Trans Fat (g)": 0.009,
  "Alcohol (g)": 0,
};
for (const [field, value] of Object.entries(values)) {
  const current = row.nutrients[field];
  const replaceIncorrectUnpreparedMatch = field === "Trans Fat (g)" && current === 0;
  if (current !== null && current !== value && !replaceIncorrectUnpreparedMatch) {
    throw new Error(`Unexpected ${field} value ${current}; refusing overwrite`);
  }
  row.nutrients[field] = value;
}

const record = audit.records.find((item) => item.databaseIndex === databaseIndex);
if (!record) throw new Error("Edamame audit record not found");
record.fdcId = 168411;
record.sourceName = "Edamame, frozen, prepared";
record.sourceUrl = "https://fdc.nal.usda.gov/food-details/168411/nutrients?type=SR%20Legacy";
record.sourceValues = [
  { number: "221", component: "Alcohol, ethyl", amountPer100g: 0 },
  { number: "605", component: "Fatty acids, total trans", amountPer100g: 0.009 },
  { number: "621", component: "PUFA 22:6 n-3 (DHA)", amountPer100g: 0 },
  { number: "629", component: "PUFA 20:5 n-3 (EPA)", amountPer100g: 0.003 },
  { number: "631", component: "PUFA 22:5 n-3 (DPA)", amountPer100g: 0 },
  { number: "646", component: "Fatty acids, total polyunsaturated", amountPer100g: 2.156 },
  { number: "672", component: "PUFA 20:2 n-6 c,c", amountPer100g: 0.002 },
  { number: "675", component: "PUFA 18:2 n-6 c,c", amountPer100g: 1.789 },
  { number: "685", component: "PUFA 18:3 n-6 c,c,c", amountPer100g: 0 },
  { number: "689", component: "PUFA 20:3", amountPer100g: 0 },
  { number: "851", component: "PUFA 18:3 n-3 c,c,c (ALA)", amountPer100g: 0.358 },
  { number: "852", component: "PUFA 20:3 n-3", amountPer100g: 0 },
];
record.derivedOmegas = {
  omega3: 0.361,
  omega6: 1.791,
  totalPufa: 2.156,
  excludedOrUnassignedRemainder: 0.004,
  reconciled: true,
  method: "Sum explicitly n-labelled USDA SR28 components: ALA plus EPA for n-3, linoleic acid plus 20:2 n-6 for n-6. The separately reported 0.004 g trans-18:2 accounts for the remaining PUFA after rounding.",
};
record.addedValues = { ...(record.addedValues ?? {}), ...values };
record.confirmationSource = {
  source: "USDA_SR28_2015",
  sourceCode: "NDB 11212",
  sourceName: "Edamame, frozen, prepared",
  url: "https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg11.pdf",
  valueBasis: "per 100 g edible portion",
  components: {
    omega3: { ALA: 0.358, EPA: 0.003, DPA: 0, DHA: 0 },
    omega6: { linoleicAcid: 1.789, eicosadienoicAcid20_2n6: 0.002 },
    totalPufa: 2.156,
    transFat: 0.009,
  },
};
record.note = "USDA SR28 NDB 11212 is the exact prepared/frozen match and aligns with this row's fat, protein, carbohydrate, and energy. The earlier unprepared NDB 11211 match was not equivalent; use the prepared profile, including its 0.009 g total trans fat.";
record.checkedOn = "2026-09-24";

audit.remainingNulls = audit.remainingNulls
  .map((item) => {
    const current = database[item.databaseIndex - 1];
    const missingFields = item.missingFields.filter((field) => current.nutrients[field] === null || current.nutrients[field] === undefined);
    return { ...item, missingFields };
  })
  .filter((item) => item.missingFields.length > 0);
audit.uncoveredRecords = audit.uncoveredRecords.filter((item) => item.databaseIndex !== databaseIndex);
for (const field of audit.fields) {
  const filled = database
    .slice(audit.range.first - 1, audit.range.last)
    .filter((item) => item.nutrients[field] !== null && item.nutrients[field] !== undefined).length;
  audit.fieldCoverage[field] = { filled, missing: audit.range.count - filled, total: audit.range.count };
}
audit.checkedOn = "2026-09-24";

fs.writeFileSync("database.json", `${JSON.stringify(database, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
