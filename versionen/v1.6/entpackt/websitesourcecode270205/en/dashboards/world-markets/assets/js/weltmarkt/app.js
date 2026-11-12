import { WeltmarktApi } from './api.js?v=20260916-1';
import { WeltmarktChart } from './charts.js?v=20260912-3';
import {
    CURRENCY_OPTIONS,
    FX_SERIES,
    conversionDescription,
    conversionSeriesIds,
    convertMetricPoints,
} from './currency.js?v=20260916-4';
import {
    categoryForSection,
    displayMetricName,
    escapeHtml,
    formatCardChange,
    formatChange,
    formatCount,
    formatDate,
    formatFrequency,
    formatPreviousChange,
    formatValue,
    rangeStart,
    sectionLabel,
    visibleMetricUnit,
} from './formatters.js?v=20260916-6';
import { buildSeriesCsv, buildSnapshotCsv, downloadCsv } from './csv.js?v=20260912-3';

const TOP_METRICS = Object.freeze([
    ['world_gdp_yoy', 'G20 GDP growth'],
    ['ez_cpi', 'Euro-area inflation'],
    ['us_10y', 'US 10-year yield'],
    ['sp500', 'S&P 500'],
    ['dax40', 'DAX 40'],
    ['gold', 'Gold'],
    ['brent', 'Brent crude oil'],
    ['eurusd', 'EUR/USD'],
]);

const state = {
    metrics: [],
    manifest: {},
    selected: null,
    rawPoints: [],
    points: [],
    displayMetric: null,
    category: 'macro',
    range: '3y',
    cardChangeMode: 'relative',
    cardChangePeriod: 'previous',
    currency: 'original',
    fxSeries: null,
    fxLoading: null,
    search: '',
    chart: null,
    seriesRequest: null,
};

const dom = {};

document.addEventListener('DOMContentLoaded', () => {
    bindDom();
    bindEvents();
    boot();
});

function bindDom() {
    const ids = [
        'data-status', 'metric-count', 'observation-count', 'retrieved-at', 'chart-title', 'chart-section',
        'top-metrics', 'chart-latest', 'chart-latest-change', 'chart-latest-date', 'chart-change', 'chart-state', 'chart-canvas', 'chart-coverage',
        'chart-frequency', 'chart-points', 'chart-source', 'methodology-summary', 'methodology-text', 'source-name', 'source-series',
        'source-license', 'metric-groups', 'metric-search', 'empty-results', 'export-csv', 'export-snapshot', 'mobile-menu',
        'currency-select', 'currency-note', 'card-change-mode', 'card-change-period', 'card-change-description',
    ];
    ids.forEach((id) => { dom[id] = document.getElementById(id); });
    dom.categoryButtons = [...document.querySelectorAll('[data-category]')];
    dom.rangeButtons = [...document.querySelectorAll('[data-range]')];
}

function bindEvents() {
    dom.categoryButtons.forEach((button) => {
        button.addEventListener('click', () => {
            state.category = button.dataset.category;
            syncCategoryButtons();
            renderMetricGroups();
        });
    });

    dom.rangeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (!state.selected || state.range === button.dataset.range) return;
            state.range = button.dataset.range;
            syncRangeButtons();
            loadSeries();
        });
    });

    dom['metric-search'].addEventListener('input', (event) => {
        state.search = event.target.value.trim().toLocaleLowerCase('de-DE');
        renderMetricGroups();
    });

    dom['currency-select'].addEventListener('change', async (event) => {
        await changeCurrency(event.target.value);
    });

    dom['card-change-mode'].addEventListener('change', (event) => {
        state.cardChangeMode = event.target.value === 'absolute' ? 'absolute' : 'relative';
        renderCardChanges();
    });

    dom['card-change-period'].addEventListener('change', (event) => {
        state.cardChangePeriod = ['previous', '1y', '3y', '10y', 'max'].includes(event.target.value)
            ? event.target.value
            : 'previous';
        renderCardChanges();
    });

    dom['metric-groups'].addEventListener('click', (event) => {
        const card = event.target.closest('[data-metric-id]');
        if (!card) return;
        selectMetric(card.dataset.metricId, true);
    });
    dom['top-metrics'].addEventListener('click', (event) => {
        const card = event.target.closest('[data-metric-id]');
        if (!card) return;
        selectMetric(card.dataset.metricId, true);
    });

    dom['export-csv'].addEventListener('click', exportSeriesCsv);
    dom['export-snapshot'].addEventListener('click', exportSnapshotCsv);
    const toggle = document.querySelector('.nav-toggle');
    const menu = dom['mobile-menu'];
    toggle?.addEventListener('click', () => {
        const open = toggle.classList.toggle('open');
        menu.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
        toggle?.classList.remove('open');
        menu.classList.remove('open');
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-label', 'Open menu');
    }));
}

