import fs from "node:fs";

const DB_PATH = "database.json";
const AUDIT_PATH = "Daten/Cholin_Molybdaen_Quellen_20260925.json";
const CHOLINE = "Choline (mg)";
const MOLYBDENUM = "Molybdenum (\u00B5g)";
const CHOLINE_DATASET = "USDA Database for the Choline Content of Common Foods, Release 2 (2008)";
const FOUNDATION_DATASET = "USDA FoodData Central Foundation Foods April 2026";
const SR_DATASET = "USDA FoodData Central SR Legacy, April 2018";
const CHOLINE_PDF = "https://www.ars.usda.gov/ARSUserFiles/80400525/Data/Choline/Choln02.pdf";
const FOUNDATION_FOOD_URL = id => "https://fdc.nal.usda.gov/food-details/" + id + "/nutrients?type=Foundation%20Foods";
const SR_FOOD_URL = id => "https://fdc.nal.usda.gov/food-details/" + id + "/nutrients?type=SR%20Legacy";

const cholinePlan = [
  { index: 144, name: "Cocoa, drinking chocolate (with milk)", old: 3.5, value: 15.6, method: "USDA close food match", confidence: "medium-high", dataset: SR_DATASET, sourceName: "Milk, chocolate beverage, hot cocoa, homemade", sourceId: "171277", sourceUrl: SR_FOOD_URL("171277"), note: "USDA SR Legacy hot cocoa made with milk is a close prepared-form and macro-profile match. Its measured total choline is 15.6 mg/100 g; the target recipe may vary." },
  { index: 1086, name: "Cola drink caffeine-free, with sweeteners", old: 3.5, value: 0, method: "USDA compatible food estimate", confidence: "medium-high", dataset: SR_DATASET, sourceName: "Beverages, ZEVIA, cola, caffeine free", sourceId: "174826", sourceUrl: SR_FOOD_URL("174826"), note: "The USDA record for a caffeine-free, noncalorically sweetened cola reports 0 mg choline. The target has the same caffeine-free, zero-calorie drink form; brand formulas can differ." },
  { index: 218, name: "Milk, entrahmte 0, 1%", old: 10.8, value: 18.2, method: "USDA Foundation Foods compatible food estimate", confidence: "medium-high", dataset: FOUNDATION_DATASET, sourceName: "Milk, nonfat, fluid, with added vitamin A and vitamin D", sourceId: "746776", sourceUrl: FOUNDATION_FOOD_URL("746776"), sourceAverage: 18.2, sourceMedian: 18.3, minimum: 16, maximum: 20.3, dataPoints: 6, note: "Analytical nonfat fluid-milk values are a close match to the target's 0.1% milk. Choline is not materially affected by the lactose-free or fat-removal process; USDA mean 18.2 mg/100 g used." },
  { index: 564, name: "Almonds, roasted without fat", old: 52.1, value: 60.8, method: "USDA Foundation Foods compatible food estimate", confidence: "medium", dataset: FOUNDATION_DATASET, sourceName: "Nuts, almonds, dry roasted, with salt added", sourceId: "323294", sourceUrl: FOUNDATION_FOOD_URL("323294"), sourceAverage: 60.8, sourceMedian: 60.8, dataPoints: 1, note: "Dry-roasted almonds are a close form match; the USDA sample is salted while the target is unsalted. One analytical sample, so product variation remains." },
  { index: 707, name: "Milk low-fat, 1, 5 % fat, lactose-free, pasteurized", old: 0.9, value: 17.8, method: "USDA Foundation Foods interpolated milk-form estimate", confidence: "medium", dataset: FOUNDATION_DATASET, sourceName: "Milk, lowfat 1% and reduced fat 2%, fluid", sourceIds: ["746772", "746778"], sourceUrls: [FOUNDATION_FOOD_URL("746772"), FOUNDATION_FOOD_URL("746778")], sourceAverages: [17.4, 18.2], note: "For 1.5% lactose-free milk, midpoint of USDA analytical mean values for 1% and 2% milk was used. Lactose removal does not remove choline." },
  { index: 713, name: "H-milk low-fat, 1, 5 % fat, lactose-free, UHT-treated", old: 15.2, value: 17.8, method: "USDA Foundation Foods interpolated milk-form estimate", confidence: "medium", dataset: FOUNDATION_DATASET, sourceName: "Milk, lowfat 1% and reduced fat 2%, fluid", sourceIds: ["746772", "746778"], sourceUrls: [FOUNDATION_FOOD_URL("746772"), FOUNDATION_FOOD_URL("746778")], sourceAverages: [17.4, 18.2], note: "For 1.5% lactose-free UHT milk, midpoint of USDA analytical mean values for 1% and 2% milk was used. Heat treatment and lactose removal are not expected to materially alter total choline." },
  { index: 714, name: "H-whole milk 3, 5 % fat, lactose-free, UHT-treated", old: 0.9, value: 17.8, method: "USDA Foundation Foods compatible food estimate", confidence: "medium-high", dataset: FOUNDATION_DATASET, sourceName: "Milk, whole, 3.25% milkfat, with added vitamin D", sourceId: "746782", sourceUrl: FOUNDATION_FOOD_URL("746782"), sourceAverage: 17.8, sourceMedian: 17.8, minimum: 16.5, maximum: 19, dataPoints: 6, note: "USDA analytical whole-milk values are a close match to 3.5% lactose-free UHT milk. Choline is retained when lactose is split; USDA mean 17.8 mg/100 g used." },
  { index: 858, name: "Milk skimmed, at most 0, 1 % fat, lactose-free, pasteurized", old: 0.9, value: 18.2, method: "USDA Foundation Foods compatible food estimate", confidence: "medium-high", dataset: FOUNDATION_DATASET, sourceName: "Milk, nonfat, fluid, with added vitamin A and vitamin D", sourceId: "746776", sourceUrl: FOUNDATION_FOOD_URL("746776"), sourceAverage: 18.2, sourceMedian: 18.3, minimum: 16, maximum: 20.3, dataPoints: 6, note: "Analytical nonfat fluid milk closely matches the target. Lactose removal does not remove choline; USDA mean 18.2 mg/100 g used." },
  { index: 1032, name: "H-milk skimmed, at most 0, 5 % fat, lactose-free, UHT-treated", old: 0.9, value: 18.2, method: "USDA Foundation Foods compatible food estimate", confidence: "medium-high", dataset: FOUNDATION_DATASET, sourceName: "Milk, nonfat, fluid, with added vitamin A and vitamin D", sourceId: "746776", sourceUrl: FOUNDATION_FOOD_URL("746776"), sourceAverage: 18.2, sourceMedian: 18.3, minimum: 16, maximum: 20.3, dataPoints: 6, note: "Analytical nonfat fluid milk closely matches the target. Lactose removal and UHT treatment do not materially alter total choline; USDA mean 18.2 mg/100 g used." },
  { index: 326, name: "Soy drink / Sojamilch", old: 15.4, value: 24, method: "USDA Choline Release 2 compatible food estimate", confidence: "medium-high", dataset: CHOLINE_DATASET, sourceName: "Soy milk, fluid", sourceId: "16120", sourceUrl: CHOLINE_PDF, dataPoints: 1, note: "USDA Release 2 reports 24 mg total choline/100 g for fluid soy milk, matching the target beverage form." },
  { index: 555, name: "Soy drink, unsweetened", old: 0, value: 24, method: "USDA Choline Release 2 compatible food estimate", confidence: "medium", dataset: CHOLINE_DATASET, sourceName: "Soy milk, fluid", sourceId: "16120", sourceUrl: CHOLINE_PDF, dataPoints: 1, note: "USDA Release 2 reports 24 mg total choline/100 g for fluid soy milk. The target is unsweetened; formulation and solids can vary by product." },
  { index: 556, name: "Soy drink, unsweetened, fortified", old: 0, value: 24, method: "USDA Choline Release 2 compatible food estimate", confidence: "medium", dataset: CHOLINE_DATASET, sourceName: "Soy milk, fluid", sourceId: "16120", sourceUrl: CHOLINE_PDF, dataPoints: 1, note: "USDA Release 2 reports 24 mg total choline/100 g for fluid soy milk. Fortification does not add choline; product solids may vary." },
  { index: 349, name: "Plain tofu", old: 57, value: 28, method: "USDA Choline Release 2 compatible food estimate", confidence: "medium-high", dataset: CHOLINE_DATASET, sourceName: "Tofu, firm, prepared with calcium sulfate and magnesium chloride (nigari)", sourceId: "16126", sourceUrl: CHOLINE_PDF, dataPoints: 1, note: "USDA Release 2 reports 28 mg total choline/100 g for firm tofu, a close match to plain firm tofu." },
  { index: 497, name: "Steamed tofu (soybean)", old: 57, value: 28, method: "USDA Choline Release 2 compatible food estimate", confidence: "medium", dataset: CHOLINE_DATASET, sourceName: "Tofu, firm, prepared with calcium sulfate and magnesium chloride (nigari)", sourceId: "16126", sourceUrl: CHOLINE_PDF, dataPoints: 1, note: "Firm tofu is the closest direct USDA source for steamed tofu. Preparation and water loss can shift the value; 28 mg/100 g used as a compatible estimate." },
  { index: 560, name: "Silken tofu", old: 57, value: 27, method: "USDA Choline Release 2 exact food-form match", confidence: "medium-high", dataset: CHOLINE_DATASET, sourceName: "Tofu, soft, prepared with calcium sulfate and magnesium chloride (nigari)", sourceId: "16127", sourceUrl: CHOLINE_PDF, dataPoints: 1, note: "USDA Release 2 reports 27 mg total choline/100 g for soft tofu, matching silken tofu's soft form." },
  { index: 379, name: "Wheat flour Type 405", old: 18.7, value: 10, method: "USDA Choline Release 2 compatible food estimate", confidence: "medium", dataset: CHOLINE_DATASET, sourceName: "Wheat flour, white, all purpose, enriched, bleached", sourceId: "20081", sourceUrl: CHOLINE_PDF, dataPoints: 2, note: "USDA Release 2 reports 10 mg total choline/100 g for white all-purpose flour, a close match to refined Type 405 flour. Enrichment and milling-grade differences remain." },
  { index: 519, name: "Wheat flour Type 550", old: 18.7, value: 10, method: "USDA Choline Release 2 compatible food estimate", confidence: "medium", dataset: CHOLINE_DATASET, sourceName: "Wheat flour, white, all purpose, enriched, bleached", sourceId: "20081", sourceUrl: CHOLINE_PDF, dataPoints: 2, note: "USDA Release 2 reports 10 mg total choline/100 g for white all-purpose flour, a close match to refined Type 550 flour. Enrichment and milling-grade differences remain." }
];

