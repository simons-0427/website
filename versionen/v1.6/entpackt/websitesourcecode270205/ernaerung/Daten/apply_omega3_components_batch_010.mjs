import fs from 'node:fs';

const sourcePath = 'Daten/apply_omega3_components_batch_007.mjs';
const replaceOnce = (text, search, replacement) => {
  if (!text.includes(search)) throw new Error('Expected source snippet not found: ' + search.slice(0, 80));
  return text.replace(search, replacement);
};

let source = fs.readFileSync(sourcePath, 'utf8');
source = replaceOnce(source, 'const firstIndex = 501;', 'const firstIndex = 801;');
source = replaceOnce(source, 'const lastIndex = 600;', 'const lastIndex = 900;');
source = replaceOnce(source, 'fatty_acids_alcohol_batch_006_sources', 'fatty_acids_alcohol_batch_009_sources');
source = replaceOnce(source, 'omega3_components_batch_007', 'omega3_components_batch_010');

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
  range: [801, 900],
  blsCodes: result.blsCodes,
  blsProfilesRead: result.blsProfilesRead,
  fieldCoverage: result.fieldCoverage,
  changedRows: result.changedRows,
  changedCells: result.changedCells,
  omega3Corrections: result.omega3Corrections,
  unresolvedRows: result.unresolvedRows,
  conflicts: result.conflicts,
}, null, 2));
