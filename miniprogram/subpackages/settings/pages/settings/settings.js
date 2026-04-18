// subpackages/settings/pages/settings/settings.js - 设置页面
const { callFunction, checkLogin } = require('../../../../utils/cloud');

// 获取全局导航栏高度
function getNavBarHeight() {
  try {
    const app = getApp();
    return app.globalData.navBarHeight || 88;
  } catch (e) {
    return 88;
  }
}

Page({
  data: {
    navBarHeight: 88,
    userInfo: null,
    userId: '',
    settings: {
      notification: true,
      wifiDownload: false,
      autoSave: true,
    },
    themeMode: 'system',
    cacheSize: '0 KB',
  },

  onLoad() {
    const navBarHeight = getNavBarHeight();
    this.setData({ navBarHeight });
    this.loadUserInfo();
    this.loadSettings();
    this.loadTheme();
    this.calculateCache();
  },

  onShow() {
    this.loadUserInfo();
  },

  goBack() {
    wx.navigateBack();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    this.setData({ userInfo });
    if (userInfo?.loginTime) {
      this.setData({ userId: String(userInfo.loginTime).slice(-8) });
    }
  },

  loadSettings() {
    const settings = wx.getStorageSync('appSettings') || {
      notification: true,
      wifiDownload: false,
      autoSave: true,
    };
    this.setData({ settings });
  },

  loadTheme() {
    const themeMode = wx.getStorageSync('app_theme_mode') || 'system';
    this.setData({ themeMode });
  },

  calculateCache() {
    try {
      const info = wx.getStorageInfoSync();
      const sizeKB = info.currentSize;
      this.setData({
        cacheSize: sizeKB > 1024 
          ? (sizeKB / 1024).toFixed(2) + ' MB' 
          : sizeKB + ' KB'
      });
    } catch {
      this.setData({ cacheSize: '未知' });
    }
  },

  onSwitchSetting(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const settings = { ...this.data.settings, [key]: value };
    this.setData({ settings });
    wx.setStorageSync('appSettings', settings);
  },

  onThemeToggle(e) {
    const mode = e.detail.value ? 'dark' : 'light';
    wx.setStorageSync('app_theme_mode', mode);
    this.setData({ themeMode: mode });
    wx.showToast({ title: '主题已切换', icon: 'success' });
  },

  onEditProfile() {
    if (!this.data.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: this.data.userInfo.nickName || '请输入昵称',
      success: (res) => {
        if (res.confirm && res.content) {
          const newUserInfo = { ...this.data.userInfo, nickName: res.content };
          wx.setStorageSync('userInfo', newUserInfo);
          this.setData({ userInfo: newUserInfo });
          if (checkLogin()) {
            callFunction('user', { action: 'updateProfile', nickName: res.content }, { silent: true }).catch(err => {
              console.log('云端更新昵称失败:', err.message);
            });
          }
          wx.showToast({ title: '修改成功', icon: 'success' });
        }
      }
    });
  },

  onChangeAvatar() {
    if (!this.data.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        const userInfo = { ...this.data.userInfo, avatarUrl: tempFilePath };
        wx.setStorageSync('userInfo', userInfo);
        this.setData({ userInfo });
        if (checkLogin()) {
          callFunction('user', { action: 'updateProfile', avatarUrl: tempFilePath }, { silent: true }).catch(err => {
            console.log('云端更新头像失败:', err.message);
          });
        }
        wx.showToast({ title: '头像已更新', icon: 'success' });
      },
    });
  },

  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存吗？这不会删除您的作品和收藏。',
      success: (res) => {
        if (res.confirm) {
          try {
            const keepKeys = ['userInfo', 'myWorks', 'myFavorites', 'token'];
            wx.getStorageInfoSync().keys.forEach(key => {
              if (!keepKeys.includes(key)) {
                wx.removeStorageSync(key);
              }
            });
            this.calculateCache();
            wx.showToast({ title: '清除成功', icon: 'success' });
          } catch {
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于照片工坊',
      content: '照片工坊 v2.0\n\n一款温暖质感的 AI 照片处理小程序。\n\n✨ AI 写真\n✨ 证件照制作\n✨ 风格迁移\n✨ 老照片修复\n\n© 2026 照片工坊团队',
      showCancel: false,
    });
  },

  onPrivacy() {
    wx.showModal({
      title: '隐私政策',
      content: '照片工坊隐私政策\n\n1. 我们仅收集必要信息用于提供服务\n2. 头像和昵称仅用于个人资料展示\n3. 上传的图片仅用于 AI 处理\n4. 不会将信息提供给第三方\n5. 可随时删除您的数据',
      showCancel: false,
    });
  },

  onAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '照片工坊用户协议\n\n1. 请遵守当地法律法规使用本服务\n2. 请勿上传违法、有害内容\n3. 生成的图片可用于个人用途\n4. 禁止用于商业用途或二次销售\n5. 如有问题请联系客服',
      showCancel: false,
    });
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('token');
          wx.removeStorageSync('loginCache');
          wx.showToast({ title: '已退出登录', icon: 'success' });
          if (getCurrentPages().length > 1) {
            wx.navigateBack();
          } else {
            wx.switchTab({ url: '/pages/my/my' });
          }
        }
      },
    });
  },

  onShareAppMessage() {
    return { title: '照片工坊 - 设置', path: '/subpackages/settings/pages/settings/settings' };
  },
});
