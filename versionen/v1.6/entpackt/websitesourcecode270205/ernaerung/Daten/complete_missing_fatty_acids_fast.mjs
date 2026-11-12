import fs from 'node:fs';

const args = process.argv.slice(2);
const argNumber = (name, fallback) => {
  const value = args.find((part) => part.startsWith(`--${name}=`));
  return value ? Number(value.slice(name.length + 3)) : fallback;
};
const firstIndex = argNumber('first', 701);
const lastIndex = argNumber('last', 800);
const apply = args.includes('--apply');
const checkedOn = '2026-09-25';
const databasePath = 'database.json';
const dataDir = 'Daten';
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
if (!Number.isInteger(firstIndex) || !Number.isInteger(lastIndex) || firstIndex < 1 || lastIndex < firstIndex || lastIndex > db.length) {
  throw new Error(`Invalid database range ${firstIndex}-${lastIndex}; database has ${db.length} items.`);
}

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
const componentFields = [F.ala, F.epa, F.dha];
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const round6 = (value) => Math.round(value * 1e6) / 1e6;
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const inTargetRange = (index) => index >= firstIndex && index <= lastIndex;

const sourceByIndex = new Map();
const batchNumber = String(Math.floor((firstIndex - 1) / 100) + 1).padStart(3, '0');
const sourceAuditPath = `${dataDir}/database_V2_fatty_acids_alcohol_batch_${batchNumber}_sources.json`;
if (fs.existsSync(sourceAuditPath)) {
  const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, 'utf8'));
  for (const record of sourceAudit.records ?? []) {
    if (!inTargetRange(record.databaseIndex)) continue;
    const current = sourceByIndex.get(record.databaseIndex) ?? [];
    current.push(record);
    sourceByIndex.set(record.databaseIndex, current);
  }
}

const componentAudits = [];
for (const name of fs.readdirSync(dataDir)) {
  if (!/^database_V2_omega3_components_.*\.json$/i.test(name)) continue;
  try {
    const audit = JSON.parse(fs.readFileSync(`${dataDir}/${name}`, 'utf8'));
    if (Array.isArray(audit.records)) componentAudits.push({ name, audit });
  } catch {
    // Ignore unrelated or malformed historical audit files; the current database remains authoritative.
  }
}
const componentSourceByIndex = new Map();
for (const { name, audit } of componentAudits) {
  for (const record of audit.records ?? []) {
    if (!inTargetRange(record.databaseIndex)) continue;
    const sources = componentSourceByIndex.get(record.databaseIndex) ?? [];
    sources.push({ name, record });
    componentSourceByIndex.set(record.databaseIndex, sources);
  }
}

const trainingRows = db
  .map((item, offset) => ({ item, index: offset + 1 }))
  .filter(({ index }) => !inTargetRange(index));
const profiles = new Map();
const addRatio = (category, field, value) => {
  if (!Number.isFinite(value) || value < 0) return;
  const key = `${category}\u0000${field}`;
  const values = profiles.get(key) ?? [];
  values.push(value);
  profiles.set(key, values);
};
const ratioFields = [F.omega3, F.omega6, F.trans];
for (const { item } of trainingRows) {
  const nutrients = item.nutrients ?? {};
  const fat = nutrients[F.fat];
  if (finite(fat) && fat > 0) {
    for (const field of ratioFields) {
      if (finite(nutrients[field])) addRatio(item.category, field, nutrients[field] / fat);
    }
  }
  const omega3 = nutrients[F.omega3];
  if (finite(omega3) && omega3 > 0 && componentFields.every((field) => finite(nutrients[field]))) {
    const sum = componentFields.reduce((total, field) => total + nutrients[field], 0);
    if (sum <= omega3 + 1e-6) {
      for (const field of componentFields) addRatio(item.category, `${field}__share`, nutrients[field] / omega3);
    }
  }
}
const globalProfiles = new Map();
for (const [key, values] of profiles) {
  const field = key.slice(key.indexOf('\u0000') + 1);
  const list = globalProfiles.get(field) ?? [];
  list.push(...values);
  globalProfiles.set(field, list);
}
const profileFor = (category, field, minimum = 5) => {
  const values = profiles.get(`${category}\u0000${field}`) ?? [];
  const globalValues = globalProfiles.get(field) ?? [];
  const chosen = values.length >= minimum ? values : globalValues;
  return { value: median(chosen), sampleSize: chosen.length, categorySampleSize: values.length, fallback: chosen === globalValues };
};

