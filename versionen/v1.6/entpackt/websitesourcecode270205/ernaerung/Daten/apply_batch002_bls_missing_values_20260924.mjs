import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(here, '..', 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const sources = [
  {
    name: 'Haferdrink / Hafermilch',
    source: 'BLS 4.0',
    sourceName: 'Haferdrink ungesüßt (C660000)',
    sourceUrl: 'https://blsdb.de/food?foodId=38136&token=0T4E-8C3Z-Z0D6-O8W7-H3WF-KIIW-DMTE-3NR2',
    matchMethod: 'food_class_analogue_non_alcoholic_oat_drink',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'Only the explicit BLS ethanol zero is transferred. The BLS source is an unsweetened oat drink; the target is a generic oat drink measured per 100 ml. No omega values are transferred because the macro profile differs.'
  },
  {
    name: 'Haferdrink, Barista',
    source: 'BLS 4.0 food-class inference',
    sourceName: 'Haferdrink ungesüßt (C660000)',
    sourceUrl: 'https://blsdb.de/food?foodId=38136&token=0T4E-8C3Z-Z0D6-O8W7-H3WF-KIIW-DMTE-3NR2',
    matchMethod: 'food_class_analogue_non_alcoholic_oat_drink',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'The BLS oat-drink record reports ethanol 0 g/100 g. Applied only to alcohol for this oat-based non-alcoholic beverage; no fatty-acid values are transferred.'
  },
  {
    name: 'Haferdrink, ungesüßt (Discounter)',
    source: 'BLS 4.0',
    sourceName: 'Haferdrink ungesüßt (C660000)',
    sourceUrl: 'https://blsdb.de/food?foodId=38136&token=0T4E-8C3Z-Z0D6-O8W7-H3WF-KIIW-DMTE-3NR2',
    matchMethod: 'same_food_class_unsweetened_oat_drink',
    confidence: 'high',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'The BLS source is an unsweetened oat drink and explicitly records 0 g ethanol. Only the alcohol value is transferred; macro differences prevent omega transfer.'
  },
  {
    name: 'Haferflocken, kernig (Discounter)',
    source: 'BLS 4.0 food-class inference',
    sourceName: 'Hafer Flocken (C133000)',
    sourceUrl: 'https://blsdb.de/food?foodId=37914&token=95MI-BAK8-R69M-VRF1-TKVQ-XGLT-JK9N-DHW9',
    matchMethod: 'same_unfermented_single_ingredient_cereal',
    confidence: 'high',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports a logical zero for ethanol in plain oats. The target is unseasoned dry rolled oats; only alcohol is transferred.'
  },
  {
    name: 'Hefeflocken (Nährhefe, angereichert)',
    source: 'BLS 4.0',
    sourceName: 'Hefe Flocken/Nährhefe',
    sourceUrl: 'https://blsdb.de/food?foodId=38572&token=9NPS-75ZD-R8AU-S2P6-QOXP-C794-3L86-IGI1',
    matchMethod: 'same_food_nutritional_yeast_flakes',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports 0 g ethanol for nutritional yeast flakes. Only alcohol is transferred; omega fields are not inferred from the source zeros because its fatty-acid coverage is not sufficiently clear.'
  },
  {
    name: 'Hirse (trocken)',
    source: 'BLS 4.0',
    sourceName: 'Hirse roh (C332000)',
    sourceUrl: 'https://blsdb.de/food?foodId=38126&token=9SU5-S4VI-ZMC1-Z148-NVWH-KJ2V-KE6N-ZX2P',
    matchMethod: 'same_unfermented_single_ingredient_millet',
    confidence: 'high',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports ethanol as a logical zero for raw millet. Only alcohol is transferred.'
  },
  {
    name: 'Hirseflocken (trocken)',
    source: 'BLS 4.0',
    sourceName: 'Hirse Flocken (C333100)',
    sourceUrl: 'https://blsdb.de/food?foodId=38478&token=9SU5-S4VI-ZMC1-Z148-NVWH-KJ2V-KE6N-ZX2P',
    matchMethod: 'same_food_dry_millet_flakes',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.09, 'Omega-6 Fatty Acids (g)': 1.29, 'Alcohol (g)': 0 },
    values: { 'Omega-3 Fatty Acids (g)': 0.09, 'Omega-6 Fatty Acids (g)': 1.29, 'Alcohol (g)': 0 },
    calculation: 'BLS totals are taken per 100 g. Its omega-3 and omega-6 totals are formula sums from pattern-estimated fatty-acid components, not direct analyses. The target is the same dry millet-flake food class, though its macro profile differs; values are retained as source-based estimates.'
  },
  {
    name: 'Kartoffelstärke',
    source: 'BLS 4.0',
    sourceName: 'Kartoffelstärke (Kartoffelmehl) (K230000)',
    sourceUrl: 'https://blsdb.de/food?foodId=38053&token=UNH7-B0N2-4EMN-0S05-1N9K-X2NQ-4VB6-TX83',
    matchMethod: 'same_food_potato_starch',
    confidence: 'high',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.003, 'Omega-6 Fatty Acids (g)': 0.01, 'Alcohol (g)': 0 },
    values: { 'Omega-3 Fatty Acids (g)': 0.003, 'Omega-6 Fatty Acids (g)': 0.01, 'Alcohol (g)': 0 },
    calculation: 'BLS potato starch has matching macros and reports 0 g ethanol as a logical zero. The omega totals are based on pattern-estimated fatty-acid components, so they are estimates rather than direct measurements.'
  },
  {
    name: 'Knäckebrot, Vollkorn',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Mehrkornvollkornknäckebrot (B6A4000)',
    sourceUrl: 'https://blsdb.de/food?foodId=40723&token=R6M8-7K03-EZH1-SLT4-28M7-3241-WUL5-ZDOL',
    matchMethod: 'wholegrain_crispbread_analogue',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports 0 g ethanol for a wholegrain crispbread analogue. Only alcohol is transferred; the source product is multigrain and its macro profile differs from the target.'
  },
  {
    name: 'Kondensmilch 7,5% Fett',
    source: 'BLS 4.0',
    sourceName: 'Kondensmilch mind. 7,5 % Fett (M182400)',
    sourceUrl: 'https://blsdb.de/food?foodId=38613&token=W44L-NFKB-S0R7-UDJR-XD58-V3V9-5LD9-OQFE',
    matchMethod: 'same_food_condensed_milk_75_percent_fat',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'The BLS 4.0 entry for unsweetened condensed milk with at least 7.5% fat reports 0 g ethanol. The target is per 100 ml; zero remains zero without density conversion.'
  }
];

