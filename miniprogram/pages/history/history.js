// pages/history/history.js - 我的作品页面
const { callFunction, checkLogin } = require('../../utils/cloud');
const { computeNavBar, formatTime, saveImageToAlbum } = require('../../utils/common');

Page({
  data: {
    navBarHeight: 44,
    statusBarHeight: 20,
    works: [],
    loading: false,
    refreshing: false,
    empty: false,
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    this.setData({ navBarHeight, statusBarHeight });
    this.loadWorks();
  },

  onShow() {
    this.loadWorks();
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ refreshing: true });
    this.loadWorks();
  },

  // 加载作品（本地 + 云端合并）
  async loadWorks() {
    this.setData({ loading: true });

    // 先加载本地数据
    let works = wx.getStorageSync('myWorks') || [];
    
    this.setData({ works, loading: false, refreshing: false });
    
    // 空状态
    this.setData({ empty: works.length === 0 });

    // 如果已登录，同步云端数据
    if (checkLogin()) {
      try {
        const cloudData = await callFunction('tools', { action: 'getWorks', limit: 100 }, { silent: true });
        if (cloudData && cloudData.length > 0) {
          const cloudWorks = cloudData.map(item => ({
            id: item.createTime,
            cloudId: item._id,
            fileID: item.fileID || item.url,
            url: item.url,
            title: item.title,
            prompt: item.prompt,
            style: item.style,
            time: formatTime(item.createTime),
            needResolve: !item.url || item.url.startsWith('cloud://'),
          }));

          // 合并并去重
          const merged = [...works];
          cloudWorks.forEach(cloudItem => {
            const key = cloudItem.cloudId || cloudItem.fileID || cloudItem.url;
            const matchedIndex = merged.findIndex(localItem => (localItem.cloudId || localItem.fileID || localItem.url) === key);
            if (matchedIndex === -1) {
              merged.push(cloudItem);
            } else {
              merged[matchedIndex] = { ...merged[matchedIndex], cloudId: cloudItem.cloudId };
            }
          });

          merged.sort((a, b) => b.id - a.id);
          this.setData({ works: merged, empty: merged.length === 0 });
          wx.setStorageSync('myWorks', merged);
          this.resolveCloudURLs(merged);
        }
      } catch (err) {
        console.log('云端作品同步失败:', err.message);
      }
    }
  },

  // 将 cloud:// fileID 转换为可展示的临时链接
  async resolveCloudURLs(works) {
    const needResolve = works.filter(w => w.needResolve && w.fileID);
    if (needResolve.length === 0) return;

    try {
      const fileIDs = needResolve.map(w => w.fileID);
      const res = await wx.cloud.getTempFileURL({ fileList: fileIDs });
      if (res.fileList) {
        const updated = this.data.works.map(w => {
          const match = res.fileList.find(f => f.fileID === w.fileID);
          if (match && match.tempFileURL) {
            return { ...w, url: match.tempFileURL, needResolve: false };
          }
          return w;
        });
        this.setData({ works: updated });
        wx.setStorageSync('myWorks', updated);
      }
    } catch (err) {
      console.log('云存储链接转换失败:', err.message);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  goCreate() {
    wx.switchTab({ url: '/pages/create/create' });
  },

  onPreview(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.works[index];
    if (!item?.url) {
      wx.showToast({ title: '图片加载中', icon: 'none' });
      return;
    }
    wx.previewImage({
      current: item.url,
      urls: this.data.works.filter(w => w.url).map(w => w.url),
    });
  },

  async onSave(e) {
    const item = e.currentTarget.dataset.item;
    if (!item?.url) {
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
        if (res.confirm) {
          const works = this.data.works.filter(w => w.id !== item.id);
          this.setData({ works, empty: works.length === 0 });
          wx.setStorageSync('myWorks', works);
          if (checkLogin() && item.cloudId) {
            callFunction('tools', { action: 'deleteWork', workId: item.cloudId }, { silent: true }).catch(err => {
              console.log('云端删除作品失败:', err.message);
            });
          }
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  onShare() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onShareAppMessage() {
    const works = this.data.works;
    if (works.length > 0) {
      return {
        title: '照片工坊 - 我的AI作品',
        path: '/pages/history/history',
        imageUrl: works[0].url,
      };
    }
    return {
      title: '照片工坊 - 我的AI作品',
      path: '/pages/history/history',
    };
  },
});