async function boot() {
    setChartState('loading', 'Loading stored metrics …');
    try {
        const payload = await WeltmarktApi.metrics();
        state.metrics = payload.metrics;
        state.manifest = payload.manifest;
        state.chart = new WeltmarktChart(dom['chart-canvas']);
        renderManifest();
        dom['export-snapshot'].disabled = state.metrics.length === 0;

        const urlParameters = new URL(window.location.href).searchParams;
        const requestedMetric = urlParameters.get('metric');
        const requestedRange = urlParameters.get('range');
        const requestedChangeMode = urlParameters.get('changeMode');
        const requestedChangePeriod = urlParameters.get('changePeriod');
        const currencyParameter = urlParameters.get('currency');
        const requestedCurrency = currencyParameter ? currencyParameter.toUpperCase() : 'original';
        if (['1y', '3y', '5y', '10y', 'max'].includes(requestedRange)) {
            state.range = requestedRange;
            syncRangeButtons();
        }
        state.cardChangeMode = requestedChangeMode === 'absolute' ? 'absolute' : 'relative';
        state.cardChangePeriod = ['previous', '1y', '3y', '10y', 'max'].includes(requestedChangePeriod)
            ? requestedChangePeriod
            : 'previous';
        dom['card-change-mode'].value = state.cardChangeMode;
        dom['card-change-period'].value = state.cardChangePeriod;
        dom['card-change-description'].textContent = `${state.cardChangeMode === 'absolute' ? 'Absolute' : 'Relative'} change versus ${cardChangePeriodLabel()}.`;
        state.currency = CURRENCY_OPTIONS.includes(requestedCurrency) ? requestedCurrency : 'original';
        dom['currency-select'].value = state.currency;
        dom['currency-select'].disabled = false;
        if (state.currency !== 'original') {
            try {
                await ensureFxSeries();
            } catch (error) {
                state.currency = 'original';
                dom['currency-select'].value = 'original';
                dom['currency-note'].textContent = error.message || 'Stored exchange rates could not be loaded.';
                dom['currency-note'].classList.add('is-error');
            }
        }
        const initial = state.metrics.find((metric) => metric.id === requestedMetric)
            ?? state.metrics.find((metric) => metric.id === 'world_cli')
            ?? state.metrics[0];

        if (!initial) {
            throw new Error('No stored metrics were found in the database.');
        }

        state.category = categoryForSection(initial.section);
        renderTopMetrics();
        renderMetricGroups();
        syncCategoryButtons();
        await selectMetric(initial.id, false);
    } catch (error) {
        setFatalError(error.message || 'Stored data could not be loaded.');
    }
}

function renderTopMetrics() {
    const metricsById = new Map(state.metrics.map((metric) => [metric.id, metric]));
    dom['top-metrics'].innerHTML = TOP_METRICS.map(([id, label]) => {
        const metric = metricsById.get(id);
        if (!metric) return '';
        const displayed = displayValues(metric, comparisonPoints(metric, state.cardChangePeriod));
        const latest = displayed.points.at(-1);
        const change = formatCardChange(displayed.points, displayed.unit, state.cardChangeMode);
        const active = state.selected?.id === metric.id;
        return `
            <button class="top-metric${active ? ' is-active' : ''}" type="button" data-metric-id="${escapeHtml(metric.id)}" aria-pressed="${active}">
                <span class="top-metric__name">${escapeHtml(label)}</span>
                <strong>${escapeHtml(formatValue(latest?.value, displayed.unit))}</strong>
                <span class="point-change point-change--${change.direction}" aria-label="${escapeHtml(change.label)}">${escapeHtml(change.text)}</span>
                <span class="top-metric__date">As of ${escapeHtml(formatDate(latest?.date))}</span>
            </button>
        `;
    }).join('');
}

