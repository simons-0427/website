import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const audit = JSON.parse(fs.readFileSync("Daten/Cholin_Molybdaen_Quellen_20260925.json", "utf8"));
const foundation = JSON.parse(fs.readFileSync("Daten/USDA_Foundation_Foods_2026-04_extracted/FoodData_Central_foundation_food_json_2026-04-30.json", "utf8")).FoundationFoods.filter(Boolean);
const M = "Molybdenum (µg)";
const normalize = text => String(text ?? "").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const stop = new Set("a an and as at by from in of or the with without per fresh raw cooked dried dry canned frozen boiled roasted unsalted salted skinless boneless whole pieces drained powder powdered ready serve only edible portion food foods product products prepared unprepared sweetened unsweetened fruit".split(" "));
const stem = token => token.length > 5 && token.endsWith("ies") ? `${token.slice(0, -3)}y` : token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
const tokens = text => new Set(normalize(text).split(" ").map(stem).filter(token => token.length > 1 && !stop.has(token)));
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const nutrient = (food, name) => (food.foodNutrients || []).find(item => item && new RegExp(name, "i").test(item.nutrient?.name || ""));
const sourceRow = food => {
  const moly = nutrient(food, "molybdenum");
  if (!moly || moly.nutrient?.unitName !== "µg" || number(moly.amount) === null) return null;
  const get = pattern => number(nutrient(food, pattern)?.amount);
  return {
    food,
    value: number(moly.amount),
    energy: get("energy"), protein: get("protein"), fat: get("total lipid|total fat"),
    carbs: get("carbohydrate, by difference|total carbohydrate"), fiber: get("fiber, total dietary|dietary fiber")
  };
};
const sources = foundation.map(sourceRow).filter(Boolean);
const targetForm = text => normalize(text);
const incompatible = (target, source) => {
  const t = targetForm(target), s = targetForm(source);
  const has = (text, pattern) => pattern.test(text);
  for (const [pattern, mismatch] of [
    [/\b(dried|dehydrated|dry|trocken|getrocknet)\b/, true],
    [/\b(canned|tinned|konserve|dose)\b/, true],
    [/\b(frozen|gefroren)\b/, true],
    [/\b(juice|nectar|saft)\b/, true]
  ]) if (has(t, pattern) !== has(s, pattern) && (has(t, pattern) || has(s, pattern))) return true;
  if (has(t, /\b(raw|fresh|roh|frisch)\b/) && has(s, /\b(cooked|boiled|baked|roasted|fried|grilled|steamed|gekocht|gegart|gebraten)\b/)) return true;
  return false;
};
const macroScore = (food, source) => {
  const pairs = [
    [food.nutrients["Energy (cal)"], source.energy, 0.18],
    [food.nutrients["Protein (g)"], source.protein, 0.25],
    [food.nutrients["Total Fat (g)"], source.fat, 0.16],
    [food.nutrients["Total Carbohydrate (g)"], source.carbs, 0.18],
    [food.nutrients["Dietary Fibre (g)"], source.fiber, 0.23]
  ];
  let error = 0, weight = 0;
  for (const [left, right, w] of pairs) {
    const a = number(left), b = number(right);
    if (a === null || b === null) continue;
    error += w * Math.min(3, Math.abs(Math.log((a + 1) / (b + 1)))); weight += w;
  }
  return weight ? Math.exp(-error / weight) : 0.5;
};

const candidates = [];
for (let index = 0; index < db.length; index++) {
  const food = db[index], record = audit.records[index]?.molybdenum;
  if (!record || /logical zero|logical near-zero/.test(record.method || "") || record.confidence === "high") continue;
  const target = `${food.name_en || ""} ${food.name || ""}`;
  const targetTokens = tokens(target);
  let best = null;
  for (const source of sources) {
    const description = source.food.description || "";
    if (incompatible(target, description)) continue;
    const sourceTokens = tokens(description);
    let overlap = 0;
    for (const token of targetTokens) if (sourceTokens.has(token)) overlap++;
    if (!overlap) continue;
    const nameScore = 2 * overlap / (targetTokens.size + sourceTokens.size);
    const macros = macroScore(food, source);
    const score = 0.72 * nameScore + 0.28 * macros;
    if (nameScore < 0.30 || macros < 0.48 || score < 0.58) continue;
    if (!best || score > best.score) best = { description, id: String(source.food.fdcId), value: Number(source.value.toFixed(1)), nameScore, macros, score };
  }
  if (best && best.value !== Number(food.nutrients[M].toFixed(1))) candidates.push({
    index, food: food.name, name_en: food.name_en, current: food.nutrients[M], currentMethod: record.method,
    currentConfidence: record.confidence, currentSource: record.sourceName || null,
    candidate: best.description, sourceId: best.id, value: best.value,
    nameScore: Number(best.nameScore.toFixed(3)), macroScore: Number(best.macros.toFixed(3)), score: Number(best.score.toFixed(3))
  });
}
candidates.sort((a, b) => b.score - a.score);
console.log(JSON.stringify({ sourceRecords: sources.length, candidateCount: candidates.length, candidates: candidates.slice(0, 100) }, null, 2));
