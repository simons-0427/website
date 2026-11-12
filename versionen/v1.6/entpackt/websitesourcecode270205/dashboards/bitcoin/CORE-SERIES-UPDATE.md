# Fear & Greed und Difficulty: direkte Gratis-Reihen

Hinweis: Der vollständige 50er-Kern und die aktuelle Serverumstellung sind jetzt in [CORE-DASHBOARD-UPDATE.md](CORE-DASHBOARD-UPDATE.md) dokumentiert. Die frühere Zwei-Reihen-Importdatei wurde mit den übrigen Zwischenständen archiviert.

Stand: 22.10.2026. Implementierung und Backfill sind lokal vorbereitet. Die öffentliche Datenbank und STRATO wurden nicht verändert.

| Hauptreihe | Quelle | Geprüfter Backfill |
|---|---|---|
| `fear_greed_index/main` | Alternative.me `/fng/?limit=0` | 3.181 Werte, 01.02.2018 bis 21.10.2026 |
| `difficulty/main` | OBM `obm_difficulty_eod_daily` | 6.492 Werte, 03.01.2009 bis 17.10.2026 |

Die CSV enthält insgesamt 9.673 Beobachtungen. Der laufende UTC-Tag wird ausgeschlossen. Der 17.10. ist der letzte tatsächlich gelieferte OBM-Tag; es werden keine neueren Difficulty-Werte erfunden.

## Werte und Methoden erhalten

- Bisheriges `fear_greed_index/main` aus OpenBitcoin wird unverändert zu `fear_greed_index/openbitcoin_legacy`.
- Bisheriges `difficulty/main` aus der Coin-Metrics-Tagesmittelschätzung wird unverändert zu `difficulty/coinmetrics_daily_mean_v1`.
- Die neuen Hauptreihen behalten die bisherigen Kennzahl-IDs. Katalog, Chart und Zusammenfassung verwenden weiterhin `main` als Hauptreihe.
- Die öffentliche Reihen-API liefert für diese zwei Kennzahlen ausschließlich die neue Hauptreihe. Archivwerte bleiben in der Datenbank erhalten; sie werden nicht zusätzlich veröffentlicht. Die öffentliche Kennzahlenanzahl und Abdeckung beziehen sich ebenfalls nur auf `main`.
- Wert, Datum, Quelle, Revision, Rohhash und bisherige Zeitangaben bleiben beim Archivieren erhalten. Nur der Teilreihenschlüssel ändert sich.
- Die Archivierung und der CSV-Import erfolgen in derselben Datenbanktransaktion. Ein Fehler rollt beide Schritte zurück. Unbekannte Altquellen und doppelte Archivschlüssel führen zum Abbruch.
- Eine erneute Ausführung verschiebt keine Daten aus den neuen Quellen. Identische Importe bleiben idempotent; abweichende spätere Quellenrevisionen benötigen weiterhin eine gesonderte Prüfung.
- Die PHP- und JavaScript-Ableitung schreiben keine Difficulty-Schätzung mehr nach `main`. Ein Import alter Quellen in eine bereits konfigurierte neue Hauptreihe wird zurückgewiesen.

## Quellenlücken

Alternative.me liefert keine Werte für 14.04., 15.04. und 16.04.2018 sowie 26.10.2024. Diese vier Tage bleiben leer. Die OBM-Difficulty ist am 04.01. bis 08.01.2009 undefiniert und wird für diese Tage nicht ausgegeben. Der Genesis-Wert am 03.01.2009 ist enthalten. Keine Interpolation und keine Nullauffüllung.

## Einmalige Einrichtung auf dem Server

Voraussetzungen: vorhandenes Schema mit den Teilreihen-Kalenderspalten aus Migration 011, PHP ab 8.1 mit cURL und PDO-MySQL, Datenbanksicherung und ausführbare bestehende Importumgebung. Keine Zugangsdaten in Dateien für den Upload aufnehmen.

1. Den Tagesjob für die Dauer der Umstellung anhalten.
2. Diese geänderten oder neuen Dateien übertragen:

   - `includes/bitcoin/core-series.php`
   - `cron/fetch-core-series.php`
   - `cron/import-observations.php`
   - `cron/derive-metrics.php`
   - `cron/run-daily.sh`
   - `data/catalog.json`
   - `assets/js/bitcoin.js`
   - `index.html`
   - `api/bitcoin/metrics.php`
   - `api/bitcoin/series.php`
   - `sql/045_fear_greed_and_difficulty_eod.sql`

