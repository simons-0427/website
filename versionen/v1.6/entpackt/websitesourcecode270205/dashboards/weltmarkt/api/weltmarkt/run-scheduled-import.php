<?php

declare(strict_types=1);

use Smstark\Weltmarkt\Http\JsonResponse;

require_once dirname(__DIR__, 2) . '/includes/weltmarkt/autoload.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    JsonResponse::error('METHOD_NOT_ALLOWED', 'Nur POST-Anfragen sind erlaubt.', 405);
}

try {
    $app = require dirname(__DIR__, 2) . '/includes/weltmarkt/bootstrap.php';
    $settings = $app->importSettings();
    $configuredToken = (string) ($settings['external_trigger_token'] ?? '');
    $providedToken = (string) ($_SERVER['HTTP_X_WELTMARKT_TOKEN'] ?? '');
    if (strlen($configuredToken) < 32
        || $providedToken === ''
        || !hash_equals($configuredToken, $providedToken)) {
        error_log('[weltmarkt/run-scheduled-import] Abgelehnter Zugriff von ' . (string) ($_SERVER['REMOTE_ADDR'] ?? 'unbekannt'));
        JsonResponse::error('UNAUTHORIZED', 'Ungültiger Importzugang.', 401);
    }

    ignore_user_abort(true);
    @set_time_limit((int) ($settings['external_max_runtime_seconds'] ?? 75) + 5);
    $result = $app->imports()->runDue(
        'external-cron',
        1,
        (int) ($settings['external_max_runtime_seconds'] ?? 75),
    );
    JsonResponse::send([
        'success' => true,
        'result' => $result,
        'generatedAt' => gmdate(DATE_ATOM),
    ]);
} catch (Throwable $error) {
    error_log('[weltmarkt/run-scheduled-import] ' . $error->getMessage());
    JsonResponse::error('IMPORT_UNAVAILABLE', 'Der automatische Import ist derzeit nicht verfügbar.', 503);
}
