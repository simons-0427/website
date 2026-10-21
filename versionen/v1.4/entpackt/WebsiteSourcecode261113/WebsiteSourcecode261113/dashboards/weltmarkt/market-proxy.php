<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

$symbol = isset($_GET['symbol']) ? trim($_GET['symbol']) : '';

if ($symbol === '') {
    echo json_encode(["error" => "Missing symbol parameter"]);
    exit;
}

// Whitelist: only alphanumeric, dots, hyphens, underscores, percent-encoded chars
if (!preg_match('/^[A-Za-z0-9.\-_%^=]+$/', $symbol)) {
    echo json_encode(["error" => "Invalid symbol"]);
    exit;
}

$url = "https://query1.finance.yahoo.com/v8/finance/chart/" . urlencode(urldecode($symbol)) . "?interval=1d&range=1d";

$context = stream_context_create([
    "http" => [
        "method"  => "GET",
        "header"  => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n",
        "timeout" => 10,
    ],
    "ssl" => [
        "verify_peer"      => true,
        "verify_peer_name" => true,
    ],
]);

$raw = @file_get_contents($url, false, $context);

if ($raw === false) {
    echo json_encode(["error" => "Failed to fetch data from Yahoo Finance"]);
    exit;
}

$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    echo json_encode(["error" => "Invalid JSON from Yahoo Finance"]);
    exit;
}

try {
    $meta  = $data["chart"]["result"][0]["meta"];
    $price = isset($meta["regularMarketPrice"]) ? (float)$meta["regularMarketPrice"] : null;
    $prev  = isset($meta["chartPreviousClose"])  ? (float)$meta["chartPreviousClose"]  : null;

    if ($price === null) {
        echo json_encode(["error" => "Price not found in response"]);
        exit;
    }

    echo json_encode(["price" => $price, "prev" => $prev]);
} catch (Exception $e) {
    echo json_encode(["error" => "Unexpected response structure"]);
}
