// pages/index/index.js - 自然文案·暖色调·真实感
const { callFunction, checkLogin } = require('../../utils/cloud');
const { computeNavBar } = require('../../utils/common');
const { preloadImages } = require('../../utils/imageLoader');
const {
  CATEGORIES,
  BANNERS,
  HOT_TEMPLATES,
  INSPIRE_IMAGES,
  COMMUNITY_IMAGES,
  CATEGORY_MAP,
} = require('../../config/data');

Page({
  data: {
    categories: CATEGORIES,
    banners: BANNERS,
    hotTemplates: HOT_TEMPLATES,
    inspireImages: INSPIRE_IMAGES,
    communityImages: COMMUNITY_IMAGES,
    skeletonVisible: true,
    navBarHeight: 44,
    statusBarHeight: 20,
    menuBtnHeight: 32,
    menuBtnTop: 80,
  },

  onLoad() {
    const navBar = computeNavBar();
    this.setData({
      navBarHeight: navBar.navBarHeight,
      statusBarHeight: navBar.statusBarHeight,
    });
    
    // 预加载首页图片
    this.preloadImages();
    
    setTimeout(() => this.setData({ skeletonVisible: false }), 600);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  // 预加载图片
  preloadImages() {
    const allImages = [
      ...HOT_TEMPLATES.map(t => t.cover),
      ...Object.values(INSPIRE_IMAGES),
      ...COMMUNITY_IMAGES,
    ].filter(url => url && !url.startsWith('/images'));
    
    if (allImages.length > 0) {
      preloadImages(allImages, 4);
    }
  },

  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.cat;
    wx.navigateTo({ url: '/pages/create/create?type=' + cat.id });
  },

  onTemplateTap(e) {
    const tpl = e.currentTarget.dataset.tpl;
    wx.navigateTo({
      url: '/pages/create/create?templateName=' + encodeURIComponent(tpl.name) + '&category=' + tpl.id,
    });
  },

  onInspireTap(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: '/pages/create/create?style=' + type });
  },

  onImageTap(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.navigateTo({
      url: `/pages/preview/preview?url=${encodeURIComponent(src)}&title=灵感作品`,
    });
  },

  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({
      current: src,
      urls: [src],
    });
  },

  onMakeSame(e) {
    const style = e.currentTarget.dataset.style;
    const cover = e.currentTarget.dataset.cover;
    wx.setStorageSync('makeSameParams', { style, cover });
    wx.switchTab({ url: '/pages/create/create' });
  },

  goDiscover() {
    wx.switchTab({ url: '/pages/discover/discover' });
  },

  onShareAppMessage() {
    return { title: '照片工坊 - 让照片更有温度', path: '/pages/index/index' };
  },
});