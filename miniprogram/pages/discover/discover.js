// pages/discover/discover.js - 发现页
const { computeNavBar } = require('../../utils/common');
const { STYLES } = require('../../config/data');
const { preloadImages, throttle } = require('../../utils/imageLoader');

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const TABS = ['推荐', '写真', '证件照', '艺术', '动漫'];

const MOCK_WORKS = [
  { id: 1, title: '最美证件照', cover: '/images/covers/cover-portrait.jpg', likes: 1280, h: 320, category: '证件照' },
  { id: 2, title: '日系写真', cover: '/images/covers/cover-art.jpg', likes: 960, h: 400, category: '写真' },
  { id: 3, title: '水彩插画', cover: '/images/covers/cover-watercolor.jpg', likes: 856, h: 280, category: '艺术' },
  { id: 4, title: '国风古韵', cover: '/images/covers/cover-chinese.jpg', likes: 742, h: 380, category: '艺术' },
  { id: 5, title: '赛博朋克', cover: '/images/covers/cover-cyberpunk.jpg', likes: 621, h: 300, category: '艺术' },
  { id: 6, title: '油画质感', cover: '/images/covers/inspire-warm.jpg', likes: 580, h: 360, category: '艺术' },
  { id: 7, title: '二次元', cover: '/images/covers/cover-anime.jpg', likes: 432, h: 340, category: '动漫' },
  { id: 8, title: '粘土风', cover: '/images/covers/cover-clay.jpg', likes: 389, h: 260, category: '动漫' },
];

Page({
  data: {
    tabs: TABS,
    activeTab: '推荐',
    leftCol: [],
    rightCol: [],
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
  },

  onLoad() {
    const navBar = computeNavBar();
    this.setData({ navBarHeight: navBar.navBarHeight, statusBarHeight: navBar.statusBarHeight });
    this.loadWorks();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  // ========== 数据加载 ==========
  loadWorks() {
    this.setData({ loading: true });

    setTimeout(() => {
      let works = [...MOCK_WORKS];

      if (this.data.activeTab !== '推荐') {
        works = works.filter(w => w.category === this.data.activeTab);
      }

      if (this.data.searchKeyword) {
        const keyword = this.data.searchKeyword.toLowerCase();
        works = works.filter(w => w.title.toLowerCase().includes(keyword));
      }

      const favorites = wx.getStorageSync('myFavorites') || [];
      const favoriteIds = favorites.map(f => f.id);
      works.forEach(w => { w.isFavorited = favoriteIds.includes(w.id); });

      const left = works.filter((_, i) => i % 2 === 0);
      const right = works.filter((_, i) => i % 2 !== 0);

      this.setData({
        leftCol: left,
        rightCol: right,
        hasMore: false,
        loading: false,
        refreshing: false,
      });

      // 预加载图片
      this.preloadWorkImages(works);
    }, 300);
  },

  // 预加载图片
  preloadWorkImages(works) {
    const urls = works.map(w => w.cover).filter(url => url && !url.startsWith('/images'));
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
  onScroll: throttle(function(e) {
    // 可以在这里处理滚动时的懒加载逻辑
  }, 200),

  // ========== 搜索功能 ==========
  toggleSearch() {
    this.setData({ showSearch: !this.data.showSearch, searchFocus: !this.data.showSearch });
    if (!this.data.showSearch) {
      this.clearSearch();
    }
  },

  onSearchInput: debounce(function (e) {
    this.setData({ searchKeyword: e.detail.value });
    if (e.detail.value) {
      this.loadWorks();
    } else {
      this.clearSearch();
    }
  }, 350),

  clearSearch() {
    this.setData({ searchKeyword: '', searchResults: [] });
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
      wx.showToast({ title: '已收藏', icon: 'success' });
    }
    wx.setStorageSync('myFavorites', favorites);
    this.loadWorks();
  },

  switchTab(e) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ activeTab: e.currentTarget.dataset.tab, page: 1 }, () => this.loadWorks());
  },

  loadMore() {
    if (this.data.hasMore) {
      this.setData({ page: this.data.page + 1 }, () => this.loadWorks());
    }
  },

  onImageTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: `/pages/preview/preview?url=${encodeURIComponent(item.cover)}&title=${encodeURIComponent(item.title)}&likes=${item.likes}`
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
    // 页面卸载时可以清理资源
  },
});