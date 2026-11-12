import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const databasePath = 'database.json';
const sourceAuditPath = 'Daten/database_V2_fatty_acids_alcohol_batch_016_sources.json';
const outputAuditPath = 'Daten/database_V2_omega3_components_batch_016.json';
const cofidPath = path.resolve('Daten/CoFID_2021.xlsx');
const fdcPath = path.join(process.env.TEMP ?? '', 'FoodData_Central_sr_legacy_food_json_2018-04.json');
const checkedOn = '2026-09-25';
const apply = process.argv.includes('--apply');

const fields = {
  ALA: 'Alpha-Linolenic Acid (ALA) (g)',
  EPA: 'Eicosapentaenoic Acid (EPA) (g)',
  DHA: 'Docosahexaenoic Acid (DHA) (g)',
};
const cofidComponents = [
  { key: 'ALA', column: 'Q' },
  { key: 'EPA', column: 'AC' },
  { key: 'DHA', column: 'AO' },
];
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync(sourceAuditPath, 'utf8'));
const fdc = JSON.parse(fs.readFileSync(fdcPath, 'utf8')).SRLegacyFoods;
if (db.length < 1516) throw new Error('Expected the 1,516-row database with the 16 CoFID additions.');
if (fs.existsSync(outputAuditPath) && apply) throw new Error(`Audit already exists: ${outputAuditPath}`);

const cofidByIndex = new Map((sourceAudit.records ?? [])
  .filter(row => row.source === 'CoFID_2021' && row.databaseIndex >= 1501 && row.databaseIndex <= 1516)
  .map(row => [row.databaseIndex, row]));
if (cofidByIndex.size !== 16) throw new Error(`Expected 16 CoFID source rows, found ${cofidByIndex.size}.`);

