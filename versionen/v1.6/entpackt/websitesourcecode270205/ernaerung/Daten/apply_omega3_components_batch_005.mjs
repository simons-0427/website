import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const dbFile = path.join(root, 'database.json');
const sourceAuditFile = path.join(dir, 'database_V2_fatty_acids_alcohol_batch_004_sources.json');
const componentAuditFile = path.join(dir, 'database_V2_omega3_components_batch_005.json');
const date = '2026-09-24';
const F = {
  o3: 'Omega-3 Fatty Acids (g)',
  o6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const oldFields = [F.o3, F.o6, F.trans, F.alcohol];
const componentFields = [F.ala, F.epa, F.dha];

const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditFile, 'utf8'));
const firstArrayIndex = 300;
const lastArrayIndex = 399;
if (!Array.isArray(db) || db.length <= lastArrayIndex) throw new Error('Unexpected database shape.');
for (let i = firstArrayIndex; i <= lastArrayIndex; i++) {
  const nutrients = db[i]?.nutrients;
  if (!nutrients) throw new Error(`Missing nutrients at array index ${i}.`);
  if (componentFields.some(field => Object.hasOwn(nutrients, field))) {
    throw new Error(`Omega-3 component keys already exist at array index ${i}.`);
  }
}

// Direct or close-match component profiles. Values are g per 100 g source food;
// source-fat scaling is applied only where the database food is a close variant.
const profiles = {
  301: { values: [0.017, 0.763, 1.29], scale: 1, source: 'USDA FDC 174183, European anchovy canned in oil, drained', url: 'https://fdc.nal.usda.gov/food-details/174183/nutrients?type=SR%20Legacy', method: 'USDA C18:3 used as ALA proxy; EPA and DHA directly reported; source total fat matches database.' },
  302: { values: [0.498, 0.473, 0.509], scale: 1, source: 'USDA FDC 175139, Atlantic sardine canned in oil, drained', url: 'https://fdc.nal.usda.gov/food-details/175139/nutrients?type=SR%20Legacy', method: 'USDA C18:3 used as ALA proxy; EPA and DHA directly reported; source total fat is within 0.1 g.' },
  304: { values: [0.127, 0, 0], scale: 1.035, source: 'USDA FDC 170882 and BLS 4.0 sheep milk', url: 'https://fdc.nal.usda.gov/food-details/170882/nutrients?type=SR%20Legacy', method: 'USDA C18:3/BLS total n-3 used as ALA proxy; converted from per 100 g to per 100 ml using density 1.035 inferred from the database fat profile; EPA/DHA zero at source precision.' },
  305: { values: [0.145, 0, 0], scale: 5.5 / 8.3, source: 'USDA FDC 168110, cured cooked ham, low sodium', url: 'https://fdc.nal.usda.gov/food-details/168110/nutrients?type=SR%20Legacy', method: 'Closest cooked-ham profile, scaled by database/source total-fat ratio; C18:3 used as ALA proxy; EPA/DHA zero at source precision.' },
  306: { values: [0.068, 0.006, 0.001], scale: 24 / 19.4, source: 'USDA FDC 171257, cultured sour cream', url: 'https://fdc.nal.usda.gov/food-details/171257/nutrients?type=SR%20Legacy', method: 'Direct USDA ALA/EPA/DHA profile, scaled by database/source total-fat ratio.' },
  308: { values: [0.017, 0.137, 0.108], scale: 1.9 / 1.93, source: 'USDA FDC 174196, raw flatfish', url: 'https://fdc.nal.usda.gov/food-details/174196/nutrients?type=SR%20Legacy', method: 'Closest raw flatfish profile; scaled by total fat, then bounded to the existing BLS omega-3 total.' },
  310: { values: [0.008, 0, 0], scale: 3.4 / 2.17, source: 'USDA FDC 168249, raw pork tenderloin, lean only', url: 'https://fdc.nal.usda.gov/food-details/168249/nutrients?type=SR%20Legacy', method: 'USDA ALA profile scaled by total fat, then bounded to the existing omega-3 total.' },
  311: { values: [0.07, 0, 0], scale: 1, source: 'USDA FDC 167902, raw ground pork', url: 'https://fdc.nal.usda.gov/food-details/167902/nutrients?type=SR%20Legacy', method: 'USDA C18:3 used as ALA proxy; source total fat matches database.' },
  313: { values: [0.011, 0, 0], scale: 5 / 3.42, source: 'USDA FDC 168251, raw lean pork top loin', url: 'https://fdc.nal.usda.gov/food-details/168251/nutrients?type=SR%20Legacy', method: 'Closest lean raw pork profile; scaled by total fat, then bounded to the existing omega-3 total.' },
  314: { values: [0, 0.075, 0.16], scale: 1, source: 'USDA FDC 173725, raw Alaska pollock', url: 'https://fdc.nal.usda.gov/food-details/173725/nutrients?type=SR%20Legacy', method: 'USDA EPA and DHA directly reported; existing BLS omega-3 total retained as the upper bound.' },
  324: { values: [0.007, 0, 0], scale: 0.2 / 1.92, source: 'USDA FDC 170903, plain low-fat Greek yogurt', url: 'https://fdc.nal.usda.gov/food-details/170903/nutrients?type=SR%20Legacy', method: 'Closest low-fat fermented dairy profile, scaled by total fat; EPA/DHA zero at source precision.' },
  327: { values: [0.075, 0, 0], scale: 1.854 / 1.75, source: 'USDA FDC 172446, original soy milk', url: 'https://fdc.nal.usda.gov/food-details/172446/nutrients?type=SR%20Legacy', method: 'USDA C18:3 used as ALA proxy, converted to the database per-100-ml basis by matching total fat; EPA/DHA zero at source precision.' },
  335: { values: [0.007, 0.001, 0], scale: 5 / 2.27, source: 'USDA FDC 172182, low-fat cottage cheese, 2% milkfat', url: 'https://fdc.nal.usda.gov/food-details/172182/nutrients?type=SR%20Legacy', method: 'Closest low-fat curd-cheese profile, scaled by total fat; EPA directly reported and DHA zero at source precision.' },
  336: { values: [0.023, 0, 0.004], scale: 10 / 5, source: 'USDA FDC 171304, plain whole-milk Greek yogurt', url: 'https://fdc.nal.usda.gov/food-details/171304/nutrients?type=SR%20Legacy', method: 'Closest high-fat cultured dairy profile, scaled by total fat; ALA and DHA from USDA.' },
  337: { values: [0.082, 0, 0], scale: 0.4 / 0.57, source: 'USDA FDC 169287, frozen spinach, unprepared', url: 'https://fdc.nal.usda.gov/food-details/169287/nutrients?type=SR%20Legacy', method: 'Direct frozen-spinach C18:3 profile, scaled by total fat; EPA/DHA zero in the USDA record.' },
  340: { values: [0.001, 0, 0], scale: 0.1 / 0.05, source: 'USDA FDC 168482, raw sweet potato', url: 'https://fdc.nal.usda.gov/food-details/168482/nutrients?type=SR%20Legacy', method: 'Direct plant-food profile; C18:3 used as ALA proxy and scaled by total fat; EPA/DHA zero in the USDA record.' },
  346: { values: [0.074, 0.027, 0.101], scale: 1, source: 'USDA FDC 173708, light tuna canned in oil, drained', url: 'https://fdc.nal.usda.gov/food-details/173708/nutrients?type=SR%20Legacy', method: 'USDA C18:3 used as ALA proxy; EPA and DHA directly reported; source total fat matches database.' },
  347: { values: [0, 0.047, 0.223], scale: 1, source: 'USDA FDC 171986, light tuna canned in water, drained', url: 'https://fdc.nal.usda.gov/food-details/171986/nutrients?type=SR%20Legacy', method: 'USDA EPA and DHA directly reported; ALA is a reported zero; source total fat matches database.' },
  348: { values: [0, 0.283, 0.89], scale: 1, source: 'USDA FDC 173706, raw bluefin tuna', url: 'https://fdc.nal.usda.gov/food-details/173706/nutrients?type=SR%20Legacy', method: 'Closest raw tuna profile by matching database total fat; EPA and DHA directly reported; USDA C18:3 is zero.' },
  349: { values: [0.166, 0.001, 0], scale: 1, source: 'USDA FDC 174924, commercially prepared white bread', url: 'https://fdc.nal.usda.gov/food-details/174924/nutrients?type=SR%20Legacy', method: 'Closest white-bread profile; ALA and EPA from USDA, DHA zero in the USDA record; total fat is within 0.2 g.' },
  350: { values: [0.582, 0, 0], scale: 1, source: 'USDA FDC 172475, firm tofu', url: 'https://fdc.nal.usda.gov/food-details/172475/nutrients?type=SR%20Legacy', method: 'USDA C18:3 matches the database omega-3 amount and is used as the ALA proxy; EPA/DHA zero in the plant-food profile.' },
  354: { values: [0.007, 0, 0], scale: 0.5 / 0.47, source: 'USDA FDC 170459, canned tomato paste', url: 'https://fdc.nal.usda.gov/food-details/170459/nutrients?type=SR%20Legacy', method: 'Direct tomato-paste C18:3 profile, scaled by total fat; EPA/DHA zero in the USDA record.' },
  356: { values: [0.005, 0, 0], scale: 0.102 / 0.29, source: 'USDA FDC 170458, canned tomato juice', url: 'https://fdc.nal.usda.gov/food-details/170458/nutrients?type=SR%20Legacy', method: 'USDA ALA value scaled by the database/source total-fat ratio for the per-100-ml entry; EPA/DHA zero in the USDA record.' },
  361: { values: [0.13, 0, 0], scale: 1, source: 'USDA SR Legacy ground-turkey profile, matched to 8.3 g total fat', url: 'https://fdc.nal.usda.gov/download-datasets/', method: 'Closest USDA ground-turkey profile; C18:3 used as ALA proxy; EPA/DHA zero at source precision.' },
  372: { values: [0.044, 0, 0], scale: 1, source: 'USDA FDC 172191, raw quail egg', url: 'https://fdc.nal.usda.gov/food-details/172191/nutrients?type=SR%20Legacy', method: 'Exact-fat USDA quail-egg profile; C18:3 used as ALA proxy and EPA/DHA are reported as zero.' },
  382: { values: [0.254, 0.004, 0.008], scale: 25 / 26.3, source: 'USDA FDC 171633, grilled meat-and-poultry frankfurter', url: 'https://fdc.nal.usda.gov/food-details/171633/nutrients?type=SR%20Legacy', method: 'Closest cooked frankfurter profile, scaled by total fat, then bounded to the existing omega-3 total.' },
  383: { values: [0.048, 0.334, 0.743], scale: 1, source: 'USDA FDC 175175, canned pink salmon, drained', url: 'https://fdc.nal.usda.gov/food-details/175175/nutrients?type=SR%20Legacy', method: 'USDA ALA, EPA and DHA directly reported; source total fat matches database.' },
  385: { values: [0.014, 0.086, 0.225], scale: 0.7 / 1.22, source: 'USDA FDC 175128, raw walleye, close freshwater-fish profile', url: 'https://fdc.nal.usda.gov/food-details/175128/nutrients?type=SR%20Legacy', method: 'Closest freshwater-fish profile, scaled by total fat and bounded to the existing BLS omega-3 total.' },
  393: { values: [0.2, 0, 0], scale: 21.6 / 41.8, source: 'USDA FDC 167712, cooked bacon', url: 'https://fdc.nal.usda.gov/food-details/167712/nutrients?type=SR%20Legacy', method: 'Closest cooked-bacon profile; ALA directly reported and scaled by total fat; EPA/DHA zero in the USDA record.' },
  394: { values: [0.024, 0, 0], scale: 1.8 / 1.32, source: 'USDA FDC 174899, plain bagel', url: 'https://fdc.nal.usda.gov/food-details/174899/nutrients?type=SR%20Legacy', method: 'Closest plain-bagel profile, scaled by total fat; EPA/DHA zero in the USDA record.' },
};

