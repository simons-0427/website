const nav = document.querySelector('nav.main-nav');
const toggle = nav?.querySelector(':scope > .nav-toggle');
const actions = nav?.querySelector(':scope > .nav-actions');

if (nav && toggle) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/suche/site-search.css?v=2';
  const styled = new Promise((resolve, reject) => {
    stylesheet.addEventListener('load', resolve, { once: true });
    stylesheet.addEventListener('error', () => reject(new Error('Search styles could not be loaded')), { once: true });
  });
  document.head.append(stylesheet);
  await styled;

  const template = document.createElement('template');
  template.innerHTML = `<form class="site-search-nav" method="get" role="search">
    <button type="submit" class="site-search-nav-submit">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" aria-hidden="true" focusable="false">
        <circle cx="10.8" cy="10.8" r="6.3"></circle><path d="m15.3 15.3 4.3 4.3"></path>
      </svg>
    </button>
    <input id="site-search-nav-query" class="site-search-nav-input" type="search" name="q"
      role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="site-search-suggestions"
      autocomplete="off" enterkeyhint="search" maxlength="160" required>
    <ul class="site-search-suggestions" id="site-search-suggestions" role="listbox" hidden></ul>
  </form>`;
  const form = template.content.firstElementChild;
  const input = form.querySelector('input');
  const button = form.querySelector('button');
  const suggestions = form.querySelector('ul');
  const setLanguage = () => {
    const english = document.documentElement.lang.toLowerCase().startsWith('en');
    const label = english ? 'Search website' : 'Website durchsuchen';
    const submit = english ? 'Run search' : 'Suche starten';
    form.action = english ? '/suche/en.html' : '/suche/';
    form.setAttribute('aria-label', label);
    input.setAttribute('aria-label', label);
    input.placeholder = english ? 'Search …' : 'Suchen …';
    button.setAttribute('aria-label', submit);
    button.title = submit;
    suggestions.setAttribute('aria-label', english ? 'Matching pages' : 'Passende Seiten');
  };
  setLanguage();
  document.addEventListener('site:languagechange', setLanguage);

  const group = document.createElement('div');
  group.className = 'site-search-actions';
  nav.insertBefore(group, actions ?? toggle);
  group.append(form);
  if (actions) group.append(actions);
  group.append(toggle);
  await import('./nav.js?v=2');
  form.dataset.searchReady = 'true';
}
