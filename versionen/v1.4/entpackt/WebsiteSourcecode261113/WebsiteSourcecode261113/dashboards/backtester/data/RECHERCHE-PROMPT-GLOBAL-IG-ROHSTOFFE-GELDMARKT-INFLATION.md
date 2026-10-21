# Recherche- und Datenbeschaffungs-Prompt

## Global Investment Grade, Rohstoffe, Geldmarkt und Inflation

Kopiere den folgenden Prompt vollständig in eine KI mit Internetzugriff und Datei-Erstellung. Gib ihr – sofern möglich – zusätzlich den vorhandenen Ordner `data/` oder mindestens `data/README_DATA.md`, `data/source_manifest.csv` und `data/DATA_QUALITY_REPORT.md` als Kontext.

---

Du bist ein gründlicher Finanzdaten-Researcher und Data Engineer mit Internetzugriff. Recherchiere, beschaffe, bereinige, prüfe und dokumentiere kostenlose Daten für einen privaten Assetklassen-Backtester in EUR.

Arbeite bis zum fertigen Datenpaket. Liefere nicht nur Erklärungen, eine Linkliste oder Beispielzeilen, sondern tatsächlich verwendbare CSV-Dateien, die Rohdownloads, eine Quellenübersicht, einen Datenqualitätsbericht und am Ende ein ZIP-Archiv.

## 1. Auftrag und Grenzen

Beschaffe Daten für diese vier Bereiche:

1. globale Investment-Grade-Anleihen,
2. breit gestreute Rohstoffe,
3. Geldmarkt in der Eurozone und in den USA,
4. Inflation in Deutschland, im Euroraum und in den USA.

Zeitraum:

- Historische Ist-Daten: `2016-01-01` bis zum neuesten tatsächlich veröffentlichten Wert.
- Zukunftswerte: jährliche Prognosen oder ausdrücklich gekennzeichnete Szenarien bis einschließlich 2030.
- Verwende als Recherchedatum das tatsächliche Datum der Ausführung.
- Erfinde keine noch nicht veröffentlichten Beobachtungen.
- Historische Beobachtungen, notwendige Modellreihen, Proxys und Prognosen müssen klar getrennt bleiben.
- Dieses Arbeitspaket umfasst nur Datenbeschaffung und Datenaufbereitung. Implementiere noch nichts in PHP, JavaScript, SQL oder der Website.
- Nutze ausschließlich kostenlos und legal zugängliche Quellen. Umgehe keine Paywall, Anmeldung, robots.txt-Regel, Lizenzbeschränkung oder technische Zugriffssperre.
- API-Schlüssel und andere Geheimnisse dürfen weder in Dateien noch in Logs oder URLs des Ergebnisarchivs stehen.

Falls bereits ein Ordner `data/` mit älteren Anleihe- oder Rohstoffdateien vorliegt:

- prüfe die vorhandenen Dateien zuerst,
- bewahre funktionierende Rohdownloads auf,
- aktualisiere oder ergänze nur, was für diesen Auftrag nötig ist,
- überschreibe keine bessere Originalreihe mit einem schlechteren Proxy,
- dokumentiere jede ersetzte, fortgeführte oder verworfene Reihe.

## 2. Zentrale methodische Regeln

- Bei Anleihen ist eine Rendite beziehungsweise Yield keine erzielte Gesamtrendite. Für die Hauptreihe wird ein Total-Return-Index oder ein thesaurierender Fonds-/ETF-NAV benötigt.
- Bei Rohstoffen ist ein Spotpreis keine investierbare Gesamtrendite. Futures-Spot-, Excess-Return- und Total-Return-Indizes müssen getrennt bleiben. Rollrendite und Collateral Return dürfen nicht unterschlagen werden.
- Bei thesaurierenden Fonds, Adjusted-Close-Reihen oder Total-Return-Indizes dürfen Ausschüttungen nicht ein zweites Mal hinzugerechnet werden.
- Ein Geldmarktzins ist zunächst nur ein annualisierter Zinssatz. Eine Vermögensreihe darf daraus nur mit offengelegter täglicher Aufzinsungsformel erzeugt werden.
- Inflation ist keine Anlageklasse. Inflationsindizes dienen als Vergleichs- und Deflationsreihe und werden niemals zur Nominalrendite addiert.
- Für Realrenditen werden Preisindexstände benötigt, nicht nur veröffentlichte Vorjahresraten.
- Fehlende Börsentage, Wochenenden oder Monate nicht durch lineare Interpolation auffüllen.
- Keine Rückrechnung mit heutigem Wechselkurs. Für jeden historischen USD-Wert ist der historische EUR/USD-Referenzkurs desselben Tages oder der letzte vorherige verfügbare EZB-Handelstag zu verwenden.
- Keine nachträglich geglätteten Reihen und keine versteckten Kettenverknüpfungen.
- Ein Proxy bleibt in Dateiname, `asset_slug`, `data_kind`, Manifest und Qualitätsbericht als Proxy erkennbar.
- Ein modellierter Wert bleibt als `modeled` beziehungsweise in importfertigen Dateien als `quality_status=flagged` erkennbar.
- Direkte Prognosen einer Quelle niemals als historische Fakten ausgeben. Annahmen abseits des veröffentlichten Prognosehorizonts als `scenario`, nicht als `forecast`, kennzeichnen.

