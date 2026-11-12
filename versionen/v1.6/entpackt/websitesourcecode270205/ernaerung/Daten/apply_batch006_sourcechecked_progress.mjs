import fs from 'node:fs';
import path from 'node:path';

const firstIndex = 401;
const lastIndex = 500;
const checkedOn = '2026-09-25';
const databasePath = 'database.json';
const legacyAuditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_005_sources.json';
const componentAuditPath = 'Daten/database_V2_omega3_components_batch_006.json';
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');

const F = {
  fat: 'Total Fat (g)',
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const legacyFields = [F.omega3, F.omega6, F.trans, F.alcohol];
const componentFields = [F.ala, F.epa, F.dha];
const allFields = [...legacyFields, ...componentFields];
const extras = {
  401: 170294, 405: 170331, 406: 172097, 410: 174648, 418: 174195,
  419: 173681, 423: 172103, 424: 168110, 427: 171161, 433: 175117,
  434: 167622, 435: 170718, 436: 173331, 437: 171140, 438: 170347,
  439: 172379, 440: 173423, 442: 174491, 444: 174346, 446: 169677,
  454: 174355, 458: 171443, 460: 171845, 462: 168445, 467: 170317,
  468: 170366, 473: 167549, 474: 170294, 481: 168650,
};
const zeroFatIndices = [408, 415, 448, 452, 456, 464, 477, 487];
const plantOnlyIndices = new Set([411, 417, 425, 426, 427, 428, 429, 430, 445, 447, 448, 461, 462, 463, 464, 465, 471, 472, 473, 479, 486, 493, 494, 496, 497, 498, 499]);
const bls = {
  428: { code: 'G322132', name: 'Grünkohl gekocht', values: { [F.omega3]: 0.28, [F.omega6]: 0.0612, [F.ala]: 0.28, [F.epa]: 0, [F.dha]: 0 } },
  442: { code: 'Y5A3000', name: 'Hühnerleber gebraten', values: { [F.omega3]: 0.24, [F.omega6]: 1.27, [F.ala]: 0.14, [F.epa]: 0.0187, [F.dha]: 0.0498 } },
  453: { code: 'V515100', name: 'Lamm Herz, roh', values: { [F.omega3]: 0.13, [F.omega6]: 0.36, [F.ala]: 0.09, [F.epa]: 0.04, [F.dha]: 0 } },
  457: { code: 'T107172', name: 'Makrele gegrillt', values: { [F.omega3]: 2.328, [F.omega6]: 0.423, [F.ala]: 0.176, [F.epa]: 0.733, [F.dha]: 0.921 } },
  476: { code: 'X916063', name: 'Specktorte lothringisch', values: { [F.omega3]: 0.31, [F.omega6]: 1.37, [F.ala]: 0.28, [F.epa]: 0.004, [F.dha]: 0.014 } },
};

const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const legacyAudit = JSON.parse(fs.readFileSync(legacyAuditPath, 'utf8'));
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(fdcPath, 'utf8'));
if (db.length < lastIndex) throw new Error(`Database only has ${db.length} records.`);

