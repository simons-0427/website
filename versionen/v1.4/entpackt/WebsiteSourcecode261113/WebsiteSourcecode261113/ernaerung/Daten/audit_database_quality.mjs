import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = path.join(ROOT, "database.json");
const DATA_DIR = path.join(ROOT, "Daten");
const REPORT_PATH = path.join(DATA_DIR, "database_quality_audit.json");

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const plans = [];
const sources = [];
for (const file of fs.readdirSync(DATA_DIR).filter((n) => n.endsWith("_plan.json")).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  for (const item of doc.items || []) plans.push({ batch: doc.batch, ...item });
}
for (const file of fs.readdirSync(DATA_DIR).filter((n) => n.endsWith("_sources.json")).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  for (const record of doc.records || []) sources.push({ batch: doc.batch, ...record });
}

const planByName = new Map(plans.map((x) => [x.name, x]));
const sourceByName = new Map(sources.map((x) => [x.databaseName, x]));

function expectedFluid(food) {
  const unit = String(food.unit || "").toLowerCase();
  const name = String(food.name || "").toLowerCase();
  if (unit !== "ml") return 0;
  if (/(leitungswasser|mineralwasser|wasser\b|water\b)/.test(name) && !/saft|juice|kokoswasser|coconut.?water|nearwater/.test(name)) return 100;
  if (/tee\b|tea\b/.test(name) && !/milch|milk/.test(name)) return 100;
  if (/kokosmilch|coconut.?milk/.test(name)) return 70;
  if (/kochcreme|cooking cream|sahneersatz/.test(name)) return 0;
  return null;
}

const allowedTags = new Set([
  "vegan", "vegetarisch", "pescetarisch", "omnivor", "carnivor",
  "whole_food", "supplement", "verarbeitet", "laktose", "gluten",
]);
const animalCue = /fleisch|rind|schwein|kalb|lamm|hammel|hähn|huhn|pute|truthahn|ente|gans|wurst|speck|bacon|schinken|wild|geflügel|fisch|lachs|forelle|hering|thunfisch|seelachs|kabeljau|dorsch|makrele|garnele|krabbe|krill|tintenfisch|meeresfrucht|muschel|krebs|kaviar|rogen|sardine|sardelle|anchovis|gelatine|eigelb|eiklar|omelett|rührei|spiegelei|\beier\b|burger|döner|whopper|bouillabaisse/i;
const plantMilkCue = /soja|hafer|mandel|reisdrink|erbsen.?drink|pflanz|kokosdrink|kokosmilch|cashew.?drink|re.?drink/i;
const lactoseFree = /laktosefrei|lactose.?free/i;
const lactoseCue = /\bmilch\b|buttermilch|joghurt|jogurt|kefir|molke|whey|quark|frischkäse|hüttenkäse|cottage cheese|mascarpone|ricotta|skyr|sahne|schmand|crème? fraîche|kondensmilch|milchpulver|casein|milchmisch|getränke?pulver.*milch|sahneeis|milchschokolade|milchsuppe|milchreis/i;
const glutenFree = /glutenfrei|gluten.?free/i;
const glutenCue = /gerste|barley|roggen|rye|dinkel|spelt|grünkern|emmer|einkorn|hartweizen|weizen(?!keimöl)|seitan|bulgur|couscous|tortilla|wrap|brot|brötchen|knäckebrot|toast|baguette|bagel|croissant|naan|papadam|pizza|lasagne|\bnudel|teigwaren|fladenbrot|müslibrötchen|malz|malt/i;
const glutenExclude = /buchweizen|reisnudel|cornflakes|mais|weizenkeimöl|glutenfrei|gluten.?free/i;

