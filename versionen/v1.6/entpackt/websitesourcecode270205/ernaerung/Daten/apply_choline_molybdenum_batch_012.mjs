import fs from "node:fs";
import { execFileSync } from "node:child_process";

const DB_PATH = "database.json";
const AUDIT_PATH = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const PROFILE_PATH = "Daten/AFCD_Release3_NutrientProfiles.xlsx";
const DETAILS_PATH = "Daten/AFCD_Release3_FoodDetails.xlsx";
const FNDDS_PATH = "Daten/USDA_FNDDS_2021-2023_extracted/surveyDownload.json";
const CHOLINE = "Choline (mg)";
const MOLYBDENUM = "Molybdenum (µg)";
const AFCD_DATASET = "Australian Food Composition Database Release 3 (December 2025)";
const AFCD_PROFILE_URL = "https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx";
const AFCD_INFO_URL = "https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files";
const FNDDS_DATASET = "FNDDS 2021-2023";
const FNDDS_SOURCE_URL = "https://fdc.nal.usda.gov/food-details/2706166/nutrients?type=FNDDS";

const afcdPlan = [
  {
    index: 191, old: 0, key: "F009527", value: 0,
    confidence: "medium-high",
    note: "AFCD analysed tap water directly. AFCD reports analytical results below the reporting limit as zero; local water values can vary, so this is a sample-based estimate, not proof of universal absence."
  },
  {
    index: 758, old: 0, key: "F006177", value: 0,
    confidence: "medium-high",
    note: "AFCD analysed olive oil directly. Its reported zero follows the database convention for values below the reporting limit, supporting the near-zero value for purified oil."
  },
  {
    index: 241, old: 0, key: "F006177", value: 0,
    confidence: "medium",
    note: "Extra-virgin olive oil is a compatible, though not identical, form of the analysed olive oil. AFCD reports below-reporting-limit analytical results as zero."
  },
  {
    index: 389, old: 0, key: "F008976", value: 0,
    confidence: "medium-high",
    note: "AFCD analysed white granulated sugar directly. Its reported zero follows the database convention for values below the reporting limit."
  }
];

const fnddsPlan = [
  {
    index: 381, old: 75.6, sourceId: 2706166, sourceName: "Hot dog, NFS", value: 31.9,
    confidence: "medium-low",
    note: "Closest broad FNDDS sausage match by product identity and the target's energy, fat, protein, and sodium profile. Wiener Würstchen recipes vary, so retain this as an estimate rather than a direct match."
  }
];

const readSharedStrings = path => {
  const xml = execFileSync("tar", ["-xOf", path, "xl/sharedStrings.xml"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const decode = text => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(item => decode(item[1])).join(""));
};

const parseAfcdRows = (path, sheet, shared, wantedColumns) => {
  const xml = execFileSync("tar", ["-xOf", path, sheet], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const out = new Map();
  for (const rowMatch of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    if (Number(rowMatch[1]) < 4) continue;
    const row = {};
    for (const cell of rowMatch[2].matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
      if (!wantedColumns.includes(cell[1])) continue;
      const value = cell[0].match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (value === undefined) row[cell[1]] = null;
      else row[cell[1]] = /\bt="s"/.test(cell[0]) ? shared[Number(value)] ?? null : value;
    }
    if (row.A && row.D) out.set(row.A, row);
  }
  return out;
};

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
if (!Array.isArray(db) || db.length !== 1516 || audit.records.length !== db.length) throw new Error("Unexpected database/audit grain");

const profileShared = readSharedStrings(PROFILE_PATH);
const profileRows = parseAfcdRows(PROFILE_PATH, "xl/worksheets/sheet2.xml", profileShared, ["A", "C", "D", "BP"]);
const detailsShared = readSharedStrings(DETAILS_PATH);
const detailsRows = parseAfcdRows(DETAILS_PATH, "xl/worksheets/sheet2.xml", detailsShared, ["A", "C", "D", "F"]);
const afcdMolyRows = [...profileRows.values()].filter(row => row.BP !== undefined && row.BP !== null && row.BP !== "" && Number.isFinite(Number(row.BP)));

const fndds = JSON.parse(fs.readFileSync(FNDDS_PATH, "utf8")).SurveyFoods;
const fnddsById = new Map(fndds.map(food => [Number(food.fdcId), food]));

const untouched = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[CHOLINE];
  delete copy.nutrients[MOLYBDENUM];
  return copy;
}));
const changes = [];

