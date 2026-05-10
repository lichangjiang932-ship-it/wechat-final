const { logger } = require('../../../../config/constants');
// subpackages/poster/pages/poster/poster.js — 童趣海报定制
const { computeNavBar } = require('../../../../utils/common');
const { callFunction } = require('../../../../utils/cloud');
const i18n = require('../../../../utils/i18n');
const themeMod = require('../../../../utils/theme');

const STEP_DEFS = [
  { key: 'name',  label: '姓名' },
  { key: 'age',   label: '年龄' },
  { key: 'hobby', label: '爱好' },
  { key: 'photo', label: '照片' },
];

// 爱好快选 + 本地兜底文案（DeepSeek 不可用时使用）
const HOBBY_CHIPS = ['画画', '钢琴', '跳舞', '唱歌', '阅读', '足球', '编程', '科学'];

const FALLBACK_CAPTIONS = {
  '画画': '热爱艺术的小画家，用色彩描绘心中的童话世界。',
  '钢琴': '未来的小钢琴家，琴键是 ta 最熟悉的语言。',
  '跳舞': '灵动的小舞者，每一步都踩在欢喜的节拍上。',
  '唱歌': '爱唱歌的小天使，每一首都是心里的故事。',
  '阅读': '爱书的小孩子，一本书就是一个新世界。',
  '足球': '足球小将，奔跑、传球、永不服输。',
  '编程': '小小程序员，把奇思妙想敲进每一行代码。',
  '科学': '好奇心满格的小科学家，把世界拆开来看看。',
};

const QUICK_AGES = [3, 4, 5, 6, 7, 8, 9, 10];

// 海报输出尺寸（小红书 3:4 标准）
const OUT_W = 1080;
const OUT_H = 1440;

// 模板底图（云存储 fileID，避免本地包体积过大）
// 如需替换模板，上传新图到云存储后修改下面这个 fileID 即可
const TEMPLATE_IMG = 'cloud://cloud1-d8glhp7pdcd3fffba.636c-cloud1-d8glhp7pdcd3fffba-1423601483/images/template.jpg';

// 模板覆盖层定位（基于 1080×1440 画布的像素坐标）
// 已对照 template.jpg 视觉量算；上线后看预览若有偏差，调下面 4 块数值即可
const LAYOUT = {
  // 学员姓名：粉色下划线之上（"学员姓名："右侧）
  name: {
    x: 560,        // 文字起点 X（下划线左端略缩进）
    y: 742,        // 文字基线 Y（紧贴下划线上方）
    maxWidth: 350, // 下划线长度
    fontSize: 86,
  },
  // 年龄：粉色下划线之上（"年龄："右侧）
  age: {
    x: 388,
    y: 904,
    maxWidth: 170,
    fontSize: 78,
  },
  // 对话气泡（左下白色椭圆）内的文案
  caption: {
    x: 108,        // 气泡内左边距
    y: 990,       // 气泡内顶部
    width: 348,    // 文字最大宽度
    fontSize: 38,
    lineHeight: 50,
    height: 170,
  },
  // 学员照片：右下圆角白色框内部
  photo: {
    x: 612,        // 略缩入框边
    y: 814,
    width: 310,
    height: 334,
    radius: 28,
  },
};