## 3. Quellenhierarchie

Nutze in dieser Reihenfolge:

1. offizielle Zentralbanken, Statistikämter, Indexanbieter und Fondsanbieter,
2. offizielle kostenlose APIs oder Downloads,
3. FRED nur als dokumentierter Verteiler einer klar benannten Primärquelle,
4. offizielle Fonds-NAVs oder Adjusted Close eines liquiden UCITS-ETF als gekennzeichneten Proxy,
5. andere seriöse Datenportale nur, wenn 1 bis 4 nicht ausreichen.

Jede Reihe benötigt mindestens eine Quelle für die Werte und eine Quelle für Definition beziehungsweise Methodik. Prüfe die Nutzungsbedingungen. Proprietäre Indexdaten dürfen nicht aus inoffiziellen Komplett-Dumps übernommen werden, wenn eine kostenlose Weiterverwendung nicht erlaubt ist.

## 4. Aufgabe A – globale Investment-Grade-Anleihen

### 4.1 Benötigte Hauptreihen

Beschaffe möglichst tägliche, andernfalls monatliche Daten für:

1. `global_ig_bonds_eur_hedged_total_return`
   - globaler Investment-Grade-Anleihe-Gesamtrenditeindex,
   - in EUR abgesichert,
   - Erträge reinvestiert,
   - bevorzugte Hauptreihe für einen Anleger im Euroraum.
2. `global_ig_bonds_unhedged_total_return`
   - dieselbe möglichst vergleichbare globale Investment-Grade-Abdeckung,
   - nicht währungsgesichert,
   - Originalwährung und zusätzlich sauber in EUR umgerechnet.
3. Begleitdaten, soweit kostenlos verfügbar:
   - Yield to Maturity,
   - Effective Duration,
   - durchschnittlicher Kupon,
   - durchschnittliche Laufzeit,
   - Option-Adjusted Spread,
   - Währungsabsicherungsstatus,
   - laufende Fondskosten bei einem ETF-Proxy.

Die Abdeckung soll Staatsanleihen, staatsnahe Emittenten, Investment-Grade-Unternehmensanleihen und verbriefte Anleihen umfassen. High Yield und reine Staatsanleiheindizes sind kein gleichwertiger Ersatz.

### 4.2 Zu prüfende Quellen und Proxys

Prüfe zuerst, ob eine vollständige, kostenlos nutzbare Total-Return-Historie eines globalen Aggregate- oder Broad-Market-Investment-Grade-Index verfügbar ist. Beispiele für die Definition der Anlageklasse sind Bloomberg Global Aggregate oder ein methodisch vergleichbarer globaler Aggregate-Index. Übernimm proprietäre Historien nur, wenn der konkrete kostenlose Zugriff und die private Nutzung zulässig sind.

Wenn die Originalindex-Historie nicht legal und kostenlos vollständig erhältlich ist, liefere stattdessen getrennte ETF-Proxys:

- EUR-hedged, accumulating: beispielsweise iShares Core Global Aggregate Bond UCITS ETF EUR Hedged (Acc), ISIN `IE00BDBRDM35`, oder ein nachweislich besserer vergleichbarer Proxy.
- Plausibilitätsvergleich: beispielsweise Vanguard Global Aggregate Bond UCITS ETF EUR Hedged Accumulating, ISIN `IE00BG47KH54`.
- Unhedged: eine wirklich globale Investment-Grade-Reihe beziehungsweise ein entsprechender UCITS-ETF; nicht stillschweigend einen Ex-US- oder reinen US-Aggregate-Fonds verwenden.

