import fs from 'node:fs';

const databasePath = 'database.json';
const auditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_002_sources.json';
const fields = [
  'Omega-3 Fatty Acids (g)',
  'Omega-6 Fatty Acids (g)',
  'Trans Fat (g)',
  'Alcohol (g)',
];
const cupMl = 236.5882365;
const oilDensity = 218 / cupMl;
const changes = [
  {
    databaseIndex: 173,
    arrayIndex: 172,
    name: 'Kokosöl',
    value: 0.028 * oilDensity,
    source: 'USDA_SR28_2015',
    sourceCode: 'NDB 04047',
    sourceName: 'Oil, coconut',
    sourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg04.pdf',
    fdcId: 171412,
    calculation: '0.028 g/100 g × 218 g/236.5882365 ml × 100 ml = 0.025800 g/100 ml.',
    confidence: 'high; exact USDA oil record and matching household volume-to-mass measure',
    note: 'CoFID 2021 row 17-031 marks trans fat Tr. That marker is not numeric. USDA SR28 reports a quantitative 0.028 g/100 g value, which is applied here rather than treating the trace marker as zero.',
  },
  {
    databaseIndex: 190,
    arrayIndex: 189,
    name: 'Leinöl',
    value: 0.094 * oilDensity,
    source: 'USDA_FoodData_Central_SR_Legacy_2018',
    sourceCode: 'FDC 167702 / NDB 42231',
    sourceName: 'Oil, flaxseed, cold pressed',
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/167702/nutrients?type=SR%20Legacy',
    fdcId: 167702,
    calculation: '0.094 g/100 g × 218 g/236.5882365 ml × 100 ml = 0.086615 g/100 ml.',
    confidence: 'medium-high; exact flaxseed oil subtype, with USDA household cup measure for the same food',
    note: 'The USDA SR28 record NDB 42231 lists 218 g per cup for this cold-pressed flaxseed oil; the SR Legacy total trans value is per 100 g. The database reference unit is ml.',
  },
];

const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (!Array.isArray(database) || database.length < 200) throw new Error('Unexpected database structure.');
if (!Array.isArray(audit.records) || audit.batch !== 2) throw new Error('Unexpected batch audit structure.');

let applied = 0;
for (const change of changes) {
  const food = database[change.arrayIndex];
  if (!food || food.name !== change.name || food.unit !== 'ml') {
    throw new Error(`Database row mismatch at ${change.arrayIndex}: ${food?.name}`);
  }
  if (food.nutrients['Trans Fat (g)'] === null) {
    food.nutrients['Trans Fat (g)'] = Number(change.value.toFixed(6));
    applied += 1;
  } else if (food.nutrients['Trans Fat (g)'] !== Number(change.value.toFixed(6))) {
    throw new Error(`Refusing to overwrite existing trans-fat value for ${change.name}.`);
  }

  const existing = audit.records.find((record) =>
    record.databaseIndex === change.databaseIndex &&
    record.sourceCode === change.sourceCode &&
    record.values?.['Trans Fat (g)'] !== undefined);
  if (!existing) {
    const record = {
      databaseIndex: change.databaseIndex,
      databaseName: change.name,
      source: change.source,
      sourceCode: change.sourceCode,
      sourceName: change.sourceName,
      sourceUrl: change.sourceUrl,
      matchMethod: 'USDA total trans value converted from per 100 g to the database per 100 ml using a documented same-food cup weight',
      valueBasis: 'g per 100 ml database reference amount; USDA source value per 100 g edible portion',
      sourceValuesPer100g: { 'Trans Fat (g)': change.name === 'Kokosöl' ? 0.028 : 0.094 },
      density: {
        value: oilDensity,
        unit: 'g/ml',
        dataset: change.name === 'Kokosöl' ? 'USDA_FoodData_Central_SR_Legacy_2018' : 'USDA_SR28_2015',
        fdcId: change.fdcId,
        sourceName: change.sourceName,
        portion: '1 US cup',
        grams: 218,
        volumeMl: cupMl,
        sourceUrl: change.name === 'Kokosöl'
          ? 'https://fdc.nal.usda.gov/food-details/171412/nutrients?type=SR%20Legacy'
          : 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg04.pdf',
      },
      calculation: change.calculation,
      values: { 'Trans Fat (g)': Number(change.value.toFixed(6)) },
      confidence: change.confidence,
      note: change.note,
      checkedOn: '2026-09-24',
    };
    audit.records.push(record);
  }
}

