import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const auditPath = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const bls = JSON.parse(fs.readFileSync("Daten/BLS_4_0_Molybdenum_extract.json", "utf8"));
const usda = JSON.parse(fs.readFileSync("Daten/USDA_SR_Legacy_Choline_extract.json", "utf8"));
const norm = value => String(value ?? "").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const numeric = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\s*-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*$/i.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const generic = new Set("a an and as at from in of or the with without by per fresh raw cooked dried dry canned frozen boiled roasted unsalted salted skinless boneless whole pieces drained powder powdered ready serve only edible portion black white red green yellow brown mature seed seeds nut nuts flour meal semolina grits groats flakes cereal grain grains oil oils fat fats lard shortening butter ghee margarine spread protein isolate".split(" "));
const stop = new Set("a an and as at from in of or the with without by per fresh raw cooked dried dry canned frozen boiled roasted unsalted salted skinless boneless whole pieces drained powder powdered ready serve only edible portion".split(" "));
const tokens = value => new Set(norm(value).split(" ").map(token => {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}).filter(token => token.length > 1 && !stop.has(token)));
const coreTokens = value => new Set([...tokens(value)].filter(token => !generic.has(token)));
const textForFood = food => `${food.name_en || ""} ${food.name || ""}`;
const has = (text, pattern) => pattern.test(String(text || ""));
const organType = text => {
  const value = norm(text);
  for (const [name, pattern] of [["liver", /\b(liver|leber)\b/], ["kidney", /\b(kidney|niere|nieren)\b/], ["heart", /\b(heart|herz)\b/], ["gizzard", /\b(gizzard|magen)\b/], ["giblets", /\b(giblet|innards|offal|innereien)\b/]]) if (pattern.test(value)) return name;
  return null;
};
const composite = text => {
  const value = norm(text);
  for (const [name, pattern] of [["pudding", /\b(pudding|flammeri|custard)\b/], ["sausage", /\b(wurst|sausage|salami|mortadella)\b/], ["bread", /\b(bread|brot|toast)\b/], ["juice", /\b(juice|saft)\b/], ["drink", /\b(drink|beverage|milchalternative)\b/], ["soup", /\b(soup|suppe)\b/], ["salad", /\b(salad|salat)\b/], ["cake", /\b(cake|kuchen|torte|cookie|biscuit)\b/]]) if (pattern.test(value)) return name;
  return null;
};
const compatible = (targetFood, sourceText, targetOverride = "") => {
  const target = `${textForFood(targetFood)} ${targetOverride}`;
  const t = norm(target), s = norm(sourceText);
  const targetOil = has(t, /\b(oil|ol)\b/) || /öl/i.test(target);
  const sourceOil = has(s, /\b(oil|ol)\b/) || /öl/i.test(sourceText);
  if (targetOil !== sourceOil) return false;
  if (has(t, /\blecithin\b/) !== has(s, /\blecithin\b/)) return false;
  if (has(t, /\b(shea|karite|kakaobutter|cocoa butter)\b/) !== has(s, /\b(shea|karite|kakaobutter|cocoa butter)\b/)) return false;
  const targetOrgan = organType(t), sourceOrgan = organType(s);
  if (targetOrgan !== sourceOrgan && (targetOrgan || sourceOrgan)) return false;
  const targetComposite = composite(t), sourceComposite = composite(s);
  if (targetComposite !== sourceComposite && (targetComposite || sourceComposite)) return false;
  const targetFlour = has(t, /\b(flour|mehl|meal|semolina|gries|grits)\b/);
  const sourceFlour = has(s, /\b(flour|mehl|meal|semolina|gries|grits)\b/);
  if (targetFlour !== sourceFlour) return false;
  const left = coreTokens(target), right = coreTokens(sourceText);
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  if (overlap) return true;
  return targetOil && sourceOil;
};
const macroSimilarity = (food, source) => {
  const n = food.nutrients || {};
  const pairs = [
    [n["Energy (cal)"], source.energy_kcal, 0.12], [n["Protein (g)"], source.protein_g, 0.25],
    [n["Total Fat (g)"], source.fat_g, 0.24], [n["Total Carbohydrate (g)"], source.carbs_g, 0.20],
    [n["Dietary Fibre (g)"], source.fiber_g, 0.19]
  ];
  let error = 0, weight = 0;
  for (const [av, bv, w] of pairs) {
    const a = numeric(av), b = numeric(bv);
    if (a === null || b === null) continue;
    error += w * Math.min(3, Math.abs(Math.log((a + 1) / (b + 1))));
    weight += w;
  }
  return weight ? Math.exp(-error / weight) : 0.5;
};
const score = (food, sourceName, source) => {
  const left = coreTokens(textForFood(food)), right = coreTokens(sourceName);
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  const dice = overlap ? 2 * overlap / (left.size + right.size) : 0;
  return { dice, value: 0.82 * dice + 0.18 * macroSimilarity(food, source) };
};
const bestUsda = food => {
  let best = null;
  for (const row of usda) {
    const value = numeric(row.choline_mg);
    if (value === null || !compatible(food, row.description)) continue;
    const s = score(food, row.description, row);
    if (!best || s.value > best.s.value) best = { row, s, value };
  }
  return best;
};
const bestBls = food => {
  let best = null;
  for (const row of bls) {
    const value = numeric(row.molybdenum_ug);
    if (value === null || !compatible(food, `${row.name || ""} ${row.name_en || ""}`)) continue;
    const s = score(food, `${row.name || ""} ${row.name_en || ""}`, {
      energy_kcal: row.energy_kcal, protein_g: row.protein_g, fat_g: row.fat_g, carbs_g: row.carbs_g, fiber_g: row.fiber_g
    });
    if (!best || s.value > best.s.value) best = { row, s, value };
  }
  return best;
};
const methodCounts = field => audit.records.reduce((counts, record) => {
  counts[record[field].method] = (counts[record[field].method] || 0) + 1;
  return counts;
}, {});
const fixes = { choline: [], molybdenum: [] };
const invalidCholine = new Set(), invalidMo = new Set();

