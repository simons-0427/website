import fs from 'node:fs';

const databasePath = 'database.json';
const auditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_002_sources.json';
const databaseIndex = 141;
const arrayIndex = databaseIndex - 1;
const value = 0.005;
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const food = database[arrayIndex];

if (!food || food.name !== 'Kabeljau / Dorsch (roh)' || food.unit !== 'g') {
  throw new Error(`Unexpected database row at ${databaseIndex}: ${food?.name}`);
}
if (food.nutrients['Trans Fat (g)'] !== null && food.nutrients['Trans Fat (g)'] !== value) {
  throw new Error('Refusing to overwrite an existing cod trans-fat value.');
}

let applied = 0;
if (food.nutrients['Trans Fat (g)'] === null) {
  food.nutrients['Trans Fat (g)'] = value;
  applied = 1;
}

const sourceRecord = {
  databaseIndex,
  databaseName: food.name,
  source: 'USDA_SR28_2015',
  sourceCode: 'USDA_SR28_15015',
  ndbNumber: '15015',
  sourceName: 'Fish, cod, Atlantic, raw',
  sourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg15.pdf',
  matchMethod: 'exact species and raw preparation match in USDA SR28',
  valueBasis: 'g per 100 g edible portion, matching the database reference unit',
  sourceValuesPer100g: { 'Trans Fat (g)': value },
  derivationCode: 'NC',
  sourceNutrientCode: '4',
  numberOfDataPoints: 0,
  calculation: 'USDA SR28 mean copied as reported: 0.005 g total trans fatty acids per 100 g.',
  values: { 'Trans Fat (g)': value },
  confidence: 'medium; exact USDA SR28 food match, but the mean is calculated/estimated rather than based on analyses',
  note: 'USDA SR28 reports 0.005 g/100 g for Atlantic cod, with derivation code NC and 0 data points. USDA explains that zero data points can indicate a calculated or estimated mean. A UK government fish analysis of raw cod independently reports total trans fatty acids below 0.01 g/100 g, consistent with this estimate as an upper-bound cross-check. CoFID Tr is not interpreted as zero.',
  checkedOn: '2026-09-24',
};

const prior = audit.records.find((record) => record.databaseIndex === databaseIndex && record.sourceCode === sourceRecord.sourceCode && record.values?.['Trans Fat (g)'] !== undefined);
if (!prior) audit.records.push(sourceRecord);
else if (prior.values['Trans Fat (g)'] !== value) throw new Error('Audit already contains a conflicting USDA cod value.');
audit.records.sort((a, b) => a.databaseIndex - b.databaseIndex);

audit.sources.USDA_SR28_AtlanticCodTrans = {
  url: sourceRecord.sourceUrl,
  citation: 'USDA National Nutrient Database for Standard Reference, Release 28, NDB 15015, Fish, cod, Atlantic, raw: total trans fatty acids 0.005 g/100 g; derivation code NC, zero data points.',
  valuesPer100g: { 'Trans Fat (g)': value },
  interpretation: 'USDA describes zero data points as a calculated or estimated mean, not a direct analytical mean.',
};
audit.sources.UK_Government_RawCodTransCrosscheck = {
  url: 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/167921/Nutrient_analysis_of_fish_and_fish_products_-_Summary_Report.pdf',
  citation: 'UK government nutrient analysis table, sample 1 Cod, raw, flesh only: trans fatty acids <0.01 g/100 g.',
  valuePer100g: '<0.01 g',
  role: 'Analytical cross-check only; the upper bound is not converted to zero or copied as an exact value.',
};

audit.coverageNotes.USDA_SR28_CodTransEstimate_2026_09_24 = 'Applied USDA SR28 Atlantic raw cod total-trans mean of 0.005 g/100 g as reported. It is an estimated mean (NC, zero data points), cross-checked against the UK government raw-cod analytical result below 0.01 g/100 g; CoFID trace notation remains distinct from numeric zero.';
audit.uncoveredRecords = audit.uncoveredRecords.filter((record) => record.databaseIndex !== databaseIndex || !record.missingFields.includes('Trans Fat (g)'));
audit.fieldCoverage['Trans Fat (g)'] = {
  filled: database.slice(100, 200).filter((entry) => entry.nutrients['Trans Fat (g)'] !== null && entry.nutrients['Trans Fat (g)'] !== undefined).length,
  missing: database.slice(100, 200).filter((entry) => entry.nutrients['Trans Fat (g)'] === null || entry.nutrients['Trans Fat (g)'] === undefined).length,
  total: 100,
};

if (applied) {
  audit.databaseApplication.appliedCount += 1;
  audit.databaseApplication.appliedByField['Trans Fat (g)'] += 1;
  audit.databaseApplication.appliedFrom += '; USDA SR28 Atlantic raw cod mean, cross-checked against UK government fish analysis';
  audit.databaseApplication.updates.push({ index: databaseIndex, name: food.name, field: 'Trans Fat (g)', value, source: 'USDA_SR28_15015' });
}

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ applied, databaseIndex, value, coverage: audit.fieldCoverage['Trans Fat (g)'], uncoveredRows: audit.uncoveredRecords.length }, null, 2));
