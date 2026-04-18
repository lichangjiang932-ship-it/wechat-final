// pages/create/create.js - 创作页
const { callFunction, uploadFile, checkLogin } = require('../../utils/cloud');
const { computeNavBar, formatTime } = require('../../utils/common');
const { STYLES, RATIOS, QUICK_PROMPTS, VIP_PRICES, CATEGORY_MAP } = require('../../config/data');
const { showError, withRetry, checkNetwork } = require('../../utils/errorHandler');
const { generateSharePoster, savePosterToAlbum } = require('../../utils/sharePoster');

const MODES = [
  { id: 'text2img', name: 'AI绘画', icon: '🎨', desc: '文字生成图片' },
  { id: 'img2img', name: '图生图', icon: '🖼️', desc: '照片变风格' },
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
  },

  onLoad(options) {
    const navBar = computeNavBar();
    this.setData({ navBarHeight: navBar.navBarHeight, statusBarHeight: navBar.statusBarHeight });
    
    if (options.templateName) this.setData({ templateName: decodeURIComponent(options.templateName) });
    if (options.category && CATEGORY_MAP[options.category]) {
      this.setData({ selectedStyleId: CATEGORY_MAP[options.category] });
    }
    if (options.cover) this.setData({ sourceImage: decodeURIComponent(options.cover), activeMode: 'img2img' });
    if (options.title) this.setData({ templateName: decodeURIComponent(options.title) });
    
    this.checkMakeSameParams();
  },

  onShow() {
    this.checkMakeSameParams();
    if (checkLogin()) this.loadUsage();
  },

  checkMakeSameParams() {
    const params = wx.getStorageSync('makeSameParams');
    if (params) {
      const updates = { resultImage: null };
      if (params.cover) { updates.sourceImage = params.cover; updates.activeMode = 'img2img'; }
      if (params.style) updates.selectedStyleId = params.style;
      if (params.title) updates.templateName = params.title;
      this.setData(updates);
      wx.removeStorageSync('makeSameParams');
    }
  },

  async loadUsage() {
    try {
      const res = await callFunction('ai', { action: 'usage' });
      if (res) this.setData({ usageInfo: res });
    } catch (e) {}
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

  clearReference() { this.setData({ sourceImage: null, sourceFileID: null }); },

  // ========== 核心生成流程（带错误处理） ==========
  async generate() {
    // 检查网络
    const hasNetwork = await checkNetwork();
    if (!hasNetwork) return;

    if (!checkLogin()) return wx.showModal({ title: '提示', content: '请先登录', showCancel: false });
    if (this.data.phase !== 'idle') return;
    if (!this.data.prompt.trim()) return wx.showToast({ title: '请输入描述', icon: 'none' });
    if (this.data.activeMode === 'img2img' && !this.data.sourceImage) {
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
        const fileID = await withRetry(() => uploadFile(this.data.sourceImage));
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
      console.error(e);
      this.setData({ phase: 'idle' });
      showError(e, {
        showRetry: true,
        onRetry: () => this.generate(),
      });
    }
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

  saveImage() {
    if (!this.data.resultImage) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => wx.showToast({ title: '已保存', icon: 'success' }),
      fail: (e) => {
        if (e.errMsg.includes('auth deny')) {
          wx.showModal({ title: '需要相册权限', content: '请在设置中开启', confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); } });
        }
      },
    });
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
    } catch (e) { console.error('本地保存作品失败:', e); }

    if (checkLogin()) {
      try {
        const saved = await callFunction('tools', { action: 'saveWork', work }, { silent: true });
        if (saved?.id) {
          const works = (wx.getStorageSync('myWorks') || []).map(item =>
            item.id === work.id ? { ...item, cloudId: saved.id } : item
          );
          wx.setStorageSync('myWorks', works);
        }
      } catch (e) { console.log('作品云端同步失败:', e.message); }
    }
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
  retryGenerate() { this.setData({ phase: 'idle', resultImage: null, resultFileID: null }); },

  onHide() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  onUnload() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
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