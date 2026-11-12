import fs from "node:fs";

const DB_PATH = "database.json";
const AUDIT_PATH = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const NUTRIENT = "Molybdenum (µg)";
const DATASET = "Japanese Standard Tables of Food Composition 2023 (Supplement)";
const SOURCE_INDEX = "https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html";
const SOURCE_SITE = "https://fooddb.mext.go.jp/";

const plan = [
  {
    index: 0, name: "Adzukibohnen (trocken)", old: 0, value: 210,
    sourceCode: "04001", sourceName: "PULSES/Adzuki beans/mature seeds, whole, raw",
    confidence: "medium-high", match: "exact",
    note: "MEXT 2023 identifies whole, raw adzuki beans, matching the target's dry/raw form. Source-country and cultivar differences remain possible."
  },
  {
    index: 13, name: "Aubergine (roh)", old: 8.2, value: 10,
    sourceCode: "06191", sourceName: "VEGETABLES/Eggplant/fruit, raw",
    confidence: "medium-high", match: "exact",
    note: "MEXT 2023 lists raw eggplant. The food and preparation form match; the target's energy value is higher than MEXT's, so cultivar and source-country variation remains possible."
  },
  {
    index: 60, name: "Edamame, gefroren", old: 13, value: 190,
    sourceCode: "06017", sourceName: "VEGETABLES/Soybeans/immature, frozen",
    confidence: "medium-high", match: "exact",
    note: "MEXT 2023 lists immature soybeans as frozen, matching frozen edamame. Country and cultivar differences remain possible."
  },
  {
    index: 161, name: "Kichererbsen (trocken)", old: 0, value: 150,
    sourceCode: "04065", sourceName: "PULSES/Chickpeas/mature seeds, whole, raw",
    confidence: "high", match: "exact",
    note: "MEXT 2023 identifies whole, raw mature chickpeas, matching dried chickpeas."
  },
  {
    index: 163, name: "Kichererbsen, getrocknet (Discounter)", old: 0, value: 150,
    sourceCode: "04065", sourceName: "PULSES/Chickpeas/mature seeds, whole, raw",
    confidence: "high", match: "exact",
    note: "MEXT 2023 identifies whole, raw mature chickpeas, matching the dried chickpea product. Brand-level variation is not represented."
  },
  {
    index: 193, name: "Linsen, beluga (trocken)", old: 0, value: 180,
    sourceCode: "04073", sourceName: "PULSES/Lentils/mature seeds, whole, raw",
    confidence: "medium", match: "compatible",
    note: "MEXT 2023 reports mature, whole, raw lentils without a cultivar. Used as a compatible estimate for dry Beluga lentils."
  },
  {
    index: 194, name: "Linsen, braun (trocken)", old: 0, value: 180,
    sourceCode: "04073", sourceName: "PULSES/Lentils/mature seeds, whole, raw",
    confidence: "medium", match: "compatible",
    note: "MEXT 2023 reports mature, whole, raw lentils without a cultivar. Used as a compatible estimate for dry brown lentils."
  },
  {
    index: 196, name: "Linsen, rot (trocken)", old: 0, value: 180,
    sourceCode: "04073", sourceName: "PULSES/Lentils/mature seeds, whole, raw",
    confidence: "medium", match: "compatible",
    note: "MEXT 2023 reports mature, whole, raw lentils without a cultivar. Used as a compatible estimate for dry red lentils."
  },
  {
    index: 235, name: "Natto (fermentierte Sojabohnen)", old: 13, value: 290,
    sourceCode: "04046", sourceName: "PULSES/Soybeans/natto, Itohiki-natto (fermented whole soybean)",
    confidence: "high", match: "exact",
    note: "MEXT 2023 identifies Itohiki-natto as fermented whole soybean, matching natto."
  },
  {
    index: 546, name: "Edamame, roh", old: 13, value: 240,
    sourceCode: "06015", sourceName: "VEGETABLES/Soybeans/immature, raw",
    confidence: "medium-high", match: "exact",
    note: "MEXT 2023 lists immature soybeans raw, matching raw edamame. Country and cultivar differences remain possible."
  },
  {
    index: 852, name: "Linse rot reif", old: 0, value: 180,
    sourceCode: "04073", sourceName: "PULSES/Lentils/mature seeds, whole, raw",
    confidence: "medium", match: "compatible",
    note: "MEXT 2023 reports mature, whole, raw lentils without a cultivar. Used as a compatible estimate for mature red lentils."
  }
];

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
if (!Array.isArray(db) || db.length !== 1516 || audit.records.length !== db.length) {
  throw new Error("Unexpected database/audit grain");
}

