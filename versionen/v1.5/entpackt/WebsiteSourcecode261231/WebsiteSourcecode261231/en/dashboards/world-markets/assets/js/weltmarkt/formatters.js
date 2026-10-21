export const CATEGORY_LABELS = {
    macro: 'Economy',
    monetary: 'Rates & monetary policy',
    markets: 'Markets',
};

export const SECTION_LABELS = {
    leading: 'Leading indicators',
    gdp_nominal: 'Nominal GDP',
    gdp_growth: 'GDP growth',
    trade: 'World trade',
    industry: 'Industry',
    pmi: 'Purchasing managers\' indexes',
    labor: 'Labour market',
    inflation: 'Inflation',
    consumption: 'Konsum',
    realestate: 'Real estate',
    rates: 'Policy rates',
    cb_balance: 'Central-bank balance sheets',
    yields: 'Government bond yields',
    spreads: 'Yield curves',
    credit: 'Credit risk',
    indices: 'Equity indexes',
    commodities: 'Commodities',
    sectors: 'Sectors',
    valuation: 'Valuation',
    volatility: 'Volatility',
    fx: 'Foreign exchange',
};

const CATEGORY_SECTIONS = {
    macro: new Set(['leading', 'gdp_nominal', 'gdp_growth', 'trade', 'industry', 'pmi', 'labor', 'inflation', 'consumption', 'realestate']),
    monetary: new Set(['rates', 'cb_balance', 'yields', 'spreads', 'credit']),
    markets: new Set(['indices', 'commodities', 'sectors', 'valuation', 'volatility', 'fx']),
};

const FREQUENCIES = {
    daily: 'daily',
    weekly: 'weekly',
    monthly: 'monthly',
    quarterly: 'quarterly',
    annual: 'annual',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
});

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
});

const INTEGER_FORMAT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

const DISPLAY_NAME_REPLACEMENTS = [
    [/G20 Composite Leading Indicator/gi, 'G20 composite leading indicator (CLI)'],
    [/nominal GDP \(annual rate\)/gi, 'nominal GDP (annual rate)'],
    [/real GDP \(YoY\)/gi, 'real GDP (year on year)'],
    [/consumer-price inflation \(YoY\)/gi, 'consumer-price inflation (year on year)'],
    [/Core CPI \(YoY\)/gi, 'core CPI (year on year)'],
    [/CPI \(YoY\)/gi, 'CPI (year on year)'],
    [/PCE deflator \(YoY\)/gi, 'PCE deflator (year on year)'],
    [/PPI \(YoY\)/gi, 'PPI (year on year)'],
    [/inflation \(YoY\)/gi, 'inflation (year on year)'],
    [/industrial production \(YoY\)/gi, 'industrial production (year on year)'],
    [/durable manufacturing production \(MoM\)/gi, 'durable manufacturing production (month on month)'],
    [/capacity utilization/gi, 'capacity utilisation'],
    [/Manufacturing PMI/gi, 'manufacturing PMI'],
    [/Non-manufacturing PMI/gi, 'non-manufacturing PMI'],
    [/Services PMI/gi, 'services PMI'],
    [/Composite PMI/gi, 'composite PMI'],
    [/urban unemployment rate/gi, 'urban unemployment rate'],
    [/unemployment rate/gi, 'unemployment rate'],
    [/average hourly earnings \(YoY\)/gi, 'average hourly earnings (year on year)'],
    [/labor-force participation rate/gi, 'labour-force participation rate'],
    [/nonfarm payroll change/gi, 'non-farm payroll change'],
    [/consumer confidence/gi, 'consumer confidence'],
    [/consumer sentiment/gi, 'consumer sentiment'],
    [/retail sales \(YoY\)/gi, 'retail sales (year on year)'],
    [/new-home prices \(YoY\)/gi, 'new-home prices (year on year)'],
    [/building permits/gi, 'building permits'],
    [/housing starts/gi, 'housing starts'],
    [/10-year government bond yield/gi, '10-year government bond yield'],
    [/government bond yield/gi, 'government bond yield'],
    [/Brent crude oil/gi, 'Brent crude oil'],
    [/World trade volume/gi, 'world trade volume'],
    [/World industrial production/gi, 'world industrial production'],
    [/Global energy commodity inflation/gi, 'global energy commodity inflation'],
    [/Global food commodity inflation/gi, 'global food commodity inflation'],
    [/Euro area/gi, 'euro area'],
    [/University of Michigan/gi, 'University of Michigan'],
    [/^US\b/gi, 'US'],
    [/^UK\b/gi, 'UK'],
];

export function categoryForSection(section) {
    return Object.entries(CATEGORY_SECTIONS).find(([, sections]) => sections.has(section))?.[0] ?? 'macro';
}

export function displayMetricName(metric) {
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
        .replace(/^rate$/i, '')
        .replace(/^balance$/i, 'points')
        .replace(/thousand persons/gi, 'thousand people')
        .replace(/thousand units/gi, 'thousand units')
        .replace(/\btn\b/gi, 'tn')
        .replace(/\btrillions?\b/gi, 'tn')
        .replace(/\bBillion(?:en)?\b/g, 'tn')
        .replace(/\bbn\b/gi, 'bn')
        .replace(/\bbillions?\b/g, 'bn')
        .replace(/\bMilliard(?:e|en)\b/g, 'bn')
        .replace(/\bmn\b/gi, 'm')
        .replace(/\bmillions?\b/g, 'm')
        .replace(/\bMillion(?:en)?\b/g, 'm')
        .replace(/\s+/g, ' ')
        .trim();
}

