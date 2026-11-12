import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dbPath = path.join(root, 'database.json');
const auditPath = path.join(root, 'Daten', 'database_V2_fatty_acids_alcohol_batch_008_sources.json');
const apply = process.argv.includes('--apply');
const usCupMl = 236.5882365;
const usFluidOunceMl = 29.5735295625;
const conversions = [
  { index: 707, density: 1.03, source: 'CoFID_2021', sourceName: 'Milk, skimmed, UHT', sourceRow: 1678 },
  { index: 708, density: 1.03, source: 'CoFID_2021', sourceName: 'Milk, semi-skimmed, pasteurised, average', sourceRow: 1669 },
  { index: 710, density: 1.03, source: 'CoFID_2021', sourceName: 'Milk, whole, UHT', sourceRow: 1684 },
  { index: 711, grams: 30.5, volumeMl: usFluidOunceMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Milk, goat, fluid, with added vitamin D', fdcId: 171278, portion: '1 fl oz' },
  { index: 712, grams: 245, volumeMl: usCupMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Milk, sheep, fluid', fdcId: 170882, portion: '1 cup' },
  { index: 714, density: 1.03, source: 'CoFID_2021', sourceName: 'Milk, semi-skimmed, UHT', sourceRow: 1672 },
  { index: 715, density: 1.03, source: 'CoFID_2021', sourceName: 'Milk, whole, UHT', sourceRow: 1684 },
  { index: 753, grams: 30.5, volumeMl: usFluidOunceMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Beverages, carbonated, tonic water', fdcId: 171869, portion: '1 fl oz' },
  { index: 755, grams: 30.5, volumeMl: usFluidOunceMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Beverages, carbonated, ginger ale', fdcId: 174846, portion: '1 fl oz' },
  { index: 759, grams: 216, volumeMl: usCupMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Oil, olive, salad or cooking', fdcId: 171413, portion: '1 cup' },
  { index: 760, grams: 216, volumeMl: usCupMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Oil, peanut, salad or cooking', fdcId: 171410, portion: '1 cup' },
  { index: 761, grams: 218, volumeMl: usCupMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Oil, canola', fdcId: 172336, portion: '1 cup' },
  { index: 762, grams: 218, volumeMl: usCupMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Oil, corn, industrial and retail, all purpose salad or cooking', fdcId: 171029, portion: '1 cup' },
  { index: 763, grams: 218, volumeMl: usCupMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Oil, soybean, salad or cooking', fdcId: 171411, portion: '1 cup' },
  { index: 775, grams: 239, volumeMl: usCupMl, source: 'USDA_FoodData_Central_SR_Legacy_2018', sourceName: 'Vinegar, red wine', fdcId: 172240, portion: '1 cup' },
].map(row => ({ ...row, density: row.density ?? row.grams / row.volumeMl }));

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const fieldNames = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Alcohol (g)'];
const proposed = [];
const conflicts = [];
for (const conversion of conversions) {
  const item = db[conversion.index - 1];
  if (!item || item.unit !== 'ml') throw new Error(`Unexpected unit for database index ${conversion.index}`);
  const source = audit.records.find(record => record.databaseIndex === conversion.index && record.source === 'BLS_4_0');
  if (!source) throw new Error(`Missing exact BLS audit record for database index ${conversion.index}`);
  for (const field of fieldNames) {
    const raw = source.sourceValuesPer100g?.[field];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const value = Number((raw * conversion.density).toFixed(6));
    const existing = item.nutrients?.[field];
    if (existing != null) {
      if (Math.abs(existing - value) > 1e-6) conflicts.push({ databaseIndex: conversion.index, databaseName: item.name, field, existing, convertedSourceValue: value });
      continue;
    }
    proposed.push({ databaseIndex: conversion.index, databaseName: item.name, field, sourceValuePer100g: raw, density: conversion.density, convertedValuePer100ml: value, densitySource: conversion });
    if (apply) item.nutrients[field] = value;
  }
}

const fields = ['Omega-3 Fatty Acids (g)', 'Omega-6 Fatty Acids (g)', 'Trans Fat (g)', 'Alcohol (g)'];
const coverage = Object.fromEntries(fields.map(field => {
  const filled = db.slice(700, 800).filter(item => item.nutrients?.[field] != null).length;
  return [field, { filled, missing: 100 - filled, total: 100 }];
}));
if (apply) {
  audit.sources.USDA_CoFID_VolumeDensityConversions = {
    method: 'For volume-based records, convert BLS values per 100 g to per 100 ml by multiplying by a source-backed specific gravity. CoFID factors are used for cow milk; USDA SR Legacy household portion gram weights are divided by standard US cup or fluid-ounce millilitres for goat milk, sheep milk, oils, tonic water, ginger ale, and wine vinegar.',
    checkedOn: '2026-09-23',
  };
  audit.records.push(...proposed.map(row => ({
    databaseIndex: row.databaseIndex,
    databaseName: row.databaseName,
    source: 'BLS_4_0+CoFID_2021+USDA_FoodData_Central_SR_Legacy_2018',
    sourceCode: null,
    sourceName: row.densitySource.sourceName,
    valueBasis: 'BLS g per 100 g multiplied by source-backed specific gravity to g per 100 ml',
    sourceValuesPer100g: { [row.field]: row.sourceValuePer100g },
    density: {
      value: row.density,
      unit: 'g/ml',
      source: row.densitySource.source,
      sourceName: row.densitySource.sourceName,
      sourceRow: row.densitySource.sourceRow ?? null,
      fdcId: row.densitySource.fdcId ?? null,
      sourceUrl: row.densitySource.fdcId ? `https://fdc.nal.usda.gov/food-details/${row.densitySource.fdcId}/nutrients?type=SR%20Legacy` : null,
      portion: row.densitySource.portion ?? null,
      grams: row.densitySource.grams ?? null,
      volumeMl: row.densitySource.volumeMl ?? null,
    },
    values: { [row.field]: row.convertedValuePer100ml },
    checkedOn: '2026-09-23',
  })));
  audit.fieldCoverage = coverage;
  audit.checkedOn = '2026-09-23';
  audit.status = 'partial_research';
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', conversions: conversions.length, proposed: proposed.length, conflicts, coverage, rows: proposed }, null, 2));
