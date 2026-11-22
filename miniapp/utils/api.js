// 数据层：小程序直接通过 wx.request 调用本地 OpeniLink Hub。
// 登录态（Hub session token）保存在本地存储，并以 Cookie: session=<token> 发给 Hub。
const config = require('../config');
const demo = require('./demo');

const TOKEN_KEY = 'hub_session_token';
const SCAN_KEY = 'hub_scan_session';

// 按运行环境选择 Hub 地址：
// - 开发者工具模拟器（platform === 'devtools'）跑在电脑上 → 127.0.0.1
// - 手机真机（预览 / 真机调试）→ 电脑的局域网 IP（手机上的 127.0.0.1 是手机自己）
function detectPlatform() {
  try {
    if (wx.getDeviceInfo) return wx.getDeviceInfo().platform;
    return wx.getSystemInfoSync().platform;
  } catch (e) {
    return '';
  }
}

const PLATFORM = detectPlatform();
const IS_DEVTOOLS = PLATFORM === 'devtools';
const BASE = String((IS_DEVTOOLS ? config.devtoolsBaseUrl : config.deviceBaseUrl) || config.hubBaseUrl || '').replace(/\/+$/, '');
const enc = encodeURIComponent;

console.info('[api] platform=' + (PLATFORM || 'unknown') + ', Hub=' + BASE);

// ---------------------------------------------------------------- 演示模式

function isDemo() {
  if (config.demo === true) return true;
  if (config.demo === false) return false;
  const app = getApp();
  return !!(app && app.globalData && app.globalData.demo);
}

function switchToDemo(reason) {
  if (config.demo === false) return false;
  // 真机调试/预览时不自动降级：把真实的网络错误展示出来，方便排查
  if (!IS_DEVTOOLS && PLATFORM) return false;
  const app = getApp();
  // 已经成功连上过 Hub，说明是临时故障，不降级
  if (app && app.globalData && app.globalData.hubOk) return false;
  if (app && app.globalData && !app.globalData.demo) {
    app.globalData.demo = true;
    console.warn('[api] 连不上 Hub，切换到演示模式：', reason);
  }
  return true;
}

// ---------------------------------------------------------------- HTTP

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(t) {
  if (t) wx.setStorageSync(TOKEN_KEY, t);
  else wx.removeStorageSync(TOKEN_KEY);
}

function request(method, path, body, opts) {
  const o = opts || {};
  return new Promise((resolve, reject) => {
    const header = { Accept: 'application/json' };
    if (body !== undefined) header['Content-Type'] = 'application/json';
    const token = o.token !== undefined ? o.token : getToken();
    if (token && o.auth !== false) header.Cookie = 'session=' + token;

    wx.request({
      url: BASE + path,
      method,
      data: body,
      header,
      timeout: config.timeout,
      success(res) {
        const app = getApp();
        if (app && app.globalData) app.globalData.hubOk = true;
        const data = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        let msg = 'HTTP ' + res.statusCode;
        if (data && typeof data === 'object' && (data.error || data.message)) msg = data.error || data.message;
        else if (typeof data === 'string' && data) {
          try { const j = JSON.parse(data); msg = j.error || j.message || msg; } catch (e) { /* ignore */ }
        }
        if (res.statusCode === 401) {
          setToken('');
          reject({ code: 'UNAUTHORIZED', status: 401, message: '登录已失效，请重新扫码' });
          return;
        }
        reject({ code: 'HUB_ERROR', status: res.statusCode, message: msg });
      },
      fail(err) {
        const raw = (err && err.errMsg) || '';
        let message = '无法连接 Hub（' + BASE + '）';
        if (raw.indexOf('url not in domain list') >= 0 || raw.indexOf('合法域名') >= 0) {
          message = 'Hub 地址不在合法域名列表：请在开发者工具「详情 → 本地设置」勾选「不校验合法域名」，真机需打开「开发调试」';
        } else if (raw.indexOf('timeout') >= 0 && !IS_DEVTOOLS) {
          message = '手机连不上 Hub（' + BASE + '，请求超时）：请确认手机与电脑在同一网络，并用手机浏览器打开 ' + BASE + '/api/info 测试';
        }
        console.error('[api] ' + method + ' ' + BASE + path + ' 失败：' + raw);
        reject({ code: 'NETWORK', status: 0, message, raw });
      },
    });
  });
}

function qrImageURL(qrUrl) {
  return qrUrl ? BASE + '/api/qr.png?size=480&text=' + enc(qrUrl) : '';
}

// ---------------------------------------------------------------- 字段裁剪

function pickUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at };
}

function pickMessage(m) {
  return {
    id: m.id,
    direction: m.direction,
    from_user_id: m.from_user_id,
    to_user_id: m.to_user_id || '',
    item_list: Array.isArray(m.item_list) ? m.item_list.map((it) => ({
      type: it.type,
      text: it.text || '',
      file_name: it.file_name || '',
    })) : [],
    media_status: m.media_status || '',
    created_at: m.created_at,
  };
}

function pickInstallation(i) {
  return {
    id: i.id,
    app_id: i.app_id,
    app_name: i.app_name || '',
    app_slug: i.app_slug || '',
    app_icon: i.app_icon || '',
    app_icon_url: i.app_icon_url || '',
    handle: i.handle || '',
    enabled: !!i.enabled,
    created_at: i.created_at,
  };
}

function pollResult(res, lastQrUrl) {
  if (res.status === 'error') {
    return Promise.reject({ code: 'SCAN_FAILED', message: res.message || '扫码失败' });
  }
  const out = { status: res.status || 'wait' };
  if (res.qr_url && res.qr_url !== lastQrUrl) {
    out.qrUrl = res.qr_url;
    out.qrImage = qrImageURL(res.qr_url);
  }
  return Promise.resolve(out);
}

