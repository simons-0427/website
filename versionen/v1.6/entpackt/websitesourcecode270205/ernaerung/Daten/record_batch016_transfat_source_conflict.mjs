import fs from 'node:fs';
import path from 'node:path';

const auditPath = path.join(path.resolve('.'), 'Daten', 'database_V2_fatty_acids_alcohol_batch_016_sources.json');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const index = 1503;
const field = 'Trans Fat (g)';
const record = audit.records.find(row => row.databaseIndex === index && row.source === 'CoFID_2021');
if (!record || record.sourceMarkers?.[field] !== 'Tr') {
  throw new Error('Expected the exact CoFID steamed farmed-salmon trace marker was not found');
}

record.internetCrossChecks = [
  {
    source: 'Matvaretabellen, Norwegian Food Composition Table',
    sourceUrl: 'https://www.matvaretabellen.no/en/salmon-farmed-slices-simmered/',
    sourceName: 'Salmon, farmed, slices, simmered',
    sourceFoodId: '04.225',
    field,
    valuePer100g: 0,
    sourceMethod: 'MI0002, EuroFIR recipe calculation procedure',
    comparison: 'Same farmed Atlantic salmon, simmered rather than steamed.',
    assessment: 'Numeric zero from a close official comparator conflicts with the exact CoFID target marker Tr. Retain null in the database until a numeric value for the exact steamed food or a justified trace conversion is available.',
    checkedOn: '2026-09-24',
  },
];

audit.unresolvedFields = [
  ...(audit.unresolvedFields ?? []).filter(row => !(row.databaseIndex === index && row.field === field)),
  {
    databaseIndex: index,
    databaseName: 'Lachs, Zucht, gedämpft',
    field,
    reason: 'Exact CoFID source code 16-358 reports Tr, not a numeric amount. Matvaretabellen reports 0 g for a closely related farmed, simmered Atlantic salmon, but its recipe-calculated value does not resolve the exact-source trace marker.',
    checkedOn: '2026-09-24',
  },
];
audit.checkedOn = '2026-09-24';

fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
const readBack = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (!readBack.records.find(row => row.databaseIndex === index)?.internetCrossChecks?.some(row => row.valuePer100g === 0)) {
  throw new Error('Internet cross-check read-back verification failed');
}
if (!readBack.unresolvedFields?.some(row => row.databaseIndex === index && row.field === field)) {
  throw new Error('Unresolved-field read-back verification failed');
}
console.log(JSON.stringify({ recorded: { databaseIndex: index, field, exactMarker: 'Tr', comparatorValue: 0 }, databaseValueRemainsNull: true, readBackVerified: true }, null, 2));