function renderManifest() {
    dom['metric-count'].textContent = formatCount(state.manifest.metric_count);
    dom['observation-count'].textContent = formatCount(state.manifest.observation_count);
    dom['retrieved-at'].textContent = formatDate((state.manifest.retrieved_at || '').slice(0, 10));
    dom['data-status'].textContent = `${formatCount(state.manifest.metric_count)} metrics | ${formatCount(state.manifest.observation_count)} values`;
    dom['data-status'].classList.add('is-ready');
}

function renderMetricGroups() {
    const filtered = state.metrics.filter((metric) => {
        if (categoryForSection(metric.section) !== state.category) return false;
        if (!state.search) return true;
        const haystack = `${displayMetricName(metric)} ${metric.name} ${sectionLabel(metric.section)} ${metric.source.name}`.toLocaleLowerCase('en-GB');
        return haystack.includes(state.search);
    });

    const bySection = new Map();
    filtered.forEach((metric) => {
        if (!bySection.has(metric.section)) bySection.set(metric.section, []);
        bySection.get(metric.section).push(metric);
    });

    dom['empty-results'].hidden = filtered.length > 0;
    dom['metric-groups'].innerHTML = [...bySection.entries()].map(([section, metrics]) => {
        return `
        <details class="metric-group" open>
            <summary class="metric-group__heading">
                <span class="metric-group__title" id="section-${escapeHtml(section)}">${escapeHtml(sectionLabel(section))}</span>
                <span>${formatCount(metrics.length)} metrics</span>
            </summary>
            <div class="metric-grid">
                ${metrics.map(metricCard).join('')}
            </div>
        </details>
    `;
    }).join('');
}

function metricCard(metric) {
    const active = state.selected?.id === metric.id;
    const displayed = displayValues(metric, comparisonPoints(metric, state.cardChangePeriod));
    const latest = displayed.points.at(-1);
    const change = formatCardChange(displayed.points, displayed.unit, state.cardChangeMode);
    const displayedName = displayMetricName(metric);
    return `
        <button class="metric-card${active ? ' is-active' : ''}" type="button" data-metric-id="${escapeHtml(metric.id)}" aria-pressed="${active}" aria-label="Select ${escapeHtml(displayedName)}" title="Original name: ${escapeHtml(metric.name)}">
            <span class="metric-card__heading">
                <span class="metric-card__kicker">${escapeHtml(formatFrequency(metric.frequency))}</span>
                <span class="metric-card__name">${escapeHtml(displayedName)}</span>
            </span>
            <strong class="metric-card__value">${escapeHtml(formatValue(latest?.value, displayed.unit))}</strong>
            <span class="point-change point-change--${change.direction}" aria-label="${escapeHtml(change.label)}">${escapeHtml(change.text)}</span>
            <span class="metric-card__meta">
                <span>As of ${escapeHtml(formatDate(latest?.date))}</span>
            </span>
        </button>
    `;
}

function comparisonPoints(metric, period = 'previous') {
    const baseline = period === 'previous' ? metric?.previous : metric?.comparisons?.[period];
    return [baseline, metric?.latest].filter(Boolean);
}

function cardChangePeriodLabel() {
    return {
        previous: 'the immediately preceding stored value',
        '1y': 'the first stored value within the last year',
        '3y': 'the first stored value within the last three years',
        '10y': 'the first stored value within the last ten years',
        max: 'the first stored value in the full time series',
    }[state.cardChangePeriod] ?? 'the immediately preceding stored value';
}

function renderCardChanges() {
    renderTopMetrics();
    renderMetricGroups();
    dom['card-change-description'].textContent = `${state.cardChangeMode === 'absolute' ? 'Absolute' : 'Relative'} change versus ${cardChangePeriodLabel()}.`;
    updateUrl();
}

function displayValues(metric, points) {
    const displayed = convertMetricPoints(metric, points, state.currency, state.fxSeries || {});
    return { ...displayed, unit: visibleMetricUnit(metric, displayed.unit) };
}

