# Assetklassen-Backtester
## Produktspezifikation, Datenarchitektur und Build-Prompt für GPT-5.6 Extra High / Codex

**Projekt:** smstark-projekt.de  
**Status:** Planungs- und Implementierungsspezifikation  
**Stand:** 03.08.2026  
**Technischer Rahmen:** bestehende Website mit HTML, CSS, JavaScript, PHP und MySQL/MariaDB auf klassischem Webhosting  
**Ziel:** Ein öffentliches, interaktives Tool, das zeigt, was aus einer historischen Einmalanlage – standardmäßig 10.000 € – in unterschiedlichen Anlageklassen geworden wäre.

---

# 1. Executive Summary

Der Assetklassen-Backtester soll historische Anlageentwicklungen über einen identischen Zeitraum vergleichbar machen. Der Nutzer wählt ein Startkapital, einen Zeitraum und mehrere Anlageklassen. Das Tool zeigt anschließend den hypothetischen Portfoliowert im Zeitverlauf sowie Kennzahlen wie Endwert, Gesamtrendite, CAGR und maximalen Drawdown.

Die Anwendung wird nicht bei jedem Seitenaufruf direkt von externen Webseiten abhängig sein. Stattdessen besitzt sie eine eigene MySQL-/MariaDB-Datenbank, in der alle historischen Rohdaten gespeichert werden. Ein automatischer PHP-Synchronisationsprozess aktualisiert die Marktdaten täglich anhand der Schlusskurse des zuletzt abgeschlossenen Tages. Immobilienindizes werden nur in ihrer tatsächlichen Veröffentlichungsfrequenz aktualisiert, also beispielsweise monatlich oder quartalsweise.

Die öffentliche Website liest ausschließlich aus der eigenen Datenbank. Dadurch ist das Tool schnell, kontrollierbar, reproduzierbar und auch bei kurzfristigen Ausfällen eines Datenanbieters nutzbar.

Die erste technisch und gestalterisch fokussierte Version soll ausschließlich folgende drei Vergleichsreihen unterstützen:

1. S&P 500
2. Bitcoin
3. Gold

DAX, MSCI World, Emerging Markets, ein globaler Aktienmarkt, deutsche und US-amerikanische Immobilien sowie Einzelaktien aus den „Magnificent Seven“ folgen erst in späteren Ausbaustufen. Datenmodell, Provider-Architektur und Frontend-Komponenten müssen so generisch gebaut werden, dass diese Erweiterungen ohne grundlegenden Umbau und ohne Schemaänderung ergänzt werden können.

Inflation, Transaktionskosten, laufende Kosten, Steuern, Sparpläne und eine realistische finanzierte Vermietungsimmobilie sind nicht Bestandteil der ersten Version. Die Architektur soll dafür vorbereitet sein. In der Benutzeroberfläche dürfen höchstens klar gekennzeichnete „In Vorbereitung“-Hinweise erscheinen; es dürfen keine Schalter angezeigt werden, die funktional wirken, aber noch nichts berechnen.

---

# 2. Produktvision

## 2.1 Kernfrage

> Was wäre aus 10.000 € geworden, wenn ich sie zu einem bestimmten historischen Zeitpunkt in eine bestimmte Anlageklasse investiert hätte?

## 2.2 Produktversprechen

Das Tool soll:

- verschiedene Anlageklassen auf derselben Kapitalbasis vergleichen,
- historische Entwicklungen transparent darstellen,
- methodische Unterschiede sichtbar machen,
- Datenquellen und Datenstände offenlegen,
- keine persönliche Anlageberatung simulieren,
- keine falsche Genauigkeit vortäuschen,
- sich optisch exakt in die bestehende Website einfügen.

## 2.3 Abgrenzung

Der Backtester ist kein:

- Live-Trading-Terminal,
- Portfolio-Tracker,
- Broker,
- Steuerrechner,
- persönlicher Anlageberater,
- Immobilien-Cashflow-Rechner,
- Prognosemodell,
- Tool zur Vorhersage zukünftiger Renditen.

Er zeigt ausschließlich historische Szenarien auf Grundlage dokumentierter Datenreihen.

---

# 3. Bereits festgelegte Produktentscheidungen

## 3.1 Anlageklassen der ersten Version

Die erste veröffentlichte Version konzentriert sich bewusst auf drei klar unterscheidbare Anlageklassen:

- S&P 500
- Bitcoin in Euro
- Gold in Euro

Diese Begrenzung soll eine fachlich saubere, technisch stabile und gestalterisch überzeugende erste Version ermöglichen. Alle drei Reihen besitzen tägliche beziehungsweise börsentägliche Schlusswerte und können daher ohne die zusätzliche Frequenzproblematik von Immobilienindizes miteinander verglichen werden.

### Spätere Erweiterung

Nach erfolgreichem Betrieb der ersten Version sollen schrittweise ergänzt werden:

- DAX
- MSCI World
- Emerging Markets
- Globaler Aktienmarkt, beispielsweise FTSE All-World oder MSCI ACWI
- Wohnimmobilien Deutschland
- Wohnimmobilien USA
- Einzelwerte aus den Magnificent Seven
- weitere Aktienindizes
- weitere Länder
- weitere Rohstoffe
- Anleihen
- Sparpläne
- Rebalancing
- Inflation
- Kosten und Steuern
- finanzierte Vermietungsimmobilien

Die Datenbank darf nicht auf genau drei Assets fest verdrahtet werden. Neue Assets müssen später primär über Seed-Daten, Konfiguration und einen passenden Provider ergänzt werden können.

## 3.2 Eingaben

- Startkapital
- Startdatum
- Enddatum
- Schnellwahl eines Standardzeitraums
- Auswahl mehrerer Anlageklassen

## 3.3 Standardwerte

Empfohlene Standardeinstellung:

- Startkapital: 10.000 €
- Zeitraum: letzte 10 Jahre
- Enddatum: letzter vollständig verfügbarer Datenstand
- Vorausgewählte Assets im Gesamtchart:
  - S&P 500
  - Bitcoin
  - Gold

Einheitliche Zeitintervalle für Tabelle und Charts:

- 1 Woche
- 1 Monat
- 6 Monate
- 1 Jahr
- 3 Jahre
- 5 Jahre
- 10 Jahre
- maximal verfügbar
- benutzerdefiniert

In der kompakten Vergleichstabelle werden die festen Spalten `1W`, `1M`, `6M`, `1Y`, `3Y`, `5Y` und `10Y` verwendet.

## 3.4 Währung

Alle Resultate werden in Euro dargestellt.

Wo möglich, sollen bereits in Euro gehandelte, investierbare Produkte oder direkt in Euro bereitgestellte Daten verwendet werden. Falls Rohdaten in einer anderen Währung vorliegen, muss eine historische FX-Umrechnung über eine dokumentierte Wechselkursquelle erfolgen. Die Umrechnung darf nicht mit dem heutigen Wechselkurs vorgenommen werden.

## 3.5 Datenstand

Das Tool soll grundsätzlich den zuletzt vollständig abgeschlossenen Tag verwenden und nicht versuchen, Intraday- oder Echtzeitdaten anzuzeigen.

Beispiel:

- Am 3. August wird grundsätzlich bis einschließlich 2. August gearbeitet.
- Für einen ETF kann der letzte echte Börsenschlusskurs dennoch vom Freitag stammen, falls der 2. August ein Sonntag war.
- Bitcoin besitzt auch am Wochenende einen täglichen Schlusswert.
- Immobilienindizes bleiben bis zur nächsten offiziellen Veröffentlichung unverändert.

---

# 4. Vergleichsmethodik

## 4.1 Grundformel

Für jede Anlageklasse wird der historische Wertverlauf auf das gewählte Startkapital normiert:

```text
Einheiten = Startkapital / Wert am effektiven Startdatum

Portfoliowert(t) = Einheiten × Wert(t)
```

Äquivalent:

```text
Portfoliowert(t) =
Startkapital × Wert(t) / Wert(Start)
```

Beispiel:

```text
Startkapital: 10.000 €
Indexwert am Start: 100
Indexwert am Ende: 175

Endwert = 10.000 € × 175 / 100 = 17.500 €
```

## 4.2 Schlusskurse

Für börsengehandelte oder täglich bewertete Anlageklassen wird pro tatsächlich verfügbarem Markttag genau ein Schlusswert gespeichert.

Dazu gehören:

- Aktienindex- oder ETF-Proxys
- Bitcoin
- Gold oder ein Gold-Proxy

Es werden keine Intraday-Kurse benötigt.

## 4.3 Wochenenden und Feiertage

Die Datenbank soll für börsengehandelte Assets nur echte Beobachtungen speichern. Wochenenden und Feiertage müssen nicht mit künstlichen Duplikatzeilen gefüllt werden.

Für den gemeinsamen Chart erzeugt die Anwendung bei der Abfrage eine tägliche Vergleichsserie:

- An Tagen ohne neuen Börsenkurs wird der letzte bekannte Schlusskurs rechnerisch fortgeführt.
- Diese fortgeschriebenen Werte sind nur eine Darstellungs- und Vergleichsschicht.
- Sie werden nicht als neue, echte Beobachtungen in der Rohdatentabelle gespeichert.
- In Methodik und Metadaten bleibt erkennbar, dass kein neuer Handel stattfand.

Beispiel:

| Datum | Rohdaten vorhanden | Verwendeter Chartwert |
|---|---:|---:|
| Freitag | 125,40 € | 125,40 € |
| Samstag | nein | 125,40 € |
| Sonntag | nein | 125,40 € |
| Montag | 127,10 € | 127,10 € |

## 4.4 Immobilienindizes

Immobilienindizes werden nicht täglich abgefragt und nicht künstlich als tägliche Rohdaten gespeichert.

### Deutschland

- offizieller Häuserpreisindex für Deutschland
- bevorzugt quartalsweise Reihe
- beispielsweise Destatis GENESIS, Statistik 61262, Tabelle 61262-0002
- bestehende und neu erstellte Wohnimmobilien zusammen, sofern nicht später getrennt

### USA

- landesweiter FHFA House Price Index
- bevorzugt monatliche Purchase-Only-Reihe, falls für die gewählte Methodik geeignet
- alternativ quartalsweise Reihe

### Chartdarstellung

Für den täglichen Vergleichschart wird der letzte bekannte offizielle Indexwert bis zum nächsten Beobachtungspunkt fortgeführt. Der Chart sollte die Immobilienreihe als Treppenlinie darstellen.

Es darf keine lineare Interpolation zwischen zwei Immobilienwerten stattfinden, da dies eine nicht gemessene tägliche Entwicklung erfinden würde.

### Methodikhinweis

> Immobilien zeigen ausschließlich die Entwicklung eines offiziellen Preisindex. Mieteinnahmen, Fremdfinanzierung, Tilgung, Kaufnebenkosten, Instandhaltung, Leerstand, Steuern und Verkaufskosten sind nicht berücksichtigt.

## 4.5 Index oder investierbarer Proxy

Für Aktienmärkte sollte das Tool bevorzugt eine realistisch investierbare Total-Return-Abbildung verwenden, beispielsweise einen thesaurierenden UCITS-ETF als Proxy.

Gründe:

- Dividenden werden berücksichtigt.
- Splits und Ausschüttungen werden nicht versehentlich ignoriert.
- Die Entwicklung entspricht eher dem Ergebnis eines realen Anlegers.
- Die Anwendung gibt nicht ungeprüft lizenzierte Originalindexstände weiter.
- Ein in Euro gehandelter Proxy reduziert zusätzliche FX-Komplexität.

