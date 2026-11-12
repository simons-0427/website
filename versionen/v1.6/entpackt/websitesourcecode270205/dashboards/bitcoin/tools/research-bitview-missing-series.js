const baseUrl = 'https://bitview.space';
const queries = ['adjusted transfer', 'median transaction', 'median output value', 'transfer volume'];
const inspectSeries = [
  'transfer_volume_bis',
  'transfer_volume_average_24h',
  'tx_vsize_median',
  'adjusted_sopr_transfer_volume_cumulative_by_cohort',
];

async function main() {
  for (const query of queries) {
    const url = new URL('/api/series/search', baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '50');
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 research-only' },
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${query}: HTTP ${response.status}: ${body.slice(0, 300)}`);
    let data;
    try { data = JSON.parse(body); } catch { throw new Error(`${query}: invalid JSON response.`); }
    const matches = Array.isArray(data) ? data : (data.results || data.series || []);
    console.log(JSON.stringify({ query, matches }, null, 2));
  }
  for (const series of inspectSeries) {
    const response = await fetch(`${baseUrl}/api/series/${encodeURIComponent(series)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'smstark-bitcoin-dashboard/1.0 research-only' },
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${series}: HTTP ${response.status}: ${body.slice(0, 300)}`);
    const metadata = JSON.parse(body);
    console.log(JSON.stringify({ series, metadata }, null, 2));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
