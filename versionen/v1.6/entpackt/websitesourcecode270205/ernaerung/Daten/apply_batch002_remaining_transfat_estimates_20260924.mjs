import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.join(here, '..', 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const checkedOn = '2026-09-24';
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const trans = 'Trans Fat (g)';
const cofidUrl = audit.sources.CoFID_2021.url;

audit.sources.CoFID_2021_Batch002_TransEstimates = {
  url: cofidUrl,
  citation: 'Public Health England (2021), McCance and Widdowson’s Composition of Foods Integrated Dataset (CoFID), selected rows per 100 g edible food.',
  sourceFoods: {
    '12-320': { name: 'Milk, whole, UHT', totalFat: 3.9, trans: 0.15 },
    '16-418': { name: 'Salmon, red, canned in brine, drained', totalFat: 7.3, trans: 0.01 },
  },
};

const candidates = [
  {
    index: 142,
    sourceName: 'Milk, whole, UHT (CoFID 12-320), milk-fat-profile estimate',
    matchMethod: 'milk_fat_trans_profile_scaled_to_coffee_recipe_fat',
    confidence: 'low',
    sourceFat: 3.9,
    sourceTrans: 0.15,
    notes: 'CoFID whole UHT milk reports 0.15 g trans/100 g at 3.9 g total fat. Because the recipe beverage fat is dairy-derived, the trans-to-total-fat ratio is applied to the target fat 0.31 g/100 ml. This is a recipe estimate, not a direct coffee measurement.',
  },
  {
    index: 176,
    sourceName: 'Milk, whole, UHT (CoFID 12-320), milk-fat-profile estimate',
    matchMethod: 'whole_milk_fat_trans_profile_scaled_to_evaporated_milk_fat',
    confidence: 'low',
    sourceFat: 3.9,
    sourceTrans: 0.15,
    notes: 'CoFID whole UHT milk provides a numeric trans-fat profile; whole evaporated milk is a closer class but CoFID marks its trans value N. The UHT milk trans-to-fat ratio is applied to target fat 8.1 g/100 ml. This is an estimate, not a direct condensed-milk measurement.',
  },
  {
    index: 184,
    sourceName: 'Salmon, red, canned in brine, drained (CoFID 16-418)',
    matchMethod: 'canned_salmon_in_brine_trans_scaled_by_total_fat',
    confidence: 'medium',
    sourceFat: 7.3,
    sourceTrans: 0.01,
    notes: 'CoFID red canned salmon drained is a close canned-fish analogue to salmon in its own juice. Its 0.01 g trans value is scaled by target/source total fat (7.4/7.3); packing liquid differs.' ,
  },
];

const round6 = (value) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const updates = [];
const newRecords = [];
for (const candidate of candidates) {
  const food = database[candidate.index - 1];
  if (!food) throw new Error(`No database row at index ${candidate.index}`);
  if (food.nutrients[trans] != null) continue;
  const targetFat = food.nutrients['Total Fat (g)'];
  if (!Number.isFinite(targetFat)) throw new Error(`Missing total fat at index ${candidate.index}`);
  const value = round6(candidate.sourceTrans * targetFat / candidate.sourceFat);
  food.nutrients[trans] = value;
  updates.push({ index: candidate.index, name: food.name, field: trans, value, source: candidate.sourceName });
  newRecords.push({ candidate, food, value, targetFat });
}

audit.records.push(...newRecords.map(({ candidate, food, value, targetFat }) => ({
  databaseIndex: candidate.index,
  databaseName: food.name,
  source: 'CoFID 2021 closest food match',
  sourceName: candidate.sourceName,
  sourceUrl: cofidUrl,
  matchMethod: candidate.matchMethod,
  confidence: candidate.confidence,
  valueBasis: food.unit === 'ml' ? 'g per 100 ml database reference amount' : 'g per 100 g edible food',
  sourceValuesPer100g: { totalFat: candidate.sourceFat, [trans]: candidate.sourceTrans },
  targetTotalFatPer100gOr100ml: targetFat,
  calculation: candidate.notes,
  values: { [trans]: value },
  checkedOn,
})));

audit.databaseApplication.updates.push(...updates);
audit.databaseApplication.appliedCount = audit.databaseApplication.updates.length;
audit.databaseApplication.appliedByField = Object.fromEntries(
  ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', trans, 'Alcohol (g)'].map((field) => [
    field,
    audit.databaseApplication.updates.filter((item) => item.field === field).length,
  ]),
);
audit.databaseApplication.appliedOn = checkedOn;
audit.databaseApplication.appliedFrom = `${audit.databaseApplication.appliedFrom ?? ''}; additional CoFID milk-fat-profile and canned-salmon trans-fat estimates`;
audit.databaseApplication.lastBatch = {
  appliedCount: updates.length,
  appliedByField: Object.fromEntries(['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', trans, 'Alcohol (g)'].map((field) => [field, updates.filter((item) => item.field === field).length])),
  alreadyPresent: [],
  missingTargets: [],
};

const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', trans, 'Alcohol (g)'];
const batch = database.slice(audit.range.first - 1, audit.range.last);
audit.fieldCoverage = Object.fromEntries(fields.map((field) => {
  const filled = batch.filter((food) => food.nutrients[field] != null).length;
  return [field, { filled, missing: batch.length - filled, total: batch.length }];
}));
const priorReasons = new Map((audit.uncoveredRecords ?? []).map((item) => [item.databaseIndex, item.reason]));
audit.uncoveredRecords = batch.flatMap((food, offset) => {
  const databaseIndex = audit.range.first + offset;
  const missing = fields.filter((field) => food.nutrients[field] == null);
  return missing.length ? [{ databaseIndex, databaseName: food.name, reason: priorReasons.get(databaseIndex) ?? `Still missing: ${missing.join(', ')}; no numeric value with adequate source support has been applied.` }] : [];
});
audit.status = audit.uncoveredRecords.length ? 'partial_research' : 'complete';
audit.checkedOn = checkedOn;
audit.coverageNotes.CoFID_BLS_internet_batch_002_2026_09_24 += ' Added low-confidence milk-fat-profile estimates for coffee with milk and evaporated milk plus a medium-confidence canned-salmon trans estimate. CoFID N/Tr/blank markers remain nonnumeric.';

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ added: updates.length, updates, fieldCoverage: audit.fieldCoverage, stillUncovered: audit.uncoveredRecords.length }, null, 2));
