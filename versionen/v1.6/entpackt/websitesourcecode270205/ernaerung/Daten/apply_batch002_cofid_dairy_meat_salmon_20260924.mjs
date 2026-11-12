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
const cofidUrl = audit.sources.CoFID_2021.url;

audit.sources.CoFID_2021_Batch002_TransCrosswalk = {
  url: cofidUrl,
  citation: 'Public Health England (2021), McCance and Widdowson’s Composition of Foods Integrated Dataset (CoFID), nutrient columns K (fat), AD/AF (Omega-6/Omega-3), AT (total trans fatty acids), and X (alcohol); selected food codes and values per 100 g food.',
  sourceFoods: {
    '12-320': 'Milk, whole, UHT',
    '12-539': 'Cheese, cottage, plain',
    '12-379': 'Yogurt, low fat, plain',
    '12-184': 'Yogurt, whole milk, plain',
    '12-565': 'Cocoa powder, made up with whole milk',
    '12-355': 'Cheese, Edam',
    '12-358': 'Cheese, Gouda',
    '18-469': 'Beef, mince, raw',
    '18-606': 'Pork, mince, raw',
    '18-481': 'Lamb, mince, raw',
    '19-495': 'Frankfurter',
  },
  transMarkers: 'CoFID Tr, N, and blank cells were not converted to numeric zero.',
};
audit.sources.BLS_4_0_FrozenSalmon = {
  url: 'https://blsdb.de/food?foodId=40767&token=J6U8-XQK9-QJE2-S0F5-7AIH-CACI-TL3S-47T8',
  citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Lachs tiefgefroren (T410200), foodId 40767.',
  valuesPer100g: { totalFat: 11.2, omega3: 2.585, omega6: 0.875, alcohol: 0 },
};
audit.sources.CoFID_2021_Batch002_MixedMinceEstimate = {
  url: cofidUrl,
  citation: 'Public Health England (2021), CoFID, raw beef mince (18-469) and raw pork mince (18-606).',
  valuesPer100g: {
    beef: { totalFat: 16.2, trans: 0.81 },
    pork: { totalFat: 9.7, trans: 0.04 },
    assumed50_50Mixture: { totalFat: 12.95, trans: 0.425 },
  },
  limitation: '50:50 by weight is an explicit recipe assumption for generic mixed beef/pork mince; the resulting trans-fat value is a low-confidence estimate, not a measured mixed-mince value.',
};

