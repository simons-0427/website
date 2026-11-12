import fs from "node:fs";

const DB_PATH = "database.json";
const AUDIT_PATH = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const BLS_PATH = "Daten/BLS_4_0_Molybdenum_extract.json";
const NUTRIENT = "Molybdenum (µg)";
const DATASET = "Bundeslebensmittelschlüssel 4.0";
const SOURCE_URL = "https://blsdb.prod.se.ble.de/";
const plan = [
  {
    index: 66, old: 3.9, sourceCode: "V4A6100", value: 3,
    note: "The previous comparator was grilled duck breast with skin. Raw, skinless chicken breast is closer in preparation and the target's macro profile, though the species differs and the BLS molybdenum value is inherited; confidence remains medium."
  },
  {
    index: 794, old: 2.4, sourceCode: "U202000", value: 0.1,
    note: "The previous comparator was breaded, fried pork schnitzel. Raw, lean beef is closer in preparation and macros, but the species differs and the BLS molybdenum value is inherited; confidence remains medium."
  }
];

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
const bls = JSON.parse(fs.readFileSync(BLS_PATH, "utf8"));
const blsByCode = new Map(bls.map(row => [String(row.code), row]));
if (!Array.isArray(db) || db.length !== 1516 || audit.records.length !== db.length) throw new Error("Unexpected database/audit grain");

const beforeOther = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[NUTRIENT];
  return copy;
}));
const corrections = [];
for (const item of plan) {
  const food = db[item.index];
  const record = audit.records[item.index];
  const source = blsByCode.get(item.sourceCode);
  const value = source ? Number(Number(source.molybdenum_ug).toFixed(1)) : null;
  const targetName = `${food?.name || ""} ${food?.name_en || ""}`.toLowerCase();
  const sourceName = `${source?.name || ""} ${source?.name_en || ""}`.toLowerCase();
  if (!food || !record || food.nutrients[NUTRIENT] !== item.old || record.valuesPer100g[NUTRIENT] !== item.old) {
    throw new Error(`Unexpected previous value at row ${item.index}`);
  }
  if (!source || value !== item.value || source.moly_source !== "Übernommener Wert" || !targetName.includes("raw") || !sourceName.includes("raw")) {
    throw new Error(`Incompatible BLS source for ${food.name}: ${JSON.stringify(source)}`);
  }
  const previous = record.molybdenum;
  food.nutrients[NUTRIENT] = value;
  record.valuesPer100g[NUTRIENT] = value;
  record.molybdenum = {
    value,
    method: "BLS form-aware compatible food estimate",
    confidence: "medium",
    sourceName: source.name,
    sourceCode: item.sourceCode,
    sourceType: source.moly_source,
    sourceReference: source.moly_reference,
    sourceDataset: DATASET,
    sourceUrl: SOURCE_URL,
    note: item.note
  };
  corrections.push({
    databaseIndex: item.index,
    food: food.name,
    name_en: food.name_en,
    nutrient: NUTRIENT,
    oldValue: item.old,
    newValue: value,
    previousMethod: previous.method,
    previousSource: previous.sourceName || null,
    verifiedSource: source.name,
    sourceCode: item.sourceCode,
    sourceDataset: DATASET,
    sourceUrl: SOURCE_URL,
    reason: item.note
  });
}

const afterOther = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[NUTRIENT];
  return copy;
}));
if (beforeOther !== afterOther) throw new Error("Unexpected edits outside Molybdenum");
for (let index = 0; index < db.length; index++) {
  const value = db[index].nutrients[NUTRIENT];
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid Molybdenum at row ${index}`);
  if (audit.records[index].valuesPer100g[NUTRIENT] !== value) throw new Error(`Database/audit mismatch at row ${index}`);
}

audit.summary.molybdenum = audit.records.reduce((counts, row) => {
  const method = row.molybdenum.method;
  counts[method] = (counts[method] || 0) + 1;
  return counts;
}, {});
audit.summary.formAwareBLSBatch013 = { corrections: corrections.length, numericChanges: corrections.filter(row => row.oldValue !== row.newValue).length };
audit.correctionLog = [...(audit.correctionLog || []), ...corrections];
fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ corrections, correctionLogEntries: audit.correctionLog.length }, null, 2));
