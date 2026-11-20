const EXTENSION_NAMES = {"silver": "Silber-Future", "wti": "WTI-Öl-Future", "us_real_5y": "US-Realrendite 5 Jahre", "us_real_10y": "US-Realrendite 10 Jahre", "us_initial_claims": "US-Erstanträge auf Arbeitslosenhilfe", "us_continued_claims": "US-Folgeanträge auf Arbeitslosenhilfe", "us_core_pce_index": "US-Kern-PCE-Preisindex", "us_core_pce_yoy": "US-Kern-PCE-Inflation (Jahresvergleich)", "us_nfci": "Finanzierungsbedingungen USA (NFCI)", "us_stlfsi": "Finanzstress USA (STLFSI4)", "ecb_deposit_rate": "EZB-Einlagezins", "gold_silver_ratio": "Gold/Silber-Futures-Verhältnis", "brent_wti_diff": "Brent minus WTI (Futures)", "us_breakeven_5y": "US-Breakeven-Näherung 5 Jahre", "us_breakeven_10y": "US-Breakeven-Näherung 10 Jahre", "us_de_10y_gap": "Renditeabstand USA/Deutschland 10J", "us_core_headline_gap": "US-Kerninflation minus Gesamtinflation", "us_claims_4w": "US-Erstanträge, Vierwochendurchschnitt"};
export const CATEGORY_LABELS = {
    macro: 'Konjunktur',
    monetary: 'Zinsen & Geldpolitik',
    markets: 'Märkte',
};

export const SECTION_LABELS = {
    leading: 'Frühindikatoren',
    gdp_nominal: 'Nominales BIP',
    gdp_growth: 'BIP-Wachstum',
    trade: 'Welthandel',
    industry: 'Industrie',
    pmi: 'Einkaufsmanagerindizes',
    labor: 'Arbeitsmarkt',
    inflation: 'Inflation',
    consumption: 'Konsum',
    realestate: 'Immobilien',
    rates: 'Leitzinsen',
    cb_balance: 'Notenbankbilanzen',
    yields: 'Staatsanleiherenditen',
    spreads: 'Zinskurven',
    credit: 'Kreditrisiko',
    indices: 'Aktienindizes',
    commodities: 'Rohstoffe',
    sectors: 'Sektoren',
    valuation: 'Bewertung',
    volatility: 'Volatilität',
    fx: 'Devisen',
};

const CATEGORY_SECTIONS = {
    macro: new Set(['leading', 'gdp_nominal', 'gdp_growth', 'trade', 'industry', 'pmi', 'labor', 'inflation', 'consumption', 'realestate']),
    monetary: new Set(['rates', 'cb_balance', 'yields', 'spreads', 'credit']),
    markets: new Set(['indices', 'commodities', 'sectors', 'valuation', 'volatility', 'fx']),
};

const FREQUENCIES = {
    daily: 'täglich',
    weekly: 'wöchentlich',
    monthly: 'monatlich',
    quarterly: 'quartalsweise',
    annual: 'jährlich',
};

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
});

const MONTH_FORMAT = new Intl.DateTimeFormat('de-DE', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
});

const INTEGER_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

