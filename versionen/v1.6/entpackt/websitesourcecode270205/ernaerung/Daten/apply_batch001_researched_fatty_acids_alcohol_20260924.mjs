import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_001_sources.json');
const checkedOn = '2026-09-24';
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (db.length !== 1516 || audit.range.first !== 1 || audit.range.last !== 100) {
  throw new Error('Unexpected database or batch-001 scope.');
}

const updates = [
  { index: 13, name: 'Artischockenherzen, Dose (abgetropft)', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0, 'Omega-6 Fatty Acids (g)': 0, 'Trans Fat (g)': 0, 'Alcohol (g)': 0,
  } },
  { index: 20, name: 'Bergkäse / Hartkäse', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.196, 'Omega-6 Fatty Acids (g)': 0.523, 'Alcohol (g)': 0,
  } },
  { index: 31, name: 'Bratwurst, Schwein (roh)', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.16, 'Omega-6 Fatty Acids (g)': 1.86, 'Alcohol (g)': 0,
  } },
  { index: 34, name: 'Brötchen, Weizen', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.0974, 'Omega-6 Fatty Acids (g)': 0.6595, 'Alcohol (g)': 0,
  } },
  { index: 40, name: 'Butterschmalz / Ghee', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.49, 'Omega-6 Fatty Acids (g)': 1.76,
  } },
  { index: 43, name: 'Cashewkerne', unit: 'g', values: { 'Trans Fat (g)': 0 } },
  { index: 54, name: 'Datteln, getrocknet', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.003, 'Omega-6 Fatty Acids (g)': 0.016,
  } },
  { index: 64, name: 'Eiklar (roh)', unit: 'g', values: { 'Trans Fat (g)': 0 } },
  { index: 72, name: 'Erbsendrink', unit: 'ml', values: { 'Alcohol (g)': 0 } },
  { index: 73, name: 'Erbsenprotein, Isolat (Pulver)', unit: 'g', values: {
    'Trans Fat (g)': 0, 'Alcohol (g)': 0,
  } },
  { index: 80, name: 'Falafel, fertig (gefroren, roh)', unit: 'g', values: { 'Alcohol (g)': 0 } },
  { index: 93, name: 'Gelatine, Blatt / Pulver', unit: 'g', values: {
    'Omega-3 Fatty Acids (g)': 0.0012, 'Omega-6 Fatty Acids (g)': 0.0027,
  } },
];

for (const update of updates) {
  const food = db[update.index - 1];
  if (!food || food.name !== update.name || food.unit !== update.unit) {
    throw new Error(`Identity mismatch at database index ${update.index}.`);
  }
  for (const [field, value] of Object.entries(update.values)) {
    const current = food.nutrients[field];
    if (current != null && current !== value) {
      throw new Error(`Refusing to overwrite ${food.name}, ${field}: ${current}`);
    }
    food.nutrients[field] = value;
  }
}

function upsert(record) {
  const match = audit.records.findIndex(item => item.databaseIndex === record.databaseIndex && item.source === record.source);
  if (match >= 0) audit.records[match] = record;
  else audit.records.push(record);
}

