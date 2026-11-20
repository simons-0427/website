import { LoadingProgress, PerformanceTracker, nextPaint, loadChartLibrary, mayPrefetch } from './loading.js?v=20261114-compare-2';
import { readOverview, saveOverview, moveOverview, placeOverview } from './preferences.js?v=20261114-compare-2';
import { compareSeries, supportsLogScale } from './comparison.js?v=20261114-scale-1';
import { WeltmarktApi } from './api.js?v=20261114-compare-2';
import {
    CURRENCY_OPTIONS,
    FX_SERIES,
    conversionDescription,
    conversionSeriesIds,
    convertMetricPoints,
    monetaryCurrency,
} from './currency.js?v=20261114-compare-2';
import {
    categoryForSection,
    displayMetricName,
    displayMethodology,
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
} from './formatters.js?v=20261114-compare-2';

const TOP_METRICS = Object.freeze([
    ['world_gdp_yoy', 'G20-BIP-Wachstum'],
    ['ez_cpi', 'Euro-Inflation'],
    ['us_10y', 'US-Rendite 10J'],
    ['sp500', 'S&P 500'],
    ['dax40', 'DAX 40'],
    ['gold', 'Gold'],
    ['brent', 'Brent-Öl'],
    ['eurusd', 'EUR/USD'],
]);

const state = {
    catalog: [], overview: [], compareId: '',
    metrics: [],
    manifest: {},
    selected: null,
    rawPoints: [],
    points: [],
    displayMetric: null,
    category: 'macro',
    range: '3y',
    chartScale: 'linear',
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
    dom.scaleButtons = [...document.querySelectorAll('[data-chart-scale]')];
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

    dom.scaleButtons.forEach(button => button.addEventListener('click', () => {
        if (button.disabled || state.chartScale === button.dataset.chartScale) return;
        state.chartScale = button.dataset.chartScale;
        renderChartWithScale();
        updateUrl();
    }));

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
        if (suppressOverviewClick) { event.preventDefault(); return; }
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
        toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    });
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
        toggle?.classList.remove('open');
        menu.classList.remove('open');
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-label', 'Menü öffnen');
    }));
}

function renderManifest() {
    dom['metric-count'].textContent = formatCount(state.manifest.metric_count);
    dom['observation-count'].textContent = formatCount(state.manifest.observation_count);
    dom['retrieved-at'].textContent = formatDate((state.manifest.retrieved_at || '').slice(0, 10));
    dom['data-status'].textContent = `${formatCount(state.manifest.metric_count)} Kennzahlen | ${formatCount(state.manifest.observation_count)} Werte`;
    dom['data-status'].classList.add('is-ready');
}

function comparisonPoints(metric, period = 'previous') {
    const baseline = period === 'previous' ? metric?.previous : metric?.comparisons?.[period];
    return [baseline, metric?.latest].filter(Boolean);
}

function cardChangePeriodLabel() {
    return {
        previous: 'dem unmittelbar vorherigen gespeicherten Wert',
        '1y': 'dem ersten gespeicherten Wert innerhalb des letzten Jahres',
        '3y': 'dem ersten gespeicherten Wert innerhalb der letzten drei Jahre',
        '10y': 'dem ersten gespeicherten Wert innerhalb der letzten zehn Jahre',
        max: 'dem ersten gespeicherten Wert der gesamten Zeitreihe',
    }[state.cardChangePeriod] ?? 'dem unmittelbar vorherigen gespeicherten Wert';
}

function renderCardChanges() {
    if (state.currency !== 'original') void progress.track('cards-fx', text('Umrechnung wird geladen', 'Loading currency conversion'), async () => { await ensureFxSeries(visibleCardMetrics()); renderTopMetrics(); fillCards(); }).catch(() => {});
    renderTopMetrics();
    fillCards();
    dom['card-change-description'].textContent = `${state.cardChangeMode === 'absolute' ? 'Absolute' : 'Relative'} Änderung gegenüber ${cardChangePeriodLabel()}.`;
    updateUrl();
}

function displayValues(metric, points) {
    const displayed = convertMetricPoints(metric, points, state.currency, state.fxSeries || {});
    return { ...displayed, unit: visibleMetricUnit(metric, displayed.unit) };
}

function renderSelectedSeries() {
    if (!state.selected || !state.chart) return;
    const displayed = displayValues(state.selected, state.rawPoints);
    state.points = displayed.points;
    state.displayMetric = { ...state.selected, name: displayMetricName(state.selected), unit: displayed.unit };
    renderChartWithScale();
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
    dom['methodology-summary'].textContent = `Die Kennzahl wird ${formatFrequency(metric.frequency)} in ihrer gespeicherten Originalfrequenz dargestellt. Fehlende Werte bleiben als Lücken sichtbar.`;
    dom['methodology-text'].textContent = conversionActive
        ? `${displayMethodology(metric)} ${conversion}. Kreuzkurse laufen über USD; fehlende Kurse bleiben Lücken.`
        : displayMethodology(metric);
    dom['source-name'].textContent = conversionActive ? `${metric.source.name} | gespeicherte Devisenkurse` : metric.source.name;
    dom['source-series'].textContent = [metric.sourceSeries || 'Keine zusätzliche Serien-ID', ...fxSeriesIds].join(' | ');
    dom['source-license'].textContent = conversionActive
        ? `${metric.source.licenseNote} Die Umrechnung verwendet ausschließlich gespeicherte tägliche FX-Schlusskurse.`
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
    dom['chart-latest-date'].textContent = latest ? `Letzter Wert: ${formatDate(latest.date)}` : 'Keine Werte im Zeitraum';
    dom['chart-change'].textContent = change.text;
    dom['chart-change'].className = `chart-change chart-change--${change.direction}`;
}

