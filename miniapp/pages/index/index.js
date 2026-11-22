const api = require('../../utils/api');
const fmt = require('../../utils/format');

function decorateBot(bot) {
  const meta = fmt.statusMeta(bot.status);
  const win = fmt.windowInfo(bot.last_msg_at);
  const extra = bot.extra || {};
  return {
    id: bot.id,
    name: fmt.botName(bot),
    botIdShort: fmt.shortId(extra.bot_id || bot.id),
    statusLabel: meta.label,
    statusCls: meta.cls,
    msgCount: bot.msg_count || 0,
    lastMsg: fmt.timeAgo(bot.last_msg_at),
    aiEnabled: !!bot.ai_enabled,
    canSend: !!bot.can_send,
    sendReason: bot.send_disabled_reason || '',
    winText: win.text,
    winLevel: win.level,
    winPercent: win.percent,
  };
}

Page({
  data: {
    viewState: 'loading', // loading | ready | error
    errorText: '',
    user: null,
    avatarChar: '',
    bots: [],
    stats: null,
    onlineCount: 0,
    demo: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    if (!this.data.user) this.setData({ viewState: 'loading' });
    return api.call('overview')
      .then((res) => {
        const bots = (res.bots || []).map(decorateBot);
        const user = res.user || {};
        const name = user.display_name || user.username || '?';
        this.setData({
          demo: api.isDemo(),
          viewState: 'ready',
          user,
          avatarChar: Array.from(name)[0] || '?',
          bots,
          stats: res.stats || null,
          onlineCount: bots.filter((b) => b.statusCls === 'ok').length,
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

  openBot(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/bot/bot?id=' + encodeURIComponent(id) });
  },

  bindNew() {
    wx.navigateTo({ url: '/pages/scan/scan?mode=bind' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新扫码登录，确定退出吗？',
      confirmColor: '#d83931',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '正在退出' });
        api.call('logout')
          .catch(() => null)
          .then(() => {
            wx.hideLoading();
            api.goLogin();
          });
      },
    });
  },
});