Für Fondsreihen gilt:

- offizieller täglicher NAV ist einem Börsenkurs vorzuziehen,
- bei fehlendem NAV darf Adjusted Close verwendet werden,
- gewöhnlicher Close plus separat reinvestierte Ausschüttungen nur, wenn Adjusted Close nicht verfügbar ist,
- Kosten und Tracking Difference gehören zum Fonds-Proxy und dürfen nicht wieder abgezogen werden, wenn sie bereits im NAV stecken,
- keine Daten vor Fondsauflage erfinden,
- eine Lücke 2016 bis Fondsauflage offen lassen, wenn keine rechtlich und methodisch belastbare Originalreihe existiert,
- verschiedene Fonds oder Indizes nur in einer zusätzlichen, ausdrücklich dokumentierten verketteten Reihe verbinden.

### 4.3 Zukunft bis 2030

Suche direkte, seriöse Kapitalmarktannahmen für globale Investment-Grade-Anleihen. Erfasse Quelle, Veröffentlichungsdatum, Horizont, Währung und Absicherungsstatus.

Wenn keine Jahresprognosen bis 2030 vorliegen, erstelle zusätzlich konservatives, Basis- und optimistisches Szenario. Verwende transparent:

- aktuelle Yield to Maturity als Carry-Ausgangspunkt,
- Duration und angenommene Zinsänderung,
- Roll-down,
- erwartete Kreditausfälle und Recovery,
- Spreadänderung,
- Fondskosten bei einem Proxy,
- Kosten beziehungsweise Effekt der EUR-Währungsabsicherung.

Nutze eine dokumentierte Näherung wie:

`expected_total_return ≈ carry + roll_down - duration * yield_change - credit_loss - fees + hedge_effect`

Eine solche Reihe ist `scenario`, nicht `forecast` und nicht `observed`.

## 5. Aufgabe B – breit gestreute Rohstoffe

### 5.1 Benötigte Hauptreihen

Beschaffe:

1. `broad_commodities_total_return_usd`
   - breit diversifizierter Rohstoff-Futures-Total-Return-Index,
   - enthält Spot-/Futures-Preisänderung, Rollrendite und Collateral Return.
2. `broad_commodities_total_return_eur`
   - dieselbe Reihe aus Sicht eines nicht währungsgesicherten EUR-Anlegers,
   - mit historischen täglichen oder monatlichen EZB-Wechselkursen umgerechnet und auf 100 rebasiert.
3. `broad_commodities_spot_reference_monthly`
   - reine Spot-/Referenzpreisreihe nur zur Analyse und Plausibilisierung,
   - nicht als investierbare Gesamtrendite ausgeben.
4. Sektor-Unterindizes, falls kostenlos konsistent verfügbar:
   - Energie,
   - Industriemetalle,
   - Edelmetalle ohne die bereits separat vorhandene Gold-Hauptreihe,
   - Landwirtschaft,
   - Vieh beziehungsweise Soft Commodities.

### 5.2 Zu prüfende Quellen

- World Bank Commodity Price Data, „Pink Sheet“, für monatliche Spot-/Referenzpreise und offizielle Rohstoffgruppen.
- S&P Dow Jones Indices für methodisch getrennte Spot-, Excess-Return- und Total-Return-Varianten, beispielsweise Dow Jones Commodity Index oder S&P GSCI. Nutze exportierte Indexstände nur, wenn der kostenlose Zugriff und die Nutzung zulässig sind.
- Bloomberg Commodity Index nur, wenn die verwendete Historie legal kostenlos zugänglich ist.
- Falls eine vollständige Indexhistorie nicht kostenlos erhältlich ist: thesaurierender, breit gestreuter UCITS-Rohstoff-ETF/ETC als klar benannter Proxy. Prüfe Indexmethodik, Swap-/Futures-Struktur, Kosten, Währungsrisiko und Auflagedatum.

Bevorzuge für den Backtester genau eine breite Hauptreihe. Einzelrohstoffe und World-Bank-Spotpreise sind Zusatzdaten und dürfen nicht zu einem selbst gewichteten „Marktindex“ vermischt werden, sofern keine belastbare, vorab festgelegte Indexmethodik existiert.