const blsBase = 'https://blsdb.de/download';
const fdc = 'https://fdc.nal.usda.gov/food-details/';
upsert({
  databaseIndex: 13,
  databaseName: 'Artischockenherzen, Dose (abgetropft)',
  source: 'BLS_4_0',
  sourceCode: 'G410902',
  sourceName: 'Artischocke Konserve, abgetropft',
  sourceUrl: 'https://blsdb.de/food?foodId=45253',
  matchMethod: 'exact food and drained state',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0,
    'Omega-6 Fatty Acids (g)': 0,
    'Alcohol (g)': 0,
  },
  sourceTotalFatPer100g: 0.122,
  databaseTotalFatPer100g: 0.2,
  values: {
    'Omega-3 Fatty Acids (g)': 0,
    'Omega-6 Fatty Acids (g)': 0,
    'Alcohol (g)': 0,
  },
  note: 'Exact drained canned-artichoke match. BLS reports numeric zero Omega-3, Omega-6, and ethanol. The drained product has no added oil; total trans fat is entered as a composition-based zero, not inferred from a blank BLS field.',
  checkedOn,
});
upsert({
  databaseIndex: 13,
  databaseName: 'Artischockenherzen, Dose (abgetropft)',
  source: 'LogicalFoodComposition',
  sourceCode: 'PLAIN_DRAINED_VEGETABLE',
  sourceName: 'Plain drained canned artichoke hearts',
  sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
  matchMethod: 'plain plant food; no hydrogenated oil or animal fat in the database food identity',
  valueBasis: 'g per 100 g database reference portion',
  values: { 'Trans Fat (g)': 0 },
  logicalEvidence: {
    'Trans Fat (g)': {
      basis: 'Plain drained artichoke hearts in water; no animal-derived fat or added hydrogenated oil. BLS reports only 0.122 g total fat/100 g and zero total PUFA. This is a composition-based zero, not a conversion of a trace marker.',
      sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
    },
  },
  checkedOn,
});
upsert({
  databaseIndex: 20,
  databaseName: 'Bergkäse / Hartkäse',
  source: 'BLS_4_0',
  sourceCode: 'M300700',
  sourceName: 'Hartkäse mind. 50 % Fett i. Tr.',
  sourceUrl: 'https://blsdb.de/food?foodId=39161',
  matchMethod: 'closest hard-cheese class by total fat; database label also includes Bergkäse',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.196,
    'Omega-6 Fatty Acids (g)': 0.523,
    'Alcohol (g)': 0,
  },
  sourceTotalFatPer100g: 32.1,
  databaseTotalFatPer100g: 32,
  values: {
    'Omega-3 Fatty Acids (g)': 0.196,
    'Omega-6 Fatty Acids (g)': 0.523,
    'Alcohol (g)': 0,
  },
  confidence: 'medium; database label combines Bergkäse and Hartkäse, selected BLS hard-cheese row matches total fat closely',
  unresolvedFields: ['Trans Fat (g)'],
  note: 'BLS hard cheese has 32.1 g total fat/100 g versus 32 g in the database. The generic entry also includes Bergkäse, so this closest class match is not an exact variety match. BLS does not report total trans fat.',
  checkedOn,
});
upsert({
  databaseIndex: 31,
  databaseName: 'Bratwurst, Schwein (roh)',
  source: 'BLS_4_0',
  sourceCode: 'W222100',
  sourceName: 'Bratwurst mittelgrob',
  sourceUrl: 'https://blsdb.de/food?foodId=43119',
  matchMethod: 'closest raw pork bratwurst class; total fat closely matches',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.16,
    'Omega-6 Fatty Acids (g)': 1.86,
    'Alcohol (g)': 0,
  },
  sourceTotalFatPer100g: 25.6,
  databaseTotalFatPer100g: 26,
  values: {
    'Omega-3 Fatty Acids (g)': 0.16,
    'Omega-6 Fatty Acids (g)': 1.86,
    'Alcohol (g)': 0,
  },
  confidence: 'medium; generic medium-coarse bratwurst is close in food class and total fat',
  unresolvedFields: ['Trans Fat (g)'],
  note: 'BLS bratwurst has 25.6 g total fat/100 g versus 26 g in the database. BLS fatty-acid profile includes a trans isomer but no total-trans-fat amount; that isomer is not substituted for total trans fat.',
  checkedOn,
});
upsert({
  databaseIndex: 34,
  databaseName: 'Brötchen, Weizen',
  source: 'BLS_4_0',
  sourceCode: 'B511000',
  sourceName: 'Weizenbrötchen',
  sourceUrl: 'https://blsdb.de/food?foodId=38113',
  matchMethod: 'exact normalized food name',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.0974,
    'Omega-6 Fatty Acids (g)': 0.6595,
    'Alcohol (g)': '<LOD',
  },
  values: {
    'Omega-3 Fatty Acids (g)': 0.0974,
    'Omega-6 Fatty Acids (g)': 0.6595,
  },
  sourceMarkers: { 'Alcohol (g)': '<LOD', 'Trans Fat (g)': 'not reported as a total; CoFID marker Tr' },
  note: 'Exact BLS wheat-roll entry. BLS alcohol is below detection and is not converted to zero. CoFID exact white soft-roll comparator reports alcohol numerically as 0.0 g; this explicit numeric value is used. CoFID trans fat is Tr and remains null.',
  checkedOn,
});
upsert({
  databaseIndex: 34,
  databaseName: 'Brötchen, Weizen',
  source: 'CoFID_2021',
  sourceCode: '11-1006',
  sourceName: 'Bread rolls, white, soft',
  sourceUrl: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
  matchMethod: 'plain white soft bread roll comparator; alcohol value explicit numeric zero',
  valueBasis: 'g per 100 g food',
  values: { 'Alcohol (g)': 0 },
  sourceMarkers: { 'Trans Fat (g)': 'Tr', 'Omega-3 Fatty Acids (g)': 'blank', 'Omega-6 Fatty Acids (g)': 'blank' },
  note: 'CoFID reports 0.0 g alcohol and Tr for total trans fat. The BLS exact wheat-roll row reports alcohol below detection; only CoFID numeric zero is transferred, while the trace trans marker stays unresolved.',
  checkedOn,
});
upsert({
  databaseIndex: 40,
  databaseName: 'Butterschmalz / Ghee',
  source: 'BLS_4_0',
  sourceCode: 'M160100',
  sourceName: 'Butterschmalz',
  sourceUrl: 'https://blsdb.de/food?foodId=38750',
  matchMethod: 'exact normalized food name',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.49,
    'Omega-6 Fatty Acids (g)': 1.76,
  },
  sourceTotalFatPer100g: 99.8,
  databaseTotalFatPer100g: 99.5,
  values: {
    'Omega-3 Fatty Acids (g)': 0.49,
    'Omega-6 Fatty Acids (g)': 1.76,
  },
  note: 'Exact BLS Butterschmalz row; its 99.8 g total fat/100 g closely matches database ghee at 99.5 g. BLS values are total omega-3 and total omega-6.',
  checkedOn,
});
upsert({
  databaseIndex: 43,
  databaseName: 'Cashewkerne',
  source: 'LogicalFoodComposition',
  sourceCode: 'RAW_UNROASTED_NUT',
  sourceName: 'Raw cashew nuts',
  sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
  matchMethod: 'plain raw plant food; no added oil',
  valueBasis: 'g per 100 g database reference portion',
  values: { 'Trans Fat (g)': 0 },
  logicalEvidence: {
    'Trans Fat (g)': {
      basis: 'Raw cashews contain no animal-derived fat or added hydrogenated oil. USDA SR Legacy identifies the exact raw-cashew item and reports zero for all listed trans isomers, with no positive total-trans amount. Numeric zero is composition-based, not a missing-source substitution.',
      sourceUrl: 'https://fdc.nal.usda.gov/food-details/170162/nutrients?type=SR%20Legacy',
    },
  },
  checkedOn,
});
upsert({
  databaseIndex: 54,
  databaseName: 'Datteln, getrocknet',
  source: 'USDA_FoodData_Central_SR_Legacy_2018',
  sourceCode: '09087',
  fdcId: 171726,
  sourceName: 'Dates, deglet noor',
  sourceUrl: `${fdc}171726/nutrients?type=SR%20Legacy`,
  supportingSourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg09.pdf',
  matchMethod: 'dried-date type; source total fat 0.39 g/100 g matches database 0.4 g/100 g',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.003,
    'Omega-6 Fatty Acids (g)': 0.016,
    'Total PUFA (g)': 0.019,
  },
  sourceTotalFatPer100g: 0.39,
  databaseTotalFatPer100g: 0.4,
  derivedOmegas: {
    omega3: 0.003,
    omega6: 0.016,
    totalPufa: 0.019,
    reconciled: true,
    method: 'USDA reported C18:3 n-3 plus C18:2 n-6; sum reconciles to total PUFA',
  },
  values: {
    'Omega-3 Fatty Acids (g)': 0.003,
    'Omega-6 Fatty Acids (g)': 0.016,
  },
  confidence: 'high; total fat and total PUFA match the USDA dried-date profile',
  note: 'USDA FoodData Central SR Legacy dried Deglet Noor dates are a close variety match; total fat is 0.39 g/100 g versus 0.4 g in the database. The C18:3 n-3 and C18:2 n-6 components sum to reported total PUFA 0.019 g/100 g.',
  checkedOn,
});
upsert({
  databaseIndex: 64,
  databaseName: 'Eiklar (roh)',
  source: 'LogicalFoodComposition',
  sourceCode: 'EGG_WHITE_ONLY',
  sourceName: 'Egg white, raw, fresh',
  sourceUrl: `${fdc}172183/nutrients?type=SR%20Legacy`,
  matchMethod: 'exact USDA SR Legacy egg-white-only food; no yolk or added fat',
  valueBasis: 'g per 100 g database reference portion',
  values: { 'Trans Fat (g)': 0 },
  logicalEvidence: {
    'Trans Fat (g)': {
      basis: 'The exact USDA egg-white-only record reports 0 g total PUFA and no total-trans amount; the database item excludes the yolk, the main egg lipid fraction, and has no added fat. Entered as a composition-based zero.',
      sourceUrl: `${fdc}172183/nutrients?type=SR%20Legacy`,
    },
  },
  checkedOn,
});
upsert({
  databaseIndex: 72,
  databaseName: 'Erbsendrink',
  source: 'LogicalFoodComposition',
  sourceCode: 'PLAIN_PEA_BEVERAGE',
  sourceName: 'Plain pea beverage',
  sourceUrl: 'https://fdc.nal.usda.gov/download-datasets/',
  matchMethod: 'non-fermented beverage identity; no alcoholic ingredient specified',
  valueBasis: 'g per 100 ml database reference portion',
  values: { 'Alcohol (g)': 0 },
  logicalEvidence: {
    'Alcohol (g)': { basis: 'Plain pea beverage is not a fermented drink and has no alcoholic ingredient in the database food identity.' },
  },
  unresolvedFields: ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)'],
  note: 'Alcohol is set to zero by food identity. Omega profile and total trans fat are product-formula dependent because the added oil is unspecified; no reliable generic composition was found.',
  checkedOn,
});
upsert({
  databaseIndex: 73,
  databaseName: 'Erbsenprotein, Isolat (Pulver)',
  source: 'LogicalFoodComposition',
  sourceCode: 'PLAIN_PEA_PROTEIN_ISOLATE',
  sourceName: 'Plain pea protein isolate powder',
  sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
  matchMethod: 'plain unfermented plant protein isolate; no added animal or hydrogenated fat specified',
  valueBasis: 'g per 100 g database reference portion',
  values: { 'Trans Fat (g)': 0, 'Alcohol (g)': 0 },
  logicalEvidence: {
    'Trans Fat (g)': { basis: 'Plain pea isolate contains no animal-derived fat or added hydrogenated oil; zero is composition-based.', sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat' },
    'Alcohol (g)': { basis: 'Plain pea protein isolate is unfermented and has no alcoholic ingredient.' },
  },
  unresolvedFields: ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)'],
  note: 'Total fatty-acid profile cannot be inferred from total fat alone; pea-isolate processing and residual oil vary. Omega values remain null.',
  checkedOn,
});
upsert({
  databaseIndex: 80,
  databaseName: 'Falafel, fertig (gefroren, roh)',
  source: 'LogicalFoodComposition',
  sourceCode: 'NONFERMENTED_FALAFEL',
  sourceName: 'Ready-made frozen raw falafel',
  sourceUrl: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
  matchMethod: 'non-fermented prepared plant food; no alcoholic ingredient specified',
  valueBasis: 'g per 100 g database reference portion',
  values: { 'Alcohol (g)': 0 },
  logicalEvidence: {
    'Alcohol (g)': { basis: 'Falafel is a non-fermented chickpea/herb food and no alcoholic ingredient is specified.' },
  },
  unresolvedFields: ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)'],
  note: 'Alcohol is set to zero by food identity. Fatty acids depend on the unspecified recipe and frying oil; raw frozen product composition remains unresolved.',
  checkedOn,
});
upsert({
  databaseIndex: 93,
  databaseName: 'Gelatine, Blatt / Pulver',
  source: 'BLS_4_0',
  sourceCode: 'R468000',
  sourceName: 'Gelatine/Speisegelatine',
  sourceUrl: 'https://blsdb.de/food?foodId=38333',
  matchMethod: 'exact gelatin food class',
  valueBasis: 'g per 100 g edible portion',
  sourceValuesPer100g: {
    'Omega-3 Fatty Acids (g)': 0.0012,
    'Omega-6 Fatty Acids (g)': 0.0027,
    'Alcohol (g)': 0,
  },
  sourceTotalFatPer100g: 0.1,
  databaseTotalFatPer100g: 0.1,
  values: {
    'Omega-3 Fatty Acids (g)': 0.0012,
    'Omega-6 Fatty Acids (g)': 0.0027,
  },
  note: 'BLS gelatin matches the database ingredient and total fat. Existing CoFID record independently supplies total trans fat 0 and alcohol 0; blank CoFID Omega markers are replaced only by the BLS numeric fatty-acid totals.',
  checkedOn,
});

