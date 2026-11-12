import fs from 'node:fs';

const dbPath = 'database.json';
const auditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_004_sources.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const checkedOn = '2026-09-24';
const fields = {
  omega3: 'Omega-3 Fatty Acids (g)',
  omega6: 'Omega-6 Fatty Acids (g)',
  trans: 'Trans Fat (g)',
  alcohol: 'Alcohol (g)',
};

const entries = [
  {
    index: 215, name: 'Matjeshering',
    values: { [fields.omega3]: 3.375, [fields.omega6]: 0.375, [fields.trans]: 0, [fields.alcohol]: 0 },
    sourceFood: 'Herring, cured, soaked in water', sourceUrl: 'https://www.matvaretabellen.no/en/herring-cured-soaked-in-water/',
    sourceValues: { omega3: 3.6, omega6: 0.4, trans: 0, alcohol: 0 }, sourceMacros: { fat: 16, protein: 16.5, carbohydrate: 0 },
    targetMacros: { fat: 15, protein: 18, carbohydrate: 0 }, conversionFactor: 15 / 16,
    match: 'close_cured_herring_fat_scaled',
    note: 'Naeherer Matjes-Abgleich ueber gesalzenen, gewasserten Atlantikhering. Omegas proportional zum Fettverhaeltnis 15/16 skaliert; Protein weicht ab. Daher Schaetzung. Transfett und Alkohol stammen als Quellenwerte aus dem passenden Heringseintrag.',
  },
  {
    index: 225, name: 'Mischbrot (Roggen-Weizen)',
    values: { [fields.trans]: 0, [fields.alcohol]: 0 },
    sourceFood: 'Bread, wholemeal flour, wheat and rye, home-made', sourceUrl: 'https://www.matvaretabellen.no/en/trans-fatty-acids/',
    sourceValues: { trans: 0, alcohol: 0 }, sourceBasis: 'per 100 g; exact wheat-rye bread class listed with trans fat 0; alcohol treated as naturally absent in baked bread',
    match: 'same_wheat_rye_bread_trans_zero_alcohol_zero',
    note: 'Die offizielle Transfetttabelle weist Roggen-Weizenbrot mit 0 g aus. Das Ziel ist gebackenes Brot, nicht Teig; Ethanol ist im fertigen Brot fuer diesen Standard-Eintrag nicht enthalten.',
  },
  {
    index: 227, name: 'Molkeprotein, Isolat (Pulver)',
    values: { [fields.alcohol]: 0 }, sourceFood: 'Unflavoured dry whey protein isolate, logical exclusion', sourceUrl: null,
    sourceValues: { alcohol: 0 }, sourceBasis: 'dry powder per 100 g; no alcoholic beverage or solvent ingredient indicated',
    match: 'logical_exclusion_dry_isolate',
    note: 'Trockenes Molkenproteinisolat-Pulver ohne Hinweis auf alkoholische Zutaten. Ethanol ist fuer den reinen Pulver-Eintrag ausgeschlossen; 0 g.',
  },
  {
    index: 230, name: 'Multivitaminsaft',
    values: { [fields.omega3]: 0, [fields.omega6]: 0, [fields.trans]: 0, [fields.alcohol]: 0 },
    sourceFood: 'Juice, mixed fruits', sourceUrl: 'https://www.matvaretabellen.no/en/juice-mixed-fruits/',
    sourceValues: { omega3: 0, omega6: 0, trans: 0, alcohol: 0 }, sourceMacros: { fat: 0.1, protein: 0.2, carbohydrate: 10.3 },
    targetMacros: { fat: 0.105, protein: 0.315, carbohydrate: 12.08 },
    match: 'close_fruit_juice_zero_profile',
    note: 'Naeherer Fruchtsaft-Abgleich; Fett und Protein liegen sehr nahe, Kohlenhydrate etwas hoeher im Ziel. Die Quelle weist alle vier Werte als 0 g aus. Volumen- zu Gewichtsbasis ist bei Saft fuer diese Nullen unerheblich.',
  },
  {
    index: 234, name: 'Müsli, Basis (ohne Zucker)', values: { [fields.alcohol]: 0 },
    sourceFood: 'Plain dry cereal and grain muesli, logical exclusion', sourceUrl: null,
    sourceValues: { alcohol: 0 }, sourceBasis: 'per 100 g; dry non-alcoholic cereal food', match: 'logical_exclusion_dry_cereal',
    note: 'Trockenes, ungesuesstes Getreidemuesli ohne alkoholische Zutat; Ethanol ist fuer diesen Basiseintrag ausgeschlossen, daher 0 g.',
  },
  {
    index: 248, name: 'Paranüsse',
    values: { [fields.omega3]: 0.018, [fields.omega6]: 23.918 },
    sourceFood: 'Nuts, brazilnuts, dried, unblanched', sourceUrl: 'https://fdc.nal.usda.gov/food-details/170569/nutrients?type=SR%20Legacy',
    sourceValues: { omega3: 0.018, omega6: 23.918 }, sourceMacros: { fat: 67.1, protein: 14.3, carbohydrate: 11.7 },
    targetMacros: { fat: 67.1, protein: 14.3, carbohydrate: 11.7 },
    match: 'exact_food_exact_macro_match_usda',
    note: 'USDA SR Legacy passt exakt zu den Zielmakros. Die n-3/n-6-Summe wird aus ausgewiesenen spezifischen Komponenten gebildet. Die Summe weicht um 0.464 g von Gesamt-PUFA ab und Matvaretabellen rundet Omega-6 anders; dieser Quellenkonflikt ist dokumentiert. USDA-Wert wegen exaktem Makroprofil uebernommen.',
  },
  {
    index: 252, name: 'Pesto, grün (Glas)',
    values: { [fields.omega3]: 0.226006, [fields.omega6]: 20.263653, [fields.trans]: 0.07533, [fields.alcohol]: 0 },
    sourceFood: 'Pesto, green, industrially made', sourceUrl: 'https://www.matvaretabellen.no/en/pesto-green-industrially-made/',
    sourceValues: { omega3: 0.3, omega6: 26.9, trans: 0.1, alcohol: 0 }, sourceMacros: { fat: 53.1, protein: 4.9, carbohydrate: 4.5 },
    targetMacros: { fat: 40, protein: 5, carbohydrate: 6 }, conversionFactor: 40 / 53.1,
    match: 'same_industrial_green_pesto_fat_scaled',
    note: 'Gleiche Produktklasse; Protein fast identisch, Ziel-Fett niedriger. Omegas und Transfett proportional zum Fettverhaeltnis 40/53.1 skaliert. Werte sind Schaetzungen, kein exaktes Markenprofil. Alkohol aus dem passenden Pesto-Eintrag.',
  },
  {
    index: 261, name: 'Popcorn-Mais (trocken, ungesalzen)',
    values: { [fields.trans]: 0, [fields.alcohol]: 0 },
    sourceFood: 'Unseasoned dry maize kernels, logical exclusion', sourceUrl: null,
    sourceValues: { trans: 0, alcohol: 0 }, sourceBasis: 'per 100 g dry unprocessed kernels',
    match: 'logical_exclusion_plain_dry_maize',
    note: 'Trockene, ungesalzene und unverarbeitete Maiskoerner ohne Fettzutat oder Gaerung. Transfett und Ethanol sind fuer diesen Eintrag ausgeschlossen; beide 0 g.',
  },
  {
    index: 268, name: 'Quark, mager 0,2%',
    values: { [fields.omega3]: 0, [fields.omega6]: 0, [fields.trans]: 0, [fields.alcohol]: 0 },
    sourceFood: 'Quark, 1 % fat', sourceUrl: 'https://www.matvaretabellen.no/en/quark-1-fat/',
    sourceValues: { omega3: 0, omega6: 0, trans: 0, alcohol: 0 }, sourceMacros: { fat: 1, protein: 10, carbohydrate: 4.3 },
    targetMacros: { fat: 0.2, protein: 12, carbohydrate: 4 },
    match: 'same_low_fat_quark_reported_zeros',
    note: 'Gleiche Quark-Kategorie; Makros liegen nahe und der Ziel-Fettgehalt ist noch niedriger. Quelle fuehrt alle vier Werte mit 0 g, teils gerundet auf 0.1 g. Uebernommene Tabellenwerte koennen geringe Spuren unterhalb der Quellenrundung nicht ausschliessen.',
  },
  {
    index: 272, name: 'Räucherlachs',
    values: { [fields.omega3]: 0.702041, [fields.omega6]: 0.702041, [fields.trans]: 0, [fields.alcohol]: 0 },
    sourceFood: 'Salmon, smoked', sourceUrl: 'https://www.matvaretabellen.no/en/salmon-smoked/',
    sourceValues: { omega3: 2.4, omega6: 2.4, trans: 0, alcohol: 0 }, sourceMacros: { fat: 14.7, protein: 23.2, carbohydrate: 0 },
    targetMacros: { fat: 4.3, protein: 18.3, carbohydrate: 0 }, conversionFactor: 4.3 / 14.7,
    match: 'same_named_smoked_salmon_fat_scaled',
    note: 'Gleicher benannter Raeucherlachs-Eintrag, aber deutlich fettere Quelle. Omegas proportional zum Fettverhaeltnis 4.3/14.7 skaliert und daher nur Schaetzung. Transfett und Alkohol als stabile Nullwerte der passenden Quelle uebernommen.',
  },
  {
    index: 277, name: 'Reiswaffeln',
    values: { [fields.omega3]: 0, [fields.omega6]: 1.1, [fields.trans]: 0 },
    sourceFood: 'Rice cake, with salt', sourceUrl: 'https://www.matvaretabellen.no/en/rice-cake-with-salt/',
    sourceValues: { omega3: 0, omega6: 1.1, trans: 0 }, sourceMacros: { fat: 3, protein: 8, carbohydrate: 67.9 },
    targetMacros: { fat: 2.8, protein: 8, carbohydrate: 81.5 },
    match: 'same_rice_cake_close_macro_match',
    note: 'Gleiche Reiswaffel-Kategorie; Fett und Protein stimmen nahezu. Kohlenhydrate unterscheiden sich wegen Gesamt- versus verfuegbaren Kohlenhydraten. Die drei Zielwerte direkt uebernommen.',
  },
  {
    index: 280, name: 'Ricotta',
    values: { [fields.omega3]: 0.054, [fields.omega6]: 0.279 },
    sourceFood: 'Cheese, ricotta, whole milk', sourceUrl: 'https://fdc.nal.usda.gov/food-details/170851/nutrients?type=SR%20Legacy',
    sourceValues: { omega3: 0.054, omega6: 0.279 }, sourceMacros: { fat: 13, protein: 11.3, carbohydrate: 3 },
    targetMacros: { fat: 13, protein: 11.3, carbohydrate: 3 },
    match: 'exact_food_exact_macro_match_usda_components',
    note: 'USDA SR Legacy Komponentenprofil passt exakt zu den Zielmakros. n-3/n-6 aus den spezifisch ausgewiesenen USDA-Komponenten summiert. Der ausgewiesene Gesamt-PUFA-Rest wird keiner Omega-Gruppe zugeschlagen.',
  },
  {
    index: 281, name: 'Rinderbrust / Tafelspitz (roh)',
    values: { [fields.omega3]: 0, [fields.omega6]: 0.212766, [fields.trans]: 0.425532, [fields.alcohol]: 0 },
    sourceFood: 'Beef, meat, raw', sourceUrl: 'https://www.matvaretabellen.no/en/beef-meat-raw/',
    sourceValues: { omega3: 0, omega6: 0.1, trans: 0.2, alcohol: 0 }, sourceMacros: { fat: 4.7, protein: 22, carbohydrate: 0 },
    targetMacros: { fat: 10, protein: 21, carbohydrate: 0 }, conversionFactor: 10 / 4.7,
    match: 'generic_raw_beef_fat_scaled_estimate',
    note: 'Kein exakter Schnittprofil gefunden. Generisches rohes Rind liegt beim Protein nahe; Omega- und Transfett proportional zum Fettverhaeltnis 10/4.7 skaliert, daher Schaetzung mit groesserer Unsicherheit. Alkohol direkt aus dem Roh-Rind-Eintrag.',
  },
  {
    index: 282, name: 'Rinderfilet (roh)',
    values: { [fields.omega3]: 0.1, [fields.omega6]: 0.1, [fields.trans]: 0.2, [fields.alcohol]: 0 },
    sourceFood: 'Beef, tenderloin, raw', sourceUrl: 'https://www.matvaretabellen.no/en/beef-tenderloin-raw/',
    sourceValues: { omega3: 0.1, omega6: 0.1, trans: 0.2, alcohol: 0 }, sourceMacros: { fat: 5.2, protein: 21.8, carbohydrate: 0 },
    targetMacros: { fat: 5, protein: 22, carbohydrate: 0 },
    match: 'same_named_raw_beef_cut_close_macro_match',
    note: 'Gleicher roher Rinderfilet-Schnitt; Makros stimmen sehr nahe. Alle vier Zielwerte direkt aus dem Matvaretabellen-Eintrag uebernommen.',
  },
  {
    index: 285, name: 'Rinderhüftsteak (roh)',
    values: { [fields.omega3]: 0, [fields.omega6]: 0.178571, [fields.trans]: 0.178571, [fields.alcohol]: 0 },
    sourceFood: 'Beef, top sirloin butt, raw', sourceUrl: 'https://www.matvaretabellen.no/en/beef-top-sirloin-butt-raw/',
    sourceValues: { omega3: 0, omega6: 0.1, trans: 0.1, alcohol: 0 }, sourceMacros: { fat: 2.8, protein: 21.8, carbohydrate: 0 },
    targetMacros: { fat: 5, protein: 22, carbohydrate: 0 }, conversionFactor: 5 / 2.8,
    match: 'same_hip_cut_fat_scaled_estimate',
    note: 'Top-sirloin butt ist ein passender Hueft-/Sirloin-Schnitt; Protein stimmt nahe, Ziel-Fett ist hoeher. Omegas und Transfett proportional zum Fettverhaeltnis 5/2.8 skaliert und als Schaetzung markiert. Alkohol direkt aus der Quelle.',
  },
  {
    index: 287, name: 'Roggenbrot', values: { [fields.trans]: 0 },
    sourceFood: 'Bread, rye, coarse (50-75 %), industrially made', sourceUrl: 'https://www.matvaretabellen.no/en/trans-fatty-acids/',
    sourceValues: { trans: 0 }, sourceMacros: { fat: 2.9, protein: 7.5, carbohydrate: 46 },
    targetMacros: { fat: 3.3, protein: 8.5, carbohydrate: 48.3 },
    match: 'close_rye_bread_trans_zero',
    note: 'Nahe industrielle Roggenbrot-Kategorie mit vergleichbaren Makros; offizielle Transfetttabelle weist 0 g aus.',
  },
  {
    index: 294, name: 'Rote-Bete-Saft',
    values: { [fields.omega3]: 0, [fields.omega6]: 0, [fields.trans]: 0, [fields.alcohol]: 0 },
    sourceFood: 'Juice, with beetroot, carrot and ginger, from cafe/bakery', sourceUrl: 'https://www.matvaretabellen.no/en/juice-with-beetroot-carrot-and-ginger-from-cafe-bakery/',
    sourceValues: { omega3: 0, omega6: 0, trans: 0, alcohol: 0 }, sourceMacros: { fat: 0.1, protein: 0.4, carbohydrate: 9 },
    targetMacros: { fat: 0.1, protein: 1, carbohydrate: 7.5 },
    match: 'close_vegetable_juice_zero_profile',
    note: 'Naeherer Gemuesesaft-Abgleich mit gleichem Fett, niedrigerem Protein und hoeheren Kohlenhydraten. Quelle weist die vier Felder als 0 g aus; Saft-Volumenbasis aendert diese Nullwerte nicht.',
  },
];

