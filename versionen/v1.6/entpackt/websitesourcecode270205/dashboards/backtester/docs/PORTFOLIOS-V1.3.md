# Assetklassen-Backtester v1.3: Portfolios

## Bedienung

Direkt unter dem vollständigen Abschnitt „Ergebnis“ befindet sich ein eigener Portfolioabschnitt. Bis zu fünf eigene Portfolios
werden über `localStorage` ausschließlich im Browser auf dem jeweiligen Gerät
gespeichert. Die Vorlagen „Weltportfolio 60/40“ und „Defensiv 40/40/20“ belegen
keinen eigenen Speicherplatz. Bei fünf gespeicherten Portfolios muss vor einer
weiteren Modellierung ein vorhandenes Portfolio zur Bearbeitung geladen oder
ein Platz freigegeben werden. Laden, Duplizieren, Löschen und versionierter
JSON-Import/-Export stehen im Editor zur Verfügung.

„Portfolio fertigstellen“ prüft eine manuelle Allokation. „Portfolio aus Regeln optimieren“
sucht aus den ausdrücklich zugelassenen Anlageklassen und eingeschalteten Regeln die beste gefundene Allokation für das gewählte Ziel.
Vorher müssen keine vollständigen Gewichte vorgegeben werden. Zahlenfelder und Schieberegler werden synchron gehalten.

Die drei Basisregeln sind standardmäßig aktiv. Sie sehen wie die übrigen Regeln aus, lassen sich mit „×“ entfernen und über „Regel hinzufügen“ wieder aktivieren. Nur eingeschaltete Regeln blockieren eine Berechnung oder Modellierung. Ihre Grenzen können per Schieber verschärft werden:

- Alternative Anlagen insgesamt: 0 bis 100 %, Standard 30 %.
- Je alternative Anlageklasse: 0 bis 100 %, Standard 10 %.
- Volatilität: 0 bis 100 % der 60/40-Referenzvolatilität.

Weitere Regeln: Drawdown, Expected Shortfall 95 %, Risikobeitrag, Tracking Error
und Turnover. Drawdown und Expected Shortfall können absolut oder als Prozentsatz
des Referenzwerts begrenzt werden. 100 % im relativen Modus bedeutet den
Referenzwert. Rebalancing und Gewichtsband sind ebenfalls konfigurierbar.

Nur fertig geprüfte und in den Einstellungen ausdrücklich ausgewählte Allokationen erscheinen im bestehenden Gesamtvergleich, in der Marktübersicht, in den
Kennzahlentabellen und bei Risiko/Tagesverteilung. Beim Bearbeiten werden die
Auswertungen dieser Fassung entfernt. Andere fertig geprüfte Portfolios bleiben
erhalten. Gespeicherte Konfigurationen werden nach dem Neuladen gegen den
verfügbaren Datenstand erneut geprüft. Ein fehlgeschlagener Test entfernt keine
gespeicherte Konfiguration.

## Berechnung

- Long-only-Basisportfolio, vollständig investiert; Basiswährung EUR. Optionaler Hebel und Kosten stehen im eingeklappten Bereich „Hebel & Kosten“.
- Referenz: 60 % MSCI World und 40 % EUR-gesicherte globale IG-Anleihen,
  quartalsweise rebalanciert, immer ungehebelt und ohne zusätzliche Nutzerkosten.
- Alternativ: Bitcoin, Gold, breite Rohstoffe und beide Immobilienreihen.
- Die vorhandene API liefert die Daten. Portfolionamen, Gewichte und Regeln
  werden nicht an sie übertragen. Keine neuen Provider oder Datenbanktabellen.
- Nominale API-Renditereihen einschließlich ihrer vorhandenen
  Ausschüttungsmodelle. Keine Übernahme der globalen Einstellungen für
  persönliche Steuern, TER oder Inflation. Im Gesamtvergleich wird die Anzeigewährung gemeinsam umgerechnet; die Portfolio-Risikotabellen bleiben nominal in EUR. Die Abgrenzung wird
  in der Oberfläche erläutert. Immobilien verwenden reine Preisindizes.
- Auto-Raster: gemeinsame Handelstage bei ausreichend dichter Historie,
  sonst Monate; bei Quartalsreihen Quartale. Explizites Tagesraster weist
  langfristige Datenlücken und langsamere Reihen zurück.
- Nur echte Beobachtungen werden zu Perioden verdichtet. Lücken im gemeinsamen
  Monats-/Quartalsraster sind Fehler, keine zusätzlichen Nullrenditen.
