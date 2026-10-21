# Assetklassen-Backtester

Produktionsnaher Assetklassen-Backtester für `smstark-projekt.de`: Aktienindizes, Bitcoin, Gold, deutsche und US-Wohnimmobilien, globale Investment-Grade-Anleihen, breite Rohstoffe sowie Euro- und US-Geldmarkt werden über denselben Kalenderzeitraum und dasselbe Startkapital verglichen. Deutschland, Euroraum, USA oder eine eigene Jahresrate können die Vergleichswerte zusätzlich in reale Kaufkraft umrechnen. Die öffentliche Seite liest ausschließlich aus der eigenen MySQL-/MariaDB-Datenbank.

Die Anwendung enthält keine erfundenen Kurse. Laufende Werte kommen über FRED (`SP500`), GoldAPI (`XAU/USD`), CoinGecko (`BTC/EUR`), die EZB (`USD/EUR`) und für US-Immobilien über die offizielle FRED-API der FHFA-Reihe `HPIPONM226S`. Die zusätzlichen Anleihen-, Rohstoff-, Geldmarkt- und Inflationshistorien werden aus den kontrollierten Dateien in `var/import` übernommen. Der einstellbare Netto-Mietcashflow wird ausschließlich in den beiden Immobilien-Einzelverläufen addiert und verändert den Preisindex nicht.

## Dateistruktur

Die kontrollierten CSV-Dateien bleiben die historische Basis. Fuer globale IG-Anleihen,
breite Rohstoffe, Euro- und US-Geldmarkt sowie Deutschland-, Euroraum- und
US-Inflation ergaenzt der taegliche Job danach nur neue oder revidierte Livewerte.
Die amtlichen Geldmarkt- und Inflationsquellen benoetigen keine zusaetzlichen API-Keys.

```text
index.html                         öffentliche Oberfläche
assets/css/                        gekapseltes Website-Design
assets/js/asset-backtester/        API-, Zustand-, Chart- und Formatlogik
assets/vendor/                     Chart.js 4.4.1 plus Lizenz
api/backtester/                    Assets, Summary, Series, Status, Stale-Sync
includes/backtester/               PHP-Domain, Provider, Repository und Services
cron/backtester/                   Backfill, Daily Update und Gap Repair
sql/backtester/                    versionierte SQL-Migrationen
config/                            Beispielkonfiguration; echte Config ignoriert
tests/backtester/                  deterministischer PHP-Test-Runner und Fixtures
tests/js/                          Browserlogik-Tests mit Node
docs/                              Architektur, Betrieb und Deployment
```

Das vollständige Einzeldatei-Inventar steht in `docs/FILE-INVENTORY.md`.

## Voraussetzungen

- PHP 8.1+
- MySQL 8 oder MariaDB 10.5+
- PDO MySQL, cURL, JSON und mbstring
- Cronjob im Hosting-Panel oder SSH/CLI
- optional Node.js nur für die Browserlogik-Tests; im Produktivbetrieb nicht nötig

## Installation

1. In phpMyAdmin nacheinander importieren:
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
   - `sql/backtester/012_enable_msci_world_scraper.sql` nur nach Rechteklärung
   - `sql/backtester/013_us_real_estate_fred_api.sql`
   - `sql/backtester/014_european_assets.sql`
   - `sql/backtester/015_automate_european_assets.sql`
   - `sql/backtester/016_global_assets_and_inflation.sql`
   - `sql/backtester/017_global_ig_bonds_ten_year_history.sql`
   - `sql/backtester/018_default_comparison_assets.sql`
   - `sql/backtester/019_automate_global_live_sources.sql`
2. `config/backtester.example.php` nach `config/backtester.php` kopieren.
3. Datenbankwerte, Provider-Keys, erlaubte Origin und Cron-Secret eintragen. Alternativ die Variablen aus `.env.example` über das Hosting setzen.
4. Den FRED-Key und den GoldAPI-Key als reine serverseitige Schlüssel eintragen.
5. Die bereits vorbereiteten historischen CSV-Reihen importieren beziehungsweise ihren vorhandenen Datenbankstand prüfen.
6. S&P 500 und Gold einzeln live testen, anschließend Daily- und Gap-Repair-Cron freigeben.

