import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const bls = JSON.parse(fs.readFileSync("Daten/BLS_4_0_Molybdenum_extract.json", "utf8"));
const cholineKey = "Choline (mg)";
const molybdenumKey = "Molybdenum (\u00B5g)";

const norm = value => String(value ?? "")
  .replace(/ß/g, "ss")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const number = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\s*-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*$/i.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const stop = new Set("a an and as at by from in of or the with without per fresh raw cooked dried dry canned frozen boiled roasted unsalted salted skinless boneless whole pieces drained powder powdered ready serve only edible portion food foods product products prepared unprepared sweetened unsweetened".split(" "));
const stem = token => {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
};
const tokens = value => new Set(norm(value).split(" ").map(stem).filter(token => token.length > 1 && !stop.has(token)));
const dice = (leftText, rightText) => {
  const left = tokens(leftText), right = tokens(rightText);
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap ? 2 * overlap / (left.size + right.size) : 0;
};

const patterns = {
  dried: /\b(dried|dehydrated|dry|dorr|getrocknet|gedorrt|trocken)\b/,
  canned: /\b(canned|tinned|konserve|konserviert|dose|dosiert)\b/,
  frozen: /\b(frozen|deep frozen|gefroren|tiefkuhl)\b/,
  cooked: /\b(cooked|boiled|baked|roasted|fried|grilled|steamed|gegart|gekocht|gebraten|gebacken|gegrillt|gedunstet)\b/,
  raw: /\b(raw|fresh|roh|frisch)\b/,
  juice: /\b(juice|nectar|saft)\b/,
  inOil: /\b(in oil|oil packed|packed in oil|in ol|mit ol)\b/,
  noOil: /\b(without oil|no oil|ohne ol)\b/,
  sweetened: /\b(sweetened|sugared|gezuckert|gesußt)\b/,
  unsweetened: /\b(unsweetened|without sugar|no sugar|ungesüßt|ohne zucker)\b/
};
const profile = text => Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, pattern.test(norm(text))]));
const formsCompatible = (targetText, sourceText) => {
  const t = profile(targetText), s = profile(sourceText);
  for (const key of ["dried", "canned", "frozen", "juice"]) if (t[key] !== s[key] && (t[key] || s[key])) return false;
  if (t.raw && (s.dried || s.canned || s.frozen || s.cooked || s.juice)) return false;
  if (t.cooked && !s.cooked) return false;
  if (s.cooked && (t.raw || t.dried || t.canned || t.frozen)) return false;
  if (t.inOil && !s.inOil) return false;
  if (t.noOil && s.inOil) return false;
  if (s.inOil && !t.inOil && (t.noOil || t.raw || t.dried || t.canned || t.frozen)) return false;
  if (t.sweetened && s.unsweetened) return false;
  if (t.unsweetened && s.sweetened) return false;
  return true;
};

const macroScore = (food, source) => {
  const n = food.nutrients || {};
  const pairs = [
    [n["Energy (cal)"], source.energy_kcal, 0.18],
    [n["Protein (g)"], source.protein_g, 0.25],
    [n["Total Fat (g)"], source.fat_g, 0.16],
    [n["Total Carbohydrate (g)"], source.carbs_g, 0.18],
    [n["Dietary Fibre (g)"], source.fiber_g, 0.23]
  ];
  let error = 0, weight = 0;
  for (const [a0, b0, w] of pairs) {
    const a = number(a0), b = number(b0);
    if (a === null || b === null) continue;
    error += w * Math.min(3, Math.abs(Math.log((a + 1) / (b + 1))));
    weight += w;
  }
  return weight ? Math.exp(-error / weight) : 0.5;
};
const combinedScore = (food, targetText, sourceText, source) => {
  const nameScore = dice(targetText, sourceText);
  const macros = macroScore(food, source);
  return { nameScore, macros, score: 0.72 * nameScore + 0.28 * macros };
};

