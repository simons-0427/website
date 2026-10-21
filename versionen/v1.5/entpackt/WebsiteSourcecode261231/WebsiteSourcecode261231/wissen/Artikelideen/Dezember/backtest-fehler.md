# Backtests, die zu gut aussehen: Die häufigsten Fehler in historischen Auswertungen

**Geplante Veröffentlichung:** 11. Dezember 2026  
**Wissensblock:** Datenanalyse

## Die Idee

Ein Backtest kann eine überzeugende Kurve liefern und trotzdem kaum etwas über die Zukunft sagen. Häufig liegt das an Informationen, die zum damaligen Zeitpunkt noch nicht bekannt waren, an nicht berücksichtigten Kosten oder an einem Datensatz, der die Verlierer nicht mehr enthält.

Der Artikel soll eine praktische Prüfung für historische Auswertungen liefern. Leser sollen nachher nicht nur auf Rendite und Trefferquote schauen, sondern auch auf die Frage, ob der Test die damalige Realität abbildet.

## Der geplante Inhalt

Zuerst werden Look-ahead Bias, Survivorship Bias und Overfitting erklärt. Look-ahead Bias entsteht, wenn eine Strategie unbewusst spätere Informationen verwendet. Survivorship Bias entsteht, wenn nur die heute noch existierenden Titel betrachtet werden. Overfitting entsteht, wenn Regeln so lange angepasst werden, bis sie die Vergangenheit auswendig gelernt haben.

Danach folgen Kosten und Umsetzung: Spread, Gebühren, Steuern, Slippage, Rebalancing und die tatsächliche Verfügbarkeit der Daten. Ein Backtest mit Monatsendkursen darf nicht so tun, als sei jeder Handel exakt zu diesem Kurs ausgeführt worden.

## Eine brauchbare Prüfstrecke

Der Beitrag sollte eine feste Reihenfolge vorschlagen. Erst die Datenherkunft und den Informationszeitpunkt prüfen, dann eine einfache Baseline vergleichen, anschließend Gebühren und realistische Ausführung einbauen. Danach wird der Zeitraum in mehrere Phasen geteilt. Eine Strategie, die nur in einer kurzen Marktphase funktioniert, braucht eine andere Einordnung als eine Strategie mit stabileren Ergebnissen.

## Verbindung zu bestehenden Inhalten

Der Text passt direkt zum Assetklassen-Backtester und zu den Artikeln über Prognosen und Risiko. Ein sinnvoller nächster Schritt wäre eine Warnbox im Backtester, die auf fehlende Kosten, kurze Zeitreihen oder ungewöhnlich gute Parameter hinweist.

