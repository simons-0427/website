<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/includes/bitcoin/bootstrap.php';
bitcoin_get_only();

try {
    $pdo = bitcoin_database();
    $sql = <<<'SQL'
        SELECT m.metric_id, m.category, m.display_name, m.unit, m.description,
               m.native_frequency, m.availability_status, m.coverage_start,
               m.coverage_end, m.observation_count, m.methodology_note,
               s.slug AS source_slug, s.display_name AS source_name,
               s.base_url AS source_url, s.attribution_text,
               o.value AS latest_value, o.observation_date AS latest_date,
               o.quality_status AS latest_quality,
               p.value AS previous_value, p.observation_date AS previous_date
        FROM bitcoin_metrics AS m
        LEFT JOIN bitcoin_data_sources AS s ON s.id = m.source_id
        LEFT JOIN bitcoin_observations AS o
          ON o.metric_id = m.metric_id AND o.series_key = 'main'
         AND o.observation_date = (
             SELECT MAX(i.observation_date)
             FROM bitcoin_observations AS i
             WHERE i.metric_id = m.metric_id AND i.series_key = 'main'
         )
        LEFT JOIN bitcoin_observations AS p
          ON p.metric_id = m.metric_id AND p.series_key = 'main'
         AND p.observation_date = (
             SELECT MAX(i.observation_date)
             FROM bitcoin_observations AS i
             WHERE i.metric_id = m.metric_id AND i.series_key = 'main'
               AND i.observation_date < o.observation_date
         )
        ORDER BY m.display_order, m.display_name
        SQL;
    $rows = $pdo->query($sql)->fetchAll();
    $sumMetricIds = ['hodl_waves', 'realized_cap_hodl_waves', 'mining_pool_share', 'mining_pool_hashrate_share_pct'];
    $sumQuery = $pdo->prepare(<<<'SQL'
        SELECT observation_date, SUM(value) AS combined_value
        FROM bitcoin_observations
        WHERE metric_id = :metric
        GROUP BY observation_date
        ORDER BY observation_date DESC
        LIMIT 2
        SQL);
    foreach ($rows as &$row) {
        if (!in_array($row['metric_id'], $sumMetricIds, true) || $row['latest_value'] !== null) {
            continue;
        }
        $sumQuery->execute(['metric' => $row['metric_id']]);
        $points = $sumQuery->fetchAll();
        if ($points === []) {
            continue;
        }
        $row['latest_value'] = $points[0]['combined_value'];
        $row['latest_date'] = $points[0]['observation_date'];
        $row['latest_quality'] = 'provisional';
        if (isset($points[1])) {
            $row['previous_value'] = $points[1]['combined_value'];
            $row['previous_date'] = $points[1]['observation_date'];
        }
    }
    unset($row);
    $mainCoverage = $pdo->prepare("SELECT COUNT(*) AS observation_count, MIN(observation_date) AS coverage_start, MAX(observation_date) AS coverage_end FROM bitcoin_observations WHERE metric_id = :metric AND series_key = 'main'");
    foreach ($rows as &$row) {
        if (!in_array($row['metric_id'], ['fear_greed_index', 'difficulty'], true)) continue;
        $mainCoverage->execute(['metric' => $row['metric_id']]);
        $coverage = $mainCoverage->fetch();
        $row['observation_count'] = $coverage['observation_count'];
        $row['coverage_start'] = $coverage['coverage_start'];
        $row['coverage_end'] = $coverage['coverage_end'];
    }
    unset($row);
    $metrics = array_map(static fn (array $row): array => [
        'id' => $row['metric_id'],
        'category' => $row['category'],
        'label' => $row['display_name'],
        'unit' => $row['unit'],
        'description' => $row['description'],
        'frequency' => $row['native_frequency'],
        'status' => $row['availability_status'],
        'coverageStart' => $row['coverage_start'],
        'coverageEnd' => $row['coverage_end'],
        'observationCount' => (int) $row['observation_count'],
        'methodology' => $row['methodology_note'],
        'sourceName' => $row['source_name'],
        'sourceSlug' => $row['source_slug'],
        'sourceUrl' => $row['source_url'],
        'attribution' => $row['attribution_text'],
        'latestValue' => $row['latest_value'],
        'latestDate' => $row['latest_date'],
        'latestQuality' => $row['latest_quality'],
        'previousValue' => $row['previous_value'],
        'previousDate' => $row['previous_date'],
    ], $rows);
    bitcoin_json(['success' => true, 'metrics' => $metrics, 'generatedAt' => gmdate(DATE_ATOM)], 200, 300);
} catch (Throwable $exception) {
    error_log('[bitcoin/metrics] ' . $exception->getMessage());
    bitcoin_error('DATABASE_UNAVAILABLE', 'Die gespeicherten Bitcoin-Daten konnten nicht geladen werden.', 503);
}
