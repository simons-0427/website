import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const firstIndex = 501;
const lastIndex = 600;
const checkedOn = '2026-09-25';
const databasePath = 'database.json';
const sourceAuditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_006_sources.json';
const componentAuditPath = 'Daten/database_V2_omega3_components_batch_007.json';
const blsPath = path.resolve('Daten/BLS_4_0_Daten_2025_DE.xlsx');
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const apply = process.argv.includes('--apply');

const F = {
  totalFat: 'Total Fat (g)',
  omega3: 'Omega-3 Fatty Acids (g)',
  ala: 'Alpha-Linolenic Acid (ALA) (g)',
  epa: 'Eicosapentaenoic Acid (EPA) (g)',
  dha: 'Docosahexaenoic Acid (DHA) (g)',
};
const componentFields = [F.ala, F.epa, F.dha];
const sourceFieldKeys = [
  { field: F.ala, short: 'ALA', valueColumn: 'LD', originColumn: 'LE', referenceColumn: 'LF' },
  { field: F.epa, short: 'EPA', valueColumn: 'LJ', originColumn: 'LK', referenceColumn: 'LL' },
  { field: F.dha, short: 'DHA', valueColumn: 'LP', originColumn: 'LQ', referenceColumn: 'LR' },
];

const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, 'utf8'));
const { SRLegacyFoods } = JSON.parse(fs.readFileSync(fdcPath, 'utf8'));
if (db.length < lastIndex) throw new Error(`Database has only ${db.length} rows.`);

const manualBls = { 503: 'S241000' };
const blsByIndex = new Map();
for (const record of sourceAudit.records ?? []) {
  if (record.databaseIndex < firstIndex || record.databaseIndex > lastIndex) continue;
  if (!String(record.source ?? '').startsWith('BLS_4_0') || !record.sourceCode) continue;
  const code = String(record.sourceCode);
  const previous = blsByIndex.get(record.databaseIndex);
  if (previous && previous !== code) throw new Error(`Conflicting BLS codes for ${record.databaseIndex}: ${previous}, ${code}`);
  blsByIndex.set(record.databaseIndex, code);
}
for (const [indexText, code] of Object.entries(manualBls)) {
  const index = Number(indexText);
  if (!blsByIndex.has(index)) blsByIndex.set(index, code);
}

