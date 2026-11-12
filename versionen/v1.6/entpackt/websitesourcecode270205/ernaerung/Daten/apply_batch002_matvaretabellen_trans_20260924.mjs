import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const databasePath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_002_sources.json');
const rows = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const checkedOn = '2026-09-24';
const field = 'Trans Fat (g)';

const updates = [
  {
    index: 105, name: 'Haferdrink / Hafermilch', value: 0,
    sourceFood: 'Oat based beverage', sourceUrl: 'https://www.matvaretabellen.no/en/oat-based-beverage/',
    sourceValue: 0, sourceValueType: 'Logical zero', match: 'generic_oat_drink',
    sourceMacros: { fat: 1, protein: 1.1, carbohydrate: 10.5 },
    note: 'Matvaretabellen weist Transfettsäuren als logische Null aus. Nur der Transfettwert wurde übernommen. Der generische Referenzeintrag weicht bei den Makros teilweise ab.'
  },
  {
    index: 107, name: 'Haferdrink, ungesüßt (Discounter)', value: 0,
    sourceFood: 'Oat based beverage', sourceUrl: 'https://www.matvaretabellen.no/en/oat-based-beverage/',
    sourceValue: 0, sourceValueType: 'Logical zero', match: 'generic_unsweetened_oat_drink',
    sourceMacros: { fat: 1, protein: 1.1, carbohydrate: 10.5 },
    note: 'Matvaretabellen weist Transfettsäuren für den unaromatisierten Haferdrink als logische Null aus. Nur der Transfettwert wurde übernommen; die generische Produktreferenz ist kein exakter Markenabgleich.'
  },
  {
    index: 120, name: 'Heilbutt (roh)', value: 0,
    sourceFood: 'Halibut, Atlantic, raw', sourceUrl: 'https://www.matvaretabellen.no/en/halibut-atlantic-raw/',
    sourceValue: 0, sourceValueType: 'Logical zero', match: 'same_food_raw_halibut',
    note: 'Der Eintrag für rohen Atlantischen Heilbutt führt Transfettsäuren als logische Null. Es wurden keine Omega-Werte verändert.'
  },
  {
    index: 121, name: 'Hering, frisch (roh)', value: 0,
    sourceFood: 'Herring, raw', sourceUrl: 'https://www.matvaretabellen.no/en/herring-raw/',
    sourceValue: 0, sourceValueType: 'Logical zero', match: 'same_food_raw_herring',
    sourceMacros: { fat: 12.1, protein: 17.4, carbohydrate: 0 },
    note: 'Matvaretabellen weist für rohen Hering Transfettsäuren als logische Null aus. Makrovergleich: Datenbank 9 g Fett und 18 g Protein gegenüber Quelle 12,1 g Fett und 17,4 g Protein. Nur der Transfettwert wurde übernommen.'
  },
  {
    index: 122, name: 'Hering, geräuchert', value: 0,
    sourceFood: 'Herring, smoked, Bøkling', sourceUrl: 'https://www.matvaretabellen.no/en/herring-smoked-bokling/',
    sourceValue: 0, sourceValueType: 'Logical zero', match: 'smoked_herring_close_match',
    sourceMacros: { fat: 12.8, protein: 21.2, carbohydrate: 0 },
    note: 'Matvaretabellen weist beim geräucherten Bøkling Transfettsäuren als logische Null aus. Makrovergleich: Datenbank 12,4 g Fett und 24,6 g Protein gegenüber Quelle 12,8 g Fett und 21,2 g Protein. Nur der Transfettwert wurde übernommen.'
  },
  {
    index: 152, name: 'Kartoffelpüree, Instant (Pulver)', value: 0,
    sourceFood: 'Potatoes, instant, mashed, powder with milk', sourceUrl: 'https://www.matvaretabellen.no/en/potatoes-instant-mashed-powder-with-milk/',
    sourceValue: 0, sourceValueType: 'Logical zero', match: 'instant_mashed_potato_powder_close_match',
    sourceMacros: { fat: 1.5, protein: 8.5, carbohydrate: 70.7 },
    note: 'Der Matvaretabellen-Eintrag für Instant-Kartoffelpüreepulver weist Transfettsäuren als logische Null aus. Die Quelle enthält Milch und ist daher ein Produktvergleich, keine vollständige Makroübernahme.'
  },
  {
    index: 154, name: 'Käse, Camembert 45%', value: 0.8,
    sourceFood: 'Cheese, ripened, Camembert', sourceUrl: 'https://www.matvaretabellen.no/en/cheese-ripened-camembert/',
    sourceValue: 0.8, sourceValueType: 'Best estimate', match: 'same_food_camembert',
    sourceMacros: { fat: 25, protein: 19.3, carbohydrate: 0.1 },
    note: 'Direkter Camembertvergleich. Makros liegen nahe am Datenbankeintrag: Quelle 25 g Fett und 19,3 g Protein, Datenbank 24,3 g Fett und 19,8 g Protein.'
  },
  {
    index: 168, name: 'Knäckebrot, Vollkorn', value: 0,
    sourceFood: 'Crisp bread, wholemeal flour, rye', sourceUrl: 'https://www.matvaretabellen.no/en/crisp-bread-wholemeal-flour-rye/',
    sourceValue: 0, sourceValueType: 'Official food-table value, recipe calculation', match: 'wholemeal_rye_crispbread',
    sourceMacros: { fat: 1.5, protein: 9, carbohydrate: 55.4 },
    note: 'Der offizielle Eintrag für Vollkorn-Roggenknäckebrot führt 0 g Transfett. Makrovergleich: Quelle 1,5 g Fett, 9 g Protein und 55,4 g Kohlenhydrate; Datenbank 2,6 g, 11 g und 68 g. Nur der Transfettwert wurde übernommen.'
  },
  {
    index: 182, name: 'Lachs, Atlantik (roh)', value: 0,
    sourceFood: 'Salmon, farmed, raw', sourceUrl: 'https://www.matvaretabellen.no/en/salmon-farmed-raw/',
    sourceValue: 0, sourceValueType: 'Best estimate, analytical source', match: 'raw_atlantic_salmon',
    sourceMacros: { fat: 15.9, protein: 19.9, carbohydrate: 0 },
    note: 'Matvaretabellen führt 0 g Transfett für rohen Zuchtlachs. Quelle und Datenbank stimmen bei Protein überein; die Fettwerte unterscheiden sich (15,9 g gegenüber 13,4 g). Nur der Transfettwert wurde übernommen.'
  },
  {
    index: 184, name: 'Lachsfilet, gefroren', value: 0,
    sourceFood: 'Salmon, farmed, raw', sourceUrl: 'https://www.matvaretabellen.no/en/salmon-farmed-raw/',
    sourceValue: 0, sourceValueType: 'Best estimate, analytical source', match: 'frozen_plain_salmon_close_match',
    sourceMacros: { fat: 15.9, protein: 19.9, carbohydrate: 0 },
    note: 'Nächster offizieller Eintrag ist roher Zuchtlachs mit 0 g Transfett. Die Datenbank beschreibt gefrorenes Lachsfilet mit 10 g Fett und 20 g Protein; eingefroren wird nur der Transfettwert als enger Lebensmittelklassen-Abgleich übertragen.'
  },
  {
    index: 187, name: 'Lebertran (Kabeljau, flüssig)', value: 0,
    sourceFood: 'Cod liver oil, Møllers tran', sourceUrl: 'https://www.matvaretabellen.no/en/cod-liver-oil-mollers-tran/',
    sourceValue: 0, sourceValueType: 'Logical zero', match: 'cod_liver_oil_product_match',
    sourceMacros: { fat: 100, protein: 0, carbohydrate: 0 },
    note: 'Der offizielle Kabeljau-Lebertran-Eintrag mit 100 g Fett weist Transfettsäuren als logische Null aus. Makros entsprechen der Datenbank.'
  }
];