const byDescription = new Map(SRLegacyFoods.map(food => [food.description, food]));
const byId = new Map(SRLegacyFoods.map(food => [food.fdcId, food]));
const amount = (food, nutrientNumber) => food.foodNutrients.find(row => String(row.nutrient.number) === String(nutrientNumber))?.amount ?? null;
const fattyRows = food => food.foodNutrients.filter(row => /^PUFA /.test(row.nutrient.name) && row.amount != null);
const chain = name => name.match(/\b(\d{2}:\d)\b/)?.[1] ?? name;
const sumChains = (rows, predicate) => {
  const selected = new Map();
  for (const row of rows) {
    if (!predicate(row.nutrient.name)) continue;
    const key = chain(row.nutrient.name);
    const previous = selected.get(key);
    if (!previous || row.nutrient.name.length > previous.nutrient.name.length) selected.set(key, row);
  }
  return selected.size ? [...selected.values()].reduce((total, row) => total + row.amount, 0) : null;
};
const profileFor = food => {
  const rows = fattyRows(food);
  const ala = rows.find(row => /18:3.*n-3.*ALA/i.test(row.nutrient.name))
    ?? rows.find(row => /18:3.*n-3/i.test(row.nutrient.name))
    ?? rows.find(row => row.nutrient.name === 'PUFA 18:3');
  return {
    id: food.fdcId,
    description: food.description,
    fat: amount(food, 204),
    omega3: sumChains(rows, name => /n-3/.test(name) || /^PUFA 18:3$/.test(name) || /^PUFA 18:4\b/.test(name)),
    omega6: sumChains(rows, name => /n-6/.test(name) || /^PUFA 18:2$/.test(name) || /^PUFA (20:2|20:3|20:4|22:4)$/.test(name)),
    ala: ala?.amount ?? null,
    epa: rows.find(row => /20:5.*EPA/i.test(row.nutrient.name))?.amount ?? null,
    dha: rows.find(row => /22:6.*DHA/i.test(row.nutrient.name))?.amount ?? null,
    trans: amount(food, 605),
    alcohol: amount(food, 221),
    url: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients?type=SR%20Legacy`,
  };
};
const sourceByIndex = new Map();
for (const row of legacyAudit.records ?? []) {
  if (row.databaseIndex < firstIndex || row.databaseIndex > lastIndex) continue;
  if (row.source !== 'USDA_FoodData_Central_SR_Legacy_2018' || !row.sourceName) continue;
  const food = byDescription.get(row.sourceName);
  if (food) sourceByIndex.set(row.databaseIndex, { profile: profileFor(food), kind: 'mapped USDA food', note: row.mappingNote ?? 'Mapped from the existing item-level fatty-acid source audit.' });
}
for (const [indexText, id] of Object.entries(extras)) {
  const index = Number(indexText);
  if (sourceByIndex.has(index)) continue;
  const food = byId.get(id);
  if (food) sourceByIndex.set(index, { profile: profileFor(food), kind: 'close USDA profile', note: 'Closest manually selected species or prepared-food profile; fat scaling is used only when the ratio is within 0.5 to 1.5.' });
}

const round6 = value => Number(Math.max(0, value).toFixed(6));
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const changed = new Map();
const sourceRows = new Map();
const put = (index, field, value, source, method) => {
  if (!isNumber(value)) return;
  const item = db[index - 1];
  if (item.nutrients[field] != null) return;
  item.nutrients[field] = round6(value);
  if (!changed.has(index)) changed.set(index, {});
  changed.get(index)[field] = item.nutrients[field];
  if (!sourceRows.has(index)) sourceRows.set(index, { source, method });
};

for (let index = firstIndex; index <= lastIndex; index++) {
  const item = db[index - 1];
  const entry = sourceByIndex.get(index);
  if (!entry || bls[index]) continue;
  const profile = entry.profile;
  const targetFat = item.nutrients[F.fat];
  let scale = 1;
  if (item.unit !== 'ml' && isNumber(targetFat) && isNumber(profile.fat) && profile.fat > 0) {
    const ratio = targetFat / profile.fat;
    if (ratio < 0.5 || ratio > 1.5) {
      if (entry.kind === 'close USDA profile') continue;
    } else scale = ratio;
  }
  const source = `USDA_FoodData_Central_SR_Legacy_2018:${profile.id}`;
  const scaleNote = scale === 1 ? '' : ` scaled by database/source fat ratio ${scale.toFixed(3)}`;
  const method = `${entry.kind}${scaleNote}; only source-reported numeric fatty-acid values are transferred.`;
  const omega3 = isNumber(profile.omega3) ? profile.omega3 * scale : null;
  const omega6 = isNumber(profile.omega6) ? profile.omega6 * scale : null;
  put(index, F.omega3, omega3, source, method);
  put(index, F.omega6, omega6, source, method);
  put(index, F.trans, isNumber(profile.trans) ? profile.trans * scale : (targetFat === 0 ? 0 : null), source, method);
  put(index, F.alcohol, isNumber(profile.alcohol) ? profile.alcohol * scale : null, source, method);

  let components = [profile.ala, profile.epa, profile.dha].map(value => isNumber(value) ? value * scale : null);
  const totalOmega3 = item.nutrients[F.omega3] ?? omega3;
  const sum = components.reduce((total, value) => total + (value ?? 0), 0);
  if (isNumber(totalOmega3) && sum > totalOmega3 && sum > 0) {
    const factor = totalOmega3 / sum;
    components = components.map(value => value == null ? null : value * factor);
  }
  [F.ala, F.epa, F.dha].forEach((field, i) => put(index, field, components[i], source, method));
  if (plantOnlyIndices.has(index)) {
    if (item.nutrients[F.epa] == null) put(index, F.epa, 0, 'FoodIdentity', 'Plant-only food profile excludes marine EPA; set to zero, not a missing source value.');
    if (item.nutrients[F.dha] == null) put(index, F.dha, 0, 'FoodIdentity', 'Plant-only food profile excludes marine DHA; set to zero, not a missing source value.');
    if (item.nutrients[F.ala] == null && isNumber(totalOmega3)) put(index, F.ala, totalOmega3, 'PlantFoodOmega3Proxy', 'Plant-only food: existing/source total omega-3 treated as ALA; EPA and DHA are excluded by food identity.');
  }
}

for (const [indexText, entry] of Object.entries(bls)) {
  const index = Number(indexText);
  for (const [field, value] of Object.entries(entry.values)) {
    put(index, field, value, `BLS_4_0:${entry.code}`, 'BLS 4.0 item-level fatty-acid profile; official table values in g per 100 g.');
  }
  put(index, F.alcohol, 0, `BLS_4_0:${entry.code}`, 'BLS item profile; non-alcoholic food.');
}

for (const index of zeroFatIndices) {
  const item = db[index - 1];
  if (item.nutrients[F.fat] !== 0) throw new Error(`Zero-fat derivation blocked for ${index}: Total Fat is ${item.nutrients[F.fat]}`);
  for (const field of [F.omega3, F.omega6, F.trans, F.ala, F.epa, F.dha]) {
    put(index, field, 0, 'DerivedTotalFatZero', 'Total Fat is exactly 0 in database; fatty-acid amounts are therefore 0 at the stored precision.');
  }
}

const block = db.slice(firstIndex - 1, lastIndex);
const coverage = Object.fromEntries(allFields.map(field => {
  const filled = block.filter(item => isNumber(item.nutrients[field])).length;
  return [field, { filled, missing: block.length - filled, total: block.length }];
}));
const invalid = [];
for (let offset = 0; offset < block.length; offset++) {
  const item = block[offset];
  for (const field of allFields) if (isNumber(item.nutrients[field]) && item.nutrients[field] < 0) invalid.push({ databaseIndex: firstIndex + offset, field, value: item.nutrients[field] });
  const total = item.nutrients[F.omega3];
  const componentTotal = [F.ala, F.epa, F.dha].reduce((sum, field) => sum + (isNumber(item.nutrients[field]) ? item.nutrients[field] : 0), 0);
  if (isNumber(total) && componentTotal > total + 0.000001) invalid.push({ databaseIndex: firstIndex + offset, issue: 'ALA+EPA+DHA exceeds omega-3 total', componentTotal, total });
}
if (invalid.length) throw new Error(`Validation failed: ${JSON.stringify(invalid.slice(0, 5))}`);

const componentRecords = block.map((item, offset) => {
  const index = firstIndex + offset;
  const entry = sourceByIndex.get(index);
  const b = bls[index];
  const auditSource = b ? `BLS 4.0, code ${b.code}` : entry ? `USDA FDC SR Legacy ${entry.profile.id}: ${entry.profile.description}` : zeroFatIndices.includes(index) ? 'Total Fat = 0' : null;
  const numeric = Object.fromEntries(componentFields.map(field => [field, isNumber(item.nutrients[field]) ? item.nutrients[field] : null]));
  const missing = componentFields.filter(field => !isNumber(item.nutrients[field]));
  return {
    databaseIndex: index,
    databaseArrayIndex: index - 1,
    food: item.name,
    unitBasis: item.unit === 'ml' ? 'g per 100 ml' : 'g per 100 g',
    values: numeric,
    source: auditSource,
    sourceUrl: b ? 'https://blsdb.de/download' : entry ? entry.profile.url : null,
    confidence: b ? 'item-level BLS value' : entry ? entry.kind : zeroFatIndices.includes(index) ? 'logical zero from zero total fat' : 'unresolved, left blank',
    method: b ? 'Exact BLS row and component columns checked in the local 2025 export.' : entry ? entry.note : zeroFatIndices.includes(index) ? 'Zero derived only where database Total Fat is exactly 0.' : 'No exact or sufficiently close source match was verified; no blanket class estimate applied.',
    missing,
  };
});

for (const [index, values] of changed) {
  const item = db[index - 1];
  const source = sourceRows.get(index) ?? {};
  legacyAudit.records.push({
    databaseIndex: index,
    databaseName: item.name,
    source: source.source ?? 'FoodIdentity',
    sourceName: source.source ?? 'Food identity / zero-fat derivation',
    sourceUrl: source.source?.startsWith('USDA_') ? sourceByIndex.get(index)?.profile.url : source.source?.startsWith('BLS_') ? 'https://blsdb.de/download' : null,
    values,
    mappingNote: source.method ?? 'Item-specific logical zero checked from food identity and total fat.',
    checkedOn,
  });
}

const componentAudit = {
  checkedOn,
  scope: { firstDatabaseIndex: firstIndex, lastDatabaseIndex: lastIndex, count: block.length, unitBasis: 'g per 100 g; g per 100 ml for liquid entries' },
  fields: { ALA: F.ala, EPA: F.epa, DHA: F.dha },
  fieldCoverage: Object.fromEntries(componentFields.map(field => [field, coverage[field]])),
  legacyFieldCoverage: Object.fromEntries(legacyFields.map(field => [field, coverage[field]])),
  sources: {
    USDA_FoodData_Central_SR_Legacy: 'https://fdc.nal.usda.gov/download-datasets/',
    BLS_4_0: 'https://blsdb.de/download',
  },
  methodNotes: [
    'This is a partial, source-checked application for database indices 401-500. It does not mark the 100-record batch complete.',
    'Direct and close USDA food profiles are recorded by FDC ID. Fat scaling is limited to ratios from 0.5 to 1.5; unsupported ratios are skipped.',
    'BLS 4.0 item-level component values take priority for exact matched items. Zero components are used only for explicit source zeros, plant-only EPA/DHA exclusions, or foods whose database Total Fat is exactly 0.',
    'No blanket food-class split is applied. Unresolved values remain blank and are listed per item rather than being presented as zero.',
    'When ALA+EPA+DHA would exceed a pre-existing omega-3 total, components are proportionally bounded to that total.',
  ],
  updatedDatabaseIndices: [...changed.keys()].sort((a, b) => a - b),
  fieldCoverage: Object.fromEntries(componentFields.map(field => [field, coverage[field]])),
  records: componentRecords,
  missingComponentRows: componentRecords.filter(row => row.missing.length),
  validation: {
    allSevenFieldsNumeric: allFields.every(field => coverage[field].missing === 0),
    negativeValues: 0,
    componentSumExceedsTotalOmega3: 0,
    remainingComponentCells: componentRecords.reduce((sum, row) => sum + row.missing.length, 0),
  },
};

const apply = process.argv.includes('--apply');
if (apply) {
  legacyAudit.checkedOn = checkedOn;
  legacyAudit.batch006Progress = {
    status: 'in_progress',
    firstDatabaseIndex: firstIndex,
    lastDatabaseIndex: lastIndex,
    updatedRows: changed.size,
    fieldCoverage: Object.fromEntries(legacyFields.map(field => [field, coverage[field]])),
    note: 'Partial source-backed updates only. Remaining rows are not considered complete.',
  };
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(legacyAuditPath, `${JSON.stringify(legacyAudit, null, 2)}\n`, 'utf8');
  fs.writeFileSync(componentAuditPath, `${JSON.stringify(componentAudit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  mode: apply ? 'applied' : 'dry-run',
  scope: `${firstIndex}-${lastIndex}`,
  mappedUSDAProfiles: sourceByIndex.size,
  updatedRows: changed.size,
  fieldUpdates: Object.fromEntries(allFields.map(field => [field, [...changed.values()].filter(values => Object.hasOwn(values, field)).length])),
  coverage,
  remainingComponents: componentRecords.reduce((sum, row) => sum + row.missing.length, 0),
  invalid,
}, null, 2));