Die Benutzeroberfläche kann den bekannten Indexnamen verwenden, muss aber die Abbildung offenlegen.

Beispiel:

> MSCI World  
> Abgebildet durch einen thesaurierenden UCITS-ETF-Proxy.

Für jede Anlageklasse ist in den Metadaten festzuhalten:

- öffentlicher Anzeigename,
- tatsächliche Datenreihe,
- Anbieter,
- Symbol,
- ISIN oder andere Kennung,
- Währung,
- Kursart,
- Ausschüttungsbehandlung,
- Datenfrequenz,
- Methodikhinweis.

## 4.6 Gold

Für Gold muss vor dem produktiven Einsatz eine konkrete Reihe gewählt werden.

Zulässige Varianten:

1. Gold-Spotpreis in Euro mit einem klar definierten täglichen Schluss- oder Referenzwert.
2. Investierbarer Gold-ETC-Proxy in Euro.

Für einen konsistenten „Was wäre aus 10.000 € geworden?“-Vergleich ist ein investierbarer EUR-Proxy technisch einfacher. Für einen reinen Assetklassenvergleich ist ein Spotpreis konzeptionell neutraler. Die Architektur muss beide Varianten unterstützen.

In Version 1 darf nur eine Variante aktiv sein. Sie ist im Methodikbereich klar zu benennen.

## 4.7 Bitcoin

Bitcoin soll in EUR verwendet werden.

Der tägliche Schlusswert braucht eine eindeutige Definition, beispielsweise:

- UTC-Tagesclose,
- Schlusskurs eines festgelegten Anbieters,
- keine Mischung verschiedener Börsen ohne dokumentierte Aggregationsmethode.

## 4.8 Start- und Enddatum

Der Nutzer darf beliebige Daten wählen.

Die Anwendung erstellt aus den Rohreihen intern eine gemeinsame tägliche Bewertungsachse. Dafür gelten folgende Regeln:

1. Das Enddatum darf nicht in der Zukunft liegen.
2. Standardmäßig endet die Betrachtung am letzten vollständig abgeschlossenen Kalendertag.
3. Für Tage ohne neue Marktbeobachtung wird der letzte bekannte Wert fortgeführt.
4. Liegt das gewählte Startdatum vor dem Beginn einer Datenreihe, darf das Asset nicht stillschweigend später starten.
5. Die UI muss entweder:
   - das betreffende Asset deaktivieren,
   - oder einen gemeinsamen späteren Starttermin vorschlagen.
6. Der Nutzer muss erkennen können, ab wann Daten verfügbar sind.
7. Ein Vergleich darf nicht unbemerkt unterschiedliche Haltedauern verwenden.

Empfohlene Standardlogik:

- Alle gewählten Assets verwenden denselben Kalenderzeitraum.
- Der wirksame Startwert ist der letzte bekannte Wert am gewählten Startdatum nach Anwendung der dokumentierten Forward-Fill-Regel.
- Gibt es zu diesem Zeitpunkt noch keinen Wert, ist die Reihe nicht verfügbar.
- Optional kann die UI „Am frühesten gemeinsamen Datum starten“ anbieten.

---

# 5. Kennzahlen

## 5.1 Pflichtkennzahlen

Für jedes Asset:

- Endwert in Euro
- absoluter Gewinn oder Verlust in Euro
- Gesamtrendite in Prozent
- annualisierte Rendite/CAGR
- maximaler Drawdown
- Anfangsdatum
- Enddatum
- letzter tatsächlicher Datenpunkt
- Datenfrequenz
- Datenquelle

## 5.2 CAGR

```text
CAGR = (Endwert / Anfangswert)^(1 / Haltedauer in Jahren) − 1
```

Die Haltedauer soll anhand tatsächlicher Kalendertage berechnet werden:

```text
Jahre = Anzahl Tage / 365,2425
```

## 5.3 Maximaler Drawdown

```text
Laufendes Hoch(t) = Maximum aller Werte bis t

Drawdown(t) = Wert(t) / Laufendes Hoch(t) − 1

Maximaler Drawdown = Minimum aller Drawdowns
```

Der Drawdown soll auf der normalisierten Serie berechnet werden.

## 5.4 Optionale Kennzahlen der ersten Version

Nur einbauen, wenn sie sauber und verständlich umgesetzt werden:

- bestes Kalenderjahr
- schlechtestes Kalenderjahr
- annualisierte Volatilität
- Zeit bis zur Erholung nach maximalem Drawdown

### Wichtige Einschränkung

Volatilität darf nicht auf einer künstlich täglich fortgeschriebenen Immobilienserie berechnet werden, da dies die Schwankung stark unterschätzen würde.

Falls Volatilität angezeigt wird:

- tägliche Marktreihen: Berechnung auf echten täglichen Beobachtungen
- monatliche Immobilienreihen: Berechnung auf echten Monatswerten, annualisiert mit Faktor 12
- quartalsweise Immobilienreihen: Berechnung auf echten Quartalswerten, annualisiert mit Faktor 4
- Datenfrequenz muss sichtbar sein
- Kennzahlen mit unterschiedlicher Frequenz sind nur eingeschränkt vergleichbar

Alternativ kann Volatilität in Version 1 vollständig entfallen. Endwert, CAGR und Drawdown reichen für ein robustes MVP.

---

# 6. Benutzeroberfläche und UX

## 6.1 Designprinzip

Das Tool muss optisch exakt zur bestehenden Website passen.

GPT-5.6/Codex darf kein fremdes Dashboard-Design erfinden. Es muss zuerst die vorhandenen Dateien und Styles der Website untersuchen und folgende Elemente übernehmen:

- Header
- Navigation
- Footer
- Schriftarten
- Farben
- CSS-Variablen
- Breiten und Container
- Abstände
- Border-Radii
- Schatten
- Button-Stile
- Karten
- Formulare
- Breakpoints
- Dark-/Light-Verhalten, falls vorhanden
- Animationen, falls vorhanden
- Breadcrumbs
- Seitenüberschriften
- Link-Stile

Neue Klassen sollen sauber gekapselt werden, beispielsweise mit dem Präfix:

```css
.asset-backtester {}
.asset-backtester__controls {}
.asset-backtester__asset-selector {}
.asset-backtester__chart {}
.asset-backtester__metrics {}
.asset-backtester__table {}
```

Keine neue Framework-Optik, kein React, kein Tailwind und kein Buildsystem, sofern die bestehende Website diese nicht bereits verwendet.

## 6.2 Seitenstruktur

Die Reihenfolge ist fachlich und gestalterisch festgelegt. Nach dem bestehenden Seitenkopf folgt zuerst die kompakte Marktübersicht, anschließend die drei Einzelcharts und danach der interaktive Gesamtvergleich.

### A. Seitenkopf

- Breadcrumbs entsprechend der Website
- Titel: „Assetklassen-Backtester“
- Untertitel: „Was wäre aus 10.000 € geworden?“
- kurze Erklärung in zwei bis drei Sätzen
- kompakter Datenstand, beispielsweise „Daten bis 02.08.2026“

Der Seitenkopf soll nicht als übergroße Hero-Section gestaltet werden. Die Vergleichsdaten sollen ohne unnötiges Scrollen schnell sichtbar sein.

### B. Vergleichstabelle am Seitenanfang

Direkt unter der kurzen Einleitung steht eine zentrale Vergleichstabelle. Sie ist der erste datenreiche Bereich der Seite.

#### Aufbau

Zeilen:

- S&P 500
- Bitcoin
- Gold

Spalten:

- Asset
- 1W
- 1M
- 6M
- 1Y
- 3Y
- 5Y
- 10Y

Jede Intervallzelle zeigt primär die prozentuale Wertentwicklung des Assets über den jeweiligen Rückblickszeitraum:

```text
Rendite = Schlusswert am Vergleichsende / Wert am Intervallbeginn − 1
```

Empfohlene Zellenstruktur:

```text
+18,42 %
11.842 € aus 10.000 €
```

Die zweite Zeile mit dem hypothetischen Wert aus 10.000 € darf kleiner dargestellt werden. Falls sie auf kleinen Displays zu viel Platz benötigt, kann sie mobil ausgeblendet oder in einen Tooltip verlagert werden. Die Prozentzahl bleibt immer sichtbar.

#### Vergleichsdatum und Berechnung

- Alle Tabellenwerte enden am selben globalen Datenstand.
- Für `1W`, `1M`, `6M`, `1Y`, `3Y`, `5Y` und `10Y` wird vom gemeinsamen Enddatum kalendarisch zurückgerechnet.
- Liegt auf dem errechneten Startdatum kein Marktwert vor, wird der letzte bekannte Schlusswert am oder vor diesem Datum verwendet.
- Liegt für ein Asset noch keine ausreichend lange Historie vor, erscheint `–` oder „Nicht verfügbar“ statt einer verkürzten und damit irreführenden Haltedauer.
- Der konkrete effektive Start- und Endtag muss per Tooltip oder zugänglicher Zusatzinformation abrufbar sein.
- Werte werden nicht aus Chartpunkten abgelesen, sondern serverseitig oder in einer zentralen Calculation-Service-Funktion aus den Datenbankreihen berechnet.

#### Gestaltung und Bedienung

- positive Werte klar, aber nicht ausschließlich durch Farbe kennzeichnen
- negative Werte mit Minuszeichen und ebenfalls nicht ausschließlich durch Farbe kennzeichnen
- neutrale Werte eindeutig darstellen
- Kopfzeile und erste Spalte gut lesbar
- auf Mobilgeräten entweder kompakte responsive Darstellung oder lokaler horizontaler Scrollbereich nur für die Tabelle
- erste Assetspalte nach Möglichkeit sticky
- keine übermäßigen Schatten oder Trading-Terminal-Optik
- Tabellenwerte besitzen Tooltips mit Asset, Zeitraum, effektivem Startdatum, Enddatum, Startwert, Schlusswert, Rendite und hypothetischem 10.000-€-Endwert

### C. Intervallsteuerung

Für alle Chartbereiche werden dieselben Intervalle verwendet:

- `1W`
- `1M`
- `6M`
- `1Y`
- `3Y`
- `5Y`
- `10Y`
- `Max`
- `Benutzerdefiniert`

Die Buttons müssen als echte Buttons mit sichtbarem Aktivzustand, Tastaturbedienung und `aria-pressed` umgesetzt werden.

Empfohlene Standardauswahl für Charts: `10Y`, sofern alle drei Reihen für diesen Zeitraum verfügbar sind. Andernfalls wird automatisch der längste gemeinsame verfügbare Standardzeitraum gewählt und transparent angezeigt.

Bei „Benutzerdefiniert“ erscheinen Start- und Enddatum. Das Enddatum darf nicht in der Zukunft liegen.

### D. Einzelcharts

Unter der Vergleichstabelle folgen drei berechnete Einzelcharts in dieser Reihenfolge:

1. S&P 500
2. Bitcoin
3. Gold

Desktop:

- je nach bestehender Seitenbreite entweder drei gleichwertige Chartbereiche untereinander oder ein gut lesbares responsives Raster
- Charts dürfen nicht so klein werden, dass Achsen und Hoverwerte unleserlich sind

Mobil:

- immer untereinander
- volle verfügbare Breite

Jeder Einzelchart enthält:

- Assetname
- kurzer Proxy-/Quellenhinweis
- letzter Schlusswert
- Rendite des ausgewählten Intervalls
- hypothetischer Endwert aus 10.000 €
- Intervallauswahl
- Chart aus den gespeicherten Datenbankwerten
- Datenstand

#### Darstellung der Einzelcharts

