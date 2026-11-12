import fs from 'node:fs';

const databasePath = 'database.json';
const auditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_001_sources.json';
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const explanations = {
  10: 'Trans fat: CoFID reports trace (Tr), which is not evidence of absolute absence and must not be converted to zero.',
  20: 'Trans fat: the BLS hard-cheese comparator does not report total trans fat; natural dairy trans fat cannot be excluded.',
  31: 'Trans fat: the closest BLS bratwurst comparator does not report total trans fat.',
  34: 'Trans fat: CoFID marks the exact wheat-roll class as trace (Tr), not a confirmed zero.',
  37: 'Trans fat: CoFID marks dry bulgur as trace (Tr), not a confirmed zero.',
  39: 'Trans fat: total trans fat is not reported, and dairy fat can contain natural trans isomers. Alcohol is below the BLS detection limit, not proven absent.',
  50: 'Trans fat: CoFID marks unsweetened cornflakes as trace (Tr), not a confirmed zero.',
  51: 'Omega-3 and Omega-6: the exact reduced-fat cottage-cheese CoFID entry leaves both fields blank; available BLS cottage-cheese profiles have a materially different total-fat level and cannot safely substitute.',
  52: 'Trans fat: CoFID marks dry couscous as trace (Tr), not a confirmed zero.',
  53: 'Trans fat: CoFID marks sweetened dried cranberries as trace (Tr). Alcohol is below the BLS detection limit, not proven absent.',
  56: 'Trans fat: no reliable total-trans value for the spelt-bread entry was found; individual dairy/plant fat formulation is unspecified.',
  61: 'Omega-3 and Omega-6: exact USDA frozen-edamame record lacks total PUFA needed to validate the sum; raw/canned BLS analogues have materially different fat levels.',
  67: 'Omega-3, Omega-6 and trans fat: no exact raw skinless duck-breast profile was found; the closest USDA comparator differs materially in total fat. Alcohol is composition-based zero.',
  72: 'Omega-3, Omega-6 and trans fat: pea-drink values depend on the unspecified brand formula and added oil. Alcohol is composition-based zero.',
  73: 'Omega-3 and Omega-6: values depend on the isolate and residual oil; no exact product profile was found. Trans fat and alcohol are zero for plain isolate.',
  80: 'Omega-3, Omega-6 and trans fat: values depend on the product recipe and frying oil. Alcohol is composition-based zero.',
  85: 'Trans fat: total trans fat is not reported; sheep-milk fat can contain natural trans isomers.',
  89: 'Trans fat: the available MEXT and USDA roe profiles do not report total trans fat.',
  90: 'Omega-3 and Omega-6: the generic USDA cream-cheese fatty-acid components do not reconcile with its total PUFA value, so neither family total is accepted.',
  91: 'Omega-3, Omega-6 and trans fat: no exact light cream-cheese profile was found; the generic comparator has an unresolved PUFA mismatch. Alcohol is composition-based zero.',
  94: 'Omega-3 and Omega-6: the USDA canned vegetable cocktail comparator has materially more total fat, and no verified density/profile exists for this exact ml-based juice mix.'
};

const fields = audit.fields;
audit.remainingNulls = database.slice(0, 100).flatMap((food, arrayIndex) => {
  const missingFields = fields.filter(field => food.nutrients[field] === null || food.nutrients[field] === undefined);
  if (missingFields.length === 0) return [];
  const databaseIndex = arrayIndex + 1;
  return [{
    databaseIndex,
    databaseName: food.name,
    missingFields,
    reason: explanations[databaseIndex] ?? 'No sufficiently specific, compatible source value was found; leave null rather than inventing a zero or transferring an incompatible proxy.'
  }];
});
audit.coverageNotes.RemainingNulls_2026_09_24 = 'This list is generated from the actual first-100 database records after researched updates. Trace markers and below-detection-limit readings remain null; neither means confirmed zero.';

const foods = database.slice(0, 100);
audit.fieldCoverage = Object.fromEntries(fields.map(field => {
  const filled = foods.filter(food => food.nutrients[field] !== null && food.nutrients[field] !== undefined).length;
  return [field, {filled, missing: foods.length - filled, total: foods.length}];
}));

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({remainingNullRecords: audit.remainingNulls.length, fieldCoverage: audit.fieldCoverage, remainingNulls: audit.remainingNulls}, null, 2));
