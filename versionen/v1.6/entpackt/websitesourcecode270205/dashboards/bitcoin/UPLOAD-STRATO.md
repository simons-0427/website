# Bitcoin-Dashboard auf STRATO mit FileZilla bereitstellen

## Aktuelles Update: Kernbestand und Chart, 22.10.2026

Maßgeblich ist jetzt [CORE-DASHBOARD-UPDATE.md](CORE-DASHBOARD-UPDATE.md): aktive 50 Kennzahlen, eigener Chartbibliotheks-Pfad, Hovermodul, Migrationen 045/046 und der vollständige Kernimport mit `--preserve-core-revisions`. Das große Datenarchiv und Zugangsdaten sind nicht Bestandteil des Update-Pakets. Frühere Uploadanweisungen und alte Master-Dateinamen unten sind historische Dokumentation.

## Ergänzung 22.10.2026: nur Fear & Greed und Difficulty

Für diese beiden Reihen gilt die gezielte Anleitung [CORE-SERIES-UPDATE.md](CORE-SERIES-UPDATE.md). Tagesjob anhalten, die dort genannten Dateien übertragen, nur Migration 045 ausführen, anschließend den vollständigen Backfill mit `--promote-core-series` importieren. Danach Haupt- und Archivwerte prüfen und den Job wieder freigeben. Frühere Migrationen und den alten Gesamtmaster nicht erneut importieren. Ein Upload oder Datenbankimport wurde hier nicht ausgeführt.

Stand: 03.10.2026. Der lokale Bitcoin-Master umfasst 1.076.959 Beobachtungen aus 195/201 Bitcoin-Kennzahlen und 96/100 Kernkennzahlen bis einschließlich 28.09.2026. Sechs Bitcoin-Kennzahlen sind leer, 14 Kennzahl-IDs haben nicht akzeptierte Lücken, und 45 von 181 täglichen Hauptreihen enden vor dem Stichtag. Am 03.10. wurde eine OpenBitcoin-Liveliness-Beobachtung ergänzt und Active/Vaulted-MVRV für den 26. bis 28.09. berechnet. Diese Fassung ist noch nicht unabhängig als STRATO-Datenbankimport bestätigt. Der aktuelle Master enthält private und vorläufige Reihen; Quellenrechte für öffentliche Anzeige und Weitergabe sind einzeln zu prüfen. Nicht den vollständigen Forschungs-Master öffentlich importieren.

## Aktueller Stand auf STRATO

