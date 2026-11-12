import fs from 'node:fs';
import path from 'node:path';

const batchNumber = Number(process.argv[2] ?? 2);
const firstIndex = (batchNumber - 1) * 100 + 1;
const lastIndex = batchNumber * 100;
if (!Number.isInteger(batchNumber) || batchNumber < 1 || batchNumber > 16) throw new Error('Batch number must be 1 through 16');

// Exact USDA SR Legacy descriptions curated for the second 100-food block.
const sourceByDatabaseIndex = new Map([
  [102, 'Kale, raw'],
  [103, 'Cucumber, with peel, raw'],
  [109, 'Cereals, oats, regular and quick, not fortified, dry'],
  [110, 'Cereals, oats, instant, fortified, plain, dry'],
  [112, 'Oat bran, raw'],
  [113, 'Oat bran, raw'],
  [116, 'Chicken, broilers or fryers, wing, meat and skin, raw'],
  [117, 'Chicken, broilers or fryers, leg, meat and skin, raw'],
  [118, 'Nuts, hazelnuts or filberts'],
  [119, "Leavening agents, yeast, baker's, compressed"],
  [124, 'Raspberries, raw'],
  [125, 'Raspberries, frozen, red, unsweetened'],
  [126, 'Millet, raw'],
  [129, 'Melons, cantaloupe, raw'],
  [130, 'Chicken, liver, all classes, raw'],
  [131, 'Hummus, commercial'],
  [133, 'Ginger root, raw'],
  [140, 'Currants, red and white, raw'],
  [141, 'Fish, cod, Atlantic, raw'],
  [148, 'Capers, canned'],
  [149, 'Carrots, raw'],
  [150, 'Carrot juice, canned'],
  [151, 'Fish, carp, raw'],
  [152, 'Potatoes, flesh and skin, raw'],
  [155, 'Cheese, camembert'],
  [156, "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)"],
  [157, 'Cheese, edam'],
  [158, 'Cheese, swiss'],
  [159, 'Cheese, gouda'],
  [160, 'Kefir, lowfat, plain, LIFEWAY'],
  [162, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw'],
  [163, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids'],
  [164, 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw'],
  [165, 'Chickpea flour (besan)'],
  [166, 'Beans, kidney, red, mature seeds, canned, drained solids'],
  [167, 'Cherries, sweet, raw'],
  [168, 'Kiwifruit, green, raw'],
  [170, 'Garlic, raw'],
  [171, 'Kohlrabi, raw'],
  [172, 'Nuts, coconut milk, canned (liquid expressed from grated meat and water)'],
  [173, 'Oil, coconut'],
  [174, 'Nuts, coconut meat, dried (desiccated), not sweetened'],
  [175, 'Nuts, coconut water (liquid from coconuts)'],
  [177, 'Crustaceans, shrimp, cooked'],
  [181, 'Pumpkin, raw'],
  [182, 'Seeds, pumpkin and squash seed kernels, dried'],
  [183, 'Fish, salmon, Atlantic, farmed, raw'],
  [185, 'Fish, salmon, Atlantic, farmed, raw'],
  [186, 'Lamb, ground, raw'],
  [187, 'Leeks, (bulb and lower leaf-portion), raw'],
  [191, 'Seeds, flaxseed'],
  [192, 'Beverages, water, tap, drinking'],
  [193, 'Limes, raw'],
  [194, 'Lentils, raw'],
  [195, 'Lentils, raw'],
  [197, 'Lentils, pink or red, raw'],
  [198, 'Lupins, mature seeds, raw'],
  [200, 'Nuts, macadamia nuts, raw'],
]);

const root = path.resolve('.');
const sourcePath = path.join(process.env.TEMP, 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const basePath = path.join(root, 'Daten', 'enrich_usda_sr_legacy_batch1.mjs');
const auditName = `database_V2_fatty_acids_alcohol_batch_${String(batchNumber).padStart(3, '0')}_sources.json`;
const auditPath = path.join(root, 'Daten', auditName);
if (!fs.existsSync(sourcePath) || !fs.existsSync(basePath) || !fs.existsSync(auditPath)) throw new Error('Required USDA source, enrichment engine, or batch audit file is missing');

let source = fs.readFileSync(basePath, 'utf8');
const mapStart = source.indexOf('const sourceByDatabaseIndex = new Map([');
const mapEnd = source.indexOf(']);', mapStart) + 3;
if (mapStart < 0 || mapEnd < 3) throw new Error('Could not locate curated source map in enrichment engine');
const mapLiteral = `const sourceByDatabaseIndex = new Map([\n${[...sourceByDatabaseIndex].map(([index, name]) => `  [${index}, ${JSON.stringify(name)}],`).join('\n')}\n]);`;
source = source.slice(0, mapStart) + mapLiteral + source.slice(mapEnd);
source = source.replace('database_V2_fatty_acids_alcohol_batch_001_sources.json', auditName);
source = source.replace('const batchFoods = db.slice(0, 100);', `const batchFoods = db.slice(${firstIndex - 1}, ${lastIndex});`);
if (source === fs.readFileSync(basePath, 'utf8')) throw new Error('Batch configuration did not update the enrichment engine');
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