const unresolved = new Map([
  [20, 'Closest BLS hard-cheese class used for Omega-3, Omega-6, and alcohol; total trans fat is not reported and natural dairy trans fat cannot be assumed zero.'],
  [31, 'Closest BLS medium-coarse bratwurst used for Omega-3, Omega-6, and alcohol; BLS does not report total trans fat.'],
  [34, 'Exact BLS wheat-roll Omegas; CoFID numeric alcohol zero. CoFID marks trans fat Tr, so it remains null.'],
  [67, 'No exact raw skinless duck-breast profile found. USDA meat-only duck comparator has materially different total fat, so no values transferred.'],
  [70, 'No exact dry yellow-pea nutrient profile located in the audited sources; do not substitute a different pea type without a stronger match.'],
  [72, 'Alcohol is zero. Omega values and trans fat depend on the unspecified product formula and oil.'],
  [73, 'Trans fat and alcohol are zero for plain isolate. Omega values vary with isolate and residual oil; no exact source located.'],
  [80, 'Alcohol is zero. Omega and trans values depend on recipe and oil; no close raw frozen product source located.'],
  [89, 'MEXT and USDA sources cover Omegas/alcohol but do not report total trans fat.'],
  [91, 'No exact low-fat cream-cheese profile found; available generic source has unresolved PUFA mismatch and is not transferred.'],
  [94, 'USDA canned vegetable cocktail is only a generic comparator, with 0.31 g total fat/100 g versus database 0.109 g/100 ml; no verified exact-product density or fatty-acid profile, so Omegas remain null.'],
]);
audit.uncoveredRecords = audit.uncoveredRecords
  .filter(item => unresolved.has(item.databaseIndex))
  .map(item => ({ ...item, reason: unresolved.get(item.databaseIndex) }));