- Der bestätigte absolute Dashboard-Pfad lautet `/mnt/web118/d1/95/5221695/htdocs/smstark-projekt.de/dashboards/bitcoin`. Der SSH-Startordner ist `/mnt/web118/d1/95/5221695/htdocs`; von dort funktioniert `cd smstark-projekt.de/dashboards/bitcoin`.
- Die Laufzeitordner `api/`, `assets/`, `config/`, `cron/`, `data/`, `includes/` und `var/` sind laut deiner früheren SSH-Auflistung vorhanden. Der aktuelle lokale Master hat 233.942.950 Bytes und SHA-256 `95d98283c93747db78eb9466b7f57ae015c38339477c9a00fc7375ef02726373`. Der jüngste lokale Sicherungsstand ist `var/bitcoin-backfill-cointime-cftc-options-before-source-refresh-2026-10-03T14-53-37-896Z.csv`. Die vorige Fassung ist bytegenau als `var/bitcoin-backfill-cointime-cftc-options-before-bitview-taproot-share-2026-09-30.csv` gesichert; ihr SHA-256 lautet `790574cb97bea258294eb6927abb4085b8c38f02867c77a3f321d35ee5622252`.
- Laut früherer Bestätigung sind `001_schema.sql` bis `008_uwa_deribit_options_iv.sql` eingespielt. Den Status von Migrationen 009 bis 034 vor jedem Anwenden prüfen. Fehlende Migrationen nur in Reihenfolge und nach Quellenfreigabe ergänzen. `sql/002_catalog.sql` wird lokal aus dem aktuellen 207-ID-Katalog erzeugt. Der Live-Katalog zeigt derzeit 189 IDs; vor Datenbankänderungen den STRATO-Migrationsstand prüfen und bereits ausgeführte Migrationen nicht erneut anwenden.
- Frühere Importversuche mit `/usr/bin/php` waren erfolglos; dieser Pfad meldete `PHP 8.3.33 (cgi-fcgi)`. Dieser Stand ist durch den danach erfolgreichen PHP-CLI-Import ersetzt.
- Das PHP-CLI-Binary `/opt/RZphp83/bin/php-cli` und ein früherer Import mit `435236 neu, 0 unverändert, 75 Kennzahlen` wurden vom Nutzer bestätigt. Die aktualisierte CSV enthält diese Werte unverändert und ist ein inkrementeller Folgeimport.
- Für den jetzigen lokalen Stand gehören diese geänderten Laufzeitdateien zum Upload:

  | Lokal unter `dashboards/bitcoin/` | STRATO-Ziel unter `/smstark-projekt.de/dashboards/bitcoin/` |
  |---|---|
  | `index.html` | `index.html` |
  | `assets/css/bitcoin.css` | `assets/css/bitcoin.css` |
  | `assets/js/bitcoin.js` | `assets/js/bitcoin.js` |
  | `api/bitcoin/metrics.php` | `api/bitcoin/metrics.php` |
  | `api/bitcoin/series.php` | `api/bitcoin/series.php` |
  | `data/catalog.json` | `data/catalog.json` |
  | `cron/import-observations.php` | `cron/import-observations.php` |

  `api/bitcoin/series.php` unterstützt jetzt bis zu 50.000 Beobachtungspunkte je Anfrage, damit eine HODL-Waves-Kennzahl mit sechs Altersbändern vollständig abrufbar ist. Die beiden neuen Bitview-Tagesreihen umfassen je 6.472 Punkte. Das Chart lädt Chart.js aus `/dashboards/weltmarkt/assets/vendor/chart.umd.min.js`; diesen vorhandenen Assetpfad ebenfalls prüfen. `config/bitcoin.php` nicht überschreiben. Keine alten Datenbanktabellen löschen. Migrationen 031, 032, 033 und 034 sowie die Bitview-Werte nicht auf einem öffentlichen Server verwenden, solange die Datenrechte ungeklärt sind.

**Livecheck am 29.09.2026:** Die öffentliche Seite lieferte noch CSS und JavaScript mit Versionskennung `20260926-bitcoin-refresh-1`; sie zeigte 189 Kennzahlen und keine gespeicherten Werte. Damit sind der aktuelle lokale Katalog, die neue Datenfassung, Y-Achse und Hoverwerte live noch nicht bestätigt. Ein früher vom Nutzer gemeldeter PHP-CLI-Import ersetzt diese aktuelle Seitenprüfung nicht.

**Livecheck am 03.10.2026:** Die öffentliche Bitcoin-Seite zeigt 189 Kennzahl-IDs, aktuell keine sichtbaren Messwerte und beim Diagramm „noch nicht importiert“. Der direkte Aufruf von `api/bitcoin/metrics.php` wurde in der Browserumgebung mit `ERR_BLOCKED_BY_CLIENT` blockiert. Daher ist die Datenbank selbst nicht unabhängig ausgelesen. Die neue lokale Masterfassung ist mit `uploaded:false` markiert. Du meldest, dass die vorhandenen Dateien über STRATO hochgeladen wurden; ein erfolgreicher Datenbankimport ist damit nicht bestätigt. Y-Achse und Hover sind lokal geprüft, live mangels sichtbarer Messpunkte noch nicht prüfbar.

## Ziel und Voraussetzungen

- Lokaler Ordner: `C:\Users\simon\Desktop\Project DoubleUp\smstark-projekt.de\dashboards\bitcoin`
- STRATO-Ziel: `/smstark-projekt.de/dashboards/bitcoin/`
- STRATO Hosting Basic unterstützt dynamische PHP-Websites und Datenbanken. Im Kunden-Login PHP 8.2 oder neuer wählen; das Projekt nutzt Sprachmerkmale ab PHP 8.1. Die tatsächlich verfügbare PHP- und MySQL-Version im Paket prüfen.
- Datenbank: MySQL 8.0 oder MariaDB 10.5 oder neuer.
- Den vorhandenen Zielordner nicht löschen. Vorhandene Dateien überlagern, vorhandene `config/bitcoin.php` und den Inhalt von `var/` behalten.

## 1. Laufzeitdateien mit FileZilla aktualisieren

Der vollständige Ordnertransfer gilt nur für eine Erstinstallation. Für die gegenwärtige Überarbeitung werden keine Dateien hochgeladen. Der lokale Master enthält private Bitview-Forschungswerte, deren öffentliche Anzeige und Weitergabe nicht freigegeben sind; ihn nicht in eine öffentlich erreichbare Datenbank importieren.

