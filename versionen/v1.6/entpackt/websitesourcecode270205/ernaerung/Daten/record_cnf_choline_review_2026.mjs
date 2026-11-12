import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const C = "Choline (mg)", M = "Molybdenum (µg)";

if (db.length !== 1516 || audit.records.length !== db.length) throw new Error("Unexpected database/audit row count");
for (let i = 0; i < db.length; i++) {
  if (audit.records[i].valuesPer100g[C] !== db[i].nutrients[C] || audit.records[i].valuesPer100g[M] !== db[i].nutrients[M]) {
    throw new Error(`Database/audit mismatch at ${i}`);
  }
}

const sourceName = "Health Canada Canadian Nutrient File (CNF) 2026";
audit.sources ||= [];
if (!audit.sources.some(source => source.name === sourceName)) {
  audit.sources.push({
    name: sourceName,
    url: "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data.html",
    dataUrl: "https://open.canada.ca/data/dataset/1b6139bd-e7ed-4043-bc28-ff00e10f3109/resource/019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip",
    nutrient: "Total choline, mg/100 g",
    note: "The 2026 CNF includes 3,134 foods with total choline (nutrient code 421) and no molybdenum field. Form-aware comparison found no additional unambiguous replacement for existing values."
  });
}
audit.summary.cnfCholineReview2026 = {
  foodsWithCholine: 3134,
  candidateMatchesReviewed: 6,
  safeNumericCorrections: 0,
  molybdenumIncluded: false
};
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify(audit.summary.cnfCholineReview2026, null, 2));