function syncChartScale(ready = false) {
    const result = state.comparisonResult;
    const allowed = result ? supportsLogScale(result.leftPoints, result.rightPoints) : supportsLogScale(state.points);
    if (ready && state.chartScale === 'logarithmic' && !allowed) state.chartScale = 'linear';
    dom.scaleButtons.forEach(button => {
        const active = button.dataset.chartScale === state.chartScale;
        button.disabled = !ready || (button.dataset.chartScale === 'logarithmic' && !allowed);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    const note = document.getElementById('chart-scale-note');
    note.textContent = !ready ? '' : !allowed
        ? text('Die Reihe enthält Nullwerte oder negative Werte. Logarithmisch ist nur für ausschließlich positive Werte verfügbar.', 'The series contains zero or negative values. Logarithmic scale requires positive values only.')
        : state.chartScale === 'logarithmic'
            ? text('Logarithmisch: Gleiche Abstände entsprechen gleichen prozentualen Änderungen.', 'Logarithmic: Equal distances represent equal percentage changes.') : '';
    note.hidden = !note.textContent;
}

function renderChartWithScale() {
    syncChartScale(true);
    if (state.comparisonResult) state.chart.renderComparison(state.displayMetric, state.comparisonMetric, state.comparisonResult, state.chartScale);
    else state.chart.render(state.displayMetric, state.points, state.chartScale);
}

function setChartState(type, message) {
    dom['chart-state'].dataset.state = type;
    dom['chart-state'].textContent = message;
    dom['chart-state'].hidden = type === 'ready';
    syncChartScale(type === 'ready');
}

function setFatalError(message) {
    dom['data-status'].textContent = 'Datenbank nicht erreichbar';
    dom['data-status'].classList.add('is-error');
    setChartState('error', `${message} Prüfe die Weltmarkt-Konfiguration, die Datenbankzugänge und den SQL-Import.`);
    dom['top-metrics'].innerHTML = '';
    dom['metric-groups'].innerHTML = '';
    dom['empty-results'].hidden = false;
    dom['empty-results'].textContent = 'Noch keine Kennzahlen geladen.';
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
    if (state.compareId) url.searchParams.set('compare', state.compareId);
    else url.searchParams.delete('compare');
    url.searchParams.delete('compareMode');
    if (state.chartScale === 'logarithmic') url.searchParams.set('scale', 'log');
    else url.searchParams.delete('scale');
    window.history.replaceState({}, '', url);
    updateLanguageTargets(url);
}

function updateLanguageTargets(url = new URL(window.location.href)) {
    for (const button of document.querySelectorAll('[data-language-target]')) {
        for (const key of ['languageTarget', 'languageFileTarget']) {
            if (!button.dataset[key]) continue;
            const target = new URL(button.dataset[key], window.location.href);
            target.search = url.search; target.hash = url.hash;
            button.dataset[key] = target.href;
        }
    }
}


const EN = document.documentElement.lang.startsWith('en');
const text = (de, en) => EN ? en : de;
let progress, performanceTracker, catalogObserver, chartVisible = false, seriesSequence = 0, prefetchTimer, prefetchController;
let enhancementsReady = false, suppressOverviewClick = false;
const pendingSummaries = new Map();
const summaryVersions = new Map();

function storage() { try { return window.localStorage; } catch { return null; } }
function mergeMetrics(metrics, version = WeltmarktApi.version) {
    const byId = new Map(state.metrics.map(m => [m.id, m]));
    for (const metric of metrics) {
        if (version && summaryVersions.get(metric.id) > version) continue;
        byId.set(metric.id, metric); summaryVersions.set(metric.id, version);
    }
    state.metrics = [...byId.values()];
}
async function getSummaries(ids, priority = 0, force = false) {
    const missing = [...new Set(ids)].filter(id => id && (force || !state.metrics.some(m => m.id === id) || summaryVersions.get(id) !== WeltmarktApi.version));
    if (!missing.length) return;
    const key = missing.slice().sort().join(',');
    if (pendingSummaries.has(key)) return pendingSummaries.get(key);
    const task = (async () => {
        for (let i = 0; i < missing.length; i += 32) {
            const payload = await WeltmarktApi.summaries(missing.slice(i, i + 32), undefined, { priority });
            mergeMetrics(payload.metrics, payload.dataVersion);
            if (!payload.dataVersion || payload.dataVersion >= WeltmarktApi.version) state.manifest = payload.manifest;
        }
        renderManifest();
    })().finally(() => pendingSummaries.delete(key));
    pendingSummaries.set(key, task); return task;
}

async function boot() {
    WeltmarktApi.onVersionChange = () => { state.fxSeries = null; };
    const url = new URL(location.href).searchParams;
    state.overview = readOverview(storage()); state.catalog = [];
    state.chartScale = url.get('scale') === 'log' ? 'logarithmic' : 'linear';
    state.compareId = /^[a-z0-9_]{1,96}$/.test(url.get('compare') || '') ? url.get('compare') : '';
    if (['1y', '3y', '5y', '10y', 'max'].includes(url.get('range'))) state.range = url.get('range');
    state.cardChangeMode = url.get('changeMode') === 'absolute' ? 'absolute' : 'relative';
    if (['previous', '1y', '3y', '10y', 'max'].includes(url.get('changePeriod'))) state.cardChangePeriod = url.get('changePeriod');
    const requestedCurrency = (url.get('currency') || '').toUpperCase();
    state.currency = CURRENCY_OPTIONS.includes(requestedCurrency) ? requestedCurrency : 'original';
    dom['currency-select'].value = state.currency; dom['currency-select'].disabled = false;
    dom['card-change-mode'].value = state.cardChangeMode; dom['card-change-period'].value = state.cardChangePeriod;
    syncRangeButtons();
    progress ||= new LoadingProgress(document.getElementById('loading-progress'), EN);
    performanceTracker ||= new PerformanceTracker(WeltmarktApi.queue);
    setupEnhancements(); renderTopMetrics();
    const requested = /^[a-z0-9_]{1,96}$/.test(url.get('metric') || '') ? url.get('metric') : 'world_cli';
    try {
        await progress.track('overview', text('Übersicht wird geladen', 'Loading overview'), async () => {
            await getSummaries([...state.overview, requested, 'world_cli', state.compareId], 0, true);
            state.overviewLoaded = true;
            state.selected = state.metrics.find(m => m.id === requested) || state.metrics.find(m => m.id === 'world_cli') || state.metrics[0];
            if (!state.selected) throw Error(text('Keine gespeicherten Kennzahlen verfügbar.', 'No stored metrics available.'));
            if (state.compareId === state.selected.id || !state.metrics.some(metric => metric.id === state.compareId)) state.compareId = '';
            state.category = categoryForSection(state.selected.section);
            renderTopMetrics(); updateStaticMetricDetails(); syncCategoryButtons(); updateUrl();
            dom['export-snapshot'].disabled = false;
            await nextPaint(); performanceTracker.mark('overviewReady');
        });
    } catch (error) { dom['data-status'].textContent = text('Übersicht konnte nicht geladen werden', 'Overview could not be loaded'); progress.tasks.get('overview').retry = () => boot(); return; }
    if (state.currency !== 'original') void progress.track('overview-fx', text('Umrechnung wird geladen', 'Loading currency conversion'), async () => {
        await ensureFxSeries(state.metrics.filter(metric => state.overview.includes(metric.id)));
        renderTopMetrics(); fillCards();
    }).catch(() => {});
    observeChart();
    void progress.track('catalog', text('Suchverzeichnis wird geladen', 'Loading search index'), async () => {
        const payload = await WeltmarktApi.catalog(undefined, { priority: 2 });
        state.catalog = payload.metrics; state.manifest = payload.manifest;
        renderManifest(); renderMetricGroups(); updateComparisonOptions();
        const count = document.getElementById('catalog-description');
        count.textContent = text(`${state.catalog.length} Zeitreihen, nach Themen geordnet. Suche über alle Bereiche.`, `${state.catalog.length} time series, grouped by topic. Search across all categories.`);
        performanceTracker.mark('catalogReady');
    }).catch(() => {});
}

function observeChart() {
    const requested = new URL(location.href).searchParams.has('compare');
    if (!('IntersectionObserver' in window) || requested) { chartVisible = true; void loadSeries(); return; }
    const observer = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) { observer.disconnect(); if (!chartVisible) { chartVisible = true; void loadSeries(); } }
    }, { rootMargin: '250px' });
    observer.observe(document.getElementById('trend'));
}

