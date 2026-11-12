# Datei-Inventar

Dieses Inventar nennt alle für die V1 des Assetklassen-Backtesters angelegten oder bearbeiteten Projektdateien. Die ursprüngliche Spezifikation `Assetklassen-Backtester-Spezifikation-und-GPT-5.6-Prompt-v2.md` blieb unverändert.

## Einstieg und Projektkonfiguration

- `.env.example`
- `.gitignore`
- `.htaccess`
- `index.html`
- `package.json`
- `README.md`
- `olddata.xls`
- `recentdata.xls`
- `config/.htaccess`
- `config/backtester.example.php`

## Frontend und Medien

- `assets/css/asset-backtester.css`
- `assets/js/asset-backtester/api.js`
- `assets/js/asset-backtester/app.js`
- `assets/js/asset-backtester/calculations.js`
- `assets/js/asset-backtester/charts.js`
- `assets/js/asset-backtester/formatters.js`
- `assets/og-backtester.png`
- `assets/vendor/chart.umd.min.js`
- `assets/vendor/Chart.js-LICENSE.md`

## Öffentliche API

- `api/backtester/assets.php`
- `api/backtester/series.php`
- `api/backtester/status.php`
- `api/backtester/summary.php`
- `api/backtester/sync-if-stale.php`

## PHP-Kern

- `includes/.htaccess`
- `includes/backtester/App.php`
- `includes/backtester/autoload.php`
- `includes/backtester/bootstrap.php`
- `includes/backtester/Database.php`
- `includes/backtester/Contracts/BacktestAdjustmentInterface.php`
- `includes/backtester/Contracts/HistoricalDataProviderInterface.php`
- `includes/backtester/Contracts/ObservationReaderInterface.php`
- `includes/backtester/Contracts/DividendYieldReaderInterface.php`
- `includes/backtester/Domain/AssetDefinition.php`
- `includes/backtester/Domain/HistoricalObservation.php`
- `includes/backtester/Domain/DividendYieldObservation.php`
- `includes/backtester/Exceptions/AssetUnavailableException.php`
- `includes/backtester/Exceptions/ProviderException.php`
- `includes/backtester/Exceptions/ValidationException.php`
- `includes/backtester/Http/JsonResponse.php`
- `includes/backtester/Http/RequestSecurity.php`
- `includes/backtester/Http/RequestValidator.php`
- `includes/backtester/Providers/AlphaVantageProvider.php`
- `includes/backtester/Providers/BitcoinProvider.php`
- `includes/backtester/Providers/BlsInflationProvider.php`
- `includes/backtester/Providers/CsvImportProvider.php`
- `includes/backtester/Providers/EcbCompoundedIndexProvider.php`
- `includes/backtester/Providers/EcbExchangeRateProvider.php`
- `includes/backtester/Providers/EurostatInflationProvider.php`
- `includes/backtester/Providers/FredProvider.php`
- `includes/backtester/Providers/FredCsvProvider.php`
- `includes/backtester/Providers/GoldProvider.php`
- `includes/backtester/Providers/GoldApiProvider.php`
- `includes/backtester/Providers/HttpClient.php`
- `includes/backtester/Providers/MultplDividendYieldProvider.php`
- `includes/backtester/Providers/MsciWorldProvider.php`
- `includes/backtester/Providers/NyFedSofrIndexProvider.php`
- `includes/backtester/Providers/ProviderRegistry.php`
- `includes/backtester/Providers/Sp500Provider.php`
- `includes/backtester/Providers/UsdToEurConverter.php`
- `includes/backtester/Providers/YahooFundProvider.php`
- `includes/backtester/Repositories/AssetRepository.php`
- `includes/backtester/Repositories/ObservationRepository.php`
- `includes/backtester/Repositories/DividendYieldRepository.php`
- `includes/backtester/Repositories/SyncRepository.php`
- `includes/backtester/Services/BacktestService.php`
- `includes/backtester/Services/AnnualDividendAdjustment.php`
- `includes/backtester/Services/DividendAdjustment.php`
- `includes/backtester/Services/DividendYieldSyncService.php`
- `includes/backtester/Services/Logger.php`
- `includes/backtester/Services/RentalCashflowAdjustment.php`
- `includes/backtester/Services/TerAdjustment.php`
- `includes/backtester/Services/TaxAdjustment.php`
- `includes/backtester/Services/SummaryService.php`
- `includes/backtester/Services/SyncPolicy.php`
- `includes/backtester/Services/SyncService.php`
- `includes/backtester/Services/ValidationService.php`
- `includes/backtester/Tools/BtcUsdDailyPreparer.php`

