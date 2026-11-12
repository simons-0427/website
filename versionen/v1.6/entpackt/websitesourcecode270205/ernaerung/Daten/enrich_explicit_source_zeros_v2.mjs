import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const batchNumber = Number(process.argv[2]);
const first = (batchNumber - 1) * 100 + 1;
const last = Math.min(batchNumber * 100, 1516);
const apply = process.argv.includes('--apply');
if (!Number.isInteger(batchNumber) || batchNumber < 1 || batchNumber > 16) throw new Error('Batch number must be 1 through 16');

const dbPath = path.join(root, 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const auditPath = path.join(root, 'Daten', `database_V2_fatty_acids_alcohol_batch_${String(batchNumber).padStart(3, '0')}_sources.json`);
const batchAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const componentFields = { FAPUN3: fields[0], FAPUN6: fields[1], ALC: fields[3] };
const sourceNutrients = {
  [fields[2]]: new Set(['605']),
  [fields[3]]: new Set(['221']),
};
const numericValue = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const evidence = new Map();
const addEvidence = (record, field, rawValue, auditBatch, basis = 'source reported value') => {
  const amount = numericValue(rawValue);
  if (amount == null) return;
  const key = `${record.databaseIndex}|${field}`;
  if (!evidence.has(key)) evidence.set(key, []);
  evidence.get(key).push({
    source: record.source ?? 'unknown',
    sourceCode: record.sourceCode ?? null,
    sourceName: record.sourceName ?? null,
    auditBatch,
    amountPerSourceBasis: amount,
    sourceBasis: basis,
  });
};

for (let batch = 1; batch <= 16; batch++) {
  const sourceAuditPath = path.join(root, 'Daten', `database_V2_fatty_acids_alcohol_batch_${String(batch).padStart(3, '0')}_sources.json`);
  if (!fs.existsSync(sourceAuditPath)) continue;
  const audit = JSON.parse(fs.readFileSync(sourceAuditPath, 'utf8'));
  for (const record of audit.records ?? []) {
    if (record.databaseIndex < first || record.databaseIndex > last) continue;
    for (const field of fields) {
      addEvidence(record, field, record.sourceValuesPer100g?.[field], batch, 'sourceValuesPer100g');
      addEvidence(record, field, record.values?.[field], batch, 'values');
      addEvidence(record, field, record.addedValues?.[field], batch, 'addedValues');
      addEvidence(record, field, record.skippedByUnit?.[field]?.valuePer100g, batch, 'skippedByUnit.valuePer100g');
      const conflict = record.conflicts?.[field];
      if (conflict && typeof conflict === 'object') {
        addEvidence(record, field, conflict.USDA_SR_Legacy, batch, 'conflicts.USDA_SR_Legacy');
      }
      const component = Object.entries(componentFields).find(([, mappedField]) => mappedField === field)?.[0];
      addEvidence(record, field, component ? record.sourceDetails?.[component]?.valuePer100g : null, batch, `sourceDetails.${component}`);
      if (field === fields[0]) addEvidence(record, field, record.derivedOmegas?.omega3, batch, 'derivedOmegas.omega3');
      if (field === fields[1]) addEvidence(record, field, record.derivedOmegas?.omega6, batch, 'derivedOmegas.omega6');
      const acceptedNutrients = sourceNutrients[field];
      if (acceptedNutrients && Array.isArray(record.sourceValues)) {
        for (const value of record.sourceValues) {
          if (acceptedNutrients.has(String(value.number))) addEvidence(record, field, value.amountPer100g, batch, `USDA nutrient ${value.number}`);
        }
      }
    }
  }
}

const proposed = [];
const conflicts = [];
for (let index = first; index <= last; index++) {
  const item = db[index - 1];
  for (const field of fields) {
    if (item.nutrients?.[field] != null) continue;
    const rows = evidence.get(`${index}|${field}`) ?? [];
    if (!rows.some(row => row.amountPerSourceBasis === 0)) continue;
    if (rows.some(row => row.amountPerSourceBasis !== 0)) {
      conflicts.push({ databaseIndex: index, databaseName: item.name, field, evidence: rows });
      continue;
    }
    proposed.push({ databaseIndex: index, databaseName: item.name, field, value: 0, unit: item.unit, sourceEvidence: rows });
    if (apply) item.nutrients[field] = 0;
  }
}

const coverage = Object.fromEntries(fields.map(field => {
  const filled = db.slice(first - 1, last).filter(item => item.nutrients?.[field] != null).length;
  return [field, { filled, missing: last - first + 1 - filled, total: last - first + 1 }];
}));
if (apply) {
  batchAudit.sources.ExplicitSourceZeroTransfer = {
    method: 'Transfer numeric source zero only if every numeric value or direct source component across BLS, CoFID, and USDA evidence for that food and field is zero. USDA derived values, source components, conflicts, and positive values skipped for unit conversion are checked. Tr, N, <LOD, <LOQ, dash, blank, or conflicting evidence do not become zero.',
    checkedOn: '2026-09-23',
  };
  batchAudit.records.push(...proposed.map(row => ({
    databaseIndex: row.databaseIndex,
    databaseName: row.databaseName,
    source: 'ExplicitSourceZeroTransfer',
    valueBasis: 'All numeric source evidence is zero; zero is unit-invariant',
    values: { [row.field]: 0 },
    sourceEvidence: row.sourceEvidence,
    checkedOn: '2026-09-23',
  })));
  batchAudit.zeroTransferConflicts = conflicts;
  batchAudit.fieldCoverage = coverage;
  batchAudit.checkedOn = '2026-09-23';
  batchAudit.status = 'partial_research';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(batchAudit, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'preview',
  batchNumber,
  range: { first, last },
  proposed: proposed.length,
  byField: Object.fromEntries(fields.map(field => [field, proposed.filter(row => row.field === field).length])),
  conflicts: conflicts.length,
  coverage,
  rows: proposed,
  conflictingRows: conflicts,
}, null, 2));
