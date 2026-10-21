# Offene Punkte des Assetklassen-Backtesters

Stand: 20. August 2026

Diese Liste trennt notwendige Produktionsarbeit von späteren Erweiterungen. Bereits erledigte Datenimporte und Tests stehen in `PROJEKT-DOKUMENTATION.md`.

## Globale Assets und reale Renditen

- [x] Globale Investment-Grade-Anleihen in EUR-gesicherter und ungesicherter Variante vorbereitet; beide Historien beginnen erst am tatsächlichen Fondsstart am 21.11.2017.
- [x] Breiten Rohstoff-Total-Return-Proxy sowie Euro- und US-Geldmarkt aus EUR-Anlegersicht als kontrollierte CSV-Reihen vorbereitet.
- [x] Amtliche Inflationsreihen für Deutschland, Euroraum und USA sowie eine frei einstellbare konstante Inflation implementiert.
- [x] Einstellungen-Minifenster mit allen Linien, „Alle auswählen“ und „Alle abwählen“ umgesetzt.
- [x] Mietcashflow aus Marktübersicht und Gesamtvergleich entfernt; er bleibt ausschließlich in beiden Immobilien-Einzelverläufen.
- [ ] Migration `016_global_assets_and_inflation.sql` und die acht neuen Importdateien auf Produktion übernehmen.
- [ ] Desktop- und Mobilabnahme für das Einstellungen-Fenster, 13 Einzelcharts und reale Renditen durchführen.

## Immobilien USA und tägliche Datenquellen

- [x] FHFA-Reihe `HPIPONM226S` als rechtlich sauberere US-Immobilienquelle ausgewählt und Backfill 2016 bis Mai 2026 vorbereitet.
- [x] Täglichen revisionsfähigen FRED-Abruf implementiert; nach STRATO-Transportfehlern des CSV-Hosts auf den bereits funktionierenden offiziellen FRED-Endpunkt umgestellt. Echte Rohwerte bleiben monatlich.
- [x] Einstellbaren Netto-Mietcashflow mit Standardwert 5,0 % p.a. implementiert; keine Wiederanlage und keine Veränderung des Preisindex.
- [x] Beide Einzelverläufe, Methodik und Link zur Immobilienkostenkalkulation ergänzt; Marktübersicht und Gesamtvergleich verwenden nur die Preisindizes.
- [x] Deutsche Eurostat-Hauspreiswerte 2016-Q1 bis 2026-Q1 recherchiert und separat abgelegt; nicht ins Produkt eingebaut.
- [ ] Migration `011_us_real_estate.sql` auf Produktion importieren und `us_real_estate.csv` einmalig einlesen.
- [ ] Externen Scheduler auf täglich 13:00 Uhr `Europe/Berlin` umstellen.
- [ ] MSCI-/Yahoo-Nutzungsrechte für die öffentliche Anzeige klären; erst danach Scraper aktivieren und optionale Migration 012 importieren.
- [ ] Desktop- und Mobilabnahme für die neue Immobilienkarte sowie beide Cashflow-Eingaben durchführen.

## Priorität 1: MSCI World produktiv übernehmen

