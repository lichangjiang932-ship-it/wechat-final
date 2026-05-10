const { logger } = require('../../../../config/constants');
// subpackages/preview/pages/preview/preview.js - 图片详情页
const { callFunction, checkLogin } = require('../../../../utils/cloud');
const { computeNavBar } = require('../../../../utils/common');
const { showError } = require('../../../../utils/errorHandler');
const themeMod = require('../../../../utils/theme');

Page({
  data: {
    imageUrl: '',
    title: '',
    prompt: '',
    style: '',
    ratio: '',
    createdAt: '',
    saves: 0,
    shares: 0,
    isLiked: false,
    isFavorite: false,
    imageLoaded: false,
    navBarHeight: 44,
    statusBarHeight: 20,
    theme: 'dark',
    themeClass: 'theme-dark',
  },

  onLoad(options) {
    const navBar = computeNavBar();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight: navBar.navBarHeight,
      statusBarHeight: navBar.statusBarHeight,
      theme, themeClass: themeMod.themeClass(theme),
    });

    if (options.url) {
      const url = decodeURIComponent(options.url);
      this.setData({ imageUrl: url });
      this.checkFavorite(url);
      this.checkLiked(url);
    }
    if (options.title)  this.setData({ title: decodeURIComponent(options.title) });
    if (options.prompt) this.setData({ prompt: decodeURIComponent(options.prompt) });
    if (options.style)  this.setData({ style: decodeURIComponent(options.style) });
    if (options.ratio)  this.setData({ ratio: options.ratio });
    if (options.createdAt) this.setData({ createdAt: decodeURIComponent(options.createdAt) });
    if (options.saves)  this.setData({ saves: Number(options.saves) || 0 });
  },

  onShow() {
    const theme = themeMod.getTheme();
    if (theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
    }
  },

  checkFavorite(url) {
    const favorites = wx.getStorageSync('myFavorites') || [];
    const exists = favorites.some(f => f.url === url);
    this.setData({ isFavorite: exists });
  },

  checkLiked(url) {
    const likes = wx.getStorageSync('myLikes') || [];
    const exists = likes.some(f => f.url === url);
    this.setData({ isLiked: exists });
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onLike() {
    const isLiked = !this.data.isLiked;
    this.setData({ isLiked, saves: this.data.saves + (isLiked ? 1 : -1) });
    wx.vibrateShort({ type: 'light' });

    // 持久化存储
    const url = this.data.imageUrl;
    if (!url) return;
    let likes = wx.getStorageSync('myLikes') || [];
    if (isLiked) {
      if (!likes.some(f => f.url === url)) {
        likes.unshift({
          id: this.generateItemId(url),
          url,
          title: this.data.title || '作品',
          likes: this.data.saves,
          createTime: Date.now(),
        });
        wx.setStorageSync('myLikes', likes);
        wx.showToast({ title: '已喜欢', icon: 'success' });
      }
    } else {
      likes = likes.filter(f => f.url !== url);
      wx.setStorageSync('myLikes', likes);
      wx.showToast({ title: '已取消喜欢', icon: 'none' });
    }
  },

  onShare() { this.onShareTap && this.onShareTap(); },
  onMore()  { wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] }); },

  onImageLoad() {
    this.setData({ imageLoaded: true });
  },

  onImageError() {
    logger.warn('[preview] 图片加载失败', this.data.imageUrl);
  },

  onCopyPrompt() {
    if (!this.data.prompt) return;
    wx.setClipboardData({
      data: this.data.prompt,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
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
      wx.setStorageSync('myFavorites', favorites);
      this.setData({ isFavorite: true });
      wx.showToast({ title: '收藏成功', icon: 'success' });

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
    // tools.saveFavorite 要求 item.id 为 string
    return String(Math.abs(hash));
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
          wx.showToast({ title: '已保存到相册', icon: 'success' });
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
