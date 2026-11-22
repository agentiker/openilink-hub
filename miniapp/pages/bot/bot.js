const api = require('../../utils/api');
const fmt = require('../../utils/format');

function decorateMessage(m) {
  const inbound = m.direction === 'inbound';
  return {
    id: m.id,
    inbound,
    peer: fmt.shortId(inbound ? m.from_user_id : m.to_user_id, 4) || (inbound ? '用户' : 'Bot'),
    text: fmt.messagePreview(m.item_list),
    time: fmt.fmtTime(m.created_at),
    mediaPending: m.media_status === 'pending' || m.media_status === 'failed',
  };
}

function decorateQuota(q) {
  if (!q || !q.enabled) return { enabled: false, list: [] };
  const list = (q.recipients || []).map((r) => ({
    recipient: fmt.shortId(r.recipient, 4),
    used: r.used,
    limit: r.limit,
    remaining: r.remaining,
    pending: r.pending,
    percent: r.limit ? Math.round((r.used / r.limit) * 100) : 0,
    level: r.remaining <= 0 ? 'danger' : (r.remaining <= 2 ? 'warn' : 'ok'),
  }));
  return { enabled: true, limit: q.limit, list };
}

Page({
  data: {
    viewState: 'loading',
    errorText: '',
    tab: 'messages', // messages | contacts | apps
    bot: null,
    info: null,
    win: null,
    quota: { enabled: false, list: [] },
    contacts: [],
    apps: [],
    messages: [],
    hasMore: false,
    loadingMore: false,
    reconnecting: false,
    demo: false,
  },

  onLoad(query) {
    this.botId = decodeURIComponent(query.id || '');
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.tab === 'messages') this.loadMore();
  },

  load() {
    if (!this.data.bot) this.setData({ viewState: 'loading' });
    return api.call('botDetail', { botId: this.botId })
      .then((r) => {
        const bot = r.bot;
        const extra = bot.extra || {};
        const meta = fmt.statusMeta(bot.status);
        const name = fmt.botName(bot);
        wx.setNavigationBarTitle({ title: name });
        this.cursor = r.nextCursor;
        this.setData({
          demo: api.isDemo(),
          viewState: 'ready',
          bot,
          info: {
            name,
            statusLabel: meta.label,
            statusCls: meta.cls,
            botId: extra.bot_id || '-',
            ilinkUserId: extra.ilink_user_id || '-',
            hubId: bot.id,
            createdAt: fmt.fmtDate(bot.created_at),
            lastMsgAt: bot.last_msg_at ? fmt.fmtDate(bot.last_msg_at) : '暂无',
            msgCount: bot.msg_count || 0,
            aiEnabled: !!bot.ai_enabled,
            aiModel: bot.ai_model || '默认模型',
            reminder: bot.reminder_hours ? ('第 ' + bot.reminder_hours + ' 小时提醒') : '未开启',
            canSend: !!bot.can_send,
            sendReason: bot.send_disabled_reason || '',
            showReconnect: bot.status !== 'connected' && bot.status !== 'session_expired',
            expired: bot.status === 'session_expired',
          },
          win: fmt.windowInfo(bot.last_msg_at),
          quota: decorateQuota(r.quota),
          contacts: (r.contacts || []).map((c) => ({
            id: c.user_id,
            name: fmt.shortId(c.user_id, 6),
            count: c.msg_count,
            last: fmt.timeAgo(c.last_msg_at),
          })),
          apps: (r.apps || []).map((a) => ({
            id: a.id,
            name: a.app_name || a.app_slug || '未命名 App',
            icon: a.app_icon || '',
            iconUrl: a.app_icon_url || '',
            handle: a.handle,
            enabled: a.enabled,
            initial: Array.from(a.app_name || a.app_slug || 'A')[0],
          })),
          messages: (r.messages || []).map(decorateMessage),
          hasMore: r.hasMore,
        });
      })
      .catch((err) => {
        if (api.isUnauthorized(err)) {
          api.goLogin();
          return;
        }
        this.setData({ viewState: 'error', errorText: err.message || '加载失败' });
      });
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || !this.cursor) return;
    this.setData({ loadingMore: true });
    api.call('messages', { botId: this.botId, cursor: this.cursor })
      .then((r) => {
        this.cursor = r.nextCursor;
        this.setData({
          messages: this.data.messages.concat((r.messages || []).map(decorateMessage)),
          hasMore: r.hasMore,
          loadingMore: false,
        });
      })
      .catch((err) => {
        this.setData({ loadingMore: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  copy(e) {
    const v = e.currentTarget.dataset.value;
    if (v && v !== '-') wx.setClipboardData({ data: String(v) });
  },

  reconnect() {
    this.setData({ reconnecting: true });
    api.call('reconnect', { botId: this.botId })
      .then(() => {
        wx.showToast({ title: '已发起重连', icon: 'success' });
        setTimeout(() => this.load(), 1500);
      })
      .catch((err) => wx.showModal({ title: '重连失败', content: err.message || '请稍后重试', showCancel: false }))
      .then(() => this.setData({ reconnecting: false }));
  },

  rebind() {
    wx.navigateTo({ url: '/pages/scan/scan?mode=bind' });
  },
});
