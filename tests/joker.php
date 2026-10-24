<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/_private/app/Computer.php';
set_error_handler(function ($severity, $message, $file, $line) { throw new ErrorException($message, 0, $severity, $file, $line); });
function expect(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
    echo "PASS $message\n";
}
function entries(array $ids): array { return array_map(fn($id) => ['id' => $id], $ids); }
function invalid(callable $fn): void {
    try { $fn(); } catch (GameError) { return; }
    throw new RuntimeException('Expected invalid arrangement');
}
$tiles = RuleValidator::tiles();
foreach ([
    ['red-10-0','blue-10-0','joker-0'],
    ['red-10-0','joker-0','red-12-0'],
    ['red-1-0','joker-0','joker-1'],
    ['red-13-0','joker-0','joker-1'],
    ['red-1-0','red-4-0','joker-0','joker-1'],
] as $ids) {
    expect(isset(RuleValidator::group(entries($ids), $tiles)['jokers']['joker-0']), 'Unassigned joker completes ' . implode(', ', $ids));
}
foreach ([['red-1-0','blue-3-0','joker-0'], ['red-1-0','red-1-1','joker-0'], ['red-13-0','red-1-0','joker-0'], ['joker-0']] as $ids) {
    invalid(fn() => RuleValidator::group(entries($ids), $tiles));
}
echo "PASS Normal group rules and run boundaries remain enforced\n";
$room = ['board' => [], 'players' => [['registered' => false, 'rack' => ['red-9-0','red-10-0','joker-0']]]];
$result = RuleValidator::commit($room, 0, ['board' => [['id' => 'initial', 'tiles' => entries($room['players'][0]['rack'])]]]);
expect($result['rack'] === [] && $result['board'][0]['tiles'][2]['asNumber'] === 11, 'Initial registration automatically reaches 30 points');
$room['players'][0]['rack'] = ['red-1-0','red-2-0','joker-0'];
invalid(fn() => RuleValidator::commit($room, 0, ['board' => [['id' => 'low', 'tiles' => entries($room['players'][0]['rack'])]] ]));
$old = ['id' => 'old', 'tiles' => array_merge(entries(['red-7-0','blue-7-0','black-7-0']), [['id' => 'joker-0','asColor' => 'orange','asNumber' => 7]])];
$room = ['board' => [$old], 'players' => [['registered' => true, 'rack' => ['red-10-0','red-12-0']]]];
$result = RuleValidator::commit($room, 0, ['board' => [
    ['id' => 'old', 'tiles' => entries(['red-7-0','blue-7-0','black-7-0'])],
    ['id' => 'new', 'tiles' => array_merge(entries(['red-10-0','red-12-0']), [$old['tiles'][3]])]
]]);
expect($result['rack'] === [] && $result['board'][1]['tiles'][2]['asNumber'] === 11, 'Existing joker moves and changes value without an exchange');
$room['players'][0] = ['registered' => false, 'rack' => ['blue-10-0','black-10-0','orange-10-0']];
$result = RuleValidator::commit($room, 0, ['board' => [
    ['id' => 'old', 'tiles' => entries(array_column($old['tiles'],'id'))],
    ['id' => 'registration', 'tiles' => entries($room['players'][0]['rack'])]
]]);
expect($result['rack'] === [], 'Initial registration preserves legacy board jokers without manual values');
$room['players'][0] = ['registered' => true, 'rack' => ['red-10-0','blue-10-0','black-10-0']];
invalid(fn() => RuleValidator::commit($room, 0, ['board' => [['id' => 'only-new', 'tiles' => entries($room['players'][0]['rack'])]]]));
echo "PASS Board tile conservation remains enforced\n";
$ai = Computer::choose([], ['red-9-0','red-10-0','joker-0'], false);
expect($ai !== null, 'Computer can register with an automatic joker');
RuleValidator::commit(['board'=>[], 'players'=>[['registered'=>false,'rack'=>['red-9-0','red-10-0','joker-0']]]], 0, ['board'=>$ai]);
echo "Joker regression checks passed.\n";