- [x] **XLS-Dateien konvertieren.** 72 Monatswerte und 1.042 Tageswerte wurden reproduzierbar in CSV-Dateien umgewandelt.
- [x] **Startwert ergänzen.** Der 31.07.2016 ist mit 1.716 USD eingetragen und verwendet für die EUR-Umrechnung den EZB-Kurs vom 29.07.2016.
- [x] **Importdatei validieren.** `msci_world.csv` enthält 1.115 eindeutige, positive Beobachtungen vom 31.07.2016 bis 14.08.2026.
- [x] **Dividendenrechnung umsetzen.** Die hinterlegten Jahresrenditen 2016 bis 2030 werden jeweils vollständig am 31.12. reinvestiert; der Preisindex bleibt unverändert.
- [x] **Frontend ergänzen.** Marktübersicht, Einzelverlauf und optionale Gesamtvergleichslinien mit und ohne Dividenden sind umgesetzt.
- [x] **Frontend-Laufzeitdateien vollständig hochladen.** `index.html`, CSS und alle JavaScript-Module wurden gemeinsam am richtigen STRATO-Pfad überschrieben; der vorherige Versionskonflikt ist behoben.
- [x] **Migration importieren.** `010_msci_world.sql` wurde am 16.08.2026 in `YOUR_DATABASE_NAME` ausgeführt; Quelle, Asset und 15 Jahresrenditen sind angelegt.
- [x] **Kursdatei importieren.** Der SSH-Import hat am 16.08.2026 alle 1.115 Werte vom 31.07.2016 bis 14.08.2026 neu eingefügt (`updated: 0`, `unchanged: 0`).
- [x] **Serverprüfungen durchführen.** Der vollständige PHP-Testlauf endete mit 36 bestandenen, 0 fehlgeschlagenen und 1 planmäßig übersprungenen Test; der Produktivimport war erfolgreich.
- [ ] **Browserabnahme durchführen.** Einzelchart, Dividendenlinie, Standardauswahl und optionale MSCI-World-Preislinie auf Desktop und Mobilgerät prüfen.
- [x] **Technische Fortschreibung vorbereiten.** Der exakte USD-Preisindex `^990100-USD-STRD`, kurzer Überlappungsabruf und EZB-Umrechnung sind implementiert.
- [ ] **Nutzungsrechte klären.** Der MSCI-Abruf bleibt standardmäßig deaktiviert; erst nach Freigabe Umgebungsvariable setzen und Migration 012 importieren.

## Priorität 2: Kostenlose Live-Quellen produktiv aktivieren

- [x] **S&P-500-Methode technisch festgelegt.** Die FRED-Reihe `SP500` setzt denselben Preisindex ohne Dividenden fort und wird mit EZB-Referenzkursen in EUR umgerechnet. Es wird kein ETF- oder Total-Return-Proxy angehängt.
- [x] **Gold-Methode technisch festgelegt.** Zukünftige Goldwerte kommen als `XAU/USD` über GoldAPI.io und werden mit dem festen Referenzverhältnis in die bestehende Goldreihe überführt; die historische Reihe bleibt unverändert.
- [x] **FX-Provenienz im Datenmodell umgesetzt.** Neue USD-Beobachtungen speichern Rohwert, Rohwährung, EUR-Wert, Umrechnungsfaktor und verwendeten EZB-Tag getrennt.
- [x] **Migration vorbereitet.** `007_goldapi_forward_calibrated.sql` ordnet nur die zukünftige Goldfortschreibung GoldAPI zu.
- [x] **Kostenlosen FRED-API-Key bereitstellen.** Der Key liegt in der Serverkonfiguration; der einzelne SP500-Liveabruf war erfolgreich.
- [ ] **GoldAPI-Key bereitstellen.** Der Key aus dem GoldAPI-Dashboard muss als `BACKTESTER_GOLDAPI_API_KEY` serverseitig gesetzt werden.
- [ ] **Providerbedingungen prüfen.** Speicherung und öffentliche Darstellung müssen von FRED- und GoldAPI-Bedingungen sowie den vorliegenden schriftlichen Rechten gedeckt sein; Nachweise außerhalb des Webroots ablegen.
- [ ] **GoldAPI-Laufzeitdateien hochladen.** `GoldApiProvider`, `GoldProvider`, Konfiguration und Migration müssen gemeinsam auf den Server.
- [x] **Migration `005_free_market_live_sources.sql` in `YOUR_DATABASE_NAME` importieren.** Quellen, Symbole und Methodik sind in der Produktionsdatenbank aktualisiert.
- [x] **S&P 500 einzeln synchronisieren.** Der Abruf für den 03.08.2026 hat einen neuen EUR-Wert eingefügt.
- [ ] **Gold einzeln synchronisieren und Übergang prüfen.** Nach Key-Konfiguration Skalierung, Währung, Datum und die Vorwärtskalibrierung prüfen; historische Werte bleiben unverändert.

## Priorität 3: Automatisierung prüfen