function setupEnhancements() {
    if (enhancementsReady) return; enhancementsReady = true;
    updateLanguageTargets();
    window.addEventListener('scroll', () => WeltmarktApi.queue.drain(), { passive: true });
    window.addEventListener('resize', () => WeltmarktApi.queue.drain(), { passive: true });

    const overviewRoot = dom['top-metrics'];
    let drag = null;
    const clearDrag = () => {
        overviewRoot.querySelectorAll('.is-dragging, .is-drop-target').forEach(card => card.classList.remove('is-dragging', 'is-drop-target'));
        overviewRoot.classList.remove('is-reordering');
    };
    overviewRoot.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('[data-overview-action]')) return;
        const card = event.target.closest('[data-overview-id]'); if (!card) return;
        drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, id: card.dataset.overviewId, target: card.dataset.overviewId, active: false };
    });
    overviewRoot.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointer) return;
        if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
        event.preventDefault();
        if (!drag.active) {
            drag.active = true; overviewRoot.setPointerCapture(event.pointerId); overviewRoot.classList.add('is-reordering');
            overviewRoot.querySelector(`[data-overview-id="${drag.id}"]`)?.classList.add('is-dragging');
        }
        const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-overview-id]');
        if (over && overviewRoot.contains(over)) {
            drag.target = over.dataset.overviewId;
            overviewRoot.querySelectorAll('.is-drop-target').forEach(card => card.classList.remove('is-drop-target'));
            if (drag.target !== drag.id) over.classList.add('is-drop-target');
        }
    });
    overviewRoot.addEventListener('pointerup', event => {
        if (!drag || event.pointerId !== drag.pointer) return;
        const finished = drag; drag = null; clearDrag();
        if (overviewRoot.hasPointerCapture(event.pointerId)) overviewRoot.releasePointerCapture(event.pointerId);
        if (!finished.active) return;
        event.preventDefault(); suppressOverviewClick = true;
        state.overview = placeOverview(state.overview, finished.id, finished.target); persistOverview();
        overviewRoot.querySelector(`[data-metric-id="${finished.id}"]`)?.focus({ preventScroll: true });
        setTimeout(() => { suppressOverviewClick = false; }, 0);
    });
    overviewRoot.addEventListener('pointercancel', () => { drag = null; clearDrag(); });
    overviewRoot.addEventListener('keydown', event => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const card = event.target.closest('[data-overview-id]'); if (!card) return;
        event.preventDefault();
        state.overview = moveOverview(state.overview, card.dataset.overviewId, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
        persistOverview(); overviewRoot.querySelector(`[data-metric-id="${card.dataset.overviewId}"]`)?.focus({ preventScroll: true });
    });

    document.getElementById('top-metrics').addEventListener('click', event => {
        const control = event.target.closest('[data-overview-action]'); if (!control) return;
        const id = control.dataset.id, action = control.dataset.overviewAction;
        if (action === 'remove') state.overview = state.overview.filter(value => value !== id);
        else state.overview = moveOverview(state.overview, id, action === 'up' ? -1 : 1);
        persistOverview();
        document.querySelector(`[data-overview-action="${action}"][data-id="${id}"]`)?.focus();
    });
    dom['metric-groups'].addEventListener('click', event => {
        const favorite = event.target.closest('[data-favorite]'); if (!favorite) return;
        const id = favorite.dataset.favorite;
        if (state.overview.includes(id)) state.overview = state.overview.filter(value => value !== id);
        else if (state.overview.length < 12) state.overview.push(id);
        else { const message = document.getElementById('overview-empty'); message.hidden = false; message.textContent = text('Höchstens zwölf Favoriten. Entferne zuerst einen Stern.', 'Maximum twelve favorites. Remove a star first.'); return; }
        persistOverview(); void getSummaries([id]).then(renderTopMetrics).catch(() => {});
    });
    const schedule = event => {
        const card = event.target.closest('[data-metric-id]'); clearTimeout(prefetchTimer);
        if (!card || !mayPrefetch()) return;
        prefetchTimer = setTimeout(async () => {
            if (prefetchController) return;
            const controller = new AbortController(); prefetchController = controller;
            try { await getSummaries([card.dataset.metricId], 10); const metric = state.metrics.find(m => m.id === card.dataset.metricId); if (metric) await WeltmarktApi.series(metric.id, rangeStart(metric, '3y'), metric.coverageEnd, controller.signal, { priority: 10 }); }
            catch {} finally { if (prefetchController === controller) prefetchController = null; }
        }, 200);
    };
    for (const root of [dom['metric-groups'], dom['top-metrics']]) {
        root.addEventListener('pointerover', schedule); root.addEventListener('focusin', schedule);
        root.addEventListener('pointerout', () => clearTimeout(prefetchTimer)); root.addEventListener('focusout', () => clearTimeout(prefetchTimer));
    }
    const changeComparison = id => {
        state.compareId = id; updateUrl(); updateComparisonOptions(); chartVisible = true; void loadSeries();
    };
    document.getElementById('compare-select').addEventListener('change', event => changeComparison(event.target.value));
    document.getElementById('clear-comparison').addEventListener('click', () => changeComparison(''));
    document.getElementById('export-comparison').addEventListener('click', exportComparisonCsv);
}

