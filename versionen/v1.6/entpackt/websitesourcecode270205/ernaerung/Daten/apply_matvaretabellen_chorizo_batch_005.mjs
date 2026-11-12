import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_matvaretabellen_chorizo_batch_005.json';
const apply = process.argv.includes('--apply');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const index = 407;
const item = db[index - 1];
const nutrient = item?.nutrients;
if (db.length !== 1516 || item?.name !== 'Chorizo' || !nutrient) throw new Error('Unexpected database row for Chorizo.');
if (apply && fs.existsSync(auditPath)) throw new Error(`Audit already exists: ${auditPath}`);

const keys = {
  omega3: 'Omega-3 Fatty Acids (g)', omega6: 'Omega-6 Fatty Acids (g)', trans: 'Trans Fat (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)', epa: 'Eicosapentaenoic Acid (EPA) (g)', dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const prior = Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, nutrient[key] ?? null]));
if (prior.omega3 !== null || prior.omega6 !== null || prior.ala !== null || prior.epa !== null || prior.dha !== null || prior.trans !== 0.157793) {
  throw new Error(`Chorizo values differ from the reviewed starting state: ${JSON.stringify(prior)}`);
}

const values = { [keys.omega3]: 0.1, [keys.omega6]: 1, [keys.trans]: 0.1, [keys.ala]: 0.1, [keys.epa]: 0, [keys.dha]: 0 };
const audit = {
  checkedOn: '2026-09-25',
  source: { name: 'Matvaretabellen, Sausage, chorizo', url: 'https://www.matvaretabellen.no/en/sausage-chorizo/', basis: 'per 100 g', sourceFat: 29.1, targetFat: nutrient['Total Fat (g)'] },
  method: 'Same named food class. Source values retained at published precision without scaling; source is a recipe-calculated comparator, so confidence is medium.',
  priorValues: prior,
  updatedValues: values,
  checks: { componentsSumToOmega3: values[keys.ala] + values[keys.epa] + values[keys.dha] === values[keys.omega3], nonnegative: Object.values(values).every(value => Number.isFinite(value) && value >= 0) },
};
if (!audit.checks.componentsSumToOmega3 || !audit.checks.nonnegative) throw new Error('Chorizo validation failed.');

if (apply) {
  Object.assign(nutrient, values);
  fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', index, food: item.name, prior, values, source: audit.source, method: audit.method, checks: audit.checks, auditPath: apply ? auditPath : null }, null, 2));
