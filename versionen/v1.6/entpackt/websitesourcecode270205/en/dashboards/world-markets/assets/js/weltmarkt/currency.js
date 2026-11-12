export const CURRENCY_OPTIONS = ['original', 'USD', 'EUR', 'GBP', 'JPY', 'CNY'];

export const FX_SERIES = Object.freeze({
    EUR: { metricId: 'eurusd', direction: 'usd-per-currency' },
    GBP: { metricId: 'gbpusd', direction: 'usd-per-currency' },
    JPY: { metricId: 'usdjpy', direction: 'currency-per-usd' },
    CNY: { metricId: 'usdcny', direction: 'currency-per-usd' },
});

const normalizedSeriesCache = new WeakMap();

function normalizedTarget(target) {
    return CURRENCY_OPTIONS.includes(target) ? target : 'original';
}

function finiteValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function monetaryCurrency(metric) {
    if (metric?.section === 'fx') return null;
    const currency = String(metric?.currency || '').toUpperCase();
    if (!FX_SERIES[currency] && currency !== 'USD') return null;
    const unit = String(metric?.unit || '');
    const escaped = currency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s|/)${escaped}(?=$|\\s|/)`).test(unit) ? currency : null;
}

export function convertedUnit(metric, target) {
    const source = monetaryCurrency(metric);
    const output = normalizedTarget(target);
    if (!source || output === 'original') return String(metric?.unit || '');
    return String(metric.unit).replace(source, output);
}

function sortedFinitePoints(points) {
    return (Array.isArray(points) ? points : [])
        .filter((point) => point?.date && finiteValue(point.value) !== null)
        .map((point) => ({ date: point.date, value: Number(point.value) }))
        .sort((left, right) => left.date.localeCompare(right.date));
}

function valueOnOrBefore(points, date) {
    let low = 0;
    let high = points.length - 1;
    let found = null;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (points[middle].date <= date) {
            found = points[middle].value;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return found;
}

function usdPerCurrency(currency, date, series) {
    if (currency === 'USD') return 1;
    const definition = FX_SERIES[currency];
    const quote = valueOnOrBefore(series[currency] || [], date);
    if (!definition || quote === null || quote <= 0) return null;
    return definition.direction === 'usd-per-currency' ? quote : 1 / quote;
}

function crossRate(source, target, date, series) {
    if (source === target) return 1;
    const sourceInUsd = usdPerCurrency(source, date, series);
    const targetInUsd = usdPerCurrency(target, date, series);
    if (sourceInUsd === null || targetInUsd === null) return null;
    return sourceInUsd / targetInUsd;
}

function periodEnd(date, frequency) {
    const value = new Date(`${date}T00:00:00Z`);
    if (frequency === 'monthly') value.setUTCMonth(value.getUTCMonth() + 1);
    else if (frequency === 'quarterly') value.setUTCMonth(value.getUTCMonth() + 3);
    else if (frequency === 'annual') value.setUTCFullYear(value.getUTCFullYear() + 1);
    else return date;
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
}

function averageCrossRate(source, target, start, end, series) {
    const dates = new Set();
    for (const currency of [source, target]) {
        if (currency === 'USD') continue;
        for (const point of series[currency] || []) {
            if (point.date >= start && point.date <= end) dates.add(point.date);
        }
    }
    const rates = [...dates]
        .sort()
        .map((date) => crossRate(source, target, date, series))
        .filter((rate) => Number.isFinite(rate));
    if (!rates.length) return crossRate(source, target, end, series);
    return rates.reduce((total, rate) => total + rate, 0) / rates.length;
}

function normalizedFxSeries(fxSeries) {
    if (fxSeries && typeof fxSeries === 'object' && normalizedSeriesCache.has(fxSeries)) {
        return normalizedSeriesCache.get(fxSeries);
    }
    const normalized = Object.fromEntries(Object.keys(FX_SERIES).map((currency) => [
        currency,
        sortedFinitePoints(fxSeries?.[currency]),
    ]));
    if (fxSeries && typeof fxSeries === 'object') normalizedSeriesCache.set(fxSeries, normalized);
    return normalized;
}

export function convertMetricPoints(metric, points, target, fxSeries = {}) {
    const output = normalizedTarget(target);
    const source = monetaryCurrency(metric);
    const unit = convertedUnit(metric, output);
    const originalPoints = Array.isArray(points) ? points : [];

    if (output === 'original' || !source || source === output) {
        return {
            points: originalPoints.map((point) => ({ ...point })),
            unit,
            sourceCurrency: source,
            targetCurrency: output === 'original' ? source : output,
            applied: output !== 'original' && Boolean(source),
            converted: false,
            missingCount: 0,
        };
    }

    const series = normalizedFxSeries(fxSeries);
    let missingCount = 0;
    const converted = originalPoints.map((point) => {
        const value = finiteValue(point.value);
        const end = periodEnd(point.date, metric.frequency);
        const rate = metric.section === 'gdp_nominal'
            ? averageCrossRate(source, output, point.date, end, series)
            : crossRate(source, output, end, series);
        if (value === null || !Number.isFinite(rate)) {
            missingCount += 1;
            return { ...point, value: null, conversionRate: null };
        }
        return {
            ...point,
            value: value * rate,
            conversionRate: rate,
        };
    });

    return {
        points: converted,
        unit,
        sourceCurrency: source,
        targetCurrency: output,
        applied: true,
        converted: true,
        missingCount,
    };
}

export function conversionDescription(metric, target) {
    const output = normalizedTarget(target);
    const source = monetaryCurrency(metric);
    if (output === 'original') return 'Original unit of the stored source';
    if (!source) return `This metric remains in its original unit; convertible monetary values are shown in ${output}`;
    if (source === output) return `Original value already in ${output}`;
    if (metric.section === 'gdp_nominal') {
        return `Converted to ${output} using the average stored daily exchange rate for the relevant quarter`;
    }
    return `Converted to ${output} using the last stored exchange rate on or before the period end`;
}

export function conversionSeriesIds(metric, target) {
    const output = normalizedTarget(target);
    const source = monetaryCurrency(metric);
    if (!source || output === 'original' || source === output) return [];
    return [...new Set([source, output]
        .filter((currency) => currency !== 'USD')
        .map((currency) => FX_SERIES[currency].metricId))];
}
