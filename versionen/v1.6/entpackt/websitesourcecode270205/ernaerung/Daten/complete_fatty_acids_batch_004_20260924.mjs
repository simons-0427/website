import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(dataDir, '..');
const databasePath = path.join(rootDir, 'database.json');
const sourceAuditPath = path.join(dataDir, 'database_V2_fatty_acids_alcohol_batch_004_sources.json');
const componentAuditPath = path.join(dataDir, 'database_V2_omega3_components_batch_005.json');
const checkedOn = '2026-09-24';
const F = {
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const allFields = Object.values(F);
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, 'utf8'));
const componentAudit = JSON.parse(fs.readFileSync(componentAuditPath, 'utf8'));
const rangeStart = 301;
const rangeEnd = 400;

if (!Array.isArray(db) || db.length < rangeEnd) throw new Error('Unexpected database shape.');

const fdc = (id, name, method, confidence = 'close match') => ({
  source: 'USDA_FoodData_Central_SR_Legacy_2018',
  sourceName: name,
  sourceUrl: `https://fdc.nal.usda.gov/food-details/${id}/nutrients?type=SR%20Legacy`,
  matchMethod: 'direct_or_fat_scaled_profile',
  method,
  confidence,
});
const matvare = (url, name, method, confidence = 'close match') => ({
  source: 'Matvaretabellen_2026',
  sourceName: name,
  sourceUrl: url,
  matchMethod: 'official_food_profile_or_table',
  method,
  confidence,
});
const logical = (method, sourceUrl = 'https://fdc.nal.usda.gov/about-us/') => ({
  source: 'Food composition and product identity',
  sourceName: 'Composition-based zero',
  sourceUrl,
  matchMethod: 'logical_zero',
  method,
  confidence: 'logical zero',
});