const fieldAliases = new Set(Object.values(F));
const auditRows = [];
const appliedUpdates = [];
const sourceRank = (record) => {
  const source = String(record.source ?? '');
  if (source.startsWith('BLS_4_0') || source.includes('BLS_4_0')) return 1;
  if (source.startsWith('CoFID')) return 2;
  if (source.startsWith('USDA_') || source.includes('USDA_FoodData_Central')) return 3;
  return 4;
};
const sourceCandidates = (index, field) => {
  const candidates = [];
  for (const record of sourceByIndex.get(index) ?? []) {
    for (const values of [record.values, record.addedValues, record.derivedOmegas]) {
      if (values && finite(values[field])) candidates.push({ value: values[field], source: record.source, sourceName: record.sourceName ?? record.sourceCode ?? null, audit: sourceAuditPath });
    }
  }
  if (componentFields.includes(field)) {
    for (const { name, record } of componentSourceByIndex.get(index) ?? []) {
      const source = record.sources?.[field];
      if (finite(record.values?.[field]) && source) candidates.push({ value: record.values[field], source: source.source ?? 'component source audit', sourceName: source.sourceName ?? null, audit: `${dataDir}/${name}` });
    }
  }
  return candidates.sort((a, b) => sourceRank(a) - sourceRank(b));
};
const bestSource = (index, field) => {
  const candidates = sourceCandidates(index, field);
  if (!candidates.length) return null;
  const preferredRank = sourceRank({ source: candidates[0].source });
  const preferred = candidates.filter((candidate) => sourceRank(candidate) === preferredRank);
  const values = preferred.map((candidate) => candidate.value);
  if (Math.max(...values) - Math.min(...values) > 0.005) {
    return { conflict: true, candidates };
  }
  return { ...preferred[0], conflict: false, candidates };
};

for (let index = firstIndex; index <= lastIndex; index++) {
  const item = db[index - 1];
  item.nutrients ??= {};
  const before = { ...item.nutrients };
  const fieldAudit = [];
  const fills = {};
  const fill = (field, value, method) => {
    if (item.nutrients[field] != null || !finite(value)) return false;
    item.nutrients[field] = round6(value);
    fills[field] = item.nutrients[field];
    fieldAudit.push({ field, value: item.nutrients[field], ...method });
    return true;
  };

  for (const field of [F.omega3, F.omega6, F.trans, F.alcohol, ...componentFields]) {
    if (finite(item.nutrients[field])) continue;
    const source = bestSource(index, field);
    if (source && !source.conflict) {
      fill(field, source.value, { method: 'source value', source: source.source, sourceName: source.sourceName, audit: source.audit, competingSources: source.candidates.length });
    } else if (source?.conflict) {
      fieldAudit.push({ field, method: 'source conflict; deferred to estimate', candidates: source.candidates });
    }
  }

  const fat = item.nutrients[F.fat];
  const scaleEstimate = (field, ratioField = field) => {
    if (item.nutrients[field] != null) return;
    if (finite(fat) && fat === 0) {
      fill(field, 0, { method: 'derived zero from zero total fat', confidence: 'high' });
      return;
    }
    if (!finite(fat)) return;
    const profile = profileFor(item.category, ratioField);
    if (profile.value == null) return;
    fill(field, fat * profile.value, {
      method: 'same-category median ratio to total fat',
      confidence: 'estimate',
      category: item.category,
      peerCount: profile.categorySampleSize,
      sampleCount: profile.sampleSize,
      fallbackToGlobal: profile.fallback,
      ratio: profile.value,
    });
  };

  if (item.nutrients[F.omega3] == null) {
    const componentSum = componentFields.reduce((sum, field) => sum + (finite(item.nutrients[field]) ? item.nutrients[field] : 0), 0);
    if (componentSum > 0) fill(F.omega3, componentSum, { method: 'sum of available ALA/EPA/DHA values', confidence: 'derived' });
    else scaleEstimate(F.omega3);
  }
  scaleEstimate(F.omega6);
  scaleEstimate(F.trans);
  if (item.nutrients[F.alcohol] == null) {
    const alcoholSource = bestSource(index, F.alcohol);
    if (alcoholSource && !alcoholSource.conflict) fill(F.alcohol, alcoholSource.value, { method: 'source value', source: alcoholSource.source, audit: alcoholSource.audit });
  }

  const omega3 = item.nutrients[F.omega3];
  if (finite(omega3)) {
    for (const field of componentFields) {
      if (item.nutrients[field] != null) continue;
      if (omega3 === 0 || (finite(fat) && fat === 0)) {
        fill(field, 0, { method: 'derived zero from zero total Omega-3', confidence: 'high' });
        continue;
      }
      const profile = profileFor(item.category, `${field}__share`);
      if (profile.value == null) continue;
      fill(field, omega3 * profile.value, {
        method: 'same-category median share of total Omega-3',
        confidence: 'estimate',
        category: item.category,
        peerCount: profile.categorySampleSize,
        sampleCount: profile.sampleSize,
        fallbackToGlobal: profile.fallback,
        share: profile.value,
      });
    }
  }

  const componentSum = componentFields.reduce((sum, field) => sum + (finite(item.nutrients[field]) ? item.nutrients[field] : 0), 0);
  if (finite(omega3) && componentSum > omega3 + 0.000001) {
    const estimatedFields = fieldAudit.filter((row) => componentFields.includes(row.field) && row.confidence === 'estimate');
    const fixedSum = componentFields
      .filter((field) => !estimatedFields.some((row) => row.field === field))
      .reduce((sum, field) => sum + (finite(item.nutrients[field]) ? item.nutrients[field] : 0), 0);
    const estimateSum = estimatedFields.reduce((sum, row) => sum + row.value, 0);
    const available = Math.max(0, omega3 - fixedSum);
    if (estimateSum > 0) {
      const factor = available / estimateSum;
      for (const row of estimatedFields) {
        const revised = round6(row.value * factor);
        item.nutrients[row.field] = revised;
        fills[row.field] = revised;
        row.value = revised;
        row.scaledToOmega3Total = true;
        row.scaleFactor = factor;
      }
    }
  }

  if (fieldAudit.length) auditRows.push({ databaseIndex: index, food: item.name, category: item.category, changes: fieldAudit });
  if (Object.keys(fills).length) appliedUpdates.push({ databaseIndex: index, food: item.name, values: fills });
}