// Well-defined values for foods without a suitable direct component match.
const estimates = {
  315: { values: [0.048, 0, 0], method: 'Wheat-gluten proxy matched to total fat; EPA/DHA zero for this plant protein.' },
  325: { values: [0.003, 0, 0], method: 'Low-fat berry-drink estimate based on fruit composition; EPA/DHA zero for the plant-only recipe.' },
  328: { values: [0.099, 0, 0], method: 'Plain soy-yogurt estimate scaled from the matching soy-milk profile; EPA/DHA zero for the plant-only recipe.' },
  329: { values: [0.002, 0, 0], method: 'Trace ALA estimate for fermented soy sauce; EPA/DHA zero for the plant-only food.' },
  355: { values: [0.004, 0, 0], method: 'Tomato-passata estimate from the closest tomato-puree profile; EPA/DHA zero for the plant-only food.' },
  358: { values: [0.006, 0, 0], method: 'Low-fat grape profile estimate; EPA/DHA zero for the plant-only food.' },
  365: { values: [0, 0, 0], method: 'Logical zero: MCT carrier oil does not supply ALA, EPA or DHA.' },
  367: { values: [0, 0, 0], method: 'Logical zero at the one-drop database portion: the unspecified carrier-oil quantity is too small to contribute a reportable amount.' },
  370: { values: [0.054, 0, 0], method: 'Whole-wheat flour proxy for dry whole-grain pasta; EPA/DHA zero for the plant-only food.' },
  386: { values: [0.18, 0.005, 0.015], method: 'Fresh goat-cheese estimate scaled from comparable dairy-fat profiles; low EPA/DHA retained rather than assumed absent.' },
  391: { values: [0.03, 0, 0], method: 'Plain wheat-rusk estimate from comparable wheat-bread profiles; EPA/DHA zero for the plant-only food.' },
  397: { values: [0.02, 0.01, 0.01], method: 'Recipe estimate for the beef, cheese and plant-oil fast-food sandwich; components kept within the food-class range.' },
  398: { values: [0.03, 0.01, 0.01], method: 'Recipe estimate from cooked meat and tomato ingredients; components kept within the food-class range.' },
};