const DISPLAY_NAME_REPLACEMENTS = [
    [/G20 Composite Leading Indicator/gi, 'G20-Frühindikator (CLI)'],
    [/nominal GDP \(annual rate\)/gi, 'nominales BIP (Jahresrate)'],
    [/real GDP \(YoY\)/gi, 'reales BIP (Jahresvergleich)'],
    [/consumer-price inflation \(YoY\)/gi, 'Verbraucherpreisinflation (Jahresvergleich)'],
    [/Core CPI \(YoY\)/gi, 'Kerninflation (Jahresvergleich)'],
    [/CPI \(YoY\)/gi, 'Inflation (Jahresvergleich)'],
    [/PCE deflator \(YoY\)/gi, 'PCE-Deflator (Jahresvergleich)'],
    [/PPI \(YoY\)/gi, 'Erzeugerpreise (Jahresvergleich)'],
    [/inflation \(YoY\)/gi, 'Inflation (Jahresvergleich)'],
    [/industrial production \(YoY\)/gi, 'Industrieproduktion (Jahresvergleich)'],
    [/durable manufacturing production \(MoM\)/gi, 'Produktion langlebiger Güter (Monatsvergleich)'],
    [/capacity utilization/gi, 'Kapazitätsauslastung'],
    [/Manufacturing PMI/gi, 'Einkaufsmanagerindex Industrie'],
    [/Non-manufacturing PMI/gi, 'Einkaufsmanagerindex Nicht-Industrie'],
    [/Services PMI/gi, 'Einkaufsmanagerindex Dienstleistungen'],
    [/Composite PMI/gi, 'Einkaufsmanagerindex Gesamtwirtschaft'],
    [/urban unemployment rate/gi, 'städtische Arbeitslosenquote'],
    [/unemployment rate/gi, 'Arbeitslosenquote'],
    [/average hourly earnings \(YoY\)/gi, 'durchschnittliche Stundenlöhne (Jahresvergleich)'],
    [/labor-force participation rate/gi, 'Erwerbsquote'],
    [/nonfarm payroll change/gi, 'Beschäftigungsänderung außerhalb der Landwirtschaft'],
    [/consumer confidence/gi, 'Verbrauchervertrauen'],
    [/consumer sentiment/gi, 'Verbraucherstimmung'],
    [/retail sales \(YoY\)/gi, 'Einzelhandelsumsatz (Jahresvergleich)'],
    [/new-home prices \(YoY\)/gi, 'Neubaupreise (Jahresvergleich)'],
    [/building permits/gi, 'Baugenehmigungen'],
    [/housing starts/gi, 'Baubeginne'],
    [/10-year government bond yield/gi, '10-jährige Staatsanleiherendite'],
    [/government bond yield/gi, 'Staatsanleiherendite'],
    [/Brent crude oil/gi, 'Brent-Rohöl'],
    [/World trade volume/gi, 'Welthandelsvolumen'],
    [/World industrial production/gi, 'Weltweite Industrieproduktion'],
    [/Global energy commodity inflation/gi, 'Globale Energiepreisinflation'],
    [/Global food commodity inflation/gi, 'Globale Nahrungsmittelpreisinflation'],
    [/Euro area/gi, 'Eurozone'],
    [/University of Michigan/gi, 'Universität Michigan'],
    [/^US\b/gi, 'USA'],
    [/^UK\b/gi, 'Großbritannien'],
];

export function categoryForSection(section) {
    return Object.entries(CATEGORY_SECTIONS).find(([, sections]) => sections.has(section))?.[0] ?? 'macro';
}

export function displayMetricName(metric) {
    if (EXTENSION_NAMES[metric?.id]) return EXTENSION_NAMES[metric.id];
    let name = String(metric?.name ?? metric ?? '');
    DISPLAY_NAME_REPLACEMENTS.forEach(([pattern, replacement]) => {
        name = name.replace(pattern, replacement);
    });
    return name;
}

export function sectionLabel(section) {
    return SECTION_LABELS[section] ?? section;
}

export function formatFrequency(frequency) {
    return FREQUENCIES[frequency] ?? frequency;
}

export function formatCount(value) {
    return INTEGER_FORMAT.format(Number(value) || 0);
}

export function formatDate(value) {
    if (!value) return '–';
    return DATE_FORMAT.format(new Date(`${value}T00:00:00Z`));
}

export function formatMonth(value) {
    if (!value) return '';
    return MONTH_FORMAT.format(new Date(`${value}T00:00:00Z`));
}

export function formatUnit(unit = '') {
    return String(unit)
        .replace(/^pp$/i, 'Prozentpunkte')
        .replace(/^persons$/i, 'Personen')
        .replace(/^rate$/i, '')
        .replace(/^balance$/i, 'Punkte')
        .replace(/thousand persons/gi, 'Tsd. Personen')
        .replace(/thousand units/gi, 'Tsd. Einheiten')
        .replace(/\btn\b/gi, 'Bio.')
        .replace(/\btrillions?\b/gi, 'Bio.')
        .replace(/\bBillion(?:en)?\b/g, 'Bio.')
        .replace(/\bbn\b/gi, 'Mrd.')
        .replace(/\bbillions?\b/g, 'Mrd.')
        .replace(/\bMilliard(?:e|en)\b/g, 'Mrd.')
        .replace(/\bmn\b/gi, 'Mio.')
        .replace(/\bmillions?\b/g, 'Mio.')
        .replace(/\bMillion(?:en)?\b/g, 'Mio.')
        .replace(/\s+/g, ' ')
        .trim();
}