const updates = [
  [315, F.omega3, 0.048, fdc(168147, 'Vital wheat gluten', 'USDA wheat-gluten profile; total fat is close to the database item.')],
  [315, F.omega6, 0.763, fdc(168147, 'Vital wheat gluten', 'USDA linoleic-acid value for the matching wheat-gluten profile.')],
  [324, F.omega3, 0.000729, fdc(170903, 'Plain low-fat Greek yogurt', 'Fat-scaled close dairy match; reported n-3 component scaled to database fat.')],
  [324, F.omega6, 0.005417, fdc(170903, 'Plain low-fat Greek yogurt', 'Fat-scaled sum of identified n-6 components; unclassified PUFA is not assigned.')],
  [325, F.omega3, 0.040714, fdc(170775, 'Strawberry-banana smoothie with low-fat yogurt', 'Fat-scaled fruit smoothie recipe; close match for the ready-to-drink berry smoothie.', 'estimate')],
  [325, F.omega6, 0.070714, fdc(170775, 'Strawberry-banana smoothie with low-fat yogurt', 'Fat-scaled linoleic-acid value; recipe and fruit mix differ.', 'estimate')],
  [327, F.omega3, 0.079457, fdc(172446, 'Original soy milk, unfortified', 'USDA ALA profile scaled to the database per-100-ml fat amount.')],
  [327, F.omega6, 0.618706, fdc(172446, 'Original soy milk, unfortified', 'Identified n-6 components scaled to fat; unclassified PUFA residual is excluded.')],
  [328, F.omega3, 0.099, fdc(172446, 'Original soy milk, unfortified', 'Plain soy-yogurt proxy scaled by database-to-source fat; low-confidence recipe match.', 'estimate')],
  [328, F.omega6, 0.767543, fdc(172446, 'Original soy milk, unfortified', 'Identified linoleic acid scaled by fat; low-confidence soy-yogurt proxy.', 'estimate')],
  [329, F.omega3, 0.006004, fdc(174277, 'Shoyu soy sauce', 'Soy-sauce ALA profile converted to the database per-100-ml basis by fat ratio.')],
  [329, F.omega6, 0.048439, fdc(174277, 'Shoyu soy sauce', 'Soy-sauce linoleic-acid profile converted to the database per-100-ml basis by fat ratio.')],
  [335, F.omega3, 0.019824, fdc(172182, 'Low-fat cottage cheese, 2% milkfat', 'Close fresh-curd dairy profile scaled by total fat; includes reported ALA, EPA and DPA.')],
  [335, F.omega6, 0.114515, fdc(172182, 'Low-fat cottage cheese, 2% milkfat', 'Identified n-6 fatty acids scaled by fat; conjugated linoleic acid is not counted as omega-6.')],
  [336, F.omega3, 0.054, fdc(171304, 'Plain whole-milk Greek yogurt', 'High-fat cultured-dairy profile scaled to the database fat amount.')],
  [336, F.omega6, 0.418, fdc(171304, 'Plain whole-milk Greek yogurt', 'Known linoleic acid scaled to fat; unclassified PUFA residual is not assigned.')],
  [337, F.omega3, 0.057544, fdc(169287, 'Frozen spinach, unprepared', 'Frozen spinach ALA profile scaled to database fat.')],
  [337, F.omega6, 0, fdc(169287, 'Frozen spinach, unprepared', 'The source profile reports no n-6 component at its precision.')],
  [340, F.omega3, 0.002, fdc(168482, 'Sweet potato, raw', 'Raw sweet-potato ALA profile scaled to database fat.')],
  [340, F.omega6, 0.026, fdc(168482, 'Sweet potato, raw', 'Raw sweet-potato linoleic-acid profile scaled to database fat.')],
  [355, F.omega3, 0.004, fdc(170460, 'Tomato puree, canned', 'Matching tomato-puree profile; database and source fat are nearly equal.')],
  [355, F.omega6, 0.082, fdc(170460, 'Tomato puree, canned', 'Matching tomato-puree linoleic-acid profile.')],
  [356, F.omega3, 0.001759, fdc(170458, 'Tomato juice, canned', 'ALA scaled to the database per-100-ml fat amount.')],
  [356, F.omega6, 0.007738, fdc(170458, 'Tomato juice, canned', 'Linoleic acid scaled to the database per-100-ml fat amount.')],
  [358, F.omega3, 0.01375, fdc(174683, 'Red or green grapes, raw', 'Grape ALA profile scaled by the close total-fat ratio.')],
  [358, F.omega6, 0.04625, fdc(174683, 'Red or green grapes, raw', 'Grape linoleic-acid profile scaled by the close total-fat ratio.')],
  [365, F.omega3, 0, logical('MCT carrier does not provide ALA, EPA or DHA.')],
  [365, F.omega6, 0, logical('MCT carrier does not provide omega-6 fatty acids.')],
  [367, F.omega3, 0.001833, fdc(171411, 'Soybean oil, salad or cooking', 'Low-confidence generic oil-carrier estimate, scaled to the one-drop fat amount; exact carrier is unspecified.', 'low-confidence estimate')],
  [367, F.omega6, 0.013608, fdc(171411, 'Soybean oil, salad or cooking', 'Low-confidence generic oil-carrier estimate, scaled to the one-drop fat amount; exact carrier is unspecified.', 'low-confidence estimate')],
  [370, F.omega3, 0.059727, fdc(169738, 'Whole-wheat pasta, dry', 'Whole-wheat pasta profile scaled to database fat.')],
  [370, F.omega6, 0.907849, fdc(169738, 'Whole-wheat pasta, dry', 'Identified n-6 profile scaled to database fat.')],
  [386, F.omega3, 0.075357, matvare('https://www.matvaretabellen.no/en/goat-cheese-chevre-naturell/', 'Goat cheese, chevre, Naturell', 'Close fresh goat-cheese profile scaled by total fat; source reports ALA and zero EPA/DHA.')],
  [386, F.omega6, 0.377143, matvare('https://www.matvaretabellen.no/en/goat-cheese-chevre-naturell/', 'Goat cheese, chevre, Naturell', 'Close goat-cheese profile scaled by total fat.')],
  [391, F.omega3, 0.033505, fdc(171372, 'Zwieback', 'USDA rusk ALA profile scaled to database fat.')],
  [391, F.omega6, 1.036701, fdc(171372, 'Zwieback', 'USDA rusk identified n-6 profile scaled to database fat.')],
  [397, F.omega3, 0.04, fdc(170720, "McDonald's Big Mac", 'Total n-3 estimated from the documented ALA, EPA and DHA recipe components.', 'estimate')],
  [397, F.omega6, 0.18848, fdc(170720, "McDonald's Big Mac", 'Estimated from fat-scaled total PUFA less recipe n-3; residual assignment to n-6 is approximate.', 'low-confidence estimate')],
  [398, F.omega3, 0.05, matvare('https://www.matvaretabellen.no/en/pasta-bolognese/', 'Pasta bolognese, cooked dish', 'Recipe estimate aligned to the existing ALA/EPA/DHA values; sauce and pasta recipe differ.', 'estimate')],
  [398, F.omega6, 1.81, {
    source: 'CoFID_2021_via_Nutridex',
    sourceName: 'Bolognese sauce (with meat), homemade, CoFID 19-476',
    sourceUrl: 'https://www.nutridex.org.uk/foods/90sr3k9/bolognese-sauce-with-meat-homemade',
    matchMethod: 'same_named_recipe_total_PUFA_residual',
    method: 'Estimated as CoFID total PUFA 1.86 g minus the existing 0.05 g recipe n-3 estimate; other PUFA species may remain.',
    confidence: 'low-confidence estimate',
  }],

  [301, F.trans, 0, matvare('https://www.matvaretabellen.no/en/anchovies-canned/', 'Anchovies, canned', 'Official close canned-anchovy profile reports 0 g trans fat.')],
  [302, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Canned sardines in oil', 'Official food-composition table reports 0 g for the matching canned fish class.')],
  [304, F.trans, 0.207, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Milk, 3.5% fat, ruminant dairy comparator', 'Estimated from 0.1 g trans fat per 3.5 g milk fat, scaled to sheep milk fat per 100 ml.', 'estimate')],
  [305, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Cooked ham', 'Closest cooked-ham entry reports 0 g trans fat.')],
  [308, F.trans, 0.011, fdc(174196, 'Raw flatfish, flounder and sole', 'Close raw flatfish profile; source reports 0.011 g trans fat.')],
  [311, F.trans, 0, matvare('https://www.matvaretabellen.no/en/pork-minced-meat-9-fat-raw/', 'Raw minced pork, 9% fat', 'Closest raw pork-mince profile reports 0 g at table precision.')],
  [312, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Raw pork neck', 'Official raw-pork profile reports 0 g at table precision.')],
  [315, F.trans, 0, logical('Plain wheat protein contains no hydrogenated oil or other trans-fat source.')],
  [319, F.trans, 0.02027, fdc(174924, 'Commercial white bread and soft bread crumbs', 'White-bread/crumb profile scaled by total fat.')],
  [322, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Sesame seed', 'Official plant-food profile reports 0 g at table precision.')],
  [323, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Sesame oil', 'Non-hydrogenated seed oil profile reports 0 g.')],
  [324, F.trans, 0.00625, fdc(170903, 'Plain low-fat Greek yogurt', 'Close low-fat cultured-dairy profile scaled by total fat.')],
  [325, F.trans, 0, fdc(170775, 'Strawberry-banana smoothie with low-fat yogurt', 'Close smoothie profile reports 0 g.')],
  [327, F.trans, 0, fdc(172446, 'Original soy milk, unfortified', 'Matching soy-drink profile reports 0 g.')],
  [328, F.trans, 0, fdc(175227, 'Plain soy yogurt', 'Plain soy-yogurt profile reports 0 g.')],
  [332, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Sunflower oil', 'Non-hydrogenated plant oil profile reports 0 g.')],
  [335, F.trans, 0.140845, matvare('https://www.matvaretabellen.no/en/quark-7-fat/', 'Quark, 7% fat', 'Official quark profile: 0.2 g trans fat at 7.1 g total fat, scaled to database fat.')],
  [336, F.trans, 0.28169, matvare('https://www.matvaretabellen.no/en/quark-7-fat/', 'Quark, 7% fat', 'Official quark profile: 0.2 g trans fat at 7.1 g total fat, scaled to database fat.')],
  [337, F.trans, 0, fdc(169287, 'Frozen spinach, unprepared', 'Matching frozen-spinach profile reports 0 g.')],
  [340, F.trans, 0, fdc(168482, 'Sweet potato, raw', 'Matching raw-plant profile reports 0 g.')],
  [341, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Sesame paste or tahini', 'Sesame-seed paste has no hydrogenated-fat ingredient; zero at reporting precision.')],
  [346, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Canned tuna in oil', 'Official canned-fish profile reports 0 g.')],
  [347, F.trans, 0, matvare('https://www.matvaretabellen.no/en/tuna-in-water-drained-canned/', 'Tuna in water, drained, canned', 'Exact canned-tuna profile reports 0 g.')],
  [349, F.trans, 0.025946, fdc(174924, 'Commercially prepared white bread', 'White-bread profile scaled by total fat.')],
  [354, F.trans, 0, fdc(170459, 'Canned tomato paste', 'Matching tomato-paste profile reports 0 g.')],
  [355, F.trans, 0, fdc(170460, 'Canned tomato puree', 'Matching tomato-puree profile reports 0 g.')],
  [358, F.trans, 0, fdc(174683, 'Red or green grapes, raw', 'Matching raw-fruit profile reports 0 g.')],
  [359, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Grapeseed oil', 'Non-hydrogenated plant oil profile reports 0 g.')],
  [360, F.trans, 0, logical('Dry baker\'s yeast contains no hydrogenated fat.')],
  [365, F.trans, 0, logical('MCT-carrier supplement contains no hydrogenated fat.')],
  [367, F.trans, 0, logical('One-drop oil supplement; no hydrogenated oil is declared, zero at this portion precision.', 'https://www.fda.gov/food/food-additives-petitions/trans-fat')],
  [370, F.trans, 0.001706, fdc(169738, 'Whole-wheat pasta, dry', 'USDA whole-wheat pasta trans value scaled by total fat.')],
  [371, F.trans, 0.762857, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Whole milk, 3.5% fat, dairy comparator', 'Estimated from 0.1 g trans fat per 3.5 g milk fat, scaled to whole-milk-powder fat.', 'estimate')],
  [372, F.trans, 0.044374, fdc(171287, 'Raw whole hen egg', 'Close egg profile scaled by the quail-egg-to-source fat ratio.', 'estimate')],
  [373, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Walnuts', 'Unprocessed nut profile reports 0 g at table precision.')],
  [374, F.trans, 0, matvare('https://www.matvaretabellen.no/en/trans-fatty-acids/', 'Walnut oil', 'Non-hydrogenated plant oil profile reports 0 g.')],
  [376, F.trans, 0, logical('Raw cabbage has no hydrogenated-fat ingredient.')],
  [377, F.trans, 0, logical('Dry wheat gluten has no hydrogenated-fat ingredient.')],
  [379, F.trans, 0, logical('Plain wheat bran has no hydrogenated-fat ingredient.')],
  [380, F.trans, 0, logical('Plain wheat flour has no hydrogenated-fat ingredient.')],
  [381, F.trans, 0, logical('Plain whole-wheat flour has no hydrogenated-fat ingredient.')],
  [382, F.trans, 0.225475, fdc(171633, 'Cooked frankfurter', 'Close cooked-sausage profile scaled by total fat.')],
  [385, F.trans, 0, fdc(175128, 'Raw walleye, close freshwater fish profile', 'Raw fish has no added hydrogenated fat; zero at reporting precision.', 'close match')],
  [386, F.trans, 0.603571, matvare('https://www.matvaretabellen.no/en/goat-cheese-chevre-naturell/', 'Goat cheese, chevre, Naturell', 'Close goat-cheese profile: 0.8 g trans fat at 28 g total fat, scaled to database fat.')],
  [391, F.trans, 0.006186, fdc(171372, 'Zwieback', 'Matching rusk profile scaled by total fat.')],
  [393, F.trans, 0, fdc(167712, 'Cooked bacon', 'Matching cooked-bacon profile reports 0 g.')],
  [394, F.trans, 0.028636, fdc(174899, 'Plain bagel', 'Plain-bagel profile scaled by total fat.')],
  [397, F.trans, 0, {
    source: 'McDonalds_Turkey_product_information',
    sourceName: 'Big Mac, McDonald\'s Turkey',
    sourceUrl: 'https://www.mcdonalds.com.tr/mcdonalds-lezzetleri/burgerler/big-mac',
    matchMethod: 'same_branded_product_other_market',
    method: 'Regional Big Mac product information reports 0 g trans fat; close branded match.',
    confidence: 'close match',
  }],
  [399, F.trans, 0.879154, matvare('https://www.matvaretabellen.no/en/cheese-ripened-brie/', 'Ripened Brie', 'Official Brie profile: 1.0 g trans fat at 33.1 g total fat, scaled to database fat.')],

  [314, F.alcohol, 0, fdc(173725, 'Raw Alaska pollock', 'Plain raw fish, non-alcoholic food.')],
  [315, F.alcohol, 0, logical('Plain wheat protein contains no alcohol ingredient.')],
  [316, F.alcohol, 0, logical('Selenium tablet has no alcohol ingredient.')],
  [324, F.alcohol, 0, fdc(170903, 'Plain low-fat Greek yogurt', 'Source reports 0 g ethyl alcohol.')],
  [325, F.alcohol, 0, fdc(170775, 'Strawberry-banana smoothie with low-fat yogurt', 'Source reports 0 g ethyl alcohol.')],
  [327, F.alcohol, 0, fdc(172446, 'Original soy milk, unfortified', 'Source reports 0 g ethyl alcohol.')],
  [328, F.alcohol, 0, fdc(175227, 'Plain soy yogurt', 'Plain, non-alcoholic soy-yogurt product.')],
  [330, F.alcohol, 0, logical('Dry, unfermented soy protein chunks contain no alcohol.')],
  [335, F.alcohol, 0, fdc(172182, 'Low-fat cottage cheese, 2% milkfat', 'Source reports 0 g ethyl alcohol.')],
  [336, F.alcohol, 0, matvare('https://www.matvaretabellen.no/en/quark-7-fat/', 'Quark, 7% fat', 'Official quark profile reports 0 g alcohol.')],
  [337, F.alcohol, 0, fdc(169287, 'Frozen spinach, unprepared', 'Source reports 0 g ethyl alcohol.')],
  [340, F.alcohol, 0, fdc(168482, 'Sweet potato, raw', 'Source reports 0 g ethyl alcohol.')],
  [342, F.alcohol, 0, logical('Pure tapioca or manioc starch contains no alcohol.')],
  [344, F.alcohol, 0, logical('Plain brewed black tea contains no alcohol.')],
  [345, F.alcohol, 0, matvare('https://www.matvaretabellen.no/tempeh-soyabonneprodukt/', 'Tempeh, soy bean product', 'Official tempeh profile reports 0 g alcohol.')],
  [350, F.alcohol, 0, logical('Plain tofu contains no alcohol ingredient.')],
  [355, F.alcohol, 0, fdc(170460, 'Canned tomato puree', 'Source reports 0 g ethyl alcohol.')],
  [358, F.alcohol, 0, fdc(174683, 'Red or green grapes, raw', 'Fresh, unfermented grapes; source reports 0 g ethyl alcohol.')],
  [362, F.alcohol, 0, logical('Vitamin B12 tablet has no alcohol ingredient.')],
  [363, F.alcohol, 0, logical('Vitamin C tablet has no alcohol ingredient.')],
  [364, F.alcohol, 0, logical('Vitamin D3 and K2 tablet has no alcohol ingredient.')],
  [365, F.alcohol, 0, logical('MCT vitamin drops have no alcohol ingredient.')],
  [366, F.alcohol, 0, logical('Vitamin E capsule has no alcohol ingredient.')],
  [367, F.alcohol, 0, logical('Oil-based vitamin E drops have no alcohol ingredient.')],
  [368, F.alcohol, 0, logical('Vitamin K2 tablet has no alcohol ingredient.')],
  [370, F.alcohol, 0, fdc(169738, 'Whole-wheat pasta, dry', 'Source reports 0 g ethyl alcohol.')],
  [382, F.alcohol, 0, fdc(171633, 'Cooked frankfurter', 'Source reports 0 g ethyl alcohol.')],
  [386, F.alcohol, 0, matvare('https://www.matvaretabellen.no/en/goat-cheese-chevre-naturell/', 'Goat cheese, chevre, Naturell', 'Official goat-cheese profile reports 0 g alcohol.')],
  [387, F.alcohol, 0, logical('Zinc tablet has no alcohol ingredient.')],
  [391, F.alcohol, 0, fdc(171372, 'Zwieback', 'Source reports 0 g ethyl alcohol.')],
  [397, F.alcohol, 0, logical('Big Mac recipe contains no alcoholic ingredient.')],
];

const auditRows = new Map();
const changedFields = [];
for (const [databaseIndex, field, value, evidence] of updates) {
  const item = db[databaseIndex - 1];
  if (!item?.nutrients || !allFields.includes(field)) throw new Error(`Invalid row or field at ${databaseIndex}.`);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid value for ${databaseIndex} ${field}.`);
  if (item.nutrients[field] != null) continue;
  item.nutrients[field] = value;
  changedFields.push({ databaseIndex, field, value });
  const key = `${databaseIndex}|${evidence.source}`;
  let record = auditRows.get(key);
  if (!record) {
    record = {
      databaseIndex,
      databaseName: item.name,
      source: evidence.source,
      sourceName: evidence.sourceName,
      sourceUrl: evidence.sourceUrl,
      matchMethod: evidence.matchMethod,
      confidence: evidence.confidence,
      values: {},
      sourceDetails: {},
    };
    auditRows.set(key, record);
  }
  record.values[field] = value;
  record.sourceDetails[field] = evidence.method;
}

const componentCorrections = {
  315: {
    values: [0.048, 0, 0], source: 'USDA FDC 168147, Vital wheat gluten',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/168147/nutrients?type=SR%20Legacy',
    method: 'Direct wheat-gluten ALA profile; EPA and DHA are zero for this plant protein.', confidence: 'close source profile',
  },
  325: {
    values: [0.040714, 0, 0], source: 'USDA FDC 170775, strawberry-banana smoothie with low-fat yogurt',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/170775/nutrients?type=SR%20Legacy',
    method: 'ALA scaled by total fat from a close smoothie recipe; EPA and DHA are zero in the source profile.', confidence: 'estimate',
  },
  329: {
    values: [0.006004, 0, 0], source: 'USDA FDC 174277, shoyu soy sauce',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/174277/nutrients?type=SR%20Legacy',
    method: 'Source ALA scaled to the database per-100-ml fat amount; EPA and DHA are zero in the source profile.', confidence: 'close source profile',
  },
  367: {
    values: [0.001833, 0, 0], source: 'USDA FDC 171411, soybean oil; generic vitamin-E-drop carrier is unspecified',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/171411/nutrients?type=SR%20Legacy',
    method: 'Low-confidence estimate using a non-hydrogenated soybean-oil carrier scaled to the one-drop fat amount; exact carrier is unknown.', confidence: 'low-confidence estimate',
  },
  386: {
    values: [0.075357, 0, 0], source: 'Matvaretabellen, Goat cheese, chevre, Naturell',
    sourceUrl: 'https://www.matvaretabellen.no/en/goat-cheese-chevre-naturell/',
    method: 'Close goat-cheese profile scaled by total fat; source reports ALA and zero EPA/DHA.', confidence: 'close source profile',
  },
  391: {
    values: [0.033505, 0, 0], source: 'USDA FDC 171372, Zwieback',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/171372/nutrients?type=SR%20Legacy',
    method: 'USDA rusk ALA profile scaled to database fat; EPA and DHA are zero in the source record.', confidence: 'close source profile',
  },
};

const componentFields = [F.ala, F.epa, F.dha];
const componentChanges = [];
for (const [indexText, correction] of Object.entries(componentCorrections)) {
  const databaseIndex = Number(indexText);
  const item = db[databaseIndex - 1];
  const oldValues = componentFields.map(field => item.nutrients[field]);
  const values = correction.values;
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid component correction at ${databaseIndex}.`);
  for (let i = 0; i < componentFields.length; i++) item.nutrients[componentFields[i]] = values[i];
  const row = componentAudit.records.find(candidate => candidate.databaseIndex === databaseIndex);
  if (!row) throw new Error(`Missing component audit row ${databaseIndex}.`);
  row.previousValues = { ALA: oldValues[0], EPA: oldValues[1], DHA: oldValues[2] };
  [row.ALA, row.EPA, row.DHA] = values;
  row.source = correction.source;
  row.sourceUrl = correction.sourceUrl;
  row.method = correction.method;
  row.confidence = correction.confidence;
  componentChanges.push({ databaseIndex, food: item.name, previousValues: row.previousValues, values: { ALA: values[0], EPA: values[1], DHA: values[2] }, sourceBasis: correction.source, sourceUrl: correction.sourceUrl, confidence: correction.confidence });
}

sourceAudit.checkedOn = checkedOn;
sourceAudit.status = 'complete_with_documented_close_matches';
sourceAudit.fields = allFields;
sourceAudit.valueBasis = 'Grams per database reference amount: 100 g, 100 ml, or one item where applicable. Close matches are scaled only where the portion or total-fat basis is comparable; estimates are labeled in row audit details.';
sourceAudit.nullPolicy = 'Use a numeric source value when available. Enter 0 only when the source reports zero or the food composition excludes the nutrient. Do not convert missing, trace, or below-detection markers to zero. Document close-match estimates and retain uncertainty.';
sourceAudit.coverageNotes = sourceAudit.coverageNotes ?? {};
sourceAudit.coverageNotes.Batch005_ALA_EPA_DHA_2026_09_24 = 'ALA, EPA and DHA are tracked as separate grams per database reference amount for indices 301-400. Direct source matches are preferred; close matches are scaled by total fat and mixed recipes are marked as estimates. Component audit rows include source and confidence.';
sourceAudit.coverageNotes.Batch004Completion_2026_09_24 = 'Completed all seven fatty-acid and alcohol fields for indices 301-400 using USDA SR Legacy, Matvaretabellen, product information, and composition-based zeros. Unclassified PUFA residuals are not silently assigned to omega-6. Rows with recipe or carrier uncertainty are explicitly marked.';
sourceAudit.sources = sourceAudit.sources ?? {};
sourceAudit.sources.Matvaretabellen_2026 = sourceAudit.sources.Matvaretabellen_2026 ?? {};
sourceAudit.sources.Matvaretabellen_2026.foodProfileUrls = sourceAudit.sources.Matvaretabellen_2026.foodProfileUrls ?? [];
for (const url of [
  'https://www.matvaretabellen.no/en/goat-cheese-chevre-naturell/',
  'https://www.matvaretabellen.no/en/cheese-ripened-brie/',
  'https://www.matvaretabellen.no/en/quark-7-fat/',
  'https://www.matvaretabellen.no/en/cottage-cheese/',
  'https://www.matvaretabellen.no/tempeh-soyabonneprodukt/',
  'https://www.matvaretabellen.no/en/anchovies-canned/',
  'https://www.matvaretabellen.no/en/tuna-in-water-drained-canned/',
  'https://www.matvaretabellen.no/en/pasta-bolognese/',
]) {
  if (!sourceAudit.sources.Matvaretabellen_2026.foodProfileUrls.includes(url)) sourceAudit.sources.Matvaretabellen_2026.foodProfileUrls.push(url);
}
sourceAudit.sources.USDA_FoodData_Central_SR_Legacy_2018.omegaMethod = 'Sum identified n-3/n-6 fatty acids; scale close matches by total fat only when appropriate. Do not assign unclassified PUFA residuals to omega-6.';
sourceAudit.records = sourceAudit.records ?? [];
for (const entry of auditRows.values()) {
  const existing = sourceAudit.records.find(record => record.databaseIndex === entry.databaseIndex && record.source === entry.source);
  if (existing) {
    existing.values = { ...(existing.values ?? {}), ...entry.values };
    existing.sourceDetails = { ...(existing.sourceDetails ?? {}), ...entry.sourceDetails };
    Object.assign(existing, { sourceName: entry.sourceName, sourceUrl: entry.sourceUrl, matchMethod: entry.matchMethod, confidence: entry.confidence });
  } else {
    sourceAudit.records.push(entry);
  }
}
for (const change of componentChanges) {
  const existing = sourceAudit.records.find(record => record.databaseIndex === change.databaseIndex && record.source === 'Omega3_component_correction');
  const entry = {
    databaseIndex: change.databaseIndex,
    databaseName: change.food,
    source: 'Omega3_component_correction',
    sourceName: change.sourceBasis,
    sourceUrl: change.sourceUrl,
    matchMethod: 'supersedes_weaker_estimate',
    confidence: change.confidence,
    previousValues: change.previousValues,
    values: change.values,
    sourceDetails: { method: 'Updated ALA/EPA/DHA using a better-matched checked food profile.' },
  };
  if (existing) Object.assign(existing, entry);
  else sourceAudit.records.push(entry);
}

const auditedFields = allFields;
const slice = db.slice(rangeStart - 1, rangeEnd);
const fieldCoverage = Object.fromEntries(auditedFields.map(field => {
  const filled = slice.filter(item => typeof item.nutrients[field] === 'number').length;
  return [field, { filled, missing: slice.length - filled, total: slice.length }];
}));
const remainingNulls = slice.flatMap((item, offset) => {
  const missingFields = auditedFields.filter(field => typeof item.nutrients[field] !== 'number');
  return missingFields.length ? [{ databaseIndex: rangeStart + offset, databaseName: item.name, missingFields }] : [];
});
sourceAudit.fieldCoverage = fieldCoverage;
sourceAudit.remainingNulls = remainingNulls;

componentAudit.checkedOn = checkedOn;
componentAudit.legacyFieldCoverage = Object.fromEntries([F.omega3, F.omega6, F.trans, F.alcohol].map(field => {
  const filled = slice.filter(item => typeof item.nutrients[field] === 'number').length;
  return [field, { filled, missing: slice.length - filled, total: slice.length }];
}));
componentAudit.methodNotes = [
  'Direct USDA SR Legacy and official food-table component profiles are preferred. Close matches are scaled by total fat only when the match is defensible.',
  'ALA, EPA and DHA are stored as separate numeric grams per database reference amount. For known plant-only foods EPA and DHA are zero; animal and mixed foods are not assigned blanket zeros.',
  'Recipe and unspecified-carrier estimates are explicitly identified per row. Unclassified PUFA is not automatically assigned to omega-6.',
  'Each batch keeps the source URL, method and confidence beside the values; missing source markers are not treated as numeric zero.',
];
componentAudit.legacyUpdates = componentAudit.legacyUpdates ?? [];
componentAudit.legacyUpdates.push(...[...auditRows.values()].map(row => ({
  databaseIndex: row.databaseIndex,
  food: row.databaseName,
  values: row.values,
  sourceBasis: row.sourceName,
  sourceUrl: row.sourceUrl,
  confidence: row.confidence,
})), ...componentChanges.map(change => ({
  databaseIndex: change.databaseIndex,
  food: change.food,
  values: change.values,
  previousValues: change.previousValues,
  sourceBasis: change.sourceBasis,
  sourceUrl: change.sourceUrl,
  confidence: change.confidence,
})));

for (let i = rangeStart - 1; i < rangeEnd; i++) {
  const nutrients = db[i].nutrients;
  if (componentFields.some(field => typeof nutrients[field] !== 'number' || nutrients[field] < 0)) throw new Error(`Missing or invalid omega-3 component at ${i + 1}.`);
  const componentSum = componentFields.reduce((sum, field) => sum + nutrients[field], 0);
  if (typeof nutrients[F.omega3] === 'number' && componentSum > nutrients[F.omega3] + 0.00001) throw new Error(`ALA+EPA+DHA exceeds total omega-3 at ${i + 1}.`);
  for (const field of [F.omega3, F.omega6, F.trans, F.alcohol]) {
    if (typeof nutrients[field] !== 'number' || nutrients[field] < 0) throw new Error(`Missing or invalid ${field} at ${i + 1}.`);
  }
}
if (remainingNulls.length !== 0) throw new Error(`Batch still has ${remainingNulls.length} food rows with missing values.`);

const stringifyPreservingEol = (filePath, value) => {
  const original = fs.readFileSync(filePath, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  return bom + JSON.stringify(value, null, 2).replace(/\n/g, newline) + newline;
};
fs.writeFileSync(databasePath, stringifyPreservingEol(databasePath, db), 'utf8');
fs.writeFileSync(sourceAuditPath, stringifyPreservingEol(sourceAuditPath, sourceAudit), 'utf8');
fs.writeFileSync(componentAuditPath, stringifyPreservingEol(componentAuditPath, componentAudit), 'utf8');

console.log(JSON.stringify({
  batch: `${rangeStart}-${rangeEnd}`,
  changedNullFields: changedFields.length,
  componentCorrections: componentChanges.length,
  fieldCoverage,
  remainingNullRows: remainingNulls.length,
  allComponentSumsWithinOmega3: true,
}, null, 2));
