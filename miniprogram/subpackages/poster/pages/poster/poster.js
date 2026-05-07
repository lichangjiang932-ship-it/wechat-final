const { logger } = require('../../../../config/constants');
// subpackages/poster/pages/poster/poster.js — 童趣海报定制
const { computeNavBar } = require('../../../../utils/common');
const { callFunction } = require('../../../../utils/cloud');
const i18n = require('../../../../utils/i18n');
const themeMod = require('../../../../utils/theme');

const STEP_DEFS = [
  { key: 'name',    label: '姓名' },
  { key: 'age',     label: '年龄' },
  { key: 'photo',   label: '照片' },
  { key: 'caption', label: '文案' },
];

const PRESETS = [
  '热爱艺术的小画家，用色彩描绘心中的童话世界。',
  '未来的小钢琴家，琴键是 ta 最熟悉的语言。',
  '灵动的小舞者，每一步都踩在欢喜的节拍上。',
  '小小积木建筑师，搭出心里的奇妙城堡。',
  '足球小将，奔跑、传球、永不服输。',
  '爱书的小孩子，一本书就是一个新世界。',
  '小小科学家，把好奇心装进每一次实验。',
  '街舞小达人，鼓点一响，全身都是节奏。',
  '画画时最专注的小朋友，色彩是 ta 的心情。',
  '元气满满的小小冒险家，今天又有新发现。',
];

const QUICK_AGES = [3, 4, 5, 6, 7, 8, 9, 10];

// 海报输出尺寸（小红书 3:4 标准）
const OUT_W = 1080;
const OUT_H = 1440;

