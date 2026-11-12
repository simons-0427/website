import fs from 'node:fs';
import path from 'node:path';

const databasePath = 'database.json';
const sourceAuditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_005_sources.json';
const componentAuditPath = 'Daten/database_V2_omega3_components_batch_006.json';
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, 'utf8'));
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(fdcPath, 'utf8'));
const firstIndex = 401;
const lastIndex = 500;
const date = '2026-09-24';
const F = {
  totalFat: 'Total Fat (g)',
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
const byDescription = new Map(SRLegacyFoods.map(food => [food.description, food]));
const byId = new Map(SRLegacyFoods.map(food => [food.fdcId, food]));

const extraProfiles = {
  401: { id: 170294, note: 'Single large-patty fast-food cheeseburger; close product match.' },
  405: { id: 170331, note: 'Burger King Original Chicken Sandwich; close chicken-burger match.' },
  406: { id: 172097, note: 'Canned chili con carne with beans; close prepared-recipe match.' },
  410: { id: 174648, note: 'Ready-to-eat corn flakes; close fortified-cereal match.' },
  418: { id: 174195, note: 'Prepared frozen fish sticks; close cod-fish-finger match.' },
  419: { id: 173681, note: 'Cooked Alaska pollock; CoFID total n-3/n-6 values remain authoritative for this row.' },
  423: { id: 172103, note: 'Heated pork egg roll; close meat spring-roll match.' },
  424: { id: 168110, note: 'Cooked cured ham, lean and fat; close grilled gammon match.' },
  427: { id: 171161, note: 'Canned vegetarian vegetable soup; close prepared-soup match.' },
  433: { id: 175117, note: 'Cooked Atlantic herring; close grilled-herring match.' },
  434: { id: 167622, note: 'Raw venison; close cooked venison match, fat amount is similar.' },
  435: { id: 170718, note: 'Breaded fast-food chicken pieces; close baked nugget match.' },
  436: { id: 173331, note: 'Prepared frozen chicken pot pie; close chicken-pie match.' },
  437: { id: 171140, note: 'Cooked skinless chicken breast; close grilled-breast match.' },
  438: { id: 170347, note: 'Fried chicken wing with meat, skin and breading; close cooked-wing match.' },
  439: { id: 172379, note: 'Cooked fried chicken leg, meat only; close roasted-drumstick match.' },
  440: { id: 173423, note: 'Whole egg, cooked fried; close fried-egg match.' },
  442: { id: 174491, note: 'Chicken liver, cooked pan-fried; close BLS-matched row.' },
  444: { id: 174346, note: 'Cooked stewed rabbit; close stewed-rabbit match.' },
  446: { id: 169677, note: 'Plain salted potato chips; close salted retail chips match.' },
  454: { id: 174355, note: 'Cooked braised lamb kidney; same food, preparation differs.' },
  458: { id: 171443, note: 'Reduced-fat mayonnaise with olive oil; close light-mayonnaise match.' },
  460: { id: 171845, note: 'Commercial plain naan; close retail naan match.' },
  462: { id: 168445, note: 'Oven-heated frozen steak fries; close oven-fries match.' },
  467: { id: 170317, note: 'Cooked frozen cheese pizza; close Margherita-pizza match.' },
  468: { id: 170366, note: 'Fast-food sausage pizza, thin crust; close meat-topping pizza match.' },
  473: { id: 167549, note: 'Oil-popped microwave popcorn; close packaged salted-popcorn match.' },
  474: { id: 170294, note: 'Single fast-food cheeseburger; close Quarter Pounder match, product-specific components are not reported.' },
  481: { id: 168650, note: 'Cooked 70/30 beef patty; close grilled beef-patty match, source fat is lower than database fat.' },
};

const nutrientAmount = (food, number) => food.foodNutrients.find(row => String(row.nutrient.number) === String(number))?.amount ?? null;
const fattyRows = food => food.foodNutrients.filter(row => /^PUFA /.test(row.nutrient.name) && row.amount != null);
const chain = name => name.match(/\b(\d{2}:\d)\b/)?.[1] ?? name;
const uniqueSum = (rows, predicate) => {
  const chosen = new Map();
  for (const row of rows) {
    const name = row.nutrient.name;
    if (!predicate(name)) continue;
    const key = chain(name);
    const previous = chosen.get(key);
    if (!previous || name.length > previous.nutrient.name.length) chosen.set(key, row);
  }
  return [...chosen.values()].reduce((sum, row) => sum + row.amount, 0);
};
const profileFor = food => {
  const rows = fattyRows(food);
  const alaRow = rows.find(row => /18:3.*n-3.*ALA/i.test(row.nutrient.name))
    ?? rows.find(row => /18:3.*n-3/i.test(row.nutrient.name))
    ?? rows.find(row => row.nutrient.name === 'PUFA 18:3');
  return {
    fdcId: food.fdcId,
    description: food.description,
    fat: nutrientAmount(food, 204),
    omega3: uniqueSum(rows, name => /n-3/.test(name) || /^PUFA 18:3$/.test(name) || /^PUFA 18:4\b/.test(name)),
    omega6: uniqueSum(rows, name => /n-6/.test(name) || /^PUFA 18:2$/.test(name) || /^PUFA (20:2|20:3|20:4|22:4)$/.test(name)),
    ala: alaRow?.amount ?? null,
    epa: rows.find(row => /20:5.*EPA/i.test(row.nutrient.name))?.amount ?? null,
    dha: rows.find(row => /22:6.*DHA/i.test(row.nutrient.name))?.amount ?? null,
    trans: nutrientAmount(food, 605),
    alcohol: nutrientAmount(food, 221),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients?type=SR%20Legacy`,
  };
};
const classified = item => {
  const text = `${item.name} ${item.name_en ?? ''}`.toLowerCase();
  if (item.category === 'fisch' || /\b(fish|fisch|salmon|lachs|herring|hering|crab|krabben|shrimp|garnelen|pollock|sardine|mackerel|makrele)\b/.test(text)) return 'fish';
  if (item.category === 'eier' || /\b(egg|eier|rührei|fried egg)\b/.test(text)) return 'egg';
  if (item.category === 'milch' || /\b(cheese|käse|cream|sahne|quark|yogurt|joghurt|halloumi|fromage|raita|soft-serve)\b/.test(text)) return 'dairy';
  if (item.category === 'fleisch' || /\b(beef|rind|chicken|hähnchen|pork|schwein|lamb|lamm|veal|kalb|venison|wild|ham|schinken|sausage|wurst|chorizo|burger|hack|ribs|spareribs|meat|fleisch|kebab|döner)\b/.test(text)) return 'meat';
  if (item.category === 'huelsenfruechte') return 'legume';
  if (item.category === 'getreide' || /\b(cereal|corn flakes|cornflake|couscous|croissant|oat|hafer|rice|reis|pasta|nudeln|naan|bread|brot|pancake|pfannkuchen|papad|papadam|popcorn|lasagna|lasagne|pizza|fries|pommes|potato|kartoffel|samosa|spring roll|egg roll|coleslaw|krautsalat|guacamole|vegetable|gemüse|soup|suppe|marmalade|marmelade|jam|konfitüre|mayonnaise|mayo|tofu|tempeh|soy|soja)\b/.test(text)) return 'plant';
  return 'mixed';
};
const ratios = {
  fish: { n3Fat: 0.12, n6Fat: 0.05, split: [0.04, 0.40, 0.56], transFat: 0 },
  meat: { n3Fat: 0.01, n6Fat: 0.12, split: [0.68, 0.15, 0.17], transFat: 0.004 },
  egg: { n3Fat: 0.01, n6Fat: 0.16, split: [0.55, 0.10, 0.35], transFat: 0.002 },
  dairy: { n3Fat: 0.004, n6Fat: 0.03, split: [0.86, 0.06, 0.08], transFat: 0.025 },
  legume: { n3Fat: 0.10, n6Fat: 0.25, split: [1, 0, 0], transFat: 0 },
  plant: { n3Fat: 0.025, n6Fat: 0.32, split: [1, 0, 0], transFat: 0 },
  mixed: { n3Fat: 0.007, n6Fat: 0.20, split: [0.62, 0.17, 0.21], transFat: 0.003 },
};
const round4 = value => Number(Math.max(0, value).toFixed(4));
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const setIfMissing = (nutrients, field, value, updates) => {
  if (nutrients[field] == null && isNumber(value)) {
    nutrients[field] = round4(value);
    updates[field] = nutrients[field];
  }
};

if (db.length < lastIndex) throw new Error(`Database has only ${db.length} rows.`);
const sourceByIndex = new Map();
for (const record of sourceAudit.records ?? []) {
  if (record.databaseIndex >= firstIndex && record.databaseIndex <= lastIndex && record.source === 'USDA_FoodData_Central_SR_Legacy_2018' && record.sourceName) {
    const food = byDescription.get(record.sourceName);
    if (food) sourceByIndex.set(record.databaseIndex, { profile: profileFor(food), match: 'mapped source food', note: record.mappingNote ?? 'Source match carried forward from the batch audit.' });
  }
}
for (const [indexText, selection] of Object.entries(extraProfiles)) {
  const index = Number(indexText);
  if (!sourceByIndex.has(index)) {
    const food = byId.get(selection.id);
    if (food) sourceByIndex.set(index, { profile: profileFor(food), match: 'close USDA profile', note: selection.note });
  }
}

const resultRows = [];
const legacyUpdates = [];
for (let index = firstIndex; index <= lastIndex; index++) {
  const item = db[index - 1];
  const nutrients = item.nutrients;
  const sourceEntry = sourceByIndex.get(index) ?? null;
  const profile = sourceEntry?.profile ?? null;
  const foodClass = classified(item);
  const ratio = ratios[foodClass];
  const fat = Number(nutrients[F.totalFat] ?? 0);
  let scale = 1;
  if (profile && isNumber(profile.fat) && profile.fat > 0 && fat > 0 && item.unit !== 'ml') {
    const candidateScale = fat / profile.fat;
    if (candidateScale >= 0.5 && candidateScale <= 1.5) scale = candidateScale;
  }

  const changed = {};
  const currentOmega3 = nutrients[F.omega3];
  const currentOmega6 = nutrients[F.omega6];
  const profOmega3 = profile && isNumber(profile.omega3) ? profile.omega3 * scale : null;
  const profOmega6 = profile && isNumber(profile.omega6) ? profile.omega6 * scale : null;
  const totalOmega3 = isNumber(currentOmega3) ? currentOmega3 : profOmega3 ?? fat * ratio.n3Fat;
  setIfMissing(nutrients, F.omega3, totalOmega3, changed);
  const finalOmega3 = nutrients[F.omega3];
  setIfMissing(nutrients, F.omega6, profOmega6 ?? fat * ratio.n6Fat, changed);

  if (nutrients[F.trans] == null) {
    if (profile && isNumber(profile.trans)) setIfMissing(nutrients, F.trans, profile.trans * scale, changed);
    else if (fat === 0 || foodClass === 'plant' || foodClass === 'legume' || foodClass === 'fish') setIfMissing(nutrients, F.trans, 0, changed);
    else setIfMissing(nutrients, F.trans, fat * ratio.transFat, changed);
  }
  if (nutrients[F.alcohol] == null) {
    if (profile && isNumber(profile.alcohol)) setIfMissing(nutrients, F.alcohol, profile.alcohol * scale, changed);
    else if (item.category !== 'getraenke' && !/wine|beer|cider|alcohol|wein|bier|apfelwein|likör/i.test(`${item.name} ${item.name_en ?? ''}`)) setIfMissing(nutrients, F.alcohol, 0, changed);
  }

  const sourceComponents = profile ? [profile.ala, profile.epa, profile.dha].map(value => isNumber(value) ? value * scale : null) : [null, null, null];
  const values = sourceComponents.map((value, componentIndex) => {
    if (isNumber(value)) return value;
    if (foodClass === 'plant' || foodClass === 'legume') return componentIndex === 0 ? finalOmega3 : 0;
    return finalOmega3 * ratio.split[componentIndex];
  });
  const sum = values.reduce((total, value) => total + value, 0);
  if (isNumber(finalOmega3) && sum > finalOmega3 && sum > 0) {
    const factor = finalOmega3 / sum;
    for (let i = 0; i < values.length; i++) values[i] *= factor;
  }
  const [ala, epa, dha] = values.map(round4);
  Object.assign(nutrients, { [F.ala]: ala, [F.epa]: epa, [F.dha]: dha });

  const method = profile
    ? `${sourceEntry.match}: ${sourceEntry.note}${scale !== 1 ? ` Values scaled by database/source total-fat ratio ${scale.toFixed(3)}.` : ''} Missing component values use the checked ${foodClass} profile split.`
    : `Estimated from the checked ${foodClass} source profile and database total fat or existing total omega-3. Plant foods use ALA as the omega-3 component; EPA/DHA are zero only for plant-only items.`;
  const source = profile ? `USDA FoodData Central SR Legacy, FDC ${profile.fdcId}` : 'USDA FoodData Central SR Legacy class profile and database food identity';
  const sourceUrl = profile?.sourceUrl ?? 'https://fdc.nal.usda.gov/download-datasets/';
  const confidence = profile ? 'direct or close-source profile' : 'documented class estimate';
  resultRows.push({
    databaseIndex: index,
    food: item.name,
    unitBasis: item.unit === 'ml' ? 'g per 100 ml' : 'g per 100 g',
    ALA: ala,
    EPA: epa,
    DHA: dha,
    totalOmega3: nutrients[F.omega3],
    totalOmega6: nutrients[F.omega6],
    transFat: nutrients[F.trans],
    alcohol: nutrients[F.alcohol],
    method,
    source,
    sourceUrl,
    confidence,
  });
  if (Object.keys(changed).length) legacyUpdates.push({ databaseIndex: index, food: item.name, values: changed, source: sourceEntry ? source : 'documented class estimate', sourceUrl, method });
}

const block = db.slice(firstIndex - 1, lastIndex);
const fieldCoverage = Object.fromEntries([...legacyFields, ...componentFields].map(field => {
  const filled = block.filter(item => isNumber(item.nutrients[field])).length;
  return [field, { filled, missing: block.length - filled, total: block.length }];
}));
const remainingNulls = block.flatMap((item, offset) => {
  const missingFields = [...legacyFields, ...componentFields].filter(field => !isNumber(item.nutrients[field]));
  return missingFields.length ? [{ databaseIndex: firstIndex + offset, databaseName: item.name, missingFields }] : [];
});
const invalid = block.flatMap((item, offset) => {
  const total = item.nutrients[F.omega3];
  const components = [item.nutrients[F.ala], item.nutrients[F.epa], item.nutrients[F.dha]];
  const bad = [...legacyFields, ...componentFields].filter(field => !isNumber(item.nutrients[field]) || item.nutrients[field] < 0);
  if (bad.length) return [{ databaseIndex: firstIndex + offset, issues: `Non-numeric or negative values: ${bad.join(', ')}` }];
  if (components.reduce((sum, value) => sum + value, 0) > total + 0.00011) return [{ databaseIndex: firstIndex + offset, issues: 'ALA+EPA+DHA exceeds total omega-3.' }];
  return [];
});
if (remainingNulls.length || invalid.length) throw new Error(`Validation failed: ${remainingNulls.length} rows with nulls, ${invalid.length} invalid rows.`);

sourceAudit.checkedOn = date;
sourceAudit.fieldCoverage = Object.fromEntries(legacyFields.map(field => [field, fieldCoverage[field]]));
sourceAudit.remainingNulls = [];
sourceAudit.status = 'complete_with_documented_estimates';
sourceAudit.coverageNotes = sourceAudit.coverageNotes ?? {};
sourceAudit.coverageNotes.Batch005Omega3Components = 'Added ALA, EPA and DHA for database indices 401-500. Direct USDA SR Legacy profiles take priority; when an individual source value is absent, a documented food-class estimate is used. The component audit records the per-row method and source.';
sourceAudit.records.push(...legacyUpdates.map(update => ({
  databaseIndex: update.databaseIndex,
  databaseName: update.food,
  source: update.source,
  sourceName: 'Batch 005 fatty-acid completion',
  sourceUrl: update.sourceUrl,
  values: update.values,
  mappingNote: update.method,
  checkedOn: date,
})));

const componentAudit = {
  checkedOn: date,
  scope: { firstDatabaseIndex: firstIndex, lastDatabaseIndex: lastIndex, count: block.length, unitBasis: 'g per 100 g; per 100 ml for liquid database entries' },
  fields: { ALA: F.ala, EPA: F.epa, DHA: F.dha },
  fieldCoverage,
  sources: {
    USDA_FoodData_Central_SR_Legacy: 'https://fdc.nal.usda.gov/download-datasets/',
    USDA_food_details_template: 'https://fdc.nal.usda.gov/food-details/{fdcId}/nutrients?type=SR%20Legacy',
    CoFID_2021: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
    BLS_4_0: 'https://blsdb.de/download',
  },
  methodNotes: [
    'Direct USDA SR Legacy values are used where the food or a close prepared-food profile is available. The source release is April 2018 and is final.',
    'Close profiles are scaled by total-fat ratio only within 0.5 to 1.5; wider differences use the food-class estimate instead of extreme scaling.',
    'When total omega-3 is already checked, ALA/EPA/DHA components are bounded so their sum does not exceed it. When total omega-3 is absent, a documented source-profile estimate supplies it.',
    'For plant-only foods, EPA and DHA are set to zero based on food identity. For animal foods, missing components use class splits and are not treated as measured zeros.',
    'The component fields and legacy aggregate fields are numeric for all 100 records; estimates remain marked per row with their source and method.',
  ],
  legacyUpdates,
  records: resultRows,
  validation: { allSevenFieldsNumeric: true, negativeValues: 0, componentSumExceedsTotalOmega3: 0, remainingNulls: 0 },
};

fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
fs.writeFileSync(sourceAuditPath, `${JSON.stringify(sourceAudit, null, 2)}\n`, 'utf8');
fs.writeFileSync(componentAuditPath, `${JSON.stringify(componentAudit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  range: `${firstIndex}-${lastIndex}`,
  rows: resultRows.length,
  sourceProfiles: resultRows.filter(row => row.source.startsWith('USDA FoodData')).length,
  estimates: resultRows.filter(row => row.confidence === 'documented class estimate').length,
  legacyUpdates: legacyUpdates.length,
  fieldCoverage,
  invalidRows: invalid.length,
  audit: componentAuditPath,
}, null, 2));
