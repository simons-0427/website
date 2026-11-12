import fs from "node:fs";

const dbPath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const fnddsPath = "Daten/USDA_FNDDS_2021-2023_extracted/surveyDownload.json";
const C = "Choline (mg)", M = "Molybdenum (µg)";
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const fndds = JSON.parse(fs.readFileSync(fnddsPath, "utf8")).SurveyFoods;
const byId = new Map(fndds.map(row => [String(row.fdcId), row]));
const plan = [
  { i: 167, old: 6.1, id: "2709239", confidence: "medium-high", note: "Raw kiwi is a direct species match; replaces a category-median estimate." },
  { i: 595, old: 7.6, id: "2709239", confidence: "medium-high", note: "Raw kiwi is a direct species match; replaces a mango comparator." },
  { i: 207, old: 14, id: "2709175", confidence: "medium-high", note: "Raw tangerine is a close species and macro-profile match for the generic tangerine/clementine entry." },
  { i: 838, old: 6.2, id: "2709175", confidence: "medium-high", note: "Raw tangerine is a close species and macro-profile match for raw mandarin." }
];
const otherBefore = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[C]; delete copy.nutrients[M];
  return copy;
}));
const changes = [];
for (const item of plan) {
  const food = db[item.i], record = audit.records[item.i], source = byId.get(item.id);
  const nutrient = source?.foodNutrients?.find(entry => entry && (String(entry.nutrient?.number) === "421" || /choline/i.test(entry.nutrient?.name || "")));
  if (!food || !record || food.nutrients[C] !== item.old || record.valuesPer100g[C] !== item.old) throw new Error(`Unexpected old Choline value at ${item.i}`);
  if (!source || !nutrient || nutrient.nutrient?.unitName !== "mg" || !Number.isFinite(Number(nutrient.amount))) throw new Error(`Missing USDA source ${item.id}`);
  const value = Number(Number(nutrient.amount).toFixed(1));
  const previous = record.choline;
  const sourceUrl = `https://fdc.nal.usda.gov/food-details/${item.id}/nutrients?type=FNDDS`;
  food.nutrients[C] = value;
  record.valuesPer100g[C] = value;
  record.choline = {
    value,
    method: "USDA FNDDS compatible food estimate",
    confidence: item.confidence,
    sourceName: source.description,
    sourceId: item.id,
    sourceDataset: "USDA FoodData Central FNDDS 2021-2023",
    nutrientNumber: String(nutrient.nutrient.number),
    nutrientName: nutrient.nutrient.name,
    nutrientUnit: nutrient.nutrient.unitName,
    derivation: nutrient.foodNutrientDerivation?.description || null,
    dataPoints: nutrient.dataPoints ?? null,
    sourceUrl,
    note: item.note
  };
  changes.push({
    databaseIndex: item.i, food: food.name, name_en: food.name_en, nutrient: C,
    oldValue: item.old, newValue: value, previousMethod: previous.method,
    previousSource: previous.sourceName || null, verifiedSource: source.description,
    sourceId: item.id, sourceDataset: "USDA FoodData Central FNDDS 2021-2023",
    sourceUrl, reason: item.note
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
audit.summary.choline = audit.records.reduce((counts, row) => {
  counts[row.choline.method] = (counts[row.choline.method] || 0) + 1;
  return counts;
}, {});
audit.summary.reviewedCholineBatch008 = { corrections: changes.length, numericChanges: changes.filter(row => row.oldValue !== row.newValue).length };
audit.correctionLog = [...(audit.correctionLog || []), ...changes];
fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ corrections: changes.length, numericChanges: changes.filter(row => row.oldValue !== row.newValue).length, logEntries: audit.correctionLog.length, changes: changes.map(row => ({ index: row.databaseIndex, food: row.food, old: row.oldValue, value: row.newValue, source: row.verifiedSource, id: row.sourceId })) }, null, 2));