- X-Achse: Datum
- Y-Achse: tatsächlicher Schluss- beziehungsweise Referenzwert des Assets
- keine Intraday-Werte
- keine künstlichen Rohdatenpunkte an Wochenenden oder Feiertagen
- bei der Chartdarstellung kann der letzte bekannte Wert für eine gemeinsame Kalendertagsachse fortgeführt werden; ein Tooltip muss den letzten tatsächlichen Beobachtungstag nennen
- angemessene automatische Achsenskalierung
- keine irreführende abgeschnittene oder überdramatisierte Darstellung

#### Hover- und Touch-Tooltip

Beim Bewegen der Maus über einen Punkt beziehungsweise beim Antippen auf Mobilgeräten werden mindestens angezeigt:

- Datum
- Schluss- oder Referenzwert an diesem Tag
- prozentuale Veränderung seit Beginn des aktuell ausgewählten Chartintervalls
- hypothetischer Wert einer 10.000-€-Investition seit Beginn des Intervalls
- Kennzeichnung, falls der sichtbare Tageswert nur vom letzten Handelstag fortgeführt wurde
- Datum der letzten echten Beobachtung

Formel für die Hover-Rendite:

```text
Rendite seit Intervallbeginn(t) = Wert(t) / Wert(Start des sichtbaren Intervalls) − 1
```

Der Tooltip soll `mode: index` beziehungsweise eine vergleichbare „nearest on x-axis“-Logik nutzen und nicht verlangen, dass der Mauszeiger exakt einen kleinen Punkt trifft. Sichtbare Punktmarker können standardmäßig reduziert sein und erst bei Hover hervortreten.

### E. Gesamtchart

Nach den Einzelcharts folgt ein größerer Gesamtchart, in dem die ausgewählten Assets gemeinsam verglichen werden.

#### Assetauswahl

Direkt am Gesamtchart können Nutzer S&P 500, Bitcoin und Gold unabhängig ein- oder ausblenden.

Anforderungen:

- standardmäßig alle drei aktiv
- mindestens ein Asset muss aktiv bleiben
- Auswahl als zugängliche Checkboxen oder bestehende Website-Chips mit echten Checkboxen
- Linien nicht nur über Farbe unterscheiden, sondern zusätzlich über Linienmuster oder gut erkennbare direkte Beschriftung
- Legende und Assetauswahl dürfen nicht widersprüchliche Zustände erzeugen

#### Zeitintervalle

Der Gesamtchart besitzt dieselben Intervalle:

- `1W`, `1M`, `6M`, `1Y`, `3Y`, `5Y`, `10Y`, `Max`, `Benutzerdefiniert`

Die Intervallauswahl des Gesamtcharts darf unabhängig von den Einzelcharts funktionieren. Der Zustand soll optional in der URL abbildbar sein.

#### Normierung

Im Gesamtchart werden keine Rohpreise auf derselben Achse verglichen. Alle aktiven Reihen werden auf das gleiche Startkapital normiert:

```text
Portfoliowert(t) = 10.000 € × Wert(t) / Wert(Start)
```

Damit beginnen alle sichtbaren Linien bei 10.000 €. Die Y-Achse zeigt den hypothetischen Portfoliowert in Euro.

Optional kann später ein Umschalter auf reine Rendite in Prozent ergänzt werden. In Version 1 bleibt die Standard- und Pflichtdarstellung der Wert aus 10.000 €.

#### Gesamtchart-Tooltip

Beim Hover auf ein Datum erscheint ein gemeinsamer Tooltip mit allen aktuell aktivierten Assets. Für jedes Asset werden angezeigt:

- Assetname
- hypothetischer Portfoliowert
- prozentuale Veränderung seit Beginn des ausgewählten Intervalls
- tatsächlicher Schluss-/Referenzwert
- letzter echter Beobachtungstag, falls der Wert fortgeführt wurde

Beispiel:

```text
18.07.2024
S&P 500   14.820 €   +48,20 %
Bitcoin   31.460 €  +214,60 %
Gold      12.180 €   +21,80 %
```

Der Tooltip muss bei langen Zeiträumen performant bleiben. Die zugrunde liegenden Berechnungen dürfen nicht bei jeder Mausbewegung vollständig neu durchgeführt werden; normierte Daten und Renditen werden beim Laden oder Intervallwechsel vorberechnet.

### F. Kennzahlen zum gewählten Backtest

Unter oder unmittelbar neben dem Gesamtchart folgt eine kompakte Ergebnisübersicht für die aktuell aktivierten Assets:

- Endwert aus 10.000 €
- Gewinn oder Verlust in Euro
- Gesamtrendite
- CAGR
- maximaler Drawdown
- letzter echter Datenpunkt

Die Tabelle am Seitenanfang und diese Backtest-Kennzahlen erfüllen unterschiedliche Aufgaben:

- obere Tabelle: feste Mehrperiodenübersicht bis zum aktuellen Datenstand
- Gesamtchart-Kennzahlen: Ergebnisse für den aktuell ausgewählten, gegebenenfalls benutzerdefinierten Zeitraum

### G. Methodik-Kurzhinweis

In unmittelbarer Nähe der Charts:

> Die dargestellten Werte basieren auf historischen Schluss- beziehungsweise Referenzkursen. Tage ohne neuen Börsenwert werden im Chart mit dem letzten bekannten Wert fortgeführt. Vergangene Wertentwicklung ist kein verlässlicher Indikator für zukünftige Ergebnisse.

### H. Methodik und Quellen

Aufklappbarer Bereich mit:

- tatsächlicher Datenreihe
- Proxy oder Index
- Quelle
- Symbol/Identifier
- Währung
- Ausschüttungsbehandlung
- Definition des Tages-Schlusswerts
- erste verfügbare Beobachtung
- letzte verfügbare Beobachtung
- Updatezeit
- bekannte Einschränkungen

### I. Zukünftige Funktionen

Nicht funktionale Hinweise:

- „Weitere Indizes und Immobilien – in Vorbereitung“
- „Inflationsbereinigung – in Vorbereitung“
- „Kosten und Steuern – in Vorbereitung“

Diese Hinweise dürfen nicht wie aktive Steuerelemente aussehen.

## 6.3 Responsive Detailregeln

- Tabelle darf auf kleinen Displays horizontal scrollen; die restliche Seite nicht.
- Charts müssen sich ohne horizontales Seiten-Scrolling an 320 px Breite anpassen.
- Intervallbuttons dürfen umbrechen oder in einem klar begrenzten horizontalen Auswahlbereich liegen.
- Tooltip-Inhalte müssen auf Touchgeräten durch Antippen erreichbar und wieder schließbar sein.
- Keine wichtigen Informationen ausschließlich per Hover bereitstellen; die aktuellen Endwerte stehen zusätzlich sichtbar außerhalb der Charts.
- Achsenbeschriftungen werden je nach Breite reduziert, ohne wichtige Größenordnungen zu verbergen.
- Einzelcharts stehen mobil immer untereinander.
- Der Gesamtchart erhält visuell mehr Höhe als ein Einzelchart.

## 6.4 Zustände

Die UI muss mindestens folgende Zustände abdecken:

- Initialzustand
- Laden
- Erfolg
- leere Reihe
- teilweise fehlende Assets
- ungültiges Datum
- Startdatum vor Datenbeginn
- Enddatum vor Startdatum
- externer Datenanbieter vorübergehend nicht erreichbar
- Datenbank erreichbar, aber Daten veraltet
- vollständiger Fehler

Die Website soll bei einem Sync-Fehler weiterhin die zuletzt erfolgreich gespeicherten Daten anzeigen.

---

# 7. Technische Architektur

## 7.1 Stack

Vorgesehener Stack:

- HTML
- vorhandenes CSS der Website plus gekapselte Ergänzungen
- Vanilla JavaScript
- PHP
- MySQL oder MariaDB
- klassisches Shared Hosting
- Dateiübertragung per FileZilla
- Cronjob über das Hosting-Panel oder alternativ gesicherter HTTP-Cron-Endpunkt

Keine Node.js-Laufzeit ist erforderlich.

## 7.2 Architekturprinzip

```text
Externe Datenquelle
        ↓
Provider-Adapter
        ↓
Synchronisationsdienst
        ↓
Validierung und Normalisierung
        ↓
MySQL/MariaDB-Rohdatenbank
        ↓
Backtester-PHP-API
        ↓
JavaScript-Berechnungs- und Darstellungsschicht
```

Die öffentliche Seite darf nie direkt API-Schlüssel besitzen und nie direkt fremde Datenquellen abfragen.

## 7.3 Trennung der Verantwortlichkeiten

### Provider

- kennen externe API- oder Dateiformate
- laden Rohdaten
- parsen Daten
- liefern ein einheitliches internes Format

### Sync-Service

- entscheidet, wann eine Quelle fällig ist
- erwirbt Locks
- ruft Provider auf
- validiert Daten
- führt Upserts aus
- protokolliert Ergebnisse

### Repository

- kapselt SQL-Zugriffe
- liest Assets und Beobachtungen
- speichert Beobachtungen
- liefert Backtestreihen

### Calculation Service

- normiert Reihen
- richtet Datumsachsen aus
- berechnet Endwerte und Kennzahlen
- ist unabhängig von HTML und externen APIs

### Frontend

- erfasst Eingaben
- ruft die eigene API auf
- rendert Chart, Kennzahlen und Hinweise
- besitzt keine Datenanbieterlogik

---

# 8. Vorgeschlagene Verzeichnisstruktur

Die endgültige Struktur muss an das bestehende Repository angepasst werden. Eine mögliche Zielstruktur:

```text
/
├── assetklassen-backtester.php
│
├── assets/
│   ├── css/
│   │   └── asset-backtester.css
│   ├── js/
│   │   └── asset-backtester/
│   │       ├── app.js
│   │       ├── api.js
│   │       ├── calculations.js
│   │       ├── chart.js
│   │       ├── state.js
│   │       └── ui.js
│   └── vendor/
│       └── chart.umd.min.js
│
├── api/
│   └── backtester/
│       ├── assets.php
│       ├── series.php
│       ├── status.php
│       └── sync-if-stale.php
│
├── includes/
│   └── backtester/
│       ├── bootstrap.php
│       ├── config.php
│       ├── Database.php
│       ├── AssetRepository.php
│       ├── ObservationRepository.php
│       ├── SyncRepository.php
│       ├── BacktestService.php
│       ├── SyncService.php
│       ├── ValidationService.php
│       ├── ProviderInterface.php
│       └── providers/
│           ├── MarketDataProvider.php
│           ├── BitcoinProvider.php
│           ├── GoldProvider.php
│           ├── DestatisProvider.php
│           ├── FhfaProvider.php
│           └── CsvImportProvider.php
│
├── cron/
│   └── backtester/
│       ├── backfill-history.php
│       ├── update-daily.php
│       ├── update-real-estate.php
│       └── repair-gaps.php
│
├── sql/
│   └── backtester/
│       ├── 001_schema.sql
│       ├── 002_seed_assets.sql
│       └── 003_indexes.sql
│
├── tests/
│   └── backtester/
│       ├── CalculationTest.php
│       ├── DateAlignmentTest.php
│       ├── ProviderParserTest.php
│       ├── SyncServiceTest.php
│       └── fixtures/
│
└── config/
    └── backtester.example.php
```

Wenn die Website bereits eine andere Struktur und Include-Logik verwendet, soll Codex diese übernehmen, statt parallel ein zweites System zu schaffen.

---

# 9. Datenbankmodell

## 9.1 Grundprinzip

Die Datenbank speichert echte Rohbeobachtungen in ihrer nativen Frequenz:

- tägliche Marktschlusskurse
- tägliche Bitcoin-Schlusswerte
- monatliche oder quartalsweise Immobilienindizes

