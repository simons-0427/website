export function normalizeText(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ß', 'ss');
}

export function queryTerms(query) {
  return [...new Set(normalizeText(query).match(/[\p{L}\p{N}]+/gu) ?? [])];
}

export function searchTitle(entry) {
  if (entry.kind) return entry.title;

  const path = entry.url.replace(/\/+$/, '').replace(/\.html?$/i, '');
  if (/^(?:\/en)?\/downloads$/.test(path)) return 'Downloads';
  if (/^\/(?:projekte|en\/projects)\/(?!index$).+/.test(path)) {
    const suffix = entry.language === 'en' ? ' | Documentation' : ' | Dokumentation';
    return entry.title.endsWith(suffix) ? entry.title : entry.title + suffix;
  }
  return entry.title;
}

export function searchIndex(documents, query, preferredLanguage = 'de') {
  const terms = queryTerms(query);
  if (!terms.length) return [];

  const phrase = normalizeText(query.trim().replace(/\s+/g, ' '));
  const results = [];
  for (const document of documents) {
    const title = normalizeText(document.title);
    const visibleTitle = searchTitle(document);
    const displayTitle = normalizeText(visibleTitle);
    const isExcerpt = block => block.text !== document.title && block.text !== visibleTitle
      && !/^(?:home|startseite)\s+\//i.test(block.text);
    const termScores = terms.map(term => title.includes(term) || displayTitle.includes(term) ? 30 : 0);
    let bestPassage;
    let passageScore = 0;

    for (const block of document.blocks) {
      const text = normalizeText(block.text);
      const weight = block.heading ? 12 : 3;
      let score = 0;
      for (const [index, term] of terms.entries()) {
        if (!text.includes(term)) continue;
        termScores[index] = Math.max(termScores[index], weight);
        score += 10;
      }
      if (!score || !isExcerpt(block)) continue;
      if (terms.length > 1 && text.includes(phrase)) score += 7;
      if (!block.heading && block.text.length >= 55) score += 2;
      if (score > passageScore) {
        passageScore = score;
        bestPassage = block;
      }
    }

    if (termScores.some(score => score === 0)) continue;
    const fallback = document.blocks.find(block => !block.heading && block.text.length >= 55 && isExcerpt(block))
      ?? document.blocks.find(isExcerpt);
    results.push({
      ...document,
      passage: bestPassage ?? fallback,
      score: termScores.reduce((total, score) => total + score, 0)
        + (title.includes(phrase) || displayTitle.includes(phrase) ? 20 : 0)
        + (title === phrase || displayTitle === phrase ? 12 : 0)
        + (passageScore >= 10 * terms.length + 7 ? 5 : 0)
        + (document.language === preferredLanguage ? 1 : 0),
    });
  }

  return results.sort((left, right) => right.score - left.score
    || left.title.localeCompare(right.title, preferredLanguage));
}

export function excerpt(text, terms, limit = 190) {
  const positions = [];
  let normalized = '';
  let offset = 0;
  for (const character of text) {
    const folded = normalizeText(character);
    normalized += folded;
    for (let index = 0; index < folded.length; index++) positions.push(offset);
    offset += character.length;
  }
  positions.push(offset);

  const matches = [];
  for (const term of terms) {
    let match = normalized.indexOf(term);
    while (match !== -1) {
      const lastIndex = match + term.length - 1;
      const lastCharacter = positions[lastIndex];
      const afterMatch = Math.max(positions[lastIndex + 1],
        lastCharacter + String.fromCodePoint(text.codePointAt(lastCharacter)).length);
      matches.push([positions[match], afterMatch]);
      match = normalized.indexOf(term, match + term.length);
    }
  }
  matches.sort((left, right) => left[0] - right[0]);

  const first = matches[0]?.[0] ?? 0;
  let start = text.length > limit ? Math.max(0, first - Math.min(62, Math.floor(limit / 3))) : 0;
  if (start > 0) {
    const boundary = text.indexOf(' ', start);
    if (boundary >= 0 && boundary < first) start = boundary + 1;
  }
  const minimumEnd = Math.max(start + limit, (matches[0]?.[1] ?? 0));
  let end = Math.min(minimumEnd, text.length);
  if (end < text.length) {
    const boundary = text.indexOf(' ', end);
    if (boundary >= 0 && boundary - end < 24) end = boundary;
  }

  const ranges = [];
  for (const [from, to] of matches) {
    if (to <= start || from >= end) continue;
    end = Math.max(end, to);
    const previous = ranges.at(-1);
    if (previous && from <= previous[1]) {
      previous[1] = Math.min(end, Math.max(to, previous[1]));
    } else {
      ranges.push([Math.max(start, from), Math.min(end, to)]);
    }
  }
  return { start, end, ranges };
}

export function appendMarkedText(container, text, terms, limit) {
  const { start, end, ranges } = excerpt(text, terms, limit);
  let cursor = start;
  if (start > 0) container.append('…');
  for (const [from, to] of ranges) {
    container.append(text.slice(cursor, from));
    const mark = container.ownerDocument.createElement('mark');
    mark.textContent = text.slice(from, to);
    container.append(mark);
    cursor = to;
  }
  container.append(text.slice(cursor, end));
  if (end < text.length) container.append('…');
  return ranges.length > 0;
}
