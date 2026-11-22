// Cloud function "hub": BFF between the mini program and an OpeniLink Hub server.
//
// Identity: the caller's WeChat OPENID (injected by CloudBase, trustworthy).
// Each OPENID maps to at most one Hub session token, stored in the
// `hub_sessions` collection (admin-only; the client never sees the token).
//
// Required env var: HUB_BASE_URL, e.g. https://hub.example.com

const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');
const QRCode = require('qrcode');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLL = 'hub_sessions';

const HUB_BASE_URL = (process.env.HUB_BASE_URL || '').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.HUB_TIMEOUT_MS || 15000);

// ---------------------------------------------------------------- helpers

class HubError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status || 0;
    this.code = code || 'HUB_ERROR';
  }
}

function hubRequest(method, path, { token, body } = {}) {
  if (!HUB_BASE_URL) {
    return Promise.reject(new HubError('云函数未配置 HUB_BASE_URL', 0, 'NOT_CONFIGURED'));
  }
  const url = new URL(HUB_BASE_URL + path);
  const lib = url.protocol === 'https:' ? https : http;
  const payload = body === undefined ? null : JSON.stringify(body);
  const headers = { Accept: 'application/json' };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  if (token) headers.Cookie = 'session=' + token;

  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers, timeout: REQUEST_TIMEOUT_MS }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        const msg = (data && (data.error || data.message)) || ('HTTP ' + res.statusCode);
        const code = res.statusCode === 401 ? 'UNAUTHORIZED' : 'HUB_ERROR';
        reject(new HubError(msg, res.statusCode, code));
      });
    });
    req.on('timeout', () => req.destroy(new HubError('连接 Hub 超时', 0, 'TIMEOUT')));
    req.on('error', (err) => {
      if (err instanceof HubError) return reject(err);
      // AggregateError (happy-eyeballs) has an empty message; fall back to code.
      const detail = err.message || err.code || (err.errors && err.errors[0] && err.errors[0].message) || 'unknown';
      reject(new HubError('无法连接 Hub：' + detail, 0, 'NETWORK'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureCollection() {
  try {
    await db.createCollection(COLL);
  } catch (e) {
    // already exists → fine
  }
}

async function getDoc(openid) {
  try {
    const res = await db.collection(COLL).doc(openid).get();
    return res.data || null;
  } catch (e) {
    if (String(e.errMsg || e.message).includes('not exist') || e.errCode === -502005) {
      await ensureCollection();
    }
    return null;
  }
}

async function saveDoc(openid, patch) {
  const now = Date.now();
  const existing = await getDoc(openid);
  const data = Object.assign({}, existing || {}, patch, { updated_at: now });
  delete data._id;
  delete data._openid;
  if (!existing) data.created_at = now;
  await db.collection(COLL).doc(openid).set({ data });
  return data;
}

async function requireSession(openid) {
  const doc = await getDoc(openid);
  if (!doc || !doc.session_token) throw new HubError('未登录', 401, 'UNAUTHORIZED');
  return doc;
}

// Calls Hub with the user's session; clears the stored token on 401.
async function authed(openid, method, path, body) {
  const doc = await requireSession(openid);
  try {
    return await hubRequest(method, path, { token: doc.session_token, body });
  } catch (e) {
    if (e.status === 401) {
      await saveDoc(openid, { session_token: '', hub_user_id: '' });
    }
    throw e;
  }
}

async function qrImage(url) {
  if (!url) return '';
  return QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M' });
}

const enc = encodeURIComponent;

// ------------------------------------------------------------- sanitizers

function pickUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    created_at: u.created_at,
  };
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

// ---------------------------------------------------------------- actions

const actions = {
  // Is this WeChat user linked to a Hub account?
  async status({ openid }) {
    const doc = await getDoc(openid);
    if (!doc || !doc.session_token) return { loggedIn: false };
    try {
      const me = await hubRequest('GET', '/api/me', { token: doc.session_token });
      return { loggedIn: true, user: pickUser(me) };
    } catch (e) {
      if (e.status === 401) {
        await saveDoc(openid, { session_token: '', hub_user_id: '' });
        return { loggedIn: false };
      }
      throw e;
    }
  },

  // Step 1 of scan login: get an iLink QR code.
  async scanStart({ openid }) {
    const res = await hubRequest('POST', '/api/auth/scan/start', { body: {} });
    if (!res.poll_token) {
      throw new HubError('Hub 版本过旧，缺少扫码轮询接口（/api/auth/scan/poll）', 0, 'HUB_OUTDATED');
    }
    await saveDoc(openid, { scan_session_id: res.session_id, scan_poll_token: res.poll_token });
    return { sessionId: res.session_id, qrUrl: res.qr_url, qrImage: await qrImage(res.qr_url) };
  },

  // Step 2: poll until the user confirms on their phone.
  async scanPoll({ openid, data }) {
    const doc = await getDoc(openid);
    if (!doc || !doc.scan_session_id || doc.scan_session_id !== data.sessionId) {
      throw new HubError('扫码会话已失效，请重新获取二维码', 404, 'SCAN_EXPIRED');
    }
    let res;
    try {
      res = await hubRequest('GET', '/api/auth/scan/poll/' + enc(doc.scan_session_id) + '?token=' + enc(doc.scan_poll_token));
    } catch (e) {
      if (e.status === 404) throw new HubError('二维码已失效，请刷新', 404, 'SCAN_EXPIRED');
      throw e;
    }
    if (res.status === 'connected' && res.session_token) {
      let user = null;
      try { user = pickUser(await hubRequest('GET', '/api/me', { token: res.session_token })); } catch (e) { /* ignore */ }
      await saveDoc(openid, {
        session_token: res.session_token,
        hub_user_id: user ? user.id : '',
        scan_session_id: '',
        scan_poll_token: '',
      });
      return { status: 'connected', botId: res.bot_id, isNew: !!res.is_new, user };
    }
    return pollResponse(res, data.lastQrUrl);
  },

  // Bind an additional ClawBot to the logged-in account.
  async bindStart({ openid }) {
    const res = await authed(openid, 'POST', '/api/bots/bind/start', {});
    await saveDoc(openid, { bind_session_id: res.session_id });
    return { sessionId: res.session_id, qrUrl: res.qr_url, qrImage: await qrImage(res.qr_url) };
  },

  async bindPoll({ openid, data }) {
    const doc = await requireSession(openid);
    if (!doc.bind_session_id || doc.bind_session_id !== data.sessionId) {
      throw new HubError('绑定会话已失效，请重新获取二维码', 404, 'SCAN_EXPIRED');
    }
    let res;
    try {
      res = await authed(openid, 'GET', '/api/bots/bind/poll/' + enc(doc.bind_session_id));
    } catch (e) {
      if (e.status === 404) throw new HubError('二维码已失效，请刷新', 404, 'SCAN_EXPIRED');
      throw e;
    }
    if (res.status === 'connected') {
      await saveDoc(openid, { bind_session_id: '' });
      return { status: 'connected', botId: res.bot_id, isNew: !!res.is_new };
    }
    return pollResponse(res, data.lastQrUrl);
  },

  // Home: user + bots + stats.
  async overview({ openid }) {
    const [me, bots, stats] = await Promise.all([
      authed(openid, 'GET', '/api/me'),
      authed(openid, 'GET', '/api/bots'),
      authed(openid, 'GET', '/api/bots/stats').catch(() => null),
    ]);
    return { user: pickUser(me), bots: bots || [], stats };
  },

  // Detail page: one bot + quota + contacts + apps + first page of messages.
  async botDetail({ openid, data }) {
    const id = enc(data.botId);
    const [bots, quota, contacts, apps, messages] = await Promise.all([
      authed(openid, 'GET', '/api/bots'),
      authed(openid, 'GET', '/api/bots/' + id + '/quota').catch(() => null),
      authed(openid, 'GET', '/api/bots/' + id + '/contacts').catch(() => []),
      authed(openid, 'GET', '/api/bots/' + id + '/apps').catch(() => []),
      authed(openid, 'GET', '/api/bots/' + id + '/messages?limit=20').catch(() => null),
    ]);
    const bot = (bots || []).find((b) => b.id === data.botId);
    if (!bot) throw new HubError('ClawBot 不存在或无权查看', 404, 'NOT_FOUND');
    return {
      bot,
      quota,
      contacts: contacts || [],
      apps: (apps || []).map(pickInstallation),
      messages: messages ? (messages.messages || []).map(pickMessage) : [],
      nextCursor: messages ? messages.next_cursor || '' : '',
      hasMore: messages ? !!messages.has_more : false,
    };
  },

  async messages({ openid, data }) {
    let path = '/api/bots/' + enc(data.botId) + '/messages?limit=20';
    if (data.cursor) path += '&cursor=' + enc(data.cursor);
    const res = await authed(openid, 'GET', path);
    return {
      messages: (res.messages || []).map(pickMessage),
      nextCursor: res.next_cursor || '',
      hasMore: !!res.has_more,
    };
  },

  async reconnect({ openid, data }) {
    await authed(openid, 'POST', '/api/bots/' + enc(data.botId) + '/reconnect', {});
    return { ok: true };
  },

  async logout({ openid }) {
    const doc = await getDoc(openid);
    if (doc && doc.session_token) {
      try { await hubRequest('POST', '/api/auth/logout', { token: doc.session_token, body: {} }); } catch (e) { /* ignore */ }
    }
    if (doc) await db.collection(COLL).doc(openid).remove();
    return { ok: true };
  },
};

async function pollResponse(res, lastQrUrl) {
  if (res.status === 'error') {
    throw new HubError(res.message || '扫码失败', 0, 'SCAN_FAILED');
  }
  const out = { status: res.status || 'wait' };
  // QR was refreshed by Hub → render the new one.
  if (res.qr_url && res.qr_url !== lastQrUrl) {
    out.qrUrl = res.qr_url;
    out.qrImage = await qrImage(res.qr_url);
  }
  return out;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event && event.action;
  if (!OPENID) return { ok: false, code: 'NO_OPENID', message: '无法识别微信用户' };
  const handler = actions[action];
  if (!handler) return { ok: false, code: 'BAD_ACTION', message: '未知操作：' + action };
  try {
    const data = await handler({ openid: OPENID, data: (event && event.data) || {} });
    return { ok: true, data };
  } catch (e) {
    console.error('[hub]', action, e.code || '', e.status || '', e.message);
    return { ok: false, code: e.code || 'INTERNAL', status: e.status || 0, message: e.message || '服务异常' };
  }
};

// Exposed for local tests.
exports._internal = { hubRequest, pickMessage, pickInstallation, pickUser };