Page({
  data: {
    step: 0,
    stepDefs: STEP_DEFS,
    name: '',
    age: '',
    photo: '',
    caption: '',
    captionMode: 'preset',
    aiKeyword: '',
    aiLoading: false,
    presets: PRESETS,
    quickAges: QUICK_AGES,
    canNext: false,
    rendering: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    previewW: 270,
    previewH: 360,
    _savedPath: '',
    theme: 'dark',
    themeClass: 'theme-dark',
  },

  onLoad() {
    const nav = computeNavBar();
    // preview 显示尺寸（按屏宽减去 padding 计算）
    const sysInfo = wx.getWindowInfo();
    const previewW = Math.floor((sysInfo.windowWidth - 64 - 64) * 0.85); // 屏宽 - 外边距 - 卡片内边距
    const previewH = Math.floor(previewW * OUT_H / OUT_W);
    const theme = themeMod.getTheme();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      previewW,
      previewH,
      i18n: i18n.pack(),
      theme,
      themeClass: themeMod.themeClass(theme),
    });
    // 监听主题切换
    this._themeCb = (t) => {
      this.setData({ theme: t, themeClass: themeMod.themeClass(t) });
    };
    themeMod.onThemeChange(this._themeCb);
  },

  onShow() {
    const theme = themeMod.getTheme();
    if (theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
    }
  },

  onUnload() {
    if (this._themeCb) themeMod.offThemeChange(this._themeCb);
  },

  onBack() { wx.navigateBack(); },

  // ===== 步骤导航 =====
  computeCanNext(d = this.data) {
    if (d.step === 0) return d.name.trim().length > 0;
    if (d.step === 1) return String(d.age).trim().length > 0 && Number(d.age) > 0;
    if (d.step === 2) return !!d.photo;
    return true;
  },
  refreshCanNext() {
    this.setData({ canNext: this.computeCanNext() });
  },
  nextStep() {
    if (!this.computeCanNext()) {
      wx.showToast({ title: '请先完成本步', icon: 'none' });
      return;
    }
    const next = Math.min(this.data.step + 1, STEP_DEFS.length - 1);
    this.setData({ step: next }, () => {
      this.refreshCanNext();
      if (next === 3) {
        // 进到预览步：默认选第一条预设
        if (!this.data.caption) this.setData({ caption: PRESETS[0] });
        wx.nextTick(() => this.renderPoster());
      }
    });
  },
  prevStep() {
    const prev = Math.max(this.data.step - 1, 0);
    this.setData({ step: prev }, () => this.refreshCanNext());
  },

  // ===== 输入处理 =====
  onNameInput(e) {
    this.setData({ name: e.detail.value });
    this.refreshCanNext();
  },
  onAgeInput(e) {
    const v = e.detail.value.replace(/\D/g, '').slice(0, 3);
    this.setData({ age: v });
    this.refreshCanNext();
  },
  pickAge(e) {
    this.setData({ age: String(e.currentTarget.dataset.age) });
    this.refreshCanNext();
  },
  onChoosePhoto() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        this.setData({ photo: tempPath });
        this.refreshCanNext();
      },
      fail: () => {},
    });
  },

  // ===== 文案 =====
  switchCaptionMode(e) {
    const m = e.currentTarget.dataset.m;
    this.setData({ captionMode: m });
    if (m === 'preset' && !PRESETS.includes(this.data.caption)) {
      this.setData({ caption: PRESETS[0] });
      wx.nextTick(() => this.renderPoster());
    }
  },
  pickPreset(e) {
    this.setData({ caption: e.currentTarget.dataset.c });
    wx.nextTick(() => this.renderPoster());
  },
  onAiKeywordInput(e) { this.setData({ aiKeyword: e.detail.value }); },
  onCaptionInput(e) {
    this.setData({ caption: e.detail.value });
    // 防抖渲染
    if (this._capTimer) clearTimeout(this._capTimer);
    this._capTimer = setTimeout(() => this.renderPoster(), 400);
  },
  async generateCaption() {
    const kw = (this.data.aiKeyword || '').trim();
    if (!kw) { wx.showToast({ title: '请先输入关键词', icon: 'none' }); return; }
    if (this.data.aiLoading) return;
    this.setData({ aiLoading: true });
    try {
      // 复用 ai 云函数：用 generate-caption 简易调用；若云函数暂未实现则降级为本地拼接
      let caption = '';
      try {
        const res = await callFunction('ai', {
          action: 'caption',
          keyword: kw,
          name: this.data.name,
          age: this.data.age,
        }, { silent: true });
        if (res && res.caption) caption = String(res.caption).slice(0, 40);
      } catch (_) { /* 云函数不支持时降级 */ }
      if (!caption) {
        // 本地兜底模板
        const templates = [
          `热爱${kw}的小朋友，让${kw}成为成长里最亮的一束光。`,
          `${kw}是 ${this.data.name || '我'} 的小宇宙，每一次都全力以赴。`,
          `因为${kw}而闪闪发光的小孩子。`,
        ];
        caption = templates[Math.floor(Math.random() * templates.length)].slice(0, 40);
      }
      this.setData({ caption });
      wx.nextTick(() => this.renderPoster());
    } finally {
      this.setData({ aiLoading: false });
    }
  },

  // ===== Canvas 海报合成 =====
  async renderPoster() {
    if (this.data.step !== 3) return;
    this.setData({ rendering: true });
    try {
      const canvas = await this._getCanvasNode('#posterCanvas');
      if (!canvas) return;
      // 设置离屏分辨率（按 OUT_W × OUT_H 物理像素绘制；CSS 像素由 style 控制显示尺寸）
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      await drawPoster(ctx, canvas, {
        name: this.data.name || '小九',
        age: this.data.age || '3',
        photo: this.data.photo,
        caption: this.data.caption || PRESETS[0],
      });
    } catch (err) {
      logger.error('[poster] render failed', err);
      wx.showToast({ title: '预览失败', icon: 'none' });
    } finally {
      this.setData({ rendering: false });
    }
  },
  _getCanvasNode(selector) {
    return new Promise((resolve) => {
      wx.createSelectorQuery().in(this).select(selector)
        .fields({ node: true, size: true })
        .exec((res) => resolve(res && res[0] && res[0].node));
    });
  },

  async onSavePoster() {
    if (!this.data.caption) { wx.showToast({ title: '请先选择文案', icon: 'none' }); return; }
    if (this.data.rendering) return;
    this.setData({ rendering: true });
    try {
      const canvas = await this._getCanvasNode('#posterCanvas');
      if (!canvas) throw new Error('canvas 未就绪');
      // 重新画一次确保最新
      await this.renderPosterInline(canvas);
      const filePath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas, fileType: 'jpg', quality: 0.92,
          success: (r) => resolve(r.tempFilePath), fail: reject,
        });
      });
      // 申请相册权限并保存
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath, success: resolve,
          fail: (err) => {
            if (err && err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中开启"保存到相册"权限',
                confirmText: '去设置',
                success: (m) => { if (m.confirm) wx.openSetting(); },
              });
            }
            reject(err);
          },
        });
      });
      this.setData({ _savedPath: filePath });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      logger.error('[poster] save failed', err);
      if (!err || !err.errMsg || err.errMsg.indexOf('auth deny') === -1) {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } finally {
      this.setData({ rendering: false });
    }
  },
  async renderPosterInline(canvas) {
    canvas.width = OUT_W; canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    await drawPoster(ctx, canvas, {
      name: this.data.name || '小九',
      age: this.data.age || '3',
      photo: this.data.photo,
      caption: this.data.caption,
    });
  },

  onShareAppMessage() {
    return {
      title: `${this.data.name || '小朋友'} 的童趣作品展`,
      path: '/subpackages/poster/pages/poster/poster',
      imageUrl: this.data._savedPath || '',
    };
  },
});