const sourceEntry = {
  name: DATASET,
  url: SOURCE_INDEX,
  dataUrl: SOURCE_SITE,
  nutrient: "Molybdenum, µg per 100 g edible portion",
  note: "Official MEXT Japanese food composition tables. Record-specific item codes and detail URLs are retained for each match."
};
if (!(audit.sources || []).some(source => source.name === DATASET)) {
  audit.sources = [...(audit.sources || []), sourceEntry];
}

const beforeOther = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[NUTRIENT];
  return copy;
}));
const corrections = [];
for (const item of plan) {
  const food = db[item.index];
  const record = audit.records[item.index];
  const current = Number(food?.nutrients?.[NUTRIENT]);
  const auditCurrent = Number(record?.valuesPer100g?.[NUTRIENT]);
  if (!food || !record || food.name !== item.name || current !== item.old || Number(auditCurrent.toFixed(1)) !== item.old) {
    throw new Error(`Unexpected previous value or identity at row ${item.index}: ${food?.name} ${current} / ${auditCurrent}`);
  }

  const previous = record.molybdenum;
  const sourceUrl = `https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=${item.sourceCode[1]}_${item.sourceCode}_7`;
  food.nutrients[NUTRIENT] = item.value;
  record.valuesPer100g[NUTRIENT] = item.value;
  record.molybdenum = {
    value: item.value,
    method: item.match === "exact" ? "MEXT 2023 exact food-form match" : "MEXT 2023 compatible food match",
    confidence: item.confidence,
    sourceName: item.sourceName,
    sourceCode: item.sourceCode,
    sourceDataset: DATASET,
    sourceUrl,
    note: item.note
  };
  corrections.push({
    databaseIndex: item.index,
    food: food.name,
    name_en: food.name_en,
    nutrient: NUTRIENT,
    oldValue: current,
    newValue: item.value,
    previousMethod: previous.method,
    previousConfidence: previous.confidence,
    previousSource: previous.sourceName || null,
    verifiedSource: item.sourceName,
    sourceCode: item.sourceCode,
    sourceDataset: DATASET,
    sourceUrl,
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
  const auditValue = Number(audit.records[index].valuesPer100g[NUTRIENT]);
  if (Math.round(value * 10) !== Math.round(auditValue * 10)) {
    throw new Error(`Database/audit rounding mismatch at row ${index}`);
  }
}

audit.summary.molybdenum = audit.records.reduce((counts, row) => {
  const method = row.molybdenum.method;
  counts[method] = (counts[method] || 0) + 1;
  return counts;
}, {});
audit.summary.mextMolybdenumBatch014 = {
  sourceRowsWithNumericMolybdenum: 1087,
  corrections: corrections.length,
  exactFoodFormMatches: plan.filter(item => item.match === "exact").length,
  compatibleVarietyMatches: plan.filter(item => item.match === "compatible").length,
  numericChanges: corrections.filter(item => item.oldValue !== item.newValue).length
};
audit.correctionLog = [...(audit.correctionLog || []), ...corrections];
fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ summary: audit.summary.mextMolybdenumBatch014, corrections }, null, 2));
