import {TileDrag} from './drag.js?v=20261021-joker1';
import {
  Api,
  actionId
} from './api.js?v=20261024-chat1';
import {Editor} from './board.js?v=20261024-palette1';
import {
  home,
  lobby,
  game,
  result,
  rules,
  esc,
  btn
} from './views.js?v=20261024-palette1';
import {Chat} from './chat.js?v=20261024-chat1';

const api = new Api();
const main = document.querySelector('#main'),
  modal = document.querySelector('#modal');
const connection = document.querySelector('#connection');
const storageKey = `tile-room:${location.pathname}`;
const invite = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
let state = null,
  editor = null,
  mode = 'solo',
  busy = false,
  pollTimer = null,
  polling = false,
  noticeTimer;
let nickname = '',
  pending = null,
  modalReturn = null,
  lastError = '';
let code = localStorage.getItem(storageKey) || '';
// 채팅 전송은 게임 요청(mutate)의 busy·pending·revision 흐름을 거치지 않는다.
const chat = new Chat((text, since) => api.post({action: 'chat', code, actionId: actionId(), text, chatSince: since}));

function online(ok) {
  connection.textContent = ok ? '연결됨' : '연결 확인 중';
  connection.classList.toggle('offline', !ok);
}

function notice(text) {
  const el = document.querySelector('#notice');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.hidden = true, 4500);
}

function showError(text, field) {
  lastError = text;
  const target = document.querySelector(state ? '#game-error' : '#entry-error');
  if (target) {
    target.textContent = text;
    target.hidden = false;
  } else notice(text);
  if (field) {
    const input = document.querySelector(field);
    input?.setAttribute('aria-invalid', 'true');
    input?.focus();
  }
}

function clearError() {
  lastError = '';
  const el = document.querySelector(state ? '#game-error' : '#entry-error');
  if (el) {
    el.textContent = '';
    if (state?.status === 'playing') el.hidden = true;
  }
}

function showPendingRequest() {
  showError('연결을 확인해 주세요. 미완료 요청을 확인 중이에요. 같은 요청으로 안전하게 재시도할 수 있어요.');
  const el = document.querySelector(state ? '#game-error' : '#entry-error');
  if (!el) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn small';
  button.textContent = '같은 요청 재시도';
  button.dataset.action = 'retry';
  el.append(' ', button);
}

function render() {
  drag.cancel();
  const key = document.activeElement?.dataset.key;
  // Re-rendering a selection must not jump a long mobile hand back to tile one.
  const scrollers = [...main.querySelectorAll('.rack-tiles,.selection-bar,[data-group] .meld-tiles')].map(el => ({
    group: el.closest('[data-group]')?.dataset.group,
    selection: el.classList.contains('selection-bar'),
    left: el.scrollLeft,
    top: el.scrollTop
  }));
  if (!state) {
    main.innerHTML = home(mode, invite);
    document.querySelector('#nickname').value = nickname;
    document.title = '타일클럽 — 한 판 할까?';
  } else {
    document.title = state.status === 'lobby' ? '친구 기다리기 · 타일클럽' : state.status === 'finished' ? '게임 결과 · 타일클럽' : '플레이 중 · 타일클럽';
    if (state.status === 'playing') main.innerHTML = game(state, editor);
    else main.innerHTML = state.status === 'lobby' ? lobby(state) : result(state);
  }
  for (const saved of scrollers) {
    const target = saved.group
      ? main.querySelector(`[data-group="${CSS.escape(saved.group)}"] .meld-tiles`)
      : main.querySelector(saved.selection ? '.selection-bar' : '.rack-tiles');
    if (target) { target.scrollLeft = saved.left; target.scrollTop = saved.top; }
  }
  if (key) main.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({
    preventScroll: true
  });
  if (lastError) showError(lastError);
  if (pending) showPendingRequest();
  if (busy) setBusy(true);
}

