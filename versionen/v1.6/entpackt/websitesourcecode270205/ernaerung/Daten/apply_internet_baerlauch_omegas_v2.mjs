import fs from 'node:fs';
import path from 'node:path';

let script = fs.readFileSync(path.join(path.resolve('.'), 'Daten', 'apply_internet_baerlauch_omegas.mjs'), 'utf8');
const oldCoverage = 'const filled = batch.filter(item => item.nutrients[name] != null || Object.hasOwn(values, name)).length;';
const correctedCoverage = 'const filled = batch.filter((item, offset) => item.nutrients[name] != null || (801 + offset === index && Object.hasOwn(values, name))).length;';
if (!script.includes(oldCoverage)) throw new Error('Could not locate Bärlauch coverage check');
script = script.replace(oldCoverage, correctedCoverage);
if (!script.includes(correctedCoverage)) throw new Error('Could not correct projected coverage');
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