STRATO verwendet SFTP über Port 22. Im FileZilla-Servermanager **Datei → Servermanager → Neuer Server** wählen und eintragen:

| Feld | Wert |
|---|---|
| Protokoll | SFTP – SSH File Transfer Protocol |
| Server | Hostname aus STRATO Kunden-Login → Ihr Paket → Datenbanken und Webspace → SFTP & SSH |
| Port | `22` |
| Verbindungsart | Normal |
| Benutzer | SFTP-Benutzername aus demselben STRATO-Bereich |
| Passwort | Das SFTP-Passwort direkt in FileZilla eingeben, nicht hier oder in Obsidian speichern |

Beim ersten Verbinden den angezeigten Server-Fingerabdruck nur bestätigen, wenn FileZilla den STRATO-Servernamen zeigt. Dein SSH-Login auf diesem Konto funktioniert bereits. Der bestätigte Webspace-Startordner war `/mnt/web118/d1/95/5221695/htdocs`.

Nach dem Verbinden zeigt die rechte Seite das von STRATO gesetzte Startverzeichnis. Ziel ist `/smstark-projekt.de/dashboards/bitcoin/`. Falls der Pfad nicht direkt eingegeben werden kann, vom angezeigten Startverzeichnis aus die Ordner `smstark-projekt.de` → `dashboards` → `bitcoin` öffnen. Wenn ein Zielordner fehlt, nur diesen Ordner anlegen. Prüfe oben im rechten Fenster den Pfad, bevor du überträgst. Den Ordner `bitcoin` nicht nochmals innerhalb von `bitcoin` erzeugen.

Auf der linken Seite in FileZilla diesen lokalen Ordner öffnen:

`C:\Users\simon\Desktop\Project DoubleUp\smstark-projekt.de\dashboards\bitcoin`

Damit FileZilla die wichtigen Punktdateien zeigt, Menü **Server → Auflistung versteckter Dateien erzwingen** aktivieren. Falls `.htaccess` weiter fehlt: **Ansicht → Datei-/Verzeichnisfilter** öffnen und den Filter **Configuration files** deaktivieren.

Den vorhandenen Remote-Ordner nicht löschen oder spiegeln. Für diese Aktualisierung ziehe nur `index.html`, `assets/css/bitcoin.css`, `assets/js/bitcoin.js`, `data/catalog.json`, `cron/fetch-coinmetrics.php` und `cron/import-observations.php` per Drag & Drop an die entsprechenden Stellen. Die folgende vollständige Liste gilt für eine Erstinstallation, nicht für den gezielten Folgeupload:

```text
.htaccess
index.html
api/bitcoin/metrics.php
api/bitcoin/series.php
assets/css/bitcoin.css
assets/js/bitcoin.js
data/catalog.json
includes/.htaccess
includes/bitcoin/bootstrap.php
cron/.htaccess
cron/derive-metrics.php
cron/fetch-cftc-futures-open-interest.php
cron/fetch-coinmetrics.php
cron/fetch-ecb-fx.php
cron/fetch-open-bitcoin-metrics.php
cron/import-observations.php
cron/run-daily.sh
```

Falls remote `config/` fehlt, diesen Ordner anlegen und ausschließlich die versteckte Datei `config/.htaccess` darin ablegen. Die Dateien `includes/.htaccess` und `cron/.htaccess` liegen bereits in den oben genannten Upload-Ordnern. FileZilla muss versteckte Dateien anzeigen, sonst kann es diese Punktdateien beim Ordnertransfer auslassen.

`var/` wird für die statische Oberfläche noch nicht benötigt. Lege ihn erst vor dem historischen CSV-Import oder vor dem ersten Cronlauf an und übertrage dann zuerst `var/.htaccess`. Sie sperrt die Import-CSV und temporäre Abrufdateien gegen direkten Webzugriff. Die Haupt-`.htaccess` blockiert CSV-Dateien nicht generell.

Weder die lokale `config/bitcoin.php` noch `config/bitcoin.example.php` hochladen. Eine vorhandene echte Remote-`config/bitcoin.php` nicht überschreiben. Die serverseitige Konfiguration wird im nächsten Schritt separat erstellt. `README.md`, diese Anleitung sowie die Ordner `sql/` und `tools/` gehören nicht in den Webspace.

