import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_matvaretabellen_batch_006.json';
const apply = process.argv.includes('--apply');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const keys = {
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};

const records = [
  {
    index: 412,
    expectedName: 'Croissant',
    expectedFat: 19.7,
    sourceName: 'Croissant, plain, industrially made',
    sourceFat: 18.4,
    url: 'https://www.matvaretabellen.no/en/croissant-plain-industrially-made/',
    values: { omega3: 0.1, omega6: 0.7, trans: 0.4, ala: 0.1, epa: 0, dha: 0 },
  },
  {
    index: 431,
    expectedName: 'Halloumi',
    expectedFat: 23.5,
    sourceName: 'Cheese, Halloumi',
    sourceFat: 21.9,
    url: 'https://www.matvaretabellen.no/en/cheese-halloumi/',
    values: { omega3: 0.1, omega6: 0.7, trans: 0.8, ala: 0.1, epa: 0, dha: 0 },
  },
];

if (!Array.isArray(db) || db.length !== 1516) throw new Error('Unexpected database shape or record count.');
if (apply && fs.existsSync(auditPath)) throw new Error(`Audit already exists: ${auditPath}`);

const auditRecords = records.map(record => {
  const item = db[record.index - 1];
  const nutrient = item?.nutrients;
  if (item?.name !== record.expectedName || !nutrient || nutrient[keys['fat']] !== undefined) {
    if (item?.name !== record.expectedName || !nutrient) throw new Error(`Unexpected row ${record.index}.`);
  }
  if (nutrient['Total Fat (g)'] !== record.expectedFat) throw new Error(`Target fat changed for row ${record.index}.`);
  if (nutrient[keys.alcohol] !== 0) throw new Error(`Alcohol value changed or missing for row ${record.index}.`);

  const valueMap = Object.fromEntries(Object.entries(record.values).map(([name, value]) => [keys[name], value]));
  const priorValues = Object.fromEntries(Object.keys(valueMap).map(key => [key, nutrient[key] ?? null]));
  if (Object.values(priorValues).some(value => value !== null)) {
    throw new Error(`Existing values would be overwritten at row ${record.index}: ${JSON.stringify(priorValues)}`);
  }

  const components = record.values.ala + record.values.epa + record.values.dha;
  if (Math.abs(components - record.values.omega3) > 1e-9) throw new Error(`Omega-3 component mismatch at row ${record.index}.`);
  if (Object.values(record.values).some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid negative/non-numeric value at row ${record.index}.`);

  const fatDifferencePct = Math.round(Math.abs(record.sourceFat - record.expectedFat) / record.expectedFat * 1000) / 10;
  return {
    index: record.index,
    food: item.name,
    targetFat_g_per_100g: record.expectedFat,
    sourceName: record.sourceName,
    sourceFat_g_per_100g: record.sourceFat,
    fatDifferencePct,
    sourceUrl: record.url,
    basis: 'per 100 g',
    priorValues,
    updatedValues: valueMap,
    componentsSumToOmega3: true,
    alcoholUnchanged_g_per_100g: nutrient[keys.alcohol],
    confidence: 'medium-high: direct food match or close standard variant; fat differs by under 7%; source values retained without scaling',
  };
});

if (apply) {
  for (const record of records) {
    const nutrient = db[record.index - 1].nutrients;
    for (const [name, value] of Object.entries(record.values)) nutrient[keys[name]] = value;
  }
  const audit = {
    checkedOn: '2026-09-25',
    method: 'Two official Matvaretabellen profiles were used for direct/close food matches. Fat values were within 7%; source values were transferred per 100 g without scaling. All EPA/DHA zeros are explicitly reported on the source pages. Existing alcohol values of 0 g were retained.',
    records: auditRecords,
  };
  fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', records: auditRecords, auditPath: apply ? auditPath : null }, null, 2));
