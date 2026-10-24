<?php
declare(strict_types=1);
require_once __DIR__ . '/JsonStore.php';
require_once __DIR__ . '/RuleValidator.php';
require_once __DIR__ . '/Computer.php';

final class GameService {
    public function __construct(private JsonStore $store) {}
    private function nickname(mixed $name): string {
        ensure(is_string($name) && preg_match('//u', $name) === 1, '닉네임을 확인해 주세요.');
        $name = trim($name);
        $length = preg_match_all('/./u', $name);
        ensure($length >= 1 && $length <= 12 && !preg_match('/[\p{C}]/u', $name), '닉네임은 1~12자로 입력해 주세요.');
        return $name;
    }
    private function player(string $auth, string $name): array {
        return ['id' => substr($auth, 0, 24), 'auth' => $auth, 'name' => $name, 'ready' => false, 'registered' => false, 'rack' => [], 'seenAt' => time(), 'away' => false, 'rematch' => false, 'abort' => false, 'bot' => false];
    }
    public function create(string $auth, mixed $name, array $options = [], ?string $reservedCode = null, bool $resume = false): array {
        $name = $this->nickname($name);
        $mode = $options['mode'] ?? 'friends';
        $capacity = $mode === 'solo' ? 2 : ($options['capacity'] ?? 3);
        ensure(in_array($mode, ['friends', 'solo'], true) && in_array($capacity, [2,3], true), '플레이 모드를 확인해 주세요.');
        return $this->store->create(function (&$room, $code) use ($auth, $name, $mode, $capacity, $resume) {
            if ($room !== null) {
                ensure($resume, '방 코드가 겹쳤어요. 다시 방을 만들어 주세요.', 409, 'conflict');
                foreach ($room['players'] as $i => $existing) if (hash_equals($existing['auth'], $auth)) {
                    $ttl = $room['status'] === 'lobby' ? 3600 : 86400;
                    ensure(time() - $room['activityAt'] <= $ttl, '방이 만료되었어요. 새 방을 만들어 주세요.', 410, 'missing');
                    return $this->view($room, $i);
                }
                throw new GameError('이 브라우저의 참가 정보가 없어요.', 403, 'membership');
            }
            $p = $this->player($auth, $name);
            $room = ['code' => $code, 'status' => 'lobby', 'mode' => $mode, 'capacity' => $capacity, 'botDueAt' => null, 'hostId' => $p['id'], 'players' => [$p], 'revision' => 1, 'activityAt' => time(), 'createdAt' => time(), 'board' => [], 'pool' => [], 'turn' => 0, 'turnNumber' => 0, 'passes' => 0, 'receipts' => [], 'result' => null, 'lastEvent' => '방을 만들었어요. 친구를 초대해 주세요.'];
            if ($mode === 'solo') {
                $bot = $this->player(hash('sha256', uid()), '컴퓨터'); $bot['bot'] = true; $room['players'][] = $bot;
                $this->deal($room);
            }
            return $this->view($room, 0);
        }, $reservedCode);
    }
    public function request(string $code, string $auth, string $action, array $data): array {
        return $this->store->transaction($code, function (&$room) use ($auth, $action, $data) {
            $ttl = $room['status'] === 'lobby' ? 3600 : 86400;
            ensure(time() - $room['activityAt'] <= $ttl, '방이 만료되었어요. 새 방을 만들어 주세요.', 410, 'missing');
            $pi = null;
            foreach ($room['players'] as $i => $p) if (hash_equals($p['auth'], $auth)) $pi = $i;
            if ($action === 'join' && $pi === null) {
                ensure($room['status'] === 'lobby', '이미 시작된 게임에는 입장할 수 없어요.', 409);
                ensure(count($room['players']) < $room['capacity'], '방이 가득 찼어요. 다른 방을 만들어 주세요.', 409);
                $name = $this->nickname($data['name'] ?? null);
                foreach ($room['players'] as $p) ensure($p['name'] !== $name, '같은 닉네임이 있어요. 다른 이름을 사용해 주세요.');
                $room['players'][] = $this->player($auth, $name); $pi = count($room['players']) - 1;
                $room['revision']++; $room['lastEvent'] = $name . '님이 들어왔어요.';
            }
            ensure($pi !== null, '이 브라우저의 참가 정보가 없어요. 대기 중인 방에 다시 입장해 주세요.', 403, 'membership');
            // 접속 표시는 15초 기준이며, 조회에 따른 저장은 최대 5초에 한 번이다.
            if ($action !== 'state' || time() - $room['players'][$pi]['seenAt'] >= 5 || $room['players'][$pi]['away']) {
                $room['players'][$pi]['seenAt'] = time(); $room['players'][$pi]['away'] = false; $room['activityAt'] = time();
            }
            if (in_array($action, ['state', 'join'], true)) {
                if ($room['status'] === 'playing' && $room['players'][$room['turn']]['bot'] && microtime(true) >= ($room['botDueAt'] ?? 0)) $this->computerTurn($room);
                return $this->view($room, $pi, is_int($data['chatSince'] ?? null) ? $data['chatSince'] : 0);
            }
            $id = $data['actionId'] ?? '';
            ensure(is_string($id) && preg_match('/^[a-zA-Z0-9_-]{12,80}$/D', $id), '요청 ID가 필요해요.');
            // 채팅은 게임 revision을 바꾸지 않는다. 편집 중인 차례가 채팅 때문에 충돌하거나 초기화되지 않게 한다.
            if ($action === 'chat') { $this->chat($room, $pi, $id, $data['text'] ?? null); return $this->view($room, $pi, is_int($data['chatSince'] ?? null) ? $data['chatSince'] : 0); }
            $receiptKey = $room['players'][$pi]['id'] . ':' . $id;
            $fingerprint = hash('sha256', $action . json_encode($data, JSON_THROW_ON_ERROR));
            if (isset($room['receipts'][$receiptKey])) {
                ensure(hash_equals($room['receipts'][$receiptKey], $fingerprint), '이미 사용한 요청 ID예요.', 409, 'conflict');
                return $this->view($room, $pi) + ['ack' => $id];
            }
            ensure(isset($data['revision']) && is_int($data['revision']) && $data['revision'] === $room['revision'], '게임 상태가 바뀌었어요. 최신 상태를 불러올게요.', 409, 'conflict');
            $p = &$room['players'][$pi];
            switch ($action) {
                case 'ready':
                    ensure($room['status'] === 'lobby', '대기실에서만 준비할 수 있어요.');
                    $p['ready'] = !$p['ready'];
                    $room['lastEvent'] = $p['name'] . ($p['ready'] ? '님이 준비했어요.' : '님이 준비를 취소했어요.');
                    break;
                case 'start':
                    ensure($p['id'] === $room['hostId'], '방장만 시작할 수 있어요.', 403);
                    ensure($room['status'] === 'lobby' && count($room['players']) === $room['capacity'] && count(array_filter($room['players'], fn($p) => $p['ready'])) === $room['capacity'], '정원만큼 모여 모두 준비해야 시작할 수 있어요.');
                    $this->deal($room); break;
                case 'commit':
                    $this->requireTurn($room, $pi);
                    $valid = RuleValidator::commit($room, $pi, $data);
                    $room['board'] = $valid['board']; $p['rack'] = $valid['rack']; $p['registered'] = true; $room['passes'] = 0;
                    $room['lastEvent'] = $p['name'] . '님이 타일을 내려놓았어요.';
                    if (count($p['rack']) === 0) $this->finish($room, 'win', $p['id']); else $this->nextTurn($room);
                    break;
                case 'draw':
                    $this->requireTurn($room, $pi);
                    if (count($room['pool']) > 0) {
                        $p['rack'][] = array_pop($room['pool']); $room['passes'] = 0;
                        $room['lastEvent'] = $p['name'] . '님이 타일 1개를 가져왔어요.';
                    } else {
                        $room['passes']++; $room['lastEvent'] = $p['name'] . '님이 패스했어요.';
                    }
                    if ($room['passes'] >= count($room['players'])) $this->finish($room, 'blocked'); else $this->nextTurn($room);
                    break;
                case 'rematch':
                    ensure($room['status'] === 'finished', '게임이 끝난 후 다시 시작할 수 있어요.');
                    ensure(count($room['players']) === $room['capacity'], '재경기 인원이 부족해요. 새 방을 만들어 주세요.');
                    $p['rematch'] = !$p['rematch'];
                    if (count(array_filter($room['players'], fn($p) => $p['rematch'] || $p['bot'])) === count($room['players'])) $this->deal($room);
                    break;
                case 'abort':
                    ensure($room['status'] === 'playing', '게임 중에만 중단에 동의할 수 있어요.');
                    $p['abort'] = !$p['abort'];
                    $room['lastEvent'] = '게임 중단 동의 ' . count(array_filter($room['players'], fn($p) => $p['abort'] || $p['bot'])) . '/' . count($room['players']);
                    if (count(array_filter($room['players'], fn($p) => $p['abort'] || $p['bot'])) === count($room['players'])) $this->finish($room, 'aborted');
                    break;
                case 'leave':
                    ensure($room['status'] !== 'playing', '게임 중에는 좌석이 유지돼요. 중단은 전원 동의가 필요해요.');
                    $name = $p['name']; unset($p);
                    array_splice($room['players'], $pi, 1);
                    if (count($room['players']) === 0) { $room = null; return ['left' => true]; }
                    if ($room['hostId'] === substr($auth, 0, 24)) $room['hostId'] = $room['players'][0]['id'];
                    foreach ($room['players'] as &$other) $other['ready'] = false;
                    unset($other); $room['revision']++; $room['lastEvent'] = $name . '님이 나갔어요.';
                    return ['left' => true];
                default: throw new GameError('지원하지 않는 동작이에요.', 404);
            }
            unset($p);
            $room['revision']++; $room['receipts'][$receiptKey] = $fingerprint;
            // 한 방의 수명을 제한하되 저장된 actionId는 방 만료 전까지 보존한다.
            return $this->view($room, $pi) + ['ack' => $id];
        });
    }
    private function chat(array &$room, int $pi, string $id, mixed $text): void {
        ensure($room['mode'] === 'friends', '친구와 하는 방에서만 채팅할 수 있어요.');
        ensure(is_string($text) && preg_match('//u', $text) === 1, '메시지를 확인해 주세요.');
        $text = trim(preg_replace('/\s+/u', ' ', $text));
        $length = preg_match_all('/./u', $text);
        ensure($length >= 1 && $length <= 100 && !preg_match('/[\p{Cc}\p{Co}\p{Cs}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $text), '메시지는 1~100자로 입력해 주세요.');
        $p = $room['players'][$pi]; $aid = $p['id'] . ':' . $id; $messages = $room['chat'] ?? [];
        foreach ($messages as $m) if (hash_equals($m['aid'], $aid)) return;
        $recent = count(array_filter($messages, fn($m) => $m['by'] === $p['id'] && $m['at'] > time() - 10));
        ensure($recent < 5, '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요.', 429, 'rate');
        $room['chatSeq'] = ($room['chatSeq'] ?? 0) + 1;
        $messages[] = ['id' => $room['chatSeq'], 'aid' => $aid, 'by' => $p['id'], 'name' => $p['name'], 'text' => $text, 'at' => time()];
        $room['chat'] = array_slice($messages, -40);
    }
    private function computerTurn(array &$room): void {
        $pi = $room['turn'];
        // AI에는 공개 게임판과 자신의 손패만 전달한다. 상대 손패나 더미 순서는 넘기지 않는다.
        $board = Computer::choose($room['board'], $room['players'][$pi]['rack'], $room['players'][$pi]['registered']);
        $played = false;
        if ($board !== null) {
            $valid = RuleValidator::commit($room, $pi, ['board' => $board, 'exchanges' => []]);
            $room['board'] = $valid['board']; $room['players'][$pi]['rack'] = $valid['rack'];
            $room['players'][$pi]['registered'] = true; $room['passes'] = 0; $played = true;
            $room['lastEvent'] = '컴퓨터가 타일을 내려놓았어요.';
        } elseif (count($room['pool']) > 0) {
            $room['players'][$pi]['rack'][] = array_pop($room['pool']); $room['passes'] = 0;
            $room['lastEvent'] = '컴퓨터가 타일 1개를 가져왔어요.';
        } else { $room['passes']++; $room['lastEvent'] = '컴퓨터가 패스했어요.'; }
        if ($played && count($room['players'][$pi]['rack']) === 0) $this->finish($room, 'win', $room['players'][$pi]['id']);
        elseif ($room['passes'] >= count($room['players'])) $this->finish($room, 'blocked');
        else $this->nextTurn($room);
        $room['revision']++;
    }
    private function requireTurn(array $room, int $pi): void {
        ensure($room['status'] === 'playing', '진행 중인 게임이 아니에요.');
        ensure($room['turn'] === $pi, '아직 내 차례가 아니에요.', 403, 'turn');
    }
    private function deal(array &$room): void {
        $pool = array_keys(RuleValidator::tiles());
        for ($i = count($pool)-1; $i > 0; $i--) { $j = random_int(0, $i); [$pool[$i], $pool[$j]] = [$pool[$j], $pool[$i]]; }
        foreach ($room['players'] as &$p) {
            $p['rack'] = array_splice($pool, 0, 14); $p['registered'] = false; $p['ready'] = false; $p['rematch'] = false; $p['abort'] = false;
        }
        unset($p);
        $room['pool'] = $pool; $room['board'] = []; $room['turn'] = random_int(0, count($room['players'])-1); $room['turnNumber'] = 1; $room['passes'] = 0;
        $room['botDueAt'] = microtime(true) + 1.5;
        $room['status'] = 'playing'; $room['result'] = null; $room['lastEvent'] = '게임 시작! ' . $room['players'][$room['turn']]['name'] . '님부터 시작해요.';
    }
    private function nextTurn(array &$room): void { $room['turn'] = ($room['turn'] + 1) % count($room['players']); $room['turnNumber']++; $room['botDueAt'] = microtime(true) + 1.5; }
    private function finish(array &$room, string $reason, ?string $winner = null): void {
        $tiles = RuleValidator::tiles(); $rows = [];
        foreach ($room['players'] as $p) {
            $remaining = array_sum(array_map(fn($id) => $tiles[$id]['joker'] ? 30 : $tiles[$id]['number'], $p['rack']));
            $rows[] = ['id' => $p['id'], 'name' => $p['name'], 'remaining' => $remaining, 'score' => $reason === 'win' ? -$remaining : null];
        }
        if ($reason === 'win') foreach ($rows as &$row) { if ($row['id'] === $winner) $row['score'] = array_sum(array_column($rows, 'remaining')); } unset($row);
        $minimum = min(array_column($rows, 'remaining'));
        foreach ($rows as &$row) $row['winner'] = $reason === 'win' ? $row['id'] === $winner : ($reason === 'blocked' && $row['remaining'] === $minimum);
        unset($row);
        usort($rows, fn($a, $b) => $a['remaining'] <=> $b['remaining']);
        $room['status'] = 'finished'; $room['result'] = ['reason' => $reason, 'players' => $rows];
        $room['lastEvent'] = $reason === 'aborted' ? '모두 동의해 게임을 중단했어요.' : '게임이 끝났어요!';
    }
    public function view(array $room, int $pi, int $chatSince = 0): array {
        $tiles = RuleValidator::tiles(); $me = $room['players'][$pi]; $players = [];
        foreach ($room['players'] as $p) $players[] = ['id' => $p['id'], 'name' => $p['name'], 'ready' => $p['ready'], 'registered' => $p['registered'], 'count' => count($p['rack']), 'bot' => $p['bot'], 'online' => $p['bot'] || (time() - $p['seenAt'] <= 15 && !$p['away']), 'rematch' => $p['rematch'], 'abort' => $p['abort']];
        // 폴링마다 전체 기록을 보내지 않도록 클라이언트가 받은 다음 메시지만 돌려준다.
        $chat = [];
        foreach ($room['chat'] ?? [] as $m) if ($m['id'] > $chatSince) $chat[] = ['id' => $m['id'], 'by' => $m['by'], 'name' => $m['name'], 'text' => $m['text'], 'at' => $m['at']];
        $board = [];
        foreach ($room['board'] as $g) $board[] = ['id' => $g['id'], 'tiles' => array_map(fn($t) => $t + $tiles[$t['id']], $g['tiles'])];
        return ['code' => $room['code'], 'mode' => $room['mode'], 'capacity' => $room['capacity'], 'status' => $room['status'], 'revision' => $room['revision'], 'hostId' => $room['hostId'], 'me' => $me['id'], 'players' => $players, 'rack' => array_map(fn($id) => $tiles[$id], $me['rack']), 'board' => $board, 'poolCount' => count($room['pool']), 'turnId' => $room['status'] === 'playing' ? $room['players'][$room['turn']]['id'] : null, 'turnNumber' => $room['turnNumber'], 'passes' => $room['passes'], 'result' => $room['result'], 'lastEvent' => $room['lastEvent'], 'chatSeq' => $room['chatSeq'] ?? 0, 'chat' => $chat];
    }
}
