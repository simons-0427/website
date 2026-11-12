# English Bitcoin dashboard

English frontend for the existing Bitcoin dashboard. Open `/en/dashboards/bitcoin/`.

The page follows the layout and controls of the German Bitcoin dashboard and the English navigation used by the backtester and World Markets. It shows 49 metrics and one Bitcoin price series. USD is the default display currency; EUR, GBP, JPY and CNY use stored historical World Market exchange rates. The explanatory currency note sits below the catalogue.

The chart supports nominal (linear) and logarithmic scales. Zero or negative observations disable the logarithmic scale without removing observations. Overview and catalogue cards support relative or absolute changes, with the previous observation, one year, three years, ten years or all time as comparison periods.

The English catalogue contains translated labels, units, definitions and methodology. Numerical formatting uses `en-GB`; observation dates remain UTC dates. The underlying values and calculations use the existing data contracts.

## Shared data

Read-only requests go to the existing endpoints:

- `/dashboards/bitcoin/api/bitcoin/metrics.php`
- `/dashboards/bitcoin/api/bitcoin/series.php`
- `/dashboards/weltmarkt/api/weltmarkt/series.php`

The English frontend has no separate PHP configuration, database or scheduled importer. The language button follows the established site-header convention and retains the selected metric, currency, comparison and chart scale when opening the German dashboard.

## Maintenance

Keep translated catalogue definitions and presentation strings aligned with changes to the Bitcoin methodology and frontend. Metric IDs, date keys, formulae, API routes and stored values remain language-independent. Original source credits and licence links are retained.

Local verification covered 49 translated metrics, all five currencies, 23,768 independently checked converted prices, comparisons, logarithmic view, search, category filters, tooltips, error handling and mobile controls at 390 and 320 pixels. These checks used retained public API snapshots in an isolated local preview. Production deployment requires uploading this directory.
