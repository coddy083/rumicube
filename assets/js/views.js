import {
  effective,
  symbols,
  colorNames,
  validateGroup
} from './board.js?v=20261024-palette1';
export const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [x]));
export const btn = (text, action, options = {}) => `<button type="button" class="btn ${options.class || ''}" data-action="${action}" ${options.id ? `data-id="${esc(options.id)}"` : ''} ${options.pressed !== undefined ? `aria-pressed="${options.pressed}"` : ''} ${options.disabled ? 'disabled' : ''}>${text}</button>`;
export function tile(t, options = {}) {
  const v = effective(t),
    selected = options.selected || 0;
  const name = t.joker ? '무적 조커, 모든 색과 숫자를 자동으로 대신하는 하트' : `${colorNames[v.color]} ${v.number}`;
  const face = t.joker
    ? '<span class="joker-label">무적</span><span class="joker-heart" aria-hidden="true">♥</span><span class="joker-sparkle sparkle-one" aria-hidden="true">✦</span><span class="joker-sparkle sparkle-two" aria-hidden="true">✧</span>'
    : `<span>${v.number}</span><span class="symbol" aria-hidden="true">${symbols[v.color]}</span>`;
  const content = `${face}${selected ? `<span class="order" aria-hidden="true">${selected}</span>` : ''}`;
  if (options.decor) return `<span class="tile decor ${v.color}" aria-hidden="true">${content}</span>`;
  return `<button type="button" class="tile ${t.joker ? 'joker' : v.color || 'black'} ${options.isNew ? 'new-tile' : ''}" data-action="tile" data-id="${esc(t.id)}" data-key="tile-${esc(t.id)}" aria-label="${esc(name)}" aria-pressed="${!!selected}" ${options.disabled ? 'disabled' : ''} draggable="false">${content}</button>`;
}
const demoTile = (color, number) => tile({
  color,
  number
}, {
  decor: true
});
export function home(mode = 'solo', invite = '') {
  return `<div class="home"><div class="home-layout"><section class="home-intro"><p class="kicker">친구와, 혹은 컴퓨터와</p><h1>한 판 할까?<br><span>숫자로 모여요.</span></h1><p class="lede">같은 숫자를 모으고, 이어지는 숫자를 찾고.<br>내 타일을 모두 내려놓으면 이겨요.</p><div class="tile-scene" aria-label="같은 색 연속 숫자와 서로 다른 색의 같은 숫자 조합 예시"><div class="scene-row">${[4,5,6,7].map(n=>demoTile('blue',n)).join('')}</div><div class="scene-row">${['red','blue','black'].map(c=>demoTile(c,9)).join('')}</div></div><div class="scene-caption"><span><b>106</b>개의 타일</span><span><b>14</b>개로 시작</span><span><b>2–3</b>명 함께 플레이</span></div></section><section class="entry-panel" aria-labelledby="entry-title"><h2 id="entry-title">자리를 골라 주세요</h2><p class="intro">친구를 초대하거나, 바로 연습을 시작해 보세요.</p><form id="entry-form" novalidate><div class="field"><label for="nickname">닉네임</label><input id="nickname" name="nickname" maxlength="12" autocomplete="nickname" placeholder="친구들이 부를 이름" aria-describedby="entry-error" aria-required="true"></div><p class="field-label" id="mode-label">플레이 모드</p><div class="mode-grid" role="group" aria-labelledby="mode-label">${[['solo','혼자 하기','컴퓨터와 1:1'],['friends2','친구와 둘이','2인 온라인'],['friends3','친구와 셋이','3인 온라인']].map(([value,label,sub])=>`${btn(`${label}<small>${sub}</small>`,'mode',{id:value,class:'mode',pressed:mode===value})}`).join('')}</div><button type="submit" class="btn primary wide" id="create-button">${mode==='solo' ? '컴퓨터와 시작하기' : '새 방 만들기'} <span aria-hidden="true">→</span></button><div class="or">초대받은 방이 있나요?</div><div class="field"><label for="room-code">방 코드로 입장</label><div class="join-row"><input id="room-code" name="code" value="${esc(invite)}" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" aria-describedby="entry-error">${btn('입장하기','join')}</div></div><p class="form-error" id="entry-error" role="alert"></p><p class="field-help">회원가입 없이 플레이해요. 새로고침해도 같은 브라우저에서 돌아올 수 있어요.</p></form></section></div><footer class="home-footer"><strong>같은 숫자, 다른 생각.</strong><span>숫자 타일 보드게임 · 타일클럽</span></footer></div>`;
}
export function lobby(s) {
  const me = s.players.find(p => p.id === s.me),
    allReady = s.players.length === s.capacity && s.players.every(p => p.ready);
  const seats = Array.from({
    length: s.capacity
  }, (_, i) => s.players[i]);
  return `<div class="room-wrap"><div class="room-heading"><div><h1>친구를 기다리는 중</h1><p>${s.capacity}명이 모이면 게임을 시작할 수 있어요.</p></div>${btn('방 나가기','leave',{class:'ghost'})}</div><div class="room-top"><div><small>초대 코드</small><div class="room-code">${s.code}</div></div>${btn('초대 링크 복사 ↗','copy',{class:'small'})}</div><div class="seat-list seats-${s.capacity}">${seats.map((p,i)=>p?`<article class="seat ${p.id===s.me?'is-me':''}"><div class="avatar" aria-hidden="true">${esc(p.name[0])}</div><div class="seat-name">${esc(p.name)} ${p.id===s.me?'<small>나</small>':''}</div><span class="tag ${p.ready?'ready':''}">${!p.online?'연결 끊김':p.ready?'✓ 준비 완료':'준비 중'} ${p.id===s.hostId?'· 방장':''}</span></article>`:`<article class="seat empty"><div class="avatar" aria-hidden="true">+</div><div class="seat-name">빈자리 ${i+1}</div><small>친구를 초대해 주세요</small></article>`).join('')}</div><div class="lobby-controls">${btn(me.ready?'준비 취소':'준비 완료','ready',{class:me.ready?'':'primary'})}${s.hostId===s.me?btn('게임 시작 →','start',{class:'primary',disabled:!allReady}):''}</div><p class="form-error" id="game-error" role="alert"></p><div class="lobby-note"><strong>처음이라면 이것만 기억하세요</strong>내 타일 14개로 시작해요. 처음에는 합계 30 이상을 내려놓고, 다음 차례부터 게임판을 재조합할 수 있어요. 하트 조커는 무적이에요. 색·숫자를 정하지 않고 어느 조합에나 사용할 수 있어요.<br>대기실은 전원 미접속 1시간, 시작한 게임은 마지막 접속 후 24시간 동안 보관돼요.</div></div>`;
}
// 게임판 조합과 선택 순서를 작은 renderer로 나눠 중첩 템플릿을 줄인다.
function renderMeld(group, index, canEdit, editor, tileOptions) {
  const type = validateGroup(group.tiles);
  const sort = canEdit ? btn('정렬', 'sort-group', {id: group.id, class: 'small ghost'}) : '';
  const actions = canEdit ? `<div class="meld-actions">${btn('앞에 넣기','prepend',{id:group.id,disabled:!editor.selected.length})}${btn('뒤에 넣기','append',{id:group.id,disabled:!editor.selected.length})}</div>` : '';
  return `<article class="meld ${type ? '' : 'invalid'}" data-group="${group.id}" data-drop-allowed="${canEdit}">
    <div class="meld-top"><span>조합 ${index+1} · ${type || '조합을 완성해 주세요'}</span>${sort}</div>
    <div class="meld-tiles">${group.tiles.map(t => tile(t, tileOptions(t))).join('')}</div>${actions}
  </article>`;
}
function renderSelection(editor) {
  if (!editor.selected.length) return '';
  const items = editor.selected.map((id,index) => {
    const t = editor.tile(id), value = effective(t);
    return `<div class="selection-item"><span>${index+1}. ${t.joker ? '조커' : colorNames[value.color]} ${t.joker ? '♥ 무적' : value.number || ''}</span>
      ${btn('←','select-left',{id:String(index),disabled:index===0})}
      ${btn('→','select-right',{id:String(index),disabled:index===editor.selected.length-1})}</div>`;
  });
  return `<div class="selection-bar" aria-label="선택 순서">${items.join('')}</div>`;
}
export function game(s, e) {
  const mine = s.turnId === s.me;
  const me = s.players.find(p => p.id === s.me);
  const current = s.players.find(p => p.id === s.turnId);
  const oldGroups = new Set(s.board.map(g => g.id));
  const tileOptions = t => ({
    selected: e.selected.indexOf(t.id)+1,
    disabled: !e.rack.some(r => r.id === t.id) && (!mine || !me.registered),
    isNew: e.originalOwn.has(t.id) && !e.rack.some(r => r.id === t.id),
    draggable: mine && (me.registered || !e.originalBoard.has(t.id))
  });
  const players = s.players.map(p => `<article class="player-mini ${p.id===s.turnId ? 'current' : ''}">
    <div class="avatar" aria-hidden="true">${p.bot ? 'C' : esc(p.name[0])}</div>
    <div class="player-details"><strong>${esc(p.name)} ${p.id===s.me ? '(나)' : ''}</strong>
    <small data-presence="${p.id}">${p.bot ? '컴퓨터' : !p.online ? '연결 끊김' : p.registered ? '등록 완료' : '등록 전'}${p.abort ? ' · 중단 동의' : ''}</small></div>
    <div class="player-count">${p.id===s.me ? e.rack.length : p.count}<small>남은 타일</small></div>
  </article>`).join('');
  const emptyTiles = [1,2,3].map(number => tile({color:'blue',number},{decor:true})).join('');
  const empty = `<div class="table-empty"><div class="empty-tiles" aria-hidden="true">${emptyTiles}</div><p>아직 내려놓은 타일이 없어요.<br>타일을 선택하고 ‘새 조합’을 눌러 시작해 보세요.</p></div>`;
  const groups = e.board.map((g,i) => renderMeld(g,i,mine && (me.registered || !oldGroups.has(g.id)),e,tileOptions)).join('');
  const newDrop = mine ? '<div class="new-meld-drop" data-new-meld="true"><strong>+ 새 조합</strong><span>타일을 여기로 끌어 놓으세요</span></div>' : '';
  const attachHelp = me.registered ? '등록 완료 · 다른 사람이 내려놓은 조합에도 붙일 수 있어요.' : '등록 전 · 내 타일로 30점 이상을 등록하면 다음 차례부터 공용 조합을 사용할 수 있어요.';
  const turnTitle = mine ? '내 차례예요. 타일을 골라 주세요.' : `${esc(current.name)}${current.bot ? '가 생각하고 있어요' : '님의 차례예요'}.`;
  const turnHelp = !mine ? '내 타일을 정렬하며 다음 차례를 준비해 보세요.' : me.registered ? '누가 내려놓은 조합이든 드래그해서 붙이거나 재조합할 수 있어요.' : '첫 등록은 내 타일만으로 합계 30 이상이어야 해요.';
  const hint = e.selected.length ? `${e.selected.length}개 선택 · 선택 순서대로 놓여요. 앞·뒤 버튼으로 조합에 붙이세요.` : mine ? '타일을 눌러 선택하거나 위아래로 끌어 옮기세요. 손패는 좌우로 넘겨 볼 수 있어요.' : '다른 사람에게는 내 타일의 개수만 보여요.';
  return `<div class="game-wrap">
    <div class="game-top"><div class="game-title"><h1>${s.mode==='solo' ? '컴퓨터와 한 판' : '우리들의 테이블'}</h1><span class="tag mono">${s.mode==='solo' ? 'SINGLE' : s.code}</span></div>
      <div>${s.mode==='friends' ? btn('초대 링크','copy',{class:'small ghost'}) : ''}${btn('중단 동의','abort',{class:'small ghost'})}</div></div>
    <section class="players-strip" aria-label="참가자">${players}</section>
    <section class="turn-bar ${mine ? 'mine' : ''}" aria-label="차례 안내"><div class="turn-copy"><strong>${turnTitle}</strong><p>${turnHelp}</p></div><div class="pool-counter">남은 더미 <b>${s.poolCount}</b></div></section>
    <section class="table-area" aria-label="공용 게임판"><div class="table-label"><strong>공용 게임판 <span class="mono">${e.board.length}</span></strong><span>${e.changed ? '내 편집 중 · 아직 상대에게 보이지 않아요' : '모두에게 보이는 확정된 조합'}</span></div><div class="table-grid">${e.board.length ? groups : empty}${newDrop}</div><p class="attach-help">${attachHelp}</p></section>
    <p class="status-line">${esc(s.lastEvent)}</p>
    <section class="rack-panel" aria-labelledby="rack-title"><div class="rack-header"><h2 id="rack-title">내 타일 <span>${e.rack.length}</span></h2><div class="rack-tools">
      ${btn('색상순','sort-color',{class:'small ghost'})}${btn('숫자순','sort-number',{class:'small ghost'})}${btn('되돌리기','undo',{class:'small ghost',disabled:!mine||!e.history.length})}
    </div></div><div class="rack-tiles" data-rack="true">${e.rack.map(t => tile(t,tileOptions(t))).join('')}</div>
    ${renderSelection(e)}
    <div class="rack-bottom"><div class="edit-actions">
      ${btn('+ 새 조합','new-group',{class:'small',disabled:!mine||!e.selected.length})}
      ${btn('손패로','to-rack',{class:'small',disabled:!mine||!e.selected.length})}
      ${btn('선택 해제','clear-selection',{class:'small ghost',disabled:!e.selected.length})}
      ${btn('초기화','reset',{class:'small ghost',disabled:!mine||!e.changed})}
    </div><div class="turn-actions">${btn(s.poolCount ? '1개 가져오기' : '패스하기','draw',{disabled:!mine})}${btn('턴 완료 →','commit',{class:'primary',disabled:!mine||!e.changed})}</div></div>
    <p class="selected-hint">${hint}</p><p id="game-error" class="game-error" role="alert" hidden></p></section>
  </div>`;
}
export function result(s) {
  const r = s.result,
    me = s.players.find(p => p.id === s.me),
    names = r.players.filter(p => p.winner).map(p => p.name).join(', ');
  const aborted = r.reason === 'aborted',
    votes = s.players.filter(p => p.rematch || p.bot).length;
  return `<section class="result-wrap"><div class="result-title"><span class="result-medal">${aborted?'—':'WIN'}</span><h1>${aborted?'다음에 또 만나요.':`${esc(names)}${names.includes(',')?' 공동 우승!':'님이 이겼어요!'}`}</h1><p class="muted">${aborted?'모두 동의해서 이번 게임을 마쳤어요.':r.reason==='blocked'?'모두 패스해 잔여 점수가 가장 낮은 사람이 이겼어요.':'타일을 모두 내려놓았어요. 멋진 한 판이었어요.'}</p></div>${r.players.map((p,i)=>`<div class="result-row ${p.winner?'winner':''}"><span class="mono">${p.winner?'1':i+1}</span><strong>${esc(p.name)}${p.id===s.me?' (나)':''}</strong><span>${p.remaining}<small> 잔여 점수</small></span><span class="mono">${p.score===null?'—':p.score>0?'+'+p.score:p.score}</span></div>`).join('')}<div class="result-actions">${btn(me.rematch?'재경기 동의 취소':`한 판 더 하기 (${votes}/${s.capacity})`,'rematch',{class:'primary',disabled:s.players.length<s.capacity})}${btn('방 나가기','leave',{class:'ghost'})}</div><p id="game-error" class="form-error" role="alert"></p><p class="field-help">일반 타일은 숫자만큼, 조커는 30점이에요. ${r.reason==='win'?'승자는 상대의 잔여 점수 합계를 받아요.':'중단·교착 게임은 잔여 점수만 표시해요.'}</p></section>`;
}
export function rules() {
  return `<div class="rules-content"><p>같은 숫자를 모으거나 같은 색의 숫자를 이어서, 내 타일을 먼저 모두 내려놓으면 이겨요.</p><h3>유효한 조합은 두 가지예요</h3><ul><li>그룹: 같은 숫자, 서로 다른 색의 타일 3~4개.</li><li>연속: 같은 색의 연속 숫자 3개 이상. 13 다음에 1은 붙일 수 없어요.</li></ul><div class="rules-examples">${['red','blue','black'].map(c=>demoTile(c,7)).join('')}</div><h3>처음에는 합계 30 이상</h3><p>내 타일만 사용해 등록해요. 등록하는 턴에는 기존 조합을 바꿀 수 없고, 다음 차례부터 게임판을 재조합할 수 있어요.</p><h3>내 차례에 하는 일</h3><ul><li>내 타일을 1개 이상 내려놓고 모든 조합이 완성되면 ‘턴 완료’.</li><li>놓을 타일이 없으면 ‘1개 가져오기’. 편집은 취소되고 바로 다음 차례가 돼요.</li><li>‘초기화’는 턴 시작 상태로, ‘되돌리기’는 한 단계 전으로 돌아가요.</li><li>타일은 손가락이나 마우스로 끌어 옮길 수 있어요. 공용 조합 위로 놓으면 붙고, 빈 곳에 놓으면 새 조합이 돼요. 내 타일 안에서는 순서를 바꿀 수 있어요.</li></ul><h3>조커 · 이 게임의 규칙</h3><p>반짝이는 하트는 무적 조커예요. 색·숫자를 정할 필요 없이 어떤 색과 숫자든 자동으로 대신해요. 등록 후에는 교환 없이 다른 조합으로 자유롭게 옮길 수 있어요. 모든 조합은 조커를 포함해 3개 이상으로 완성해 주세요. 첫 등록 점수는 조합에서 대신하는 숫자로 자동 계산해요.</p><h3>더미 소진 · 접속 종료</h3><p>더미가 비면 패스할 수 있어요. 전원이 연속 패스하면 잔여 점수가 가장 낮은 사람이 승리해요. 동점은 공동 우승이에요. 제한시간은 없고 게임 중단에는 모든 사람의 동의가 필요해요.</p><h3>컴퓨터 대전</h3><p>기본 난이도의 컴퓨터와 1:1로 플레이해요. 컴퓨터는 새 조합·조커·기존 조합 연결을 사용하며 전체 게임판 재배열은 하지 않아요. 상대 손패를 보지 않고 같은 규칙 검증을 거쳐요.</p><h3>방 보관</h3><p>같은 브라우저에서 복귀할 수 있어요. 쿠키를 삭제하면 좌석을 되찾을 수 없어요. 전원 미접속 대기실은 1시간, 진행·종료 방은 마지막 접속 후 24시간이 지나면 만료돼요.</p></div>`;
}

