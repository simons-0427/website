import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const byId = new Map(usda.map(row => [String(row.fdc_id), row]));
const fixes = [
  ["Ziegenmilch mind. 3 % Fett", 171278, "Fluid goat milk comparator; not condensed milk."],
  ["Schafmilch mind. 4,5 % Fett", 171278, "Goat milk used as a close fluid-milk comparator; not condensed milk."],
  ["Kondensmilch 7,5% Fett", 171276, "USDA evaporated milk comparator for unsweetened condensed milk."],
  ["Kondensmilch mind. 7,5 % Fett", 171276, "USDA evaporated milk comparator for unsweetened condensed milk."],
  ["Kondensmilch teilentrahmt, mind. 1 % bis < 7,5 % Fett", 171302, "USDA evaporated 2%-fat milk comparator; not sweetened condensed milk."],
  ["Süßmolke", 171282, "USDA fluid sweet whey comparator; replaces dried whey."],
  ["Sauermolke", 170885, "USDA fluid acid whey comparator; replaces dried whey."],
  ["Hirsebrei ungesüßt, mit Milch 3,5 % Fett", 168871, "USDA cooked-millet comparator; avoids using concentrated milk choline for a cooked porridge."],
  ["Speisequarkzubereitung mind. 30 % Fett i. Tr., mit Kräutern", 172179, "USDA cottage-cheese comparator for a curd preparation with herbs."],
  ["Speisequarkzubereitung mind. 40 % Fett i. Tr., mit Kräutern", 172179, "USDA cottage-cheese comparator for a curd preparation with herbs."],
  ["Speisequark Viertelfettstufe, 10 % Fett i. Tr.", 172179, "USDA cottage-cheese comparator; replaces a low-fat processed-cheese match."],
  ["Speisequark Fettstufe, 40 % Fett i. Tr.", 172179, "USDA cottage-cheese comparator; replaces a low-fat processed-cheese match."],
  ["Ricotta, Molkeneiweißkäse, mind. 45 % Fett i. Tr.", 172179, "USDA curd-cheese comparator where no numeric ricotta choline value was available."],
  ["Erbsenprotein, Isolat (Pulver)", 174276, "USDA soy protein-isolate comparator; closer to a plant isolate than whey isolate."],
  ["Putenkeule (roh, ohne Haut)", 171136, "USDA raw turkey drumstick, meat only; replaces a giblets match."],
  ["Pute Keule, ohne Haut, roh", 171136, "USDA raw turkey drumstick, meat only; replaces a giblets match."],
  ["Reh Keule, roh", 172602, "USDA raw deer-meat comparator; replaces a turkey-leg match."],
  ["Rinder-Patty gegrillt (ca. 98% Rind)", 174033, "USDA cooked ground-beef patty comparator; replaces a beef-tongue match."]
];
for (const [name, id, note] of fixes) {
  const index = db.findIndex(food => food.name === name);
  const source = byId.get(String(id));
  if (index < 0 || !source || !Number.isFinite(Number(source.choline_mg))) throw new Error(`Missing food or USDA source for ${name}`);
  const value = Number(Number(source.choline_mg).toFixed(1));
  db[index].nutrients["Choline (mg)"] = value;
  audit.records[index].valuesPer100g["Choline (mg)"] = value;
  audit.records[index].choline = {
    value, method: "USDA compatible food estimate", confidence: "medium",
    sourceName: source.description, sourceId: String(source.fdc_id),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${source.fdc_id}/nutrients?type=SR%20Legacy`, note
  };
}
audit.summary.choline = audit.records.reduce((counts, record) => {
  counts[record.choline.method] = (counts[record.choline.method] || 0) + 1;
  return counts;
}, {});
audit.summary.dairyAndMeatCholineCorrections = fixes.length;
fs.writeFileSync("database.json", `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ dairyAndMeatCholineCorrections: fixes.length, summary: audit.summary.choline }, null, 2));
