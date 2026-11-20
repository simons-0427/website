import { appendMarkedText, queryTerms, searchIndex, searchTitle } from './query.mjs?v=6';

const form = document.querySelector('.site-search-nav');
const input = document.getElementById('site-search-nav-query');
const list = document.getElementById('site-search-suggestions');
const hamburger = document.querySelector('.nav-toggle');
const pageLanguage = () => document.documentElement.lang.toLowerCase().split('-')[0];
let indexPromise;
let updateTimer;
let request = 0;
let selection = -1;

function loadIndex() {
  indexPromise ??= fetch(new URL('./search-index.json', import.meta.url), { cache: 'no-cache' })
    .then(async response => {
      if (!response.ok) throw new Error('Suchindex nicht verfügbar');
      const { version, documents } = await response.json();
      if (version !== 1 || !Array.isArray(documents)) throw new Error('Unbekanntes Indexformat');
      const pages = new Map(documents.filter(entry => !entry.kind).map(page => [page.url, page]));
      return { documents, pages };
    })
    .catch(error => {
      indexPromise = undefined;
      throw error;
    });
  return indexPromise;
}

function closeSuggestions() {
  clearTimeout(updateTimer);
  request++;
  selection = -1;
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

async function showSuggestions(query, requestId) {
  try {
    const { documents, pages } = await loadIndex();
    if (requestId !== request || document.activeElement !== input) return;

    const shown = new Set();
    const suggestions = document.createDocumentFragment();
    const terms = queryTerms(query);
    for (const result of searchIndex(documents, query, pageLanguage())) {
      const page = pages.get(result.url);
      if (!page || shown.has(page.url)) continue;
      const target = new URL(page.url, location.origin);
      if (target.origin !== location.origin) continue;
      if (result.passage?.anchor) target.hash = encodeURIComponent(result.passage.anchor);
      shown.add(page.url);

      const row = document.createElement('li');
      row.setAttribute('role', 'presentation');
      const link = document.createElement('a');
      link.id = `site-search-suggestion-${shown.size}`;
      link.href = target.href;
      link.tabIndex = -1;
      link.setAttribute('role', 'option');
      link.setAttribute('aria-selected', 'false');
      const title = document.createElement('strong');
      title.className = 'site-search-suggestion-title';
      appendMarkedText(title, searchTitle(page), terms, Infinity);
      title.lang = page.language;
      const language = document.createElement('span');
      language.className = 'site-search-suggestion-language';
      language.textContent = page.language.toUpperCase();
      link.append(title, language);

      const passage = result.passage?.text;
      const isRecord = result.kind && result.title !== page.title;
      if (passage || isRecord) {
        const excerpt = document.createElement('span');
        excerpt.className = 'site-search-suggestion-excerpt';
        excerpt.lang = result.language;
        if (isRecord) {
          appendMarkedText(excerpt, result.title, terms, 80);
          if (passage) excerpt.append(' / ');
        }
        if (passage) appendMarkedText(excerpt, passage, terms, 110);
        link.append(excerpt);
      }
      row.append(link);
      suggestions.append(row);
      if (shown.size === 5) break;
    }

    list.replaceChildren(suggestions);
    list.hidden = !shown.size;
    input.setAttribute('aria-expanded', String(Boolean(shown.size)));
  } catch {
    if (requestId === request) closeSuggestions();
  }
}

function scheduleSuggestions() {
  closeSuggestions();
  const query = input.value.trim();
  if (!queryTerms(query).some(term => term.length >= 2)) return;
  const requestId = request;
  updateTimer = setTimeout(() => showSuggestions(query, requestId), 120);
}

input.addEventListener('focus', () => {
  if (hamburger?.getAttribute('aria-expanded') === 'true') hamburger.click();
  scheduleSuggestions();
});
input.addEventListener('input', event => {
  if (!event.isComposing) {
    if (hamburger?.getAttribute('aria-expanded') === 'true') hamburger.click();
    scheduleSuggestions();
  }
});
input.addEventListener('compositionend', scheduleSuggestions);

input.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    if (!list.hidden) event.preventDefault();
    closeSuggestions();
    return;
  }
  if (list.hidden) return;
  if (event.key === 'Enter' && selection !== -1) {
    event.preventDefault();
    location.assign(list.querySelector('[aria-selected="true"]').href);
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

  event.preventDefault();
  const options = [...list.querySelectorAll('[role="option"]')];
  options[selection]?.setAttribute('aria-selected', 'false');
  if (event.key === 'ArrowDown') selection = (selection + 1) % options.length;
  else selection = selection <= 0 ? options.length - 1 : selection - 1;
  const option = options[selection];
  option.setAttribute('aria-selected', 'true');
  input.setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView({ block: 'nearest' });
});

list.addEventListener('mousedown', event => event.preventDefault());
form.addEventListener('focusout', event => {
  if (!form.contains(event.relatedTarget)) closeSuggestions();
});
document.addEventListener('pointerdown', event => {
  if (!form.contains(event.target)) closeSuggestions();
});
hamburger?.addEventListener('click', closeSuggestions);
document.addEventListener('site:languagechange', scheduleSuggestions);

if (hamburger?.hasAttribute('data-search-menu')) {
  const menu = document.getElementById(hamburger.getAttribute('aria-controls'));
  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    menu.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    const label = pageLanguage() === 'en'
      ? (open ? 'Close menu' : 'Open menu')
      : (open ? 'Menü schließen' : 'Menü öffnen');
    hamburger.setAttribute('aria-label', label);
  });
}
