import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.join(path.resolve('.'), 'Daten', 'enrich_usda_sr_legacy_batch1.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
const sources = new Map([
  [838, 'Grapefruit, raw, pink and red and white, all areas'],
  [846, 'Artichokes, (globe or french), raw'],
  [854, 'Soy protein isolate'],
  [867, 'Yogurt, plain, low fat'],
  [871, 'Whey, acid, fluid'],
  [873, 'Cream, sour, cultured'],
  [880, 'Cheese, tilsit'],
  [881, 'Cheese, gouda'],
]);

const start = script.indexOf('const sourceByDatabaseIndex = new Map([');
const end = script.indexOf(']);', start) + 3;
if (start < 0 || end < 3) throw new Error('Could not locate source map in USDA enrichment engine');
const map = `const sourceByDatabaseIndex = new Map([\n${[...sources].map(([index, name]) => `  [${index}, ${JSON.stringify(name)}],`).join('\n')}\n]);`;
script = script.slice(0, start) + map + script.slice(end);
script = script.replace("const batchNumber = Number(process.argv[2] ?? 2);", "const batchNumber = Number(process.argv[2] ?? 9);");
if (!script.includes("const batchNumber = Number(process.argv[2] ?? 9);")) throw new Error('Could not set USDA batch number to 9');
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
