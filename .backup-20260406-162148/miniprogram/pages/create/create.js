// pages/create/create.js - 创作页（完整妙鸭交互）
const { callFunction, uploadFile, checkLogin, wxLogin } = require('../../utils/cloud');

// 创作模式
const MODES = [
  { id: 'text2img', name: 'AI绘画', icon: '🎨', desc: '文字生成图片' },
  { id: 'img2img', name: '图生图', icon: '🖼️', desc: '照片变风格' },
];

// 画幅比例
const RATIOS = [
  { value: '1:1', label: '1:1', w: 1, h: 1 },
  { value: '3:4', label: '3:4', w: 3, h: 4 },
  { value: '4:3', label: '4:3', w: 4, h: 3 },
  { value: '9:16', label: '9:16', w: 9, h: 16 },
  { value: '16:9', label: '16:9', w: 16, h: 9 },
];

// 风格模板 - 真实色系，克制
const STYLES = [
  { id: 'real', name: '写实', emoji: '📷', prompt: ', photorealistic, ultra detailed, 8k, DSLR', color: '#C8B8A8' },
  { id: 'anime', name: '动漫', emoji: '🌸', prompt: ', anime style, vibrant, cel shading', color: '#E8A8B8' },
  { id: 'oil', name: '油画', emoji: '🎨', prompt: ', oil painting, rich textures, brushstrokes', color: '#D4A878' },
  { id: 'watercolor', name: '水彩', emoji: '💧', prompt: ', watercolor, soft flowing, delicate', color: '#88B8C8' },
  { id: 'sketch', name: '素描', emoji: '✏️', prompt: ', pencil sketch, detailed linework', color: '#A8A8A8' },
  { id: 'chinese', name: '国风', emoji: '🎋', prompt: ', Chinese ink painting, traditional', color: '#8EAD7A' },
  { id: 'cyber', name: '赛博', emoji: '🌃', prompt: ', cyberpunk, neon, futuristic', color: '#6878C8' },
  { id: '3d', name: '3D', emoji: '🔮', prompt: ', 3D render, octane, cinematic lighting', color: '#A88BC8' },
  { id: 'clay', name: '黏土', emoji: '🧸', prompt: ', clay render, cute, soft', color: '#C8A898' },
  { id: 'pixel', name: '像素', emoji: '👾', prompt: ', pixel art, 16-bit, retro', color: '#78C8A8' },
  { id: 'comic', name: '漫画', emoji: '💥', prompt: ', comic book, bold lines, pop art', color: '#C8888C' },
  { id: 'fantasy', name: '梦幻', emoji: '✨', prompt: ', dreamy, ethereal, pastel', color: '#C8A8D4' },
];

// 快捷提示词 - 真实场景，不像广告
const QUICK_PROMPTS = [
  '橘猫趴在窗台晒太阳',
  '赛博朋克城市，霓虹灯',
  '水墨山水',
  '穿jk的少女，樱花树下',
  '宇航员，月球',
  '一杯咖啡，静物',
];