3. Ausschließlich die neue Migration `sql/045_fear_greed_and_difficulty_eod.sql` auf der bestehenden Datenbank ausführen. Frühere Migrationen und `002_catalog.sql` nicht erneut ausführen. Migration 045 registriert Quelle, Methoden und Archiv-Teilreihen; sie verschiebt noch keine Beobachtungen.
4. Die geprüfte Datei `var/core-series-backfill-through-2026-10-21.csv` in den gesperrten `var/`-Ordner oder einen privaten Pfad übertragen. Alternativ den Backfill auf dem Server neu abrufen:

   ```sh
   php cron/fetch-core-series.php all var/core-series-backfill.csv
   ```

5. Den vollständigen Backfill zusammen mit der Historienumstellung importieren:

   ```sh
   php cron/import-observations.php --trigger=manual --promote-core-series var/core-series-backfill-through-2026-10-21.csv
   ```

   Bei eigenem Neuabruf stattdessen dessen Dateinamen verwenden. Der Umstellungsmodus verlangt beide vollständigen Hauptreihen mit ihren historischen Startdaten; ein kurzes Tagesfenster wird vor Datenbankzugriff abgewiesen.

6. Haupt- und Archiv-Teilreihen anhand von Anzahl, Datum, Quellen und Stichproben vergleichen. API und Browser kontrollieren. Erst anschließend den Tagesjob wieder freigeben.

Das neue `run-daily.sh` ruft beide Reihen in einem 90-Tage-Fenster ab und importiert sie vor den Ableitungen. Die neuen Abrufe verwenden keine API-Schlüssel. Ein normaler Tageslauf archiviert keine Daten.

## Lokale Nutzung und Prüfung

```sh
php cron/fetch-core-series.php all var/core-series-backfill.csv
php cron/fetch-core-series.php 90 var/core-series-recent.csv
php cron/fetch-core-series.php all var/core-series-cutoff.csv --end=2026-09-28
php tools/test-core-series.php var/core-series-backfill-through-2026-10-21.csv
node tools/check-observations.js var/core-series-backfill-through-2026-10-21.csv
```

Der vorhandene CSV-Prüfer zählt für eine Datei mit nur zwei Kennzahlen erwartungsgemäß keine vollständige 100er-Kernabdeckung. Die vier gemeldeten Fear-&-Greed-Lücken sind dokumentierte Quelllücken. Der bestehende Gesamtmaster bis 28.09.2026 bleibt unverändert; die neue Importdatei wird nicht unkontrolliert in diesen Master gemischt.

## Nutzungsrechte und Anzeige

- Alternative.me: kostenlose API einschließlich Historie. Anbieter unmittelbar bei den angezeigten Werten nennen; kommerzielle Nutzung laut Anbieter ebenfalls mit Quellenhinweis erlaubt. Der Chart zeigt Quelle und Link; die Fear-&-Greed-Kachel nennt Alternative.me zusätzlich direkt am Wert.
- OBM: Daten CC BY 4.0, Diego R. Llanos nennen sowie Repository, Lizenz und Release erhalten.
- Quellen: https://alternative.me/crypto/fear-and-greed-index/ und https://github.com/diegorllanos/open-bitcoin-metrics/tree/main/metrics/obm_difficulty_eod_daily.

## Nachgewiesene und offene Prüfschichten

Die PHP-Abrufe wurden gegen die Originalquellen ausgeführt und die CSV mit dem vorhandenen Beobachtungsprüfer validiert. Tests prüfen Konvertierung, Wertebereiche, Dezimalpräzision, doppelte Tage, abgeschnittene Zeitfenster, Transaktions-Rollback, vollständige Archiv-Erhaltung, erneute Umstellung, Archivkonflikte und Schutz vor Vermischung alter Quellen.

SQLite dient im Test ausschließlich als isolierte Datenbank für das Archivierungsverhalten. Es ist kein Nachweis der SQL-Migration oder des Gesamtimporters unter MySQL/MariaDB. Öffentliche Datenbank, Server-Cron und Browser nach dem Deployment sind noch nicht geprüft.