- Bei Tagesreihen darf der letzte echte Kurs höchstens sieben Kalendertage vor dem jeweiligen Monats-/Quartalsende liegen. Die Toleranz berücksichtigt kurze Wochenend-/Feiertagslücken; eine mitten im Monat endende Reihe bildet keinen fiktiven Monatsendkurs. Native Monats-/Quartalsindizes mit einem Periodenbeginn als Datumsanker bleiben historische Periodenwerte. Echte Quelldaten werden separat ausgewiesen.
- Monatsportfolios zeigen keine Wochenrendite; Quartalsportfolios zeigen keine
  Wochen-/Monatsrendite. Kalenderperioden werden nicht durch pauschale 31-Tage-
  Abstände ersetzt.
- Gewichtungsdrift entsteht aus gehaltenen Anteilen. Rebalancing findet erst
  nach der betreffenden Periodenrendite statt und wirkt auf folgende Perioden.
- Marktbedingte Quotenüberschreitungen bis zum nächsten Rebalancing werden
  ausgewiesen. Verhindert eine Turnover-Grenze die Korrektur beim Rebalancing,
  wird die Konfiguration nicht als gültig ausgegeben.
- Expected Shortfall ist der mittlere Verlust der schlechtesten 5 % der
  beobachteten Perioden, mindestens 40 Renditebeobachtungen erforderlich.
- Risikobeiträge sind realisierte Varianzbeiträge der gewichteten
  Periodenrenditen einschließlich Drift. Negative Beiträge sind möglich.
  Bei Nullvarianz ist ein Prozentbeitrag nicht definiert.
- Die deterministische, begrenzte Suche prüft Kandidaten einschließlich der
  aktiven Regeln und bewertet sie nach dem gewählten Optimierungsziel. Sie beweist kein
  globales Optimum und keine Unlösbarkeit. Der Suchhinweis steht in der UI.
- Modellierung und Walk-forward laufen in einem Web Worker, damit die Seite
  bedienbar bleibt. Änderungen verwerfen überholte Ergebnisse.

## Portfoliotests

Die Oberfläche enthält historische Stressfenster, rollierende Volatilitäten,
Drawdown-Verläufe, Periodenverteilungen, Risikobeiträge sowie Gewichts- und
Umschichtungsverläufe. Stressfenster werden nur bei vollständiger gemeinsamer
Historie als verfügbar ausgewiesen.

Walk-forward modelliert vierteljährlich neu, anhand eines zurückliegenden
einstellbaren Schätzfensters. Die anschließenden Kurse sind nicht Bestandteil
der Allokationsentscheidung. Trainingszeitpunkte und Gewichte werden
ausgewiesen; realisierte Risiken werden separat gegenüber der Referenz
berichtet. Turnover wird auch am Übergang zwischen Testabschnitten beachtet.
Für amtliche Monats-/Quartalsdaten ohne belegte historische Veröffentlichungs-
und Revisionsstände ist dieser Test gesperrt und erklärt diese Einschränkung.

## Speichern und Laden

Schlüssel: `sms.asset-backtester.portfolios.v1`.

Gespeichert werden Version, stabile Kennung, Name, Beschreibung, Gewichte,
Regelgrenzen und deren Schalter, optionale Regeln, Zeitraum, Startkapital, Raster, Rebalancing,
Band, Schätzfenster, rollierendes Risikofenster, Hebel und TER je Position sowie zusätzliche Portfolio-TER und Finanzierungszins. Alte Konfigurationen ohne Hebel erhalten je Position 1× ohne Zusatzkosten; ein früherer gemeinsamer Hebel wird auf die enthaltenen Positionen übertragen. Nach Berechnung wird eine Datensicht mit Methode,
Berechnungszeit, tatsächlich genutztem Zeitraum, Quelldatenständen und
Ausschüttungsmodellen ergänzt. Das ist kein unveränderliches Kursarchiv.

Imports werden vollständig validiert, bevor geschrieben wird. Ein Import
überschreibt bestehende Portfolios nicht und darf die fünf Plätze nicht
überschreiten. Fehlerhafter oder nicht zugänglicher Speicher wird gemeldet;
ein Export bleibt grundsätzlich als Übertragungsweg verfügbar.

## Dateien und Prüfung

- `assets/js/asset-backtester/portfolio-engine.js`: reine Rechenlogik.
- `assets/js/asset-backtester/portfolio-store.js`: Speicher und JSON-Validierung.
- `assets/js/asset-backtester/portfolio-ui.js`: Editor und Ergebnisintegration.
- `assets/js/asset-backtester/portfolio-worker.js`: Berechnung im Hintergrund.
- `assets/js/asset-backtester/portfolio-comparison.js`: Einbindung in das gemeinsame Diagramm mit echten Beobachtungsdaten.
- `assets/css/portfolio.css`: gekapselte Oberflächenstile.
- `index.html` und `app.js`: Einbindung und erneute Ausgabe nach Tabellenupdates.

Prüfungen aus dem Backtester-Verzeichnis:

