const categoryName = new Map();
let catalog;
let selectedId = 'price_usd';
let activeCategory = 'all';
let activeRange = 'max';
let seriesRequest;
let bitcoinChart;
const storedMetrics = new Map();
const seriesPalette = [
  '#f7931a', '#38bdf8', '#c4b5fd', '#f6a94a', '#f472b6', '#4ade80',
  '#fb7185', '#22d3ee', '#e879f9', '#a3e635', '#facc15', '#60a5fa',
  '#2dd4bf', '#c084fc', '#fb923c', '#fda4af', '#93c5fd', '#86efac',
  '#fde047', '#e11d48', '#7dd3fc', '#d8b4fe', '#a78bfa',
];

const $ = (selector) => document.querySelector(selector);

function formatValue(raw) {
  if (raw === null || raw === undefined || raw === '') return 'Keine Daten';
  const value = Number(raw);
  if (!Number.isFinite(value)) return 'Keine Daten';
  const magnitude = Math.abs(value);
  const digits = magnitude >= 1_000_000 ? 0 : magnitude >= 100 ? 2 : magnitude >= 1 ? 4 : 12;
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(value);
}

function formatCardValue(raw) {
  if (raw === null || raw === undefined || raw === '') return 'Keine Daten';
  const value = Number(raw);
  if (!Number.isFinite(value)) return 'Keine Daten';
  return Math.abs(value) >= 1_000_000
    ? new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
    : formatValue(value);
}

function formatAxisValue(raw, unit) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return '';
  const number = Math.abs(value) >= 1_000_000
    ? new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
    : formatValue(value);
  return unit ? `${number} ${unit}` : number;
}

