import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.join(path.resolve('.'), 'Daten', 'run_usda_batch3.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
for (const [from, to] of [
  ["[217, 'Mayonnaise, regular']", "[217, 'Salad dressing, mayonnaise, regular']"],
  ["[255, 'Peaches, raw']", "[255, 'Peaches, yellow, raw']"],
  ["[278, 'Snacks, rice cakes, brown rice, plain']", "[278, 'Snacks, rice cakes, brown rice, plain, unsalted']"],
]) {
  if (!script.includes(from)) throw new Error(`Expected mapping not found: ${from}`);
  script = script.replace(from, to);
}
await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
