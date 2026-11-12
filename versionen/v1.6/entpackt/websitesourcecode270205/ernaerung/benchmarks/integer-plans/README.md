# Benchmark für ganze Mengen

Die interaktive Testseite liegt in [../index.html](../index.html). Sie bietet
sechs Verfahren für ganze Mengen und vergleicht sie mit deinem aktuellen
Profil und Lebensmittel-Pool. Sie übernimmt vorhandene lokale Einstellungen
beim ersten Lesen. Änderungen auf der Testseite werden separat gespeichert.
Wenn der Browserspeicher für eine zweite Datenbankkopie nicht reicht, bleiben
die Änderungen bis zum Neuladen im Arbeitsspeicher.

Im Ordner `ernaerung` starten:

```powershell
node benchmarks/serve.js
```

Dann `http://127.0.0.1:8000/benchmarks/` öffnen, unter „Günstiger Plan“
ein Verfahren auswählen oder „Alle vergleichen“ anklicken. Für die
Hauptseite gilt `http://127.0.0.1:8000/`. Der lokale Server ist nötig, damit
der Browser die JSON-Dateien laden kann.
Änderungen an Profil, Anforderungen, Lebensmitteln oder Solver-Auswahl markieren
den bisherigen Plan als veraltet. Eine neue Planberechnung startet erst mit
„Plan berechnen“.

Die reproduzierbare Node-Messung lädt `database.json`, `requirements.json` und `parameter.md`
wie die Testseite. Sie normalisiert die Lebensmittel und prüft zehn Profile
mit 55 oder 56 aktiven Bedingungen. Alle ausgegebenen Mengen sind ganze g,
ml, Stück oder Tropfen. Ergebnisse und Grenzen stehen in
[REPORT.md](REPORT.md).

Ausführen im Ordner `ernaerung`:

```powershell
$env:HEAVY_APP='1'; $env:HEAVY_ONLY_APP='1'; $env:HEAVY_ALGORITHM='hybrid'; $env:HEAVY_REPEAT='3'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_ALGORITHM='original'; $env:HEAVY_REPEAT='1'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_SOURCE='main'; $env:HEAVY_ALGORITHM='hybrid'; $env:HEAVY_REPEAT='3'; node benchmarks/integer-plans/heavy.js
$env:HEAVY_SOURCE='en'; $env:HEAVY_ALGORITHM='hybrid'; $env:HEAVY_REPEAT='3'; node benchmarks/integer-plans/heavy.js
node benchmarks/integer-plans/worker-test.js
node benchmarks/plan-state-test.js
```

`heavy-app-results.json` enthält die 30 Siegerläufe.
`heavy-original-results.json` enthält die zehn Originalläufe. Für den Vergleich
der Einzelverfahren siehe die weiteren Befehle im Bericht. `integration.js`
und `run.js` prüfen zusätzlich zehn einfachere technische Profile. Die Profile
sind keine Ernährungsempfehlungen. Laufzeiten gelten für den getesteten
Rechner. Der Browser-Worker wurde protokollseitig geprüft; Browserzeiten wurden
hier nicht gemessen.

`heavy-main-results.json` und `heavy-en-results.json` messen die beiden
Produktionsseiten. Die englische Seite nutzt standardmäßig US-Preise. Die
Umgebungsvariable `HEAVY_SOURCE` für die Benchmarkseite anschließend entfernen.