Sie speichert nicht:

- künstlich fortgeschriebene Wochenendkurse
- interpolierte Immobilienwerte
- fertige 10.000-€-Szenarien für jede mögliche Nutzereingabe

Backtests werden dynamisch berechnet.

## 9.2 Tabelle `backtester_data_sources`

```sql
CREATE TABLE backtester_data_sources (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    base_url VARCHAR(500) NULL,
    license_note TEXT NULL,
    attribution_text TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_backtester_data_sources_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.3 Tabelle `backtester_assets`

```sql
CREATE TABLE backtester_assets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source_id INT UNSIGNED NOT NULL,

    slug VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100) NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    region VARCHAR(100) NULL,

    provider_symbol VARCHAR(255) NOT NULL,
    provider_dataset VARCHAR(255) NULL,
    identifier_type VARCHAR(50) NULL,
    identifier_value VARCHAR(255) NULL,

    raw_currency CHAR(3) NOT NULL,
    display_currency CHAR(3) NOT NULL DEFAULT 'EUR',
    value_type ENUM(
        'adjusted_close',
        'close',
        'spot_reference',
        'index_level'
    ) NOT NULL,

    native_frequency ENUM(
        'daily',
        'monthly',
        'quarterly',
        'annual'
    ) NOT NULL,

    timezone_name VARCHAR(100) NULL,
    proxy_description TEXT NULL,
    methodology_note TEXT NULL,

    first_expected_date DATE NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_default_selected TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_backtester_assets_slug (slug),
    KEY idx_backtester_assets_active_sort (is_active, sort_order),

    CONSTRAINT fk_backtester_assets_source
        FOREIGN KEY (source_id)
        REFERENCES backtester_data_sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.4 Tabelle `backtester_observations`