## Datenbank und Synchronisation

- `sql/.htaccess`
- `sql/backtester/001_schema.sql`
- `sql/backtester/002_seed_assets.sql`
- `sql/backtester/003_indexes.sql`
- `sql/backtester/004_bitcoin_composite_source.sql`
- `sql/backtester/005_free_market_live_sources.sql`
- `sql/backtester/006_gold_gap_2026_08.sql`
- `sql/backtester/007_goldapi_forward_calibrated.sql`
- `sql/backtester/008_multpl_sp500_dividend_yields.sql`
- `sql/backtester/009_sp500_dividend_wording.sql`
- `sql/backtester/010_msci_world.sql`
- `sql/backtester/011_us_real_estate.sql`
- `sql/backtester/012_enable_msci_world_scraper.sql`
- `sql/backtester/019_automate_global_live_sources.sql`
- `cron/backtester/backfill-dividend-yields.php`
- `cron/backtester/backfill-history.php`
- `cron/backtester/import-prepared-csv.php`
- `cron/backtester/prepare-btcusd-daily.php`
- `cron/backtester/prepare-market-history.ps1`
- `cron/backtester/repair-gaps.php`
- `cron/backtester/update-daily.php`
- `scripts/prepare-msci-world-data.mjs`
- `logs/.gitkeep`
- `logs/.htaccess`
- `var/.htaccess`
- `var/import/.gitkeep`
- `var/import/ecb-usd-eur-msci.csv`
- `var/import/msci_world_monthly.csv`
- `var/import/msci_world_daily.csv`
- `var/import/msci_world.csv`
- `var/import/us_real_estate.csv`

## Tests

- `tests/.htaccess`
- `tests/preview-server.mjs`
- `tests/js/calculations.test.mjs`
- `tests/js/charts.test.mjs`
- `tests/js/msci-world-integration.test.mjs`
- `tests/backtester/Assertions.php`
- `tests/backtester/BtcUsdDailyPreparerTest.php`
- `tests/backtester/CalculationTest.php`
- `tests/backtester/DatabaseIntegrationTest.php`
- `tests/backtester/FeeTaxAdjustmentTest.php`
- `tests/backtester/ProviderParserTest.php`
- `tests/backtester/PreparedMarketCsvTest.php`
- `tests/backtester/RequestValidatorTest.php`
- `tests/backtester/RequestSecurityTest.php`
- `tests/backtester/run.php`
- `tests/backtester/SkippedTest.php`
- `tests/backtester/SummaryTest.php`
- `tests/backtester/SyncPolicyTest.php`
- `tests/backtester/TestFixtures.php`
- `tests/backtester/fixtures/alpha-vantage.csv`
- `tests/backtester/fixtures/coingecko.json`
- `tests/backtester/fixtures/ecb-usd-eur.csv`
- `tests/backtester/fixtures/fred-sp500.json`
- `tests/backtester/fixtures/import.csv`
- `tests/backtester/fixtures/goldapi.json`
- `tests/backtester/fixtures/multpl-dividend-yield.html`

## Dokumentation

- `docs/.htaccess`
- `docs/ARCHITECTURE.md`
- `docs/BITCOIN-CSV-IMPORT.md`
- `docs/CRON.md`
- `docs/MARKET-CSV-IMPORT.md`
- `docs/DEPLOYMENT-CHECKLIST.md`
- `docs/DIVIDEND-YIELD-SCRAPER.md`
- `docs/FILE-INVENTORY.md`
- `docs/OPERATOR-CONFIGURATION.md`
- `docs/REAL-ESTATE-AND-DAILY-SYNC.md`
- `docs/STRATO-DEPLOYMENT-IMMOBILIEN-2026-08-18.md`
- `docs/STRATO-DEPLOYMENT-TER-OPT-IN-2026-08-21.md`
- `docs/research/germany-house-price-index-2016-now.csv`
