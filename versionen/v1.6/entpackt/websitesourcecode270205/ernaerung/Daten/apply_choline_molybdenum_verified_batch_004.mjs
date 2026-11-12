import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const bls = JSON.parse(fs.readFileSync("Daten/BLS_4_0_Molybdenum_extract.json", "utf8"));
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const cholineKey = "Choline (mg)";
const molybdenumKey = "Molybdenum (\u00B5g)";
const usdaById = new Map(usda.map(row => [String(row.fdc_id), row]));
const blsByCode = new Map(bls.map(row => [String(row.code), row]));
const beforeOtherNutrients = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[cholineKey];
  delete copy.nutrients[molybdenumKey];
  return copy;
}));
const corrections = [];

const estimateSpecs = [
  { nameEn: "Strawberries, dried", usdaId: "167762", rawWater: 90.95, blsCode: "F301400" },
  { nameEn: "Raspberries, dried", usdaId: "167755", rawWater: 85.75, blsCode: "F302400" },
  { nameEn: "Blackberries, dried", usdaId: "173946", rawWater: 88.15, blsCode: "F303400" }
];

for (const spec of estimateSpecs) {
  const index = db.findIndex(food => food.name_en === spec.nameEn);
  if (index < 0 || audit.records[index]?.name_en !== spec.nameEn) throw new Error(`Missing or misaligned target: ${spec.nameEn}`);
  const raw = usdaById.get(spec.usdaId);
  const dry = blsByCode.get(spec.blsCode);
  const rawCholine = Number(raw?.choline_mg);
  const dryWater = Number(dry?.water_g);
  if (!raw || !dry || !Number.isFinite(rawCholine) || !Number.isFinite(dryWater)) throw new Error(`Missing raw/dried source pair for ${spec.nameEn}`);

  const factor = (100 - dryWater) / (100 - spec.rawWater);
  const value = Number((rawCholine * factor).toFixed(1));
  const oldValue = db[index].nutrients[cholineKey];
  const rawSourceUrl = `https://fdc.nal.usda.gov/food-details/${raw.fdc_id}/nutrients?type=SR%20Legacy`;
  const sourceUrl = "https://blsdb.prod.se.ble.de/";
  const reason = `Estimated by dry-matter concentration: USDA raw choline ${rawCholine} mg/100 g, raw water ${spec.rawWater} g/100 g, BLS dried-food water ${dryWater} g/100 g. Assumes choline retention during drying; no direct dried-food choline analysis was found.`;

  db[index].nutrients[cholineKey] = value;
  audit.records[index].valuesPer100g[cholineKey] = value;
  audit.records[index].choline = {
    value,
    method: "moisture-scaled estimate from raw food",
    confidence: "low-medium",
    sourceName: `${raw.description} choline scaled to ${dry.name}`,
    sourceId: String(raw.fdc_id),
    sourceCode: String(dry.code),
    sourceUrl: rawSourceUrl,
    sourceReferenceUrl: sourceUrl,
    note: reason
  };
  corrections.push({
    databaseIndex: index,
    food: db[index].name,
    name_en: spec.nameEn,
    nutrient: cholineKey,
    oldValue,
    newValue: value,
    previousSource: "raw berry choline carried over without drying adjustment",
    verifiedSource: `${raw.description} + ${dry.name}`,
    sourceId: String(raw.fdc_id),
    sourceCode: String(dry.code),
    sourceUrl: rawSourceUrl,
    sourceReferenceUrl: sourceUrl,
    reason
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
audit.summary.verifiedBatch004 = { changedValues: corrections.length, cholineCorrections: corrections.length, molybdenumCorrections: 0 };
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
console.log(JSON.stringify({ corrections, summary: audit.summary.verifiedBatch004 }, null, 2));
