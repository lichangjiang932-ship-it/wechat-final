const { logger } = require('../../config/constants');
// pages/index/index.js - Editorial dark home
const { computeNavBar } = require('../../utils/common');
const { callFunction } = require('../../utils/cloud');
const i18n = require('../../utils/i18n');
const themeMod = require('../../utils/theme');
const {
  BANNERS,
  HOT_TEMPLATES,
  INSPIRE_IMAGES,
  COMMUNITY_IMAGES,
} = require('../../config/data');

const now = new Date();
const DATE_STR = `${now.getFullYear()} · ${String(now.getMonth() + 1).padStart(2, '0')}`;

const STUDIO_TOOLS = [
  { id: 'portrait', nameKey: 'tool.portrait', enKey: 'tool.portrait.en', icon: 'portrait', tone: 'ph-warm'  },
  { id: 'idphoto',  nameKey: 'tool.idphoto',  enKey: 'tool.idphoto.en',  icon: 'id',       tone: 'ph-fog'   },
  { id: 'style',    nameKey: 'tool.style',    enKey: 'tool.style.en',    icon: 'brush',    tone: 'ph-rose'  },
  { id: 'restore',  nameKey: 'tool.restore',  enKey: 'tool.restore.en',  icon: 'time',     tone: 'ph-sand'  },
  { id: 'generate', nameKey: 'tool.generate', enKey: 'tool.generate.en', icon: 'wand',     tone: 'ph-cyber' },
  { id: 'anime',    nameKey: 'tool.anime',    enKey: 'tool.anime.en',    icon: 'orbit',    tone: 'ph-jade'  },
];

const STORIES = [
  { n: 1, titleKey: 'story.1.title', metaKey: 'story.1.meta', tone: 'ph-ink'  },
  { n: 2, titleKey: 'story.2.title', metaKey: 'story.2.meta', tone: 'ph-warm' },
  { n: 3, titleKey: 'story.3.title', metaKey: 'story.3.meta', tone: 'ph-cyber'},
];

// Editorial bento layout — 4 columns × 3 rows (96rpx step)
// grid-area: row-start / col-start / row-end / col-end
const GALLERY_CELLS = [
  { key: 'warm',  nameKey: 'inspire.warm',  tag: 'WARM',  by: '@yue',  likes: '2.1k', tone: 'ph-warm',  area: '1 / 1 / 3 / 3' },
  { key: 'cream', nameKey: 'inspire.cream', tag: 'CREAM', by: '@milk', likes: '1.5k', tone: 'ph-cream', area: '1 / 3 / 2 / 5' },
  { key: 'sage',  nameKey: 'inspire.sage',  tag: 'SAGE',  by: '@lin',  likes: '892',  tone: 'ph-jade',  area: '2 / 3 / 3 / 4' },
  { key: 'rose',  nameKey: 'inspire.rose',  tag: 'ROSE',  by: '@hana', likes: '514',  tone: 'ph-rose',  area: '2 / 4 / 3 / 5' },
  { key: 'cyber', nameKey: 'inspire.cyber', tag: 'CYBER', by: '@gray', likes: '392',  tone: 'ph-cyber', area: '3 / 1 / 4 / 5' },
];

// Template metadata — localized at _applyLang time.
// `uses` is shown as "12.8 万" in zh and "128 k" in en to keep typography clean.
const TPL_META = {
  t1: { nameKey: 'tpl.idphoto.name',    tagKey: 'tpl.tag.hot', usesZh: '12.8 万', usesEn: '128 k' },
  t2: { nameKey: 'tpl.japanese.name',   tagKey: 'tpl.tag.new', usesZh: '8.6 万',  usesEn: '86 k'  },
  t3: { nameKey: 'tpl.chinese.name',    tagKey: '',            usesZh: '6.3 万',  usesEn: '63 k'  },
  t4: { nameKey: 'tpl.watercolor.name', tagKey: '',            usesZh: '5.1 万',  usesEn: '51 k'  },
  t5: { nameKey: 'tpl.cyber.name',      tagKey: '',            usesZh: '4.8 万',  usesEn: '48 k'  },
};

// Community bento — 4 cols × 3 rows
const COMMUNITY_AREAS = [
  '1 / 1 / 3 / 3',
  '1 / 3 / 2 / 5',
  '2 / 3 / 3 / 4',
  '2 / 4 / 3 / 5',
  '3 / 1 / 4 / 3',
  '3 / 3 / 4 / 5',
];
const COMMUNITY_CELLS = COMMUNITY_AREAS.map((area, i) => ({ i, by: ['@ember', '@mika', '@luo', '@ren', '@hana', '@soil'][i] || '@user', area }));

