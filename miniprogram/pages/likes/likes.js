// pages/likes/likes.js - 喜欢的作品
const { computeNavBar, assignBentoAreas } = require('../../utils/common');
const { callFunction, checkLogin } = require('../../utils/cloud');
const themeMod = require('../../utils/theme');

Page({
  data: {
    navBarHeight: 44,
    statusBarHeight: 20,
    likes: [],
    leftCol: [],
    rightCol: [],
    loading: false,
    refreshing: false,
    empty: false,
    theme: 'dark',
    themeClass: 'theme-dark',
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight, statusBarHeight,
      theme, themeClass: themeMod.themeClass(theme),
    });
    this.loadLikes();
  },

  onShow() {
    const theme = themeMod.getTheme();
    if (theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
    }
    this.loadLikes();
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadLikes();
  },

  loadLikes() {
    this.setData({ loading: true });
    const likes = wx.getStorageSync('myLikes') || [];
    this._applyLikes(likes);
  },

  _applyLikes(likes) {
    // 编辑式 Bento 瀑布流（同首页「光的切片」）
    const cells = assignBentoAreas(likes);
    this.setData({
      likes: cells,
      loading: false,
      refreshing: false,
      empty: likes.length === 0,
    });
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  goDiscover() {
    wx.switchTab({ url: '/pages/discover/discover' });
  },

  onPreview(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.likes[index];
    if (!item || !item.url) return;
    const title = item.title || item.style || '作品';
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(title)}`,
    });
  },

  onMakeSame(e) {
    const item = e.currentTarget.dataset.item;
    wx.setStorageSync('makeSameParams', {
      cover: item.url,
      title: item.title || '作品',
    });
    wx.switchTab({ url: '/pages/create/create' });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定取消喜欢吗？',
      success: (res) => {
        if (res.confirm) {
          let likes = wx.getStorageSync('myLikes') || [];
          likes = likes.filter(f => f.id !== id);
          wx.setStorageSync('myLikes', likes);
          this._applyLikes(likes);
          wx.showToast({ title: '已取消喜欢', icon: 'success' });
        }
      },
    });
  },

  onShareAppMessage() {
    return { title: '照片工坊 - 我喜欢的作品', path: '/pages/likes/likes' };
  },
});
