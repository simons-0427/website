import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_013_sources.json');
const mapPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_013_supplement.json');
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const tolerance = 0.000001;

const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

if (!Array.isArray(database) || database.length !== 1516) throw new Error('Expected 1,516 database records.');
if (map.batch !== 13 || map.range.first !== 1201 || map.range.last !== 1300 || audit.batch !== 13) {
  throw new Error('Supplement map and audit must be limited to batch 13, indexes 1201-1300.');
}

for (const mapping of map.mappings) {
  if (mapping.databaseIndex < 1201 || mapping.databaseIndex > 1300) throw new Error(`Out-of-batch index ${mapping.databaseIndex}.`);
  const food = database[mapping.databaseIndex - 1];
  if (food.name !== mapping.databaseName || food.unit !== mapping.unit) throw new Error(`Name or unit mismatch at index ${mapping.databaseIndex}.`);
  for (const [field, value] of Object.entries(mapping.values)) {
    if (!fields.includes(field) || !Number.isFinite(value) || value < 0) throw new Error(`Invalid mapping for ${field} at ${mapping.databaseIndex}.`);
    const current = food.nutrients[field];
    if (current != null && Math.abs(Number(current) - value) > tolerance) {
      throw new Error(`Refusing to overwrite ${field} at ${mapping.databaseIndex}: ${current} != ${value}.`);
    }
  }
}

for (const [key, metadata] of Object.entries(map.sources)) {
  if (!audit.sources[key]) audit.sources[key] = metadata;
}
audit.coverageNotes.SupplementalBatch013 = 'Supplemental web and composition-table research for batch 13. Numeric zeros were copied only from explicit source zeros. Converted values and analogues are identified per record.';

for (const mapping of map.mappings) {
  const food = database[mapping.databaseIndex - 1];
  for (const [field, value] of Object.entries(mapping.values)) {
    if (food.nutrients[field] == null) food.nutrients[field] = value;
  }

  const existing = audit.records.find(record =>
    Number(record.databaseIndex) === mapping.databaseIndex &&
    record.source === mapping.source &&
    String(record.sourceCode) === String(mapping.sourceCode)
  );
  const priorRaw = existing?.sourceValuesPer100g ?? {};
  const priorValues = existing?.values ?? {};
  const record = {
    databaseIndex: mapping.databaseIndex,
    databaseName: mapping.databaseName,
    source: mapping.source,
    sourceCode: mapping.sourceCode,
    sourceName: mapping.sourceName,
    matchMethod: mapping.matchMethod,
    confidence: mapping.confidence,
    sourceValuesPer100g: mapping.sourceValuesPer100g ? { ...priorRaw, ...mapping.sourceValuesPer100g } : priorRaw,
    targetTotalFatPer100g: mapping.targetTotalFatPer100g ?? existing?.targetTotalFatPer100g ?? null,
    density: mapping.density ?? existing?.density ?? null,
    valueBasis: mapping.valueBasis,
    conversion: mapping.conversion,
    values: { ...priorValues, ...mapping.values },
    checkedOn: map.checkedOn,
  };
  if (mapping.sourceValuesPer100ml) record.sourceValuesPer100ml = mapping.sourceValuesPer100ml;
  if (existing) {
    Object.assign(existing, record);
    if (mapping.source === 'BLS_4_0') existing.note = `Supplemental conversion applied: ${mapping.conversion}`;
  } else {
    audit.records.push(record);
  }
}

audit.checkedOn = map.checkedOn;
audit.fieldCoverage = Object.fromEntries(fields.map(field => {
  const filled = database.slice(1200, 1300).filter(food => food.nutrients[field] != null).length;
  return [field, { filled, missing: 100 - filled, total: 100 }];
}));

for (const mapping of map.mappings) {
  const food = database[mapping.databaseIndex - 1];
  for (const [field, value] of Object.entries(mapping.values)) {
    if (Math.abs(Number(food.nutrients[field]) - value) > tolerance) throw new Error(`Read-back validation failed at ${mapping.databaseIndex}, ${field}.`);
  }
}

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  batch: 13,
  sourceRecords: map.mappings.length,
  nutrientValues: map.mappings.reduce((sum, mapping) => sum + Object.keys(mapping.values).length, 0),
  coverage: audit.fieldCoverage,
}, null, 2));
