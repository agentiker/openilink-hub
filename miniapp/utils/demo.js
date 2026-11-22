// 演示数据：没有云开发环境（例如 WorkBuddy 预览、试用小程序、touristappid）时，
// 用本地假数据跑通 扫码登录 → 列表 → 详情 的完整流程。
const DEMO_KEY = 'clawbot_demo_login';

function now() {
  return Math.floor(Date.now() / 1000);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isLoggedIn() {
  return !!wx.getStorageSync(DEMO_KEY);
}

function makeBots() {
  const t = now();
  return [
    {
      id: 'demo-bot-1',
      name: '',
      display_name: '我的 ClawBot',
      provider: 'ilink',
      status: 'connected',
      can_send: true,
      ai_enabled: true,
      ai_model: 'deepseek-chat',
      msg_count: 128,
      reminder_hours: 23,
      last_msg_at: t - 3 * 3600,
      created_at: t - 6 * 86400,
      extra: { bot_id: 'a3f9c2d17be84e10@im.bot', ilink_user_id: 'ultraman01@im.wechat' },
    },
    {
      id: 'demo-bot-2',
      name: '',
      display_name: '工作号助手',
      provider: 'ilink',
      status: 'connected',
      can_send: false,
      send_disabled_reason: '暂无法发送：需要先收到用户消息',
      ai_enabled: false,
      ai_model: '',
      msg_count: 37,
      reminder_hours: 0,
      last_msg_at: t - 22 * 3600 - 1200,
      created_at: t - 2 * 86400,
      extra: { bot_id: '7be84e10a3f9c2d1@im.bot', ilink_user_id: 'o9cq80Zx2kLmPq81-Aa3Rtyu12@im.wechat' },
    },
    {
      id: 'demo-bot-3',
      name: '',
      display_name: '旧手机',
      provider: 'ilink',
      status: 'session_expired',
      can_send: false,
      send_disabled_reason: '会话已过期，请先在微信中发送一条消息以恢复连接，若仍无法恢复请重新扫码绑定',
      ai_enabled: false,
      ai_model: '',
      msg_count: 5,
      reminder_hours: 22,
      last_msg_at: t - 3 * 86400,
      created_at: t - 20 * 86400,
      extra: { bot_id: 'c2d17be84e10a3f9@im.bot', ilink_user_id: 'o9cq80Qa7wErTy55-Pp0Lkjh34@im.wechat' },
    },
  ];
}

const TEXTS = [
  '今天天气怎么样？',
  '上海今天多云，18~24℃，适合出门。',
  '帮我记一笔：午饭 32 元',
  '已记账：餐饮 ¥32.00，本月餐饮合计 ¥856.00',
  '/github 最近的 PR',
  'openilink-hub #142 feat: HTTP poll endpoints for scan login（open）',
  '提醒我 3 点开会',
  '好的，今天 15:00 提醒你「开会」',
];

function makeMessages(botId, page) {
  const t = now();
  const list = [];
  for (let i = 0; i < 20; i++) {
    const n = page * 20 + i;
    const inbound = n % 2 === 0;
    list.push({
      id: 10000 - n,
      direction: inbound ? 'inbound' : 'outbound',
      from_user_id: inbound ? 'ultraman01@im.wechat' : botId,
      to_user_id: inbound ? '' : 'ultraman01@im.wechat',
      item_list: n % 7 === 3 ? [{ type: 'image', text: '', file_name: '' }] : [{ type: 'text', text: TEXTS[n % TEXTS.length], file_name: '' }],
      media_status: '',
      created_at: t - 3 * 3600 - n * 600,
    });
  }
  return { messages: list, nextCursor: page < 2 ? 'demo-' + (page + 1) : '', hasMore: page < 2 };
}

const scanSessions = {};

const handlers = {
  status() {
    return isLoggedIn()
      ? { loggedIn: true, user: { id: 'demo', username: 'ilink_a3f9c2d1', display_name: '演示用户', role: 'admin' } }
      : { loggedIn: false };
  },

  scanStart() {
    const id = 'demo-' + Date.now();
    scanSessions[id] = 0;
    return { sessionId: id, qrUrl: 'https://example.com/demo', qrImage: '/assets/demo-qr.png' };
  },

  scanPoll(data) {
    const n = (scanSessions[data.sessionId] || 0) + 1;
    scanSessions[data.sessionId] = n;
    if (n < 3) return { status: 'wait' };
    if (n < 5) return { status: 'scanned' };
    wx.setStorageSync(DEMO_KEY, 1);
    return { status: 'connected', botId: 'demo-bot-1', isNew: false };
  },

  bindStart() {
    return handlers.scanStart();
  },

  bindPoll(data) {
    const r = handlers.scanPoll(data);
    if (r.status === 'connected') r.botId = 'demo-bot-2';
    return r;
  },

  overview() {
    if (!isLoggedIn()) throw { code: 'UNAUTHORIZED', status: 401, message: '未登录' };
    return {
      user: { id: 'demo', username: 'ilink_a3f9c2d1', display_name: '演示用户', role: 'admin' },
      bots: makeBots(),
      stats: { total_bots: 3, online_bots: 2, total_messages: 170, total_installations: 4 },
    };
  },

  botDetail(data) {
    if (!isLoggedIn()) throw { code: 'UNAUTHORIZED', status: 401, message: '未登录' };
    const bot = makeBots().find((b) => b.id === data.botId) || makeBots()[0];
    const t = now();
    const m = makeMessages(bot.id, 0);
    return {
      bot,
      quota: {
        enabled: true,
        limit: 10,
        recipients: [
          { recipient: 'ultraman01@im.wechat', limit: 10, used: 4, remaining: 6, pending: 0 },
          { recipient: 'o9cq80Zx2kLmPq81-Aa3Rtyu12@im.wechat', limit: 10, used: 9, remaining: 1, pending: 2 },
        ],
      },
      contacts: [
        { user_id: 'ultraman01@im.wechat', msg_count: 96, last_msg_at: t - 3 * 3600 },
        { user_id: 'o9cq80Zx2kLmPq81-Aa3Rtyu12@im.wechat', msg_count: 25, last_msg_at: t - 9 * 3600 },
        { user_id: 'o9cq80Qa7wErTy55-Pp0Lkjh34@im.wechat', msg_count: 7, last_msg_at: t - 2 * 86400 },
      ],
      apps: [
        { id: 'i1', app_name: '天气', app_icon: '🌤', handle: 'weather', enabled: true },
        { id: 'i2', app_name: '记账', app_icon: '💰', handle: 'ledger', enabled: true },
        { id: 'i3', app_name: 'GitHub', app_icon: '🐙', handle: 'github', enabled: true },
        { id: 'i4', app_name: '飞书互通', app_icon: '', handle: 'feishu', enabled: false },
      ],
      messages: m.messages,
      nextCursor: m.nextCursor,
      hasMore: m.hasMore,
    };
  },

  messages(data) {
    const page = Number(String(data.cursor || 'demo-1').replace('demo-', '')) || 1;
    return makeMessages(data.botId, page);
  },

  reconnect() {
    return { ok: true };
  },

  logout() {
    wx.removeStorageSync(DEMO_KEY);
    return { ok: true };
  },
};

function call(action, data) {
  const h = handlers[action];
  if (!h) return Promise.reject({ code: 'BAD_ACTION', message: '未知操作：' + action });
  return delay(350).then(() => h(data || {}));
}

module.exports = { call };