function persistOverview() {
    saveOverview(storage(), state.overview);
    renderTopMetrics();
    document.querySelectorAll('[data-favorite]').forEach(button => { const selected = state.overview.includes(button.dataset.favorite); button.setAttribute('aria-pressed', String(selected)); });
}

function favoriteIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z"/></svg>';
}

function renderTopMetrics() {
    const byId = new Map(state.metrics.map(m => [m.id, m]));
    dom['top-metrics'].innerHTML = state.overview.map((id, index) => {
        const metric = byId.get(id), label = TOP_METRICS.find(row => row[0] === id)?.[1] || (metric ? displayMetricName(metric) : id);
        const displayed = metric ? displayValues(metric, comparisonPoints(metric, state.cardChangePeriod)) : null;
        const change = displayed ? formatCardChange(displayed.points, displayed.unit, state.cardChangeMode) : null;
        return `<article class="overview-item" data-overview-id="${id}"><button class="top-metric${state.selected?.id === id ? ' is-active' : ''}" type="button" data-metric-id="${escapeHtml(id)}" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown" aria-description="${text('Zum Umsortieren mit der Maus ziehen. Alternativ Alt und Pfeiltaste.', 'Drag to reorder. Alternatively use Alt and an arrow key.')}" aria-pressed="${state.selected?.id === id}">
            <span class="top-metric__name">${escapeHtml(label)}</span><strong>${displayed ? escapeHtml(formatValue(displayed.points.at(-1)?.value, displayed.unit)) : '…'}</strong>
            <span class="point-change point-change--${change?.direction || 'neutral'}">${escapeHtml(change?.text || (state.overviewLoaded ? text('Keine Daten verfügbar', 'No data available') : text('Wird geladen', 'Loading')))}</span>
            <span class="top-metric__date">${metric ? escapeHtml(formatDate(metric.latest?.date)) : ''}</span></button>
            <button class="favorite-button overview-star" type="button" data-overview-action="remove" data-id="${id}" aria-pressed="true" aria-label="${escapeHtml(label + text(' aus Favoriten entfernen', ' remove from favorites'))}" title="${text('Aus Favoriten entfernen', 'Remove from favorites')}">${favoriteIcon()}</button></article>`;
    }).join('');
    const empty = document.getElementById('overview-empty'); empty.hidden = state.overview.length > 0;
    if (!state.overview.length) empty.textContent = text('Wähle Favoriten über die Sterne im Katalog.', 'Select favorites using the stars in the catalog.');
}