const molybdenumPlan = [
  { index: 108, name: "Oats (dry)", old: 4.2, value: 165, sourceId: "2346396", sourceName: "Oats, whole grain, rolled, old fashioned", sourceAverage: 160, median: 165, minimum: 90, maximum: 216, dataPoints: 8, confidence: "medium", note: "USDA Foundation Foods has eight analytical values for dry rolled oats. Median 165 µg/100 g used; the target is generic dry oats." },
  { index: 109, name: "Oats, instant", old: 3.4, value: 165, sourceId: "2346396", sourceName: "Oats, whole grain, rolled, old fashioned", sourceAverage: 160, median: 165, minimum: 90, maximum: 216, dataPoints: 8, confidence: "medium", note: "Dry rolled oats are a compatible source for instant oats; the source range is 90-216 µg/100 g across eight analytical values. Median used." },
  { index: 110, name: "Oats, kernig (Discounter)", old: 26, value: 165, sourceId: "2346396", sourceName: "Oats, whole grain, rolled, old fashioned", sourceAverage: 160, median: 165, minimum: 90, maximum: 216, dataPoints: 8, confidence: "medium-high", note: "Old-fashioned rolled oats match the target's coarse rolled oats. Median 165 µg/100 g from eight analytical values used." },
  { index: 273, name: "Rice, wholegrain (dry)", old: 10, value: 60.8, sourceId: "2512380", sourceName: "Rice, brown, long grain, unenriched, raw", sourceAverage: 63.9, median: 60.8, minimum: 45.2, maximum: 89.1, dataPoints: 8, confidence: "medium-high", note: "Raw brown long-grain rice is a direct dry-form match. Median 60.8 µg/100 g from eight analytical values used." },
  { index: 274, name: "Rice, white (dry)", old: 30, value: 56, sourceId: "2512381", sourceName: "Rice, white, long grain, unenriched, raw", sourceAverage: 64.2, median: 56, minimum: 51, maximum: 113, dataPoints: 8, confidence: "medium", note: "Raw white long-grain rice is a compatible dry-form match; target grain length is unspecified. Median 56 µg/100 g from eight analytical values used." },
  { index: 308, name: "Black beans (dry)", old: 70, value: 819, sourceId: "747444", sourceName: "Beans, Dry, Black (0% moisture)", sourceAverage: 920, median: 972, minimum: 185, maximum: 1790, dataPoints: 126, confidence: "medium-low", dryMatterFactor: 0.89, moisturePercent: 11, moistureSourceId: "173734", note: "USDA Foundation Foods reports black beans on a 0%-moisture basis. Adjusted its mean 920 µg/100 g by the matching SR Legacy black-bean water content of 11.0 g/100 g (factor 0.89), giving 819 µg/100 g as sold. The 126-sample range is wide (185-1,790), so soil and crop variation remain substantial." },
  { index: 326, name: "Soy drink / Sojamilch", old: 19, value: 37, sourceId: "1999630", sourceName: "Soy milk, unsweetened, plain, shelf stable", sourceAverage: 58.4, median: 37, minimum: 24.6, maximum: 222, dataPoints: 8, confidence: "medium", note: "Unsweetened plain soy milk is a compatible source for the target beverage. The eight-point range is skewed, so the median 37 µg/100 g is used instead of the mean." },
  { index: 372, name: "Walnuts", old: 26, value: 20.6, sourceId: "2346394", sourceName: "Nuts, walnuts, English, halves, raw", sourceAverage: 21, median: 20.6, minimum: 8.92, maximum: 35.2, dataPoints: 8, confidence: "medium-high", note: "Raw English walnuts match the target's unprepared walnut form. Median 20.6 µg/100 g from eight analytical values used." },
  { index: 379, name: "Wheat flour Type 405", old: 3.4, value: 30.4, sourceId: "790018", sourceName: "Flour, wheat, all-purpose, unenriched, unbleached", sourceAverage: 42.6, median: 30.4, minimum: 23, maximum: 89.8, dataPoints: 6, confidence: "medium", note: "Unenriched, unbleached all-purpose wheat flour is a close match to refined German Type 405 flour. Median 30.4 µg/100 g from six analytical values used." },
  { index: 519, name: "Wheat flour Type 550", old: 3.4, value: 30.4, sourceId: "790018", sourceName: "Flour, wheat, all-purpose, unenriched, unbleached", sourceAverage: 42.6, median: 30.4, minimum: 23, maximum: 89.8, dataPoints: 6, confidence: "medium", note: "Unenriched, unbleached all-purpose wheat flour is a close match to refined German Type 550 flour. Median 30.4 µg/100 g from six analytical values used." },
  { index: 514, name: "Corn flour", old: 3.4, value: 14.8, sourceId: "790276", sourceName: "Flour, corn, yellow, fine meal, enriched", sourceAverage: 16.4, median: 14.8, minimum: 10.6, maximum: 27.1, dataPoints: 5, confidence: "medium", note: "Fine yellow corn meal is a compatible maize-flour source. Median 14.8 µg/100 g from five analytical values used; milling and enrichment can differ." },
  { index: 102, name: "Cucumber (raw)", old: 2.8, value: 3.2, sourceId: "2346406", sourceName: "Cucumber, with peel, raw", sourceAverage: 3.72, median: 3.16, minimum: 0, maximum: 8.88, dataPoints: 8, confidence: "medium-high", note: "Raw cucumber with peel is a close form match. Median 3.16 µg/100 g from eight analytical values rounded to 3.2." },
  { index: 662, name: "Cucumber, raw", old: 4, value: 3.2, sourceId: "2346406", sourceName: "Cucumber, with peel, raw", sourceAverage: 3.72, median: 3.16, minimum: 0, maximum: 8.88, dataPoints: 8, confidence: "medium-high", note: "Raw cucumber with peel is a close form match. Median 3.16 µg/100 g from eight analytical values rounded to 3.2." }
];

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
if (!Array.isArray(db) || db.length !== 1516 || audit.records.length !== db.length) {
  throw new Error("Unexpected database/audit grain");
}