function accept(next, force = false) {
  online(true);
  if (next.left) {
    leaveLocal();
    return;
  }
  if (state && next.code === state.code && next.revision < state.revision) return;
  const changed = !state || next.revision !== state.revision || next.code !== state.code;
  state = next;
  code = state.code;
  chat.update(state);
  localStorage.setItem(storageKey, code);
  if (state.status === 'playing') {
    if (force || !editor || changed) {
      const rackOrder = editor?.rack.map(t => t.id) || [];
      editor = new Editor(state);
      if (rackOrder.length) editor.rack.sort((a, b) => {
        const x = rackOrder.indexOf(a.id),
          y = rackOrder.indexOf(b.id);
        return (x < 0 ? 1000 : x) - (y < 0 ? 1000 : y);
      });
    }
  } else editor = null;
  if (changed || force) {
    if (!pending) lastError = '';
    render();
  } else main.querySelectorAll('[data-presence]').forEach(el => {
    const p = state.players.find(p => p.id === el.dataset.presence);
    if (p) el.textContent = `${p.bot?'컴퓨터':!p.online?'연결 끊김':p.registered?'등록 완료':'등록 전'}${p.abort?' · 중단 동의':''}`;
  });
}

function setBusy(value) {
  busy = value;
  main.querySelectorAll('button').forEach(b => {
    if (value) {
      if (b.dataset.wasDisabled === undefined) b.dataset.wasDisabled = String(b.disabled);
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
    } else {
      b.disabled = b.dataset.wasDisabled === 'true';
      b.removeAttribute('aria-busy');
      delete b.dataset.wasDisabled;
    }
  });
}
async function refresh() {
  if (busy || polling) return;
  polling = true;
  try {
    if (!api.csrf) {
      await api.init();
      online(true);
      clearError();
      if (!state) render();
    }
    if (pending) {
      await sendPending();
    } else if (code) {
      const next = await api.state(code, chat.lastId);
      if (!pending && !busy) accept(next);
    }
  } catch (error) {
    online(false);
    if (['missing', 'membership'].includes(error.kind)) {
      leaveLocal();
      showError(error.message);
    }
  } finally {
    polling = false;
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    await refresh();
    schedulePoll();
  }, document.hidden ? 3500 : 1000);
}

function leaveLocal() {
  code = '';
  state = null;
  editor = null;
  pending = null;
  lastError = '';
  localStorage.removeItem(storageKey);
  chat.update(null);
  render();
  if (location.search) history.replaceState(null, '', location.pathname);
}
async function mutate(action, extra = {}) {
  if (busy) return;
  if (pending) {
    notice('먼저 같은 요청 재시도로 이전 결과를 확인해 주세요.');
    return;
  }
  clearError();
  const payload = {
    action,
    code,
    revision: state?.revision,
    actionId: actionId(),
    ...extra
  };
  pending = payload;
  await sendPending();
}
async function sendPending() {
  if (!pending || busy) return;
  const request = pending;
  setBusy(true);
  try {
    const next = await api.post(request);
    pending = null;
    lastError = '';
    accept(next, true);
    if (request.action === 'create' || request.action === 'join') main.focus();
  } catch (error) {
    if (error.kind === 'network') {
      online(false);
      showPendingRequest();
    } else {
      pending = null;
      if (request.action === 'leave' && ['membership', 'missing'].includes(error.kind)) {
        leaveLocal();
        return;
      }
      if (error.kind === 'conflict') {
        await forceRefresh();
        notice('다른 화면에서 상태가 바뀌어 최신 상태로 돌아왔어요.');
      } else showError(error.message);
    }
  } finally {
    setBusy(false);
  }
}
async function forceRefresh() {
  if (!code) return;
  try {
    accept(await api.state(code, chat.lastId), true);
  } catch (error) {
    showError(error.message);
  }
}

