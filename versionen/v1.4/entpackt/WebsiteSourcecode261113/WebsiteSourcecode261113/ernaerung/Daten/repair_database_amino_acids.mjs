import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.join(here, "..", "database.json");
const reportPath = path.join(here, "database_amino_acid_repair_report.json");

const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));
const previousReport = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
  : null;

const aminoFields = [
  "Histidine (mg)",
  "Isoleucine (mg)",
  "Leucine (mg)",
  "Lysine (mg)",
  "Methionine (mg)",
  "Cystine (mg)",
  "Phenylalanine (mg)",
  "Tyrosine (mg)",
  "Threonine (mg)",
  "Tryptophan (mg)",
  "Valine (mg)",
];

const scoreGroups = [
  { fields: ["Histidine (mg)"], reference: 15 },
  { fields: ["Isoleucine (mg)"], reference: 30 },
  { fields: ["Leucine (mg)"], reference: 59 },
  { fields: ["Lysine (mg)"], reference: 45 },
  { fields: ["Methionine (mg)", "Cystine (mg)"], reference: 22 },
  { fields: ["Phenylalanine (mg)", "Tyrosine (mg)"], reference: 38 },
  { fields: ["Threonine (mg)"], reference: 23 },
  { fields: ["Tryptophan (mg)"], reference: 6 },
  { fields: ["Valine (mg)"], reference: 39 },
];

const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const proteinOf = (food) => Number(food?.nutrients?.["Protein (g)"] ?? 0);
const aminoValue = (food, field) => Number(food?.nutrients?.[field] ?? 0);
const hasCompleteAminoProfile = (food) => aminoFields.every((field) => finitePositive(aminoValue(food, field)));
const hasEmptyAminoProfile = (food) => aminoFields.every((field) => !finitePositive(aminoValue(food, field)));

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

// Ratios are mg amino acid per g protein. Median profiles prevent a missing
// source row from silently becoming an incomplete protein quality profile.
const ratioPools = new Map();
const globalPool = new Map(aminoFields.map((field) => [field, []]));

for (const food of database) {
  const protein = proteinOf(food);
  if (!(protein >= 1) || !hasCompleteAminoProfile(food)) continue;
  const category = food.category || "unknown";
  if (!ratioPools.has(category)) ratioPools.set(category, new Map(aminoFields.map((field) => [field, []])));
  const categoryPool = ratioPools.get(category);
  for (const field of aminoFields) {
    const ratio = aminoValue(food, field) / protein;
    categoryPool.get(field).push(ratio);
    globalPool.get(field).push(ratio);
  }
}

function medianProfile(pool) {
  return Object.fromEntries(aminoFields.map((field) => [field, median(pool.get(field) || [])]));
}

const categoryProfiles = new Map(
  [...ratioPools.entries()].map(([category, pool]) => [category, medianProfile(pool)]),
);
const globalProfile = medianProfile(globalPool);

// BLS 4.0 contains a matching entry named “Waffeln, einfache (Rührmasse)”.
// It does not expose cystine, so the cystine ratio is taken from the two
// existing waffle profiles in this database (Käsewaffeln and Eiswaffeln).
const waffleReferenceProtein = 8.19;
const waffleReference = {
  "Histidine (mg)": 0.184 * 1000 / waffleReferenceProtein,
  "Isoleucine (mg)": 0.397 * 1000 / waffleReferenceProtein,
  "Leucine (mg)": 0.644 * 1000 / waffleReferenceProtein,
  "Lysine (mg)": 0.397 * 1000 / waffleReferenceProtein,
  "Methionine (mg)": 0.211 * 1000 / waffleReferenceProtein,
  "Cystine (mg)": ((230 / 10.7) + (117 / 5.44)) / 2,
  "Phenylalanine (mg)": 0.429 * 1000 / waffleReferenceProtein,
  "Tyrosine (mg)": 0.291 * 1000 / waffleReferenceProtein,
  "Threonine (mg)": 0.316 * 1000 / waffleReferenceProtein,
  "Tryptophan (mg)": 0.107 * 1000 / waffleReferenceProtein,
  "Valine (mg)": 0.479 * 1000 / waffleReferenceProtein,
};

function profileFor(food) {
  if (/waffel.*hausgemacht/i.test(food.name)) {
    return { profile: waffleReference, source: "BLS 4.0 analog: Waffeln, einfache (Rührmasse)" };
  }
  const category = food.category || "unknown";
  return {
    profile: categoryProfiles.get(category) || globalProfile,
    source: categoryProfiles.has(category)
      ? `Median vollständiger Profile der Kategorie ${category}`
      : "Globaler Median vollständiger Profile",
  };
}

function calculateAasPct(nutrients) {
  const protein = Number(nutrients["Protein (g)"] ?? 0);
  if (!(protein > 0)) return 0;
  const ratios = scoreGroups.map((group) => {
    const total = group.fields.reduce((sum, field) => sum + Number(nutrients[field] ?? 0), 0);
    return total / protein / group.reference;
  });
  return rounded(Math.max(0, Math.min(...ratios)) * 100);
}

const changes = [];
for (const [index, food] of database.entries()) {
  const protein = proteinOf(food);
  // Gelatine is intentionally incomplete: its tryptophan content is
  // biologically absent, so a median imputation would falsely make it a
  // complete protein.
  if (!(protein >= 1) || /gelatine/i.test(food.name)) continue;
  const missingFields = aminoFields.filter((field) => !finitePositive(aminoValue(food, field)));
  if (!missingFields.length) continue;

  const { profile, source } = profileFor(food);
  const before = Object.fromEntries([
    ...aminoFields,
    "AAS (%)",
  ].map((field) => [field, food.nutrients?.[field] ?? null]));

  for (const field of missingFields) {
    const ratio = Number(profile[field]);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new Error(`Kein gültiges Aminosäureverhältnis für ${food.name}: ${field}`);
    }
    food.nutrients[field] = rounded(protein * ratio);
  }
  food.nutrients["AAS (%)"] = calculateAasPct(food.nutrients);

  const after = Object.fromEntries([
    ...aminoFields,
    "AAS (%)",
  ].map((field) => [field, food.nutrients[field]]));

  changes.push({
    index,
    name: food.name,
    category: food.category,
    protein,
    source,
    before,
    after,
  });
}

const allChanges = [
  ...(Array.isArray(previousReport?.changes) ? previousReport.changes : []).filter(
    (previous) => !changes.some((current) => current.index === previous.index),
  ),
  ...changes,
];

fs.writeFileSync(databasePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
fs.writeFileSync(reportPath, `${JSON.stringify({
  checkedOn: new Date().toISOString(),
  databaseRecordCount: database.length,
  thresholdProteinG: 1,
  method: "Complete amino acid profiles were retained. Missing fields in records with >=1 g protein were filled from a BLS waffle analog or category medians of complete profiles; gelatine remains an intentional incomplete-protein exception.",
  changedCount: allChanges.length,
  changes: allChanges,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ changedThisRun: changes.length, changedTotal: allChanges.length, reportPath }, null, 2));
