import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const audit = JSON.parse(fs.readFileSync("Daten/Cholin_Molybdaen_Quellen_20260925.json", "utf8"));
const root = "Daten/USDA_Choline_Release2_2008_extracted";
const rows = name => fs.readFileSync(`${root}/${name}`, "latin1").trim().split(/\r?\n/).map(line => line.split("^").map(value => value.replace(/^~|~$/g, "")));
const foodRows = rows("FOOD_DES.txt");
const nutrientRows = rows("NUT_DATA.txt");
const normalize = value => String(value ?? "").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const foods = new Map(foodRows.map(row => [row[0], row[2]]));
const byFood = new Map();
for (const row of nutrientRows) {
  if (row[1] !== "421" || !/^\d+(?:\.\d+)?$/.test(row[2] || "")) continue;
  const ndb = row[0];
  if (!byFood.has(ndb)) byFood.set(ndb, []);
  byFood.get(ndb).push({ amount: Number(row[2]), stdError: row[3] || null, reference: row[4] || null });
}
const index = new Map();
for (const [ndb, descriptions] of foods) {
  const values = byFood.get(ndb) || [];
  if (values.length !== 1) continue;
  const key = normalize(descriptions);
  if (!index.has(key)) index.set(key, []);
  index.get(key).push({ ndb, description: descriptions, ...values[0] });
}
const exact = [];
for (let i = 0; i < db.length; i++) {
  const food = db[i];
  const key = normalize(food.name_en || food.name);
  const matches = index.get(key) || [];
  if (matches.length !== 1) continue;
  const source = matches[0];
  exact.push({
    index: i, food: food.name, name_en: food.name_en, sourceName: source.description,
    sourceId: source.ndb, value: Number(source.amount.toFixed(1)), rawValue: source.amount,
    current: food.nutrients["Choline (mg)"], method: audit.records[i].choline.method,
    confidence: audit.records[i].choline.confidence, currentSource: audit.records[i].choline.sourceName || null,
    differs: Number(source.amount.toFixed(1)) !== Number(food.nutrients["Choline (mg)"].toFixed(1))
  });
}
console.log(JSON.stringify({
  sourceFoodRecords: foodRows.length,
  totalCholineRecords: byFood.size,
  uniqueExactNameMatches: exact.length,
  exactMismatches: exact.filter(row => row.differs).length,
  exact
}, null, 2));