const audit = {
  checkedOn,
  scope: 'database.json array indexes 200-299; only researched null cells are filled, existing values are never overwritten',
  sources: {
    Matvaretabellen_2026: { url: 'https://www.matvaretabellen.no/en/', checkedOn, note: 'Official Norwegian Food Composition Table; direct matches and explicitly marked nearest-food estimates.' },
    USDA_FoodData_Central_SR_Legacy: { url: 'https://fdc.nal.usda.gov/', checkedOn, note: 'SR Legacy fatty-acid components summed by omega family for Brazil nuts and ricotta.' },
  },
  estimatesAndLimitations: [
    'Values transferred from close food-class matches are estimates when target macros differ; proportional fat scaling is recorded per item.',
    'Source values rounded to 0.0 may hide very small traces; a reported zero is not claimed to prove chemical absence unless the note says logical exclusion.',
    'USDA Brazil-nut omega components do not reconcile fully to reported total PUFA and conflict with a rounded Matvaretabellen omega-6 value; the exact-macro USDA profile was selected and the conflict retained.',
  ],
  internetResearchUpdates: [],
  coverageNotes: {},
  fieldCoverage: {},
  remainingNulls: [],
};

const applied = [];
for (const entry of entries) {
  const item = db[entry.index];
  if (!item || item.name !== entry.name) throw new Error('Index/name mismatch at ' + entry.index + ': ' + (item?.name ?? 'missing'));
  item.nutrients ??= {};
  for (const [field, value] of Object.entries(entry.values)) {
    if (!Number.isFinite(value)) throw new Error('Invalid value for ' + entry.name + ' ' + field);
    const current = item.nutrients[field];
    if (current != null && current !== value) throw new Error('Refusing to overwrite ' + entry.name + ' ' + field + ': ' + current + ' != ' + value);
    if (current == null) {
      item.nutrients[field] = value;
      applied.push({ index: entry.index, name: entry.name, field, value });
    }
    const shortField = Object.entries(fields).find(([, full]) => full === field)?.[0];
    audit.internetResearchUpdates.push({
      databaseIndex: entry.index + 1,
      databaseArrayIndex: entry.index,
      databaseName: entry.name,
      field,
      value,
      checkedOn,
      sourceFood: entry.sourceFood,
      sourceUrl: entry.sourceUrl,
      sourceValue: entry.sourceValues[shortField] ?? value,
      sourceValueType: entry.match.startsWith('logical_exclusion') ? 'logical exclusion' : entry.conversionFactor ? 'fat-ratio estimate' : 'reported source value',
      sourceValueUnitBasis: entry.sourceBasis ?? 'per 100 g; source values shown per 100 g unless noted',
      match: entry.match,
      sourceMacros: entry.sourceMacros ?? null,
      targetMacros: entry.targetMacros ?? null,
      conversionFactor: entry.conversionFactor ?? null,
      note: entry.note,
    });
  }
}