```sql
CREATE TABLE backtester_observations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id INT UNSIGNED NOT NULL,

    observation_date DATE NOT NULL,

    raw_value DECIMAL(24, 10) NOT NULL,
    raw_currency CHAR(3) NOT NULL,

    eur_value DECIMAL(24, 10) NOT NULL,
    fx_rate_to_eur DECIMAL(24, 12) NULL,
    fx_observation_date DATE NULL,

    source_timestamp DATETIME NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    quality_status ENUM(
        'valid',
        'provisional',
        'revised',
        'flagged'
    ) NOT NULL DEFAULT 'valid',

    source_revision VARCHAR(100) NULL,
    raw_payload_hash CHAR(64) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_backtester_observation_asset_date (
        asset_id,
        observation_date
    ),

    KEY idx_backtester_observation_date (observation_date),
    KEY idx_backtester_observation_asset_range (
        asset_id,
        observation_date
    ),

    CONSTRAINT fk_backtester_observation_asset
        FOREIGN KEY (asset_id)
        REFERENCES backtester_assets(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.5 Tabelle `backtester_sync_state`

```sql
CREATE TABLE backtester_sync_state (
    asset_id INT UNSIGNED PRIMARY KEY,

    latest_observation_date DATE NULL,
    last_checked_at DATETIME NULL,
    last_successful_sync_at DATETIME NULL,
    next_check_at DATETIME NULL,

    lock_token CHAR(36) NULL,
    lock_until DATETIME NULL,

    consecutive_failures INT UNSIGNED NOT NULL DEFAULT 0,
    last_error_at DATETIME NULL,
    last_error_code VARCHAR(100) NULL,
    last_error_message TEXT NULL,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_backtester_sync_state_asset
        FOREIGN KEY (asset_id)
        REFERENCES backtester_assets(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 9.6 Tabelle `backtester_sync_runs`

```sql
CREATE TABLE backtester_sync_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    trigger_type ENUM(
        'cron',
        'page_visit',
        'manual',
        'initial_backfill',
        'gap_repair'
    ) NOT NULL,

    started_at DATETIME NOT NULL,
    completed_at DATETIME NULL,

    status ENUM(
        'running',
        'success',
        'partial',
        'failed'
    ) NOT NULL,

    assets_checked INT UNSIGNED NOT NULL DEFAULT 0,
    assets_succeeded INT UNSIGNED NOT NULL DEFAULT 0,
    assets_failed INT UNSIGNED NOT NULL DEFAULT 0,

    rows_inserted INT UNSIGNED NOT NULL DEFAULT 0,
    rows_updated INT UNSIGNED NOT NULL DEFAULT 0,

    error_summary TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_backtester_sync_runs_started (started_at),
    KEY idx_backtester_sync_runs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Optional kann eine Detailtabelle pro Asset und Run ergänzt werden.

---

# 10. Datenprovider und Quellenstrategie

## 10.1 Grundsatz

Der Begriff „Scraper“ soll technisch breit verstanden werden. Bevorzugte Reihenfolge:

1. offizielle API
2. offizieller JSON-/CSV-/XML-Download
3. lizenzierter Marktdatenanbieter
4. HTML-Scraping nur als letzte Option

Ein klassischer HTML-Scraper ist fragil und kann gegen Nutzungsbedingungen oder Weiterverbreitungsrechte verstoßen. Deshalb darf Codex keine beliebige Finanzwebsite scrapen, ohne die Quelle, Stabilität und Nutzungsrechte klar zu dokumentieren.

## 10.2 Provider-Abstraktion

```php
interface HistoricalDataProviderInterface
{
    /**
     * @return HistoricalObservation[]
     */
    public function fetchRange(
        AssetDefinition $asset,
        DateTimeImmutable $from,
        DateTimeImmutable $to
    ): array;

    /**
     * @return HistoricalObservation[]
     */
    public function fetchRecent(
        AssetDefinition $asset,
        int $lookbackDays
    ): array;

    public function supports(AssetDefinition $asset): bool;
}
```

Ein normalisierter Datenpunkt:

```php
final class HistoricalObservation
{
    public function __construct(
        public readonly DateTimeImmutable $date,
        public readonly string $value,
        public readonly string $currency,
        public readonly ?DateTimeImmutable $sourceTimestamp,
        public readonly string $qualityStatus = 'valid',
        public readonly ?string $sourceRevision = null
    ) {}
}
```

## 10.3 Markt-Assets

Für Version 1 wird ein konfigurierbarer Marktdatenprovider für S&P 500 und Gold verwendet; Bitcoin erhält einen eigenen Adapter. Derselbe Marktprovider muss später DAX, MSCI World, Emerging Markets und einen globalen Aktienmarkt aufnehmen können.

Anforderungen:

- mindestens 15 Jahre Historie, soweit das Instrument so lange existiert
- tägliche Schluss- oder Adjusted-Close-Werte
- dokumentierte Behandlung von Dividenden und Splits
- stabile Symbolzuordnung
- zulässige Speicherung in eigener Datenbank
- zulässige öffentliche Darstellung abgeleiteter Ergebnisse
- API-Schlüssel ausschließlich serverseitig
- Rate-Limit-Behandlung
- Retry mit Backoff
- keine Intraday-Daten nötig

Die konkrete Produktionsquelle muss vor Veröffentlichung anhand Preis, Lizenz und Datenabdeckung gewählt werden.

Die Architektur soll mindestens enthalten:

- einen echten Provider-Adapter für den gewählten Anbieter,
- einen `CsvImportProvider` für initiale oder manuelle Imports,
- Test-Fixtures,
- klare Konfiguration der Symbole.

## 10.4 Bitcoin

Geeignete Quelle:

- historische BTC/EUR-Tageswerte über einen seriösen API-Anbieter

Anforderungen:

- täglicher Schlusswert
- eindeutige Zeitzone
- möglichst lange Historie
- Nachladen in Zeitfenstern
- Speicherung in eigener DB gemäß Anbieterbedingungen
- erneutes Laden der letzten Tage, um Korrekturen zu übernehmen

## 10.5 Deutschland-Immobilien

Bevorzugte Quelle:

- Destatis GENESIS
- Statistik 61262
- Quartalstabelle 61262-0002

Der Provider muss:

- die offizielle Ausgabe maschinenlesbar abrufen,
- Dezimalkommas korrekt parsen,
- Perioden in eindeutige Stichtage transformieren,
- vorläufige oder revidierte Werte kennzeichnen,
- Basisjahränderungen tolerieren,
- nicht von einem fest codierten Indexbasisjahr abhängen.

Die Rendite basiert ausschließlich auf dem Verhältnis der Indexwerte. Eine Umstellung von beispielsweise 2015=100 auf 2025=100 darf die prozentuale Entwicklung nicht verändern, sofern die Reihe konsistent revidiert wird.

## 10.6 USA-Immobilien

Bevorzugte Quelle:

- FHFA House Price Index
- landesweite Purchase-Only-Reihe
- monatlich, sofern passend und stabil verfügbar
- alternativ quartalsweise

Der FHFA-Provider soll bevorzugt den offiziellen JSON-/CSV-/SQL-Download verwenden und nicht die sichtbare Website scrapen.

## 10.7 Quellenmetadaten

Jede Datenquelle muss im Tool anzeigen können:

- Name
- Link oder Quellenbezeichnung
- Lizenz-/Attributionshinweis
- letzte erfolgreiche Synchronisierung
- letzter Datenpunkt
- Frequenz
- Proxy-/Methodikhinweis

---

# 11. Synchronisationslogik

## 11.1 Einmaliger historischer Import

Ein CLI-Script oder ein gesicherter, chunkbarer Admin-Prozess lädt die vollständige Vergangenheit.

Datei:

```text
cron/backtester/backfill-history.php
```

Anforderungen:

- idempotent
- wiederaufnehmbar
- chunkweise
- Rate-Limits respektieren
- Fortschritt protokollieren
- vorhandene Werte per Upsert aktualisieren
- Abbruch eines Assets darf nicht den gesamten Import zerstören
- optional Asset- und Datumsfilter per CLI
- keine Browser-Zeitüberschreitung bei großen Importen

Beispiel:

```bash
php cron/backtester/backfill-history.php
php cron/backtester/backfill-history.php --asset=bitcoin
php cron/backtester/backfill-history.php --from=2010-01-01
```

Falls das Hosting kein SSH erlaubt, soll eine sichere Alternative dokumentiert werden:

- token-geschützter HTTP-Endpunkt
- kleine Zeitfenster pro Aufruf
- Fortsetzungs-Cursor
- kein öffentlich zugänglicher Backfill-Endpunkt

## 11.2 Täglicher Marktdaten-Job

Datei:

```text
cron/backtester/update-daily.php
```

Empfohlene Ausführung:

- täglich am Morgen in Zeitzone Europe/Berlin
- beispielsweise 07:00 oder 08:00 Uhr
- lädt nur Quellen, deren `next_check_at` erreicht ist
- fragt die letzten 5 bis 10 Kalendertage erneut ab
- führt Upserts aus
- korrigiert nachträglich geänderte Schlusswerte
- protokolliert alle Resultate

Der Job darf nicht einfach annehmen, dass „gestern“ immer einen Börsenwert besitzt.

Er soll pro Asset:

1. Lock erwerben.
2. Letzten erfolgreichen Stand lesen.
3. kleinen überlappenden Zeitraum berechnen.
4. Provider abrufen.
5. Daten validieren.
6. Werte in EUR normalisieren.
7. Upsert ausführen.
8. Sync-State aktualisieren.
9. Lock freigeben.
10. Fehler isoliert protokollieren.

## 11.3 Immobilien-Job

Immobilienquellen müssen nicht täglich extern abgefragt werden.

Datei:

```text
cron/backtester/update-real-estate.php
```

Mögliche Frequenz:

- Deutschland: wöchentlich oder rund um erwartete Quartalsveröffentlichungen
- USA monatlich: wöchentlich oder rund um erwartete Monatsveröffentlichungen
- USA quartalsweise: wöchentlich oder rund um erwartete Quartalsveröffentlichungen

Eine tägliche Master-Cron darf den internen Scheduler ausführen, aber der Scheduler soll Immobilienprovider nur aufrufen, wenn `next_check_at` fällig ist.

Bei jeder erfolgreichen Immobilienaktualisierung sollen mehrere vorherige Perioden erneut abgerufen werden, weil offizielle Reihen revidiert werden können.

Empfehlung:

- monatliche Reihe: letzte 24 Monate erneut prüfen
- quartalsweise Reihe: letzte 8 Quartale erneut prüfen

## 11.4 Sicherheitsnetz beim Seitenaufruf

Die Website zeigt sofort die vorhandenen Daten aus der Datenbank.

Nach dem Rendern kann ein same-origin Request an:

```text
POST /api/backtester/sync-if-stale.php
```

gesendet werden.

Der Endpoint:

- prüft, ob heute bereits kontrolliert wurde,
- prüft `next_check_at`,
- erwirbt einen Datenbank-Lock,
- startet nur einen kleinen inkrementellen Sync,
- gibt bei laufendem Lock sofort zurück,
- blockiert nicht die Darstellung der gespeicherten Daten,
- ist rate-limitiert,
- akzeptiert keine frei wählbaren externen URLs oder Symbole.

Der Cronjob bleibt der primäre Mechanismus. Der Seitenaufruf ist nur ein Fallback.

## 11.5 Locking

Mehrere gleichzeitige Besucher dürfen nicht mehrere identische Syncs auslösen.

Mindestanforderung:

- transaktionssicherer Lock in `backtester_sync_state`
- zufälliges Lock-Token
- `lock_until`
- Lock läuft nach Fehler automatisch ab
- nur der Besitzer des Lock-Tokens darf ihn freigeben
- keine rein dateibasierte Locklösung, wenn mehrere PHP-Prozesse möglich sind

## 11.6 Fehlerverhalten

- Alte Daten bleiben verfügbar.
- Ein einzelner Providerfehler stoppt nicht alle anderen.
- Fehlerdetails werden serverseitig protokolliert.
- API-Keys erscheinen nie in Logs oder Frontend.
- Nutzer sehen eine verständliche Meldung:
  - „Datenstand vom 31.07.2026; die heutige Aktualisierung ist vorübergehend fehlgeschlagen.“
- Nach mehreren Fehlschlägen wird das nächste Retry verzögert.

---

# 12. Datenvalidierung

Jeder neue Datenpunkt muss geprüft werden.

## 12.1 Pflichtprüfungen

- Datum gültig
- Wert numerisch
- Wert größer als null
- Währung bekannt
- keine Duplikate
- Datum nicht unerwartet weit in der Zukunft
- Werte chronologisch sortierbar
- keine stillschweigende Zeitzonenverschiebung
- keine leere API-Antwort als erfolgreicher Sync markieren

## 12.2 Ausreißer

Sehr starke Sprünge sollen nicht automatisch gelöscht werden, da Bitcoin oder Marktcrashs real sein können.

Stattdessen:

- relativ zum vorherigen Wert prüfen
- bei ungewöhnlichem Sprung `quality_status = flagged`
- im Log markieren
- Wert nur verwerfen, wenn Parser- oder Datenformatfehler eindeutig ist
- Splits und Ausschüttungen über Adjusted-Close-Reihen abfangen

## 12.3 Datenlücken

Ein Repair-Script soll Lücken in erwarteten Handelstagen erkennen.

Es darf jedoch:

- Wochenenden nicht als Fehler behandeln,
- bekannte Börsenfeiertage nicht zwingend als Fehler behandeln,
- monatliche/vierteljährliche Reihen nicht nach täglichen Werten durchsuchen.

Datei:

```text
cron/backtester/repair-gaps.php
```

---

# 13. PHP-API

## 13.1 `GET /api/backtester/assets.php`

Liefert aktive Assets und Metadaten.

Beispiel:

```json
{
  "success": true,
  "generatedAt": "2026-08-03T13:00:00+02:00",
  "assets": [
    {
      "slug": "msci-world",
      "displayName": "MSCI World",
      "assetClass": "equity",
      "nativeFrequency": "daily",
      "firstDate": "2010-01-04",
      "lastDate": "2026-07-31",
      "proxyDescription": "Thesaurierender UCITS-ETF-Proxy",
      "defaultSelected": true
    }
  ]
}
```

## 13.2 `GET /api/backtester/series.php`

Parameter:

- `assets`
- `start`
- `end`
- `amount`

Beispiel:

```text
/api/backtester/series.php
?assets=sp500,msci-world,bitcoin,gold
&start=2016-08-02
&end=2026-08-02
&amount=10000
```

Serverseitige Validierung:

- nur erlaubte Asset-Slugs
- maximale Anzahl Assets
- gültige ISO-Daten
- Start vor Ende
- Betrag im definierten Bereich
- maximale Datenmenge
- keine SQL-Injection
- keine beliebige Providerabfrage

Empfohlene Antwort:

```json
{
  "success": true,
  "request": {
    "amount": 10000,
    "start": "2016-08-02",
    "end": "2026-08-02",
    "currency": "EUR"
  },
  "commonCalendar": [
    "2016-08-02",
    "2016-08-03"
  ],
  "series": [
    {
      "slug": "bitcoin",
      "displayName": "Bitcoin",
      "nativeFrequency": "daily",
      "effectiveStartDate": "2016-08-02",
      "effectiveEndDate": "2026-08-02",
      "firstRawDate": "2010-07-18",
      "lastRawDate": "2026-08-02",
      "points": [
        {
          "date": "2016-08-02",
          "portfolioValue": 10000,
          "sourceValue": 480.12,
          "isCarriedForward": false
        }
      ],
      "metrics": {
        "finalValue": 0,
        "absoluteReturn": 0,
        "totalReturnPct": 0,
        "cagrPct": 0,
        "maxDrawdownPct": 0
      }
    }
  ],
  "warnings": [],
  "dataStatus": {
    "latestSuccessfulSync": "2026-08-03T07:04:12+02:00"
  }
}
```

Bei langen Zeiträumen kann die Chartserie serverseitig oder im Frontend für die Darstellung reduziert werden, aber Kennzahlen müssen auf der vollständigen Reihe berechnet werden.

## 13.3 `GET /api/backtester/status.php`

Liefert:

- letzter erfolgreicher Gesamtsync
- Status je Asset
- letzter Datenpunkt
- letzte Prüfung
- Fehlermeldung in nutzergeeigneter Form
- keine geheimen technischen Details

## 13.4 HTTP-Verhalten

- JSON mit UTF-8
- korrekte HTTP-Statuscodes
- `Cache-Control` sinnvoll setzen
- `ETag` oder `Last-Modified` optional
- CORS nur same-origin
- keine Stacktraces im Produktivbetrieb
- standardisiertes Fehlerformat

---

# 14. Frontend-Logik

## 14.1 Zustandsmodell

```js
const state = {
  amount: 10000,
  preset: '10y',
  startDate: null,
  endDate: null,
  selectedAssets: [],
  loading: false,
  data: null,
  error: null
};
```

## 14.2 Berechnungsort

Bevorzugt berechnet der PHP-Service die Kennzahlen und normalisierten Portfoliowerte. Das Frontend rendert nur.

Vorteile:

- konsistente Berechnung
- weniger doppelte Logik
- leichter testbar
- API kann später von weiteren Oberflächen verwendet werden

Kleine Formatierungen und Interaktionen verbleiben im JavaScript.

## 14.3 Performance

- Datenbankbereichsabfragen mit Index
- keine vollständige Historie aller Assets laden, wenn nur drei gewählt sind
- JSON komprimierbar
- Chartdaten bei sehr langen Reihen sinnvoll downsamplen
- Kennzahlen immer auf vollständigen Daten
- Debounce bei Datumseingaben
- AbortController für überholte Fetch-Requests
- keine erneuten Requests bei unverändertem Zustand
- Assets-Metadaten cachen

## 14.4 Barrierefreiheit

- echte Labels
- semantische Buttons
- sichtbare Fokuszustände
- Tastaturbedienung
- Chartzusammenfassung als Text
- Tabelle als alternative Datendarstellung
- Farben nicht als einziges Unterscheidungsmerkmal
- `aria-live` für Lade- und Fehlermeldungen
- ausreichender Kontrast nach dem vorhandenen Design

---

# 15. Sicherheit

## 15.1 Secrets

- Datenbankzugang und API-Keys nur serverseitig
- Konfigurationsdatei außerhalb des öffentlichen Webroots oder über Umgebungsvariablen
- `.env` und echte Config nicht committen
- `.example`-Datei bereitstellen
- keine Secrets in JavaScript
- keine Secrets in Fehlermeldungen oder Logs

## 15.2 Datenbank

- PDO
- Exceptions aktiviert
- prepared statements
- Least-Privilege-Datenbanknutzer
- Transaktionen für mehrteilige Syncs
- utf8mb4
- keine dynamische SQL-Spalten- oder Tabellennamen aus Nutzereingaben

## 15.3 Endpoints

- erlaubte Asset-Slugs serverseitig aus DB
- Eingabegrenzen
- Rate-Limit für `sync-if-stale`
- CSRF-Schutz für schreibende Adminfunktionen
- Cron-HTTP-Endpunkt nur mit langem Secret oder Host-Cron/CLI
- kein frei zugänglicher Backfill
- sichere Response-Header entsprechend bestehender Website

## 15.4 Output

- HTML escapen
- JSON korrekt serialisieren
- keine ungefilterten Providertexte an Nutzer
- keine raw API payloads im Frontend

---

# 16. Platzhalter für spätere Erweiterungen

Die Architektur soll spätere Berechnungsmodule vorsehen:

```php
interface BacktestAdjustmentInterface
{
    public function apply(
        BacktestSeries $series,
        BacktestContext $context
    ): BacktestSeries;
}
```

Spätere Module:

- InflationAdjustment
- InitialTransactionCost
- ExitTransactionCost
- AnnualManagementCost
- TaxAdjustment
- RecurringContribution
- Rebalancing
- RealEstateCashFlow

In Version 1 werden diese nicht aktiv angewendet.

Konfiguration:

```php
return [
    'features' => [
        'inflation' => false,
        'transaction_costs' => false,
        'taxes' => false,
        'recurring_investments' => false,
        'magnificent_seven' => false,
    ],
];
```

---

# 17. Tests

## 17.1 Unit-Tests

Mindestens:

- Normierung von 10.000 €
- Gesamtrendite
- CAGR
- maximaler Drawdown
- Forward-Fill für Wochenenden
- keine Interpolation bei Immobilien
- gemeinsamer Datumsbereich
- Startdatum vor Datenbeginn
- Enddatum nach letztem Datenpunkt
- leap years
- identischer Start- und Endwert
- negative Rendite
- revidierter Wert
- FX-Umrechnung
- unterschiedliche native Frequenzen

## 17.2 Integrations-Tests

- Provider-Parser mit Fixtures
- Backfill-Import
- Upsert ohne Duplikate
- erneuter Import derselben Daten
- Locking bei Parallelzugriff
- partieller Providerfehler
- Timeout und Retry
- Sync-State
- API-Ausgabe
- SQL-Migrationen

## 17.3 Manuelle Testfälle

1. 10.000 € und eine Reihe von 100 auf 200 ergeben 20.000 €.
2. Eine Reihe von 100 auf 50 ergibt −50 %.
3. Wochenendtage verändern einen ETF-Wert nicht.
4. Bitcoin darf am Wochenende neue Werte erhalten.
5. Ein Quartalsindex bleibt bis zum nächsten offiziellen Wert konstant.
6. Ein Asset ohne Daten am Start erzeugt eine sichtbare Warnung.
7. Ein fehlgeschlagener Sync löscht keine alten Daten.
8. Zwei parallele Sync-Aufrufe führen nur zu einem externen Abruf.
9. Mobile Ansicht bei 320 px bleibt vollständig bedienbar.
10. Header, Footer und Navigation entsprechen der bestehenden Website.

---

# 18. Akzeptanzkriterien für Version 1

Die Umsetzung gilt erst als abgeschlossen, wenn:

- die Seite in die bestehende Website integriert ist,
- alle neun vorgesehenen Asset-Slots existieren,
- aktive Assets aus der Datenbank konfiguriert werden,
- historische Beobachtungen gespeichert werden,
- ein idempotenter Backfill existiert,
- tägliche Marktdaten automatisch aktualisiert werden,
- Immobilien nur nach ihrer eigenen Frequenz geprüft werden,
- ein Seitenaufruf einen stale-check auslösen kann,
- Locks parallele Syncs verhindern,
- API-Keys nicht öffentlich sind,
- der Nutzer beliebige gültige Daten wählen kann,
- 10 Jahre der Standardzeitraum sind,
- alle Reihen auf dasselbe Startkapital normiert werden,
- Endwert, Rendite, CAGR und Drawdown korrekt sind,
- Quellen und Proxy-Methoden sichtbar sind,
- Immobilien nicht als vollständiges Investment mit Mieten dargestellt werden,
- Inflation und Kosten noch nicht berechnet werden,
- Fehlerzustände sauber funktionieren,
- das Tool mobil funktioniert,
- keine unnötigen Frameworks eingeführt werden,
- SQL-Schema, Setup und Cron dokumentiert sind,
- automatisierte Tests für die Kernlogik vorhanden sind,
- keine Dummywerte im Produktivpfad verbleiben.

---

# 18A. Verbindliche Design-Abnahmekriterien für Version 1

Die Designumsetzung gilt nur als abgeschlossen, wenn:

- die erste Datendarstellung nach dem Seitenkopf die Mehrperiodentabelle ist,
- die Tabelle S&P 500, Bitcoin und Gold in den Spalten 1W, 1M, 6M, 1Y, 3Y, 5Y und 10Y vergleicht,
- jede verfügbare Tabellenzelle eine nachvollziehbar berechnete Prozentveränderung zeigt,
- unter der Tabelle drei funktionierende Einzelcharts stehen,
- jeder Einzelchart beim Hover beziehungsweise Tap die Veränderung seit Beginn des sichtbaren Intervalls zeigt,
- ein separater Gesamtchart alle drei Assets auf 10.000 € normiert vergleicht,
- die Assets im Gesamtchart einzeln ein- und ausgeschaltet werden können,
- der Gesamtchart dieselben Zeitintervalle unterstützt,
- alle Tooltipwerte aus vorberechneten Daten stammen und performant reagieren,
- Desktop- und Mobile-Ansicht ohne horizontales Seiten-Scrolling funktionieren,
- zusätzliche, noch nicht implementierte Assets nicht als funktionslose Bedienelemente erscheinen,
- das Ergebnis optisch erkennbar Teil der bestehenden Website ist und kein fremdes Standard-Dashboard wirkt.

---

# 19. Deployment auf klassischem Webhosting

## 19.1 Voraussetzungen

Vor Deployment klären:

- PHP-Version, idealerweise PHP 8.1 oder neuer
- MySQL oder MariaDB
- Zugriff auf phpMyAdmin
- Cronjobs im Hosting-Panel
- `curl`-Erweiterung
- `json`-Erweiterung
- `mbstring`
- PDO MySQL
- Möglichkeit, Config außerhalb des Webroots abzulegen
- maximale PHP-Laufzeit
- SSH verfügbar oder nicht
- URL-Struktur und `.htaccess`

## 19.2 Installation

1. Änderungen in einem separaten Branch erstellen.
2. Bestehende Website sichern.
3. SQL-Migration importieren.
4. Config aus Beispiel erzeugen.
5. Datenbankzugang eintragen.
6. Provider-Keys eintragen.
7. Seed-Daten importieren.
8. Backfill ausführen.
9. Datenqualität prüfen.
10. Cronjobs einrichten.
11. Seite und API hochladen.
12. Status-Endpunkt prüfen.
13. mobilen Test durchführen.
14. Logs und Dateirechte kontrollieren.
15. erst danach öffentlich verlinken.

## 19.3 Cronbeispiele

CLI, falls verfügbar:

```bash
0 7 * * * /usr/bin/php /PFAD/cron/backtester/update-daily.php
30 7 * * 1 /usr/bin/php /PFAD/cron/backtester/update-real-estate.php
```

Die tatsächlichen Pfade und PHP-Binärdateien hängen vom Hoster ab.

Falls nur URL-Cron verfügbar ist:

```text
https://example.de/cron/backtester/update-daily.php?token=LANGES_GEHEIMNIS
```

Dann zusätzlich:

- Secret aus Config
- Timing-safe Vergleich
- IP-Restriktion, falls möglich
- keine Ausgabe sensibler Details
- Rate-Limit
- HTTPS

---

# 20. Offene Entscheidungen vor Produktionsfreigabe

Diese Entscheidungen sind bewusst nicht geraten worden:

## 20.1 Konkreter Marktdatenanbieter

Zu klären:

- API-Preis
- historische Tiefe
- Adjusted Close
- ETF- und Indexabdeckung
- API-Limits
- Speicherung
- öffentliche Wiedergabe
- Zuverlässigkeit
- PHP-Kompatibilität

## 20.2 Konkrete Proxy-Produkte

Vor dem ersten Release festzulegen für:

- S&P 500
- Gold

Für spätere Releases zusätzlich:

- DAX
- MSCI World
- Emerging Markets
- globalen Aktienmarkt

Die Auswahl soll möglichst:

- thesaurierend sein,
- in EUR notieren,
- lange Historie besitzen,
- liquide sein,
- eine stabile Kennung besitzen,
- methodisch dokumentiert werden.

## 20.3 Goldmethodik

- Spotpreis oder investierbarer ETC
- Tagesclose-Definition
- EUR-Umrechnung

## 20.4 US-Immobilienreihe

- monatlicher Purchase-Only FHFA HPI
- oder quartalsweise Reihe
- seasonally adjusted oder not seasonally adjusted
- Periodenstichtag

## 20.5 Serverdetails

- Hoster
- PHP-Version
- Datenbanktyp
- Cronzugang
- SSH
- aktueller Include-Aufbau
- Speicherort der Secrets

Codex soll diese Punkte im Repository soweit möglich selbst erkennen. Fehlende Zugangsdaten werden über Konfigurationsplatzhalter dokumentiert, ohne die restliche Implementierung zu stoppen.

---

# 21. Referenzquellen für die Umsetzung

Diese Quellen dienen als Ausgangspunkt. Vor Produktion sind Nutzungsbedingungen und technische Endpunkte erneut zu prüfen.

- Destatis GENESIS – Preisindizes für Wohnimmobilien, Statistik 61262:  
  https://genesis.destatis.de/datenbank/online/statistic/61262/details

- Destatis – Quartalsreihe Häuserpreisindex, Tabelle 61262-0002:  
  https://genesis.destatis.de/datenbank/online/table/61262-0002

- FHFA House Price Index Datasets:  
  https://www.fhfa.gov/house-price-index

- CoinGecko API Documentation:  
  https://docs.coingecko.com/

- Alpha Vantage Documentation als möglicher Marktdatenanbieter:  
  https://www.alphavantage.co/documentation/

Die endgültige Anwendung darf keine Quelle allein deshalb verwenden, weil sie technisch leicht auslesbar ist. Lizenz, Speicherung, Attribution und öffentliche Darstellung müssen passen.

---

# 22. Copy-Paste-Build-Prompt für GPT-5.6 Extra High / Codex

Der folgende Prompt ist für einen Codex-Lauf mit Zugriff auf den vollständigen Website-Ordner gedacht.

````text
Du bist ein sehr erfahrener Full-Stack-Entwickler, Dateningenieur und Softwarearchitekt. Arbeite direkt im vorhandenen Repository meiner Website smstark-projekt.de. Dein Ziel ist nicht nur eine Planung, sondern die vollständige, robuste Implementierung eines öffentlich nutzbaren Assetklassen-Backtesters.

WICHTIG:
- Lies zuerst sämtliche relevanten Projektdateien, insbesondere AGENTS.md, README-Dateien, HTML/PHP-Seiten, zentrale CSS-Dateien, JavaScript, Includes, Header, Navigation, Footer, .htaccess und vorhandene Datenbank-/API-Strukturen.
- Untersuche den bestehenden Stil und integriere das Tool exakt in das vorhandene Design.
- Erfinde kein neues Dashboard-Design.
- Verwende den bestehenden Stack: HTML, CSS, Vanilla JavaScript, PHP und MySQL/MariaDB.
- Führe kein React, Vue, Angular, Tailwind, Node-Backend oder unnötiges Buildsystem ein.
- Nutze vorhandene Komponenten und Konventionen.
- Ändere keine fachlich unbeteiligten Dateien unnötig.
- Implementiere das Projekt vollständig. Bleibe nicht bei einem Plan stehen.
- Stelle nur dann eine Rückfrage, wenn ein unverzichtbarer Wert nicht aus Repository oder Serverkonfiguration ableitbar ist. Fehlen API-Keys oder Datenbankzugänge, baue trotzdem die vollständige Architektur, Beispielkonfiguration, Fixtures und Dokumentation.
- Schreibe sicheren, wartbaren, verständlich kommentierten Produktionscode.
- Verwende keine erfundenen Daten im Produktivpfad.
- Alle externen Datenzugriffe erfolgen ausschließlich serverseitig.
- Scrape keine beliebige Finanzwebsite, wenn eine offizielle API, ein offizieller Download oder ein lizenzierter Provider verfügbar ist.
- Dokumentiere Quellen, Proxy-Produkte, Datenfrequenzen und Einschränkungen.

==================================================
1. PRODUKTZIEL
==================================================

Erstelle eine Seite „Assetklassen-Backtester“ mit der Leitfrage:

„Was wäre aus 10.000 € geworden?“

Der Nutzer wählt:
- Startkapital
- Startdatum
- Enddatum
- einen Schnellzeitraum
- mehrere Anlageklassen

Das Tool zeigt:
- gemeinsamen Wertentwicklungs-Chart
- Endwert
- Gewinn/Verlust
- Gesamtrendite
- CAGR
- maximalen Drawdown
- Datenfrequenz
- letzten echten Datenpunkt
- Quellen und Methodik

Standard:
- 10.000 €
- letzte 10 Jahre
- Ende am letzten vollständig abgeschlossenen Tag

Einheitliche Chartintervalle:
- 1 Woche (`1W`)
- 1 Monat (`1M`)
- 6 Monate (`6M`)
- 1 Jahr (`1Y`)
- 3 Jahre (`3Y`)
- 5 Jahre (`5Y`)
- 10 Jahre (`10Y`)
- maximal verfügbar (`Max`)
- benutzerdefiniert

Die obere Mehrperiodentabelle verwendet die festen Spalten `1W`, `1M`, `6M`, `1Y`, `3Y`, `5Y` und `10Y`.

V1-Assets – ausschließlich:
1. S&P 500
2. Bitcoin
3. Gold

DAX, MSCI World, Emerging Markets, globaler Aktienmarkt, deutsche und US-amerikanische Immobilien sowie Magnificent-Seven-Einzelaktien werden noch nicht in der Oberfläche aktiviert. Das Datenmodell, die Provider-Schnittstellen und die Komponenten müssen weitere Assets später ohne Schemaänderung und ohne grundlegenden Umbau unterstützen. Implementiere in Version 1 keine leeren Karten oder funktionslosen Auswahlmöglichkeiten für diese späteren Assets; erwähne sie höchstens als klaren, nicht interaktiven Ausblick.

Inflation, Kosten, Steuern, Sparpläne und finanzierte Immobilien sind noch nicht aktiv. Bereite Erweiterungspunkte vor. In der UI dürfen nur klare „In Vorbereitung“-Hinweise erscheinen, keine scheinbar funktionierenden Schalter.

==================================================
2. METHODIK
==================================================

Normierung:

Einheiten = Startkapital / Startwert

Portfoliowert(t) = Einheiten × Wert(t)

Alternativ:

Portfoliowert(t) =
Startkapital × Wert(t) / Wert(Start)

Alle sichtbaren Reihen beginnen beim gleichen Startkapital.

Markt-Assets:
- speichere echte tägliche Schluss- oder Adjusted-Close-Beobachtungen
- keine Intraday-Daten
- keine künstlichen Wochenendzeilen in der Rohdatentabelle
- für den gemeinsamen täglichen Chart den letzten bekannten Wert an Wochenenden und Feiertagen rechnerisch fortführen
- kennzeichne Chartpunkte, die fortgeführt wurden
- für Aktienmarkt-Proxys Dividenden und Splits korrekt berücksichtigen
- bevorzuge Total-Return- oder thesaurierende investierbare EUR-Proxys
- dokumentiere den tatsächlichen Proxy

Bitcoin:
- BTC/EUR
- genau definierter täglicher Schlusswert
- dokumentierte Zeitzone, vorzugsweise UTC

Gold:
- Architektur für Spotpreis oder investierbaren EUR-ETC
- in V1 genau eine Methode aktiv
- Methode und Quelle transparent anzeigen

Spätere Assetklassen:
- Immobilien, DAX, MSCI World, Emerging Markets und weitere Reihen gehören nicht zum V1-Implementierungsumfang.
- Baue das System generisch genug für spätere native Frequenzen und weitere Provider, implementiere aber jetzt keine Destatis-/FHFA-Anbindung, keine Immobiliencharts und keine funktionslosen UI-Auswahlen.

Vergangenheitswarnung:
„Vergangene Wertentwicklung ist kein verlässlicher Indikator für zukünftige Ergebnisse.“

==================================================
3. DATUMSLOGIK
==================================================

- Nutzer darf beliebige gültige Daten wählen.
- Enddatum nicht in der Zukunft.
- Standardende ist der letzte vollständig abgeschlossene Kalendertag.
- Erzeuge zur Abfrage eine gemeinsame tägliche Bewertungsachse.
- Forward-Fill nur für Darstellung und Vergleich.
- Rohdaten bleiben in nativer Frequenz.
- Gibt es vor oder am Startdatum noch keinen Datenpunkt, darf das Asset nicht stillschweigend später beginnen.
- Zeige eine verständliche Verfügbarkeitswarnung.
- Biete, wenn sinnvoll, „Am frühesten gemeinsamen Datum starten“.
- Vergleiche niemals unbemerkt verschiedene Haltedauern.

==================================================
4. KENNZAHLEN
==================================================

Pflicht:
- finalValue
- absoluteReturn
- totalReturnPct
- cagrPct
- maxDrawdownPct
- effectiveStartDate
- effectiveEndDate
- lastRawObservationDate

CAGR:
CAGR = (Endwert / Anfangswert)^(1 / Jahre) − 1

Jahre = Kalendertage / 365,2425

Max Drawdown:
runningPeak(t) = max(value[0...t])
drawdown(t) = value(t) / runningPeak(t) − 1
maxDrawdown = minimum(drawdown)

Optional nur bei sauberer Umsetzung:
- bestes Jahr
- schlechtestes Jahr
- Volatilität

Berechne Volatilität nur auf echten Marktbeobachtungen und nicht auf künstlich fortgeführten Wochenendwerten. Alternativ lasse Volatilität in V1 weg.

==================================================
5. DATENBANK
==================================================

Erstelle versionierte SQL-Migrationen und Seed-Dateien.

Benötigte Tabellen:
- backtester_data_sources
- backtester_assets
- backtester_observations
- backtester_sync_state
- backtester_sync_runs

Nutze:
- InnoDB
- utf8mb4
- Fremdschlüssel
- UNIQUE(asset_id, observation_date)
- geeignete Bereichsindizes
- DECIMAL statt FLOAT für gespeicherte Werte
- Zeitstempel
- Qualitätsstatus
- Quellenrevision
- native Frequenz
- Proxybeschreibung

backtester_observations speichert in V1 nur echte tägliche beziehungsweise börsentägliche Schluss-/Referenzwerte. Das Schema darf eine native Frequenz enthalten, damit monatliche oder quartalsweise Reihen später ergänzt werden können. Es werden keine künstlichen Wochenendduplikate gespeichert.

Passe Tabellennamen nur an, wenn das Repository eine klare bestehende Namenskonvention hat.

==================================================
6. PROVIDER-ARCHITEKTUR
==================================================

Erstelle ein sauberes Provider-Interface, unter anderem:

- fetchRange(asset, from, to)
- fetchRecent(asset, lookback)
- supports(asset)

Normalisiere Providerantworten in ein gemeinsames HistoricalObservation-Objekt:
- date
- value
- currency
- sourceTimestamp
- qualityStatus
- sourceRevision

Implementiere für V1 separate Adapter für:
- S&P-500-Markt-/ETF-Daten
- Bitcoin
- Gold
- optional CSV-Import für Backfill und lokale Tests

Bevorzugte Quellen:
- seriöser Marktdatenanbieter für tägliche Adjusted-Close- oder Close-Werte des S&P-500-Proxys
- seriöser BTC/EUR-Anbieter
- seriöser Gold-/EUR-Anbieter oder dokumentierter EUR-Gold-Proxy

Destatis- und FHFA-Adapter gehören ausdrücklich nicht zum V1-Implementierungsumfang. Die Schnittstelle darf ihre spätere Ergänzung ermöglichen, aber es soll kein ungenutzter halbfertiger Produktionscode dafür entstehen.

Wichtig:
- Prüfe bestehende API-Konfigurationen im Projekt.
- Binde keinen Anbieter so tief ein, dass er nicht ausgetauscht werden kann.
- API-Schlüssel nur serverseitig.
- Provider-Symbole in DB/Seed konfigurierbar.
- Rate-Limits, Timeouts, Retries und Backoff.
- Prüfe Speicherung, Attribution und öffentliche Nutzung.
- Falls Produktions-API-Keys fehlen, implementiere den Provider vollständig, liefere .example-Konfiguration und Fixtures, aber verwende keine erfundenen Produktivdaten.
- Lege konkret offen, welche Konfiguration der Betreiber vor dem ersten produktiven Sync ergänzen muss.

==================================================
7. SYNCHRONISATION
==================================================

Erstelle:

1. backfill-history.php
2. update-daily.php
3. repair-gaps.php

Backfill:
- idempotent
- chunkbar
- fortsetzbar
- CLI-Parameter für Asset und Datumsbereich
- Upsert
- Rate-Limits
- Fehlerisolierung
- Fortschrittslog

Daily Update:
- täglich morgens Europe/Berlin
- lädt nur fällige Assets
- lädt überlappend die letzten 5–10 Tage
- upsertet Korrekturen
- markiert leere Antwort nicht als Erfolg
- unterstützt Wochenenden und Feiertage
- aktualisiert Sync-State

Page-Visit-Fallback:
- Daten aus DB sofort anzeigen
- danach same-origin POST an sync-if-stale.php möglich
- Endpoint prüft next_check_at und Lock
- höchstens kleiner inkrementeller Sync
- rate-limitiert
- keine frei wählbaren Symbole oder URLs
- Cron bleibt primär

Locking:
- DB-Lock mit lock_token und lock_until
- parallel sichere Transaktion
- nur Tokenbesitzer gibt Lock frei
- Lock läuft nach Fehler aus

Fehler:
- alte Daten weiterhin anzeigen
- Fehler pro Asset isolieren
- keine Secrets loggen
- consecutive_failures
- Backoff
- nutzerfreundlicher Datenstand

==================================================
8. API
==================================================

Erstelle mindestens:

GET /api/backtester/assets.php
GET /api/backtester/series.php
GET /api/backtester/status.php
POST /api/backtester/sync-if-stale.php

series.php akzeptiert:
- assets
- start
- end
- amount

Validierung:
- nur aktive Asset-Slugs
- Höchstzahl Assets
- ISO-Daten
- Start < Ende
- Betrag im sinnvollen Bereich
- maximale Abfragelänge
- prepared statements
- keine Providerparameter aus ungefiltertem Userinput

Antwort:
- request metadata
- common calendar
- normalized portfolio series
- raw source metadata
- carried-forward flag
- metrics
- warnings
- sync status
- vorberechnete Mehrperiodenrenditen für 1W, 1M, 6M, 1Y, 3Y, 5Y und 10Y oder ein separater effizienter Summary-Endpunkt
- effektive Start-/Enddaten je Mehrperiodenwert

Die obere Vergleichstabelle darf nicht sieben vollständige historische Reihen pro Asset separat aus dem Browser nachladen müssen. Berechne die Mehrperiodenübersicht effizient serverseitig oder liefere sie über einen dedizierten, gecachten Summary-Endpunkt.

Nutze konsistente JSON-Fehler, HTTP-Statuscodes, UTF-8 und sinnvolle Cache-Header. Keine Stacktraces im Produktivmodus.

==================================================
9. FRONTEND UND FESTGELEGTE SEITENSTRUKTUR
==================================================

Baue die Seite exakt im Stil der bestehenden Website. Die folgende Reihenfolge ist verbindlich:

1. bestehender Breadcrumb/Seitenkopf und kurze Einleitung
2. Mehrperioden-Vergleichstabelle ganz oben
3. drei Einzelcharts: S&P 500, Bitcoin, Gold
4. großer Gesamtvergleichschart mit Assetauswahl
5. Kennzahlen für den aktuell gewählten Backtestzeitraum
6. Methodik, Quellen und Datenstand

--------------------------------------------------
9.1 MEHRPERIODEN-VERGLEICHSTABELLE
--------------------------------------------------

Direkt unter der Einleitung steht eine Tabelle mit:

Zeilen:
- S&P 500
- Bitcoin
- Gold

Spalten:
- Asset
- 1W
- 1M
- 6M
- 1Y
- 3Y
- 5Y
- 10Y

Jede Zelle zeigt:
- primär die prozentuale Rendite
- optional kleiner den hypothetischen Endwert einer 10.000-€-Investition

Berechnung:
returnPct = endValue / startValue - 1
hypotheticalValue = 10000 * endValue / startValue

Regeln:
- gemeinsames Enddatum
- Intervallstart kalendarisch zurückrechnen
- bei Nicht-Handelstag den letzten bekannten Schlusswert am oder vor dem Stichtag verwenden
- bei zu kurzer Historie `Nicht verfügbar`, niemals eine kürzere Haltedauer unbemerkt verwenden
- Tooltip/zugängliche Details mit effektivem Start- und Enddatum, Startwert, Schlusswert, Rendite und 10.000-€-Endwert
- positive/negative Werte nicht nur farblich unterscheiden
- mobil darf ausschließlich die Tabelle lokal horizontal scrollen
- erste Spalte nach Möglichkeit sticky

--------------------------------------------------
9.2 INTERVALLSTEUERUNG
--------------------------------------------------

Verwende überall dieselben Intervalle:
- 1W
- 1M
- 6M
- 1Y
- 3Y
- 5Y
- 10Y
- Max
- Benutzerdefiniert

Setze die Optionen als zugängliche Buttons mit sichtbarem Aktivzustand und `aria-pressed` um. Standard ist 10Y, sofern gemeinsam verfügbar; sonst der längste gemeinsam verfügbare Standardzeitraum.

--------------------------------------------------
9.3 DREI EINZELCHARTS
--------------------------------------------------

Erstelle unter der Tabelle genau drei Einzelcharts in folgender Reihenfolge:
1. S&P 500
2. Bitcoin
3. Gold

Jeder Einzelchart zeigt:
- Assetname
- Proxy-/Quellenkurzhinweis
- letzten Schluss-/Referenzwert
- Rendite im gewählten Intervall
- Endwert aus 10.000 €
- eigene oder klar zugeordnete Intervallsteuerung
- Datenstand

Chartdarstellung:
- X-Achse Datum
- Y-Achse tatsächlicher Schluss-/Referenzwert des Assets
- Werte aus der eigenen Datenbank
- keine Intraday-Werte
- responsive
- mobil untereinander
- keine irreführende künstliche Glättung

Hover/Touch-Tooltip pro Punkt:
- Datum
- tatsächlicher Schluss-/Referenzwert
- prozentuale Veränderung seit Beginn des sichtbaren Intervalls
- hypothetischer Wert aus 10.000 € seit Intervallbeginn
- Kennzeichnung, falls der Tageswert vom letzten Handelstag fortgeführt wurde
- Datum der letzten echten Beobachtung

Formel:
returnSinceVisibleStart(t) = value(t) / value(visibleStart) - 1

Der Nutzer darf nicht exakt einen winzigen Punkt treffen müssen. Nutze eine nearest/index-x-Interaktion mit `intersect: false` oder technisch gleichwertigem Verhalten. Auf Touchgeräten muss dieselbe Information durch Antippen erreichbar sein.

--------------------------------------------------
9.4 GESAMTCHART
--------------------------------------------------

Nach den Einzelcharts folgt ein größerer Gesamtchart.

Assetauswahl:
- S&P 500
- Bitcoin
- Gold
- standardmäßig alle drei aktiv
- Nutzer kann jede Reihe ein-/ausblenden
- mindestens eine Reihe bleibt aktiv
- zugängliche Checkboxen oder echte Checkbox-basierte Chips

Der Gesamtchart besitzt eine eigene Intervallsteuerung mit:
- 1W, 1M, 6M, 1Y, 3Y, 5Y, 10Y, Max, Benutzerdefiniert

Normierung:
normalizedPortfolio(t) = 10000 * value(t) / value(start)

- alle aktiven Linien beginnen bei 10.000 €
- Y-Achse in Euro
- X-Achse Datum
- keine Rohpreise verschiedener Einheiten auf derselben Achse vergleichen
- Linien nicht nur durch Farbe unterscheiden; nutze zusätzlich Linienmuster, Marker oder direkte Labels
- Legende und Checkboxzustand synchron halten

Gemeinsamer Hover-Tooltip:
- Datum
- für jedes aktive Asset: Assetname, Wert aus 10.000 €, prozentuale Veränderung seit Intervallbeginn, tatsächlicher Schluss-/Referenzwert
- falls fortgeführt: letzter echter Beobachtungstag

Beispiel:
18.07.2024
S&P 500   14.820 €   +48,20 %
Bitcoin   31.460 €  +214,60 %
Gold      12.180 €   +21,80 %

Berechne normierte Werte und prozentuale Veränderungen beim Laden oder Intervallwechsel vor. Führe nicht bei jeder Mausbewegung den vollständigen Backtest neu aus.

--------------------------------------------------
9.5 KENNZAHLEN UND METHODIK
--------------------------------------------------

Unter oder neben dem Gesamtchart:
- Endwert aus 10.000 €
- Gewinn/Verlust
- Gesamtrendite
- CAGR
- maximaler Drawdown
- letzter echter Datenpunkt

Wichtig:
- obere Tabelle = feste Mehrperiodenübersicht bis zum aktuellen Datenstand
- untere Kennzahlen = aktuell ausgewählter Chart-/Backtestzeitraum

Methodik-Kurzhinweis:
„Die dargestellten Werte basieren auf historischen Schluss- beziehungsweise Referenzkursen. Tage ohne neuen Börsenwert werden im Chart mit dem letzten bekannten Wert fortgeführt. Vergangene Wertentwicklung ist kein verlässlicher Indikator für zukünftige Ergebnisse.“

Aufklappbarer Quellenbereich:
- tatsächliche Datenreihe/Proxy
- Provider
- Symbol/Identifier
- Währung
- Ausschüttungsbehandlung
- Schlusswertdefinition und Zeitzone
- erste/letzte Beobachtung
- letzter Sync
- Einschränkungen

--------------------------------------------------
9.6 TECHNISCHE FRONTEND-REGELN
--------------------------------------------------

Nutze vorhandene Chartbibliothek. Falls keine existiert, verwende eine lokal gespeicherte, fest versionierte Chart.js-Datei statt eines unversionierten externen CDN-Aufrufs.

CSS:
- vorhandene Tokens und Komponenten übernehmen
- neue Klassen mit asset-backtester-Präfix
- keine globalen Resets
- mobil ab 320 px
- sichtbare Fokuszustände
- keine ausschließlich farbliche Kodierung
- der Gesamtchart ist höher/prominenter als die Einzelcharts

JavaScript:
- modular
- kein globales Namespace-Chaos
- AbortController
- Debounce bei Datums-/Intervalländerungen
- vorberechnete Tooltipdaten
- verständliche Fehler
- aria-live
- keine Secrets
- keine direkte Fremd-API
- Chartinstanzen sauber aktualisieren oder zerstören, keine Memory Leaks
- Auswahl und Intervalle optional über URL-Queryparameter teilbar machen

Pflichtzustände:
- Laden/Skeleton
- Erfolg
- leere Reihe
- teilweise fehlende Daten
- Zeitraum nicht verfügbar
- API-Fehler mit Anzeige der letzten gespeicherten Daten
- kein Chart-Flackern bei Intervallwechsel

==================================================
10. SICHERHEIT
==================================================

- PDO prepared statements
- DB-Nutzer mit minimalen Rechten
- Secrets außerhalb Webroot oder Env
- .example-Konfiguration
- echte Config in .gitignore
- kein API-Key im Browser
- same-origin
- CSRF bei schreibenden Adminaktionen
- Cron-Secret bei HTTP-Cron
- Rate-Limit sync-if-stale
- HTML escaping
- keine Raw-Providerantwort im Frontend
- keine freien URL-Fetches
- sichere Fehlerbehandlung

==================================================
11. TESTS
==================================================

Erstelle automatisierte Tests oder, falls das Projekt kein Testframework besitzt, einen minimalen reproduzierbaren PHP-Test-Runner.

Teste:
- Mehrperiodenrenditen für 1W, 1M, 6M, 1Y, 3Y, 5Y und 10Y
- Stichtag auf Wochenende/Feiertag
- `Nicht verfügbar` bei zu kurzer Historie
- 10.000 € Normierung
- Tooltip-Rendite seit sichtbarem Intervallbeginn
- Asset-Ein-/Auswahl im Gesamtchart
- mindestens ein aktives Asset
- CAGR
- Gesamtrendite
- Drawdown
- Wochenende
- Feiertag
- Bitcoin-Wochenende
- Start vor Datenbeginn
- Enddatum
- Schaltjahr
- negative Rendite
- Duplicate Upsert
- Revision
- Providerparser
- Lock-Race
- partieller Fehler
- Retry
- API-Validierung

Fixtures müssen klein, deterministisch und unabhängig vom Internet sein.

==================================================
12. DOKUMENTATION
==================================================

Erstelle eine ausführliche README für den Backtester mit:
- Architektur
- Dateistruktur
- Datenbankinstallation
- Konfiguration
- API-Keys
- Provider
- Proxy-Symbole
- initialer Backfill
- Cronjobs
- Shared-Hosting-Deployment
- FileZilla-Upload
- phpMyAdmin
- Logs
- Fehlerdiagnose
- Datenquellen
- Methodik
- Lizenz-/Attributionspunkte
- Tests
- spätere Erweiterungen

Erstelle zusätzlich:
- config example
- SQL migrations
- Seed-Datei
- Cronbeispiele
- Deployment-Checkliste
- Liste offener Betreiberkonfigurationen

==================================================
13. VORGEHEN
==================================================

1. Repository untersuchen.
2. Bestehende Architektur und Designkonventionen dokumentieren.
3. Kurzen konkreten Implementierungsplan erstellen.
4. Danach ohne Unterbrechung implementieren.
5. SQL und Config erstellen.
6. Provider und Sync bauen.
7. API bauen.
8. Frontend integrieren.
9. Tests ausführen.
10. Fehler beheben.
11. Änderungen auf unbeabsichtigte Seiteneffekte prüfen.
12. Abschlussbericht liefern.

Im Abschlussbericht:
- alle erstellten/geänderten Dateien
- Architekturentscheidungen
- getestete Funktionen
- verbleibende externe Konfiguration
- exakte Schritte für Datenbank, Backfill und Cron
- bekannte Einschränkungen
- keine Behauptung „fertig“, wenn Provider-Keys oder reale Daten noch fehlen

Beginne jetzt mit der Repository-Analyse und setze das Projekt vollständig um.
````

---

# 23. Erwarteter Abschlussbericht von Codex

Codex soll am Ende mindestens berichten:

1. Welche bestehenden Website-Konventionen erkannt wurden.
2. Welche Dateien geändert oder erstellt wurden.
3. Welche Datenbankmigrationen nötig sind.
4. Welche Provider aktiv implementiert sind.
5. Welche API-Keys oder Symbole noch eingetragen werden müssen.
6. Wie der historische Backfill gestartet wird.
7. Wie Cronjobs eingerichtet werden.
8. Wie die Seite lokal und auf dem Hoster getestet wird.
9. Welche automatisierten Tests bestanden haben.
10. Welche methodischen Einschränkungen sichtbar dokumentiert sind.
11. Welche offenen Lizenz- oder Datenanbieterentscheidungen vor Veröffentlichung bestehen.
12. Ob die Seite auf Mobilgeräten und im bestehenden Design geprüft wurde.

---

# 24. Zusammenfassung der empfohlenen Umsetzung

Die robusteste Lösung besteht aus:

- eigener historischer Datenbank,
- echten täglichen Schlusskursen für Markt-Assets,
- nativen monatlichen/vierteljährlichen Immobilienreihen,
- dynamischem Forward-Fill nur für den Vergleichschart,
- täglichem Cronjob für Marktdaten,
- seltenerem source-spezifischem Immobilienupdate,
- zusätzlichem Stale-Check beim Seitenaufruf,
- Provider-Adaptern,
- serverseitigen API-Schlüsseln,
- idempotentem Backfill,
- reproduzierbarer Berechnungslogik,
- transparenter Methodik,
- vollständiger Integration in das bestehende Website-Design.

Damit ist das Projekt technisch so vorbereitet, dass Version 1 überschaubar bleibt, später aber ohne grundlegenden Neubau um Inflation, Kosten, Einzelaktien, Sparpläne oder realistische Immobilien-Cashflows erweitert werden kann.
