import fs from "node:fs";
const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const tmp = process.env.TEMP + "/nutrition_choline_molybdenum_6aef6d7316c94e6d810e56b402153eaf/";
const bls = JSON.parse(fs.readFileSync(tmp + "bls.json", "utf8"));
const usda = JSON.parse(fs.readFileSync(tmp + "usda.json", "utf8"));
const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const maps = new Map();
for (const f of fs.readdirSync("Daten").filter(x => x.includes("_sources.json"))) {
  const d = JSON.parse(fs.readFileSync("Daten/" + f, "utf8"));
  for (const r of d.records || []) if (r.blsCode) maps.set(norm(r.databaseName), r.blsCode);
}
const bcode = new Set(bls.map(x => x.code));
let validMap = 0;
for (const code of maps.values()) if (bcode.has(code)) validMap++;
const bname = new Map(bls.map(x => [norm(x.name), x]));
const ben = new Map(bls.map(x => [norm(x.name_en), x]));
const un = new Map(usda.map(x => [norm(x.description), x]));
const stats = {
  db: db.length, blsFoods: bls.length,
  blsMo: bls.filter(x => Number.isFinite(Number(x.molybdenum_ug))).length,
  usdaFoods: usda.length,
  usdaCholine: usda.filter(x => Number.isFinite(Number(x.choline_mg))).length,
  usdaMo: usda.filter(x => Number.isFinite(Number(x.molybdenum_ug))).length,
  mappings: maps.size, validMappings: validMap, blsExactDE: 0, blsExactEN: 0, usdaExactEN: 0
};
for (const x of db) {
  if (bname.has(norm(x.name))) stats.blsExactDE++;
  if (ben.has(norm(x.name_en))) stats.blsExactEN++;
  if (un.has(norm(x.name_en))) stats.usdaExactEN++;
}
console.log(JSON.stringify(stats, null, 2));
console.log(JSON.stringify(db.slice(60, 80).map(x => [x.name, x.name_en, x.category]), null, 2));
