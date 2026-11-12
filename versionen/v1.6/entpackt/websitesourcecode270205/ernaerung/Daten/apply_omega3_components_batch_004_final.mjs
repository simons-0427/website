import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const dbFile = path.join(root, 'database.json');
const oldAuditFile = path.join(dir, 'database_V2_fatty_acids_alcohol_batch_004_sources.json');
const newAuditFile = path.join(dir, 'database_V2_omega3_components_batch_004.json');
const date = '2026-09-24';
const F = {
  o3: 'Omega-3 Fatty Acids (g)', o6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)', alcohol: 'Alcohol (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)', epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const oldFields = [F.o3, F.o6, F.trans, F.alcohol];
const fill = {
  200: { [F.trans]: 0.02284 },
  209: { [F.trans]: 0 },
  213: { [F.o3]: 0.35, [F.o6]: 34.96, [F.trans]: 0.073243, [F.alcohol]: 0 },
  216: { [F.o3]: 5.459416, [F.o6]: 14.25, [F.trans]: 0 },
  219: { [F.trans]: 0.04425 },
  221: { [F.o3]: 0.003098, [F.o6]: 0.0209115, [F.trans]: 0.02213 },
  225: { [F.o3]: 0.0625, [F.o6]: 0.5 },
  227: { [F.o3]: 0.002586, [F.o6]: 0.015517, [F.trans]: 0 },
  228: { [F.o3]: 0.243, [F.o6]: 3.209, [F.trans]: 0.168, [F.alcohol]: 0 },
  229: { [F.trans]: 0.5625 },
  233: { [F.o3]: 0.936, [F.o6]: 0.176 },
  234: { [F.o3]: 0.171053, [F.o6]: 2.223684, [F.trans]: 0 },
  238: { [F.o3]: 0.2, [F.o6]: 0 },
  244: { [F.o3]: 0, [F.o6]: 0.1 },
  260: { [F.o3]: 0.323054, [F.o6]: 0.816446, [F.trans]: 0, [F.alcohol]: 0 },
  261: { [F.o3]: 0.057273, [F.o6]: 1.956818 },
  262: { [F.o3]: 0.001293, [F.o6]: 0.007758, [F.trans]: 0, [F.alcohol]: 0 },
  263: { [F.o3]: 0, [F.o6]: 0, [F.trans]: 0, [F.alcohol]: 0 },
  266: { [F.o3]: 0.0476, [F.o6]: 0.784 },
};
const special = {
  206: [[0.159, 0.898, 1.401], 'USDA FDC 175119, direct fatty-acid profile', 'https://whatyoueat.io/foods/175119-atlantic-mackerel'],
  213: [[0.35, 0, 0], 'Nearest local margarine, matched fat profile', 'local database record 1048'],
  214: [[0.2, 0, 0], 'Matvaretabellen mascarpone component profile', 'https://www.matvaretabellen.no/en/cheese-mascarpone/'],
  215: [[0.1875, 1.03125, 1.3125], 'Matvaretabellen cured herring, scaled by fat ratio', 'https://www.matvaretabellen.no/en/herring-cured-soaked-in-water/'],
  216: [[5.366883, 0, 0], 'Matvaretabellen full-fat mayonnaise, scaled by fat ratio', 'https://www.matvaretabellen.no/en/mayonnaise-full-fat-80-fat/'],
  227: [[0.002586, 0, 0], 'USDA FDC whey isolate, scaled by fat ratio', 'https://whatyoueat.io/foods/173177'],
  228: [[0.242615, 0, 0], 'USDA mortadella profile, scaled by fat ratio', 'https://whatyoueat.io/foods/174573'],
  229: [[0.1, 0, 0], 'Matvaretabellen imported mozzarella profile', 'https://www.matvaretabellen.no/en/cheese-mozzarella-in-brine-imported/'],
  232: [[0, 0.4, 0.2], 'Matvaretabellen drained mussels component profile', 'https://www.matvaretabellen.no/en/mussel-blue-in-brine-drained/'],
  233: [[0.04, 0.276, 0.506], 'USDA FDC 174217, direct fatty-acid profile', 'https://whatyoueat.io/foods/174217'],
  234: [[0.171053, 0, 0], 'Matvaretabellen muesli profile, scaled by fat ratio', 'https://www.matvaretabellen.no/en/muesli-with-fruit-nuts-sweetened/'],
  238: [[0, 0.2, 0], 'Matvaretabellen dried nori component profile', 'https://www.matvaretabellen.no/en/nori-seaweed-dried/'],
  244: [[0, 0, 0], 'Matvaretabellen raw pangasius reported components', 'https://www.matvaretabellen.no/en/pangasius-raw/'],
  249: [[0.2, 0, 0], 'Matvaretabellen ALA index, Parmesan value', 'https://www.matvaretabellen.no/en/c18-3n-3-alpha-linolenic-acid/'],
  260: [[0.323054, 0, 0], 'Nearest local raw pizza dough, scaled by fat ratio', 'local database record 1491'],
  261: [[0.057273, 0, 0], 'Nearest local plain popcorn maize, scaled by fat ratio', 'local database record 533'],
  262: [[0.001293, 0, 0], 'USDA FDC whey isolate, scaled to ready drink', 'https://whatyoueat.io/foods/173177'],
  272: [[0.263265, 0.117007, 0.17551], 'Matvaretabellen smoked salmon profile, scaled by fat ratio', 'https://www.matvaretabellen.no/en/salmon-smoked/'],
  280: [[0.039, 0.004, 0.001], 'USDA FDC 170851 ricotta components', 'https://whatyoueat.io/foods/170851-whole-milk-ricotta-cheese'],
  282: [[0.1, 0, 0], 'Matvaretabellen raw beef tenderloin component profile', 'https://www.matvaretabellen.no/en/beef-tenderloin-raw/'],
  283: [[0.051, 0, 0], 'USDA FDC 174036, 80/20 ground beef', 'https://whatyoueat.io/foods/174036-ground-beef-80-lean'],
  284: [[0.029, 0, 0], 'USDA FDC 171790, 95/5 ground beef', 'https://whatyoueat.io/foods/171790-ground-beef-95-lean'],
  286: [[0.007, 0, 0], 'USDA FDC 169451 raw beef liver, matching fat/protein', 'https://whatyoueat.io/foods/169451'],
  297: [[0.080595, 0, 0], 'Matvaretabellen whipping cream profile, scaled and bounded by total omega-3', 'https://www.matvaretabellen.no/en/cream-whipping-37-fat/'],
  298: [[0.293, 0, 0], 'USDA salami 18:3 profile, ALA estimated from existing total omega-3', 'https://whatyoueat.io/foods/174598'],
};
const dairy = new Set([200, 218, 219, 220, 221]);

