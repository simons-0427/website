import fs from "node:fs";
import { execFileSync } from "node:child_process";

const DB_PATH = "database.json";
const AUDIT_PATH = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const PROFILE = "Daten/AFCD_Release3_NutrientProfiles.xlsx";
const DETAILS = "Daten/AFCD_Release3_FoodDetails.xlsx";
const NUTRIENT = "Molybdenum (µg)";
const DATASET = "Australian Food Composition Database Release 3 (December 2025)";
const SOURCE_URL = "https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx";
const INFO_URL = "https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files";

const plan = [
  { index: 182, old: 0.1, key: "F007827", value: 0, confidence: "medium-high", note: "Direct match for raw Atlantic salmon fillet. AFCD sampled farmed Atlantic salmon and included molybdenum in its metal analysis." },
  { index: 37, old: 0, key: "F001973", value: 2.9, confidence: "medium-high", note: "Direct measured profile for plain salted butter. The target does not specify salt, which does not materially change its trace mineral content." },
  { index: 240, old: 7.8, key: "F006198", value: 1.5, confidence: "medium", note: "Closest analysed match is preserved green or black olives, drained. The source combines olive colours, so this remains an estimate for green olives." },
  { index: 43, old: 3.5, key: "F005946", value: 2.1, confidence: "medium-high", note: "AFCD's analysed raw common mushroom profile includes button and flat mushrooms. It replaces an older, more narrowly sampled literature comparator of 3.49 µg/100 g." },
  { index: 577, old: 6.4, key: "F006573", value: 0.7, confidence: "medium-high", note: "Direct raw yellow-peach profile replaces the previous dried-peach comparator. The target does not specify cultivar or skin." },
  { index: 601, old: 0.7, key: "F005520", value: 1.3, confidence: "high", note: "Direct match for raw watermelon flesh with peel removed. AFCD reports a profile based on watermelon samples and a separate national molybdenum sample set." },
  { index: 472, old: 1.9, key: "F006844", value: 22, confidence: "medium", note: "Closest analysed match is commercial salted, butter-flavoured popcorn. The target does not specify flavour, so the product variant remains a limitation." },
  { index: 576, old: 0, key: "F006021", value: 2, confidence: "high", note: "Direct compatible match for raw yellow nectarine. AFCD's minerals include molybdenum and draw on recent composite samples." },
  { index: 340, old: 26, key: "F009076", value: 730, confidence: "medium-high", note: "Direct match for tahini, sesame seed pulp. AFCD's profile is based mainly on six tahini purchases from 1989, so the measured value is old even though the food identity is exact." }
];

const readShared = path => {
  const xml = execFileSync("tar", ["-xOf", path, "xl/sharedStrings.xml"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const decode = text => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join(""));
};
const cellValue = (cell, shared) => {
  const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (value === undefined) return null;
  return /\bt="s"/.test(cell) ? shared[Number(value)] ?? null : value;
};
const parseRows = (path, sheet, shared, wantedColumns) => {
  const xml = execFileSync("tar", ["-xOf", path, sheet], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const out = new Map();
  for (const rowMatch of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    if (Number(rowMatch[1]) < 4) continue;
    const row = {};
    for (const match of rowMatch[2].matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
      const col = match[1];
      if (wantedColumns.includes(col)) row[col] = cellValue(match[0], shared);
    }
    if (row.A && row.D) out.set(row.A, row);
  }
  return out;
};

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
const profileShared = readShared(PROFILE);
const profileRows = parseRows(PROFILE, "xl/worksheets/sheet2.xml", profileShared, ["A", "C", "D", "E", "H", "J", "L", "BP"]);
const detailsShared = readShared(DETAILS);
const detailsRows = parseRows(DETAILS, "xl/worksheets/sheet2.xml", detailsShared, ["A", "C", "D", "E", "F"]);

const otherBefore = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[NUTRIENT];
  return copy;
}));
const changes = [];
for (const item of plan) {
  const food = db[item.index], record = audit.records[item.index];
  const p = profileRows.get(item.key), d = detailsRows.get(item.key);
  const value = p?.BP === "" || p?.BP === undefined || p?.BP === null ? null : Number(p.BP);
  if (!food || !record || food.nutrients[NUTRIENT] !== item.old || record.valuesPer100g[NUTRIENT] !== item.old) {
    throw new Error(`Unexpected previous value at database index ${item.index}`);
  }
  if (!p || !d || value !== item.value || p.D !== d.D || p.C !== "Analysed") {
    throw new Error(`AFCD source mismatch for ${item.key}: ${JSON.stringify({ profile: p, details: d })}`);
  }
  const previous = record.molybdenum;
  food.nutrients[NUTRIENT] = value;
  record.valuesPer100g[NUTRIENT] = value;
  record.molybdenum = {
    value,
    method: "AFCD Release 3 direct compatible match",
    confidence: item.confidence,
    sourceName: p.D,
    sourceId: item.key,
    sourceDataset: DATASET,
    sourceDataType: p.C,
    nutrientName: "Molybdenum (Mo)",
    nutrientUnit: "µg/100 g",
    samplingDetails: d.F,
    sourceUrl: SOURCE_URL,
    infoUrl: INFO_URL,
    note: item.note
  };
  changes.push({
    databaseIndex: item.index, food: food.name, name_en: food.name_en, nutrient: NUTRIENT,
    oldValue: item.old, newValue: value, previousMethod: previous.method,
    previousSource: previous.sourceName || null, verifiedSource: p.D,
    sourceId: item.key, sourceDataset: DATASET, sourceDataType: p.C,
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
  for (const nutrient of ["Choline (mg)", NUTRIENT]) {
    if (audit.records[i].valuesPer100g[nutrient] !== db[i].nutrients[nutrient]) throw new Error(`Database/audit mismatch at ${i}`);
    if (!Number.isFinite(db[i].nutrients[nutrient]) || db[i].nutrients[nutrient] < 0) throw new Error(`Invalid ${nutrient} at ${i}`);
  }
}

audit.summary.molybdenum = audit.records.reduce((counts, row) => {
  counts[row.molybdenum.method] = (counts[row.molybdenum.method] || 0) + 1;
  return counts;
}, {});
audit.summary.afcdMolybdenumBatch011 = {
  sourceRowsWithMolybdenum: profileRows.size,
  corrections: changes.length,
  numericChanges: changes.filter(row => row.oldValue !== row.newValue).length
};
audit.correctionLog = [...(audit.correctionLog || []), ...changes];
fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sourceRowsWithMolybdenum: profileRows.size,
  corrections: changes.length,
  numericChanges: changes.filter(row => row.oldValue !== row.newValue).length,
  correctionLogEntries: audit.correctionLog.length,
  changes: changes.map(row => ({ index: row.databaseIndex, food: row.food, old: row.oldValue, value: row.newValue, source: row.verifiedSource, sourceId: row.sourceId }))
}, null, 2));