for (const [databaseIndex, reason] of unresolved) {
  if (!audit.uncoveredRecords.some(item => item.databaseIndex === databaseIndex)) {
    audit.uncoveredRecords.push({ databaseIndex, databaseName: db[databaseIndex - 1].name, reason });
  }
}
audit.uncoveredRecords.sort((a, b) => a.databaseIndex - b.databaseIndex);
audit.checkedOn = checkedOn;
audit.status = 'partial_research';
audit.fieldCoverage = Object.fromEntries(fields.map(field => {
  const filled = db.slice(0, 100).filter(food => food.nutrients[field] != null).length;
  return [field, { filled, missing: 100 - filled, total: 100 }];
}));
audit.coverageNotes.BLS_4_0 = 'BLS 4.0 supplies total Omega-3, total Omega-6, and alcohol, but not total trans fat. Closest-match values are recorded with total-fat comparisons; markers such as <LOD are not converted to zero.';
audit.coverageNotes.Researched_updates_2026_09_24 = 'Added exact or documented close-match values for drained artichoke hearts, hard cheese, pork bratwurst, wheat roll, ghee, dates, gelatin, plus composition-based zeros where the food identity excludes trans fat or ethanol. Trace and below-detection markers remain nonnumeric. Generic vegetable-juice Omegas were withheld because of a substantial total-fat mismatch and unverified volume conversion.';

