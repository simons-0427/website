import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(here, 'database_V2_fast_profile_completion_batch007_20260925.json');
const db = JSON.parse(await fs.readFile(dbPath, 'utf8'));
if (!Array.isArray(db) || db.length !== 1516) throw new Error(`Expected 1516 records, found ${db.length}`);
try { await fs.access(auditPath); throw new Error(`Audit already exists: ${auditPath}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const K = {
  fat: 'Total Fat (g)', omega3: 'Omega-3 Fatty Acids (g)', omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)', ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)', dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const records = [
  {
    index: 502, name: 'Tzatziki', fat: 5.5,
    values: { [K.omega3]: 0, [K.omega6]: 0.15 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '12-547', totalPufa_g: 0.15, url: 'https://www.nutridex.org.uk/foods/9b7abf5/tzatziki' },
      comparator: { dataset: 'Matvaretabellen', food: 'Tzatziki', url: 'https://matvaretabellen.mattilsynet.io/en/tzatziki/', ALA_g: 0, EPA_g: 0, DHA_g: 0 },
      method: 'Exact CoFID total PUFA is 0.15 g. The close tzatziki source reports ALA/EPA/DHA as zero, so the total is assigned to n-6.', confidence: 'medium-high',
    },
  },
  {
    index: 503, name: 'Vanilleeis (Milchspeiseeis)', fat: 8.2,
    values: { [K.omega3]: 0.08, [K.omega6]: 0.24, [K.trans]: 0.18, [K.ala]: 0.06 },
    replacements: { [K.ala]: 0.0292 },
    source: {
      dataset: 'CoFID 2021', code: '12-508', url: 'https://www.nutridex.org.uk/foods/81d4m9x/ice-cream-dairy-vanilla-soft-scoop',
      exactValues: { fat_g: 8.2, omega3_g: 0.08, omega6_g: 0.24, totalPufa_g: 0.32, trans_g: 0.18, ALA_g: 0.06, EPA_marker: 'Tr', DHA_marker: 'Tr' },
      method: 'Exact same-style CoFID entry with identical total fat. It replaces the lower-match BLS ALA value 0.0292 with the exact-profile ALA value 0.06; EPA/DHA trace markers remain stored as zero at database precision.', confidence: 'high',
    },
  },
  {
    index: 504, name: 'Veggie-Burger gegrillt (Handelsware)', fat: 7.2,
    values: { [K.omega3]: 0, [K.omega6]: 2.218, [K.trans]: 0.1 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '15-656', fat_g: 7.2, transMarker: 'N', url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid' },
      comparator: { dataset: 'USDA FoodData Central SR Legacy', fdcId: 174287, food: 'Veggie burgers or soyburgers, unprepared', fat_g: 6.3, LA_g: 1.94, arachidonic_g: 0.001, ALA_g: 0, EPA_g: 0, DHA_g: 0, url: 'https://fdc.nal.usda.gov/food-details/174287/nutrients?type=SR%20Legacy' },
      method: 'Scale the close USDA n-6 profile by target/source fat (7.2/6.3). CoFID reports trans marker N, meaning present but not reliably quantified; 0.10 g is a coarse estimate, not zero.', confidence: 'medium-low for omega-6; low for trans',
    },
  },
  {
    index: 505, name: 'Vollkornreis gekocht', fat: 0.9,
    values: { [K.omega3]: 0.010206, [K.omega6]: 0.329381, [K.trans]: 0 },
    source: { dataset: 'USDA FoodData Central SR Legacy', fdcId: 169704, food: 'Rice, brown, long-grain, cooked', sourceFat_g: 0.97, url: 'https://fdc.nal.usda.gov/food-details/169704/nutrients?type=SR%20Legacy', method: 'Close exact-grain and preparation match, scaled by total fat ratio 0.9/0.97. USDA directly reports trans fat as 0.', confidence: 'high' },
  },
  {
    index: 506, name: 'Vollmilchschokolade', fat: 31.1,
    values: { [K.trans]: 0.16 },
    source: { dataset: 'CoFID 2021', code: '17-648', url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid', trans_g: 0.16, method: 'Exact same-food and total-fat match. Existing BLS omega values are preserved; CoFID is used only to fill the missing trans-fat value.', confidence: 'high' },
  },
  {
    index: 507, name: 'Waffeln (Hausgemacht)', fat: 15.3,
    values: { [K.omega3]: 0.856149, [K.omega6]: 6.51166, [K.trans]: 0.47 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '11-1130', fat_g: 15.3, trans_g: 0.47, url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid' },
      comparator: { dataset: 'USDA FoodData Central SR Legacy', fdcId: 175039, food: 'Waffles, plain, prepared from recipe', fat_g: 14.1, LA_g: 5.98, arachidonic_g: 0.021, ALA_g: 0.782, EPA_g: 0.001, DHA_g: 0.006, url: 'https://fdc.nal.usda.gov/food-details/175039/nutrients?type=SR%20Legacy' },
      method: 'Use exact CoFID trans fat and scale the USDA omega profile by total-fat ratio 15.3/14.1. Omega-3 equals the sum of the already stored ALA, EPA and DHA values.', confidence: 'medium-high',
    },
  },
  {
    index: 508, name: 'Weizenkekse-Frühstückscereal (Weetabix-Typ fortifiziert)', fat: 1.9,
    values: { [K.omega3]: 0.07, [K.omega6]: 0.87, [K.trans]: 0, [K.ala]: 0.07 },
    replacements: { [K.ala]: 0.037867 },
    source: { dataset: 'CoFID 2021', code: '11-773', url: 'https://www.nutridex.org.uk/foods/3xwsvem/breakfast-cereal-wheat-biscuits-weetabix-type-fortified', exactValues: { fat_g: 1.9, omega3_g: 0.07, omega6_g: 0.87, ALA_g: 0.07, transMarker: 'Tr' }, method: 'Exact same cereal-type and fat profile; the CoFID trace trans marker is stored as zero at database precision. Exact CoFID ALA replaces the lower-match USDA comparator value.', confidence: 'high',
    },
  },
  {
    index: 511, name: 'Whopper (Takeaway)', fat: 12.1,
    values: { [K.omega3]: 0.275, [K.omega6]: 1.725, [K.trans]: 0.3 },
    source: {
      exact: { dataset: 'CoFID 2021', code: '19-514', fat_g: 12.1, totalPufa_g: 2.0, trans_g: 0.3, url: 'https://www.nutridex.org.uk/foods/7z1gwbh/burger-whopper-takeaway' },
      comparator: { dataset: 'USDA FoodData Central SR Legacy', fdcId: 170727, food: 'BURGER KING, WHOPPER, no cheese', ALA_g: 0.275, EPA_g: 0, DHA_g: 0, url: 'https://fdc.nal.usda.gov/food-details/170727/nutrients?type=SR%20Legacy' },
      method: 'Retain USDA ALA as n-3 and derive n-6 as the remaining CoFID total PUFA (2.0 - 0.275). EPA/DHA are zero in the close USDA profile. This resolves an internal mismatch in the USDA record between total PUFA and its listed individual fatty acids.', confidence: 'medium',
    },
  },
  {
    index: 512, name: 'Wurst im Blätterteig (Handelsware)', fat: 24.1,
    values: { [K.omega3]: 0.34, [K.omega6]: 2.73, [K.trans]: 0.03, [K.ala]: 0.30, [K.epa]: 0, [K.dha]: 0 },
    source: { dataset: 'CoFID 2021', code: '19-468', url: 'https://www.nutridex.org.uk/foods/51zj7ph/sausage-roll-flaky-pastry-ready-to-eat-retail', exactValues: { fat_g: 24.1, omega3_g: 0.34, omega6_g: 2.73, totalPufa_g: 3.07, trans_g: 0.03, ALA_g: 0.30, EPA_marker: 'Tr', DHA_marker: 'Tr' }, method: 'Exact matching retail sausage roll with identical total fat. Trace EPA/DHA markers are stored as zero at database precision.', confidence: 'high' },
  },
  {
    index: 517, name: 'Reis, Parboiled (poliert, roh)', fat: 1.03,
    values: { [K.omega6]: 0.305, [K.trans]: 0 },
    source: { dataset: 'USDA FoodData Central SR Legacy', fdcId: 169707, food: 'Rice, white, long-grain, parboiled, enriched, dry', fat_g: 1.03, LA_g: 0.305, transMarker: 'not reported; logical plant-grain zero', url: 'https://fdc.nal.usda.gov/food-details/169707/nutrients?type=SR%20Legacy', method: 'Exact parboiled-rice profile; add the measured linoleic acid as Omega-6. Trans fat is set to zero for the unprocessed grain.', confidence: 'high',
    },
  },
  {
    index: 543, name: 'Augenbohnen (trocken)', fat: 1.26,
    values: { [K.omega6]: 0.343, [K.trans]: 0 },
    source: { dataset: 'USDA FoodData Central SR Legacy', fdcId: 173758, food: 'Cowpeas, common (blackeyes), mature seeds, raw', fat_g: 1.26, LA_g: 0.343, trans_g: 0, url: 'https://fdc.nal.usda.gov/food-details/173758/nutrients?type=SR%20Legacy', method: 'Exact food and total-fat match; directly reported linoleic acid and trans-fat zero.', confidence: 'high',
    },
  },
  {
    index: 545, name: 'Gartenbohnen (trocken)', fat: 1.6,
    values: { [K.omega3]: 0.048, [K.omega6]: 0.607, [K.trans]: 0, [K.ala]: 0.048 },
    replacements: { [K.omega3]: 0 },
    source: { dataset: 'USDA FoodData Central SR Legacy', fdcId: 175205, food: 'Broadbeans (fava beans), mature seeds, raw', fat_g: 1.53, ALA_g: 0.046, LA_g: 0.581, trans_g: 0, url: 'https://fdc.nal.usda.gov/food-details/175205/nutrients?type=SR%20Legacy', method: 'Close dry mature-bean profile with 4.6% total-fat difference. Replaces the prior BLS formula-zero with the USDA profile; scale ALA and LA by 1.6/1.53.', confidence: 'medium',
    },
  },
];

const plantZeroTrans = [
  513, 514, 515, 516, 519, 520, 521, 524, 525, 526, 527, 528, 529, 530,
  532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 546, 548, 549,
  550, 552, 553, 554, 556, 557, 558, 559, 560, 561, 566, 567, 568, 569,
  570, 571, 572, 573, 588, 589, 590,
];

const replacementsApplied = [];
const changed = [];
for (const record of records) {
  const item = db[record.index - 1];
  if (item?.name !== record.name) throw new Error(`Food identity mismatch at ${record.index}: ${item?.name}`);
  if (item.nutrients[K.fat] !== record.fat) throw new Error(`Total-fat mismatch at ${record.index}`);
  const priorValues = {};
  for (const [key, value] of Object.entries(record.values)) {
    const current = item.nutrients[key] ?? null;
    if (record.replacements && Object.hasOwn(record.replacements, key)) {
      const expected = record.replacements[key];
      if (current !== expected) throw new Error(`Unexpected replacement value at ${record.index} ${key}: ${current}, expected ${expected}`);
      priorValues[key] = current;
      replacementsApplied.push({ index: record.index, key, prior: current, replacement: value });
    } else if (current !== null) {
      throw new Error(`Refusing to overwrite ${record.index} ${key}: ${current}`);
    }
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid value at ${record.index} ${key}`);
  }
  Object.assign(item.nutrients, record.values);
  changed.push({ ...record, priorValues });
}

