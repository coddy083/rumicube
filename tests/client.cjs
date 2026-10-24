const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '..', 'assets/js', name), 'utf8');
(async () => {
  const {Api, ApiError} = await import('data:text/javascript;base64,' + Buffer.from(source('api.js')).toString('base64'));
  const originalFetch = global.fetch;
  const requests = [];
  let responses = [new Error('offline'), {csrf: 'token-1'}, {ok: true}];
  global.fetch = async (url, options) => {
    requests.push({url, options: structuredClone({headers: options.headers, body: options.body})});
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return {ok: next.status ? false : true, status: next.status || 200, json: async () => next};
  };
  try {
    const api = new Api();
    await assert.rejects(api.init(), error => error.kind === 'network');
    await api.post({action: 'ready', actionId: 'request-00001'});
    assert.equal(api.csrf, 'token-1');
    assert.equal(requests.at(-1).options.headers['X-CSRF-Token'], 'token-1');
    console.log('PASS First init failure recovers before mutation');
    responses = [{error: 'expired', kind: 'session', status: 403}, {csrf: 'token-2'}, {ok: true}];
    await api.post({action: 'ready', actionId: 'request-00002'});
    const sessionPosts = requests.filter(r => r.options.body?.includes('request-00002'));
    assert.equal(sessionPosts.length, 2);
    assert.equal(sessionPosts[0].options.body, sessionPosts[1].options.body);
    assert.equal(sessionPosts[1].options.headers['X-CSRF-Token'], 'token-2');
    console.log('PASS Session recovery retries the identical action');
    responses = [new Error('response lost'), {ok: true}];
    await api.post({action: 'draw', actionId: 'request-00003'});
    const drawPosts = requests.filter(r => r.options.body?.includes('request-00003'));
    assert.equal(drawPosts.length, 2);
    assert.equal(drawPosts[0].options.body, drawPosts[1].options.body);
    console.log('PASS Network recovery retains original action ID');
    responses = [{csrf: 'token-3'}];
    const before = requests.length;
    await Promise.all([api.init(), api.init(), api.init()]);
    assert.equal(requests.length - before, 1);
    console.log('PASS Concurrent initialization shares one request');
  } finally { global.fetch = originalFetch; }

  const elements = {};
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.disabled = false; this.classList = {toggle() {}}; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text || ''; }
    set innerHTML(value) {
      this.html = value;
      if (this === elements['#main']) {
        elements['#game-error'] = new Element(); elements['#entry-error'] = new Element();
        this.buttons = [new Element(), new Element()]; this.buttons[0].disabled = true;
      }
    }
    append(...items) { this.children.push(...items); }
    setAttribute() {} removeAttribute() {} focus() {} addEventListener() {}
    querySelector() { return null; }
    querySelectorAll(selector) {
      if (selector !== 'button') return [];
      return [...(this.buttons || []), ...elements['#game-error'].children, ...elements['#entry-error'].children].filter(x => x instanceof Element);
    }
  }
  for (const selector of ['#main', '#modal', '#connection', '#notice', '#nickname', '#game-error', '#entry-error', '#close-modal', '#rules-button', '.brand']) elements[selector] = new Element();
  const data = new Map();
  const mock = {csrf: 'ready', posts: [], initFailures: 0, initCount: 0, stateFailure: false, nextRevision: 3, postFailure: false};
  class MockApi {
    get csrf() { return mock.csrf; }
    async init() { mock.initCount++; if (mock.initFailures-- > 0) throw new ApiError('offline', 'network', 0); mock.csrf = 'recovered'; }
    async post(payload) { mock.posts.push(payload); if (mock.postFailure) throw new ApiError('offline', 'network', 0); return {code: 'ABC234', revision: mock.nextRevision, status: 'lobby'}; }
    async state() { if (mock.stateFailure) throw new ApiError('offline', 'network', 0); return {code: 'ABC234', revision: mock.nextRevision, status: 'lobby'}; }
  }
  const context = {
    Api: MockApi, TileDrag: class {cancel() {}}, Chat: class {lastId = 0; update() {}},
    document: {querySelector: key => elements[key], activeElement: null, hidden: false, addEventListener() {}, createElement: () => new Element()},
    window: {addEventListener() {}}, location: {pathname: '/', search: ''}, history: {replaceState() {}},
    localStorage: {getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)},
    URLSearchParams, clearTimeout() {}, setTimeout() { return 1; },
    home: () => 'home', lobby: () => 'lobby', game: () => 'game', result: () => 'result',
    actionId: () => 'new-request-0001', assert, mock
  };
  vm.createContext(context);
  vm.runInContext(source('main.js').replace(/^import\s[\s\S]*?;\n/gm, '').replace(/^boot\(\);/m, ''), context);
  const run = code => vm.runInContext(code, context);
  run(`accept({code:'ABC234',revision:1,status:'lobby'},true); pending={action:'ready',code:'ABC234',revision:1,actionId:'original-request-0001'}; lastError='offline'; render();`);
  const retryCount = () => elements['#game-error'].children.filter(x => x.dataset?.action === 'retry').length;
  assert.equal(retryCount(), 1);
  run(`accept({code:'ABC234',revision:2,status:'lobby'});`);
  assert.equal(retryCount(), 1);
  assert.equal(run('pending.actionId'), 'original-request-0001');
  console.log('PASS Re-render retains pending request and retry button');
  await run('refresh()');
  assert.equal(mock.posts[0].actionId, 'original-request-0001');
  assert.equal(run('pending'), null);
  assert.equal(elements['#main'].buttons[0].disabled, true);
  assert.equal(elements['#main'].buttons[1].disabled, false);
  console.log('PASS Poll resolves pending action and restores correct button states');
  mock.postFailure = true;
  run(`pending={action:'ready',code:'ABC234',revision:3,actionId:'original-request-0002'};`);
  await run('refresh()');
  run('render(); render();');
  assert.equal(retryCount(), 1);
  assert.equal(elements['#game-error'].children.at(-1).type, 'button');
  console.log('PASS Repeated network failures preserve a single non-submit retry button');
  mock.postFailure = false;
  run('leaveLocal()');
  mock.csrf = ''; mock.initFailures = 1; const initBefore = mock.initCount;
  await run('refresh()'); await run('refresh()');
  assert.equal(mock.initCount - initBefore, 2);
  assert.equal(mock.csrf, 'recovered');
  console.log('PASS Background refresh restores initial connection without a room');
  mock.stateFailure = true;
  run(`code='ABC234'; localStorage.setItem(storageKey,code);`);
  await run('boot()');
  assert.equal(run('code'), 'ABC234');
  assert.equal(data.get('tile-room:/'), 'ABC234');
  mock.stateFailure = false;
  await run('refresh()');
  assert.equal(run('state.code'), 'ABC234');
  console.log('PASS Temporary startup outage preserves and restores saved room');
  console.log('Client regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