function formatDate(isoDate) {
  if (!isoDate) return 'Offen';
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function metricChange(metric, stored) {
  const latest = stored?.latestValue;
  const previous = stored?.previousValue;
  if (latest === null || latest === undefined || latest === '' || previous === null || previous === undefined || previous === '') {
    return { text: 'Kein Vergleich', direction: 'neutral', label: 'Kein vorheriger Datenpunkt vorhanden' };
  }

  const currentValue = Number(latest);
  const previousValue = Number(previous);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
    return { text: 'Kein Vergleich', direction: 'neutral', label: 'Änderung kann nicht berechnet werden' };
  }

  const delta = currentValue - previousValue;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '•';
  const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCardValue(Math.abs(value))}`;
  const unit = String(metric.unit || '').trim();
  let changeText;

  if (/^%$|percent/i.test(unit)) {
    changeText = `${signed(delta)} Pp.`;
  } else if (previousValue !== 0 && Math.sign(previousValue) === Math.sign(currentValue)) {
    const relative = (delta / Math.abs(previousValue)) * 100;
    changeText = `${relative > 0 ? '+' : relative < 0 ? '−' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Math.abs(relative))} %`;
  } else {
    changeText = `${signed(delta)}${unit ? ` ${unit}` : ''}`;
  }

  const comparedWith = stored.previousDate ? ` gegenüber ${formatDate(stored.previousDate)}` : ' gegenüber dem vorherigen Datenpunkt';
  return {
    text: `${arrow} ${changeText}`,
    direction,
    label: `${changeText}${comparedWith}`,
  };
}

function showEmptyChart(title, description) {
  bitcoinChart?.destroy();
  bitcoinChart = undefined;
  $('#chart-area').classList.remove('is-pool-snapshot');
  $('#chart-area').classList.add('is-empty');
  $('#chart-details').replaceChildren();
  $('#chart-details').hidden = true;
  $('#chart-canvas').hidden = true;
  $('#chart-empty').hidden = false;
  $('#chart-empty-title').textContent = title;
  $('#chart-empty-description').textContent = description;
  $('#chart-area').setAttribute('aria-label', `${title}. ${description}`);
  $('#stat-latest-label').textContent = 'Letzter Wert';
  $('#stat-latest').textContent = 'Keine Daten';
  $('#stat-latest-date').textContent = 'Stand: noch nicht importiert';
  $('#stat-change-label').textContent = 'Änderung im Zeitraum';
  $('#stat-change').textContent = 'Keine Daten';
  $('#stat-change-note').textContent = 'Erster bis letzter gespeicherter Wert';
  $('#stat-coverage').textContent = 'Offen';
  $('#stat-coverage-note').textContent = 'Je Kennzahl separat geprüft';
}

function updateRangeButtons(enabled) {
  document.querySelectorAll('.range-controls button').forEach((button) => {
    button.disabled = !enabled;
    button.classList.toggle('is-active', button.dataset.range === activeRange);
  });
}

function setSource(name, sourceUrl, attribution, sourceSlug) {
  $('#chart-source').textContent = name;
  const sourceLink = $('#chart-source-link');
  let safeUrl;
  try {
    safeUrl = new URL(sourceUrl);
  } catch (_) {
    safeUrl = null;
  }
  sourceLink.hidden = safeUrl?.protocol !== 'https:';
  if (!sourceLink.hidden) sourceLink.href = safeUrl.href;
  $('#chart-attribution').textContent = attribution || '';
  $('#chart-license-link').hidden = sourceSlug !== 'coinmetrics_community_btc';
}

function selectMetric(metricId, scrollToChart = false) {
  const metric = catalog.metrics.find((item) => item.id === metricId);
  if (!metric) return;

  selectedId = metric.id;
  $('#chart-category').textContent = categoryName.get(metric.category) || metric.category;
  $('#chart-title').textContent = metric.label;
  $('#chart-description').textContent = metric.description;
  const stored = storedMetrics.get(metric.id);
  setSource(stored?.sourceName || `${metric.sourceHint} (Kandidat)`, stored?.sourceUrl, stored?.attribution, stored?.sourceSlug);
  $('#chart-frequency').textContent = metric.frequency === 'weekly'
    ? 'Wöchentlich'
    : metric.frequency === 'monthly'
      ? 'Monatlich'
      : metric.frequency === 'event'
        ? 'Je Ereignis'
        : 'Täglich';
  $('#chart-method').textContent = stored?.methodology || 'Definition und Abdeckung vor Import prüfen';
  document.querySelectorAll('[data-metric-id]').forEach((card) => {
    const isSelected = card.dataset.metricId === metric.id;
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-pressed', String(isSelected));
  });

  const url = new URL(window.location.href);
  url.searchParams.set('metric', metric.id);
  window.history.replaceState(null, '', url);
  loadSeries(metric);
  if (scrollToChart) $('#trend').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadSeries(metric) {
  if (seriesRequest) seriesRequest.abort();
  const stored = storedMetrics.get(metric.id);
  if (storedMetrics.size === 0) {
    updateRangeButtons(false);
    showEmptyChart('Datenbank wird verbunden', 'Gespeicherte Bitcoin-Werte werden abgefragt.');
    return;
  }
  if (!stored || (!(Number(stored.observationCount) > 0) && !stored.latestDate)) {
    updateRangeButtons(false);
    showEmptyChart('Noch keine Daten', 'Für diese Kennzahl sind noch keine Beobachtungen gespeichert.');
    return;
  }

  updateRangeButtons(metric.id !== 'mining_pool_share' && Number(stored.observationCount) > 1);
  showEmptyChart('Zeitreihe wird geladen', 'Gespeicherte Beobachtungen werden abgerufen.');
  const controller = new AbortController();
  seriesRequest = controller;
  const url = new URL('api/bitcoin/series.php', window.location.href);
  url.searchParams.set('metric', metric.id);
  if (activeRange !== 'max') {
    const end = new Date(`${stored.coverageEnd || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - Number(activeRange));
    url.searchParams.set('start', start.toISOString().slice(0, 10));
    url.searchParams.set('end', end.toISOString().slice(0, 10));
  }

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.points)) throw new Error('Ungültige Antwort');
    if (selectedId === metric.id) renderChart(metric, stored, data);
  } catch (error) {
    if (error.name !== 'AbortError' && selectedId === metric.id) {
      console.error('Bitcoin series:', error);
      showEmptyChart('Zeitreihe nicht verfügbar', 'Die gespeicherten Werte konnten gerade nicht geladen werden.');
    }
  }
}

