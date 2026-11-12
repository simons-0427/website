---
type: project
status: done
owner: human
updated: 2026-09-26
project: Ernährungsrechner
---

# Ernährungsrechner

## Beschreibung

Der Ernährungsrechner sucht in Deutschland einen möglichst günstigen Tagesplan, der Energie- und Nährstoffgrenzen erfüllt. Er dient zugleich dazu, Datenanalysekompetenzen anhand einer echten Optimierungsanwendung zu zeigen.

Eine Lebensmitteldatenbank mit Preisen und Nährwerten wird mit einem Profil aus Körperdaten, Aktivität, Ziel und Ernährungsstil verbunden. Alle im Datenbestand angelegten Ernährungsstile können über Filter berücksichtigt werden. Der Solver sucht die günstigste Kombination aus Lebensmitteln, deren Mengen die gesetzten Grenzen erfüllen. Als Ergebnis erscheinen Lebensmittel, Mengen, Kostenanteile und Nährstoffsummen.

Technisch liegen die Anwendung und Daten unter ernaerung/. HTML, JavaScript und JSON laufen ohne Konto und ohne Serverberechnung im Browser. Der Solver kann in einem Worker laufen, Änderungen werden lokal gespeichert. Herkunft und Aktualität der Preis- und Nährwertdaten werden ausdrücklich als offene Datenfrage dokumentiert.

## Status

Das Projekt ist abgeschlossen und wird als v1.2 geführt. Die Preis- und Nährwertdaten beziehen sich auf Deutschland; ihre konkrete Herkunft und Aktualität bleiben als Datenbestandteil sichtbar.

## Belegbasis

- Lokale Quelle: C:/Users/simon/Desktop/Project DoubleUp/smstark-projekt.de
- projekte/ernaehrungsrechner.html
- ernaerung/index.html
- ernaerung/database.json
- ernaerung/requirements.json
- ernaerung/solver.js
- ernaerung/plan-worker.js
- data/v1.2_Ernaehrungsrechner.zip
- Öffentliche Anwendung: https://smstark-projekt.de/ernaerung/



### Englische Variante

Die deutsche Anwendung unter ernaerung/ bleibt unverändert. Die englische Oberfläche liegt separat unter en/nutrition/index.html. Sie bietet die Markt- und Währungsauswahl US-Dollar (USD), Euro in Deutschland (EUR) und britisches Pfund (GBP). US-Dollar ist der Standardmarkt, wenn keine bestehende lokale Auswahl gespeichert ist. Die Auswahl wird weiterhin lokal im Browser gespeichert.

Am 21.09.2026 wurde die Euro-Auswahl sichtbar ergänzt, US-Dollar als Standard gesetzt und die ungültige Markt-Fallback-Auswahl ebenfalls auf US-Dollar gestellt.

Die englische Website-Einbindung und die gemeinsam genutzte Datenstruktur sind in [[Website auf Englisch]] dokumentiert.