const cholineCandidates = usda.filter(row => number(row.choline_mg) !== null);
const molybdenumCandidates = bls.filter(row => number(row.molybdenum_ug) !== null);
const bestForFood = (food, nutrient) => {
  const targetText = nutrient === "choline" ? `${food.name_en || ""} ${food.name || ""}` : `${food.name || ""} ${food.name_en || ""}`;
  const candidates = nutrient === "choline" ? cholineCandidates : molybdenumCandidates;
  let best = null;
  for (const row of candidates) {
    const sourceText = nutrient === "choline"
      ? row.description
      : `${row.name || ""} ${row.name_en || ""}`;
    if (!formsCompatible(targetText, sourceText)) continue;
    const score = combinedScore(food, targetText, sourceText, row);
    if (score.nameScore < 0.28) continue;
    if (!best || score.score > best.score.score) best = { row, sourceText, score };
  }
  return best;
};

const isProtected = record => /logical zero|logical near-zero/.test(record.method || "");
const planFor = (nutrient, key) => {
  const plan = [];
  const protectedCount = { direct: 0, logical: 0 };
  let incompatibleCurrent = 0;
  for (let index = 0; index < db.length; index++) {
    const food = db[index];
    const record = audit.records[index][nutrient];
    if (/USDA exact name|BLS 4\.0 mapped food|BLS 4\.0 exact name/.test(record.method || "")) {
      protectedCount.direct++;
      continue;
    }
    if (isProtected(record)) {
      protectedCount.logical++;
      continue;
    }
    const targetText = nutrient === "choline" ? `${food.name_en || ""} ${food.name || ""}` : `${food.name || ""} ${food.name_en || ""}`;
    const currentSource = record.sourceName || "";
    const currentCompatible = currentSource ? formsCompatible(targetText, currentSource) : false;
    if (currentSource && !currentCompatible) incompatibleCurrent++;
    const best = bestForFood(food, nutrient);
    if (!best) continue;
    const threshold = best.score.nameScore >= 0.48 && best.score.score >= 0.58 && best.score.macros >= 0.45;
    if (!threshold) continue;
    let currentScore = -1;
    if (currentSource && currentCompatible) {
      const currentMacro = macroScore(food, {
        energy_kcal: record.sourceEnergyKcal,
        protein_g: record.sourceProteinG,
        fat_g: record.sourceFatG,
        carbs_g: record.sourceCarbsG,
        fiber_g: record.sourceFiberG
      });
      currentScore = 0.72 * dice(targetText, currentSource) + 0.28 * currentMacro;
    }
    const needsReplacement = !currentCompatible || /category-median|conservative zero/.test(record.method || "") || best.score.score >= currentScore + 0.07;
    if (!needsReplacement) continue;
    const value = Number((nutrient === "choline" ? number(best.row.choline_mg) : number(best.row.molybdenum_ug)).toFixed(1));
    plan.push({
      index,
      food: food.name,
      name_en: food.name_en,
      nutrientKey: key,
      oldValue: food.nutrients[key],
      newValue: value,
      oldMethod: record.method,
      oldSource: record.sourceName || null,
      currentCompatible,
      candidate: nutrient === "choline" ? best.row.description : best.row.name,
      candidateId: nutrient === "choline" ? String(best.row.fdc_id) : String(best.row.code),
      score: Number(best.score.score.toFixed(3)),
      nameScore: Number(best.score.nameScore.toFixed(3)),
      macroScore: Number(best.score.macros.toFixed(3)),
      confidence: best.score.score >= 0.74 && best.score.nameScore >= 0.62 ? "medium-high" : "medium"
    });
  }
  return { plan, protectedCount, incompatibleCurrent };
};

const cholinePlan = planFor("choline", cholineKey);
const molybdenumPlan = planFor("molybdenum", molybdenumKey);
const report = {
  createdOn: new Date().toISOString(),
  rowCount: db.length,
  method: "Preparation-form-gated USDA SR Legacy/BLS match ranking using food names and existing macro profiles.",
  choline: {
    candidates: cholinePlan.plan.length,
    incompatibleCurrentSources: cholinePlan.incompatibleCurrent,
    protected: cholinePlan.protectedCount,
    corrections: cholinePlan.plan
  },
  molybdenum: {
    candidates: molybdenumPlan.plan.length,
    incompatibleCurrentSources: molybdenumPlan.incompatibleCurrent,
    protected: molybdenumPlan.protectedCount,
    corrections: molybdenumPlan.plan
  }
};

console.log(JSON.stringify({
  rowCount: report.rowCount,
  choline: { candidates: report.choline.candidates, incompatibleCurrentSources: report.choline.incompatibleCurrentSources, protected: report.choline.protected },
  molybdenum: { candidates: report.molybdenum.candidates, incompatibleCurrentSources: report.molybdenum.incompatibleCurrentSources, protected: report.molybdenum.protected },
  sampleCorrections: [...cholinePlan.plan.slice(0, 12), ...molybdenumPlan.plan.slice(0, 12)]
}, null, 2));

