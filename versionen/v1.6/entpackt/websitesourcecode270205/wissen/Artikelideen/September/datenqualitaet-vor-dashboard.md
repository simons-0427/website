# Datenqualität vor Dashboard: Was muss stimmen, bevor du etwas auswertest?

**Geplante Veröffentlichung:** 11. September 2026  
**Wissensblock:** Datenanalyse

## Die Idee

Ein Dashboard kann sauber aussehen und trotzdem falsche Antworten liefern. Der häufigste Fehler liegt nicht im Diagramm, sondern in den Daten darunter: fehlende Werte, doppelte Zeilen, unterschiedliche Einheiten oder Zeiträume, die nicht zusammenpassen.

Der Artikel soll zeigen, dass Datenanalyse mit einer Prüfung beginnt und nicht mit einer Grafik. Das passt zur Seite, weil viele Rechner und Backtester nur dann sinnvoll sind, wenn Eingaben, Einheiten und Zeitreihen sauber behandelt werden.

## Der geplante Inhalt

Am Anfang steht eine kleine Checkliste, die jeder vor einer Auswertung durchgehen kann. Woher kommen die Daten? Welches Datum und welche Einheit hat jede Spalte? Gibt es Duplikate? Fehlen Werte? Sind Nullwerte echte Nullen oder nur Platzhalter? Wurde eine Zahl als Prozent gespeichert, obwohl sie als Dezimalzahl erwartet wird?

Danach folgt ein Beispiel mit einer monatlichen Portfolio-Zeitreihe. Eine Rendite von 5 Prozent kann 0,05 oder 5 bedeuten. Ein fehlender Monat kann als leerer Wert auftauchen oder versehentlich mit null Prozent Rendite in die Berechnung eingehen. Beides verändert das Ergebnis, obwohl das Dashboard später perfekt aussieht.

## Was der Leser mitnehmen soll

Der Artikel soll einen klaren Ablauf vermitteln: Rohdaten sichern, Struktur prüfen, Werte normalisieren, Plausibilitätsgrenzen definieren und erst danach Kennzahlen berechnen. Für jede Prüfung wird kurz erklärt, warum sie wichtig ist und wie man einen Fehler erkennt.

Besonders wichtig ist der Unterschied zwischen einem technischen Fehler und einer fachlich falschen Definition. Eine Formel kann korrekt laufen und trotzdem die falsche Frage beantworten. Wer etwa den Durchschnitt aller Monatsrenditen berechnet, hat damit noch nicht automatisch die annualisierte Rendite eines Portfolios bestimmt.

## Verbindung zu bestehenden Inhalten

Der Beitrag kann auf die Assetklassen-Auswertung und den Ernährungsrechner verweisen. In beiden Fällen muss zuerst feststehen, welche Einheiten und Regeln gelten. Als spätere Erweiterung wäre ein kleines Datenprüfungs-Modul sinnvoll, das Warnungen ausgibt, bevor ein Chart oder Solver gestartet wird.