function renderChart(metric, stored, data) {
  const points = data.points
    .filter((point) => point.value !== null && point.value !== '' && point.date && Number.isFinite(Number(point.value)))
    .map((point) => ({ ...point, series: point.series || 'main', value: Number(point.value) }))
    .filter((point) => Number.isFinite(Date.parse(`${point.date}T00:00:00Z`)))
    .sort((left, right) => left.date.localeCompare(right.date) || left.series.localeCompare(right.series));
  if (!points.length) {
    showEmptyChart('Keine Werte im Zeitraum', 'Wähle einen längeren Zeitraum oder eine andere Kennzahl.');
    return;
  }

  const accent = metric.id === 'price_usd' || metric.id === 'price_eur'
    ? '#f7931a'
    : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6ee7b7';
  const dates = [...new Set(points.map((point) => point.date))].sort();
  const isPoolShare = metric.id === 'mining_pool_share';
  const isPoolHashrateShare = metric.id === 'mining_pool_hashrate_share_pct';
  const isAgeWave = metric.id === 'realized_cap_hodl_waves';
  const poolSnapshotDate = isPoolShare ? dates.at(-1) : null;
  const poolSnapshotPoints = isPoolShare
    ? points.filter((point) => point.date === poolSnapshotDate).sort((left, right) => right.value - left.value)
    : [];
  const seriesMetadata = new Map((data.series || []).map((series) => [series.series_key, series]));
  const seriesLabelFallbacks = new Map([
    ['openbitcoin_rolling_24h', 'OpenBitcoin rollierende 24 Stunden'],
  ]);
  const seriesLabel = (seriesKey) => {
    const displayName = seriesMetadata.get(seriesKey)?.display_name;
    return (displayName && displayName !== seriesKey)
      ? displayName
      : (seriesLabelFallbacks.get(seriesKey) || seriesKey);
  };
  const seriesKeys = [...new Set(points.map((point) => point.series))].sort((left, right) => {
    if (left === 'main') return -1;
    if (right === 'main') return 1;
    return (seriesMetadata.get(left)?.display_order || 0) - (seriesMetadata.get(right)?.display_order || 0);
  });
  let labels = dates;
  let datasets;
  if (isPoolShare) {
    const topPools = poolSnapshotPoints.slice(0, 12).map((point) => ({
      label: seriesLabel(point.series),
      value: point.value,
      sourcePoint: point,
    }));
    const remainingPools = poolSnapshotPoints.slice(12);
    if (remainingPools.length) {
      topPools.push({
        label: `Übrige Pools (${remainingPools.length})`,
        value: remainingPools.reduce((sum, point) => sum + point.value, 0),
        sourcePoint: remainingPools[0],
      });
    }
    labels = topPools.map((pool) => pool.label);
    datasets = [{
      label: 'Anteil an zugeordneten Blöcken',
      data: topPools.map((pool) => pool.value),
      sourcePoints: topPools.map((pool) => pool.sourcePoint),
      borderColor: accent,
      backgroundColor: `${accent}a8`,
      borderWidth: 1,
      borderRadius: 3,
      maxBarThickness: 22,
    }];
    renderPoolShareDetails(poolSnapshotPoints, seriesMetadata, poolSnapshotDate);
  } else {
    $('#chart-details').replaceChildren();
    $('#chart-details').hidden = true;
    datasets = seriesKeys.map((seriesKey, index) => {
      const seriesPoints = points.filter((point) => point.series === seriesKey);
      const pointsByDate = new Map(seriesPoints.map((point) => [point.date, point]));
      const seriesName = seriesKey === 'main'
        ? metric.label
        : seriesLabel(seriesKey);
      const color = seriesKeys.length === 1 ? accent : seriesPalette[index % seriesPalette.length];
      return {
        label: seriesName,
        data: dates.map((date) => pointsByDate.get(date)?.value ?? null),
        sourcePoints: dates.map((date) => pointsByDate.get(date) || null),
        borderColor: color,
        backgroundColor: `${color}18`,
        borderWidth: 2.2,
        pointRadius: seriesPoints.length < 60 ? 2 : 0,
        pointHoverRadius: 4,
        pointHitRadius: 10,
        pointHoverBackgroundColor: '#101017',
        pointHoverBorderColor: color,
        tension: 0.08,
        spanGaps: false,
        fill: isAgeWave || seriesKeys.length === 1,
      };
    });
  }
  const yValues = isPoolShare ? [] : datasets.flatMap((dataset) => dataset.data).filter(Number.isFinite);
  const allValuesAreNonNegative = yValues.length > 0 && yValues.every((value) => value >= 0);
  const chartCanvas = $('#chart-canvas');
  if (!window.Chart) {
    showEmptyChart('Diagramm nicht verfügbar', 'Die lokale Chart-Bibliothek konnte nicht geladen werden.');
    return;
  }
  bitcoinChart?.destroy();
  chartCanvas.hidden = false;
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 140 },
    normalized: true,
    interaction: isPoolShare
      ? { mode: 'nearest', intersect: true }
      : isAgeWave
        ? { mode: 'nearest', intersect: false }
        : { mode: 'index', intersect: false, axis: 'x' },
    plugins: {
      legend: {
        display: !isPoolShare && datasets.length > 1,
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 18, color: '#8f91a3' },
      },
      tooltip: {
        enabled: true,
        mode: isPoolShare || isAgeWave ? 'nearest' : 'index',
        intersect: isPoolShare,
        backgroundColor: 'rgba(12,12,15,.96)',
        titleColor: '#f8fafc',
        bodyColor: '#d4d4df',
        borderColor: '#343446',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            return isPoolShare ? `Stand ${formatDate(poolSnapshotDate)}` : formatDate(dates[items[0].dataIndex]);
          },
          label: (context) => {
            const value = isPoolShare ? context.parsed.x : context.parsed.y;
            const name = isPoolShare ? context.label : context.dataset.label;
            return `${name}: ${formatAxisValue(value, metric.unit)}`;
          },
          afterLabel: (context) => {
            if (isPoolHashrateShare) return '';
            const point = context.dataset.sourcePoints?.[context.dataIndex];
            if (!point) return '';
            const source = point.sourceName ? `Quelle: ${point.sourceName}` : '';
            if (isAgeWave) return source ? [source] : '';
            const timestamp = point.sourceTimestamp ? `Erfasst: ${point.sourceTimestamp}` : '';
            return [source, timestamp].filter(Boolean);
          },
          footer: (items) => {
            if (!isPoolHashrateShare || !items.length) return '';
            const point = items.map((item) => item.dataset.sourcePoints?.[item.dataIndex]).find(Boolean);
            return point?.sourceName ? `Quelle: ${point.sourceName}` : '';
          },
        },
      },
    },
  };
  if (isPoolShare) {
    chartOptions.indexAxis = 'y';
    chartOptions.scales = {
      x: {
        beginAtZero: true,
        grace: '8%',
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        border: { display: true, color: 'rgba(148, 163, 184, .35)' },
        ticks: { color: '#aeb2c1', maxTicksLimit: 7, padding: 8, callback: (value) => formatAxisValue(value, metric.unit) },
      },
      y: {
        grid: { display: false },
        border: { color: '#2b2b39' },
        ticks: { color: '#aeb2c1', autoSkip: false, font: { size: 10 } },
      },
    };
  } else {
    chartOptions.scales = {
      x: {
        grid: { display: false },
        border: { color: '#2b2b39' },
        ticks: {
          color: '#8f91a3',
          maxTicksLimit: 8,
          maxRotation: 0,
          callback(value) {
            const date = this.getLabelForValue(value);
            const timestamp = Date.parse(`${date}T00:00:00Z`);
            if (!Number.isFinite(timestamp)) return '';
            const spanDays = (Date.parse(`${dates.at(-1)}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`)) / 86_400_000;
            if (spanDays <= 45) {
              return new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(new Date(timestamp));
            }
            const years = spanDays / 365.25;
            return years < 2
              ? new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', month: 'short', year: '2-digit' }).format(new Date(timestamp))
              : new Date(timestamp).getUTCFullYear().toString();
          },
        },
      },
      y: {
        stacked: isAgeWave,
        min: allValuesAreNonNegative ? 0 : undefined,
        grace: '8%',
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        border: { display: true, color: 'rgba(148, 163, 184, .35)' },
        ticks: {
          color: '#aeb2c1',
          maxTicksLimit: 7,
          padding: 8,
          callback: (value) => formatAxisValue(value, metric.unit),
        },
      },
    };
  }
  bitcoinChart = new window.Chart(chartCanvas.getContext('2d'), {
    type: isPoolShare ? 'bar' : 'line',
    data: { labels, datasets },
    options: chartOptions,
  });
  $('#chart-empty').hidden = true;
  $('#chart-area').classList.remove('is-empty');
  $('#chart-area').classList.toggle('is-pool-snapshot', isPoolShare);
  $('#chart-area').setAttribute('aria-label', isPoolShare
    ? `${metric.label}: Balkendiagramm der zwölf größten Pools und der übrigen Pools am ${formatDate(poolSnapshotDate)}. Eine Tabelle enthält alle ${poolSnapshotPoints.length} Poolwerte.`
    : `${metric.label}: ${points.length} gespeicherte Beobachtungen vom ${formatDate(points[0].date)} bis ${formatDate(points.at(-1).date)}. Der Mauszeiger zeigt Datum, Wert und Quelle.`);
  chartCanvas.setAttribute('aria-label', isPoolShare
    ? `${metric.label}: horizontales Balkendiagramm mit Werteachse in Prozent und interaktiven Werten.`
    : `${metric.label}: Diagramm mit sichtbarer Werteachse. Beim Darüberfahren erscheinen Datum, Messwert und Quelle.`);

  const primaryPoints = points.filter((point) => point.series === 'main');
  const latestPoolHashratePoint = isPoolHashrateShare
    ? points.filter((point) => point.date === dates.at(-1)).sort((left, right) => right.value - left.value)[0]
    : null;
  const statPoints = primaryPoints.length
    ? primaryPoints
    : isPoolHashrateShare && latestPoolHashratePoint
      ? points.filter((point) => point.series === latestPoolHashratePoint.series)
        .sort((left, right) => left.date.localeCompare(right.date))
      : ['hodl_waves', 'realized_cap_hodl_waves'].includes(metric.id)
      ? [...points.reduce((byDate, point) => {
        const current = byDate.get(point.date) || { ...point, value: 0 };
        current.value += point.value;
        byDate.set(point.date, current);
        return byDate;
      }, new Map()).values()].sort((left, right) => left.date.localeCompare(right.date))
      : points;
  const first = statPoints[0];
  const last = statPoints.at(-1);
  if (isPoolShare) {
    const totalShare = poolSnapshotPoints.reduce((sum, point) => sum + point.value, 0);
    $('#stat-latest-label').textContent = 'Pools im Snapshot';
    $('#stat-latest').textContent = formatValue(poolSnapshotPoints.length);
    $('#stat-latest-date').textContent = `Stand: ${formatDate(poolSnapshotDate)}`;
    $('#stat-change-label').textContent = 'Summe der Anteile';
    $('#stat-change').textContent = `${formatValue(totalShare)} %`;
    $('#stat-change-note').textContent = 'Anteil an identifizierten Pool-Blöcken';
  } else if (isPoolHashrateShare && latestPoolHashratePoint) {
    const poolName = seriesMetadata.get(last.series)?.display_name || last.series;
    $('#stat-latest-label').textContent = 'Größter Pool am letzten Datenpunkt';
    $('#stat-latest').textContent = `${poolName}: ${formatValue(last.value)} %`;
    $('#stat-latest-date').textContent = `Stand: ${formatDate(last.date)}`;
    $('#stat-change-label').textContent = `Anteil von ${poolName}`;
    $('#stat-change').textContent = statPoints.length < 2
      ? 'Nicht berechenbar'
      : `${formatValue(last.value - first.value)} Prozentpunkte`;
    $('#stat-change-note').textContent = `Seit ${formatDate(first.date)}; gleiche Poolreihe`;
  } else {
    $('#stat-latest-label').textContent = 'Letzter Wert';
    $('#stat-latest').textContent = `${formatValue(last.value)} ${metric.unit}`;
    $('#stat-latest-date').textContent = `Stand: ${formatDate(last.date)}`;
    $('#stat-change-label').textContent = 'Änderung im Zeitraum';
    $('#stat-change-note').textContent = 'Erster bis letzter gespeicherter Wert';
    if (statPoints.length < 2) {
      $('#stat-change').textContent = 'Nicht berechenbar';
    } else if (metric.unit.startsWith('%')) {
      $('#stat-change').textContent = `${formatValue(last.value - first.value)} Prozentpunkte`;
    } else if (first.value <= 0) {
      $('#stat-change').textContent = `${formatValue(last.value - first.value)} ${metric.unit}`;
    } else {
      $('#stat-change').textContent = `${formatValue(((last.value / first.value) - 1) * 100)} %`;
    }
  }
  $('#stat-coverage').textContent = `${formatDate(stored.coverageStart || points[0].date)} bis ${formatDate(stored.coverageEnd || last.date)}`;
  $('#stat-coverage-note').textContent = `${stored.observationCount} gespeicherte Beobachtungen`;
  setSource(last.sourceName || stored.sourceName || `${metric.sourceHint} (Kandidat)`, last.sourceUrl || stored.sourceUrl, last.attribution || stored.attribution, last.sourceSlug || stored.sourceSlug);
  const comparisonNames = isPoolShare || isPoolHashrateShare ? [] : seriesKeys.filter((seriesKey) => seriesKey !== 'main')
    .map(seriesLabel);
  const methodText = stored.methodology?.replace(/^openbitcoin_rolling_24h\s*\|\s*/, '') || null;
  $('#chart-method').textContent = [...comparisonNames, methodText].filter(Boolean).join(' | ') || 'Methodik noch nicht hinterlegt';
}

