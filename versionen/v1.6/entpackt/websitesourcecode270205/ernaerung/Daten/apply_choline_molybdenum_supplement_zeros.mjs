import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const foodSupplement = /(protein|nutritional yeast|yeast flakes|spirulina|wheat germ|lecithin|choline|molybdenum)/i;
let changed = 0;
for (const [index, food] of db.entries()) {
  if (food.category !== "supplements" || foodSupplement.test(`${food.name_en || ""} ${food.name || ""}`)) continue;
  const note = "Isolated vitamin/mineral or creatine supplement; choline/molybdenum are not listed ingredients, so nutritionally negligible excipient traces are treated as 0.";
  food.nutrients["Choline (mg)"] = 0;
  food.nutrients["Molybdenum (µg)"] = 0;
  const record = audit.records.find(entry => entry.databaseIndex === index);
  record.valuesPer100g["Choline (mg)"] = 0;
  record.valuesPer100g["Molybdenum (µg)"] = 0;
  record.choline = { value: 0, method: "logical zero: isolated supplement", confidence: "medium", note };
  record.molybdenum = { value: 0, method: "logical zero: isolated supplement", confidence: "medium", note };
  changed++;
}
const counts = nutrient => audit.records.reduce((result, record) => {
  const method = record[nutrient].method;
  result[method] = (result[method] || 0) + 1;
  return result;
}, {});
audit.summary.choline = counts("choline");
audit.summary.molybdenum = counts("molybdenum");
audit.summary.isolatedSupplementZeros = changed;
fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ isolatedSupplementZeros: changed, summary: audit.summary }, null, 2));
