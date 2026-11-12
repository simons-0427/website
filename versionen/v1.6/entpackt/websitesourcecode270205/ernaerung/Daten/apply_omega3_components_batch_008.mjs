import fs from 'node:fs';

const sourcePath = 'Daten/apply_omega3_components_batch_007.mjs';
const replaceOnce = (text, search, replacement) => {
  if (!text.includes(search)) throw new Error('Expected source snippet not found: ' + search.slice(0, 80));
  return text.replace(search, replacement);
};

let source = fs.readFileSync(sourcePath, 'utf8');
source = replaceOnce(source, 'const firstIndex = 501;', 'const firstIndex = 601;');
source = replaceOnce(source, 'const lastIndex = 600;', 'const lastIndex = 700;');
source = replaceOnce(source, 'fatty_acids_alcohol_batch_006_sources', 'fatty_acids_alcohol_batch_007_sources');
source = replaceOnce(source, 'omega3_components_batch_007', 'omega3_components_batch_008');

const corrections = `const sourceDrivenOmega3Corrections = [
  {
    databaseIndex: 602, previous: 0.0173, corrected: 0.01733, source: 'BLS_4_0',
    sourceName: 'Wassermelone roh (F535100)', sourceUrl: 'https://blsdb.de/download',
    note: 'BLS components ALA 0.0168 + EPA 0 + DHA 0.00053 sum to 0.01733 g/100 g; published FAPUN3 0.0173 is lower by rounding, so the total is aligned to the sourced component sum.',
  },
  {
    databaseIndex: 620, previous: 0, corrected: 0.042804, source: 'BLS_4_0+USDA_FoodData_Central_SR_Legacy_2018',
    sourceName: 'Maracujasaft/Passionsfruchtsaft (F508600), density from USDA FDC 169109', sourceUrl: 'https://blsdb.de/download',
    note: 'Exact BLS ALA 0.041 g/100 g converted by audited same-food density 1.04400795 g/ml; EPA and DHA are BLS zero. The previous total 0 reflected an unconverted liquid value.',
  },
  {
    databaseIndex: 625, previous: 0.040475, corrected: 0.040816, source: 'BLS_4_0+USDA_FoodData_Central_SR_Legacy_2018',
    sourceName: 'Smoothie purpur (F032600), density comparator USDA FDC 167797', sourceUrl: 'https://blsdb.de/download',
    note: 'BLS ALA 0.038 + EPA 0 + DHA 0.00032 sum to 0.03832 g/100 g; converted by audited density 1.06514172 g/ml, aligning the total with sourced components.',
  },
];
for (const correction of sourceDrivenOmega3Corrections) {
  const item = db[correction.databaseIndex - 1];
  if (item.nutrients[F.omega3] !== correction.previous) throw new Error('Unexpected prior Omega-3 value at ' + correction.databaseIndex);
  item.nutrients[F.omega3] = correction.corrected;
  correction.food = item.name;
  omega3Corrections.push(correction);
}`;
source = replaceOnce(source, 'const omega3Corrections = [];', 'const omega3Corrections = [];\n' + corrections);

const safeZeros = `  if ([678, 692, 693].includes(index) && item.nutrients?.[F.omega3] === 0 && item.nutrients?.[F.ala] == null) {
    proposed[F.ala] = 0;
    itemSources[F.ala] = {
      source: 'BLS 4.0 ' + blsCode,
      sourceName: blsRow?.name || item.name,
      sourceUrl: 'https://blsdb.de/download',
      method: 'Exact BLS food code reports FAPUN3 total as zero; its documented formula sums n-3 fatty acids. With ALA unreported, ALA is zero at source precision.',
    };
  }
  if (index === 700) {
    for (const key of [F.epa, F.dha]) {
      if (item.nutrients?.[key] == null && proposed[key] == null) {
        proposed[key] = 0;
        itemSources[key] = {
          source: 'BLS 4.0 + food identity',
          sourceName: blsRow?.name || item.name,
          sourceUrl: 'https://blsdb.de/download',
          method: 'Plant-only potato and oil food; exact BLS total Omega-3 equals measured ALA, with EPA/DHA unreported, so EPA and DHA are zero at source precision.',
        };
      }
    }
  }
`;
source = replaceOnce(source, '  if (index === 502) {', safeZeros + '  if (index === 502) {');
source = replaceOnce(source, "source: 'USDA_FoodData_Central_SR_Legacy_2018',\n      sourceName: correction.sourceName,", 'source: correction.source,\n      sourceName: correction.sourceName,');
source = replaceOnce(source, 'conflicts: { [F.omega3]: { previousBLSValue: correction.previous, USDAValue: correction.corrected, resolution: correction.note } },', 'corrections: { [F.omega3]: { previousValue: correction.previous, correctedValue: correction.corrected, resolution: correction.note } },');
source = replaceOnce(source,
  "    'No generic food-class split of total Omega-3 was used to estimate ALA, EPA or DHA.',",
  "    'No generic food-class split of total Omega-3 was used to estimate ALA, EPA or DHA.',\n    'Exact BLS FAPUN3 zero plus an unreported ALA supports ALA zero; for food 700, BLS total Omega-3 equals measured ALA and potato/oil identity excludes EPA and DHA.',\n    'For foods 602, 620 and 625, the BLS total was aligned to directly sourced ALA+EPA+DHA after documented rounding or liquid-density conversion.',");

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
  range: [601, 700],
  blsCodes: result.blsCodes,
  blsProfilesRead: result.blsProfilesRead,
  fieldCoverage: result.fieldCoverage,
  changedRows: result.changedRows,
  changedCells: result.changedCells,
  omega3Corrections: result.omega3Corrections.map(row => ({ index: row.databaseIndex, previous: row.previous, corrected: row.corrected, source: row.source })),
  unresolvedRows: result.unresolvedRows,
  conflicts: result.conflicts,
}, null, 2));