if (process.argv.includes("--apply")) {
  const originalOtherNutrients = JSON.stringify(db.map(food => {
    const copy = structuredClone(food);
    delete copy.nutrients[cholineKey];
    delete copy.nutrients[molybdenumKey];
    return copy;
  }));
  const corrections = [];
  for (const [nutrient, key, entries] of [
    ["choline", cholineKey, cholinePlan.plan],
    ["molybdenum", molybdenumKey, molybdenumPlan.plan]
  ]) {
    for (const item of entries) {
      const index = item.index;
      const oldRecord = audit.records[index][nutrient];
      let source, method, url, details;
      if (nutrient === "choline") {
        source = usda.find(row => String(row.fdc_id) === item.candidateId);
        method = "USDA form-aware compatible food estimate";
        url = `https://fdc.nal.usda.gov/food-details/${item.candidateId}/nutrients?type=SR%20Legacy`;
        details = { sourceName: source.description, sourceId: item.candidateId, sourceUrl: url };
      } else {
        source = bls.find(row => String(row.code) === item.candidateId);
        method = "BLS form-aware compatible food estimate";
        url = "https://blsdb.prod.se.ble.de/";
        details = { sourceName: source.name, sourceCode: item.candidateId, sourceType: source.moly_source || null, sourceReference: source.moly_reference || null, sourceUrl: url };
      }
      db[index].nutrients[key] = item.newValue;
      audit.records[index].valuesPer100g[key] = item.newValue;
      audit.records[index][nutrient] = {
        value: item.newValue,
        method,
        confidence: item.confidence,
        matchScore: item.score,
        nameScore: item.nameScore,
        macroScore: item.macroScore,
        ...details,
        note: "Selected only after requiring compatible raw/dried/canned/frozen/cooked/juice/oil and sweetening form flags; ranked by food-name overlap and macro profile."
      };
      corrections.push({
        databaseIndex: index,
        food: item.food,
        name_en: item.name_en,
        nutrient: key,
        oldValue: item.oldValue,
        newValue: item.newValue,
        previousMethod: oldRecord.method,
        previousSource: oldRecord.sourceName || null,
        verifiedSource: nutrient === "choline" ? source.description : source.name,
        sourceId: nutrient === "choline" ? item.candidateId : undefined,
        sourceCode: nutrient === "molybdenum" ? item.candidateId : undefined,
        sourceUrl: url,
        matchScore: item.score,
        reason: "Form-aware source replacement after name and macro score passed thresholds."
      });
    }
  }
  const afterOtherNutrients = JSON.stringify(db.map(food => {
    const copy = structuredClone(food);
    delete copy.nutrients[cholineKey];
    delete copy.nutrients[molybdenumKey];
    return copy;
  }));
  if (originalOtherNutrients !== afterOtherNutrients) throw new Error("Unexpected changes outside Choline and Molybdenum");
  for (let index = 0; index < db.length; index++) {
    if (!Number.isFinite(db[index].nutrients[cholineKey]) || !Number.isFinite(db[index].nutrients[molybdenumKey])) throw new Error(`Invalid nutrient at ${index}`);
    if (audit.records[index].valuesPer100g[cholineKey] !== db[index].nutrients[cholineKey] || audit.records[index].valuesPer100g[molybdenumKey] !== db[index].nutrients[molybdenumKey]) throw new Error(`Audit/database mismatch at ${index}`);
  }
  audit.summary.choline = audit.records.reduce((counts, record) => { counts[record.choline.method] = (counts[record.choline.method] || 0) + 1; return counts; }, {});
  audit.summary.molybdenum = audit.records.reduce((counts, record) => { counts[record.molybdenum.method] = (counts[record.molybdenum.method] || 0) + 1; return counts; }, {});
  audit.summary.formAwareReconciliation = {
    cholineCorrections: cholinePlan.plan.length,
    molybdenumCorrections: molybdenumPlan.plan.length
  };
  audit.correctionLog = [...(audit.correctionLog || []), ...corrections];
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(`Applied ${corrections.length} form-aware corrections; only the two requested nutrient fields changed.`);
}