// ============================================================
// drawPoster — 纯 Canvas 程序化绘制完整海报
// ============================================================
async function drawPoster(ctx, canvas, opts) {
  const { name, age, photo, caption } = opts;
  const W = OUT_W, H = OUT_H;

  // ---- 1. 米黄背景 ----
  ctx.fillStyle = '#FAF1D9';
  ctx.fillRect(0, 0, W, H);

  // ---- 2. 散落的爱心和星星（背景层） ----
  drawScatteredDecor(ctx, W, H, 'back');

  // ---- 3. 顶部左：浅绿云朵框 "作品展示" ----
  const topCloudCx = 240, topCloudCy = 180;
  drawCloudShape(ctx, topCloudCx, topCloudCy, 220, 90, '#B8E0A8', '#5A8A4A');
  ctx.fillStyle = '#1A1A1A';
  ctx.font = 'bold 64px "PingFang SC","Hiragino Sans GB",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('作品展示', topCloudCx, topCloudCy);

  // ---- 4. 右上：戴派对帽小蛇 + "2025 Hello" ----
  drawPartySnake(ctx, W - 260, 160);
  ctx.fillStyle = '#1A1A1A';
  ctx.font = 'italic bold 38px "PingFang SC",serif';
  ctx.textAlign = 'right';
  ctx.fillText('2025 Hello', W - 80, 280);

  // ---- 5. 中央：黄色云朵主框（姓名+年龄）----
  const mainCx = W / 2, mainCy = 540;
  drawCloudShape(ctx, mainCx, mainCy, 380, 200, '#FFD96A', '#C7920E');

  ctx.fillStyle = '#1A1A1A';
  ctx.font = 'bold 44px "PingFang SC",sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // 姓名
  const labelX = mainCx - 320;
  const valueX = labelX + 200;
  ctx.fillText('学员姓名：', labelX, mainCy - 50);
  // 粉色下划线
  ctx.strokeStyle = '#FF8FB3';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(valueX - 10, mainCy - 22);
  ctx.lineTo(valueX + 220, mainCy - 22);
  ctx.stroke();
  // 手写体名字（用 italic + 较大字号近似手写感）
  ctx.font = 'italic bold 56px "Kaiti SC","STKaiti","PingFang SC",cursive';
  ctx.fillStyle = '#1A1A1A';
  ctx.fillText(name, valueX, mainCy - 56);

  // 年龄
  ctx.font = 'bold 44px "PingFang SC",sans-serif';
  ctx.fillText('年龄：', labelX + 80, mainCy + 50);
  ctx.strokeStyle = '#FF8FB3';
  ctx.beginPath();
  ctx.moveTo(valueX - 10 + 50, mainCy + 78);
  ctx.lineTo(valueX + 200, mainCy + 78);
  ctx.stroke();
  ctx.font = 'italic bold 56px "Kaiti SC","STKaiti","PingFang SC",cursive';
  ctx.fillText(`${age} 岁`, valueX + 50, mainCy + 44);

  // ---- 6. 左侧：白色对话气泡 + 文案 ----
  const bubbleX = 80, bubbleY = 880, bubbleW = 460, bubbleH = 240;
  drawSpeechBubble(ctx, bubbleX, bubbleY, bubbleW, bubbleH);
  ctx.fillStyle = '#1A1A1A';
  ctx.font = '28px "PingFang SC",sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  wrapText(ctx, caption, bubbleX + 32, bubbleY + 38, bubbleW - 64, 42);

  // ---- 7. 右侧：圆角矩形照片框 ----
  const photoX = 600, photoY = 870, photoW = 400, photoH = 520;
  drawPhotoFrame(ctx, photoX, photoY, photoW, photoH, photo, canvas);

  // ---- 8. 底部："期待我们再次相遇～" ----
  ctx.fillStyle = '#1A1A1A';
  ctx.font = 'bold 38px "PingFang SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('期待我们再次相遇～', W / 2, H - 80);

  // ---- 9. 前景装饰（爱心星星散点）----
  drawScatteredDecor(ctx, W, H, 'front');

  // ---- 10. AI 合成水印（合规要求 · 极小字）----
  ctx.fillStyle = 'rgba(26,26,26,0.45)';
  ctx.font = '20px "PingFang SC",sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('AI 合成', W - 32, H - 28);

  // ---- 11. 处理照片（异步加载）----
  if (photo) {
    try {
      await drawPhotoIntoFrame(ctx, canvas, photo, photoX + 16, photoY + 16, photoW - 32, photoH - 32);
    } catch (e) {
      logger.warn('[poster] photo draw failed', e);
    }
  }
}