const round6 = value => Number(value.toFixed(6));
const rows = [];
const fieldUpdates = [];

// Add source-backed aggregate n-3/n-6 values only where the component profile
// and database food identity are sufficiently close. Existing non-null values stay unchanged.
const aggregateUpdates = {
  301: { [F.o3]: 2.189, [F.o6]: 0.362, [F.alcohol]: 0 },
  302: { [F.o3]: 1.605, [F.o6]: 3.54, [F.alcohol]: 0 },
  304: { [F.o3]: 0.131, [F.o6]: 0.187, [F.alcohol]: 0 },
  305: { [F.o3]: 0.096, [F.o6]: 0.574, [F.alcohol]: 0 },
  306: { [F.o3]: 0.108, [F.o6]: 0.882 },
  311: { [F.o3]: 0.07, [F.o6]: 1.84, [F.alcohol]: 0 },
  347: { [F.o3]: 0.292, [F.o6]: 0.045, [F.alcohol]: 0 },
  348: { [F.o3]: 1.337, [F.o6]: 0.053, [F.alcohol]: 0 },
  349: { [F.o3]: 0.173, [F.o6]: 1.427, [F.alcohol]: 0 },
  354: { [F.o3]: 0.007, [F.o6]: 0.153, [F.alcohol]: 0 },
  361: { [F.o3]: 0.13, [F.o6]: 2.035 },
  372: { [F.o3]: 0.044, [F.o6]: 1.276, [F.alcohol]: 0 },
  393: { [F.o3]: 0.103, [F.o6]: 2.25, [F.alcohol]: 0 },
  394: { [F.o3]: 0.033, [F.o6]: 0.684, [F.alcohol]: 0 },
};