Page({
  data: {
    step: 0,
    stepDefs: STEP_DEFS,
    name: '',
    age: '',
    photo: '',
    caption: '',
    hobby: '',
    hobbyChips: HOBBY_CHIPS,
    aiLoading: false,
    captionEditMode: false,
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
  },

  onShow() {
    const theme = themeMod.getTheme();
    if (theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
    }
  },

  onBack() { wx.navigateBack(); },

  // ===== 步骤导航 =====
  computeCanNext(d = this.data) {
    if (d.step === 0) return d.name.trim().length > 0;
    if (d.step === 1) return String(d.age).trim().length > 0 && Number(d.age) > 0;
    if (d.step === 2) return !!d.caption; // 爱好步：要求已生成文案才能下一步
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
      if (next === 2) {
        // 进入爱好步：无文案则自动用默认爱好生成
        if (!this.data.caption) {
          if (this.data.hobby) {
            this.generateCaption();
          } else {
            this.pickHobby({ currentTarget: { dataset: { h: HOBBY_CHIPS[0] } } });
          }
        }
      } else if (next === 3) {
        // 进入照片预览步：渲染海报
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
        // 在照片步选完图，立刻刷新海报预览
        if (this.data.step === 3) wx.nextTick(() => this.renderPoster());
      },
      fail: () => {},
    });
  },

  // ===== 爱好 + AI 文案 =====
  pickHobby(e) {
    const h = e.currentTarget.dataset.h;
    if (!h || h === this.data.hobby) return;
    this.setData({ hobby: h, captionEditMode: false });
    this.generateCaption();
  },
  onHobbyInput(e) {
    this.setData({ hobby: e.detail.value });
  },
  onHobbyConfirm() {
    if (!this.data.hobby.trim()) return;
    this.generateCaption();
  },
  toggleCaptionEdit() {
    this.setData({ captionEditMode: !this.data.captionEditMode });
  },
  onCaptionInput(e) {
    this.setData({ caption: e.detail.value });
    this.refreshCanNext();
    if (this._capTimer) clearTimeout(this._capTimer);
    this._capTimer = setTimeout(() => this.renderPoster(), 400);
  },
  async generateCaption() {
    const kw = (this.data.hobby || '').trim();
    if (!kw) { wx.showToast({ title: '请先选择或输入爱好', icon: 'none' }); return; }
    if (this.data.aiLoading) return;
    this.setData({ aiLoading: true });
    try {
      // 调 ai 云函数（DeepSeek 润色）
      let caption = '';
      try {
        const res = await callFunction('ai', {
          action: 'caption',
          keyword: kw,
          name: this.data.name,
          age: this.data.age,
        }, { silent: true });
        if (res && res.caption) caption = String(res.caption).slice(0, 40);
      } catch (_) { /* 云函数失败时走本地兜底 */ }
      if (!caption) {
        caption = FALLBACK_CAPTIONS[kw]
          || `热爱${kw}的小朋友，让${kw}成为成长里最亮的一束光。`;
        caption = caption.slice(0, 40);
      }
      this.setData({ caption });
      this.refreshCanNext();
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
        caption: this.data.caption || FALLBACK_CAPTIONS['画画'],
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
    if (!this.data.photo) { wx.showToast({ title: '请先上传照片', icon: 'none' }); return; }
    if (!this.data.caption) { wx.showToast({ title: '请先生成文案', icon: 'none' }); return; }
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
// drawPoster — 基于模板底图合成
// 1) 把模板图绘到画布
// 2) 在校准位置叠加：姓名 / 年龄 / 文案 / 学员照片
// 3) 右下角合成"AI 合成"水印（合规）
// 模板图加载失败时回退到纯程序化绘制（不阻塞预览/保存）
// ============================================================
async function drawPoster(ctx, canvas, opts) {
  const { name, age, photo, caption } = opts;
  const W = OUT_W, H = OUT_H;

  // ---- 1. 模板底图 ----
  let templateLoaded = false;
  try {
    await drawTemplateBackground(ctx, canvas, W, H);
    templateLoaded = true;
  } catch (e) {
    logger.warn('[poster] 模板图加载失败，回退程序化绘制:', e && e.message);
    drawProgrammaticBackground(ctx, W, H);
  }

  // ---- 2. 学员照片（先画照片，再画文字，避免照片覆盖文字） ----
  if (photo) {
    try {
      await drawPhotoIntoFrame(
        ctx, canvas, photo,
        LAYOUT.photo.x, LAYOUT.photo.y,
        LAYOUT.photo.width, LAYOUT.photo.height,
        LAYOUT.photo.radius
      );
    } catch (e) {
      logger.warn('[poster] photo draw failed', e);
    }
  }

  // ---- 3. ?????? ----
  if (name) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `italic bold ${LAYOUT.name.fontSize}px "Kaiti SC","STKaiti","PingFang SC",cursive`;
    fitTextWidth(ctx, name, LAYOUT.name.maxWidth, LAYOUT.name.fontSize, (size) => {
      ctx.font = `italic bold ${size}px "Kaiti SC","STKaiti","PingFang SC",cursive`;
    });
    drawFancyText(ctx, name, LAYOUT.name.x, LAYOUT.name.y);
  }

  // ---- 4. ??? ----
  if (age) {
    const ageStr = String(age);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `italic bold ${LAYOUT.age.fontSize}px "Kaiti SC","STKaiti","PingFang SC",cursive`;
    fitTextWidth(ctx, ageStr, LAYOUT.age.maxWidth, LAYOUT.age.fontSize, (size) => {
      ctx.font = `italic bold ${size}px "Kaiti SC","STKaiti","PingFang SC",cursive`;
    });
    drawFancyText(ctx, ageStr, LAYOUT.age.x, LAYOUT.age.y);
  }

  // ---- 5. ???????????----
  if (caption) {
    ctx.fillStyle = '#2B2621';
    ctx.font = `bold ${LAYOUT.caption.fontSize}px "PingFang SC",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    drawCenteredWrappedText(
      ctx,
      caption,
      LAYOUT.caption.x,
      LAYOUT.caption.y,
      LAYOUT.caption.width,
      LAYOUT.caption.height,
      LAYOUT.caption.lineHeight
    );
  }

  // ---- 6. AI 合成水印（合规要求）----
  ctx.fillStyle = 'rgba(26,26,26,0.55)';
  ctx.font = '22px "PingFang SC",sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('AI 合成', W - 32, H - 24);

  // 模板加载失败时也画一下底部文字（兜底）
  if (!templateLoaded) {
    ctx.fillStyle = '#1A1A1A';
    ctx.font = 'bold 48px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('期待我们再次相遇～', W / 2, H - 100);
  }
}

// ===== 模板底图加载与绘制 =====
async function drawTemplateBackground(ctx, canvas, W, H) {
  // 云存储 fileID 需要先换临时 HTTPS URL，canvas 才能加载
  let imgUrl = TEMPLATE_IMG;
  if (TEMPLATE_IMG.startsWith('cloud://')) {
    try {
      const tmp = await wx.cloud.getTempFileURL({ fileList: [TEMPLATE_IMG] });
      imgUrl = tmp.fileList[0]?.tempFileURL || TEMPLATE_IMG;
    } catch (e) {
      console.warn('[poster] getTempFileURL failed, fallback to fileID', e);
    }
  }
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => {
      // 拉满画布；若模板比例与画布比例不同，会被纵向/横向轻微拉伸——
      // 推荐模板图就是 1080×1440（3:4），这样不会变形
      ctx.drawImage(img, 0, 0, W, H);
      resolve();
    };
    img.onerror = (err) => reject(err || new Error('template image load failed'));
    img.src = imgUrl;
  });
}

// ===== 模板缺失时的兜底背景 =====
function drawProgrammaticBackground(ctx, W, H) {
  ctx.fillStyle = '#FAF1D9';
  ctx.fillRect(0, 0, W, H);
  // 极简提示，不阻碍核心信息可读
  ctx.fillStyle = 'rgba(26,26,26,0.35)';
  ctx.font = '24px "PingFang SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('模板图未加载（subpackages/poster/images/template.png）', W / 2, 40);
}

// ===== 自动收缩字号以适配最大宽度 =====
function fitTextWidth(ctx, text, maxWidth, baseSize, applyFont) {
  let size = baseSize;
  while (size > 16 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    applyFont(size);
  }
}


async function drawPhotoIntoFrame(ctx, canvas, photoPath, x, y, w, h, radius = 20) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => {
      // 圆角裁剪 + cover 模式
      ctx.save();
      const r = radius;
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

function drawFancyText(ctx, text, x, y) {
  ctx.save();
  ctx.fillStyle = '#1A1A1A';
  ctx.strokeStyle = 'rgba(74, 50, 35, 0.30)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
  ctx.shadowBlur = 1;
  ctx.fillText(text, x, y);
  ctx.strokeText(text, x, y);
  ctx.restore();
}

function drawCenteredWrappedText(ctx, text, x, y, width, height, lineHeight) {
  const lines = splitTextLines(ctx, text, width, 3);
  const totalH = lines.length * lineHeight;
  const startY = y + Math.max(0, Math.floor((height - totalH) / 2));
  const centerX = x + width / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], centerX, startY + i * lineHeight);
  }
}

function splitTextLines(ctx, text, maxWidth, maxLines) {
  const chars = String(text).split('');
  const lines = [];
  let line = '';
  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = chars[i];
      if (lines.length >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }
  if (lines.length < maxLines) {
    const consumed = lines.join('').length;
    const rest = String(text).slice(consumed);
    if (rest) lines.push(rest);
  }
  return lines;
}
