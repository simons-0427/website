const API_ROOT = '/dashboards/weltmarkt/api/weltmarkt';

export class ApiError extends Error {
    constructor(message, code = 'REQUEST_FAILED', status = 0) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
    }
}

async function request(path, parameters = {}, signal = undefined) {
    const url = new URL(`${API_ROOT}/${path}`, window.location.href);
    Object.entries(parameters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw error;
        }
        throw new ApiError('The server is currently unavailable.', 'NETWORK_ERROR');
    }

    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new ApiError('The server returned an invalid JSON response.', 'INVALID_RESPONSE', response.status);
    }

    if (!response.ok || payload.success !== true) {
        const serverError = payload?.error ?? {};
        throw new ApiError(
            serverError.message || 'The data could not be loaded.',
            serverError.code || 'REQUEST_FAILED',
            response.status
        );
    }

    return payload;
}

export const WeltmarktApi = {
    metrics(signal) {
        return request('metrics.php', {}, signal);
    },
    series(metric, start, end, signal) {
        return request('series.php', { metric, start, end }, signal);
    },
    status(signal) {
        return request('status.php', {}, signal);
    },
};
