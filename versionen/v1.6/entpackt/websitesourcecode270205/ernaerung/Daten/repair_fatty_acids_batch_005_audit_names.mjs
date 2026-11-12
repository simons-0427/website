import fs from 'node:fs';

const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const auditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_005_sources.json';
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const repairs = [];
for (const row of audit.records) {
  if (!Number.isInteger(row.databaseIndex) || row.databaseIndex < 1 || row.databaseIndex > db.length) continue;
  const actual = db[row.databaseIndex - 1]?.name;
  if (actual && row.databaseName !== actual) {
    repairs.push({ databaseIndex: row.databaseIndex, previousName: row.databaseName, databaseName: actual, source: row.source, sourceName: row.sourceName });
    row.databaseName = actual;
  }
}
const remaining = audit.records.filter(row => Number.isInteger(row.databaseIndex) && db[row.databaseIndex - 1]?.name !== row.databaseName);
if (remaining.length) throw new Error(`Audit still has ${remaining.length} index/name mismatches.`);
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ auditPath, repairs, remainingMismatches: remaining.length }, null, 2));
