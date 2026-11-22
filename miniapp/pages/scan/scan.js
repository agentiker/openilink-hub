const api = require('../../utils/api');
const config = require('../../config');

const TEXT = {
  login: {
    title: '扫码登录',
    heading: '用 ClawBot 登录',
    desc: '用微信扫描下方二维码并在手机上确认。首次登录会自动创建账号，并绑定这个 ClawBot。',
    start: 'scanStart',
    poll: 'scanPoll',
  },
  bind: {
    title: '绑定 ClawBot',
    heading: '绑定新的 ClawBot',
    desc: '用要绑定的微信扫描下方二维码并确认，绑定后即可在小程序中查看它的状态和消息。',
    start: 'bindStart',
    poll: 'bindPoll',
  },
};

const STATUS_TEXT = {
  loading: '正在获取二维码…',
  wait: '等待扫码',
  scanned: '已扫码，请在手机上点击确认',
  connected: '绑定成功',
  error: '',
};

Page({
  data: {
    mode: 'login',
    heading: '',
    desc: '',
    phase: 'loading', // loading | wait | scanned | connected | error
    statusText: STATUS_TEXT.loading,
    qrImage: '',
    errorText: '',
    demo: false,
  },

  onLoad(query) {
    const mode = query.mode === 'bind' ? 'bind' : 'login';
    const t = TEXT[mode];
    this.mode = mode;
    this.setData({ mode, heading: t.heading, desc: t.desc });
    wx.setNavigationBarTitle({ title: t.title });

    if (mode === 'login') {
      // 已登录则直接进首页
      api.call('status')
        .then((r) => {
          if (r.loggedIn) wx.reLaunch({ url: '/pages/index/index' });
          else this.start();
        })
        .catch(() => this.start());
    } else {
      this.start();
    }
  },

  onShow() {
    // 从预览图返回后恢复轮询
    if (this.sessionId && (this.data.phase === 'wait' || this.data.phase === 'scanned')) {
      this.schedulePoll(0);
    }
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this.stopPoll();
    this.unloaded = true;
  },

  start() {
    this.stopPoll();
    this.sessionId = '';
    this.qrUrl = '';
    this.qrFile = '';
    this.setData({ phase: 'loading', statusText: STATUS_TEXT.loading, qrImage: '', errorText: '' });
    api.call(TEXT[this.mode].start)
      .then((r) => {
        if (this.unloaded) return;
        this.sessionId = r.sessionId;
        this.qrUrl = r.qrUrl;
        this.startedAt = Date.now();
        this.setData({ phase: 'wait', statusText: STATUS_TEXT.wait, qrImage: r.qrImage, demo: api.isDemo() });
        if (api.isDemo()) {
          this.setData({ statusText: '演示：几秒后将模拟扫码并确认' });
        }
        this.schedulePoll(config.pollInterval);
      })
      .catch((err) => this.fail(err));
  },

  schedulePoll(delay) {
    this.stopPoll();
    this.timer = setTimeout(() => this.poll(), delay);
  },

  stopPoll() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  },

  poll() {
    if (this.unloaded || !this.sessionId) return;
    if (Date.now() - this.startedAt > config.pollTimeout) {
      this.fail({ message: '等待超时，请刷新二维码后重试' });
      return;
    }
    const sid = this.sessionId;
    api.call(TEXT[this.mode].poll, { sessionId: sid, lastQrUrl: this.qrUrl })
      .then((r) => {
        if (this.unloaded || sid !== this.sessionId) return;
        if (r.qrUrl) {
          // Hub 刷新了二维码
          this.qrUrl = r.qrUrl;
          this.qrFile = '';
          this.setData({ qrImage: r.qrImage });
          wx.showToast({ title: '二维码已刷新', icon: 'none' });
        }
        if (r.status === 'connected') {
          this.onConnected(r);
          return;
        }
        const phase = r.status === 'scanned' ? 'scanned' : 'wait';
        if (phase !== this.data.phase) {
          this.setData({ phase, statusText: STATUS_TEXT[phase] });
        }
        this.schedulePoll(config.pollInterval);
      })
      .catch((err) => {
        if (api.isUnauthorized(err) && this.mode === 'bind') {
          api.goLogin();
          return;
        }
        // 网络抖动：继续重试；明确失效则提示刷新
        if (err.code === 'SCAN_EXPIRED' || err.code === 'SCAN_FAILED') {
          this.fail(err);
        } else {
          this.schedulePoll(config.pollInterval * 2);
        }
      });
  },

  onConnected(r) {
    this.stopPoll();
    this.sessionId = '';
    this.setData({ phase: 'connected', statusText: r.isNew ? '绑定成功' : '已重新连接' });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    setTimeout(() => {
      if (this.mode === 'login') {
        wx.reLaunch({ url: '/pages/index/index' });
      } else {
        wx.redirectTo({ url: '/pages/bot/bot?id=' + encodeURIComponent(r.botId) });
      }
    }, 800);
  },

  fail(err) {
    this.stopPoll();
    this.setData({ phase: 'error', errorText: (err && err.message) || '操作失败' });
  },

  // 把二维码落到本地临时文件，供预览（长按识别）和保存到相册使用
  ensureQrFile() {
    if (this.qrFile) return Promise.resolve(this.qrFile);
    const img = this.data.qrImage || '';
    // 远程图片（Hub 渲染的二维码）→ 下载到临时文件
    if (/^https?:\/\//.test(img)) {
      return new Promise((resolve, reject) => {
        wx.downloadFile({
          url: img,
          success: (res) => {
            if (res.statusCode === 200) {
              this.qrFile = res.tempFilePath;
              resolve(res.tempFilePath);
            } else {
              reject({ errMsg: 'download ' + res.statusCode });
            }
          },
          fail: reject,
        });
      });
    }
    // 本地图片（演示模式）直接使用
    return Promise.resolve(img);
  },

  previewQr() {
    if (!this.data.qrImage) return;
    this.ensureQrFile()
      .then((p) => wx.previewImage({ urls: [p], current: p, showmenu: true }))
      .catch(() => wx.showToast({ title: '预览失败', icon: 'none' }));
  },

  saveQr() {
    if (!this.data.qrImage) return;
    this.ensureQrFile()
      .then((p) => new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath: p, success: resolve, fail: reject });
      }))
      .then(() => wx.showToast({ title: '已保存到相册', icon: 'success' }))
      .catch((e) => {
        const msg = (e && e.errMsg) || '';
        if (msg.indexOf('auth') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); },
          });
        } else if (msg.indexOf('cancel') < 0) {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      });
  },

  copyLink() {
    if (!this.qrUrl) return;
    wx.setClipboardData({ data: this.qrUrl });
  },
});
