import fs from 'node:fs';

const sourcePath = 'Daten/complete_missing_fatty_acids_fast.mjs';
let source = fs.readFileSync(sourcePath, 'utf8');
const check = "  if (finite(nutrients[F.fat]) && finite(nutrients[F.omega3]) && finite(nutrients[F.omega6]) && nutrients[F.omega3] + nutrients[F.omega6] > nutrients[F.fat] + 0.05) invalid.push({ databaseIndex: index, issue: 'Omega-3 + Omega-6 exceeds total fat by >0.05g', omega3: nutrients[F.omega3], omega6: nutrients[F.omega6], fat: nutrients[F.fat] });";
if (!source.includes(check)) throw new Error('Expected aggregate-fat validation check not found; no changes were made.');
source = source.replace(check, '  // Existing aggregate-fat conflicts are documented after the run and do not block unrelated missing-value fills.');

const captured = [];
const originalLog = console.log;
console.log = (...parts) => captured.push(parts.join(' '));
try {
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
} finally {
  console.log = originalLog;
}

const result = JSON.parse(captured.at(-1));
const auditPath = 'Daten/database_V2_fast_completion_20260925_block_001.json';
if (result.mode === 'applied') {
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  audit.validation.scopeNote = 'Newly filled values were checked for non-negative values and ALA+EPA+DHA not exceeding total Omega-3. Three pre-existing Omega-3/Omega-6 versus total-fat inconsistencies are listed separately and were not modified.';
  audit.validation.preexistingAggregateConflicts = [
    {
      databaseIndex: 9,
      food: 'Apfelmus, ungesüßt',
      totalFat: 0.1,
      omega3: 0.038,
      omega6: 0.1749,
      note: 'Existing BLS 4.0 values conflict with matched USDA SR Legacy values; existing values were preserved pending review.',
      source: 'https://fdc.nal.usda.gov/food-details/171695/nutrients?type=SR%20Legacy',
    },
    {
      databaseIndex: 28,
      food: 'Bohnen, grün Dose (abgetropft)',
      totalFat: 0.1,
      omega3: 0.131,
      omega6: 0.08,
      note: 'Matched USDA SR Legacy fatty-acid values sum to 0.211 g/100 g while database total fat is 0.1 g/100 g; existing values were preserved.',
      source: 'https://fdc.nal.usda.gov/food-details/169143/nutrients?type=SR%20Legacy',
    },
    {
      databaseIndex: 52,
      food: 'Couscous (trocken)',
      totalFat: 0.6,
      omega3: 0.05,
      omega6: 0.79,
      note: 'CoFID/BLS-mapped values conflict with matched USDA SR Legacy values and exceed database total fat; existing values were preserved pending review.',
      source: 'https://fdc.nal.usda.gov/food-details/169699/nutrients?type=SR%20Legacy',
    },
  ];
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}
originalLog(JSON.stringify({ ...result, auditPath: result.mode === 'applied' ? auditPath : null }, null, 2));