const wantedCodes = [...new Set(blsByIndex.values())];
const psCode = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.IO.Compression.FileSystem
$xlsxPath = '${blsPath.replace(/'/g, "''")}'
$wanted = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($code in @(${wantedCodes.map(code => `'${code}'`).join(',')})) { [void]$wanted.Add($code) }
$archive = [IO.Compression.ZipFile]::OpenRead($xlsxPath)
try {
  $reader = [IO.StreamReader]::new($archive.GetEntry('xl/sharedStrings.xml').Open())
  try { [xml]$sharedXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $shared = [System.Collections.Generic.List[string]]::new()
  foreach ($item in $sharedXml.SelectNodes("//*[local-name()='si']")) {
    $parts = @($item.SelectNodes(".//*[local-name()='t']") | ForEach-Object { $_.InnerText })
    $shared.Add(($parts -join ''))
  }
  $reader = [IO.StreamReader]::new($archive.GetEntry('xl/worksheets/sheet1.xml').Open())
  try { [xml]$sheet = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $results = [System.Collections.Generic.List[object]]::new()
  foreach ($row in $sheet.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
    $rowNumber = $row.GetAttribute('r')
    $cells = @{}
    foreach ($cell in $row.SelectNodes("./*[local-name()='c']")) {
      $column = [regex]::Match($cell.GetAttribute('r'), '^[A-Z]+').Value
      if ($column -notin @('A','B','C','LD','LE','LF','LJ','LK','LL','LP','LQ','LR')) { continue }
      $valueNode = $cell.SelectSingleNode("./*[local-name()='v']")
      if (-not $valueNode) { continue }
      $value = $valueNode.InnerText
      if ($cell.GetAttribute('t') -eq 's') { $value = $shared[[int]$value] }
      $cells[$column] = $value
    }
    $code = [string]$cells['A']
    if (-not $wanted.Contains($code)) { continue }
    $results.Add([pscustomobject]@{
      code = $code; name = [string]$cells['B']; nameEn = [string]$cells['C']
      ALA = [pscustomobject]@{ raw = [string]$cells['LD']; origin = [string]$cells['LE']; reference = [string]$cells['LF'] }
      EPA = [pscustomobject]@{ raw = [string]$cells['LJ']; origin = [string]$cells['LK']; reference = [string]$cells['LL'] }
      DHA = [pscustomobject]@{ raw = [string]$cells['LP']; origin = [string]$cells['LQ']; reference = [string]$cells['LR'] }
    })
  }
  $json = ConvertTo-Json -InputObject $results.ToArray() -Depth 5 -Compress
  [Console]::Out.Write($json)
} finally { $archive.Dispose() }
`;
const blsOutput = execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(psCode, 'utf16le').toString('base64')], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
const blsRows = JSON.parse(blsOutput);
const blsByCode = new Map(blsRows.map(row => [row.code, row]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const densityByIndex = new Map();
for (const record of sourceAudit.records ?? []) {
  const density = record.density;
  if (record.databaseIndex < firstIndex || record.databaseIndex > lastIndex || !finite(density?.value)) continue;
  const previous = densityByIndex.get(record.databaseIndex);
  if (previous && Math.abs(previous.value - density.value) > 0.000001) throw new Error('Conflicting source density conversions for ' + record.databaseIndex);
  densityByIndex.set(record.databaseIndex, density);
}

const foodsByDescription = new Map(SRLegacyFoods.map(food => [food.description, food]));
const foodsById = new Map(SRLegacyFoods.map(food => [food.fdcId, food]));
const usdaByIndex = new Map();
for (const record of sourceAudit.records ?? []) {
  if (record.databaseIndex < firstIndex || record.databaseIndex > lastIndex) continue;
  if (record.source !== 'USDA_FoodData_Central_SR_Legacy_2018' || !record.sourceName) continue;
  const food = foodsByDescription.get(record.sourceName);
  if (food) usdaByIndex.set(record.databaseIndex, { food, match: 'exact USDA mapping', note: record.mappingNote ?? 'USDA item mapping carried forward from the fatty-acid source audit.' });
}
const manualUsda = {
  503: { id: 167575, note: 'Vanilla ice cream, plain; close item-level match to milk ice cream.' },
  504: { id: 174287, note: 'Veggie burger patty; close item-level match, unprepared source scaled only within the fat-ratio check.' },
  505: { id: 169704, note: 'Brown long-grain rice, cooked; close grain and preparation match.' },
  507: { id: 175039, note: 'Plain waffles prepared from recipe; close preparation match.' },
  508: { id: 169040, note: 'WEETABIX whole grain cereal; close product match to fortified Weetabix-type cereal.' },
  511: { id: 170727, note: 'BURGER KING WHOPPER without cheese; exact named product match.', exact: true },
  517: { id: 169707, note: 'Rice, white, long-grain, parboiled, enriched, dry; exact grain and preparation match.', exact: true },
  543: { id: 173758, note: 'Cowpeas (blackeyes), mature seeds, raw; exact mature black-eyed bean match.', exact: true },
};
for (const [indexText, selection] of Object.entries(manualUsda)) {
  const index = Number(indexText);
  if (usdaByIndex.has(index)) continue;
  const food = foodsById.get(selection.id);
  if (food) usdaByIndex.set(index, { food, match: selection.exact ? 'manually selected exact USDA profile' : 'manually selected close USDA profile', note: selection.note });
}

const nutrientAmount = (food, number) => food.foodNutrients.find(row => String(row.nutrient.number) === String(number))?.amount ?? null;
const omega3Amount = food => {
  const rows = food.foodNutrients.filter(row => /^PUFA /.test(row.nutrient.name) && row.amount != null);
  const chain = name => name.match(/\b(\d{2}:\d)\b/)?.[1] ?? name;
  const selected = new Map();
  for (const row of rows) {
    const name = row.nutrient.name;
    if (!/n-3/.test(name) && !/^PUFA 18:3$/.test(name) && !/^PUFA 18:4\b/.test(name)) continue;
    const key = chain(name);
    const old = selected.get(key);
    if (!old || name.length > old.nutrient.name.length) selected.set(key, row);
  }
  return selected.size ? [...selected.values()].reduce((sum, row) => sum + row.amount, 0) : null;
};
const round6 = value => Number(Math.max(0, value).toFixed(6));
const parseSourceNumber = raw => {
  if (raw == null || raw === '' || raw === '-') return null;
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const plantOnly = item => ['getreide', 'huelsenfruechte', 'nuesse_samen', 'obst'].includes(item.category)
  || /tortillachips|nachos|veggie.?burger/i.test(item.name);
const sourceUrlUsda = id => `https://fdc.nal.usda.gov/food-details/${id}/nutrients?type=SR%20Legacy`;
const updates = [];
const records = [];
const omega3Corrections = [];

for (let index = firstIndex; index <= lastIndex; index++) {
  const item = db[index - 1];
  const blsCode = blsByIndex.get(index);
  const blsRow = blsCode ? blsByCode.get(blsCode) : null;
  const usdaEntry = usdaByIndex.get(index) ?? null;
  const itemSources = {};
  const proposed = {};
  const unresolvedSourceDetails = {};

  for (const component of sourceFieldKeys) {
    const key = component.field;
    if (finite(item.nutrients?.[key])) continue;

    if (blsRow) {
      const source = blsRow[component.short];
      const value = parseSourceNumber(source?.raw);
      const density = densityByIndex.get(index);
      const canConvertLiquid = item.unit !== 'ml' || value === 0 || finite(density?.value);
      if (value != null && canConvertLiquid) {
        const conversion = item.unit === 'ml' && value !== 0 ? density.value : 1;
        proposed[key] = round6(value * conversion);
        itemSources[key] = {
          source: 'BLS 4.0 ' + blsCode,
          sourceName: blsRow.name,
          sourceUrl: 'https://blsdb.de/download',
          valuePer100g: value,
          density: conversion === 1 ? null : density,
          origin: source.origin || null,
          reference: source.reference || null,
          method: item.unit !== 'ml' ? 'Exact BLS food-code mapping; component copied in g per 100 g.'
            : value === 0 ? 'BLS source value is zero, so no density conversion is needed.'
              : 'Exact BLS food-code mapping; converted using the already-audited density ' + density.value + ' g/ml.',
        };
        continue;
      }
      unresolvedSourceDetails[key] = {
        source: `BLS 4.0 ${blsCode}`,
        marker: source?.raw || null,
        origin: source?.origin || null,
        reference: source?.reference || null,
      };
    }

    if (usdaEntry) {
      const food = usdaEntry.food;
      const nutrientId = key === F.ala ? 619 : key === F.epa ? 629 : 621;
      const value = nutrientAmount(food, nutrientId);
      const sourceFat = nutrientAmount(food, 204);
      const targetFat = item.nutrients?.[F.totalFat];
      let scale = 1;
      if (usdaEntry.match.includes('close') && item.unit !== 'ml' && finite(sourceFat) && sourceFat > 0 && finite(targetFat) && targetFat > 0) {
        const ratio = targetFat / sourceFat;
        if (ratio < 0.5 || ratio > 1.5) {
          unresolvedSourceDetails[key] = { source: `USDA SR Legacy ${food.fdcId}`, marker: 'fat-ratio-out-of-range', sourceFat, targetFat, ratio };
          continue;
        }
        scale = ratio;
      }
      const density = densityByIndex.get(index);
      const liquidScale = item.unit === 'ml' && value !== 0 && finite(density?.value) ? density.value : 1;
      if (finite(value) && (item.unit !== 'ml' || value === 0 || liquidScale !== 1)) {
        proposed[key] = round6(value * scale * liquidScale);
        itemSources[key] = {
          source: 'USDA FoodData Central SR Legacy ' + food.fdcId,
          sourceName: food.description,
          sourceUrl: sourceUrlUsda(food.fdcId),
          valuePer100g: value,
          scale,
          density: liquidScale === 1 ? null : density,
          method: usdaEntry.match + '; ' + usdaEntry.note + (scale === 1 ? '' : '; scaled by total-fat ratio ' + scale.toFixed(4) + '.'),
        };
        continue;
      }
      if (value == null) unresolvedSourceDetails[key] = { source: `USDA SR Legacy ${food.fdcId}`, marker: 'nutrient-not-reported' };
    }

    if (item.nutrients?.[F.totalFat] === 0) {
      proposed[key] = 0;
      itemSources[key] = { source: 'DerivedTotalFatZero', sourceName: 'Total Fat (g) = 0', sourceUrl: null, method: 'Database total fat is exactly zero; fatty-acid components are zero at stored precision.' };
    } else if ((key === F.epa || key === F.dha) && plantOnly(item)) {
      proposed[key] = 0;
      itemSources[key] = { source: 'Food identity', sourceName: item.category, sourceUrl: null, method: 'Plant-only food; EPA/DHA excluded. No total-omega-3 split was used.' };
    }
  }

  if (index === 502) {
    for (const key of componentFields) {
      if (finite(item.nutrients?.[key])) continue;
      proposed[key] = 0;
      itemSources[key] = {
        source: 'Matvaretabellen, Tzatziki',
        sourceName: 'Tzatziki (Food ID 06.673)',
        sourceUrl: 'https://matvaretabellen.mattilsynet.io/en/tzatziki/',
        valuePer100g: 0,
        method: 'Official food-composition entry reports ALA, EPA and DHA as 0 g per 100 g; stored as reported. Its total-fat value differs from this database item, so confidence is medium for ALA and high for EPA/DHA.',
      };
    }
  }

  if (item.nutrients?.[F.omega3] === 0 && usdaEntry && !usdaEntry.match.includes('close')) {
    const sourceOmega3 = omega3Amount(usdaEntry.food);
    const sourceFat = nutrientAmount(usdaEntry.food, 204);
    const targetFat = item.nutrients?.[F.totalFat];
    const ratio = finite(sourceFat) && sourceFat > 0 && finite(targetFat) ? targetFat / sourceFat : 0;
    if (finite(sourceOmega3) && sourceOmega3 > 0 && ratio >= 0.5 && ratio <= 1.5) {
      const corrected = round6(sourceOmega3);
      omega3Corrections.push({
        databaseIndex: index,
        food: item.name,
        previous: 0,
        corrected,
        source: 'USDA FoodData Central SR Legacy ' + usdaEntry.food.fdcId,
        sourceName: usdaEntry.food.description,
        sourceUrl: sourceUrlUsda(usdaEntry.food.fdcId),
        ratio,
        note: 'Exact USDA source reports positive Omega-3 components while the mapped BLS total was formula-calculated as zero and ALA was unreported; the database total is corrected to the USDA item-level Omega-3 sum.',
      });
      item.nutrients[F.omega3] = corrected;
    }
  }

  const totalOmega3 = item.nutrients?.[F.omega3];
  const existingSum = componentFields.reduce((sum, key) => sum + (finite(item.nutrients?.[key]) ? item.nutrients[key] : 0), 0);
  const proposedSum = Object.values(proposed).reduce((sum, value) => sum + value, 0);
  let conflict = null;
  if (finite(totalOmega3) && existingSum + proposedSum > totalOmega3 + 0.000001) {
    const positives = Object.entries(proposed).filter(([, value]) => value > 0);
    if (positives.length) {
      conflict = { type: 'component_sum_exceeds_database_omega3', totalOmega3, existingSum, proposedSum, skippedPositiveFields: positives.map(([key]) => key) };
      for (const [key] of positives) {
        delete proposed[key];
        delete itemSources[key];
      }
    }
  }

  const changed = {};
  if (apply) {
    for (const [key, value] of Object.entries(proposed)) {
      if (item.nutrients[key] == null) {
        item.nutrients[key] = value;
        changed[key] = value;
      }
    }
  }
  if (Object.keys(changed).length) updates.push({ databaseIndex: index, food: item.name, values: changed });

  const values = Object.fromEntries(componentFields.map(key => [key, finite(item.nutrients?.[key]) ? item.nutrients[key] : proposed[key] ?? null]));
  const missing = componentFields.filter(key => !finite(values[key]));
  records.push({
    databaseIndex: index,
    databaseArrayIndex: index - 1,
    food: item.name,
    unitBasis: item.unit === 'ml' ? 'g per 100 ml' : 'g per 100 g',
    values,
    sources: itemSources,
    sourceChecks: unresolvedSourceDetails,
    confidence: missing.length ? (Object.keys(itemSources).length ? 'partially sourced; unresolved values left blank' : 'unresolved, left blank') : 'source-checked item profile',
    conflict,
    missing,
  });
}

const block = db.slice(firstIndex - 1, lastIndex);
const fieldCoverage = Object.fromEntries(componentFields.map(field => {
  const filled = records.filter(row => finite(row.values[field])).length;
  return [field, { filled, missing: block.length - filled, total: block.length }];
}));
const invalid = [];
for (let offset = 0; offset < block.length; offset++) {
  const item = block[offset];
  const row = records[offset];
  const total = item.nutrients?.[F.omega3];
  const componentTotal = componentFields.reduce((sum, field) => sum + (finite(row.values[field]) ? row.values[field] : 0), 0);
  for (const field of componentFields) if (finite(row.values[field]) && row.values[field] < 0) invalid.push({ databaseIndex: firstIndex + offset, field, value: row.values[field] });
  if (finite(total) && componentTotal > total + 0.000001) invalid.push({ databaseIndex: firstIndex + offset, issue: 'ALA+EPA+DHA exceeds database omega-3', componentTotal, total });
}
if (invalid.length) throw new Error(`Validation failed: ${JSON.stringify(invalid.slice(0, 5))}`);

const audit = {
  checkedOn,
  scope: { firstDatabaseIndex: firstIndex, lastDatabaseIndex: lastIndex, count: block.length, unitBasis: 'g per 100 g; g per 100 ml for liquids' },
  fields: { ALA: F.ala, EPA: F.epa, DHA: F.dha },
  fieldCoverage,
  sources: [
    { name: 'BLS 4.0 2025', url: 'https://blsdb.de/download', use: 'Exact food-code component fields for ALA, EPA and DHA.' },
    { name: 'USDA FoodData Central SR Legacy 2018', url: 'https://fdc.nal.usda.gov/download-datasets/', use: 'Mapped item-level component values; close profiles are listed individually and scaled only when the fat ratio is 0.5 to 1.5.' },
    { name: 'Matvaretabellen', url: 'https://matvaretabellen.mattilsynet.io/en/tzatziki/', use: 'Same-named Tzatziki entry for values absent from BLS/USDA matches.' },
  ],
  methodNotes: [
    'No generic food-class split of total Omega-3 was used to estimate ALA, EPA or DHA.',
    'BLS values are g per 100 g. Positive values are not transferred to ml-based items without a verified density conversion; exact source zeroes remain zero.',
    'USDA nutrient 619 is used for ALA, 629 for EPA and 621 for DHA. A missing source nutrient is not treated as zero.',
    'Zeros are used only for explicit source zeroes, exactly zero total fat, or plant-only EPA/DHA exclusion.',
    'Any source components that would exceed the database total Omega-3 are withheld and recorded as a conflict rather than adjusted.',
    'Where an exact USDA item profile reports positive Omega-3 but the mapped BLS total was formula-calculated as zero with ALA unreported, the Omega-3 total is corrected to the directly sourced USDA fatty-acid sum and logged below.',
  ],
  updatedDatabaseIndices: [...new Set([...updates.map(row => row.databaseIndex), ...omega3Corrections.map(row => row.databaseIndex)])],
  omega3Corrections,
  records,
  missingComponentRows: records.filter(row => row.missing.length).map(row => ({ databaseIndex: row.databaseIndex, food: row.food, missing: row.missing })),
  validation: { negativeValues: 0, omega3ComponentSumConflicts: records.filter(row => row.conflict).length, remainingMissingCells: records.reduce((sum, row) => sum + row.missing.length, 0), invalidRows: invalid.length },
};

if (apply) {
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(componentAuditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  for (const correction of omega3Corrections) {
    sourceAudit.records.push({
      databaseIndex: correction.databaseIndex,
      databaseName: correction.food,
      source: 'USDA_FoodData_Central_SR_Legacy_2018',
      sourceName: correction.sourceName,
      sourceUrl: correction.sourceUrl,
      values: { [F.omega3]: correction.corrected },
      conflicts: { [F.omega3]: { previousBLSValue: correction.previous, USDAValue: correction.corrected, resolution: correction.note } },
      mappingNote: correction.note,
      checkedOn,
    });
  }
  fs.writeFileSync(sourceAuditPath, `${JSON.stringify(sourceAudit, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', blsCodes: wantedCodes.length, blsProfilesRead: blsRows.length, fieldCoverage, changedRows: updates.length, changedCells: updates.reduce((sum, row) => sum + Object.keys(row.values).length, 0), omega3Corrections, unresolvedRows: audit.missingComponentRows, conflicts: records.filter(row => row.conflict) }, null, 2));
