<?php
declare(strict_types=1);
require_once __DIR__ . '/RuleValidator.php';

/** 기본 난이도: 새 조합, 조커 활용, 기존 조합 연결. 전체 게임판 재배열은 하지 않는다. */
final class Computer {
    public static function choose(array $board, array $rack, bool $registered): ?array {
        $tiles = RuleValidator::tiles(); $remaining = $rack; $changed = false;
        if ($registered) {
            // 가능한 타일을 기존 조합에 붙인다. 같은 색의 연속 조합은 정렬한다.
            do {
                $added = false;
                foreach ($remaining as $ri => $id) {
                    if ($tiles[$id]['joker']) continue;
                    foreach ($board as $gi => $g) {
                        $entries = array_merge($g['tiles'], [['id' => $id]]);
                        try { $valid = RuleValidator::group($entries, $tiles); }
                        catch (GameError) { continue; }
                        foreach ($entries as &$entry) if ($tiles[$entry['id']]['joker']) $entry = ['id' => $entry['id']] + $valid['jokers'][$entry['id']];
                        unset($entry);
                        usort($entries, fn($a, $b) => RuleValidator::effective($a, $tiles)['number'] <=> RuleValidator::effective($b, $tiles)['number']);
                        $board[$gi]['tiles'] = $entries; unset($remaining[$ri]); $remaining = array_values($remaining);
                        $changed = $added = true; break 2;
                    }
                }
            } while ($added);
        }
        $candidates = self::candidates($remaining, $tiles);
        $best = []; $bestValue = 0; $nodes = 0;
        // 겹치지 않는 조합을 제한된 탐색으로 고른다. 등록 30점은 여러 조합 합계도 가능하다.
        $search = function (int $start, array $used, array $chosen, int $points) use (&$search, &$best, &$bestValue, &$nodes, $candidates, $registered): void {
            if (++$nodes > 2200) return;
            $value = count($used) * 1000 + $points;
            if (($registered || $points >= 30) && $value > $bestValue) { $bestValue = $value; $best = $chosen; }
            if (count($chosen) >= 8) return;
            for ($i = $start; $i < count($candidates); $i++) {
                $c = $candidates[$i]; $ids = array_column($c['tiles'], 'id');
                if (array_intersect($ids, $used)) continue;
                $search($i+1, array_merge($used, $ids), array_merge($chosen, [$c]), $points+$c['points']);
                if ($nodes > 2200) break;
            }
        };
        $search(0, [], [], 0);
        foreach ($best as $c) { $board[] = ['id' => 'ai-' . uid(), 'tiles' => $c['tiles']]; $changed = true; }
        return $changed ? $board : null;
    }
    private static function candidates(array $rack, array $tiles): array {
        $map = []; $jokers = []; $out = [];
        foreach ($rack as $id) {
            $t = $tiles[$id];
            if ($t['joker']) $jokers[] = $id; else $map[$t['color']][$t['number']][] = $id;
        }
        $colors = ['red','blue','black','orange'];
        // 같은 숫자 그룹: 가능한 색 부분집합에 부족한 색을 조커로 보완한다.
        for ($n = 1; $n <= 13; $n++) for ($mask = 1; $mask < 16; $mask++) {
            $entries = []; $missing = []; $present = 0;
            foreach ($colors as $i => $color) if ($mask & (1 << $i)) {
                if (isset($map[$color][$n])) { $entries[] = ['id' => $map[$color][$n][0]]; $present++; }
                else $missing[] = $color;
            }
            $size = count($entries)+count($missing);
            if ($size < 3 || $present === 0 || count($missing) > count($jokers)) continue;
            foreach ($missing as $i => $color) $entries[] = ['id' => $jokers[$i], 'asColor' => $color, 'asNumber' => $n];
            $out[] = ['tiles' => $entries, 'points' => $n*$size];
        }
        foreach ($colors as $color) for ($start = 1; $start <= 11; $start++) for ($end = $start+2; $end <= 13; $end++) {
            $entries = []; $missing = 0;
            for ($n = $start; $n <= $end; $n++) {
                if (isset($map[$color][$n])) $entries[] = ['id' => $map[$color][$n][0]];
                elseif ($missing < count($jokers)) $entries[] = ['id' => $jokers[$missing++], 'asColor' => $color, 'asNumber' => $n];
                else { $entries = []; break; }
            }
            if ($entries) $out[] = ['tiles' => $entries, 'points' => intdiv(($start+$end)*($end-$start+1),2)];
        }
        usort($out, fn($a,$b) => (count($b['tiles'])*100+$b['points']) <=> (count($a['tiles'])*100+$a['points']));
        return array_slice($out, 0, 120);
    }
}
