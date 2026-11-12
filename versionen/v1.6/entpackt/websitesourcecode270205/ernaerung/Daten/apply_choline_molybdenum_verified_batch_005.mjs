import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const bls = JSON.parse(fs.readFileSync("Daten/BLS_4_0_Molybdenum_extract.json", "utf8"));
const cholineKey = "Choline (mg)";
const molybdenumKey = "Molybdenum (µg)";

const cholineFixes = [
  { index: 933, sourceId: "171421", confidence: "high", method: "USDA exact name", note: "USDA SR Legacy contains the matching cocoa-butter record; the existing value is retained and source provenance is improved." },
  { index: 130, sourceId: "172454", confidence: "medium-high", method: "USDA close food match", note: "Home-prepared hummus is a direct food match and its macro profile is compatible; replaces the broad category median." },
  { index: 322, sourceId: "171016", confidence: "high", method: "USDA exact name", note: "USDA SR Legacy contains the matching sesame-oil record; the source value replaces the low-confidence category estimate." },
  { index: 243, sourceId: "169098", confidence: "high", method: "USDA exact name", note: "Raw 100% orange juice is a closer form match than the prior canned or baby-food juice record; the value is unchanged." },
  { index: 129, sourceId: "171060", confidence: "high", method: "USDA exact name", note: "Raw chicken liver replaces a prepared chicken-liver pâté comparator." },
  { index: 618, sourceId: "169947", confidence: "medium-high", method: "USDA close food match", note: "Unsweetened pineapple juice replaces a drained canned-pineapple comparator and matches the 100% juice form." }
];

const molybdenumFixes = [
  { index: 25, sourceCode: "G710100", confidence: "high", method: "BLS 4.0 compatible food estimate", note: "Raw green-bean source matches the fresh/raw target form." },
  { index: 26, sourceCode: "G710200", confidence: "high", method: "BLS 4.0 compatible food estimate", note: "Deep-frozen green-bean source matches the frozen target form." },
  { index: 27, sourceCode: "G710902", confidence: "high", method: "BLS 4.0 compatible food estimate", note: "Canned, drained green-bean source matches the target form." },
  { index: 44, sourceCode: "K701902", confidence: "medium-high", method: "BLS 4.0 compatible food estimate", note: "Canned, drained button-mushroom source matches the target form." },
  { index: 437, sourceCode: "V417162", confidence: "medium-high", method: "BLS 4.0 compatible food estimate", note: "Oven-fried chicken wings with skin replace a raw-wing comparator; cooking method is close, though not identical." }
];

const beforeOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
const corrections = [];

for (const fix of cholineFixes) {
  const food = db[fix.index];
  const source = usda.find(row => String(row.fdc_id) === fix.sourceId);
  if (!food || !source || source.choline_mg == null) throw new Error(`Missing Choline source for index ${fix.index}`);
  const value = Number(source.choline_mg);
  if (!Number.isFinite(value)) throw new Error(`Invalid Choline source value for ${fix.sourceId}`);
  const previous = audit.records[fix.index].choline;
  const sourceName = source.description;
  const sourceUrl = `https://fdc.nal.usda.gov/food-details/${fix.sourceId}/nutrients?type=SR%20Legacy`;
  food.nutrients[cholineKey] = value;
  audit.records[fix.index].valuesPer100g[cholineKey] = value;
  audit.records[fix.index].choline = {
    value,
    method: fix.method,
    confidence: fix.confidence,
    sourceName,
    sourceId: fix.sourceId,
    sourceUrl,
    note: fix.note
  };
  corrections.push({
    databaseIndex: fix.index,
    food: food.name,
    name_en: food.name_en,
    nutrient: cholineKey,
    oldValue: previous.value,
    newValue: value,
    previousMethod: previous.method,
    previousSource: previous.sourceName || null,
    verifiedSource: sourceName,
    sourceId: fix.sourceId,
    sourceUrl,
    reason: fix.note
  });
}

for (const fix of molybdenumFixes) {
  const food = db[fix.index];
  const source = bls.find(row => String(row.code) === fix.sourceCode);
  if (!food || !source || source.molybdenum_ug == null) throw new Error(`Missing Molybdenum source for index ${fix.index}`);
  const value = Number(source.molybdenum_ug);
  if (!Number.isFinite(value)) throw new Error(`Invalid Molybdenum source value for ${fix.sourceCode}`);
  const previous = audit.records[fix.index].molybdenum;
  const sourceName = source.name;
  const sourceUrl = "https://blsdb.prod.se.ble.de/";
  food.nutrients[molybdenumKey] = value;
  audit.records[fix.index].valuesPer100g[molybdenumKey] = value;
  audit.records[fix.index].molybdenum = {
    value,
    method: fix.method,
    confidence: fix.confidence,
    sourceName,
    sourceCode: fix.sourceCode,
    sourceType: source.moly_source || null,
    sourceReference: source.moly_reference || null,
    sourceUrl,
    note: fix.note
  };
  corrections.push({
    databaseIndex: fix.index,
    food: food.name,
    name_en: food.name_en,
    nutrient: molybdenumKey,
    oldValue: previous.value,
    newValue: value,
    previousMethod: previous.method,
    previousSource: previous.sourceName || null,
    verifiedSource: sourceName,
    sourceCode: fix.sourceCode,
    sourceUrl,
    reason: fix.note
  });
}

const afterOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
if (beforeOtherNutrients !== afterOtherNutrients) throw new Error("Unexpected changes outside Choline and Molybdenum");
if (db.length !== audit.records.length) throw new Error("Database/audit row count mismatch");
for (let index = 0; index < db.length; index++) {
  for (const [key, nutrient] of [[cholineKey, "choline"], [molybdenumKey, "molybdenum"]]) {
    const value = db[index].nutrients[key];
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key} value at index ${index}`);
    if (audit.records[index].valuesPer100g[key] !== value || audit.records[index][nutrient].value !== value) {
      throw new Error(`Database/audit mismatch for ${key} at index ${index}`);
    }
  }
}

audit.summary.choline = audit.records.reduce((counts, row) => {
  const method = row.choline.method;
  counts[method] = (counts[method] || 0) + 1;
  return counts;
}, {});
audit.summary.molybdenum = audit.records.reduce((counts, row) => {
  const method = row.molybdenum.method;
  counts[method] = (counts[method] || 0) + 1;
  return counts;
}, {});
audit.summary.verifiedBatch005 = {
  cholineRecords: cholineFixes.length,
  molybdenumRecords: molybdenumFixes.length,
  numericChanges: corrections.filter(item => item.oldValue !== item.newValue).length
};
audit.correctionLog = [...(audit.correctionLog || []), ...corrections];

fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  applied: corrections.length,
  numericChanges: corrections.filter(item => item.oldValue !== item.newValue).length,
  correctionLogEntries: audit.correctionLog.length,
  rowCount: db.length,
  choline: cholineFixes.map(({ index }) => ({ food: db[index].name, value: db[index].nutrients[cholineKey] })),
  molybdenum: molybdenumFixes.map(({ index }) => ({ food: db[index].name, value: db[index].nutrients[molybdenumKey] }))
}, null, 2));