export function formatValue(value, unit = '') {
    if (value === null || value === undefined || value === '') return '–';
    const number = Number(value);
    if (!Number.isFinite(number)) return '–';

    const absolute = Math.abs(number);
    let maximumFractionDigits = 2;
    if (absolute >= 1000) maximumFractionDigits = 0;
    else if (absolute >= 100) maximumFractionDigits = 1;
    else if (absolute < 1) maximumFractionDigits = 3;

    const formatted = new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    }).format(number);
    const displayedUnit = formatUnit(unit);

    if (!displayedUnit || displayedUnit === 'index') return formatted;
    if (displayedUnit === '%') return `${formatted} %`;
    if (displayedUnit === 'bp') return `${formatted} bp`;
    if (displayedUnit === 'x') return `${formatted}×`;
    return `${formatted} ${displayedUnit}`;
}

export function visibleMetricUnit(metric, unit = metric?.unit || '') {
    if (metric?.section !== 'gdp_nominal') return String(unit || '');
    return String(unit || '')
        .replace(/\s+p\.a\.(?=\s|$)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function fractionDigitsForValue(value) {
    const absolute = Math.abs(Number(value));
    if (absolute >= 1000) return 0;
    if (absolute >= 100) return 1;
    if (absolute < 1) return 3;
    return 2;
}

function roundedDirection(value, fractionDigits) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'neutral';
    if (Number(Math.abs(number).toFixed(fractionDigits)) === 0) return 'unchanged';
    return number > 0 ? 'positive' : 'negative';
}

function directionArrow(direction) {
    if (direction === 'positive') return '↑';
    if (direction === 'negative') return '↓';
    return '→';
}

function movementLabel(direction) {
    if (direction === 'positive') return 'gestiegen';
    if (direction === 'negative') return 'gefallen';
    return 'gerundet unverändert';
}

export function formatPreviousChange(points) {
    const usable = (Array.isArray(points) ? points : [])
        .filter((point) => point?.value !== null && point?.value !== '' && Number.isFinite(Number(point.value)));
    if (usable.length < 2) {
        return { text: '–', direction: 'neutral', label: 'Kein vorheriger Vergleichswert' };
    }

    const previous = Number(usable.at(-2).value);
    const current = Number(usable.at(-1).value);
    const delta = current - previous;
    if (previous === 0) {
        if (delta === 0) {
            return { text: '→ 0,00 %', direction: 'unchanged', label: 'Gegenüber dem vorherigen Wert unverändert' };
        }
        return { text: '–', direction: 'neutral', label: 'Veränderung wegen vorherigem Nullwert nicht berechenbar' };
    }

    const percent = (delta / Math.abs(previous)) * 100;
    const direction = roundedDirection(percent, 2);
    const arrow = directionArrow(direction);
    const formatted = Math.abs(percent).toFixed(2).replace('.', ',');
    const label = direction === 'positive'
        ? `Gegenüber dem vorherigen Wert um ${formatted} Prozent gestiegen`
        : direction === 'negative'
            ? `Gegenüber dem vorherigen Wert um ${formatted} Prozent gefallen`
            : 'Gegenüber dem vorherigen Wert gerundet unverändert';
    return { text: `${arrow} ${formatted} %`, direction, label };
}

export function formatCardChange(points, unit = '', mode = 'relative') {
    const usable = (Array.isArray(points) ? points : [])
        .filter((point) => point?.value !== null && point?.value !== '' && Number.isFinite(Number(point.value)));
    if (usable.length < 2) {
        return { text: '–', direction: 'neutral', label: 'Für diesen Vergleich sind nicht genug Werte vorhanden' };
    }

    const first = Number(usable[0].value);
    const last = Number(usable.at(-1).value);
    const delta = last - first;
    const from = formatDate(usable[0].date);
    const to = formatDate(usable.at(-1).date);

    if (mode === 'absolute') {
        const absolute = Math.abs(delta);
        let value;
        let fractionDigits;
        if (unit === '%') {
            fractionDigits = 2;
            value = `${absolute.toFixed(fractionDigits).replace('.', ',')} Pp.`;
        } else if (unit === 'bp') {
            fractionDigits = 1;
            value = `${absolute.toFixed(fractionDigits).replace('.', ',')} bp`;
        } else {
            fractionDigits = fractionDigitsForValue(delta);
            value = formatValue(absolute, unit);
        }
        const direction = roundedDirection(delta, fractionDigits);
        return {
            text: `${directionArrow(direction)} ${value}`,
            direction,
            label: direction === 'unchanged'
                ? `Absolute Änderung vom ${from} bis ${to}: gerundet unverändert (${value})`
                : `Absolute Änderung vom ${from} bis ${to}: ${movementLabel(direction)} um ${value}`,
        };
    }

    if (first === 0) {
        if (delta === 0) {
            return {
                text: '→ 0,00 %',
                direction: 'unchanged',
                label: `Relative Änderung vom ${from} bis ${to}: unverändert`,
            };
        }
        return {
            text: '–',
            direction: 'neutral',
            label: `Relative Änderung vom ${from} bis ${to} wegen eines Vergleichswerts von null nicht berechenbar`,
        };
    }

    const signedPercent = (delta / Math.abs(first)) * 100;
    const percent = Math.abs(signedPercent);
    const fractionDigits = percent >= 100 ? 0 : percent >= 10 ? 1 : 2;
    const direction = roundedDirection(signedPercent, fractionDigits);
    const value = `${new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(percent)} %`;
    return {
        text: `${directionArrow(direction)} ${value}`,
        direction,
        label: direction === 'unchanged'
            ? `Relative Änderung vom ${from} bis ${to}: gerundet unverändert (${value})`
            : `Relative Änderung vom ${from} bis ${to}: ${movementLabel(direction)} um ${value}`,
    };
}

export function formatChange(points, unit = '') {
    const usable = (Array.isArray(points) ? points : [])
        .filter((point) => point?.value !== null && point?.value !== '' && Number.isFinite(Number(point.value)));
    if (usable.length < 2) {
        return { text: 'Noch kein Vergleich', direction: 'neutral' };
    }

    const first = Number(usable[0].value);
    const last = Number(usable.at(-1).value);
    const delta = last - first;

    if (unit === '%') {
        const direction = roundedDirection(delta, 2);
        return { text: `${directionArrow(direction)} ${Math.abs(delta).toFixed(2).replace('.', ',')} %-Pkt.`, direction };
    }
    if (unit === 'bp') {
        const direction = roundedDirection(delta, 1);
        return { text: `${directionArrow(direction)} ${Math.abs(delta).toFixed(1).replace('.', ',')} bp`, direction };
    }
    if (first === 0) {
        const direction = roundedDirection(delta, fractionDigitsForValue(delta));
        return { text: `${directionArrow(direction)} ${formatValue(Math.abs(delta), unit)}`, direction };
    }

    const percent = (delta / Math.abs(first)) * 100;
    const direction = roundedDirection(percent, 2);
    return {
        text: `${directionArrow(direction)} ${Math.abs(percent).toFixed(2).replace('.', ',')} %`,
        direction,
    };
}

export function rangeStart(metric, rangeKey) {
    if (!metric || rangeKey === 'max') return metric?.coverageStart ?? '';

    const years = Number.parseInt(rangeKey, 10);
    const end = new Date(`${metric.coverageEnd}T00:00:00Z`);
    end.setUTCFullYear(end.getUTCFullYear() - years);
    const candidate = end.toISOString().slice(0, 10);
    return candidate < metric.coverageStart ? metric.coverageStart : candidate;
}

const V11_METHODOLOGY = {
    silver: 'Fortlaufender Silber-Future über Yahoo, Schlusskurs in USD je Feinunze. Nur ursprüngliche Handelstage; Kontraktwechsel bleiben Bestandteil der Quellenhistorie.',
    wti: 'Fortlaufender WTI-Future über Yahoo, Schlusskurs in USD je Barrel. Veröffentlichte Nullwerte und negative Preise bleiben erhalten. Die Reihe bildet Futurespreise ab, keine Spotpreise oder Gesamtrendite.',
    us_real_5y: 'Federal Reserve H.15 über FRED: Rendite inflationsindexierter US-Staatsanleihen mit konstanter Laufzeit von fünf Jahren. Ursprüngliche Geschäftstage, keine Interpolation.',
    us_real_10y: 'Federal Reserve H.15 über FRED: Rendite inflationsindexierter US-Staatsanleihen mit konstanter Laufzeit von zehn Jahren. Ursprüngliche Geschäftstage, keine Interpolation.',
    us_initial_claims: 'US Employment and Training Administration über FRED: saisonbereinigte Erstanträge auf Arbeitslosenhilfe für die am Samstag endende Woche. Das Beobachtungsdatum bezeichnet die Bezugswoche, nicht den Veröffentlichungstag.',
    us_continued_claims: 'US Employment and Training Administration über FRED: saisonbereinigte Folgeanträge auf versicherte Arbeitslosenhilfe für die am Samstag endende Woche. Revisionen werden übernommen.',
    us_core_pce_index: 'BEA über FRED: saisonbereinigter Preisindex der persönlichen Konsumausgaben ohne Nahrungsmittel und Energie, 2017 = 100. Monatliche Indexstände der Quelle, keine Inflationsrate.',
    us_nfci: 'Chicago Fed über FRED: wöchentlicher NFCI für die am Freitag endende Woche. Positive Werte bedeuten restriktivere Finanzbedingungen als im Durchschnitt. Die revidierte Historie wird monatlich abgeglichen.',
    us_stlfsi: 'Federal Reserve Bank of St. Louis über FRED: wöchentlicher STLFSI, Version 4, für die am Freitag endende Woche. Werte über null bedeuten überdurchschnittlichen Finanzstress. Quelle: St. Louis Fed.',
    ecb_deposit_rate: 'Offizieller Zinssatz der EZB-Einlagefazilität aus dem ECB Data Portal, in Prozent pro Jahr. Ursprünglich veröffentlichte Tageswerte einschließlich veröffentlichter Wochenendwerte; negative Zinssätze bleiben erhalten.',
    gold_silver_ratio: 'Gold-Future / Silber-Future an identischen Beobachtungstagen, beide in USD je Feinunze. Nur positive Preise und Nenner; Unterschiede durch Kontraktwechsel bleiben erhalten.',
    brent_wti_diff: 'Brent-Future minus WTI-Future am selben Beobachtungstag, in USD je Barrel. Beide sind fortlaufende Futuresreihen mit möglichen unterschiedlichen Liefermonaten. Negative Differenzen bleiben erhalten.',
    us_breakeven_5y: 'Nominale US-Staatsanleiherendite 5J minus inflationsindexierte US-Staatsanleiherendite 5J am selben Tag, in Prozentpunkten. Eigene Näherung einschließlich Liquiditäts- und Inflationsrisikoprämien, keine reine Inflationsprognose.',
    us_breakeven_10y: 'Nominale US-Staatsanleiherendite 10J minus inflationsindexierte US-Staatsanleiherendite 10J am selben Tag, in Prozentpunkten. Eigene Näherung einschließlich Liquiditäts- und Inflationsrisikoprämien, keine reine Inflationsprognose.',
    us_de_10y_gap: '(US-Rendite 10J minus deutsche Rendite 10J) × 100 an übereinstimmenden Beobachtungstagen, in Basispunkten. Unterschiedliche Währungen und Börsenschlusszeiten; keine währungsgesicherte Rendite.',
    us_core_headline_gap: 'Gespeicherte US-Kern-CPI-Jahresrate minus Gesamt-CPI-Jahresrate für denselben Kalendermonat, in Prozentpunkten. Die Saisonbereinigung der jeweiligen Quelle bleibt erhalten.',
    us_claims_4w: 'Arithmetisches Mittel von vier aufeinanderfolgenden wöchentlichen Erstantragswerten mit jeweils genau sieben Tagen Abstand. Das Datum bezeichnet die letzte Bezugswoche. Fehlende Wochen werden nicht interpoliert.',
    us_core_pce_yoy: '(Kern-PCE-Index / Index desselben Vorjahresmonats minus 1) × 100. Grundlage ist der gespeicherte saisonbereinigte BEA-Index. Revisionen der Indexhistorie berechnen die betroffenen Jahresraten neu.',
};

export function displayMethodology(metric) {
    return V11_METHODOLOGY[metric.id] ?? metric.methodology ?? '';
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
