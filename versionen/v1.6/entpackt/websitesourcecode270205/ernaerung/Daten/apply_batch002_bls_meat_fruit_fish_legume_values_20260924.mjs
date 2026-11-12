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
    name: 'Hackfleisch gemischt (Schwein/Rind)',
    source: 'BLS 4.0',
    sourceName: 'Rind/Schwein, Hackfleisch gemischt, roh (U050100)',
    sourceUrl: 'https://blsdb.de/food?foodId=43896&token=X4DH-Q2YT-JU8E-AEUX-I3J7-2B81-57EB-KMMC',
    matchMethod: 'same_raw_mixed_beef_pork_mince',
    confidence: 'medium',
    sourceTotalFat: 17.83,
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.063, 'Omega-6 Fatty Acids (g)': 0.843, 'Alcohol (g)': 0 },
    valuesForTarget: (fat) => {
      const factor = fat / 17.83;
      return {
        'Omega-3 Fatty Acids (g)': Number((0.063 * factor).toFixed(6)),
        'Omega-6 Fatty Acids (g)': Number((0.843 * factor).toFixed(6)),
        'Alcohol (g)': 0
      };
    },
    calculation: 'BLS provides the matching raw mixed beef/pork mince profile. Omega family totals are scaled by the target/source total-fat ratio because the database target contains 20 g fat versus 17.83 g in BLS; these two values are estimates. BLS reports ethanol as 0 g.'
  },
  {
    name: 'Himbeeren, gefroren',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Himbeere roh (F302100)',
    sourceUrl: 'https://blsdb.de/food?foodId=37924&token=Y7WP-9OM7-GVCF-1Z4G-ICZ3-UQYH-IYX1-NIME',
    matchMethod: 'same_fruit_unsweetened_raw_to_frozen',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports 0 g ethanol for raw raspberries. The target is plain frozen raspberries with no alcoholic ingredient or fermentation; only the alcohol zero is transferred.'
  },
  {
    name: 'Jackfruit, Dose (in Wasser, abgetropft)',
    source: 'Food identity inference',
    sourceName: 'Single-ingredient fruit preserve in water; no fermentation or alcoholic ingredient indicated',
    sourceUrl: 'https://blsdb.de/',
    matchMethod: 'plain_canned_fruit_in_water_food_class_exclusion',
    confidence: 'medium',
    sourceValuesPer100g: {},
    values: { 'Alcohol (g)': 0 },
    calculation: 'Food-class zero for plain jackfruit packed in water and drained. The food description contains no alcoholic ingredient and identifies an unfermented fruit preserve.'
  },
  {
    name: 'Kalbfleisch, Schnitzel (roh)',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Kalb Hackfleisch, roh (U030100)',
    sourceUrl: 'https://blsdb.de/food?foodId=41472&token=X4DH-Q2YT-JU8E-AEUX-I3J7-2B81-57EB-KMMC',
    matchMethod: 'raw_veal_meat_analogue',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports 0 g ethanol for raw veal mince. The target is plain raw veal with no alcoholic ingredient or fermentation.'
  },
  {
    name: 'Lachs, Dose (in eigenem Saft)',
    source: 'BLS 4.0',
    sourceName: 'Lachs Konserve, abgetropft (T410902)',
    sourceUrl: 'https://blsdb.de/food?foodId=46039&token=V3V7-V7O4-BZ02-N593-DDQW-4QXH-7UCK-ROIR',
    matchMethod: 'same_food_canned_drained_salmon',
    confidence: 'medium',
    sourceTotalFat: 8.93,
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 2.171, 'Omega-6 Fatty Acids (g)': 0.735, 'Alcohol (g)': 0 },
    valuesForTarget: (fat) => {
      const factor = fat / 8.93;
      return {
        'Omega-3 Fatty Acids (g)': Number((2.171 * factor).toFixed(6)),
        'Omega-6 Fatty Acids (g)': Number((0.735 * factor).toFixed(6)),
        'Alcohol (g)': 0
      };
    },
    calculation: 'BLS provides the same drained canned salmon category. Omega family totals are scaled by the target/source total-fat ratio because the target contains 7.4 g fat versus 8.93 g in BLS; this is a composition estimate. BLS reports ethanol as 0 g.'
  },
  {
    name: 'Linsen, Dose (abgetropft)',
    source: 'BLS 4.0',
    sourceName: 'Linse reif, Konserve, abgetropft (H730902)',
    sourceUrl: 'https://blsdb.de/food?foodId=46106&token=R65M-IYW2-K1JA-EW6J-QMUS-OF8M-W9RO-7IDR',
    matchMethod: 'same_food_drained_canned_lentils',
    confidence: 'medium',
    sourceTotalFat: 0.7,
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0.07, 'Omega-6 Fatty Acids (g)': 0.23, 'Alcohol (g)': 0 },
    valuesForTarget: (fat) => {
      const factor = fat / 0.7;
      return {
        'Omega-3 Fatty Acids (g)': Number((0.07 * factor).toFixed(6)),
        'Omega-6 Fatty Acids (g)': Number((0.23 * factor).toFixed(6)),
        'Trans Fat (g)': 0,
        'Alcohol (g)': 0
      };
    },
    calculation: 'BLS provides the matching drained canned lentil entry, including omega totals and a logical ethanol zero. Omega totals are scaled by target/source total fat (0.4/0.7) to accommodate the target macro profile. Trans fat is set to 0 by plant-only food identity: no ruminant ingredient or partially hydrogenated oil is indicated.'
  },
  {
    name: 'Linsen, rot (trocken)',
    source: 'Food identity inference',
    sourceName: 'Unfermented dry red lentils; no alcoholic ingredient',
    sourceUrl: 'https://blsdb.de/',
    matchMethod: 'unfermented_dry_legume_food_class_exclusion',
    confidence: 'high',
    sourceValuesPer100g: {},
    values: { 'Alcohol (g)': 0 },
    calculation: 'Logical zero for raw dried lentils: this is an unfermented single-ingredient dry legume with no alcoholic ingredient.'
  },
  {
    name: 'Lyoner / Fleischwurst',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Lyoner grob (W255100)',
    sourceUrl: 'https://blsdb.de/food?foodId=38895&token=KLH8-7JKP-P0M4-586L-XTVR-B458-UM2A-517M',
    matchMethod: 'same_cooked_lyoner_bologna_sausage_class',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS reports 0 g ethanol for Lyoner sausage. The target is generic Lyoner/Fleischwurst in the same cooked sausage class.'
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
  const itemValues = item.valuesForTarget ? item.valuesForTarget(food.nutrients['Total Fat (g)']) : item.values;
  const addedValues = {};
  for (const [field, value] of Object.entries(itemValues)) {
    if (food.nutrients[field] === null || food.nutrients[field] === undefined) {
      food.nutrients[field] = value;
      addedValues[field] = value;
      applied.push({ index: index + 1, name: item.name, field, value, source: item.sourceName });
    } else {
      alreadyPresent.push({ index: index + 1, name: item.name, field, existingValue: food.nutrients[field] });
    }
  }
  if (Object.keys(addedValues).length) {
    sourceRecords.push({
      databaseIndex: index + 1,
      databaseName: item.name,
      source: item.source,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      matchMethod: item.matchMethod,
      confidence: item.confidence,
      valueBasis: 'g per 100 g edible food',
      sourceValuesPer100g: item.sourceValuesPer100g,
      targetTotalFatPer100g: food.nutrients['Total Fat (g)'],
      calculation: item.calculation,
      values: addedValues,
      checkedOn: '2026-09-24'
    });
  }
}