```powershell
node --test tests/js/*.test.mjs
node tests/portfolio-browser.mjs
node tests/portfolio-live-smoke.mjs
```

Der Browsertest verwendet die vorhandenen echten CSV-Importhistorien als
lesende API-Fixture. Er simuliert keine produktive PHP-/MySQL-Installation und
keine Ausschüttungsmodelle. Er prüft unter anderem fertige/ungültige Entwürfe,
Speicherrückgabe, fünf Plätze, Vorlagen, Regeln einschließlich Schiebereglern,
automatische Modellierung, Walk-forward, JSON-Import/-Export und Layout bei
1440, 390 und 320 Pixeln. Screenshots entstehen unter `tests/reports/portfolio/`.

Der gesonderte Live-Smoke-Test liest ausschließlich `assets.php` und
`series.php` der bestehenden öffentlichen API. Er prüft beide Standardportfolios
und eine Modellierung mit unabhängig erneut geprüfter Zulässigkeit. Er verändert
keine produktiven Daten und löst keinen Sync aus.

## Ergänzungen vom 27.10.2026

- Eigener Portfolioeditor nach dem Ergebnisabschnitt; Portfolioausgaben sind nicht mehr als separates Vergleichsdiagramm angeordnet.
- Fertige Portfolios und eine 60/40-Referenz erscheinen als gestrichelte Linien im bestehenden Gesamtvergleich. Die Diagrammdaten werden anhand tatsächlicher Datumswerte ausgerichtet. Außerhalb des ausgewerteten Portfoliozeitraums wird keine Historie ergänzt. Im gewählten Vergleichsintervall wird auf das Vergleichskapital am ersten verfügbaren Beobachtungstag normiert. Der Start steht im Liniennamen.
- Der Hinweis „Lokal auf diesem Gerät“ entfällt. Speichertechnik und fünf Plätze bleiben erhalten. „Portfolio speichern“ ist hellgrün.
- Deutscher und englischer Backtester verwenden den bestehenden gemeinsamen Website-Header mit aktiv markiertem DE/EN-Schalter. Die Vorschau liefert die gemeinsamen Headerdateien jetzt tatsächlich aus; zuvor fehlten diese auf dem nur auf den Dashboardordner begrenzten Testserver.
- Englische Portfoliooberfläche einschließlich Validierung, Ergebnissen und Worker unter `en/dashboards/backtester/`. Bestehendes sprachneutrales PHP-Backend bleibt gemeinsam.

### Hebel und Kosten

Jede Position besitzt einen eigenen Hebel von 1 bis 3 und eine eigene TER von 0 bis 5 % p.a. Standard: 1× und 0 %. Der gemeinsame Portfoliohebel wurde durch diese Positionshebel ersetzt. Unter „Weitere Kosten“ bleiben eine zusätzliche Portfolio-TER und ein Finanzierungszins von 0 bis 20 % p.a. verfügbar. Das ist ein frei parametriertes Periodenmodell, keine Nachbildung eines bestimmten Hebelprodukts und keine Schätzung tatsächlicher Produktkosten aus Kursdaten.

Für jede Position `i`, jede echte gemeinsame Beobachtungsperiode mit Anlageklassenrendite `r_i` und Kalenderdauer `y` in Jahren:

```text
Positionsfaktor_i = (1 + Hebel_i × r_i)
                   × (1 - TER_i / 100)^y
                   × exp(-Finanzierungszins / 100 × (Hebel_i - 1) × y)
                   × (1 - zusätzliche Portfolio-TER / 100)^y
```

Der Hebel wird je Datenperiode neu eingestellt, bei Monatsdaten also monatlich. Es wird keine tägliche Hebelwirkung aus Monatswerten behauptet. TER ist ein Abzug vom Eigenkapital. Finanzierung betrifft nur die zusätzlich geliehene Exposition. Bereits in einer Preisreihe enthaltene Kosten dürfen nicht nochmals eingetragen werden. Ein Totalverlust bricht die Berechnung mit Datum ab; negative Depotwerte werden nicht als gültige Ergebnisse ausgegeben.

Die Positionen entwickeln sich getrennt, bevor die gewählte Rebalancing-Regel angewandt wird. Dadurch ergibt sich ihre Gewichtungsdrift aus der jeweils gehebelten Entwicklung nach Kosten.

Eingeschaltete Alternativquoten gelten nach dem jeweiligen Hebel: beispielsweise höchstens 5 % Bitcoin-Basisgewicht bei 2× Bitcoin-Hebel und einer aktiven 10-%-Positionsgrenze. Die gemeinsame Alternativexposition ist die Summe der einzelnen Kapitalgewichte multipliziert mit dem jeweiligen Positionshebel. Abgeschaltete Regeln bleiben im Bericht als „Ausgeschaltet“ sichtbar. Optionale Regeln und die Prüfung gültiger Daten, 100-%-Gewichtssumme und Parameter bleiben wirksam.

