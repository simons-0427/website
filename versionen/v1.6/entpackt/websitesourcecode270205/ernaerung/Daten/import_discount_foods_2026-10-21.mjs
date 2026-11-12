// Audited retail product additions. Dry run by default; pass --apply to update the database.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const PFAS4 = require(path.join(root, 'pfas4-estimates.js'));
const databasePath = path.join(root, 'database.json');
const baselinePath = path.join(import.meta.dirname, 'database_before_120_2026-10-21.json');
const refreshExisting = process.argv.includes('--refresh-existing');
const inputPath = (refreshExisting || !process.argv.includes('--apply')) && fs.existsSync(baselinePath) ? baselinePath : databasePath;
const foods = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const olderCatalog = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'aldi_nord_price_catalog_extended_2026-10-10.json'), 'utf8')).items;
const currentCatalog = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'aldi_nord_price_catalog_2026-10-21.json'), 'utf8')).items;
const additionalCatalog = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'verified_discount_prices_2026-10-21.json'), 'utf8')).items;
const catalogKey = x => `${x.url}|${x.name}|${x.pack}`;
const currentKeys = new Set(currentCatalog.map(catalogKey));
const catalog = [...additionalCatalog.map(x => ({ ...x, freshness: 'retailer product or category page checked 2026-10-21' })),
  ...currentCatalog.map(x => ({ ...x, freshness: 'search index rechecked 2026-10-21' })),
  ...olderCatalog.filter(x => !currentKeys.has(catalogKey(x))).map(x => ({ ...x, promo: false, freshness: 'search index saved 2026-10-10; individually recheck fallback' }))];