// ===== 云朵不规则形状 =====
function drawCloudShape(ctx, cx, cy, w, h, fill, stroke) {
  const r = h * 0.55;
  ctx.beginPath();
  // 用多个圆相切构成云朵：底部一长椭圆 + 上方 4-5 个圆
  ctx.moveTo(cx - w * 0.5, cy);
  // 左下 -> 左上
  ctx.bezierCurveTo(cx - w * 0.55, cy - h * 0.3, cx - w * 0.4, cy - h * 0.8, cx - w * 0.2, cy - h * 0.7);
  // 上方第一个凸起
  ctx.bezierCurveTo(cx - w * 0.18, cy - h * 1.0, cx + w * 0.05, cy - h * 0.95, cx + w * 0.1, cy - h * 0.6);
  // 上方第二个凸起
  ctx.bezierCurveTo(cx + w * 0.2, cy - h * 0.85, cx + w * 0.45, cy - h * 0.7, cx + w * 0.4, cy - h * 0.3);
  // 右下
  ctx.bezierCurveTo(cx + w * 0.6, cy - h * 0.2, cx + w * 0.55, cy + h * 0.4, cx + w * 0.3, cy + h * 0.45);
  // 底部
  ctx.bezierCurveTo(cx + w * 0.2, cy + h * 0.7, cx - w * 0.2, cy + h * 0.7, cx - w * 0.3, cy + h * 0.45);
  ctx.bezierCurveTo(cx - w * 0.55, cy + h * 0.4, cx - w * 0.6, cy - h * 0.1, cx - w * 0.5, cy);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 4;
  ctx.stroke();
}

