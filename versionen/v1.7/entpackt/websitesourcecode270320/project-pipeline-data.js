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
    name: 'Dungeon Crawler im Playstore',
    desc: 'Die Handyversion der v1.7 des Dungeon Crawlers wird im Playstore verfügbar sein.',
    tags: ['gaming'],
    status: 'planned',
    progress: 0,
    priority: 'low',
    eta: 'Q2 2027',
  },
  {
    id: 4,
    icon: '₿', iconBg: 'rgba(110,231,183,.12)',
    name: 'Bitcoin-Dashboard v1.1',
    desc: 'Mehr Datensätze, schnelleres Laden, verbesserte Benutzeroberfläche.',
    tags: ['finance', 'data'],
    status: 'wip',
    progress: 0,
    priority: 'medium',
    eta: 'Q2 2027',
  },
  {
    id: 5,
    icon: '🌐', iconBg: 'rgba(160,11,193,.12)',
    name: 'Suchfunktion auf Website',
    desc: 'In der NAV soll es eine Suchfunktion geben, die es ermöglicht, die gesamte Website nach Inhalten zu durchsuchen. Außerdem wird die Mobile-UI verbessert.',
    tags: ['web-development'],
    status: 'wip',
    progress: 60,
    priority: 'high',
    eta: 'Q1 2027',
  },
  {
    id: 6,
    icon: '🌐', iconBg: 'rgba(160,11,193,.12)',
    name: 'Mobile UI Verbesserungen',
    desc: 'Die Mobile-UI wird verbessert, um die Benutzerfreundlichkeit und Zugänglichkeit auf Smartphones zu erhöhen.',
    tags: ['web-development'],
    status: 'planned',
    progress: 0,
    priority: 'low',
    eta: 'Q2 2027',
  },
  {
    id: 7,
    icon: '🥦', iconBg: 'rgba(110,231,183,.12)',
    name: 'Ernährungsrechner v1.6',
    desc: 'Mobile-UI Verbesserungen, direkte Lösung und Möglichkeit, einzelne Zutaten rauszuwerfen.',
    tags: ['data'],
    status: 'planned',
    progress: 0,
    priority: 'medium',
    eta: 'Q2 2027',
  }
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
      name: 'Dungeon Crawler in the Play Store',
      desc: 'The mobile version of the v1.7 of the Dungeon Crawler will be available in the Play Store.'
    },
    4: {
      name: 'Bitcoin Dashboard v1.1',
      desc: 'More datasets, faster loading, improved user interface.'
    },
    5: {
      name: 'Search Function on Website',
      desc: 'There will be a search function in the NAV that allows users to search the entire website for content. Additionally, the mobile UI will be improved.'
    },
    6: {
      name: 'Mobile UI Improvements',
      desc: 'The mobile user interface will be improved for better usability and accessibility.'
    },
    7: {
      name: 'Nutrition Calculator v1.6',
      desc: 'Mobile UI improvements, direct soltuion and possibility to throw out single ingredients'
    },
  };

  PROJECTS.forEach((project) => {
    const translation = EN_PROJECTS[project.id];
    if (translation) Object.assign(project, translation);
  });
}
