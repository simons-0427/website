import { appendMarkedText, queryTerms, searchIndex, searchTitle } from './query.mjs?v=6';

const input = document.getElementById('search-query');
const status = document.getElementById('search-status');
const list = document.getElementById('search-results');
const more = document.getElementById('search-more');
const query = (new URLSearchParams(location.search).get('q') ?? '').trim().slice(0, 160);
const terms = queryTerms(query);
const pageLanguage = document.documentElement.lang;
const messages = pageLanguage === 'en' ? {
  pipeline: 'Project pipeline',
  invalid: 'Enter a word or number.',
  loading: 'Loading search index …',
  count: amount => amount === 1 ? '1 result' : `${amount} results`,
  empty: 'No results found.',
  unavailable: 'The search index is currently unavailable. Reload the page later.',
} : {
  pipeline: 'Projekt-Pipeline',
  invalid: 'Gib ein Wort oder eine Zahl ein.',
  loading: 'Suchindex wird geladen …',
  count: amount => amount === 1 ? '1 Treffer' : `${amount} Treffer`,
  empty: 'Keine Treffer gefunden.',
  unavailable: 'Der Suchindex ist gerade nicht verfügbar. Lade die Seite später erneut.',
};
input.value = query;
document.getElementById('site-search-nav-query').value = query;
for (const switcher of document.querySelectorAll('[data-search-language-switch]')) {
  const destination = new URL(switcher.href);
  if (query) destination.searchParams.set('q', query);
  switcher.href = destination.href;
}

function renderResult(result) {
  const item = document.createElement('li');
  const meta = document.createElement('div');
  meta.className = 'search-result-meta';
  const kind = { pipeline: messages.pipeline, download: 'Download' }[result.kind];
  meta.textContent = [result.language.toUpperCase(), kind].filter(Boolean).join(' / ');
  const heading = document.createElement('h2');
  const link = document.createElement('a');
  const target = new URL(result.url, location.origin);
  if (target.origin !== location.origin) return;
  const anchor = result.passage?.anchor;
  if (anchor) target.hash = encodeURIComponent(anchor);
  link.href = target.href;
  link.lang = result.language;
  appendMarkedText(link, searchTitle(result), terms, Infinity);
  heading.append(link);
  item.append(meta, heading);
  if (result.passage) {
    const description = document.createElement('p');
    description.lang = result.language;
    appendMarkedText(description, result.passage.text, terms, 145);
    item.append(description);
  }
  list.append(item);
}

async function render() {
  if (!query) return;
  if (!terms.length) {
    status.textContent = messages.invalid;
    return;
  }

  status.textContent = messages.loading;
  try {
    const response = await fetch('./search-index.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Suchindex konnte nicht geladen werden.');
    const { version, documents } = await response.json();
    if (version !== 1 || !Array.isArray(documents)) throw new Error('Unbekanntes Indexformat.');
    const results = searchIndex(documents, query, pageLanguage);
    status.textContent = results.length ? messages.count(results.length) : messages.empty;

    let offset = 0;
    const renderMore = () => {
      for (const result of results.slice(offset, offset + 20)) renderResult(result);
      offset += 20;
      more.hidden = offset >= results.length;
    };
    more.addEventListener('click', renderMore);
    renderMore();
  } catch (error) {
    console.error(error);
    status.textContent = messages.unavailable;
  }
}

render();
