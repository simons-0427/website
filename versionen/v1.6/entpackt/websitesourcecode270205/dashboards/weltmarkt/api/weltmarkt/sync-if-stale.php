<?php

declare(strict_types=1);

http_response_code(404);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo json_encode([
    'success' => false,
    'error' => [
        'code' => 'NOT_FOUND',
        'message' => 'Dieser Endpunkt ist nicht verfügbar.',
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