function renderPoolShareDetails(points, seriesMetadata, snapshotDate) {
  const container = $('#chart-details');
  container.replaceChildren();
  const disclosure = document.createElement('details');
  disclosure.className = 'chart-details__disclosure';
  const summary = document.createElement('summary');
  summary.textContent = `Alle ${points.length} Pool-Anteile vom ${formatDate(snapshotDate)} anzeigen`;
  const note = document.createElement('p');
  note.className = 'chart-details__note';
  note.textContent = 'Das Diagramm hebt die zwölf größten Pools hervor. Diese Tabelle zeigt alle identifizierten Pools; nicht zugeordnete Blöcke sind ausgeschlossen.';
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-details__table-wrap';
  const table = document.createElement('table');
  table.className = 'chart-details__table';
  const caption = document.createElement('caption');
  caption.textContent = 'Anteile der identifizierten Blöcke im rollierenden 7-Tage-Fenster.';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Mining-Pool', 'Anteil']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement('tbody');
  for (const point of points) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = seriesMetadata.get(point.series)?.display_name || point.series;
    const value = document.createElement('td');
    value.textContent = `${formatValue(point.value)} %`;
    row.append(name, value);
    body.append(row);
  }
  table.append(caption, head, body);
  wrapper.append(table);
  disclosure.append(summary, note, wrapper);
  container.append(disclosure);
  container.hidden = false;
}

