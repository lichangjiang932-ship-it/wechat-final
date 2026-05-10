const { logger } = require('../../config/constants');
// pages/create/create.js - 创作页
const { callFunction, uploadFile, checkLogin } = require('../../utils/cloud');
const { computeNavBar, formatTime, isIOSPlatform } = require('../../utils/common');
const { STYLES, RATIOS, QUICK_PROMPTS, VIP_PRICES, CATEGORY_MAP } = require('../../config/data');
const { showError, withRetry, checkNetwork } = require('../../utils/errorHandler');
const { generateSharePoster, savePosterToAlbum } = require('../../utils/sharePoster');
const { addAIWatermark } = require('../../utils/watermark');
const i18n = require('../../utils/i18n');
const themeMod = require('../../utils/theme');

// 注：wxml 通过 i18n key 渲染 mode 文案，icon 字段保留为 SVG class 名（如未来 wxml 引用 {{mode.icon}} 可直接挂 ic-* class）
const MODES = [
  { id: 'text2img', name: 'AI绘画', icon: 'ic-spark',  desc: '文字生成图片' },
  { id: 'img2img',  name: '图生图', icon: 'ic-camera', desc: '照片变风格'   },
];

Page({
  data: {
    modes: MODES,
    activeMode: 'text2img',
    ratios: RATIOS,
    selectedRatio: '1:1',
    styles: STYLES,
    selectedStyleId: '',
    quickPrompts: QUICK_PROMPTS,
    vipPrices: VIP_PRICES,
    prompt: '',
    sourceImage: null,
    sourceFileID: null,
    // 做同款参考（不占用上传槽，仅作为风格上下文显示）
    templateRef: '',
    templateRefTitle: '',
    phase: 'idle',
    progress: 0,
    progressText: '',
    resultImage: null,
    resultFileID: null,
    results: [],
    usageInfo: null,
    showPayPopup: false,
    selectedVipPlan: 'month',
    templateName: '',
    navBarHeight: 44,
    statusBarHeight: 20,
    // 分享海报
    showShareMenu: false,
    // 错误状态
    lastError: null,
    canRetry: false,
    // Skill Enhancer: 提示词展示
    enhancedPrompt: '',
    skillName: '',
    showEnhancedPrompt: false,
    // 参考图来源标签（来自「我的上传」时显示）
    refSource: '',
    refMeta: null,
    // i18n / theme
    lang: 'zh',
    theme: 'dark',
    themeClass: 'theme-dark',
    i18n: {},
    isIOS: false,
  },

  onLoad(options) {
    const navBar = computeNavBar();
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight: navBar.navBarHeight,
      statusBarHeight: navBar.statusBarHeight,
      lang, theme, themeClass: themeMod.themeClass(theme), i18n: i18n.pack(lang),
      isIOS: isIOSPlatform(),
    });
    
    if (options.templateName) this.setData({ templateName: decodeURIComponent(options.templateName) });
    if (options.category && CATEGORY_MAP[options.category]) {
      this.setData({ selectedStyleId: CATEGORY_MAP[options.category] });
    }
    // 做同款：封面作为风格参考，保持上传槽空着让用户上传自己的照片
    if (options.cover) {
      this.setData({
        templateRef: decodeURIComponent(options.cover),
        templateRefTitle: options.title ? decodeURIComponent(options.title) : (options.templateName ? decodeURIComponent(options.templateName) : ''),
        activeMode: 'img2img',
      });
    }
    if (options.title) this.setData({ templateName: decodeURIComponent(options.title) });
    
    // 读取「我的上传」传入的参考图
    this.loadRefImage();

    this.checkMakeSameParams();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // sync lang/theme in case user changed from my page
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    if (lang !== this.data.lang || theme !== this.data.theme) {
      this.setData({ lang, theme, themeClass: themeMod.themeClass(theme), i18n: i18n.pack(lang) });
    }
    this.checkCreateParams();
    this.checkMakeSameParams();
    if (checkLogin()) this.loadUsage();
  },

  checkCreateParams() {
    const params = wx.getStorageSync('createParams');
    if (!params) return;
    const updates = { resultImage: null };
    if (params.category && CATEGORY_MAP[params.category]) {
      updates.selectedStyleId = CATEGORY_MAP[params.category];
    }
    if (params.style) updates.selectedStyleId = params.style;
    if (params.templateName) updates.templateName = decodeURIComponent(params.templateName);
    if (params.title) updates.templateName = decodeURIComponent(params.title);
    if (params.prompt) updates.prompt = params.prompt;
    if (params.cover) {
      updates.templateRef = decodeURIComponent(params.cover);
      updates.templateRefTitle = params.title ? decodeURIComponent(params.title) : '';
      updates.activeMode = 'img2img';
    }
    this.setData(updates);
    wx.removeStorageSync('createParams');
  },

  checkMakeSameParams() {
    const params = wx.getStorageSync('makeSameParams');
    if (params) {
      const updates = { resultImage: null };
      // 做同款：把封面当作「风格参考」而不是用户上传，避免占用上传槽
      if (params.cover) {
        updates.templateRef = params.cover;
        updates.templateRefTitle = params.title || '';
        updates.activeMode = 'img2img';
      }
      if (params.style) updates.selectedStyleId = params.style;
      if (params.title) updates.templateName = params.title;
      if (params.prompt) updates.prompt = params.prompt;
      this.setData(updates);
      wx.removeStorageSync('makeSameParams');
      wx.showToast({
        title: this.data.lang === 'en' ? 'Upload your photo to apply this style' : '上传你的照片以套用此风格',
        icon: 'none',
        duration: 2000,
      });
    }
  },

  // 清除做同款的参考图
  clearTemplateRef() {
    this.setData({ templateRef: '', templateRefTitle: '' });
  },

  // 直接把做同款封面作为输入图（用户主动选择）
  useTemplateAsSource() {
    if (!this.data.templateRef) return;
    this.setData({
      sourceImage: this.data.templateRef,
      templateRef: '',
      templateRefTitle: '',
      activeMode: 'img2img',
      resultImage: null,
    });
  },

  async loadUsage() {
    try {
      const res = await callFunction('ai', { action: 'usage' });
      if (res) this.setData({ usageInfo: res });
    } catch (e) {}
  },

  // 读取「我的上传」传入的参考图
  loadRefImage() {
    try {
      const ref = wx.getStorageSync('refImage');
      if (!ref || !ref.url) return;

      // 自动切换图生图模式
      this.setData({
        sourceImage: ref.url,
        sourceFileID: ref.fileID || '',
        activeMode: 'img2img',
        resultImage: null,
        // 来源标签
        refSource: ref.name || '我的上传',
        refMeta: ref.meta || null,
      });

      // 读取后清除（防止刷新页面重复带入）
      wx.removeStorageSync('refImage');

      wx.showToast({ title: '参考图已加载', icon: 'none', duration: 1500 });
    } catch (_) {}
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },
  switchMode(e) { this.setData({ activeMode: e.currentTarget.dataset.mode, resultImage: null }); },
  selectStyle(e) {
    wx.vibrateShort({ type: 'light' });
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedStyleId: this.data.selectedStyleId === id ? '' : id });
  },
  selectRatio(e) { this.setData({ selectedRatio: e.currentTarget.dataset.value }); },
  onPromptInput(e) { this.setData({ prompt: e.detail.value }); },
  onQuickPrompt(e) { this.setData({ prompt: e.currentTarget.dataset.p }); },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'],
      success: (res) => {
        if (res.tempFiles[0].size > 10 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
          return;
        }
        this.setData({ sourceImage: res.tempFiles[0].tempFilePath, resultImage: null });
      },
    });
  },

  clearReference() { this.setData({ sourceImage: null, sourceFileID: null, refSource: '', refMeta: null }); },

  // ========== 核心生成流程（带错误处理） ==========
  async ensureLocalSourceImage() {
    const src = this.data.sourceImage;
    if (!src || /^wxfile:|^file:|^\//.test(src)) return src;

    try {
      let remote = src;
      if (remote.startsWith('cloud://')) {
        const temp = await wx.cloud.getTempFileURL({ fileList: [remote] });
        remote = temp.fileList?.[0]?.tempFileURL || '';
      }
      if (!/^https?:\/\//.test(remote)) return src;

      const dl = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: remote,
          success: resolve,
          fail: reject,
        });
      });
      if (dl.statusCode >= 200 && dl.statusCode < 300 && dl.tempFilePath) {
        this.setData({ sourceImage: dl.tempFilePath });
        return dl.tempFilePath;
      }
      throw new Error('下载参考图失败');
    } catch (e) {
      logger.warn('[create] 参考图本地化失败:', e.message);
      throw new Error('参考图不可用，请重新上传');
    }
  },

  async generate() {
    // 检查网络
    const hasNetwork = await checkNetwork();
    if (!hasNetwork) return;

    if (!checkLogin()) return wx.showModal({ title: '提示', content: '请先登录', showCancel: false });
    if (this.data.phase !== 'idle') return;
    // 做同款时若用户没写描述，自动用模板标题作为上下文
    if (!this.data.prompt.trim() && this.data.templateRefTitle) {
      this.setData({ prompt: this.data.templateRefTitle });
    }
    if (!this.data.prompt.trim()) return wx.showToast({ title: '请输入描述', icon: 'none' });
    if (this.data.activeMode === 'img2img' && !this.data.sourceImage) {
      // 若仅有做同款的参考图但用户没上传照片，提示用户上传
      if (this.data.templateRef) {
        return wx.showToast({ title: '请上传你的照片套用此风格', icon: 'none' });
      }
      return wx.showToast({ title: '请上传参考图', icon: 'none' });
    }

    if (this.data.usageInfo && !this.data.usageInfo.isVip) {
      if (this.data.usageInfo.limit - this.data.usageInfo.used <= 0) {
        this.setData({ showPayPopup: true });
        return;
      }
    }

    // 用户原始描述（不再手动拼接风格suffix，交给云端 DeepSeek 增强）
    const rawPrompt = this.data.prompt.trim();
    const selStyle = STYLES.find(s => s.id === this.data.selectedStyleId);

    const ratioMap = { '1:1': 1, '3:4': 2, '4:3': 3, '9:16': 5, '16:9': 4 };

    // 清除状态
    this.setData({ lastError: null, canRetry: false, enhancedPrompt: '', skillName: '', showEnhancedPrompt: false });

    try {
      if (this.data.activeMode === 'img2img') {
        this.setData({ phase: 'uploading', progress: 10, progressText: '上传图片中...' });
        const localSource = await this.ensureLocalSourceImage();
        const fileID = await withRetry(() => uploadFile(localSource));
        this.setData({ sourceFileID: fileID });
      }

      this.setData({ phase: 'generating', progress: 25, progressText: 'AI优化描述中...', resultImage: null });
      this.startProgressAnimation();

      const action = this.data.activeMode === 'text2img' ? 'generate' : 'img2img';
      const params = {
        action,
        prompt: rawPrompt,
        styleId: this.data.selectedStyleId,     // 传给云端做风格增强
        imageRatio: ratioMap[this.data.selectedRatio] || 1,
      };
      if (this.data.activeMode === 'img2img') params.imageFileID = this.data.sourceFileID;

      const result = await withRetry(() => callFunction('ai', params));

      if (result?.fileID) {
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [result.fileID] });
        const url = tempRes.fileList[0].tempFileURL;
        this.saveToMyWorks(result.fileID, url, result);
        this.setData({
          phase: 'done', progress: 100,
          resultImage: url, resultFileID: result.fileID,
          enhancedPrompt: result.enhancedPrompt || '',
          skillName: result.skillName || '',
          results: [{ url, prompt: rawPrompt, style: selStyle?.name || '无', time: Date.now() }, ...this.data.results],
        });
        wx.showToast({ title: '创作完成', icon: 'success' });
      } else {
        throw new Error(result?.msg || '生成失败');
      }
    } catch (e) {
      logger.error(e);
      const msg = (e && e.message) || '';
      // 并发限制错误：自动延迟重试（避免用户手动点）
      if (/繁忙|30 秒|并发|rate limit|50430|请稍后重试/i.test(msg)) {
        this.autoRetryWithCountdown(30);
        return;
      }
      this.setData({ phase: 'idle' });
      showError(e, {
        showRetry: true,
        onRetry: () => this.generate(),
      });
    }
  },

  // 并发限制自动倒计时重试
  autoRetryWithCountdown(seconds) {
    this.setData({
      phase: 'idle',
      progress: 0,
      progressText: `排队中，${seconds}秒后自动重试...`,
      lastError: { type: 'LIMIT', message: '当前生成人数较多' },
      canRetry: true,
    });
    let remain = seconds;
    if (this._retryTimer) clearInterval(this._retryTimer);
    this._retryTimer = setInterval(() => {
      remain--;
      if (remain <= 0) {
        clearInterval(this._retryTimer);
        this._retryTimer = null;
        this.setData({ progressText: '', lastError: null });
        this.generate();
        return;
      }
      this.setData({ progressText: `排队中，${remain}秒后自动重试...` });
    }, 1000);
  },

  // 切换显示增强后的提示词
  toggleEnhancedPrompt() {
    this.setData({ showEnhancedPrompt: !this.data.showEnhancedPrompt });
  },

  startProgressAnimation() {
    const steps = [
      { p: 40, t: '智能扩写提示词...' },
      { p: 55, t: '构思画面构图...' },
      { p: 68, t: '渲染细节中...' },
      { p: 80, t: '色彩调和中...' },
      { p: 90, t: '即将完成...' },
    ];
    let i = 0;
    this._timer = setInterval(() => {
      if (i >= steps.length || this.data.phase === 'done' || this.data.phase === 'idle') {
        clearInterval(this._timer);
        return;
      }
      this.setData({ progress: steps[i].p, progressText: steps[i].t });
      i++;
    }, 2000);
  },

  // 保存到相册：远程URL/cloud://都先下载为本地临时文件，再保存；保存成功后重置到 idle，方便继续生图
  resetToIdle() {
    this.setData({
      phase: 'idle',
      progress: 0,
      progressText: '',
      resultImage: null,
      resultFileID: null,
      enhancedPrompt: '',
      skillName: '',
      showEnhancedPrompt: false,
    });
  },

  async saveImage() {
    if (!this.data.resultImage) return;
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      let filePath = this.data.resultImage;

      // 1. 远程链接 → 本地临时文件
      if (/^cloud:\/\//.test(filePath)) {
        const t = await wx.cloud.getTempFileURL({ fileList: [filePath] });
        filePath = t.fileList?.[0]?.tempFileURL || filePath;
      }
      if (/^https?:\/\//.test(filePath)) {
        const dl = await new Promise((resolve, reject) => {
          wx.downloadFile({ url: filePath, success: resolve, fail: reject });
        });
        if (dl.statusCode < 200 || dl.statusCode >= 300 || !dl.tempFilePath) {
          throw new Error('下载失败');
        }
        filePath = dl.tempFilePath;
      }

      // 2. 合成「AI生成」水印（合成失败则降级使用原图，不阻塞保存）
      try {
        const watermarked = await addAIWatermark(filePath, 'watermarkCanvas', this);
        if (watermarked) filePath = watermarked;
      } catch (we) {
        logger.warn('[create] 水印合成失败，使用原图保存:', we && we.message);
      }

      // 3. 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject });
      });

      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.resetToIdle();
    } catch (e) {
      wx.hideLoading();
      const msg = (e && e.errMsg) || (e && e.message) || '';
      if (msg.includes('auth deny') || msg.includes('authorize')) {
        wx.showModal({
          title: '需要相册权限', content: '请在设置中开启', confirmText: '去设置',
          success: (r) => { if (r.confirm) wx.openSetting(); },
        });
      } else if (msg.includes('cancel')) {
        // 用户取消，不打扰
      } else {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    }
  },

  async saveToMyWorks(fileID, displayUrl, remoteResult = null) {
    const work = {
      id: Date.now(),
      fileID, url: displayUrl,
      title: this.data.prompt.slice(0, 30) || 'AI作品',
      prompt: this.data.prompt,
      style: this.data.selectedStyleId,
      time: formatTime(Date.now()),
      cloudId: remoteResult?.id || '',
    };
    try {
      let works = wx.getStorageSync('myWorks') || [];
      works.unshift(work);
      if (works.length > 100) works = works.slice(0, 100);
      wx.setStorageSync('myWorks', works);
    } catch (e) { logger.error('本地保存作品失败:', e); }

    if (checkLogin()) {
      try {
        const saved = await callFunction('tools', { action: 'saveWork', work }, { silent: true });
        if (saved?.id) {
          const works = (wx.getStorageSync('myWorks') || []).map(item =>
            item.id === work.id ? { ...item, cloudId: saved.id } : item
          );
          wx.setStorageSync('myWorks', works);
        }
      } catch (e) { logger.debug('作品云端同步失败:', e.message); }
    }
  },

  onImageError() {
    wx.showToast({ title: '图片加载失败，请重试', icon: 'none' });
  },

  previewResult() {
    if (this.data.resultImage) wx.previewImage({ urls: [this.data.resultImage], current: this.data.resultImage });
  },

  previewHistory(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ urls: this.data.results.map(r => r.url), current: url });
  },

  // ========== 新增：分享海报 ==========
  onShareTap() {
    this.setData({ showShareMenu: true });
  },

  closeShareMenu() {
    this.setData({ showShareMenu: false });
  },

  // 分享给好友
  onShareToFriend() {
    this.setData({ showShareMenu: false });
    // 触发系统分享
  },

  // 生成海报保存到相册（带小程序码）
  async onSavePoster() {
    if (!this.data.resultImage) return;

    wx.showLoading({ title: '生成海报...', mask: true });

    try {
      const tempPath = await generateSharePoster({
        imageUrl: this.data.resultImage,
        title: this.data.prompt.slice(0, 30) || 'AI创作',
        prompt: this.data.prompt,
      });

      await savePosterToAlbum(tempPath);
      this.setData({ showShareMenu: false });
    } catch (e) {
      showError(e);
    } finally {
      wx.hideLoading();
    }
  },

  // ========== 支付弹窗 ==========
  openPayPopup() { this.setData({ showPayPopup: true, selectedVipPlan: 'month' }); },
  closePayPopup() { this.setData({ showPayPopup: false }); },
  selectVipPlan(e) { wx.vibrateShort({ type: 'light' }); this.setData({ selectedVipPlan: e.currentTarget.dataset.plan }); },

  async subscribe() {
    const { selectedVipPlan } = this.data;
    if (!checkLogin()) {
      wx.showToast({ title: 'Please sign in', icon: 'none' });
      return;
    }
    await this.subscribeVirtual(selectedVipPlan);
  },

  // Unified virtual payment for all platforms
  // iOS：小程序虚拟支付
  async subscribeVirtual(plan) {
    wx.showLoading({ title: '创建订单…', mask: true });
    try {
      const loginCode = await new Promise((resolve) => {
        wx.login({ success: r => resolve(r.code || ''), fail: () => resolve('') });
      });
      const res = await callFunction('ai', {
        action: 'createVirtualOrder',
        plan,
        platform: this.data.isIOS ? 'ios' : 'android',
        code: loginCode,
      });
      wx.hideLoading();
      if (!res || !res.signData || !res.paySig) {
        wx.showToast({ title: '支付配置异常', icon: 'none' });
        return;
      }
      if (typeof wx.requestVirtualPayment !== 'function') {
        wx.showModal({ title: '请升级微信', content: '当前微信版本不支持虚拟支付，请升级后再试。', showCancel: false });
        return;
      }
      wx.requestVirtualPayment({
        signData: res.signData,
        paySig: res.paySig,
        signature: res.signature || '',
        mode: res.mode || 'short_series_goods',
        success: async () => {
          wx.showToast({ title: '支付成功', icon: 'success' });
          this.setData({ showPayPopup: false });
          await this.refreshVipStateAfterPayment(plan);
        },
        fail: (err) => {
          const msg = (err && err.errMsg) || '';
          const cancelled = /cancel/i.test(msg);
          wx.showToast({ title: cancelled ? '支付取消' : '支付失败', icon: 'none' });
        },
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '支付暂不可用', icon: 'none' });
    }
  },

  async refreshVipStateAfterPayment(plan) {
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const user = await callFunction('user', { action: 'getInfo' }, { silent: true });
        if (user) {
          // 合并云端字段和本地头像昵称，避免空 nickName/avatarUrl 把登录态覆盖成游客
          const localUser = wx.getStorageSync('userInfo') || {};
          const merged = {
            ...localUser,
            ...user,
            nickName: user.nickName || localUser.nickName || '',
            avatarUrl: user.avatarUrl || localUser.avatarUrl || '',
          };
          wx.setStorageSync('userInfo', merged);
          const app = getApp();
          if (app && app.globalData) {
            app.globalData.userInfo = merged;
            app.globalData.isVip = !!(merged.vipLevel && merged.vipExpireTime > Date.now());
          }
          await this.loadUsage();
          if (merged.vipLevel === plan && Number(merged.vipExpireTime || 0) > Date.now()) return;
        }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    wx.showToast({ title: '支付已完成，会员状态稍后自动同步', icon: 'none', duration: 2000 });
  },

  retryGenerate() { this.setData({ phase: 'idle', resultImage: null, resultFileID: null }); },

  onHide() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._retryTimer) {
      clearInterval(this._retryTimer);
      this._retryTimer = null;
    }
  },

  onUnload() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._retryTimer) {
      clearInterval(this._retryTimer);
      this._retryTimer = null;
    }
  },

  onShareAppMessage() {
    const styleName = this.data.selectedStyleId ? STYLES.find(s => s.id === this.data.selectedStyleId)?.name : '';
    return {
      title: `我用AI画了一幅${styleName ? styleName + '风格' : ''}画作`,
      imageUrl: this.data.resultImage || '',
      path: '/pages/index/index',
    };
  },
});
