import fs from "node:fs";
import { execFileSync } from "node:child_process";

const DB_PATH = "database.json";
const AUDIT_PATH = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const WORKBOOK = "Daten/AFCD_Release3_NutrientProfiles.xlsx";
const NUTRIENT = "Molybdenum (µg)";
const DATASET = "Australian Food Composition Database Release 3 (December 2025)";
const SOURCE_URL = "https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx";
const INFO_URL = "https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files";
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));

const plan = [
  { index: 165, old: 0, key: "F000448", value: 100, confidence: "high", note: "Direct match for red kidney beans, canned and drained. AFCD reports 100 µg/100 g from an analysed food profile." },
  { index: 316, old: 1.1, key: "F002390", value: 8.9, confidence: "high", note: "Direct compatible match for fresh raw celery stalk. This replaces a low-confidence transferred value." },
  { index: 350, old: 0, key: "F009193", value: 2.8, confidence: "high", note: "Direct match for common raw tomato. AFCD Release 3 reports an analysed value per 100 g." },
  { index: 687, old: 0, key: "F009193", value: 2.8, confidence: "high", note: "Direct match for common raw tomato. AFCD Release 3 reports an analysed value per 100 g." },
  { index: 203, old: 3.5, key: "F003220", value: 0, confidence: "high", note: "Direct compatible match for canned corn kernels in brine, drained. AFCD records analytical results below its reporting limit as zero, so this is a reported zero rather than proof of absolute absence." },
  { index: 346, old: 0, key: "F009300", value: 2.5, confidence: "high", note: "Direct compatible match for unflavoured tuna canned in water and drained." },
  { index: 84, old: 5, key: "F002452", value: 3.3, confidence: "high", note: "Direct match for feta cheese; replaces a sheep-cheese dip recipe comparator." },
  { index: 155, old: 1.3, key: "F002414", value: 7.9, confidence: "medium-high", note: "Direct match for natural regular-fat cheddar. The target does not specify fat level, so this is the closest measured cheddar profile." },
  { index: 348, old: 3, key: "F001463", value: 18.4, confidence: "medium-high", note: "Closest analysed match is bread made from white flour. AFCD does not distinguish packaged white toast bread from other white-flour bread." }
];

const sharedXml = execFileSync("tar", ["-xOf", WORKBOOK, "xl/sharedStrings.xml"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const decode = text => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
  .map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join(""));
const sheetXml = execFileSync("tar", ["-xOf", WORKBOOK, "xl/worksheets/sheet2.xml"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const cellValue = cell => {
  const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (value === undefined) return null;
  return /\bt="s"/.test(cell) ? shared[Number(value)] ?? null : decode(value);
};
const sourceRows = new Map();
for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  if (Number(rowMatch[1]) < 4) continue;
  const row = {};
  for (const cellMatch of rowMatch[2].matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
    const col = cellMatch[1];
    if (["A", "C", "D", "BP"].includes(col)) row[col] = cellValue(cellMatch[0]);
  }
  if (!row.A || !row.D) continue;
  const value = row.BP === "" || row.BP === null || row.BP === undefined ? null : Number(row.BP);
  if (value !== null && Number.isFinite(value)) sourceRows.set(row.A, { key: row.A, derivation: row.C, name: row.D, value });
}

const otherBefore = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[NUTRIENT];
  return copy;
}));
const changes = [];
for (const item of plan) {
  const food = db[item.index], record = audit.records[item.index], source = sourceRows.get(item.key);
  if (!food || !record || food.nutrients[NUTRIENT] !== item.old || record.valuesPer100g[NUTRIENT] !== item.old) {
    throw new Error(`Unexpected previous value at database index ${item.index}`);
  }
  if (!source || source.value !== item.value || source.derivation !== "Analysed") {
    throw new Error(`AFCD source mismatch for ${item.key}: ${JSON.stringify(source)}`);
  }
  const previous = record.molybdenum;
  food.nutrients[NUTRIENT] = item.value;
  record.valuesPer100g[NUTRIENT] = item.value;
  record.molybdenum = {
    value: item.value,
    method: "AFCD Release 3 direct compatible match",
    confidence: item.confidence,
    sourceName: source.name,
    sourceId: source.key,
    sourceDataset: DATASET,
    sourceDataType: source.derivation,
    nutrientName: "Molybdenum (Mo)",
    nutrientUnit: "µg/100 g",
    sourceUrl: SOURCE_URL,
    infoUrl: INFO_URL,
    note: item.note
  };
  changes.push({
    databaseIndex: item.index, food: food.name, name_en: food.name_en, nutrient: NUTRIENT,
    oldValue: item.old, newValue: item.value, previousMethod: previous.method,
    previousSource: previous.sourceName || null, verifiedSource: source.name,
    sourceId: source.key, sourceDataset: DATASET, sourceDataType: source.derivation,
    sourceUrl: SOURCE_URL, reason: item.note
  });
}

const otherAfter = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[NUTRIENT];
  return copy;
}));
if (otherBefore !== otherAfter) throw new Error("Unexpected modification outside Molybdenum");
if (db.length !== audit.records.length) throw new Error("Database/audit row count mismatch");
for (let i = 0; i < db.length; i++) {
  if (audit.records[i].valuesPer100g["Choline (mg)"] !== db[i].nutrients["Choline (mg)"] || audit.records[i].valuesPer100g[NUTRIENT] !== db[i].nutrients[NUTRIENT]) {
    throw new Error(`Database/audit mismatch at ${i}`);
  }
  for (const nutrient of ["Choline (mg)", NUTRIENT]) {
    if (!Number.isFinite(db[i].nutrients[nutrient]) || db[i].nutrients[nutrient] < 0) throw new Error(`Invalid ${nutrient} at ${i}`);
  }
}

audit.sources ||= [];
if (!audit.sources.some(source => /Australian Food Composition Database Release 3/.test(source.name || ""))) {
  audit.sources.push({
    name: DATASET,
    url: INFO_URL,
    dataUrl: SOURCE_URL,
    nutrient: "Molybdenum, µg/100 g",
    note: "AFCD Release 3 nutrient profiles. Its documentation states that analytical results below the reporting limit are reported as zero."
  });
}
audit.summary.molybdenum = audit.records.reduce((counts, row) => {
  counts[row.molybdenum.method] = (counts[row.molybdenum.method] || 0) + 1;
  return counts;
}, {});
audit.summary.afcdMolybdenumBatch010 = {
  sourceRowsWithMolybdenum: sourceRows.size,
  corrections: changes.length,
  numericChanges: changes.filter(row => row.oldValue !== row.newValue).length
};
audit.correctionLog = [...(audit.correctionLog || []), ...changes];

fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sourceRowsWithMolybdenum: sourceRows.size,
  corrections: changes.length,
  numericChanges: changes.filter(row => row.oldValue !== row.newValue).length,
  correctionLogEntries: audit.correctionLog.length,
  changes: changes.map(row => ({ index: row.databaseIndex, food: row.food, old: row.oldValue, value: row.newValue, source: row.verifiedSource, sourceId: row.sourceId }))
}, null, 2));
