# Bitcoin-Kernbestand und Chart, 22.10.2026

## Umgesetzt im lokalen Projekt

1. Die Y-Achse zeigt Zahlenwerte und eine ausdrückliche Einheitenbeschriftung. Die eigene lokale Chart.js-Datei wird mitgeliefert; das Dashboard hängt nicht mehr von der Bibliotheksdatei eines anderen Dashboards ab.
2. Die Hoveranzeige zeigt Datum, Wert und Quelle. Eine senkrechte Hilfslinie erleichtert die Zuordnung. Maus, Tippen und Tastatur mit Pfeiltasten, Home, End und Escape sind unterstützt.
3. 366 alte Dateien mit zusammen 17.855.556.656 Byte wurden nach `var/archive/2026-10-22/` verschoben. Vor und nach jeder Verschiebung wurden SHA-256-Prüfsummen verglichen; es gab keine Abweichung. Es wurde nichts gelöscht. `INDEX.json` ordnet frühere Pfade den Archivpfaden zu.
4. Der aktive Bestand enthält 50 Kennzahlen und 290.291 Beobachtungen. Nicht ausgewählte Kennzahlen bleiben historisch erhalten und werden über die aktive Oberfläche und Reihen-API nicht mehr ausgegeben.

Die öffentliche Website ist durch diese lokalen Änderungen noch nicht aktualisiert. Der geprüfte Live-Stand lieferte weiterhin die alte Chartversion ohne Hover und Preiswerte nur bis 24.09.2026.

## Datenstand

| Quelle oder Gruppe | Letzter tatsächlich verfügbarer Stand |
|---|---|
| Coin Metrics, direkte Markt-/Netzwerkdaten und davon abhängige Tagesberechnungen | 21.10.2026 |
| Alternative.me Fear & Greed | 21.10.2026, nur abgeschlossene UTC-Tage |
| OBM, einschließlich Difficulty am Tagesende, UTXO und Blockgewicht | 17.10.2026 |
| CFTC Bitcoin-Futures-OI | Berichtstag 13.10.2026, native Wochenfrequenz |
| 200-Wochen-Durchschnitt | Wochenschluss 18.10.2026 |

Die Datenstände entsprechen den abgerufenen Originalquellen. Fehlende Tage und der Veröffentlichungsverzug werden nicht mit erfundenen Werten aufgefüllt. Die vier bekannten Fear-&-Greed-Lücken bleiben leer.

Die Daten sind kostenlos beschaffbar. Coin Metrics verlangt nichtkommerzielle Nutzung und Namensnennung nach CC BY-NC 4.0. OBM-Daten stehen unter CC BY 4.0. Alternative.me wird direkt an seinen Werten genannt.

## Aktive Dateien

- `data/active-metrics.json`: verbindliche Auswahl der 50 Kennzahl-IDs.
- `data/catalog.json`: vollständige Metadaten einschließlich der aktiven Auswahl und zehn Übersichtskacheln. Historische Metadaten bleiben für interne Berechnungen erhalten.
- `var/bitcoin-core-master.csv`: aktueller aktiver Datenbestand, ausschließlich Hauptreihen aus zugelassenen kostenlosen Quellen.
- `var/bitcoin-core-inputs.csv`: Roh-Eingangsreihen für reproduzierbare Berechnungen.
- `var/bitcoin-core-manifest.json`: Abdeckung, Quellen und Prüfsumme des aktuellen Bestands.
- `var/archive/revisions/`: vorherige Werte und Herkunft bei geprüften Quellen- und Formeländerungen.
- `var/archive/2026-10-22/INDEX.json`: unveränderte ältere Dateien und frühere Gesamtmaster.

Der ursprüngliche Gesamtmaster liegt unter `var/archive/2026-10-22/legacy-master/bitcoin-backfill-cointime-cftc-options.csv`. Seine SHA-256 ist weiterhin `38da2914c41ebe2c5067999cbb06d060ca3c27784453564a049b9e376b3491cf`.

## Berechnungen und laufende Pflege

Der PHP-Tageslauf enthält jetzt auch Mayer Multiple, die annualisierte Rendite über exakt drei Kalenderjahre und den Halving-Abstand. Die bisherige Zählung bis zum nächsten Halving enthielt einen zusätzlichen Block. Sie wurde auf die Protokollgrenze korrigiert; ältere Zahlen bleiben im Archiv nachvollziehbar. Eine historische Difficulty-Schätzung wird nicht mehr in die neue OBM-Hauptreihe geschrieben.

Nur ausgewählte Kennzahlen werden als neue Berechnungsergebnisse gespeichert. Interne Zwischenergebnisse wie Blockhöhe und BTC-Minererlös werden weiterhin im Speicher für abhängige Formeln berechnet.

Lokaler Neuaufbau mit Node.js und PHP-cURL:

```sh
node tools/build-core-dashboard.js
python tools/validate-core-dashboard.py
node tools/preview-bitcoin-master.js 4173
```

Der Neuaufbau verwendet einen überlappenden Abrufzeitraum für Coin Metrics und EZB sowie vollständige OBM- und Fear-&-Greed-Quellhistorien. Änderungen werden vor dem Ersetzen protokolliert. Der Beobachtungsprüfer muss den Kandidaten akzeptieren, bevor der aktive Master ersetzt wird. Gleicher Quellenstand erzeugte beim Wiederholungstest die identische Master-Prüfsumme.