const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const priorAudit = JSON.parse(fs.readFileSync(oldAuditFile, 'utf8'));
if (!Array.isArray(db) || db.length < 300) throw new Error('Unexpected database shape.');
for (let i = 200; i <= 299; i++) {
  const n = db[i]?.nutrients;
  if (!n) throw new Error(`Missing record nutrients at ${i}.`);
  if ([F.ala, F.epa, F.dha].some(key => Object.hasOwn(n, key))) throw new Error(`Component already exists at ${i}.`);
}

const appliedLegacy = [];
for (const [idx, values] of Object.entries(fill)) {
  const i = Number(idx);
  const changed = {};
  for (const [field, value] of Object.entries(values)) {
    if (db[i].nutrients[field] !== null) throw new Error(`Expected null at ${i}: ${field}`);
    db[i].nutrients[field] = value;
    changed[field] = value;
  }
  appliedLegacy.push({ databaseArrayIndex: i, food: db[i].name, values: changed });
}

const oldMackerel = [db[206].nutrients[F.o3], db[206].nutrients[F.o6]];
if (oldMackerel[0] !== 1.867 || oldMackerel[1] !== 0.339) throw new Error('Mackerel values changed; correction not applied.');
db[206].nutrients[F.o3] = 2.948;
db[206].nutrients[F.o6] = 0.402;

const rows = [];
for (let i = 200; i <= 299; i++) {
  const n = db[i].nutrients;
  const total = n[F.o3];
  let values = [total, 0, 0];
  let method = 'Plant/non-marine profile proxy: reported omega-3 assigned to ALA; EPA/DHA zero where no marine ingredient is present.';
  let source = 'Existing checked omega-3 value and food-class profile';
  let confidence = total === 0 ? 'reported zero' : 'estimate';
  if (dairy.has(i)) {
    values = [Number((total * 0.9).toFixed(6)), 0, 0];
    method = 'Plain dairy estimate: ALA set to 90% of reported omega-3; EPA/DHA zero at source precision.';
    source = 'USDA whole-milk profile: https://whatyoueat.io/foods/171265-whole-milk';
    confidence = 'estimate';
  }
  if (special[i]) {
    [values, method, source] = special[i];
    confidence = 'source value or close-match estimate';
  }
  const [ala, epa, dha] = values;
  if (values.some(x => !Number.isFinite(x) || x < 0)) throw new Error(`Invalid component at ${i}.`);
  if (ala + epa + dha > total + 0.00001) throw new Error(`ALA+EPA+DHA exceeds omega-3 at ${i}.`);
  Object.assign(n, { [F.ala]: ala, [F.epa]: epa, [F.dha]: dha });
  rows.push({ databaseArrayIndex: i, food: db[i].name, unitBasis: 'g per 100 g', ALA: ala, EPA: epa, DHA: dha, method, source, confidence });
}

