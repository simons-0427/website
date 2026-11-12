import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.join(path.resolve('.'), 'Daten', 'enrich_usda_sr_legacy_batch1.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
const sources = new Map([
  [927, 'Oil, safflower, salad or cooking, linoleic, (over 70%)'],
  [929, 'Oil, wheat germ'],
  [932, 'Oil, palm'],
  [937, 'Oil, coconut'],
]);
const density = 218 / 236.5882365;
const densityByIndex = new Map([...sources.keys()].map(index => [index, density]));

const start = script.indexOf('const sourceByDatabaseIndex = new Map([');
const end = script.indexOf(']);', start) + 3;
if (start < 0 || end < 3) throw new Error('Could not locate source map in USDA enrichment engine');
const map = `const sourceByDatabaseIndex = new Map([\n${[...sources].map(([index, name]) => `  [${index}, ${JSON.stringify(name)}],`).join('\n')}\n]);`;
script = script.slice(0, start) + map + script.slice(end);
script = script.replace('database_V2_fatty_acids_alcohol_batch_001_sources.json', 'database_V2_fatty_acids_alcohol_batch_010_sources.json');
script = script.replace('const batchFoods = db.slice(0, 100);', 'const batchFoods = db.slice(900, 1000);');
if (!script.includes('const batchFoods = db.slice(900, 1000);')) throw new Error('Could not set USDA batch slice to 901-1000');
script = script.replace('const fieldKeys = {', `const densityByIndex = new Map(${JSON.stringify([...densityByIndex])});\nconst fieldKeys = {`);

const addedMarker = '  const added = {};\n';
if (!script.includes(addedMarker)) throw new Error('Could not locate derived-value processing');
script = script.replace(addedMarker, `  const densityFactor = densityByIndex.get(index) ?? null;
  if (densityFactor != null) {
    for (const key of Object.keys(derived)) {
      if (derived[key] != null) derived[key] = Number((derived[key] * densityFactor).toFixed(6));
    }
  }
${addedMarker}`);
script = script.replace("if (item.unit !== 'g' && value !== 0) {", "if (item.unit !== 'g' && value !== 0 && densityFactor == null) {");
script = script.replace('    derivedOmegas: omega,\n', "    derivedOmegas: omega,\n    densityConversion: densityFactor == null ? null : { sourceGramsPerUSCup: 218, usCupMl: 236.5882365, gramsPerMl: densityFactor, formula: 'per 100 g USDA value multiplied by density factor for a per 100 ml database item' },\n");
script = script.replace('skippedByUnit, conflicts, omega: {', 'skippedByUnit, conflicts, densityConversion: densityFactor == null ? null : { gramsPerMl: densityFactor }, omega: {');
script = script.replace('  audit.records.push(...appliedRecords);', "  audit.sources.USDA_FoodData_Central_SR_Legacy_2018.volumeConversion = 'Oil density sourced from USDA household measure of 218 g per US cup; values converted from per 100 g to per 100 ml using 236.5882365 ml per US cup.';\n  audit.records.push(...appliedRecords);");
if (!script.includes('densityFactor == null')) throw new Error('USDA volume conversion logic was not inserted');
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
