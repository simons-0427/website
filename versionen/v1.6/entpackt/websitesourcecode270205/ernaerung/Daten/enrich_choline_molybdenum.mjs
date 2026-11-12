import fs from "node:fs";

const databasePath = "database.json";
const blsPath = "Daten/BLS_4_0_Molybdenum_extract.json";
const usdaPath = "Daten/USDA_SR_Legacy_Choline_extract.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const bls = JSON.parse(fs.readFileSync(blsPath, "utf8"));
const usda = JSON.parse(fs.readFileSync(usdaPath, "utf8"));
const norm = value => String(value ?? "").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const number = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\s*-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*$/i.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const original = JSON.stringify(db);
const blsByCode = new Map(bls.map(row => [String(row.code), row]));
const blsByName = new Map();
for (const row of bls) {
  if (norm(row.name)) blsByName.set(norm(row.name), row);
  if (norm(row.name_en)) blsByName.set(norm(row.name_en), row);
}
const sourceCodeByFood = new Map();
for (const file of fs.readdirSync("Daten").filter(name => name.includes("_sources.json"))) {
  const sourceBatch = JSON.parse(fs.readFileSync(`Daten/${file}`, "utf8"));
  for (const record of sourceBatch.records || []) {
    if (record.blsCode && record.databaseName) sourceCodeByFood.set(norm(record.databaseName), String(record.blsCode));
  }
}
const usdaWithCholine = usda.filter(row => number(row.choline_mg) !== null);
const usdaByName = new Map(usdaWithCholine.map(row => [norm(row.description), row]));
const stopWords = new Set("a an and as at from in of or the with without by per fresh raw cooked dried dry canned frozen boiled roasted unsalted salted skinless boneless whole pieces drained powder powdered ready serve only edible portion".split(" "));
const tokens = value => new Set(norm(value).split(" ").map(token => {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}).filter(token => token.length > 1 && !stopWords.has(token)));
const nameDice = (a, b) => {
  const left = tokens(a), right = tokens(b);
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap ? 2 * overlap / (left.size + right.size) : 0;
};
const macroSimilarity = (food, source) => {
  const target = food.nutrients || {};
  const values = [
    [target["Energy (cal)"], source.energy_kcal, 0.12],
    [target["Protein (g)"], source.protein_g, 0.25],
    [target["Total Fat (g)"], source.fat_g, 0.24],
    [target["Total Carbohydrate (g)"], source.carbs_g, 0.20],
    [target["Dietary Fibre (g)"], source.fiber_g, 0.19]
  ];
  let error = 0, weight = 0;
  for (const [a0, b0, w] of values) {
    const a = number(a0), b = number(b0);
    if (a === null || b === null) continue;
    error += w * Math.min(3, Math.abs(Math.log((a + 1) / (b + 1))));
    weight += w;
  }
  return weight ? Math.exp(-error / weight) : 0.5;
};
const sourceScore = (food, source) => {
  const dice = nameDice(food.name_en || food.name, source.description);
  const macro = macroSimilarity(food, source);
  return { dice, macro, score: 0.82 * dice + 0.18 * macro };
};
const round = (value, digits = 1) => Number(value.toFixed(digits));
const foodNames = food => `${food.name_en || ""} ${food.name || ""}`;