Volatilitätsprüfung, Optimierung, Stresstests und Walk-forward verwenden die Ergebnisse nach den einzelnen Hebeln und Kosten. Der Optimierer verändert die Gewichte, nicht die eingestellten Positionshebel. Bei abgeschalteten Allokationsregeln ist auch eine Auswahl ausschließlich alternativer Anlagen zulässig. Die 60/40-Referenz bleibt ungehebelt und kostenfrei. Turnover misst die Hälfte der absoluten Gewichtsänderungen, je Position mit deren Hebel skaliert; zusätzliche Transaktionen zum periodischen Hebelreset werden nicht erfasst. Handelskosten und reale Kreditkonditionen werden nicht aus Kursdaten abgeleitet.

### Aktuelle Prüfung und Upload

68 Rechentests bestanden. Ergänzt wurden unabhängige Regelschalter, verschiedene Positionshebel und Gewichtungsdrift, positionsbezogene TER und Finanzierung, unveränderte Referenz, Alternativexposition nach Hebel, alternative-only-Modellierung sowie Speichern und Migration. Browserprüfung der neuen Bedienung zusätzlich zur bisherigen DE/EN- und Mobilprüfung: Einzelhebel und TER, aktives Volatilitätslimit weist zurück, abgeschaltete Regeln erlauben denselben Backtest. Diese Vorschau verwendet CSV-Preisreihen; sie ersetzt keine PHP-/Datenbankprüfung.

PHP-Backend und Datenbankschema werden nicht verändert. Das vollständige Frontendpaket enthält `dashboards/backtester/`, `en/dashboards/backtester/` und die unveränderten gemeinsamen Headerdateien relativ zum Website-Hauptverzeichnis. Cachekennung: `20261028-v13m`, Rechenmethode im Snapshot: `v1.3e`. Veröffentlichung bleibt ein eigener Schritt.

## Optimierung aus Regeln

Der eigenständige Bereich „Aus Regeln optimieren“ enthält Zielwahl und ein Anlageuniversum mit allen 13 investierbaren Katalogklassen. Die Auswahl ist unabhängig von der aktuellen Gewichtung. „Alle auswählen“ und „Aus Editor übernehmen“ erleichtern die Auswahl. Bei gemischten Frequenzen bestimmt die langsamste gewählte Reihe das gemeinsame Raster. Auch eine später mit 0 % ausgeschlossene Klasse bleibt für die nächste Suche im zugelassenen Universum erhalten.

| Ziel | Bewertung zulässiger Kandidaten |
|---|---|
| Höchste Rendite | CAGR nach Hebel und Kosten maximieren. |
| Höchste Sharpe-Ratio | Annualisierte arithmetische Durchschnittsrendite geteilt durch annualisierte Volatilität, risikofreier Zins 0 %. |
| Höchste Calmar-Ratio | CAGR geteilt durch den Betrag des maximalen Drawdowns. |
| Geringste Volatilität | Annualisierte Standardabweichung minimieren. |
| Geringster maximaler Drawdown | Betrag des größten Verlusts vom vorherigen Höchststand minimieren. |
| Geringster Expected Shortfall | Mittleren Verlust der schlechtesten 5 % der Perioden minimieren, mindestens 40 gemeinsame Renditebeobachtungen. |

Nicht berechenbare Zielwerte werden ausgeschlossen und können keine andere Zielgröße ersetzen. Sind bei zulässigen Allokationen alle Zielwerte undefiniert, erscheint eine eigene Fehlermeldung. Das betrifft beispielsweise Sharpe bei Nullvolatilität, Calmar ohne Drawdown oder Expected Shortfall mit zu kurzer Historie.

Die deterministische Suche prüft Anfangsgewichte, passende 60/40-Referenz, Gleichgewichtung, Einzelpositionen, 50/50-Paare, Zufallskandidaten und lokale Gewichtsübertragungen. Jeder Kandidat wird gegen die eingeschalteten Regeln geprüft. Bei gleichem Zielwert wird höherer CAGR bevorzugt. Hebel und TER werden nicht automatisch erhöht. Bereits konfigurierte Werte werden übernommen; neue Anlageklassen starten mit 1× und 0 % eigener TER.

Die Oberfläche zeigt Zielwert, geprüfte und zulässige Kandidaten sowie die gefundene Gewichtung direkt beim Optimierer. Gerundete Prozentwerte sind reine Anzeige; der Modellbestand wird nicht stillschweigend gerundet. Fertige Ergebnisse stehen weiterhin im Gesamtvergleich und in den gemeinsamen Kennzahlen. Die Suche ist begrenzt und beweist kein globales Optimum.

