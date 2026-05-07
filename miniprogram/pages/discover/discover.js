const { logger } = require('../../config/constants');
// pages/discover/discover.js - 发现页（接入真实云数据库）
const { computeNavBar } = require('../../utils/common');
const { callFunction, checkLogin } = require('../../utils/cloud');
const { preloadImages, throttle } = require('../../utils/imageLoader');
const themeMod = require('../../utils/theme');

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const TABS = ['推荐', '写真', '证件照', '艺术', '动漫'];
const PAGE_SIZE = 20;

Page({
  data: {
    tabs: TABS,
    activeTab: '推荐',
    displayWorks: [],
    leftWorks: [],
    rightWorks: [],
    hasMore: false,
    page: 1,
    navBarHeight: 44,
    statusBarHeight: 20,
    showSearch: false,
    searchKeyword: '',
    searchResults: [],
    searchFocus: false,
    refreshing: false,
    loading: true,
    empty: false,
    theme: 'dark',
    themeClass: 'theme-dark',
  },

  onLoad() {
    const navBar = computeNavBar();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight: navBar.navBarHeight,
      statusBarHeight: navBar.statusBarHeight,
      theme, themeClass: themeMod.themeClass(theme),
    });
    this.loadWorks();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const theme = themeMod.getTheme();
    if (theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
    }
  },

  // ========== 从云数据库加载作品 ==========
  async loadWorks() {
    const { activeTab, page, searchKeyword } = this.data;
    this.setData({ loading: true, empty: false });

    try {
      const params = {
        action: 'getGalleryWorks',
        page: page,
        pageSize: PAGE_SIZE,
      };

      if (activeTab !== '推荐') {
        params.category = activeTab;
      }

      if (searchKeyword && searchKeyword.trim()) {
        params.keyword = searchKeyword.trim();
      }

      const res = await callFunction('tools', params, { silent: page > 1 });

      if (res && Array.isArray(res.works)) {
        let works = res.works || [];

        // 将 cloud:// fileID 转换为临时链接
        works = await this.resolveCloudURLs(works);

        // 检查收藏状态
        const favorites = wx.getStorageSync('myFavorites') || [];
        const favoriteIds = favorites.map(f => f.id);
        works.forEach(w => { w.isFavorited = favoriteIds.includes(w.id); });

        const mergedWorks = page === 1
          ? works
          : [...this.data.displayWorks, ...works];
        const displayWorks = this.decorateWorks(mergedWorks);
        const { leftWorks, rightWorks } = this.splitWaterfallColumns(displayWorks);
        this.setData({
          displayWorks,
          leftWorks,
          rightWorks,
          hasMore: !!res.hasMore,
          loading: false,
          refreshing: false,
          empty: page === 1 && works.length === 0,
        });

        // 预加载图片
        if (works.length > 0) {
          this.preloadWorkImages(works);
        }
      } else {
        this.setData({ loading: false, refreshing: false, empty: page === 1 });
      }
    } catch (e) {
      logger.error('[discover] 加载作品失败:', e.message);
      this.setData({ loading: false, refreshing: false, empty: page === 1 && this.data.displayWorks.length === 0 });
      if (page === 1) {
        wx.showToast({ title: '加载失败，请下拉刷新', icon: 'none' });
      }
    }
  },

  // 将 cloud:// fileID 转换为可展示的临时链接
  async resolveCloudURLs(works) {
    const needResolve = works.filter(w => w.cover && w.cover.startsWith('cloud://'));
    if (needResolve.length === 0) return works;

    try {
      const fileIDs = [...new Set(needResolve.map(w => w.cover))];
      const res = await wx.cloud.getTempFileURL({ fileList: fileIDs });
      const urlMap = {};
      (res.fileList || []).forEach(item => {
        if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
      });

      return works.map(w => {
        if (w.cover && w.cover.startsWith('cloud://')) {
          return { ...w, cover: urlMap[w.cover] || '' };
        }
        return w;
      });
    } catch (e) {
      logger.warn('[discover] 云链接转换失败:', e.message);
      return works.map(w => {
        if (w.cover && w.cover.startsWith('cloud://')) {
          return { ...w, cover: '' };
        }
        return w;
      });
    }
  },

  decorateWorks(works = []) {
    return works.map((item, index) => ({
      ...item,
      _index: index,
      seq: String(index + 1).padStart(2, '0'),
      by: this.formatAuthor(item),
      ratioClass: this.pickRatioClass(item, index),
    }));
  },

  pickRatioClass(item = {}, index = 0) {
    if (item.h >= 360) return 'tall';
    if (item.h && item.h <= 300) return 'wide';
    return index % 4 === 0 ? 'tall' : (index % 3 === 0 ? 'wide' : 'mid');
  },

  splitWaterfallColumns(works = []) {
    const leftWorks = [];
    const rightWorks = [];
    let leftHeight = 0;
    let rightHeight = 0;
    const estHeightMap = { tall: 360, mid: 320, wide: 280 };

    works.forEach((item) => {
      const estHeight = estHeightMap[item.ratioClass] || 320;
      if (leftHeight <= rightHeight) {
        leftWorks.push(item);
        leftHeight += estHeight;
      } else {
        rightWorks.push(item);
        rightHeight += estHeight;
      }
    });

    return { leftWorks, rightWorks };
  },

  formatAuthor(item = {}) {
    const raw = item.author || item.nickname || '社区创作者';
    return raw.startsWith('@') ? raw : `@${raw}`;
  },

  // 预加载图片
  preloadWorkImages(works) {
    const urls = works.map(w => w.cover).filter(url => url && !url.startsWith('/images') && !url.startsWith('cloud://'));
    if (urls.length > 0) {
      preloadImages(urls, 3);
    }
  },

  // ========== 下拉刷新 ==========
  onRefresh() {
    this.setData({ refreshing: true, page: 1 });
    this.loadWorks();
  },

  // ========== 滚动节流加载 ==========
  onScroll: throttle(function (e) {
    // 滚动时的懒加载逻辑
  }, 200),

  // ========== 搜索功能 ==========
  toggleSearch() {
    const nextShow = !this.data.showSearch;
    this.setData({ showSearch: nextShow, searchFocus: nextShow });
    // 关闭搜索时清空关键词并恢复默认列表
    if (!nextShow) {
      this.clearSearch();
    }
  },

  onSearchInput: debounce(function (e) {
    this.setData({ searchKeyword: e.detail.value });
    if (e.detail.value) {
      this.setData({ page: 1 }, () => this.loadWorks());
    } else {
      this.clearSearch();
    }
  }, 350),

  clearSearch() {
    this.setData({ searchKeyword: '', searchResults: [], page: 1 });
    this.loadWorks();
  },

  // ========== 交互 ==========
  onToggleFavorite(e) {
    const item = e.currentTarget.dataset.item;
    const favorites = wx.getStorageSync('myFavorites') || [];
    const index = favorites.findIndex(f => f.id === item.id);

    if (index > -1) {
      favorites.splice(index, 1);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      favorites.unshift({ id: item.id, url: item.cover, title: item.title, likes: item.likes });
      wx.vibrateShort({ type: 'light' });
      wx.showToast({ title: '已收藏', icon: 'success' });
    }
    wx.setStorageSync('myFavorites', favorites);
    // 更新收藏状态（避免直接修改 this.data）
    const favoriteIds = favorites.map(f => f.id);
    const displayWorks = (this.data.displayWorks || []).map(w => ({
      ...w,
      isFavorited: favoriteIds.includes(w.id),
    }));
    const { leftWorks, rightWorks } = this.splitWaterfallColumns(displayWorks);
    this.setData({ displayWorks, leftWorks, rightWorks });

    // 同步云端
    if (checkLogin()) {
      if (index > -1) {
        callFunction('tools', { action: 'removeFavorite', itemId: item.id }, { silent: true }).catch(() => {});
      } else {
        callFunction('tools', { action: 'saveFavorite', item: { id: item.id, title: item.title, cover: item.cover, likes: item.likes } }, { silent: true }).catch(() => {});
      }
    }
  },

  switchTab(e) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ activeTab: e.currentTarget.dataset.tab, page: 1, displayWorks: [], leftWorks: [], rightWorks: [] }, () => this.loadWorks());
  },

  loadMore() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 }, () => this.loadWorks());
    }
  },

  onWorkTap(e) {
    const item = e.currentTarget.dataset.item || e.currentTarget.dataset.work;
    if (!item) return;
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(item.cover)}&title=${encodeURIComponent(item.title)}&likes=${item.likes || 0}`
    });
  },

  onMakeSame(e) {
    const item = e.currentTarget.dataset.item;
    wx.setStorageSync('makeSameParams', { cover: item.cover, title: item.title });
    wx.switchTab({
      url: '/pages/create/create',
      fail: () => wx.showToast({ title: '跳转失败', icon: 'none' })
    });
  },

  onShareAppMessage() {
    return { title: '照片工坊 - 发现灵感', path: '/pages/discover/discover' };
  },

  onUnload() {
    // 页面卸载时清理
  },
});