## API

Bei Upload des gesamten Ordners nach `/dashboards/backtester` liegen die Endpunkte unter:

```text
GET  /dashboards/backtester/api/backtester/assets.php
GET  /dashboards/backtester/api/backtester/summary.php
GET  /dashboards/backtester/api/backtester/series.php?assets=sp500,bitcoin,gold,msci_world,de_real_estate&start=2016-08-20&end=2026-08-20&amount=10000&netRentPct=0&deNetRentPct=0&includeRentalCashflow=0&inflation=inflation_de
GET  /dashboards/backtester/api/backtester/status.php
POST /dashboards/backtester/api/backtester/sync-if-stale.php
```

`series.php` akzeptiert nur aktive Slugs aus der Datenbank, höchstens die konfigurierte Assetanzahl, ISO-Daten, Start vor Ende, ein Enddatum höchstens am aktuellen Kalendertag, begrenzte Laufzeit und einen Betrag zwischen 100 € und 10 Mio. €. Antworten nutzen ein konsistentes JSON-Fehlerformat und enthalten keine Stacktraces.

## Kennzahlen

Die API berechnet für den gewählten Zeitraum:

- Endwert, absoluter Gewinn oder Verlust, Gesamtrendite und CAGR
- maximalen Drawdown
- annualisierte Volatilität
- Sharpe-Wert bei 0 % risikofreiem Zins und Calmar-Verhältnis
- besten und schwächsten Tag mit Datum
- Anteil positiver Tage und Zahl ausgewerteter Tagesänderungen

Volatilität und Beobachtungskennzahlen verwenden nur echte aufeinanderfolgende Beobachtungen. Fortgeschriebene Werte zählen nicht als zusätzliche Nullrenditen. Aktienindizes und Gold werden mit 252 Börsentagen, Bitcoin mit 365,2425 Kalendertagen, der monatliche FHFA-Index mit 12 und der quartalsweise Eurostat-Index mit 4 Perioden annualisiert.

## Provider

- `Sp500Provider` lädt die FRED-Reihe `SP500`; `GoldProvider` lädt tägliche `XAU/USD`-Werte über GoldAPI.io.
- `MultplDividendYieldProvider` liest die HTML-Tabelle mit der monatlichen annualisierten S&P-500-Dividendenrendite. Vorläufige Angaben bleiben gekennzeichnet; ein späterer Monatswert revidiert dieselbe Monatszeile.
- `GoldApiProvider` verwendet den historischen GoldAPI-Endpunkt pro abgeschlossenem Handelstag und den Header `x-access-token`; der Key wird nicht an die URL angehängt.
- `EcbExchangeRateProvider` lädt `EXR.D.USD.EUR.SP00.A`. `UsdToEurConverter` verwendet den Kurs desselben Tages oder den letzten zuvor veröffentlichten EZB-Wert und speichert Rohwert, EUR-Wert, Faktor und Wechselkurstag getrennt.
- `BitcoinProvider` nutzt CoinGecko `coins/{id}/market_chart/range`, `BTC/EUR`, tägliche Granularität und die letzte gelieferte Beobachtung je UTC-Tag.
- `CsvImportProvider` liest kontrollierte lokale Dateien aus `var/import/<asset-slug>.csv`. Pflichtspalten: `date,value`; optional `currency,quality_status,source_revision,source_timestamp`.
- `dax.csv` und `eurostoxx50.csv` enthalten die einmalige Preisindexhistorie; `YahooIndexProvider` ergänzt danach nur das überlappende jüngste Zeitfenster. Die getrennte Dividendenrechnung wird am 31.12. angewendet.
- `de_real_estate.csv` enthält die einmalige Historie des gesamten deutschen Wohnimmobilienmarkts. `EurostatHousePriceProvider` prüft danach die amtliche Reihe `prc_hpi_q`, `DE`, `TOTAL`, `I15_Q` auf neue oder revidierte Quartale.
- Globale IG-Anleihen, breite Rohstoffe, Euro- und US-Geldmarkt sowie die drei Inflationsindizes liegen als geprüfte Importdateien unter `var/import`. Die Anleihenhistorien beginnen erst am tatsächlichen Fondsstart am 21.11.2017.
- `UsRealEstateProvider` lädt die monatliche, saisonbereinigte FHFA-Reihe `HPIPONM226S` über den bereits für den S&P 500 konfigurierten FRED-Zugang und prüft einen Revisionszeitraum erneut.
- `MsciWorldProvider` ist ein deaktivierter, eng begrenzter Abruf für den exakten MSCI-World-USD-Preisindex `^990100-USD-STRD`; Aktivierung erst nach Rechteklärung.
- `prepare-msci-world-data.mjs` konvertiert die beiden binären MSCI-World-XLS-Exporte, verbindet Monats- und Tageswerte und rechnet sie mit datierten EZB-Kursen in EUR um.
- `prepare-btcusd-daily.php` verdichtet eine lokale BTC/USD-Minutenhistorie auf den letzten gültigen Schlusskurs je UTC-Tag und rechnet sie mit historischen EZB-USD/EUR-Referenzkursen in Euro um. Methodik und Attribution stehen in `docs/BITCOIN-CSV-IMPORT.md`.
- `prepare-market-history.ps1` bleibt der Aufbereiter für die kontrollierte historische Gold-Importquelle; zukünftige Werte werden über GoldAPI XAU/USD geladen und mit dem fixierten Referenzverhältnis in die bestehende Reihe überführt.