function makeCard(metric, overview = false) {
  const stored = storedMetrics.get(metric.id);
  const observationCount = Number(stored?.observationCount || 0);
  const hasObservations = Number.isFinite(observationCount) && observationCount > 0;
  const hasLatest = stored?.latestValue !== null && stored?.latestValue !== undefined && stored?.latestValue !== '';
  const change = metricChange(metric, stored);
  const dateLabel = stored?.latestDate
    ? `Stand ${formatDate(stored.latestDate)}`
    : hasObservations && stored?.coverageEnd
      ? `Bis ${formatDate(stored.coverageEnd)}`
      : hasObservations
        ? `${formatCardValue(observationCount)} gespeicherte Beobachtungen`
        : 'Noch keine Daten';
  const observationsLabel = metric.id === 'mining_pool_share'
    ? `${formatCardValue(observationCount)} Pools`
    : `${formatCardValue(observationCount)} Werte`;
  const card = document.createElement('button');
  card.type = 'button';
  card.dataset.metricId = metric.id;
  card.className = overview ? 'metric-card' : 'catalog-card';
  if (metric.id === 'price_usd' || metric.id === 'price_eur') card.classList.add('is-bitcoin-price');
  card.setAttribute('aria-pressed', String(metric.id === selectedId));
  card.setAttribute('aria-label', `${metric.label} auswählen. ${hasLatest ? `Letzter Wert ${formatValue(stored.latestValue)} ${metric.unit}, ${dateLabel}. ${change.label}.` : hasObservations ? `${observationsLabel}, ${dateLabel}. ${change.label}.` : 'Noch keine Daten.'}`);

  if (overview) {
    const top = document.createElement('span');
    top.className = 'metric-card__top';
    const name = document.createElement('span');
    name.textContent = metric.label;
    top.append(name);
    const value = document.createElement('strong');
    value.className = 'metric-card__value';
    value.textContent = hasLatest ? formatCardValue(stored.latestValue) : hasObservations ? observationsLabel : 'Keine Daten';
    const trend = document.createElement('span');
    trend.className = `point-change point-change--${change.direction}`;
    trend.textContent = change.text;
    trend.setAttribute('aria-label', change.label);
    const foot = document.createElement('span');
    foot.className = 'metric-card__foot';
    const unit = document.createElement('span');
    unit.textContent = metric.unit;
    const date = document.createElement('span');
    date.textContent = dateLabel;
    foot.append(unit, date);
    card.append(top, value, trend, foot);
  } else {
    const name = document.createElement('strong');
    name.textContent = metric.label;
    const description = document.createElement('small');
    description.textContent = metric.description;
    const meta = document.createElement('span');
    meta.className = 'catalog-card__meta';
    const unit = document.createElement('span');
    unit.textContent = metric.unit;
    const latest = document.createElement('span');
    latest.className = 'catalog-card__latest';
    latest.textContent = hasLatest ? formatCardValue(stored.latestValue) : hasObservations ? observationsLabel : 'Noch keine Daten';
    const trend = document.createElement('span');
    trend.className = `point-change point-change--${change.direction}`;
    trend.textContent = change.text;
    trend.setAttribute('aria-label', change.label);
    const date = document.createElement('span');
    date.textContent = dateLabel;
    meta.append(unit, latest, trend, date);
    card.append(name, description, meta);
  }
  if (metric.id === 'fear_greed_index' && hasLatest && stored?.sourceSlug === 'alternative_me_fng') {
    const attribution = document.createElement('small');
    attribution.textContent = 'Quelle: Alternative.me';
    card.append(attribution);
  }
  card.addEventListener('click', () => selectMetric(metric.id, !overview));
  return card;
}

