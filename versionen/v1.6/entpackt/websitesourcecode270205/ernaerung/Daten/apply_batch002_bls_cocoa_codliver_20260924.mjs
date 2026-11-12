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
    name: 'Kakao, stark entölt (Pulver)',
    source: 'BLS 4.0',
    sourceName: 'Kakaopulver stark entölt (S713000)',
    sourceUrl: 'https://blsdb.de/food?foodId=38795&token=BVXP-2413-A35U-RB5G-0C6F-7U6A-GBQV-EKHB',
    matchMethod: 'same_food_class_strongly_defatted_cocoa_powder',
    confidence: 'medium',
    sourceValuesPer100g: { 'Omega-3 Fatty Acids (g)': 0, 'Omega-6 Fatty Acids (g)': 0.3, 'Alcohol (g)': 0 },
    values: { 'Omega-3 Fatty Acids (g)': 0, 'Omega-6 Fatty Acids (g)': 0.3, 'Alcohol (g)': 0 },
    calculation: 'BLS lists omega-3 as 0 g and omega-6 as 0.3 g per 100 g for strongly defatted cocoa powder; the individual fatty-acid pattern values are estimates. BLS lists ethanol as 0 g. Trans fat is not inferred.'
  },
  {
    name: 'Kakao, Trinkschokolade (mit Milch)',
    source: 'BLS 4.0 food-class analogue',
    sourceName: 'Milchmischgetränk < 1 % Fett, mit Kakao/Schokolade, gesüßt (M206100)',
    sourceUrl: 'https://blsdb.de/food?foodId=41227&token=50YD-QP4H-0M3N-7STW-NZ3F-3A6X-14DW-O9IE',
    matchMethod: 'sweetened_cocoa_milk_drink_analogue',
    confidence: 'medium',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS recipe calculation gives 0 g ethanol for a sweetened cocoa milk drink. The target fat content differs, but its listed ingredients are a non-fermented cocoa-and-milk drink; omega and trans-fat values are not inferred.'
  },
  {
    name: 'Lebertran (Kabeljau, flüssig)',
    source: 'BLS 4.0',
    sourceName: 'Fischleberöl/Lebertran (Q730000)',
    sourceUrl: 'https://blsdb.de/food?foodId=38439&token=FC11-U4B9-663M-TNV7-C5FX-0A30-3WHY-579S',
    matchMethod: 'same_food_cod_liver_oil',
    confidence: 'high',
    sourceValuesPer100g: { 'Alcohol (g)': 0 },
    values: { 'Alcohol (g)': 0 },
    calculation: 'BLS explicitly marks ethanol as a logical zero for cod liver oil. The value remains zero regardless of the target millilitre unit; omega and trans-fat values are not inferred.'
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
  for (const [field, value] of Object.entries(item.values)) {
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
      valueBasis: 'g per 100 g edible food, except alcohol zero which is unit-independent',
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
  appliedFrom: `${previous.appliedFrom ?? ''}; BLS 4.0 cocoa powder omega totals and verified ethanol zeros for cocoa drink and cod liver oil`,
  appliedCount: (previous.appliedCount ?? previousUpdates.length) + applied.length,
  appliedByField: Object.fromEntries(fields.map((field) => [field, (previousCounts[field] ?? 0) + thisBatchCounts[field]])),
  updates: [...previousUpdates, ...applied],
  lastBatch: { appliedCount: applied.length, appliedByField: thisBatchCounts, alreadyPresent, missingTargets }
};

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ appliedCount: applied.length, appliedByField: thisBatchCounts, coverage, alreadyPresent, missingTargets }, null, 2));