for (let i = 0; i < 100; i++) {
  for (const field of fields) {
    const value = db[i].nutrients[field];
    if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new Error(`Invalid numeric nutrient at ${i + 1}: ${field}=${value}`);
    }
  }
}

fs.writeFileSync(databasePath, JSON.stringify(db, null, 2) + '\n', 'utf8');
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');

const dbCheck = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const auditCheck = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
for (const update of updates) {
  for (const [field, value] of Object.entries(update.values)) {
    if (dbCheck[update.index - 1].nutrients[field] !== value) throw new Error(`Read-back failed: ${update.index} ${field}`);
  }
}
for (const field of fields) {
  const filled = dbCheck.slice(0, 100).filter(food => food.nutrients[field] != null).length;
  if (auditCheck.fieldCoverage[field].filled !== filled) throw new Error(`Coverage read-back failed for ${field}`);
}
if (auditCheck.records.filter(record => [13, 20, 31, 34, 40, 43, 54, 64, 72, 73, 80, 93].includes(record.databaseIndex)).length < 14) {
  throw new Error('Expected research records are missing from the batch audit.');
}

console.log(JSON.stringify({
  updated: updates.map(({ index, values }) => ({ index, name: dbCheck[index - 1].name, values })),
  fieldCoverage: auditCheck.fieldCoverage,
  unresolved: auditCheck.uncoveredRecords.length,
  filesWritten: ['database.json', 'Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json'],
}, null, 2));