const selections = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'discount_food_selections_2026-10-21.json'), 'utf8'));
const blsCodeOverrides = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'bls_code_overrides_2026-10-21.json'), 'utf8'));
const bls = new Map(fs.readFileSync(path.join(import.meta.dirname, 'bls_4_compact_2026-10-10.ndjson'), 'utf8').trim().split(/\r?\n/).map(x => {
  const row = JSON.parse(x); return [row.code, row];
}));
const existingByName = new Map(foods.map(x => [x.name, x]));
const nutrientMap = {
  ENERCC: 'Energy (cal)', FAT: 'Total Fat (g)', FASAT: 'Saturated Fat (g)',
  CHO: 'Total Carbohydrate (g)', SUGAR: 'Total sugars (g)', FIBT: 'Dietary Fibre (g)',
  PROT625: 'Protein (g)', NA: 'Sodium (mg)', K: 'Potassium (mg)', CA: 'Calcium (mg)',
  MG: 'Magnesium (mg)', P: 'Phosphorus (mg)', FE: 'Iron (mg)', ZN: 'Zinc (mg)',
  ID: 'Iodine (µg)', CLD: 'Chloride (mg)', MO: 'Molybdenum (µg)',
  VITAA: 'Total Vitamin A (µg)', RETOL: 'Retinol (µg)', CARTB: 'Beta-Carotene (µg)',
  VITD: 'Vitamin D (µg)', VITE: 'Vitamin E (mg)', VITK: 'Total Vitamin K (µg)',
  VITK1: 'Vitamin K1 (µg)', VITK2: 'Vitamin K2 (µg)', THIA: 'Vitamin B1 (Thiamin) (mg)',
  RIBF: 'Vitamin B2 (Riboflavin) (mg)', NIA: 'Vitamin B3 (Niacin) (mg)',
  PANTAC: 'Vitamin B5 (Pantothenic Acid) (mg)', BIOT: 'Biotin (µg)',
  FOL: 'Folate (Vitamin B9) (µg)', VITB12: 'Vitamin B12 (µg)', VITC: 'Vitamin C (mg)',
  CHORL: 'Cholesterol (mg)', ALC: 'Alcohol (g)', FAPUN3: 'Omega-3 Fatty Acids (g)',
  FAPUN6: 'Omega-6 Fatty Acids (g)', 'F18:3CN3': 'Alpha-Linolenic Acid (ALA) (g)',
  'F20:5CN3': 'Eicosapentaenoic Acid (EPA) (g)',
  'F22:6CN3': 'Docosahexaenoic Acid (DHA) (g)',
};
const aminoMap = {
  HIS: 'Histidine (mg)', ILE: 'Isoleucine (mg)', LEU: 'Leucine (mg)',
  LYS: 'Lysine (mg)', MET: 'Methionine (mg)', CYSTE: 'Cystine (mg)',
  PHE: 'Phenylalanine (mg)', TYR: 'Tyrosine (mg)', THR: 'Threonine (mg)',
  TRP: 'Tryptophan (mg)', VAL: 'Valine (mg)',
};
const factors = { CU: ['Copper (mg)', .001], MN: ['Manganese (mg)', .001], VITB6: ['Vitamin B6 (mg)', .001] };
const scoreGroups = [
  [['Histidine (mg)'], 15], [['Isoleucine (mg)'], 30], [['Leucine (mg)'], 59],
  [['Lysine (mg)'], 45], [['Methionine (mg)', 'Cystine (mg)'], 22],
  [['Phenylalanine (mg)', 'Tyrosine (mg)'], 38], [['Threonine (mg)'], 23],
  [['Tryptophan (mg)'], 6], [['Valine (mg)'], 39],
];
function aas(n) {
  const protein = n['Protein (g)'];
  if (!(protein > 0)) return null;
  if (Object.values(aminoMap).some(k => !Number.isFinite(n[k]))) return null;
  return Math.round(Math.min(...scoreGroups.map(([keys, ref]) => keys.reduce((s, k) => s + n[k], 0) / protein / ref)) * 1000) / 10;
}
function basePrice(item) {
  const printed = item.pack.match(/(?:kg|KG)(?:\s*\(ATG\))?\s*=\s*(\d+[.,]\d+)/);
  const printedPer100 = printed ? Number(printed[1].replace(',', '.')) / 10 : null;
  const pack = item.pack.replace(/\./g, '').replace(/,/g, '.');
  const drained = pack.match(/Abtropfgewicht\s*=\s*(\d+)\s*g/i);
  if (drained && Number(drained[1]) > 0) return Number(item.price) * 100 / Number(drained[1]);
  const multi = pack.match(/(\d+)\s*[x×]\s*(\d+)\s*[- ]?g/i);
  if (multi) return Number(item.price) * 100 / (Number(multi[1]) * Number(multi[2]));
  const grams = pack.match(/(\d+)\s*[- ]?g/i);
  const calculated = grams ? Number(item.price) * 100 / Number(grams[1]) : null;
  // The shelf price and pack mass determine the payable unit price. A printed kg label can be stale.
  if (calculated && !/z\.\s*B\./i.test(item.pack)) return calculated;
  const liters = item.pack.match(/(\d+(?:[.,]\d+)?)\s*[- ]?(?:L|Liter)(?:-|\b)/i);
  if (liters) return Number(item.price) * 100 / (Number(liters[1].replace(',', '.')) * 1000);
  return printedPer100;
}
function selectedSku(selection) {
  const hits = catalog.filter(x => x.name === selection.sku && !x.promo && (!selection.pack || x.pack.includes(selection.pack)));
  if (!hits.length) throw Error(`Price SKU not found: ${selection.sku} (${selection.pack || '*'})`);
  const withPrice = hits.map(x => ({ ...x, rawPer100: selection.variantWeightGrams
    ? Number(x.price) * 100 / Number(selection.variantWeightGrams) : basePrice(x) })).filter(x => x.rawPer100 > 0);
  if (!withPrice.length) throw Error(`No valid unit price: ${selection.sku}`);
  return withPrice.sort((a, b) => a.rawPer100 - b.rawPer100)[0];
}
const newFoods = [];
const audit = [];
for (const selection of selections) {
  if (!selection.name || !selection.template || !selection.sku || !selection.reason) throw Error(`Incomplete selection: ${JSON.stringify(selection)}`);
  if (existingByName.has(selection.name) || newFoods.some(x => x.name === selection.name)) throw Error(`Duplicate food name: ${selection.name}`);
  const template = existingByName.get(selection.template);
  if (!template) throw Error(`Template missing for ${selection.name}: ${selection.template}`);
  const sku = selectedSku(selection);
  const sourceOptions = [{ retailer: 'ALDI Nord', product: selection.sku, variant: selection.variant || null,
    pack: sku.pack, variantWeightGrams: selection.variantWeightGrams || null,
    url: sku.url, rawPer100: sku.rawPer100, checkedOn: '2026-10-21', sourceFreshness: sku.freshness }];
  if (selection.lidl) {
    if (!(selection.lidl.rawPer100 > 0) || !selection.lidl.url) throw Error(`Invalid Lidl comparison for ${selection.name}`);
    sourceOptions.push({ retailer: 'Lidl', product: selection.lidl.product || selection.sku, pack: selection.lidl.pack, url: selection.lidl.url, rawPer100: selection.lidl.rawPer100, checkedOn: '2026-10-21', sourceFreshness: selection.lidl.sourceFreshness || 'published 2026' });
  }
  sourceOptions.sort((a, b) => Math.abs(a.rawPer100 - b.rawPer100) < 1e-6
    ? a.retailer.localeCompare(b.retailer) : a.rawPer100 - b.rawPer100);
  const cheapest = sourceOptions[0];
  const food = structuredClone(template);
  food.name = selection.name;
  food.name_en = selection.name_en || `${template.name_en || template.name} (${cheapest.retailer})`;
  food.price_per_100 = Math.ceil(cheapest.rawPer100 * 1.1 * 1000 - 1e-10) / 1000;
  for (const locale of ['uk', 'us']) {
    const key = `price_per_100_${locale}`;
    const ratio = Number(template[key]) / Number(template.price_per_100);
    if (Number.isFinite(ratio) && ratio > 0) food[key] = +(food.price_per_100 * ratio).toFixed(3);
    else delete food[key];
  }
  if (selection.category) food.category = selection.category;
  if (selection.tags) food.tags = selection.tags;
  let blsRow = null;
  let blsFields = 0;
  let aminoBasis = 'comparable-food estimate';
  const blsCode = selection.blsCode || blsCodeOverrides[selection.name];
  if (blsCode) {
    blsRow = bls.get(blsCode);
    if (!blsRow) throw Error(`BLS code missing for ${selection.name}: ${blsCode}`);
    if (!selection.name_en && blsRow.name_en) food.name_en = `${blsRow.name_en} (${cheapest.retailer})`;
    for (const [code, key] of Object.entries(nutrientMap)) {
      if (Number.isFinite(blsRow.values[code])) { food.nutrients[key] = blsRow.values[code]; blsFields++; }
    }
    for (const [code, [key, factor]] of Object.entries(factors)) {
      if (Number.isFinite(blsRow.values[code])) { food.nutrients[key] = +(blsRow.values[code] * factor).toFixed(5); blsFields++; }
    }
    if (Object.keys(aminoMap).every(code => Number.isFinite(blsRow.values[code]))) {
      for (const [code, key] of Object.entries(aminoMap)) {
        food.nutrients[key] = +(blsRow.values[code] * 1000).toFixed(4);
        blsFields++;
      }
      aminoBasis = 'BLS 4.0 complete profile';
    } else {
      const ratio = Number(food.nutrients['Protein (g)']) / Number(template.nutrients['Protein (g)']);
      if (Number.isFinite(ratio) && ratio > 0) {
        for (const key of Object.values(aminoMap)) if (Number.isFinite(template.nutrients[key])) food.nutrients[key] = +(template.nutrients[key] * ratio).toFixed(4);
      }
    }
    food.nutrients['AAS (%)'] = aas(food.nutrients);
  }
  if (selection.nutrientOverrides) {
    if (!selection.nutrientSource) throw Error(`Nutrient source missing for ${selection.name}`);
    const oldProtein = food.nutrients['Protein (g)'];
    for (const [key, value] of Object.entries(selection.nutrientOverrides)) {
      if (!Number.isFinite(value) || value < 0 || !(key in food.nutrients)) throw Error(`Invalid nutrient override for ${selection.name}: ${key}`);
      food.nutrients[key] = value;
    }
    const newProtein = food.nutrients['Protein (g)'];
    if (oldProtein > 0 && newProtein > 0 && oldProtein !== newProtein && !blsRow) {
      for (const key of Object.values(aminoMap)) {
        if (Number.isFinite(food.nutrients[key])) food.nutrients[key] = +(food.nutrients[key] * newProtein / oldProtein).toFixed(4);
      }
    }
    food.nutrients['AAS (%)'] = aas(food.nutrients);
  }
  for (const key of [...PFAS4.KEYS, PFAS4.SUM]) delete food.nutrients[key];
  PFAS4.sync(food.nutrients, food);
  for (const [key, value] of Object.entries(food.nutrients)) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw Error(`Bad nutrient for ${food.name}: ${key}=${value}`);
  }
  newFoods.push(food);
  if (!food.name.includes(cheapest.retailer)) throw Error(`Food name retailer differs from cheapest source: ${food.name} / ${cheapest.retailer}`);
  audit.push({ name: food.name, reason: selection.reason, price: { sourceOptions, cheapest, margin: 0.10, exactFinalPer100: cheapest.rawPer100 * 1.1, storedFinalPer100: food.price_per_100 }, nutrients: { basis: blsRow ? 'BLS 4.0 with comparable-food estimates for missing parameters' : 'comparable-food estimate', blsCode: blsRow?.code || null, blsName: blsRow?.name || null, blsFields, aminoBasis, template: template.name, productLabelFields: Object.keys(selection.nutrientOverrides || {}), productLabelSource: selection.nutrientSource || null, estimatedParameters: blsRow ? ['Creatine', 'Selenium', 'Choline', 'contaminants', 'other BLS gaps'] : ['all'] } });
}
const report = { checkedOn: '2026-10-21', baseFoodCount: foods.length, addedCount: newFoods.length, note: 'Lowest directly observed discount listing among recorded comparisons; not an exhaustive market guarantee. ALDI Nord catalog prices were indexed in September 2026 and require future refresh. A 10% margin is applied to every stored EUR/100g price.', records: audit };
fs.writeFileSync(path.join(import.meta.dirname, 'discount_food_addition_audit_2026-10-21.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(import.meta.dirname, 'discount_food_additions_preview_2026-10-21.json'), JSON.stringify(newFoods, null, 2) + '\n');
if (process.argv.includes('--apply') || refreshExisting) {
  if (newFoods.length < 110 || newFoods.length > 130) throw Error(`Refusing to apply ${newFoods.length} additions; expected about 120`);
  if (refreshExisting) {
    const current = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
    if (current.length !== foods.length + newFoods.length ||
        current.slice(0, foods.length).some((food, index) => JSON.stringify(food) !== JSON.stringify(foods[index])) ||
        current.slice(foods.length).some((food, index) =>
          food.name !== newFoods[index].name && food.name !== selections[index].previousName)) {
      throw Error('Existing database differs from audited base and addition names; refusing to refresh');
    }
  }
  const json = JSON.stringify([...foods, ...newFoods], null, 2) + '\n';
  fs.writeFileSync(databasePath, json);
  fs.writeFileSync(path.join(root, 'database.js'), '// Auto-generated from database.json - do not edit by hand.\nwindow.FOOD_DATABASE = ' + json.trimEnd() + ';\n');
  console.log(`Applied ${newFoods.length} foods; total ${foods.length + newFoods.length}.`);
} else console.log(`Previewed ${newFoods.length} foods; total would be ${foods.length + newFoods.length}.`);
