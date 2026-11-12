import fs from 'node:fs';

const databasePath = 'database.json';
const auditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json';
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const databaseIndex = 78;
const food = database[databaseIndex - 1];
if (!food || food.name !== 'Essig, Weißweinessig') {
  throw new Error(`Unexpected record at database index ${databaseIndex}`);
}

const alcoholValuePer100g = 0.103;
const densityGPerMl = 0.99;
const alcoholPer100ml = Number((alcoholValuePer100g * densityGPerMl).toFixed(3));
food.nutrients['Alcohol (g)'] = alcoholPer100ml;

audit.sources.BLS_4_0_WhiteWineVinegar = {
  url: 'https://blsdb.de/food?foodId=38764',
  citation: 'Max Rubner-Institut, Bundeslebensmittelschlüssel 4.0, Weinessig (R121000), alcohol 0.103 g/100 g, analytical value.',
  measuredValuePer100g: alcoholValuePer100g,
  densityConversion: {
    sourceUrl: 'https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=8301&mID=148',
    citation: 'Chang, Lee and Ou (2005), Investigation of the Physicochemical Properties of Concentrated Fruit Vinegar, Journal of Food and Drug Analysis 13(4), Table 6, white wine vinegar subgroup mean density 0.99 g/mL.',
    densityGPerMl,
    calculation: '0.103 g/100 g × 0.99 g/mL = 0.10197 g/100 mL, rounded to 0.102 g/100 mL.'
  }
};

const previous = audit.records.find(record => record.databaseIndex === databaseIndex);
const record = {
  databaseIndex,
  databaseName: food.name,
  source: 'BLS_4_0+WhiteWineVinegarDensity',
  sourceCode: 'R121000',
  sourceName: 'Weinessig; BLS ethanol measurement converted by white-wine-vinegar mean density',
  matchMethod: 'exact_food_class_with_volume_conversion',
  matchedDatabaseFields: ['name', 'name_en', 'unit'],
  values: {
    ...(previous?.values ?? {}),
    'Alcohol (g)': alcoholPer100ml
  },
  sourceValuesPer100g: {
    'Alcohol (g)': alcoholValuePer100g
  },
  conversion: {
    densityGPerMl,
    formula: `${alcoholValuePer100g} × ${densityGPerMl} = ${alcoholValuePer100g * densityGPerMl} g/100 ml`,
    roundedDatabaseValue: alcoholPer100ml
  },
  basis: 'g per 100 ml database reference portion',
  mappingNote: 'BLS Weinessig is the closest exact wine-vinegar class and reports ethanol as an analyzed 0.103 g/100 g. Converted to the database ml basis using the published mean density for the white-wine-vinegar subgroup (0.99 g/ml); rounded to 0.001 g.',
  checkedOn: '2026-09-24'
};
if (previous) audit.records[audit.records.indexOf(previous)] = record;
else audit.records.push(record);

const buttermilk = audit.records.find(item => item.databaseIndex === 39);
if (buttermilk) {
  buttermilk.sourceMarkers = {...(buttermilk.sourceMarkers ?? {}), 'Alcohol (g)': '<LOD'};
  buttermilk.alcoholAssessment = 'BLS reports alcohol below the limit of detection. This is not proof of absence, so database value remains null rather than being set to zero.';
}
const cranberries = audit.records.find(item => item.databaseIndex === 53);
if (cranberries) {
  cranberries.sourceMarkers = {...(cranberries.sourceMarkers ?? {}), 'Alcohol (g)': '<LOD'};
  cranberries.alcoholAssessment = 'BLS reports alcohol below the limit of detection. This is not proof of absence, so database value remains null rather than being set to zero.';
}

const fields = audit.fields;
const foods = database.slice(0, 100);
audit.fieldCoverage = Object.fromEntries(fields.map(field => {
  const filled = foods.filter(item => item.nutrients[field] !== null && item.nutrients[field] !== undefined).length;
  return [field, {filled, missing: foods.length - filled, total: foods.length}];
}));
audit.coverageNotes.WhiteWineVinegarAlcoholConversion = 'Weinessig alcohol filled from the BLS analyzed value and converted to the database ml basis using the published white-wine-vinegar subgroup mean density. Buttermilk and sweetened dried cranberries remain null for alcohol because BLS reports <LOD, not a confirmed zero.';

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({databaseIndex, name: food.name, alcoholPer100ml, fieldCoverage: audit.fieldCoverage}, null, 2));