const cholineResults = new Array(db.length);
const molybdenumResults = new Array(db.length);
for (let index = 0; index < db.length; index++) {
  const food = db[index];
  const exact = usdaByName.get(norm(food.name_en)) || usdaByName.get(norm(food.name));
  if (exact) {
    cholineResults[index] = {
      value: number(exact.choline_mg), method: "USDA exact name", confidence: "high",
      sourceName: exact.description, sourceId: String(exact.fdc_id), sourceUrl: `https://fdc.nal.usda.gov/food-details/${exact.fdc_id}/nutrients?type=SR%20Legacy`
    };
  } else {
    let best = null;
    for (const source of usdaWithCholine) {
      const score = sourceScore(food, source);
      if (!best || score.score > best.score.score) best = { source, score };
    }
    if (best && best.score.dice >= 0.36 && best.score.score >= 0.55) {
      cholineResults[index] = {
        value: number(best.source.choline_mg), method: "USDA close food match", confidence: best.score.score >= 0.68 && best.score.dice >= 0.48 ? "medium-high" : "medium",
        sourceName: best.source.description, sourceId: String(best.source.fdc_id), sourceUrl: `https://fdc.nal.usda.gov/food-details/${best.source.fdc_id}/nutrients?type=SR%20Legacy`,
        matchScore: round(best.score.score, 2)
      };
    }
  }

  let row = null, method = null;
  const mappedCode = sourceCodeByFood.get(norm(food.name));
  if (mappedCode && blsByCode.has(mappedCode)) {
    row = blsByCode.get(mappedCode);
    if (number(row.molybdenum_ug) !== null) method = "BLS 4.0 mapped food";
  }
  if (!method) {
    const exactBls = blsByName.get(norm(food.name)) || blsByName.get(norm(food.name_en));
    if (exactBls && number(exactBls.molybdenum_ug) !== null) {
      row = exactBls;
      method = "BLS 4.0 exact name";
    }
  }
  if (method) {
    molybdenumResults[index] = {
      value: number(row.molybdenum_ug), method, confidence: "high", sourceName: row.name,
      sourceCode: String(row.code), sourceType: row.moly_source || null, sourceReference: row.moly_reference || null
    };
  } else {
    let best = null;
    for (const candidate of bls) {
      if (number(candidate.molybdenum_ug) === null) continue;
      const score = sourceScore(food, {
        description: candidate.name_en || candidate.name,
        energy_kcal: candidate.energy_kcal, protein_g: candidate.protein_g, fat_g: candidate.fat_g,
        carbs_g: candidate.carbs_g, fiber_g: candidate.fiber_g
      });
      if (!best || score.score > best.score.score) best = { source: candidate, score };
    }
    if (best && best.score.dice >= 0.28 && best.score.score >= 0.48) {
      molybdenumResults[index] = {
        value: number(best.source.molybdenum_ug), method: "BLS similar food estimate", confidence: best.score.score >= 0.65 ? "medium" : "low-medium",
        sourceName: best.source.name, sourceCode: String(best.source.code), sourceType: best.source.moly_source || null,
        sourceReference: best.source.moly_reference || null, matchScore: round(best.score.score, 2)
      };
    }
  }
}

const useAnchors = (results, key) => db.map((food, index) => ({ food, result: results[index] }))
  .filter(entry => entry.result && Number.isFinite(entry.result.value));
