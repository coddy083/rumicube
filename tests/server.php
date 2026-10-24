<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/_private/app/GameService.php';
set_error_handler(function ($severity, $message, $file, $line) { throw new ErrorException($message, 0, $severity, $file, $line); });
if (($argv[1] ?? '') === '--worker') {
    $workerStore = new JsonStore($argv[2]);
    for ($i = 0; $i < 20; $i++) $workerStore->transaction($argv[3], function (&$r) { $r['auditCounter'] = ($r['auditCounter'] ?? 0) + 1; });
    exit;
}
function check(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
    echo "PASS $message\n";
}
function rejects(callable $fn, string $kind): void {
    try { $fn(); } catch (GameError $e) { check($e->kind === $kind, 'Expected rejection: ' . $kind); return; }
    throw new RuntimeException('Expected GameError: ' . $kind);
}
$dir = sys_get_temp_dir() . '/tile-regression-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
$store = new JsonStore($dir); $service = new GameService($store);
$a = hash('sha256', 'test-a'); $b = hash('sha256', 'test-b');
$factory = function (string $auth) use ($service): Closure {
    return function ($code, $resume, $pending) use ($service, $auth) {
        if ($resume && !$pending) return $service->request($code, $auth, 'state', []);
        return $service->create($auth, 'Tester', ['mode' => 'friends', 'capacity' => 2], $code, $resume);
    };
};
try {
    for ($i = 2; $i < 8; $i++) rejects(fn() => $service->request('ABCDE' . $i, $a, 'state', []), 'missing');
    check(count(scandir($dir)) === 2, 'Missing room lookups create no files');
    $room = $store->createForClient($a, 'create-request-0001', $factory($a));
    $retry = $store->createForClient($a, 'create-request-0001', $factory($a));
    check($room['code'] === $retry['code'] && count(glob($dir . '/*.json.php')) === 1, 'Create retry returns the same room');
    rejects(fn() => $store->createForClient($a, 'create-request-0002', $factory($a)), 'invalid');
    $code = $room['code']; $path = $dir . '/' . $code . '.json.php';
    $raw = file_get_contents($path);
    $service->request($code, $a, 'state', []);
    check(file_get_contents($path) === $raw && !is_file($path . '.bak.php'), 'Immediate poll does not write state or backup');
    $store->transaction($code, function (&$r) { $r['players'][0]['seenAt'] = time() - 6; $r['activityAt'] = time() - 6; });
    $service->request($code, $a, 'state', []);
    $saved = decodeStoredJson(file_get_contents($path));
    check($saved['players'][0]['seenAt'] >= time() - 1 && is_file($path . '.bak.php'), 'Presence heartbeat is persisted after interval');
    $joined = $service->request($code, $b, 'join', ['name' => 'Guest']);
    $r = $service->request($code, $a, 'ready', ['revision' => $joined['revision'], 'actionId' => 'ready-request-0001']);
    $r = $service->request($code, $b, 'ready', ['revision' => $r['revision'], 'actionId' => 'ready-request-0002']);
    $r = $service->request($code, $a, 'start', ['revision' => $r['revision'], 'actionId' => 'start-request-0001']);
    check($r['status'] === 'playing' && count($r['rack']) === 14 && $r['poolCount'] === 78, 'Two-player deal preserves tile counts');
    $c = $service->request($code, $a, 'chat', ['actionId' => 'chat-request-0001', 'text' => "  안녕\n  하세요 👨‍👩‍👧 "]);
    check($c['revision'] === $r['revision'] && $c['chatSeq'] === 1 && $c['chat'][0]['text'] === '안녕 하세요 👨‍👩‍👧', 'Chat keeps game revision and normalizes whitespace');
    $c = $service->request($code, $a, 'chat', ['actionId' => 'chat-request-0001', 'text' => '안녕 하세요']);
    check($c['chatSeq'] === 1, 'Chat retry with the same action ID is idempotent');
    $seen = $service->request($code, $b, 'state', ['chatSince' => 1]);
    check($seen['chatSeq'] === 1 && $seen['chat'] === [], 'State returns only chat messages after chatSince');
    rejects(fn() => $service->request($code, $b, 'chat', ['actionId' => 'chat-request-0002', 'text' => '   ']), 'invalid');
    rejects(fn() => $service->request($code, $b, 'chat', ['actionId' => 'chat-request-0003', 'text' => str_repeat('가', 101)]), 'invalid');
    rejects(fn() => $service->request($code, $b, 'chat', ['actionId' => 'chat-request-0004', 'text' => "abc\u{202E}def"]), 'invalid');
    for ($i = 0; $i < 5; $i++) $service->request($code, $b, 'chat', ['actionId' => 'chat-burst-000' . $i, 'text' => 'hi ' . $i]);
    rejects(fn() => $service->request($code, $b, 'chat', ['actionId' => 'chat-burst-0009', 'text' => 'too fast']), 'rate');
    check(!isset($service->request($code, $b, 'state', [])['chat'][0]['aid']), 'Chat view hides receipt keys');
    $store->transaction($code, function (&$r) {
        $r['turn'] = 0;
        $r['players'][0]['rack'] = ['red-10-0', 'blue-10-0', 'black-10-0', 'red-1-0'];
    });
    $r = $service->request($code, $a, 'state', []);
    $commit = ['revision' => $r['revision'], 'actionId' => 'commit-request-0001', 'board' => [['id' => 'test-group', 'tiles' => [['id' => 'red-10-0'], ['id' => 'blue-10-0'], ['id' => 'black-10-0']]]]];
    $r = $service->request($code, $a, 'commit', $commit);
    check(count($r['rack']) === 1 && $r['players'][0]['registered'], 'Initial registration validates 30 points');
    $again = $service->request($code, $a, 'commit', $commit);
    check($again['revision'] === $r['revision'] && $again['ack'] === $commit['actionId'], 'Committed action retry is idempotent');
    $draw = ['revision' => $r['revision'], 'actionId' => 'draw-request-0001'];
    $r = $service->request($code, $b, 'draw', $draw);
    $again = $service->request($code, $b, 'draw', $draw);
    check($r['poolCount'] === 77 && $again['poolCount'] === 77, 'Draw retry consumes exactly one tile');
    rejects(fn() => $service->request($code, $a, 'draw', ['revision' => 1, 'actionId' => 'stale-request-0001']), 'conflict');
    rejects(fn() => $service->request($code, hash('sha256', 'outsider'), 'state', []), 'membership');
    $jobs = [];
    for ($i = 0; $i < 4; $i++) {
        $pipes = [];
        $process = proc_open([PHP_BINARY, __FILE__, '--worker', $dir, $code], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $jobs[] = [$process, $pipes];
    }
    foreach ($jobs as [$process, $pipes]) {
        fclose($pipes[0]); $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]);
        if (proc_close($process) !== 0) throw new RuntimeException($out . $err);
    }
    check(decodeStoredJson(file_get_contents($path))['auditCounter'] === 80, 'Concurrent transactions preserve all 80 updates');
    foreach (['before', 'after'] as $phase) {
        $auth = hash('sha256', $phase); $aid = 'interrupted-create-' . $phase;
        try {
            $store->createForClient($auth, $aid, function ($code, $resume, $pending) use ($phase, $factory, $auth) {
                if ($phase === 'after') ($factory($auth))($code, $resume, $pending);
                throw new RuntimeException('simulated interruption');
            });
        } catch (RuntimeException $e) { if ($e->getMessage() !== 'simulated interruption') throw $e; }
        $receipt = decodeStoredJson(file_get_contents($dir . '/client-' . $auth . '.receipt.php'));
        $recovered = $store->createForClient($auth, $aid, $factory($auth));
        check($receipt['code'] === $recovered['code'], 'Interrupted create recovers same room: ' . $phase);
        $done = decodeStoredJson(file_get_contents($dir . '/client-' . $auth . '.receipt.php'));
        check($done['pending'] === false, 'Recovered receipt is completed: ' . $phase);
    }
    $store->transaction($code, function (&$r) { $r['activityAt'] = time() - 90000; });
    check($store->cleanup() === 1 && !is_file($path) && !is_file($path . '.bak.php'), 'Expired room and backup are removed');
    rejects(fn() => $store->createForClient($a, 'create-request-0001', $factory($a)), 'missing');
    $receiptPath = $dir . '/client-' . $a . '.receipt.php';
    $receipt = decodeStoredJson(file_get_contents($receiptPath)); $receipt['at'] = time() - 90000;
    file_put_contents($receiptPath, encodeStoredJson($receipt)); $store->cleanup();
    check(!is_file($receiptPath), 'Expired orphan creation receipt is removed');
    check(count(glob($dir . '/.room-*.lock.php')) <= 64 && count(glob($dir . '/.client-*.lock.php')) <= 64, 'Lock file count is bounded');
    echo "Server regression checks passed.\n";
} finally {
    foreach (scandir($dir) as $file) if ($file !== '.' && $file !== '..') unlink($dir . '/' . $file);
    rmdir($dir);
}
