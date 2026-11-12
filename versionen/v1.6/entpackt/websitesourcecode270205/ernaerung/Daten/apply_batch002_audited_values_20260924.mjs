import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(here, '..', 'database.json');
const auditPath = path.join(here, 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const fields = [
  'Omega-3 Fatty Acids (g)',
  'Omega-6 Fatty Acids (g)',
  'Trans Fat (g)',
  'Alcohol (g)',
];

const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const candidates = new Map();
const skippedConflicts = [];

for (const record of audit.records ?? []) {
  const index = Number(record.databaseIndex);
  if (index < 101 || index > 200 || record.valueBasis !== 'per 100 g edible portion') continue;

  const food = database[index - 1];
  if (!food || food.name !== record.databaseName || food.unit !== 'g') continue;

  for (const [field, rawValue] of Object.entries(record.addedValues ?? {})) {
    if (!fields.includes(field)) continue;
    if (record.skippedByUnit?.[field] || record.conflicts?.[field]) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) continue;

    const key = `${index}|${field}`;
    const matches = candidates.get(key) ?? [];
    matches.push({ index, name: food.name, field, value, source: record.source });
    candidates.set(key, matches);
  }
}

const updates = [];
for (const matches of candidates.values()) {
  const { index, name, field } = matches[0];
  const distinctValues = [...new Set(matches.map((match) => match.value))];
  if (distinctValues.length !== 1) {
    skippedConflicts.push({ index, name, field, sources: matches });
    continue;
  }

  const nutrient = database[index - 1].nutrients[field];
  if (nutrient !== null && nutrient !== undefined) continue;

  const value = distinctValues[0];
  database[index - 1].nutrients[field] = value;
  updates.push({ index, name, field, value, sources: [...new Set(matches.map((match) => match.source))] });
}

const coverage = {};
for (const field of fields) {
  let filled = 0;
  for (let index = 101; index <= 200; index += 1) {
    if (database[index - 1].nutrients[field] !== null && database[index - 1].nutrients[field] !== undefined) filled += 1;
  }
  coverage[field] = { filled, missing: 100 - filled, total: 100 };
}

audit.fieldCoverage = coverage;
audit.databaseApplication = {
  appliedOn: '2026-09-24',
  appliedFrom: 'Existing source-audited addedValues with per-100-g basis and gram-unit database foods',
  appliedCount: updates.length,
  appliedByField: Object.fromEntries(fields.map((field) => [field, updates.filter((item) => item.field === field).length])),
  updates,
  skippedConflicts,
};

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ appliedCount: updates.length, appliedByField: audit.databaseApplication.appliedByField, coverage, skippedConflicts }, null, 2));
