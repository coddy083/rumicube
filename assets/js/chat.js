// 게임 화면(#main)과 분리된 채팅. 게임 렌더링·revision과 무관하게 동작해 플레이를 방해하지 않는다.
const QUICK = ['👍 좋아요', '잘했어요!', '잠깐만요', 'ㅋㅋㅋ', '한 판 더?'];
const MAX = 100;

export class Chat {
  room = '';
  me = '';
  names = new Map();
  lastId = 0;
  unread = 0;
  sending = false;
  primed = false;
  previewTimer = null;

  constructor(send) {
    this.send = send;
    this.muted = localStorage.getItem('tile-chat-muted') === '1';
    this.root = document.createElement('div');
    this.root.className = 'chat';
    this.root.hidden = true;
    this.root.innerHTML = `<button type="button" class="btn ghost chat-toggle" aria-expanded="false" aria-controls="chat-panel">채팅<span class="chat-badge" hidden></span></button>
      <p class="chat-preview" role="status" aria-live="polite" hidden></p>
      <section class="chat-panel" id="chat-panel" aria-label="채팅" hidden>
        <div class="chat-head"><strong>채팅</strong><span>
          <button type="button" class="btn small ghost" data-chat="mute" aria-pressed="${this.muted}">미리보기 끄기</button>
          <button type="button" class="btn small ghost" data-chat="close" aria-label="채팅 닫기">닫기</button></span></div>
        <ol class="chat-log" role="log" aria-label="채팅 기록"></ol>
        <div class="chat-quick">${QUICK.map(q => `<button type="button" class="btn small" data-chat="quick">${q}</button>`).join('')}</div>
        <form class="chat-form" novalidate><label class="sr-only" for="chat-input">메시지</label>
          <input id="chat-input" maxlength="${MAX}" autocomplete="off" enterkeyhint="send" placeholder="메시지 입력">
          <button type="submit" class="btn primary small">보내기</button></form>
        <p class="chat-error" role="alert" hidden></p>
      </section>`;
    document.querySelector('.top-actions').prepend(this.root);
    this.toggle = this.root.querySelector('.chat-toggle');
    this.badge = this.root.querySelector('.chat-badge');
    this.preview = this.root.querySelector('.chat-preview');
    this.panel = this.root.querySelector('.chat-panel');
    this.log = this.root.querySelector('.chat-log');
    this.input = this.root.querySelector('#chat-input');
    this.error = this.root.querySelector('.chat-error');
    this.toggle.addEventListener('click', () => this.open(this.panel.hidden));
    this.root.addEventListener('click', e => {
      const kind = e.target.closest('[data-chat]')?.dataset.chat;
      if (kind === 'close') this.open(false, true);
      if (kind === 'quick') this.submit(e.target.textContent);
      if (kind === 'mute') {
        this.muted = !this.muted;
        localStorage.setItem('tile-chat-muted', this.muted ? '1' : '0');
        e.target.setAttribute('aria-pressed', String(this.muted));
        if (this.muted) this.preview.hidden = true;
      }
    });
    this.root.querySelector('.chat-form').addEventListener('submit', e => { e.preventDefault(); this.submit(this.input.value); });
    // 모바일 패널은 게임판을 덮으므로 바깥을 누르면 닫는다. 넓은 화면에서는 열어 둔 채 플레이할 수 있다.
    document.addEventListener('pointerdown', e => {
      if (!this.panel.hidden && !this.root.contains(e.target) && matchMedia('(max-width: 48rem)').matches) this.open(false);
    });
    this.panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.open(false, true); } });
  }

  get readKey() { return `tile-chat-read:${this.room}`; }

  // 서버 상태가 올 때마다 호출된다. 솔로·퇴장 상태에서는 채팅을 숨긴다.
  update(state) {
    const active = state && state.mode === 'friends';
    if (!active || state.code !== this.room) this.reset(active ? state.code : '');
    this.root.hidden = !active;
    if (!active) return;
    // 같은 방이 다시 만들어진 경우처럼 서버 순번이 되돌아가면 다음 조회에서 처음부터 다시 받는다.
    if ((state.chatSeq ?? 0) < this.lastId) this.reset(state.code);
    this.me = state.me;
    for (const p of state.players) this.names.set(p.id, p.name);
    const fresh = (state.chat || []).filter(m => m.id > this.lastId);
    if (!fresh.length) { this.primed = true; return; }
    const read = Number(localStorage.getItem(this.readKey) || 0);
    for (const m of fresh) {
      this.lastId = m.id;
      this.log.append(this.item(m));
    }
    while (this.log.children.length > 40) this.log.firstElementChild.remove();
    const incoming = fresh.filter(m => m.by !== this.me && m.id > read);
    if (!this.panel.hidden) this.markRead();
    else if (incoming.length) {
      this.unread += incoming.length;
      this.renderBadge();
      // 첫 로딩 때의 과거 기록은 배지로만 알리고 미리보기를 띄우지 않는다.
      if (this.primed) this.showPreview(incoming.at(-1));
    }
    this.primed = true;
    if (!this.panel.hidden) this.scroll();
  }

  reset(room) {
    this.room = room;
    this.names.clear();
    this.lastId = 0;
    this.unread = 0;
    this.primed = false;
    this.log.replaceChildren();
    this.renderBadge();
    this.preview.hidden = true;
    if (!room) this.open(false);
  }

  item(m) {
    const li = document.createElement('li');
    li.className = m.by === this.me ? 'mine' : '';
    const name = document.createElement('b');
    name.textContent = m.by === this.me ? '나' : this.names.get(m.by) || m.name;
    const text = document.createElement('span');
    text.textContent = m.text;
    li.append(name, text);
    return li;
  }

  open(value, restoreFocus = false) {
    this.panel.hidden = !value;
    this.toggle.setAttribute('aria-expanded', String(value));
    if (value) {
      this.preview.hidden = true;
      this.markRead();
      this.scroll();
      // 모바일에서 키보드가 자동으로 올라와 게임판을 가리지 않도록 터치 기기에서는 포커스를 옮기지 않는다.
      if (matchMedia('(hover:hover)').matches) this.input.focus({preventScroll: true});
    } else if (restoreFocus) this.toggle.focus({preventScroll: true});
  }

  markRead() {
    this.unread = 0;
    this.renderBadge();
    if (this.room && this.lastId) localStorage.setItem(this.readKey, String(this.lastId));
  }

  renderBadge() {
    this.badge.hidden = !this.unread;
    this.badge.textContent = this.unread > 9 ? '9+' : String(this.unread);
    this.toggle.setAttribute('aria-label', this.unread ? `채팅, 읽지 않은 메시지 ${this.unread}개` : '채팅');
  }

  showPreview(m) {
    if (this.muted) return;
    this.preview.textContent = `${this.names.get(m.by) || m.name}: ${m.text}`;
    this.preview.hidden = false;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.preview.hidden = true, 3500);
  }

  scroll() { this.log.scrollTop = this.log.scrollHeight; }

  async submit(raw) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || this.sending) return;
    if (Array.from(text).length > MAX) return this.fail(`메시지는 ${MAX}자까지 보낼 수 있어요.`);
    this.sending = true;
    this.error.hidden = true;
    try {
      const next = await this.send(text, this.lastId);
      if (raw === this.input.value) this.input.value = '';
      this.update(next);
      this.markRead();
    } catch (error) {
      this.fail(error.message);
    } finally {
      this.sending = false;
    }
  }

  fail(message) {
    this.error.textContent = message;
    this.error.hidden = false;
  }
}