function renderOverview() {
  const overview = $('#overview-grid');
  overview.replaceChildren();
  catalog.overviewIds.forEach((id) => {
    const metric = catalog.metrics.find((item) => item.id === id);
    if (metric) overview.append(makeCard(metric, true));
  });
}

function renderFilters() {
  const filters = $('#category-filters');
  const options = [{ id: 'all', label: 'Alle' }, { id: 'core', label: 'Kernliste 100' }, ...catalog.categories];
  options.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category.label;
    button.dataset.category = category.id;
    button.classList.toggle('is-active', category.id === activeCategory);
    button.setAttribute('aria-pressed', String(category.id === activeCategory));
    button.addEventListener('click', () => {
      activeCategory = category.id;
      filters.querySelectorAll('button').forEach((item) => {
        const active = item.dataset.category === activeCategory;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      renderCatalog();
    });
    filters.append(button);
  });
}

function renderCatalog() {
  const search = $('#metric-search').value.trim().toLocaleLowerCase('de');
  const groups = $('#catalog-groups');
  const coreMetricIds = new Set(catalog.coreMetricIds || []);
  groups.replaceChildren();
  let visibleCount = 0;

  catalog.categories.forEach((category) => {
    if (activeCategory !== 'all' && activeCategory !== 'core' && activeCategory !== category.id) return;
    const metrics = catalog.metrics.filter((metric) => metric.category === category.id &&
      (activeCategory !== 'core' || coreMetricIds.has(metric.id)) &&
      `${metric.label} ${metric.description} ${metric.unit}`.toLocaleLowerCase('de').includes(search));
    if (metrics.length === 0) return;
    visibleCount += metrics.length;

    const group = document.createElement('details');
    group.className = 'catalog-group';
    group.setAttribute('aria-label', category.label);
    const selectedMetric = catalog.metrics.find((metric) => metric.id === selectedId);
    group.open = search.length > 0 || category.id === selectedMetric?.category || category.id === activeCategory;
    const heading = document.createElement('summary');
    heading.className = 'catalog-group__heading';
    const title = document.createElement('h3');
    title.textContent = category.label;
    const count = document.createElement('span');
    count.textContent = `${metrics.length} Kennzahlen`;
    heading.append(title, count);
    const grid = document.createElement('div');
    grid.className = 'catalog-grid';
    metrics.forEach((metric) => grid.append(makeCard(metric, 0)));
    group.append(heading, grid);
    groups.append(group);
  });
  $('#empty-results').hidden = visibleCount !== 0;
}

