import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DATA_DIR, "..");
const DB_PATH = path.join(ROOT, "database.json");
const REPORT_PATH = path.join(DATA_DIR, "database_quality_repair_report.json");

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const before = JSON.parse(JSON.stringify(db));

const TAG_ORDER = [
  "vegan", "vegetarisch", "pescetarisch", "omnivor", "carnivor",
  "whole_food", "supplement", "verarbeitet", "laktose", "gluten",
];

const animalCue = /fleisch|rind|schwein|kalb|lamm|hammel|hähn|huhn|pute|truthahn|ente|gans|wurst|speck|bacon|schinken|wild|geflügel|fisch|lachs|forelle|hering|thunfisch|seelachs|kabeljau|dorsch|makrele|garnele|krabbe|krill|tintenfisch|meeresfrucht|muschel|krebs|kaviar|rogen|sardine|sardelle|anchovis|gelatine|eigelb|eiklar|omelett|rührei|spiegelei|\beier\b|burger|döner|whopper|bouillabaisse/i;
const plantAlternativeCue = /soja|hafer|mandel|reisdrink|erbsen.?drink|pflanz|kokosdrink|kokosmilch|cashew.?drink|re.?drink/i;
const lactoseFreeCue = /laktosefrei|lactose.?free/i;
const lactoseCue = /\bmilch\b|buttermilch|joghurt|jogurt|kefir|molke|whey|quark|frischkäse|hüttenkäse|cottage cheese|mascarpone|ricotta|skyr|sahne|schmand|crème? fraîche|kondensmilch|milchpulver|casein|milchmisch|getränke?pulver.*milch|sahneeis|milchschokolade|milchsuppe/i;
const glutenFreeCue = /glutenfrei|gluten.?free/i;
const glutenExcludeCue = /buchweizen|reisnudel|cornflakes|mais|papadam|tortillachips|nachos|weizenkeimöl|glutenfrei|gluten.?free/i;
const glutenCue = /gerste|barley|roggen|rye|dinkel|spelt|grünkern|emmer|einkorn|hartweizen|weizen(?!keimöl)|seitan|bulgur|couscous|tortilla|wrap|brot|brötchen|knäckebrot|toast|baguette|bagel|croissant|naan|pizza|lasagne|\bnudel|teigwaren|fladenbrot|malz|malt/i;

function hasTag(food, tag) {
  return Array.isArray(food.tags) && food.tags.includes(tag);
}

function setTags(food, set) {
  food.tags = TAG_ORDER.filter((tag) => set.has(tag));
  for (const tag of set) if (!TAG_ORDER.includes(tag)) food.tags.push(tag);
}

