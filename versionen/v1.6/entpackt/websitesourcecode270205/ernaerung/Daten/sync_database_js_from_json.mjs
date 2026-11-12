import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "database.json");
const jsPath = path.join(root, "database.js");

const database = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
if (!Array.isArray(database) || database.length < 1500) {
  throw new Error(`Unexpected database shape: ${Array.isArray(database) ? database.length : typeof database}`);
}

fs.writeFileSync(
  jsPath,
  `// Auto-generated from database.json - do not edit by hand.\nwindow.FOOD_DATABASE = ${JSON.stringify(database, null, 2)};\n`,
  "utf8",
);

console.log(JSON.stringify({ syncedFoods: database.length, target: "database.js" }));
