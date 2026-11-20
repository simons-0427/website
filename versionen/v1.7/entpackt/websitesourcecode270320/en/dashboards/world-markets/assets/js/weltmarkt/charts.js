import { categoryForSection, formatMonth, formatValue, formatUnit } from './formatters.js?v=20261114-compare-2';
import { comparisonAxes, supportsLogScale } from './comparison.js?v=20261114-scale-1';

const COLORS = {
    macro: { line: '#6ee7b7', fill: 'rgba(110, 231, 183, 0.13)' },
    monetary: { line: '#818cf8', fill: 'rgba(129, 140, 248, 0.13)' },
    markets: { line: '#f6a94a', fill: 'rgba(246, 169, 74, 0.13)' },
};

const LOCALE = globalThis.document?.documentElement?.lang?.startsWith('en') ? 'en-GB' : 'de-DE';
const dateLabel = value => new Intl.DateTimeFormat(LOCALE, {day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value));
function horizontalAxis(type = 'category', range = null) {
    return {type,grid:{display:false},border:{color:'#2b2b39'},bounds:'data',
        ...(range ? {min:Date.parse(range.start),max:Math.max(Date.parse(range.end),Date.parse(range.start)+86400000)} : {}),
        ticks:{color:'#8f91a3',maxTicksLimit:7,maxRotation:0,callback:type==='linear'?value=>formatMonth(new Date(value).toISOString().slice(0,10)):function(value){return formatMonth(this.getLabelForValue(value));}}};
}
function comparisonAxis(metric, axis, right, scale) {
    const color=right?'#f6a94a':'#6ee7b7';
    return {type:scale,position:right?'right':'left',display:true,min:axis.min,max:axis.max,bounds:'data',beginAtZero:false,grace:0,
        grid:{color:'rgba(255,255,255,.065)',drawOnChartArea:!right},border:{color},
        title:{display:Boolean(metric.unit),text:formatUnit(metric.unit),color,font:{size:10}},
        ticks:{color,count:6,maxTicksLimit:6,callback:value=>formatValue(value,'')}};
}

export class WeltmarktChart {
    constructor(canvas) {
        if (!window.Chart) {
            throw new Error('Chart.js wurde nicht geladen.');
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

    render(metric, points, scale = 'linear') {
        scale = scale === 'logarithmic' && supportsLogScale(points) ? 'logarithmic' : 'linear';
        this.chart.options.plugins.legend.display = false;
        this.chart.options.interaction={mode:'index',intersect:false};
        this.chart.options.scales={x:horizontalAxis(),y:{type:scale,grace:'6%',grid:{color:'rgba(255,255,255,.06)'},border:{display:false},ticks:{color:'#8f91a3',maxTicksLimit:7}}};
        this.chart.canvas.dataset.scale = scale;
        delete this.chart.canvas.dataset.comparison;
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
            fill: scale !== 'logarithmic',
            tension: 0.08,
            spanGaps: false,
        }];
        this.chart.options.plugins.tooltip.callbacks = {
            title: (items) => items[0] ? new Intl.DateTimeFormat(LOCALE, {
                day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
            }).format(new Date(`${items[0].label}T00:00:00Z`)) : '',
            label: (context) => `${metric.name}: ${formatValue(context.parsed.y, metric.unit)}`,
        };
        this.chart.options.scales.y.ticks.callback = (value) => formatValue(value, metric.unit);
        this.chart.update();
    }

    renderComparison(left, right, result, scale = 'linear') {
        scale = scale === 'logarithmic' && supportsLogScale(result.leftPoints, result.rightPoints) ? 'logarithmic' : 'linear';
        const axes = comparisonAxes(result, scale);
        const colors=['#6ee7b7','#f6a94a'];
        const histories=[result.leftPoints,result.rightPoints];
        this.chart.options.scales={x:horizontalAxis('linear',result),y:comparisonAxis(left,axes.left,false,scale),yRight:comparisonAxis(right,axes.right,true,scale)};
        this.chart.canvas.dataset.scale = scale;
        this.chart.options.interaction={mode:'nearest',axis:'x',intersect:false};
        this.chart.data.labels=[];
        this.chart.data.datasets=[left,right].map((metric,index)=>({label:metric.name,
            data:histories[index].map(point=>({x:Date.parse(point.date),y:point.value})),
            yAxisID:index===0?'y':'yRight',parsing:false,borderColor:colors[index],backgroundColor:colors[index],borderWidth:2,
            borderDash:index===1?[6,3]:[],pointRadius:histories[index].length<60?2:0,pointHoverRadius:4,pointHitRadius:12,fill:false,tension:0,spanGaps:false}));
        this.chart.options.plugins.legend.display=false;
        this.chart.options.plugins.tooltip.callbacks={title:items=>items[0]?dateLabel(items[0].parsed.x):'',
            label:context=>context.dataset.label+': '+formatValue(context.parsed.y,[left,right][context.datasetIndex].unit)};
        this.chart.update();
        if (new URLSearchParams(globalThis.location?.search).get('debugPerf')==='1') {
            this.chart.canvas.dataset.comparison=JSON.stringify({series:this.chart.data.datasets.length,scale,left:axes.left,right:axes.right,
                leftStartPixel:this.chart.scales.y.getPixelForValue(result.left.base),rightStartPixel:this.chart.scales.yRight.getPixelForValue(result.right.base),
                leftTenPercentPixel:this.chart.scales.y.getPixelForValue(result.left.base+result.left.denominator*.1),rightTenPercentPixel:this.chart.scales.yRight.getPixelForValue(result.right.base+result.right.denominator*.1)});
        }
    }

    clear() {
        this.chart.data.labels = [];
        this.chart.data.datasets = [];
        this.chart.update();
    }
}