const fallbackCofidCodes = ['16-360', '16-401'];
const wantedCodes = [...new Set([
  ...[...cofidByIndex.values()].map(row => String(row.sourceCode)),
  ...fallbackCofidCodes,
])];
const psCode = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.IO.Compression.FileSystem
$xlsxPath = '${cofidPath.replace(/'/g, "''")}'
$wanted = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($code in @(${wantedCodes.map(code => `'${code.replace(/'/g, "''")}'`).join(',')})) { [void]$wanted.Add($code) }
$zip = [IO.Compression.ZipFile]::OpenRead($xlsxPath)
try {
  $reader = [IO.StreamReader]::new($zip.GetEntry('xl/sharedStrings.xml').Open())
  try { [xml]$sharedXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $shared = [System.Collections.Generic.List[string]]::new()
  foreach ($item in $sharedXml.SelectNodes("//*[local-name()='si']")) {
    $parts = @($item.SelectNodes(".//*[local-name()='t']") | ForEach-Object { $_.InnerText })
    $shared.Add(($parts -join ''))
  }
  $proxByCode = @{}
  $reader = [IO.StreamReader]::new($zip.GetEntry('xl/worksheets/sheet4.xml').Open())
  try { [xml]$prox = $reader.ReadToEnd() } finally { $reader.Dispose() }
  foreach ($row in $prox.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
    $rowNumber = $row.GetAttribute('r'); $cells = @{}
    foreach ($cell in $row.SelectNodes("./*[local-name()='c']")) {
      $column = [regex]::Match($cell.GetAttribute('r'), '^[A-Z]+').Value
      if ($column -notin @('A','B','K','AF')) { continue }
      $valueNode = $cell.SelectSingleNode("./*[local-name()='v']")
      if (-not $valueNode) { continue }
      $value = $valueNode.InnerText
      if ($cell.GetAttribute('t') -eq 's') { $value = $shared[[int]$value] }
      $cells[$column] = $value
    }
    $code = [string]$cells['A']
    if ($wanted.Contains($code)) {
      $proxByCode[$code] = [pscustomobject]@{ code=$code; row=$rowNumber; name=[string]$cells['B']; fat=[string]$cells['K']; omega3=[string]$cells['AF'] }
    }
  }
  $reader = [IO.StreamReader]::new($zip.GetEntry('xl/worksheets/sheet13.xml').Open())
  try { [xml]$pufa = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $results = [System.Collections.Generic.List[object]]::new()
  foreach ($row in $pufa.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
    $rowNumber = $row.GetAttribute('r'); $cells = @{}
    foreach ($cell in $row.SelectNodes("./*[local-name()='c']")) {
      $column = [regex]::Match($cell.GetAttribute('r'), '^[A-Z]+').Value
      if ($column -notin @('A','B','Q','AC','AO')) { continue }
      $valueNode = $cell.SelectSingleNode("./*[local-name()='v']")
      if (-not $valueNode) { continue }
      $value = $valueNode.InnerText
      if ($cell.GetAttribute('t') -eq 's') { $value = $shared[[int]$value] }
      $cells[$column] = $value
    }
    $code = [string]$cells['A']
    if (-not $wanted.Contains($code) -or -not $proxByCode.ContainsKey($code)) { continue }
    $proxRow = $proxByCode[$code]
    $results.Add([pscustomobject]@{
      code=$code; name=$proxRow.name; proxRow=$proxRow.row; fat=$proxRow.fat; omega3=$proxRow.omega3
      pufaRow=$rowNumber; ALA=[string]$cells['Q']; EPA=[string]$cells['AC']; DHA=[string]$cells['AO']
    })
  }
  [Console]::Out.Write((ConvertTo-Json -InputObject $results.ToArray() -Depth 5 -Compress))
} finally { $zip.Dispose() }
`;
const cofidOutput = execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(psCode, 'utf16le').toString('base64')], {
  encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
});
const cofidRowsRaw = JSON.parse(cofidOutput);
const cofidRows = new Map(cofidRowsRaw.map(row => [String(row.code), row]));
for (const code of wantedCodes) if (!cofidRows.has(code)) throw new Error(`CoFID code not found in both worksheets: ${code}`);

const parseNumber = raw => {
  if (raw == null || raw === '' || raw === '-' || /^Tr$|^N$/i.test(String(raw))) return null;
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const round6 = value => Number(value.toFixed(6));
const fdcById = new Map(fdc.map(food => [food.fdcId, food]));
const fdcValue = (food, nutrientId) => food.foodNutrients.find(row => String(row.nutrient.number) === String(nutrientId))?.amount ?? null;
const sourceUrlCoFID = 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid';
const sourceUrlFdc = id => `https://fdc.nal.usda.gov/food-details/${id}/nutrients?type=SR%20Legacy`;
const fallbacks = {
  1504: { type: 'cofid', code: '16-360', note: 'Wild salmon, flesh only, raw; same named species, close source, scaled by total fat for baking.' },
  1505: { type: 'cofid', code: '16-360', note: 'Wild salmon, flesh only, raw; same named species, close source, scaled by total fat for grilling.' },
  1506: { type: 'cofid', code: '16-360', note: 'Wild salmon, flesh only, raw; same named species, close source, scaled by total fat for steaming.' },
  1509: { type: 'usda', id: 175139, note: 'Atlantic sardines, canned in oil, drained; closest SR Legacy profile. Oil type differs, so no total-fat scaling was applied.' },
  1510: { type: 'usda', id: 175139, note: 'Atlantic sardines, canned in oil, drained; closest SR Legacy profile. Oil type differs, so no total-fat scaling was applied.' },
  1515: { type: 'cofid', code: '16-401', note: 'Sardines, flesh only, raw; same fish and edible-part basis, scaled by total fat for grilling.' },
};
const entries = [];
const updates = [];
for (let index = 1501; index <= 1516; index++) {
  const item = db[index - 1];
  const exact = cofidByIndex.get(index);
  const exactRow = cofidRows.get(String(exact.sourceCode));
  const exactValues = Object.fromEntries(cofidComponents.map(component => [component.key, parseNumber(exactRow[component.key])]));
  const allExact = Object.values(exactValues).every(Number.isFinite);
  let source;
  let scale = 1;
  let values;

  if (allExact) {
    source = {
      kind: 'CoFID 2021 exact food code', code: exact.sourceCode, name: exactRow.name,
      row: exactRow.pufaRow, proxRow: exactRow.proxRow, url: sourceUrlCoFID,
      sourceFat: Number(exactRow.fat), targetFat: item.nutrients['Total Fat (g)'],
      note: 'Exact CoFID 2021 food-code values from the PUFA-per-100-g-food worksheet.',
      confidence: 'high',
    };
    values = exactValues;
  } else {
    const fallback = fallbacks[index];
    if (!fallback) throw new Error(`No validated component source for new food ${index}: ${item.name}`);
    if (fallback.type === 'cofid') {
      const row = cofidRows.get(fallback.code);
      const sourceFat = parseNumber(row.fat);
      const targetFat = item.nutrients['Total Fat (g)'];
      if (!Number.isFinite(sourceFat) || sourceFat <= 0 || !Number.isFinite(targetFat)) throw new Error(`Missing fat for CoFID scaling at index ${index}`);
      scale = targetFat / sourceFat;
      if (scale < 0.5 || scale > 1.5) throw new Error(`CoFID fat ratio outside 0.5–1.5 at index ${index}: ${scale}`);
      values = Object.fromEntries(cofidComponents.map(component => {
        const raw = parseNumber(row[component.key]);
        if (!Number.isFinite(raw)) throw new Error(`Missing CoFID ${component.key} source for fallback ${fallback.code}`);
        return [component.key, round6(raw * scale)];
      }));
      source = {
        kind: 'CoFID 2021 close food match', code: fallback.code, name: row.name,
        row: row.pufaRow, proxRow: row.proxRow, url: sourceUrlCoFID,
        sourceFat, targetFat, scale, note: fallback.note, confidence: 'medium',
      };
    } else {
      const food = fdcById.get(fallback.id);
      if (!food) throw new Error(`USDA SR Legacy profile not found: ${fallback.id}`);
      values = {
        ALA: fdcValue(food, 619), EPA: fdcValue(food, 629), DHA: fdcValue(food, 621),
      };
      if (!Object.values(values).every(Number.isFinite)) throw new Error(`USDA fatty-acid components incomplete for ${fallback.id}`);
      const sourceFat = fdcValue(food, 204);
      source = {
        kind: 'USDA FoodData Central SR Legacy close food match', code: `FDC ${food.fdcId}`, name: food.description,
        url: sourceUrlFdc(food.fdcId), sourceFat, targetFat: item.nutrients['Total Fat (g)'],
        scale: 1, note: fallback.note, confidence: 'medium-low',
      };
    }
  }

  const componentValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [fields[key], round6(value)]));
  for (const [field, value] of Object.entries(componentValues)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid component value for ${index}, ${field}`);
    if (item.nutrients[field] == null) {
      item.nutrients[field] = value;
      updates.push({ databaseIndex: index, databaseName: item.name, field, value });
    }
  }
  const sum = Object.values(componentValues).reduce((total, value) => total + value, 0);
  const omega3 = item.nutrients['Omega-3 Fatty Acids (g)'];
  if (!Number.isFinite(omega3) || sum > omega3 + 0.000001) {
    throw new Error(`Component sum exceeds CoFID Omega-3 for ${index}: ${sum} > ${omega3}`);
  }
  entries.push({
    databaseIndex: index, databaseName: item.name, sourceCode: exact.sourceCode,
    sourceName: exact.sourceName, matchMethod: source.kind, confidence: source.confidence,
    valueBasis: 'g per 100 g edible food', sourceDetails: source,
    values: componentValues, totalOmega3: omega3, componentSum: round6(sum),
    sumCheck: 'ALA + EPA + DHA does not exceed stored total Omega-3.',
  });
}

const coverage = Object.fromEntries(Object.values(fields).map(field => {
  const filled = db.slice(1500, 1516).filter(item => Number.isFinite(item.nutrients[field])).length;
  return [field, { filled, missing: 16 - filled, total: 16 }];
}));
const audit = {
  batch: 16, checkedOn,
  range: { first: 1501, last: 1516, count: 16 },
  status: 'complete_with_documented_close_matches',
  fields: Object.values(fields),
  valueBasis: 'g per 100 g edible food',
  nullPolicy: 'Trace, blank, and nonnumeric source markers are not converted to zero; close-match values are used only where documented and checked against total Omega-3.',
  sources: {
    CoFID_2021: { url: sourceUrlCoFID, sheets: '1.3 Proximates (total fat) and 1.12 PUFA per 100 g food (ALA, EPA, DHA).' },
    USDA_SR_Legacy: { url: 'https://fdc.nal.usda.gov/download-datasets/', profile: 175139, itemUrl: sourceUrlFdc(175139) },
  },
  fieldCoverage: coverage,
  records: entries,
  databaseApplication: { appliedOn: apply ? checkedOn : null, appliedCount: apply ? updates.length : 0, updates },
  unresolvedRows: [],
  validation: { allNonnegative: true, allComponentSumsWithinOmega3: true, validatedFoodCount: entries.length },
};

if (apply) {
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputAuditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  mode: apply ? 'applied' : 'dry-run', range: [1501, 1516],
  updatedCells: updates.length, fieldCoverage: coverage,
  values: entries.map(row => ({ index: row.databaseIndex, food: row.databaseName, values: row.values, source: row.sourceDetails.kind, confidence: row.confidence, componentSum: row.componentSum, omega3: row.totalOmega3 })),
  auditPath: apply ? outputAuditPath : null,
}, null, 2));
