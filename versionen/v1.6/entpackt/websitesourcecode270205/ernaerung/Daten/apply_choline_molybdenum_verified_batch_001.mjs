import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const usdaPath = "Daten/USDA_SR_Legacy_Choline_extract.json";
const blsPath = "Daten/BLS_4_0_Molybdenum_extract.json";
const cholineKey = "Choline (mg)";
const molybdenumKey = `Molybdenum (\u00B5g)`;

const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync(usdaPath, "utf8"));
const bls = JSON.parse(fs.readFileSync(blsPath, "utf8"));
const originalOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
const usdaById = new Map(usda.map(row => [String(row.fdc_id), row]));
const blsByCode = new Map(bls.map(row => [String(row.code), row]));
const corrections = [];

function targetIndex(nameEn) {
  const index = db.findIndex(food => food.name_en === nameEn);
  if (index < 0 || audit.records[index]?.name_en !== nameEn) throw new Error(`Missing or misaligned target: ${nameEn}`);
  return index;
}

function setCholine(nameEn, sourceId, confidence, reason) {
  const index = targetIndex(nameEn);
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

function setMolybdenum(nameEn, sourceCode, confidence, reason) {
  const index = targetIndex(nameEn);
  const source = blsByCode.get(String(sourceCode));
  const sourceValue = Number(source?.molybdenum_ug);
  if (!source || !Number.isFinite(sourceValue)) throw new Error(`Missing numeric BLS molybdenum source: ${sourceCode}`);
  const oldValue = db[index].nutrients[molybdenumKey];
  const oldSource = audit.records[index].molybdenum?.sourceName || audit.records[index].molybdenum?.method || "unknown estimate";
  const value = Number(sourceValue.toFixed(1));
  db[index].nutrients[molybdenumKey] = value;
  audit.records[index].valuesPer100g[molybdenumKey] = value;
  audit.records[index].molybdenum = {
    value: sourceValue,
    method: "BLS compatible food estimate",
    confidence,
    sourceName: source.name,
    sourceCode: String(source.code),
    sourceType: source.moly_source || null,
    sourceReference: source.moly_reference || null,
    sourceUrl: "https://blsdb.prod.se.ble.de/",
    note: reason
  };
  corrections.push({
    databaseIndex: index,
    food: db[index].name,
    name_en: nameEn,
    nutrient: molybdenumKey,
    oldValue,
    newValue: value,
    previousSource: oldSource,
    verifiedSource: source.name,
    sourceCode: String(source.code),
    sourceType: source.moly_source || null,
    sourceReference: source.moly_reference || null,
    sourceUrl: "https://blsdb.prod.se.ble.de/",
    reason
  });
}

// Correct clear food-form mismatches where the composition source has the matching form.
setCholine("Pineapple", 169124, "high", "Raw pineapple match; replaces the pineapple-topping record, whose syrup-heavy composition did not match the raw database food.");
setCholine("Apricots, dried", 173941, "high", "Dried, uncooked apricot match; source macros align with the dry-food profile. Replaces a raw-apricot match.");
setCholine("Figs, dried", 174665, "high", "Dried, uncooked fig match; source macros align with the dry-food profile. Replaces a raw-fig match.");
setCholine("Beans, green canned (drained)", 169143, "medium-high", "Canned green beans, drained; replaces the raw-bean match. The USDA record is regular-pack drained solids.");
setMolybdenum("Figs, dried", "F505400", "high", "BLS record is dried fig, matching the food and processing form; replaces an unrelated dried-papaya comparator.");

audit.summary.choline = audit.records.reduce((counts, record) => {
  counts[record.choline.method] = (counts[record.choline.method] || 0) + 1;
  return counts;
}, {});
audit.summary.molybdenum = audit.records.reduce((counts, record) => {
  counts[record.molybdenum.method] = (counts[record.molybdenum.method] || 0) + 1;
  return counts;
}, {});
audit.summary.verifiedBatch001 = {
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
console.log(JSON.stringify({ corrections, summary: audit.summary.verifiedBatch001 }, null, 2));
