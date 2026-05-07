// pages/my/my.js - 我的
const { callFunction, checkLogin } = require('../../utils/cloud');
const { computeNavBar, formatDate } = require('../../utils/common');
const i18n = require('../../utils/i18n');
const themeMod = require('../../utils/theme');

Page({
  data: {
    userInfo: null,
    usageInfo: { isVip: false, limit: 5, used: 0 },
    creationsCount: 0,
    favoritesCount: 0,
    likesCount: 0,
    sharedCount: 0,
    downloadsCount: 0,
    viewsText: '0',
    memberDays: 1,
    handle: 'guest',
    navBarHeight: 44,
    statusBarHeight: 20,
    showLoginPopup: false,
    showSettingsSheet: false,
    tempAvatar: '',
    tempNickName: '',
    lang: 'zh',
    theme: 'dark',
    themeClass: 'theme-dark',
    i18n: {},
  },

  formatViews(n) {
    if (!n || n < 1000) return String(n || 0);
    if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
  },

  deriveHandle(nick) {
    if (!nick) return 'guest';
    const ascii = String(nick).toLowerCase().replace(/[^a-z0-9]/g, '');
    return ascii || 'user';
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight,
      statusBarHeight,
      lang,
      theme,
      themeClass: themeMod.themeClass(theme),
      i18n: i18n.pack(lang),
    });
    if (checkLogin()) this.loadUserInfo();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    // sync current theme/lang (they may have been changed elsewhere)
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    if (lang !== this.data.lang || theme !== this.data.theme) {
      this.setData({ lang, theme, themeClass: themeMod.themeClass(theme), i18n: i18n.pack(lang) });
    }
    if (checkLogin()) this.loadUserInfo();
  },

  // ===== Settings sheet =====
  openSettingsSheet() { this.setData({ showSettingsSheet: true }); },
  closeSettingsSheet() { this.setData({ showSettingsSheet: false }); },

  pickLang(e) {
    const v = e.currentTarget.dataset.v;
    i18n.setLang(v);
    this.setData({ lang: v, i18n: i18n.pack(v) });
    wx.vibrateShort({ type: 'light' });
  },

  pickTheme(e) {
    const v = e.currentTarget.dataset.v;
    themeMod.setTheme(v);
    this.setData({ theme: v, themeClass: themeMod.themeClass(v) });
    wx.vibrateShort({ type: 'light' });
  },

  async loadUserInfo() {
    try {
      const user = wx.getStorageSync('userInfo') || null;
      const loginTime = user && user.loginTime ? user.loginTime : (wx.getStorageSync('firstLoginTime') || Date.now());
      const memberDays = Math.max(1, Math.floor((Date.now() - loginTime) / 86400000));
      const favoritesCount = (wx.getStorageSync('myFavorites') || []).length;
      const likesCount = (wx.getStorageSync('myLikes') || []).length;
      const localWorks = wx.getStorageSync('myWorks') || [];
      const downloadsCount = (wx.getStorageSync('myDownloads') || []).length;
      this.setData({
        userInfo: user,
        memberDays,
        favoritesCount,
        likesCount,
        creationsCount: localWorks.length,
        downloadsCount,
        handle: this.deriveHandle(user && user.nickName),
      });

      const res = await callFunction('user', { action: 'getInfo' }, { silent: true });
      if (res) {
        const isVip = !!(res.vipLevel && res.vipExpireTime > Date.now());
        this.setData({
          usageInfo: { isVip, limit: res.dailyLimit || 5, used: res.dailyUsed || 0 },
          creationsCount: res.createCount || localWorks.length,
          favoritesCount: res.favorites || favoritesCount,
          likesCount: res.likes || likesCount,
          sharedCount: res.shareCount || 0,
          viewsText: this.formatViews(res.viewCount || 0),
        });
      }
    } catch (err) {
      console.warn('加载用户信息失败:', err.message);
    }
  },

  // 打开登录弹窗
  onLoginTap() {
    this.setData({ showLoginPopup: true });
  },

  // 关闭登录弹窗
  closeLoginPopup() {
    this.setData({ showLoginPopup: false });
  },

  preventTap() {},

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatar: avatarUrl });
  },

  // 输入昵称
  onNickNameInput(e) {
    this.setData({ tempNickName: e.detail.value });
  },

  onNickNameConfirm(e) {
    this.setData({ tempNickName: e.detail.value });
  },

  // 确认登录
  async confirmLogin() {
    const { tempAvatar, tempNickName } = this.data;
    
    if (!tempAvatar) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }
    if (!tempNickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '登录中...', mask: true });
    
    try {
      // 先尝试微信登录获取 openid
      let cloudUserInfo = null;
      try {
        cloudUserInfo = await callFunction('user', { action: 'wxLogin' }, { silent: true });
      } catch (e) {
        console.log('云函数登录失败，使用本地登录:', e.message);
      }
      
      const userInfo = {
        avatarUrl: tempAvatar,
        nickName: tempNickName,
        loginTime: Date.now(),
        openid: cloudUserInfo?.openid,
        vipLevel: cloudUserInfo?.vipLevel || 'free',
        vipExpireTime: cloudUserInfo?.vipExpireTime,
      };
      
      wx.setStorageSync('userInfo', userInfo);
      if (!wx.getStorageSync('firstLoginTime')) {
        wx.setStorageSync('firstLoginTime', Date.now());
      }
      if (cloudUserInfo?.token) {
        wx.setStorageSync('token', cloudUserInfo.token);
      }
      
      this.setData({ 
        userInfo, 
        showLoginPopup: false,
        tempAvatar: '',
        tempNickName: '',
        isVip: userInfo.vipLevel !== 'free',
      });
      
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  onMenuTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.vibrateShort({ type: 'light' });
    const routes = {
      history: '/subpackages/history/pages/history/history',
      favorites: '/pages/favorites/favorites',
      vip: '/subpackages/member/pages/member/member',
      settings: '/subpackages/settings/pages/settings/settings'
    };
    if (routes[id]) {
      wx.navigateTo({ url: routes[id] });
    } else if (id === 'help') {
      // 打开反馈页面或显示反馈选项
      wx.showActionSheet({
        itemList: ['功能建议', '问题反馈', '联系客服'],
        success: (res) => {
          const types = ['功能建议', '问题反馈', '联系客服'];
          const type = types[res.tapIndex];
          if (res.tapIndex === 2) {
            // 联系客服
            wx.showModal({
              title: '联系客服',
              content: '客服微信：PhotoStudio_Service\n工作时间：9:00-18:00',
              confirmText: '复制微信号',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.setClipboardData({ data: 'PhotoStudio_Service' });
                }
              }
            });
          } else {
            // 意见反馈
            wx.showModal({
              title: type,
              editable: true,
              placeholderText: '请详细描述您的问题或建议...',
              success: (modalRes) => {
                if (modalRes.confirm && modalRes.content) {
                  // 可以调用云函数保存反馈
                  console.log(`[${type}] ${modalRes.content}`);
                  wx.showToast({ title: '感谢您的反馈', icon: 'success' });
                }
              }
            });
          }
        }
      });
    }
  },

  goHistory()   { wx.navigateTo({ url: '/subpackages/history/pages/history/history' }); },
  goFavorites() { wx.switchTab({ url: '/pages/favorites/favorites' }); },
  goLikes()     { wx.navigateTo({ url: '/pages/likes/likes' }); },
  goDownloads() { wx.navigateTo({ url: '/subpackages/history/pages/history/history?tab=downloads' }); },
  goUpload()    { wx.navigateTo({ url: '/pages/upload/upload' }); },
  goPoster()    { wx.navigateTo({ url: '/subpackages/poster/pages/poster/poster' }); },
  openMember()  { wx.navigateTo({ url: '/subpackages/member/pages/member/member' }); },
  goSettings()  { wx.navigateTo({ url: '/subpackages/settings/pages/settings/settings' }); },

  chooseLanguage() {
    wx.showActionSheet({
      itemList: ['中文', 'English'],
      success: (r) => {
        if (r.tapIndex === 1) wx.showToast({ title: 'English coming soon', icon: 'none' });
      },
    });
  },

  onShareAppMessage() {
    return { title: 'AI创作 - 一张照片，无限可能', path: '/pages/index/index' };
  },
});
