import { categoryForSection, formatMonth, formatValue } from './formatters.js?v=20260912-3';

const COLORS = {
    macro: { line: '#6ee7b7', fill: 'rgba(110, 231, 183, 0.13)' },
    monetary: { line: '#818cf8', fill: 'rgba(129, 140, 248, 0.13)' },
    markets: { line: '#f6a94a', fill: 'rgba(246, 169, 74, 0.13)' },
};

export class WeltmarktChart {
    constructor(canvas) {
        if (!window.Chart) {
        throw new Error('Chart.js could not be loaded.');
        }

        this.chart = new window.Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 260 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#101017',
                        borderColor: '#343446',
                        borderWidth: 1,
                        titleColor: '#f8fafc',
                        bodyColor: '#d4d4df',
                        padding: 12,
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#8f91a3',
                            maxTicksLimit: 9,
                            maxRotation: 0,
                            callback: function callback(value) {
                                return formatMonth(this.getLabelForValue(value));
                            },
                        },
                        border: { color: '#2b2b39' },
                    },
                    y: {
                        grace: '6%',
                        grid: { color: 'rgba(255, 255, 255, 0.06)' },
                        border: { display: false },
                        ticks: { color: '#8f91a3', maxTicksLimit: 7 },
                    },
                },
            },
        });
    }

    render(metric, points) {
        const colors = COLORS[categoryForSection(metric.section)];
        this.chart.data.labels = points.map((point) => point.date);
        this.chart.data.datasets = [{
            label: metric.name,
            data: points.map((point) => point.value === null || point.value === '' || !Number.isFinite(Number(point.value)) ? null : Number(point.value)),
            borderColor: colors.line,
            backgroundColor: colors.fill,
            borderWidth: 2,
            pointRadius: points.length < 60 ? 2 : 0,
            pointHoverRadius: 4,
            pointHitRadius: 12,
            fill: true,
            tension: 0.08,
            spanGaps: false,
        }];
        this.chart.options.plugins.tooltip.callbacks = {
            title: (items) => items[0] ? new Intl.DateTimeFormat('de-DE', {
                day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
            }).format(new Date(`${items[0].label}T00:00:00Z`)) : '',
            label: (context) => `${metric.name}: ${formatValue(context.parsed.y, metric.unit)}`,
        };
        this.chart.options.scales.y.ticks.callback = (value) => formatValue(value, metric.unit);
        this.chart.update();
    }

    clear() {
        this.chart.data.labels = [];
        this.chart.data.datasets = [];
        this.chart.update();
    }
}
