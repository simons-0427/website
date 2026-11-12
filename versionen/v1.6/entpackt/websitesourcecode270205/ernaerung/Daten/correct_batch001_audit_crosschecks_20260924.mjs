import fs from 'node:fs';
import path from 'node:path';

const auditPath = path.join(path.resolve('.'), 'Daten', 'database_V2_fatty_acids_alcohol_batch_001_sources.json');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
function record(index, source) {
  const item = audit.records.find(entry => entry.databaseIndex === index && entry.source === source);
  if (!item) throw new Error(`Missing audit record ${index}/${source}`);
  return item;
}

const ghee = record(40, 'BLS_4_0');
ghee.sourceCode = 'Q683000';
ghee.sourceTotalFatPer100g = 99.5;
ghee.databaseTotalFatPer100g = 99.5;
ghee.note = 'Exact BLS Butterschmalz row; source and database both report 99.5 g total fat/100 g. BLS values are total omega-3 and total omega-6.';

const roll = record(34, 'BLS_4_0');
roll.sourceTotalFatPer100g = 1.81;
roll.databaseTotalFatPer100g = 2.5;
roll.confidence = 'medium; exact food class but fat differs by 0.69 g/100 g between datasets';
roll.note = 'Exact BLS wheat-roll food class; BLS total fat is 1.81 g/100 g versus 2.5 g in the database, so Omega values are a medium-confidence class match. BLS alcohol is below detection and is not converted to zero. CoFID numeric 0.0 g is used for alcohol; its trans marker Tr remains unresolved.';

const cashew = record(43, 'LogicalFoodComposition');
cashew.logicalEvidence['Trans Fat (g)'].basis = 'Raw cashews contain no animal-derived fat or added hydrogenated oil. This is a composition-based zero for the plain unroasted food, not a numeric value inferred from a blank source field.';

fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
const verify = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (record(40, 'BLS_4_0').sourceCode !== 'Q683000') throw new Error('Ghee audit correction failed.');
if (verify.records.find(item => item.databaseIndex === 40 && item.source === 'BLS_4_0').sourceTotalFatPer100g !== 99.5) throw new Error('Ghee fat comparison read-back failed.');
console.log(JSON.stringify({ gheeCode: 'Q683000', rollFatCheck: '1.81 versus 2.5', cashewRationaleUpdated: true }, null, 2));