function expired(err) {
  if (err && err.status === 404) return Promise.reject({ code: 'SCAN_EXPIRED', status: 404, message: '二维码已失效，请刷新' });
  return Promise.reject(err);
}

// ---------------------------------------------------------------- 操作

const actions = {
  status() {
    if (!getToken()) return Promise.resolve({ loggedIn: false });
    return request('GET', '/api/me')
      .then((me) => ({ loggedIn: true, user: pickUser(me) }))
      .catch((e) => {
        if (e.code === 'UNAUTHORIZED') return { loggedIn: false };
        throw e;
      });
  },

  scanStart() {
    return request('POST', '/api/auth/scan/start', {}, { auth: false }).then((res) => {
      if (!res.poll_token) {
        throw { code: 'HUB_OUTDATED', message: 'Hub 版本过旧，缺少扫码轮询接口（/api/auth/scan/poll）' };
      }
      wx.setStorageSync(SCAN_KEY, { id: res.session_id, token: res.poll_token });
      return { sessionId: res.session_id, qrUrl: res.qr_url, qrImage: qrImageURL(res.qr_url) };
    });
  },

  scanPoll(data) {
    const s = wx.getStorageSync(SCAN_KEY) || {};
    if (!s.id || s.id !== data.sessionId) {
      return Promise.reject({ code: 'SCAN_EXPIRED', message: '扫码会话已失效，请重新获取二维码' });
    }
    return request('GET', '/api/auth/scan/poll/' + enc(s.id) + '?token=' + enc(s.token), undefined, { auth: false })
      .catch(expired)
      .then((res) => {
        if (res.status === 'connected' && res.session_token) {
          setToken(res.session_token);
          wx.removeStorageSync(SCAN_KEY);
          return { status: 'connected', botId: res.bot_id, isNew: !!res.is_new };
        }
        return pollResult(res, data.lastQrUrl);
      });
  },

  bindStart() {
    return request('POST', '/api/bots/bind/start', {}).then((res) => ({
      sessionId: res.session_id,
      qrUrl: res.qr_url,
      qrImage: qrImageURL(res.qr_url),
    }));
  },

  bindPoll(data) {
    return request('GET', '/api/bots/bind/poll/' + enc(data.sessionId))
      .catch((e) => (e.code === 'UNAUTHORIZED' ? Promise.reject(e) : expired(e)))
      .then((res) => {
        if (res.status === 'connected') return { status: 'connected', botId: res.bot_id, isNew: !!res.is_new };
        return pollResult(res, data.lastQrUrl);
      });
  },

  overview() {
    return Promise.all([
      request('GET', '/api/me'),
      request('GET', '/api/bots'),
      request('GET', '/api/bots/stats').catch(() => null),
    ]).then(([me, bots, stats]) => ({ user: pickUser(me), bots: bots || [], stats }));
  },

  botDetail(data) {
    const id = enc(data.botId);
    return Promise.all([
      request('GET', '/api/bots'),
      request('GET', '/api/bots/' + id + '/quota').catch(() => null),
      request('GET', '/api/bots/' + id + '/contacts').catch(() => []),
      request('GET', '/api/bots/' + id + '/apps').catch(() => []),
      request('GET', '/api/bots/' + id + '/messages?limit=20').catch(() => null),
    ]).then(([bots, quota, contacts, apps, messages]) => {
      const bot = (bots || []).find((b) => b.id === data.botId);
      if (!bot) throw { code: 'NOT_FOUND', status: 404, message: 'ClawBot 不存在或无权查看' };
      return {
        bot,
        quota,
        contacts: contacts || [],
        apps: (apps || []).map(pickInstallation),
        messages: messages ? (messages.messages || []).map(pickMessage) : [],
        nextCursor: messages ? messages.next_cursor || '' : '',
        hasMore: messages ? !!messages.has_more : false,
      };
    });
  },

  messages(data) {
    let path = '/api/bots/' + enc(data.botId) + '/messages?limit=20';
    if (data.cursor) path += '&cursor=' + enc(data.cursor);
    return request('GET', path).then((res) => ({
      messages: (res.messages || []).map(pickMessage),
      nextCursor: res.next_cursor || '',
      hasMore: !!res.has_more,
    }));
  },

  reconnect(data) {
    return request('POST', '/api/bots/' + enc(data.botId) + '/reconnect', {}).then(() => ({ ok: true }));
  },

  logout() {
    const done = () => {
      setToken('');
      wx.removeStorageSync(SCAN_KEY);
      return { ok: true };
    };
    if (!getToken()) return Promise.resolve(done());
    return request('POST', '/api/auth/logout', {}).then(done, done);
  },
};

// 统一调用入口，返回 data 或抛出 { code, message }。
function call(action, data) {
  if (isDemo()) return demo.call(action, data);
  const fn = actions[action];
  if (!fn) return Promise.reject({ code: 'BAD_ACTION', message: '未知操作：' + action });
  return fn(data || {}).catch((err) => {
    // 连不上 Hub（未启动 / 地址不可达）→ 自动降级为演示
    if (err && err.code === 'NETWORK' && switchToDemo(err.raw || err.message)) {
      return demo.call(action, data);
    }
    throw err;
  });
}

function isUnauthorized(err) {
  return !!err && (err.code === 'UNAUTHORIZED' || err.status === 401);
}

// 未登录时统一跳转到扫码登录页
function goLogin() {
  wx.reLaunch({ url: '/pages/scan/scan?mode=login' });
}

module.exports = { call, isDemo, isUnauthorized, goLogin, hubBaseUrl: BASE };
