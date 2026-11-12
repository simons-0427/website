Bitcoin: Waehrungen und Vergleichsanzeige, 25.10.2026

Hochladen:
Die fuenf Dateien aus diesem Paket mit derselben Ordnerstruktur in den
vorhandenen Serverordner dashboards/bitcoin hochladen und ersetzen:

index.html
assets/css/bitcoin.css
assets/js/bitcoin.js
assets/js/display.js  (neu)
api/bitcoin/metrics.php

Serverordner:
/mnt/web118/d1/95/5221695/htdocs/smstark-projekt.de/dashboards/bitcoin

Keine SQL-Dateien importieren. Kein SSH-Befehl erforderlich. Den bestehenden
Bitcoin-Cronjob nicht aendern. ANLEITUNG.txt muss nicht hochgeladen werden.

Danach im Browser die Bitcoin-Seite mit Strg+F5 neu laden.
Im Kopfbereich sind Original sowie EUR, GBP, USD, JPY und CNY auswaehlbar.
Unter den Uebersichtskarten stehen Anzeige (Relativ/Absolut) und Vergleich
(Letzter Datenpunkt, 1 Jahr, 3 Jahre, 10 Jahre, Maximum).
Beide Vergleichseinstellungen gelten fuer die Uebersichts- und Katalogkarten.
Der Diagrammzeitraum bleibt separat einstellbar, wie beim Weltmarkt.

Historische Kurse:
Die Seite liest die bereits gespeicherten Weltmarkt-Reihen eurusd, gbpusd,
usdjpy und usdcny ueber /dashboards/weltmarkt/api/weltmarkt/series.php.
Sie werden bei der ersten Waehrungsauswahl einmal geladen und bis zum
Neuladen der Seite wiederverwendet. Es gibt keinen neuen externen API-Import.
Die Kurse werden weiterhin durch den bestehenden Weltmarkt-Import gepflegt.
Die Datenbanken des Weltmarkts und des Bitcoin-Dashboards bleiben getrennt.

Umrechnung:
USD -> EUR oder GBP: USD-Wert durch USD je EUR bzw. GBP teilen.
USD -> JPY oder CNY: USD-Wert mit JPY bzw. CNY je USD multiplizieren.
Andere Kreuzkurse laufen ueber USD. Fuer jeden Bitcoin-Tag wird ausschliesslich
ein historischer Kurs von diesem Tag oder einem vorherigen Handelstag verwendet.
Es werden hoechstens sieben Kalendertage ueberbrueckt. Davor, danach oder bei
fehlenden Kursen bleiben die Werte leer. Original zeigt die gespeicherten Werte.
Geldbetraege werden umgerechnet; Prozent-, BTC- und Netzwerkwerte bleiben gleich.
Bereits gespeicherte USD-Ableitungen werden in die Anzeigewaehrung umgerechnet,
nicht aus einer neuen umgerechneten Bitcoin-Historie neu berechnet.

Vergleich:
Relativ = (letzter Wert - Vergleichswert) / Betrag(Vergleichswert) * 100.
Absolut = letzter Wert - Vergleichswert in der Kennzahleneinheit.
Bei Prozentreihen zeigt Absolut Prozentpunkte. Ein Vergleichswert von null
erlaubt keine relative Aenderung ausser bei unveraendertem Nullwert.
1/3/10 Jahre verwenden den ersten gespeicherten Wert innerhalb des Zeitfensters,
gerechnet vom letzten gespeicherten Beobachtungstag, wie beim Weltmarkt.
Maximum verwendet den ersten gespeicherten Wert. Fehlende Vergleiche bleiben leer.
Bei Waehrungsumrechnung werden beide Vergleichswerte zum jeweils damaligen Kurs
umgerechnet. Ein einzelner Beobachtungstag hat noch keinen Vergleich.

Pruefung:
28 Rechen- und Randfalltests, 23.768 unabhaengige Decimal-Preispruefungen,
200 Vergleichsbasen fuer 50 Kennzahlen und Browserpruefung bei 1440, 390 und
320 Pixeln bestanden. Echte oeffentliche API-Daten wurden fuer die lokale
Vorschau gespeichert. Die Produktionsdatenbank wurde nicht veraendert.
PHP-Syntax ist geprueft. Die SQL-Abfrage wurde lokal auf SQLite mit angepasster
MySQL-Datumsfunktion ausgefuehrt. Ihre Ausfuehrung unter STRATO/MySQL sowie die
neue Live-Oberflaeche sind erst nach diesem Upload pruefbar.

Schnelltest nach dem Upload:
1. GBP auswaehlen: Preis, Karten, Werteachse und Hover zeigen GBP bzw. GBP/BTC.
2. Anzeige Absolut und Vergleich 1 Jahr einstellen: Karten zeigen den Unterschied.
3. Original auswaehlen: gespeicherte Originaleinheiten erscheinen wieder.
