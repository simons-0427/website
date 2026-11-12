import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_tofu_components_batch_005.json';
const apply = process.argv.includes('--apply');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const index = 498;
const item = db[index - 1];
const nutrient = item?.nutrients;
if (db.length !== 1516 || item?.name !== 'Tofu gedämpft (Sojabohne)' || !nutrient) throw new Error('Unexpected database row for steamed tofu.');
if (apply && fs.existsSync(auditPath)) throw new Error(`Audit already exists: ${auditPath}`);

const keys = {
  omega3: 'Omega-3 Fatty Acids (g)', omega6: 'Omega-6 Fatty Acids (g)', trans: 'Trans Fat (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)', epa: 'Eicosapentaenoic Acid (EPA) (g)', dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const prior = Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, nutrient[key] ?? null]));
if (Object.values(prior).some(value => value !== null)) throw new Error(`Tofu values are not all missing as expected: ${JSON.stringify(prior)}`);

const values = { [keys.omega3]: 0.407, [keys.omega6]: 2.511, [keys.trans]: 0, [keys.ala]: 0.406, [keys.epa]: 0.001, [keys.dha]: 0 };
const componentSum = values[keys.ala] + values[keys.epa] + values[keys.dha];
const audit = {
  checkedOn: '2026-09-25',
  sources: [
    { name: 'BLS 4.0, Tofu gargezogen, code H861032', url: 'https://blsdb.de/food?foodId=40395', basis: 'per 100 g', sourceFat: 4.794, fields: ['Omega-3', 'Omega-6', 'ALA', 'EPA', 'DHA'] },
    { name: 'Matvaretabellen, Tofu', url: 'https://www.matvaretabellen.no/en/tofu/', basis: 'per 100 g', sourceFat: 8.5, fields: ['Trans Fat'], transFat: 0, transFatType: 'logical zero' },
  ],
  method: 'BLS cooked tofu is the closest preparation match to the database steamed tofu; its fat is 4.794 g versus 4.2 g in the target. Values are retained at source precision without scaling. Matvaretabellen classifies tofu trans fat as a logical zero. Comparator confidence is medium.',
  priorValues: prior,
  updatedValues: values,
  checks: { componentsSumToOmega3: Math.abs(componentSum - values[keys.omega3]) < 0.000001, componentSum, nonnegative: Object.values(values).every(value => Number.isFinite(value) && value >= 0) },
};
if (!audit.checks.componentsSumToOmega3 || !audit.checks.nonnegative) throw new Error('Tofu validation failed.');

if (apply) {
  Object.assign(nutrient, values);
  fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', index, food: item.name, prior, values, sources: audit.sources, method: audit.method, checks: audit.checks, auditPath: apply ? auditPath : null }, null, 2));
