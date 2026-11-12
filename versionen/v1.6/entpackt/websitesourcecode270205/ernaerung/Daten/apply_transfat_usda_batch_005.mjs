import fs from 'node:fs';
import path from 'node:path';

const firstIndex = 401;
const lastIndex = 500;
const sourceAuditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_005_sources.json';
const componentAuditPath = 'Daten/database_V2_omega3_components_batch_006.json';
const outputAuditPath = 'Daten/database_V2_transfat_batch_005_usda_sources.json';
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const apply = process.argv.includes('--apply');
const field = 'Trans Fat (g)';
const db = JSON.parse(fs.readFileSync('database.json', 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, 'utf8'));
const componentAudit = JSON.parse(fs.readFileSync(componentAuditPath, 'utf8'));
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(fdcPath, 'utf8'));
if (db.length < lastIndex) throw new Error(`Database has only ${db.length} rows.`);
if (apply && fs.existsSync(outputAuditPath)) throw new Error(`Audit already exists: ${outputAuditPath}`);

const foodsByDescription = new Map(SRLegacyFoods.map(food => [food.description, food]));
const foodsById = new Map(SRLegacyFoods.map(food => [Number(food.fdcId), food]));
const candidateByIndex = new Map();
const addCandidate = (index, fdcId, evidence) => {
  if (index < firstIndex || index > lastIndex || !Number.isInteger(fdcId) || !foodsById.has(fdcId)) return;
  if (!candidateByIndex.has(index)) candidateByIndex.set(index, new Map());
  const byId = candidateByIndex.get(index);
  if (!byId.has(fdcId)) byId.set(fdcId, { fdcId, evidence: [] });
  byId.get(fdcId).evidence.push(evidence);
};

for (const record of sourceAudit.records ?? []) {
  const index = Number(record.databaseIndex);
  if (index < firstIndex || index > lastIndex) continue;
  let id = Number(record.fdcId);
  const embeddedId = String(record.source ?? '').match(/USDA_FoodData_Central_SR_Legacy_2018:(\d+)/)?.[1];
  if (!Number.isInteger(id) && embeddedId) id = Number(embeddedId);
  if (Number.isInteger(id)) {
    const profile = foodsById.get(id);
    addCandidate(index, id, { origin: 'fatty-acid source audit', matchMethod: record.matchMethod ?? null, sourceName: profile?.description ?? record.sourceName ?? null, sourceUrl: record.sourceUrl ?? null });
  } else if (record.source === 'USDA_FoodData_Central_SR_Legacy_2018' && record.sourceName) {
    const profile = foodsByDescription.get(record.sourceName);
    if (profile) addCandidate(index, Number(profile.fdcId), { origin: 'fatty-acid source audit', matchMethod: record.matchMethod ?? null, sourceName: profile.description, sourceUrl: record.sourceUrl ?? null });
  }
}
for (const record of componentAudit.records ?? []) {
  const index = Number(record.databaseIndex);
  if (index < firstIndex || index > lastIndex || !String(record.source ?? '').includes('USDA')) continue;
  const id = Number(String(record.sourceUrl ?? '').match(/food-details\/(\d+)/)?.[1]);
  if (Number.isInteger(id)) addCandidate(index, id, { origin: 'verified Omega-3 component audit', matchMethod: record.confidence ?? null, sourceName: record.source ?? null, sourceUrl: record.sourceUrl ?? null });
}

const number = (food, nutrientNumber) => food.foodNutrients.find(row => String(row.nutrient?.number) === String(nutrientNumber))?.amount ?? null;
const normalizeTokens = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  .filter(token => token && !new Set(['fish','food','cooked','roasted','grilled','baked','dry','heat','prepared','raw','regular','enriched','domesticated','whole','the','and','with','without','only','skinless','boneless','fresh','farmed','atlantic']).has(token));
const similarity = (left, right) => {
  const a = new Set(normalizeTokens(left));
  const b = new Set(normalizeTokens(right));
  if (!a.size || !b.size) return 0;
  return [...a].filter(token => b.has(token)).length / Math.max(a.size, b.size);
};

