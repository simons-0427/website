import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const fnddsPath = "Daten/USDA_FNDDS_2021-2023_extracted/surveyDownload.json";
const srPath = "Daten/USDA_SR_Legacy_Choline_extract.json";
const C = "Choline (mg)", M = "Molybdenum (µg)";
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const fndds = JSON.parse(fs.readFileSync(fnddsPath, "utf8")).SurveyFoods;
const sr = JSON.parse(fs.readFileSync(srPath, "utf8"));
const fnddsById = new Map(fndds.map(row => [String(row.fdcId), row]));
const srById = new Map(sr.map(row => [String(row.fdc_id), row]));

const reviewed = [
  { i: 926, old: 0.4, dataset: "FNDDS", id: "2710189", confidence: "high", note: "Safflower oil is the matching oil; replaces a walnut-oil comparator." },
  { i: 53, old: 9.9, dataset: "SR Legacy", id: "171726", confidence: "high", note: "Deglet Noor dates have a close macro profile to the database food and are a direct dried-date comparator." },
  { i: 254, old: 7.2, dataset: "FNDDS", id: "2709249", confidence: "high", note: "Raw peach matches the fruit identity and target food form; replaces a peach-pie comparator." },
  { i: 278, old: 12.3, dataset: "SR Legacy", id: "168451", confidence: "high", note: "Raw oriental radish matches the target radish macro profile and is a closer comparator than raw kohlrabi." },
  { i: 103, old: 10.8, dataset: "FNDDS", id: "2705385", confidence: "medium-high", note: "Whole milk is a direct food/form match; replaces a milk-cracker comparator." },
  { i: 220, old: 10.8, dataset: "FNDDS", id: "2705385", confidence: "medium-high", note: "Whole milk is a direct food/form match; replaces a milk-cracker comparator." },
  { i: 219, old: 15.2, dataset: "FNDDS interpolation", ids: ["2705387", "2705386"], confidence: "medium", note: "Linear interpolation between USDA 1% and 2% milk choline values estimates 1.5% milk." },
  { i: 42, old: 52.1, dataset: "FNDDS", id: "2707494", confidence: "medium-high", note: "Unroasted cashews are the closest available compatible comparator for plain cashews." },
  { i: 50, old: 17.5, dataset: "FNDDS", id: "2705747", confidence: "medium", note: "Generic cottage cheese is a closer dairy match than cottage cheese with vegetables." },
  { i: 393, old: 17.8, dataset: "FNDDS", id: "2707684", confidence: "high", note: "Plain bagel replaces a bagel-chip comparator." },
  { i: 459, old: 18.7, dataset: "FNDDS", id: "2707613", confidence: "medium", note: "Naan bread is a direct bread-type comparator; the product formulation may vary." },
  { i: 472, old: 22.5, dataset: "FNDDS", id: "2708232", confidence: "medium-high", note: "Ready-to-eat plain popcorn closely matches salted popcorn; salt does not materially affect choline." },
  { i: 486, old: 3.5, dataset: "FNDDS", id: "2710688", confidence: "medium", note: "Generic red wine is the closest direct beverage match; style and residual sugar vary." },
  { i: 509, old: 3.5, dataset: "SR Legacy", id: "174837", confidence: "medium", note: "Generic table white wine is a close match; dry-wine style may vary." },
  { i: 159, old: 15.4, dataset: "FNDDS", id: "2705394", confidence: "medium-high", note: "Kefir is a direct fermented-milk comparator for 1.5% kefir." },
  { i: 843, old: 10.9, dataset: "SR Legacy", id: "169276", confidence: "high", note: "Raw common radish is a direct food/form match; replaces a radicchio comparator." },
  { i: 1382, old: 78.5, dataset: "SR Legacy", id: "174207", confidence: "medium-high", note: "Cooked wild crayfish is the closest source record for salted crayfish; preparation and salting may differ." }
];

