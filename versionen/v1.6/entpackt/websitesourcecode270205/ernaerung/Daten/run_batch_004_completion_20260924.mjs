import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.dirname(fileURLToPath(import.meta.url));
const sourceAuditPath = path.join(dataDir, 'database_V2_fatty_acids_alcohol_batch_004_sources.json');
const componentAuditPath = path.join(dataDir, 'database_V2_omega3_components_batch_005.json');

for (const filePath of [sourceAuditPath, componentAuditPath]) {
  const original = fs.readFileSync(filePath, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const audit = JSON.parse(original);
  if (Array.isArray(audit.records)) audit.records = audit.records.filter(Boolean);
  fs.writeFileSync(filePath, bom + JSON.stringify(audit, null, 2).replace(/\n/g, eol) + eol, 'utf8');
}

await import('./complete_fatty_acids_batch_004_20260924.mjs');
