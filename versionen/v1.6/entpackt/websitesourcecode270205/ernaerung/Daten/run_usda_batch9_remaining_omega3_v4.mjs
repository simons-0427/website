import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.join(path.resolve('.'), 'Daten', 'enrich_usda_sr_legacy_batch1.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
const sources = new Map([
  [865, 'Yogurt, plain, low fat'],
  [868, 'Sour cream, light'],
  [869, 'Sour cream, light'],
  [870, 'Sour cream, light'],
  [873, 'Cream, sour, cultured'],
  [877, 'Cheese, gouda'],
  [887, 'Cheese, muenster'],
  [889, 'Cheese, muenster, low fat'],
  [891, 'Cheese, tilsit'],
  [897, 'Cheese spread, cream cheese base'],
]);
const scaleIndexes = new Set(sources.keys());

const start = script.indexOf('const sourceByDatabaseIndex = new Map([');
const end = script.indexOf(']);', start) + 3;
if (start < 0 || end < 3) throw new Error('Could not locate source map in USDA enrichment engine');
const map = `const sourceByDatabaseIndex = new Map([\n${[...sources].map(([index, name]) => `  [${index}, ${JSON.stringify(name)}],`).join('\n')}\n]);`;
script = script.slice(0, start) + map + script.slice(end);
script = script.replace('database_V2_fatty_acids_alcohol_batch_001_sources.json', 'database_V2_fatty_acids_alcohol_batch_009_sources.json');
script = script.replace('const batchFoods = db.slice(0, 100);', 'const batchFoods = db.slice(800, 900);');
if (!script.includes('const batchFoods = db.slice(800, 900);')) throw new Error('Could not set the USDA batch slice to 801-900');
script = script.replace('const fieldKeys = {', "const partialOmega3Indexes = new Set([873]);\nconst fieldKeys = {");
script = script.replace('[fieldKeys.omega3]: omega.reconciled ? omega.omega3 : null,', '[fieldKeys.omega3]: (omega.reconciled || partialOmega3Indexes.has(index)) ? omega.omega3 : null,');

const addedMarker = '  const added = {};\n';
if (!script.includes(addedMarker)) throw new Error('Could not locate USDA derived-value processing');
script = script.replace(addedMarker, `  let scaling = null;
  if (${JSON.stringify([...scaleIndexes])}.includes(index)) {
    const sourceFat = values.get('204');
    const targetFat = Number(item.nutrients?.['Total Fat (g)']);
    if (Number.isFinite(sourceFat) && sourceFat > 0 && Number.isFinite(targetFat) && targetFat >= 0) {
      const factor = targetFat / sourceFat;
      for (const key of [fieldKeys.omega3, fieldKeys.omega6]) {
        if (derived[key] != null) derived[key] = Number((derived[key] * factor).toFixed(6));
      }
      scaling = { method: 'USDA source or food analogue scaled by target-to-source total fat', sourceFatPer100g: sourceFat, targetFatPer100g: targetFat, factor: Number(factor.toFixed(8)) };
    }
  }
${addedMarker}`);
script = script.replace('sourceValues: relevantSourceValues(source),', "sourceValues: [...relevantSourceValues(source), { number: '204', component: 'Total lipid (fat)', amountPer100g: values.get('204') }],");
script = script.replace('    derivedOmegas: omega,\n', '    derivedOmegas: omega,\n    scaling,\n');
script = script.replace('skippedByUnit, conflicts, omega: {', 'skippedByUnit, conflicts, scaling, omega: {');
if (!script.includes('partialOmega3Indexes.has(index)')) throw new Error('Partial source omega-3 branch was not added');
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