// ===== 派对小蛇 =====
function drawPartySnake(ctx, x, y) {
  // 身体：S 形波浪
  ctx.strokeStyle = '#7BC47F';
  ctx.lineWidth = 28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 60, y + 60);
  ctx.bezierCurveTo(x - 30, y + 100, x + 30, y - 20, x + 60, y + 30);
  ctx.bezierCurveTo(x + 90, y + 80, x + 130, y + 40, x + 150, y + 60);
  ctx.stroke();

  // 头
  const hx = x - 60, hy = y + 60;
  ctx.fillStyle = '#7BC47F';
  ctx.beginPath();
  ctx.arc(hx, hy, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3E7042';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 眼睛（两个小白点）
  ctx.fillStyle = '#1A1A1A';
  ctx.beginPath();
  ctx.arc(hx - 12, hy - 6, 4, 0, Math.PI * 2);
  ctx.arc(hx + 12, hy - 6, 4, 0, Math.PI * 2);
  ctx.fill();

  // 红舌头
  ctx.strokeStyle = '#E84B5C';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx, hy + 14);
  ctx.lineTo(hx, hy + 28);
  ctx.moveTo(hx, hy + 28);
  ctx.lineTo(hx - 6, hy + 36);
  ctx.moveTo(hx, hy + 28);
  ctx.lineTo(hx + 6, hy + 36);
  ctx.stroke();

  // 派对帽（彩色三角）
  ctx.beginPath();
  ctx.moveTo(hx - 20, hy - 30);
  ctx.lineTo(hx + 20, hy - 30);
  ctx.lineTo(hx, hy - 78);
  ctx.closePath();
  ctx.fillStyle = '#FF6FA0';
  ctx.fill();
  // 帽子条纹
  ctx.fillStyle = '#FFD96A';
  ctx.beginPath();
  ctx.moveTo(hx - 14, hy - 44);
  ctx.lineTo(hx + 14, hy - 44);
  ctx.lineTo(hx + 8, hy - 60);
  ctx.lineTo(hx - 8, hy - 60);
  ctx.closePath();
  ctx.fill();
  // 帽尖小球
  ctx.beginPath();
  ctx.arc(hx, hy - 82, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#5BB8E8';
  ctx.fill();
}

// ===== 对话气泡 =====
function drawSpeechBubble(ctx, x, y, w, h) {
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  // 气泡尾巴（指向右下）
  ctx.lineTo(x + w * 0.7, y + h);
  ctx.lineTo(x + w * 0.78, y + h + 30);
  ctx.lineTo(x + w * 0.62, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth = 3;
  ctx.stroke();
}

// ===== 照片框（先绘空框，照片由 drawPhotoIntoFrame 异步填）=====
function drawPhotoFrame(ctx, x, y, w, h, photo, canvas) {
  const r = 28;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth = 3;
  ctx.stroke();

  if (!photo) {
    ctx.fillStyle = '#C9C0AE';
    ctx.font = '32px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('学员照片', x + w / 2, y + h / 2);
  }
}

async function drawPhotoIntoFrame(ctx, canvas, photoPath, x, y, w, h) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => {
      // 圆角裁剪 + cover 模式
      ctx.save();
      const r = 20;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.clip();

      // cover 算法
      const iw = img.width, ih = img.height;
      const scale = Math.max(w / iw, h / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
      resolve();
    };
    img.onerror = reject;
    img.src = photoPath;
  });
}

// ===== 散点装饰（爱心、星星）=====
function drawScatteredDecor(ctx, W, H, layer) {
  // 固定种子保证每次绘制位置一致（避免预览闪烁）
  const seed = layer === 'back' ? 7 : 23;
  const rand = mulberry32(seed);
  const items = layer === 'back' ? 16 : 8;
  for (let i = 0; i < items; i++) {
    const x = rand() * W;
    const y = rand() * H;
    // 避开主中央区（云朵和文字位）
    if (y > 380 && y < 720 && x > W * 0.15 && x < W * 0.85) continue;
    if (y > 850 && y < 1280) continue;
    const isHeart = rand() > 0.5;
    const size = 14 + rand() * (layer === 'back' ? 16 : 24);
    const colors = ['#FF8FB3', '#FFB347', '#7BC47F', '#5BB8E8', '#C58FE0'];
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    if (isHeart) drawHeart(ctx, x, y, size);
    else drawStar(ctx, x, y, size, 5);
  }
}
function drawHeart(ctx, cx, cy, size) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.bezierCurveTo(cx, cy, cx - size, cy, cx - size, cy - size * 0.3);
  ctx.bezierCurveTo(cx - size, cy - size, cx, cy - size, cx, cy - size * 0.4);
  ctx.bezierCurveTo(cx, cy - size, cx + size, cy - size, cx + size, cy - size * 0.3);
  ctx.bezierCurveTo(cx + size, cy, cx, cy, cx, cy + size * 0.3);
  ctx.closePath();
  ctx.fill();
}
function drawStar(ctx, cx, cy, r, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const ang = (Math.PI / n) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    const px = cx + Math.cos(ang) * rr;
    const py = cy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===== 文本换行 =====
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = String(text).split('');
  let line = '';
  let lineY = y;
  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = chars[i];
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}