- [ ] Den nächsten echten Lauf des externen Zeitplaners kontrollieren und prüfen, ob neue abgeschlossene BTC-, SP500- und XAU-Tage eingefügt werden.
- [ ] `logs/backtester.log` nach dem Lauf auf `INFO Asset synchronisiert` und unerwartete Fehler prüfen.
- [ ] Eine Aufbewahrungs- oder Rotationsregel für das Log festlegen.
- [ ] Datenbank-Backups einrichten und eine Wiederherstellung testweise durchspielen.
- [ ] API-Key und Cron-Geheimnis regelmäßig rotieren; Werte nie in Dokumentation, URL oder Repository schreiben.

## Priorität 4: Lückenprüfung verbessern

- [ ] Für S&P 500 und XAU einen echten US-/Metall-Handelskalender verwenden. Die aktuelle Prüfung behandelt jeden fehlenden Montag bis Freitag als Kandidat und kann Feiertage nicht sicher von Datenlücken unterscheiden.
- [ ] Bereits einen einzelnen fehlenden echten Handelstag melden. Die aktuelle Heuristik ignoriert bei Marktassets weniger als drei Kandidaten als mögliche Feiertage.
- [ ] Große Lücken nicht unbegrenzt per Forward-Fill kaschieren. Für veraltete Reihen sollte die API zusätzlich eine gut sichtbare Warnung ausgeben.
- [ ] Nach jeder historischen Aktualisierung Startdatum, Enddatum, Anzahl, Duplikate, Währung, positive Werte und Prüfsumme kontrollieren.

## Priorität 5: Tests und Abnahme

- [ ] Eine getrennte MySQL-Testdatenbank anlegen und `BACKTESTER_TEST_CONFIG` setzen.
- [ ] Den Integrationstest für Upsert, Quellenrevision und Lock-Race ausführen.
- [ ] Den kompletten PHP-Testlauf nach der GoldAPI-Umstellung auf STRATO ausführen; lokal ist kein PHP-Binary verfügbar.
- [ ] Nach Upload der neuen Risikokennzahlen den erweiterten PHP-Testlauf erneut auf STRATO ausführen.
- [ ] Die Seite bei 320, 640, 960 und mindestens einer großen Desktop-Breite im echten Browser prüfen.
- [ ] Maus, Tastatur und Touch für Zeiträume, Tabellen, Tooltips und Assetauswahl prüfen.
- [ ] Sicherstellen, dass die logarithmischen Achsen bei kurzen, langen und stark schwankenden Zeiträumen lesbar bleiben.
- [ ] Einen simulierten Providerausfall testen; gespeicherte Daten müssen sichtbar bleiben.

## Priorität 6: Veröffentlichung

- [ ] Die Laufzeitdateien für die neuen Risikokennzahlen hochladen: `index.html`, `assets/css/asset-backtester.css`, `assets/js/asset-backtester/app.js`, `assets/js/asset-backtester/formatters.js` und `includes/backtester/Services/BacktestService.php`.
- [ ] Die aktualisierten Tests `tests/backtester/CalculationTest.php` und `tests/js/calculations.test.mjs` hochladen.
- [ ] Den Wissensartikel `wissen/assetklassen-backtester-rendite-risiko.html`, die aktualisierte `wissen/index.html` und die Root-`sitemap.xml` veröffentlichen.
- [ ] `backtester.html`, `.htaccess` und `assets/js/backtester-project.js` hochladen. Das CSS der Projektseite ist vollständig in `backtester.html` eingebettet.
- [ ] Die Projektseite in der Projektübersicht oder Projekt-Pipeline verlinken.
- [ ] Alle Links, Metadaten, das Vorschaubild, Impressum und Datenschutz auf dem öffentlichen Server prüfen.
- [ ] Bestehende ältere Dokumente an die endgültige S&P-/Gold-Quellenstrategie und die inzwischen bestätigten Rechte anpassen.

## Spätere Produktfunktionen

Diese Punkte sind Erweiterungen und keine Voraussetzung für den aktuellen Vier-Asset-Vergleich:

- [ ] Transaktionskosten und laufende Produktkosten
- [ ] Steuerannahmen mit deutlich sichtbaren Modellgrenzen
- [ ] Sparpläne und regelmäßige Einzahlungen
- [ ] Rebalancing-Regeln
- [ ] Download oder Export der berechneten Vergleichsdaten
