const PROJECTS = [
  {
    id: 1,
    icon: '🎮', iconBg: 'rgba(110,231,183,.1)',
    name: 'Dungeon Crawler 1.7',
    desc: 'Neue Räume, Rätsel & Seeded Maps, Challenges, UI & QoL-Verbesserungen, Andoid- und Webversionen, und Playstore- Veröffentlichung.',
    tags: ['gaming'],
    status: 'wip',
    progress: 20,
    priority: 'medium',
    eta: 'Q1 2027',
  },
  {
    id: 2,
    icon: '📈', iconBg: 'rgba(110,231,183,.12)',
    name: 'Bitcoin-Dashboard',
    desc: 'Dashboard mit Daten und Kennzahlen rund um Bitcoin.',
    tags: ['finance', 'data'],
    status: 'planned',
    progress: 0,
    priority: 'low',
    eta: '2027',
  },
  {
    id: 3,
    icon: '🛠️', iconBg: 'rgba(251,191,36,.12)',
    name: 'Produktivitäts-Tool',
    desc: 'Task-Manager mit Eisenhower-Matrix, Pomodoro-Timer, Kalenderintegration und Fortschrittsanalyse.',
    tags: ['tools'],
    status: 'idea',
    progress: 0,
    priority: 'none',
    eta: 'TBD',
  },
  {
    id: 4,
    icon: '🌐', iconBg: 'rgba(36, 154, 251, 0.12)',
    name: 'Website auf Englisch',
    desc: 'Die Website soll auch auf Englisch verfügbar sein, um international lesbar zu sein.',
    tags: ['web-development'],
    status: 'wip',
    progress: 90,
    priority: 'high',
    eta: 'Q4 2026',
  },
  {
    id: 5,
    icon: '📈', iconBg: 'rgba(22, 95, 66, 0.1)',
    name: 'Ernährungsrechner v1.3',
    desc: 'Hinzufügen von Omega-3- & Omega-6 Fettsäuren sowie Transfetten',
    tags: ['data'],
    status: 'wip',
    progress: 0,
    priority: 'medium',
    eta: 'Q1 2027',
  }
];

if (document.documentElement.lang === 'en') {
  const EN_PROJECTS = {
    1: {
      name: 'Dungeon Crawler 1.7',
      desc: 'New rooms, puzzles and seeded maps, challenges, UI and quality-of-life improvements, plus Android and web versions and a Play Store release.'
    },
    2: {
      name: 'Bitcoin dashboard',
      desc: 'Dashboard with Bitcoin data and key metrics.'
    },
    3: {
      name: 'Productivity tool',
      desc: 'Task manager with an Eisenhower matrix, Pomodoro timer, calendar integration and progress analysis.'
    },
    4: {
      name: 'English website',
      desc: 'An English version of the website, making the projects easier to read internationally.'
    },
    5: {
      name: 'Nutrition Calculator v1.3',
      desc: 'Adding Omega-3 & Omega-6 fatty acids as well as trans fats.'
    }
  };

  PROJECTS.forEach((project) => {
    const translation = EN_PROJECTS[project.id];
    if (translation) Object.assign(project, translation);
  });
}