for (let i = 0; i < db.length; i++) {
  const food = db[i], record = audit.records[i];
  const c = record.choline, m = record.molybdenum;
  if (c.sourceName && /USDA close food match|similar database food estimate/i.test(c.method)) {
    const compatibleSource = c.sourceIndex !== undefined
      ? compatible(food, textForFood(db[c.sourceIndex]))
      : compatible(food, c.sourceName);
    if (!compatibleSource) invalidCholine.add(i);
  }
  if (m.sourceName && /BLS similar food estimate|similar database food estimate/i.test(m.method)) {
    const compatibleSource = m.sourceIndex !== undefined
      ? compatible(food, textForFood(db[m.sourceIndex]))
      : compatible(food, m.sourceName);
    if (!compatibleSource) invalidMo.add(i);
  }
}

for (const i of invalidCholine) {
  const food = db[i], match = bestUsda(food);
  if (match && match.s.value >= 0.42) {
    audit.records[i].choline = {
      value: match.value, method: "USDA compatible food estimate", confidence: match.s.value >= 0.62 ? "medium" : "low-medium",
      sourceName: match.row.description, sourceId: String(match.row.fdc_id),
      sourceUrl: `https://fdc.nal.usda.gov/food-details/${match.row.fdc_id}/nutrients?type=SR%20Legacy`, matchScore: Number(match.s.value.toFixed(2))
    };
  } else {
    fixes.choline.push(i);
  }
}
for (const i of invalidMo) {
  const food = db[i], match = bestBls(food);
  if (match && match.s.value >= 0.40) {
    audit.records[i].molybdenum = {
      value: match.value, method: "BLS compatible food estimate", confidence: match.s.value >= 0.62 ? "medium" : "low-medium",
      sourceName: match.row.name, sourceCode: String(match.row.code), sourceType: match.row.moly_source || null,
      sourceReference: match.row.moly_reference || null, matchScore: Number(match.s.value.toFixed(2))
    };
  } else {
    fixes.molybdenum.push(i);
  }
}

const categoryMedian = (index, field, excluded) => {
  const category = db[index].category;
  const key = field === "choline" ? "Choline (mg)" : "Molybdenum (µg)";
  const eligibleMethod = field === "choline" ? /USDA exact name|USDA close food match|USDA compatible food estimate|logical zero: isolated supplement/ : /BLS 4\.0 mapped food|BLS 4\.0 exact name|BLS compatible food estimate/;
  let values = audit.records.filter((record, i) => i !== index && !excluded.has(i) && db[i].category === category && eligibleMethod.test(record[field].method)).map(record => record.valuesPer100g[key]).filter(value => Number.isFinite(value));
  if (!values.length) values = audit.records.filter((record, i) => i !== index && !excluded.has(i) && eligibleMethod.test(record[field].method)).map(record => record.valuesPer100g[key]).filter(value => Number.isFinite(value));
  values.sort((a, b) => a - b);
  return values.length ? values[Math.floor(values.length / 2)] : 0;
};
for (const i of fixes.choline) {
  const value = categoryMedian(i, "choline", invalidCholine);
  audit.records[i].choline = { value, method: "Choline category-median estimate (guardrail)", confidence: "low", note: "No composition-data source matched both food identity and product form." };
}
for (const i of fixes.molybdenum) {
  const value = categoryMedian(i, "molybdenum", invalidMo);
  audit.records[i].molybdenum = { value, method: "Molybdenum category-median estimate (guardrail)", confidence: "low", note: "No composition-data source matched both food identity and product form." };
}

let oilFatZeros = 0;
for (let i = 0; i < db.length; i++) {
  if (db[i].category !== "oele_fette" || /^BLS 4\.0 (mapped food|exact name)$/.test(audit.records[i].molybdenum.method)) continue;
  audit.records[i].molybdenum = {
    value: 0, method: "logical near-zero estimate: oil/fat", confidence: "medium-low",
    note: "BLS 4.0 has no numeric direct value for this oil/fat entry; mineral transfer from nuts, seeds or offal is rejected because molybdenum is not a meaningful nutrient in the purified fat fraction."
  };
  oilFatZeros++;
}

for (let i = 0; i < db.length; i++) {
  db[i].nutrients["Choline (mg)"] = Number(audit.records[i].choline.value.toFixed(1));
  db[i].nutrients["Molybdenum (µg)"] = Number(audit.records[i].molybdenum.value.toFixed(1));
  audit.records[i].valuesPer100g = {
    "Choline (mg)": db[i].nutrients["Choline (mg)"],
    "Molybdenum (µg)": db[i].nutrients["Molybdenum (µg)"]
  };
}
audit.summary.choline = methodCounts("choline");
audit.summary.molybdenum = methodCounts("molybdenum");
audit.summary.guardrailCorrections = { incompatibleCholineMatches: invalidCholine.size, incompatibleMolybdenumMatches: invalidMo.size, oilFatMolybdenumNearZero: oilFatZeros };
fs.writeFileSync("database.json", `${JSON.stringify(db, null, 2)}\n`, "utf8");
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ correctedCholine: invalidCholine.size, correctedMolybdenum: invalidMo.size, oilFatMolybdenumNearZero: oilFatZeros, summary: audit.summary }, null, 2));
