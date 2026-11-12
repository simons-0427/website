import fs from "node:fs";

const databasePath = "database.json";
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const db = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const bls = JSON.parse(fs.readFileSync("Daten/BLS_4_0_Molybdenum_extract.json", "utf8"));
const cKey = "Choline (mg)", mKey = "Molybdenum (\u00B5g)";

const norm = value => String(value ?? "").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const numeric = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\s*-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*$/i.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const stop = new Set("a an and as at by from in of or the with without per fresh raw cooked dried dry canned frozen boiled roasted unsalted salted skinless boneless whole pieces drained powder powdered ready serve only edible portion food foods product products prepared unprepared sweetened unsweetened".split(" "));
const stem = token => token.length > 5 && token.endsWith("ies") ? `${token.slice(0, -3)}y` : token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
const tokens = value => new Set(norm(value).split(" ").map(stem).filter(token => token.length > 1 && !stop.has(token)));
const formPatterns = {
  dried: /\b(dried|dehydrated|dry|dorr|getrocknet|gedorrt|trocken)\b/,
  canned: /\b(canned|tinned|konserve|konserviert|dose)\b/,
  frozen: /\b(frozen|deep frozen|gefroren|tiefkuhl)\b/,
  cooked: /\b(cooked|boiled|baked|roasted|fried|grilled|steamed|gegart|gekocht|gebraten|gebacken|gegrillt|gedunstet)\b/,
  raw: /\b(raw|fresh|roh|frisch)\b/,
  juice: /\b(juice|nectar|saft)\b/,
  inOil: /\b(in oil|oil packed|packed in oil|in ol|mit ol)\b/,
  noOil: /\b(without oil|no oil|ohne ol)\b/,
  sweetened: /\b(sweetened|sugared|gezuckert|gesusst)\b/,
  unsweetened: /\b(unsweetened|without sugar|no sugar|ungesusst|ohne zucker)\b/
};
const formProfile = text => {
  const value = norm(text);
  return Object.fromEntries(Object.entries(formPatterns).map(([key, pattern]) => [key, pattern.test(value)]));
};
const formCompatible = (target, source) => {
  for (const key of ["dried", "canned", "frozen", "juice"]) if (target[key] !== source[key] && (target[key] || source[key])) return false;
  if (target.raw && (source.dried || source.canned || source.frozen || source.cooked || source.juice)) return false;
  if (target.cooked && !source.cooked) return false;
  if (source.cooked && (target.raw || target.dried || target.canned || target.frozen)) return false;
  if (target.inOil && !source.inOil) return false;
  if (target.noOil && source.inOil) return false;
  if (source.inOil && !target.inOil && (target.noOil || target.raw || target.dried || target.canned || target.frozen)) return false;
  if (target.sweetened && source.unsweetened) return false;
  if (target.unsweetened && source.sweetened) return false;
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
    const a = numeric(a0), b = numeric(b0);
    if (a === null || b === null) continue;
    error += w * Math.min(3, Math.abs(Math.log((a + 1) / (b + 1))));
    weight += w;
  }
  return weight ? Math.exp(-error / weight) : 0.5;
};
const normalizeSource = (row, nutrient) => {
  const text = nutrient === "choline" ? row.description : `${row.name || ""} ${row.name_en || ""}`;
  const value = nutrient === "choline" ? numeric(row.choline_mg) : numeric(row.molybdenum_ug);
  return { row, text, tokenSet: tokens(text), forms: formProfile(text), value };
};
const makeIndex = entries => {
  const byToken = new Map();
  entries.forEach((entry, index) => {
    for (const token of entry.tokenSet) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(index);
    }
  });
  return byToken;
};
const sourceSets = {
  choline: usda.filter(row => numeric(row.choline_mg) !== null).map(row => normalizeSource(row, "choline")),
  molybdenum: bls.filter(row => numeric(row.molybdenum_ug) !== null).map(row => normalizeSource(row, "molybdenum"))
};
const sourceIndexes = { choline: makeIndex(sourceSets.choline), molybdenum: makeIndex(sourceSets.molybdenum) };
const candidateFor = (food, nutrient) => {
  const targetText = nutrient === "choline" ? `${food.name_en || ""} ${food.name || ""}` : `${food.name || ""} ${food.name_en || ""}`;
  const targetTokens = tokens(targetText), targetForms = formProfile(targetText);
  const possible = new Set();
  for (const token of targetTokens) for (const index of sourceIndexes[nutrient].get(token) || []) possible.add(index);
  let best = null;
  for (const index of possible) {
    const candidate = sourceSets[nutrient][index];
    if (!formCompatible(targetForms, candidate.forms)) continue;
    let overlap = 0;
    for (const token of targetTokens) if (candidate.tokenSet.has(token)) overlap++;
    const nameScore = overlap ? 2 * overlap / (targetTokens.size + candidate.tokenSet.size) : 0;
    if (nameScore < 0.28) continue;
    const macros = macroScore(food, candidate.row);
    const score = 0.72 * nameScore + 0.28 * macros;
    if (!best || score > best.score) best = { candidate, nameScore, macros, score };
  }
  return best;
};