Nach dem Ziehen das **Warteschlangen**-Fenster unten in FileZilla prüfen. Erst fortfahren, wenn alle Übertragungen abgeschlossen sind und keine fehlgeschlagenen Dateien aufgeführt sind. Rechtsklick auf die Warteschlange erlaubt fehlgeschlagene Übertragungen erneut zu versuchen.

### Gemeinsame Website-Dateien

`index.html` lädt außerdem `../../assets/site-header.css` und `../../assets/site-header.js`, also diese Website-Dateien:

- `/smstark-projekt.de/assets/site-header.css`
- `/smstark-projekt.de/assets/site-header.js`

Zuerst die beiden öffentlichen URLs im Browser testen. Wenn beide bereits HTTP 200 liefern, nichts am Hauptverzeichnis ändern. Fehlt eine Datei, nur diese beiden Dateien aus dem lokalen Website-Ordner `assets/` nach `/smstark-projekt.de/assets/` übertragen. Nicht den gesamten gemeinsamen `assets/`-Ordner überschreiben.

## 2. Datenbankkonfiguration nur auf dem Server anlegen

In FileZilla rechts den Remote-Ordner `config/` öffnen. Rechtsklick → **Neue Datei erstellen**, Dateiname `bitcoin.php`. Danach Rechtsklick auf die neue Datei → **Ansehen/Bearbeiten** und den Inhalt aus `config/bitcoin.example.php` übernehmen. In STRATOs Datenbankverwaltung stehen Host, Datenbankname und Benutzername. Das bereits gesetzte Datenbankpasswort in der Serverdatei eintragen. Falls es nicht mehr verfügbar ist, vor dem Zurücksetzen prüfen, ob andere Anwendungen denselben Datenbankbenutzer verwenden. Port ist `3306`.

Das echte Passwort weder in den Chat noch in Obsidian oder das Repository schreiben. Die Datei `config/.htaccess` muss bereits remote vorhanden sein. `config/bitcoin.php` niemals öffentlich verlinken. Nach dem Speichern im Browser prüfen, dass `/dashboards/bitcoin/config/bitcoin.php` mit HTTP 403 oder 404 antwortet.

## 3. Datenbankschema in phpMyAdmin anlegen

Für die vorhandene Datenbank sind 001 bis 008 laut Nutzer bereits eingespielt. Diese Migrationen nicht wiederholen. Das lokale Katalog-SQL registriert 207 Kennzahl-IDs; die Live-Seite zeigt 189. Der aktuelle STRATO-Migrationsstand ist nicht unabhängig ausgelesen. Vor jeder Änderung den Migrationsverlauf und die gespeicherten Kennzahlen in phpMyAdmin prüfen. Migrationen 009 bis 043 nur dann in Reihenfolge und nach Quellen- und Rechteprüfung auf dem passenden Ziel anwenden: `sql/009_bykaranteli_cc0.sql`, `sql/010_mempool_space_snapshots.sql`, `sql/011_openbitcoin_history.sql`, `sql/012_additional_bitcoin_derived_metrics.sql`, `sql/013_openbitcoin_bitcoin_only_snapshots.sql`, `sql/014_uwa_deribit_options_activity.sql`, `sql/015_coinmetrics_btc_extended_metrics.sql` und `sql/016_coinmetrics_btc_exchange_usd.sql`. Danach die separat geprüften Erweiterungen `sql/017_bitview_private_research.sql` bis `sql/028_bykaranteli_btc_options_flow_cc0.sql` und `sql/029_bykaranteli_btc_options_oi_history_cc0.sql` einzeln nach ihrer Quellenfreigabe prüfen. Migrationen 017, 018, 020, 021, 031, 032, 033 und 034 enthalten private Forschungsreihen und sind nicht für eine öffentliche Datenbank freigegeben; 019 und 022 bis 030 sind vor Anwendung anhand des tatsächlichen Migrationsstands und der Datenrechte zu prüfen. Migration 028 registriert fünf CC0-Optionsflussfelder für BTC aus dem Deribit-und-OKX-Datensatz. Migration 029 aktualisiert das Deribit-BTC-Options-OI auf 36 BTC-only Tageswerte. Migration 032 registriert new_addresses als rollierende 24-Stunden-Zahl neu beobachteter Adressen und block_size_mb als rollierendes serialisiertes Blockvolumen in dezimalen MB. Migrationen 031 bis 034 wurden nicht ausgeführt. Migration 033 registriert funded Bitcoin-Adresszahlen mit Schwellen von mindestens 1, 100 und 1.000 BTC am letzten Block des jeweiligen Tagesindexes. Migration 034 registriert den Taproot-Ausgabeanteil als Anteil der Transaktionen mit mindestens einer P2TR-Ausgabe.

