# Bitcoin-Datenarchiv vom 22.10.2026

Alle in INDEX.json aufgeführten Dateien wurden verschoben, nicht gelöscht. SHA-256 wurde vor und nach jeder Verschiebung verglichen. Der Index enthält bisherigen Pfad, Archivpfad, Dateigröße und Prüfsumme.

backups enthält Zwischenstände, legacy-master den bisherigen Gesamtmaster samt Manifest, research alte Forschungsdateien, sources frühere Rohdateien und historical-imports frühere Importdateien. tool-inputs enthält die bisher direkt unter tools abgelegten CSV-Dateien.

Der aktive Bestand liegt nach der Umstellung in var/bitcoin-core-master.csv, die Eingangsdaten in var/bitcoin-core-inputs.csv und die Abdeckungsübersicht in var/bitcoin-core-manifest.json. Die neuen Abläufe sind in CORE-DASHBOARD-UPDATE.md beschrieben.

Bei einer Wiederherstellung zuerst den Index und vorhandene Zieldateien prüfen. Bestehende aktive Dateien nicht ungeprüft überschreiben. Die Archivdateien enthalten auch private Forschungsdaten und sind nicht für eine öffentliche Veröffentlichung vorgesehen. Der übergeordnete var-Ordner bleibt durch .htaccess gesperrt.
