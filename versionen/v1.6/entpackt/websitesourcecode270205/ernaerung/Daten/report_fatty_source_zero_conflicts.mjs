import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const db = JSON.parse(fs.readFileSync(path.join(root, 'database.json'), 'utf8'));
const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const numericValue = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const byIndexField = new Map();
const add = (record, field, rawValue, batchNumber, evidenceType) => {
  const amount = numericValue(rawValue);
  if (amount == null) return;
  const key = `${record.databaseIndex}|${field}`;
  if (!byIndexField.has(key)) byIndexField.set(key, []);
  byIndexField.get(key).push({ source: record.source ?? 'unknown', sourceCode: record.sourceCode ?? null, sourceName: record.sourceName ?? null, batchNumber, amount, evidenceType });
};

for (let batchNumber = 1; batchNumber <= 16; batchNumber++) {
  const auditPath = path.join(root, 'Daten', `database_V2_fatty_acids_alcohol_batch_${String(batchNumber).padStart(3, '0')}_sources.json`);
  if (!fs.existsSync(auditPath)) continue;
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  for (const record of audit.records ?? []) {
    for (const field of fields) {
      add(record, field, record.sourceValuesPer100g?.[field], batchNumber, 'sourceValuesPer100g');
      add(record, field, record.values?.[field], batchNumber, 'values');
      add(record, field, record.addedValues?.[field], batchNumber, 'addedValues');
      const sourceConflict = record.conflicts?.[field]?.USDA_SR_Legacy;
      add(record, field, sourceConflict, batchNumber, 'sourceConflict');
    }
    if (record.sourceDetails) {
      for (const [component, field] of Object.entries({ FAPUN3: fields[0], FAPUN6: fields[1], ALC: fields[3] })) {
        add(record, field, record.sourceDetails[component]?.valuePer100g, batchNumber, `sourceDetails.${component}`);
      }
    }
    if (record.derivedOmegas) {
      add(record, fields[0], record.derivedOmegas.omega3, batchNumber, 'derivedOmegas');
      add(record, fields[1], record.derivedOmegas.omega6, batchNumber, 'derivedOmegas');
    }
    if (Array.isArray(record.sourceValues)) {
      for (const component of record.sourceValues) {
        const number = String(component.number);
        if (number === '605') add(record, fields[2], component.amountPer100g, batchNumber, 'USDA nutrient 605');
        if (number === '221') add(record, fields[3], component.amountPer100g, batchNumber, 'USDA nutrient 221');
      }
    }
  }
}

const conflicts = [];
for (const [key, rows] of byIndexField) {
  const hasZero = rows.some(row => row.amount === 0);
  const hasPositive = rows.some(row => row.amount > 0);
  if (!hasZero || !hasPositive) continue;
  const [index, field] = key.split('|');
  conflicts.push({ databaseIndex: Number(index), databaseName: db[Number(index) - 1]?.name, unit: db[Number(index) - 1]?.unit, field, currentValue: db[Number(index) - 1]?.nutrients?.[field] ?? null, evidence: rows });
}
console.log(JSON.stringify({ count: conflicts.length, conflicts }, null, 2));
