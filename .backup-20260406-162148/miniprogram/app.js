// app.js - 全局入口
const CLOUD_ENV = 'cloud1-7g56gaj702c99bfd';

App({
  onLaunch() {
    if (!wx.cloud) { console.error('基础库版本过低'); return; }

    // 获取系统信息做全局适配
    const sysInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = sysInfo;

    // 胶囊按钮位置（自定义导航栏用）
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    this.globalData.menuBtn = menuBtn;
    this.globalData.statusBarHeight = sysInfo.statusBarHeight;
    this.globalData.navBarHeight = (menuBtn.top - sysInfo.statusBarHeight) * 2 + menuBtn.height + sysInfo.statusBarHeight;

    // 安全区域
    this.globalData.safeArea = sysInfo.safeArea;
    this.globalData.safeBottom = sysInfo.screenHeight - sysInfo.safeArea.bottom;

    wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
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
  },
});