Providerantworten werden in `HistoricalObservation` normalisiert, validiert und idempotent upsertet. Nicht-EUR-Rohreihen werden nur mit einer datierten historischen FX-Umrechnung gespeichert; eine heutige Pauschalumrechnung findet nie statt.

## Backfill und Cron

`YahooFundProvider` setzt EUNA.DE, AGGG.L und AIGC.L mit adjustierten Schlusswerten
ab dem festen Importanschluss fort. `EcbCompoundedIndexProvider` und
`NyFedSofrIndexProvider` setzen die beiden Geldmarktreihen mit den offiziellen
EURSTR- und SOFR-Indizes fort. `EurostatInflationProvider` und
`BlsInflationProvider` liefern ausschliesslich echte Monatsbeobachtungen.

```bash
php cron/backtester/backfill-history.php --asset=bitcoin --from=2013-04-28
php cron/backtester/backfill-history.php --asset=sp500 --from=2005-01-01
php cron/backtester/backfill-history.php --asset=gold --from=2016-08-02
php cron/backtester/import-prepared-csv.php --asset=bitcoin --from=2016-08-02 --to=2026-08-02
php cron/backtester/import-prepared-csv.php --asset=sp500 --from=2016-08-02 --to=2026-08-02
php cron/backtester/import-prepared-csv.php --asset=gold --from=2016-08-02 --to=2026-08-02
php cron/backtester/import-prepared-csv.php --asset=msci_world --from=2016-07-31 --to=2026-08-14
php cron/backtester/import-prepared-csv.php --asset=us_real_estate --from=2016-01-01 --to=2026-05-01
php cron/backtester/import-prepared-csv.php --asset=dax --from=2016-01-04 --to=2026-08-20
php cron/backtester/import-prepared-csv.php --asset=eurostoxx50 --from=2016-01-04 --to=2026-08-20
php cron/backtester/import-prepared-csv.php --asset=de_real_estate --from=2016-03-31 --to=2026-03-31
php cron/backtester/import-prepared-csv.php --asset=global_ig_bonds --from=2016-01-04 --to=2026-08-20
php cron/backtester/import-prepared-csv.php --asset=global_ig_bonds_unhedged --from=2016-01-04 --to=2026-08-20
php cron/backtester/import-prepared-csv.php --asset=commodities --from=2016-01-04 --to=2026-08-20
php cron/backtester/import-prepared-csv.php --asset=euro_money_market --from=2016-01-04 --to=2026-08-19
php cron/backtester/import-prepared-csv.php --asset=us_money_market --from=2016-01-04 --to=2026-08-19
php cron/backtester/import-prepared-csv.php --asset=inflation_de --from=2016-01-31 --to=2026-07-31
php cron/backtester/import-prepared-csv.php --asset=inflation_euro_area --from=2016-01-31 --to=2026-07-31
php cron/backtester/import-prepared-csv.php --asset=inflation_us --from=2016-01-31 --to=2026-07-31
php cron/backtester/update-daily.php
php cron/backtester/repair-gaps.php
php cron/backtester/backfill-dividend-yields.php --from=2016-07-01
```