const records = [];
const updates = [];
for (let index = firstIndex; index <= lastIndex; index++) {
  const item = db[index - 1];
  const current = item.nutrients?.[field];
  const candidates = [...(candidateByIndex.get(index)?.values() ?? [])].map(candidate => {
    const food = foodsById.get(candidate.fdcId);
    return {
      ...candidate,
      description: food.description,
      sourceTrans: number(food, 605),
      sourceFat: number(food, 204),
      targetFat: item.nutrients?.['Total Fat (g)'] ?? null,
      nameScore: similarity(item.name_en || item.name, food.description),
    };
  });
  let selected = candidates.length === 1 ? candidates[0] : null;
  let status = current != null ? 'already_populated' : candidates.length === 0 ? 'no_audited_USDA_match' : candidates.length > 1 ? 'multiple_audited_USDA_matches' : 'source_trans_not_numeric';
  let value = null;
  let method = null;
  if (current == null && selected && Number.isFinite(selected.sourceTrans)) {
    const ratio = Number.isFinite(selected.targetFat) && Number.isFinite(selected.sourceFat) && selected.sourceFat > 0
      ? selected.targetFat / selected.sourceFat : null;
    if (selected.nameScore < 0.4 || (selected.sourceTrans > 0 && ratio != null && (ratio < 0.5 || ratio > 1.5))) {
      status = 'match_or_fat_ratio_needs_review';
      selected.ratio = ratio;
    } else {
      const useScale = selected.sourceTrans > 0 && ratio != null && Math.abs(ratio - 1) > 0.05;
      value = Number((selected.sourceTrans * (useScale ? ratio : 1)).toFixed(6));
      method = useScale ? 'USDA SR Legacy trans-fat value scaled by the checked target/source total-fat ratio; estimate.' : 'USDA SR Legacy item-level profile; copied at source precision.';
      status = 'ready';
      selected.ratio = ratio;
      selected.scaleApplied = useScale;
      selected.proposedValue = value;
      if (apply) item.nutrients[field] = value;
      updates.push({ databaseIndex: index, food: item.name, value, source: selected });
    }
  }
  records.push({ databaseIndex: index, food: item.name, currentValue: current ?? null, status, proposedValue: value, method, candidates });
}

const missingBefore = db.slice(firstIndex - 1, lastIndex).filter(item => item.nutrients?.[field] == null).length;
const missingAfter = db.slice(firstIndex - 1, lastIndex).filter(item => item.nutrients?.[field] == null).length - (apply ? updates.length : 0);
const audit = {
  checkedOn: '2026-09-25',
  scope: { firstDatabaseIndex: firstIndex, lastDatabaseIndex: lastIndex, count: lastIndex - firstIndex + 1 },
  field,
  unitBasis: 'g per 100 g edible food',
  source: { name: 'USDA FoodData Central SR Legacy', url: 'https://fdc.nal.usda.gov/download-datasets/', nutrientNumber: '605' },
  method: 'Only USDA profiles already linked in the fatty-acid or component source audits are considered. A profile is used only when its food-name token match is adequate and any positive value requiring fat-ratio scaling has a ratio between 0.5 and 1.5. Missing USDA nutrient values are not converted to zero.',
  beforeCoverage: { filled: lastIndex - firstIndex + 1 - missingBefore, missing: missingBefore, total: lastIndex - firstIndex + 1 },
  afterCoverage: { filled: lastIndex - firstIndex + 1 - missingAfter, missing: missingAfter, total: lastIndex - firstIndex + 1 },
  updatedRecords: updates,
  records,
  validation: { nonnegative: updates.every(record => record.value >= 0), noOverwrite: true, readBackChecked: apply },
};

if (apply) {
  fs.writeFileSync('database.json', `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputAuditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  const readBack = JSON.parse(fs.readFileSync('database.json', 'utf8'));
  for (const update of updates) if (readBack[update.databaseIndex - 1].nutrients[field] !== update.value) throw new Error(`Read-back mismatch at row ${update.databaseIndex}`);
}

console.log(JSON.stringify({
  mode: apply ? 'applied' : 'dry-run',
  range: [firstIndex, lastIndex],
  transMissingBefore: missingBefore,
  candidateRows: records.filter(row => row.candidates.length > 0).length,
  proposedRows: updates.length,
  proposed: updates.map(row => ({ databaseIndex: row.databaseIndex, food: row.food, value: row.value, sourceName: row.source.description, fdcId: row.source.fdcId, nameScore: row.source.nameScore, ratio: row.source.ratio, scaleApplied: row.source.scaleApplied })),
  notReady: records.filter(row => row.status !== 'ready' && row.currentValue == null).map(row => ({ databaseIndex: row.databaseIndex, food: row.food, status: row.status, candidates: row.candidates.map(candidate => ({ fdcId: candidate.fdcId, description: candidate.description, trans: candidate.sourceTrans, nameScore: candidate.nameScore })) })),
  auditPath: apply ? outputAuditPath : null,
}, null, 2));