### 5.3 Zukunft bis 2030

- Nutze offizielle World-Bank-Commodity-Markets-Outlook-Werte innerhalb ihres tatsächlichen Prognosehorizonts.
- Erfasse direkte Index- oder Anbieterprognosen nur mit genauer Quelle und Definition.
- Nach Ende eines offiziellen Prognosehorizonts nur konservative, Basis- und optimistische Szenarien ausgeben.
- Preise einzelner Rohstoffe nicht ungeprüft in eine erwartete Total Return des Futures-Index umdeuten.
- Bei Szenarien Rollrendite, Collateral Return, USD/EUR-Effekt und Kosten getrennt ausweisen.

## 6. Aufgabe C – Geldmarkt Eurozone und USA

### 6.1 Euro-Geldmarkt

Beschaffe die offiziellen täglichen Reihen:

- EONIA für den historischen Abschnitt ab 2016,
- €STR ab dem offiziellen Beginn,
- den offiziellen compounded €STR index, soweit verfügbar,
- ECB Deposit Facility Rate nur als Kontroll- beziehungsweise Begleitreihe, nicht als identische Anleger-Rendite,
- optional 3-Monats-Euribor als zusätzliche Marktreferenz, nicht als Hauptvermögensreihe.

Zu prüfende offizielle ECB-Reihen:

- €STR: `EST.B.EU000A2X2A25.WT`
- Compounded €STR index: exakten aktuellen Series Key aus dem ECB-Katalog ermitteln und dokumentieren.
- EONIA: ECB-Dataset `EON`; exakten Series Key über den aktuellen Katalog bestimmen.
- Deposit Facility Rate Level: `FM.D.U2.EUR.4F.KR.DFR.LEV`

Erzeuge als notwendige Modellreihe:

- `euro_money_market_total_return_daily`
- Startwert 100 am ersten vorhandenen Datum,
- EONIA bis zum dokumentierten Übergang, danach €STR,
- keine doppelten Beobachtungen im Übergangszeitraum,
- ACT/360-Aufzinsung,
- negative Zinssätze müssen den Index korrekt reduzieren,
- Wochenendtage nicht als künstliche Rohbeobachtungen einfügen; die Anzahl der Kalendertage bis zum nächsten Geschäftstag geht nur in den Aufzinsungsfaktor ein.

Dokumentiere die Formel:

`index_next = index_t * (1 + rate_t / 100 * calendar_days / 360)`

Kennzeichne die verkettete Vermögensreihe als `modeled`, weil sie aus offiziellen Zinssätzen berechnet wird.

### 6.2 US-Geldmarkt

Beschaffe die offiziellen täglichen Reihen:

- Effective Federal Funds Rate (EFFR) ab 2016,
- SOFR ab `2018-04-02`,
- offiziellen SOFR Index,
- 3-Month Treasury Bill Secondary Market Rate nur als Kontroll-/Alternativreihe.

Primärquellen:

- Federal Reserve Bank of New York für SOFR, SOFR Averages und SOFR Index,
- Federal Reserve Board H.15 oder FRED mit klarer Federal-Reserve-Primärquelle für EFFR und Treasury Bills.

Erzeuge:

1. `us_money_market_total_return_usd_daily`
   - EFFR bis zum dokumentierten Übergang,
   - danach SOFR,
   - ACT/360,
   - Startwert 100,
   - als `modeled` kennzeichnen.
2. `us_money_market_total_return_eur_daily`
   - dieselbe nicht abgesicherte USD-Vermögensreihe aus Sicht eines EUR-Anlegers,
   - historische tägliche EZB-USD/EUR-Kurse,
   - auf 100 am gemeinsamen Startdatum rebasiert.
3. `sofr_index_official_daily`
   - unveränderte offizielle Kontrollreihe ab ihrem tatsächlichen Beginn.

Der Wechsel von EFFR zu SOFR ist ein Methodenwechsel. Dokumentiere ihn und gib zusätzlich die beiden unverknüpften Rohreihen aus.

### 6.3 Geldmarkt-Zukunft bis 2030