const cholineAnchors = useAnchors(cholineResults, "choline");
const molybdenumAnchors = useAnchors(molybdenumResults, "molybdenum");
const estimateFromAnchors = (food, anchors, nutrient) => {
  const local = anchors.filter(entry => entry.food.category === food.category);
  const pool = local.length ? local : anchors;
  const ranked = pool.map(entry => {
    const dice = nameDice(foodNames(food), foodNames(entry.food));
    const macro = macroSimilarity(food, {
      energy_kcal: entry.food.nutrients?.["Energy (cal)"], protein_g: entry.food.nutrients?.["Protein (g)"],
      fat_g: entry.food.nutrients?.["Total Fat (g)"], carbs_g: entry.food.nutrients?.["Total Carbohydrate (g)"],
      fiber_g: entry.food.nutrients?.["Dietary Fibre (g)"]
    });
    return { entry, dice, macro, score: 0.72 * dice + 0.28 * macro };
  }).sort((a, b) => b.score - a.score);
  const near = ranked[0];
  if (near && near.dice >= 0.24 && near.score >= 0.40) {
    return {
      value: near.entry.result.value, method: `${nutrient} similar database food estimate`, confidence: near.score >= 0.60 ? "low-medium" : "low",
      sourceName: near.entry.food.name, sourceIndex: db.indexOf(near.entry.food), matchScore: round(near.score, 2),
      sourceEvidence: near.entry.result.method
    };
  }
  const categoryValues = local.map(entry => entry.result.value).filter(Number.isFinite).sort((a, b) => a - b);
  const values = categoryValues.length ? categoryValues : anchors.map(entry => entry.result.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return { value: 0, method: `${nutrient} conservative zero`, confidence: "low", note: "No usable composition-data comparator found; 0 is a placeholder, not a verified absence." };
  const middle = values[Math.floor(values.length / 2)];
  return { value: middle, method: `${nutrient} category-median estimate`, confidence: "low", comparatorCount: categoryValues.length || values.length };
};
for (let index = 0; index < db.length; index++) {
  if (!cholineResults[index]) cholineResults[index] = estimateFromAnchors(db[index], cholineAnchors, "Choline");
  if (!molybdenumResults[index]) molybdenumResults[index] = estimateFromAnchors(db[index], molybdenumAnchors, "Molybdenum");
}

const methods = results => results.reduce((counts, result) => {
  counts[result.method] = (counts[result.method] || 0) + 1;
  return counts;
}, {});
const audit = {
  createdOn: "2026-09-25",
  basis: "All values are per 100 g edible portion, matching the existing database nutrient basis.",
  sources: [
    { name: "Bundeslebensmittelschlüssel BLS 4.0", url: "https://blsdb.prod.se.ble.de/", nutrient: "Molybdän, µg/100 g", note: "Source type/reference retained for direct BLS matches." },
    { name: "USDA FoodData Central SR Legacy, April 2018", url: "https://fdc.nal.usda.gov/download-datasets/", nutrient: "Choline, mg/100 g", note: "FDC food IDs and food detail links retained for source matches." }
  ],
  method: "Exact source name or existing BLS food mapping first; close food matches rank English names and compare energy, protein, fat, carbohydrate and fibre; remaining values are labeled as estimates from a similar database food or category median. Numeric source zeros are retained. Unreported/censored values are not treated as zero.",
  note: "Estimated values are practical approximations, not laboratory measurements; inspect method/confidence before using for clinical decisions.",
  summary: { foodCount: db.length, choline: methods(cholineResults), molybdenum: methods(molybdenumResults) },
  records: db.map((food, index) => ({
    databaseIndex: index, food: food.name, name_en: food.name_en || null,
    valuesPer100g: { "Choline (mg)": round(cholineResults[index].value, 1), "Molybdenum (µg)": round(molybdenumResults[index].value, 1) },
    choline: cholineResults[index], molybdenum: molybdenumResults[index]
  }))
};
const invalid = audit.records.filter(record => Object.values(record.valuesPer100g).some(value => !Number.isFinite(value) || value < 0));
if (db.length !== 1516 || invalid.length) throw new Error(`Validation failed: foods=${db.length}, invalid=${invalid.length}`);
console.log(JSON.stringify(audit.summary, null, 2));
console.log("Sample unresolved or low-confidence estimates:");
console.log(JSON.stringify(audit.records.filter(record => /category-median|conservative zero/.test(record.choline.method + record.molybdenum.method)).slice(0, 12).map(record => ({ food: record.food, choline: record.choline, molybdenum: record.molybdenum })), null, 2));
if (process.argv.includes("--apply")) {
  for (let index = 0; index < db.length; index++) {
    db[index].nutrients["Choline (mg)"] = audit.records[index].valuesPer100g["Choline (mg)"];
    db[index].nutrients["Molybdenum (µg)"] = audit.records[index].valuesPer100g["Molybdenum (µg)"];
  }
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  const reread = JSON.parse(fs.readFileSync(databasePath, "utf8"));
  if (reread.length !== 1516 || reread.some(food => !Number.isFinite(food.nutrients["Choline (mg)"]) || !Number.isFinite(food.nutrients["Molybdenum (µg)"]))) throw new Error("Post-write validation failed");
  const stripped = reread.map(food => {
    const copy = structuredClone(food);
    delete copy.nutrients["Choline (mg)"];
    delete copy.nutrients["Molybdenum (µg)"];
    return copy;
  });
  if (JSON.stringify(stripped) !== original) throw new Error("Unexpected changes outside the two requested nutrient fields");
  console.log(`Applied ${reread.length} foods; only the two requested nutrient fields changed.`);
}