for (const item of afcdPlan) {
  const food = db[item.index];
  const record = audit.records[item.index];
  const profile = profileRows.get(item.key);
  const detail = detailsRows.get(item.key);
  const value = profile?.BP === undefined || profile?.BP === null || profile?.BP === "" ? null : Number(profile.BP);
  if (!food || !record || food.nutrients[MOLYBDENUM] !== item.old || record.valuesPer100g[MOLYBDENUM] !== item.old) {
    throw new Error(`Unexpected prior molybdenum value at row ${item.index}`);
  }
  if (!profile || !detail || profile.C !== "Analysed" || profile.D !== detail.D || value !== item.value) {
    throw new Error(`AFCD source verification failed for ${item.key}: ${JSON.stringify({ profile, detail })}`);
  }
  const previous = record.molybdenum;
  food.nutrients[MOLYBDENUM] = value;
  record.valuesPer100g[MOLYBDENUM] = value;
  record.molybdenum = {
    value,
    method: "AFCD Release 3 direct compatible match",
    confidence: item.confidence,
    sourceName: profile.D,
    sourceId: item.key,
    sourceDataset: AFCD_DATASET,
    sourceDataType: profile.C,
    nutrientName: "Molybdenum (Mo)",
    nutrientUnit: "µg/100 g",
    samplingDetails: detail.F,
    sourceUrl: AFCD_PROFILE_URL,
    infoUrl: AFCD_INFO_URL,
    note: item.note
  };
  changes.push({
    databaseIndex: item.index, food: food.name, name_en: food.name_en,
    nutrient: MOLYBDENUM, oldValue: item.old, newValue: value,
    previousMethod: previous.method, previousSource: previous.sourceName || null,
    verifiedSource: profile.D, sourceId: item.key, sourceDataset: AFCD_DATASET,
    sourceDataType: profile.C, sourceUrl: AFCD_PROFILE_URL, reason: item.note
  });
}

for (const item of fnddsPlan) {
  const food = db[item.index];
  const record = audit.records[item.index];
  const source = fnddsById.get(item.sourceId);
  const nutrient = source?.foodNutrients?.find(row => String(row.nutrient?.number) === "421");
  const value = nutrient && nutrient.nutrient?.unitName === "mg" ? Number(Number(nutrient.amount).toFixed(1)) : null;
  if (!food || !record || food.nutrients[CHOLINE] !== item.old || record.valuesPer100g[CHOLINE] !== item.old) {
    throw new Error(`Unexpected prior choline value at row ${item.index}`);
  }
  if (!source || source.description !== item.sourceName || source.dataType !== "Survey (FNDDS)" || value !== item.value) {
    throw new Error(`FNDDS source verification failed for ${item.sourceId}`);
  }
  const previous = record.choline;
  food.nutrients[CHOLINE] = value;
  record.valuesPer100g[CHOLINE] = value;
  record.choline = {
    value,
    method: "USDA FNDDS compatible food estimate",
    confidence: item.confidence,
    sourceName: source.description,
    sourceId: String(source.fdcId),
    sourceCode: String(source.foodCode),
    sourceDataset: FNDDS_DATASET,
    sourceDataType: source.dataType,
    nutrientNumber: String(nutrient.nutrient.number),
    nutrientName: nutrient.nutrient.name,
    nutrientUnit: nutrient.nutrient.unitName,
    derivation: nutrient.foodNutrientDerivation?.description || null,
    dataPoints: nutrient.dataPoints ?? null,
    sourceUrl: FNDDS_SOURCE_URL,
    note: item.note
  };
  changes.push({
    databaseIndex: item.index, food: food.name, name_en: food.name_en,
    nutrient: CHOLINE, oldValue: item.old, newValue: value,
    previousMethod: previous.method, previousSource: previous.sourceName || null,
    verifiedSource: source.description, sourceId: String(source.fdcId),
    sourceDataset: FNDDS_DATASET, sourceUrl: FNDDS_SOURCE_URL, reason: item.note
  });
}

const afterUntouched = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[CHOLINE];
  delete copy.nutrients[MOLYBDENUM];
  return copy;
}));
if (untouched !== afterUntouched) throw new Error("Unexpected edits outside Choline and Molybdenum");

for (let index = 0; index < db.length; index++) {
  for (const nutrient of [CHOLINE, MOLYBDENUM]) {
    const value = db[index].nutrients[nutrient];
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${nutrient} at row ${index}`);
    if (audit.records[index].valuesPer100g[nutrient] !== value) throw new Error(`Database/audit mismatch at row ${index}`);
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
audit.summary.afcdMolybdenumBatch011.sourceRowsWithMolybdenum = afcdMolyRows.length;
audit.summary.cholineMolybdenumBatch012 = {
  afcdMolybdenumProfileRows: profileRows.size,
  afcdRowsWithNumericMolybdenum: afcdMolyRows.length,
  afcdCorrections: afcdPlan.length,
  fnddsCholineCorrections: fnddsPlan.length,
  numericChanges: changes.filter(row => row.oldValue !== row.newValue).length
};
audit.correctionLog = [...(audit.correctionLog || []), ...changes];

fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  afcdRowsWithNumericMolybdenum: afcdMolyRows.length,
  corrections: changes.length,
  numericChanges: changes.filter(row => row.oldValue !== row.newValue).length,
  correctionLogEntries: audit.correctionLog.length,
  changes: changes.map(row => ({ index: row.databaseIndex, food: row.food, nutrient: row.nutrient, old: row.oldValue, value: row.newValue, source: row.verifiedSource }))
}, null, 2));
