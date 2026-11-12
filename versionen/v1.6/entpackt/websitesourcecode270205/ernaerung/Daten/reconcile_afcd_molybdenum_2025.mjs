import fs from "node:fs";
import { execFileSync } from "node:child_process";

const workbook = "Daten/AFCD_Release3_NutrientProfiles.xlsx";
const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const entry = name => execFileSync("tar", ["-xOf", workbook, name], {
  encoding: "utf8", maxBuffer: 48 * 1024 * 1024
});
const decode = text => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const shared = [...entry("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
  .map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join(""));
const cellValue = cell => {
  const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (value === undefined) return null;
  return /\bt="s"/.test(cell) ? shared[Number(value)] ?? null : decode(value);
};
const column = ref => ref.match(/^([A-Z]+)/)?.[1];
const records = [];
for (const rowMatch of entry("xl/worksheets/sheet2.xml").matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const rowNumber = Number(rowMatch[1]);
  if (rowNumber < 4) continue;
  const fields = {};
  for (const cellMatch of rowMatch[2].matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
    const key = column(cellMatch[1]);
    if (["A", "B", "C", "D", "E", "H", "J", "L", "BP"].includes(key)) fields[key] = cellValue(cellMatch[0]);
  }
  const value = fields.BP === null || fields.BP === undefined || fields.BP === "" ? null : Number(fields.BP);
  if (!fields.A || !fields.D || value === null || !Number.isFinite(value)) continue;
  records.push({
    id: fields.A, classification: fields.B, derivation: fields.C, name: fields.D,
    energy: Number.isFinite(Number(fields.E)) ? Number(fields.E) / 4.184 : null,
    protein: Number.isFinite(Number(fields.H)) ? Number(fields.H) : null,
    fat: Number.isFinite(Number(fields.J)) ? Number(fields.J) : null,
    fibre: Number.isFinite(Number(fields.L)) ? Number(fields.L) : null,
    molybdenum: value
  });
}

const norm = text => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/ß/g, "ss").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const stop = new Set("a an and as at by for from in of on or the to with without per fresh raw cooked dried dry dehydrated canned tinned frozen boiled baked roasted fried grilled steamed unsalted salted sweetened unsweetened unprepared prepared edible portion food foods".split(" "));
const stem = token => token.length > 5 && token.endsWith("ies") ? `${token.slice(0, -3)}y` : token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
const tokens = text => new Set(norm(text).split(" ").map(stem).filter(x => x.length > 1 && !stop.has(x)));
const formCompatible = (target, source) => {
  const a = norm(target), b = norm(source);
  const pairs = [
    [/\b(dried|dehydrated|dry)\b/, /\b(dried|dehydrated|dry)\b/],
    [/\b(canned|tinned)\b/, /\b(canned|tinned)\b/],
    [/\bfrozen\b/, /\bfrozen\b/],
    [/\b(juice|nectar)\b/, /\b(juice|nectar)\b/],
    [/\b(raw|fresh)\b/, /\b(raw|fresh)\b/],
    [/\b(cooked|boiled|baked|roasted|fried|grilled|steamed)\b/, /\b(cooked|boiled|baked|roasted|fried|grilled|steamed)\b/]
  ];
  return pairs.every(([pa, pb]) => pa.test(a) === pb.test(b));
};
const macroScore = (food, source) => {
  const pairs = [
    [food.nutrients?.["Energy (cal)"], source.energy, 0.35],
    [food.nutrients?.["Protein (g)"], source.protein, 0.25],
    [food.nutrients?.["Total Fat (g)"], source.fat, 0.25],
    [food.nutrients?.["Dietary Fibre (g)"], source.fibre, 0.15]
  ];
  let error = 0, weight = 0;
  for (const [left, right, w] of pairs) {
    const a = Number(left), b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    error += w * Math.min(3, Math.abs(Math.log((a + 1) / (b + 1))));
    weight += w;
  }
  return weight ? Math.exp(-error / weight) : 0.5;
};

const matches = [];
for (let index = 0; index < db.length; index++) {
  const food = db[index], target = food.name_en || food.name;
  const targetNorm = norm(target), targetTokens = tokens(target);
  let best = null, secondScore = 0;
  for (const source of records) {
    if (!formCompatible(target, source.name)) continue;
    const sourceNorm = norm(source.name), sourceTokens = tokens(source.name);
    let common = 0;
    for (const token of targetTokens) if (sourceTokens.has(token)) common++;
    const denominator = targetTokens.size + sourceTokens.size;
    const dice = denominator ? 2 * common / denominator : 0;
    const coverage = Math.min(targetTokens.size, sourceTokens.size) ? common / Math.min(targetTokens.size, sourceTokens.size) : 0;
    const macros = macroScore(food, source);
    const exactish = targetNorm === sourceNorm;
    const score = exactish ? 1.15 + 0.2 * macros : 0.72 * dice + 0.18 * coverage + 0.1 * macros;
    if (!best || score > best.score) {
      secondScore = best?.score ?? secondScore;
      best = { ...source, dice, coverage, macros, score, exactish };
    } else if (score > secondScore) secondScore = score;
  }
  if (!best || (best.dice < 0.45 && !best.exactish)) continue;
  matches.push({
    index, food: food.name, name_en: food.name_en, current: food.nutrients?.["Molybdenum (µg)"],
    candidate: best.name, publicFoodKey: best.id, derivation: best.derivation,
    molybdenum_ug: best.molybdenum, exactish: best.exactish,
    nameScore: Number(best.dice.toFixed(3)), coverage: Number(best.coverage.toFixed(3)),
    macroScore: Number(best.macros.toFixed(3)), score: Number(best.score.toFixed(3)),
    secondScore: Number(secondScore.toFixed(3)),
    ambiguous: secondScore >= best.score - 0.1
  });
}
matches.sort((a, b) => Number(b.exactish) - Number(a.exactish) || b.score - a.score);
const countsByDerivation = {};
for (const row of records) countsByDerivation[row.derivation || "missing"] = (countsByDerivation[row.derivation || "missing"] || 0) + 1;
console.log(JSON.stringify({
  databaseRows: db.length,
  afcdRowsWithMolybdenum: records.length,
  exactishMatches: matches.filter(x => x.exactish).length,
  highUnambiguous: matches.filter(x => x.exactish || (x.score >= 0.82 && x.macroScore >= 0.55 && !x.ambiguous)).length,
  candidates: matches.length,
  derivationRows: countsByDerivation,
  matches
}, null, 2));
