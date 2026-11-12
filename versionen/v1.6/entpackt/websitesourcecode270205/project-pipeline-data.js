const PROJECTS = [
  {
    id: 1,
    icon: '🛠️', iconBg: 'rgba(251,191,36,.12)',
    name: 'ToDo-Manager',
    desc: 'Task-Manager für Android mit gamification um kurzfristige und langfristige Aufgaben, Habits und Ziele zu erreichen und erledigen.',
    tags: ['tools'],
    status: 'idea',
    progress: 0,
    priority: 'none',
    eta: 'TBD',
  },
  {
    id: 2,
    icon: '💻', iconBg: 'rgba(57, 36, 251, 0.2)',
    name: 'Life-OS',
    desc: 'Windows-Desktop-App die den Status von Aufgaben, Zielen, Kalender, Gesundheit und Fitness, sowie die aktuelle Stimmung anzeigt und analysiert.',
    tags: ['tools'],
    status: 'idea',
    progress: 0,
    priority: 'none',
    eta: 'TBD',
  },
  {
    id: 3,
    icon: '🎮', iconBg: 'rgba(110,231,183,.1)',
    name: 'Dungeon Crawler 1.7 Handyversion',
    desc: 'Die v1.7 des Dungeon Crawlers wird auch als Handyversion auf Androidgeräten als .apk veröffentlicht.',
    tags: ['gaming'],
    status: 'planned',
    progress: 0,
    priority: 'medium',
    eta: 'Q1 2027',
  },
  {
    id: 4,
    icon: '🎮', iconBg: 'rgba(110,231,183,.1)',
    name: 'Dungeon Crawler im Playstore',
    desc: 'Die Handyversion der v1.7 des Dungeon Crawlers wird im Playstore verfügbar sein.',
    tags: ['gaming'],
    status: 'planned',
    progress: 0,
    priority: 'low',
    eta: 'Q2 2027',
  },
  {
    id: 5,
    icon: '₿', iconBg: 'rgba(110,231,183,.12)',
    name: 'Bitcoin-Dashboard v1.1',
    desc: 'Mehr Datensätze, schnelleres Laden, verbesserte Benutzeroberfläche.',
    tags: ['finance', 'data'],
    status: 'planned',
    progress: 0,
    priority: 'low',
    eta: 'Q2 2027',
  },
  {
    id: 6,
    icon: '📈', iconBg: 'rgba(110,231,183,.12)',
    name: 'Weltmarkt-Dashboard v1.1',
    desc: 'Suche über alle Kategorien, Kennzahlen vergleichen, Favouriten erstellen, mehr Datensätze, schnelleres Laden und verbesserte Benutzeroberfläche.',
    tags: ['finance', 'data'],
    status: 'wip',
    progress: 0,
    priority: 'medium',
    eta: 'Q1 2027',
  },
  {
    id: 7,
    icon: '🌐', iconBg: 'rgba(160,131,193,.12)',
    name: 'Überarbeitung Homepage & Projektartikel',
    desc: 'Überarbeitung der Homepage mit Erweiterung um Bilder und aktualisierte, uniforme Projektartikel mit aktuellen Bildern.',
    tags: ['web-development'],
    status: 'wip',
    progress: 55,
    priority: 'high',
    eta: 'Q1 2027',
  },
  {
    id: 8,
    icon: '🌐', iconBg: 'rgba(160,11,193,.12)',
    name: 'Zusammenführung Englisch/Deutsch',
    desc: 'Anstatt zwei seperate Seiten zu haben, wird die Seite in Zukunft zweisprachig sein, mit der Möglichkeit zwischen den Sprachen zu wechseln ohne zwischen unterschiedlichen URLs zu wechseln.',
    tags: ['web-development'],
    status: 'planned',
    progress: 0,
    priority: 'low',
    eta: 'Q1 2027',
  },
  {
    id: 9,
    icon: '🌐', iconBg: 'rgba(160,11,193,.12)',
    name: 'Suchfunktion auf Website',
    desc: 'In der NAV soll es eine Suchfunktion geben, die es ermöglicht, die gesamte Website nach Inhalten zu durchsuchen.',
    tags: ['web-development'],
    status: 'planned',
    progress: 0,
    priority: 'low',
    eta: 'Q2 2027',
  },
];

if (document.documentElement.lang === 'en') {
  const EN_PROJECTS = {
    1: {
      name: 'ToDo-Manager',
      desc: 'Task manager for Android with gamification to achieve short-term and long-term tasks, habits and goals.'
    },
    2: {
      name: 'Life-OS',
      desc: 'Windows-Desktop-App that displays the status of tasks, goals, calendar, health and fitness, as well as the current mood and analyzes it.'
    },
    3: {
      name: 'Dungeon Crawler 1.7 Mobile Version',
      desc: 'The v1.7 of the Dungeon Crawler will also be released as a mobile version on Android devices as an .apk, and will subsequently be available in the Play Store.'
    },
    4: {
      name: 'Dungeon Crawler in the Play Store',
      desc: 'The mobile version of the v1.7 of the Dungeon Crawler will be available in the Play Store.'
    },
    5: {
      name: 'Bitcoin Dashboard v1.1',
      desc: 'More datasets, faster loading, improved user interface.'
    },
    6: {
      name: 'World Market Dashboard v1.1',
      desc: 'Search across all categories, compare key figures, create favorites, more datasets, faster loading and improved user interface.'
    },
    7: {
      name: 'Homepage & Project Articles Overhaul',
      desc: 'Overhaul of the homepage with the addition of images and updated, uniform project articles with current images.'
    },
    8: {
      name: 'Backtester v1.3',
      desc: 'Dashboard to extend portfolio rules that influence asset selection, as well as the ability to save and load portfolios, and find the best portfolio for given parameters.'
    },
    9: {
      name: 'Search Function on Website',
      desc: 'There will be a search function in the NAV that allows users to search the entire website for content.'
    }
  };

  PROJECTS.forEach((project) => {
    const translation = EN_PROJECTS[project.id];
    if (translation) Object.assign(project, translation);
  });
}
