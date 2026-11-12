# Ganze Mengen bei vielen Anforderungen

Stand: 5. Oktober 2026. Gemessen wurde auf diesem Windows-Rechner mit Node
24.18. Die Anwendung verwendet 1.516 normalisierte Lebensmittel aus
`database.json`, `requirements.json` und `parameter.md`. Die zehn Testprofile
aktivieren jeweils 55 oder 56 Solverbedingungen. Es sind technische Lastfälle,
keine Ernährungsempfehlungen.

Die Hauptseite `index.html` und die englische Seite `../en/nutrition/index.html`
verwenden für ganze Mengen den gestuften Sieger. Der ursprüngliche direkte
Ganzzahlansatz bleibt auf der interaktiven Testseite `benchmarks/index.html`
als Vergleichsverfahren verfügbar.

## Antwort auf die Geschwindigkeitsfrage

Für diese Anwendung ist ein **gestuftes Verfahren** am schnellsten, das in
allen zehn Vollprofilen einen gültigen Plan findet:

1. Ein kontinuierliches LP berechnet die Kostenuntergrenze und eine kleine
   Trägermenge von Lebensmitteln.
2. Gramm und Milliliter werden gerundet. Eine Reparatur mit vorberechneten
   Nährwertkoeffizienten prüft und korrigiert alle aktiven Grenzen.
3. Bei Stück und Tropfen löst ein kleines gemischtes Modell nur diese Variablen
   ganzzahlig. Danach wird die Rundung der übrigen Mengen geprüft und repariert.
4. Bei Bedarf werden zwei passende Lebensmittel je Mindestwert ergänzt.
   Bleibt der Plan ungültig, werden die wenigen gebrochenen Stückwerte als
   Kombinationen geprüft. Ohne solche Werte hilft ein Ganzzahlmodell in einer
   engen Umgebung der LP-Lösung.
5. Größere Ganzzahlmodelle sind zeitlich begrenzte Rückfälle. Jede Solverantwort
   wird unabhängig nachgerechnet. Ein unbestätigter Plan wird nicht ausgegeben.

Der gestufte Testseitenpfad wurde **dreimal je Profil** ausgeführt. Alle 30 Läufe
lieferten ganze Mengen und erfüllten die verwendeten Grenzen. Der Median der
zehn Profilmediane betrug **115,5 ms**; der langsamste Profilmedian war **196 ms**.
Die Zeiten sind Rechenkernzeiten mit synchronem Solver-Fallback in Node.

Nach der Übernahme wurden beide Produktionsseiten mit je drei Läufen pro
Profil separat geprüft. Die deutsche Hauptseite lieferte **30 von 30** gültigen
Plänen, der Median der zehn Profilmediane lag bei **118 ms**. Die englische
Seite mit US-Preisen lieferte ebenfalls **30 von 30** gültigen Plänen, bei
**112,5 ms** Median der Profilmediane. Wenn die erste Trägermenge bei US-Preisen
nicht reicht, sucht die englische Seite eine zweite LP-Trägermenge. Der Plan
wird weiterhin gegen alle Grenzen geprüft und mit US-Preisen bewertet. Der
langsamste englische Profilmedian lag bei **3.449 ms**. Rohdaten:
`heavy-main-results.json` und `heavy-en-results.json`. Browserzeiten wurden
nicht gemessen.

Der ursprüngliche direkte Ganzzahlansatz wurde einmal je Vollprofil gemessen.
Er benötigte **8.013 bis 8.047 ms**, Median **8.027,5 ms**, und lieferte in
**0 von 10** Profilen einen unabhängig bestätigten Plan. Neun Solverantworten
meldeten trotzdem `feasible`; nach Rundung verletzten sie mindestens eine
Anforderung. Das Limit begrenzt die Suche, es beweist keine Unlösbarkeit.
Die Messreihen stehen in `heavy-original-results.json` und
`heavy-app-results.json`. Browserzeiten wurden nicht gemessen.

| Vollprofil | Aktive Bedingungen | Pool | Median | Gewählter Weg |
|---|---:|---:|---:|---|
| Standard | 55 | 1516 | 122 ms | Stück-MILP und Reparatur |
| Normales Protein | 55 | 1516 | 80 ms | Stück-MILP, erweiterte Reparatur |
| Sehr aktiv | 55 | 1516 | 135 ms | LP-Rundung und Reparatur |
| Weiblich | 55 | 1516 | 109 ms | Stück-MILP und Reparatur |
| Vegan | 55 | 876 | 196 ms | 16 Stückkombinationen |
| Whole Food | 55 | 499 | 27 ms | Eng begrenztes MILP |
| Mehr Mikronährstoffe | 55 | 1516 | 126 ms | Stück-MILP und Reparatur |
| Omega-Verhältnis | 56 | 1516 | 99 ms | LP-Rundung und Reparatur |
| EPA/DHA | 56 | 1516 | 155 ms | LP-Rundung und Reparatur |
| Glutenfrei | 55 | 1369 | 63 ms | Erweiterte Reparatur |

Die Rohdaten einschließlich aller drei Siegerläufe und Solveraufrufe stehen in
`heavy-app-results.json`. Die Testseite markiert einen gültigen Plan als
Näherung, wenn sein globales Preisoptimum nicht belegt ist. Das traf hier auf
acht der zehn Profile zu. Gültigkeit und Kostenoptimalität sind getrennte
Aussagen.

