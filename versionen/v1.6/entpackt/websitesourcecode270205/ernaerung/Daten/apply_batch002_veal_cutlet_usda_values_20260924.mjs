import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.join(here, '..', 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const checkedOn = '2026-09-24';
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const fieldOmega3 = 'Omega-3 Fatty Acids (g)';
const fieldOmega6 = 'Omega-6 Fatty Acids (g)';
const fieldTrans = 'Trans Fat (g)';

audit.sources.USDA_SR28_VealCutlet = {
  url: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg17.pdf',
  citation: 'USDA Agricultural Research Service, National Nutrient Database for Standard Reference Release 28, NDB 17426, Veal, leg, top round, cap off, cutlet, boneless, raw; per 100 g edible portion.',
  valuesPer100g: {
    totalFat: 2.07,
    linoleicN6: 0.083,
    arachidonic20_4Undifferentiated: 0.013,
    '18_3Undifferentiated': 0.003,
    totalPufa: 0.107,
    totalTrans: 0.09,
  },
  derivation: {
    omega3: '18:3 undifferentiated is treated as the small n-3 component; USDA does not separately identify its positional isomer in this row.',
    omega6: 'Sum of explicit 18:2 n-6 (0.083) and 20:4 undifferentiated (0.013), treated as arachidonic n-6; omega-family total 0.096 g/100 g.',
    reconciliation: 'Derived family sum 0.099 g versus total PUFA 0.107 g; residual 0.008 g/100 g, within the audit tolerance of 0.01 g.',
  },
  conflict: 'CoFID 2021 raw veal escalope (18-486) marks total trans as Tr, while USDA SR28 reports 0.09 g/100 g for a close raw boneless veal cutlet. The numeric USDA result is applied as a scaled estimate and the conflict is retained here.',
};

const food = database[145];
if (!food || food.name !== 'Kalbfleisch, Schnitzel (roh)') throw new Error('Unexpected target at database index 146');
const targetFat = food.nutrients['Total Fat (g)'];
if (!Number.isFinite(targetFat)) throw new Error('Target total fat is missing');
const sourceFat = 2.07;
const round6 = (value) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const sourceValues = {
  [fieldOmega3]: 0.003,
  [fieldOmega6]: 0.096,
  [fieldTrans]: 0.09,
};
const updates = [];
for (const [field, sourceValue] of Object.entries(sourceValues)) {
  if (food.nutrients[field] != null) continue;
  const value = round6(sourceValue * targetFat / sourceFat);
  food.nutrients[field] = value;
  updates.push({ index: 146, name: food.name, field, value, source: 'Veal, leg, top round, cap off, cutlet, boneless, raw (NDB 17426)' });
  audit.records.push({
    databaseIndex: 146,
    databaseName: food.name,
    source: 'USDA SR28 close direct food match',
    sourceName: 'Veal, leg, top round, cap off, cutlet, boneless, raw (NDB 17426)',
    sourceUrl: audit.sources.USDA_SR28_VealCutlet.url,
    matchMethod: 'raw_veal_cutlet_scaled_by_total_fat',
    confidence: field === fieldOmega3 ? 'low' : 'medium',
    valueBasis: 'g per 100 g edible food',
    sourceValuesPer100g: {
      totalFat: sourceFat,
      [field]: sourceValue,
      omega3Omega6Derivation: audit.sources.USDA_SR28_VealCutlet.derivation,
    },
    targetTotalFatPer100g: targetFat,
    calculation: `USDA cutlet value scaled by target/source total fat (${targetFat}/${sourceFat}). ${audit.sources.USDA_SR28_VealCutlet.conflict}`,
    values: { [field]: value },
    checkedOn,
  });
}

audit.databaseApplication.updates.push(...updates);
audit.databaseApplication.appliedCount = audit.databaseApplication.updates.length;
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
audit.databaseApplication.appliedByField = Object.fromEntries(fields.map((field) => [
  field,
  audit.databaseApplication.updates.filter((item) => item.field === field).length,
]));
audit.databaseApplication.appliedOn = checkedOn;
audit.databaseApplication.appliedFrom = `${audit.databaseApplication.appliedFrom ?? ''}; USDA SR28 direct raw veal cutlet fatty-acid components and total trans value, scaled by target total fat`;
audit.databaseApplication.lastBatch = {
  appliedCount: updates.length,
  appliedByField: Object.fromEntries(fields.map((field) => [field, updates.filter((item) => item.field === field).length])),
  alreadyPresent: [],
  missingTargets: [],
};

const batch = database.slice(audit.range.first - 1, audit.range.last);
audit.fieldCoverage = Object.fromEntries(fields.map((field) => {
  const filled = batch.filter((item) => item.nutrients[field] != null).length;
  return [field, { filled, missing: batch.length - filled, total: batch.length }];
}));
const oldReasons = new Map((audit.uncoveredRecords ?? []).map((item) => [item.databaseIndex, item.reason]));
audit.uncoveredRecords = batch.flatMap((item, offset) => {
  const databaseIndex = audit.range.first + offset;
  const missing = fields.filter((field) => item.nutrients[field] == null);
  return missing.length ? [{ databaseIndex, databaseName: item.name, reason: oldReasons.get(databaseIndex) ?? `Still missing: ${missing.join(', ')}; no numeric value with adequate source support has been applied.` }] : [];
});
audit.status = audit.uncoveredRecords.length ? 'partial_research' : 'complete';
audit.checkedOn = checkedOn;
audit.coverageNotes.USDA_and_BLS_internet_batch_002_2026_09_24 += ' Added USDA SR28 raw veal cutlet Omegas from its reported fatty-acid components and 0.09 g total trans. Omega-3 relies on the 18:3 undifferentiated component; the conflicting CoFID trace marker is documented.';

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ updates, fieldCoverage: audit.fieldCoverage, stillUncovered: audit.uncoveredRecords.length }, null, 2));
