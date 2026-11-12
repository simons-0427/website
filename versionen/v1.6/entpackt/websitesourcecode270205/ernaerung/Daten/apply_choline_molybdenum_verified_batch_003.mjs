import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const usdaPath = "Daten/USDA_SR_Legacy_Choline_extract.json";
const blsPath = "Daten/BLS_4_0_Molybdenum_extract.json";
const cholineKey = "Choline (mg)";
const molybdenumKey = "Molybdenum (\u00B5g)";

const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync(usdaPath, "utf8"));
const bls = JSON.parse(fs.readFileSync(blsPath, "utf8"));
const usdaById = new Map(usda.map(row => [String(row.fdc_id), row]));
const blsByCode = new Map(bls.map(row => [String(row.code), row]));
const beforeOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
const corrections = [];

function targetIndex(nameEn) {
  const index = db.findIndex(food => food.name_en === nameEn);
  if (index < 0 || audit.records[index]?.name_en !== nameEn) throw new Error(`Missing or misaligned target: ${nameEn}`);
  return index;
}

function recordCholineCorrection(index, value, details) {
  const oldValue = db[index].nutrients[cholineKey];
  const oldSource = audit.records[index].choline?.sourceName || audit.records[index].choline?.method || "unknown estimate";
  db[index].nutrients[cholineKey] = value;
  audit.records[index].valuesPer100g[cholineKey] = value;
  audit.records[index].choline = { value, ...details };
  corrections.push({
    databaseIndex: index,
    food: db[index].name,
    name_en: db[index].name_en,
    nutrient: cholineKey,
    oldValue,
    newValue: value,
    previousSource: oldSource,
    ...details
  });
}

function setCholineUsda(nameEn, sourceId, confidence, reason) {
  const index = targetIndex(nameEn);
  const source = usdaById.get(String(sourceId));
  const value = Number(source?.choline_mg);
  if (!source || !Number.isFinite(value)) throw new Error(`Missing numeric USDA choline source: ${sourceId}`);
  const sourceUrl = `https://fdc.nal.usda.gov/food-details/${source.fdc_id}/nutrients?type=SR%20Legacy`;
  recordCholineCorrection(index, Number(value.toFixed(1)), {
    method: "USDA compatible food estimate",
    confidence,
    sourceName: source.description,
    sourceId: String(source.fdc_id),
    sourceUrl,
    note: reason
  });
}

function setMoBls(nameEn, sourceCode, confidence, reason) {
  const index = targetIndex(nameEn);
  const source = blsByCode.get(String(sourceCode));
  const value = Number(source?.molybdenum_ug);
  if (!source || !Number.isFinite(value)) throw new Error(`Missing numeric BLS molybdenum source: ${sourceCode}`);
  const sourceUrl = "https://blsdb.prod.se.ble.de/";
  db[index].nutrients[molybdenumKey] = Number(value.toFixed(1));
  audit.records[index].valuesPer100g[molybdenumKey] = Number(value.toFixed(1));
  const details = {
    value,
    method: "BLS compatible food estimate",
    confidence,
    sourceName: source.name,
    sourceCode: String(source.code),
    sourceType: source.moly_source || null,
    sourceReference: source.moly_reference || null,
    sourceUrl,
    note: reason
  };
  audit.records[index].molybdenum = details;
  corrections.push({
    databaseIndex: index,
    food: db[index].name,
    name_en: nameEn,
    nutrient: molybdenumKey,
    oldValue: audit.correctionLog?.at(-1)?.newValue ?? null,
    newValue: Number(value.toFixed(1)),
    verifiedSource: source.name,
    sourceCode: String(source.code),
    sourceType: source.moly_source || null,
    sourceReference: source.moly_reference || null,
    sourceUrl,
    reason
  });
}

// USDA items with close matching product form and, for tomatoes and yeast, matching macros.
setCholineUsda("Tomatoes, dried (without oil)", 168567, "high", "USDA sun-dried tomato record; energy, protein, carbohydrate and fibre align closely with the no-oil dried-tomato entry.");
setCholineUsda("Dried yeast", 175043, "high", "USDA active dry baker's yeast record; energy, protein, carbohydrate and fibre align with the database entry.");
setCholineUsda("Bananen, dried", 173945, "medium", "USDA dehydrated banana record; correct dried-fruit form, but the source macro profile is more concentrated, so this is an estimate.");
setCholineUsda("Mangos, dried", 169091, "medium-high", "USDA dried mango record; the food form and energy match closely. The source is sweetened, so this is a compatible estimate rather than an exact product match.");

