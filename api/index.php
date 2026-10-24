<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_private/app/GameService.php';
require_once dirname(__DIR__) . '/_private/app/Auth.php';

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
try {
    $auth = new Auth(); $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'GET' && ($_GET['action'] ?? '') === 'init') {
        echo json_encode(['csrf' => $auth->csrf], JSON_THROW_ON_ERROR); exit;
    }
    ensure(in_array($method, ['GET','POST'], true), '지원하지 않는 요청이에요.', 405);
    $data = [];
    if ($method === 'POST') {
        $auth->verify();
        ensure((int)($_SERVER['CONTENT_LENGTH'] ?? 0) <= 65536, '요청이 너무 커요.', 413);
        $raw = file_get_contents('php://input', false, null, 0, 65537);
        ensure(strlen($raw) <= 65536, '요청이 너무 커요.', 413);
        $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        ensure(is_array($data), '요청 형식을 확인해 주세요.');
    }
    $action = $method === 'GET' ? ($_GET['action'] ?? '') : ($data['action'] ?? '');
    ensure(is_string($action), '동작을 확인해 주세요.');
    ensure($method === 'POST' || $action === 'state', '변경 요청에는 POST가 필요해요.', 405);
    $store = new JsonStore(storagePath()); $service = new GameService($store);
    if ($action === 'create') {
        // 생성 응답을 잃고 재시도해도 같은 방을 돌려준다. 생성 키는 비공개 쿠키에 귀속된다.
        $aid = $data['actionId'] ?? '';
        ensure(is_string($aid) && preg_match('/^[a-zA-Z0-9_-]{12,80}$/D', $aid), '요청 ID가 필요해요.');
        $result = $store->createForClient($auth->hash, $aid, function ($code, $resume, $pending) use ($service, $auth, $data) {
            if ($resume && !$pending) return $service->request($code, $auth->hash, 'state', []);
            return $service->create($auth->hash, $data['name'] ?? null, $data, $code, $resume);
        });
    } else {
        $code = roomCode($method === 'GET' ? ($_GET['code'] ?? '') : ($data['code'] ?? ''));
        $result = $service->request($code, $auth->hash, $action, $data);
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    // 정리 실패로 이미 전송한 JSON 뒤에 오류 JSON이 붙지 않게 한다.
    try { if (random_int(1, 100) === 1) $store->cleanup(); }
    catch (Throwable $e) { error_log('Tile cleanup: ' . $e->getMessage()); }
} catch (GameError $e) {
    http_response_code($e->status); echo json_encode(['error' => $e->getMessage(), 'kind' => $e->kind], JSON_UNESCAPED_UNICODE);
} catch (JsonException $e) {
    http_response_code(500); echo json_encode(['error' => '저장 데이터 또는 요청 형식을 확인할 수 없어요. 반복되면 관리자에게 문의해 주세요.', 'kind' => 'storage'], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('Tile server: ' . $e->getMessage()); http_response_code(500);
    echo json_encode(['error' => '저장 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', 'kind' => 'server'], JSON_UNESCAPED_UNICODE);
}