function openModal(title, html) {
  modalReturn = document.activeElement;
  document.querySelector('#modal-title').textContent = title;
  document.querySelector('#modal-body').innerHTML = html;
  if (!modal.open) modal.showModal();
  modal.querySelector('[data-initial-focus]')?.focus();
}

function closeModal() {
  modal.close();
  if (modalReturn?.isConnected) modalReturn.focus({
    preventScroll: true
  });
  else main.focus({
    preventScroll: true
  });
}
document.querySelector('#close-modal').addEventListener('click', closeModal);
modal.addEventListener('close', () => modalReturn?.focus({
  preventScroll: true
}));
modal.addEventListener('click', e => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal();
  }
});
document.querySelector('#rules-button').addEventListener('click', () => openModal('게임 방법', rules()));

function confirmAction(title, text, action, label) {
  openModal(title, `<p class="muted">${esc(text)}</p><div class="dialog-actions">${btn('돌아가기','modal-close',{class:'ghost'})}${btn(label,action,{class:'primary'})}</div>`);
}

async function copyInvite() {
  const url = new URL(location.pathname,location.origin);
  url.searchParams.set('room',code);
  try {await navigator.clipboard.writeText(url.href);notice('초대 링크를 복사했어요. 친구에게 보내 주세요.');}
  catch {
    openModal('친구 초대',`<p class="muted">아래 링크를 길게 눌러 복사하거나 방 코드를 알려 주세요.</p><div class="field"><label for="invite-url">초대 링크</label><input id="invite-url" readonly value="${esc(url.href)}"></div><p class="room-code">${code}</p>`);
    document.querySelector('#invite-url').select();
  }
}
main.addEventListener('input',e=>{
  if(e.target.id==='nickname'){nickname=e.target.value;e.target.removeAttribute('aria-invalid');}
  if(e.target.id==='room-code'){e.target.value=e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'');e.target.removeAttribute('aria-invalid');}
});
main.addEventListener('submit',e=>{if(e.target.id==='entry-form'){e.preventDefault();joinOrCreate(false);}});
function joinOrCreate(join) {
  if(busy)return;
  nickname=document.querySelector('#nickname').value.trim();
  const count=Array.from(nickname).length;
  if(!count||count>12){showError('닉네임은 1~12자로 입력해 주세요.','#nickname');return;}
  if(join){const value=document.querySelector('#room-code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(value)){showError('초대받은 6자리 방 코드를 입력해 주세요.','#room-code');return;}mutate('join',{name:nickname,code:value});}
  else mutate('create',{name:nickname,mode:mode==='solo'?'solo':'friends',capacity:mode==='friends3'?3:2});
}
async function clickAction(e) {
  const el=e.target.closest('[data-action]');if(!el||el.disabled||busy)return;
  const action=el.dataset.action,id=el.dataset.id;
  try {
    switch(action){
      case 'mode':nickname=document.querySelector('#nickname').value;mode=id;render();break;
      case 'join':joinOrCreate(true);break;
      case 'ready':case 'start':case 'rematch':await mutate(action);break;
      case 'copy':await copyInvite();break;
      case 'retry':await sendPending();break;
      case 'leave':confirmAction('방에서 나갈까요?','나가면 이 좌석은 해제돼요. 다시 플레이하려면 새로 입장해야 해요.','confirm-leave','방 나가기');break;
      case 'confirm-leave':closeModal();await mutate('leave');break;
      case 'abort':confirmAction('게임 중단에 동의할까요?','모든 사람이 동의하면 이번 게임이 끝나요. 이미 동의했다면 동의를 취소할 수 있어요.','confirm-abort','동의 / 취소');break;
      case 'confirm-abort':closeModal();await mutate('abort');break;
      case 'modal-close':closeModal();break;
      case 'tile':
        if(state.turnId!==state.me)return;
        editor.toggle(id);render();break;
      case 'new-group':editor.place();render();break;
      case 'append':editor.place(id);render();break;
      case 'prepend':editor.place(id,true);render();break;
      case 'to-rack':editor.toRack();render();break;
      case 'sort-color':editor.sortRack('color');render();break;
      case 'sort-number':editor.sortRack('number');render();break;
      case 'sort-group':editor.sortGroup(id);render();break;
      case 'select-left':editor.moveSelection(Number(id),-1);render();break;
      case 'select-right':editor.moveSelection(Number(id),1);render();break;
      case 'clear-selection':editor.selected=[];render();break;
      case 'undo':editor.undo();clearError();render();break;
      case 'reset':editor=new Editor(state);clearError();render();break;
      case 'draw':
        if(editor.changed)confirmAction(state.poolCount?'편집을 취소하고 가져올까요?':'편집을 취소하고 패스할까요?','이번 차례에 편집한 배치를 취소하고 다음 사람에게 차례를 넘겨요.','confirm-draw',state.poolCount?'1개 가져오기':'패스하기');
        else await mutate('draw');break;
      case 'confirm-draw':closeModal();await mutate('draw');break;
      case 'commit':await mutate('commit',editor.serialize());break;
    }
  }catch(error){showError(error.message);}
}
main.addEventListener('click',clickAction);modal.addEventListener('click',clickAction);
// 터치와 마우스가 같은 포인터 이벤트 경로를 사용한다.
function canDrag(id) {
  if (!state || state.status !== 'playing' || busy) return '지금은 타일을 옮길 수 없어요.';
  if (editor.rack.some(t => t.id === id)) return '';
  if (state.turnId !== state.me) return '공용 게임판은 내 차례에만 바꿀 수 있어요.';
  if (!state.players.find(p => p.id === state.me).registered) return '최초 등록 다음 차례부터 공용 조합을 사용할 수 있어요.';
  return '';
}
function applyDrop(drop) {
  const me = state.players.find(p => p.id === state.me);
  if (drop.destination.zone !== 'rack' && state.turnId !== state.me) throw new Error('공용 게임판에는 내 차례에만 내려놓을 수 있어요.');
  if (drop.destination.zone === 'group' && !me.registered && state.board.some(g => g.id === drop.destination.groupId)) {
    throw new Error('최초 30점 등록을 마친 다음 내 차례부터 다른 사람이 내려놓은 조합에도 붙일 수 있어요.');
  }
  editor.moveTiles(drop.ids,drop.destination);
  clearError();render();
}
const drag = new TileDrag(main, {
  canDrag,
  getIds(id) {return editor.selected.includes(id) ? [...editor.selected] : [id];},
  onDrop(drop) {try {applyDrop(drop);}catch(error){showError(error.message);}},
  onBlocked(message) {notice(message);}
});
main.addEventListener('dragstart',event=>event.preventDefault());
main.addEventListener('click',event=>{
  if(drag.suppressed){event.preventDefault();event.stopImmediatePropagation();}
},true);
window.addEventListener('offline',()=>online(false));
window.addEventListener('online',()=>refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();schedulePoll();});
window.addEventListener('beforeunload',e=>{if(editor?.changed&&state?.turnId===state?.me){e.preventDefault();e.returnValue='';}});
document.querySelector('.brand').addEventListener('click',e=>{
  if(state){e.preventDefault();if(state.status==='playing')notice('진행 중인 게임이에요. 나가려면 먼저 게임 중단에 동의해 주세요.');else confirmAction('방에서 나갈까요?','현재 방을 나가고 시작 화면으로 이동해요.','confirm-leave','방 나가기');}
});
async function boot(){
  try {await api.init();online(true);if(code){try{accept(await api.state(code,chat.lastId),true);}catch(error){if(['missing','membership'].includes(error.kind))leaveLocal();else{render();showError(error.message);online(false);}}}else render();}
  catch(error){render();showError('서버 연결을 확인할 수 없어요. PHP 호스팅에서 실행 중인지 확인하고 새로고침해 주세요.');online(false);}
  schedulePoll();
}
boot();

