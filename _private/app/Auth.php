<?php
declare(strict_types=1);
final class Auth {
    public string $hash;
    public string $csrf;
    public function __construct() {
        $token = $_COOKIE['tile_player'] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
            $token = bin2hex(random_bytes(32));
            $base = dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
            setcookie('tile_player', $token, ['expires' => time()+86400*30, 'path' => rtrim($base, '/.') . '/', 'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || getenv('TILE_HTTPS') === '1', 'httponly' => true, 'samesite' => 'Strict']);
        }
        $this->hash = hash('sha256', $token);
        $this->csrf = hash('sha256', 'tile-csrf:' . $token);
    }
    public function verify(): void {
        ensure(isset($_SERVER['HTTP_X_CSRF_TOKEN']) && hash_equals($this->csrf, $_SERVER['HTTP_X_CSRF_TOKEN']), '접속 정보를 새로 확인해야 해요. 페이지를 새로고침해 주세요.', 403, 'session');
        ensure(str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json'), 'JSON 요청이 필요해요.', 415);
    }
}
