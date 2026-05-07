// app.js - 全局入口
const DEFAULT_CLOUD_ENV = 'cloud1-d8glhp7pdcd3fffba';
const i18n = require('./utils/i18n');
const theme = require('./utils/theme');

App({
  onLaunch() {
    const cloudEnv = wx.getStorageSync('CLOUD_ENV') || DEFAULT_CLOUD_ENV;

    if (!wx.cloud) { console.error('基础库版本过低'); return; }

    // 语言 & 主题
    this.globalData.lang = i18n.getLang();
    this.globalData.theme = theme.initTheme();

    // 使用新版 API（避免废弃警告）
    const windowInfo = wx.getWindowInfo();
    this.globalData.systemInfo = windowInfo;

    // 胶囊按钮位置（自定义导航栏用）
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    this.globalData.menuBtn = menuBtn;
    this.globalData.statusBarHeight = windowInfo.statusBarHeight;
    this.globalData.navBarHeight = (menuBtn.top - windowInfo.statusBarHeight) * 2 + menuBtn.height + windowInfo.statusBarHeight;

    // 安全区域
    this.globalData.safeArea = windowInfo.safeArea;
    this.globalData.safeBottom = windowInfo.screenHeight - windowInfo.safeArea.bottom;

    wx.cloud.init({ env: cloudEnv, traceUser: true });

    this.globalData.cloudEnv = cloudEnv;
  },

  globalData: {
    userInfo: null,
    isVip: false,
    vipExpireTime: null,
    systemInfo: null,
    menuBtn: null,
    statusBarHeight: 0,
    navBarHeight: 0,
    safeArea: null,
    safeBottom: 0,
    cloudEnv: DEFAULT_CLOUD_ENV,
  },
});