const zeroRecords = [];
for (const index of plantZeroTrans) {
  const item = db[index - 1];
  if (!item || item.nutrients[K.trans] != null) throw new Error(`Unexpected existing trans value at ${index}: ${item?.nutrients?.[K.trans]}`);
  item.nutrients[K.trans] = 0;
  zeroRecords.push({
    databaseIndex: index,
    food: item.name,
    value: 0,
    source: 'Composition-based exclusion at reporting precision',
    method: 'Plant-only grain, legume, soy, nut, or raw-fruit identity with no animal fat or partially hydrogenated fat named. Logical zero; not a laboratory measurement.',
    confidence: 'medium for raw foods and grains; medium-low for processed foods',
  });
}

const issues = [];
for (const record of changed) {
  const n = db[record.index - 1].nutrients;
  if (n[K.omega3] != null && n[K.ala] != null && n[K.epa] != null && n[K.dha] != null
      && n[K.ala] + n[K.epa] + n[K.dha] > n[K.omega3] + 0.02) issues.push(record.index);
  if (n[K.omega3] != null && n[K.omega6] != null && n[K.omega3] + n[K.omega6] > record.fat + 0.02) issues.push(record.index);
}
if (issues.length) throw new Error(`Consistency check failed at ${[...new Set(issues)].join(', ')}`);

