import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const databasePath = 'database.json';
const dataDir = 'Daten';
const workbookPath = path.resolve(dataDir, 'CoFID_2021.xlsx');
const auditPath = path.join(dataDir, 'database_V2_omega3_components_cofid_exact.json');
const checkedOn = '2026-09-25';
const apply = process.argv.includes('--apply');
const fields = [
  { key: 'Alpha-Linolenic Acid (ALA) (g)', short: 'ALA', column: 'Q' },
  { key: 'Eicosapentaenoic Acid (EPA) (g)', short: 'EPA', column: 'AC' },
  { key: 'Docosahexaenoic Acid (DHA) (g)', short: 'DHA', column: 'AO' },
];
const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const sourceRows = new Map();
const sourceFiles = fs.readdirSync(dataDir).filter(name => /^database_V2_fatty_acids_alcohol_batch_.*_sources\.json$/.test(name));
for (const file of sourceFiles) {
  const audit = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  for (const row of audit.records ?? []) {
    if (row.source !== 'CoFID_2021' || !row.sourceCode || !Number.isInteger(row.databaseIndex)) continue;
    const previous = sourceRows.get(row.databaseIndex);
    if (previous && String(previous.sourceCode) !== String(row.sourceCode)) {
      throw new Error(`Conflicting CoFID codes for database row ${row.databaseIndex}: ${previous.sourceCode} and ${row.sourceCode}`);
    }
    sourceRows.set(row.databaseIndex, row);
  }
}
const wantedCodes = [...new Set([...sourceRows.values()].map(row => String(row.sourceCode)))];
if (!wantedCodes.length) throw new Error('No exact CoFID source codes were found in the source audits.');
if (apply && fs.existsSync(auditPath)) throw new Error(`Audit already exists: ${auditPath}`);

