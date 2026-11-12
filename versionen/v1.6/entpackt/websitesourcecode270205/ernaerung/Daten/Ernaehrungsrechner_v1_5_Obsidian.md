---
type: project
status: active
owner: human
updated: 2026-10-23
project: Ernährungsrechner
---

# Ernährungsrechner

## Beschreibung

Der Ernährungsrechner sucht einen günstigen Tagesplan, der Energie- und Nährstoffgrenzen erfüllt. Er dient zugleich dazu, Datenanalysekompetenzen anhand einer echten Optimierungsanwendung zu zeigen. Eine Lebensmitteldatenbank mit Preisen und Nährwerten wird mit Körperdaten, Aktivität, Ziel und Ernährungsstil verbunden. Das Ergebnis enthält Lebensmittel, Mengen, Kostenanteile und Nährstoffsummen.

HTML, JavaScript und JSON laufen ohne Konto und ohne Serverberechnung im Browser. Der Solver kann in einem Worker laufen. Datenbankänderungen, Profile und die Marktauswahl werden lokal gespeichert.

## Status

Am 23.10.2026 wurde v1.5 als Ordner und ZIP zusammengestellt und im bestehenden GitHub-Repository veröffentlicht. Die Veröffentlichung wurde anhand der Dateiinhalte geprüft; ältere Versionen sind erhalten. Die laufende Website wurde dabei nicht aktualisiert.

Die Version enthält 1.636 Lebensmittel, davon 120 neu ergänzte Einträge. Erweiterte Parameterfilter kombinieren mehrere Bedingungen und berücksichtigen auch den Preis. Parameter und Bedingungen haben zentrierte, durchsuchbare Auswahlfenster. Eiweißqualität steht direkt unter Eiweiß, Flüssigkeit am Ende.

Die deutsche und englische Oberfläche verwenden den verbesserten Solver für ganze Mengen. Der Plan wird nur auf Knopfdruck berechnet; relevante Änderungen lösen einen Hinweis aus. Aktive Grenzen werden nach der Optimierung zusätzlich geprüft. Ein globales Kostenminimum ist für ganzzahlige Pläne nicht in jedem Fall bewiesen.

## Datenbasis und Prüfung

Bei 73 neuen Lebensmitteln wurden passende BLS-4.0-Werte verwendet; 47 beruhen ganz oder teilweise auf Vergleichslebensmitteln. Die neuen deutschen Preise basieren auf dokumentierten ALDI-Nord- und Lidl-Angaben vom 21.10.2026 zuzüglich 10 % Aufschlag. US- und UK-Preise sind teilweise abgeleitet. PFAS-Werte sind Gruppenschätzungen und keine Messungen einzelner Produkte.

Das Paket enthält 13 Dateien ohne den gesamten Ordner `images/` einschließlich der Favicons. Filter und ganzzahlige Planberechnung wurden auf Deutsch und Englisch in Desktop- und Handyansichten im Browser geprüft. ZIP-Inhalt und Prüfsummen stimmen mit dem Paket überein. Die Dateien des GitHub-Stands wurden mit dem lokalen Commit abgeglichen.

## Englische Variante

Die englische Oberfläche liegt unter `en/nutrition/index.html` und nutzt Datenbank und Solver aus `ernaerung/`. USD ist ohne gespeicherte Auswahl der Standardmarkt; EUR und GBP sind ebenfalls auswählbar. Die sichtbare Euro-Auswahl und der USD-Fallback wurden am 21.09.2026 ergänzt. Die Website-Einbindung ist in [[Website auf Englisch]] dokumentiert.

## Dateien und Veröffentlichung

- Lokale Quelle: `C:/Users/simon/Desktop/Project DoubleUp/smstark-projekt.de`
- Paket: `data/v1.5_Ernaehrungsrechner/`, ZIP: `data/v1.5_Ernaehrungsrechner.zip`
- Startanleitung, Upload-Pfade und Datenlimits: `data/v1.5_Ernaehrungsrechner/README.md`
- Anwendung: `ernaerung/index.html`, Daten: `database.json`, `requirements.json`, `requirements.js`, `parameter.md`, `pfas4-estimates.js`; Berechnung: `solver.js`, `plan-worker.js` im selben Ordner.
- [GitHub v1.5 mit ZIP und entpackten Dateien](https://github.com/simons-0427/ernaehrungsrechner/tree/main/versionen/v1.5), Commit `87bb052`.
- [Öffentliche Anwendung](https://smstark-projekt.de/ernaerung/), [Projektseite](https://smstark-projekt.de/projekte/ernaehrungsrechner.html).

## Nächster Schritt

Bei der nächsten Website-Veröffentlichung die Paketdateien gemäß README übertragen und beide Sprachversionen auf dem Zielserver prüfen. Dieser Serverabgleich steht noch aus.
