import {
    CATEGORY_LABELS,
    categoryForSection,
    formatUnit,
    sectionLabel,
} from './formatters.js?v=20260912-3';

function csvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
}

function csvDocument(rows) {
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function exportTimestamp(generatedAt = new Date()) {
    const date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function ageInDays(observationDate, generatedAt) {
    if (!observationDate) return '';
    const observation = new Date(`${observationDate}T00:00:00Z`);
    const generated = new Date(generatedAt);
    if (Number.isNaN(observation.getTime()) || Number.isNaN(generated.getTime())) return '';
    return Math.max(0, Math.floor((generated.getTime() - observation.getTime()) / 86_400_000));
}

export function buildSeriesCsv(metric, points, generatedAt = new Date()) {
    const exportedAt = exportTimestamp(generatedAt);
    const category = CATEGORY_LABELS[categoryForSection(metric.section)] ?? categoryForSection(metric.section);
    return csvDocument([
        ['Date', 'Value', 'Metric_ID', 'Metric', 'Category', 'Section', 'Unit', 'Frequency', 'Quality', 'Revision', 'Exported_at_UTC'],
        ...points.map((point) => [
            point.date,
            point.value,
            metric.id,
            metric.name,
            category,
            sectionLabel(metric.section),
            formatUnit(metric.unit),
            metric.frequency,
            point.quality,
            point.revision,
            exportedAt,
        ]),
    ]);
}

export function buildSnapshotCsv(metrics, generatedAt = new Date()) {
    const exportedAt = exportTimestamp(generatedAt);
    return csvDocument([
        ['Metric_ID', 'Metric', 'Category', 'Section', 'Value', 'Unit', 'Observation_date', 'Age_in_days', 'Frequency', 'Quality', 'Source', 'Exported_at_UTC'],
        ...metrics.map((metric) => {
            const categoryKey = categoryForSection(metric.section);
            return [
                metric.id,
                metric.name,
                CATEGORY_LABELS[categoryKey] ?? categoryKey,
                sectionLabel(metric.section),
                metric.latest?.value ?? '',
                formatUnit(metric.unit),
                metric.latest?.date ?? '',
                ageInDays(metric.latest?.date, exportedAt),
                metric.frequency,
                metric.latest?.quality ?? '',
                metric.source?.name ?? '',
                exportedAt,
            ];
        }),
    ]);
}

export function downloadCsv(csv, filename) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
