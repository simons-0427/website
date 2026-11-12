import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'complete_fatty_acids_batch_004_20260924.mjs');
const source = fs.readFileSync(filePath, 'utf8');
const before = '[328, F.omega3, 0.098571,';
const after = '[328, F.omega3, 0.099,';
if (!source.includes(before)) throw new Error('Expected soy-yogurt omega-3 entry was not found.');
fs.writeFileSync(filePath, source.replace(before, after), 'utf8');
