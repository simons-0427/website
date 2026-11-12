import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/database_V2_fatty_acids_alcohol_batch_002_sources.json";
const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const fields = [
  "Omega-3 Fatty Acids (g)",
  "Omega-6 Fatty Acids (g)",
  "Trans Fat (g)",
  "Alcohol (g)",
];

const updates = [
  {
    index: 101,
    name: "Grieß, Weichweizen",
    source: "USDA SR28 NDB 20466",
    sourceUrl: "https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg20.pdf",
    sourceName: "Semolina, unenriched",
    sourceValues: [
      { component: "18:2 undifferentiated", amountPer100g: 0.393 },
      { component: "18:3 undifferentiated", amountPer100g: 0.037 },
      { component: "Fatty acids, total polyunsaturated", amountPer100g: 0.43 },
      { component: "Fatty acids, total trans", amountPer100g: null, marker: "blank" },
      { component: "Alcohol, ethyl", amountPer100g: 0 },
    ],
    values: {
      "Omega-3 Fatty Acids (g)": 0.037,
      "Omega-6 Fatty Acids (g)": 0.393,
      "Alcohol (g)": 0,
    },
    method: "The USDA record matches the dry semolina macro profile. For this wheat food, 18:3 undifferentiated is assigned to the predominant n-3 ALA family and 18:2 undifferentiated to n-6 linoleic acid. Their sum reconciles to USDA total PUFA (0.430 g/100 g). USDA reports alcohol as 0.0 g. Total trans is blank, so it remains unresolved rather than being set to zero.",
  },
  {
    index: 132,
    name: "Hüttenkäse 20% Fett i.Tr.",
    source: "USDA SR28 NDB 01012",
    sourceUrl: "https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg01.pdf",
    sourceName: "Cheese, cottage, creamed, large or small curd",
    sourceValues: [
      { component: "18:2 undifferentiated", amountPer100g: 0.105 },
      { component: "18:3 undifferentiated", amountPer100g: 0.017 },
      { component: "Fatty acids, total polyunsaturated", amountPer100g: 0.123 },
      { component: "Fatty acids, total trans", amountPer100g: null, marker: "blank" },
      { component: "Alcohol, ethyl", amountPer100g: 0 },
    ],
    values: {
      "Omega-3 Fatty Acids (g)": 0.017,
      "Omega-6 Fatty Acids (g)": 0.105,
      "Alcohol (g)": 0,
    },
    method: "The USDA full-fat cottage-cheese record matches the database fat and protein values. The 18:3 and 18:2 undifferentiated components are assigned to the predominant n-3 and n-6 families respectively; the 0.001 g difference from total PUFA is rounding. USDA reports alcohol as 0.0 g. Total trans is blank and is not treated as zero because dairy fat can naturally contain trans fatty acids.",
  },
  {
    index: 104,
    name: "H-Milch 3,5%",
    source: "USDA SR28 NDB 01077",
    sourceUrl: "https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg01.pdf",
    sourceName: "Milk, whole, 3.25% milkfat, with added vitamin D",
    sourceValues: [{ component: "Alcohol, ethyl", amountPer100g: 0 }],
    values: { "Alcohol (g)": 0 },
    method: "USDA reports 0.0 g ethyl alcohol for whole fluid milk. The value remains zero for the database's 3.5% UHT milk entry; the source and target are unfermented cow's milk and no alcoholic ingredient is present. A zero remains zero across the database's ml unit, so no density conversion is needed.",
  },
];

let addedCount = 0;
const addedByField = Object.fromEntries(fields.map((field) => [field, 0]));
for (const item of updates) {
  const row = database[item.index - 1];
  if (!row || row.name !== item.name) {
    throw new Error(`Unexpected database row ${item.index}: ${row?.name}`);
  }
  const addedValues = {};
  for (const [field, value] of Object.entries(item.values)) {
    const current = row.nutrients[field];
    if (current !== null && current !== undefined && current !== value) {
      throw new Error(`Refusing to overwrite ${item.name} ${field}: found ${current}, expected ${value}`);
    }
    if (current === null || current === undefined) {
      row.nutrients[field] = value;
      addedCount += 1;
      addedByField[field] += 1;
      addedValues[field] = value;
    }
  }

  const existing = audit.records.find((record) => record.databaseIndex === item.index && record.source === "USDA_SR28_2015");
  const record = {
    databaseIndex: item.index,
    databaseName: item.name,
    source: "USDA_SR28_2015",
    sourceCode: item.source.replace("USDA SR28 ", "USDA_SR28_"),
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    valueBasis: "per 100 g edible portion; numeric zero is invariant under a unit conversion",
    sourceValues: item.sourceValues,
    derivedValues: item.values,
    addedValues: { ...(existing?.addedValues ?? {}), ...addedValues },
    derivationMethod: item.method,
    checkedOn: "2026-09-24",
  };
  if (existing) Object.assign(existing, record);
  else audit.records.push(record);

  for (const [field, value] of Object.entries(addedValues)) {
    audit.databaseApplication.updates.push({
      index: item.index,
      name: item.name,
      field,
      value,
      source: item.source,
      note: item.method,
    });
  }
}

audit.databaseApplication.appliedCount += addedCount;
for (const field of fields) {
  audit.databaseApplication.appliedByField[field] = (audit.databaseApplication.appliedByField[field] ?? 0) + addedByField[field];
  const filled = database
    .slice(audit.range.first - 1, audit.range.last)
    .filter((row) => typeof row.nutrients[field] === "number").length;
  audit.fieldCoverage[field] = { filled, missing: audit.range.count - filled, total: audit.range.count };
}
audit.checkedOn = "2026-09-24";

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ addedCount, addedByField, fieldCoverage: audit.fieldCoverage }, null, 2));
