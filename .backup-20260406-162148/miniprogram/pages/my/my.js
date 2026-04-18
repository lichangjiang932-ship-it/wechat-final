// pages/my/my.js - 我的
const { callFunction, checkLogin } = require('../../utils/cloud');
const { computeNavBar, formatDate } = require('../../utils/common');

Page({
  data: {
    userInfo: null,
    isVip: false,
    vipExpireTime: null,
    stats: { createCount: 0, favorites: 0, shares: 0 },
    menuItems: [
      { id: 'history', icon: '📸', name: '我的作品' },
      { id: 'favorites', icon: '❤️', name: '我的收藏' },
      { id: 'vip', icon: '👑', name: '开通会员' },
      { id: 'settings', icon: '⚙️', name: '设置' },
      { id: 'help', icon: '💬', name: '帮助与反馈' },
    ],
    navBarHeight: 44,
    statusBarHeight: 20,
    showLoginPopup: false,
    tempAvatar: '',
    tempNickName: '',
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    this.setData({ navBarHeight, statusBarHeight });
    if (checkLogin()) this.loadUserInfo();
  },

  onShow() {
    if (checkLogin()) this.loadUserInfo();
  },

  async loadUserInfo() {
    try {
      const user = wx.getStorageSync('userInfo') || null;
      this.setData({ userInfo: user });
      const res = await callFunction('user', { action: 'getProfile' });
      if (res) {
        this.setData({
          isVip: res.vipLevel && res.vipExpireTime > Date.now(),
          vipExpireTime: res.vipExpireTime,
          stats: { createCount: res.createCount || 0, favorites: res.favorites || 0, shares: res.shares || 0 },
        });
      }
    } catch (err) {
      console.error('加载用户信息失败:', err.message);
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
    
    try {
      const userInfo = {
        avatarUrl: tempAvatar,
        nickName: tempNickName,
        loginTime: Date.now()
      };
      wx.setStorageSync('userInfo', userInfo);
      this.setData({ 
        userInfo, 
        showLoginPopup: false,
        tempAvatar: '',
        tempNickName: ''
      });
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  onMenuTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.vibrateShort({ type: 'light' });
    const routes = {
      history: '/pages/history/history',
      favorites: '/pages/favorites/favorites',
      vip: '/pages/member/member',
      settings: '/pages/settings/settings'
    };
    if (routes[id]) {
      wx.navigateTo({ url: routes[id] });
    } else if (id === 'help') {
      wx.showModal({ title: '帮助与反馈', content: '如有问题请联系客服微信：xxx', showCancel: false });
    }
  },

  onShareAppMessage() {
    return { title: 'AI创作 - 一张照片，无限可能', path: '/pages/index/index' };
  },
});