const block = db.slice(firstIndex - 1, lastIndex);
const fields = [F.omega3, F.omega6, F.trans, F.alcohol, ...componentFields];
const coverage = Object.fromEntries(fields.map((field) => [field, {
  filled: block.filter((item) => finite(item.nutrients?.[field])).length,
  missing: block.filter((item) => !finite(item.nutrients?.[field])).length,
  total: block.length,
}]));
const invalid = [];
for (let offset = 0; offset < block.length; offset++) {
  const nutrients = block[offset].nutrients ?? {};
  const index = firstIndex + offset;
  for (const field of fields) {
    const value = nutrients[field];
    if (value != null && !finite(value)) invalid.push({ databaseIndex: index, field, value });
  }
  const components = componentFields.reduce((sum, field) => sum + (finite(nutrients[field]) ? nutrients[field] : 0), 0);
  if (finite(nutrients[F.omega3]) && components > nutrients[F.omega3] + 0.000001) invalid.push({ databaseIndex: index, issue: 'ALA+EPA+DHA exceeds Omega-3', components, omega3: nutrients[F.omega3] });
  if (finite(nutrients[F.fat]) && finite(nutrients[F.omega3]) && finite(nutrients[F.omega6]) && nutrients[F.omega3] + nutrients[F.omega6] > nutrients[F.fat] + 0.05) invalid.push({ databaseIndex: index, issue: 'Omega-3 + Omega-6 exceeds total fat by >0.05g', omega3: nutrients[F.omega3], omega6: nutrients[F.omega6], fat: nutrients[F.fat] });
}
if (invalid.length) throw new Error(`Validation failed: ${JSON.stringify(invalid.slice(0, 10))}`);

const audit = {
  checkedOn,
  method: 'Fast completion: fill direct audited source values first, then estimate missing values from median ratios in matching food categories. Exact existing values are never overwritten.',
  scope: { firstDatabaseIndex: firstIndex, lastDatabaseIndex: lastIndex, count: block.length, unitBasis: 'g per 100 g; g per 100 ml for liquids' },
  sources: [
    sourceAuditPath,
    ...componentAudits.map(({ name }) => `${dataDir}/${name}`),
    'Existing completed database records in the same food category, excluding the target block, used only for median-ratio estimates.',
  ],
  coverage,
  changes: appliedUpdates,
  changeDetails: auditRows,
  validation: { invalidValues: 0, omega3ComponentSumConflicts: 0, omega3AndOmega6FatConflicts: 0 },
};
const auditPath = `${dataDir}/database_V2_fast_completion_${checkedOn.replaceAll('-', '')}_block_${batchNumber}.json`;
if (apply) {
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', range: [firstIndex, lastIndex], changedRows: appliedUpdates.length, changedCells: appliedUpdates.reduce((sum, row) => sum + Object.keys(row.values).length, 0), coverage, auditPath: apply ? auditPath : null, unresolvedRows: block.map((item, offset) => ({ databaseIndex: firstIndex + offset, food: item.name, missing: fields.filter((field) => !finite(item.nutrients?.[field])) })).filter((row) => row.missing.length), invalidValues: invalid.length }, null, 2));