Ausführliche CLI-/URL-Cron-Beispiele stehen in `docs/CRON.md`.

## Tests

PHP-Kernlogik und Parser:

```bash
php tests/backtester/run.php
```

Browserlogik:

```bash
npm test
```

Die Tests sind internetunabhängig. Der MySQL-Test für Duplicate Upsert, Revision und Lock-Race wird nur mit einer ausdrücklich gesetzten separaten Testkonfiguration ausgeführt:

```bash
BACKTESTER_TEST_CONFIG=/sicherer/pfad/test-config.php php tests/backtester/run.php
```

## Betrieb und Fehlerdiagnose

- Nutzer sehen bei Syncfehlern weiterhin die zuletzt gespeicherten Daten.
- Technische Fehler stehen in `logs/backtester.log`; API-Keys werden aus strukturiertem Kontext entfernt.
- `status.php` zeigt nur nutzergeeignete Zustände.
- Leere Providerantworten sind Fehler und werden nie als erfolgreicher Sync markiert.
- Nach Fehlschlägen wächst der Backoff exponentiell bis zum konfigurierten Maximum.
- Stale-Sync beim Seitenbesuch ist same-origin, rate-limitiert, akzeptiert keine Symbole/URLs und ersetzt keinen Cronjob.

## Methodische Grenzen

Die Preisindizes bleiben in Anzeige und Daten unverändert. Beim S&P 500 wird die monatliche Dividendenrendite zeitanteilig aufgezinst; bei MSCI World, DAX und EURO STOXX 50 wird die Jahresdividendenrendite am 31.12. reinvestiert. Der historische EURO-STOXX-50-Nettofaktor ist aus einem thesaurierenden ETF-Proxy abgeleitet und kein offizieller SX5T-Verlauf. Für Immobilien bleiben die amtlichen Preisindizes unverändert. Der je Land eingegebene Netto-Mietcashflow wird nur im Einzelverlauf linear auf das Startkapital gerechnet, als Cash gehalten und nicht wiederangelegt. Reale Renditen teilen den nominalen Vergleichswert durch die Veränderung des gewählten Preisindex seit dem Starttag. Persönliche Steuern, Finanzierung, Transaktionskosten, Sparpläne und Rebalancing werden nicht zusätzlich modelliert.

Vergangene Wertentwicklung ist kein verlässlicher Indikator für zukünftige Ergebnisse.

## Deployment

Die Aktivierung der laufenden Abrufe fuer die acht globalen Reihen steht in
`docs/STRATO-DEPLOYMENT-GLOBAL-LIVE-2026-08-20.md`.

Die vollständige FileZilla-/phpMyAdmin-/Abnahmefolge steht in `docs/DEPLOYMENT-CHECKLIST.md`. Die Anwendung ist für klassisches Shared Hosting gebaut und benötigt weder Node.js noch ein Buildsystem im Produktivbetrieb.

Die genaue Multpl-Backfill- und Monatsanleitung steht in `docs/DIVIDEND-YIELD-SCRAPER.md`.

Die MSCI-World-Konvertierung und die genaue STRATO-Importfolge stehen in `docs/MSCI-WORLD-IMPORT.md`.

Die Immobilienquellen, Cashflow-Methode, Deutschland-Recherche und der 13-Uhr-Betrieb stehen in `docs/REAL-ESTATE-AND-DAILY-SYNC.md`.

Die genaue Upload-, SQL- und Importfolge für DAX, EURO STOXX 50 und Immobilien DE steht in `docs/STRATO-DEPLOYMENT-EUROPE-2026-08-20.md`.

Die genaue Upload-, SQL- und Importfolge für globale Anleihen, Rohstoffe, Geldmärkte und Inflation steht in `docs/STRATO-DEPLOYMENT-GLOBAL-ASSETS-2026-08-20.md`.