await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
const audit = {
  checkedOn: '2026-09-25',
  scope: { batch: '007', firstDatabaseIndex: 501, lastDatabaseIndex: 600, unit: 'g per 100 g food' },
  method: 'Exact same-food CoFID/BLS/USDA values are preferred. Close profiles are scaled only when total-fat difference is small. Remaining plant-only foods receive a documented composition-based trans-fat zero only when no animal fat or partially hydrogenated fat is named. Estimates and replacements are explicit below.',
  changedRecords: changed.map(record => ({ databaseIndex: record.index, food: record.name, targetFat_g: record.fat, valuesPer100g: record.values, priorValues: record.priorValues, source: record.source })),
  compositionallyExcludedTransZeros: zeroRecords,
  replacementsApplied,
  validation: {
    rowCountUnchanged: db.length === 1516,
    changedValuesNonnegative: changed.every(record => Object.values(record.values).every(value => value >= 0)),
    plantZeroRowsVerifiedNullBeforeWrite: true,
    replacementsVerifiedBeforeWrite: true,
    omega3ComponentsWithinTotal: issues.length === 0,
  },
};
await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ foodsUpdated: changed.length, dataFieldsUpdated: changed.reduce((sum, record) => sum + Object.keys(record.values).length, 0), transZerosAdded: zeroRecords.length, replacements: replacementsApplied, auditPath }, null, 2));
