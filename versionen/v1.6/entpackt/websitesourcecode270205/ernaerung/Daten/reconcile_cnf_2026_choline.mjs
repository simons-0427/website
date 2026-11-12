import fs from "node:fs";
import { execFileSync } from "node:child_process";

const archive = "Daten/Health_Canada_CNF_2026.zip";
const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const csv = name => execFileSync("tar", ["-xOf", archive, name], {
  encoding: "utf8",
  maxBuffer: 96 * 1024 * 1024
});

function rows(text, consume) {
  let row = [], field = "", quoted = false, first = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (first) first = false;
      else consume(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); if (!first) consume(row); }
}

const normalize = text => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const stop = new Set("a an and as at by for from in of on or the to with without per fresh raw cooked dried dry dehydrated canned frozen boiled baked roasted fried grilled steamed unsalted salted sweetened unsweetened unprepared prepared edible portion food foods".split(" "));
const stem = token => token.length > 5 && token.endsWith("ies") ? `${token.slice(0, -3)}y` : token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
const tokens = text => new Set(normalize(text).split(" ").map(stem).filter(x => x.length > 1 && !stop.has(x)));
const num = x => x !== undefined && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null;
const fields = new Map();
rows(csv("Nutrient_Name.csv"), row => {
  if (row[0] && row[0] !== "Nutrient_Code") fields.set(row[0], row[3]);
});

const foods = new Map();
rows(csv("Food_Name.csv"), row => {
  if (!row[0] || row[0] === "Food_Code") return;
  foods.set(row[0], {
    code: row[0], name: row[1], alternate: row[3], source: row[5], ndb: row[6], group: row[7]
  });
});

const wantedCodes = new Set(["203", "204", "205", "208", "291", "421"]);
const values = new Map();
let totalNutrientRows = 0;
rows(csv("Nutrient_Amount.csv"), row => {
  if (!row[0] || row[0] === "Food_Code") return;
  totalNutrientRows++;
  if (!wantedCodes.has(row[1])) return;
  const val = num(row[2]);
  if (val === null) return;
  const record = values.get(row[0]) || {};
  record[row[1]] = val;
  values.set(row[0], record);
});

const candidates = [];
for (let index = 0; index < db.length; index++) {
  const food = db[index];
  const target = `${food.name_en || ""} ${food.name || ""}`;
  const targetNorm = normalize(food.name_en || food.name);
  const targetTokens = tokens(target);
  let best = null, second = 0;
  for (const [code, source] of foods) {
    const nutrient = values.get(code);
    if (nutrient?.["421"] === undefined) continue;
    const sourceNorm = normalize(source.name);
    const sourceTokens = tokens(source.name);
    const mismatch = [
      [/\b(dried|dehydrated|dry)\b/, /\b(dried|dehydrated|dry)\b/],
      [/\b(canned|tinned)\b/, /\b(canned|tinned)\b/],
      [/\bfrozen\b/, /\bfrozen\b/],
      [/\b(juice|nectar)\b/, /\b(juice|nectar)\b/],
      [/\b(raw|fresh)\b/, /\b(raw|fresh)\b/],
      [/\b(cooked|boiled|baked|roasted|fried|grilled|steamed)\b/, /\b(cooked|boiled|baked|roasted|fried|grilled|steamed)\b/]
    ].some(([a, b]) => (a.test(targetNorm) !== b.test(sourceNorm)) && (a.test(targetNorm) || b.test(sourceNorm)));
    if (mismatch) continue;
    let common = 0;
    for (const token of targetTokens) if (sourceTokens.has(token)) common++;
    const nameScore = targetTokens.size + sourceTokens.size ? 2 * common / (targetTokens.size + sourceTokens.size) : 0;
    const exactish = targetNorm === sourceNorm || normalize(source.alternate) === targetNorm;
    const score = nameScore + (exactish ? 0.15 : 0);
    if (score > (best?.score ?? 0)) {
      second = best?.score ?? second;
      best = { code, ...source, nutrient, nameScore, score, exactish };
    } else if (score > second) second = score;
  }
  if (!best || best.nameScore < 0.68) continue;
  const current = num(food.nutrients?.["Choline (mg)"]);
  const value = best.nutrient["421"];
  candidates.push({
    index, food: food.name, name_en: food.name_en, current, candidate: best.name,
    cnfFoodCode: best.code, cnfNdbCode: best.ndb || null, cnfFoodSourceCode: best.source,
    choline_mg: value, nameScore: Number(best.nameScore.toFixed(3)), exactish: best.exactish,
    secondScore: Number(second.toFixed(3)), ambiguous: second >= best.score - 0.08,
    macros: {
      energy_kcal: best.nutrient["208"] ?? null,
      protein_g: best.nutrient["203"] ?? null,
      fat_g: best.nutrient["204"] ?? null,
      carbs_g: best.nutrient["205"] ?? null,
      fibre_g: best.nutrient["291"] ?? null
    }
  });
}

candidates.sort((a, b) => Number(b.exactish) - Number(a.exactish) || b.nameScore - a.nameScore);
const cholineFoodCount = [...values.values()].filter(x => x["421"] !== undefined).length;
const exact = candidates.filter(x => x.exactish);
console.log(JSON.stringify({
  databaseRows: db.length, cnfFoods: foods.size, cnfNutrientRows: totalNutrientRows,
  cnfCholineFoods: cholineFoodCount, matchedCandidates: candidates.length,
  exactishMatches: exact.length, uniqueHighMatches: candidates.filter(x => x.nameScore >= 0.82 && !x.ambiguous).length,
  candidatePreview: candidates.slice(0, 100)
}, null, 2));