export function formatValue(value, unit = '') {
    const number = Number(value);
    if (!Number.isFinite(number)) return '–';

    const absolute = Math.abs(number);
    let maximumFractionDigits = 2;
    if (absolute >= 1000) maximumFractionDigits = 0;
    else if (absolute >= 100) maximumFractionDigits = 1;
    else if (absolute < 1) maximumFractionDigits = 3;

    const formatted = new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    }).format(number);
    const displayedUnit = formatUnit(unit);

    if (!displayedUnit || displayedUnit === 'index') return formatted;
    if (displayedUnit === '%') return `${formatted}%`;
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
    if (direction === 'positive') return 'increased';
    if (direction === 'negative') return 'decreased';
    return 'unchanged after rounding';
}

export function formatPreviousChange(points) {
    const usable = (Array.isArray(points) ? points : [])
        .filter((point) => point?.value !== null && point?.value !== '' && Number.isFinite(Number(point.value)));
    if (usable.length < 2) {
        return { text: '–', direction: 'neutral', label: 'No previous comparison value' };
    }

    const previous = Number(usable.at(-2).value);
    const current = Number(usable.at(-1).value);
    const delta = current - previous;
    if (previous === 0) {
        if (delta === 0) {
            return { text: '→ 0.00%', direction: 'unchanged', label: 'Unchanged from the previous value' };
        }
        return { text: '–', direction: 'neutral', label: 'Change cannot be calculated because the previous value is zero' };
    }

    const percent = (delta / Math.abs(previous)) * 100;
    const direction = roundedDirection(percent, 2);
    const arrow = directionArrow(direction);
    const formatted = Math.abs(percent).toFixed(2);
    const label = direction === 'positive'
        ? `${formatted}% higher than the previous value`
        : direction === 'negative'
            ? `${formatted}% lower than the previous value`
            : 'Unchanged from the previous value after rounding';
    return { text: `${arrow} ${formatted}%`, direction, label };
}

export function formatCardChange(points, unit = '', mode = 'relative') {
    const usable = (Array.isArray(points) ? points : [])
        .filter((point) => point?.value !== null && point?.value !== '' && Number.isFinite(Number(point.value)));
    if (usable.length < 2) {
        return { text: '–', direction: 'neutral', label: 'Not enough values are available for this comparison' };
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
            value = `${absolute.toFixed(fractionDigits)} pp`;
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
                ? `Absolute change from ${from} to ${to}: unchanged after rounding (${value})`
                : `Absolute change from ${from} to ${to}: ${movementLabel(direction)} by ${value}`,
        };
    }

    if (first === 0) {
        if (delta === 0) {
            return {
                text: '→ 0.00%',
                direction: 'unchanged',
                label: `Relative change from ${from} to ${to}: unchanged`,
            };
        }
        return {
            text: '–',
            direction: 'neutral',
            label: `Relative change from ${from} to ${to} cannot be calculated because the comparison value is zero`,
        };
    }

    const signedPercent = (delta / Math.abs(first)) * 100;
    const percent = Math.abs(signedPercent);
    const fractionDigits = percent >= 100 ? 0 : percent >= 10 ? 1 : 2;
    const direction = roundedDirection(signedPercent, fractionDigits);
    const value = `${new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(percent)}%`;
    return {
        text: `${directionArrow(direction)} ${value}`,
        direction,
        label: direction === 'unchanged'
            ? `Relative change from ${from} to ${to}: unchanged after rounding (${value})`
            : `Relative change from ${from} to ${to}: ${movementLabel(direction)} by ${value}`,
    };
}

export function formatChange(points, unit = '') {
    const usable = (Array.isArray(points) ? points : [])
        .filter((point) => point?.value !== null && point?.value !== '' && Number.isFinite(Number(point.value)));
    if (usable.length < 2) {
        return { text: 'No comparison yet', direction: 'neutral' };
    }

    const first = Number(usable[0].value);
    const last = Number(usable.at(-1).value);
    const delta = last - first;

    if (unit === '%') {
        const direction = roundedDirection(delta, 2);
        return { text: `${directionArrow(direction)} ${Math.abs(delta).toFixed(2)} pp`, direction };
    }
    if (unit === 'bp') {
        const direction = roundedDirection(delta, 1);
        return { text: `${directionArrow(direction)} ${Math.abs(delta).toFixed(1)} bp`, direction };
    }
    if (first === 0) {
        const direction = roundedDirection(delta, fractionDigitsForValue(delta));
        return { text: `${directionArrow(direction)} ${formatValue(Math.abs(delta), unit)}`, direction };
    }

    const percent = (delta / Math.abs(first)) * 100;
    const direction = roundedDirection(percent, 2);
    return {
        text: `${directionArrow(direction)} ${Math.abs(percent).toFixed(2)}%`,
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

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