audit.records.sort((a, b) => a.databaseIndex - b.databaseIndex);
audit.sources.USDA_SR28_CoconutOilTrans = {
  url: 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg04.pdf',
  citation: 'USDA National Nutrient Database for Standard Reference, Release 28, NDB 04047, Oil, coconut; total trans fatty acids 0.028 g/100 g.',
  valuesPer100g: { 'Trans Fat (g)': 0.028 },
  densityConversion: {
    sourceUrl: 'https://fdc.nal.usda.gov/food-details/171412/nutrients?type=SR%20Legacy',
    citation: 'USDA FoodData Central SR Legacy household measure for coconut oil: 218 g per 1 US cup.',
    densityGPerMl: oilDensity,
    calculation: '0.028 g/100 g × 218 g/236.5882365 ml × 100 ml = 0.025800 g/100 ml.',
  },
};
audit.sources.USDA_SRLegacy_FlaxseedOilTrans = {
  url: 'https://fdc.nal.usda.gov/food-details/167702/nutrients?type=SR%20Legacy',
  citation: 'USDA Agricultural Research Service, FoodData Central SR Legacy, FDC 167702, Oil, flaxseed, cold pressed; total trans fatty acids 0.094 g/100 g.',
  valuesPer100g: { 'Trans Fat (g)': 0.094 },
  densityConversion: {
    sourceUrl: 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg04.pdf',
    citation: 'USDA SR28 NDB 42231, Oil, flaxseed, cold pressed: 218 g per 1 US cup.',
    densityGPerMl: oilDensity,
    calculation: '0.094 g/100 g × 218 g/236.5882365 ml × 100 ml = 0.086615 g/100 ml.',
  },
};

audit.coverageNotes.USDA_OilTransfatConversions_2026_09_24 = 'Added quantitative USDA coconut-oil and cold-pressed flaxseed-oil total trans values, converted to the database ml basis with same-food USDA cup weights. CoFID trace markers are not treated as zero.';

for (const field of fields) {
  const filled = database.slice(100, 200).filter((food) => food.nutrients[field] !== null && food.nutrients[field] !== undefined).length;
  audit.fieldCoverage[field] = { filled, missing: 100 - filled, total: 100 };
}

const reasons = {
  106: 'No complete total-trans value was found; FRIDA reports a trans component for oat drink, not a verified total sum.',
  107: 'The Barista recipe and added fat blend are unspecified; generic oat-drink data do not support numeric Omega or total-trans estimates.',
  108: 'No complete total-trans value was found; a single trans component is not a verified total sum.',
  121: 'CoFID 2021 marks total trans as Tr and USDA SR28 has no quantitative total-trans mean; trace is not zero.',
  122: 'CoFID 2021 marks total trans as Tr and USDA SR28 has no quantitative total-trans mean; trace is not zero.',
  123: 'Available smoked-herring analogue records do not provide a quantitative total-trans value.',
  141: 'CoFID 2021 marks total trans as Tr and USDA SR28 has no quantitative total-trans mean; trace is not zero.',
  147: 'No sufficiently matched quantitative total-trans analysis was found for calf liver sausage.',
  151: 'CoFID source leaves total trans blank; no reliable numeric total-trans analysis for raw carp was found.',
  153: 'No directly matched quantitative total-trans analysis for instant mashed-potato powder was found.',
  155: 'CoFID 2021 marks total trans as N, meaning present without a reliable amount; USDA SR28 total-trans mean is blank.',
  169: 'CoFID reports Tr for rye crispbread while FRIDA reports 0.000 for a coarse rye analogue; source and product-form conflict, so no number is assigned.',
  183: 'CoFID reports Tr for raw farmed salmon while FRIDA reports 0.000 for raw aquaculture salmon; the source results conflict.',
  185: 'No sufficiently matched quantitative total-trans analysis was found for frozen salmon.',
  188: 'CoFID marks cod liver oil total trans as Tr and USDA SR28 total-trans mean is blank; trace is not zero.',
  189: 'CoFID 2021 marks total trans as Tr and USDA SR28 pork liverwurst total-trans mean is blank; trace is not zero.',
};
audit.uncoveredRecords = database.slice(100, 200).flatMap((food, offset) => {
  const databaseIndex = offset + 101;
  const missingFields = fields.filter((field) => food.nutrients[field] === null || food.nutrients[field] === undefined);
  if (!missingFields.length) return [];
  return [{
    databaseIndex,
    databaseName: food.name,
    missingFields,
    reason: reasons[databaseIndex] ?? 'No source provided a transferable numeric value for the missing field(s); blanks and trace markers remain null.',
  }];
});

if (applied) {
  audit.databaseApplication.appliedCount += applied;
  audit.databaseApplication.appliedByField['Trans Fat (g)'] += applied;
  audit.databaseApplication.appliedFrom += '; USDA SR28 coconut oil and USDA SR Legacy cold-pressed flaxseed oil trans-fat values converted to per 100 ml';
  for (const change of changes) {
    const value = Number(change.value.toFixed(6));
    if (!audit.databaseApplication.updates.some((entry) => entry.index === change.databaseIndex && entry.field === 'Trans Fat (g)')) {
      audit.databaseApplication.updates.push({
        index: change.databaseIndex,
        name: change.name,
        field: 'Trans Fat (g)',
        value,
        source: change.sourceCode,
      });
    }
  }
}

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  applied,
  values: changes.map(({ databaseIndex, name, value }) => ({ databaseIndex, name, value: Number(value.toFixed(6)) })),
  coverage: audit.fieldCoverage,
  remainingRows: audit.uncoveredRecords.length,
}, null, 2));
