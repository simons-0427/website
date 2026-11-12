import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const foundationPath = "Daten/USDA_Foundation_Foods_2026-04_extracted/FoodData_Central_foundation_food_json_2026-04-30.json";
const M = "Molybdenum (µg)", C = "Choline (mg)";
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const foundation = JSON.parse(fs.readFileSync(foundationPath, "utf8")).FoundationFoods.filter(Boolean);
const byId = new Map(foundation.map(row => [String(row.fdcId), row]));

const plan = [
  { i: 5, old: 4.9, id: "2346398", confidence: "high", note: "The direct Foundation Foods record for raw pineapple has eight analytical data points, all reported as zero. This replaces a transferred BLS value of 4.87 µg/100 g." },
  { i: 599, old: 4.9, id: "2346398", confidence: "high", note: "The direct Foundation Foods record for raw pineapple has eight analytical data points, all reported as zero. This replaces a transferred BLS value of 4.87 µg/100 g." },
  { i: 295, old: 4, id: "2346408", confidence: "high", note: "Direct raw red-cabbage analysis replaces a white-cabbage comparator; source estimate aggregates eight analytical data points." },
  { i: 653, old: 4, id: "2346408", confidence: "high", note: "Direct raw red-cabbage analysis replaces a white-cabbage comparator; source estimate aggregates eight analytical data points." },
  { i: 258, old: 15.9, id: "2346392", confidence: "medium-high", note: "Eight analytical pine-nut samples in Foundation Foods support 3.28 µg/100 g (median 3.44; range 0-5.06), replacing a conflicting BLS literature value of 15.9." },
  { i: 210, old: 17.7, id: "2346393", confidence: "high", note: "Raw whole almonds are a direct match; the Foundation Foods estimate is based on eight analytical data points." },
  { i: 288, old: 16.5, id: "2512375", confidence: "medium", note: "Generic rye flour is the closest direct grain-and-product-class source; German extraction type 1150 is not separately represented." },
  { i: 521, old: 16.5, id: "2512375", confidence: "medium", note: "Generic rye flour is the closest direct grain-and-product-class source; German extraction type 997 is not separately represented." },
  { i: 522, old: 16.5, id: "2512375", confidence: "medium", note: "Generic rye flour is the closest direct grain-and-product-class source; German extraction type 815 is not separately represented." },
  { i: 520, old: 3.4, id: "790085", confidence: "medium", note: "Unenriched whole-wheat flour is a measured wheat-flour comparator for Type 1050; the extraction types are not identical." },
  { i: 523, old: 16.5, id: "2003587", confidence: "medium", note: "Whole-grain spelt flour is the closest direct spelt-flour source; its higher fibre content means German Type 1050 is an estimate, not an exact match." },
  { i: 524, old: 16.5, id: "2003587", confidence: "medium-low", note: "Whole-grain spelt flour is the closest direct spelt-flour source; its higher fibre content means German Type 812 is a lower-confidence estimate." }
];

const otherBefore = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[C]; delete copy.nutrients[M];
  return copy;
}));
const changes = [];
for (const item of plan) {
  const food = db[item.i], record = audit.records[item.i], source = byId.get(item.id);
  const nutrient = source?.foodNutrients?.find(entry => entry && /molybdenum/i.test(entry.nutrient?.name || ""));
  if (!food || !record || food.nutrients[M] !== item.old || record.valuesPer100g[M] !== item.old) throw new Error(`Unexpected old molybdenum value at ${item.i}`);
  if (!source || !nutrient || nutrient.nutrient?.unitName !== "µg" || !Number.isFinite(Number(nutrient.amount))) throw new Error(`Missing Foundation Foods source ${item.id}`);
  const value = Number(Number(nutrient.amount).toFixed(1));
  const previous = record.molybdenum;
  const sourceUrl = `https://fdc.nal.usda.gov/food-details/${item.id}/nutrients?type=Foundation%20Foods`;
  food.nutrients[M] = value;
  record.valuesPer100g[M] = value;
  record.molybdenum = {
    value,
    method: "USDA Foundation Foods compatible food estimate",
    confidence: item.confidence,
    sourceName: source.description,
    sourceId: item.id,
    sourceDataset: "USDA FoodData Central Foundation Foods April 2026",
    nutrientNumber: String(nutrient.nutrient.number),
    nutrientName: nutrient.nutrient.name,
    nutrientUnit: nutrient.nutrient.unitName,
    derivation: nutrient.foodNutrientDerivation?.description || null,
    dataPoints: nutrient.dataPoints ?? null,
    minimum: nutrient.min ?? null,
    median: nutrient.median ?? null,
    maximum: nutrient.max ?? null,
    sourceUrl,
    note: item.note
  };
  changes.push({
    databaseIndex: item.i, food: food.name, name_en: food.name_en, nutrient: M,
    oldValue: item.old, newValue: value, previousMethod: previous.method,
    previousSource: previous.sourceName || null, verifiedSource: source.description,
    sourceId: item.id, sourceDataset: "USDA FoodData Central Foundation Foods April 2026",
    sourceUrl, dataPoints: nutrient.dataPoints ?? null, reason: item.note
  });
}

const otherAfter = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[C]; delete copy.nutrients[M];
  return copy;
}));
if (otherBefore !== otherAfter) throw new Error("Unexpected change outside Choline/Molybdenum fields");
if (db.length !== audit.records.length) throw new Error("Database/audit row count mismatch");
for (let i = 0; i < db.length; i++) {
  if (audit.records[i].valuesPer100g[C] !== db[i].nutrients[C] || audit.records[i].valuesPer100g[M] !== db[i].nutrients[M]) throw new Error(`Database/audit mismatch at ${i}`);
  if (!Number.isFinite(db[i].nutrients[C]) || db[i].nutrients[C] < 0 || !Number.isFinite(db[i].nutrients[M]) || db[i].nutrients[M] < 0) throw new Error(`Invalid nutrient value at ${i}`);
}

audit.summary.molybdenum = audit.records.reduce((counts, row) => {
  counts[row.molybdenum.method] = (counts[row.molybdenum.method] || 0) + 1;
  return counts;
}, {});
audit.summary.foundationMolybdenumBatch009 = { corrections: changes.length, numericChanges: changes.filter(row => row.oldValue !== row.newValue).length };
audit.sources = audit.sources || [];
if (!audit.sources.some(source => /USDA FoodData Central Foundation Foods/.test(source.name || ""))) {
  audit.sources.push({
    name: "USDA FoodData Central Foundation Foods April 2026",
    url: "https://fdc.nal.usda.gov/download-datasets/",
    nutrient: "Molybdenum, µg/100 g",
    note: "Foundation Foods records identify analytical derivation and data-point ranges where available."
  });
}
 audit.correctionLog = [...(audit.correctionLog || []), ...changes];
fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ corrections: changes.length, numericChanges: changes.filter(row => row.oldValue !== row.newValue).length, logEntries: audit.correctionLog.length, changes: changes.map(row => ({ index: row.databaseIndex, food: row.food, old: row.oldValue, value: row.newValue, source: row.verifiedSource, sourceId: row.sourceId, dataPoints: row.dataPoints })) }, null, 2));
