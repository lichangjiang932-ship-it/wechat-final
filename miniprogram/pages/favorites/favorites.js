// pages/favorites/favorites.js - 我的收藏页面
const { callFunction, checkLogin } = require('../../utils/cloud');
const { computeNavBar } = require('../../utils/common');

Page({
  data: {
    navBarHeight: 44,
    statusBarHeight: 20,
    favorites: [],
    loading: false,
    refreshing: false,
    empty: false,
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    this.setData({ navBarHeight, statusBarHeight });
    this.loadFavorites();
  },

  onShow() {
    this.loadFavorites();
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ refreshing: true });
    this.loadFavorites();
  },

  // 加载收藏（本地 + 云端合并）
  async loadFavorites() {
    this.setData({ loading: true });

    let favorites = wx.getStorageSync('myFavorites') || [];
    this.setData({ favorites, loading: false, refreshing: false, empty: favorites.length === 0 });

    if (checkLogin()) {
      try {
        const res = await callFunction('tools', { action: 'getFavorites' }, { silent: true });
        if (Array.isArray(res) && res.length > 0) {
          const cloudFavorites = res.map(item => ({
            id: item.itemId,
            url: item.cover,
            title: item.title,
            likes: item.likes,
          }));

          const merged = [...favorites];
          cloudFavorites.forEach(cloudItem => {
            if (!merged.find(localItem => localItem.id === cloudItem.id)) {
              merged.push(cloudItem);
            }
          });

          merged.sort((a, b) => b.id - a.id);
          this.setData({ favorites: merged, empty: merged.length === 0 });
          wx.setStorageSync('myFavorites', merged);
        }
      } catch (err) {
        console.log('云端收藏同步失败:', err.message);
      }
    }
  },

  goBack() {
    wx.navigateBack();
  },

  goDiscover() {
    wx.switchTab({ url: '/pages/discover/discover' });
  },

  onPreview(e) {
    const index = e.currentTarget.dataset.index;
    const urls = this.data.favorites.map(f => f.url);
    wx.previewImage({ current: urls[index], urls });
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
      content: '确定取消收藏吗？',
      success: async (res) => {
        if (res.confirm) {
          let favorites = wx.getStorageSync('myFavorites') || [];
          favorites = favorites.filter(f => f.id !== id);
          wx.setStorageSync('myFavorites', favorites);
          this.setData({ favorites, empty: favorites.length === 0 });

          if (checkLogin()) {
            try {
              await callFunction('tools', { action: 'removeFavorite', itemId: id }, { silent: true });
            } catch (err) {
              console.log('云端取消收藏失败:', err.message);
            }
          }
          wx.showToast({ title: '已取消收藏', icon: 'success' });
        }
      },
    });
  },

  onShareAppMessage() {
    return { title: '照片工坊 - 我的收藏', path: '/pages/favorites/favorites' };
  },
});