function likelyLactose(name) {
  const lower = name.toLowerCase();
  if (lactoseFreeCue.test(lower)) return false;
  if (/ohne\s+milch/.test(lower)) return false;
  if (/^milchreis\b|\bmilchreis\s*\(/.test(lower) && !/mit\s+milch/.test(lower)) return false;
  if (plantAlternativeCue.test(lower) && !/mischung.*milch|milch.*mischung|mit\s+milch/.test(lower)) return false;
  return lactoseCue.test(lower);
}

function clearGluten(name) {
  const lower = name.toLowerCase();
  if (glutenFreeCue.test(lower) || glutenExcludeCue.test(lower)) return false;
  if (/ohne\s+(brot|brötchen|fladen)/.test(lower)) return false;
  return glutenCue.test(lower);
}

function fluidCorrection(food) {
  const unit = String(food.unit || "").toLowerCase();
  const name = String(food.name || "").toLowerCase();
  const old = food.nutrients?.["Fluid (ml)"];
  if (unit !== "ml") return { old, next: 0, reason: "feste Einheit: kein anrechenbarer Flüssigkeitsbeitrag" };
  if (/(leitungswasser|mineralwasser|wasser\b|water\b)/.test(name) && !/saft|juice|kokoswasser|coconut.?water|nearwater/.test(name)) {
    return { old, next: 100, reason: "Wasser" };
  }
  if (/tee\b|tea\b/.test(name) && !/milch|milk/.test(name)) {
    return { old, next: 100, reason: "Tee" };
  }
  if (/kokosmilch|coconut.?milk/.test(name)) return { old, next: 70, reason: "dicke Kokosmilch" };
  if (/kochcreme|cooking cream|sahneersatz/.test(name)) return { old, next: 0, reason: "Kochcreme bzw. Sahneersatz: kein Trinkbeitrag" };
  return { old, next: old, reason: "keine eindeutige Änderung" };
}

const changes = [];
for (const [index, food] of db.entries()) {
  const original = JSON.stringify(food);
  const name = String(food.name || "");
  const lower = name.toLowerCase();
  const fluid = fluidCorrection(food);
  if (food.nutrients && fluid.old !== fluid.next) food.nutrients["Fluid (ml)"] = fluid.next;

  const tags = new Set(Array.isArray(food.tags) ? food.tags : []);
  const category = String(food.category || "");
  const isAnimalCategory = category === "fleisch" || category === "fisch" || category === "eier";

  // Ernährungsstil-Hierarchie und Carnivor-Zuordnung.
  if (category === "fleisch") {
    tags.delete("vegan"); tags.delete("vegetarisch"); tags.delete("pescetarisch");
    tags.add("omnivor"); tags.add("carnivor");
  } else if (category === "fisch") {
    tags.delete("vegan"); tags.delete("vegetarisch");
    tags.add("pescetarisch"); tags.add("omnivor"); tags.add("carnivor");
  } else if (category === "eier") {
    tags.delete("vegan");
    tags.add("vegetarisch"); tags.add("pescetarisch"); tags.add("omnivor"); tags.add("carnivor");
  } else if (tags.has("carnivor") && !animalCue.test(name)) {
    // Carnivor im UI ist ausdrücklich Fleisch, Fisch oder Eier; Milch allein zählt nicht dazu.
    tags.delete("carnivor");
  }
  if (tags.has("vegan")) {
    tags.add("vegetarisch"); tags.add("pescetarisch"); tags.add("omnivor");
  } else if (tags.has("vegetarisch")) {
    tags.add("pescetarisch"); tags.add("omnivor");
  } else if (tags.has("pescetarisch")) {
    tags.add("omnivor");
  } else {
    tags.add("omnivor");
  }

  // Eigenschaftstags mit stabilen, aus Kategorie/Name ableitbaren Regeln.
  if (category === "supplements" || tags.has("supplement")) {
    tags.add("supplement"); tags.add("verarbeitet"); tags.delete("whole_food");
  }
  if (category === "verarbeitet") {
    tags.add("verarbeitet"); tags.delete("whole_food");
  }
  if (tags.has("verarbeitet")) tags.delete("whole_food");

  if (lactoseFreeCue.test(lower) || (plantAlternativeCue.test(lower) && !/mischung.*milch|milch.*mischung|mit\s+milch/.test(lower))) {
    tags.delete("laktose");
  } else if (likelyLactose(name)) {
    tags.add("laktose");
  }

  if (glutenFreeCue.test(lower) || glutenExcludeCue.test(lower)) {
    tags.delete("gluten");
  } else if (clearGluten(name)) {
    tags.add("gluten");
  }

  setTags(food, tags);
  if (JSON.stringify(food) !== original) {
    changes.push({ index: index + 1, name: food.name, before: before[index], after: food, fluidReason: fluid.reason });
  }
}

// Belegter Unterpreis: ALDI SÜD CUCINA Spaghetti 500 g = 1,38 EUR/kg am 14.08.2026.
// Nach der Projektregel +10 %: 1,38 × 1,10 / 10 = 0,1518 EUR/100 g.
const pastaPrice = 0.152;
const manualPriceChanges = [];
function setPrice(name, value, rationale) {
  const food = db.find((item) => item.name === name);
  if (!food || food.price_per_100 >= value) return;
  const old = food.price_per_100;
  food.price_per_100 = value;
  manualPriceChanges.push({ name, old, next: value, rationale });
}
setPrice("Nudeln, Hartweizen (trocken)", pastaPrice, "ALDI SÜD CUCINA Spaghetti 500 g: 1,38 EUR/kg; +10 %; auf 3 Dezimalstellen gerundet");

// Gekochte Nudeln werden aus der belegten Trockenware und dem vorhandenen
// Kohlenhydrat-/Trockenmasseverhältnis abgeleitet, statt Wasser als Preis zu rechnen.
const dryPasta = db.find((item) => item.name === "Nudeln, Hartweizen (trocken)");
const dryCarbs = Number(dryPasta?.nutrients?.["Total Carbohydrate (g)"]);
for (const name of ["Spaghetti weiß gekocht", "Nudeln weiß gekocht (ungesalzen)"]) {
  const food = db.find((item) => item.name === name);
  const cookedCarbs = Number(food?.nutrients?.["Total Carbohydrate (g)"]);
  if (!food || !(dryCarbs > 0) || !(cookedCarbs > 0)) continue;
  const derived = Math.round((pastaPrice * cookedCarbs / dryCarbs) * 1000) / 1000;
  setPrice(name, derived, `aus belegtem Trockenpreis ${pastaPrice.toFixed(3)} EUR/100 g × Kohlenhydratverhältnis gekocht/trocken; ohne Wasseraufschlag`);
}

const batchSummaries = [];
for (let start = 0; start < db.length; start += 40) {
  const rows = changes.filter((change) => change.index >= start + 1 && change.index <= start + 40);
  batchSummaries.push({
    batch: Math.floor(start / 40) + 1,
    from: start + 1,
    to: Math.min(start + 40, db.length),
    changedRows: rows.length,
    changes: rows.map((row) => ({ index: row.index, name: row.name, fluidChanged: row.before.nutrients?.["Fluid (ml)"] !== row.after.nutrients?.["Fluid (ml)"], tagsChanged: JSON.stringify(row.before.tags) !== JSON.stringify(row.after.tags), priceChanged: row.before.price_per_100 !== row.after.price_per_100 })),
  });
}

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n", "utf8");
const report = {
  checkedOn: "2026-08-14",
  database: "database.json",
  recordCount: db.length,
  batchSize: 40,
  batchCount: batchSummaries.length,
  changedRecordCount: changes.length,
  fluidChangeCount: changes.filter((x) => x.before.nutrients?.["Fluid (ml)"] !== x.after.nutrients?.["Fluid (ml)"]).length,
  tagChangeCount: changes.filter((x) => JSON.stringify(x.before.tags) !== JSON.stringify(x.after.tags)).length,
  manualPriceChanges,
  batchSummaries,
  changes,
};
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ database: DB_PATH, report: REPORT_PATH, changedRecordCount: changes.length, fluidChangeCount: report.fluidChangeCount, tagChangeCount: report.tagChangeCount, manualPriceChanges }, null, 2));