async function ensureFxSeries() {
    if (state.fxSeries) return state.fxSeries;
    if (state.fxLoading) return state.fxLoading;
    state.fxLoading = Promise.all(Object.entries(FX_SERIES).map(async ([currency, definition]) => {
        const metric = state.metrics.find((item) => item.id === definition.metricId);
        if (!metric) throw new Error(`Exchange-rate series ${definition.metricId} is missing from the database.`);
        const payload = await WeltmarktApi.series(definition.metricId, metric.coverageStart, metric.coverageEnd);
        return [currency, payload.points];
    })).then((entries) => {
        state.fxSeries = Object.fromEntries(entries);
        return state.fxSeries;
    }).finally(() => {
        state.fxLoading = null;
    });
    return state.fxLoading;
}

async function changeCurrency(target) {
    const requested = CURRENCY_OPTIONS.includes(target) ? target : 'original';
    const previous = state.currency;
    dom['currency-select'].disabled = true;
    dom['currency-note'].textContent = requested === 'original' ? 'Original values are shown' : 'Loading stored exchange rates …';
    dom['currency-note'].classList.remove('is-error');
    try {
        if (requested !== 'original') await ensureFxSeries();
        state.currency = requested;
        renderTopMetrics();
        renderMetricGroups();
        renderSelectedSeries();
        updateStaticMetricDetails();
        updateUrl();
    } catch (error) {
        state.currency = previous;
        dom['currency-select'].value = previous;
        dom['currency-note'].textContent = error.message || 'Stored exchange rates could not be loaded.';
        dom['currency-note'].classList.add('is-error');
    } finally {
        dom['currency-select'].disabled = false;
    }
}