function renderMetricGroups() {
    catalogObserver?.disconnect();
    const source = state.catalog.length ? state.catalog : state.metrics;
    const filtered = source.filter(metric => {
        if (!state.search) return categoryForSection(metric.section) === state.category;
        return `${displayMetricName(metric)} ${metric.id} ${metric.name} ${sectionLabel(metric.section)} ${metric.source.name}`.toLocaleLowerCase(EN ? 'en-US' : 'de-DE').includes(state.search);
    });
    document.getElementById('search-count').textContent = state.search ? text(`${filtered.length} Treffer in allen Kategorien`, `${filtered.length} results across all categories`) : '';
    const groups = new Map(); for (const metric of filtered) { if (!groups.has(metric.section)) groups.set(metric.section, []); groups.get(metric.section).push(metric); }
    dom['empty-results'].hidden = filtered.length > 0;
    dom['metric-groups'].innerHTML = [...groups].map(([section, metrics]) => `<details class="metric-group" open data-group="${section}"><summary class="metric-group__heading"><span class="metric-group__title">${escapeHtml(sectionLabel(section))}</span><span>${metrics.length}</span></summary><div class="metric-grid">${metrics.map(metric => `<article class="metric-tile" data-card-id="${metric.id}">${metricCard(state.metrics.find(m => m.id === metric.id) || metric)}</article>`).join('')}</div></details>`).join('');
    if ('IntersectionObserver' in window) {
        catalogObserver = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting && entry.target.open) { void hydrateGroup(entry.target); } }, { rootMargin: '250px' });
        dom['metric-groups'].querySelectorAll('[data-group]').forEach(group => { catalogObserver.observe(group); group.addEventListener('toggle', () => { const rect = group.getBoundingClientRect(); if (group.open && rect.bottom > 0 && rect.top < innerHeight + 250) void hydrateGroup(group); }); });
    } else dom['metric-groups'].querySelectorAll('[data-group]').forEach(group => void hydrateGroup(group));
}

function metricCard(metric) {
    const active = state.selected?.id === metric.id, displayedName = displayMetricName(metric);
    return `<button class="metric-card${active ? ' is-active' : ''}" type="button" data-metric-id="${metric.id}" aria-pressed="${active}"><span class="metric-card__heading"><span class="metric-card__kicker">${escapeHtml(formatFrequency(metric.frequency))}</span><span class="metric-card__name">${escapeHtml(displayedName)}</span></span><strong class="metric-card__value" data-value>…</strong><span class="point-change" data-change></span><span class="metric-card__meta" data-date></span></button><button class="favorite-button" type="button" data-favorite="${metric.id}" aria-label="${escapeHtml(displayedName + text(' in meiner Übersicht', ' in my overview'))}" aria-pressed="${state.overview.includes(metric.id)}">${favoriteIcon()}</button>`;
}

function visibleCardMetrics() {
    const ids = new Set(state.overview);
    for (const group of dom['metric-groups'].querySelectorAll('[data-group]')) {
        const rect = group.getBoundingClientRect();
        if (!group.open || rect.bottom <= 0 || rect.top >= innerHeight + 250) continue;
        for (const card of group.querySelectorAll('[data-card-id]')) ids.add(card.dataset.cardId);
    }
    return state.metrics.filter(metric => ids.has(metric.id));
}

