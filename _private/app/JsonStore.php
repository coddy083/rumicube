<?php
declare(strict_types=1);
require_once __DIR__ . '/Support.php';

final class JsonStore {
    public function __construct(private string $directory) {}
    // 고정된 잠금 파일을 공유한다. 방 삭제 후에도 잠금 대상이 갈라지지 않는다.
    private function locked(string $scope, string $key, callable $callback): mixed {
        $bucket = hexdec(substr(hash('sha256', $key), 0, 2)) % 64;
        $lock = fopen($this->directory . '/.' . $scope . '-' . $bucket . '.lock.php', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('저장소 잠금 실패');
        try { return $callback(); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
    }
    public function transaction(string $code, callable $callback, bool $create = false): mixed {
        roomCode($code);
        $file = $this->directory . '/' . $code . '.json.php';
        ensure($create || is_file($file), '방이 없거나 만료되었어요. 새 방을 만들어 주세요.', 404, 'missing');
        return $this->locked('room', $code, function () use ($file, $callback, $create) {
            $original = null;
            if (is_file($file)) {
                $original = file_get_contents($file);
                $room = decodeStoredJson($original);
            } else {
                ensure($create, '방이 없거나 만료되었어요. 새 방을 만들어 주세요.', 404, 'missing');
                $room = null;
            }
            $result = $callback($room);
            if ($room !== null) {
                $encoded = encodeStoredJson($room);
                if ($encoded !== $original) {
                    // 교체되는 JSON이 아니라 고정 잠금 파일로 동시 요청을 직렬화한다.
                    if ($original !== null) $this->atomicWrite($file . '.bak.php', $original);
                    $this->atomicWrite($file, $encoded);
                }
            } elseif ($original !== null) {
                if (!unlink($file)) throw new RuntimeException('방 정리 실패');
                if (is_file($file . '.bak.php')) unlink($file . '.bak.php');
                // 잠금 파일은 삭제하지 않는다. 삭제하면 진행 중인 요청과 잠금 대상이 갈라진다.
            }
            return $result;
        });
    }
    private function atomicWrite(string $file, string $data): void {
        $temp = $this->directory . '/.write-' . uid() . '.php';
        try {
            $handle = fopen($temp, 'xb');
            if (!$handle) throw new RuntimeException('파일 쓰기 실패');
            try {
                $offset = 0;
                while ($offset < strlen($data)) {
                    $count = fwrite($handle, substr($data, $offset));
                    if (!$count) throw new RuntimeException('파일 쓰기 중단');
                    $offset += $count;
                }
                fflush($handle);
                if (function_exists('fsync')) fsync($handle);
            } finally { fclose($handle); }
            chmod($temp, 0600);
            if (!rename($temp, $file)) throw new RuntimeException('파일 교체 실패');
        } finally { if (is_file($temp)) unlink($temp); }
    }
    public function create(callable $callback, ?string $reservedCode = null): mixed {
        if ($reservedCode !== null) return $this->transaction($reservedCode, fn(&$room) => $callback($room, $reservedCode), true);
        $lock = fopen($this->directory . '/create.lock.php', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('생성 잠금 실패');
        try {
            do {
                $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                $code = '';
                for ($i = 0; $i < 6; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            } while (is_file($this->directory . '/' . $code . '.json.php'));
            return $this->transaction($code, fn(&$room) => $callback($room, $code), true);
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
    public function createForClient(string $auth, string $actionId, callable $factory): mixed {
        return $this->locked('client', $auth, function () use ($auth, $actionId, $factory) {
            $receipt = $this->directory . '/client-' . $auth . '.receipt.php';
            $old = is_file($receipt) ? decodeStoredJson(file_get_contents($receipt)) : null;
            if ($old && $old['actionId'] === $actionId) {
                $result = $factory($old['code'], true, $old['pending'] ?? false);
                if ($old['pending'] ?? false) {
                    $old['pending'] = false;
                    $this->atomicWrite($receipt, encodeStoredJson($old));
                }
                return $result;
            }
            ensure(!$old || time() - $old['at'] >= 2, '잠시 후 방을 만들어 주세요.', 429);
            $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            do {
                $code = '';
                for ($i = 0; $i < 6; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            } while (is_file($this->directory . '/' . $code . '.json.php'));
            // 방 생성 전에 의도를 기록한다. 중단 후 재시도도 같은 코드로 복구한다.
            $record = ['code' => $code, 'actionId' => $actionId, 'at' => time(), 'pending' => true];
            $this->atomicWrite($receipt, encodeStoredJson($record));
            $result = $factory($code, false, true);
            $record['pending'] = false;
            $this->atomicWrite($receipt, encodeStoredJson($record));
            return $result;
        });
    }
    public function cleanup(): int {
        $count = 0;
        foreach (glob($this->directory . '/*.json.php') ?: [] as $path) {
            $code = basename($path, '.json.php');
            try {
                $count += $this->transaction($code, function (&$room): int {
                    $ttl = $room['status'] === 'lobby' ? 3600 : 86400;
                    if (time() - $room['activityAt'] > $ttl) { $room = null; return 1; }
                    return 0;
                });
            } catch (Throwable $e) { error_log('Tile cleanup: ' . $e->getMessage()); }
        }
        foreach (glob($this->directory . '/client-*.receipt.php') ?: [] as $path) {
            $auth = substr(basename($path), 7, 64);
            if (!preg_match('/^[a-f0-9]{64}$/D', $auth)) continue;
            $this->locked('client', $auth, function () use ($path) {
                if (!is_file($path)) return;
                $receipt = decodeStoredJson(file_get_contents($path));
                // 살아 있는 방의 생성 재시도 기록은 계속 보존한다.
                if (time() - $receipt['at'] > 86400 && !is_file($this->directory . '/' . roomCode($receipt['code']) . '.json.php')) unlink($path);
            });
        }
        return $count;
    }
}