Ziel, vollständiges Anlageuniversum, Einstellungen auch ungenutzter Kandidaten und Optimierungsmetadaten werden gespeichert. Beim Wiederherstellen eines optimierten Modells bleibt dessen gemeinsames Datenraster durch das vollständige Universum erhalten. Walk-forward verwendet dasselbe gewählte Ziel und Universum, jeweils nur mit zurückliegenden Kursen. Eine neue manuelle Berechnung kann ausdrücklich das Raster der tatsächlich gehaltenen Klassen verwenden.

Abschließende Prüfung: 82 Rechentests bestanden. Unterschiedliche Ziele liefern in einem kontrollierten Beispiel unterschiedliche Allokationen; alle sechs Ziele sind deterministisch und zulässig, Randlösungen werden erfasst, nicht berechenbare Kennzahlen korrekt behandelt und Ziel/Universum gespeichert. Zusätzliche Datentests verhindern unvollständige Schlussmonate bei Tagesreihen, berücksichtigen kurze Feiertagslücken und native Monatsanker und prüfen DE/EN-Gleichheit. Der lesende Live-Smoke-Test prüft alle sechs Ziele erneut gegen die bestehende öffentliche PHP-API und validiert jedes gefundene Portfolio unabhängig. Die CSV-Vorschau und der API-Test sind getrennte Nachweise; die veröffentlichte neue Oberfläche wird dadurch nicht vorweggenommen.


## Vereinfachte Oberfläche vom 27.10.2026

- Basisregeln und zusätzliche Regeln verwenden dieselben Zeilen mit Auswahl, Entfernen und Grenzwert. Die gesonderte Box und deren Schalter entfallen.
- Rebalancing wird über einen Button mit auswählbaren Verfahren bedient. Das Gewichtsband erscheint nur beim entsprechenden Verfahren.
- Das separate Startdatum-Feld und der Datumszusatz an den Portfolio-Linien entfallen. Der Start folgt dem gewählten Vergleichszeitraum. Ein Wechsel des Zeitraums berechnet gespeicherte Portfolios auf dieser Basis neu; fehlende frühere Kurse werden nicht erfunden. Veraltete Berechnungen werden verworfen.
- Neue Entwürfe und Vorlagen lassen standardmäßig alle 13 Anlageklassen zur Optimierung zu. Eine ausdrücklich gespeicherte engere Auswahl bleibt beim Laden erhalten.
- Abschnittsnummern im Portfolioeditor wurden entfernt.
- Prüfung: 82 Rechentests, 22 Modulsyntaxprüfungen, statische Releaseprüfung, DE/EN-Browserprüfung einschließlich Mobilansicht, Rebalancing-Button, Entfernen/Wiederhinzufügen einer Basisregel und Zeitraumwechsel. Die neue Standardoptimierung mit 13 Anlageklassen und aktuellem Zehnjahreszeitraum wurde zusätzlich über die bestehende API ausschließlich lesend berechnet und unabhängig validiert.

## Portfolioauswahl und feste Startsumme vom 27.10.2026

- Gesamtvergleich: Unter Einstellungen gibt es einen eigenen Abschnitt Portfolios mit Auswahl je fertigem Portfolio und einer getrennten 60/40-Referenz. Jede neue Sitzung startet ohne ausgewählte Portfolios.
- Die Auswahl steuert die Portfoliolinien, Marktübersicht, Ergebnistabellen und Portfoliotests. Alle auswählen und Alle abwählen berücksichtigen auch die Portfolios. Ein reiner Portfoliovergleich ohne ausgewählte Anlageklasse ist möglich.
- Portfolios beginnen immer mit 10.000 EUR. Das Startkapitalfeld im Editor entfällt. Neue Entwürfe, geladene Konfigurationen, Wiederherstellung, Speicherung und JSON normalisieren auf 10.000 EUR. Auch die Vergleichslinien beginnen mit 10.000 EUR, unabhängig vom Kapital der einzelnen Anlageklassen.
- Der gewählte Vergleichszeitraum liefert automatisch Anfang und Ende. Im Portfolioeditor gibt es keine Datumsfelder mehr. Die tatsächliche gemeinsame Kurshistorie bleibt maßgeblich.
- Die Auswahlkästchen Absolut und 60/40-Referenz über den Reglern entfallen. Bestehende Berechnungsmodi bleiben erhalten. Neue Drawdown-/Shortfall-Regeln verwenden die Referenz, andere optionale Regeln absolute Werte. Die drei Basisregler behalten 30 %, 10 % und 100 % der Referenz als Standard.
- Finanzkrisen-Stresstest entfernt. Die historischen Stresstests Corona und Aktien/Anleihen 2022 bleiben.

