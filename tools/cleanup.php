<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/_private/app/JsonStore.php';
$directory = storagePath();
$store = new JsonStore($directory);
echo 'Expired rooms removed: ' . $store->cleanup() . PHP_EOL;
// 이전 버전 요청과의 잠금 분리를 피하려면 웹 요청을 중지한 상태에서만 실행한다.
if (in_array('--legacy-locks', $argv, true)) {
    $count = 0;
    foreach (glob($directory . '/*.lock.php') ?: [] as $path) {
        if (!preg_match('/^(?:[A-Z2-9]{6}|client-[a-f0-9]{64}\.receipt\.php)\.lock\.php$/D', basename($path))) continue;
        if (!unlink($path)) throw new RuntimeException('Legacy lock removal failed');
        $count++;
    }
    echo 'Legacy locks removed: ' . $count . PHP_EOL;
}
