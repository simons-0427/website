import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.join(path.resolve('.'), 'Daten', 'enrich_usda_sr_legacy_batch1.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
const sources = new Map([
  [903, 'Cheese spread, cream cheese base'],
  [906, 'Cheese, pasteurized process, American, without added vitamin D'],
  [955, 'Fish, tuna, fresh, yellowfin, raw'],
  [958, 'Fish, tuna, fresh, yellowfin, raw'],
  [961, 'Fish, pollock, Alaska, raw'],
  [962, 'Fish, salmon, pink, raw'],
  [964, 'Fish, trout, rainbow, farmed, raw'],
  [966, 'Fish, seatrout, mixed species, raw'],
  [967, 'Fish, trout, rainbow, farmed, raw'],
  [971, 'Veal, external fat only, raw'],
  [972, 'Veal, shoulder, blade chop, separable lean only, raw'],
  [980, 'Beef, round, top round, steak, separable lean and fat, trimmed to 1/8" fat, select, raw'],
  [984, 'Veal, leg, top round, cap off, cutlet, boneless, raw'],
  [985, 'Veal, leg, top round, cap off, cutlet, boneless, raw'],
  [986, 'Veal, leg, top round, cap off, cutlet, boneless, raw'],
  [987, 'Veal, leg, top round, cap off, cutlet, boneless, raw'],
  [994, 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw'],
  [995, 'Turkey, whole, breast, meat only, raw'],
  [996, 'Turkey, whole, wing, meat only, raw'],
  [997, 'Chicken, broilers or fryers, thigh, meat and skin, raw'],
  [998, 'Chicken, broilers or fryers, drumstick, meat and skin, raw'],
  [999, 'Chicken, broilers or fryers, thigh, meat and skin, raw'],
  [1000, 'Turkey, whole, giblets, raw'],
]);
const scaleIndexes = new Set(sources.keys());
const partialOmegaIndexes = new Set([906, 995, 1000]);

const start = script.indexOf('const sourceByDatabaseIndex = new Map([');
const end = script.indexOf(']);', start) + 3;
if (start < 0 || end < 3) throw new Error('Could not locate USDA source map');
const map = `const sourceByDatabaseIndex = new Map([\n${[...sources].map(([index, name]) => `  [${index}, ${JSON.stringify(name)}],`).join('\n')}\n]);`;
script = script.slice(0, start) + map + script.slice(end);
script = script.replace('database_V2_fatty_acids_alcohol_batch_001_sources.json', 'database_V2_fatty_acids_alcohol_batch_010_sources.json');
script = script.replace('const batchFoods = db.slice(0, 100);', 'const batchFoods = db.slice(900, 1000);');
if (!script.includes('const batchFoods = db.slice(900, 1000);')) throw new Error('Could not set USDA batch range to 901-1000');
script = script.replace('const fieldKeys = {', `const partialOmegaIndexes = new Set(${JSON.stringify([...partialOmegaIndexes])});\nconst fieldKeys = {`);
script = script.replace('[fieldKeys.omega3]: omega.reconciled ? omega.omega3 : null,', '[fieldKeys.omega3]: (omega.reconciled || partialOmegaIndexes.has(index)) ? omega.omega3 : null,');
script = script.replace('[fieldKeys.omega6]: omega.reconciled ? omega.omega6 : null,', '[fieldKeys.omega6]: (omega.reconciled || partialOmegaIndexes.has(index)) ? omega.omega6 : null,');

const addedMarker = '  const added = {};\n';
if (!script.includes(addedMarker)) throw new Error('Could not locate USDA derived-value processing');
script = script.replace(addedMarker, `  let scaling = null;\n  if (${JSON.stringify([...scaleIndexes])}.includes(index)) {\n    const sourceFat = values.get('204');\n    const targetFat = Number(item.nutrients?.['Total Fat (g)']);\n    if (Number.isFinite(sourceFat) && sourceFat > 0 && Number.isFinite(targetFat) && targetFat >= 0) {\n      const factor = targetFat / sourceFat;\n      for (const key of [fieldKeys.omega3, fieldKeys.omega6, fieldKeys.trans]) {\n        if (derived[key] != null) derived[key] = Number((derived[key] * factor).toFixed(6));\n      }\n      scaling = { method: 'USDA exact source or close food analogue scaled by target-to-source total fat', sourceFatPer100g: sourceFat, targetFatPer100g: targetFat, factor: Number(factor.toFixed(8)) };\n    }\n  }\n${addedMarker}`);
script = script.replace('sourceValues: relevantSourceValues(source),', "sourceValues: [...relevantSourceValues(source), { number: '204', component: 'Total lipid (fat)', amountPer100g: values.get('204') }],");
script = script.replace('    derivedOmegas: omega,\n', "    derivedOmegas: omega,\n    scaling,\n    sourceQualityNote: partialOmegaIndexes.has(index) && !omega.reconciled ? 'Reported n-3/n-6 components retained despite incomplete reconciliation to total PUFA; see source values and scaling factor.' : null,\n");
script = script.replace('skippedByUnit, conflicts, omega: {', 'skippedByUnit, conflicts, scaling, omega: {');
script = script.replace('  audit.sources.USDA_FoodData_Central_SR_Legacy_2018 = {', '  audit.sources.USDA_FoodData_Central_SR_Legacy_2018 = {\n    ...(audit.sources.USDA_FoodData_Central_SR_Legacy_2018 ?? {}),');
if (!script.includes('partialOmegaIndexes')) throw new Error('Partial-component exception was not inserted');
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