const readSource = item => {
  if (item.dataset === "SR Legacy") {
    const source = srById.get(item.id);
    if (!source || !Number.isFinite(Number(source.choline_mg))) throw new Error(`Missing SR Legacy choline source ${item.id}`);
    return { value: Number(source.choline_mg), name: source.description, ids: [item.id], dataset: "USDA FoodData Central SR Legacy" };
  }
  const getFndds = id => {
    const source = fnddsById.get(id);
    const nutrient = source?.foodNutrients?.find(entry => entry && (String(entry.nutrient?.number) === "421" || /choline/i.test(entry.nutrient?.name || "")));
    if (!source || !nutrient || nutrient.nutrient?.unitName !== "mg" || !Number.isFinite(Number(nutrient.amount))) throw new Error(`Missing FNDDS choline source ${id}`);
    return { source, nutrient, value: Number(nutrient.amount) };
  };
  if (item.dataset === "FNDDS interpolation") {
    const low = getFndds(item.ids[0]), high = getFndds(item.ids[1]);
    const value = (low.value + high.value) / 2;
    return {
      value,
      name: `${low.source.description} + ${high.source.description} (linear interpolation)`,
      ids: item.ids,
      dataset: "USDA FoodData Central FNDDS 2021-2023",
      nutrient: low.nutrient,
      sourceNames: [low.source.description, high.source.description]
    };
  }
  const { source, nutrient, value } = getFndds(item.id);
  return { value, name: source.description, ids: [item.id], dataset: "USDA FoodData Central FNDDS 2021-2023", nutrient };
};

if (db.length !== audit.records.length) throw new Error("Database/audit row count mismatch before update");
const otherBefore = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[C]; delete copy.nutrients[M];
  return copy;
}));
const changes = [];
for (const item of reviewed) {
  const food = db[item.i], record = audit.records[item.i];
  if (!food || !record || food.nutrients[C] !== item.old || record.valuesPer100g[C] !== item.old) {
    throw new Error(`Unexpected old choline value at ${item.i}: ${food?.name}; expected ${item.old}`);
  }
  const source = readSource(item);
  const value = Number(source.value.toFixed(1));
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid choline value at ${item.i}`);
  const previous = record.choline;
  const urls = source.ids.map(id => `https://fdc.nal.usda.gov/food-details/${id}/nutrients?type=${encodeURIComponent(item.dataset === "SR Legacy" ? "SR Legacy" : "FNDDS")}`);
  food.nutrients[C] = value;
  record.valuesPer100g[C] = value;
  record.choline = {
    value,
    method: item.dataset === "SR Legacy" ? "USDA SR Legacy compatible food estimate" : item.dataset === "FNDDS interpolation" ? "USDA FNDDS interpolated food estimate" : "USDA FNDDS compatible food estimate",
    confidence: item.confidence,
    sourceName: source.name,
    sourceId: source.ids.length === 1 ? source.ids[0] : undefined,
    sourceIds: source.ids.length > 1 ? source.ids : undefined,
    sourceDataset: source.dataset,
    nutrientNumber: source.nutrient?.nutrient?.number ? String(source.nutrient.nutrient.number) : "421",
    nutrientName: source.nutrient?.nutrient?.name || "Choline, total",
    nutrientUnit: source.nutrient?.nutrient?.unitName || "mg",
    sourceUrls: urls,
    note: item.note
  };
  changes.push({
    databaseIndex: item.i,
    food: food.name,
    name_en: food.name_en,
    nutrient: C,
    oldValue: item.old,
    newValue: value,
    previousMethod: previous.method,
    previousSource: previous.sourceName || null,
    verifiedSource: source.name,
    sourceIds: source.ids,
    sourceDataset: source.dataset,
    sourceUrls: urls,
    reason: item.note
  });
}

const otherAfter = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[C]; delete copy.nutrients[M];
  return copy;
}));
if (otherBefore !== otherAfter) throw new Error("Unexpected change outside Choline/Molybdenum fields");
for (let i = 0; i < db.length; i++) {
  if (audit.records[i].valuesPer100g[C] !== db[i].nutrients[C] || audit.records[i].valuesPer100g[M] !== db[i].nutrients[M]) throw new Error(`Database/audit value mismatch at ${i}`);
  if (!Number.isFinite(db[i].nutrients[C]) || db[i].nutrients[C] < 0 || !Number.isFinite(db[i].nutrients[M]) || db[i].nutrients[M] < 0) throw new Error(`Invalid Choline/Molybdenum at ${i}`);
}
audit.summary.choline = audit.records.reduce((counts, row) => {
  counts[row.choline.method] = (counts[row.choline.method] || 0) + 1;
  return counts;
}, {});
audit.summary.reviewedCholineBatch007 = { corrections: changes.length, numericChanges: changes.filter(row => row.oldValue !== row.newValue).length };
audit.correctionLog = [...(audit.correctionLog || []), ...changes];
fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ corrections: changes.length, numericChanges: changes.filter(row => row.oldValue !== row.newValue).length, logEntries: audit.correctionLog.length, changes: changes.map(row => ({ index: row.databaseIndex, food: row.food, old: row.oldValue, value: row.newValue, source: row.verifiedSource, ids: row.sourceIds })) }, null, 2));
