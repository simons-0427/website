import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const byId = new Map(usda.map(row => [String(row.fdc_id), row]));
const setUsda = (foodName, id, note) => {
  const index = db.findIndex(food => food.name === foodName);
  if (index < 0) throw new Error(`Missing expected food: ${foodName}`);
  const source = byId.get(String(id));
  if (!source || !Number.isFinite(Number(source.choline_mg))) throw new Error(`Missing numeric USDA source ${id}`);
  const value = Number(Number(source.choline_mg).toFixed(1));
  db[index].nutrients["Choline (mg)"] = value;
  audit.records[index].valuesPer100g["Choline (mg)"] = value;
  audit.records[index].choline = {
    value, method: "USDA compatible food estimate", confidence: "medium-high",
    sourceName: source.description, sourceId: String(source.fdc_id),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${source.fdc_id}/nutrients?type=SR%20Legacy`, note
  };
};
setUsda("Sojaöl", 172370, "Refined soybean cooking oil, not soybean lecithin.");
setUsda("Vanilleflammeri/Vanillepudding, mit Eigelb", 169608, "Ready-to-eat vanilla pudding comparator; avoids transferring the pure egg-yolk value to the finished dessert.");
setUsda("Brathähnchen gebraten im Ofen", 171450, "Roasted chicken meat and skin comparator; avoids transferring chicken-liver choline to muscle meat.");
setUsda("Butter", 173410, "USDA salted butter reference.");
setUsda("Süßrahmbutter", 173410, "USDA salted butter reference.");
setUsda("Sauerrahmbutter", 173410, "USDA salted butter reference.");
setUsda("Butterschmalz / Ghee", 173412, "USDA anhydrous butter-oil reference.");
setUsda("Butterschmalz", 173412, "USDA anhydrous butter-oil reference.");

const blackBeans = db.findIndex(food => food.name === "Schwarze Bohnen (trocken)");
if (blackBeans >= 0) {
  const value = 70;
  db[blackBeans].nutrients["Molybdenum (µg)"] = value;
  audit.records[blackBeans].valuesPer100g["Molybdenum (µg)"] = value;
  audit.records[blackBeans].molybdenum = {
    value, method: "Molybdenum legume category estimate", confidence: "low",
    note: "BLS has no numeric value for the exact dry black-bean entry; estimated from numeric mature-legume BLS records. The cooked green-bean comparator was rejected."
  };
}

const duckFat = db.findIndex(food => food.name === "Entenfett");
if (duckFat >= 0) {
  const choline = 0.3;
  db[duckFat].nutrients["Choline (mg)"] = choline;
  audit.records[duckFat].valuesPer100g["Choline (mg)"] = choline;
  audit.records[duckFat].choline = {
    value: choline, method: "logical near-zero estimate: rendered animal fat", confidence: "low",
    note: "No numeric composition value for duck fat found; the duck-egg comparator was rejected. Trace choline rounded to a practical near-zero value."
  };
  db[duckFat].nutrients["Molybdenum (µg)"] = 0;
  audit.records[duckFat].valuesPer100g["Molybdenum (µg)"] = 0;
  audit.records[duckFat].molybdenum = {
    value: 0, method: "logical near-zero estimate: rendered animal fat", confidence: "medium-low",
    note: "No numeric duck-fat value found; the duck-offal comparator was rejected because mineral content does not transfer to rendered fat."
  };
}

const counts = nutrient => audit.records.reduce((result, record) => {
  const method = record[nutrient].method;
  result[method] = (result[method] || 0) + 1;
  return result;
}, {});
audit.summary.choline = counts("choline");
audit.summary.molybdenum = counts("molybdenum");
audit.summary.targetedOutlierCorrections = 10;
for (let i = 0; i < db.length; i++) {
  if (db[i].nutrients["Choline (mg)"] !== audit.records[i].valuesPer100g["Choline (mg)"] || db[i].nutrients["Molybdenum (µg)"] !== audit.records[i].valuesPer100g["Molybdenum (µg)"]) throw new Error(`Audit/database mismatch at ${i}`);
}
fs.writeFileSync("database.json", `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ targetedOutlierCorrections: 10, summary: audit.summary }, null, 2));
