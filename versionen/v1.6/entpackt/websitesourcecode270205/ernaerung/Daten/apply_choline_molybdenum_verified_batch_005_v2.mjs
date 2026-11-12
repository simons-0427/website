import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const bls = JSON.parse(fs.readFileSync("Daten/BLS_4_0_Molybdenum_extract.json", "utf8"));
const C = "Choline (mg)", M = "Molybdenum (µg)";
const cholineFixes = [
  { i: 933, id: "171421", confidence: "high", method: "USDA exact name", note: "Matching cocoa-butter record; value retained and source provenance improved." },
  { i: 130, id: "172454", confidence: "medium-high", method: "USDA close food match", note: "Home-prepared hummus is a direct food match with a compatible macro profile; replaces category median." },
  { i: 322, id: "171016", confidence: "high", method: "USDA exact name", note: "Matching sesame-oil record replaces the low-confidence category estimate." },
  { i: 243, id: "169098", confidence: "high", method: "USDA exact name", note: "Raw 100% orange juice is a closer form match than the prior canned record; value unchanged." },
  { i: 129, id: "171060", confidence: "high", method: "USDA exact name", note: "Raw chicken liver replaces prepared chicken-liver pâté comparator." },
  { i: 618, id: "169947", confidence: "medium-high", method: "USDA close food match", note: "Unsweetened pineapple juice replaces drained canned-pineapple comparator and matches the 100% juice form." }
];
const molyFixes = [
  { i: 25, code: "G710100", confidence: "high", note: "Raw green-bean source matches fresh/raw target form." },
  { i: 26, code: "G710200", confidence: "high", note: "Deep-frozen green-bean source matches frozen target form." },
  { i: 27, code: "G710902", confidence: "high", note: "Canned, drained green-bean source matches target form." },
  { i: 44, code: "K701902", confidence: "medium-high", note: "Canned, drained button-mushroom source matches target form." },
  { i: 437, code: "V417162", confidence: "medium-high", note: "Oven-fried chicken wings with skin replace raw-wing comparator; cooking method is close, not identical." }
];
const beforeOther = JSON.stringify(db.map(f => {
  const copy = structuredClone(f); delete copy.nutrients[C]; delete copy.nutrients[M]; return copy;
}));
const changes = [];

for (const fix of cholineFixes) {
  const food = db[fix.i], source = usda.find(r => String(r.fdc_id) === fix.id);
  if (!food || !source || source.choline_mg == null) throw new Error(`Missing USDA source ${fix.id}`);
  const value = Number(source.choline_mg), prev = audit.records[fix.i].choline;
  const url = `https://fdc.nal.usda.gov/food-details/${fix.id}/nutrients?type=SR%20Legacy`;
  food.nutrients[C] = value; audit.records[fix.i].valuesPer100g[C] = value;
  audit.records[fix.i].choline = { value, method: fix.method, confidence: fix.confidence, sourceName: source.description, sourceId: fix.id, sourceUrl: url, note: fix.note };
  changes.push({ databaseIndex: fix.i, food: food.name, name_en: food.name_en, nutrient: C, oldValue: prev.value, newValue: value, previousMethod: prev.method, previousSource: prev.sourceName || null, verifiedSource: source.description, sourceId: fix.id, sourceUrl: url, reason: fix.note });
}
for (const fix of molyFixes) {
  const food = db[fix.i], source = bls.find(r => String(r.code) === fix.code);
  if (!food || !source || source.molybdenum_ug == null) throw new Error(`Missing BLS source ${fix.code}`);
  const value = Number(source.molybdenum_ug), prev = audit.records[fix.i].molybdenum;
  const url = "https://blsdb.prod.se.ble.de/";
  food.nutrients[M] = value; audit.records[fix.i].valuesPer100g[M] = value;
  audit.records[fix.i].molybdenum = { value, method: "BLS 4.0 compatible food estimate", confidence: fix.confidence, sourceName: source.name, sourceCode: fix.code, sourceType: source.moly_source || null, sourceReference: source.moly_reference || null, sourceUrl: url, note: fix.note };
  changes.push({ databaseIndex: fix.i, food: food.name, name_en: food.name_en, nutrient: M, oldValue: prev.value, newValue: value, previousMethod: prev.method, previousSource: prev.sourceName || null, verifiedSource: source.name, sourceCode: fix.code, sourceUrl: url, reason: fix.note });
}

const afterOther = JSON.stringify(db.map(f => {
  const copy = structuredClone(f); delete copy.nutrients[C]; delete copy.nutrients[M]; return copy;
}));
if (beforeOther !== afterOther) throw new Error("Changes outside Choline/Molybdenum detected");
if (db.length !== audit.records.length) throw new Error("Database/audit row count mismatch");
for (let i = 0; i < db.length; i++) {
  if (audit.records[i].valuesPer100g[C] !== db[i].nutrients[C] || audit.records[i].valuesPer100g[M] !== db[i].nutrients[M]) throw new Error(`Database/audit value mismatch at row ${i}`);
  if (!Number.isFinite(db[i].nutrients[C]) || db[i].nutrients[C] < 0 || !Number.isFinite(db[i].nutrients[M]) || db[i].nutrients[M] < 0) throw new Error(`Invalid nutrient value at row ${i}`);
}
audit.summary.choline = audit.records.reduce((o, r) => ((o[r.choline.method] = (o[r.choline.method] || 0) + 1), o), {});
audit.summary.molybdenum = audit.records.reduce((o, r) => ((o[r.molybdenum.method] = (o[r.molybdenum.method] || 0) + 1), o), {});
audit.summary.verifiedBatch005 = { cholineRecords: cholineFixes.length, molybdenumRecords: molyFixes.length, numericChanges: changes.filter(c => c.oldValue !== c.newValue).length };
audit.correctionLog = [...(audit.correctionLog || []), ...changes];
fs.writeFileSync("database.json", `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ applied: changes.length, numericChanges: changes.filter(c => c.oldValue !== c.newValue).length, logEntries: audit.correctionLog.length, rowCount: db.length, choline: cholineFixes.map(x => ({ food: db[x.i].name, value: db[x.i].nutrients[C] })), molybdenum: molyFixes.map(x => ({ food: db[x.i].name, value: db[x.i].nutrients[M] })) }, null, 2));
