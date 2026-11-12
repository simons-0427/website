import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const C = "Choline (mg)", M = "Molybdenum (µg)";
const sources = [
  { type: "FNDDS", path: "Daten/USDA_FNDDS_2021-2023_extracted/surveyDownload.json", root: "SurveyFoods", dataset: "FNDDS 2021-2023" },
  { type: "Foundation", path: "Daten/USDA_Foundation_Foods_2026-04_extracted/FoodData_Central_foundation_food_json_2026-04-30.json", root: "FoundationFoods", dataset: "Foundation Foods April 2026" }
];
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const sourceByName = new Map();
for (const definition of sources) {
  const foods = JSON.parse(fs.readFileSync(definition.path, "utf8"))[definition.root].filter(Boolean);
  for (const food of foods) {
    const nutrient = (food.foodNutrients || []).find(item => item && (String(item.nutrient?.number) === "421" || /choline/i.test(item.nutrient?.name || "")));
    if (!nutrient || !Number.isFinite(Number(nutrient.amount)) || nutrient.nutrient?.unitName !== "mg") continue;
    const key = normalize(food.description);
    if (!sourceByName.has(key)) sourceByName.set(key, []);
    sourceByName.get(key).push({ definition, food, nutrient });
  }
}

const beforeOther = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[C]; delete copy.nutrients[M];
  return copy;
}));
const corrections = [];
let exactMatches = 0;
for (let index = 0; index < db.length; index++) {
  const food = db[index];
  const matches = sourceByName.get(normalize(food.name_en || food.name));
  if (!matches) continue;
  if (matches.length !== 1) throw new Error(`Ambiguous USDA exact-name source at row ${index}: ${food.name}`);
  const { definition, food: source, nutrient } = matches[0];
  const value = Number(Number(nutrient.amount).toFixed(1));
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid FNDDS choline value at row ${index}`);
  const record = audit.records[index];
  if (record.valuesPer100g[C] !== food.nutrients[C]) throw new Error(`Pre-existing database/audit mismatch at row ${index}`);
  const previous = record.choline;
  const sourceUrl = `https://fdc.nal.usda.gov/food-details/${source.fdcId}/nutrients?type=${encodeURIComponent(definition.type === "FNDDS" ? "FNDDS" : "Foundation Foods")}`;
  food.nutrients[C] = value;
  record.valuesPer100g[C] = value;
  record.choline = {
    value,
    method: definition.type === "FNDDS" ? "USDA FNDDS exact name" : "USDA Foundation exact name",
    confidence: "medium-high",
    sourceName: source.description,
    sourceId: String(source.fdcId),
    sourceCode: source.foodCode ? String(source.foodCode) : null,
    sourceDataset: definition.dataset,
    sourceDataType: source.dataType || null,
    nutrientNumber: String(nutrient.nutrient.number),
    nutrientName: nutrient.nutrient.name,
    nutrientUnit: nutrient.nutrient.unitName,
    derivation: nutrient.foodNutrientDerivation?.description || null,
    dataPoints: nutrient.dataPoints ?? null,
    sourceUrl,
    note: "Exact normalized English food name in USDA FoodData Central; value taken from the source nutrient profile per 100 g."
  };
  exactMatches++;
  corrections.push({
    databaseIndex: index,
    food: food.name,
    name_en: food.name_en,
    nutrient: C,
    oldValue: previous.value,
    newValue: value,
    previousMethod: previous.method,
    previousSource: previous.sourceName || null,
    verifiedSource: source.description,
    sourceId: String(source.fdcId),
    sourceDataset: definition.dataset,
    sourceUrl,
    reason: "Exact normalized English-name match to a numeric USDA food record."
  });
}

const afterOther = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[C]; delete copy.nutrients[M];
  return copy;
}));
if (beforeOther !== afterOther) throw new Error("Changes outside Choline/Molybdenum detected");
if (db.length !== audit.records.length) throw new Error("Database/audit row count mismatch");
for (let index = 0; index < db.length; index++) {
  if (audit.records[index].valuesPer100g[C] !== db[index].nutrients[C] || audit.records[index].valuesPer100g[M] !== db[index].nutrients[M]) throw new Error(`Database/audit value mismatch at row ${index}`);
  if (!Number.isFinite(db[index].nutrients[C]) || db[index].nutrients[C] < 0 || !Number.isFinite(db[index].nutrients[M]) || db[index].nutrients[M] < 0) throw new Error(`Invalid value at row ${index}`);
}

audit.summary.choline = audit.records.reduce((counts, row) => {
  const method = row.choline.method; counts[method] = (counts[method] || 0) + 1; return counts;
}, {});
audit.summary.fnddsExactNameBatch006 = {
  exactNameRecords: exactMatches,
  numericChanges: corrections.filter(item => item.oldValue !== item.newValue).length
};
audit.sources = audit.sources || [];
if (!audit.sources.some(source => /USDA FoodData Central FNDDS 2021-2023/.test(source.name || ""))) {
  audit.sources.push({
    name: "USDA FoodData Central FNDDS 2021-2023",
    url: "https://fdc.nal.usda.gov/download-datasets/",
    nutrient: "Choline, mg/100 g",
    note: "Official October 2024 FNDDS release; exact normalized English food-name matches only."
  });
}
audit.correctionLog = [...(audit.correctionLog || []), ...corrections];
fs.writeFileSync("database.json", `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  exactNameRecords: exactMatches,
  numericChanges: corrections.filter(item => item.oldValue !== item.newValue).length,
  newLogEntries: corrections.length,
  totalLogEntries: audit.correctionLog.length,
  changedValues: corrections.filter(item => item.oldValue !== item.newValue).map(item => ({ food: item.food, old: item.oldValue, value: item.newValue, source: item.verifiedSource, sourceId: item.sourceId }))
}, null, 2));
