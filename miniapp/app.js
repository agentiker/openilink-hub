const config = require('./config');

App({
  globalData: {
    appName: 'ClawBot 助手',
    demo: config.demo === true,
    hubOk: false,
  },
});