- USA: Prüfe die jeweils neueste FOMC Summary of Economic Projections für den Federal-Funds-Pfad. Median, Central Tendency und Range getrennt speichern.
- Eurozone: Prüfe ECB-/Eurosystem-Projektionen sowie frei verfügbare offizielle Kurzfristzinsannahmen. Die ECB veröffentlicht nicht zwingend einen eigenen Leitzinspfad; erfinde keinen.
- IMF-WEO- oder OECD-Annahmen zu kurzfristigen Marktzinsen dürfen ergänzend verwendet werden, müssen aber als Annahme der jeweiligen Institution gekennzeichnet sein.
- Fehlende Jahre bis 2030 nur als Szenario fortschreiben, nicht als offizielle Prognose.
- Aus einem erwarteten Jahreszins darf nur in einer separat modellierten Zukunftsreihe ein erwarteter Vermögenszuwachs berechnet werden.

## 7. Aufgabe D – Inflation

### 7.1 Historische Preisindizes

Beschaffe monatliche, nicht saisonbereinigte Gesamtpreisindizes:

1. `inflation_germany_hicp_monthly`
2. `inflation_euro_area_hicp_monthly`
3. `inflation_us_cpi_u_monthly`

Quellen:

- Eurostat HICP für Deutschland und Euroraum. Prüfe die seit 2026 gültige aktuelle HICP-Datenstruktur und den aktuellen All-Items-Code; verlasse dich nicht blind auf einen veralteten Dataset- oder COICOP-Code. Nutze den vollständigen konsistenten Index ab 2016.
- U.S. Bureau of Labor Statistics, CPI-U, U.S. city average, All items, not seasonally adjusted, Series ID `CUUR0000SA0`.

Zusätzlich dürfen jährliche Inflationsraten ausgegeben werden, aber die Hauptdateien müssen Indexstände enthalten. Speichere Referenzmonat, Indexbasis und Revisionsflag. Bei einem Basisjahrwechsel entweder die offizielle rückgerechnete konsistente Reihe verwenden oder eine Kettenverknüpfung vollständig dokumentieren.

### 7.2 Zukunft bis 2030

Beschaffe getrennt:

- Deutschland: offizielle nationale, EU-, IMF- oder OECD-Prognose,
- Euroraum: neueste ECB-/Eurosystem-HICP-Projektion,
- USA: CPI-Prognosen aus offizieller oder institutioneller Quelle; FOMC-PCE-Projektionen nur als eigene Messgröße `PCE`, niemals still als CPI bezeichnen,
- ergänzend IMF WEO bis zum tatsächlich verfügbaren Horizont.

Für 2029 oder 2030 fehlende Werte nur als transparente Szenarien fortführen. Zentralbankziele beziehungsweise „longer run“-Werte sind keine punktgenauen Jahresprognosen und müssen entsprechend bezeichnet werden.

### 7.3 Reale Rendite

Erzeuge keine künstliche tägliche Inflationsbeobachtung. Dokumentiere für die spätere Berechnung:

`real_growth_factor = nominal_growth_factor / inflation_index_factor`

und damit:

`real_return = real_growth_factor - 1`

Für den in EUR geführten Backtester soll standardmäßig der deutsche HICP als persönliche EUR-Kaufkraftreferenz vorbereitet werden. Der Euroraum-HICP und US-CPI bleiben auswählbare Vergleichsreihen.

## 8. Historische Wechselkurse

Beschaffe beziehungsweise aktualisiere den offiziellen täglichen EZB-Referenzkurs USD je EUR.

Regeln:

- Wenn `usd_per_eur` die Zahl der USD pro EUR bezeichnet, dann gilt `eur_value = usd_value / usd_per_eur`.
- An einem Tag ohne FX-Fixing darf nur der letzte vorherige verfügbare EZB-Kurs verwendet werden.
- Speichere zusätzlich `fx_observation_date`.
- Rebase Vergleichsindizes erst nach der Währungsumrechnung.
- Eine EUR-notierte Börsennotierung ist nicht automatisch EUR-währungsgesichert.

## 9. Ausgabestruktur

Erstelle diesen Ordner:

`asset-data-global-ig-commodities-cash-inflation-2016-2030/`

mit:

```text
raw/
clean/
prepared_import/
forecasts/
notes/
README_DATA.md
DATA_QUALITY_REPORT.md
source_manifest.csv
download_log.csv
```

### 9.1 Importfertige CSVs