// Independent published dried-papaya table value, attributed as USDA-derived by the publisher.
{
  const index = targetIndex("Papaya, dried");
  recordCholineCorrection(index, 20.2, {
    method: "published dried-food estimate",
    confidence: "medium-low",
    sourceName: "Papaya, dried (USDA-derived nutrient table)",
    sourceUrl: "https://www.organicfacts.net/dried-papaya.html",
    note: "Published dried-papaya table reports 20.2 mg choline/100 g and attributes the composition data to USDA; the database product differs somewhat in macros, so confidence is limited."
  });
}

// Where the exact dried product lacks choline data, estimate concentration from raw-food choline and water content.
{
  const index = targetIndex("Pineapple, dried");
  const raw = usdaById.get("169124");
  const dry = blsByCode.get("F501400");
  const rawCholine = Number(raw?.choline_mg);
  const rawWater = 86.0; // USDA FDC SR Legacy 169124, water g/100 g
  const dryWater = Number(dry?.water_g);
  if (!raw || !dry || !Number.isFinite(rawCholine) || !Number.isFinite(dryWater)) throw new Error("Missing pineapple source values for moisture-scaled estimate");
  const factor = (100 - dryWater) / (100 - rawWater);
  const value = Number((rawCholine * factor).toFixed(1));
  recordCholineCorrection(index, value, {
    method: "moisture-scaled estimate from raw food",
    confidence: "low-medium",
    sourceName: "Pineapple raw USDA choline scaled to BLS dried-pineapple moisture",
    sourceId: String(raw.fdc_id),
    sourceCode: String(dry.code),
    sourceUrl: "https://fdc.nal.usda.gov/food-details/169124/nutrients?type=SR%20Legacy",
    sourceReferenceUrl: "https://blsdb.prod.se.ble.de/",
    note: `Raw pineapple choline ${rawCholine} mg/100 g scaled by dry-matter ratio using USDA raw water 86.0 g and BLS dried pineapple water ${dryWater} g; assumes choline is retained during drying.`
  });
}

// Replace two misleading near-zero estimates with the closest available composition evidence.
setMoBls(
  "Tomatoes, dried (without oil)",
  "G567702",
  "low",
  "The direct BLS dried-tomato row has no molybdenum value. Use the closest numeric BLS proxy, dried tomato in oil, canned and drained (0.1 µg/100 g); product difference remains material."
);

{
  const index = targetIndex("Papaya, dried");
  const raw = blsByCode.get("F517100");
  const dry = blsByCode.get("F517400");
  if (!raw || !dry || !Number.isFinite(Number(raw.water_g)) || !Number.isFinite(Number(dry.water_g))) throw new Error("Missing BLS papaya moisture values");
  const rawMolybdenum = 1.0; // published raw-papaya comparator, µg/100 g
  const factor = (100 - Number(dry.water_g)) / (100 - Number(raw.water_g));
  const value = Number((rawMolybdenum * factor).toFixed(1));
  const oldValue = db[index].nutrients[molybdenumKey];
  db[index].nutrients[molybdenumKey] = value;
  audit.records[index].valuesPer100g[molybdenumKey] = value;
  const details = {
    value,
    method: "moisture-scaled estimate from raw food",
    confidence: "low",
    sourceName: "Raw papaya molybdenum scaled to BLS dried-papaya moisture",
    sourceCode: String(dry.code),
    sourceUrl: "https://www.clinicwala.com/nutrition/papaya--raw",
    sourceReferenceUrl: "https://blsdb.prod.se.ble.de/",
    note: `Raw-papaya comparator 1.0 µg/100 g scaled by dry-matter ratio using BLS raw water ${raw.water_g} g and dried water ${dry.water_g} g; soil and drying variation make this a low-confidence estimate.`
  };
  audit.records[index].molybdenum = details;
  corrections.push({
    databaseIndex: index,
    food: db[index].name,
    name_en: db[index].name_en,
    nutrient: molybdenumKey,
    oldValue,
    newValue: value,
    previousSource: "Papaya gezuckert, Konserve, abgetropft",
    ...details
  });
}

audit.summary.choline = audit.records.reduce((counts, record) => {
  counts[record.choline.method] = (counts[record.choline.method] || 0) + 1;
  return counts;
}, {});
audit.summary.molybdenum = audit.records.reduce((counts, record) => {
  counts[record.molybdenum.method] = (counts[record.molybdenum.method] || 0) + 1;
  return counts;
}, {});
audit.summary.verifiedBatch003 = {
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
const afterOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
if (beforeOtherNutrients !== afterOtherNutrients) throw new Error("Unexpected changes outside Choline and Molybdenum");

fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ corrections, summary: audit.summary.verifiedBatch003 }, null, 2));