const sourceEntries = [
  { name: CHOLINE_DATASET, url: "https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/choline/", dataUrl: CHOLINE_PDF, nutrient: "Total choline, mg/100 g", note: "Release 2 reports total choline as the sum of choline-contributing metabolites; record NDB numbers are retained for each match." },
  { name: FOUNDATION_DATASET, url: "https://fdc.nal.usda.gov/download-datasets/", nutrient: "Choline, mg/100 g", note: "Foundation Foods analytical choline results; detail records, sample counts, and ranges are retained where available." }
];
for (const entry of sourceEntries) {
  if (!(audit.sources || []).some(source => source.name === entry.name && source.nutrient === entry.nutrient)) {
    audit.sources = [...(audit.sources || []), entry];
  }
}

const beforeOtherDb = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[CHOLINE];
  delete copy.nutrients[MOLYBDENUM];
  return copy;
}));
const beforeOtherAudit = JSON.stringify(audit.records.map(record => {
  const copy = structuredClone(record);
  delete copy.valuesPer100g[CHOLINE];
  delete copy.valuesPer100g[MOLYBDENUM];
  delete copy.choline;
  delete copy.molybdenum;
  return copy;
}));

const corrections = [];
function apply(item, nutrient, nutrientMeta) {
  const food = db[item.index];
  const record = audit.records[item.index];
  const current = Number(food?.nutrients?.[nutrient]);
  const auditCurrent = Number(record?.valuesPer100g?.[nutrient]);
  if (!food || !record || food.name_en !== item.name || current !== item.old || auditCurrent !== item.old) {
    throw new Error("Unexpected previous value or identity at row " + item.index + ": " + food?.name + " " + current + " / " + auditCurrent);
  }

  const previous = record[nutrientMeta.auditKey];
  food.nutrients[nutrient] = item.value;
  record.valuesPer100g[nutrient] = item.value;
  record[nutrientMeta.auditKey] = {
    value: item.value,
    method: item.method,
    confidence: item.confidence,
    sourceName: item.sourceName,
    sourceId: item.sourceId,
    sourceIds: item.sourceIds,
    sourceDataset: item.dataset || FOUNDATION_DATASET,
    sourceUrl: item.sourceUrl,
    sourceUrls: item.sourceUrls,
    sourceAverage: item.sourceAverage,
    sourceAverages: item.sourceAverages,
    minimum: item.minimum,
    maximum: item.maximum,
    median: item.median,
    dataPoints: item.dataPoints,
    nutrientNumber: nutrientMeta.number,
    nutrientName: nutrientMeta.name,
    nutrientUnit: nutrientMeta.unit,
    derivation: nutrientMeta.derivation,
    dryMatterFactor: item.dryMatterFactor,
    moisturePercent: item.moisturePercent,
    moistureSourceId: item.moistureSourceId,
    note: item.note
  };
  for (const key of Object.keys(record[nutrientMeta.auditKey])) {
    if (record[nutrientMeta.auditKey][key] === undefined) delete record[nutrientMeta.auditKey][key];
  }
  corrections.push({
    databaseIndex: item.index,
    food: food.name,
    name_en: food.name_en,
    nutrient,
    oldValue: current,
    newValue: item.value,
    previousMethod: previous.method,
    previousConfidence: previous.confidence,
    previousSource: previous.sourceName || null,
    verifiedSource: item.sourceName,
    sourceId: item.sourceId || null,
    sourceIds: item.sourceIds,
    sourceDataset: item.dataset || FOUNDATION_DATASET,
    sourceUrl: item.sourceUrl,
    reason: item.note
  });
}