`BITCOIN_PHP_BIN` kann einen abweichenden PHP-Pfad enthalten, `BITCOIN_PHP_INI` optional eine PHP-Konfigurationsdatei. Es sind keine API-Schlüssel erforderlich. Die Vorschau bindet nur an `127.0.0.1` und veröffentlicht keine Dateien aus `var/`, dem Archiv oder der Konfiguration.

## Einspielen auf STRATO

Das Update-Paket enthält keine Zugangsdaten und nicht das große Forschungsarchiv. Vor dem Serverimport eine Datenbanksicherung anlegen und den Tagesjob für die Umstellung anhalten.

1. Die Dateien aus dem Update-Paket in `dashboards/bitcoin/` übertragen. Die vorhandene `config/bitcoin.php` bleibt erhalten.
2. Nur die neuen Metadaten-Migrationen `sql/045_fear_greed_and_difficulty_eod.sql` und anschließend `sql/046_active_core50.sql` ausführen. Bereits angewendete ältere Migrationen nicht erneut starten.
3. Zuerst den vollständigen aktiven Bestand mit ausdrücklich aktivierter, erhaltender Revisionsbehandlung importieren:

   ```sh
   php cron/import-observations.php --trigger=manual --preserve-core-revisions var/bitcoin-core-master.csv
   ```

   Der Modus akzeptiert ausschließlich die vollständige Historie aller 50 freigegebenen Hauptreihen. Vor dem Einfügen werden sämtliche Werte der früheren Fear-&-Greed- und Difficulty-Quellen in ihre getrennten Archiv-Teilreihen verschoben. Dadurch bleiben auch Tage ohne neuen Quellwert leer in der Hauptreihe. Identische kanonische Beobachtungen bleiben unverändert. Andere abweichende Altbeobachtungen werden innerhalb derselben Transaktion in eine nach der Eingabedatei benannte Archiv-Teilreihe verschoben, bevor der neue Hauptwert eingefügt wird. Ein Fehler rollt Archivierung und Import zurück. Eine belegte Archivposition wird nicht überschrieben. Die Archive werden über die öffentliche API nicht ausgegeben.

   Dieser Modus ersetzt für den gesamten Kernbestand den früher beschriebenen Zwei-Reihen-Schritt `--promote-core-series`. Die beiden Flags dürfen nicht kombiniert werden.

4. Erst nach der Hauptumstellung die Roh-Eingangsreihen mit dem bisherigen strikten Importmodus einspielen. Ihre 116.418 aktiven Beobachtungen stimmen exakt mit dem neuen Hauptbestand überein; zusätzlich enthalten sie interne Eingangsreihen wie den EZB-Kurs für die nächsten Tagesberechnungen. Wenn eine solche interne Altbeobachtung abweicht, bricht dieser Modus ohne Teilübernahme ab; den konkreten Konflikt prüfen, nicht ungeprüft erzwingen:

   ```sh
   php cron/import-observations.php --trigger=manual var/bitcoin-core-inputs.csv
   ```

5. `metrics.php` muss genau die 50 aktiven Kennzahlen liefern. Preise müssen bis 21.10., OBM bis 17.10. und CFTC bis zum Berichtstag 13.10. vorliegen. Anzahl, Werte, Quellen und Archiv-Erhaltung prüfen.
6. Achsenbeschriftung und Hover im Browser auf Desktop und Mobilgerät prüfen. Alle neuen JavaScript-Dateien, die eigene Chartbibliothek, CSS und JSON müssen HTTP 200 liefern. `var/`, `config/`, `cron/` und `includes/` müssen privat bleiben.
7. Erst danach den Tagesjob wieder freigeben. Er ruft die Gratis-Quellen ab und berechnet die aktiven Kennzahlen. Abweichende spätere Quellenrevisionen stoppt der reguläre strikte Import weiterhin zur Prüfung.

## Verifikation

- 50 von 50 ausgewählten Kennzahlen vorhanden; 290.291 eindeutige Beobachtungen.
- 4.292 unabhängige Formelprüfungen mit Python, einschließlich Renditen, Durchschnitten, Volatilität, MVRV-Ableitungen, EUR-Umrechnung, Ausgabe, Subvention und Halving-Grenzen.
- 33 Tests für Quellenkonvertierung, vollständigen Zwei-Reihen-Backfill, Archivierung und Schutz vor Vermischung, einschließlich alter Werte an neuen Quelllücken.
- 15 zusätzliche Tests für vollständige Kernrevisionen, Kalenderjahre und Halving-Grenzen.
- API-Skripte mit isolierten SQLite-Daten geprüft: aktive Hauptreihen und Abdeckung korrekt, Archivwerte verborgen, inaktive Kennzahlen abgewiesen.
- Gerenderter Browser-Test bei 1440 Pixeln und 390 Pixeln: sichtbare Achsenzahlen und Einheiten, positiver und negativer Wertebereich, Datum/Wert/Quelle im Hover, Touch und Tastatur; keine horizontalen Überläufe und keine JavaScript-Seitenfehler.
- PHP-, JavaScript- und Shell-Syntax geprüft.
- 366 verschobene Altdaten-Dateien nach jeder Verschiebung erneut gehasht; keine Abweichungen.

Die SQLite-Tests ersetzen keine MySQL-/MariaDB-Abnahme des Gesamtimports. Öffentliche Datenbank, Server-Cron und Live-Browser nach dem Upload sind noch zu prüfen.