const wantedCodesJson = JSON.stringify(wantedCodes);
const psCode = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.IO.Compression.FileSystem
$xlsxPath = '${workbookPath.replace(/'/g, "''")}'
$wantedJson = '${wantedCodesJson.replace(/'/g, "''")}'
$wanted = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($code in (ConvertFrom-Json $wantedJson)) { [void]$wanted.Add([string]$code) }
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
    $cells = @{}
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
    if ($wanted.Contains($code)) { $proxByCode[$code] = [pscustomobject]@{ code=$code; row=$row.GetAttribute('r'); name=[string]$cells['B'] } }
  }
  $reader = [IO.StreamReader]::new($zip.GetEntry('xl/worksheets/sheet13.xml').Open())
  try { [xml]$pufa = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $results = [System.Collections.Generic.List[object]]::new()
  foreach ($row in $pufa.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
    $cells = @{}
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
    $results.Add([pscustomobject]@{
      code=$code; name=$proxByCode[$code].name; proxRow=$proxByCode[$code].row; pufaRow=$row.GetAttribute('r')
      ALA=[string]$cells['Q']; EPA=[string]$cells['AC']; DHA=[string]$cells['AO']
    })
  }
  [Console]::Out.Write((ConvertTo-Json -InputObject $results.ToArray() -Depth 5 -Compress))
} finally { $zip.Dispose() }
`;
const cofidOutput = execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(psCode, 'utf16le').toString('base64')], {
  encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
});
const cofidRows = new Map(JSON.parse(cofidOutput).map(row => [String(row.code), row]));
for (const code of wantedCodes) if (!cofidRows.has(code)) throw new Error(`CoFID code not found in PUFA worksheet: ${code}`);

const parseNumber = raw => {
  if (raw == null || raw === '' || raw === '-') return null;
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const updates = [];
const records = [];
const applyByIndex = new Map();
for (const [databaseIndex, source] of [...sourceRows].sort((a, b) => a[0] - b[0])) {
  if (databaseIndex < 1 || databaseIndex > db.length) throw new Error(`Invalid source index ${databaseIndex}.`);
  const row = cofidRows.get(String(source.sourceCode));
  const item = db[databaseIndex - 1];
  const proposed = {};
  const unresolved = {};
  for (const field of fields) {
    const raw = row[field.short];
    const value = parseNumber(raw);
    if (Number.isFinite(item.nutrients?.[field.key])) continue;
    if (value != null) proposed[field.key] = Number(value.toFixed(6));
    else unresolved[field.key] = raw ? String(raw) : 'blank';
  }

  const totalOmega3 = item.nutrients?.['Omega-3 Fatty Acids (g)'];
  const existingSum = fields.reduce((sum, field) => sum + (Number.isFinite(item.nutrients?.[field.key]) ? item.nutrients[field.key] : 0), 0);
  const proposedSum = Object.values(proposed).reduce((sum, value) => sum + value, 0);
  let conflict = null;
  if (Number.isFinite(totalOmega3) && existingSum + proposedSum > totalOmega3 + 0.000001) {
    const skipped = Object.entries(proposed).filter(([, value]) => value > 0).map(([key]) => key);
    conflict = { type: 'component_sum_exceeds_database_omega3', totalOmega3, existingSum, proposedSum, skippedPositiveFields: skipped };
    for (const key of skipped) delete proposed[key];
  }
  if (Object.keys(proposed).length) {
    applyByIndex.set(databaseIndex, proposed);
    updates.push({ databaseIndex, food: item.name, sourceCode: String(source.sourceCode), sourceName: row.name, values: proposed });
  }
  records.push({
    databaseIndex,
    food: item.name,
    sourceCode: String(source.sourceCode),
    sourceName: row.name,
    workbookRows: { proximates: row.proxRow, pufaPer100gFood: row.pufaRow },
    unitBasis: 'g per 100 g food',
    proposedValues: proposed,
    unresolvedSourceMarkers: unresolved,
    conflict,
  });
}

const fieldsSummary = Object.fromEntries(fields.map(field => [field.key, {
  numericInCoFID: records.filter(row => parseNumber(cofidRows.get(row.sourceCode)[field.short]) != null).length,
  added: updates.filter(row => Object.hasOwn(row.values, field.key)).length,
  missingOrUnreported: records.filter(row => row.unresolvedSourceMarkers[field.key] != null).length,
}]));
const audit = {
  checkedOn,
  scope: { mappedCoFIDRows: sourceRows.size, firstDatabaseIndex: Math.min(...sourceRows.keys()), lastDatabaseIndex: Math.max(...sourceRows.keys()) },
  fields: Object.fromEntries(fields.map(field => [field.short, field.key])),
  valueBasis: 'g per 100 g food',
  nullPolicy: 'Only numeric CoFID values are filled. Tr is a trace, N means present in significant quantities but without a reliable amount, and blank cells are not converted to zero.',
  sources: { CoFID_2021: { url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid', workbook: 'Daten/CoFID_2021.xlsx', worksheet: '1.12 Polyunsaturated fatty acids per 100 g food' } },
  fieldCoverage: fieldsSummary,
  updates,
  records,
  validation: { allAppliedValuesNumericNonnegative: true, sumConflictsSkipped: records.filter(row => row.conflict).length },
};

if (apply) {
  for (const [databaseIndex, values] of applyByIndex) Object.assign(db[databaseIndex - 1].nutrients, values);
  fs.writeFileSync(databasePath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  mode: apply ? 'applied' : 'dry-run',
  mappedRows: sourceRows.size,
  changedRows: updates.length,
  changedCells: updates.reduce((sum, row) => sum + Object.keys(row.values).length, 0),
  fields: fieldsSummary,
  unresolvedRows: records.filter(row => Object.keys(row.unresolvedSourceMarkers).length || row.conflict).map(row => ({ databaseIndex: row.databaseIndex, food: row.food, markers: row.unresolvedSourceMarkers, conflict: row.conflict })),
  auditPath: apply ? auditPath : null,
}, null, 2));
