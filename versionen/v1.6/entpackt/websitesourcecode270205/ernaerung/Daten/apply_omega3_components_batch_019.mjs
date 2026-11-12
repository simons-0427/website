import fs from 'node:fs';

const sourcePath = 'Daten/apply_omega3_components_batch_007.mjs';
const replaceOnce = (text, search, replacement) => {
  if (!text.includes(search)) throw new Error('Expected source snippet not found: ' + search.slice(0, 80));
  return text.replace(search, replacement);
};

let source = fs.readFileSync(sourcePath, 'utf8');
source = replaceOnce(source, 'const firstIndex = 501;', 'const firstIndex = 101;');
source = replaceOnce(source, 'const lastIndex = 600;', 'const lastIndex = 200;');
source = replaceOnce(source, 'fatty_acids_alcohol_batch_006_sources', 'fatty_acids_alcohol_batch_002_sources');
source = replaceOnce(source, 'omega3_components_batch_007', 'omega3_components_batch_019');

const captured = [];
const originalLog = console.log;
console.log = (...args) => captured.push(args.join(' '));
try {
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
} finally {
  console.log = originalLog;
}

const result = JSON.parse(captured.at(-1));
originalLog(JSON.stringify({
  mode: result.mode,
  range: [101, 200],
  blsCodes: result.blsCodes,
  blsProfilesRead: result.blsProfilesRead,
  fieldCoverage: result.fieldCoverage,
  changedRows: result.changedRows,
  changedCells: result.changedCells,
  omega3Corrections: result.omega3Corrections,
  unresolvedRows: result.unresolvedRows,
  conflicts: (result.conflicts ?? []).map(row => ({ databaseIndex: row.databaseIndex, food: row.food, missing: row.missing, conflict: row.conflict })),
}, null, 2));
