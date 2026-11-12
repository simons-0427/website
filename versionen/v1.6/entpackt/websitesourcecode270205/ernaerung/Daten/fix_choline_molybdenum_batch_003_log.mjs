import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const targetName = "Tomatoes, dried (without oil)";
const index = db.findIndex(food => food.name_en === targetName);
const entry = [...(audit.correctionLog || [])].reverse().find(row =>
  row.databaseIndex === index && row.nutrient === "Molybdenum (µg)"
);
if (index < 0 || !entry || db[index].nutrients["Molybdenum (µg)"] !== entry.newValue) {
  throw new Error("Batch 003 tomato molybdenum correction log does not match the database");
}
entry.oldValue = 0;
audit.records[index].molybdenum.value = db[index].nutrients["Molybdenum (µg)"];
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ food: targetName, oldValue: entry.oldValue, newValue: entry.newValue }));
