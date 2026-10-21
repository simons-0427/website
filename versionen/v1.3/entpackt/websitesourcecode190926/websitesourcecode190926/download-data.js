window.DOWNLOAD_PROJECTS = {
  "Dungeon Crawler": {
    "finished": false
  },
  "RPG-Menü": {
    "finished": false
  },
  "Website": {
    "finished": false
  },
  "Zufallszahl erraten": {
    "finished": true
  },
  "Immobilien-Kostenkalkulation": {
    "finished": false
  },
  "DCF-Tool": {
    "finished": true
  },
  "Kelly Rechner & Simulation": {
    "finished": false
  },
  "FIRE-Rechner": {
    "finished": true
  },
  "Ernährungsrechner": {
    "finished": false
  }
};

window.DOWNLOAD_PROJECT_FINISHED = Object.fromEntries(
  Object.entries(window.DOWNLOAD_PROJECTS).map(function (e) {
    return [e[0], !!(e[1] && e[1].finished)];
  })
);

window.DOWNLOAD_DATA = [
  {
    "id": 1,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.1",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-12",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.1.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.1.c"
      }
    ],
    "description": "Koordinatensystem zum Bewegen erstellt."
  },
  {
    "id": 2,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Alpha ",
    "version": "v0.2.1",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-13",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.2.1.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.2.1.c"
      }
    ],
    "description": "Map hinzugefügt, Spieler kann sich bewegen."
  },
  {
    "id": 3,
    "project": "RPG-Menü",
    "projectIcon": "📖",
    "name": "Quest-Menü",
    "version": "v1.0",
    "tags": [
      "gaming"
    ],
    "date": "2026-03-20",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Questmenu.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Questmenu.c"
      }
    ],
    "description": "Menü zum Erstellen von individuellen Quests, die später in das RPG-Menü integriert werden können."
  },
  {
    "id": 4,
    "project": "RPG-Menü",
    "projectIcon": "📖",
    "name": "RPG-Menü",
    "version": "v0.8",
    "tags": [
      "gaming"
    ],
    "date": "2026-03-29",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/RPG-MenuV08.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/RPG-MenuV08.c"
      }
    ],
    "description": "Erste Version des RPG-Menüs mit grundlegenden Funktionen, Merge von Klassen mit Stats, Skills, Attributes und Register."
  },
  {
    "id": 5,
    "project": "RPG-Menü",
    "projectIcon": "📖",
    "name": "Klassen-Menü",
    "version": "v1.0",
    "tags": [
      "gaming"
    ],
    "date": "2026-03-01",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Classes.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Classes.c"
      }
    ],
    "description": "Menü zum Erstellen von individuellen Klassen, die später in das RPG-Menü integriert werden können."
  },
  {
    "id": 6,
    "project": "Website",
    "projectIcon": "🌐",
    "name": "Website Quellcode (2026-05-20)",
    "version": "v1.0",
    "tags": [
      "web-development"
    ],
    "date": "2026-05-20",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/WebsiteSourcecode260520.zip"
      }
    ],
    "description": "Erste Version dieser Website, die als Portfolio und Projektübersicht dient. Enthält HTML, CSS und JavaScript."
  },
  {
    "id": 7,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.3",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-18",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.3.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.3.c"
      }
    ],
    "description": "Performance-Optimierungen."
  },
  {
    "id": 8,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.4",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-18",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.4.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.4.c"
      }
    ],
    "description": "Wände hinzugefügt."
  },
  {
    "id": 9,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.5",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-18",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.5.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.5.c"
      }
    ],
    "description": "Fallen und Mauern hinzugefügt."
  },
  {
    "id": 10,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.6",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-19",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.6.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.6.c"
      }
    ],
    "description": "getch_ hinzugefügt, um Eingaben zu lesen, ohne enter zu drücken."
  },
  {
    "id": 11,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.7",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-19",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.7.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.7.c"
      }
    ],
    "description": "Schatz hinzugefügt, danach wird die nächste Runde generiert."
  },
  {
    "id": 12,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.8",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-20",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.8.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.8.c"
      }
    ],
    "description": "Neue Runden vergrößern die Map."
  },
  {
    "id": 13,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha",
    "version": "v0.9",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-20",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.9.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.9.c"
      }
    ],
    "description": "Farben hinzugefügt."
  },
  {
    "id": 14,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeons Alpha - Finale Version",
    "version": "v0.9.3",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-27",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Dungeons 0.9.3.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/Dungeons 0.9.3.c"
      }
    ],
    "description": "Bugfixes, Animationen hinzugefügt."
  },
  {
    "id": 15,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler",
    "version": "v1.0",
    "tags": [
      "gaming"
    ],
    "date": "2026-04-25",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/DungeonCrawler.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/DungeonCrawler.c"
      }
    ],
    "description": "Raylib-Integration, Partikeleffekte, Gegner hinzugefügt,Highscore-System, 3 Item-Typen, verbessertes UI und viele Bugfixes."
  },
  {
    "id": 16,
    "project": "Zufallszahl erraten",
    "projectIcon": "🎮",
    "name": "Zufallszahl erraten",
    "version": "v0.4",
    "tags": [
      "gaming"
    ],
    "date": "2026-01-04",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/ZufallszahlV04.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/ZufallszahlV04.c"
      }
    ],
    "description": "Spiel zum Erraten einer Zufallszahl, die vom Computer generiert wird. Der Spieler hat beliebige Versuche, um die Zahl zu erraten, bekommt aber Punkte für seine Performance."
  },
  {
    "id": 17,
    "project": "Immobilien-Kostenkalkulation",
    "projectIcon": "📊",
    "name": "Immobilien-Kostenkalkulation",
    "version": "v1.0",
    "tags": [
      "finance",
      "tools"
    ],
    "date": "2026-05-18",
    "files": [
      {
        "type": "xlsx",
        "label": ".xlsx",
        "href": "data/Immobilien_Kalkulationstool_Pro.xlsx"
      }
    ],
    "description": "Grundlegendes Tool zur Kalkulation von Immobilien-Kosten, Cashflow und Rendite."
  },
  {
    "id": 18,
    "project": "DCF-Tool",
    "projectIcon": "📊",
    "name": "DCF-Tool",
    "version": "v1.0",
    "tags": [
      "finance",
      "tools",
      "data"
    ],
    "date": "2026-04-18",
    "files": [
      {
        "type": "xlsx",
        "label": ".xlsx",
        "href": "data/DCF_Tool.xlsx"
      }
    ],
    "description": "Tool zur Durchführung von DCF-Analysen für Investitionsentscheidungen."
  },
  {
    "id": 19,
    "project": "Zufallszahl erraten",
    "projectIcon": "🎮",
    "name": "Zufallszahl erraten",
    "version": "v1.0",
    "tags": [
      "gaming"
    ],
    "date": "2026-05-20",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/ZufallszahlFinal.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/ZufallszahlFinal.c"
      }
    ],
    "description": "Endgültige Version des Zufallszahl-Erratenspiels mit Umzug auf Raylib, UI und zusätzlichen Funktionen."
  },
  {
    "id": 20,
    "project": "Immobilien-Kostenkalkulation",
    "projectIcon": "📊",
    "name": "Immobilien-Kostenkalkulation",
    "version": "v1.1",
    "tags": [
      "finance",
      "tools"
    ],
    "date": "2026-05-21",
    "files": [
      {
        "type": "xlsx",
        "label": ".xlsx",
        "href": "data/v1.1_Immobilien_Kalkulationstool_Pro.xlsx"
      }
    ],
    "description": "Verbesserte Version des Immobilien-Kostenkalkulationstools mit zusätzlichen Funktionen und verbesserten Berechnungen."
  },
  {
    "id": 21,
    "project": "DCF-Tool",
    "projectIcon": "📊",
    "name": "DCF-Tool",
    "version": "v1.1",
    "tags": [
      "finance",
      "tools",
      "data"
    ],
    "date": "2026-05-21",
    "files": [
      {
        "type": "xlsx",
        "label": ".xlsx",
        "href": "data/v1.1_DCF_Tool.xlsx"
      }
    ],
    "description": "Verbesserte Version des DCF-Toools mit zusätzlichen Funktionen und verbesserten Berechnungen."
  },
  {
    "id": 22,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler",
    "version": "v1.1",
    "tags": [
      "gaming"
    ],
    "date": "2026-05-21",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/DungeonCrawlerV1_1.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/DungeonCrawlerV1_1.c"
      }
    ],
    "description": "Schilde schützen gegen Gegner, Item um Gegner zu besiegen hinzugefügt, Item um durch Wände zu gehen hinzugefügt, Bugfixes."
  },
  {
    "id": 23,
    "project": "Kelly Rechner & Simulation",
    "projectIcon": "🎲",
    "name": "Kelly Rechner & Simulation",
    "version": "v1.0",
    "tags": [
      "finance",
      "tools"
    ],
    "date": "2026-05-22",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/kellykriterium.zip"
      }
    ],
    "description": "Tool zur Berechnung der optimalen Einsatzhöhe bei Wetten und Investitionen nach dem Kelly-Kriterium, inklusive Simulation."
  },
  {
    "id": 24,
    "project": "Website",
    "projectIcon": "🌐",
    "name": "Website Quellcode (2026-05-30)",
    "version": "v1.1",
    "tags": [
      "web-development"
    ],
    "date": "2026-05-30",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/WebsiteSourcecode260530.zip"
      }
    ],
    "description": "Zweite Version dieser Website, die als Portfolio und Projektübersicht dient. Enthält HTML, CSS und JavaScript."
  },
  {
    "id": 25,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler",
    "version": "v1.2",
    "tags": [
      "gaming"
    ],
    "date": "2026-05-31",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/DungeonCrawlerV1_2.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/DungeonCrawlerV1_2.c"
      }
    ],
    "description": "Vollbildfunktion und Gegner-Killcount hinzugefügt; das Spiel im Web spielbar gemacht."
  },
  {
    "id": 26,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler",
    "version": "v1.3",
    "tags": [
      "gaming"
    ],
    "date": "2026-06-14",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/DungeonCrawlerV1_3.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/DungeonCrawlerV1_3.c"
      }
    ],
    "description": "Menü-Redesign, Pause-Funktion hinzugefügt, HUD-Anzeigen überarbeitet, In-Game-Shop für Skins und Upgrades eingebaut, Counter komplett neu aufgebaut."
  },
  {
    "id": 27,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler",
    "version": "v1.4",
    "tags": [
      "gaming"
    ],
    "date": "2026-07-01",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/DungeonCrawlerV1_4.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/DungeonCrawlerV1_4.c"
      }
    ],
    "description": "Achievements hinzugefügt, Settings-Menü hinzugefügt, Future-Updates-Info nach oben verschoben, Mehr Item-Upgrades, 10+ neue Skins hinzugefügt, animierte Skins möglich, Nerfes für Skin-Prices"
  },
  {
    "id": 28,
    "project": "FIRE-Rechner",
    "projectIcon": "🔥",
    "name": "FIRE-Rechner",
    "version": "v1.0",
    "tags": [
      "finance",
      "tools"
    ],
    "date": "2026-07-10",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/fire.zip"
      }
    ],
    "description": "Tool zur Berechnung des nötigen Kapitals, um finanziell unabhängig zu werden, sowie der benötigten Zeit bis zur finanziellen Unabhängigkeit."
  },
  {
    "id": 27,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Skin Preview",
    "version": "Snapshot",
    "tags": [
      "gaming"
    ],
    "date": "2026-07-03",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/skinideas.zip"
      },
      {
        "type": "c",
        "label": ".c",
        "href": "data/skinideas.c"
      }
    ],
    "description": "Zukünftige Skins-Designs für die Version 1.5 wurden hinzugefügt, darunter Blade Legend, Ascendant und Constellation."
  },
  {
    "id": 28,
    "project": "Immobilien-Kostenkalkulation",
    "projectIcon": "📊",
    "name": "Immobilien-Kostenkalkulation",
    "version": "v1.2",
    "tags": [
      "finance",
      "tools"
    ],
    "date": "2026-07-17",
    "files": [
      {
        "type": "xlsx",
        "label": ".xlsx",
        "href": "data/v1.2_Immobilien_Kalkulationstool.xlsx"
      }
    ],
    "description": "Verbesserte Version des Immobilien-Kostenkalkulationstools mit zusätzlichen Funktionen und verbesserten Berechnungen, sowie einer besseren Benutzeroberfläche."
  },
  {
    "id": 29,
    "project": "Website",
    "projectIcon": "🌐",
    "name": "Website Quellcode (2026-07-08)",
    "version": "v1.2",
    "tags": [
      "web-development"
    ],
    "date": "2026-07-08",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/websitesourcecode260708.zip"
      }
    ],
    "description": "Dritte Version dieser Website, die als Portfolio und Projektübersicht dient. Enthält HTML, CSS und JavaScript."
  },
  {
    "id": 30,
    "project": "DCF-Tool",
    "projectIcon": "📊",
    "name": "DCF-Tool",
    "version": "v1.2",
    "tags": [
      "finance",
      "tools",
      "data"
    ],
    "date": "2026-07-30",
    "files": [
      {
        "type": "xlsx",
        "label": ".xlsx",
        "href": "data/v1.2_DCF_Tool.xlsx"
      }
    ],
    "description": "Verbesserte Version des DCF-Toools mit zusätzlichen Funktionen und verbesserten Berechnungen, sowie einer besseren Benutzeroberfläche."
  },
  {
    "id": 31,
    "project": "RPG-Menü",
    "projectIcon": "📖",
    "name": "RPG-Menü",
    "version": "v0.9",
    "tags": [
      "gaming"
    ],
    "date": "2026-07-23",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/RPG_MenuV09.zip"
      }
    ],
    "description": "Merge von Klassen-Menü und v0.8, außerdem Kettenquests, Gilden und einen Zufallsgenerator für  Quests hinzugefügt."
  },
  {
    "id": 32,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler: Legacy of Stars",
    "version": "v1.5",
    "tags": [
      "gaming"
    ],
    "date": "2026-08-05",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/DungeonCrawlerV1_5.zip"
      }
    ],
    "description": "Mehr Achievements, Musik hinzugefügt, neue Skins, Bugfixes, Einstellungen erweitert."
  },
  {
    "id": 33,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler für das Web",
    "version": "v1.2",
    "tags": [
      "gaming"
    ],
    "date": "2026-06-07",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/v1.2_playdungeoncrawler.zip"
      }
    ],
    "description": "Version 1.2 wurde mit Emscripten für das Web kompiliert. Das Spiel läuft seit dem auch im Browser."
  },
  {
    "id": 34,
    "project": "Ernährungsrechner",
    "projectIcon": "🥦",
    "name": "Ernährungsrechner",
    "version": "v1.0",
    "tags": [
      "data"
    ],
    "date": "2026-08-12",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/Ernaehrungsrechner.zip"
      }
    ],
    "description": "Einfacher Rechner zur Berechnung der günstigsten optimalen Nährstoffzufuhr basierend auf individuellen Profilangaben."
  },
  {
    "id": 35,
    "project": "Dungeon Crawler",
    "projectIcon": "🎮",
    "name": "Dungeon Crawler für das Web",
    "version": "v1.5",
    "tags": [
      "gaming"
    ],
    "date": "2026-08-25",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/v1.5_playdungeoncrawler.zip"
      }
    ],
    "description": "Version 1.5 wurde mit Emscripten für das Web kompiliert. Die Web-Version ist nun spielbar und enthält alle Features der Desktop-Version."
  },
  {
    "id": 34,
    "project": "Ernährungsrechner",
    "projectIcon": "🥦",
    "name": "Ernährungsrechner",
    "version": "v1.1",
    "tags": [
      "data"
    ],
    "date": "2026-09-06",
    "files": [
      {
        "type": "zip",
        "label": ".zip",
        "href": "data/v1.1_Ernaehrungsrechner.zip"
      }
    ],
    "description": "Erweiterte Version des Ernährungsrechners mit Eiweißqualitäts-, Schadstoffs- und Flüssigkeitsanforderungen."
  }
];

window.DOWNLOADS = window.DOWNLOAD_DATA;
