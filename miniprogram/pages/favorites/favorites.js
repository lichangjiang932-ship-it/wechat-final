const { logger } = require('../../config/constants');
// pages/favorites/favorites.js — Library tab: my works + favorites (merged)
const { callFunction, checkLogin } = require('../../utils/cloud');
const { computeNavBar } = require('../../utils/common');
const themeMod = require('../../utils/theme');

// Only these schemes are renderable by <image>. Stale/relative paths get filtered out.
const VALID_URL = /^(https?:|cloud:|wxfile:|http:|\/\/|data:)/i;
const isRenderable = (u) => typeof u === 'string' && VALID_URL.test(u);

Page({
  data: {
    navBarHeight: 44,
    statusBarHeight: 20,
    favorites: [],
    leftCol: [],
    rightCol: [],
    loading: false,
    refreshing: false,
    empty: false,
    theme: 'dark',
    themeClass: 'theme-dark',
    showBack: false,
    _lastLoadTime: 0,
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    const theme = themeMod.getTheme();
    const pages = getCurrentPages();
    const showBack = pages.length > 1;
    this.setData({
      navBarHeight, statusBarHeight,
      theme, themeClass: themeMod.themeClass(theme),
      showBack,
    });
    this.loadLibrary();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    const theme = themeMod.getTheme();
    const pages = getCurrentPages();
    const showBack = pages.length > 1;
    if (theme !== this.data.theme || showBack !== this.data.showBack) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme), showBack });
    }
    // throttle: don't re-fetch faster than every 3s
    const now = Date.now();
    if (now - this.data._lastLoadTime < 3000) return;
    this._lastLoadTime = now;
    this.loadLibrary();
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadLibrary();
  },

  // Merged loader: own works (getWorks) + saved favorites (getFavorites)
  async loadLibrary() {
    this.setData({ loading: true });

    // 1. Seed with locally cached lists so UI paints instantly
    // Filter out stale entries with invalid URLs (old /images/covers/... paths)
    const localWorks = (wx.getStorageSync('myWorks') || []).filter(w => {
      if (!w) return false;
      return isRenderable(w.url) || isRenderable(w.cover) || (w.fileID && w.fileID.startsWith('cloud://'));
    });
    const localFavs = (wx.getStorageSync('myFavorites') || []).filter(w => {
      if (!w) return false;
      return isRenderable(w.url) || isRenderable(w.cover) || (w.fileID && w.fileID.startsWith('cloud://'));
    });
    // Persist cleaned data back
    wx.setStorageSync('myWorks', localWorks);
    wx.setStorageSync('myFavorites', localFavs);

    const seed = this._merge(localWorks, localFavs);
    this._applyItems(seed);

    if (!checkLogin()) {
      this.setData({ loading: false, refreshing: false });
      return;
    }

    // 2. Pull both in parallel from cloud
    let cloudWorks = [];
    let cloudFavs  = [];
    try {
      const [worksRes, favsRes] = await Promise.all([
        callFunction('tools', { action: 'getWorks', limit: 100 }, { silent: true }).catch(() => []),
        callFunction('tools', { action: 'getFavorites' }, { silent: true }).catch(() => []),
      ]);

      cloudWorks = (Array.isArray(worksRes) ? worksRes : []).map(item => ({
        id: item.createTime || item._id,
        cloudId: item._id,
        fileID: item.fileID || (item.url && item.url.startsWith('cloud://') ? item.url : ''),
        url: item.url,
        cover: item.url,
        title: item.title || item.style || '',
        style: item.style,
        prompt: item.prompt,
        kind: 'work',
        needResolve: !item.url || (item.url && item.url.startsWith('cloud://')),
      }));

      const favData = Array.isArray(favsRes)
        ? favsRes
        : (favsRes && Array.isArray(favsRes.data) ? favsRes.data : []);
      cloudFavs = favData.map(item => ({
        id: item.itemId || item._id,
        url: item.cover,
        cover: item.cover,
        title: item.title || '',
        likes: item.likes,
        kind: 'favorite',
        needResolve: item.cover && item.cover.startsWith('cloud://'),
      }));

      const merged = this._merge(cloudWorks, cloudFavs, localWorks, localFavs);
      this._applyItems(merged);

      // Persist back
      wx.setStorageSync('myWorks',     cloudWorks.length ? cloudWorks : localWorks);
      wx.setStorageSync('myFavorites', cloudFavs.length  ? cloudFavs  : localFavs);

      // Resolve any cloud:// URLs
      this._resolveCloudURLs(merged);
    } catch (err) {
      logger.debug('[library] sync failed:', err && err.message);
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  // De-dupe by (cloudId || fileID || url || id); order: own works first, then favorites
  _merge(...lists) {
    const out = [];
    const seen = new Set();
    lists.forEach(list => {
      (list || []).forEach(it => {
        const key = it.cloudId || it.fileID || it.url || it.cover || it.id;
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(it);
      });
    });
    out.sort((a, b) => (b.id || 0) - (a.id || 0));
    return out;
  },

  _applyItems(items) {
    // Filter out anything that still has an invalid URL AND no fileID — they'll never render
    const safe = items.filter(w => isRenderable(w.url) || isRenderable(w.cover) || (w.fileID && w.fileID.startsWith('cloud://')));
    const decorated = this.decorateItems(safe);
    const { leftCol, rightCol } = this.splitItems(decorated);
    this.setData({
      favorites: decorated,
      leftCol,
      rightCol,
      empty: safe.length === 0,
    });
  },

  decorateItems(items = []) {
    return items.map((item, index) => {
      const ratioClass = this.pickRatioClass(item, index);
      const tags = this.buildTags(item);
      return {
        ...item,
        _index: index,
        ratioClass,
        topicText: tags.map(t => `#${t}`).join(' ') || '#今日灵感',
        authorText: this.buildAuthor(item),
      };
    });
  },

  pickRatioClass(item = {}, index = 0) {
    if (item.h >= 360) return 'tall';
    if (item.h && item.h <= 300) return 'wide';
    return index % 4 === 0 ? 'tall' : (index % 3 === 0 ? 'wide' : 'mid');
  },

  buildTags(item = {}) {
    const tags = [];
    if (item.kind === 'work') tags.push('我的作品');
    if (item.kind === 'favorite') tags.push('收藏');
    if (item.style) tags.push(item.style);
    if (item.title && tags.length < 2) tags.push(String(item.title).slice(0, 8));
    if (!tags.length) tags.push('灵感');
    return [...new Set(tags.map(t => String(t).trim()).filter(Boolean))].slice(0, 2);
  },

  buildAuthor(item = {}) {
    const raw = item.author || item.nickname || (item.kind === 'work' ? '我' : '社区作者');
    return raw.startsWith('@') ? raw : `@${raw}`;
  },

  splitItems(items = []) {
    const leftCol = [];
    const rightCol = [];
    let leftHeight = 0;
    let rightHeight = 0;
    const estHeightMap = { tall: 360, mid: 320, wide: 280 };

    items.forEach((item) => {
      const estHeight = estHeightMap[item.ratioClass] || 320;
      if (leftHeight <= rightHeight) {
        leftCol.push(item);
        leftHeight += estHeight;
      } else {
        rightCol.push(item);
        rightHeight += estHeight;
      }
    });

    return { leftCol, rightCol };
  },

  async _resolveCloudURLs(items) {
    const fileIDs = items
      .filter(it => it.needResolve && (it.fileID || (it.url && it.url.startsWith('cloud://')) || (it.cover && it.cover.startsWith('cloud://'))))
      .map(it => it.fileID || it.url || it.cover)
      .filter(Boolean);
    const unique = [...new Set(fileIDs)];
    if (unique.length === 0) return;

    try {
      const res = await wx.cloud.getTempFileURL({ fileList: unique, timeout: 6000 });
      const urlMap = {};
      (res.fileList || []).forEach(f => {
        if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
      });
      const updated = this.data.favorites.map(it => {
        const key = it.fileID || (it.url && it.url.startsWith('cloud://') ? it.url : '') || (it.cover && it.cover.startsWith('cloud://') ? it.cover : '');
        if (key && urlMap[key]) {
          return { ...it, url: urlMap[key], cover: urlMap[key], needResolve: false };
        }
        return it;
      });
      this._applyItems(updated);
    } catch (err) {
      logger.debug('[library] getTempFileURL failed:', err && err.message);
    }
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
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    const url = item.url || item.cover;
    if (!url) return;
    const title = item.title || item.style || '作品';
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    });
  },

  onMakeSame(e) {
    const item = e.currentTarget.dataset.item;
    wx.setStorageSync('makeSameParams', {
      cover: item.url || item.cover,
      title: item.title || '作品',
    });
    wx.switchTab({ url: '/pages/create/create' });
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定从图书馆中移除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        // Remove from local caches (both works and favs)
        const works = (wx.getStorageSync('myWorks') || []).filter(f => f.id !== id);
        const favs  = (wx.getStorageSync('myFavorites') || []).filter(f => f.id !== id);
        wx.setStorageSync('myWorks', works);
        wx.setStorageSync('myFavorites', favs);
        const merged = this._merge(works, favs);
        this._applyItems(merged);

        if (checkLogin()) {
          try {
            await callFunction('tools', { action: 'removeFavorite', itemId: id }, { silent: true });
          } catch (err) { /* ignore */ }
        }
        wx.showToast({ title: '已移除', icon: 'success' });
      },
    });
  },

  onShareAppMessage() {
    return { title: '照片工坊 · 我的图书馆', path: '/pages/favorites/favorites' };
  },
});