Geprüft: 87 automatisierte Tests bestanden; DE/EN-Syntax und 46 Verknüpfungen geprüft. Browser: standardmäßig keine Portfolios, gezieltes Ein-/Ausblenden, Abwählen aller Linien, Vergleich ausschließlich eines Portfolios, unverändertes Portfolioergebnis bei 50.000 EUR Anlageklassenkapital und erneut ausgeschaltete Auswahl nach Neuladen. Englische Auswahl bei 390 Pixeln ohne horizontalen Überlauf. Keine Backend- oder Datenbankänderung, keine Veröffentlichung.

## Tatsächliche Volatilitätsgrenze und aktuelle Standards

Seit Frontend und Rechenmethode v1.3k wird die Volatilitätsgrenze als tatsächlicher annualisierter Prozentwert eingegeben. Beispiel: 12,34 bedeutet 12,34 % pro Jahr. Es ist kein Prozentsatz der 60/40-Volatilität. Auch eine eigene Grenze oberhalb der Referenz ist möglich.

Neue Portfolios verwenden zunächst die aus den aktuellen Kursdaten berechnete 60/40-Volatilität. Der Editor berechnet diesen Wert beim Laden sowie bei Änderungen des Zeitraums, der gehaltenen Klassen und des Datenrasters erneut. Beim Optimieren wird das gemeinsame Raster des zulässigen Universums verwendet. Ein manuell eingegebener Wert bleibt eine feste absolute Grenze. Referenzwert übernehmen stellt den dynamischen Standard wieder her. Der aktuelle Referenzwert und das verwendete Raster werden unter dem Regler genannt. Solange keine Referenz berechenbar ist, erscheint kein erfundener Standardwert.

volatilityLimitPct ist entweder eine absolute Prozentzahl oder null für den automatisch berechneten Standard. Konfigurationen ohne dieses Feld behalten ihre frühere Referenzskalierung aus limits.volatility. Speichern, Laden und JSON erhalten diese Unterscheidung. Walk-forward berechnet die automatische Grenze aus jedem zurückliegenden Trainingsfenster; eine manuelle Grenze bleibt unverändert. Die 60/40-Referenz ist weiterhin ungehebelt, kostenfrei und quartalsweise rebalanciert.

Neue Portfolios und Vorlagen starten standardmäßig mit ausgeschaltetem Rebalancing (Buy & Hold). Bewusst gespeicherte Rebalancing-Einstellungen werden erhalten.

Prüfung: 95 Tests bestanden. Absolute Grenzen einschließlich 0, automatische Neuberechnung, Altkonfigurationen, Import/Export, ungültige Eingaben, überholte Anfragen, Wiederholung nach Datenfehlern, Optimierung und DE/EN-Gleichheit geprüft. CSV-Browser: 12,34 % als tatsächliche Regelgrenze bestätigt, Optimierung mit allen 13 Klassen erfolgreich, Standardwert bei 5Y/10Y und Monats-/Quartalsraster aktualisiert. Englische Handyansicht mit 390 Pixeln ohne seitlichen Überlauf. Keine Veröffentlichung vorgenommen.
## Walk-forward entfernt

Auf Nutzerwunsch sind die Schätzfenster-Einstellung, Testschaltfläche und Testausgabe sowie die zugehörige Berechnung und Worker-Verzweigung in Deutsch und Englisch entfernt. Frühere Beschreibungen dieser Funktion gelten nicht mehr. Bereits gespeicherte Portfolios bleiben ladbar; die nicht mehr verwendete lookback-Einstellung wird beim Laden oder Speichern verworfen. Historische Portfolioberechnung, Optimierung aus Regeln, Stresstests und rollierende Risiken bleiben verfügbar.

Frontendfassung v1.3l. 94 Tests bestanden, einschließlich Laden älterer Konfigurationen. Keine Veröffentlichung und keine Backendänderung.
## Tägliche Bewertung und vereinfachte Regeln (v1.3m)

Die Portfolioentwicklung wird unabhängig vom Risikoraster für jeden Kalendertag simuliert. Jede Anlageklasse übernimmt einen neuen Preis ausschließlich am Datum ihrer Kursbeobachtung. Dazwischen bleibt ihr letzter verfügbarer Kurs erhalten. Es gibt keine Interpolation und keine Kurse aus der Zukunft. Ein fehlender Anfangskurs wird nicht durch eine spätere Beobachtung ersetzt. Bitcoin kann somit am Wochenende den Gesamtwert verändern, ohne dass die Aktienposition mitbewegt wird. TER und Finanzierung laufen bei Aktivierung zeitanteilig weiter.