## Vergleich der Verfahren

`heavy-results.json` enthält die Einzelverfahren auf denselben normalisierten
Profilen. `heavy-direct-results.json` prüft zusätzlich reine Ganzzahlmodelle
auf der LP-Trägermenge mit einem Limit von 1.000 ms pro Modell.

| Verfahren | Gültige Profile | Stärke | Schwäche |
|---|---:|---|---|
| LP-Rundung mit vorberechneter Reparatur | 5/10 | Sehr schnell, meist wenige Millisekunden nach dem LP | Kann an gleichzeitig knappen Minima und Maxima hängen bleiben |
| Nur Stück/Tropfen ganzzahlig, danach Reparatur | 4/10 | Günstigere Pläne bei unteilbaren Tabletten, kleiner Suchraum | Allein nicht für jedes Filterprofil ausreichend |
| Alle Mengen ganzzahlig in 1-g-Schritten | 1/10 | Modelliert die ganzen Einheiten direkt | Unter Zeitlimit häufig keine nachgeprüft gültige Lösung |
| Gramm und Milliliter in 5-g-Schritten | 1/10 | Weniger mögliche Mengen | Schränkt die Auswahl zusätzlich ein, ohne hier verlässlich schneller zu werden |
| Gestufter Testseitenpfad | 10/10 | Kombiniert die schnellen Sonderfälle und prüft jede Lösung | Mehr Implementierungsaufwand, globales Optimum oft nicht belegt |

Beim direkten 1-g-Modell lag die Medianlaufzeit am Zeitlimit von rund 999 ms.
Der Solver setzte in allen zehn Fällen sein `feasible`-Flag, aber nur ein
Ergebnis bestand die unabhängige Prüfung. Bei 5-g-Schritten bestand ebenfalls
nur ein Ergebnis. Ein Solver-Flag allein ist hier kein gültiger Plan.

Das LP mit anschließender bloßer Rundung war schon in der ersten Reihe mit
zehn einfacheren Profilen in keinem Fall gültig. Diese Reihe liegt in
`results.json`; `integration-results.json` prüft dieselben zehn Profile gegen
den gestuften Solver der Testseite. Für die Frage nach vielen Anforderungen
sind die Vollprofile oben entscheidend.

## Korrektheit und Grenzen

- Die Prüfung summiert die Mengen erneut für alle aktiven Schranken, darunter
  Makro- und Mikronährstoffe, Schadstoffe, Aminosäurebedingungen und optionale
  Verhältnisse. Außerdem verlangt sie ganze physische Mengen.
- Die 0,3-Prozent-Schwelle vergleicht den Planpreis mit einer berechneten
  LP-Untergrenze. Bei gebrochenen Stückwerten wird diese durch zwei LP-Zweige
  verschärft. Ein größerer Abstand bedeutet nur, dass das Optimum nicht belegt
  ist; er beweist keine tatsächliche Fehloptimierung um diesen Betrag.
- Die Kandidatenauswahl und die Reparatur sind Heuristiken. Die zehn Profile
  belegen ihr Verhalten für die aktuelle Datenbank, nicht für jede denkbare
  Kombination selbst bearbeiteter Lebensmittel und Anforderungen.
- `plan-worker.js` wurde für Einzel- und Batch-Aufträge mit `worker-test.js`
  geprüft. Ein Browserlauf konnte hier nicht abgeschlossen werden: Headless
  Chrome brach vor dem Laden der Seite am GPU-Prozess ab, und die verfügbare
  Browsersteuerung bot keinen Browser an. Browserlaufzeiten und Worker-Startzeit
  sind daher nicht belegt.
- Die Nährwert- und Preisqualität der Datenbank wird durch einen schnellen
  Solver nicht verbessert.

## Reproduzieren

Im Ordner `ernaerung`:

```powershell
$env:HEAVY_APP='1'; $env:HEAVY_ONLY_APP='1'; $env:HEAVY_ALGORITHM='hybrid'; $env:HEAVY_REPEAT='3'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_ALGORITHM='original'; $env:HEAVY_REPEAT='1'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_SOURCE='main'; $env:HEAVY_APP='1'; $env:HEAVY_ONLY_APP='1'; $env:HEAVY_ALGORITHM='hybrid'; $env:HEAVY_REPEAT='3'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_SOURCE='en'; $env:HEAVY_APP='1'; $env:HEAVY_ONLY_APP='1'; $env:HEAVY_ALGORITHM='hybrid'; $env:HEAVY_REPEAT='3'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_MODES='heuristics'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_MODES='integers-short'; $env:HEAVY_TIMEOUT_MS='1000'; node benchmarks/integer-plans/heavy.js
node benchmarks/integer-plans/integration.js
node benchmarks/integer-plans/worker-test.js
```

Die Umgebungvariablen der jeweiligen Zeile gelten in PowerShell auch für
folgende Zeilen. Für einen einzelnen Lauf können sie danach mit
`Remove-Item Env:HEAVY_APP,Env:HEAVY_ONLY_APP,Env:HEAVY_ALGORITHM,Env:HEAVY_REPEAT,Env:HEAVY_MODES,Env:HEAVY_TIMEOUT_MS -ErrorAction SilentlyContinue`
entfernt werden.
