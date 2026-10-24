export class ApiError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}
export class Api {
  csrf = '';
  initializing = null;
  async call(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...options,
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new ApiError(data.error || '요청을 처리하지 못했어요.', data.kind, response.status);
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('연결을 확인해 주세요. 미완료 작업은 이 화면에 유지돼요.', 'network', 0);
    } finally {
      clearTimeout(timer);
    }
  }
  async init() {
    if (!this.initializing) {
      this.initializing = this.call('api/index.php?action=init').then(data => {
        this.csrf = data.csrf;
      }).finally(() => { this.initializing = null; });
    }
    return this.initializing;
  }
  state(code) {
    return this.call(`api/index.php?action=state&code=${encodeURIComponent(code)}`);
  }
  async post(data) {
    if (!this.csrf) await this.init();
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrf
      },
      body: JSON.stringify(data)
    };
    try {
      return await this.call('api/index.php', options);
    } catch (error) {
      if (error.kind === 'session') {
        await this.init();
        options.headers['X-CSRF-Token'] = this.csrf;
        return await this.call('api/index.php', options);
      }
      // 네트워크에서 응답만 잃었을 수 있으므로 같은 actionId로 한 번 재시도한다.
      if (error.kind !== 'network') throw error;
      return await this.call('api/index.php', options);
    }
  }
}
export function actionId() {
  return crypto.randomUUID?.() || `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