function bindMobileMenu() {
  const toggle = $('.nav-toggle');
  const menu = $('#mobile-menu');
  if (!toggle || !menu) return;
  const setOpen = (open) => {
    toggle.classList.toggle('open', open);
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
}

async function init() {
  bindMobileMenu();
  try {
    const response = await fetch('data/catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    catalog = await response.json();
    catalog.categories.forEach((category) => categoryName.set(category.id, category.label));
    const requestedId = new URL(window.location.href).searchParams.get('metric');
    if (catalog.metrics.some((metric) => metric.id === requestedId)) selectedId = requestedId;
    $('#catalog-count').textContent = `${catalog.metrics.length} Kennzahlen`;
    renderOverview();
    renderFilters();
    renderCatalog();
    $('#metric-search').addEventListener('input', renderCatalog);
    document.querySelectorAll('.range-controls button').forEach((button) => button.addEventListener('click', () => {
      activeRange = button.dataset.range;
      updateRangeButtons(true);
      const selected = catalog.metrics.find((metric) => metric.id === selectedId);
      if (selected) loadSeries(selected);
    }));
    selectMetric(selectedId);
    loadStoredMetrics();
  } catch (error) {
    $('#catalog-count').textContent = 'Katalog nicht geladen';
    $('#catalog-groups').textContent = 'Der Kennzahlenkatalog konnte nicht geladen werden. Bitte die Seite über einen Webserver öffnen.';
    console.error('Bitcoin catalog:', error);
  }
}

async function loadStoredMetrics() {
  try {
    const response = await fetch('api/bitcoin/metrics.php', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.metrics)) throw new Error('Ungültige Antwort');
    data.metrics.forEach((metric) => storedMetrics.set(metric.id, metric));
    const available = data.metrics.filter((metric) => metric.observationCount > 0).length;
    $('#data-status').textContent = available ? `${available} ${available === 1 ? 'Kennzahl' : 'Kennzahlen'} mit Daten` : 'Noch keine Messwerte';
    $('#data-status-detail').textContent = available ? 'Verläufe stammen aus gespeicherten Beobachtungen.' : 'Der Datenimport wird vorbereitet.';
    $('#catalog-note').textContent = available
      ? `${available} von ${catalog.metrics.length} Kennzahlen ${available === 1 ? 'hat' : 'haben'} gespeicherte Beobachtungen. Historische Abdeckung und Quelle unterscheiden sich je Reihe.`
      : 'Noch keine Beobachtungen importiert. Abdeckung und Quellenhinweise werden je Kennzahl angezeigt.';
    renderOverview();
    renderCatalog();
    selectMetric(selectedId);
  } catch (error) {
    console.error('Bitcoin metrics:', error);
    $('#data-status').textContent = 'Daten noch nicht verfügbar';
    $('#data-status-detail').textContent = 'Die gespeicherten Messwerte konnten nicht aus der Datenbank geladen werden.';
    $('#catalog-note').textContent = 'Die Oberfläche ist geladen; die Datenbankantwort fehlt noch.';
    showEmptyChart('Datenbank nicht erreichbar', 'Die Messwerte konnten nicht abgerufen werden. Bitte später erneut laden.');
  }
}

init();