async function hydrateGroup(group) {
    if (group.dataset.loading === 'true') return;
    group.dataset.loading = 'true';
    const ids = [...group.querySelectorAll('[data-card-id]')].map(card => card.dataset.cardId);
    try { await progress.track('group-' + group.dataset.group, text('Kennzahlen werden geladen', 'Loading metrics'), async () => {
        await getSummaries(ids, () => { const r = group.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight + 250 ? 2 : 10; });
        fillCards(group);
        if (state.currency !== 'original') await progress.track('group-fx-' + group.dataset.group, text('Umrechnung wird geladen', 'Loading currency conversion'), async () => {
            await ensureFxSeries(state.metrics.filter(metric => ids.includes(metric.id)));
            fillCards(group);
        }).catch(() => {});
    }); }
    catch {} finally { group.dataset.loading = 'false'; }
}
function fillCards(root = dom['metric-groups']) {
    for (const card of root.querySelectorAll('[data-card-id]')) {
        const metric = state.metrics.find(m => m.id === card.dataset.cardId); if (!metric?.latest) continue;
        const displayed = displayValues(metric, comparisonPoints(metric, state.cardChangePeriod)), change = formatCardChange(displayed.points, displayed.unit, state.cardChangeMode);
        card.querySelector('[data-value]').textContent = formatValue(displayed.points.at(-1)?.value, displayed.unit);
        const changeNode = card.querySelector('[data-change]'); changeNode.textContent = change.text; changeNode.className = 'point-change point-change--' + change.direction; changeNode.setAttribute('aria-label', change.label);
        card.querySelector('[data-date]').textContent = formatDate(metric.latest.date);
        card.querySelector('[data-metric-id]').classList.toggle('is-active', state.selected?.id === metric.id);
        card.querySelector('[data-metric-id]').setAttribute('aria-pressed', String(state.selected?.id === metric.id));
    }
}