audit.coverageNotes.Batch004_FasterResearch_2026_09_24 = 'Filled direct online matches and clearly labeled closest-profile estimates for herring, wheat-rye bread, fruit juice, Brazil nuts, green pesto, quark, smoked salmon, rice cakes, ricotta, raw beef cuts, rye bread and beetroot juice. Only null cells were changed. Scaled values are explicitly marked as estimates; source rounding and nutrient conflicts are noted.';
const first = 200, last = 300;
const batch = db.slice(first, last);
audit.fieldCoverage = Object.fromEntries(Object.values(fields).map(field => {
  const filled = batch.filter(item => item.nutrients?.[field] != null).length;
  return [field, { filled, missing: batch.length - filled, total: batch.length }];
}));
audit.remainingNulls = batch.flatMap((item, offset) => {
  const missingFields = Object.values(fields).filter(field => item.nutrients?.[field] == null);
  return missingFields.length ? [{ databaseArrayIndex: first + offset, databaseName: item.name, missingFields }] : [];
});
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
const global = Object.fromEntries(Object.values(fields).map(field => [field, {
  filled: db.filter(item => item.nutrients?.[field] != null).length,
  missing: db.filter(item => item.nutrients?.[field] == null).length,
}]));
console.log(JSON.stringify({ applied: applied.length, changedFoods: new Set(applied.map(x => x.index)).size, batchFieldCoverage: audit.fieldCoverage, batchFoodsWithRemainingNulls: new Set(audit.remainingNulls.map(x => x.databaseArrayIndex)).size, global }, null, 2));