Bei einer neuen Datenbank im STRATO-Kundenlogin **Datenbanken und Webspace → Datenbank verwalten → phpMyAdmin starten** öffnen. In phpMyAdmin links genau diese Datenbank auswählen. Danach über **Importieren** die folgenden Dateien einzeln in dieser Reihenfolge einspielen und jede Erfolgsmeldung abwarten:

1. `sql/001_schema.sql`
2. `sql/002_catalog.sql`
3. `sql/003_coinmetrics_source.sql`
4. `sql/004_derived_metrics.sql`
5. `sql/005_ecb_fx.sql`
6. `sql/006_open_bitcoin_metrics.sql`
7. `sql/007_cftc_legacy_open_interest.sql`
8. `sql/008_uwa_deribit_options_iv.sql`
9. `sql/009_bykaranteli_cc0.sql`
10. `sql/010_mempool_space_snapshots.sql`
11. `sql/011_openbitcoin_history.sql`
12. `sql/012_additional_bitcoin_derived_metrics.sql`
13. `sql/013_openbitcoin_bitcoin_only_snapshots.sql`
14. `sql/014_uwa_deribit_options_activity.sql`
15. `sql/015_coinmetrics_btc_extended_metrics.sql`
16. `sql/016_coinmetrics_btc_exchange_usd.sql`

Diese SQL-Dateien aus dem lokalen Repository direkt in phpMyAdmin auswählen. Sie gehören nicht in den öffentlichen Webspace.

## 4. Historische Beobachtungen importieren

Der aktuelle lokale Master `var/bitcoin-backfill-cointime-cftc-options.csv` enthält 816.644 Beobachtungen aus 169 Kennzahl-IDs, ist 163.291.384 Bytes groß und hat SHA-256 `5648cc89f50fc0ffa97fe96e3b2aa4ff7c43e58c05adee0d6768bb90668ebeab`. Kein Eintrag liegt nach dem 28.09.2026. Darin sind 185 BTC-only Optionsflusswerte aus fünf Kennzahlen vom 05.08. bis 10.09.2026, 36 BTC-only Deribit-Options-OI-Tageswerte vom 06.08. bis 10.09.2026, 36 Bitcoin-only Futuresbasiswerte, 98 BTCUSDT-only Funding- und 24h-OI-Werte, 21 BTC-Perpetual-Volumenwerte, 12.944 private Bitview-Tageswerte für zwei Bitcoin-Kennzahlen, 19.416 private Adressbestandswerte für drei BTC-Schwellen, 6.472 private Taproot-Anteilswerte und 38.832 private HODL-Waves-Werte enthalten. Eine bytegenaue Sicherung liegt unter `var/bitcoin-backfill-cointime-cftc-options-before-bitview-taproot-share-2026-09-30.csv`. Der Master ist wegen der privaten Bitview-Messwerte nicht für eine öffentliche Datenbank freigegeben. Der tatsächliche Remote-Datenbankstand ist unbekannt; die sichtbare Live-Seite zeigte beim letzten Check am 29.09.2026 noch keine Beobachtungen. Prüfe, dass `var/.htaccess` vorhanden ist.

Der tatsächliche Datenbankstand ist unbekannt. Importiere den aktuellen lokalen Master nicht in eine öffentlich erreichbare Datenbank: Er enthält private Bitview-Forschungswerte ohne geklärte öffentliche Messdatenrechte. Ein späterer Datenimport braucht eine bereinigte, freigegebene Datenfassung und eine separate Prüfung des Migrationsstands. Nicht allein aus einer lokalen CSV-Anzahl auf den Datenbankstand schließen.

Die Rohdateien `openbitcoin-history-2026-09-28.json`, `openbitcoin-supplemental-2026-09-28.json`, `pools-2026-09-29.json`, `fear-greed-2026-09-29.json`, `fees-2026-09-29.json`, `mempool-2026-09-29.json` und `deribit-options-iv-source.csv` bleiben lokal in `var/`; sie müssen nicht hochgeladen werden. Der 29.09.-Pool- und Gebührensnapshot ist absichtlich nicht im Stichtagsmaster enthalten. Historische Fee-Samples und tägliche Mempool-Mittel sind quellspezifische Reihen, keine lückenlose Tagesreihe.