for (const item of cholinePlan) {
  apply(item, CHOLINE, { auditKey: "choline", number: "421", name: "Choline, total", unit: "mg", derivation: item.dataset === FOUNDATION_DATASET ? "Analytical" : "USDA Choline Release 2" });
}
for (const item of molybdenumPlan) {
  apply(item, MOLYBDENUM, { auditKey: "molybdenum", number: "316", name: "Molybdenum, Mo", unit: "\u00B5g", derivation: "Analytical" });
}

const afterOtherDb = JSON.stringify(db.map(food => {
  const copy = structuredClone(food);
  delete copy.nutrients[CHOLINE];
  delete copy.nutrients[MOLYBDENUM];
  return copy;
}));
const afterOtherAudit = JSON.stringify(audit.records.map(record => {
  const copy = structuredClone(record);
  delete copy.valuesPer100g[CHOLINE];
  delete copy.valuesPer100g[MOLYBDENUM];
  delete copy.choline;
  delete copy.molybdenum;
  return copy;
}));
if (beforeOtherDb !== afterOtherDb || beforeOtherAudit !== afterOtherAudit) {
  throw new Error("Unexpected edits outside Choline and Molybdenum records");
}
for (let index = 0; index < db.length; index++) {
  for (const nutrient of [CHOLINE, MOLYBDENUM]) {
    const value = db[index].nutrients[nutrient];
    if (!Number.isFinite(value) || value < 0 || Number(audit.records[index].valuesPer100g[nutrient]) !== value) {
      throw new Error("Invalid or misaligned " + nutrient + " value at row " + index);
    }
  }
}

audit.summary.choline = audit.records.reduce((counts, row) => {
  const method = row.choline.method;
  counts[method] = (counts[method] || 0) + 1;
  return counts;
}, {});
audit.summary.molybdenum = audit.records.reduce((counts, row) => {
  const method = row.molybdenum.method;
  counts[method] = (counts[method] || 0) + 1;
  return counts;
}, {});
audit.summary.fastVerifiedBatch015 = {
  sourceCheckedCorrections: corrections.length,
  cholineCorrections: cholinePlan.length,
  molybdenumCorrections: molybdenumPlan.length,
  numericChanges: corrections.filter(item => item.oldValue !== item.newValue).length
};
audit.correctionLog = [...(audit.correctionLog || []), ...corrections];
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n", "utf8");
fs.writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ summary: audit.summary.fastVerifiedBatch015, corrections }, null, 2));
