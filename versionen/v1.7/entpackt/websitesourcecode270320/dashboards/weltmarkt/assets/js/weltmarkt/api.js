import { RequestQueue } from './loading.js?v=20261114-compare-2';
const API_ROOT = '/dashboards/weltmarkt/api/weltmarkt';
const apiText = (de, en) => globalThis.document?.documentElement?.lang?.startsWith('en') ? en : de;
export class ApiError extends Error {
    constructor(message, code = 'REQUEST_FAILED', status = 0) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; }
}
export class WeltmarktClient {
    constructor(root = API_ROOT, transport = (...args) => fetch(...args), queue = new RequestQueue()) {
        this.root = root; this.transport = transport; this.queue = queue; this.version = null;
    }
    async request(path, parameters = {}, signal, options = {}, versionRetry = 0) {
        const query = new URLSearchParams();
        Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
        });
        const key = path + (query.size ? '?' + query : '');
        const payload = await this.queue.run(key, async sharedSignal => {
            const execute = async reload => {
                let response;
                try { response = await this.transport(this.root + '/' + key, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: sharedSignal, ...(reload ? { cache: 'reload' } : {}) }); }
                catch (error) { if (error?.name === 'AbortError') throw error; throw new ApiError(apiText('Der Server ist derzeit nicht erreichbar.', 'The server is currently unavailable.'), 'NETWORK_ERROR'); }
                let payload;
                try { payload = await response.json(); } catch { throw new ApiError(apiText('Der Server hat keine gültige JSON-Antwort geliefert.', 'The server returned an invalid JSON response.'), 'INVALID_RESPONSE', response.status); }
                this.queue.stats.decodedBytes += new TextEncoder().encode(JSON.stringify(payload)).byteLength;
                if (!response.ok || payload.success !== true) throw new ApiError(apiText(payload?.error?.message || 'Die Daten konnten nicht geladen werden.', 'The requested data could not be loaded.'), payload?.error?.code, response.status);
                if (payload.dataVersion && this.version && payload.dataVersion < this.version) {
                    if (!reload) return execute(true);
                    throw new ApiError(apiText('Der Datenbestand wurde aktualisiert. Bitte erneut laden.', 'The data was updated. Please retry.'), 'STALE_RESPONSE');
                }
                if (payload.dataVersion && payload.dataVersion !== this.version) { this.queue.clear(); this.version = payload.dataVersion; this.onVersionChange?.(this.version); }
                return payload;
            };
            return execute(false);
        }, { ...options, signal });
        if (payload.dataVersion && this.version && payload.dataVersion < this.version) {
            this.queue.evict(key);
            if (versionRetry) throw new ApiError(apiText('Der Datenbestand wurde aktualisiert. Bitte erneut laden.', 'The data was updated. Please retry.'), 'STALE_RESPONSE');
            return this.request(path, parameters, signal, { ...options, cache: false }, 1);
        }
        return payload;
    }
    metrics(signal, options = {}) { return this.request('metrics.php', {}, signal, options); }
    summaries(ids, signal, options = {}) { return this.request('metrics.php', { ids: [...new Set(ids)].sort().join(',') }, signal, options); }
    catalog(signal, options = {}) { return this.request('metrics.php', { view: 'catalog' }, signal, options); }
    series(metric, start, end, signal, options = {}) {
        if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
        for (const [key, hit] of this.queue.cache) {
            const value = hit.value;
            if (hit.expires > Date.now() && value.points && value.metric?.id === metric && (!this.version || value.dataVersion === this.version)
                && value.range?.start <= start && value.range?.end >= end) {
                const cached = this.queue.get(key);
                return Promise.resolve({ ...cached, range: { start, end }, points: cached.points.filter(p => p.date >= start && p.date <= end) });
            }
        }
        return this.request('series.php', { metric, start, end }, signal, options);
    }
    status(signal) { return this.request('status.php', {}, signal); }
}
export const WeltmarktApi = new WeltmarktClient();