Der Aufruf mit `/usr/bin/php` war kein erfolgreicher Import: dieses Binary meldet `cgi-fcgi`, während der Importer zwingend `cli` benötigt. Der danach getestete Suchbefehl war ebenfalls ungeeignet, weil er mit `-r` und PHP-Pfad-Wildcards arbeitete. Er gab daher Fehlermeldungen statt einer eindeutigen SAPI-Prüfung aus.

STRATOs WP-CLI-Dokumentation zeigt ein separates PHP-CLI-Binary im Muster `/opt/RZphpXX/bin/php-cli` und weist darauf hin, den Pfad an die PHP-Version anzupassen. Für dieses Hostingkonto ist `/opt/RZphp83/bin/php-cli` nun bestätigt: `-v` gab `PHP 8.3.33 (cli)` aus. Der folgende Befehl prüft die PHP-Versionsausgabe und startet den Import nur, wenn sie `cli` enthält.

Führe in PowerShell genau diesen einen Befehl aus. Der von dir bestätigte Dashboard-Pfad wird verwendet. Nach dem Passwortprompt wird das CLI-Binary geprüft; nur bei einer Versionsausgabe mit `cli` startet der Import. Eine fehlende Datei oder eine CGI-Version führt dazu, dass der Importteil übersprungen wird.

```powershell
ssh -p 22 stu969337242@5221695.ssh.w1.strato.hosting "cd smstark-projekt.de/dashboards/bitcoin && /opt/RZphp83/bin/php-cli -v | grep cli && /opt/RZphp83/bin/php-cli -f ./cron/import-observations.php ./var/bitcoin-backfill-cointime-cftc-options.csv"
```

Bei Erfolg hängen die Zählwerte vom zuvor verifizierten DB-Stand ab. Schicke mir anschließend die Ausgabe ab der PHP-Versionszeile. Schicke kein Passwort. Falls `/opt/RZphp83/bin/php-cli` nicht existiert oder keine `cli`-Versionszeile ausgibt, startet der Import nicht; dann muss STRATO den CLI-Pfad für PHP 8.3 dieses Hostingpakets bestätigen. Die CSV niemals über einen öffentlichen PHP-Uploader verarbeiten.

## 5. Rechte und tägliche Aktualisierung

STRATO verwendet üblicherweise `644` für Dateien und `755` für Verzeichnisse. `var/` muss für den PHP-CLI-Prozess schreibbar sein. Falls ein Schreibfehler auftritt: in FileZilla rechts auf `var/` klicken → **Dateiberechtigungen** → für dieses Verzeichnis `755` setzen. Keine Rechte pauschal auf `777` setzen. Die `.htaccess`-Dateien in `config/`, `includes/`, `cron/` und `var/` erhalten.

STRATO-Cronjobs hängen vom Alter und der Plattform des Pakets ab. Im Kunden-Login prüfen, ob **Verwaltung → Cron-Jobs** vorhanden ist. STRATO nennt Cron auf der Legacy-Plattform ab Hosting Plus; auf der neuen Plattform ist Cron laut FAQ derzeit nicht verfügbar. Ein aktuelles Basic-Paket hat Cron daher nicht automatisch. Bei neu bestellten Paketen ab 31.03.2025 oder einem Webspace-Pfad beginnend mit `/home/www` ist es laut STRATO die neue Plattform. Ohne Cron laufen Dashboard und bereits importierte Daten weiterhin, aber automatische tägliche Aktualisierungen entfallen.

Erst nach erfolgreichem manuellen Import und einem erfolgreichen Testlauf einen täglichen STRATO-Cronjob einrichten. Den absoluten Dashboard-Pfad mit `pwd` feststellen, nachdem du per SSH in `dashboards/bitcoin` gewechselt bist. In der Cron-Konfiguration `<ABSOLUTER_DASHBOARD_PFAD>` durch genau diesen ausgegebenen Pfad ersetzen:

```sh
BITCOIN_PHP_BIN=<NACHGEWIESENER_PHP-CLI-PFAD> /bin/sh <ABSOLUTER_DASHBOARD_PFAD>/cron/run-daily.sh
```