Erstelle, soweit durch echte Daten oder ausdrücklich notwendige Modellierung möglich:

```text
prepared_import/global_ig_bonds_eur_hedged.csv
prepared_import/global_ig_bonds_unhedged_eur.csv
prepared_import/broad_commodities_total_return_eur.csv
prepared_import/euro_money_market.csv
prepared_import/us_money_market_eur.csv
prepared_import/inflation_germany.csv
prepared_import/inflation_euro_area.csv
prepared_import/inflation_us.csv
```

Jede importfertige Datei hat exakt diese Spalten:

```csv
date,value,currency,quality_status,source_revision,source_timestamp
```

Regeln:

- UTF-8,
- Komma als Trennzeichen,
- Punkt als Dezimalzeichen,
- ISO-Datum `YYYY-MM-DD`,
- aufsteigend sortiert,
- keine Tausendertrennzeichen,
- keine Formeln,
- keine leeren Werte, `NaN`, `null` oder Duplikate,
- `currency` ist `PTS` für Indexstände, ansonsten die echte Rohwährung,
- `quality_status` darf nur `valid`, `provisional`, `revised` oder `flagged` sein,
- notwendige Modell-/Proxyreihen erhalten `flagged`, sofern keine echte veröffentlichte Total-Return-Beobachtung vorliegt,
- `source_timestamp` ist UTC im ISO-8601-Format.

Bei einer USD-Ursprungsreihe, die für den Backtester bereits in EUR umgerechnet wurde, muss die reichhaltige Datei in `clean/` zusätzlich enthalten:

- `raw_usd_value`,
- `eur_value`,
- `usd_per_eur`,
- `fx_observation_date`.

### 9.2 Reichhaltige Clean-Dateien

Die Dateien in `clean/` dürfen zusätzliche Spalten enthalten:

```text
asset_slug
date
reference_period
release_date
value
currency
unit
frequency
data_kind
provider
dataset
series_id
quality_status
source_revision
source_timestamp
methodology
proxy_for
```

Zulässige Werte für `data_kind`:

- `observed`
- `total_return_index`
- `fund_nav_proxy`
- `adjusted_close_proxy`
- `modeled`
- `forecast`
- `scenario`

Monatswerte erhalten in der importfertigen Datei den letzten Kalendertag des Referenzmonats, Quartalswerte das tatsächliche Quartalsende. In der reichhaltigen Datei müssen Referenzperiode und Veröffentlichungsdatum getrennt bleiben, damit kein Look-ahead verschleiert wird.

### 9.3 Prognosedatei

Erstelle:

`forecasts/forecasts_2026_2030.csv`

mit mindestens:

```csv
asset_slug,year,metric,conservative,base,optimistic,unit,data_kind,as_of_date,source_name,source_url,methodology
```

Direkte veröffentlichte Werte dürfen in `base` stehen, wenn `data_kind=forecast` gesetzt ist. Selbst abgeleitete Bandbreiten oder fortgeschriebene Jahre sind `data_kind=scenario`. Vermische beides nicht.

### 9.4 Quellenmanifest

`source_manifest.csv` enthält mindestens:

```csv
file_name,asset_slug,provider,dataset,series_id,source_url,download_url,frequency,currency,unit,coverage_start,coverage_end,retrieved_at,license_note,data_kind,transformation,update_frequency,expected_release_lag
```

Jede erzeugte Datenreihe benötigt einen Manifest-Eintrag. Verlinke direkt auf die Daten- und Methodikseite, nicht nur auf eine Suchmaschine.

### 9.5 Rohdaten und Download-Log

- Speichere unveränderte Originaldownloads in `raw/`.
- Berechne SHA-256 für jede Rohdatei.
- `download_log.csv` enthält URL, HTTP-Status, Abrufzeit, Dateigröße, MIME-Type und SHA-256.
- Fehlgeschlagene Downloads nicht als leere oder scheinbar erfolgreiche CSV speichern.
- HTML-Fehlerseiten, Login-Seiten und Rate-Limit-Antworten erkennen und dokumentieren.

## 10. Qualitätsprüfung

Führe für jede Reihe mindestens diese Prüfungen aus:

1. frühestes und spätestes Datum,
2. Zeilenanzahl,
3. doppelte Daten,
4. unsortierte Daten,
5. fehlende oder nicht numerische Werte,
6. ungültige Währung oder Einheit,
7. unerwartete Wochenendwerte bei Börsen-/Geschäftstagesreihen,
8. extreme Tages- oder Monatsänderungen,
9. mindestens fünf Stichproben gegen die Primärquelle,
10. korrekte Währungsumrechnung an mindestens fünf Daten,
11. korrekte Aufzinsung der Geldmarktreihen über normale Tage und ein Wochenende,
12. keine doppelte Ertragsanrechnung bei Total Return, NAV oder Adjusted Close,
13. keine Prognosezeile in einer historischen Importdatei,
14. keine Reihe vor dem Startdatum ihres Indexes oder Fondses,
15. exakte Kennzeichnung jeder verketteten, modellierten oder Proxy-Reihe.

Der Qualitätsbericht muss außerdem klar beantworten:

- Welche Hauptreihen sind echte veröffentlichte Total-Return-Indizes?
- Welche sind Fonds-/ETF-Proxys?
- Welche sind zwingend modelliert?
- Wo fehlen Daten zwischen 2016 und dem aktuellen Datum?
- Welche Reihen dürfen später automatisiert kostenlos aktualisiert werden?
- Über welchen API-/Download-Endpunkt und in welchem sinnvollen Intervall?
- Welche Quelle kann Revisionen vornehmen und wie groß sollte das Revision-Lookback sein?
- Welche Daten dürfen aus Lizenzgründen nur privat verwendet oder nicht öffentlich weiterverteilt werden?

## 11. Mindestquellen, die geprüft werden müssen

- ECB Data Portal – €STR/EONIA/Zinsen und USD/EUR:
  `https://data.ecb.europa.eu/`
- ECB €STR-Datensatz:
  `https://data.ecb.europa.eu/data/datasets/EST`
- Federal Reserve Bank of New York – SOFR und SOFR Index:
  `https://www.newyorkfed.org/markets/reference-rates`
- Federal Reserve Board H.15:
  `https://www.federalreserve.gov/releases/h15/`
- BLS Public Data API und CPI-Seriendefinition:
  `https://www.bls.gov/developers/`
  `https://www.bls.gov/cpi/factsheets/cpi-series-ids.htm`
- Eurostat HICP und API-Dokumentation:
  `https://ec.europa.eu/eurostat/web/hicp/information-data`
  `https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/`
- World Bank Commodity Markets/Pink Sheet:
  `https://www.worldbank.org/en/research/commodity-markets`
- S&P Dow Jones Commodity Indices und Methodik:
  `https://www.spglobal.com/spdji/en/index-family/commodities/`
- Offizielle Produktseiten geeigneter Global-Aggregate-UCITS-ETFs bei iShares oder Vanguard.
- Neueste ECB-/Eurosystem-Projektionen, FOMC Summary of Economic Projections und IMF World Economic Outlook für Zukunftswerte.

## 12. Abschlusslieferung

Liefere am Ende:

1. den vollständigen Ergebnisordner,
2. ein ZIP-Archiv dieses Ordners,
3. eine kurze Liste aller erzeugten Dateien,
4. eine Tabelle je Hauptreihe mit Quelle, Zeitraum, Frequenz, Währung, Datenart und Zeilenanzahl,
5. eine klare Liste aller Lücken und Proxys,
6. eine Empfehlung, welche genau fünf bis acht Reihen später in den Backtester übernommen werden sollten,
7. eine Liste der kostenlosen Update-Endpunkte und realistischen Aktualisierungszeitpunkte,
8. eine Bestätigung, dass keine historischen Beobachtungen mit Prognosen vermischt wurden.

Frage nicht nach kostenpflichtigen Zugangsdaten. Wenn eine Originalreihe nicht kostenlos erhältlich ist, dokumentiere das sauber und liefere den besten legalen Proxy, ohne ihn als Originalindex auszugeben.

---

## Was anschließend zurückgegeben werden soll

Für die spätere Einbindung in diesen Backtester werden mindestens diese Dinge benötigt:

- das erzeugte ZIP-Archiv,
- der entpackte Ordner mit `prepared_import/`, `clean/`, `raw/` und `forecasts/`,
- `source_manifest.csv`,
- `README_DATA.md`,
- `DATA_QUALITY_REPORT.md`.

Keine API-Schlüssel, Passwörter oder persönlichen Zugangsdaten mitsenden.
