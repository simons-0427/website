# Erweiterung der Lebensmitteldatenbank, 21.10.2026

## Umfang und Datenbasis

- 120 neue Handelsprodukte: 45 zur Abdeckung teurer Plananforderungen, 75 für zusätzliche Auswahl.
- Gesamtbestand: 1.636 statt 1.516 Lebensmittel.
- Pro Produkt wurde der günstigste der dokumentierten ALDI Nord und Lidl Preise angesetzt und um 10 Prozent aufgerundet. Das ist kein vollständiger Marktvergleich.
- 73 neue Einträge nutzen passende Nährwerte aus BLS 4.0. Bei 47 Einträgen stammen die Nährwerte ganz oder teilweise von einem vergleichbaren bestehenden Lebensmittel. Beim türkischen Naturjoghurt wurden sieben Werte direkt anhand der Produktdeklaration korrigiert; die übrigen Werte sind Vergleichswerte. Auch bei BLS Einträgen bleiben einige Parameter, darunter Kreatin und Schadstoffe, Schätzungen. Die Preisangaben für UK und US sind aus bestehenden Relationen abgeleitet, nicht im dortigen Handel recherchiert.
- Die Quellen und Rechenschritte pro Produkt stehen in `discount_food_addition_audit_2026-10-21.json`. Produktpreise können sich ändern.
- Die Produktvarianten für Speisequark 20 %, Gratinkäse Der Würzige und Kasländer Classic sind im Namen ausgewiesen, damit die Nährwertzuordnung nachvollziehbar ist.
- Alle 120 neuen Einträge haben eindeutige englische Namen, auch wenn sie denselben Nährwertvergleich verwenden.

## Kostenwirkung

Die folgenden Werte sind Untergrenzen einer kontinuierlichen linearen Optimierung in EUR pro Tag. Sie sind keine Kosten eines auf ganze Mengen gerundeten Plans.

| Profil | Vorher | Nachher | Ersparnis |
| --- | ---: | ---: | ---: |
| Standard | 1,32324 | 1,32324 | 0 |
| Weiblich | 1,13500 | 1,13500 | 0 |
| Vegan | 1,73380 | 1,73380 | 0 |
| Whole Food | 4,40271 | 4,40166 | 0,00105 |
| Hohe Mikronährstoffe | 1,63934 | 1,63934 | 0 |

Die neuen Lebensmittel erweitern die Auswahl, senken aber die theoretischen Mindestkosten derzeit kaum. Im Whole-Food-Profil ersetzt das neue Lidl Schweinehackfleisch einen kleinen Teil des bisherigen Plans. Kostensenkung war für den Abschluss der Erweiterung keine Voraussetzung.

## Prüfung

- Alle 120 neuen Namen sind eindeutig. Preisreihenfolge, Sicherheitsmarge und Zuordnung der angehängten Datensätze wurden geprüft; dabei wurden keine Fehler gefunden.
- Die Prüfung ist mit `node Daten/verify_discount_food_additions_2026-10-21.mjs` wiederholbar. Sie vergleicht auch alle ursprünglichen 1.516 Einträge mit der Sicherung.
- Qualitätsaudit: keine neuen Befunde bei den 120 Einträgen. Die 1.454 Preisquellenabweichungen und 24 Tag Widersprüche im Gesamtreport betreffen ältere Datensätze.
- `database.json` und `database.js` enthalten dieselben 1.636 Einträge.
- Produktiver Solver: 10 von 10 getesteten Profilen lieferten gültige Pläne. Weitere Tests für PFAS Daten, Worker Protokoll und Klickverhalten bestanden.
- Deutsche Hauptseite, Benchmarkseite und englische Ernährungsseite übernehmen die 120 neuen Einträge einmalig in ältere lokal gespeicherte Datenbanken. Bearbeitete Lebensmittel und selbst angelegte Einträge bleiben erhalten. Eine spätere absichtliche Löschung eines neuen Eintrags wird nicht zurückgesetzt. Der Test `node benchmarks/seed-additions-test.js` deckt auch einen zunächst noch alten Seed ab.
- Die englische Seite lieferte mit dem produktiven Solver in 10 von 10 getesteten Profilen gültige Pläne.

## Bekannte Datenlimits

- Vergleichswerte sind keine Messung des konkreten Handelsprodukts. Bei später verfügbaren Herstellerangaben sollten die betroffenen Makronährwerte aktualisiert werden.
- Der Preisvergleich umfasst dokumentierte ALDI Nord und Lidl Angaben, keine vollständige Erhebung aller Discounter. Bei einem späteren Preiswechsel müssen die Einträge aktualisiert werden.
- Die Prüfung erfolgte lokal. Eine Prüfung auf der veröffentlichten Website ist hier nicht enthalten.