async function selectMetric(metricId, scrollToChart) {
    const metric = state.metrics.find((item) => item.id === metricId);
    if (!metric) return;

    state.selected = metric;
    state.category = categoryForSection(metric.section);
    renderTopMetrics();
    renderMetricGroups();
    syncCategoryButtons();
    updateStaticMetricDetails();
    updateUrl();

    if (scrollToChart) {
        document.getElementById('trend').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    await loadSeries();
}

async function loadSeries() {
    if (!state.selected) return;
    state.seriesRequest?.abort();
    state.seriesRequest = new AbortController();
    setChartState('loading', `Loading ${state.selected.name} …`);
    dom['export-csv'].disabled = true;

    try {
        const start = rangeStart(state.selected, state.range);
        const payload = await WeltmarktApi.series(
            state.selected.id,
            start,
            state.selected.coverageEnd,
            state.seriesRequest.signal
        );
        state.rawPoints = payload.points;
        renderSelectedSeries();
        setChartState('ready', '');
        updateUrl();
    } catch (error) {
        if (error?.name === 'AbortError') return;
        state.rawPoints = [];
        state.points = [];
        state.chart.clear();
        setChartState('error', error.message || 'The time series could not be loaded.');
    }
}

function renderSelectedSeries() {
    if (!state.selected || !state.chart) return;
    const displayed = displayValues(state.selected, state.rawPoints);
    state.points = displayed.points;
    state.displayMetric = { ...state.selected, name: displayMetricName(state.selected), unit: displayed.unit };
    state.chart.render(state.displayMetric, state.points);
    updateSeriesDetails();
    dom['export-csv'].disabled = !state.points.some((point) => point.value !== null && point.value !== '' && Number.isFinite(Number(point.value)));
}

function updateStaticMetricDetails() {
    const metric = state.selected;
    dom['chart-title'].textContent = displayMetricName(metric);
    dom['chart-section'].textContent = sectionLabel(metric.section);
    dom['chart-coverage'].textContent = `${formatDate(metric.coverageStart)} – ${formatDate(metric.coverageEnd)}`;
    dom['chart-frequency'].textContent = formatFrequency(metric.frequency);
    dom['chart-points'].textContent = formatCount(metric.observationCount);
    const conversion = conversionDescription(metric, state.currency);
    const fxSeriesIds = conversionSeriesIds(metric, state.currency);
    const conversionActive = fxSeriesIds.length > 0;
    dom['currency-note'].textContent = conversion;
    dom['currency-note'].classList.remove('is-error');
    dom['methodology-summary'].textContent = `The metric is shown at its stored ${formatFrequency(metric.frequency)} frequency. Missing values remain visible as gaps.`;
    dom['methodology-text'].textContent = conversionActive
        ? `${metric.methodology} ${conversion}. Cross-rates run through USD; missing rates remain gaps.`
        : metric.methodology;
    dom['source-name'].textContent = conversionActive ? `${metric.source.name} | stored exchange rates` : metric.source.name;
    dom['source-series'].textContent = [metric.sourceSeries || 'No additional series ID', ...fxSeriesIds].join(' | ');
    dom['source-license'].textContent = conversionActive
        ? `${metric.source.licenseNote} Conversion uses stored daily FX closing rates only.`
        : metric.source.licenseNote;

    const sourceUrl = metric.source.url;
    if (sourceUrl) {
        dom['chart-source'].href = sourceUrl;
        dom['chart-source'].textContent = metric.source.name;
        dom['chart-source'].removeAttribute('aria-disabled');
    } else {
        dom['chart-source'].removeAttribute('href');
        dom['chart-source'].textContent = metric.source.name;
        dom['chart-source'].setAttribute('aria-disabled', 'true');
    }
}

function updateSeriesDetails() {
    const metric = state.displayMetric || state.selected;
    const validPoints = state.points.filter((point) => point.value !== null && Number.isFinite(Number(point.value)));
    const latest = validPoints.at(-1);
    const change = formatChange(validPoints, metric.unit);
    const immediateChange = formatPreviousChange(displayValues(state.selected, comparisonPoints(state.selected)).points);
    dom['chart-latest'].textContent = formatValue(latest?.value, metric.unit);
    dom['chart-latest-change'].textContent = immediateChange.text;
    dom['chart-latest-change'].className = `point-change point-change--${immediateChange.direction}`;
    dom['chart-latest-change'].setAttribute('aria-label', immediateChange.label);
    dom['chart-latest-date'].textContent = latest ? `Latest value: ${formatDate(latest.date)}` : 'No values in this period';
    dom['chart-change'].textContent = change.text;
    dom['chart-change'].className = `chart-change chart-change--${change.direction}`;
}

function setChartState(type, message) {
    dom['chart-state'].dataset.state = type;
    dom['chart-state'].textContent = message;
    dom['chart-state'].hidden = type === 'ready';
}

function setFatalError(message) {
    dom['data-status'].textContent = 'Database unavailable';
    dom['data-status'].classList.add('is-error');
    setChartState('error', `${message} Check the World Market configuration, database access and SQL import.`);
    dom['top-metrics'].innerHTML = '';
    dom['metric-groups'].innerHTML = '';
    dom['empty-results'].hidden = false;
    dom['empty-results'].textContent = 'No metrics have been loaded yet.';
}

function syncCategoryButtons() {
    dom.categoryButtons.forEach((button) => {
        const active = button.dataset.category === state.category;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
    });
}

function syncRangeButtons() {
    dom.rangeButtons.forEach((button) => {
        const active = button.dataset.range === state.range;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

function updateUrl() {
    if (!state.selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set('metric', state.selected.id);
    url.searchParams.set('range', state.range);
    if (state.currency === 'original') url.searchParams.delete('currency');
    else url.searchParams.set('currency', state.currency);
    if (state.cardChangeMode === 'relative') url.searchParams.delete('changeMode');
    else url.searchParams.set('changeMode', state.cardChangeMode);
    if (state.cardChangePeriod === 'previous') url.searchParams.delete('changePeriod');
    else url.searchParams.set('changePeriod', state.cardChangePeriod);
    window.history.replaceState({}, '', url);
}

async function exportSeriesCsv() {
    if (!state.selected) return;
    const button = dom['export-csv'];
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Loading complete series …';
    try {
        const metric = state.selected;
        const payload = await WeltmarktApi.series(metric.id, metric.coverageStart, metric.coverageEnd);
        downloadCsv(
            buildSeriesCsv(metric, payload.points),
            `weltmarkt-${metric.id}-komplett-original.csv`
        );
    } catch (error) {
        window.alert(error.message || 'The complete time series could not be exported.');
    } finally {
        button.textContent = label;
        button.disabled = false;
    }
}

function exportSnapshotCsv() {
    if (state.metrics.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(
        buildSnapshotCsv(state.metrics),
        `weltmarkt-momentaufnahme-${date}-original.csv`
    );
}
