const { logger } = require('../../../../config/constants');
// subpackages/history/pages/history/history.js — 我的作品（dark editorial）
const { callFunction, checkLogin } = require('../../../../utils/cloud');
const { computeNavBar, formatTime, saveImageToAlbum } = require('../../../../utils/common');
const themeMod = require('../../../../utils/theme');

// Only these schemes are renderable by <image>. Stale/relative paths get filtered out.
const VALID_URL = /^(https?:|cloud:|wxfile:|http:|\/\/|data:)/i;
const isRenderable = (u) => typeof u === 'string' && VALID_URL.test(u);

Page({
  data: {
    navBarHeight: 44,
    statusBarHeight: 20,
    works: [],
    leftCol: [],
    rightCol: [],
    loading: false,
    refreshing: false,
    empty: false,
    theme: 'dark',
    themeClass: 'theme-dark',
    _lastLoadTime: 0,
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight, statusBarHeight,
      theme, themeClass: themeMod.themeClass(theme),
    });
    this.loadWorks();
  },

  onShow() {
    const theme = themeMod.getTheme();
    if (theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
    }
    const now = Date.now();
    if (now - this.data._lastLoadTime < 3000) return;
    this.setData({ _lastLoadTime: now });
    this.loadWorks();
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadWorks();
  },

  async loadWorks() {
    this.setData({ loading: true });

    // Local seed — keep all valid entries
    let local = (wx.getStorageSync('myWorks') || []).filter(w => {
      if (!w) return false;
      // Keep if has a renderable url, a fileID, or any valid identifier
      return isRenderable(w.url) || (w.fileID && typeof w.fileID === 'string') || w.id;
    });
    // Persist cleaned data back
    wx.setStorageSync('myWorks', local);
    this._apply(local);

    if (!checkLogin()) {
      this.setData({ loading: false, refreshing: false });
      return;
    }

    try {
      const cloud = await callFunction('tools', { action: 'getWorks', limit: 100 }, { silent: true });
      const cloudWorks = (Array.isArray(cloud) ? cloud : []).map(item => ({
        id: item.createTime || item._id,
        cloudId: item._id,
        fileID: item.fileID || (item.url && item.url.startsWith('cloud://') ? item.url : ''),
        url: item.url,
        title: item.title || item.style || '',
        prompt: item.prompt,
        style: item.style,
        time: formatTime(item.createTime),
        needResolve: !item.url || (item.url && item.url.startsWith('cloud://')),
      }));

      // Merge, de-dupe by cloudId/fileID/url
      const merged = [...local];
      cloudWorks.forEach(c => {
        const key = c.cloudId || c.fileID || c.url;
        const idx = merged.findIndex(m => (m.cloudId || m.fileID || m.url) === key);
        if (idx === -1) merged.push(c);
        else merged[idx] = { ...merged[idx], ...c, cloudId: c.cloudId || merged[idx].cloudId };
      });
      merged.sort((a, b) => (b.id || 0) - (a.id || 0));
      this._apply(merged);
      wx.setStorageSync('myWorks', merged);
      this._resolveCloudURLs(merged);
    } catch (err) {
      logger.debug('[history] cloud sync failed:', err && err.message);
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  async _resolveCloudURLs(works) {
    const needs = works.filter(w => w.needResolve && (w.fileID || (w.url && w.url.startsWith('cloud://'))));
    if (!needs.length) return;
    const fileIDs = [...new Set(needs.map(w => w.fileID || w.url))];
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: fileIDs, timeout: 6000 });
      const urlMap = {};
      (res.fileList || []).forEach(f => {
        if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
      });
      const updated = this.data.works.map(w => {
        const key = w.fileID || w.url;
        if (key && urlMap[key]) return { ...w, url: urlMap[key], needResolve: false };
        return w;
      });
      this._apply(updated);
      wx.setStorageSync('myWorks', updated);
    } catch (err) {
      logger.debug('[history] getTempFileURL failed:', err && err.message);
    }
  },

  _apply(works) {
    // Filter out anything that still has an invalid URL AND no fileID — they'll never render
    const safe = works
      .filter(w => isRenderable(w.url) || (w.fileID && typeof w.fileID === 'string') || w.id)
      .map((w, i) => ({
        ...w,
        _index: i,
        seq: String(i + 1).padStart(2, '0'),
      }));
    this.setData({
      works: safe,
      empty: safe.length === 0,
    });
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/my/my' });
  },

  goCreate() {
    wx.switchTab({ url: '/pages/create/create' });
  },

  onPreview(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.works[index];
    if (!item || !isRenderable(item.url)) return;
    const title = item.title || item.style || '作品';
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(title)}`,
    });
  },

  onMakeSame(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    wx.setStorageSync('makeSameParams', {
      cover: item.url,
      title: item.title || '作品',
      style: item.style || '',
    });
    wx.switchTab({ url: '/pages/create/create' });
  },

  async onSave(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !isRenderable(item.url)) {
      wx.showToast({ title: '图片不可用', icon: 'none' });
      return;
    }
    await saveImageToAlbum(item.url);
  },

  onDelete(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      success: (res) => {
        if (!res.confirm) return;
        const works = this.data.works.filter(w => w.id !== item.id);
        this._apply(works);
        wx.setStorageSync('myWorks', works);
        if (checkLogin() && item.cloudId) {
          callFunction('tools', { action: 'deleteWork', workId: item.cloudId }, { silent: true }).catch(() => {});
        }
        wx.showToast({ title: '已删除', icon: 'success' });
      },
    });
  },

  onImgError(e) {
    const id = e.currentTarget.dataset.id;
    logger.debug('[history] image load failed for id=', id);
    // 温和处理：仅标记加载失败，不自动删除，避免网络波动导致作品丢失
    const works = this.data.works.map(w => w.id === id ? { ...w, _imgError: true } : w);
    this._apply(works);
    wx.setStorageSync('myWorks', works);
  },

  onShareAppMessage() {
    const works = this.data.works;
    const share = { title: '照片工坊 - 我的AI作品', path: '/subpackages/history/pages/history/history' };
    if (works.length > 0 && isRenderable(works[0].url)) share.imageUrl = works[0].url;
    return share;
  },
});
