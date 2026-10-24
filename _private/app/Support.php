<?php
declare(strict_types=1);

final class GameError extends RuntimeException {
    public function __construct(string $message, public int $status = 422, public string $kind = 'invalid') { parent::__construct($message); }
}
function ensure(bool $condition, string $message, int $status = 422, string $kind = 'invalid'): void {
    if (!$condition) throw new GameError($message, $status, $kind);
}
function uid(): string { return bin2hex(random_bytes(12)); }
function storagePath(): string {
    $path = getenv('TILE_STORAGE') ?: dirname(__DIR__) . '/storage/rooms';
    if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) throw new RuntimeException('저장 폴더 생성 실패');
    return $path;
}
function roomCode(mixed $code): string {
    ensure(is_string($code) && preg_match('/^[A-Z2-9]{6}$/D', $code) === 1, '6자리 방 코드를 확인해 주세요.');
    return $code;
}

// PHP로 직접 요청해도 즉시 종료하는 머리말. JSON은 include/eval하지 않고 문자열로만 읽는다.
const STORAGE_GUARD = "<?php http_response_code(404); exit; ?>\n";
function encodeStoredJson(array $value): string {
    return STORAGE_GUARD . json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}
function decodeStoredJson(string $raw): array {
    if (!str_starts_with($raw, STORAGE_GUARD)) throw new RuntimeException('저장 파일 보호 형식 불일치');
    $value = json_decode(substr($raw, strlen(STORAGE_GUARD)), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($value)) throw new RuntimeException('저장 데이터 형식 불일치');
    return $value;
}