Datenraster bezeichnet nun das Raster der Risikomessung. Tägliche, monatliche oder quartalsweise Perioden werden aus dem tatsächlich täglich simulierten Portfolio abgetastet. Automatisch berücksichtigt langsamere Monats-/Quartalsreihen. Volatilität, Sharpe, Expected Shortfall, Tracking Error und Risikobeiträge verwenden dieses Raster. Tagesdarstellung und maximaler Drawdown beruhen immer auf der vollständigen Kalendertagskurve. Risikobeiträge werden über die tatsächlichen Tagesverläufe je Risikoperiode korrekt zusammengeführt. Beste und schlechteste Risikoperioden erhalten deren tatsächliche Daten. Stresstests verwenden die Tageskurve.

Das rollierende Risikofenster bestimmt, wie viele zurückliegende Monate je Messpunkt für den Verlauf der historischen Volatilität betrachtet werden. Es verändert weder die Portfolioallokation noch die Darstellung aller Kalendertage.

Die 60/40-Volatilität wird aus denselben Kursdaten und demselben Risikoraster berechnet und ohne Subtext als Standard des Volatilitätsreglers eingetragen. Die Schaltfläche Referenzwert übernehmen entfällt. Die aktuelle Referenz kann im Info-Hinweis nachgelesen werden; eigene absolute Eingaben bleiben erhalten.

Die Allokationsregeln heißen Maximaler Gesamtanteil alternativer Anlagen und Höchstanteil einer einzelnen alternativen Anlage. Beide reichen von 0 bis 100 %, bei unveränderten Standards 30 und 10 %. Berechnung, Validierung und Optimierung berücksichtigen die geänderten Obergrenzen, auch bei rein alternativen Portfolios. Alle acht Regeln besitzen ein erklärendes i mit Maus- und Tastaturzugang. Absoluter Prozentwert und weitere Regel-Untertexte entfallen. Rebalancing ist wie Datenraster ein Auswahlfeld in derselben Zeile, auch in schmalen Ansichten.

Prüfung: 101 Tests bestanden, darunter Wochenenden, unterschiedliche Handelstage, langsame Reihen ohne Interpolation, keine Zukunftskurse, Intramonats-Drawdowns, identischer Tagesverlauf bei verschiedenen Risikogittern, vollständige Übergabe aller Tage an den Gesamtvergleich und DE/EN-Gleichheit. Die Browserprüfung umfasst alle acht Info-Hinweise, Eingaben bis 100 %, berechneten Referenzstandard, Optimierung mit allen Anlageklassen sowie ausgerichtete Auswahlfelder. Weitere Freigabeprüfung und Dateiliste liegen beim Paket. Keine Veröffentlichung vorgenommen.
## Gemeinsame Rangfolge und Portfolio-Hover (v1.3m)

Im Gesamtvergleich werden alle ausgewählten Portfolios auch im Hover mit ihrem tatsächlichen Tageswert und der Rendite seit Beginn angezeigt. Der Hinweis folgt der gewählten Rangfolge, bleibt innerhalb des Bildschirms und wird bei vielen Linien scrollbar. Nicht ausgewählte Portfolios bleiben ausgeblendet.

Standardmäßig wird absteigend nach Rendite sortiert. Ein Klick auf Rendite, CAGR, Sharpe, Calmar, Volatilität oder maximalen Drawdown macht diese Kennzahl zum Hauptkriterium. Bereits gewählte Kriterien bleiben in ihrer bisherigen Reihenfolge als Entscheidung bei Gleichstand erhalten. Ein erneuter Klick auf das Hauptkriterium kehrt seine Richtung um. Es gibt keinen gewichteten Mischscore. Tabellenüberschriften bieten weitere passende Sortierkriterien. Ungerundete Zahlen entscheiden, fehlende Werte stehen in beiden Richtungen zuletzt. Bei Volatilität wird zunächst der kleinere Wert bevorzugt; beim negativen Drawdown der Wert näher an null.

Anlageklassen und ausgewählte Portfolios werden gemeinsam in die Ergebnis- und Risikotabellen einsortiert. Die Marktübersicht verwendet das angeklickte Zeitfenster und für Portfolios denselben Endtag wie für Anlageklassen. Fehlende historische Perioden erhalten keine erfundene Rendite. Die erste Übersichtssortierung ist 1Y absteigend. Kurslinien ohne Dividenden übernehmen keine Risikokennzahlen aus ihrer Dividendenvariante.

Abschlussprüfung: 113 automatisierte Tests bestanden, 24 JavaScript-Module ohne Syntaxfehler und 52 statische bzw. Modulabhängigkeiten geprüft. Browserprüfung in DE und EN: Rendite als Standard, Sharpe mit Rendite als Gleichstandskriterium, Calmar mit beiden Vorgängern, umgekehrte Richtung, aufsteigende Volatilität, gemeinsame Ergebnis- und Risikorangfolge, Fünfjahresübersicht und Portfolio-Hover. Mobile Vorschau ohne horizontalen Seitenüberlauf, mit Tooltip innerhalb des Bildschirms. Keine Browserfehler bei der abschließenden Prüfung. Die Vorschau verwendet CSV-Preiskurse; sie bestätigt keine Veröffentlichung oder neue Backend-Ausführung.