async function selectMetric(metricId, scrollToChart) {
    const selection = ++seriesSequence;
    state.seriesRequest?.abort(); prefetchController?.abort();
    try { await getSummaries([metricId]); } catch { return; }
    if (selection !== seriesSequence) return;
    const metric = state.metrics.find(item => item.id === metricId); if (!metric) return;
    state.selected = metric;
    if (state.compareId === metricId) state.compareId = '';
    renderTopMetrics(); fillCards(); updateStaticMetricDetails(); updateComparisonOptions(); updateUrl();
    if (scrollToChart) { chartVisible = true; document.getElementById('trend').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (chartVisible) await loadSeries();
}

async function ensureFxSeries(metrics = [state.selected], start = null, end = null, signal = undefined, versionRetry = 0) {
    if (state.currency === 'original') return {};
    const targetCurrency = state.currency, currencies = new Set();
    for (const metric of metrics.filter(Boolean)) {
        if (!monetaryCurrency(metric) || monetaryCurrency(metric) === targetCurrency) continue;
        for (const currency of [monetaryCurrency(metric), targetCurrency]) if (currency !== 'USD') currencies.add(currency);
    }
    const dates = metrics.filter(Boolean).flatMap(item => comparisonPoints(item, state.cardChangePeriod).map(point => point.date)).sort();
    const first = start || dates[0], last = end || dates.at(-1);
    const ends = metrics.filter(Boolean).map(metric => {
        const date = new Date((end || comparisonPoints(metric, state.cardChangePeriod).at(-1)?.date || metric.coverageEnd) + 'T00:00:00Z');
        if (metric.frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1, 0);
        else if (metric.frequency === 'quarterly') date.setUTCMonth(date.getUTCMonth() + 3, 0);
        else if (metric.frequency === 'annual') date.setUTCFullYear(date.getUTCFullYear() + 1, 0, 0);
        return date.toISOString().slice(0, 10);
    }).sort();
    const batches = await Promise.all([...currencies].map(async currency => {
        const id = FX_SERIES[currency].metricId; await getSummaries([id]);
        const metric = state.metrics.find(item => item.id === id); if (!metric) throw Error(text('Devisenreihe fehlt.', 'Missing FX series.'));
        const lead = new Date((first || metric.coverageStart) + 'T00:00:00Z'); lead.setUTCDate(lead.getUTCDate() - 14);
        const from = lead.toISOString().slice(0, 10), until = (ends.at(-1) || metric.coverageEnd) < metric.coverageEnd ? ends.at(-1) : metric.coverageEnd;
        const payload = await WeltmarktApi.series(id, from, until, signal);
        return { currency, from, until, payload };
    }));
    if (batches.some(batch => batch.payload.dataVersion && batch.payload.dataVersion !== WeltmarktApi.version)) {
        if (versionRetry < 1) return ensureFxSeries(metrics, start, end, signal, versionRetry + 1);
        throw Error(text('Wechselkurse wurden während des Abrufs aktualisiert.', 'Exchange rates changed while loading.'));
    }
    if (targetCurrency !== state.currency) return {};
    const next = state.fxVersion === WeltmarktApi.version ? { ...(state.fxSeries || {}) } : {};
    for (const { currency, from, until, payload } of batches) {
        const points = new Map((next[currency] || []).filter(point => point.date < from || point.date > until).map(point => [point.date, point]));
        for (const point of payload.points) points.set(point.date, point);
        next[currency] = [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
    }
    state.fxSeries = next; state.fxVersion = WeltmarktApi.version; return next;
}

function resetCurrencyProgress() {
    for (const id of progress.tasks.keys()) {
        if (id === 'overview-fx' || id === 'cards-fx' || id.startsWith('group-fx-')) progress.tasks.delete(id);
    }
}

async function changeCurrency(target) {
    state.seriesRequest?.abort();
    resetCurrencyProgress();
    state.currency = CURRENCY_OPTIONS.includes(target) ? target : 'original'; state.fxSeries = null;
    const selectedCurrency = state.currency; dom['currency-select'].value = state.currency;
    return progress.track('currency', text('Umrechnung wird geladen', 'Loading currency conversion'), async () => {
        if (selectedCurrency !== state.currency) return;
        const metrics = visibleCardMetrics();
        if (metrics.length) await ensureFxSeries(metrics);
        if (selectedCurrency !== state.currency) return;
        renderTopMetrics(); fillCards(); if (chartVisible) await loadSeries(); updateStaticMetricDetails(); updateUrl();
    }).catch(error => { dom['currency-note'].textContent = error.message; dom['currency-note'].classList.add('is-error'); });
}

function updateComparisonOptions() {
    const select = document.getElementById('compare-select'), source = state.catalog.length ? state.catalog : state.metrics;
    select.innerHTML = `<option value="">${text('Keine zweite Kennzahl', 'No second metric')}</option>` + source.filter(m => m.id !== state.selected?.id).map(m => `<option value="${m.id}">${escapeHtml(displayMetricName(m))}</option>`).join('');
    select.value = state.compareId; document.getElementById('clear-comparison').hidden = !state.compareId;
}

async function loadSeries(versionRetry = 0) {
    if (!state.selected || !chartVisible) return;
    const chartStartedAt = performance.now();
    state.seriesRequest?.abort(); const controller = new AbortController(); state.seriesRequest = controller;
    const sequence = ++seriesSequence, selected = state.selected, compareId = state.compareId, currency = state.currency, range = state.range;
    setChartState('loading', text('Zeitreihe wird geladen …', 'Loading series …')); dom['export-csv'].disabled = true;
    document.getElementById('export-comparison').disabled = true;
    return progress.track('chart', text('Diagramm wird geladen', 'Loading chart'), async () => {
        try {
            if (compareId) await getSummaries([compareId]);
            if (sequence !== seriesSequence || controller.signal.aborted) return;
            const comparison = state.metrics.find(m => m.id === compareId);
            const start = rangeStart(selected, range), end = selected.coverageEnd;
            const histories = Promise.all([WeltmarktApi.series(selected.id, start, end, controller.signal), ...(comparison ? [WeltmarktApi.series(comparison.id, start, end, controller.signal)] : [])]);
            const library = loadChartLibrary().then(async () => { const { WeltmarktChart } = await import('./charts.js?v=20261114-scale-1'); if (!state.chart) state.chart = new WeltmarktChart(dom['chart-canvas']); });
            const [payloads] = await Promise.all([histories, library, ensureFxSeries([selected, comparison], start, end, controller.signal)]);
            if (sequence !== seriesSequence || controller.signal.aborted || state.currency !== currency) return;
            if (payloads.some(payload => payload.dataVersion && payload.dataVersion !== WeltmarktApi.version)) {
                if (versionRetry < 1) return loadSeries(versionRetry + 1);
                throw Error(text('Daten wurden während des Abrufs aktualisiert.', 'Data changed while loading.'));
            }
            mergeMetrics(payloads.map(payload => payload.metric), payloads[0].dataVersion); state.selected = payloads[0].metric;
            state.rawPoints = payloads[0].points; state.comparisonPayload = comparison ? payloads[1] : null;
            state.comparisonResult = null;
            const displayed = displayValues(state.selected, state.rawPoints);
            state.points = displayed.points; state.displayMetric = { ...state.selected, name: displayMetricName(state.selected), unit: displayed.unit };
            renderComparisonSummary();
            if (comparison) {
                const otherMetric = payloads[1].metric, other = displayValues(otherMetric, payloads[1].points);
                state.comparisonMetric = {...otherMetric,name:displayMetricName(otherMetric),unit:other.unit};
                try {
                    state.comparisonResult = compareSeries(state.displayMetric, state.comparisonMetric, displayed.points, other.points);
                    renderChartWithScale();
                    document.getElementById('export-comparison').disabled = false;
                } catch (error) {
                    state.comparisonResult = null;
                    renderChartWithScale();
                    const note=document.getElementById('comparison-note'); note.hidden=false; note.textContent=comparisonError(error.message);
                }
            } else renderChartWithScale();
            updateSeriesDetails(); updateStaticMetricDetails();
            if (state.comparisonResult) renderComparisonSummary(state.displayMetric, state.comparisonMetric, state.comparisonResult);
            dom['export-csv'].disabled = !state.points.length; setChartState('ready', ''); updateUrl();
            await nextPaint();
            if (performanceTracker.enabled) document.documentElement.dataset.chartLatency = String(Math.round(performance.now() - chartStartedAt));
            performanceTracker.mark('chartReady');
            if (mayPrefetch() && range !== 'max' && sequence === seriesSequence) void WeltmarktApi.series(selected.id, selected.coverageStart, selected.coverageEnd, undefined, { priority: 10 }).catch(() => {});
        } catch (error) {
            if (controller.signal.aborted || sequence !== seriesSequence) return;
            setChartState('error', text('Diagramm konnte nicht geladen werden. Wiederholen ist oben möglich.', 'Chart could not be loaded. Use Retry above.')); throw error;
        }
    }).catch(() => {});
}

function renderComparisonSummary(left, right, result) {
    const root=document.getElementById('comparison-summary'), note=document.getElementById('comparison-note');
    root.hidden=!result; document.querySelector('.chart-summary').hidden=Boolean(result); note.hidden=!result; note.textContent='';
    dom['chart-canvas'].setAttribute('aria-label',result?text(`${left.name}, linke Achse; ${right.name}, rechte Achse. Originalwerte mit gemeinsamer relativer Skalierung.`,`${left.name}, left axis; ${right.name}, right axis. Original values with a shared relative scale.`):text('Zeitreihendiagramm der ausgewählten Kennzahl','Time-series chart for the selected metric'));
    if (!result) { root.innerHTML=''; return; }
    const metrics=[left,right], axes=[result.left,result.right];
    root.innerHTML=metrics.map((metric,index)=>{
        const axis=axes[index], change=axis.change===null?text('Änderung ab 0', 'Change from 0'):new Intl.NumberFormat(EN?'en-GB':'de-DE',{style:'percent',signDisplay:'exceptZero',maximumFractionDigits:2}).format(axis.change);
        return `<article class="comparison-series comparison-series--${index===0?'left':'right'}"><span class="comparison-series__axis">${index===0?text('Linke Achse','Left axis'):text('Rechte Achse','Right axis')}</span><span class="comparison-series__name">${escapeHtml(metric.name)}</span><div class="comparison-series__values"><strong>${escapeHtml(formatValue(axis.latest,metric.unit))}</strong><span class="comparison-series__change">${escapeHtml(change)}</span></div><span class="comparison-series__base">${text('Start','Start')}: ${escapeHtml(formatValue(axis.base,metric.unit))} (${formatDate(axis.start)})</span><span class="comparison-series__source">${formatDate(axis.end)} / ${escapeHtml(formatFrequency(metric.frequency))} / ${escapeHtml(metric.source?.name||'')}</span></article>`;
    }).join('');
    note.textContent=axes.some(axis=>axis.zeroBase)?text('Bei einem Startwert von 0 ist keine prozentuale Veränderung berechenbar. Die Startwerte bleiben auf gleicher Höhe ausgerichtet.','Percentage change cannot be calculated from a zero start value. Starting values remain aligned at the same height.'):text('Gleiche prozentuale Skala, gemeinsame Starthöhe. Beide Achsen zeigen die tatsächlichen Werte.','Shared percentage scale and aligned starting values. Both axes show actual values.');
    dom['chart-title'].textContent=text('Kennzahlenvergleich','Metric comparison');
    dom['chart-section'].textContent=text('Zwei Kennzahlen','Two metrics');
    dom['chart-coverage'].textContent=`${formatDate(result.start)} – ${formatDate(result.end)}`;
    dom['chart-frequency'].textContent=left.frequency===right.frequency?formatFrequency(left.frequency):`${formatFrequency(left.frequency)} / ${formatFrequency(right.frequency)}`;
    dom['chart-points'].textContent=`${formatCount(result.leftPoints.length)} + ${formatCount(result.rightPoints.length)}`;
}

function comparisonError(code) {
    return code==='SAME_SERIES'?text('Wähle zwei unterschiedliche Kennzahlen.','Choose two different metrics.'):text('Keine gemeinsame zeitliche Abdeckung mit verfügbaren Werten.','No overlapping period with available observations.');
}

async function exportSeriesCsv() {
    if (!state.selected) return; const metric = state.selected, button = dom['export-csv']; button.disabled = true;
    try { const [{ buildSeriesCsv, downloadCsv }, payload] = await Promise.all([import('./csv.js?v=20261114-compare-2'), WeltmarktApi.series(metric.id, metric.coverageStart, metric.coverageEnd)]); downloadCsv(buildSeriesCsv(payload.metric, payload.points), `weltmarkt-${metric.id}-original.csv`); }
    catch (error) { alert(error.message); } finally { button.disabled = false; }
}
async function exportSnapshotCsv() {
    const button = dom['export-snapshot']; button.disabled = true;
    try { const [{ buildSnapshotCsv, downloadCsv }, payload] = await Promise.all([import('./csv.js?v=20261114-compare-2'), WeltmarktApi.metrics()]); downloadCsv(buildSnapshotCsv(payload.metrics), 'weltmarkt-momentaufnahme-original.csv'); }
    catch (error) { alert(error.message); } finally { button.disabled = false; }
}
async function exportComparisonCsv() {
    if (!state.comparisonResult) return;
    const left=state.displayMetric, right=state.comparisonMetric, result=state.comparisonResult;
    const { buildComparisonCsv, downloadCsv } = await import('./csv.js?v=20261114-compare-2');
    downloadCsv(buildComparisonCsv(left, right, result), `weltmarkt-vergleich-${left.id}-${right.id}.csv`);
}
