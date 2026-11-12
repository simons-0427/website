import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const byId = new Map(usda.map(row => [String(row.fdc_id), row]));
const fixes = [
  ["Kalbsleber gebraten", 174358, "USDA cooked veal liver comparator; replaces a fried-egg match."],
  ["Lammniere gebraten", 169450, "USDA cooked kidney comparator; replaces a fried-egg match."],
  ["Hühnerei Spiegelei (Sonnenblumenöl)", 173423, "USDA fried whole egg comparator; cooking oil does not make the food a pure oil."],
  ["Buttermilch", 172225, "USDA fluid whole buttermilk comparator; replaces dried buttermilk."],
  ["Vollmilch 3,5 % Fett, laktosefrei, pasteurisiert", 172217, "USDA whole-milk comparator; lactose-free milk remains milk, not a frozen chocolate dessert."]
];
for (const [name, id, note] of fixes) {
  const index = db.findIndex(food => food.name === name);
  const source = byId.get(String(id));
  if (index < 0 || !source || !Number.isFinite(Number(source.choline_mg))) throw new Error(`Missing food or USDA value for ${name}`);
  const value = Number(Number(source.choline_mg).toFixed(1));
  db[index].nutrients["Choline (mg)"] = value;
  audit.records[index].valuesPer100g["Choline (mg)"] = value;
  audit.records[index].choline = {
    value, method: "USDA compatible food estimate", confidence: "medium-high",
    sourceName: source.description, sourceId: String(source.fdc_id),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${source.fdc_id}/nutrients?type=SR%20Legacy`, note
  };
}
audit.summary.choline = audit.records.reduce((counts, record) => {
  counts[record.choline.method] = (counts[record.choline.method] || 0) + 1;
  return counts;
}, {});
audit.summary.specificCholineCorrections = fixes.length;
fs.writeFileSync("database.json", `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ specificCholineCorrections: fixes.length, summary: audit.summary.choline }, null, 2));
