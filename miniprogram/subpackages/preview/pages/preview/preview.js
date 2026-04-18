// subpackages/preview/pages/preview/preview.js - 图片详情页
const { callFunction, checkLogin } = require('../../../../utils/cloud');
const { showError } = require('../../../../utils/errorHandler');

Page({
  data: {
    imageUrl: '',
    title: '',
    likes: 0,
    imageLoaded: false,
    isFavorite: false,
    showShareMenu: false,
    // 成功提示
    showSuccessToast: false,
    successTitle: '',
    successDesc: '',
    successIcon: 'check',
  },

  onLoad(options) {
    if (options.url) {
      const url = decodeURIComponent(options.url);
      this.setData({ imageUrl: url });
      this.checkFavorite(url);
    }
    if (options.title) {
      this.setData({ title: decodeURIComponent(options.title) });
    }
    if (options.likes) {
      this.setData({ likes: options.likes });
    }
  },

  checkFavorite(url) {
    const favorites = wx.getStorageSync('myFavorites') || [];
    const exists = favorites.some(f => f.url === url);
    this.setData({ isFavorite: exists });
  },

  goBack() {
    wx.navigateBack();
  },

  onImageLoad() {
    this.setData({ imageLoaded: true });
  },

  onImageTap() {
    wx.previewImage({
      current: this.data.imageUrl,
      urls: [this.data.imageUrl],
    });
  },

  async onFavorite() {
    if (!this.data.imageUrl) {
      wx.showToast({ title: '图片未加载', icon: 'none' });
      return;
    }

    const url = this.data.imageUrl;
    const title = this.data.title || '作品';
    let favorites = wx.getStorageSync('myFavorites') || [];

    if (this.data.isFavorite) {
      favorites = favorites.filter(f => f.url !== url);
      wx.setStorageSync('myFavorites', favorites);
      this.setData({ isFavorite: false });
      wx.showToast({ title: '已取消收藏', icon: 'success' });

      if (checkLogin()) {
        try {
          await callFunction('tools', {
            action: 'removeFavorite',
            itemId: this.generateItemId(url),
          }, { silent: true });
        } catch (e) {}
      }
    } else {
      const item = {
        id: this.generateItemId(url),
        url: url,
        title: title,
        likes: this.data.likes || 0,
        createTime: Date.now(),
      };
      favorites.unshift(item);
      wx.vibrateShort({ type: 'light' });
      wx.setStorageSync('myFavorites', favorites);
      this.setData({ isFavorite: true });
      this.showSuccessToast({ title: '收藏成功', icon: 'heart' });

      if (checkLogin()) {
        try {
          await callFunction('tools', {
            action: 'saveFavorite',
            item: item,
          }, { silent: true });
        } catch (e) {}
      }
    }
  },

  generateItemId(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  },

  onMakeSame() {
    if (!this.data.imageUrl) {
      wx.showToast({ title: '图片未加载，请稍后', icon: 'none' });
      return;
    }

    wx.setStorageSync('makeSameParams', {
      cover: this.data.imageUrl,
      title: this.data.title || '作品',
    });

    wx.switchTab({
      url: '/pages/create/create',
      fail: (err) => {
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  },

  async onSaveToAlbum() {
    if (!this.data.imageUrl) {
      wx.showToast({ title: '图片未加载', icon: 'none' });
      return;
    }

    try {
      let filePath = this.data.imageUrl;
      if (filePath.startsWith('http')) {
        wx.showLoading({ title: '下载中...', mask: true });
        const res = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: filePath,
            success: resolve,
            fail: reject,
          });
        });
        filePath = res.tempFilePath;
        wx.hideLoading();
      }

      wx.saveImageToPhotosAlbum({
        filePath: filePath,
        success: () => {
          this.showSuccessToast({ title: '已保存到相册', icon: 'check' });
        },
        fail: (err) => {
          if (err.errMsg.includes('auth deny')) {
            wx.showModal({
              title: '需要权限',
              content: '请在设置中开启相册权限',
              success: (res) => {
                if (res.confirm) wx.openSetting();
              },
            });
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        },
      });
    } catch (e) {
      wx.hideLoading();
      showError(e);
    }
  },

  // ========== 成功提示 ==========
  showSuccessToast({ title = '操作成功', desc = '', icon = 'check' } = {}) {
    this.setData({
      showSuccessToast: true,
      successTitle: title,
      successDesc: desc,
      successIcon: icon,
    });
  },

  hideSuccessToast() {
    this.setData({ showSuccessToast: false });
  },

  // ========== 分享 ==========
  onShareTap() {
    this.setData({ showShareMenu: true });
  },

  closeShareMenu() {
    this.setData({ showShareMenu: false });
  },

  onShareAppMessage() {
    return {
      title: this.data.title || '照片工坊作品',
      path: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(this.data.imageUrl)}&title=${encodeURIComponent(this.data.title || '照片工坊作品')}`,
    };
  },
});
