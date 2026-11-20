import {
    CATEGORY_LABELS,
    categoryForSection,
    displayMethodology,
    formatUnit,
    sectionLabel,
} from './formatters.js?v=20261114-compare-2';

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

function sourceDetails(metric) {
    return [metric.source?.url ?? '', metric.sourceSeries ?? '', displayMethodology(metric), metric.source?.licenseNote ?? ''];
}

export function buildSeriesCsv(metric, points, generatedAt = new Date()) {
    const exportedAt = exportTimestamp(generatedAt);
    const category = CATEGORY_LABELS[categoryForSection(metric.section)] ?? categoryForSection(metric.section);
    return csvDocument([
        ['Datum', 'Wert', 'Kennzahl-ID', 'Kennzahl', 'Kategorie', 'Bereich', 'Einheit', 'Frequenz', 'Qualität', 'Revision', 'Exportiert_am_UTC', 'Quelle', 'Quell_URL', 'Quellreihe', 'Methodik', 'Quellenhinweis'],
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
            metric.source?.name ?? '',
            ...sourceDetails(metric),
        ]),
    ]);
}

export function buildSnapshotCsv(metrics, generatedAt = new Date()) {
    const exportedAt = exportTimestamp(generatedAt);
    return csvDocument([
        ['Kennzahl-ID', 'Kennzahl', 'Kategorie', 'Bereich', 'Wert', 'Einheit', 'Beobachtungsdatum', 'Alter_in_Tagen', 'Frequenz', 'Qualität', 'Quelle', 'Exportiert_am_UTC', 'Quell_URL', 'Quellreihe', 'Methodik', 'Quellenhinweis'],
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
                ...sourceDetails(metric),
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

export function buildComparisonCsv(left, right, result, generatedAt = new Date()) {
    return csvDocument([
        ['Date',left.id,right.id,'Left_unit','Right_unit','Left_start_date','Right_start_date','Left_start_value','Right_start_value','Left_frequency','Right_frequency','Left_source','Right_source','Exported_at_UTC','Left_source_URL','Left_source_series','Left_methodology','Left_source_terms','Right_source_URL','Right_source_series','Right_methodology','Right_source_terms'],
        ...result.pairs.map(point=>[point.date,point.left,point.right,left.unit,right.unit,result.left.start,result.right.start,result.left.base,result.right.base,left.frequency,right.frequency,left.source?.name||'',right.source?.name||'',exportTimestamp(generatedAt),...sourceDetails(left),...sourceDetails(right)]),
    ]);
}