const planFor = (nutrient, key) => {
  const directPattern = nutrient === "choline" ? /USDA exact name/ : /BLS 4\.0 mapped food|BLS 4\.0 exact name/;
  const plan = [];
  const counts = { directProtected: 0, logicalProtected: 0, sourceFormConflicts: 0, candidates: 0 };
  for (let index = 0; index < db.length; index++) {
    const food = db[index], record = audit.records[index][nutrient];
    if (directPattern.test(record.method || "")) { counts.directProtected++; continue; }
    if (/logical zero|logical near-zero/.test(record.method || "")) { counts.logicalProtected++; continue; }
    const targetText = nutrient === "choline" ? `${food.name_en || ""} ${food.name || ""}` : `${food.name || ""} ${food.name_en || ""}`;
    const currentConflict = record.sourceName ? !formCompatible(formProfile(targetText), formProfile(record.sourceName)) : true;
    if (currentConflict) counts.sourceFormConflicts++;
    if (!currentConflict && !/category-median/.test(record.method || "")) continue;
    const best = candidateFor(food, nutrient);
    if (!best) continue;
    if (best.nameScore < 0.36 || best.score < 0.62 || best.macros < 0.50) continue;
    const row = best.candidate.row;
    const value = Number(best.candidate.value.toFixed(1));
    const confidence = best.score >= 0.78 && best.nameScore >= 0.58 && best.macros >= 0.68 ? "high" : best.score >= 0.69 ? "medium-high" : "medium";
    plan.push({
      index, food: food.name, name_en: food.name_en, nutrientKey: key,
      oldValue: food.nutrients[key], newValue: value,
      oldMethod: record.method, oldSource: record.sourceName || null,
      candidate: best.candidate.text,
      candidateId: nutrient === "choline" ? String(row.fdc_id) : String(row.code),
      score: Number(best.score.toFixed(3)), nameScore: Number(best.nameScore.toFixed(3)), macroScore: Number(best.macros.toFixed(3)), confidence
    });
    counts.candidates++;
  }
  plan.sort((a, b) => b.score - a.score);
  return { plan, counts };
};

const cp = planFor("choline", cKey);
const mp = planFor("molybdenum", mKey);
const summary = {
  foodCount: db.length,
  choline: { ...cp.counts, samples: cp.plan.slice(0, 30) },
  molybdenum: { ...mp.counts, samples: mp.plan.slice(0, 30) }
};
console.log(JSON.stringify(summary, null, 2));

if (process.argv.includes("--apply")) {
  const beforeOther = JSON.stringify(db.map(food => {
    const copy = structuredClone(food);
    delete copy.nutrients[cKey]; delete copy.nutrients[mKey];
    return copy;
  }));
  const fixes = [];
  for (const [nutrient, key, entries] of [["choline", cKey, cp.plan], ["molybdenum", mKey, mp.plan]]) {
    for (const item of entries) {
      const index = item.index;
      const source = nutrient === "choline"
        ? usda.find(row => String(row.fdc_id) === item.candidateId)
        : bls.find(row => String(row.code) === item.candidateId);
      const url = nutrient === "choline" ? `https://fdc.nal.usda.gov/food-details/${item.candidateId}/nutrients?type=SR%20Legacy` : "https://blsdb.prod.se.ble.de/";
      const previous = audit.records[index][nutrient];
      const details = nutrient === "choline"
        ? { sourceName: source.description, sourceId: item.candidateId, sourceUrl: url }
        : { sourceName: source.name, sourceCode: item.candidateId, sourceType: source.moly_source || null, sourceReference: source.moly_reference || null, sourceUrl: url };
      db[index].nutrients[key] = item.newValue;
      audit.records[index].valuesPer100g[key] = item.newValue;
      audit.records[index][nutrient] = {
        value: item.newValue,
        method: nutrient === "choline" ? "USDA form-aware compatible food estimate" : "BLS form-aware compatible food estimate",
        confidence: item.confidence, matchScore: item.score, nameScore: item.nameScore, macroScore: item.macroScore,
        ...details,
        note: "Chosen with explicit preparation-form compatibility, food-name overlap, and macro-profile checks."
      };
      fixes.push({
        databaseIndex: index, food: item.food, name_en: item.name_en, nutrient: key,
        oldValue: item.oldValue, newValue: item.newValue, previousMethod: previous.method,
        previousSource: previous.sourceName || null, verifiedSource: item.candidate,
        sourceId: nutrient === "choline" ? item.candidateId : undefined,
        sourceCode: nutrient === "molybdenum" ? item.candidateId : undefined,
        sourceUrl: url, matchScore: item.score, reason: "Form-aware source candidate passed name and macro thresholds."
      });
    }
  }
  const afterOther = JSON.stringify(db.map(food => {
    const copy = structuredClone(food);
    delete copy.nutrients[cKey]; delete copy.nutrients[mKey];
    return copy;
  }));
  if (beforeOther !== afterOther) throw new Error("Unexpected changes outside Choline and Molybdenum");
  for (let i = 0; i < db.length; i++) {
    if (!Number.isFinite(db[i].nutrients[cKey]) || !Number.isFinite(db[i].nutrients[mKey])) throw new Error(`Invalid value at ${i}`);
    if (audit.records[i].valuesPer100g[cKey] !== db[i].nutrients[cKey] || audit.records[i].valuesPer100g[mKey] !== db[i].nutrients[mKey]) throw new Error(`Audit/database mismatch at ${i}`);
  }
  audit.summary.choline = audit.records.reduce((c, r) => { c[r.choline.method] = (c[r.choline.method] || 0) + 1; return c; }, {});
  audit.summary.molybdenum = audit.records.reduce((c, r) => { c[r.molybdenum.method] = (c[r.molybdenum.method] || 0) + 1; return c; }, {});
  audit.summary.formAwareReconciliation = { cholineCorrections: cp.plan.length, molybdenumCorrections: mp.plan.length };
  audit.correctionLog = [...(audit.correctionLog || []), ...fixes];
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(`Applied ${fixes.length} form-aware corrections; only Choline and Molybdenum changed.`);
}