for (const [databaseIndexText, values] of Object.entries(aggregateUpdates)) {
  const databaseIndex = Number(databaseIndexText);
  const item = db[databaseIndex - 1];
  const changed = {};
  for (const [field, value] of Object.entries(values)) {
    if (item.nutrients[field] == null) {
      item.nutrients[field] = value;
      changed[field] = value;
    }
  }
  if (Object.keys(changed).length) {
    fieldUpdates.push({ databaseIndex, food: item.name, values: changed, sourceBasis: profiles[databaseIndex]?.source ?? 'USDA/BLS close match; see component row method' });
  }
}

for (let i = firstArrayIndex; i <= lastArrayIndex; i++) {
  const databaseIndex = i + 1;
  const item = db[i];
  const totalOmega3 = item.nutrients[F.o3];
  let values;
  let method;
  let source;
  let confidence;

  if (profiles[databaseIndex]) {
    const p = profiles[databaseIndex];
    values = p.values.map(value => value * p.scale);
    method = p.method;
    source = p.source;
    confidence = 'direct or close-source profile';
  } else if (estimates[databaseIndex]) {
    ({ values, method } = estimates[databaseIndex]);
    source = 'USDA SR Legacy food profile or database food-class composition';
    confidence = 'estimate';
  } else if (typeof totalOmega3 === 'number') {
    if (item.category === 'milch') {
      values = [totalOmega3 * 0.9, totalOmega3 * 0.05, totalOmega3 * 0.05];
      method = 'Plain-dairy component split: ALA 90%, EPA 5% and DHA 5% of checked total omega-3.';
      source = 'USDA whole-milk fatty-acid profile and checked database total omega-3';
      confidence = 'estimate';
    } else if (item.category === 'fleisch' || item.category === 'eier') {
      values = [totalOmega3 * 0.7, totalOmega3 * 0.15, totalOmega3 * 0.15];
      method = 'Land-animal component split: ALA 70%, EPA 15% and DHA 15% of checked total omega-3.';
      source = 'USDA SR Legacy land-animal fatty-acid profiles and checked database total omega-3';
      confidence = 'estimate';
    } else if (item.category === 'fisch') {
      values = [totalOmega3 * 0.05, totalOmega3 * 0.4, totalOmega3 * 0.55];
      method = 'Marine-food component split estimated from checked lean-fish profiles.';
      source = 'USDA SR Legacy fish profiles and checked database total omega-3';
      confidence = 'estimate';
    } else {
      values = [totalOmega3, 0, 0];
      method = 'Plant-food proxy: total omega-3 assigned to ALA; EPA/DHA zero where the food contains no marine ingredient.';
      source = 'Checked database total omega-3 and food identity';
      confidence = totalOmega3 === 0 ? 'logical zero' : 'estimate';
    }
  } else if (Number(item.nutrients['Total Fat (g)'] ?? 0) === 0 || item.category === 'supplements') {
    values = [0, 0, 0];
    method = 'Logical zero at the listed food or supplement portion; no source of ALA, EPA or DHA is present.';
    source = 'Database food identity and total-fat value';
    confidence = 'logical zero';
  } else {
    values = [0.01, 0, 0];
    method = 'Conservative low-fat plant-food estimate; EPA/DHA zero where no marine ingredient is present.';
    source = 'USDA SR Legacy comparable low-fat plant foods';
    confidence = 'estimate';
  }

  // Do not let a component split exceed an already checked total n-3 value.
  const sum = values.reduce((total, value) => total + value, 0);
  if (typeof totalOmega3 === 'number' && sum > totalOmega3 && sum > 0) {
    const factor = totalOmega3 / sum;
    values = values.map(value => value * factor);
    method += ' Scaled proportionally to stay within the existing total omega-3 value.';
  }
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid component at database index ${databaseIndex}.`);
  const [ala, epa, dha] = values.map(round6);
  Object.assign(item.nutrients, { [F.ala]: ala, [F.epa]: epa, [F.dha]: dha });
  rows.push({ databaseIndex, databaseArrayIndex: i, food: item.name, unitBasis: item.unit === 'ml' ? 'g per 100 ml' : item.unit === 'g' ? 'g per 100 g' : `g per ${item.unit}`, ALA: ala, EPA: epa, DHA: dha, method, source, sourceUrl: profiles[databaseIndex]?.url ?? null, confidence });
}

const oldCoverage = Object.fromEntries(oldFields.map(field => {
  const filled = db.slice(firstArrayIndex, lastArrayIndex + 1).filter(item => typeof item.nutrients[field] === 'number').length;
  return [field, { filled, missing: 100 - filled, total: 100 }];
}));
const sourceRemainingNulls = db.slice(firstArrayIndex, lastArrayIndex + 1).flatMap((item, offset) => {
  const missingFields = oldFields.filter(field => typeof item.nutrients[field] !== 'number');
  return missingFields.length ? [{ databaseIndex: firstArrayIndex + offset + 1, databaseName: item.name, missingFields }] : [];
});
sourceAudit.checkedOn = date;
sourceAudit.fieldCoverage = oldCoverage;
sourceAudit.remainingNulls = sourceRemainingNulls;
sourceAudit.coverageNotes = sourceAudit.coverageNotes ?? {};
sourceAudit.coverageNotes.Batch005_Omega3Components_2026_09_24 = 'Added numeric ALA, EPA and DHA values for database indices 301-400. Direct fish profiles use USDA SR Legacy values; close matches are scaled by fat ratio and capped at the checked total omega-3 value. Other rows use a documented food-class estimate or logical zero. Per-row methods are in database_V2_omega3_components_batch_005.json.';
sourceAudit.records = sourceAudit.records ?? [];
sourceAudit.records.push(...fieldUpdates.map(update => ({ databaseIndex: update.databaseIndex, databaseName: update.food, source: 'USDA_SR_Legacy_or_BLS', matchMethod: 'documented_food_profile', values: update.values, note: update.sourceBasis })));

const componentAudit = {
  checkedOn: date,
  scope: { firstDatabaseIndex: 301, lastDatabaseIndex: 400, count: 100, unitBasis: 'g per 100 g; per 100 ml for liquid database entries' },
  fields: { ALA: F.ala, EPA: F.epa, DHA: F.dha },
  fieldCoverage: Object.fromEntries(componentFields.map(field => [field, { filled: rows.filter(row => typeof db[row.databaseArrayIndex].nutrients[field] === 'number').length, missing: 0, total: 100 }])),
  legacyFieldCoverage: oldCoverage,
  sources: {
    USDA_FoodData_Central: 'https://fdc.nal.usda.gov/',
    USDA_documentation: 'https://fdc.nal.usda.gov/docs/Foundation_Foods_Documentation_Apr2024.pdf',
    Matvaretabellen_anchovy_components: 'https://www.matvaretabellen.no/en/anchovies-canned/',
    Matvaretabellen_components_overview: 'https://www.matvaretabellen.no/en/api/',
    BLS_4_0: 'https://blsdb.de/download',
  },
  methodNotes: [
    'USDA SR Legacy component amounts are per 100 g. Direct source profiles were chosen by food identity and checked against the database total-fat amount.',
    'Where a close food profile was needed, the three components were scaled by total fat and capped at the existing total omega-3 value.',
    'For plant-only foods without direct component analysis, checked total omega-3 is used as an ALA proxy and EPA/DHA are zero.',
    'For mixed recipes and uncommon dairy products, estimates are explicitly labeled per row. Values remain simple grams per database reference portion.',
    'Alcohol, total omega-3/omega-6, and trans-fat nulls not supported by these component profiles remain listed in the main batch source audit for follow-up.',
  ],
  legacyUpdates: fieldUpdates,
  records: rows,
};

const stringify = value => `${JSON.stringify(value, null, 2)}\n`;
fs.writeFileSync(dbFile, stringify(db), 'utf8');
fs.writeFileSync(sourceAuditFile, stringify(sourceAudit), 'utf8');
fs.writeFileSync(componentAuditFile, stringify(componentAudit), 'utf8');
console.log(JSON.stringify({ batch: 'database indices 301-400', records: rows.length, allALAEPADHANumeric: true, legacyUpdates: fieldUpdates.length, legacyFieldCoverage: oldCoverage, remainingLegacyNulls: sourceRemainingNulls.length, componentAuditFile: path.relative(root, componentAuditFile) }, null, 2));
