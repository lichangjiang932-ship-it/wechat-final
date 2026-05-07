// pages/upload/upload.js — 我的上传 · 真实比例预览版
const { callFunction, uploadFile, checkLogin } = require('../../utils/cloud');
const { computeNavBar, formatTime } = require('../../utils/common');
const themeMod = require('../../utils/theme');

const MAX_FILE_SIZE  = 20 * 1024 * 1024; // 20MB
const STORAGE_KEY     = 'myUploads';
const MAX_STORED      = 200;

Page({
  data: {
    photos: [],          // 本次选中待上传 / 已上传
    recentPhotos: [],    // 历史已上传记录
    total: 0,
    cloudCount: 0,
    totalSize: '0 MB',
    hasCloudPhotos: false,
    uploadingCount: 0,   // 正在上传的数量（WXML 不支持箭头函数，在此预计算）
    pendingCount: 0,     // 待上传的数量（编辑完成后点"上传"才开始传）
    navBarHeight: 44,
    statusBarHeight: 20,
    theme: 'dark',
    themeClass: 'theme-dark',
    scrollTo: '',        // 跳转锚点（点击「我的上传」时跳到历史区）
    showRecent: false,   // 默认折叠历史区，避免回到页面被历史图片占据
    // 编辑弹窗（名称 + 标签）
    showEditPopup: false,
    editingId: '',       // 当前正在编辑的图片 id
    editingFrom: '',     // 'current' | 'history'
    editingName: '',
    editingTags: '',
  },

  onLoad() {
    const navBar = computeNavBar();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight: navBar.navBarHeight,
      statusBarHeight: navBar.statusBarHeight,
      theme, themeClass: themeMod.themeClass(theme),
    });
    this.loadHistory();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    const theme = themeMod.getTheme();
    const patch = { showRecent: false, scrollTo: '' }; // 每次回到页面默认折叠历史区
    if (theme !== this.data.theme) {
      patch.theme = theme;
      patch.themeClass = themeMod.themeClass(theme);
    }
    this.setData(patch);
    this.loadHistory();
    this._recalcStats();
  },

  // ============================================================
  // 读取历史记录
  // ============================================================
  loadHistory() {
    const raw = wx.getStorageSync(STORAGE_KEY) || [];
    let photos = raw.map(p => ({
      ...p,
      uploading: false,
      failed: false,
      progress: 0,
    }));

    // 刷新过期的云存储临时 URL（有 fileID 但 displayUrl 是旧的 http 临时链接）
    const needRefresh = photos.filter(p => p.fileID && p.displayUrl && p.displayUrl.startsWith('http'));
    if (needRefresh.length > 0) {
      wx.cloud.getTempFileURL({
        fileList: needRefresh.map(p => p.fileID),
        success: (res) => {
          const urlMap = {};
          (res.fileList || []).forEach(f => { if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL; });
          photos = photos.map(p => (p.fileID && urlMap[p.fileID]) ? { ...p, displayUrl: urlMap[p.fileID] } : p);
          this._applyHistory(photos);
          wx.setStorageSync(STORAGE_KEY, photos);
        },
        fail: () => this._applyHistory(photos),
      });
      return;
    }

    this._applyHistory(photos);
  },

  _applyHistory(photos) {
    const total      = photos.length;
    const cloudCount = photos.filter(p => !!p.fileID).length;
    const totalBytes = photos.reduce((s, p) => s + (p.size || 0), 0);
    const hasCloud   = photos.some(p => !!p.fileID);
    const currentIds = new Set((this.data.photos || []).map(p => p.id));
    const filtered   = photos.filter(p => !currentIds.has(p.id));
    this.setData({
      recentPhotos:  filtered.slice(0, 30),
      total,
      cloudCount,
      totalSize: this._formatSize(totalBytes),
      hasCloudPhotos: hasCloud,
    });
  },

  // ============================================================
  // 选择图片
  // ============================================================
  chooseImage() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original', 'compressed'],
      success: async (res) => {
        // 先收集元数据，再渲染列表
        const newItems = await Promise.all(
          res.tempFiles.map((f, i) => this._buildPhotoItem(f, i))
        );
        const mergedPhotos = [...this.data.photos, ...newItems];
        this.setData({ photos: mergedPhotos });
        // 不再立即上传，改为自动弹出第一张的编辑弹窗
        if (newItems.length > 0) {
          this.onEditPhoto({ currentTarget: { dataset: { item: newItems[0], from: 'current' } } });
        }
        this._recalcStats(mergedPhotos);
      },
      fail: (e) => {
        if (e.errMsg && !e.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择失败', icon: 'none' });
        }
      },
    });
  },

  // 构建完整的图片对象（含元数据）
  async _buildPhotoItem(file, idx) {
    let meta = null;
    try {
      meta = await new Promise((resolve) => {
        wx.getImageInfo({
          src: file.tempFilePath,
          success: (r) => resolve({ width: r.width, height: r.height }),
          fail: () => resolve(null),
        });
      });
    } catch (_) {}

    // 生成更友好的默认名称：「我的照片 5.8 #1」
    const d = new Date();
    const friendlyName = `我的照片 ${d.getMonth() + 1}.${d.getDate()} #${idx + 1}`;
    const ext = (file.tempFilePath.split('.').pop() || 'jpg').toUpperCase();

    return {
      id:          `local_${Date.now()}_${idx}`,
      tempPath:    file.tempFilePath,
      displayUrl:  file.tempFilePath,
      size:        file.size,
      name:        friendlyName,
      tags:        [],
      format:      ext,
      sizeLabel:   this._formatSize(file.size),
      meta,          // { width, height }
      uploading:    false,
      failed:      false,
      progress:    0,
      fileID:      '',
      uploadTime:  formatTime(Date.now()),
      status:      'draft',   // draft | ready | uploading | done | failed
    };
  },

  // ============================================================
  // 队列上传
  // ============================================================
  async _uploadNext() {
    const { photos } = this.data;
    // 已全部处理完（只处理未上传且未失败的）
    const pending = photos.filter(p => !p.fileID && !p.uploading && !p.failed);
    if (pending.length === 0) {
      // 队列空且本次至少成功一张 → 提示，并将已上传的图片从当前会话移除
      const anySuccess = photos.some(p => !!p.fileID);
      const anyInFlight = photos.some(p => p.uploading);
      if (anySuccess && !anyInFlight) {
        wx.showToast({ title: '上传成功', icon: 'success', duration: 1000 });
        // 已上传的图片进入历史记录后，从当前会话移除，让"还没有上传"空状态重新出现
        const remaining = photos.filter(p => !p.fileID);
        this.setData({ photos: remaining });
        this._recalcStats(remaining);
      }
      return;
    }

    const idx = photos.findIndex(p => !p.fileID && !p.uploading && !p.failed);
    if (idx < 0) return;

    const item = photos[idx];
    const updated = [...photos];
    updated[idx] = { ...item, uploading: true, progress: 0, status: 'uploading' };
    this.setData({ photos: updated });

    try {
      // 超大文件先压缩
      if (item.size > MAX_FILE_SIZE) {
        await this._compressAndUpload(idx, item);
        return;
      }

      // 模拟渐进进度
      const progressTimer = setInterval(() => {
        const cur = this.data.photos[idx];
        if (!cur || !cur.uploading) { clearInterval(progressTimer); return; }
        const p = Math.min((cur.progress || 0) + Math.floor(Math.random() * 12 + 5), 88);
        const photos2 = [...this.data.photos];
        if (photos2[idx]) photos2[idx] = { ...photos2[idx], progress: p };
        this.setData({ photos: photos2 });
      }, 250);

      const fileID = await uploadFile(item.tempPath);
      clearInterval(progressTimer);

      const photos3 = [...this.data.photos];
      photos3[idx] = { ...photos3[idx], uploading: false, failed: false, progress: 100, fileID, status: 'done' };
      this.setData({ photos: photos3 });
      this._saveToHistory(photos3[idx]);
      this._recalcStats(photos3);

      wx.showToast({ title: `${idx + 1} 上传完成`, icon: 'none', duration: 1200 });
      this._uploadNext();

    } catch (e) {
      console.error('[upload] 上传失败', e);
      const photos4 = [...this.data.photos];
      photos4[idx] = { ...photos4[idx], uploading: false, failed: true, progress: 0, status: 'failed' };
      this.setData({ photos: photos4 });
      this._recalcStats(photos4);
      wx.showToast({ title: '上传失败，点击重试', icon: 'none' });
    }
  },

  async _compressAndUpload(idx, item) {
    try {
      const compressedPath = await new Promise((resolve, reject) => {
        wx.compressImage({
          src: item.tempPath,
          quality: 75,
          success: (r) => resolve(r.tempFilePath),
          fail: (e) => reject(e),
        });
      });

      const photos = [...this.data.photos];
      photos[idx] = { ...photos[idx], uploading: true, progress: 0, tempPath: compressedPath };
      this.setData({ photos });

      const fileID = await uploadFile(compressedPath);
      const photos2 = [...this.data.photos];
      photos2[idx] = { ...photos2[idx], uploading: false, failed: false, progress: 100, fileID, status: 'done' };
      this.setData({ photos: photos2 });
      this._saveToHistory(photos2[idx]);
      this._recalcStats(photos2);
      this._uploadNext();

    } catch (e) {
      console.error('[upload] 压缩上传失败', e);
      const photos3 = [...this.data.photos];
      photos3[idx] = { ...photos3[idx], uploading: false, failed: true, status: 'failed' };
      this.setData({ photos: photos3 });
      this._recalcStats(photos3);
      this._uploadNext();
    }
  },

  // ============================================================
  // 预览
  // ============================================================
  previewPhoto(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === undefined) return;
    const urls = this.data.photos.map(p => p.displayUrl);
    wx.previewImage({ urls, current: urls[idx], showmenu: true });
  },

  onPreviewHistory(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    // 先取临时链接再预览（云存储图片）
    if (item.fileID && !item.displayUrl.startsWith('http')) {
      wx.cloud.getTempFileURL({
        fileList: [item.fileID],
        success: (r) => {
          const url = r.fileList[0]?.tempFileURL;
          if (url) wx.previewImage({ urls: [url], current: url, showmenu: true });
          else wx.previewImage({ urls: [item.displayUrl], current: item.displayUrl, showmenu: true });
        },
        fail: () => wx.previewImage({ urls: [item.displayUrl], current: item.displayUrl, showmenu: true }),
      });
    } else {
      wx.previewImage({ urls: [item.displayUrl], current: item.displayUrl, showmenu: true });
    }
  },

  // ============================================================
  // 用作参考图 → 跳转创作页
  // ============================================================
  onUseAsReference(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    // 优先用临时路径（本地或已压缩后的）
    let imgUrl = item.displayUrl;

    // 如果是云存储文件且本地路径不是 http，则取临时链接
    if (item.fileID && !imgUrl.startsWith('http')) {
      wx.showLoading({ title: '加载参考图...', mask: true });
      wx.cloud.getTempFileURL({
        fileList: [item.fileID],
        success: (res) => {
          wx.hideLoading();
          const tempUrl = res.fileList[0]?.tempFileURL;
          this._doSwitchTab(item, tempUrl || imgUrl);
        },
        fail: () => {
          wx.hideLoading();
          this._doSwitchTab(item, imgUrl);
        },
      });
    } else {
      this._doSwitchTab(item, imgUrl);
    }
  },

  _doSwitchTab(item, imgUrl) {
    try {
      const refData = {
        url: imgUrl,
        fileID: item.fileID || '',
        name: item.name || '参考图',
        meta: item.meta || null,
        sizeLabel: item.sizeLabel || '',
        uploadTime: item.uploadTime || '',
      };
      wx.setStorageSync('refImage', refData);
    } catch (_) {}
    wx.switchTab({ url: '/pages/create/create' });
  },

  // ============================================================
  // 删除
  // ============================================================
  deletePhoto(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === undefined) return;
    wx.showModal({
      title: '删除图片',
      content: '确定要删除这张图片吗？',
      confirmText: '删除',
      confirmColor: '#E86A3C',
      success: (r) => {
        if (!r.confirm) return;
        const photos = [...this.data.photos];
        photos.splice(idx, 1);
        this.setData({ photos });
        this._recalcStats(photos);
      },
    });
  },

  deleteHistory(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    wx.showModal({
      title: '删除图片',
      content: '确定要删除这张图片吗？',
      confirmText: '删除',
      confirmColor: '#E86A3C',
      success: (r) => {
        if (!r.confirm) return;
        let stored = wx.getStorageSync(STORAGE_KEY) || [];
        stored = stored.filter(s => s.id !== item.id);
        wx.setStorageSync(STORAGE_KEY, stored);
        // 云端也删
        if (item._id) {
          callFunction('tools', {
            action: 'deleteUpload',
            uploadId: item._id,
          }, { silent: true }).catch(() => {});
        }
        this.loadHistory();
      },
    });
  },

  // ============================================================
  // 保存全部到相册
  // ============================================================
  async saveAllToAlbum() {
    const allPhotos = [...this.data.photos, ...this.data.recentPhotos];
    const cloudPhotos = allPhotos.filter(p => !!p.fileID && !p.uploading && !p.failed);

    if (cloudPhotos.length === 0) {
      wx.showToast({ title: '没有可保存的图片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    let success = 0, fail = 0;

    for (const photo of cloudPhotos) {
      try {
        let filePath = photo.tempPath || photo.displayUrl;
        // 云存储图片先取临时链接
        if (photo.fileID && !filePath.startsWith('http')) {
          const res = await wx.cloud.getTempFileURL({ fileList: [photo.fileID] });
          filePath = res.fileList[0]?.tempFileURL || filePath;
        }
        await new Promise((resolve, reject) => {
          wx.saveImageToPhotosAlbum({
            filePath,
            success: resolve,
            fail: (e) => {
              if (e.errMsg && e.errMsg.includes('auth deny')) reject(new Error('auth_deny'));
              else resolve();
            },
          });
        });
        success++;
      } catch (e) {
        fail++;
      }
    }

    wx.hideLoading();
    if (fail > 0) {
      wx.showModal({
        title: '保存结果',
        content: `成功 ${success} 张${fail > 0 ? `，失败 ${fail} 张` : ''}，请授权相册权限后重试`,
        showCancel: false,
      });
    } else {
      wx.showToast({ title: `已保存 ${success} 张到相册`, icon: 'success' });
    }
  },

  // ============================================================
  // 重新计算统计
  // ============================================================
  _recalcStats(optPhotos) {
    // 支持传入最新的 photos 数组，避免 setData 异步导致读取到旧值
    const currentPhotos = optPhotos || this.data.photos || [];
    const allPhotos = [...currentPhotos, ...this.data.recentPhotos];
    const total      = allPhotos.length;
    const cloudCount = allPhotos.filter(p => !!p.fileID).length;
    const totalBytes = allPhotos.reduce((s, p) => s + (p.size || 0), 0);
    const hasCloud   = allPhotos.some(p => !!p.fileID);
    const uploadingCount = currentPhotos.filter(p => p.uploading).length;
    const pendingCount = currentPhotos.filter(p => !p.fileID && !p.uploading && !p.failed).length;
    this.setData({
      total,
      cloudCount,
      totalSize: this._formatSize(totalBytes),
      hasCloudPhotos: hasCloud,
      uploadingCount,
      pendingCount,
    });
  },

  // ============================================================
  // 保存到历史记录（本地 + 云端）
  // ============================================================
  _saveToHistory(item) {
    try {
      let stored = wx.getStorageSync(STORAGE_KEY) || [];
      stored = [{ ...item }, ...stored].slice(0, MAX_STORED);
      wx.setStorageSync(STORAGE_KEY, stored);

      if (item.fileID) {
        // 同步到「我的作品」本地存储，确保作品页立刻能看到上传结果
        const work = {
          id: Date.now(),
          fileID: item.fileID,
          url:    item.fileID,
          title:  item.name || '上传作品',
          prompt: '',
          style:  'photo',
          time:   item.uploadTime || formatTime(Date.now()),
          cloudId: '',
        };
        console.log('[upload] saving work to myWorks:', JSON.stringify(work));
        try {
          let works = wx.getStorageSync('myWorks') || [];
          works.unshift(work);
          if (works.length > 100) works = works.slice(0, 100);
          wx.setStorageSync('myWorks', works);
          console.log('[upload] myWorks count:', works.length);
        } catch (e) {
          console.error('[upload] 本地保存作品失败', e);
        }

        // 云端（静默）
        if (checkLogin()) {
          // 保存到上传记录
          callFunction('tools', {
            action: 'saveUpload',
            item: {
              fileID:    item.fileID,
              url:       item.tempPath,
              name:      item.name,
              size:      item.size,
              uploadTime: item.uploadTime,
            },
          }, { silent: true }).catch(() => {});

          // 同时保存到作品库，并回填 cloudId
          callFunction('tools', {
            action: 'saveWork',
            work,
          }, { silent: true }).then((saved) => {
            if (saved && saved.id) {
              try {
                const list = (wx.getStorageSync('myWorks') || []).map(w =>
                  w.id === work.id ? { ...w, cloudId: saved.id } : w
                );
                wx.setStorageSync('myWorks', list);
              } catch (_) {}
            }
          }).catch(() => {});
        }
      }
      this.loadHistory();
    } catch (e) {
      console.error('[upload] 保存历史失败', e);
    }
  },

  // ============================================================
  // 工具函数
  // ============================================================
  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  },

  // 「我的上传」入口：滚动到历史区
  onViewMyUploads() {
    if (!this.data.recentPhotos || this.data.recentPhotos.length === 0) {
      wx.showToast({ title: '还没有上传记录', icon: 'none' });
      return;
    }
    // 先展开历史区，再滚动到锚点
    this.setData({ showRecent: true, scrollTo: '' });
    setTimeout(() => this.setData({ scrollTo: 'history-anchor' }), 40);
  },

  // ============================================================
  // 编辑名称 / 标签
  // ============================================================
  onEditPhoto(e) {
    const item = e.currentTarget.dataset.item;
    const from = e.currentTarget.dataset.from || 'current';
    if (!item) return;
    const tagsStr = Array.isArray(item.tags) ? item.tags.join('，') : '';
    this.setData({
      showEditPopup: true,
      editingId: item.id,
      editingFrom: from,
      editingName: item.name || '',
      editingTags: tagsStr,
    });
  },

  onEditNameInput(e) { this.setData({ editingName: e.detail.value }); },
  onEditTagsInput(e) { this.setData({ editingTags: e.detail.value }); },

  closeEditPopup() {
    this.setData({ showEditPopup: false, editingId: '', editingFrom: '', editingName: '', editingTags: '' });
  },

  saveEdit() {
    const { editingId, editingFrom, editingName, editingTags } = this.data;
    if (!editingId) return this.closeEditPopup();

    const name = (editingName || '').trim() || '未命名';
    const tags = (editingTags || '')
      .split(/[,，、\s]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 8);

    // 判断是否是刚选择尚未上传的 draft 图片
    const targetPhoto = editingFrom === 'current' ? this.data.photos.find(p => p.id === editingId) : null;
    const isDraftNew = targetPhoto && targetPhoto.status === 'draft';

    // 1. 更新当前会话列表
    if (editingFrom === 'current') {
      const photos = this.data.photos.map(p => p.id === editingId ? { ...p, name, tags, status: 'ready' } : p);
      this.setData({ photos });
      this._recalcStats(photos);
    } else {
      const recentPhotos = this.data.recentPhotos.map(p => p.id === editingId ? { ...p, name, tags } : p);
      this.setData({ recentPhotos });
      this._recalcStats();
    }

    // 2. 同步到本地存储（历史记录）—— 只有已上传过的才同步
    if (!isDraftNew) {
      try {
        const stored = wx.getStorageSync(STORAGE_KEY) || [];
        const updated = stored.map(p => p.id === editingId ? { ...p, name, tags } : p);
        wx.setStorageSync(STORAGE_KEY, updated);
      } catch (_) {}

      // 3. 同步到「我的作品」（如果对应记录里有这张图）
      try {
        const works = wx.getStorageSync('myWorks') || [];
        const updated = works.map(w => {
          const matchById = w.id === editingId; // 早期作品 id 与 upload id 一致
          const matchByFile = w.fileID && this._photoFileIDById(editingId) === w.fileID;
          return (matchById || matchByFile) ? { ...w, title: name } : w;
        });
        wx.setStorageSync('myWorks', updated);
      } catch (_) {}
    }

    wx.showToast({ title: '已保存', icon: 'success', duration: 800 });
    this.closeEditPopup();
  },

  // 用户点击「开始上传」按钮后，才真正上传到云端
  startUpload() {
    const readyCount = this.data.photos.filter(p => !p.fileID && p.status === 'ready').length;
    const draftCount = this.data.photos.filter(p => !p.fileID && p.status === 'draft').length;

    if (readyCount === 0 && draftCount === 0) {
      wx.showToast({ title: '没有待上传的图片', icon: 'none' });
      return;
    }

    // 把未编辑的 draft 也一并设为 ready，然后开始上传
    if (draftCount > 0) {
      const photos = this.data.photos.map(p =>
        (!p.fileID && p.status === 'draft') ? { ...p, status: 'ready' } : p
      );
      this.setData({ photos });
    }

    this._uploadNext();
  },

  // 点击失败卡片重试上传
  retryUpload(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === undefined) return;
    const photos = [...this.data.photos];
    photos[idx] = { ...photos[idx], failed: false, status: 'ready' };
    this.setData({ photos });
    this._uploadNext();
  },

  // 通过 id 反查照片的 fileID（用于 myWorks 同步）
  _photoFileIDById(id) {
    const inCur = this.data.photos.find(p => p.id === id);
    if (inCur && inCur.fileID) return inCur.fileID;
    const inRecent = this.data.recentPhotos.find(p => p.id === id);
    if (inRecent && inRecent.fileID) return inRecent.fileID;
    try {
      const stored = wx.getStorageSync(STORAGE_KEY) || [];
      const m = stored.find(p => p.id === id);
      return (m && m.fileID) || '';
    } catch (_) { return ''; }
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },
});
