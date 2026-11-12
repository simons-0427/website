import fs from "node:fs";

const db = JSON.parse(fs.readFileSync("database.json", "utf8"));
const audit = JSON.parse(fs.readFileSync("Daten/Cholin_Molybdaen_Quellen_20260925.json", "utf8"));
const sourceDefinitions = [
  { type: "FNDDS", path: "Daten/USDA_FNDDS_2021-2023_extracted/surveyDownload.json", root: "SurveyFoods" },
  { type: "Foundation", path: "Daten/USDA_Foundation_Foods_2026-04_extracted/FoodData_Central_foundation_food_json_2026-04-30.json", root: "FoundationFoods" }
];
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const stop = new Set("a an and as at by from in into of on or the with without per fresh raw cooked dried dry canned frozen boiled roasted unsalted salted skinless boneless whole pieces drained prepared product food commercial plain nfs no added light reduced low nonfat skim pack edible portion serves".split(" "));
const stem = token => token.length > 5 && token.endsWith("ies") ? `${token.slice(0, -3)}y` : token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
const tokens = value => new Set(normalize(value).split(" ").map(stem).filter(token => token.length > 1 && !stop.has(token)));
const forms = value => {
  const text = normalize(value);
  return {
    raw: /\b(raw|fresh)\b/.test(text),
    cooked: /\b(cooked|boiled|baked|fried|grilled|roasted|steamed|stewed|poached|broiled|braised|rotisserie)\b/.test(text),
    dried: /\b(dried|dehydrated|dry)\b/.test(text),
    canned: /\b(canned|tinned)\b/.test(text),
    frozen: /\bfrozen\b/.test(text),
    juice: /\b(juice|nectar)\b/.test(text),
    pickled: /\b(pickled|fermented|cured|smoked)\b/.test(text),
    sweet: /\b(sweetened|sugared)\b/.test(text),
    unsweet: /\b(unsweetened|without sugar|no sugar)\b/.test(text),
    salt: /\bsalted\b/.test(text),
    unsalt: /\b(unsalted|no salt)\b/.test(text),
    skin: /\b(with skin|skin on|skin eaten)\b/.test(text),
    skinless: /\b(skinless|without skin|no skin|skin not eaten)\b/.test(text),
    composite: ["soup", "sauce", "drink", "beverage", "smoothie", "salad", "dip", "casserole", "stew", "cocktail", "bar", "candy", "creamed", "pudding", "juice"].filter(word => new RegExp(`\\b${word}\\b`).test(text))
  };
};
const incompatible = (target, source) => {
  if (target.raw && (source.cooked || source.dried || source.canned || source.frozen || source.pickled || source.juice)) return true;
  if (target.cooked && (source.raw || source.dried || source.canned || source.frozen || source.pickled)) return true;
  if (target.dried && (source.raw || source.cooked || source.canned || source.frozen || source.juice)) return true;
  if (target.canned && (source.raw || source.cooked || source.dried || source.frozen || source.pickled)) return true;
  if (target.frozen && (source.raw || source.cooked || source.dried || source.canned || source.pickled)) return true;
  if (target.juice && !source.juice) return true;
  if (target.pickled && (source.raw || source.cooked || source.dried || source.frozen || source.juice)) return true;
  if ((target.sweet && source.unsweet) || (target.unsweet && source.sweet) || (target.salt && source.unsalt) || (target.unsalt && source.salt) || (target.skin && source.skinless) || (target.skinless && source.skin)) return true;
  for (const word of normalize(target.text).matchAll(/\bwithout\s+(\w+)\b/g)) {
    const item = word[1];
    if (new RegExp(`\\bwith\\s+${item}\\b`).test(normalize(source.text))) return true;
  }
  for (const word of normalize(source.text).matchAll(/\bwithout\s+(\w+)\b/g)) {
    const item = word[1];
    if (new RegExp(`\\bwith\\s+${item}\\b`).test(normalize(target.text))) return true;
  }
  if (target.composite.length && target.composite.some(type => !source.composite.includes(type))) return true;
  if (source.composite.length && source.composite.some(type => !target.composite.includes(type))) return true;
  return false;
};
const macroWeights = [0.1, 0.25, 0.2, 0.25, 0.2];
const targetMacroKeys = ["Energy (cal)", "Protein (g)", "Total Fat (g)", "Total Carbohydrate (g)", "Dietary Fibre (g)"];
const macroScore = (food, source) => {
  let error = 0, weight = 0;
  for (let i = 0; i < targetMacroKeys.length; i++) {
    const a = Number(food.nutrients[targetMacroKeys[i]]), b = source.macro[i];
    if (!Number.isFinite(a) || b === null) continue;
    error += macroWeights[i] * Math.min(3, Math.abs(Math.log((a + 1) / (b + 1))));
    weight += macroWeights[i];
  }
  return weight ? Math.exp(-error / weight) : 0.5;
};

