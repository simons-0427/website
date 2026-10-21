# Prognosen validieren: Wie du erkennst, ob dein Modell wirklich etwas kann

**Geplante Veröffentlichung:** 12. November 2026  
**Wissensblock:** Datenanalyse

## Die Idee

Eine Prognose ist nicht gut, weil sie eine komplizierte Formel benutzt. Sie ist gut, wenn sie bei neuen Daten nachvollziehbar funktioniert und ihre Fehler offen zeigt. Der Artikel soll erklären, wie man eine Prognose testet, ohne die Daten nachträglich passend zu machen.

## Der geplante Inhalt

Am Anfang wird ein einfacher Datensatz in Trainings- und Testzeitraum geteilt. Das Modell darf nur mit Informationen arbeiten, die zum jeweiligen Prognosezeitpunkt tatsächlich bekannt waren. Danach werden Fehlerkennzahlen vorgestellt. MAE zeigt den durchschnittlichen absoluten Fehler in der ursprünglichen Einheit. MAPE kann intuitiver wirken, ist aber bei Werten nahe null problematisch. Je nach Fragestellung können auch Medianfehler, RMSE oder eine Trefferquote sinnvoll sein.

Ein Beispiel mit monatlichem Cashflow macht den Unterschied sichtbar. Ein Modell kann im Durchschnitt gut liegen und trotzdem einzelne schlechte Monate übersehen. Deshalb sollte nicht nur eine Gesamtzahl erscheinen. Der Artikel soll Fehler nach Zeitraum, Marktphase und Größe der Abweichung aufschlüsseln.

## Was Leser vermeiden sollen

Wichtig sind typische Fehler: Daten aus der Zukunft verwenden, das Modell so lange anpassen, bis der Testzeitraum gut aussieht, oder eine sehr kleine Datenmenge überinterpretieren. Auch ein Vergleich mit einer einfachen Baseline gehört dazu. Wenn der Durchschnittswert oder der Wert des Vormonats genauso gut ist wie das komplizierte Modell, ist das eine wichtige Erkenntnis.

## Verbindung zu bestehenden Inhalten

Der Text passt zu Monte-Carlo-Simulationen und zu allen Seiten, auf denen Prognosen oder Backtests vorkommen. Als spätere Erweiterung wäre ein Prüfbereich sinnvoll, der Prognose, tatsächlichen Wert und Fehler über die Zeit gemeinsam anzeigt.

