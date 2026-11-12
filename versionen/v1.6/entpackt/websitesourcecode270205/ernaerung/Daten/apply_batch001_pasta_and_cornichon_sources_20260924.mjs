import fs from 'node:fs';

const databasePath = 'database.json';
const auditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json';
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const nutrientFields = {
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)'
};

function requireFood(databaseIndex, expectedName) {
  const food = database[databaseIndex - 1];
  if (!food || food.name !== expectedName) {
    throw new Error(`Unexpected record at database index ${databaseIndex}`);
  }
  return food;
}

function upsertRecord(databaseIndex, record) {
  const existingIndex = audit.records.findIndex(item => item.databaseIndex === databaseIndex);
  if (existingIndex >= 0) audit.records[existingIndex] = record;
  else audit.records.push(record);
}

const pastaIndex = 59;
const pasta = requireFood(pastaIndex, 'Dinkelvollkornnudeln (trocken)');
const pastaValues = {
  [nutrientFields.omega3]: 0.07,
  [nutrientFields.omega6]: 1.06
};
Object.assign(pasta.nutrients, pastaValues);
const previousPasta = audit.records.find(item => item.databaseIndex === pastaIndex);
upsertRecord(pastaIndex, {
  ...(previousPasta ?? {}),
  databaseIndex: pastaIndex,
  databaseName: pasta.name,
  source: 'BLS_4_0_nearest_wholegrain_pasta+LogicalFoodComposition',
  sourceCode: 'E510000',
  sourceName: 'Vollkornteigwaren eifrei, roh (generic wholegrain pasta comparator)',
  sourceUrl: 'https://blsdb.de/food?foodId=37922',
  matchMethod: 'nearest_generic_wholegrain_pasta_profile',
  values: {...(previousPasta?.values ?? {}), ...pastaValues},
  sourceValuesPer100g: pastaValues,
  sourceComparison: {
    databaseTotalFatGPer100g: pasta.nutrients['Total Fat (g)'],
    blsTotalFatGPer100g: 2.93,
    databaseProteinGPer100g: pasta.nutrients['Protein (g)'],
    blsProteinGPer100g: 14.3,
    confidence: 'medium-low',
    limitation: 'BLS comparator is generic egg-free wholegrain pasta based on wheat, not spelt-specific; macros are close, fatty-acid profile is a documented proxy.'
  },
  valueBasis: 'g per 100 g database reference portion',
  mappingNote: 'Applied the BLS profile for uncooked egg-free wholegrain pasta as the closest available profile for dry wholegrain spelt pasta. BLS reports 0.07 g Omega-3 and 1.06 g Omega-6; database fat/protein are 2.5/14 g versus BLS 2.93/14.3 g. Proxy is marked medium-low confidence because wheat and spelt are not identical.',
  checkedOn: '2026-09-24'
});

const pickleIndex = 79;
const pickle = requireFood(pickleIndex, 'Essiggurken / Cornichons (abgetropft)');
const pickleValues = {
  [nutrientFields.omega3]: 0.036,
  [nutrientFields.omega6]: 0.039,
  [nutrientFields.trans]: 0,
  [nutrientFields.alcohol]: 0.018
};
Object.assign(pickle.nutrients, pickleValues);
const previousPickle = audit.records.find(item => item.databaseIndex === pickleIndex);
upsertRecord(pickleIndex, {
  databaseIndex: pickleIndex,
  databaseName: pickle.name,
  source: 'BLS_4_0_with_CoFID_crosscheck',
  sourceCode: 'G890902',
  sourceName: 'Cornichons gesäuert, abgetropft',
  sourceUrl: 'https://blsdb.de/food?foodId=46115',
  matchMethod: 'exact_pickled_cornichon_drained_class',
  values: pickleValues,
  sourceValuesPer100g: {
    [nutrientFields.omega3]: 0.036,
    [nutrientFields.omega6]: 0.039,
    [nutrientFields.alcohol]: 0.018
  },
  sourceDetails: {
    FAPUN3: {valuePer100g: 0.036, origin: 'Formelberechnung'},
    FAPUN6: {valuePer100g: 0.039, origin: 'Formelberechnung'},
    ALC: {valuePer100g: 0.018, origin: 'Analyse'}
  },
  conflicts: {
    [nutrientFields.alcohol]: {
      previousSource: previousPickle?.source ?? 'CoFID_2021',
      previousValue: previousPickle?.values?.[nutrientFields.alcohol] ?? 0,
      selectedSource: 'BLS_4_0',
      selectedValue: 0.018,
      reason: 'The drained BLS cornichon class is a closer product-state match and reports an analyzed positive ethanol value; retained rather than overriding with a generic tabular zero.'
    }
  },
  totalFatComparison: {
    databaseGPer100g: pickle.nutrients['Total Fat (g)'],
    blsGPer100g: 0.175,
    differenceGPer100g: Number((pickle.nutrients['Total Fat (g)'] - 0.175).toFixed(3))
  },
  basis: 'g per 100 g database reference portion',
  mappingNote: 'BLS directly matches drained, acidified cornichons. Omega totals equal its reported total PUFA (0.075 g); alcohol is an analyzed 0.018 g/100 g. This is closer than the previous generic CoFID pickle match; the previous CoFID alcohol zero is recorded as a conflict.',
  checkedOn: '2026-09-24'
});

audit.sources.BLS_4_0_WholegrainPastaProxy = {
  url: 'https://blsdb.de/food?foodId=37922',
  citation: 'Max Rubner-Institut, Bundeslebensmittelschlüssel 4.0, Vollkornteigwaren eifrei, roh (E510000), per 100 g edible portion.',
  valuesPer100g: {omega3: 0.07, omega6: 1.06, totalFat: 2.93, protein: 14.3},
  limitation: 'Generic wheat wholegrain pasta comparator for spelt pasta; do not treat as an exact spelt analysis.'
};
audit.sources.BLS_4_0_DrainedCornichons = {
  url: 'https://blsdb.de/food?foodId=46115',
  citation: 'Max Rubner-Institut, Bundeslebensmittelschlüssel 4.0, Cornichons gesäuert, abgetropft (G890902), per 100 g edible portion.',
  valuesPer100g: {omega3: 0.036, omega6: 0.039, ethanol: 0.018, totalFat: 0.175},
  ethanolOrigin: 'Analyse'
};

audit.uncoveredRecords = audit.uncoveredRecords.filter(item => item.databaseIndex !== pickleIndex);
audit.coverageNotes.Batch001_PastaAndCornichon = 'Added a medium-low-confidence generic wholegrain-pasta fatty-acid proxy for dry spelt pasta and exact drained-cornichon BLS values. The BLS cornichon ethanol analysis (0.018 g/100 g) takes precedence over a prior generic CoFID zero; this source conflict is explicitly retained in the audit.';

const foods = database.slice(0, 100);
audit.fieldCoverage = Object.fromEntries(audit.fields.map(field => {
  const filled = foods.filter(item => item.nutrients[field] !== null && item.nutrients[field] !== undefined).length;
  return [field, {filled, missing: foods.length - filled, total: foods.length}];
}));

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  pasta: {databaseIndex: pastaIndex, name: pasta.name, values: pastaValues},
  cornichons: {databaseIndex: pickleIndex, name: pickle.name, values: pickleValues},
  fieldCoverage: audit.fieldCoverage,
  unresolvedRecords: audit.uncoveredRecords.length
}, null, 2));