const sources = [];
for (const definition of sourceDefinitions) {
  const foods = JSON.parse(fs.readFileSync(definition.path, "utf8"))[definition.root].filter(Boolean);
  for (const food of foods) {
    const nutrients = food.foodNutrients || [];
    const choline = nutrients.find(item => item && (String(item.nutrient?.number) === "421" || /choline/i.test(item.nutrient?.name || "")));
    if (!choline || choline.nutrient?.unitName !== "mg" || !Number.isFinite(Number(choline.amount))) continue;
    const macro = [208, 203, 204, 205, 291].map(number => {
      const item = nutrients.find(candidate => candidate && String(candidate.nutrient?.number) === String(number));
      return item && Number.isFinite(Number(item.amount)) ? Number(item.amount) : null;
    });
    sources.push({ type: definition.type, name: food.description, id: String(food.fdcId), value: Number(choline.amount), macro, tokenSet: tokens(food.description), form: forms(food.description) });
  }
}
const posting = new Map();
sources.forEach((source, index) => {
  for (const token of source.tokenSet) {
    if (!posting.has(token)) posting.set(token, []);
    posting.get(token).push(index);
  }
});
const species = new Set("beef pork chicken turkey duck lamb sheep veal goat fish salmon tuna cod mackerel herring shrimp prawn crab lobster crayfish mussel".split(" "));
const organ = new Set("liver kidney heart gizzard".split(" "));
const cut = new Set("breast wing thigh drumstick leg neck shoulder ribs shank sirloin brisket tenderloin".split(" "));
const identify = set => {
  const all = [...set];
  return { species: all.find(token => species.has(token)) || null, organ: all.find(token => organ.has(token)) || null, cut: all.find(token => cut.has(token)) || null };
};

const candidates = [];
for (let index = 0; index < db.length; index++) {
  const food = db[index], existing = audit.records[index].choline;
  if (/^USDA (FNDDS|Foundation) exact name$/.test(existing.method)) continue;
  const targetName = food.name_en || food.name;
  const targetTokens = tokens(targetName);
  if (!targetTokens.size) continue;
  const rarest = [...targetTokens].sort((a, b) => (posting.get(a)?.length || 0) - (posting.get(b)?.length || 0))[0];
  const targetForm = forms(targetName); targetForm.text = targetName;
  const targetId = identify(targetTokens);
  let best = null;
  for (const sourceIndex of posting.get(rarest) || []) {
    const source = sources[sourceIndex];
    if (targetTokens.size > source.tokenSet.size || [...targetTokens].some(token => !source.tokenSet.has(token))) continue;
    const sourceId = identify(source.tokenSet);
    if ((targetId.species && sourceId.species && targetId.species !== sourceId.species) || (targetId.organ && sourceId.organ && targetId.organ !== sourceId.organ) || (targetId.cut && sourceId.cut && targetId.cut !== sourceId.cut)) continue;
    const targetCore = targetTokens, extraCore = [...source.tokenSet].filter(token => !targetCore.has(token));
    if (extraCore.length) continue;
    const sourceForm = { ...source.form, text: source.name };
    if (incompatible(targetForm, sourceForm)) continue;
    const macro = macroScore(food, source);
    if (macro < 0.72 || source.value === 0 && food.nutrients["Choline (mg)"] > 0) continue;
    const dice = 2 * targetTokens.size / (targetTokens.size + source.tokenSet.size);
    const score = 0.78 * dice + 0.22 * macro;
    if (score < 0.78) continue;
    if (!best || score > best.score) best = { index, food: food.name, name_en: food.name_en, currentValue: food.nutrients["Choline (mg)"], currentMethod: existing.method, currentConfidence: existing.confidence, currentSource: existing.sourceName || null, sourceName: source.name, sourceId: source.id, sourceType: source.type, value: Number(source.value.toFixed(1)), nameScore: Number(dice.toFixed(3)), macroScore: Number(macro.toFixed(3)), score: Number(score.toFixed(3)) };
  }
  if (best && best.currentValue !== best.value) candidates.push(best);
}
candidates.sort((a, b) => b.score - a.score);
console.log(JSON.stringify({
  sourceCount: sources.length,
  candidateCount: candidates.length,
  candidateCountsByCurrentMethod: candidates.reduce((counts, item) => { counts[item.currentMethod] = (counts[item.currentMethod] || 0) + 1; return counts; }, {}),
  candidates
}, null, 2));
