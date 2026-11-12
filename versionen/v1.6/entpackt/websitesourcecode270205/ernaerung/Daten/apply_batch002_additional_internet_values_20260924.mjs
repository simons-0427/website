import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.join(here, '..', 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const checkedOn = '2026-09-24';
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const fields = {
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
};

const sources = {
  BLS_4_0_Oats: {
    url: 'https://blsdb.de/food?foodId=37914&token=95MI-BAK8-R69M-VRF1-TKVQ-XGLT-JK9N-DHW9',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Hafer Flocken (C133000), foodId 37914.',
    valuesPer100g: { totalFat: 6.65, omega3: 0.112, omega6: 2.57 },
  },
  BLS_4_0_OatDrink: {
    url: 'https://blsdb.de/food?foodId=38136&token=0T4E-8C3Z-Z0D6-O8W7-H3WF-KIIW-DMTE-3NR2',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Haferdrink ungesüßt (C660000), foodId 38136.',
    valuesPer100g: { totalFat: 1.01, omega3: 0.0069, omega6: 0.4167, alcohol: 0 },
  },
  BLS_4_0_NutritionalYeast: {
    url: 'https://blsdb.de/food?foodId=38572&token=9NPS-75ZD-R8AU-S2P6-QOXP-C794-3L86-IGI1',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Hefe Flocken/Nährhefe (K762400), foodId 38572.',
    valuesPer100g: { totalFat: 4.5, omega3: 0, omega6: 0 },
    limitation: 'BLS omega-family totals are formula-calculated. The target is enriched nutritional yeast and the BLS row is the closest plain nutritional-yeast class, not an exact brand match.',
  },
  BLS_4_0_CoffeeMilk: {
    url: 'https://blsdb.de/food?foodId=40004&token=VNK9-B4WA-JUKY-AJFZ-9T8L-C1AW-DULV-9COD',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Kaffee (Getränk) halb und halb, mit Milch 3,5 % Fett (N491000), foodId 40004.',
    valuesPer100g: { totalFat: 1.74, omega3: 0.011526, omega6: 0.023, alcohol: 0 },
  },
  BLS_4_0_CocoaMilk: {
    url: 'https://blsdb.de/food?foodId=40998&token=50YD-QP4H-0M3N-7STW-NZ3F-3A6X-14DW-O9IE',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Milchmischgetränk 1,5 % Fett, mit Kakao/Schokolade, gesüßt (M206200), foodId 40998.',
    valuesPer100g: { totalFat: 1.6, omega3: 0.009, omega6: 0.0013 },
  },
  BLS_4_0_Cheddar: {
    url: 'https://blsdb.de/food?foodId=38618&token=IL7D-MHP0-ML0Q-8E2Q-NM4A-B0OQ-MLQF-3SSS',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Chester (Cheddar) mind. 50 % Fett i.Tr. (M303700), foodId 38618.',
    valuesPer100g: { totalFat: 32.2, omega3: 0.251, omega6: 0.493 },
  },
  BLS_4_0_Emmentaler: {
    url: 'https://blsdb.de/food?foodId=38275',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Emmentaler mind. 45 % Fett i.Tr. (M304600), foodId 38275.',
    valuesPer100g: { totalFat: 29.15, omega3: 0.179, omega6: 0.4746 },
  },
  BLS_4_0_CodLiverOil: {
    url: 'https://blsdb.de/food?foodId=38439&token=FC11-U4B9-663M-TNV7-C5FX-0A30-3WHY-579S',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Fischleberöl/Lebertran (Q730000), foodId 38439.',
    valuesPer100g: { totalFat: 100, omega3: 29.219, omega6: 4.393 },
  },
  BLS_4_0_Liverwurst: {
    url: 'https://blsdb.de/food?foodId=38427&token=U7X5-M9DL-UYFS-FO3Q-42KF-6JGF-8A3U-L87F',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Delikatess Leberwurst/Feine Leberwurst/Gutsleberwurst (W310000), foodId 38427.',
    valuesPer100g: { totalFat: 33.15, omega3: 0.242, omega6: 3.307, alcohol: 0 },
  },
  BLS_4_0_Lyoner: {
    url: 'https://blsdb.de/food?foodId=38424&token=ZQMT-5UKQ-J1K5-8NLQ-R0YG-3GTE-EDBN-MFTZ',
    citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Lyoner/Lyoner Wurst (W231100), foodId 38424.',
    valuesPer100g: { totalFat: 25.5, omega3: 0.2299, omega6: 2.623 },
  },
  USDA_SR28_CheddarTrans: {
    url: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg01.pdf',
    citation: 'USDA Agricultural Research Service, National Nutrient Database for Standard Reference, Release 28, NDB 01009 Cheese, cheddar; total trans fatty acids 0.917 g per 100 g.',
    valuesPer100g: { totalFat: 33.14, trans: 0.917 },
  },
  USDA_SR_Legacy_Kefir: {
    url: 'https://fdc.nal.usda.gov/food-details/170904/nutrients?type=SR%20Legacy',
    citation: 'USDA Agricultural Research Service, FoodData Central SR Legacy, FDC 170904, Kefir, lowfat, plain, LIFEWAY.',
    valuesPer100g: { totalFat: 1.02, omega3: 0.007, omega6: 0.033, trans: 0.037, alcohol: 0 },
    components: { omega3: 'ALA 0.006 + DPA 0.001 g', omega6: 'linoleic 0.029 + 20:3 n-6 0.002 + arachidonic 0.002 g', trans: 'total trans fatty acids 0.037 g' },
  },
  USDA_SR_Legacy_Catsup: {
    url: 'https://fdc.nal.usda.gov/food-details/168556/nutrients?type=SR%20Legacy',
    citation: 'USDA Agricultural Research Service, FoodData Central SR Legacy, FDC 168556 / NDB 11935, Catsup.',
    valuesPer100g: { totalFat: 0.1, omega3: 0.001, omega6: 0.039, trans: 0, alcohol: 0 },
  },
  USDA_SR_Legacy_Jackfruit: {
    url: 'https://fdc.nal.usda.gov/food-details/174687/nutrients?type=SR%20Legacy',
    citation: 'USDA Agricultural Research Service, FoodData Central SR Legacy, FDC 174687, Jackfruit, raw.',
    valuesPer100g: { totalFat: 0.64, omega3: 0.08, omega6: 0.02, trans: 0 },
    limitation: 'Raw ripe jackfruit is a close species match but differs from drained canned unripe jackfruit; values are scaled by total fat and marked low confidence.',
  },
  FDA_TransFat_Overview: {
    url: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
    citation: 'U.S. Food and Drug Administration, Trans Fat overview; used only to support identity-based zero for plain, unseasoned jackfruit in water with no ruminant or hydrogenated-fat ingredient indicated.',
  },
};

const round6 = (value) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const scaled = (sourceValue, targetFat, sourceFat) => round6(sourceValue * targetFat / sourceFat);

const candidates = [
  { index: 111, sourceKey: 'BLS_4_0_Oats', source: 'BLS 4.0 food-class analogue', sourceName: 'Hafer Flocken (C133000)', matchMethod: 'same_plain_rolled_oats_class_scaled_by_total_fat', confidence: 'medium', sourceFat: 6.65, sourceValues: { [fields.omega3]: 0.112, [fields.omega6]: 2.57 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'BLS rolled oats are a close food-class match. Omega totals are scaled by target/source total fat (7.0/6.65); BLS reports family totals as formula-calculated values.' },
  { index: 106, sourceKey: 'BLS_4_0_OatDrink', source: 'BLS 4.0 food-class analogue', sourceName: 'Haferdrink ungesüßt (C660000)', matchMethod: 'same_unsweetened_oat_drink_class_scaled_by_total_fat', confidence: 'medium', sourceFat: 1.01, sourceValues: { [fields.omega3]: 0.0069, [fields.omega6]: 0.4167 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'The BLS unsweetened oat drink is the closest generic match. Omegas are scaled by target/source total fat (1.545/1.01), not represented as a direct ml density conversion.' },
  { index: 108, sourceKey: 'BLS_4_0_OatDrink', source: 'BLS 4.0 food-class analogue', sourceName: 'Haferdrink ungesüßt (C660000)', matchMethod: 'same_unsweetened_oat_drink_class_scaled_by_total_fat', confidence: 'medium', sourceFat: 1.01, sourceValues: { [fields.omega3]: 0.0069, [fields.omega6]: 0.4167 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'The target is an unsweetened oat drink. Omegas are scaled by target/source total fat (1.545/1.01); this does not cover the separately formulated Barista oat drink.' },
  { index: 120, sourceKey: 'BLS_4_0_NutritionalYeast', source: 'BLS 4.0 closest food-class match', sourceName: 'Hefe Flocken/Nährhefe (K762400)', matchMethod: 'same_nutritional_yeast_class_formula_totals', confidence: 'low', sourceFat: 4.5, sourceValues: { [fields.omega3]: 0, [fields.omega6]: 0 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'BLS reports 0 g for both formula-calculated omega-family totals in its plain nutritional-yeast entry. The target is fortified and is not an exact product match; this is a source-reported zero, not proof that every brand is analytically absolute-zero.' },
  { index: 135, sourceKey: 'USDA_SR_Legacy_Jackfruit', source: 'USDA SR Legacy food-class analogue', sourceName: 'Jackfruit, raw (FDC 174687)', matchMethod: 'same_species_raw_to_drained_canned_scaled_by_total_fat', confidence: 'low', sourceFat: 0.64, sourceValues: { [fields.omega3]: 0.08, [fields.omega6]: 0.02 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Raw ripe jackfruit differs from canned unripe jackfruit. Omega totals are low-confidence estimates scaled by total fat (0.2/0.64); the serving remains per 100 g drained target food.' },
  { index: 135, sourceKey: 'FDA_TransFat_Overview', source: 'FDA food-identity inference', sourceName: 'Plain jackfruit packed in water, drained', matchMethod: 'single_ingredient_fruit_without_ruminant_or_hydrogenated_fat', confidence: 'medium', sourceFat: 0.64, sourceValues: { [fields.trans]: 0 }, fieldsToApply: [fields.trans], notes: 'Assigned 0 g for plain single-ingredient fruit packed in water with no ruminant or hydrogenated-fat ingredient indicated. FDA identifies ruminant foods and partially hydrogenated oils as dietary trans-fat pathways.' },
  { index: 142, sourceKey: 'BLS_4_0_CoffeeMilk', source: 'BLS 4.0 food-class analogue', sourceName: 'Kaffee (Getränk) halb und halb, mit Milch 3,5 % Fett (N491000)', matchMethod: 'coffee_with_milk_scaled_by_total_fat', confidence: 'medium', sourceFat: 1.74, sourceValues: { [fields.omega3]: 0.011526, [fields.omega6]: 0.023 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Closest BLS coffee-with-milk entry; omega totals are scaled by target/source total fat (0.31/1.74). Target is a recipe entry, so values are estimates.' },
  { index: 145, sourceKey: 'BLS_4_0_CocoaMilk', source: 'BLS 4.0 food-class analogue', sourceName: 'Milchmischgetränk 1,5 % Fett, mit Kakao/Schokolade, gesüßt (M206200)', matchMethod: 'sweetened_cocoa_milk_drink_scaled_by_total_fat', confidence: 'medium', sourceFat: 1.6, sourceValues: { [fields.omega3]: 0.009, [fields.omega6]: 0.0013 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Closest cocoa-milk beverage class. Omegas are scaled by target/source total fat (2.2/1.6); recipe and per-ml target differences make these estimates.' },
  { index: 156, sourceKey: 'BLS_4_0_Cheddar', source: 'BLS 4.0 food-class match', sourceName: 'Chester (Cheddar) mind. 50 % Fett i.Tr. (M303700)', matchMethod: 'same_cheddar_cheese_scaled_by_total_fat', confidence: 'high', sourceFat: 32.2, sourceValues: { [fields.omega3]: 0.251, [fields.omega6]: 0.493 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Same cheddar cheese class. Omega totals are scaled by target/source total fat (33.1/32.2).' },
  { index: 156, sourceKey: 'USDA_SR28_CheddarTrans', source: 'USDA SR28 direct food match', sourceName: 'Cheese, cheddar (NDB 01009)', matchMethod: 'same_cheddar_food_trans_fat_value', confidence: 'medium', sourceFat: 33.14, sourceValues: { [fields.trans]: 0.917 }, fieldsToApply: [fields.trans], notes: 'USDA SR28 reports total trans fatty acids 0.917 g/100 g for cheddar. Applied directly to the generic cheddar target; the target is a close, not brand-specific, cheddar entry.' },
  { index: 158, sourceKey: 'BLS_4_0_Emmentaler', source: 'BLS 4.0 food-class match', sourceName: 'Emmentaler mind. 45 % Fett i.Tr. (M304600)', matchMethod: 'same_emmentaler_cheese_scaled_by_total_fat', confidence: 'high', sourceFat: 29.15, sourceValues: { [fields.omega3]: 0.179, [fields.omega6]: 0.4746 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Same Emmentaler class. Omega totals are scaled by target/source total fat (29.7/29.15). Existing trans-fat value is preserved.' },
  { index: 160, sourceKey: 'USDA_SR_Legacy_Kefir', source: 'USDA SR Legacy close food match', sourceName: 'Kefir, lowfat, plain, LIFEWAY (FDC 170904)', matchMethod: 'plain_lowfat_kefir_scaled_by_target_total_fat', confidence: 'medium', sourceFat: 1.02, sourceValues: { [fields.omega3]: 0.007, [fields.omega6]: 0.033, [fields.trans]: 0.037 }, fieldsToApply: [fields.omega3, fields.omega6, fields.trans], notes: 'USDA component sums give omega-3 0.007 g and omega-6 0.033 g, with 0.013 g unassigned total-PUFA residual. Omegas and trans fat are scaled by target/source total fat (1.545/1.02); generic 1.5% kefir is not the same branded 1% sample.' },
  { index: 161, sourceKey: 'USDA_SR_Legacy_Catsup', source: 'USDA SR Legacy food-class match', sourceName: 'Catsup (FDC 168556 / NDB 11935)', matchMethod: 'catsup_100g_to_target_100ml_cross_field_ratio', confidence: 'medium', sourceFat: 0.1, sourceValues: { [fields.omega3]: 0.001, [fields.omega6]: 0.039, [fields.trans]: 0, [fields.alcohol]: 0 }, fieldsToApply: [fields.omega3, fields.omega6, fields.trans, fields.alcohol], notes: 'Target per-100-ml macros correspond to USDA catsup per-100-g values at a 1.15 ratio (for example total fat 0.1 to 0.115 g and carbohydrate 27.4 to 31.51 g). This is a cross-field-derived conversion, not a separately measured ketchup density. USDA reports 0 g trans fat and ethanol.' },
  { index: 188, sourceKey: 'BLS_4_0_CodLiverOil', source: 'BLS 4.0 direct food match', sourceName: 'Fischleberöl/Lebertran (Q730000)', matchMethod: 'same_cod_liver_oil_scaled_by_total_fat', confidence: 'medium', sourceFat: 100, sourceValues: { [fields.omega3]: 29.219, [fields.omega6]: 4.393 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Same cod liver oil class. Source and target both contain 100 g total fat per reference portion; omega values are transferred by matching total fat. Source is per 100 g and target is per 100 ml, so confidence is medium.' },
  { index: 189, sourceKey: 'BLS_4_0_Liverwurst', source: 'BLS 4.0 food-class analogue', sourceName: 'Delikatess Leberwurst/Feine Leberwurst/Gutsleberwurst (W310000)', matchMethod: 'liverwurst_scaled_by_total_fat', confidence: 'medium', sourceFat: 33.15, sourceValues: { [fields.omega3]: 0.242, [fields.omega6]: 3.307 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Closest BLS liverwurst class. Omega totals are scaled by target/source total fat (27/33.15); product recipe can vary.' },
  { index: 199, sourceKey: 'BLS_4_0_Lyoner', source: 'BLS 4.0 direct food match', sourceName: 'Lyoner/Lyoner Wurst (W231100)', matchMethod: 'same_lyoner_sausage_scaled_by_total_fat', confidence: 'high', sourceFat: 25.5, sourceValues: { [fields.omega3]: 0.2299, [fields.omega6]: 2.623 }, fieldsToApply: [fields.omega3, fields.omega6], notes: 'Same Lyoner sausage class. Omega totals are scaled by target/source total fat (25/25.5); existing alcohol value is preserved.' },
];

audit.sources = audit.sources ?? {};
for (const [key, value] of Object.entries(sources)) audit.sources[key] = value;
audit.databaseApplication = audit.databaseApplication ?? {};
audit.databaseApplication.updates = audit.databaseApplication.updates ?? [];
audit.records = audit.records ?? [];
const newUpdates = [];
const addedByTarget = new Map();
const addedByField = Object.fromEntries(Object.values(fields).map((field) => [field, 0]));

for (const item of candidates) {
  const target = database[item.index - 1];
  if (!target || target.name == null) throw new Error(`Missing target at one-based index ${item.index}`);
  const targetFat = target.nutrients['Total Fat (g)'];
  if (!Number.isFinite(targetFat)) throw new Error(`Target total fat is missing at index ${item.index}: ${target.name}`);
  const values = {};
  for (const field of item.fieldsToApply) {
    const sourceValue = item.sourceValues[field];
    const value = item.sourceKey === 'FDA_TransFat_Overview'
      ? sourceValue
      : item.sourceKey === 'USDA_SR_Legacy_Catsup' && (field === fields.trans || field === fields.alcohol)
        ? sourceValue
        : scaled(sourceValue, targetFat, item.sourceFat);
    values[field] = value;
    if (target.nutrients[field] == null) {
      target.nutrients[field] = value;
      const update = { index: item.index, name: target.name, field, value, source: item.sourceName };
      newUpdates.push(update);
      addedByField[field] += 1;
      const groupKey = `${item.index}|${item.sourceKey}`;
      const group = addedByTarget.get(groupKey) ?? { item, values: {} };
      group.values[field] = value;
      addedByTarget.set(groupKey, group);
    }
  }
}

for (const { item, values } of addedByTarget.values()) {
  const target = database[item.index - 1];
  audit.records.push({
    databaseIndex: item.index,
    databaseName: target.name,
    source: item.source,
    sourceName: item.sourceName,
    sourceUrl: sources[item.sourceKey].url,
    matchMethod: item.matchMethod,
    confidence: item.confidence,
    valueBasis: target.unit === 'ml' ? 'g per 100 ml database reference amount; source is per 100 g unless stated otherwise' : 'g per 100 g edible food',
    sourceValuesPer100g: {
      totalFat: item.sourceFat,
      ...item.sourceValues,
    },
    targetTotalFatPer100gOr100ml: target.nutrients['Total Fat (g)'],
    calculation: item.notes,
    values,
    checkedOn,
  });
}

audit.databaseApplication.updates.push(...newUpdates);
audit.databaseApplication.appliedCount = audit.databaseApplication.updates.length;
audit.databaseApplication.appliedByField = Object.fromEntries(
  Object.values(fields).map((field) => [field, audit.databaseApplication.updates.filter((item) => item.field === field).length]),
);
audit.databaseApplication.appliedOn = checkedOn;
audit.databaseApplication.appliedFrom = `${audit.databaseApplication.appliedFrom ?? ''}; additional BLS 4.0 and USDA SR Legacy research with explicit total-fat-scaled estimates, plus a documented food-identity trans-fat zero`;
audit.databaseApplication.lastBatch = {
  appliedCount: newUpdates.length,
  appliedByField: addedByField,
  alreadyPresent: [],
  missingTargets: [],
};

const batch = database.slice(audit.range.first - 1, audit.range.last);
audit.fieldCoverage = Object.fromEntries(Object.values(fields).map((field) => {
  const filled = batch.filter((food) => food.nutrients[field] != null).length;
  return [field, { filled, missing: batch.length - filled, total: batch.length }];
}));
const previousReasons = new Map((audit.uncoveredRecords ?? []).map((item) => [item.databaseIndex, item.reason]));
audit.uncoveredRecords = batch.flatMap((food, offset) => {
  const databaseIndex = audit.range.first + offset;
  const missing = Object.values(fields).filter((field) => food.nutrients[field] == null);
  return missing.length ? [{
    databaseIndex,
    databaseName: food.name,
    reason: previousReasons.get(databaseIndex) ?? `Still missing: ${missing.join(', ')}; no numeric value with adequate source support was applied in this pass.`,
  }] : [];
});
audit.status = audit.uncoveredRecords.length ? 'partial_research' : 'complete';
audit.checkedOn = checkedOn;
audit.coverageNotes.USDA_and_BLS_internet_batch_002_2026_09_24 = 'Added sourced values for oats, unsweetened oat drinks, nutritional yeast, coffee with milk, cocoa milk, cheddar, Emmentaler, kefir, ketchup, jackfruit, cod liver oil, liverwurst, and Lyoner. Closest matches and total-fat scaling are explicitly marked. Unreconciled salmon omegas and unsupported natural trans-fat values remain null.';

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ added: newUpdates.length, addedByField, fieldCoverage: audit.fieldCoverage, stillUncovered: audit.uncoveredRecords.length }, null, 2));
