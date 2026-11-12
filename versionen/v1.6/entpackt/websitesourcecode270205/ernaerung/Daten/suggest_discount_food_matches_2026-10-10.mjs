import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'aldi_nord_price_catalog_extended_2026-10-10.json'), 'utf8')).items;
const foods = JSON.parse(fs.readFileSync(path.join(root, 'database.json'), 'utf8'));
const normalize = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
const stop = new Set(['bio', 'aldi', 'nord', 'milsani', 'cucina', 'gut', 'natur', 'frisch', 'roh', 'aus', 'mit', 'und', 'von', 'der', 'die', 'das', 'xxl', 'packung', 'beutel', 'glas', 'stueck', 'filet', 'filets']);
const tokens = text => [...new Set(normalize(text).split(' ').filter(x => x.length > 2 && !stop.has(x)))];
const grams = pack => {
  const compact = pack.replace(/\./g, '').replace(/,/g, '.');
  const multi = compact.match(/(\d+)\s*[x×]\s*(\d+)\s*[- ]?g/i);
  if (multi) return +multi[1] * +multi[2];
  const kg = compact.match(/(\d+(?:\.\d+)?)\s*[- ]?kg[- ]?(?:Packung|Beutel|Stück|Eimer)/i);
  if (kg) return +kg[1] * 1000;
  const g = compact.match(/(\d+)\s*[- ]?g(?:[- ]?(?:Packung|Beutel|Dose|Becher|Glas|Stück|Schale|Flasche))?/i);
  return g ? +g[1] : null;
};
const unitPrice = item => {
  const m = item.pack.match(/(?:kg|KG)(?:\s*\(ATG\))?\s*=\s*(\d+[.,]\d+)/);
  if (m) return +m[1].replace(',', '.') / 10;
  const g = grams(item.pack);
  return g ? item.price * 100 / g : null;
};
const suggestions = catalog.map(item => {
  const ts = tokens(item.name);
  const matches = foods.map(food => {
    const ft = tokens(food.name);
    const overlap = ts.filter(x => ft.some(y => y.startsWith(x) || x.startsWith(y))).length;
    const score = overlap / Math.max(1, Math.max(ts.length, ft.length));
    return { name: food.name, category: food.category, score };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  return { ...item, grams: grams(item.pack), eurPer100: unitPrice(item), matches };
});
const output = path.join(import.meta.dirname, 'discount_food_match_suggestions_2026-10-10.json');
fs.writeFileSync(output, JSON.stringify({ checkedAt: '2026-10-10', suggestions }, null, 2) + '\n');
console.log(`${suggestions.length} catalog entries, ${suggestions.filter(x => x.eurPer100 !== null).length} with a calculable per-100g price.`);
