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

audit.sources.BLS_4_0_CalveLiverwurst = {
  url: 'https://blsdb.de/food?foodId=38901&token=U7X5-M9DL-UYFS-FO3Q-42KF-6JGF-8A3U-L87F',
  citation: 'Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, Kalbsleberwurst (W314000), foodId 38901.',
  valuesPer100g: { totalFat: 32, omega3: 0.365, omega6: 3.802, alcohol: 0 },
};
audit.sources.FDA_TransFat_FoodIdentityFungi = {
  url: 'https://www.fda.gov/food/food-additives-petitions/trans-fat',
  citation: 'U.S. Food and Drug Administration, Trans Fat overview; used as source-pathway context for plain single-ingredient foods with no ruminant or partially hydrogenated-fat ingredient indicated.',
  limitation: 'Identity-based inference, not an analytical trans-fat assay; applied only to plain baker’s yeast and nutritional yeast flakes.',
};

const candidates = [
  {
    index: 147,
    source: 'BLS 4.0 direct food-class match',
    sourceName: 'Kalbsleberwurst (W314000)',
    sourceUrl: audit.sources.BLS_4_0_CalveLiverwurst.url,
    matchMethod: 'same_calve_liverwurst_scaled_by_total_fat',
    confidence: 'high',
    sourceFat: 32,
    sourceValues: { [fields.omega3]: 0.365, [fields.omega6]: 3.802, [fields.alcohol]: 0 },
    applyFields: [fields.omega3, fields.omega6, fields.alcohol],
    notes: 'BLS has the exact food name/class and reports 0 g ethanol, Omega-3 0.365 g, Omega-6 3.802 g per 100 g. Omega totals are scaled by target/source total fat (28/32); ethanol remains 0.',
  },
  {
    index: 119,
    source: 'Food identity inference',
    sourceName: 'Fresh baker’s yeast, single-ingredient food',
    sourceUrl: audit.sources.FDA_TransFat_FoodIdentityFungi.url,
    matchMethod: 'single_ingredient_fungus_without_ruminant_or_hydrogenated_fat',
    confidence: 'low',
    sourceFat: 1.9,
    sourceValues: { [fields.trans]: 0 },
    applyFields: [fields.trans],
    notes: 'Assigned 0 g because plain fresh baker’s yeast is a single-ingredient non-ruminant food with no partially hydrogenated fat ingredient indicated. This is an identity-based inference, not a direct trans-fat assay.',
  },
  {
    index: 120,
    source: 'Food identity inference',
    sourceName: 'Fortified nutritional yeast flakes, single-ingredient yeast base',
    sourceUrl: audit.sources.FDA_TransFat_FoodIdentityFungi.url,
    matchMethod: 'single_ingredient_fungus_without_ruminant_or_hydrogenated_fat',
    confidence: 'low',
    sourceFat: 5,
    sourceValues: { [fields.trans]: 0 },
    applyFields: [fields.trans],
    notes: 'Assigned 0 g because plain nutritional yeast has a yeast-only base and no ruminant or partially hydrogenated fat ingredient indicated. Fortification does not imply added fat. This is an identity-based inference, not a direct trans-fat assay.',
  },
];

const round6 = (value) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const updates = [];
const added = [];
for (const item of candidates) {
  const food = database[item.index - 1];
  if (!food) throw new Error(`No database row at index ${item.index}`);
  const targetFat = food.nutrients['Total Fat (g)'];
  for (const field of item.applyFields) {
    let value = item.sourceValues[field];
    if (field === fields.omega3 || field === fields.omega6) value = round6(value * targetFat / item.sourceFat);
    if (food.nutrients[field] == null) {
      food.nutrients[field] = value;
      const update = { index: item.index, name: food.name, field, value, source: item.sourceName };
      updates.push(update);
      added.push({ item, food, field, value });
    }
  }
}

audit.databaseApplication.updates.push(...updates);
audit.databaseApplication.appliedCount = audit.databaseApplication.updates.length;
audit.databaseApplication.appliedByField = Object.fromEntries(Object.values(fields).map((field) => [
  field,
  audit.databaseApplication.updates.filter((item) => item.field === field).length,
]));
audit.databaseApplication.lastBatch = {
  appliedCount: updates.length,
  appliedByField: Object.fromEntries(Object.values(fields).map((field) => [field, updates.filter((item) => item.field === field).length])),
  alreadyPresent: [],
  missingTargets: [],
};

for (const item of candidates) {
  const values = Object.fromEntries(added.filter((entry) => entry.item === item).map((entry) => [entry.field, entry.value]));
  if (!Object.keys(values).length) continue;
  const food = database[item.index - 1];
  audit.records.push({
    databaseIndex: item.index,
    databaseName: food.name,
    source: item.source,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    matchMethod: item.matchMethod,
    confidence: item.confidence,
    valueBasis: 'g per 100 g edible food',
    sourceValuesPer100g: { totalFat: item.sourceFat, ...item.sourceValues },
    targetTotalFatPer100g: food.nutrients['Total Fat (g)'],
    calculation: item.notes,
    values,
    checkedOn,
  });
}

const batch = database.slice(audit.range.first - 1, audit.range.last);
audit.fieldCoverage = Object.fromEntries(Object.values(fields).map((field) => {
  const filled = batch.filter((food) => food.nutrients[field] != null).length;
  return [field, { filled, missing: batch.length - filled, total: batch.length }];
}));
const priorReasons = new Map((audit.uncoveredRecords ?? []).map((item) => [item.databaseIndex, item.reason]));
audit.uncoveredRecords = batch.flatMap((food, offset) => {
  const databaseIndex = audit.range.first + offset;
  const missing = Object.values(fields).filter((field) => food.nutrients[field] == null);
  return missing.length ? [{
    databaseIndex,
    databaseName: food.name,
    reason: priorReasons.get(databaseIndex) ?? `Still missing: ${missing.join(', ')}; no numeric value with adequate source support has been applied.`,
  }] : [];
});
audit.status = audit.uncoveredRecords.length ? 'partial_research' : 'complete';
audit.checkedOn = checkedOn;
audit.coverageNotes.USDA_and_BLS_internet_batch_002_2026_09_24 += ' Added exact BLS Kalbsleberwurst omega and alcohol values, scaled only for the target fat difference. Plain baker’s yeast and nutritional yeast trans-fat zeros are explicitly marked as low-confidence food-identity inferences.';

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ added: updates.length, updates, fieldCoverage: audit.fieldCoverage, stillUncovered: audit.uncoveredRecords.length }, null, 2));