for (const update of updates) {
  const row = rows[update.index];
  if (!row || row.name !== update.name) {
    throw new Error(`Index-/Namensprüfung fehlgeschlagen: ${update.index} ${row?.name ?? '(fehlt)'}`);
  }
  const current = row.nutrients[field];
  if (current === null || current === undefined) row.nutrients[field] = update.value;
  else if (current !== update.value) throw new Error(`Widersprüchlicher vorhandener Wert bei ${update.index}: ${current}`);
}

audit.sources.Matvaretabellen_2026 = {
  url: 'https://www.matvaretabellen.no/en/trans-fatty-acids/',
  citation: 'Norwegian Food Safety Authority and University of Oslo, Matvaretabellen, food-specific trans-fatty-acid records; source code 50 denotes an estimated naturally occurring logical zero.',
  checkedOn
};
audit.coverageNotes.InternetResearch_2026_09_24 = 'Ergänzt wurden belegte Transfettwerte für Haferdrink, Heilbutt, Hering, Instant-Kartoffelpüree, Camembert, Vollkornknäckebrot, Lachs und Kabeljau-Lebertran. Bei Lebensmittelklassen-Abgleichen sind Makroabweichungen und die Übertragung ausschließlich des Transfettwerts je Datensatz protokolliert. Fehlende, Tr- und unter-Nachweisgrenze-Werte wurden nicht als Null interpretiert.';
audit.internetResearchUpdates ??= [];
for (const update of updates) {
  const prior = audit.internetResearchUpdates.find(entry => entry.databaseIndex === update.index && entry.field === field);
  if (prior && prior.value !== update.value) throw new Error(`Auditwert widerspricht DB für Index ${update.index}`);
  if (!prior) {
    const { index, name, value, ...evidence } = update;
    audit.internetResearchUpdates.push({ databaseIndex: index, databaseName: name, field, value, checkedOn, ...evidence });
  }
}

const firstIndex = 100;
const scopedRows = rows.slice(firstIndex, 200);
audit.fieldCoverage = Object.fromEntries(audit.fields.map(nutrient => {
  const filled = scopedRows.filter(row => row.nutrients[nutrient] !== null && row.nutrients[nutrient] !== undefined).length;
  return [nutrient, { filled, missing: scopedRows.length - filled, total: scopedRows.length }];
}));
audit.remainingNulls = scopedRows.flatMap((row, offset) => {
  const missingFields = audit.fields.filter(nutrient => row.nutrients[nutrient] === null || row.nutrients[nutrient] === undefined);
  return missingFields.length ? [{
    databaseIndex: firstIndex + offset,
    databaseName: row.name,
    missingFields,
    reason: 'Kein passender numerischer Quellenwert belegt; null bleibt erhalten.'
  }] : [];
});

fs.writeFileSync(databasePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  updated: updates.map(({ index, name, value }) => ({ index, name, field, value })),
  rangeCoverage: audit.fieldCoverage,
  remainingNullCellsInRange: audit.remainingNulls.reduce((sum, item) => sum + item.missingFields.length, 0)
}, null, 2));
