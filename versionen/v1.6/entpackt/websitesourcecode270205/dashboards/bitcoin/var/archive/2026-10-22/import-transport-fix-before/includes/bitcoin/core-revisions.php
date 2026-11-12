<?php

declare(strict_types=1);

require_once __DIR__ . '/core-series.php';

function bitcoin_core_revision_preflight(string $filename, ?array $activeIds): string
{
    if ($activeIds === null || count($activeIds) !== 50) throw new RuntimeException('Der freigegebene 50er-Katalog fehlt.');
    $allowed = array_fill_keys($activeIds, true);
    $sources = ['coinmetrics_community_btc', 'open_bitcoin_metrics_obm', 'cftc_cot_legacy', 'alternative_me_fng', 'derived_bitcoin_metrics'];
    $handle = fopen($filename, 'rb');
    if ($handle === false) throw new RuntimeException('Kernimportdatei fehlt.');
    $counts = [];
    $keys = [];
    try {
        $header = fgetcsv($handle, 0, ',', '"', '');
        if (is_array($header)) $header[0] = ltrim($header[0], "\xEF\xBB\xBF");
        if ($header !== explode(',', BITCOIN_CORE_HEADER)) throw new RuntimeException('Kernimportkopf weicht ab.');
        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            if (count($row) !== 9 || !isset($allowed[$row[0]]) || $row[1] !== 'main'
                || !in_array($row[4], $sources, true) || !bitcoin_core_date($row[2]) || $row[2] >= gmdate('Y-m-d')) {
                throw new RuntimeException('Revisionsmodus akzeptiert ausschließlich freigegebene Hauptreihen abgeschlossener UTC-Tage.');
            }
            $key = $row[0] . '/' . $row[2];
            if (isset($keys[$key])) throw new RuntimeException('Doppelte Kernbeobachtung.');
            $keys[$key] = true;
            $counts[$row[0]] = ($counts[$row[0]] ?? 0) + 1;
        }
    } finally { fclose($handle); }
    foreach ($activeIds as $metric) {
        if (($counts[$metric] ?? 0) < 365) throw new RuntimeException('Revisionsmodus benötigt die vollständige Historie aller 50 Kennzahlen.');
    }
    return 'before_core_' . substr((string) hash_file('sha256', $filename), 0, 12);
}

function bitcoin_core_archive_previous(PDO $pdo, string $metric, string $date, string $archive, array &$definitions): void
{
    if (!$pdo->inTransaction()) throw new RuntimeException('Revision benötigt eine Datenbanktransaktion.');
    $key = $metric . '/' . $archive;
    if (!isset($definitions[$key])) {
        $insert = $pdo->prepare(<<<'SQL'
            INSERT INTO bitcoin_metric_series
              (metric_id, series_key, display_name, display_order, native_frequency, calendar_type, expected_start)
            SELECT :metric, :archive, :label, 90, native_frequency, 'native_periods', expected_start
            FROM bitcoin_metrics
            WHERE metric_id = :lookup_metric AND NOT EXISTS (
                SELECT 1 FROM bitcoin_metric_series WHERE metric_id = :existing_metric AND series_key = :existing_archive
            )
            SQL);
        $insert->execute(['metric' => $metric, 'archive' => $archive, 'label' => 'Archiv vor Kernaktualisierung ' . substr($archive, -12),
            'lookup_metric' => $metric, 'existing_metric' => $metric, 'existing_archive' => $archive]);
        $definitions[$key] = true;
    }
    $update = $pdo->prepare("UPDATE bitcoin_observations SET series_key = :archive WHERE metric_id = :metric AND series_key = 'main' AND observation_date = :date");
    $update->execute(['archive' => $archive, 'metric' => $metric, 'date' => $date]);
    if ($update->rowCount() !== 1) throw new RuntimeException('Altbeobachtung konnte nicht eindeutig archiviert werden.');
}