function tagIssues(food, index) {
  const name = String(food.name || "");
  const lower = name.toLowerCase();
  const tags = Array.isArray(food.tags) ? food.tags : [];
  const issues = [];
  const dup = tags.filter((tag, i) => tags.indexOf(tag) !== i);
  if (dup.length) issues.push({ type: "duplicate_tag", tags: [...new Set(dup)] });
  const unknown = tags.filter((tag) => !allowedTags.has(tag));
  if (unknown.length) issues.push({ type: "unknown_tag", tags: [...new Set(unknown)] });
  if (tags.includes("whole_food") && tags.includes("verarbeitet")) {
    issues.push({ type: "whole_food_and_processed" });
  }
  if (food.category === "supplements" && (!tags.includes("supplement") || !tags.includes("verarbeitet"))) {
    issues.push({ type: "supplement_flags" });
  }
  if ((food.category === "fleisch" || food.category === "fisch" || food.category === "eier") && !tags.includes("carnivor")) {
    issues.push({ type: "missing_carnivor_for_animal_category" });
  }
  if (tags.includes("carnivor") && !["fleisch", "fisch", "eier"].includes(food.category) && !animalCue.test(name)) {
    issues.push({ type: "carnivor_without_meat_fish_egg_cue" });
  }
  if (lactoseFree.test(lower) && tags.includes("laktose")) {
    issues.push({ type: "lactose_tag_on_lactose_free_name" });
  }
  const plantAlternative = plantMilkCue.test(lower)
    && !/mischung.*milch|milch.*mischung|mit\s+milch/.test(lower);
  if (plantAlternative && tags.includes("laktose")) {
    issues.push({ type: "lactose_tag_on_plant_alternative" });
  }
  const lactoseExempt = /ohne\s+milch|milchreis\s*\(\s*trocken\s*\)|milchreis.*trocken/.test(lower);
  if (lactoseCue.test(lower) && !lactoseFree.test(lower) && !lactoseExempt && !plantAlternative && !tags.includes("laktose")) {
    issues.push({ type: "possible_missing_lactose_tag" });
  }
  const glutenExempt = /ohne\s+brot|papadam|tortillachips|nachos/.test(lower);
  if (glutenCue.test(lower) && !glutenExclude.test(lower) && !glutenFree.test(lower) && !glutenExempt && !tags.includes("gluten")) {
    issues.push({ type: "possible_missing_gluten_tag" });
  }
  if (tags.includes("gluten") && glutenFree.test(lower)) {
    issues.push({ type: "gluten_tag_on_gluten_free_name" });
  }
  return issues;
}

const entries = db.map((food, index) => {
  const source = sourceByName.get(food.name);
  const plan = planByName.get(food.name);
  const currentFluid = food.nutrients?.["Fluid (ml)"];
  const sourcePrice = source?.price?.priceFinalPer100;
  const issues = tagIssues(food, index);
  const planTagDifferent = Boolean(source && plan && JSON.stringify(plan.tags || []) !== JSON.stringify(food.tags || []));
  const expected = expectedFluid(food);
  if (expected !== null && currentFluid !== expected) {
    issues.push({ type: "fluid_mismatch", current: currentFluid, expected });
  }
  if (String(food.unit || "").toLowerCase() !== "ml" && currentFluid !== 0) {
    issues.push({ type: "solid_has_fluid", current: currentFluid, expected: 0 });
  }
  if (source && sourcePrice !== food.price_per_100) {
    issues.push({ type: "source_price_mismatch", current: food.price_per_100, expected: sourcePrice });
  }
  return {
    index: index + 1,
    name: food.name,
    unit: food.unit,
    category: food.category,
    price: food.price_per_100,
    sourceBatch: source?.batch ?? plan?.batch ?? null,
    sourcePrice: sourcePrice ?? null,
    planTagDifferent,
    issues,
  };
});

const batchSummaries = [];
for (let start = 0; start < entries.length; start += 40) {
  const batch = entries.slice(start, start + 40);
  const counts = {};
  for (const entry of batch) for (const issue of entry.issues) counts[issue.type] = (counts[issue.type] || 0) + 1;
  batchSummaries.push({ batch: Math.floor(start / 40) + 1, from: start + 1, to: start + batch.length, issueCounts: counts, issueRows: batch.filter((entry) => entry.issues.length).length });
}

const issueCounts = {};
for (const entry of entries) for (const issue of entry.issues) issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
const planTagDifferenceCount = entries.filter((entry) => entry.planTagDifferent).length;
const report = {
  checkedOn: "2026-08-14",
  database: "database.json",
  recordCount: db.length,
  batchSize: 40,
  batchCount: batchSummaries.length,
  sourceRecords: sources.length,
  planRecords: plans.length,
  sourcePriceCoverage: db.filter((food) => sourceByName.has(food.name)).length,
  planTagDifferenceCount,
  issueCounts,
  batchSummaries,
  entries,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ report: path.relative(ROOT, REPORT_PATH), recordCount: db.length, batchCount: batchSummaries.length, issueCounts }, null, 2));