// 会员价格
const VIP_PRICES = { month: { label: '月度会员', price: '¥19.9', original: '¥39.9', unit: '/月' }, year: { label: '年度会员', price: '¥199', original: '¥399', unit: '/年' } };

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

    // 输入
    prompt: '',
    sourceImage: null,
    sourceFileID: null,

    // 状态机：idle / uploading / generating / waiting / done
    phase: 'idle',
    progress: 0,
    progressText: '',
    queueAhead: 0,

    // 结果
    resultImage: null,
    results: [],

    // 用量
    usageInfo: null,

    // 弹窗
    showPayPopup: false,
    selectedVipPlan: 'month',

    // 模板参数
    templateName: '',

    // 导航
    navBarHeight: 44,
    statusBarHeight: 20,
  },

  onLoad(options) {
    this.computeNavBar();
    
    // 处理模板名称
    if (options.templateName) this.setData({ templateName: decodeURIComponent(options.templateName) });
    
    // 处理分类入口
    if (options.category) {
      const map = { id_photo: 'real', portrait: 'real', anime: 'anime', art: 'chinese', style: 'cyber', restore: 'real' };
      if (map[options.category]) this.setData({ selectedStyleId: map[options.category] });
    }
    
    // 处理"做同款"参数
    if (options.cover) {
      const coverUrl = decodeURIComponent(options.cover);
      this.setData({
        sourceImage: coverUrl,
        activeMode: 'img2img',
      });
    }
    if (options.title) {
      this.setData({ templateName: decodeURIComponent(options.title) });
    }
    
    // 检查本地存储的做同款参数（从发现页/详情页跳转）
    const makeSameParams = wx.getStorageSync('makeSameParams');
    if (makeSameParams) {
      if (makeSameParams.cover) {
        this.setData({
          sourceImage: makeSameParams.cover,
          activeMode: 'img2img',
        });
      }
      if (makeSameParams.style) {
        this.setData({ selectedStyleId: makeSameParams.style });
      }
      wx.removeStorageSync('makeSameParams');
    }
  },

  onShow() { if (checkLogin()) this.loadUsage(); },

  computeNavBar() {
    const sysInfo = wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    this.setData({
      navBarHeight: (menuBtn.top - sysInfo.statusBarHeight) * 2 + menuBtn.height + sysInfo.statusBarHeight,
      statusBarHeight: sysInfo.statusBarHeight,
    });
  },

  // ========== 用量 ==========
  async loadUsage() {
    try {
      const res = await callFunction('ai', { action: 'usage' });
      if (res) this.setData({ usageInfo: res });
    } catch (e) {}
  },

  // ========== 模式/风格/比例切换 ==========
  switchMode(e) { this.setData({ activeMode: e.currentTarget.dataset.mode, resultImage: null }); },
  selectStyle(e) {
    const id = e.currentTarget.dataset.id;
    wx.vibrateShort({ type: 'light' });
    this.setData({ selectedStyleId: this.data.selectedStyleId === id ? '' : id });
  },
  selectRatio(e) { this.setData({ selectedRatio: e.currentTarget.dataset.value }); },

  // ========== 输入 ==========
  onPromptInput(e) { this.setData({ prompt: e.detail.value }); },
  onQuickPrompt(e) { this.setData({ prompt: e.currentTarget.dataset.p }); },

  // ========== 上传图片 ==========
  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const p = res.tempFiles[0].tempFilePath;
        if (res.tempFiles[0].size > 10 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
          return;
        }
        this.setData({ sourceImage: p, resultImage: null });
      },
    });
  },

  // 清除参考图
  clearReference() {
    this.setData({ sourceImage: null, sourceFileID: null });
  },

  // ========== 核心生成流程 ==========
  async generate() {
    if (!checkLogin()) return wx.showModal({ title: '提示', content: '请先登录', showCancel: false });
    if (this.data.phase !== 'idle') return;
    if (!this.data.prompt.trim()) return wx.showToast({ title: '请输入描述', icon: 'none' });
    if (this.data.activeMode === 'img2img' && !this.data.sourceImage) {
      return wx.showToast({ title: '请上传参考图', icon: 'none' });
    }

    // 检查用量
    if (this.data.usageInfo && !this.data.usageInfo.isVip) {
      const remaining = this.data.usageInfo.limit - this.data.usageInfo.used;
      if (remaining <= 0) {
        this.setData({ showPayPopup: true });
        return;
      }
    }

    // 构建prompt
    let finalPrompt = this.data.prompt.trim();
    const selStyle = STYLES.find(s => s.id === this.data.selectedStyleId);
    if (selStyle) finalPrompt += selStyle.prompt;

    const ratioMap = { '1:1': 1, '3:4': 2, '4:3': 3, '9:16': 5, '16:9': 4 };

    try {
      // Phase 1: 上传
      if (this.data.activeMode === 'img2img') {
        this.setData({ phase: 'uploading', progress: 15, progressText: '上传图片中...' });
        const fileID = await uploadFile(this.data.sourceImage);
        this.setData({ sourceFileID: fileID });
      }

      // Phase 2: 生成中
      this.setData({ phase: 'generating', progress: 30, progressText: 'AI 创作中...', resultImage: null });
      this.startProgressAnimation();

      const action = this.data.activeMode === 'text2img' ? 'generate' : 'img2img';
      const params = {
        action,
        prompt: finalPrompt,
        imageRatio: ratioMap[this.data.selectedRatio] || 1,
      };
      if (this.data.activeMode === 'img2img') params.imageFileID = this.data.sourceFileID;

      const result = await callFunction('ai', params);

      if (result && result.fileID) {
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [result.fileID] });
        const url = tempRes.fileList[0].tempFileURL;
        
        // 保存到我的作品
        this.saveToMyWorks(result.fileID, url);
        
        this.setData({
          phase: 'done',
          progress: 100,
          resultImage: url,
          results: [{ url, prompt: this.data.prompt, style: selStyle ? selStyle.name : '无', time: Date.now() }, ...this.data.results],
        });
        wx.showToast({ title: '创作完成', icon: 'success' });
      } else {
        this.setData({ phase: 'idle' });
        wx.showToast({ title: result?.msg || '生成失败', icon: 'none' });
      }
    } catch (e) {
      console.error(e);
      this.setData({ phase: 'idle' });
      wx.showModal({ title: '生成失败', content: e.message || '请稍后重试', showCancel: false });
    }
  },

  // 进度动画
  startProgressAnimation() {
    const steps = [
      { p: 45, t: '理解描述中...' },
      { p: 60, t: '构思画面...' },
      { p: 75, t: '渲染中...' },
      { p: 88, t: '即将完成...' },
    ];
    let i = 0;
    const timer = setInterval(() => {
      if (i >= steps.length || this.data.phase === 'done' || this.data.phase === 'idle') {
        clearInterval(timer); return;
      }
      this.setData({ progress: steps[i].p, progressText: steps[i].t });
      i++;
    }, 2000);
    this._timer = timer;
  },

  // ========== 结果操作 ==========
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

  // 保存到我的作品
  async saveToMyWorks(fileID, displayUrl) {
    const work = {
      id: Date.now(),
      fileID: fileID,
      url: displayUrl,
      title: this.data.prompt.slice(0, 30) || 'AI作品',
      prompt: this.data.prompt,
      style: this.data.selectedStyleId,
      time: this.formatTime(Date.now()),
    };

    // 本地存储
    try {
      let works = wx.getStorageSync('myWorks') || [];
      works.unshift(work);
      if (works.length > 100) works = works.slice(0, 100);
      wx.setStorageSync('myWorks', works);
    } catch (e) {
      console.error('本地保存作品失败:', e);
    }

    // 云端同步
    if (checkLogin()) {
      try {
        await callFunction('tools', { action: 'saveWork', work }, { silent: true });
      } catch (e) {
        console.log('作品云端同步失败:', e.message);
      }
    }
  },

  formatTime(timestamp) {
    const d = new Date(timestamp);
    return `${d.getMonth()+1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  previewResult() {
    if (this.data.resultImage) wx.previewImage({ urls: [this.data.resultImage], current: this.data.resultImage });
  },

  previewHistory(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ urls: this.data.results.map(r => r.url), current: url });
  },

  // ========== 支付弹窗 ==========
  openPayPopup() {
    this.setData({ showPayPopup: true, selectedVipPlan: 'month' });
  },
  closePayPopup() { this.setData({ showPayPopup: false }); },
  selectVipPlan(e) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ selectedVipPlan: e.currentTarget.dataset.plan });
  },

  // ========== 重试 ==========
  retryGenerate() {
    this.setData({ phase: 'idle', resultImage: null });
  },

  onShareAppMessage() {
    const styleName = this.data.selectedStyleId ? STYLES.find(s => s.id === this.data.selectedStyleId)?.name : '';
    return {
      title: `我用AI画了一幅${styleName}风格的画作`,
      imageUrl: this.data.resultImage || '',
    };
  },
});
