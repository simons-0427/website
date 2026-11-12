import fs from 'node:fs';
import path from 'node:path';

const basePath = path.join(path.resolve('.'), 'Daten', 'enrich_usda_sr_legacy_batch1.mjs');
let source = fs.readFileSync(basePath, 'utf8');
const replacements = [
  ["Applesauce, canned, unsweetened, without added ascorbic acid", "Applesauce, canned, unsweetened, without added ascorbic acid (Includes foods for USDA's Food Distribution Program)"],
  ['Beans, snap, green, frozen, unprepared', "Beans, snap, green, frozen, all styles, unprepared (Includes foods for USDA's Food Distribution Program)"],
  ['Beans, snap, green, canned, drained solids', 'Beans, snap, green, canned, regular pack, drained solids'],
  ['Beans, white, mature seeds, canned, drained solids', 'Beans, white, mature seeds, canned'],
  ['Peas, green, canned, drained solids, unprepared', 'Peas, green (includes baby and lesuer types), canned, drained solids, unprepared'],
  ['Peas, green, frozen, unprepared', "Peas, green, frozen, unprepared (Includes foods for USDA's Food Distribution Program)"],
  ['Figs, dried', 'Figs, dried, uncooked'],
];
for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`Expected text not found: ${from}`);
  source = source.replace(from, to);
}
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