Das vollständige Frontendpaket umfasst 34 Dateien mit beiden Sprachversionen, gemeinsamer Kopfzeile und neuem ranking.js je Sprache. Bestehende PHP-, Konfigurations-, Daten- und Datenbankdateien gehören nicht zum Upload. Keine Veröffentlichung vorgenommen.

## Einzelne, deutlich sichtbare Sortierung (v1.3n)

Die Mehrfachsortierung aus v1.3m entfällt auf Nutzerwunsch. Es gilt immer genau eine Kennzahl. Ein Klick ersetzt die vorherige Auswahl vollständig; weitere Kennzahlen werden auch bei Gleichstand nicht herangezogen. Ein erneuter Klick auf die aktive Kennzahl kehrt die Richtung um. Rangnummern entfallen in Auswahl und Tabellenüberschriften. Die Auswahl besitzt größere Schaltflächen, Pfeile an allen Kriterien und eine kräftige grüne Markierung der aktiven Kennzahl. Sortierbare Tabellenüberschriften sind als Schaltflächen eingerahmt. In DE/EN und schmaler Ansicht geprüft. 113 Tests bestanden, einschließlich Wechsel, Gleichstand ohne Zweitkriterium, Richtungswechsel und fehlender Werte.


## Sortierung ausschließlich im Ergebnis (v1.3o)

Die Sortierauswahl steht ausschließlich unter Ergebnis oberhalb der Kennzahlentabellen. Im Gesamtvergleich gibt es keine Sortierauswahl. Änderungen des Ergebniskriteriums sortieren nur die Ergebnis- und Risikotabellen einschließlich ausgewählter Portfolios; sie zeichnen den Gesamtvergleich nicht neu und verändern dessen Linien oder Hover nicht. Es gilt genau eine Kennzahl ohne Rangnummern. Die vorherige Platzierung im Gesamtvergleich entfällt. DE/EN geprüft; 114 automatisierte Tests bestanden.


## Zusätzlichen Sortierkasten entfernt (v1.3p)

Der separate Kasten Ergebnisse sortieren entfällt in DE und EN vollständig. Sortieren erfolgt weiterhin über die Schaltflächen in den Tabellenüberschriften im Ergebnisbereich, mit genau einer Kennzahl und umkehrbarer Richtung. 13 zugehörige Regressionstests und die statische Releaseprüfung bestanden. Im Browser: kein Sortierkasten, zwölf erhaltene sortierbare Tabellenüberschriften und korrekte Drawdown-Reihenfolge bestätigt. Gesamtvergleich bleibt ohne Sortierauswahl.


## Hebel nur per Button (v1.3q)

Jede Anlageklasse hat einen Button Hebel aktivieren. Neue ungehebelte Positionen zeigen weder Hebelzahl noch Regler. Aktivieren blendet die beiden Bedienelemente nur für diese Position ein, standardmäßig mit 1x. Deaktivieren setzt den Positionshebel auf 1x, blendet die Felder aus und macht vorhandene Entwurfsergebnisse ungültig. TER bleibt erhalten. Beim Laden tatsächlich gehebelter gespeicherter Positionen ist der Hebel sichtbar aktiv; ein versteckter aktiver Hebel wird vermieden. Neue Entwürfe und Vorlagen setzen den Einblendzustand zurück. DE/EN im Browser einschließlich Standard, unabhängiger Positionen und Abschalten eines 2x-Hebels geprüft. 116 Tests bestanden, statische Releaseprüfung erfolgreich.


## Positions-TER als Hebelzusatzkosten (v1.3r)

Nur im Abschnitt Zusammenstellen erscheint die TER je Position zusammen mit dem aktivierten Hebel. Das Label und Eingabefeld erklären per Hover: zusätzliche jährliche Kosten für den Hebel in Prozent des Positionswerts. Beim Deaktivieren werden Hebel auf 1x und Positions-TER auf 0 Prozent gesetzt; beide Felder sind verborgen und deaktiviert. Gespeicherte Positionen mit Hebelzusatzkosten bleiben sichtbar aktiv, auch wenn ihr Faktor 1x beträgt, damit vorhandene Kosten nicht versteckt werden. Dies ersetzt die Aussage zum Erhalt der TER beim Deaktivieren in v1.3q. Die TER in Einzelverläufen bleibt unverändert. DE/EN im Browser geprüft, 116 Tests und statische Releaseprüfung bestanden. HTML sowie App-, Berechnungs- und Diagrammlogik beider Sprachversionen mit v1.3q verglichen: außer Cachekennung unverändert.
