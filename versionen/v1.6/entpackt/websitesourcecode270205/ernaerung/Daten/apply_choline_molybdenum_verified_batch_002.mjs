import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const usdaPath = "Daten/USDA_SR_Legacy_Choline_extract.json";
const cholineKey = "Choline (mg)";
const molybdenumKey = "Molybdenum (\u00B5g)";

const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync(usdaPath, "utf8"));
const originalOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
const usdaById = new Map(usda.map(row => [String(row.fdc_id), row]));
const corrections = [];

function setCholine(nameEn, sourceId, confidence, reason) {
  const index = db.findIndex(food => food.name_en === nameEn);
  if (index < 0 || audit.records[index]?.name_en !== nameEn) throw new Error(`Missing or misaligned target: ${nameEn}`);
  const source = usdaById.get(String(sourceId));
  const sourceValue = Number(source?.choline_mg);
  if (!source || !Number.isFinite(sourceValue)) throw new Error(`Missing numeric USDA choline source: ${sourceId}`);
  const oldValue = db[index].nutrients[cholineKey];
  const oldSource = audit.records[index].choline?.sourceName || audit.records[index].choline?.method || "unknown estimate";
  const value = Number(sourceValue.toFixed(1));
  db[index].nutrients[cholineKey] = value;
  audit.records[index].valuesPer100g[cholineKey] = value;
  audit.records[index].choline = {
    value,
    method: "USDA compatible food estimate",
    confidence,
    sourceName: source.description,
    sourceId: String(source.fdc_id),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${source.fdc_id}/nutrients?type=SR%20Legacy`,
    note: reason
  };
  corrections.push({
    databaseIndex: index,
    food: db[index].name,
    name_en: nameEn,
    nutrient: cholineKey,
    oldValue,
    newValue: value,
    previousSource: oldSource,
    verifiedSource: source.description,
    sourceId: String(source.fdc_id),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${source.fdc_id}/nutrients?type=SR%20Legacy`,
    reason
  });
}

// Use records with the same dried-food form; skip candidates whose product form or macros differ substantially.
setCholine(
  "Plums, dried (Backpflaumen)",
  168162,
  "high",
  "Direct match for uncooked dried prunes; the USDA energy, protein and fiber values align with the database food. Replaces a raw-plum value."
);
setCholine(
  "Cranberries, dried (sweetened)",
  171723,
  "high",
  "Direct match for sweetened dried cranberries; the USDA energy, protein and fiber values closely align with the database food. Replaces canned cranberry sauce."
);
setCholine(
  "Korinthen, dried",
  171724,
  "high",
  "Direct match for dried Zante currants (Korinthen); the source food form matches and its macronutrients are close. Replaces an unrelated dried-mango estimate."
);
setCholine(
  "Apples, dried",
  171691,
  "high",
  "Dried, uncooked apple match; replaces an apple strudel comparator. The value is similar, but the source and product form are now appropriate."
);
setCholine(
  "Peaches, dried",
  169934,
  "medium",
  "Dried, sulfured, uncooked peach match; more appropriate than the raw-peach source. Product composition differs somewhat, so this remains a medium-confidence estimate."
);

audit.summary.choline = audit.records.reduce((counts, record) => {
  counts[record.choline.method] = (counts[record.choline.method] || 0) + 1;
  return counts;
}, {});
audit.summary.molybdenum = audit.records.reduce((counts, record) => {
  counts[record.molybdenum.method] = (counts[record.molybdenum.method] || 0) + 1;
  return counts;
}, {});
audit.summary.verifiedBatch002 = {
  changedValues: corrections.length,
  cholineCorrections: corrections.filter(item => item.nutrient === cholineKey).length,
  molybdenumCorrections: corrections.filter(item => item.nutrient === molybdenumKey).length
};
audit.correctionLog = [...(audit.correctionLog || []), ...corrections];

if (db.length !== 1516 || audit.records.length !== db.length) throw new Error(`Unexpected database/audit size: ${db.length}/${audit.records.length}`);
for (let index = 0; index < db.length; index++) {
  const c = db[index].nutrients[cholineKey];
  const m = db[index].nutrients[molybdenumKey];
  if (!Number.isFinite(c) || c < 0 || !Number.isFinite(m) || m < 0) throw new Error(`Invalid nutrient value at index ${index}`);
  if (audit.records[index].valuesPer100g[cholineKey] !== c || audit.records[index].valuesPer100g[molybdenumKey] !== m) throw new Error(`Audit/database mismatch at index ${index}`);
}
const currentOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
if (currentOtherNutrients !== originalOtherNutrients) throw new Error("Unexpected changes outside Choline and Molybdenum");

fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ corrections, summary: audit.summary.verifiedBatch002 }, null, 2));
