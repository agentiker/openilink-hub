// 展示相关的纯函数。时间戳均为 Hub 返回的 Unix 秒。

const STATUS = {
  connected: { label: '运行中', cls: 'ok' },
  disconnected: { label: '离线', cls: 'muted' },
  error: { label: '故障', cls: 'danger' },
  session_expired: { label: '授权过期', cls: 'danger' },
};

const WINDOW_SECONDS = 24 * 3600;

function statusMeta(status) {
  return STATUS[status] || { label: status || '未知', cls: 'muted' };
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function fmtDate(sec) {
  if (!sec) return '-';
  const d = new Date(sec * 1000);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fmtTime(sec) {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return sameDay ? hm : (pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm);
}

function timeAgo(sec) {
  if (!sec) return '暂无';
  const diff = nowSec() - sec;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  return Math.floor(diff / 86400) + ' 天前';
}

// 微信 24 小时窗口：以最后一条收到的消息为起点。
function windowInfo(lastMsgAt) {
  if (!lastMsgAt) {
    return { known: false, expired: true, percent: 0, text: '尚未收到消息', level: 'muted' };
  }
  const left = lastMsgAt + WINDOW_SECONDS - nowSec();
  if (left <= 0) {
    return { known: true, expired: true, percent: 0, text: '窗口已过期', level: 'danger' };
  }
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const percent = Math.max(2, Math.round((left / WINDOW_SECONDS) * 100));
  let level = 'ok';
  if (left < 2 * 3600) level = 'danger';
  else if (left < 6 * 3600) level = 'warn';
  return { known: true, expired: false, percent, text: '剩余 ' + h + ' 小时 ' + m + ' 分', level };
}

function shortId(id, keep) {
  if (!id) return '';
  const n = keep || 6;
  const at = id.indexOf('@');
  const head = at > 0 ? id.slice(0, at) : id;
  const tail = at > 0 ? id.slice(at) : '';
  if (head.length <= n * 2) return id;
  return head.slice(0, n) + '…' + head.slice(-4) + tail;
}

const ITEM_LABEL = { image: '[图片]', video: '[视频]', voice: '[语音]', file: '[文件]' };

function messagePreview(items) {
  if (!items || !items.length) return '[空消息]';
  return items.map((it) => {
    if (it.type === 'text') return it.text || '';
    const label = ITEM_LABEL[it.type] || '[' + (it.type || '消息') + ']';
    const extra = it.file_name || it.text || '';
    return extra ? label + ' ' + extra : label;
  }).join(' ');
}

function botName(bot) {
  if (!bot) return '';
  if (bot.display_name) return bot.display_name;
  if (bot.name) return bot.name;
  const extra = bot.extra || {};
  return shortId(extra.bot_id || bot.id);
}

module.exports = {
  statusMeta,
  fmtDate,
  fmtTime,
  timeAgo,
  windowInfo,
  shortId,
  messagePreview,
  botName,
};