Page({
  data: {
    dateStr: DATE_STR,
    studioTools: STUDIO_TOOLS,
    stories: STORIES,
    galleryCells: GALLERY_CELLS,
    communityCells: COMMUNITY_CELLS,
    banners: [],
    hotTemplates: [],
    inspireImages: {},
    inspireKeys: Object.keys(INSPIRE_IMAGES),
    communityImages: [],
    communityWorks: [],
    imgReady: false,
    navBarHeight: 44,
    statusBarHeight: 20,
    lang: 'zh',
    theme: 'dark',
    themeClass: 'theme-dark',
    i18n: {},
    heroTitle: '',
    heroDesc: '',
  },

  _applyLang(lang) {
    const pack = i18n.pack(lang);
    // Hero always uses i18n — banner titles in config/data.js are hardcoded Chinese
    // and would break English mode, so we ignore them in favor of translated defaults.
    const enrichedTpl = (this.data.hotTemplates || []).map(t => {
      const meta = TPL_META[t.id] || {};
      return {
        ...t,
        name: pack[meta.nameKey] || t.name,
        tag:  meta.tagKey ? (pack[meta.tagKey] || t.tag) : '',
        uses: lang === 'en' ? (meta.usesEn || t.uses) : (meta.usesZh || t.uses),
      };
    });
    this.setData({
      lang,
      i18n: pack,
      heroTitle: pack['home.hero.titleDefault'],
      heroDesc:  pack['home.hero.descDefault'],
      hotTemplates: enrichedTpl,
    });
  },

  formatCommunityAuthor(work = {}) {
    const name = work.author || work.nickname || 'community';
    return name.startsWith('@') ? name : `@${name}`;
  },

  async resolveCloudCoverMap(works = []) {
    const fileList = works
      .map(w => w.cover)
      .filter(url => url && url.startsWith('cloud://'));
    if (fileList.length === 0) return {};
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [...new Set(fileList)], timeout: 6000 });
      const map = {};
      (res.fileList || []).forEach(item => {
        if (item.tempFileURL) map[item.fileID] = item.tempFileURL;
      });
      return map;
    } catch (e) {
      logger.warn('[index] 社区云链接转换失败:', e.message || e);
      return {};
    }
  },

  async loadCommunityWorks() {
    try {
      const res = await callFunction('tools', { action: 'getGalleryWorks', page: 1, pageSize: 6 }, { silent: true });
      const works = (res && Array.isArray(res.works)) ? res.works.slice(0, 6) : [];
      if (!works.length) return;
      const cloudMap = await this.resolveCloudCoverMap(works);
      const normalized = works.map((w, i) => ({
        ...w,
        cover: w.cover && w.cover.startsWith('cloud://') ? (cloudMap[w.cover] || '') : (w.cover || ''),
        by: this.formatCommunityAuthor(w),
        i,
      })).filter(w => w.cover);
      if (!normalized.length) return;
      this.setData({
        communityWorks: normalized,
        communityImages: normalized.map(w => w.cover),
        communityCells: normalized.map((w, idx) => ({ i: idx, by: w.by, area: COMMUNITY_AREAS[idx] })),
      });
    } catch (e) {
      logger.warn('[index] 社区作品加载失败:', e.message || e);
    }
  },

  onLoad() {
    const navBar = computeNavBar();
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight: navBar.navBarHeight,
      statusBarHeight: navBar.statusBarHeight,
      theme, themeClass: themeMod.themeClass(theme),
    });
    this._applyLang(lang);
    this.loadCloudImages();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    if (lang !== this.data.lang || theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
      this._applyLang(lang);
    }
  },

  // 批量获取云存储临时链接
  async loadCloudImages() {
    const allCloudUrls = [
      ...BANNERS.map(b => b.cover),
      ...HOT_TEMPLATES.map(t => t.cover),
      ...Object.values(INSPIRE_IMAGES),
      ...COMMUNITY_IMAGES,
    ].filter(url => url && url.startsWith('cloud://'));

    if (allCloudUrls.length === 0) {
      this.setData({
        banners: BANNERS,
        hotTemplates: HOT_TEMPLATES,
        inspireImages: INSPIRE_IMAGES,
        communityImages: COMMUNITY_IMAGES,
        imgReady: true,
      });
      this._applyLang(this.data.lang);
      this.loadCommunityWorks();
      return;
    }

    logger.debug('[loadCloudImages] 转换', allCloudUrls.length, '个云图片');

    // cloud:// 不能直接给 <image> 使用，必须先转换成 tempFileURL
    // 所以不能"先设本地再替换"，否则渲染层会尝试加载 cloud://... 报错
    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: [...new Set(allCloudUrls)],
        timeout: 6000,
      });

      const urlMap = {};
      (res.fileList || []).forEach(item => {
        if (item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL;
        } else {
          logger.warn('[index] 云文件不可访问:', item.fileID, 'errMsg=', item.errMsg, 'status=', item.status);
        }
      });

      const resolve = (url) => {
        if (!url) return url;
        if (url.startsWith('cloud://')) return urlMap[url] || '';
        return url;
      };

      this.setData({
        banners:       BANNERS.map(b => ({ ...b, cover: resolve(b.cover) })),
        hotTemplates:  HOT_TEMPLATES.map(t => ({ ...t, cover: resolve(t.cover) })),
        inspireImages: Object.fromEntries(Object.keys(INSPIRE_IMAGES).map(k => [k, resolve(INSPIRE_IMAGES[k])])),
        communityImages: COMMUNITY_IMAGES.map(resolve),
        imgReady: true,
      });
      this._applyLang(this.data.lang);
      this.loadCommunityWorks();
      logger.debug('[loadCloudImages] 完成，替换', Object.keys(urlMap).length, '/', allCloudUrls.length);
    } catch (e) {
      logger.warn('[loadCloudImages] 云图片转换失败:', e.message || e);
      // 失败：清空封面避免 <image> 尝试加载 cloud://，只保留文字
      const blank = (obj) => ({ ...obj, cover: '' });
      this.setData({
        banners:       BANNERS.map(blank),
        hotTemplates:  HOT_TEMPLATES.map(blank),
        inspireImages: {},
        communityImages: [],
        imgReady: true,
      });
      this._applyLang(this.data.lang);
      this.loadCommunityWorks();
    }
  },

  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.cat;
    wx.setStorageSync('createParams', { category: cat.id });
    wx.switchTab({ url: '/pages/create/create' });
  },

  onTemplateTap(e) {
    const tpl = e.currentTarget.dataset.tpl;
    wx.setStorageSync('createParams', { templateName: tpl.name, category: tpl.id });
    wx.switchTab({ url: '/pages/create/create' });
  },

  onStoryTap(e) {
    const story = e.currentTarget.dataset.story;
    wx.setStorageSync('createParams', { style: story.title });
    wx.switchTab({ url: '/pages/create/create' });
  },

  // ---- Banner ----
  // 图片 → 详情页
  onHeroTap() {
    const b = this.data.banners[0] || {};
    if (!b.cover) return;
    const title = b.title || this.data.i18n['home.hero.live'] || 'Today';
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(b.cover)}&title=${encodeURIComponent(title)}`,
    });
  },

  // ---- 热门模板 ----
  onTplTap(e) {
    const tpl = e.currentTarget.dataset.tpl;
    if (!tpl) return;
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(tpl.cover)}&title=${encodeURIComponent(tpl.name)}`,
    });
  },
  onTplImgTap(e) {
    // 图片本身 → 详情页
    this.onTplTap(e);
  },
  onTplMakeSame(e) {
    const tpl = e.currentTarget.dataset.tpl;
    if (!tpl) return;
    wx.setStorageSync('makeSameParams', { style: tpl.name });
    wx.switchTab({ url: '/pages/create/create' });
  },

  // ---- 灵感画廊 ----
  onInspireImgTap(e) {
    const key = e.currentTarget.dataset.key;
    const src = (this.data.inspireImages || {})[key];
    if (!src) return;
    const label = this.data.i18n['inspire.' + key] || key;
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(src)}&title=${encodeURIComponent(label)}`,
    });
  },
  onInspireMakeSame(e) {
    const key = e.currentTarget.dataset.key;
    const style = this.data.i18n['inspire.' + key] || key;
    wx.setStorageSync('makeSameParams', { style });
    wx.switchTab({ url: '/pages/create/create' });
  },

  // ---- 社区马赛克 ----
  onCommTap(e) {
    const i = e.currentTarget.dataset.i;
    const work = (this.data.communityWorks || [])[i] || {};
    const src = work.cover || (this.data.communityImages || [])[i];
    if (!src) return;
    const title = work.title || this.data.i18n['home.community'] || 'Community';
    wx.navigateTo({ url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(src)}&title=${encodeURIComponent(title)}` });
  },
  onCommMakeSame(e) {
    const i = e.currentTarget.dataset.i;
    const work = (this.data.communityWorks || [])[i] || {};
    const src = work.cover || (this.data.communityImages || [])[i];
    if (!src) return;
    const title = work.title || this.data.i18n['home.community'] || 'Community';
    wx.setStorageSync('makeSameParams', { cover: src, title });
    wx.switchTab({ url: '/pages/create/create' });
  },

  onStudioTap(e) {
    const tool = e.currentTarget.dataset.tool;
    const style = this.data.i18n[tool.nameKey] || tool.id;
    wx.setStorageSync('createParams', { category: tool.id, style });
    wx.switchTab({ url: '/pages/create/create' });
  },

  onInspireTap(e) {
    const type = e.currentTarget.dataset.type;
    wx.setStorageSync('createParams', { style: type });
    wx.switchTab({ url: '/pages/create/create' });
  },

  onImageTap(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    const title = this.data.i18n['home.inspiration'] || 'Inspire';
    wx.navigateTo({
      url: `/subpackages/preview/pages/preview/preview?url=${encodeURIComponent(src)}&title=${encodeURIComponent(title)}`,
    });
  },

  onMakeSame(e) {
    const style = e.currentTarget.dataset.style;
    wx.setStorageSync('makeSameParams', { style });
    wx.switchTab({ url: '/pages/create/create' });
  },

  goDiscover() {
    wx.switchTab({ url: '/pages/discover/discover' });
  },

  onShareAppMessage() {
    const title = this.data.lang === 'en'
      ? 'Miaosec Camera — photos with warmth'
      : '微秒相机 - 让照片更有温度';
    return { title, path: '/pages/index/index' };
  },
});