Verwende für dieses Hostingkonto `/opt/RZphp83/bin/php-cli`. `/usr/bin/php` ist als `cgi-fcgi` erkannt worden und darf nicht für den Import oder Cron verwendet werden. STRATO begrenzt einen Cronlauf auf 15 Minuten. Die Kommandozeile des Cronjobs wird laut STRATO nicht verschlüsselt gespeichert; deshalb keine Datenbankpasswörter als Befehlsargument übergeben. Das Dashboard-Skript liest die Zugangsdaten aus `config/bitcoin.php`.

## 6. Nicht hochladen

- `README.md` und diese Anleitung
- `sql/` und `tools/`
- `config/bitcoin.example.php`
- Rohdaten und Zwischenstände aus `var/`
- `var/bitcoin-backfill-cointime-cftc.csv` (ältere Variante)
- `var/bitview-research-candidates.csv`
- `var/deribit-options-iv-source.csv`

Für den Datenbankimport ist der aktuelle Master im durch `.htaccess` geschützten `var/`-Ordner vorgesehen. Die alten Folgeimportdateien passen nicht zum aktuellen Stichtagsstand. Rohdateien und Importzwischenstände unter `var/` dienen als lokale Dokumentation und müssen nicht hochgeladen werden.

## 7. Nach dem Upload prüfen

Im Browser müssen diese Dateien HTTP 200 liefern:

- `https://smstark-projekt.de/dashboards/bitcoin/`
- `https://smstark-projekt.de/dashboards/bitcoin/assets/css/bitcoin.css?v=20260929-chart-pools-1`
- `https://smstark-projekt.de/dashboards/bitcoin/assets/js/bitcoin.js?v=20260929-axis-hover-2`
- `https://smstark-projekt.de/dashboards/weltmarkt/assets/vendor/chart.umd.min.js`
- `https://smstark-projekt.de/dashboards/bitcoin/data/catalog.json`
- `https://smstark-projekt.de/dashboards/bitcoin/api/bitcoin/metrics.php`
- `https://smstark-projekt.de/dashboards/bitcoin/api/bitcoin/series.php?metric=price_usd&start=2009-01-09&end=2026-09-28`

Nach dem Datenbankimport muss `metrics.php` die 204 Kennzahl-IDs liefern und der Bitcoin-Master Daten bis einschließlich 28.09. enthalten. Im Browser muss der Chart eine beschriftete Y-Achse zeigen; bei einer ausschließlich nichtnegativen Reihe beginnt sie bei 0. Beim Bewegen der Maus über eine Linie muss ein Tooltip mit Datum, Wert und Quelle erscheinen. Diese Pfade müssen 403 oder 404 liefern und dürfen keinen Quelltext oder CSV-Inhalt anzeigen:

- `/dashboards/bitcoin/config/bitcoin.php`
- `/dashboards/bitcoin/includes/bitcoin/bootstrap.php`
- `/dashboards/bitcoin/cron/import-observations.php`
- `/dashboards/bitcoin/var/bitcoin-backfill-cointime-cftc-options.csv`

Wenn CSS, JavaScript oder JSON 403 liefern, Dateirechte und `.htaccess` einzeln prüfen. `index.html` mit HTTP 200 beweist nicht, dass die Assets oder API erreichbar sind.

## STRATO-Hilfe

- [WP-CLI und PHP-CLI-Pfad bei STRATO](https://www.strato.de/faq/hosting/WP-CLI-bei-STRATO/)
- [SFTP/SSH-Zugang und Upload](https://www.strato.de/faq/hosting/so-nutzen-sie-ihren-ssh-sftp-zugang/)
- [Datenbank mit phpMyAdmin verwalten](https://www.strato.de/faq/hosting/so-nutzen-sie-unsere-datenbank/)
- [PHP-Version einstellen](https://www.strato.de/faq/hosting/wie-aendere-ich-meine-php-einstellungen-im-hosting-paket/)
- [Cronjobs einrichten](https://www.strato.de/faq/hosting/so-einfach-richten-sie-ihre-cron-jobs-ein/)
- [Hosting-Plattform erkennen](https://www.strato.de/faq/hosting/wie-erkenne-ich-die-plattform-meines-hosting-pakets/)
- [Datei- und Verzeichnisrechte](https://www.strato.de/faq/hosting/so-stellen-sie-die-zugriffsberechtigungen-von-dateien-ein-chmod/)