const candidates = [
  { index: 104, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 closest food match', sourceName: 'Milk, whole, UHT (12-320)', matchMethod: 'whole_UHT_milk_trans_scaled_to_target_fat', confidence: 'medium', sourceFat: 3.9, sourceValues: { [fields.trans]: 0.15 }, applyFields: [fields.trans], notes: 'CoFID whole UHT milk reports 0.15 g total trans per 100 g and 3.9 g fat. Trans is scaled by target/source total fat (3.612/3.9) to the database 100 ml target basis; this is a milk-fat-profile estimate.' },
  { index: 105, sourceKey: 'CoFID_2021_Batch002_MixedMinceEstimate', source: 'CoFID 2021 component-based estimate', sourceName: 'Raw beef mince (18-469) + raw pork mince (18-606), 50:50 by weight', matchMethod: '50_50_beef_pork_mince_blend_scaled_by_total_fat', confidence: 'low', sourceFat: 12.95, sourceValues: { [fields.trans]: 0.425 }, applyFields: [fields.trans], notes: 'A 50:50-by-weight blend of CoFID raw beef mince (fat 16.2 g, trans 0.81 g) and raw pork mince (fat 9.7 g, trans 0.04 g) gives fat 12.95 g and trans 0.425 g/100 g. The blended trans value is scaled to target fat 20 g; the target recipe ratio is not known.' },
  { index: 132, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 closest food match', sourceName: 'Cheese, cottage, plain (12-539)', matchMethod: 'cottage_cheese_trans_scaled_by_total_fat', confidence: 'low', sourceFat: 6, sourceValues: { [fields.trans]: 0.29 }, applyFields: [fields.trans], notes: 'CoFID plain cottage cheese is the closest numeric trans-fat source. Its trans value is scaled from 6.0 g to target fat 4.3 g; cottage-cheese style and recipe may differ.' },
  { index: 138, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 closest food match', sourceName: 'Yogurt, low fat, plain (12-379)', matchMethod: 'lowfat_plain_yogurt_trans_scaled_by_total_fat', confidence: 'medium', sourceFat: 1, sourceValues: { [fields.trans]: 0.02 }, applyFields: [fields.trans], notes: 'Plain low-fat yogurt match. CoFID trans 0.02 g/100 g is scaled by target/source total fat (0.1/1.0); source and target fat percentages differ.' },
  { index: 139, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 closest food match', sourceName: 'Yogurt, whole milk, plain (12-184)', matchMethod: 'whole_milk_plain_yogurt_trans_scaled_by_total_fat', confidence: 'medium', sourceFat: 3, sourceValues: { [fields.trans]: 0.11 }, applyFields: [fields.trans], notes: 'Plain whole-milk yogurt match. CoFID trans 0.11 g/100 g is scaled by target/source total fat (3.5/3.0).' },
  { index: 145, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 closest food match', sourceName: 'Cocoa powder, made up with whole milk (12-565)', matchMethod: 'cocoa_milk_drink_trans_scaled_by_total_fat', confidence: 'medium', sourceFat: 3.9, sourceValues: { [fields.trans]: 0.13 }, applyFields: [fields.trans], notes: 'Closest CoFID cocoa-and-milk drink. Trans 0.13 g/100 g is scaled by target/source total fat (2.2/3.9); sweetness and recipe differ.' },
  { index: 157, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 direct food-class match', sourceName: 'Cheese, Edam (12-355)', matchMethod: 'Edam_trans_scaled_by_total_fat', confidence: 'medium', sourceFat: 26, sourceValues: { [fields.trans]: 0.7 }, applyFields: [fields.trans], notes: 'CoFID Edam trans 0.70 g/100 g is scaled by target/source total fat (27.8/26.0).' },
  { index: 159, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 direct food-class match', sourceName: 'Cheese, Gouda (12-358)', matchMethod: 'Gouda_trans_scaled_by_total_fat', confidence: 'medium', sourceFat: 30.6, sourceValues: { [fields.trans]: 1.05 }, applyFields: [fields.trans], notes: 'CoFID Gouda trans 1.05 g/100 g is scaled by target/source total fat (27.4/30.6); the target is young Gouda and source age is unspecified.' },
  { index: 185, sourceKey: 'BLS_4_0_FrozenSalmon', source: 'BLS 4.0 direct food match', sourceName: 'Lachs tiefgefroren (T410200)', matchMethod: 'same_frozen_salmon_scaled_by_total_fat', confidence: 'high', sourceFat: 11.2, sourceValues: { [fields.omega3]: 2.585, [fields.omega6]: 0.875 }, applyFields: [fields.omega3, fields.omega6], notes: 'Exact BLS frozen-salmon category. Omega totals are scaled to the target total fat (10/11.2); BLS source fatty-acid totals are formula-calculated.' },
  { index: 186, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 direct food-class match', sourceName: 'Lamb, mince, raw (18-481)', matchMethod: 'raw_lamb_mince_trans_scaled_by_total_fat', confidence: 'low', sourceFat: 13.3, sourceValues: { [fields.trans]: 1.1 }, applyFields: [fields.trans], notes: 'CoFID raw lamb mince reports trans 1.10 g/100 g at 13.3 g fat. Scaled to the target fat 23.4 g; target fat content is substantially higher, so this remains a low-confidence composition estimate.' },
  { index: 199, sourceKey: 'CoFID_2021_Batch002_TransCrosswalk', source: 'CoFID 2021 closest food-class analogue', sourceName: 'Frankfurter (19-495)', matchMethod: 'cooked_emulsified_sausage_trans_scaled_by_total_fat', confidence: 'low', sourceFat: 25.4, sourceValues: { [fields.trans]: 0.12 }, applyFields: [fields.trans], notes: 'CoFID Frankfurter is the closest cooked emulsified sausage with a numeric trans value. Scaled by target/source total fat (25/25.4); Lyoner/Fleischwurst recipe may differ.' },
];

const round6 = (value) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const updates = [];
const grouped = new Map();
const addedByField = Object.fromEntries(Object.values(fields).map((field) => [field, 0]));
for (const candidate of candidates) {
  const food = database[candidate.index - 1];
  if (!food) throw new Error(`No database row at index ${candidate.index}`);
  const targetFat = food.nutrients['Total Fat (g)'];
  if (!Number.isFinite(targetFat)) throw new Error(`Missing total fat at index ${candidate.index}`);
  for (const field of candidate.applyFields) {
    const value = round6(candidate.sourceValues[field] * targetFat / candidate.sourceFat);
    if (food.nutrients[field] != null) continue;
    food.nutrients[field] = value;
    updates.push({ index: candidate.index, name: food.name, field, value, source: candidate.sourceName });
    addedByField[field] += 1;
    const key = `${candidate.index}|${candidate.sourceKey}|${candidate.sourceName}`;
    const group = grouped.get(key) ?? { candidate, food, values: {} };
    group.values[field] = value;
    grouped.set(key, group);
  }
}

for (const { candidate, food, values } of grouped.values()) {
  audit.records.push({
    databaseIndex: candidate.index,
    databaseName: food.name,
    source: candidate.source,
    sourceName: candidate.sourceName,
    sourceUrl: audit.sources[candidate.sourceKey].url,
    matchMethod: candidate.matchMethod,
    confidence: candidate.confidence,
    valueBasis: food.unit === 'ml' ? 'g per 100 ml database reference amount' : 'g per 100 g edible food',
    sourceValuesPer100g: { totalFat: candidate.sourceFat, ...candidate.sourceValues },
    targetTotalFatPer100gOr100ml: food.nutrients['Total Fat (g)'],
    calculation: candidate.notes,
    values,
    checkedOn,
  });
}

audit.databaseApplication.updates.push(...updates);
audit.databaseApplication.appliedCount = audit.databaseApplication.updates.length;
audit.databaseApplication.appliedByField = Object.fromEntries(Object.values(fields).map((field) => [
  field,
  audit.databaseApplication.updates.filter((item) => item.field === field).length,
]));
audit.databaseApplication.appliedOn = checkedOn;
audit.databaseApplication.appliedFrom = `${audit.databaseApplication.appliedFrom ?? ''}; CoFID 2021 trans-fat values with total-fat scaling and exact BLS frozen-salmon omega values`;
audit.databaseApplication.lastBatch = {
  appliedCount: updates.length,
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
    reason: previousReasons.get(databaseIndex) ?? `Still missing: ${missing.join(', ')}; no numeric value with adequate source support has been applied.`,
  }] : [];
});
audit.status = audit.uncoveredRecords.length ? 'partial_research' : 'complete';
audit.checkedOn = checkedOn;
audit.coverageNotes.CoFID_BLS_internet_batch_002_2026_09_24 = 'Added official CoFID dairy, cheese, meat and sausage trans-fat data with target-fat scaling where food fat differed; mixed beef/pork mince is explicitly a low-confidence 50:50 estimate. Added exact BLS frozen-salmon Omegas with target-fat scaling. CoFID trace, N, and blank trans markers were left null.';

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ added: updates.length, addedByField, fieldCoverage: audit.fieldCoverage, stillUncovered: audit.uncoveredRecords.length }, null, 2));