const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const coverage = {};
for (const field of fields) {
  const filled = database.slice(100, 200).filter((food) => food.nutrients[field] !== null && food.nutrients[field] !== undefined).length;
  coverage[field] = { filled, missing: 100 - filled, total: 100 };
}

audit.records ??= [];
audit.records.push(...sourceRecords);
audit.fieldCoverage = coverage;
const previous = audit.databaseApplication ?? {};
const previousUpdates = previous.updates ?? [];
const previousCounts = previous.appliedByField ?? {};
const thisBatchCounts = Object.fromEntries(fields.map((field) => [field, applied.filter((item) => item.field === field).length]));
audit.databaseApplication = {
  ...previous,
  appliedOn: '2026-09-24',
  appliedFrom: `${previous.appliedFrom ?? ''}; additional BLS 4.0 meat, salmon, lentil and raspberry records with documented food-class estimates`,
  appliedCount: (previous.appliedCount ?? previousUpdates.length) + applied.length,
  appliedByField: Object.fromEntries(fields.map((field) => [field, (previousCounts[field] ?? 0) + thisBatchCounts[field]])),
  updates: [...previousUpdates, ...applied],
  lastBatch: { appliedCount: applied.length, appliedByField: thisBatchCounts, alreadyPresent, missingTargets }
};

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ appliedCount: applied.length, appliedByField: thisBatchCounts, coverage, alreadyPresent, missingTargets }, null, 2));
