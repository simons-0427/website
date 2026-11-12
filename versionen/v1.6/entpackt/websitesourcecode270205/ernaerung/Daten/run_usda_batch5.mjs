import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.join(path.resolve('.'), 'Daten', 'run_usda_curated_batch.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
const sources = new Map([
  [411, 'Couscous, cooked'],
  [416, 'Duck, domesticated, meat only, cooked, roasted'],
  [417, 'Falafel, home-prepared'],
  [428, 'Kale, cooked, boiled, drained, without salt'],
  [430, 'Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt'],
  [441, 'Egg, whole, cooked, hard-boiled'],
  [443, 'Veal, variety meats and by-products, liver, cooked, pan-fried'],
  [445, 'Potatoes, boiled, cooked without skin, flesh, without salt'],
  [447, 'Beans, kidney, all types, mature seeds, cooked, boiled, without salt'],
  [449, 'Crustaceans, crab, blue, canned'],
  [450, 'Fish, salmon, Atlantic, farmed, cooked, dry heat'],
  [451, 'Fish, salmon, Atlantic, farmed, cooked, dry heat'],
  [457, 'Fish, mackerel, Atlantic, cooked, dry heat'],
  [461, 'Pasta, cooked, enriched, without added salt'],
  [464, 'Marmalade, orange'],
  [479, 'Rice, white, long-grain, regular, enriched, cooked'],
  [480, 'Crustaceans, shrimp, cooked'],
  [486, 'Lentils, mature seeds, cooked, boiled, without salt'],
  [487, 'Alcoholic beverage, wine, table, red'],
  [488, 'Egg, whole, cooked, scrambled'],
  [491, 'Cream, fluid, heavy whipping'],
  [494, 'Pasta, cooked, enriched, without added salt'],
  [496, 'Sweet potato, cooked, boiled, without skin'],
]);
const start = script.indexOf('const sourceByDatabaseIndex = new Map([');
const end = script.indexOf(']);', start) + 3;
if (start < 0 || end < 3) throw new Error('Could not locate source map');
const map = `const sourceByDatabaseIndex = new Map([\n${[...sources].map(([index, name]) => `  [${index}, ${JSON.stringify(name)}],`).join('\n')}\n]);`;
script = script.slice(0, start) + map + script.slice(end);
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
