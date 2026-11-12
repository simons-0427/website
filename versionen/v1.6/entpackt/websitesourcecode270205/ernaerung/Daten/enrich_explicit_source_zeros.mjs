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
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const componentFields = { FAPUN3: fields[0], FAPUN6: fields[1], ALC: fields[3] };
const numericValue = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const evidence = new Map();
const addEvidence = (record, field, rawValue, auditBatch) => {
  const amount = numericValue(rawValue);
  if (amount == null) return;
  const key = `${record.databaseIndex}|${field}`;
  if (!evidence.has(key)) evidence.set(key, []);
  evidence.get(key).push({
    source: record.source ?? 'unknown',
    sourceCode: record.sourceCode ?? null,
    sourceName: record.sourceName ?? null,
    sourceRowNumber: record.sourceRowNumber ?? null,
    auditBatch,
    amountPerSourceBasis: amount,
    sourceBasis: record.valueBasis ?? 'per 100 g from sourceValuesPer100g',
  });
};

for (let batch = 1; batch <= 16; batch++) {
  const auditPath = path.join(root, 'Daten', `database_V2_fatty_acids_alcohol_batch_${String(batch).padStart(3, '0')}_sources.json`);
  if (!fs.existsSync(auditPath)) continue;
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  for (const record of audit.records ?? []) {
    if (record.databaseIndex < first || record.databaseIndex > last) continue;
    for (const field of fields) {
      let rawValue = numericValue(record.sourceValuesPer100g?.[field]);
      if (rawValue == null) rawValue = numericValue(record.values?.[field]);
      if (rawValue == null) {
        const component = Object.entries(componentFields).find(([, mappedField]) => mappedField === field)?.[0];
        rawValue = numericValue(component ? record.sourceDetails?.[component]?.valuePer100g : null);
      }
      if (rawValue != null) addEvidence(record, field, rawValue, batch);
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
    proposed.push({
      databaseIndex: index,
      databaseName: item.name,
      field,
      value: 0,
      unit: item.unit,
      sourceEvidence: rows,
    });
    if (apply) item.nutrients[field] = 0;
  }
}

const batchAuditPath = path.join(root, 'Daten', `database_V2_fatty_acids_alcohol_batch_${String(batchNumber).padStart(3, '0')}_sources.json`);
const batchAudit = JSON.parse(fs.readFileSync(batchAuditPath, 'utf8'));
const coverage = {};
for (const field of fields) {
  const filled = db.slice(first - 1, last).filter(item => item.nutrients?.[field] != null).length;
  coverage[field] = { filled, missing: last - first + 1 - filled, total: last - first + 1 };
}
if (apply && proposed.length) {
  batchAudit.sources.ExplicitSourceZeroTransfer = {
    method: 'Transfer only explicit numeric zero values already present in a source audit. Zero is invariant under g/ml conversion. Source markers such as Tr, N, <LOD, <LOQ, dash, and blank are not treated as zero. Conflicting numeric source values remain unresolved.',
    checkedOn: '2026-09-23',
  };
  batchAudit.records.push(...proposed.map(row => ({
    databaseIndex: row.databaseIndex,
    databaseName: row.databaseName,
    source: 'ExplicitSourceZeroTransfer',
    valueBasis: 'Explicit source zero; conversion not needed because zero is unit-invariant',
    values: { [row.field]: 0 },
    sourceEvidence: row.sourceEvidence,
    checkedOn: '2026-09-23',
  })));
  batchAudit.fieldCoverage = coverage;
  batchAudit.checkedOn = '2026-09-23';
  batchAudit.status = 'partial_research';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(batchAuditPath, JSON.stringify(batchAudit, null, 2) + '\n', 'utf8');
}

const byField = Object.fromEntries(fields.map(field => [field, proposed.filter(row => row.field === field).length]));
console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', batchNumber, range: { first, last }, proposed: proposed.length, byField, conflicts: conflicts.length, coverage, rows: proposed, conflictingRows: conflicts }, null, 2));