for (const field of oldFields) {
  const filled = db.slice(200, 300).filter(r => typeof r.nutrients[field] === 'number').length;
  priorAudit.fieldCoverage[field] = { filled, missing: 100 - filled, total: 100 };
}
priorAudit.checkedOn = date;
priorAudit.remainingNulls = db.slice(200, 300).flatMap((r, offset) => {
  const missingFields = oldFields.filter(field => typeof r.nutrients[field] !== 'number');
  return missingFields.length ? [{ databaseArrayIndex: 200 + offset, databaseName: r.name, missingFields }] : [];
});
priorAudit.coverageNotes.Batch004_Omega3Components_2026_09_24 = 'ALA, EPA and DHA added for all 100 records. Methods and estimates are documented in database_V2_omega3_components_batch_004.json. Atlantic mackerel aggregate Omega-3/Omega-6 totals were corrected from the matching USDA component profile.';
priorAudit.internetResearchUpdates.push(
  { databaseIndex: 207, databaseArrayIndex: 206, databaseName: db[206].name, field: F.o3, previousValue: oldMackerel[0], value: 2.948, checkedOn: date, sourceFood: 'Atlantic mackerel raw, USDA SR Legacy FDC 175119', sourceUrl: special[206][2], sourceValueType: 'sum of reported components', note: '18:3 .159 + EPA .898 + DHA 1.401 + DPA .212 + 18:4 .278 = 2.948 g/100 g.' },
  { databaseIndex: 207, databaseArrayIndex: 206, databaseName: db[206].name, field: F.o6, previousValue: oldMackerel[1], value: 0.402, checkedOn: date, sourceFood: 'Atlantic mackerel raw, USDA SR Legacy FDC 175119', sourceUrl: special[206][2], sourceValueType: 'sum of reported components', note: 'Linoleic acid .219 + arachidonic acid .183 = .402 g/100 g.' },
);

const audit = {
  checkedOn: date,
  scope: { firstDatabaseArrayIndex: 200, lastDatabaseArrayIndex: 299, count: 100, unitBasis: 'grams per 100 grams edible food' },
  fields: { ALA: F.ala, EPA: F.epa, DHA: F.dha },
  fieldCoverage: Object.fromEntries([F.ala, F.epa, F.dha].map(field => [field, { filled: 100, missing: 0, total: 100 }])),
  sources: { Matvaretabellen: 'https://www.matvaretabellen.no/en/api/', USDA_FoodData_Central: 'https://fdc.nal.usda.gov/', USDA_food_profiles: 'https://whatyoueat.io/' },
  methodNotes: [
    'Direct component profiles were used where available. Closest-food values are scaled by fat ratio and identified in the row method.',
    'For plant foods lacking a direct component split, total omega-3 is used as an ALA proxy and EPA/DHA are zero when no marine ingredient exists. These rows are estimates, not direct assays.',
    'For plain dairy lacking a direct component split, ALA is estimated at 90% of total omega-3; EPA/DHA are zero at source precision.',
    'Reported source zeros are kept for plain supplements, water, starch powder and foods where the checked profile supports zero at table precision.',
  ],
  legacyFieldUpdates: appliedLegacy,
  legacyCorrections: [
    { databaseArrayIndex: 206, field: F.o3, previousValue: oldMackerel[0], newValue: 2.948, source: special[206][2] },
    { databaseArrayIndex: 206, field: F.o6, previousValue: oldMackerel[1], newValue: 0.402, source: special[206][2] },
  ],
  records: rows,
};

const stringify = value => `${JSON.stringify(value, null, 2)}\n`;
fs.writeFileSync(dbFile, stringify(db), 'utf8');
fs.writeFileSync(oldAuditFile, stringify(priorAudit), 'utf8');
fs.writeFileSync(newAuditFile, stringify(audit), 'utf8');
console.log(JSON.stringify({ records: db.length, batch: '200-299', allThreeFieldsComplete: true, remainingLegacyNulls: priorAudit.remainingNulls.length, legacyCellsFilled: appliedLegacy.reduce((n, row) => n + Object.keys(row.values).length, 0), mackerelTotalsCorrected: { from: oldMackerel, to: [2.948, 0.402] } }, null, 2));
