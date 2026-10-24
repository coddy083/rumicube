<?php
declare(strict_types=1);
require_once __DIR__ . '/Support.php';

final class RuleValidator {
    public static function tiles(): array {
        $tiles = [];
        foreach (['red', 'blue', 'black', 'orange'] as $color) {
            for ($n = 1; $n <= 13; $n++) for ($copy = 0; $copy < 2; $copy++) {
                $id = $color . '-' . $n . '-' . $copy;
                $tiles[$id] = ['id' => $id, 'color' => $color, 'number' => $n, 'joker' => false];
            }
        }
        foreach ([0, 1] as $i) $tiles['joker-' . $i] = ['id' => 'joker-' . $i, 'color' => 'black', 'number' => 0, 'joker' => true];
        return $tiles;
    }
    public static function effective(array $entry, array $tiles): array {
        ensure(isset($entry['id']) && is_string($entry['id']) && isset($tiles[$entry['id']]), '알 수 없는 타일이에요.');
        $tile = $tiles[$entry['id']];
        if ($tile['joker'] && isset($entry['asColor'], $entry['asNumber'])) {
            $tile['color'] = $entry['asColor']; $tile['number'] = $entry['asNumber'];
        }
        return $tile;
    }
    public static function group(array $entries, array $tiles): array {
        ensure(count($entries) >= 3 && count($entries) <= 13, '조합은 타일 3개 이상이어야 해요.');
        // 조커의 과거 지정 값은 무시하고 현재 조합에서 자동으로 결정한다.
        $normal = []; $jokers = [];
        foreach ($entries as $entry) {
            ensure(is_array($entry), '타일 형식이 올바르지 않아요.');
            $tile = self::effective($entry, $tiles);
            if ($tile['joker']) $jokers[] = $tile['id']; else $normal[] = $tile;
        }
        $numbers = array_column($normal, 'number'); $colors = array_column($normal, 'color');
        $resolved = [];
        $isGroup = count($entries) <= 4 && count(array_unique($numbers)) <= 1 && count(array_unique($colors)) === count($normal);
        if ($isGroup) {
            $number = $numbers[0] ?? 13;
            $missing = array_values(array_diff(['red','blue','black','orange'], $colors));
            foreach ($jokers as $i => $id) $resolved[$id] = ['asColor' => $missing[$i], 'asNumber' => $number];
            return ['type' => 'group', 'points' => $number * count($entries), 'jokers' => $resolved];
        }
        if (count(array_unique($colors)) <= 1 && count(array_unique($numbers)) === count($normal)) {
            // 가능한 연속 중 높은 점수를 택해 첫 등록 점수를 일관되게 계산한다.
            for ($start = 14 - count($entries); $start >= 1; $start--) {
                $range = range($start, $start + count($entries) - 1);
                if (array_diff($numbers, $range)) continue;
                $missing = array_values(array_diff($range, $numbers));
                foreach ($jokers as $i => $id) $resolved[$id] = ['asColor' => $colors[0] ?? 'red', 'asNumber' => $missing[$i]];
                return ['type' => 'run', 'points' => array_sum($range), 'jokers' => $resolved];
            }
        }
        throw new GameError('같은 숫자·다른 색 3~4개 또는 같은 색·연속 숫자 3개 이상으로 만들어 주세요. 조커는 어떤 색·숫자든 자동으로 대신해요.');
    }
    public static function commit(array $room, int $playerIndex, array $payload): array {
        $player = $room['players'][$playerIndex]; $tiles = self::tiles();
        ensure(isset($payload['board']) && is_array($payload['board']) && array_is_list($payload['board']) && count($payload['board']) <= 35, '게임판 형식이 올바르지 않아요.');
        $board = []; $seen = []; $groupIds = []; $points = 0;
        foreach ($payload['board'] as $i => $group) {
            ensure(is_array($group) && isset($group['id'], $group['tiles']) && is_string($group['id']) && preg_match('/^[a-zA-Z0-9_-]{1,64}$/D', $group['id']) && is_array($group['tiles']) && array_is_list($group['tiles']), '조합 형식이 올바르지 않아요.');
            ensure(!isset($groupIds[$group['id']]), '조합 ID가 중복되었어요.'); $groupIds[$group['id']] = true;
            try { $valid = self::group($group['tiles'], $tiles); }
            catch (GameError $e) { throw new GameError('조합 ' . ($i + 1) . ': ' . $e->getMessage()); }
            $clean = [];
            foreach ($group['tiles'] as $entry) {
                $id = $entry['id']; ensure(!isset($seen[$id]), '같은 타일을 두 번 사용할 수 없어요.'); $seen[$id] = $group['id'];
                $item = ['id' => $id];
                if ($tiles[$id]['joker']) $item += $valid['jokers'][$id];
                $clean[] = $item;
            }
            $board[] = ['id' => $group['id'], 'tiles' => $clean]; $points += $valid['points'];
        }
        $oldIds = []; $oldGroups = [];
        foreach ($room['board'] as $g) { $oldGroups[$g['id']] = $g; foreach ($g['tiles'] as $t) $oldIds[] = $t['id']; }
        $allowed = array_merge($oldIds, $player['rack']);
        foreach (array_keys($seen) as $id) ensure(in_array($id, $allowed, true), '내 타일과 게임판의 타일만 사용할 수 있어요.');
        foreach ($oldIds as $id) ensure(isset($seen[$id]), '기존 게임판의 타일을 손패로 가져갈 수 없어요.');
        $used = array_values(array_intersect($player['rack'], array_keys($seen)));
        ensure(count($used) > 0, '내 타일을 1개 이상 내려놓거나 타일을 가져와 주세요.');
        if (!$player['registered']) {
            foreach ($room['board'] as $old) {
                $found = array_values(array_filter($board, fn($g) => $g['id'] === $old['id']));
                ensure(count($found) === 1 && array_column($found[0]['tiles'], 'id') === array_column($old['tiles'], 'id'), '최초 등록 턴에는 기존 조합을 변경할 수 없어요.');
                $points -= self::group($old['tiles'], $tiles)['points'];
            }
            foreach ($board as $g) if (!isset($oldGroups[$g['id']])) foreach ($g['tiles'] as $t) ensure(in_array($t['id'], $player['rack'], true), '최초 등록은 내 타일만 사용해야 해요.');
            ensure($points >= 30, '최초 등록은 합계 30 이상이어야 해요. 현재 ' . $points . '점이에요.');
        }
        return ['board' => $board, 'rack' => array_values(array_diff($player['rack'], $used))];
    }
}