const applied = [];
const alreadyPresent = [];
const missingTargets = [];
const sourceRecords = [];

for (const item of sources) {
  const index = database.findIndex((food) => food.name === item.name);
  if (index < 0) {
    missingTargets.push(item.name);
    continue;
  }

  const food = database[index];
  const addedValues = {};
  const existingValues = {};
  for (const [field, value] of Object.entries(item.values)) {
    if (food.nutrients[field] === null || food.nutrients[field] === undefined) {
      food.nutrients[field] = value;
      addedValues[field] = value;
      applied.push({ index: index + 1, name: item.name, field, value, source: item.sourceName });
    } else {
      existingValues[field] = food.nutrients[field];
      alreadyPresent.push({ index: index + 1, name: item.name, field, existingValue: food.nutrients[field] });
    }
  }

  if (Object.keys(addedValues).length > 0) {
    sourceRecords.push({
      databaseIndex: index + 1,
      databaseName: item.name,
      source: item.source,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      matchMethod: item.matchMethod,
      confidence: item.confidence,
      valueBasis: 'g per 100 g edible portion, except unchanged zero values for targets in ml',
      sourceValuesPer100g: item.sourceValuesPer100g,
      targetTotalFatPer100g: food.nutrients['Total Fat (g)'],
      calculation: item.calculation,
      values: addedValues,
      checkedOn: '2026-09-24'
    });
  }
}

audit.records ??= [];
audit.records.push(...sourceRecords);
const fields = [
  'Omega-3 Fatty Acids (g)',
  'Omega-6 Fatty Acids (g)',
  'Trans Fat (g)',
  'Alcohol (g)'
];
const coverage = {};
for (const field of fields) {
  let filled = 0;
  for (let databaseIndex = 101; databaseIndex <= 200; databaseIndex += 1) {
    const food = database[databaseIndex - 1];
    if (food.nutrients[field] !== null && food.nutrients[field] !== undefined) filled += 1;
  }
  coverage[field] = { filled, missing: 100 - filled, total: 100 };
}
audit.fieldCoverage = coverage;

const previousApplication = audit.databaseApplication ?? {};
const previousUpdates = previousApplication.updates ?? [];
const previousCounts = previousApplication.appliedByField ?? {};
const appliedByField = Object.fromEntries(fields.map((field) => [
  field,
  (previousCounts[field] ?? 0) + applied.filter((item) => item.field === field).length
]));
audit.databaseApplication = {
  ...previousApplication,
  appliedOn: '2026-09-24',
  appliedFrom: `${previousApplication.appliedFrom ?? ''}; BLS 4.0 exact entries and clearly labeled food-class analogues, including pattern-estimated omegas`,
  appliedCount: (previousApplication.appliedCount ?? previousUpdates.length) + applied.length,
  appliedByField,
  updates: [...previousUpdates, ...applied],
  lastBatch: {
    appliedCount: applied.length,
    appliedByField: Object.fromEntries(fields.map((field) => [field, applied.filter((item) => item.field === field).length])),
    alreadyPresent,
    missingTargets
  }
};

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ appliedCount: applied.length, appliedByField: audit.databaseApplication.lastBatch.appliedByField, coverage, alreadyPresent, missingTargets, recordsAdded: sourceRecords.length }, null, 2));
