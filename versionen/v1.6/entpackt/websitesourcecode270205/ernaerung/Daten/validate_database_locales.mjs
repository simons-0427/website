import fs from "node:fs";

const database = JSON.parse(fs.readFileSync("database.json", "utf8"));
const javascript = fs.readFileSync("database.js", "utf8");
const audit = JSON.parse(fs.readFileSync("Daten/database_uk_us_price_audit.json", "utf8"));
const issues = [];
const requiredFields = ["name_en", "price_per_100_uk", "price_per_100_us"];
const legacyFields = ["name", "unit", "price_per_100", "nutrients", "category", "tags"];

if (!Array.isArray(database) || database.length !== 1500) {
  issues.push(`database.json must contain 1500 records, found ${Array.isArray(database) ? database.length : "non-array"}`);
}

const germanResiduals = /[äöüß]|\b(?:und|mit|ohne|roh|gekocht|gebraten|gebacken|gedünstet|geschmort|Fleisch|Milch|Käse|Brot|Mehl|Zucker|Saft|Getränk|Gemüse|Obst|Nüsse|Bohnen|Erbsen|Schwein|Hähnchen|Pute|Schaf|Lamm|Kalb|Ente|Gans|Fisch|Kuchen|Torte|Suppe|Soße|Wurst|Brei|Boden|Mischung|Kraut|Leber|Brust|Schulter|Keule|Filet|Zunge|Hirn|Niere|Herz|Buttermilch|Sahne|Schweinefett|Schweineschmalz|Sahnedickmilch|Sahnesauermilch|Erdbeersahneeis|Schnittlauchquark|Sahnequark|Dünner|Trockenfrüchten|Waffelhörnchen|Göttinger|Meerrettich|Zuckerglasur|Eiswaffeln|Eiweiß|Müslimischung|Frischkäsezubereitung|Grundsauce|Barbecuesauce|Sojasauce|Apfel|Aprikose|Buchweizen|Dinkel|Kichererbsen|Limette|Natur|Beeren|trinkfertig|Tomatensauce|fortifiziert|energiereduziert|Kartoffel|Schafjoghurt|Zitronenlimonade|Quellwasser|Halbfettbutter|Steinsalz|Meersalz|Fertigprodukt|Sojaproteinisolat|Sauermolke|Orangenlimonade|Brause|Madeirawein|Entenfett|Balsamicoessig|Fondantkonfekt|Fondantcreme|Trinkschokoladenpulver|Dekor|Vanillecremeeis|Mandelbiskuitboden|glutenhaltig|Roquefortsauce|Honigkuchen|Birnenkraut|Lachs|Rumtopf|Currybratwurst|Katenrauchwurst|gezuckert|Weizenfladenbrot|Haferschleim|Schokozwieback|Kaffeeeis|Studentenfutter|Apfelkraut|Salatcreme|Weizentortilla|Krautsalat|Pommes|Zitronensaft|Roter)\b/iu;

for (let index = 0; index < database.length; index += 1) {
  const food = database[index];
  for (const field of legacyFields.concat(requiredFields)) {
    if (!(field in food)) issues.push(`${index}: missing ${field}`);
  }
  if (typeof food.name_en !== "string" || food.name_en.trim() === "") issues.push(`${index}: empty name_en`);
  if (germanResiduals.test(food.name_en)) issues.push(`${index}: German residual in name_en: ${food.name} => ${food.name_en}`);
  for (const field of ["price_per_100", "price_per_100_uk", "price_per_100_us"]) {
    if (typeof food[field] !== "number" || !Number.isFinite(food[field]) || food[field] < 0) {
      issues.push(`${index}: invalid ${field}`);
    }
  }
}

const pricesByName = new Map(database.map(food => [food.name, food.price_per_100]));
let sourceRecordCount = 0;
let sourcePriceComparisons = 0;
let sourceNamesNotInDatabase = 0;
for (const file of fs.readdirSync("Daten").filter(file => /^database_V2_batch_\d+_sources\.json$/u.test(file))) {
  const sourceBatch = JSON.parse(fs.readFileSync(`Daten/${file}`, "utf8"));
  for (const record of sourceBatch.records ?? []) {
    sourceRecordCount += 1;
    if (!pricesByName.has(record.databaseName)) {
      sourceNamesNotInDatabase += 1;
      continue;
    }
    sourcePriceComparisons += 1;
    if (pricesByName.get(record.databaseName) !== record.price?.priceFinalPer100) {
      issues.push(`legacy price changed for ${record.databaseName}`);
    }
  }
}

const javascriptMarker = "window.FOOD_DATABASE = ";
const javascriptStart = javascript.indexOf(javascriptMarker);
if (javascriptStart < 0) {
  issues.push("database.js is missing the FOOD_DATABASE assignment");
} else {
  const javascriptPayload = javascript.slice(javascriptStart + javascriptMarker.length).trim().replace(/;\s*$/, "");
  const javascriptDatabase = JSON.parse(javascriptPayload);
  if (javascriptDatabase.length !== database.length) issues.push("database.js record count differs from database.json");
  for (let index = 0; index < Math.min(database.length, javascriptDatabase.length); index += 1) {
    for (const field of requiredFields) {
      if (database[index][field] !== javascriptDatabase[index][field]) issues.push(`${index}: database.js mismatch for ${field}`);
    }
  }
}

if (audit.recordCount !== 1500) issues.push(`audit recordCount is ${audit.recordCount}`);
if (audit.batchSize !== 100) issues.push(`audit batchSize is ${audit.batchSize}`);
if (audit.surcharge !== 0.10) issues.push(`audit surcharge is ${audit.surcharge}`);
if (!Array.isArray(audit.batches) || audit.batches.length !== 15) issues.push("audit must contain 15 batches");
else {
  audit.batches.forEach((batch, index) => {
    if (batch.batch !== index + 1 || batch.startIndex !== index * 100 || batch.endIndex !== index * 100 + 99 || batch.count !== 100) {
      issues.push(`batch ${index + 1} does not cover exactly 100 records`);
    }
    if (batch.status !== "completed" || JSON.stringify(batch.fields) !== JSON.stringify(requiredFields)) {
      issues.push(`batch ${index + 1} is missing completion metadata`);
    }
  });
}

const result = {
  databaseRecords: database.length,
  requiredFieldsChecked: requiredFields,
  legacyFieldsPresent: issues.filter(issue => issue.includes("missing ")).length === 0,
  emptyEnglishNames: database.filter(food => typeof food.name_en !== "string" || food.name_en.trim() === "").length,
  GermanResidualNames: database.filter(food => germanResiduals.test(food.name_en)).length,
  unchangedNameRecords: database.filter(food => food.name_en.toLocaleLowerCase() === food.name.toLocaleLowerCase()).map(food => food.name),
  invalidNumericValues: issues.filter(issue => issue.includes("invalid ")).length,
  zeroLocalizedPrices: database.filter(food => food.price_per_100_uk === 0 || food.price_per_100_us === 0).length,
  unitCounts: Object.fromEntries([...new Set(database.map(food => food.unit))].sort().map(unit => [unit, database.filter(food => food.unit === unit).length])),
  sourceRecordCount,
  sourcePriceComparisons,
  sourceNamesNotInDatabase,
  sourcePriceMismatches: issues.filter(issue => issue.startsWith("legacy price changed")).length,
  auditBatches: audit.batches.length,
  auditBatchSize: audit.batchSize,
  auditSurcharge: audit.surcharge,
  issues,
};

console.log(JSON.stringify(result, null, 2));
if (issues.length > 0) process.exit(1);
