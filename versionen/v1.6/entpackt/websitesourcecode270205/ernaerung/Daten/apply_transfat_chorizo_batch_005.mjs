import fs from 'node:fs';
import path from 'node:path';

const databasePath = 'database.json';
const cofidAuditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_005_sources.json';
const outputAuditPath = 'Daten/database_V2_transfat_chorizo_batch_005.json';
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const apply = process.argv.includes('--apply');
const index = 407;
const field = 'Trans Fat (g)';
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const cofidAudit = JSON.parse(fs.readFileSync(cofidAuditPath, 'utf8'));
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(fdcPath, 'utf8'));
if (db.length < 500 || db[index - 1].name !== 'Chorizo') throw new Error('Database row 407 is not the expected Chorizo record.');
if (apply && fs.existsSync(outputAuditPath)) throw new Error(`Audit already exists: ${outputAuditPath}`);

const cofid = cofidAudit.records.find(row => row.databaseIndex === index && row.source === 'CoFID_2021' && row.sourceCode === '19-516');
if (!cofid || cofid.sourceMarkers?.[field] !== 'N') throw new Error('The expected CoFID Chorizo record or its N marker was not found.');
const fdc = SRLegacyFoods.find(food => Number(food.fdcId) === 173859);
if (!fdc || fdc.description !== 'Sausage, pork, chorizo, link or ground, raw') throw new Error('The selected USDA SR Legacy Chorizo profile did not match.');
const amount = number => fdc.foodNutrients.find(row => String(row.nutrient?.number) === String(number))?.amount ?? null;
const sourceTrans = amount(605);
const sourceFat = amount(204);
const targetFat = db[index - 1].nutrients['Total Fat (g)'];
if (![sourceTrans, sourceFat, targetFat].every(Number.isFinite) || sourceFat <= 0 || targetFat <= 0) throw new Error('A required source or target nutrient value is missing.');
if (db[index - 1].nutrients[field] != null) throw new Error('Refusing to overwrite the existing trans-fat value.');
const fatRatio = targetFat / sourceFat;
if (fatRatio < 0.5 || fatRatio > 1.5) throw new Error(`The fat ratio ${fatRatio} is outside the approved range.`);
const value = Number((sourceTrans * fatRatio).toFixed(6));
if (value < 0 || value > targetFat) throw new Error('The calculated trans-fat value failed the range check.');

const audit = {
  checkedOn: '2026-09-25',
  scope: { batch: 5, databaseIndex: index, food: db[index - 1].name },
  field,
  unitBasis: 'g per 100 g food',
  source: {
    dataset: 'USDA FoodData Central SR Legacy',
    fdcId: 173859,
    name: fdc.description,
    url: 'https://fdc.nal.usda.gov/food-details/173859/nutrients?type=SR%20Legacy',
    transFatPer100g: sourceTrans,
    totalFatPer100g: sourceFat,
  },
  crossCheck: {
    dataset: 'CoFID 2021',
    code: cofid.sourceCode,
    name: cofid.sourceName,
    marker: 'N means the nutrient is present in a significant quantity, but a reliable numeric amount is not available.',
    url: cofid.sourceUrl,
  },
  targetTotalFatPer100g: targetFat,
  fatRatio,
  value,
  method: 'The same named food type is matched to the USDA raw chorizo profile. Its trans-fat value is scaled by the target/source total-fat ratio because the database item does not specify preparation. This is a documented comparator estimate, not an item-specific assay.',
  confidence: 'medium; same food type, preparation unspecified',
  validation: { nonnegative: true, notAboveTotalFat: true, noOverwrite: true, readBackChecked: apply },
};

if (apply) {
  db[index - 1].nutrients[field] = value;
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputAuditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  const readBack = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  if (readBack[index - 1].nutrients[field] !== value) throw new Error('Read-back verification failed.');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', index, food: db[index - 1].name, sourceTrans, sourceFat, targetFat, fatRatio, value, confidence: audit.confidence, auditPath: apply ? outputAuditPath : null }, null, 2));
